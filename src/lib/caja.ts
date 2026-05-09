// Caja chica + caja grande — types, headers, helpers.
//
// Modelo (espejo staff):
// - CajaChica_Movimientos: cada retiro/gasto/ajuste individual.
// - CajaChica_Sesiones: control completo (Iara cada 2 días) con totales
//   y diferencia auditada al cerrar.
// - CajaGrande_Movimientos: TODA modificación del saldo central
//   (DEPOSITO/RETIRO/SESION_IARA/AJUSTE) con saldo después calculado.
//
// El saldo de caja grande NO se guarda en variable global — se calcula
// sumando todos los movimientos. La columna `Saldo Despues` es para
// auditoría visual del Sheet.
//
// Owner-only por seguridad. Sheet destino: `CAJA_SHEET_ID`.

import type { Ancla } from './anclas';

// ─── Tab names (env-configurable) ────────────────────────────────────

export const CAJA_CHICA_MOV_TAB =
  process.env.CAJA_CHICA_MOV_TAB || 'CajaChica_Movimientos';
export const CAJA_CHICA_SES_TAB =
  process.env.CAJA_CHICA_SES_TAB || 'CajaChica_Sesiones';
export const CAJA_GRANDE_TAB =
  process.env.CAJA_GRANDE_TAB || 'CajaGrande_Movimientos';

// ─── Caja chica ──────────────────────────────────────────────────

export type CajaTipoMov = 'RETIRO' | 'GASTO' | 'AJUSTE';
export const CAJA_TIPOS_MOV: CajaTipoMov[] = ['RETIRO', 'GASTO', 'AJUSTE'];

export const CAJA_TIPO_MOV_LABEL: Record<CajaTipoMov, string> = {
  RETIRO: 'Retiro',
  GASTO: 'Gasto',
  AJUSTE: 'Ajuste',
};

export const CAJA_TIPO_MOV_COLORS: Record<
  CajaTipoMov,
  { fg: string; bg: string }
> = {
  RETIRO: { fg: 'var(--blue)', bg: 'var(--blue-bg)' },
  GASTO: { fg: 'var(--red)', bg: 'var(--red-bg)' },
  AJUSTE: { fg: 'var(--text-muted)', bg: 'var(--bg-subtle)' },
};

export type CajaEstadoMov = 'COMPLETO' | 'PARCIAL' | 'PENDIENTE';
export const CAJA_ESTADOS_MOV: CajaEstadoMov[] = ['COMPLETO', 'PARCIAL', 'PENDIENTE'];

export type CajaCategoria =
  | 'Limpieza'
  | 'Insumos'
  | 'Bebidas'
  | 'Mantenimiento'
  | 'Mensajería'
  | 'Servicios'
  | 'Papelería'
  | 'Personal'
  | 'Imprevistos'
  | 'Otros';

export const CAJA_CATEGORIAS: CajaCategoria[] = [
  'Limpieza', 'Insumos', 'Bebidas', 'Mantenimiento', 'Mensajería',
  'Servicios', 'Papelería', 'Personal', 'Imprevistos', 'Otros',
];

export interface CajaMovimiento {
  id: string;
  fechaMov: string;          // YYYY-MM-DD
  local: string;             // texto del local (acepta Ancla | string libre)
  tipo: CajaTipoMov;
  montoArs: number;          // signed
  montoUsd: number;          // signed
  concepto: string;
  estado: CajaEstadoMov;
  cargadoPor: string;
  cargadoEl: string;         // ISO datetime
  sesionId: string;
  notas: string;
  fuente: string;
  categoria: CajaCategoria | '';
}

export const CAJA_CHICA_MOV_HEADERS = [
  'ID',
  'Fecha Mov',
  'Local',
  'Tipo',
  'Monto ARS',
  'Monto USD',
  'Concepto',
  'Estado',
  'Cargado por',
  'Cargado el',
  'Sesion ID',
  'Notas',
  'Fuente',
  'Categoria',
] as const;

// ─── Caja chica · Sesiones de control ────────────────────────────

