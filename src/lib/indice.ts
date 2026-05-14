// Catálogo canónico de servicios — tab "ÍNDICE" del Sheet de SERVICIOS.
//
// Schema flat (1 fila por (servicio × ancla) único). Cada fila guarda
// toda la info que el management necesita para ese servicio en ese
// local: tipo, día de venc, método de pago, monto estimado en ARS y
// USD, titular que factura, CUIT, número de cuenta cliente, CBU/alias,
// si va al subarriendo Baigun y en qué %.
//
// Es la fuente única de verdad para:
//   - QUÉ servicios existen
//   - su tipo (categoría operativa: luz, agua, alquiler, etc)
//   - a qué ancla pertenecen (local físico / corporativo / personal)
//   - cuándo vencen (día del mes) y con qué frecuencia
//   - método de pago (efectivo/transfer/débito automático/tarjeta)
//   - monto estimado/sugerido para nuevos meses (ARS y USD por separado)
//   - moneda primaria (ARS o USD)
//   - titular que factura + CUIT
//   - número de cuenta cliente del servicio (ej. # cliente Edenor)
//   - datos para transferir (CBU/CVU/Alias)
//   - subarriendo Baigun: si va y en qué % (default 50% a cta cte)
//   - si está activo (si false → no se sugiere al crear mes nuevo)
//
// Los tabs mensuales (MAYO 26, ABRIL 26, etc) siguen siendo la fuente
// de pagos efectivos por mes. El ÍNDICE es metadata + plantilla.

import type { Ancla } from './anclas';
import { ANCLA_LABELS } from './anclas';

export const INDICE_TAB = 'LISTADO';

export const INDICE_HEADERS = [
  'Servicio',              // A
  'Tipo',                  // B
  'Ancla',                 // C
  'Local Display',         // D
  'Día Vencimiento',       // E
  'Frecuencia',            // F
  'Método Pago',           // G
  'Monto Estimado ARS',    // H
  'Monto Estimado USD',    // I
  'Moneda Default',        // J  (ARS / USD)
  'Titular Nombre',        // K
  'Titular CUIT',          // L
  'Cuenta Número',         // M
  'CBU/CVU/Alias',         // N
  'Subarrendado Baigun',   // O
  'Baigun %',              // P
  'Activo',                // Q
  'Notas',                 // R
] as const;

/** Columna final (1-indexed → letra) para el range A:R. */
export const INDICE_LAST_COL = 'R';
export const INDICE_NUM_COLS = INDICE_HEADERS.length; // 18

// Tipos = categoría operativa del servicio
export const INDICE_TIPOS = [
  'luz',
  'agua',
  'gas',
  'internet',
  'telefono',
  'alquiler',
  'iva',
  'expensas',
  'sistema',
  'impositivo',
  'otro',
] as const;
export type IndiceTipo = (typeof INDICE_TIPOS)[number];

export const INDICE_TIPO_LABELS: Record<IndiceTipo, string> = {
  luz: 'Luz',
  agua: 'Agua',
  gas: 'Gas',
  internet: 'Internet',
  telefono: 'Teléfono',
  alquiler: 'Alquiler',
  iva: 'IVA',
  expensas: 'Expensas',
  sistema: 'Sistema',
  impositivo: 'Impositivo',
  otro: 'Otro',
};

export const INDICE_METODO_PAGO = [
  'efectivo',
  'transferencia',
  'debito_automatico',
  'tarjeta',
] as const;
export type IndiceMetodoPago = (typeof INDICE_METODO_PAGO)[number];

export const INDICE_METODO_PAGO_LABELS: Record<IndiceMetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito_automatico: 'Débito automático',
  tarjeta: 'Tarjeta',
};

export const INDICE_FRECUENCIA = [
  'mensual',
  'bimestral',
  'trimestral',
  'anual',
  'unico',
] as const;
export type IndiceFrecuencia = (typeof INDICE_FRECUENCIA)[number];

export const INDICE_FRECUENCIA_LABELS: Record<IndiceFrecuencia, string> = {
  mensual: 'Mensual',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  anual: 'Anual',
  unico: 'Único',
};

export const INDICE_MONEDA = ['ARS', 'USD'] as const;
export type IndiceMoneda = (typeof INDICE_MONEDA)[number];

