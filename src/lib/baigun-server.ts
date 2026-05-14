import 'server-only';

// baigun-server — orquestación de auto-derivación de cargos a Baigun
// cuando se edita una celda LH5 del pivot mensual.
//
// derivarUnaCelda es idempotente y maneja los 4 cases:
//   1) celda nueva con monto > 0 + sin cargo previo → CREATE
//   2) celda con monto > 0 + cargo previo con monto distinto → UPDATE
//   3) celda con monto > 0 + cargo previo con monto igual → SKIP
//   4) celda borrada/NO/TODAVIA NO (monto=0) + cargo previo → SOFT-DELETE
//
// Si el servicio no está en el LISTADO con subarrendadoBaigun=true Y
// activo=true, no hace nada (skip silencioso). Idem si baigunPct = 0.

import { getSheetsClient } from './servicios-server';
import {
  INDICE_TAB,
  INDICE_LAST_COL,
  indiceRowToObject,
} from './indice';
import { periodoToTab } from './servicios-mes';
import {
  readAllBaigun,
  soloActivos,
  appendMov,
  updateMov,
  softDeleteMov,
  recalcularSaldos,
} from './baigun-cta-cte-server';
import { nuevoIdBaigun, fechaHoyAR } from './baigun-cta-cte';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';

export type DerivarAccion = 'created' | 'updated' | 'deleted' | 'skipped';

export interface DerivarResult {
  accion: DerivarAccion;
  razon?: string;
  cargoEsperado?: number;
  movId?: string;
}

interface DerivarParams {
  /** YYYY-MM. */
  mes: string;
  /** Nombre EXACTO del servicio tal como vive en el LISTADO (col A). */
  servicio: string;
  /** Monto que se escribió en la celda LH5 (0 si fue borrada/NO). */
  montoLH5: number;
  /** Email del user que hizo el cambio — queda en cargado_por para
   *  auditoría. */
  userEmail: string;
}

/** Auto-deriva el cargo a Baigun correspondiente a una celda LH5 del
 *  pivot mensual. Idempotente: ejecutar 2 veces con los mismos params
 *  da el mismo resultado final. */
export async function derivarUnaCelda(
  params: DerivarParams,
): Promise<DerivarResult> {
  const { mes, servicio, montoLH5, userEmail } = params;

  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    console.warn('[BAIGUN AUTO] sin config, skip');
    return { accion: 'skipped', razon: 'sin GOOGLE_CREDENTIALS' };
  }
  if (!mes.match(/^\d{4}-\d{2}$/)) {
    return { accion: 'skipped', razon: 'mes inválido' };
  }
  const [y, m] = mes.split('-').map((n) => parseInt(n, 10));
  const tabMensual = periodoToTab(y, m);

  // ① Leer LISTADO y encontrar el servicio
  let servListado: ReturnType<typeof indiceRowToObject> = null;
  try {
    const listRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${INDICE_TAB}'!A1:${INDICE_LAST_COL}500`,
    });
    const rows = listRes.data.values || [];
    const target = servicio.trim().toLowerCase();
    for (let i = 1; i < rows.length; i++) {
      const obj = indiceRowToObject(rows[i], i);
      if (obj && obj.servicio.trim().toLowerCase() === target && obj.ancla === 'LH5') {
        servListado = obj;
        break;
      }
    }
  } catch (err) {
    console.error('[BAIGUN AUTO] error leyendo LISTADO:', err);
    return { accion: 'skipped', razon: 'error LISTADO' };
  }
  if (!servListado) {
    return { accion: 'skipped', razon: 'servicio no está en LISTADO con ancla LH5' };
  }
  if (!servListado.subarrendadoBaigun || !servListado.activo) {
    return { accion: 'skipped', razon: 'servicio no subarrendado o inactivo' };
  }
  const pct = servListado.baigunPct || 0;
  if (pct <= 0) {
    return { accion: 'skipped', razon: 'baigun % inválido' };
  }

  // ② Calcular cargo esperado
  const cargoEsperado = Math.max(0, montoLH5) * pct / 100;

  // ③ Leer CTA CTE BAIGUN y buscar mov existente
  let allMovs: Awaited<ReturnType<typeof readAllBaigun>>;
  try {
    allMovs = await readAllBaigun();
  } catch (err) {
    console.error('[BAIGUN AUTO] error leyendo CTA CTE BAIGUN:', err);
    return { accion: 'skipped', razon: 'error CTA CTE' };
  }
  const activos = soloActivos(allMovs);
  const existente = activos.find(
    (mv) =>
      mv.fuente === 'auto' &&
      mv.tipo === 'cargo' &&
      mv.mesOrigen === mes &&
      mv.servicioRef.trim().toLowerCase() === servicio.trim().toLowerCase(),
  );

  const concepto = `${servListado.servicio} · ${tabMensual} · ${pct}%`;
  const cargadoPor = `sistema-auto-edit:${userEmail}`;
  const now = new Date().toISOString();

  // ④ Decidir acción
  // Case 4: celda borrada/NO/TODAVIA NO → eliminar cargo previo si existe
  if (cargoEsperado === 0) {
    if (existente) {
      await softDeleteMov(existente._row, now);
      await recalcularSaldos();
      console.log(
        `[BAIGUN AUTO] Derivado: servicio=${servicio} mes=${mes} monto=0 accion=deleted`,
      );
      return { accion: 'deleted', cargoEsperado: 0, movId: existente.id };
    }
    return { accion: 'skipped', razon: 'sin cargo previo y monto=0' };
  }

  // Case 1: nuevo cargo
  if (!existente) {
    const id = nuevoIdBaigun();
    // El saldoDespues exacto se recalcula al final con recalcularSaldos
    // (no es trivial calcularlo acá porque dependende del orden temporal).
    // Lo seteamos provisorio = cargoEsperado; el recalc lo corrige.
    await appendMov({
      id,
      fecha: fechaHoyAR(),
      mesOrigen: mes,
      tipo: 'cargo',
      concepto,
      servicioRef: servListado.servicio,
      monto: cargoEsperado,
      saldoDespues: cargoEsperado,
      metodo: '',
      notas: `Auto-derivado al editar celda LH5 (${userEmail})`,
      fuente: 'auto',
      cargadoPor,
      createdAt: now,
      deletedAt: '',
    });
    await recalcularSaldos();
    console.log(
      `[BAIGUN AUTO] Derivado: servicio=${servicio} mes=${mes} monto=${cargoEsperado.toFixed(2)} accion=created`,
    );
    return { accion: 'created', cargoEsperado, movId: id };
  }

  // Case 3: monto igual → skip
  if (Math.abs(existente.monto - cargoEsperado) < 0.01) {
    console.log(
      `[BAIGUN AUTO] Derivado: servicio=${servicio} mes=${mes} monto=${cargoEsperado.toFixed(2)} accion=skipped (igual)`,
    );
    return { accion: 'skipped', razon: 'mismo monto', cargoEsperado, movId: existente.id };
  }

  // Case 2: monto distinto → update
  await updateMov(existente._row, {
    ...existente,
    monto: cargoEsperado,
    concepto,
    notas: `Auto-recalculado al editar celda LH5 (${userEmail})`,
    cargadoPor,
  });
  await recalcularSaldos();
  console.log(
    `[BAIGUN AUTO] Derivado: servicio=${servicio} mes=${mes} monto=${cargoEsperado.toFixed(2)} accion=updated (era ${existente.monto.toFixed(2)})`,
  );
  return { accion: 'updated', cargoEsperado, movId: existente.id };
}
