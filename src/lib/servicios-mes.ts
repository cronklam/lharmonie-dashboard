// Parser del Sheet pivot mensual de Servicios.
//
// Cada tab es un mes — formato "MAYO 26", "ABRIL 26", etc. Estructura:
//   Row 1: título "LOCAL" mergeado en B:I
//   Row 2: headers — A="SERVICIOS A PAGAR" | B..I=locales | J=BAIGUN | K=notas
//   Rows 3+: datos — A=servicio name, B..I=monto por local, J=saldo
//                    cta cte Baigun, K=notas sueltas
//
// Valores de celda:
//   - número (ej "$284.598,00")  → cargado / pagado
//   - "NO"                        → el local no tiene ese servicio
//   - "TODAVIA NO"                → pendiente este mes
//   - vacío                       → falta cargar
//
// Filas especiales: TOTAL, SUBTOTAL — se marcan con esTotal=true para
// que la UI las renderice en otro estilo (o las oculte).

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
  tab: string;       // como viene del Sheet (ej "MAYO 26")
  year: number;      // 2026
  month: number;     // 5
  periodo: string;   // "2026-05"
  label: string;     // "Mayo 2026"
}

/** Parsea un nombre de tab tipo "MAYO 26" o "MAYO 2026". Devuelve null
 *  si no matchea. Tolerante a espacios y a años de 2 o 4 dígitos. */
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

/** YYYY-MM → "MAYO 26". */
export function periodoToTab(year: number, month: number): string {
  return `${MESES_ARRAY[month - 1]} ${String(year).slice(-2)}`;
}

export function periodoToLabel(year: number, month: number): string {
  return `${MESES_LABEL[month - 1]} ${year}`;
}

// ─── Cell classification ──────────────────────────────────────────

export type CellEstado = 'pagado' | 'pendiente' | 'no_aplica' | 'vacio';

export interface CeldaServicio {
  raw: string;            // texto crudo de la celda
  monto: number;          // 0 si no es número
  estado: CellEstado;
}

export interface ServicioMesRow {
  servicio: string;
  fila: number;                            // fila 1-indexed en el Sheet
  porLocal: Record<string, CeldaServicio>; // local name → celda
  baigun: string;                          // raw value de col BAIGUN (puede ser saldo $ o vacío)
  baigunMonto: number;                     // parseado
  notas: string;                           // raw value de la primera col después de BAIGUN
  esTotal: boolean;                        // true para filas TOTAL/SUBTOTAL
}

export interface ServicioMes {
  periodo: string;                         // YYYY-MM
  tab: string;                             // nombre del tab leído
  label: string;                           // "Mayo 2026"
  locales: string[];                       // headers de columnas locales (en orden)
  rows: ServicioMesRow[];
  totalPorLocal: Record<string, number>;   // suma de pagado por local
  totalGeneral: number;                    // suma de todo lo pagado
  conteoPendientes: number;                // cantidad de celdas en estado pendiente
  conteoPagados: number;                   // cantidad de celdas pagadas
}

const FILAS_TOTAL = new Set([
  'TOTAL',
  'TOTAL GENERAL',
  'SUBTOTAL',
  'TOTAL A PAGAR',
  'TOTALES',
]);

/** Parsea un monto en formato AR. Tolera "$284.598,00", "$284,598.00",
 *  "284598", "284.598", "284,598.00", "-$60.385,50" (saldos negativos),
 *  USD strings ("7430 USD") — devuelve solo la parte numérica. */
export function parseMontoARS(s: string): number {
  if (!s) return 0;
  const t = String(s).trim();
  if (!t) return 0;
  const neg = t.startsWith('-') || /^\(\s*\$/.test(t);
  // Quita $, USD, paréntesis y espacios
  let cleaned = t.replace(/USD|\$|\(|\)/gi, '').trim();
  // Heurística: si hay tanto "." como "," entonces el ÚLTIMO separador
  // es decimal. Si solo hay coma, asumimos decimal. Si solo punto y
  // está en posición de miles (3 dígitos al final), removerlo.
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
  if (t.includes('TODAVIA NO') || t === 'PENDIENTE') return 'pendiente';
  // Si tiene $ o dígitos → cargado/pagado
  if (t.includes('$') || /\d/.test(t)) return 'pagado';
  return 'vacio';
}

/** Parsea las filas crudas del Sheet en una estructura usable. */
export function parseMesPivot(
  rows: string[][],
  periodo: string,
  tab: string,
  label: string,
): ServicioMes {
  // Encontrar fila de headers — A == "SERVICIOS A PAGAR" o algo que arranque con "SERVICIOS"
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
      locales: [], rows: [],
      totalPorLocal: {}, totalGeneral: 0,
      conteoPendientes: 0, conteoPagados: 0,
    };
  }

  const headers = (rows[headerRow] || []).map((h) => (h || '').trim());

  // Encontrar columna BAIGUN (suele ser la J=idx 9, pero buscamos por nombre)
  const baigunIdx = headers.findIndex((h) => h.toUpperCase() === 'BAIGUN');
  const lastLocalIdx = baigunIdx > 0 ? baigunIdx : headers.length;

  const locales: string[] = [];
  for (let c = 1; c < lastLocalIdx; c++) {
    const h = headers[c];
    if (h) locales.push(h);
  }

  const dataRows: ServicioMesRow[] = [];
  const totalPorLocal: Record<string, number> = {};
  for (const local of locales) totalPorLocal[local] = 0;

  let conteoPendientes = 0;
  let conteoPagados = 0;

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const servicio = (row[0] || '').trim();
    if (!servicio) continue;

    const esTotal = FILAS_TOTAL.has(servicio.toUpperCase()) ||
      /^TOTAL\b/i.test(servicio);

    const porLocal: Record<string, CeldaServicio> = {};
    for (let c = 1; c < lastLocalIdx; c++) {
      const local = headers[c];
      if (!local) continue;
      const raw = (row[c] || '').trim();
      const estado = clasificar(raw);
      const monto = parseMontoARS(raw);
      porLocal[local] = { raw, monto, estado };

      if (!esTotal) {
        if (estado === 'pagado') {
          totalPorLocal[local] = (totalPorLocal[local] || 0) + monto;
          conteoPagados++;
        } else if (estado === 'pendiente') {
          conteoPendientes++;
        }
      }
    }

    const baigunRaw = baigunIdx >= 0 ? (row[baigunIdx] || '').trim() : '';
    const notasIdx = baigunIdx >= 0 ? baigunIdx + 1 : headers.length;
    const notas = row[notasIdx] ? String(row[notasIdx]).trim() : '';

    dataRows.push({
      servicio,
      fila: i + 1,
      porLocal,
      baigun: baigunRaw,
      baigunMonto: parseMontoARS(baigunRaw),
      notas,
      esTotal,
    });
  }

  const totalGeneral = Object.values(totalPorLocal).reduce((s, v) => s + v, 0);

  return {
    periodo, tab, label,
    locales,
    rows: dataRows,
    totalPorLocal,
    totalGeneral,
    conteoPendientes,
    conteoPagados,
  };
}