export interface IndiceServicio {
  /** Fila 1-indexed del Sheet (para PATCH/DELETE). */
  _row: number;
  servicio: string;
  tipo: IndiceTipo;
  ancla: Ancla;
  /** Texto humano del local (ej "Lharmonie Nicaragua (LH2)"). Auto
   *  derivado de ancla pero editable. */
  localDisplay: string;
  diaVencimiento: number | null;
  frecuencia: IndiceFrecuencia | '';
  metodoPago: IndiceMetodoPago | '';
  /** Monto estimado/sugerido en pesos. Null si el servicio se paga
   *  primariamente en USD (o si todavía no se cargó). */
  montoEstimadoArs: number | null;
  /** Monto estimado en USD (ej. alquileres en dólares). Null si
   *  no aplica. */
  montoEstimadoUsd: number | null;
  /** Moneda primaria del servicio. Indica cuál de los dos montos es
   *  el "canónico". Default 'ARS'. */
  monedaDefault: IndiceMoneda;
  /** Razón social / nombre del titular que factura. Ej "Lharmonie
   *  SRL", "Martín Masri", "L'harmonie Resources SAS". */
  titularNombre: string;
  /** CUIT/CUIL del titular. Solo dígitos, sin guiones. */
  titularCuit: string;
  /** Número de cuenta cliente del servicio (ej # cliente Edenor,
   *  # cuenta Aysa). */
  cuentaNumero: string;
  /** CBU/CVU/Alias para transferir o débito automático. */
  cbu: string;
  /** Si va al subarriendo Baigun (típicamente LH5). */
  subarrendadoBaigun: boolean;
  /** % que va al cta cte de Baigun (0-100). Default 50 si
   *  subarrendadoBaigun=true. Null si no aplica. */
  baigunPct: number | null;
  activo: boolean;
  notas: string;
}

// ─── Inferencias para el seed inicial ───────────────────────────────

/** Adivina el tipo del servicio a partir del nombre. */
export function inferirTipo(servicioRaw: string): IndiceTipo {
  const n = (servicioRaw || '').toUpperCase();
  if (
    n.includes('EDENOR') ||
    n.includes('EDESUR') ||
    n.match(/\bLUZ\b/)
  )
    return 'luz';
  if (n.includes('AYSA') || n.includes('AGUA')) return 'agua';
  if (n.includes('METROGAS') || n.match(/\bGAS\b/)) return 'gas';
  if (
    n.includes('TELECOM') ||
    n.includes('FLOW') ||
    n.includes('WIFI') ||
    n.includes('INTERNET')
  )
    return 'internet';
  if (n.match(/\bTEL\b/) || n.includes('TELEFONO')) return 'telefono';
  if (n.includes('ALQUILER')) return 'alquiler';
  if (n.match(/\bIVA\b/)) return 'iva';
  if (n.includes('EXPENSAS')) return 'expensas';
  if (n.includes('BISTROSOFT') || n.includes('SISTEMA')) return 'sistema';
  if (
    n.includes('ABL') ||
    n.includes('IIBB') ||
    n.includes('INGRESOS BRUTOS') ||
    n.includes('VEP') ||
    n.includes('AFIP') ||
    n.includes('MONOTRIBUTO') ||
    n.includes('UTHGRA') ||
    n.includes('SINDICAL')
  )
    return 'impositivo';
  return 'otro';
}

/** Default localDisplay a partir del ancla. */
export function localDisplayDefault(ancla: Ancla): string {
  return ANCLA_LABELS[ancla] || ancla;
}

/** Detecta si una (servicio, ancla) suele ir al subarriendo Baigun.
 *  Heredado de las reglas del staff (LH5 + ciertos tipos). */
export function defaultSubarrendadoBaigun(
  ancla: Ancla,
  tipo: IndiceTipo,
): boolean {
  if (ancla !== 'LH5') return false;
  return ['luz', 'agua', 'alquiler', 'iva', 'expensas'].includes(tipo);
}

// ─── Row ↔ object ──────────────────────────────────────────────────

const BOOL_TRUE = new Set(['TRUE', 'SI', 'SÍ', 'YES', '1', 'TRUE ', 'TRUE\n']);

export function parseBool(v: string | undefined | null, fallback = false): boolean {
  if (v === undefined || v === null) return fallback;
  return BOOL_TRUE.has(String(v).trim().toUpperCase());
}

/** Parsea un monto del Sheet. Acepta "$1.200.000", "1200000",
 *  "1.200.000,50", "US$ 7,465", "1,400.00". Si no se puede parsear,
 *  devuelve null. */
