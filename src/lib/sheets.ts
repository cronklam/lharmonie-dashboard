// Cliente de Google Sheets API (lectura) para el dashboard.
// Lee con API key — el Sheet de Facturas está compartido como
// "viewer con link". El dashboard NUNCA escribe (lo prohibe CLAUDE.md).

import 'server-only';

const SHEET_ID = process.env.FACTURAS_SHEET_ID || '';
const API_KEY = process.env.GOOGLE_API_KEY || '';

export interface SheetRow {
  [column: string]: string;
}

export class SheetsError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function fetchTab(tab: string): Promise<string[][]> {
  if (!SHEET_ID || !API_KEY) {
    throw new SheetsError(
      500,
      'FACTURAS_SHEET_ID o GOOGLE_API_KEY no configurados.',
    );
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(
    tab,
  )}?key=${API_KEY}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new SheetsError(res.status, `Sheets API ${res.status}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  return data.values || [];
}

// La row 0 puede ser un título "LHARMONIE …" — el original lo detecta
// y usa la siguiente como header. Replicamos esa lógica.
function rowsToObjects(rows: string[][]): SheetRow[] {
  if (!rows.length) return [];
  let hi = 0;
  if (rows[0][0] && String(rows[0][0]).toUpperCase().includes('LHARMONIE')) {
    hi = 1;
  }
  const headers = rows[hi].map((h) => String(h).trim());
  return rows
    .slice(hi + 1)
    .map((row) => {
      const obj: SheetRow = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] !== undefined ? String(row[i]).trim() : '';
      });
      return obj;
    })
    .filter((r) => Object.values(r).some((v) => v !== ''));
}

export async function getFacturasFromSheet(): Promise<SheetRow[]> {
  const rows = await fetchTab('Facturas');
  return rowsToObjects(rows);
}
