import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { isOwner } from '@/lib/users';
import { getSheetsClient, ServiciosError } from '@/lib/servicios-server';
import {
  parseMesPivot,
  periodoToTab,
  periodoToLabel,
  nombreCanonico,
} from '@/lib/servicios-mes';
import {
  INDICE_TAB,
  INDICE_LAST_COL,
  indiceRowToObject,
} from '@/lib/indice';
import {
  readAllBaigun,
  soloActivos,
  saldoTotal,
  appendMov,
  updateMov,
  recalcularSaldos,
} from '@/lib/baigun-cta-cte-server';
import { delta, nuevoIdBaigun, fechaHoyAR } from '@/lib/baigun-cta-cte';

export const dynamic = 'force-dynamic';
const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';

interface PostBody {
  mes?: string;
}

// POST /api/baigun/derivar-mes  body { mes: 'YYYY-MM' }
// Owner-only. Crea movimientos auto de tipo='cargo' en CTA CTE BAIGUN
// para cada servicio del LISTADO con subarrendadoBaigun=true & activo=true
// que tenga monto en la col LH5 del pivot mensual. Idempotente.
export const POST = withAuth(async (req, user) => {
  if (!isOwner(user.email)) {
    throw new AuthError(403, 'Solo el owner puede generar cargos.');
  }
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    return NextResponse.json(
      { ok: false, error: 'Config faltante' },
      { status: 500 },
    );
  }
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }
  const mes = (body.mes || '').trim();
  if (!mes.match(/^\d{4}-\d{2}$/)) {
    return NextResponse.json(
      { ok: false, error: 'mes inválido (YYYY-MM)' },
      { status: 400 },
    );
  }
  const [yearStr, monthStr] = mes.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const tabName = periodoToTab(year, month);
  const label = periodoToLabel(year, month);

  try {
    // ① Leer LISTADO
    const listRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${INDICE_TAB}'!A1:${INDICE_LAST_COL}500`,
    });
    const listRows = listRes.data.values || [];
    if (listRows.length < 2) {
      return NextResponse.json(
        { ok: false, error: 'LISTADO vacío' },
        { status: 400 },
      );
    }
    const allServ = [];
    for (let i = 1; i < listRows.length; i++) {
      const s = indiceRowToObject(listRows[i], i);
      if (s) allServ.push(s);
    }
    const subarrendados = allServ.filter(
      (s) => s.subarrendadoBaigun && s.activo && (s.baigunPct || 0) > 0,
    );

    // ② Leer pivot mensual
    let pivotRows: string[][] = [];
    try {
      const pivotRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `'${tabName}'!A1:Z80`,
      });
      pivotRows = pivotRes.data.values || [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      if (msg.toLowerCase().includes('unable to parse range')) {
        return NextResponse.json(
          {
            ok: false,
            error: `El tab "${tabName}" no existe. Pedile a Iara que lo cree.`,
            tabFaltante: tabName,
          },
          { status: 404 },
        );
      }
      throw err;
    }
    const pivot = parseMesPivot(pivotRows, mes, tabName, label);
    const todasFilas = [...pivot.filasLocales, ...pivot.filasCronklam, ...pivot.filasMyP];

    // ③ Leer CTA CTE BAIGUN existente
    const allMovs = soloActivos(await readAllBaigun());
    let saldoAcumulado = saldoTotal(await readAllBaigun());

    let agregados = 0, actualizados = 0, sinCambios = 0;
    const sinPagar: Array<{ servicio: string; razon: string }> = [];

    for (const servListado of subarrendados) {
      // Encontrar la fila del pivot por nombre canónico que matchea
      const canon = nombreCanonico(servListado.servicio);
      const fila = todasFilas.find(
        (f) => f.servicio === canon || f.servicioRaw.trim() === servListado.servicio.trim(),
      );
      if (!fila) {
        sinPagar.push({ servicio: servListado.servicio, razon: 'No se encontró en el pivot' });
        continue;
      }
      const lh5 = fila.porAncla['LH5'];
      if (!lh5) {
        sinPagar.push({ servicio: servListado.servicio, razon: 'No tiene celda LH5' });
        continue;
      }
      if (lh5.estado === 'pendiente') {
        sinPagar.push({ servicio: servListado.servicio, razon: 'pendiente este mes' });
        continue;
      }
      if (lh5.estado !== 'pagado' || lh5.monto <= 0) {
        sinPagar.push({ servicio: servListado.servicio, razon: 'sin monto LH5' });
        continue;
      }
      const cargo = lh5.monto * (servListado.baigunPct || 0) / 100;
      const concepto = `${servListado.servicio} · ${tabName} · ${servListado.baigunPct}%`;

      // ¿Ya existe mov auto del mismo (mesOrigen, servicioRef)?
      const existente = allMovs.find(
        (m) =>
          m.fuente === 'auto' &&
          m.tipo === 'cargo' &&
          m.mesOrigen === mes &&
          m.servicioRef === servListado.servicio,
      );

      const now = new Date().toISOString();
      if (!existente) {
        const movNuevo = {
          id: nuevoIdBaigun(),
          fecha: fechaHoyAR(),
          mesOrigen: mes,
          tipo: 'cargo' as const,
          concepto,
          servicioRef: servListado.servicio,
          monto: cargo,
          saldoDespues: saldoAcumulado + cargo,
          metodo: '',
          notas: `Auto-generado por derivar-mes (${user.email})`,
          fuente: 'auto' as const,
          cargadoPor: 'sistema',
          createdAt: now,
          deletedAt: '',
        };
        await appendMov(movNuevo);
        saldoAcumulado += cargo;
        agregados++;
      } else {
        // Si el monto difiere, actualizamos.
        if (Math.abs(existente.monto - cargo) > 0.01) {
          await updateMov(existente._row, {
            ...existente,
            monto: cargo,
            concepto,
            notas: `Auto-recalculado por derivar-mes (${user.email})`,
          });
          actualizados++;
        } else {
          sinCambios++;
        }
      }
    }

    // Recalcular saldos en cascada al final si hubo cambios.
    if (agregados > 0 || actualizados > 0) {
      await recalcularSaldos();
    }

    return NextResponse.json({
      ok: true,
      mes,
      tab: tabName,
      agregados,
      actualizados,
      sinCambios,
      sinPagar,
    });
  } catch (err) {
    if (err instanceof ServiciosError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('[BAIGUN/DERIVAR-MES]', err);
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
