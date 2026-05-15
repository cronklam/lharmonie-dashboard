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
  let hi = 0;
  if (rows[0][0] && String(rows[0][0]).toUpperCase().includes('LHARMONIE')) {
    hi = 1;
  }
  const headers = rows[hi].map((h) => String(h).trim());
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
  // Mayo 2026 — el bot/flujo Bistrosoft dejó de cargar facturas al tab
  // "Facturas" hace ~2 meses. Las cuentas a pagar pasaron a vivir en el
  // tab "Proveedores" (1 fila por proveedor con Condición de Pago + Total
  // Comprado acumulado). Para no romper /a-pagar leemos ambos tabs y
  // emitimos pseudo-facturas a partir de las filas Proveedores con
  // "A pagar". Las pseudo-facturas tienen `_origen: 'proveedores'` para
  // que la UI sepa que no se pueden marcar como pagadas con el worker.
  //
  // NO se toca ningún tab del Sheet.
  const [facturasRows, proveedoresRows] = await Promise.all([
    fetchTab(FACTURAS_SHEET_ID, 'Facturas').catch(() => [] as string[][]),
    fetchTab(FACTURAS_SHEET_ID, 'Proveedores').catch(() => [] as string[][]),
  ]);

  const facturas = rowsToObjects(facturasRows);
  const pseudoFacturas = proveedoresAPseudoFacturas(proveedoresRows);
  return [...facturas, ...pseudoFacturas];
}

// Convierte filas del tab "Proveedores" con Condición de Pago = "A pagar"
// + Total Comprado > 0 en pseudo-facturas con el shape que espera el
// frontend. _sheetRow se setea a -1 para evitar que /marcar-pagada
// intente escribir a la fila equivocada del tab Facturas.
function proveedoresAPseudoFacturas(rows: string[][]): SheetRowWithMeta[] {
  if (!rows.length) return [];
  // Tab Proveedores: header en row 0, datos en row 1+.
  const headers = rows[0].map((h) => String(h).trim());
  const idx = (name: string) => headers.findIndex((h) => h === name);
  const iRazon = idx('Razón Social');
  const iCUIT = idx('CUIT');
  const iCBU = idx('Alias / CBU');
  const iCond = idx('Condición de Pago');
  const iCat = idx('Categoría');
  const iUltima = idx('Última Compra');
  const iTotal = idx('Total Comprado');
  const iObs = idx('Observaciones');
  if (iRazon < 0 || iCond < 0 || iTotal < 0) return [];

  const parseNum = (s: string): number => {
    const n = parseFloat(
      String(s || '')
        .replace(/\$/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
        .replace(/[^0-9.\-]/g, ''),
    );
    return isNaN(n) ? 0 : n;
  };

  const out: SheetRowWithMeta[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const razon = (row[iRazon] || '').trim();
    if (!razon) continue;
    const cond = (row[iCond] || '').trim();
    if (!cond.toLowerCase().includes('a pagar')) continue;
    const total = parseNum(row[iTotal] || '');
    if (total <= 0) continue;
    const ultima = (row[iUltima] || '').trim();
    const fechaFC = ultima || '';
    out.push({
      _sheetRow: -1,                  // marcador "virtual"
      _origen: 'proveedores',          // flag para la UI
      _proveedorRow: i + 1,            // fila real en tab Proveedores (1-indexed)
      'Fecha FC': fechaFC,
      'Semana': '',
      'Mes': '',
      'Año': '',
      'Proveedor': razon,
      'CUIT': iCUIT >= 0 ? (row[iCUIT] || '').trim() : '',
      'Tipo Doc': 'Cuenta corriente',
      '# PV': '',
      '# Factura': '',
      'Categoría': iCat >= 0 ? (row[iCat] || '').trim() : '',
      'Local': '',
      'Cajero': '',
      'Importe Neto': '',
      'IVA 21%': '',
      'IVA 10.5%': '',
      'Total': String(total),
      'Medio de Pago': cond,
      'Estado': cond,
      'Fecha de Pago': '',
      'Observaciones': iObs >= 0 ? (row[iObs] || '').trim() : '',
      'Procesado': '',
      'Imagen': '',
      'CBU': iCBU >= 0 ? (row[iCBU] || '').trim() : '',
    });
  }
  return out;
}

export async function getProveedoresFromSheet() {
  const rows = await fetchTab(FACTURAS_SHEET_ID, 'Proveedores');
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
