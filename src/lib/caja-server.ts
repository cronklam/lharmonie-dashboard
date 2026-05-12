import 'server-only';

// Caja efectivo — Sheet I/O (server-only). Lee y escribe al
// `CAJA_SHEET_ID` con service account (`GOOGLE_CREDENTIALS`).
//
// Schema documentado en `lib/caja.ts`. Reglas duras:
//   - Pestañas mensuales formato exacto "Mayo 2026". PORTADA reservada.
//   - Si el mes destino no tiene tab → error claro (NO se autocrea).
//   - Solo escribir columnas A, B, C, E, F.
//   - D (#) y G (SALDO) tienen fórmulas. Si el row destino no las
//     tiene (más allá del rango pre-llenado), las agregamos.

import { google } from 'googleapis';
import type { sheets_v4 } from 'googleapis';
import {
  CATEGORIAS,
  MONEDAS,
  categoriaSheetParaSesion,
  descripcionSesionMov,
  esRowDeSesion,
  fechaFromSheet,
  fechaToSheet,
  importeSignedSesion,
  isCategoria,
  isMonthTab,
  isoMesFromTab,
  mesTabFromISO,
  parsePrefijoSesion,
  prefijoSesion,
  type Categoria,
  type Moneda,
  type MovimientoCaja,
  type SaldoMes,
  type SesionInput,
  type SesionMovInput,
} from './caja';

const SHEET_ID = process.env.CAJA_SHEET_ID || '';
const PORTADA_TAB = 'PORTADA';

// Rango de filas a inspeccionar/escribir. El Sheet del usuario tiene
// formato y fórmulas pre-llenadas hasta una fila X que no conozco
// exactamente; 500 es un máximo razonable que cubre años de movimientos.
const MAX_ROW = 500;
const FIRST_DATA_ROW = 3; // fila 1 = título, fila 2 = headers, fila 3+ = data

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
    throw new CajaError(500, 'CAJA_SHEET_ID no configurado.');
  }
  return sheets;
}

// ─── Listado de pestañas mensuales ──────────────────────────────

interface TabInfo {
  title: string;        // "Mayo 2026"
  sheetId: number;
  iso: string;          // "2026-05"
}

/** Devuelve las pestañas mensuales (excluye PORTADA y cualquier tab
 *  con nombre no estándar), ordenadas de más reciente a más vieja. */
export async function listMeses(): Promise<TabInfo[]> {
  const sheets = ensureConfigured();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets.properties(title,sheetId)',
  });
  const all = meta.data.sheets ?? [];
  const out: TabInfo[] = [];
  for (const s of all) {
    const title = s.properties?.title || '';
    if (title === PORTADA_TAB) continue;
    if (!isMonthTab(title)) continue;
    const iso = isoMesFromTab(title);
    if (!iso) continue;
    out.push({ title, sheetId: s.properties?.sheetId ?? 0, iso });
  }
  out.sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0));
  return out;
}

/** Encuentra una pestaña por mes ISO (YYYY-MM). null si no existe. */
async function findTabByISO(
  sheets: SheetsClient,
  iso: string,
): Promise<TabInfo | null> {
  const target = mesTabFromISO(`${iso}-01`);
  if (!target) return null;
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets.properties(title,sheetId)',
  });
  for (const s of meta.data.sheets ?? []) {
    const title = s.properties?.title || '';
    if (title === target) {
      return {
        title,
        sheetId: s.properties?.sheetId ?? 0,
        iso,
      };
    }
  }
  return null;
}

// ─── Lectura de movimientos de un mes ───────────────────────────

function parseRow(rowIdx: number, row: string[]): MovimientoCaja | null {
  const fechaRaw = (row[0] || '').trim();
  const monedaRaw = (row[1] || '').trim().toUpperCase();
  const desc = (row[2] || '').trim();
  // const numCol = (row[3] || '').trim();  // D: fórmula, ignorada al leer
  const catRaw = (row[4] || '').trim().toUpperCase();
  const impRaw = (row[5] || '').trim();
  const saldoRaw = (row[6] || '').trim();

  if (!desc) return null;

  const fecha = fechaFromSheet(fechaRaw) || '';
  const moneda: Moneda =
    monedaRaw === 'DOLAR' || monedaRaw === 'DÓLAR' || monedaRaw === 'USD'
      ? 'DOLAR'
      : 'PESO';
  const categoria = isCategoria(catRaw) ? (catRaw as Categoria) : '';
  const importe = parseNum(impRaw);
  const saldoNum = saldoRaw ? parseNum(saldoRaw) : null;

  return {
    fila: rowIdx,
    fecha,
    moneda,
    descripcion: desc,
    categoria,
    importe,
    saldoCol: saldoNum != null && !isNaN(saldoNum) ? saldoNum : null,
  };
}

