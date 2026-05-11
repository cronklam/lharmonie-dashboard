import 'server-only';

// Servicios — Sheet I/O (server-only). Lee y escribe al
// `SERVICIOS_SHEET_ID` con service account (`GOOGLE_CREDENTIALS`).
//
// IMPORTANTE: NO hay autocreate de tabs. Si el tab no existe el
// endpoint devuelve un error claro. El usuario decidió que no creemos
// tabs nuevos hasta confirmar el formato existente.

import { google } from 'googleapis';
import {
  SERVICIOS_CATALOGO_HEADERS,
  SERVICIOS_CATALOGO_TAB,
  SERVICIOS_PAGOS_HEADERS,
  SERVICIOS_PAGOS_TAB,
  BAIGUN_CTA_CTE_HEADERS,
  BAIGUN_CTA_CTE_TAB,
  toSheetBool,
  fromSheetBool,
  type ServicioCatalogo,
  type ServicioPago,
  type BaigunMovimiento,
  type TipoServicio,
  type Periodicidad,
  type MedioPago,
} from './servicios';
import { ANCLAS, type Ancla } from './anclas';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';

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

export class ServiciosError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function ensureConfigured(): SheetsClient {
  const sheets = getSheetsClient();
  if (!sheets) {
    throw new ServiciosError(
      500,
      'GOOGLE_CREDENTIALS no configurado. Subí el JSON del service account a Vercel.',
    );
  }
  if (!SHEET_ID) {
    throw new ServiciosError(
      500,
      'SERVICIOS_SHEET_ID no configurado. Setealo en Vercel.',
    );
  }
  return sheets;
}

async function readTab(
  sheets: SheetsClient,
  tab: string,
): Promise<string[][]> {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tab}'!A1:Z3000`,
    });
    return res.data.values || [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error leyendo Sheet';
    throw new ServiciosError(
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
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^0-9.\-]/g, ''),
  );
  return isNaN(n) ? 0 : n;
}

function parseInt0(v: string | undefined | null): number {
  if (!v) return 0;
  const n = parseInt(String(v).replace(/[^0-9\-]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

// ─── Catálogo ─────────────────────────────────────────────────────

function rowToServicio(row: string[]): ServicioCatalogo | null {
  const id = (row[0] || '').trim();
  if (!id) return null;
  const ancla = (row[2] || '').trim() as Ancla;
  if (!ANCLAS.includes(ancla)) return null;
  return {
    id,
    tipo: ((row[1] || 'otro').trim().toLowerCase() as TipoServicio) || 'otro',
    ancla,
    local: (row[3] || '').trim(),
    nombreVisible: (row[4] || '').trim(),
    titularNombre: (row[5] || '').trim(),
    titularCuit: (row[6] || '').trim(),
    cuentaNumero: (row[7] || '').trim(),
    direccionServicio: (row[8] || '').trim(),
    periodicidad:
      ((row[9] || 'mensual').trim().toLowerCase() as Periodicidad) || 'mensual',
    montoEstimadoArs: parseNum(row[10]),
    vencimientoDia: row[11] ? parseInt0(row[11]) || null : null,
    notas: (row[12] || '').trim(),
    activo: fromSheetBool(row[13]),
    creadoEn: (row[14] || '').trim(),
    creadoPor: (row[15] || '').trim(),
    subarrendadoBaigun: fromSheetBool(row[16]),
    baigunPorcentaje: parseNum(row[17]),
    metodoPago: ((row[18] || '').trim().toLowerCase() as MedioPago) || '',
    cbuPago: (row[19] || '').trim(),
    cuentaPagoAlias: (row[20] || '').trim(),
    montoEstimadoUsd: parseNum(row[21]),
    montoEstimadoTransfer: parseNum(row[22]),
  };
}

function servicioToRow(s: ServicioCatalogo): string[] {
  return [
    s.id,
    s.tipo,
    s.ancla,
    s.local,
    s.nombreVisible,
    s.titularNombre,
    s.titularCuit,
    s.cuentaNumero,
    s.direccionServicio,
    s.periodicidad,
    String(s.montoEstimadoArs || 0),
    s.vencimientoDia ? String(s.vencimientoDia) : '',
    s.notas,
    toSheetBool(s.activo),
    s.creadoEn,
    s.creadoPor,
    toSheetBool(s.subarrendadoBaigun),
    String(s.baigunPorcentaje || 0),
    s.metodoPago,
    s.cbuPago,
    s.cuentaPagoAlias,
    String(s.montoEstimadoUsd || 0),
    String(s.montoEstimadoTransfer || 0),
  ];
}

export async function listCatalogo(): Promise<ServicioCatalogo[]> {
  const sheets = ensureConfigured();
  const rows = await readTab(sheets, SERVICIOS_CATALOGO_TAB);
  if (rows.length < 2) return [];
  return rows
    .slice(1)
    .map(rowToServicio)
    .filter((s): s is ServicioCatalogo => s !== null);
}

export async function appendServicio(s: ServicioCatalogo): Promise<void> {
  const sheets = ensureConfigured();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${SERVICIOS_CATALOGO_TAB}'!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: [servicioToRow(s)] },
  });
}

export async function updateServicio(s: ServicioCatalogo): Promise<void> {
  const sheets = ensureConfigured();
  const rows = await readTab(sheets, SERVICIOS_CATALOGO_TAB);
  const idx = rows.findIndex((r) => (r[0] || '').trim() === s.id);
  if (idx <= 0) {
    throw new ServiciosError(404, `Servicio ${s.id} no encontrado`);
  }
  const rowNum = idx + 1; // header en fila 1, data desde fila 2; idx es 0-based en rows
  const lastCol = String.fromCharCode(
    'A'.charCodeAt(0) + SERVICIOS_CATALOGO_HEADERS.length - 1,
  );
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${SERVICIOS_CATALOGO_TAB}'!A${rowNum}:${lastCol}${rowNum}`,
    valueInputOption: 'RAW',
    requestBody: { values: [servicioToRow(s)] },
  });
}

