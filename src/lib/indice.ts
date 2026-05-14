// Catálogo canónico de servicios — tab "ÍNDICE" del Sheet de SERVICIOS.
//
// Schema flat (1 fila por (servicio × ancla) único). Antes era un doc
// con 3 secciones (Locales, Servicios, Convenciones), ahora es una
// tabla editable con 11 cols + dropdowns.
//
// Es la fuente única de verdad para:
//   - QUÉ servicios existen
//   - su tipo (categoría operativa: luz, agua, alquiler, etc)
//   - a qué ancla pertenecen (local físico / corporativo / personal)
//   - su día de vencimiento del mes
//   - método de pago (efectivo/transfer/débito automático/tarjeta)
//   - frecuencia (mensual/bimestral/...)
//   - si está activo (si false → no se sugiere al crear mes nuevo)
//   - si va al subarriendo Baigun (50% al saldo cta cte)
//
// Los tabs mensuales (MAYO 26, ABRIL 26, etc) siguen siendo la fuente
// de pagos efectivos por mes. El ÍNDICE es metadata + plantilla.

import type { Ancla } from './anclas';
import { ANCLA_LABELS } from './anclas';

export const INDICE_TAB = 'ÍNDICE';

export const INDICE_HEADERS = [
  'Servicio',
  'Tipo',
  'Ancla',
  'Local Display',
  'Día Vencimiento',
  'Método Pago',
  'Frecuencia',
  'Activo',
  'Subarrendado Baigun',
  'CBU/CVU/Alias',
  'Notas',
] as const;

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
  metodoPago: IndiceMetodoPago | '';
  frecuencia: IndiceFrecuencia | '';
  activo: boolean;
  subarrendadoBaigun: boolean;
  cbu: string;
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
  const metodoRaw = (row[5] || '').trim().toLowerCase() as IndiceMetodoPago;
  const metodo: IndiceMetodoPago | '' = (
    INDICE_METODO_PAGO as readonly string[]
  ).includes(metodoRaw)
    ? metodoRaw
    : '';
  const frecRaw = (row[6] || '').trim().toLowerCase() as IndiceFrecuencia;
  const frec: IndiceFrecuencia | '' = (
    INDICE_FRECUENCIA as readonly string[]
  ).includes(frecRaw)
    ? frecRaw
    : '';
  return {
    _row: rowIdx0 + 1,
    servicio,
    tipo,
    ancla,
    localDisplay,
    diaVencimiento: !isNaN(dia) && dia >= 1 && dia <= 31 ? dia : null,
    metodoPago: metodo,
    frecuencia: frec,
    activo: parseBool(row[7], true),
    subarrendadoBaigun: parseBool(row[8], false),
    cbu: (row[9] || '').trim(),
    notas: (row[10] || '').trim(),
  };
}

export function indiceObjectToRow(s: Omit<IndiceServicio, '_row'>): string[] {
  return [
    s.servicio,
    s.tipo,
    s.ancla,
    s.localDisplay,
    s.diaVencimiento ? String(s.diaVencimiento) : '',
    s.metodoPago,
    s.frecuencia,
    s.activo ? 'TRUE' : 'FALSE',
    s.subarrendadoBaigun ? 'TRUE' : 'FALSE',
    s.cbu,
    s.notas,
  ];
}