function parseNum(v: string | undefined | null): number {
  if (!v) return 0;
  const cleaned = String(v)
    .replace(/\$|US\$/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Lee todas las filas con DESCRIPCION no vacía del tab del mes
 *  dado (ISO `YYYY-MM`). Si el tab no existe → error 404. */
export async function listMovimientosMes(iso: string): Promise<{
  tab: string;
  items: MovimientoCaja[];
}> {
  const sheets = ensureConfigured();
  const tab = await findTabByISO(sheets, iso);
  if (!tab) {
    const target = mesTabFromISO(`${iso}-01`) || iso;
    throw new CajaError(
      404,
      `La pestaña "${target}" no existe en el Sheet. Pedile a Martín que la cree antes de cargar movimientos de ese mes.`,
    );
  }
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${tab.title}'!A${FIRST_DATA_ROW}:G${MAX_ROW}`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const rows = res.data.values || [];
  const items: MovimientoCaja[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const parsed = parseRow(FIRST_DATA_ROW + i, row.map((c) => String(c ?? '')));
    if (parsed) items.push(parsed);
  }
  return { tab: tab.title, items };
}

// ─── Saldos globales (todos los meses) ─────────────────────────

/** Suma importes de TODAS las pestañas mensuales, agrupando por
 *  moneda. Útil para mostrar saldo total al día. */
export async function getSaldosGlobales(): Promise<SaldoMes> {
  const sheets = ensureConfigured();
  const tabs = await listMeses();
  let pesos = 0;
  let dolares = 0;
  if (tabs.length === 0) return { pesos, dolares };

  // batchGet en lotes para no pasar el límite de URL
  const ranges = tabs.map((t) => `'${t.title}'!B${FIRST_DATA_ROW}:F${MAX_ROW}`);
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    ranges,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  for (const block of res.data.valueRanges || []) {
    const rows = block.values || [];
    for (const row of rows) {
      const moneda = String(row[0] || '').trim().toUpperCase();
      const desc = String(row[1] || '').trim();
      // F is index 4 in our slice B..F: [B,C,D,E,F] → idx 4
      const impRaw = row[4];
      if (!desc) continue;
      const n = typeof impRaw === 'number' ? impRaw : parseNum(String(impRaw ?? ''));
      if (moneda === 'DOLAR' || moneda === 'DÓLAR' || moneda === 'USD') {
        dolares += n;
      } else {
        pesos += n;
      }
    }
  }
  return { pesos, dolares };
}

// ─── Append movimiento ──────────────────────────────────────────

export interface AppendInput {
  iso: string;              // YYYY-MM-DD
  moneda: Moneda;
  descripcion: string;
  categoria: Categoria;
  importeSigned: number;    // ya signed (+ ingreso, − egreso)
}

export interface AppendResult {
  tab: string;
  fila: number;
}

/** Append a la primera fila libre del tab del mes correspondiente
 *  a `iso`. Solo escribe A, B, C, E, F. Si la fila destino no tiene
 *  fórmulas en D y G (porque está más allá del pre-llenado), las
 *  agrega para que el patrón siga. */
export async function appendMovimiento(input: AppendInput): Promise<AppendResult> {
  const sheets = ensureConfigured();
  if (!MONEDAS.includes(input.moneda)) {
    throw new CajaError(400, 'Moneda inválida');
  }
  if (!CATEGORIAS.includes(input.categoria)) {
    throw new CajaError(400, 'Categoría inválida');
  }
  if (!input.descripcion.trim()) {
    throw new CajaError(400, 'Descripción vacía');
  }
  const fechaSheet = fechaToSheet(input.iso);
  if (!fechaSheet) {
    throw new CajaError(400, 'Fecha inválida (esperado YYYY-MM-DD)');
  }
  const isoMes = input.iso.slice(0, 7);
  const tab = await findTabByISO(sheets, isoMes);
  if (!tab) {
    const target = mesTabFromISO(input.iso) || isoMes;
    throw new CajaError(
      404,
      `La pestaña "${target}" no existe en el Sheet. Pedile a Martín que la cree antes de cargar este movimiento.`,
    );
  }

  // Buscar primera fila libre: leemos col C (DESCRIPCION) y D (#) con
  // FORMULA para distinguir vacío real vs fórmula que evalúa a "".
  const inspect = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${tab.title}'!C${FIRST_DATA_ROW}:D${MAX_ROW}`,
    valueRenderOption: 'FORMULA',
  });
  const cdRows = inspect.data.values || [];

  // Primera fila libre = primera donde C es realmente vacío (no fórmula,
  // no texto). Como C nunca tiene fórmula, simplemente buscamos "" o null.
  let targetIdx = -1;
  for (let i = 0; i < cdRows.length; i++) {
    const cVal = cdRows[i]?.[0];
    if (cVal === undefined || cVal === null || String(cVal).trim() === '') {
      targetIdx = i;
      break;
    }
  }
  if (targetIdx === -1) {
    // No hay fila vacía en el rango pre-llenado — appendeamos al final.
    targetIdx = cdRows.length;
  }
  const filaDestino = FIRST_DATA_ROW + targetIdx;

  // Detectar si D ya tiene fórmula. Si la celda inspeccionada es
  // string que arranca con "=" → tiene fórmula. Vacío o número → no.
  const dValRaw = cdRows[targetIdx]?.[1];
  const tieneFormulaD =
    typeof dValRaw === 'string' && dValRaw.startsWith('=');

  // Escribimos en un único batchUpdate: A B C (run continuo) + E F.
  // Si falta fórmula en D y G, agregarlas al mismo batch.
  const dataUpdates: sheets_v4.Schema$ValueRange[] = [
    {
      range: `'${tab.title}'!A${filaDestino}:C${filaDestino}`,
      values: [[fechaSheet, input.moneda, input.descripcion.trim()]],
    },
    {
      range: `'${tab.title}'!E${filaDestino}:F${filaDestino}`,
      values: [[input.categoria, input.importeSigned]],
    },
  ];

  if (!tieneFormulaD) {
    const formulaD = `=SI(C${filaDestino}<>"";FILA()-2;"")`;
    const formulaG = `=SI(C${filaDestino}="";"";SUMAR.SI.CONJUNTO($F$3:F${filaDestino};$B$3:B${filaDestino};B${filaDestino}))`;
    dataUpdates.push({
      range: `'${tab.title}'!D${filaDestino}`,
      values: [[formulaD]],
    });
    dataUpdates.push({
      range: `'${tab.title}'!G${filaDestino}`,
      values: [[formulaG]],
    });
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED', // permite que las fórmulas y las fechas se interpreten correctamente
      data: dataUpdates,
    },
  });

  return { tab: tab.title, fila: filaDestino };
}

