import 'server-only';

// Caja chica + grande — Sheet I/O (server-only). Lee y escribe al
// `CAJA_SHEET_ID` con service account (`GOOGLE_CREDENTIALS`).
//
// IMPORTANTE: NO hay autocreate de tabs. Si el tab no existe el
// endpoint devuelve un error claro.

import { google } from 'googleapis';
import {
  CAJA_CHICA_MOV_TAB,
  CAJA_CHICA_SES_TAB,
  CAJA_GRANDE_TAB,
  CAJA_CHICA_MOV_HEADERS,
  CAJA_CHICA_SES_HEADERS,
  CAJA_GRANDE_HEADERS,
  calcularSaldo,
  type CajaMovimiento,
  type CajaSesion,
  type CajaGrandeMovimiento,
  type CajaTipoMov,
  type CajaEstadoMov,
  type CajaCategoria,
  type CajaGrandeTipo,
} from './caja';

const SHEET_ID = process.env.CAJA_SHEET_ID || '';

function getAuth() {
  const creds = process.env.GOOGLE_CREDENTIALS;
  if (!creds) return null;
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(creds),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export function getSheetsClient() {
  const auth = getAuth();
  if (!auth) return null;
  return google.sheets({ version: 'v4', auth });
}

type SheetsClient = NonNullable<ReturnType<typeof getSheetsClient>>;

export class CajaError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function ensureConfigured(): SheetsClient {
  const sheets = getSheetsClient();
  if (!sheets) {
    throw new CajaError(
      500,
      'GOOGLE_CREDENTIALS no configurado. Subí el JSON del service account a Vercel.',
    );
  }
  if (!SHEET_ID) {
    throw new CajaError(
      500,
      'CAJA_SHEET_ID no configurado. Setealo en Vercel.',
    );
  }
  return sheets;
}

async function readTab(sheets: SheetsClient, tab: string): Promise<string[][]> {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tab}'!A1:Z3000`,
    });
    return res.data.values || [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error leyendo Sheet';
    throw new CajaError(
      500,
      `No se pudo leer "${tab}". Verificá que el tab exista y que el service account tenga acceso. (${msg})`,
    );
  }
}

function parseNum(v: string | undefined | null): number {
  if (!v) return 0;
  const n = parseFloat(
    String(v)
      .replace(/\$/g, '')
      .replace(/USD/gi, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^0-9.\-]/g, ''),
  );
  return isNaN(n) ? 0 : n;
}

// ─── Caja chica · movimientos ───────────────────────────────────

function rowToMovChica(row: string[]): CajaMovimiento | null {
  const id = (row[0] || '').trim();
  if (!id) return null;
  return {
    id,
    fechaMov: (row[1] || '').trim(),
    local: (row[2] || '').trim(),
    tipo: ((row[3] || 'GASTO').trim().toUpperCase() as CajaTipoMov) || 'GASTO',
    montoArs: parseNum(row[4]),
    montoUsd: parseNum(row[5]),
    concepto: (row[6] || '').trim(),
    estado: ((row[7] || 'COMPLETO').trim().toUpperCase() as CajaEstadoMov) || 'COMPLETO',
    cargadoPor: (row[8] || '').trim(),
    cargadoEl: (row[9] || '').trim(),
    sesionId: (row[10] || '').trim(),
    notas: (row[11] || '').trim(),
    fuente: (row[12] || '').trim(),
    categoria: ((row[13] || '').trim() as CajaCategoria) || '',
  };
}

function movChicaToRow(m: CajaMovimiento): string[] {
  return [
    m.id,
    m.fechaMov,
    m.local,
    m.tipo,
    String(m.montoArs || 0),
    String(m.montoUsd || 0),
    m.concepto,
    m.estado,
    m.cargadoPor,
    m.cargadoEl,
    m.sesionId,
    m.notas,
    m.fuente,
    m.categoria,
  ];
}

export async function listMovimientosChica(): Promise<CajaMovimiento[]> {
  const sheets = ensureConfigured();
  const rows = await readTab(sheets, CAJA_CHICA_MOV_TAB);
  if (rows.length < 2) return [];
  return rows
    .slice(1)
    .map(rowToMovChica)
    .filter((m): m is CajaMovimiento => m !== null);
}

export async function appendMovimientoChica(m: CajaMovimiento): Promise<void> {
  const sheets = ensureConfigured();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${CAJA_CHICA_MOV_TAB}'!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: [movChicaToRow(m)] },
  });
}

