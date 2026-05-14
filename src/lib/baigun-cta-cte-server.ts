import 'server-only';

// CTA CTE BAIGUN — Sheet I/O server-only. Usa service account
// (`GOOGLE_CREDENTIALS`) contra `SERVICIOS_SHEET_ID`. NO crea el tab —
// si no existe devolvemos error claro.

import { getSheetsClient, ServiciosError } from './servicios-server';
import {
  BAIGUN_CTA_CTE_TAB,
  BAIGUN_CTA_CTE_HEADERS,
  BAIGUN_CTA_CTE_LAST_COL,
  parseBaigunRow,
  baigunRowToSheet,
  delta,
  type BaigunMov,
} from './baigun-cta-cte';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';

function ensureConfig() {
  const sheets = getSheetsClient();
  if (!sheets) throw new ServiciosError(500, 'GOOGLE_CREDENTIALS no configurado');
  if (!SHEET_ID) throw new ServiciosError(500, 'SERVICIOS_SHEET_ID no configurado');
  return sheets;
}

const RANGE_FULL = `'${BAIGUN_CTA_CTE_TAB}'!A1:${BAIGUN_CTA_CTE_LAST_COL}5000`;

/** Lee todas las filas del tab. Devuelve array vacío si el tab está
 *  vacío. Tira ServiciosError si el tab no existe (mensaje claro). */
export async function readAllBaigun(): Promise<BaigunMov[]> {
  const sheets = ensureConfig();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: RANGE_FULL,
    });
    const rows = res.data.values || [];
    if (rows.length < 2) return [];
    const out: BaigunMov[] = [];
    for (let i = 1; i < rows.length; i++) {
      const mov = parseBaigunRow(rows[i], i);
      if (mov) out.push(mov);
    }
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    if (msg.toLowerCase().includes('unable to parse range')) {
      throw new ServiciosError(
        404,
        `El tab "${BAIGUN_CTA_CTE_TAB}" no existe en el Sheet de SERVICIOS. Pedile a Martín que lo cree o ajustá el env BAIGUN_CTA_CTE_TAB.`,
      );
    }
    throw new ServiciosError(500, `No se pudo leer CTA CTE BAIGUN: ${msg}`);
  }
}

/** Filtra activos (no eliminados). */
export function soloActivos(movs: BaigunMov[]): BaigunMov[] {
  return movs.filter((m) => !m.deletedAt);
}

/** Calcula saldo total de la cuenta corriente (cargo - pago). */
export function saldoTotal(movs: BaigunMov[]): number {
  return soloActivos(movs).reduce((s, m) => s + delta(m), 0);
}

/** Calcula saldo SOLO con movimientos hasta una fecha createdAt (inclusive). */
export function saldoHasta(movs: BaigunMov[], createdAtMax: string): number {
  return soloActivos(movs)
    .filter((m) => m.createdAt <= createdAtMax)
    .reduce((s, m) => s + delta(m), 0);
}

/** Append una fila. Devuelve _row final. */
export async function appendMov(mov: Omit<BaigunMov, '_row'>): Promise<number> {
  const sheets = ensureConfig();
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${BAIGUN_CTA_CTE_TAB}'!A2:${BAIGUN_CTA_CTE_LAST_COL}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [baigunRowToSheet(mov)] },
  });
  // updates.updatedRange = "'CTA CTE BAIGUN'!A47:N47"
  const range = res.data.updates?.updatedRange || '';
  const m = range.match(/!A(\d+):/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Update una fila existente. */
export async function updateMov(row: number, mov: Omit<BaigunMov, '_row'>): Promise<void> {
  const sheets = ensureConfig();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${BAIGUN_CTA_CTE_TAB}'!A${row}:${BAIGUN_CTA_CTE_LAST_COL}${row}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [baigunRowToSheet(mov)] },
  });
}

/** Soft delete: setea deletedAt al ISO de ahora. */
export async function softDeleteMov(row: number, isoNow: string): Promise<void> {
  const sheets = ensureConfig();
  // Col N (14ma) — INDEX 13 en 0-based.
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${BAIGUN_CTA_CTE_TAB}'!${BAIGUN_CTA_CTE_LAST_COL}${row}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[isoNow]] },
  });
}

/** Recalcula saldoDespues de todos los movs activos en orden de createdAt asc.
 *  Devuelve cantidad de filas actualizadas. Hace un único batchUpdate. */
export async function recalcularSaldos(): Promise<number> {
  const sheets = ensureConfig();
  const all = await readAllBaigun();
  const activos = soloActivos(all).sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a._row - b._row,
  );
  let saldo = 0;
  const dataUpdates: Array<{ range: string; values: string[][] }> = [];
  for (const m of activos) {
    saldo += delta(m);
    if (m.saldoDespues !== saldo) {
      dataUpdates.push({
        range: `'${BAIGUN_CTA_CTE_TAB}'!H${m._row}`,
        values: [[String(saldo)]],
      });
    }
  }
  if (dataUpdates.length === 0) return 0;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: dataUpdates,
    },
  });
  return dataUpdates.length;
}

export { BAIGUN_CTA_CTE_TAB, BAIGUN_CTA_CTE_HEADERS };
