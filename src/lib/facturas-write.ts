import 'server-only';

// Writes al Sheet de Facturas con service account (`GOOGLE_CREDENTIALS`).
// Reemplaza al worker Railway para marcar-pagada y suma eliminación.
// Mismo patrón que `lib/caja-server.ts` y `lib/users-server.ts`.
//
// Reglas:
//   - Marcar pagada: setea columnas "Estado" = "Pagada" + "Fecha de
//     Pago" = hoy DD/MM/YYYY. NO toca medio de pago ni otras cols.
//   - Eliminar: limpia A..lastCol de la fila exacta (no shift de
//     filas siguientes — esto sería peligroso si el sheet tiene
//     formulas que referencian filas específicas).

import { google } from 'googleapis';

const SHEET_ID = process.env.FACTURAS_SHEET_ID || '';
const TAB = 'Facturas';

// Constantes de columnas (header names exactos del Sheet, espejo de
// COL en FacturasStore). Hardcoded acá para evitar importar un módulo
// 'use client' desde código server-side.
const COL_ESTADO = 'Estado';
const COL_FECHA_PAGO = 'Fecha de Pago';
const COL_MEDIO_PAGO = 'Medio de Pago';

function getAuth() {
  const creds = process.env.GOOGLE_CREDENTIALS;
  if (!creds) return null;
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(creds),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetsClient() {
  const auth = getAuth();
  if (!auth) return null;
  return google.sheets({ version: 'v4', auth });
}

type SheetsClient = NonNullable<ReturnType<typeof getSheetsClient>>;

/** Convierte 0-indexed col index → letra de Sheet ("A", "Z", "AA"...). */
function colLetter(idx: number): string {
  let letter = '';
  let n = idx;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

/** Lee la fila de headers del tab Facturas. Hay dos layouts:
 *   (a) legacy: row 1 = title "LHARMONIE …", row 2 = headers.
 *   (b) actual (mayo 2026+): row 1 tiene el title en col A Y los headers
 *       reales en cols B+ (Semana, Mes, Año, Proveedor, ..., Estado, ...)
 *       en la MISMA fila. Row 2 ya es la primera factura.
 *  Espejo de la lógica de lectura en `lib/sheets.ts` rowsToObjects. */
async function readHeaders(
  sheets: SheetsClient,
): Promise<{ headers: string[]; headerRow: number }> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${TAB}'!A1:AZ2`,
  });
  const rows = res.data.values || [];
  const row0 = (rows[0] || []) as string[];
  const row1 = (rows[1] || []) as string[];
  const row0Col0 = String(row0[0] || '').toUpperCase();
  const tieneTitle = row0Col0.includes('LHARMONIE');
  const otrasColsLlenasRow0 = row0
    .slice(1)
    .filter((c) => String(c || '').trim()).length;

  let headerRow: number;
  let headers: string[];
  if (tieneTitle && otrasColsLlenasRow0 >= 5) {
    // Caso (b): row 0 col A = title, cols B+ = headers reales. Renombramos
    // col A → "Fecha FC" para coincidir con el COL mapping del cliente.
    const fixed = [...row0];
    fixed[0] = 'Fecha FC';
    headers = fixed.map((h) => String(h).trim());
    headerRow = 1;
  } else if (tieneTitle) {
    // Caso (a) legacy: title en row 0, headers en row 1.
    headers = row1.map((h) => String(h).trim());
    headerRow = 2;
  } else {
    // Sin title: row 0 son los headers directos.
    headers = row0.map((h) => String(h).trim());
    headerRow = 1;
  }
  return { headers, headerRow };
}

function ensureConfigured(): { sheets: SheetsClient } | { error: string } {
  const sheets = getSheetsClient();
  if (!sheets) {
    return { error: 'GOOGLE_CREDENTIALS no configurado en Vercel.' };
  }
  if (!SHEET_ID) {
    return { error: 'FACTURAS_SHEET_ID no configurado.' };
  }
  return { sheets };
}

export interface WriteResult {
  ok: boolean;
  error?: string;
}

