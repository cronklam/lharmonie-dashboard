// CTA CTE BAIGUN — helper de lectura/escritura del tab del Sheet de
// SERVICIOS. El schema lo definió otra instancia y NO se toca; este
// archivo es el adaptador para que el dashboard pueda leer/escribir
// movimientos sin volver a tocar la estructura de columnas.
//
// Schema (REAL, fila 1 = headers, datos desde fila 2):
//   A id                YYYY-prefijo o bg_<ts>_<rand>
//   B fecha             DD/MM/YYYY
//   C mes_origen        YYYY-MM (mes contable al que se imputa el cargo)
//   D tipo              cargo | pago | ajuste
//   E concepto          texto libre
//   F servicio_ref      nombre canónico del servicio (FK suave a LISTADO)
//   G monto             POSITIVO siempre. El signo lo da el tipo.
//   H saldo_despues     número con signo. Cargo suma, pago resta.
//   I metodo            efectivo | transferencia | tarjeta | mix | ''
//   J notas             texto libre
//   K fuente            auto | manual
//   L cargado_por       email del user (o 'sistema' si fuente=auto)
//   M created_at        ISO timestamp
//   N deleted_at        ISO timestamp o '' (soft delete; vacío = activo)

import { parsePeriodoTab } from './servicios-mes';

export const BAIGUN_CTA_CTE_TAB =
  process.env.BAIGUN_CTA_CTE_TAB || 'CTA CTE BAIGUN';

export const BAIGUN_CTA_CTE_HEADERS = [
  'id',             // A
  'fecha',          // B  DD/MM/YYYY
  'mes_origen',     // C  YYYY-MM
  'tipo',           // D  cargo | pago | ajuste
  'concepto',       // E
  'servicio_ref',   // F
  'monto',          // G  positivo
  'saldo_despues',  // H  con signo
  'metodo',         // I
  'notas',          // J
  'fuente',         // K  auto | manual
  'cargado_por',    // L
  'created_at',     // M  ISO
  'deleted_at',     // N  ISO o vacío
] as const;

export const BAIGUN_CTA_CTE_LAST_COL = 'N';
export const BAIGUN_CTA_CTE_NUM_COLS = BAIGUN_CTA_CTE_HEADERS.length;

export type BaigunTipo = 'cargo' | 'pago' | 'ajuste';
export const BAIGUN_TIPOS: BaigunTipo[] = ['cargo', 'pago', 'ajuste'];

export type BaigunFuente = 'auto' | 'manual';

export interface BaigunMov {
  /** Fila 1-indexed del Sheet (para PATCH/DELETE). 0 si recién creado. */
  _row: number;
  id: string;
  /** DD/MM/YYYY locale es-AR. */
  fecha: string;
  /** YYYY-MM contable. */
  mesOrigen: string;
  tipo: BaigunTipo;
  concepto: string;
  /** Nombre canónico del servicio (matchea con LISTADO.servicio). */
  servicioRef: string;
  /** Positivo siempre. El signo lo da `tipo` al calcular saldo. */
  monto: number;
  /** Saldo después de aplicar este movimiento, con signo. */
  saldoDespues: number;
  metodo: string;
  notas: string;
  fuente: BaigunFuente;
  cargadoPor: string;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp si está eliminado, '' si activo. */
  deletedAt: string;
}

/** Acepta "$1.200.000", "1200000", "1.200.000,50", "1,400.00". */
export function parseMontoBaigun(v: string | undefined | null): number {
  if (!v) return 0;
  const raw = String(v).trim();
  if (!raw) return 0;
  const neg = raw.startsWith('-');
  const cleaned = raw.replace(/[$\sA-Za-z()]/g, '').replace(/^-/, '');
  if (!cleaned) return 0;
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
  if (decSep === '.') normalized = cleaned.replace(/,/g, '');
  else if (decSep === ',') normalized = cleaned.replace(/\./g, '').replace(',', '.');
  else normalized = cleaned.replace(/[.,]/g, '');
  const n = parseFloat(normalized);
  if (isNaN(n)) return 0;
  return neg ? -n : n;
}

