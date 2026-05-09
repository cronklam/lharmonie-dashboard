// Servicios — types, headers y helpers.
//
// Modelo (espejo staff):
// - Catálogo de servicios recurrentes (luz/agua/gas/internet/alquiler/IVA/expensas/sistema/impositivo).
// - Pagos individuales (multipago: ARS efectivo + USD + transferencia).
// - Baigun CtaCte (subarriendo LH5 — opcional).
//
// El Sheet destino vive en `SERVICIOS_SHEET_ID`. Los nombres de tabs y
// el orden de columnas tienen DEFAULTS pero son env-configurables porque
// no inspeccionamos el Sheet del usuario todavía. Hay que confirmar
// nombres + orden de columnas mañana antes de habilitar writes.

import type { Ancla } from './anclas';

// ─── Tab names (env-configurable) ────────────────────────────────────
//
// Defaults heredados del staff. Si el Sheet del management usa otros
// nombres, se settean como env vars en Vercel. NO hay autocreate de
// tabs — si el tab no existe, el endpoint devuelve error claro.

export const SERVICIOS_CATALOGO_TAB =
  process.env.SERVICIOS_CATALOGO_TAB || 'Servicios Catalogo';
export const SERVICIOS_PAGOS_TAB =
  process.env.SERVICIOS_PAGOS_TAB || 'Servicios Pagos';
export const BAIGUN_CTA_CTE_TAB =
  process.env.BAIGUN_CTA_CTE_TAB || 'Baigun CtaCte';
export const BAIGUN_REGLAS_TAB =
  process.env.BAIGUN_REGLAS_TAB || 'Baigun Reglas';

// ─── Tipos ─────────────────────────────────────────────────────────

export type TipoServicio =
  | 'luz'
  | 'agua'
  | 'gas'
  | 'internet'
  | 'telefono'
  | 'alquiler'
  | 'iva'
  | 'expensas'
  | 'sistema'
  | 'impositivo'
  | 'otro';

export const TIPOS_SERVICIO: TipoServicio[] = [
  'luz', 'agua', 'gas', 'internet', 'telefono',
  'alquiler', 'iva', 'impositivo', 'expensas', 'sistema', 'otro',
];

export const TIPO_LABELS: Record<TipoServicio, string> = {
  luz: 'Luz',
  agua: 'Agua',
  gas: 'Gas',
  internet: 'Internet',
  telefono: 'Teléfono',
  alquiler: 'Alquiler',
  iva: 'IVA',
  impositivo: 'Impositivo',
  expensas: 'Expensas',
  sistema: 'Sistema',
  otro: 'Otro',
};

export const TIPO_COLORS: Record<TipoServicio, { fg: string; bg: string }> = {
  luz: { fg: '#B7791F', bg: 'var(--warn-strong-bg)' },
  agua: { fg: '#1565C0', bg: 'rgba(21,101,192,0.10)' },
  gas: { fg: '#C84F3F', bg: 'rgba(217,95,78,0.10)' },
  internet: { fg: '#7C3AED', bg: 'rgba(124,58,237,0.10)' },
  telefono: { fg: '#0891B2', bg: 'rgba(8,145,178,0.10)' },
  alquiler: { fg: '#4E342E', bg: 'rgba(78,52,46,0.10)' },
  iva: { fg: 'var(--critical)', bg: 'var(--critical-bg)' },
  impositivo: { fg: '#6A1B9A', bg: 'rgba(106,27,154,0.10)' },
  expensas: { fg: 'var(--accent-hover)', bg: 'var(--accent-bg)' },
  sistema: { fg: 'var(--text)', bg: 'var(--bg-subtle)' },
  otro: { fg: 'var(--text-muted)', bg: 'var(--bg-subtle)' },
};

export type Periodicidad = 'mensual' | 'bimestral' | 'trimestral';
export const PERIODICIDADES: Periodicidad[] = ['mensual', 'bimestral', 'trimestral'];

export type MedioPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'mix';
export const MEDIOS_PAGO: MedioPago[] = ['efectivo', 'transferencia', 'tarjeta', 'mix'];

export const MEDIO_LABELS: Record<MedioPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  mix: 'Mix',
};

// ─── Catálogo ─────────────────────────────────────────────────────