/** Marca una factura como pagada escribiendo Estado + Fecha de Pago
 *  en la fila exacta. `filaExacta` es 1-indexed (la fila real del Sheet). */
export async function markFacturaPagadaDirect(
  filaExacta: number,
  fechaPagoDDMMYYYY?: string,
): Promise<WriteResult> {
  if (!Number.isFinite(filaExacta) || filaExacta < 2) {
    return { ok: false, error: 'filaExacta inválida (debe ser entero ≥ 2)' };
  }
  const cfg = ensureConfigured();
  if ('error' in cfg) return { ok: false, error: cfg.error };
  const { sheets } = cfg;
  try {
    const { headers } = await readHeaders(sheets);
    const estadoIdx = headers.findIndex((h) => h === COL_ESTADO);
    const fechaPagoIdx = headers.findIndex((h) => h === COL_FECHA_PAGO);
    if (estadoIdx < 0) {
      return {
        ok: false,
        error: `Columna "${COL_ESTADO}" no encontrada en el Sheet. Headers: ${headers.slice(0, 6).join(', ')}…`,
      };
    }
    if (fechaPagoIdx < 0) {
      return {
        ok: false,
        error: `Columna "${COL_FECHA_PAGO}" no encontrada en el Sheet.`,
      };
    }
    const fechaHoy =
      fechaPagoDDMMYYYY || new Date().toLocaleDateString('es-AR');
    const estadoLetter = colLetter(estadoIdx);
    const fechaLetter = colLetter(fechaPagoIdx);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: `'${TAB}'!${estadoLetter}${filaExacta}`,
            values: [['Pagada']],
          },
          {
            range: `'${TAB}'!${fechaLetter}${filaExacta}`,
            values: [[fechaHoy]],
          },
        ],
      },
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return { ok: false, error: `Sheets API: ${msg}` };
  }
}

/** Actualiza la columna "Medio de Pago" de una fila exacta. Usado por
 *  Iara cuando una factura quedó cargada con el método equivocado
 *  (ej: dice Transferencia pero en realidad fue Efectivo). NO toca
 *  Estado ni Fecha de Pago. */
export async function setMedioPagoDirect(
  filaExacta: number,
  medioPago: string,
): Promise<WriteResult> {
  if (!Number.isFinite(filaExacta) || filaExacta < 2) {
    return { ok: false, error: 'filaExacta inválida (debe ser entero ≥ 2)' };
  }
  if (!medioPago || !medioPago.trim()) {
    return { ok: false, error: 'medioPago vacío' };
  }
  const cfg = ensureConfigured();
  if ('error' in cfg) return { ok: false, error: cfg.error };
  const { sheets } = cfg;
  try {
    const { headers } = await readHeaders(sheets);
    const idx = headers.findIndex((h) => h === COL_MEDIO_PAGO);
    if (idx < 0) {
      return {
        ok: false,
        error: `Columna "${COL_MEDIO_PAGO}" no encontrada en el Sheet.`,
      };
    }
    const letter = colLetter(idx);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${TAB}'!${letter}${filaExacta}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[medioPago.trim()]] },
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return { ok: false, error: `Sheets API: ${msg}` };
  }
}

/** Limpia el contenido de una fila de Facturas (no shifta filas
 *  siguientes — solo deja la fila vacía). El sheet pierde una entrada
 *  pero no se rompen referencias de fila. */
export async function clearFacturaRow(filaExacta: number): Promise<WriteResult> {
  if (!Number.isFinite(filaExacta) || filaExacta < 2) {
    return { ok: false, error: 'filaExacta inválida (debe ser entero ≥ 2)' };
  }
  const cfg = ensureConfigured();
  if ('error' in cfg) return { ok: false, error: cfg.error };
  const { sheets } = cfg;
  try {
    const { headers } = await readHeaders(sheets);
    const lastCol = colLetter(Math.max(0, headers.length - 1));
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `'${TAB}'!A${filaExacta}:${lastCol}${filaExacta}`,
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return { ok: false, error: `Sheets API: ${msg}` };
  }
}
