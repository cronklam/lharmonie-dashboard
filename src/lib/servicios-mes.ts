// Parser del Sheet pivot mensual de Servicios.
//
// Cada tab es un mes — formato "MAYO 26", "ABRIL 26", etc. Estructura:
//   Row 1: título "LOCAL" mergeado en B:I
//   Row 2: headers — A="SERVICIOS A PAGAR" | B..I=locales | J=BAIGUN | K=notas
//   Rows 3+: datos
//
// Locales (col en Sheet → ancla):
//   B SEGUI            → LH1
//   C MAURE            → LH3  (Casa Lharmonie)
//   D NICARAGUA        → LH2
//   E ZABALA           → LH4
//   F LIBERTADOR       → LH5
//   G NUÑEZ            → LH6
//   H CASA MEL Y MARTIN → MyP (gasto personal Martín y Melanie)
//   I BAMBINA          → CRONKLAM (proyecto adicional, gastos corp)
//   J BAIGUN           → cta cte subarriendo (no es local)
//   K (notas)          → notas sueltas
//
// Valores de celda:
//   - número con $ → cargado / pagado
//   - "NO"          → el local no tiene ese servicio
//   - "TODAVIA NO"  → pendiente este mes
//   - vacío         → falta cargar
//   - texto libre   → revisar (ej "USD 800", "$ COMEDOR")

import type { Ancla } from './anclas';

const MESES_MAP: Record<string, number> = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
};

const MESES_ARRAY = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];

const MESES_LABEL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export interface ParsedPeriodo {
  tab: string;
  year: number;
  month: number;
  periodo: string;
  label: string;
}

export function parsePeriodoTab(title: string): ParsedPeriodo | null {
  const m = title.trim().toUpperCase().match(/^([A-ZÁÉÍÓÚÑ]+)\s+(\d{2,4})$/);
  if (!m) return null;
  const mes = MESES_MAP[m[1]];
  if (!mes) return null;
  let year = parseInt(m[2], 10);
  if (year < 100) year += 2000;
  return {
    tab: title,
    year,
    month: mes,
    periodo: `${year}-${String(mes).padStart(2, '0')}`,
    label: `${MESES_LABEL[mes - 1]} ${year}`,
  };
}

export function periodoToTab(year: number, month: number): string {
  return `${MESES_ARRAY[month - 1]} ${String(year).slice(-2)}`;
}

export function periodoToLabel(year: number, month: number): string {
  return `${MESES_LABEL[month - 1]} ${year}`;
}

// ─── Local → Ancla mapping ────────────────────────────────────────
// Heredado del staff (mapeo confirmado en mayo 2026).

export const LOCAL_TO_ANCLA: Record<string, Ancla | 'BAIGUN' | 'NOTAS'> = {
  'SEGUI': 'LH1',
  'NICARAGUA': 'LH2',
  'MAURE': 'LH3',
  'ZABALA': 'LH4',
  'LIBERTADOR': 'LH5',
  'NUÑEZ': 'LH6',
  'NUNEZ': 'LH6',
  'CASA MEL Y MARTIN': 'MyP',
  'CASA MEL Y MARTÍN': 'MyP',
  'BAMBINA': 'CRONKLAM',
  'BAIGUN': 'BAIGUN',
};

// Reverse: ancla → nombre de columna canónico en el Sheet
// (lo que recibe la API /api/servicios/celda como localCol)
export const ANCLA_TO_LOCAL_COL: Record<Ancla, string> = {
  LH1: 'SEGUI',
  LH2: 'NICARAGUA',
  LH3: 'MAURE',
  LH4: 'ZABALA',
  LH5: 'LIBERTADOR',
  LH6: 'NUÑEZ',
  CRONKLAM: 'BAMBINA',
  MyP: 'CASA MEL Y MARTIN',
};

// Display name corto por ancla (la cabecera de la tabla)
export const ANCLA_SHORT_LABEL: Record<Ancla, string> = {
  LH1: 'Segui',
  LH2: 'Nicaragua',
  LH3: 'Maure',
  LH4: 'Zabala',
  LH5: 'Libertador',
  LH6: 'Nuñez',
  CRONKLAM: 'Cronklam',
  MyP: 'MyM',
};