export function parseMonto(v: string | undefined | null): number | null {
  if (v === undefined || v === null) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  // Sacar $ US$ USD ARS espacios
  const cleaned = raw.replace(/[$\sa-zA-Z]/g, '');
  if (!cleaned) return null;
  // Detectar separador decimal: el último entre "." y "," que aparezca
  // y tenga 1-2 dígitos después es decimal. Resto se ignora (miles).
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  let decSep: string | null = null;
  if (lastDot > -1 && lastComma > -1) {
    decSep = lastDot > lastComma ? '.' : ',';
  } else if (lastDot > -1 && cleaned.length - lastDot - 1 <= 2) {
    decSep = '.';
  } else if (lastComma > -1 && cleaned.length - lastComma - 1 <= 2) {
    decSep = ',';
  }
  let normalized: string;
  if (decSep === '.') {
    normalized = cleaned.replace(/,/g, '');
  } else if (decSep === ',') {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = cleaned.replace(/[.,]/g, '');
  }
  const n = parseFloat(normalized);
  return isNaN(n) ? null : n;
}

/** Convierte un número a string plano para el Sheet (sin formato
 *  monetario, para que Sheets lo trate como número). Null/0 → "". */
export function montoToSheet(n: number | null): string {
  if (n === null || n === undefined || !isFinite(n)) return '';
  return String(n);
}

export function indiceRowToObject(
  row: string[],
  rowIdx0: number,
): IndiceServicio | null {
  const servicio = (row[0] || '').trim();
  if (!servicio) return null;
  const tipoRaw = (row[1] || 'otro').trim().toLowerCase() as IndiceTipo;
  const tipo: IndiceTipo = (INDICE_TIPOS as readonly string[]).includes(tipoRaw)
    ? tipoRaw
    : 'otro';
  const ancla = (row[2] || '').trim() as Ancla;
  const localDisplay = (row[3] || '').trim();
  const diaStr = (row[4] || '').trim();
  const dia = diaStr ? parseInt(diaStr, 10) : NaN;
  const frecRaw = (row[5] || '').trim().toLowerCase() as IndiceFrecuencia;
  const frec: IndiceFrecuencia | '' = (
    INDICE_FRECUENCIA as readonly string[]
  ).includes(frecRaw)
    ? frecRaw
    : '';
  const metodoRaw = (row[6] || '').trim().toLowerCase() as IndiceMetodoPago;
  const metodo: IndiceMetodoPago | '' = (
    INDICE_METODO_PAGO as readonly string[]
  ).includes(metodoRaw)
    ? metodoRaw
    : '';
  const montoArs = parseMonto(row[7]);
  const montoUsd = parseMonto(row[8]);
  const monedaRaw = (row[9] || 'ARS').trim().toUpperCase() as IndiceMoneda;
  const moneda: IndiceMoneda = (INDICE_MONEDA as readonly string[]).includes(
    monedaRaw,
  )
    ? monedaRaw
    : 'ARS';
  const baigunRaw = (row[15] || '').trim();
  const baigunPct = baigunRaw ? parseFloat(baigunRaw.replace(/[%\s]/g, '')) : NaN;
  return {
    _row: rowIdx0 + 1,
    servicio,
    tipo,
    ancla,
    localDisplay,
    diaVencimiento: !isNaN(dia) && dia >= 1 && dia <= 31 ? dia : null,
    frecuencia: frec,
    metodoPago: metodo,
    montoEstimadoArs: montoArs,
    montoEstimadoUsd: montoUsd,
    monedaDefault: moneda,
    titularNombre: (row[10] || '').trim(),
    titularCuit: (row[11] || '').trim().replace(/[^\d]/g, ''),
    cuentaNumero: (row[12] || '').trim(),
    cbu: (row[13] || '').trim(),
    subarrendadoBaigun: parseBool(row[14], false),
    baigunPct: isNaN(baigunPct) ? null : baigunPct,
    activo: parseBool(row[16], true),
    notas: (row[17] || '').trim(),
  };
}

export function indiceObjectToRow(s: Omit<IndiceServicio, '_row'>): string[] {
  return [
    s.servicio,
    s.tipo,
    s.ancla,
    s.localDisplay,
    s.diaVencimiento ? String(s.diaVencimiento) : '',
    s.frecuencia,
    s.metodoPago,
    montoToSheet(s.montoEstimadoArs),
    montoToSheet(s.montoEstimadoUsd),
    s.monedaDefault,
    s.titularNombre,
    s.titularCuit,
    s.cuentaNumero,
    s.cbu,
    s.subarrendadoBaigun ? 'TRUE' : 'FALSE',
    s.baigunPct !== null ? String(s.baigunPct) : '',
    s.activo ? 'TRUE' : 'FALSE',
    s.notas,
  ];
}
