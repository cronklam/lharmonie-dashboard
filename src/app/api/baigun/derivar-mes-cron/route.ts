import { NextResponse } from 'next/server';
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
import { nuevoIdBaigun, fechaHoyAR, mesActual } from '@/lib/baigun-cta-cte';

export const dynamic = 'force-dynamic';

// Cron endpoint — corre día 5 de cada mes 12:00 UTC.
// Vercel-cron auth: header `Authorization: Bearer ${CRON_SECRET}`
// (Vercel lo envía automáticamente si configurás vercel.json + CRON_SECRET env).
// Si CRON_SECRET no está set, aceptamos pero logueamos warning para que
// el endpoint sea funcional aún sin secret en dev.
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get('authorization') || '';
  if (expected) {
    if (got !== `Bearer ${expected}`) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  } else {
    console.warn('[BAIGUN/CRON] CRON_SECRET no configurado — endpoint abierto');
  }

  const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    return NextResponse.json({ ok: false, error: 'Config faltante' }, { status: 500 });
  }
  const mes = mesActual();
  const [yearStr, monthStr] = mes.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const tabName = periodoToTab(year, month);
  const label = periodoToLabel(year, month);

  try {
    const listRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${INDICE_TAB}'!A1:${INDICE_LAST_COL}500`,
    });
    const listRows = listRes.data.values || [];
    const allServ = [];
    for (let i = 1; i < listRows.length; i++) {
      const s = indiceRowToObject(listRows[i], i);
      if (s) allServ.push(s);
    }
    const subarrendados = allServ.filter(
      (s) => s.subarrendadoBaigun && s.activo && (s.baigunPct || 0) > 0,
    );

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
        return NextResponse.json({
          ok: true,
          mes,
          tab: tabName,
          skipped: true,
          razon: 'Tab del mes no existe todavía',
        });
      }
      throw err;
    }
    const pivot = parseMesPivot(pivotRows, mes, tabName, label);
    const todasFilas = [...pivot.filasLocales, ...pivot.filasCronklam, ...pivot.filasMyP];

    const allMovs = soloActivos(await readAllBaigun());
    let saldoAcumulado = saldoTotal(await readAllBaigun());

    let agregados = 0, actualizados = 0, sinCambios = 0;

    for (const servListado of subarrendados) {
      const canon = nombreCanonico(servListado.servicio);
      const fila = todasFilas.find(
        (f) => f.servicio === canon || f.servicioRaw.trim() === servListado.servicio.trim(),
      );
      if (!fila) continue;
      const lh5 = fila.porAncla['LH5'];
      if (!lh5 || lh5.estado !== 'pagado' || lh5.monto <= 0) continue;

      const cargo = lh5.monto * (servListado.baigunPct || 0) / 100;
      const concepto = `${servListado.servicio} · ${tabName} · ${servListado.baigunPct}%`;

      const existente = allMovs.find(
        (m) =>
          m.fuente === 'auto' &&
          m.tipo === 'cargo' &&
          m.mesOrigen === mes &&
          m.servicioRef === servListado.servicio,
      );

      const now = new Date().toISOString();
      if (!existente) {
        await appendMov({
          id: nuevoIdBaigun(),
          fecha: fechaHoyAR(),
          mesOrigen: mes,
          tipo: 'cargo',
          concepto,
          servicioRef: servListado.servicio,
          monto: cargo,
          saldoDespues: saldoAcumulado + cargo,
          metodo: '',
          notas: `Auto-generado por cron`,
          fuente: 'auto',
          cargadoPor: 'sistema',
          createdAt: now,
          deletedAt: '',
        });
        saldoAcumulado += cargo;
        agregados++;
      } else if (Math.abs(existente.monto - cargo) > 0.01) {
        await updateMov(existente._row, {
          ...existente,
          monto: cargo,
          concepto,
          notas: `Auto-recalculado por cron`,
        });
        actualizados++;
      } else {
        sinCambios++;
      }
    }
    if (agregados > 0 || actualizados > 0) {
      await recalcularSaldos();
    }
    return NextResponse.json({
      ok: true,
      mes, tab: tabName, agregados, actualizados, sinCambios,
    });
  } catch (err) {
    if (err instanceof ServiciosError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('[BAIGUN/CRON]', err);
    const msg = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
