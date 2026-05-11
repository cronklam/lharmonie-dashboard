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

/** Lee la fila de headers del tab Facturas. El Sheet a veces tiene
 *  una fila "LHARMONIE ..." en la fila 1 — en ese caso los headers
 *  están en la fila 2. Devuelve los headers + la fila donde están. */
async function readHeaders(
  sheets: SheetsClient,
): Promise<{ headers: string[]; headerRow: number }> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${TAB}'!A1:AZ2`,
  });
  const rows = res.data.values || [];
  let headerRow = 1;
  const first = rows[0];
  if (first && first[0] && String(first[0]).toUpperCase().includes('LHARMONIE')) {
    headerRow = 2;
  }
  const headers = ((rows[headerRow - 1] || []) as string[]).map((h) =>
    String(h).trim(),
  );
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