// Orden visual fijo para columnas operativas
export const ANCLAS_OPERATIVAS: Ancla[] = ['LH1', 'LH2', 'LH3', 'LH4', 'LH5', 'LH6'];

// ─── Canonicalización de nombre de servicio ───────────────────────
// Ported del staff (ServiciosTablaMensual.tsx). Convierte el nombre
// raw del Sheet en una versión normalizada para display + agrupación.

const KEEP_UPPER = new Set(['iva', 'usd', 'ars', 'afip', 'cuit', 'cbu', 'abl', 'iibb']);
const SHORT_LOWER = new Set([
  'de', 'del', 'la', 'las', 'el', 'los',
  'y', 'o', 'u', 'e', 'en', 'para', 'por', 'a', 'al',
]);

function titleCaseSafe(s: string): string {
  if (!s) return s;
  const cleaned = s.replace(/\s+/g, ' ').trim();
  if (!cleaned) return cleaned;
  return cleaned
    .split(/(\s+|\/|-)/g)
    .map((tok, i) => {
      if (/^\s+$/.test(tok) || tok === '/' || tok === '-') return tok;
      const lower = tok.toLowerCase();
      if (KEEP_UPPER.has(lower)) return lower.toUpperCase();
      if (i > 0 && SHORT_LOWER.has(lower)) return lower;
      if (lower.startsWith('(')) {
        const rest = lower.slice(1);
        return '(' + rest.charAt(0).toUpperCase() + rest.slice(1);
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

const REMAP_EXACTO: Record<string, string> = {
  'flow': 'Flow 1',
  'flow wifi': 'Flow 1',
  'flow 1': 'Flow 1',
  'flow 2': 'Telecom/Flow',
  'telecom flow': 'Telecom/Flow',
  'telecom/flow': 'Telecom/Flow',
  'telecom/flow wifi': 'Telecom/Flow',
  'alquileres': 'Alquiler',
  'alquileres en transferencias': 'Alquiler (Transf)',
  'aporte sindical uthgra': 'Uthgra',
  'iibb ingresos brutos caba': 'IIBB',
  'iva alquiler': 'Alquiler (Transf)',
  'iva mensual afip': 'IVA AFIP',
  'monotributo martín': 'Monotributo',
  'monotributo martin': 'Monotributo',
  'vep cs 09 de cada mes': 'VEP CS',
  'vep iva 18 de cada mes': 'VEP IVA',
  'yeshurun meir': 'Yeshurun (Meir + Comedor)',
};

export function nombreCanonico(raw: string): string {
  let n = (raw || '').trim();
  if (!n) return '';

  // Strip suffixes con sigla local
  n = n.replace(/\s+(LH\d|MyP|MyM|CRONKLAM)\s*$/i, '').trim();
  n = n.replace(/\s*-\s*(LH\d|MyP|MyM|CRONKLAM)\s*$/i, '').trim();

  // Strip nombre humano del local al final
  const NOMBRES_LOCALES = [
    'segui', 'maure', 'nicaragua', 'zabala', 'libertador',
    'nuñez', 'nunez', 'bambina',
    'casa mel y martin', 'casa mel y martín', 'casa mym',
  ];
  for (const ln of NOMBRES_LOCALES) {
    const re = new RegExp(`\\s+${ln}\\s*$`, 'i');
    n = n.replace(re, '').trim();
    const reDash = new RegExp(`\\s*-\\s*${ln}\\s*$`, 'i');
    n = n.replace(reDash, '').trim();
  }

  // Strip "(B)" suffix (no aporta)
  n = n.replace(/\s*\(\s*B\s*\)\s*$/i, '').trim();

  // Normalizar "Transferencia"/"Transferencias" → "(Transf)" si va al final
  n = n.replace(/\s+transferencias?\s*$/i, ' (Transf)').trim();

  const lower = n.toLowerCase();
  const remapped = REMAP_EXACTO[lower];
  if (remapped) return remapped;

  // Pattern: "alquiler" + "transf"/"iva" → "Alquiler (Transf)"
  const tieneAlquiler = /\balquiler/i.test(lower);
  const tieneTransf = /\btransf|transferencia/i.test(lower);
  const tieneIva = /\biva\b/i.test(lower);
  if (tieneAlquiler && (tieneTransf || tieneIva)) {
    return 'Alquiler (Transf)';
  }

  return titleCaseSafe(n);
}

// ─── Cell classification ──────────────────────────────────────────

export type CellEstado = 'pagado' | 'pendiente' | 'no_aplica' | 'vacio';

export interface CeldaServicio {
  raw: string;
  monto: number;
  esUsd: boolean;     // true si el monto es en USD (ej "1400 USD" o "USD 800")
  estado: CellEstado;
}

export interface ServicioMesRow {
  servicio: string;        // canonical name (display)
  servicioRaw: string;     // texto original del Sheet
  fila: number;
  porAncla: Record<string, CeldaServicio>; // ancla code → celda (LH1...LH6, CRONKLAM, MyP)
  baigun: string;
  baigunMonto: number;
  notas: string;
  esTotal: boolean;
  // Clasificación: dónde renderear esta fila
  grupo: 'locales' | 'cronklam' | 'myp';
}

export interface ServicioMes {
  periodo: string;
  tab: string;
  label: string;
  anclasOperativas: Ancla[];          // LH1..LH6 que aparecen con data
  filasLocales: ServicioMesRow[];     // servicios con data en alguna LH
  filasCronklam: ServicioMesRow[];    // solo BAMBINA o totalmente sin local
  filasMyP: ServicioMesRow[];         // solo CASA MEL Y MARTIN
  totalPorAncla: Record<string, number>;
  totalGeneral: number;
  conteoPendientes: number;
  conteoPagados: number;
}

const FILAS_TOTAL = new Set([
  'TOTAL', 'TOTAL GENERAL', 'SUBTOTAL', 'TOTAL A PAGAR', 'TOTALES',
]);

export function parseMontoARS(s: string): number {
  if (!s) return 0;
  const t = String(s).trim();
  if (!t) return 0;
  const neg = t.startsWith('-') || /^\(\s*\$/.test(t);
  let cleaned = t.replace(/USD|US\$|\$|\(|\)/gi, '').trim();
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  if (hasDot && hasComma) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    cleaned = cleaned.replace(',', '.');
  }
  cleaned = cleaned.replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  if (isNaN(n)) return 0;
  return neg && n > 0 ? -n : n;
}

function clasificar(raw: string): CellEstado {
  const t = (raw || '').trim().toUpperCase();
  if (!t) return 'vacio';
  if (t === 'NO') return 'no_aplica';
  if (t.includes('TODAVIA NO') || t === 'PENDIENTE' || t === 'PAGAR') return 'pendiente';
  if (t.includes('$') || /\d/.test(t)) return 'pagado';
  return 'vacio';
}

function detectarUsd(raw: string): boolean {
  if (!raw) return false;
  return /USD|US\$/i.test(raw);
}

/** Parsea las filas crudas del Sheet en estructura agrupada. */
export function parseMesPivot(
  rows: string[][],
  periodo: string,
  tab: string,
  label: string,
): ServicioMes {
  // Encontrar fila de headers
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const a = (rows[i]?.[0] || '').trim().toUpperCase();
    if (a.includes('SERVICIOS A PAGAR') || a === 'SERVICIOS' || a.startsWith('SERVICIOS ')) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) {
    return {
      periodo, tab, label,
      anclasOperativas: [],
      filasLocales: [], filasCronklam: [], filasMyP: [],
      totalPorAncla: {}, totalGeneral: 0,
      conteoPendientes: 0, conteoPagados: 0,
    };
  }

  const headers = (rows[headerRow] || []).map((h) => (h || '').trim().toUpperCase());

  // Mapear cada col del Sheet → ancla (o BAIGUN/NOTAS)
  // Skipping col 0 (servicio name)
  const colToAncla: Record<number, Ancla | 'BAIGUN' | 'NOTAS'> = {};
  let notasIdx = -1;
  for (let c = 1; c < headers.length; c++) {
    const h = headers[c];
    if (!h) continue;
    const mapped = LOCAL_TO_ANCLA[h];
    if (mapped) {
      colToAncla[c] = mapped;
    } else {
      // Headers no mapeados (NOTAS, etc) → notas si están después de BAIGUN
      notasIdx = c;
    }
  }

  const filasLocales: ServicioMesRow[] = [];
  const filasCronklam: ServicioMesRow[] = [];
  const filasMyP: ServicioMesRow[] = [];

  const totalPorAncla: Record<string, number> = {};
  for (const a of ANCLAS_OPERATIVAS) totalPorAncla[a] = 0;

  let conteoPendientes = 0;
  let conteoPagados = 0;

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const servicioRaw = (row[0] || '').trim();
    if (!servicioRaw) continue;

    const esTotal = FILAS_TOTAL.has(servicioRaw.toUpperCase()) ||
      /^TOTAL\b/i.test(servicioRaw);

    const porAncla: Record<string, CeldaServicio> = {};
    let tieneLH = false;
    let tieneMyP = false;
    let tieneCronklam = false;

    for (let c = 1; c < headers.length; c++) {
      const ancla = colToAncla[c];
      if (!ancla || ancla === 'BAIGUN') continue;
      const raw = (row[c] || '').trim();
      const estado = clasificar(raw);
      const monto = parseMontoARS(raw);
      const esUsd = detectarUsd(raw);
      porAncla[ancla] = { raw, monto, esUsd, estado };

      if (!esTotal) {
        const tieneData = estado === 'pagado' || estado === 'pendiente';
        if (tieneData) {
          if (ancla === 'MyP') tieneMyP = true;
          else if (ancla === 'CRONKLAM') tieneCronklam = true;
          else tieneLH = true;
        }
        if (estado === 'pagado' && ANCLAS_OPERATIVAS.includes(ancla as Ancla)) {
          totalPorAncla[ancla] = (totalPorAncla[ancla] || 0) + (esUsd ? 0 : monto);
          conteoPagados++;
        } else if (estado === 'pendiente') {
          conteoPendientes++;
        }
      }
    }

    // Notas
    const notas = notasIdx > 0 && row[notasIdx]
      ? String(row[notasIdx]).trim()
      : '';

    // BAIGUN (saldo cta cte)
    const baigunCol = Object.entries(colToAncla)
      .find(([, a]) => a === 'BAIGUN')?.[0];
    const baigunRaw = baigunCol !== undefined ? (row[parseInt(baigunCol, 10)] || '').trim() : '';

    // Aplicar canonicalización
    const servicio = nombreCanonico(servicioRaw);

    // Decidir grupo
    let grupo: 'locales' | 'cronklam' | 'myp';
    if (tieneLH) grupo = 'locales';
    else if (tieneMyP && !tieneCronklam) grupo = 'myp';
    else grupo = 'cronklam'; // CRONKLAM o sin data en ningún lado

    const fila: ServicioMesRow = {
      servicio,
      servicioRaw,
      fila: i + 1,
      porAncla,
      baigun: baigunRaw,
      baigunMonto: parseMontoARS(baigunRaw),
      notas,
      esTotal,
      grupo,
    };

    if (esTotal) continue; // omitimos TOTAL rows del listado

    if (grupo === 'locales') filasLocales.push(fila);
    else if (grupo === 'myp') filasMyP.push(fila);
    else filasCronklam.push(fila);
  }

  const totalGeneral = Object.values(totalPorAncla).reduce((s, v) => s + v, 0);

  return {
    periodo, tab, label,
    anclasOperativas: ANCLAS_OPERATIVAS,
    filasLocales, filasCronklam, filasMyP,
    totalPorAncla, totalGeneral,
    conteoPendientes, conteoPagados,
  };
}