export interface CajaSesion {
  id: string;
  fechaControl: string;
  totalRetiradoArs: number;
  totalRetiradoUsd: number;
  totalGastadoArs: number;
  totalGastadoUsd: number;
  totalAjusteArs: number;
  totalAjusteUsd: number;
  cajaGrandeEncontradaArs: number;
  cajaGrandeEncontradaUsd: number;
  saldoSugeridoArs: number;
  saldoSugeridoUsd: number;
  saldoConfirmadoArs: number;
  saldoConfirmadoUsd: number;
  diferenciaArs: number;
  diferenciaUsd: number;
  notas: string;
  cargadoPor: string;
  cargadoEl: string;
}

export const CAJA_CHICA_SES_HEADERS = [
  'ID Sesion',
  'Fecha Control',
  'Total Retirado ARS',
  'Total Retirado USD',
  'Total Gastado ARS',
  'Total Gastado USD',
  'Total Ajuste ARS',
  'Total Ajuste USD',
  'Caja Grande Encontrada ARS',
  'Caja Grande Encontrada USD',
  'Saldo Sugerido ARS',
  'Saldo Sugerido USD',
  'Saldo Confirmado ARS',
  'Saldo Confirmado USD',
  'Diferencia ARS',
  'Diferencia USD',
  'Notas',
  'Cargado por',
  'Cargado el',
] as const;

// ─── Caja grande ──────────────────────────────────────────────────

export type CajaGrandeTipo = 'DEPOSITO' | 'RETIRO' | 'SESION_IARA' | 'AJUSTE';
export const CAJA_GRANDE_TIPOS: CajaGrandeTipo[] = [
  'DEPOSITO', 'RETIRO', 'SESION_IARA', 'AJUSTE',
];

export const CAJA_GRANDE_TIPO_LABEL: Record<CajaGrandeTipo, string> = {
  DEPOSITO: 'Depósito',
  RETIRO: 'Retiro',
  SESION_IARA: 'Sesión Iara',
  AJUSTE: 'Ajuste',
};

export const CAJA_GRANDE_TIPO_COLORS: Record<
  CajaGrandeTipo,
  { fg: string; bg: string }
> = {
  DEPOSITO: { fg: 'var(--green)', bg: 'var(--green-bg)' },
  RETIRO: { fg: 'var(--red)', bg: 'var(--red-bg)' },
  SESION_IARA: { fg: 'var(--accent-hover)', bg: 'var(--accent-bg)' },
  AJUSTE: { fg: 'var(--text-muted)', bg: 'var(--bg-subtle)' },
};

export interface CajaGrandeMovimiento {
  id: string;
  fecha: string;            // ISO datetime
  tipo: CajaGrandeTipo;
  montoArs: number;         // signed
  montoUsd: number;         // signed
  concepto: string;
  sesionIdRef: string;
  saldoDespuesArs: number;
  saldoDespuesUsd: number;
  cargadoPor: string;
}

export const CAJA_GRANDE_HEADERS = [
  'ID',
  'Fecha',
  'Tipo',
  'Monto ARS',
  'Monto USD',
  'Concepto',
  'Sesion ID Ref',
  'Saldo Despues ARS',
  'Saldo Despues USD',
  'Cargado por',
] as const;

// ─── Helpers ──────────────────────────────────────────────────────

export function nuevoIdMovChica(): string {
  return `mc_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

export function nuevoIdSesion(): string {
  return `ss_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

export function nuevoIdMovGrande(): string {
  return `mg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

/** Calcula el saldo de caja grande sumando todos los movimientos.
 *  El saldo después de cada movimiento se anota como auditoría visual,
 *  pero la fuente de verdad es la suma de los montos. */
export function calcularSaldo(movs: CajaGrandeMovimiento[]): {
  ars: number;
  usd: number;
} {
  let ars = 0;
  let usd = 0;
  for (const m of movs) {
    ars += m.montoArs || 0;
    usd += m.montoUsd || 0;
  }
  return { ars, usd };
}

export function fmtArs(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$ ${Math.round(Math.abs(n)).toLocaleString('es-AR')}`;
}

export function fmtUsd(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}USD ${Math.round(Math.abs(n)).toLocaleString('es-AR')}`;
}

// Re-export Ancla para que los componentes que importan caja no necesiten doble import
export type { Ancla };