// ─── Sesiones de Control ────────────────────────────────────────
//
// Una sesión de Iara → escribe N filas al Sheet (una por mov declarado +
// opcionalmente una fila de ajuste de cierre si el saldo confirmado no
// coincide con el sugerido por (registrado + Σ retiros − Σ gastos)).
//
// Todas las filas comparten el mismo prefijo en DESCRIPCION
// ("SESION DD/MM/YYYY - LOCAL"), que es la "clave" de la sesión.
// listSesiones agrupa por prefijo. deleteSesion borra por prefijo.

export interface WriteSesionResult {
  prefijo: string;
  filasEscritas: { tab: string; fila: number }[];
  diferenciaCierreArs: number;
  diferenciaCierreUsd: number;
}

export async function writeSesion(input: SesionInput): Promise<WriteSesionResult> {
  const sheets = ensureConfigured();
  if (!input.local) throw new CajaError(400, 'Falta local');
  if (!input.fechaControl.match(/^\d{4}-\d{2}-\d{2}$/)) {
    throw new CajaError(400, 'fechaControl inválida (YYYY-MM-DD)');
  }
  if (!input.fechaAuditada.match(/^\d{4}-\d{2}-\d{2}$/)) {
    throw new CajaError(400, 'fechaAuditada inválida (YYYY-MM-DD)');
  }
  if (!input.turnoCompleto && !(input.turnoLabel || '').trim()) {
    throw new CajaError(
      400,
      'Si el turno no es completo, hay que indicar el turno (ej "T AM" o "T PM").',
    );
  }
  const turnoTxt = input.turnoCompleto
    ? 'T COMPLETO'
    : input.turnoLabel.trim();
  const prefijo = prefijoSesion(
    input.fechaControl,
    input.local,
    input.fechaAuditada,
    turnoTxt,
  );

  // Suma ARS/USD de los movs declarados (con signo según tipo)
  const sumaArs = input.movs.reduce(
    (s, m) => s + importeSignedSesion(m, Math.abs(m.montoArs)),
    0,
  );
  const sumaUsd = input.movs.reduce(
    (s, m) => s + importeSignedSesion(m, Math.abs(m.montoUsd)),
    0,
  );
  // Saldo sugerido = lo que había + lo que la sesión agrega
  const sugeridoArs = input.saldoRegistradoArs + sumaArs;
  const sugeridoUsd = input.saldoRegistradoUsd + sumaUsd;
  // Diferencia entre lo confirmado y lo sugerido (queda como ajuste)
  const diferenciaArs = (input.saldoConfirmadoArs ?? sugeridoArs) - sugeridoArs;
  const diferenciaUsd = (input.saldoConfirmadoUsd ?? sugeridoUsd) - sugeridoUsd;

  interface MovRow {
    fecha: string;
    moneda: Moneda;
    descripcion: string;
    categoria: Categoria;
    importe: number;
  }
  const rowsToWrite: MovRow[] = [];

  for (const mov of input.movs) {
    // Para que TODAS las filas de la sesión entren al mismo tab mensual
    // (el del control, no el de cada mov), forzamos fecha de mov =
    // fechaControl. La FECHA AUDITADA queda solo en la descripción.
    const desc = descripcionSesionMov(
      {
        fechaControl: input.fechaControl,
        fechaAuditada: input.fechaAuditada,
        local: input.local,
        turnoCompleto: input.turnoCompleto,
        turnoLabel: input.turnoLabel,
      },
      mov,
    );
    const cat = categoriaSheetParaSesion(mov.tipo, mov.categoriaFina);
    if (Math.abs(mov.montoArs) > 0) {
      rowsToWrite.push({
        fecha: input.fechaControl,
        moneda: 'PESO',
        descripcion: desc,
        categoria: cat,
        importe: importeSignedSesion(mov, Math.abs(mov.montoArs)),
      });
    }
    if (Math.abs(mov.montoUsd) > 0) {
      rowsToWrite.push({
        fecha: input.fechaControl,
        moneda: 'DOLAR',
        descripcion: desc,
        categoria: cat,
        importe: importeSignedSesion(mov, Math.abs(mov.montoUsd)),
      });
    }
  }

  // Fila de ajuste de cierre si hay diferencia
  const cierreNota = input.notas ? ` · ${input.notas.slice(0, 80)}` : '';
  if (Math.round(diferenciaArs) !== 0) {
    rowsToWrite.push({
      fecha: input.fechaControl,
      moneda: 'PESO',
      descripcion: `${prefijo} · cierre · ajuste físico${cierreNota}`,
      categoria: 'DIFERENCIA',
      importe: diferenciaArs,
    });
  }
  if (Math.round(diferenciaUsd) !== 0) {
    rowsToWrite.push({
      fecha: input.fechaControl,
      moneda: 'DOLAR',
      descripcion: `${prefijo} · cierre · ajuste físico${cierreNota}`,
      categoria: 'DIFERENCIA',
      importe: diferenciaUsd,
    });
  }

  // Si no hay nada que escribir (sesión vacía sin diff), error claro.
  if (rowsToWrite.length === 0) {
    throw new CajaError(400, 'La sesión no tiene movimientos ni diferencia.');
  }

  // Agrupar por tab destino (mes de la fecha de cada row).
  const rowsByTab = new Map<string, MovRow[]>();
  for (const r of rowsToWrite) {
    const isoMes = r.fecha.slice(0, 7);
    const tab = await findTabByISO(sheets, isoMes);
    if (!tab) {
      const target = mesTabFromISO(`${isoMes}-01`) || isoMes;
      throw new CajaError(
        404,
        `La pestaña "${target}" no existe en el Sheet. Pedile a Martín que la cree.`,
      );
    }
    const arr = rowsByTab.get(tab.title) || [];
    arr.push(r);
    rowsByTab.set(tab.title, arr);
  }

  const filasEscritas: { tab: string; fila: number }[] = [];

  // Escribir tab por tab (una sola batchUpdate por tab).
  for (const [tabTitle, rows] of rowsByTab.entries()) {
    const inspect = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tabTitle}'!C${FIRST_DATA_ROW}:D${MAX_ROW}`,
      valueRenderOption: 'FORMULA',
    });
    const cdRows = inspect.data.values || [];
    // Primera fila libre
    let cursorIdx = -1;
    for (let i = 0; i < cdRows.length; i++) {
      const cVal = cdRows[i]?.[0];
      if (cVal === undefined || cVal === null || String(cVal).trim() === '') {
        cursorIdx = i;
        break;
      }
    }
    if (cursorIdx === -1) cursorIdx = cdRows.length;

    const data: sheets_v4.Schema$ValueRange[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const filaDestino = FIRST_DATA_ROW + cursorIdx + i;
      const fechaSheet = fechaToSheet(r.fecha) || r.fecha;
      data.push({
        range: `'${tabTitle}'!A${filaDestino}:C${filaDestino}`,
        values: [[fechaSheet, r.moneda, r.descripcion]],
      });
      data.push({
        range: `'${tabTitle}'!E${filaDestino}:F${filaDestino}`,
        values: [[r.categoria, r.importe]],
      });
      const dValRaw = cdRows[cursorIdx + i]?.[1];
      const tieneFormulaD = typeof dValRaw === 'string' && dValRaw.startsWith('=');
      if (!tieneFormulaD) {
        const formulaD = `=SI(C${filaDestino}<>"";FILA()-2;"")`;
        const formulaG = `=SI(C${filaDestino}="";"";SUMAR.SI.CONJUNTO($F$3:F${filaDestino};$B$3:B${filaDestino};B${filaDestino}))`;
        data.push({ range: `'${tabTitle}'!D${filaDestino}`, values: [[formulaD]] });
        data.push({ range: `'${tabTitle}'!G${filaDestino}`, values: [[formulaG]] });
      }
      filasEscritas.push({ tab: tabTitle, fila: filaDestino });
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data },
    });
  }

  return {
    prefijo,
    filasEscritas,
    diferenciaCierreArs: diferenciaArs,
    diferenciaCierreUsd: diferenciaUsd,
  };
}