// ─── Caja chica · sesiones ──────────────────────────────────────

function rowToSesion(row: string[]): CajaSesion | null {
  const id = (row[0] || '').trim();
  if (!id) return null;
  return {
    id,
    fechaControl: (row[1] || '').trim(),
    totalRetiradoArs: parseNum(row[2]),
    totalRetiradoUsd: parseNum(row[3]),
    totalGastadoArs: parseNum(row[4]),
    totalGastadoUsd: parseNum(row[5]),
    totalAjusteArs: parseNum(row[6]),
    totalAjusteUsd: parseNum(row[7]),
    cajaGrandeEncontradaArs: parseNum(row[8]),
    cajaGrandeEncontradaUsd: parseNum(row[9]),
    saldoSugeridoArs: parseNum(row[10]),
    saldoSugeridoUsd: parseNum(row[11]),
    saldoConfirmadoArs: parseNum(row[12]),
    saldoConfirmadoUsd: parseNum(row[13]),
    diferenciaArs: parseNum(row[14]),
    diferenciaUsd: parseNum(row[15]),
    notas: (row[16] || '').trim(),
    cargadoPor: (row[17] || '').trim(),
    cargadoEl: (row[18] || '').trim(),
  };
}

export async function listSesiones(): Promise<CajaSesion[]> {
  const sheets = ensureConfigured();
  const rows = await readTab(sheets, CAJA_CHICA_SES_TAB);
  if (rows.length < 2) return [];
  return rows
    .slice(1)
    .map(rowToSesion)
    .filter((s): s is CajaSesion => s !== null);
}

// ─── Caja grande · movimientos ──────────────────────────────────

function rowToMovGrande(row: string[]): CajaGrandeMovimiento | null {
  const id = (row[0] || '').trim();
  if (!id) return null;
  return {
    id,
    fecha: (row[1] || '').trim(),
    tipo: ((row[2] || 'AJUSTE').trim().toUpperCase() as CajaGrandeTipo) || 'AJUSTE',
    montoArs: parseNum(row[3]),
    montoUsd: parseNum(row[4]),
    concepto: (row[5] || '').trim(),
    sesionIdRef: (row[6] || '').trim(),
    saldoDespuesArs: parseNum(row[7]),
    saldoDespuesUsd: parseNum(row[8]),
    cargadoPor: (row[9] || '').trim(),
  };
}

function movGrandeToRow(m: CajaGrandeMovimiento): string[] {
  return [
    m.id,
    m.fecha,
    m.tipo,
    String(m.montoArs || 0),
    String(m.montoUsd || 0),
    m.concepto,
    m.sesionIdRef,
    String(m.saldoDespuesArs || 0),
    String(m.saldoDespuesUsd || 0),
    m.cargadoPor,
  ];
}

export async function listMovimientosGrande(): Promise<CajaGrandeMovimiento[]> {
  const sheets = ensureConfigured();
  const rows = await readTab(sheets, CAJA_GRANDE_TAB);
  if (rows.length < 2) return [];
  return rows
    .slice(1)
    .map(rowToMovGrande)
    .filter((m): m is CajaGrandeMovimiento => m !== null);
}

/** Append con saldo después calculado a partir del saldo actual. El
 *  monto debe venir signed (positivo si suma, negativo si resta). */
export async function appendMovimientoGrande(
  input: Omit<CajaGrandeMovimiento, 'saldoDespuesArs' | 'saldoDespuesUsd'>,
): Promise<CajaGrandeMovimiento> {
  const sheets = ensureConfigured();
  const movs = await listMovimientosGrande();
  const saldo = calcularSaldo(movs);
  const out: CajaGrandeMovimiento = {
    ...input,
    saldoDespuesArs: saldo.ars + (input.montoArs || 0),
    saldoDespuesUsd: saldo.usd + (input.montoUsd || 0),
  };
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${CAJA_GRANDE_TAB}'!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: [movGrandeToRow(out)] },
  });
  return out;
}

export async function getSaldo(): Promise<{ ars: number; usd: number }> {
  const movs = await listMovimientosGrande();
  return calcularSaldo(movs);
}

// Re-export
export {
  CAJA_CHICA_MOV_HEADERS,
  CAJA_CHICA_SES_HEADERS,
  CAJA_GRANDE_HEADERS,
};