export function parseBaigunRow(row: string[], rowIdx0: number): BaigunMov | null {
  const id = (row[0] || '').trim();
  if (!id) return null;
  const tipoRaw = (row[3] || '').trim().toLowerCase() as BaigunTipo;
  const tipo: BaigunTipo = BAIGUN_TIPOS.includes(tipoRaw) ? tipoRaw : 'ajuste';
  const fuenteRaw = (row[10] || 'manual').trim().toLowerCase();
  const fuente: BaigunFuente = fuenteRaw === 'auto' ? 'auto' : 'manual';
  return {
    _row: rowIdx0 + 1,
    id,
    fecha: (row[1] || '').trim(),
    mesOrigen: (row[2] || '').trim(),
    tipo,
    concepto: (row[4] || '').trim(),
    servicioRef: (row[5] || '').trim(),
    monto: parseMontoBaigun(row[6]),
    saldoDespues: parseMontoBaigun(row[7]),
    metodo: (row[8] || '').trim(),
    notas: (row[9] || '').trim(),
    fuente,
    cargadoPor: (row[11] || '').trim(),
    createdAt: (row[12] || '').trim(),
    deletedAt: (row[13] || '').trim(),
  };
}

export function baigunRowToSheet(mov: Omit<BaigunMov, '_row'>): string[] {
  return [
    mov.id,
    mov.fecha,
    mov.mesOrigen,
    mov.tipo,
    mov.concepto,
    mov.servicioRef,
    String(mov.monto),
    String(mov.saldoDespues),
    mov.metodo,
    mov.notas,
    mov.fuente,
    mov.cargadoPor,
    mov.createdAt,
    mov.deletedAt,
  ];
}

// ─── Cálculo de saldo (sign convention) ──────────────────────────
// cargo → suma a la deuda (Baigun debe más a Lharmonie)
// pago  → resta (Baigun pagó parte de la deuda)
// ajuste → suma signed (puede ser + o -; el monto se ingresa positivo
//          y el form decide qué dirección)
//
// Convención del módulo: saldo > 0 = Baigun DEBE a Lharmonie.
// saldo < 0 = Lharmonie debe a Baigun (anticipo).

export function delta(mov: Pick<BaigunMov, 'tipo' | 'monto'>): number {
  if (mov.tipo === 'cargo') return mov.monto;
  if (mov.tipo === 'pago') return -mov.monto;
  // ajuste: signed (lo decide quien carga; el monto en el Sheet es positivo
  // pero podríamos guardar signed; para simplicidad lo tratamos como +)
  return mov.monto;
}

// ─── Mes ↔ tab mensual mapping ──────────────────────────────────
// Reusamos parsePeriodoTab para tabToMes; mesToTab arma el formato
// "MAYO 26" desde 'YYYY-MM'.

const MESES_UP = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];

/** 'YYYY-MM' → 'MAYO 26' (con espacio + 2 dígitos del año). */
export function mesToTab(mes: string): string | null {
  const m = mes.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  return `${MESES_UP[month - 1]} ${String(year).slice(-2)}`;
}

/** 'MAYO 26' → '2026-05'. */
export function tabToMes(tab: string): string | null {
  const p = parsePeriodoTab(tab);
  return p ? p.periodo : null;
}

/** YYYY-MM del mes actual. */
export function mesActual(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Fecha DD/MM/YYYY de hoy en zona AR. */
export function fechaHoyAR(d: Date = new Date()): string {
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Genera un id único para un movimiento. */
export function nuevoIdBaigun(): string {
  return `bg_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

/** Valida fecha DD/MM/YYYY simple. */
export function esFechaDDMMYYYY(s: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(s.trim());
}