export interface ServicioCatalogo {
  id: string;
  tipo: TipoServicio;
  ancla: Ancla;
  local: string;            // texto visible (ej "Lharmonie Nicaragua")
  nombreVisible: string;    // ej "EDESUR — LH2"
  titularNombre: string;
  titularCuit: string;
  cuentaNumero: string;
  direccionServicio: string;
  periodicidad: Periodicidad;
  montoEstimadoArs: number;
  montoEstimadoUsd: number;
  montoEstimadoTransfer: number;
  vencimientoDia: number | null; // 1-28
  notas: string;
  activo: boolean;
  creadoEn: string;
  creadoPor: string;
  // Subarriendo Baigun
  subarrendadoBaigun: boolean;
  baigunPorcentaje: number;
  // Datos de pago
  metodoPago: MedioPago | '';
  cbuPago: string;
  cuentaPagoAlias: string;
}

// Headers en orden FIJO. Espejo del staff. Si el Sheet real tiene
// otro orden, se ajusta el orden de este array (es la fuente de verdad
// para read/write).
export const SERVICIOS_CATALOGO_HEADERS = [
  'ID',
  'Tipo',
  'Ancla',
  'Local',
  'Nombre visible',
  'Titular nombre',
  'Titular CUIT',
  'Cuenta numero',
  'Direccion servicio',
  'Periodicidad',
  'Monto estimado ARS',
  'Vencimiento dia',
  'Notas',
  'Activo',
  'Creado en',
  'Creado por',
  'Subarrendado Baigun',
  'Baigun porcentaje',
  'Metodo pago',
  'CBU pago',
  'Cuenta pago alias',
  'Monto estimado USD',
  'Monto estimado Transfer',
] as const;

// ─── Pagos ────────────────────────────────────────────────────────

export interface ServicioPago {
  id: string;
  servicioId: string;
  periodo: string;          // YYYY-MM
  fechaPago: string;        // YYYY-MM-DD
  fechaAnclada: string;     // periodo "anclado" (1ro del mes)
  ancla: Ancla;
  montoTotalArs: number;
  montoArsEfectivo: number;
  montoUsd: number;
  tipoCambioUsd: number;
  montoTransferenciaArs: number;
  medioPago: MedioPago;
  comprobanteUrl: string;
  notas: string;
  cargadoPor: string;
  baigunShareArs: number;   // si el servicio es subarrendado
}

export const SERVICIOS_PAGOS_HEADERS = [
  'ID',
  'servicioId',
  'periodo',
  'fechaPago',
  'fechaAnclada',
  'ancla',
  'montoTotalArs',
  'montoArsEfectivo',
  'montoUsd',
  'tipoCambioUsd',
  'montoTransferenciaArs',
  'medioPago',
  'comprobanteUrl',
  'notas',
  'cargadoPor',
  'baigunShareArs',
] as const;

// ─── Baigun ───────────────────────────────────────────────────────

export interface BaigunMovimiento {
  id: string;
  fecha: string;
  concepto: string;
  cargo: number;
  pago: number;
  saldoDespues: number;
  notas: string;
  cargadoPor: string;
}

export const BAIGUN_CTA_CTE_HEADERS = [
  'ID',
  'Fecha',
  'Concepto',
  'Cargo ARS',
  'Pago ARS',
  'Saldo Despues',
  'Notas',
  'Cargado por',
] as const;

// ─── Helpers ──────────────────────────────────────────────────────

/** Sugiere ancla a partir del tipo. IVA + impositivo → CRONKLAM. */
export function sugerirAnclaPorTipo(tipo: TipoServicio): Ancla | null {
  if (tipo === 'iva' || tipo === 'impositivo') return 'CRONKLAM';
  return null;
}

/** Convierte un boolean a "Sí"/"No" como espera el Sheet. */
export function toSheetBool(b: boolean): 'Sí' | 'No' {
  return b ? 'Sí' : 'No';
}

export function fromSheetBool(s: string | undefined | null): boolean {
  if (!s) return false;
  const t = s.trim().toLowerCase();
  return t === 'sí' || t === 'si' || t === 'true' || t === 'yes' || t === '1';
}

export function nuevoIdServicio(): string {
  return `srv_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

export function nuevoIdPago(): string {
  return `pag_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

/** Período YYYY-MM del mes actual. */
export function periodoActual(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Devuelve YYYY-MM-DD de hoy en zona AR (no usa server tz). */
export function hoyISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
