// Cliente de Google Sheets API (lectura) para el dashboard.
// Lee con API key. El dashboard NUNCA escribe directo al Sheet:
// "Marcar como pagada" pasa por el worker de Railway (ver lib/worker.ts).

import 'server-only';

const FACTURAS_SHEET_ID = process.env.FACTURAS_SHEET_ID || '';
const RECETARIO_SHEET_ID =
  process.env.RECETARIO_SHEET_ID || '15tlHXgIKznAxjc8Accpe6xVK4ghaMcUo0Uwq1-A4b6E';
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

async function fetchTab(
  sheetId: string,
  tab: string,
  opts: { tag?: string; revalidate?: number } = {},
): Promise<string[][]> {
  if (!sheetId || !API_KEY) {
    throw new SheetsError(
      500,
      'FACTURAS_SHEET_ID o GOOGLE_API_KEY no configurados.',
    );
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
    tab,
  )}?key=${API_KEY}`;
  // Por default NO cacheamos. La caché vieja de 60s causó un bug:
  // después de un write (marcar pagada / eliminar), el read seguía
  // devolviendo data vieja por hasta 1 min, así que la UI mostraba la
  // factura todavía pendiente. Llamadas tag-based: el caller puede
  // pasar `tag` para habilitar revalidación selectiva via
  // `revalidateTag(tag)` después de un write.
  const next: { revalidate?: number; tags?: string[] } = opts.tag
    ? { revalidate: opts.revalidate ?? 300, tags: [opts.tag] }
    : { revalidate: 0 };
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    next,
    cache: opts.tag ? 'force-cache' : 'no-store',
  });
  if (!res.ok) throw new SheetsError(res.status, `Sheets API ${res.status}`);
  const data = (await res.json()) as { values?: string[][] };
  return data.values || [];
}

// rowsToObjects + detección de fila título "LHARMONIE …" (igual que dash viejo).
// Devuelve filas con campos string + un campo numérico _sheetRow (fila exacta
// en el Sheet, para poder llamar al worker al marcar pagada).
type SheetRowWithMeta = Record<string, string | number>;

function rowsToObjects(rows: string[][]): SheetRowWithMeta[] {
  if (!rows.length) return [];
  // El Sheet de Facturas usa col A de la fila 0 como "title" mergeada
  // ("LHARMONIE — REGISTRO DE FACTURAS Y COMPROBANTES"). El layout
  // tiene 2 variantes:
  //   (a) legacy: row 0 = solo title en col A, resto vacío; row 1 = headers
  //   (b) actual (mayo 26+): row 0 = title en col A + headers reales en
  //       cols B+ (Semana, Mes, Año, Proveedor, ..., Estado, ...) en la
  //       MISMA fila; row 1 = primera factura.
  // Detectamos el caso (b) viendo si row 0 tiene varias celdas llenas
  // más allá de col A. Si sí, headers = row 0 con col A reemplazada por
  // "Fecha FC" (lo que espera el COL mapping del cliente). Si no, hi=1
  // como antes.
  let hi = 0;
  let headers: string[];
  const row0 = rows[0] || [];
  const row0Col0 = String(row0[0] || '').toUpperCase();
  const tieneTitle = row0Col0.includes('LHARMONIE');
  const otrasColsLlenasRow0 = row0
    .slice(1)
    .filter((c) => String(c || '').trim()).length;
  if (tieneTitle && otrasColsLlenasRow0 >= 5) {
    // Caso (b): headers en row 0, col A renombrada de title → "Fecha FC".
    const fixed = [...row0];
    fixed[0] = 'Fecha FC';
    headers = fixed.map((h) => String(h).trim());
    hi = 0;
  } else if (tieneTitle) {
    // Caso (a) legacy: title en row 0, headers en row 1.
    hi = 1;
    headers = (rows[1] || []).map((h) => String(h).trim());
  } else {
    // Sin title; row 0 son los headers directos.
    headers = row0.map((h) => String(h).trim());
  }
  return rows
    .slice(hi + 1)
    .map((row, rowIdx) => {
      const obj: SheetRowWithMeta = { _sheetRow: hi + 2 + rowIdx };
      headers.forEach((h, i) => {
        obj[h] = row[i] !== undefined ? String(row[i]).trim() : '';
      });
      return obj;
    })
    .filter((r) =>
      Object.entries(r).some(([k, v]) => k !== '_sheetRow' && v !== ''),
    );
}

export async function getFacturasFromSheet() {
  const rows = await fetchTab(FACTURAS_SHEET_ID, 'Facturas');
  return rowsToObjects(rows);
}

export async function getArticulosFromSheet() {
  const rows = await fetchTab(FACTURAS_SHEET_ID, 'Artículos');
  return rowsToObjects(rows);
}

// Food Cost vive en otro sheet (Recetario) y tiene formato no estándar:
// la columna A es la "Categoría" y arrastra valor entre filas (group header).
// Replicamos la lógica del dash/app.js loadFoodCost().
interface FoodCostItem {
  articulo: string;
  categoria: string;
  costoIVA: number;
  pv: number;
  fcPct: number | null;
  fcIdeal: number;
  revisar: boolean;
  faltaCosto: boolean;
}

export async function getFoodCostFromSheet(): Promise<FoodCostItem[]> {
  if (!RECETARIO_SHEET_ID || !API_KEY) {
    throw new SheetsError(500, 'RECETARIO_SHEET_ID o GOOGLE_API_KEY no configurados.');
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${RECETARIO_SHEET_ID}/values/${encodeURIComponent(
    'Foodcost GRAL',
  )}?key=${API_KEY}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new SheetsError(res.status, `Sheets API ${res.status}`);
  const data = (await res.json()) as { values?: string[][] };
  const rows = data.values || [];

  const I = {
    cat: 0,
    art: 2,
    costoIVA: 4,
    pv: 5,
    margenIdeal: 9,
    costoActual: 10,
    costo25: 14,
    precioSug25: 15,
    costo30: 16,
  };
  const g = (row: string[], idx: number) =>
    row[idx] !== undefined ? String(row[idx]).trim() : '';
  const parseNumLocal = (v: string): number => {
    const n = parseFloat(
      String(v || 0)
        .replace(/\$/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
        .replace(/[^0-9.\-]/g, ''),
    );
    return isNaN(n) ? 0 : n;
  };
  const pct = (v: string): number | null => {
    const n = parseFloat(String(v).replace('%', '').replace(',', '.').trim());
    if (isNaN(n)) return null;
    return n < 1 && n > 0 ? Math.round(n * 100) : Math.round(n);
  };

  let currentCat = '';
  const items: FoodCostItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const colA = g(row, I.cat);
    const colC = g(row, I.art);
    if (
      colC === 'Articulo' ||
      colC === 'Artículo' ||
      colA === 'Categoria' ||
      colA === 'Categoría'
    ) {
      continue;
    }
    if (colA && colA !== currentCat) currentCat = colA;
    if (!colC) continue;
    const pvRaw = g(row, I.pv);
    if (!pvRaw || pvRaw.includes('#') || pvRaw === '$ 0' || pvRaw === '0') continue;
    const pvVal = parseNumLocal(pvRaw);
    if (pvVal === 0) continue;
    const costoIVA = parseNumLocal(g(row, I.costoIVA));
    const fcPct = pct(g(row, I.costoActual));
    const fcIdeal = pct(g(row, I.margenIdeal)) || 25;
    const c25 = g(row, I.costo25).toUpperCase();
    const c30 = g(row, I.costo30).toUpperCase();
    const ps25 = g(row, I.precioSug25).toUpperCase();
    const falta = c25.includes('FALTA') || c30.includes('FALTA');
    const revisar =
      c25 === 'REVISAR' ||
      c30 === 'REVISAR' ||
      ps25.includes('REVISAR') ||
      falta ||
      (fcPct !== null && fcPct > fcIdeal + 2);

    items.push({
      articulo: colC,
      categoria: currentCat,
      costoIVA,
      pv: pvVal,
      fcPct,
      fcIdeal,
      revisar,
      faltaCosto: falta,
    });
  }
  return items;
}