export interface SesionResumen {
  prefijo: string;            // "SESION DD/MM/YYYY - LH5"
  fechaSesion: string;        // DD/MM/YYYY
  iso: string;                // YYYY-MM-DD para sort/cálculo
  local: string;              // "LH5"
  retiradoArs: number;        // suma positiva
  gastadoArs: number;         // suma positiva (valor absoluto)
  diferenciaArs: number;      // signed (puede ser ±)
  retiradoUsd: number;
  gastadoUsd: number;
  diferenciaUsd: number;
  totalRows: number;
  filas: { tab: string; fila: number }[];
}

export async function listSesiones(maxMonthsBack = 6): Promise<SesionResumen[]> {
  const sheets = ensureConfigured();
  const tabs = await listMeses();
  const tabsRecent = tabs.slice(0, maxMonthsBack);
  if (tabsRecent.length === 0) return [];

  const ranges = tabsRecent.map(
    (t) => `'${t.title}'!A${FIRST_DATA_ROW}:G${MAX_ROW}`,
  );
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    ranges,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const map = new Map<string, SesionResumen>();
  res.data.valueRanges?.forEach((block, blockIdx) => {
    const tab = tabsRecent[blockIdx].title;
    const rows = block.values || [];
    rows.forEach((row, i) => {
      const fila = FIRST_DATA_ROW + i;
      const monedaRaw = String(row[1] || '').trim().toUpperCase();
      const desc = String(row[2] || '');
      const catRaw = String(row[4] || '').trim().toUpperCase();
      const impRaw = row[5];
      if (!esRowDeSesion(desc)) return;
      const parsed = parsePrefijoSesion(desc);
      if (!parsed) return;

      const importe =
        typeof impRaw === 'number'
          ? impRaw
          : parseFloat(String(impRaw || '0').replace(',', '.'));
      const isUsd = monedaRaw === 'DOLAR' || monedaRaw === 'USD';

      let resumen = map.get(parsed.prefijo);
      if (!resumen) {
        const dm = parsed.fechaControl.split('/');
        const iso =
          dm.length === 3
            ? `${dm[2]}-${dm[1].padStart(2, '0')}-${dm[0].padStart(2, '0')}`
            : '';
        resumen = {
          prefijo: parsed.prefijo,
          fechaSesion: parsed.fechaControl,
          iso,
          local: parsed.local,
          retiradoArs: 0,
          gastadoArs: 0,
          diferenciaArs: 0,
          retiradoUsd: 0,
          gastadoUsd: 0,
          diferenciaUsd: 0,
          totalRows: 0,
          filas: [],
        };
        map.set(parsed.prefijo, resumen);
      }
      resumen.totalRows++;
      resumen.filas.push({ tab, fila });

      // Clasificar el mov:
      //   - categoria DIFERENCIA → ajuste de cierre
      //   - importe > 0          → retiro (suma a caja grande)
      //   - importe < 0          → gasto (sale de caja grande)
      //   - categoria "CA" (legacy) → retiro, por compat con sesiones
      //     viejas escritas antes del fix de mayo 2026.
      if (catRaw === 'DIFERENCIA') {
        if (isUsd) resumen.diferenciaUsd += importe;
        else resumen.diferenciaArs += importe;
      } else if (catRaw === 'CA' || importe > 0) {
        if (isUsd) resumen.retiradoUsd += Math.abs(importe);
        else resumen.retiradoArs += Math.abs(importe);
      } else {
        if (isUsd) resumen.gastadoUsd += Math.abs(importe);
        else resumen.gastadoArs += Math.abs(importe);
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => b.iso.localeCompare(a.iso));
}

export async function deleteSesionByPrefix(prefijo: string): Promise<{
  borradas: number;
}> {
  if (!prefijo.trim().startsWith('SESION ')) {
    throw new CajaError(400, 'Prefijo inválido');
  }
  const sheets = ensureConfigured();
  const tabs = await listMeses();
  let borradas = 0;
  for (const t of tabs) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${t.title}'!A${FIRST_DATA_ROW}:G${MAX_ROW}`,
    });
    const rows = res.data.values || [];
    const toClear: number[] = [];
    rows.forEach((row, i) => {
      const desc = String(row[2] || '').trim();
      if (desc.startsWith(prefijo)) toClear.push(FIRST_DATA_ROW + i);
    });
    if (toClear.length === 0) continue;

    const data: sheets_v4.Schema$ValueRange[] = [];
    for (const fila of toClear) {
      data.push({ range: `'${t.title}'!A${fila}:C${fila}`, values: [['', '', '']] });
      data.push({ range: `'${t.title}'!E${fila}:F${fila}`, values: [['', '']] });
    }
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data },
    });
    borradas += toClear.length;
  }
  return { borradas };
}

// ─── Borrar movimiento ──────────────────────────────────────────

/** Borra la fila exacta del tab dado. Limpia solo A, B, C, E, F (no
 *  toca D y G porque tienen fórmulas que dependen del rango). El
 *  resultado: la fila queda visualmente vacía con sus fórmulas
 *  recalculando saldos automáticamente.
 *
 *  No usamos deleteDimension porque correría las filas siguientes y
 *  rompería el patrón pre-llenado del Sheet (formato, dropdowns,
 *  fórmulas en filas siguientes). Borrar contenido es más seguro. */
export async function clearMovimiento(
  tab: string,
  fila: number,
): Promise<void> {
  if (fila < FIRST_DATA_ROW) {
    throw new CajaError(400, `Fila ${fila} fuera de rango`);
  }
  const sheets = ensureConfigured();
  // Verificar que el tab existe
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets.properties.title',
  });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === tab);
  if (!exists) {
    throw new CajaError(404, `La pestaña "${tab}" no existe.`);
  }
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: `'${tab}'!A${fila}:C${fila}`,
          values: [['', '', '']],
        },
        {
          range: `'${tab}'!E${fila}:F${fila}`,
          values: [['', '']],
        },
      ],
    },
  });
}