// ─── Pagos ────────────────────────────────────────────────────────

function rowToPago(row: string[]): ServicioPago | null {
  const id = (row[0] || '').trim();
  if (!id) return null;
  const ancla = (row[5] || '').trim() as Ancla;
  if (!ANCLAS.includes(ancla)) return null;
  return {
    id,
    servicioId: (row[1] || '').trim(),
    periodo: (row[2] || '').trim(),
    fechaPago: (row[3] || '').trim(),
    fechaAnclada: (row[4] || '').trim(),
    ancla,
    montoTotalArs: parseNum(row[6]),
    montoArsEfectivo: parseNum(row[7]),
    montoUsd: parseNum(row[8]),
    tipoCambioUsd: parseNum(row[9]),
    montoTransferenciaArs: parseNum(row[10]),
    medioPago: ((row[11] || 'efectivo').trim().toLowerCase() as MedioPago) || 'efectivo',
    comprobanteUrl: (row[12] || '').trim(),
    notas: (row[13] || '').trim(),
    cargadoPor: (row[14] || '').trim(),
    baigunShareArs: parseNum(row[15]),
  };
}

function pagoToRow(p: ServicioPago): string[] {
  return [
    p.id,
    p.servicioId,
    p.periodo,
    p.fechaPago,
    p.fechaAnclada,
    p.ancla,
    String(p.montoTotalArs || 0),
    String(p.montoArsEfectivo || 0),
    String(p.montoUsd || 0),
    String(p.tipoCambioUsd || 0),
    String(p.montoTransferenciaArs || 0),
    p.medioPago,
    p.comprobanteUrl,
    p.notas,
    p.cargadoPor,
    String(p.baigunShareArs || 0),
  ];
}

export async function listPagos(servicioId?: string): Promise<ServicioPago[]> {
  const sheets = ensureConfigured();
  const rows = await readTab(sheets, SERVICIOS_PAGOS_TAB);
  if (rows.length < 2) return [];
  const all = rows
    .slice(1)
    .map(rowToPago)
    .filter((p): p is ServicioPago => p !== null);
  return servicioId ? all.filter((p) => p.servicioId === servicioId) : all;
}

export async function appendPago(p: ServicioPago): Promise<void> {
  const sheets = ensureConfigured();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${SERVICIOS_PAGOS_TAB}'!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: [pagoToRow(p)] },
  });
}

/** Append batch — para bulk marcar-mes-pagado, una sola API call. */
export async function appendPagosBatch(pagos: ServicioPago[]): Promise<void> {
  if (pagos.length === 0) return;
  const sheets = ensureConfigured();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${SERVICIOS_PAGOS_TAB}'!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: pagos.map(pagoToRow) },
  });
}

// ─── Baigun ───────────────────────────────────────────────────────

function rowToBaigun(row: string[]): BaigunMovimiento | null {
  const id = (row[0] || '').trim();
  if (!id) return null;
  return {
    id,
    fecha: (row[1] || '').trim(),
    concepto: (row[2] || '').trim(),
    cargo: parseNum(row[3]),
    pago: parseNum(row[4]),
    saldoDespues: parseNum(row[5]),
    notas: (row[6] || '').trim(),
    cargadoPor: (row[7] || '').trim(),
  };
}

export async function listBaigun(): Promise<BaigunMovimiento[]> {
  const sheets = ensureConfigured();
  const rows = await readTab(sheets, BAIGUN_CTA_CTE_TAB);
  if (rows.length < 2) return [];
  return rows
    .slice(1)
    .map(rowToBaigun)
    .filter((m): m is BaigunMovimiento => m !== null);
}

export async function appendBaigun(m: BaigunMovimiento): Promise<void> {
  const sheets = ensureConfigured();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${BAIGUN_CTA_CTE_TAB}'!A2`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        m.id,
        m.fecha,
        m.concepto,
        String(m.cargo || 0),
        String(m.pago || 0),
        String(m.saldoDespues || 0),
        m.notas,
        m.cargadoPor,
      ]],
    },
  });
}

// Re-export para que los routes no necesiten doble import
export {
  SERVICIOS_CATALOGO_HEADERS,
  SERVICIOS_PAGOS_HEADERS,
  BAIGUN_CTA_CTE_HEADERS,
};
