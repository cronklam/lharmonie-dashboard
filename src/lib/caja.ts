// Caja Efectivo — schema alineado al Sheet REAL del usuario.
//
// Sheet (CAJA_SHEET_ID env): una pestaña por mes con formato exacto
// "Mayo 2026" (mes en español + año). Pestaña "PORTADA" reservada para
// el resumen — NO escribir ahí.
//
// Cada pestaña mensual:
//   Fila 1: título mergeado "Caja efectivo — Mayo 2026"
//   Fila 2: headers A=FECHA, B=MONEDA, C=DESCRIPCION, D=#, E=CATEGORIA, F=IMPORTE, G=SALDO
//   Fila 3+: data. Pre-llenada con dropdowns y fórmulas en D y G.
//
// Columnas que ESCRIBE el dashboard: A, B, C, E, F.
// Columnas que NO se tocan: D (fórmula `=SI(C{row}<>"";FILA()-2;"")`)
// y G (`=SI(C{row}="";"";SUMAR.SI.CONJUNTO(...))`).
// Si la fila destino está más allá del rango pre-llenado, el server
// agrega esas fórmulas también para que el patrón siga.

// ─── Moneda ──────────────────────────────────────────────────────

export type Moneda = 'PESO' | 'DOLAR';
export const MONEDAS: Moneda[] = ['PESO', 'DOLAR'];
export const MONEDA_LABELS: Record<Moneda, string> = {
  PESO: 'Pesos',
  DOLAR: 'Dólares',
};
export const MONEDA_SYMBOLS: Record<Moneda, string> = {
  PESO: '$',
  DOLAR: 'US$',
};

// ─── Tipo (signo del importe) ───────────────────────────────────

export type Tipo = 'INGRESO' | 'EGRESO';
export const TIPOS: Tipo[] = ['INGRESO', 'EGRESO'];
export const TIPO_LABELS: Record<Tipo, string> = {
  INGRESO: 'Ingreso',
  EGRESO: 'Egreso',
};
export const TIPO_COLORS: Record<Tipo, { fg: string; bg: string }> = {
  INGRESO: { fg: 'var(--green)', bg: 'var(--green-bg)' },
  EGRESO: { fg: 'var(--red)', bg: 'var(--red-bg)' },
};

// ─── Categorías (whitelist exacto, MAYÚSCULAS) ──────────────────

export const CATEGORIAS = [
  'BISTRO',
  'SUELDOS',
  'CAMBIO USD',
  'MYP',
  'CONSULTORIA',
  'ALQUILER',
  'SERVICIOS',
  'DIFERENCIA',
  'MES ANTERIOR',
  'VENTA IVA',
  'CA',
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

export const CATEGORIA_COLORS: Record<Categoria, { fg: string; bg: string }> = {
  BISTRO: { fg: '#7C3AED', bg: 'rgba(124,58,237,0.10)' },
  SUELDOS: { fg: '#1565C0', bg: 'rgba(21,101,192,0.10)' },
  'CAMBIO USD': { fg: '#0891B2', bg: 'rgba(8,145,178,0.10)' },
  MYP: { fg: 'var(--text-muted)', bg: 'var(--bg-subtle)' },
  CONSULTORIA: { fg: '#6A1B9A', bg: 'rgba(106,27,154,0.10)' },
  ALQUILER: { fg: '#4E342E', bg: 'rgba(78,52,46,0.10)' },
  SERVICIOS: { fg: '#B7791F', bg: 'var(--warn-strong-bg)' },
  DIFERENCIA: { fg: 'var(--red)', bg: 'var(--red-bg)' },
  'MES ANTERIOR': { fg: 'var(--text-muted)', bg: 'var(--bg-subtle)' },
  'VENTA IVA': { fg: 'var(--green)', bg: 'var(--green-bg)' },
  CA: { fg: 'var(--accent-hover)', bg: 'var(--accent-bg)' },
};

export function isCategoria(s: string): s is Categoria {
  return (CATEGORIAS as readonly string[]).includes(s);
}

// ─── Mes / tab naming ───────────────────────────────────────────

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** "Mayo 2026" desde un Date. */
export function mesTabFromDate(d: Date): string {
  return `${MESES_ES[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Mayo 2026" desde un string ISO YYYY-MM o YYYY-MM-DD. */
export function mesTabFromISO(iso: string): string | null {
  const m = iso.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const monthIdx = parseInt(m[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  return `${MESES_ES[monthIdx]} ${year}`;
}

/** YYYY-MM desde "Mayo 2026" (inverso). null si no matchea. */
export function isoMesFromTab(tab: string): string | null {
  const m = tab.match(/^(\S+) (\d{4})$/);
  if (!m) return null;
  const idx = MESES_ES.findIndex(
    (n) => n.toLowerCase() === m[1].toLowerCase(),
  );
  if (idx < 0) return null;
  return `${m[2]}-${String(idx + 1).padStart(2, '0')}`;
}

/** True si el tab name es válido (mes en español + año). Filtra
 *  PORTADA y cualquier otro tab que no matchee. */
export function isMonthTab(tab: string): boolean {
  return isoMesFromTab(tab) !== null;
}

// ─── Formato ────────────────────────────────────────────────────

/** DD/MM/YYYY (es-AR). */
export function fechaToSheet(iso: string): string | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** DD/MM/YYYY del Sheet → YYYY-MM-DD. */
export function fechaFromSheet(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** Formato visual de un monto: "$ 1.200.000" o "US$ 5.000". El signo
 *  viene en el number, lo respetamos para la UI (rojo si negativo). */
export function fmtMonto(n: number, moneda: Moneda): string {
  const sym = MONEDA_SYMBOLS[moneda];
  const abs = Math.round(Math.abs(n));
  const sign = n < 0 ? '-' : '';
  return `${sign}${sym} ${abs.toLocaleString('es-AR')}`;
}

/** Parsea un input visual ("1.200.000", "1200000", "1,200,000") a
 *  número plano. */
export function parseMontoInput(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw
    .replace(/\$|US\$|us\$/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ─── Tipos de fila ──────────────────────────────────────────────

export interface MovimientoCaja {
  fila: number;             // fila exacta en el Sheet (para debug)
  fecha: string;            // ISO YYYY-MM-DD
  moneda: Moneda;
  descripcion: string;
  categoria: Categoria | '';
  importe: number;          // signed: + ingreso, − egreso
  saldoCol: number | null;  // valor calculado de col G (puede ser null si la fórmula no resolvió)
}

export interface SaldoMes {
  pesos: number;
  dolares: number;
}

// ─── ID helpers (para optimistic UI client-side) ────────────────

export function nuevoIdMov(): string {
  return `mov_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

// ─── Sesiones de Control (Iara) ─────────────────────────────────
//
// Una sesión = control periódico de Iara: anota retiros de locales,
// gastos chicos, ajustes, cuenta cuánto hay en caja grande, y confirma
// el saldo final. Cada movimiento individual de la sesión se persiste
// como una fila en el Sheet de Caja con DESCRIPCION prefijada para
// que después podamos agruparlas como una sola sesión.
//
// Formato del prefijo de DESCRIPCION:
//   "SESION DD/MM/YYYY - LOCAL · {concepto del mov}"
// Donde DD/MM/YYYY es la fecha de la sesión (cuando Iara controló) y
// LOCAL es el ancla (LH1..LH6). Eso permite group-by exacto al leer.

export type SesionTipoMov = 'RETIRO' | 'GASTO' | 'AJUSTE';
export const SESION_TIPOS_MOV: SesionTipoMov[] = ['RETIRO', 'GASTO', 'AJUSTE'];

export const SESION_TIPO_LABEL: Record<SesionTipoMov, string> = {
  RETIRO: 'Retiro',
  GASTO: 'Gasto',
  AJUSTE: 'Ajuste',
};

export const SESION_TIPO_COLOR: Record<
  SesionTipoMov,
  { fg: string; bg: string }
> = {
  RETIRO: { fg: 'var(--green)', bg: 'var(--green-bg)' },
  GASTO: { fg: 'var(--red)', bg: 'var(--red-bg)' },
  AJUSTE: { fg: 'var(--text-muted)', bg: 'var(--bg-subtle)' },
};

export type SesionEstadoMov = 'COMPLETO' | 'PARCIAL';
export const SESION_ESTADOS_MOV: SesionEstadoMov[] = ['COMPLETO', 'PARCIAL'];

/** Categorías finas de GASTO en la sesión (estilo staff). Se preservan
 *  en CONCEPTO al escribir al Sheet (la CATEGORIA del Sheet queda
 *  fija a BISTRO para gastos, CA para retiros, DIFERENCIA para ajustes). */
export const SESION_CATEGORIAS_GASTO = [
  'Limpieza',
  'Insumos',
  'Bebidas',
  'Mantenimiento',
  'Mensajería',
  'Servicios',
  'Papelería',
  'Personal',
  'Imprevistos',
  'Otros',
] as const;

export type SesionCategoriaGasto = (typeof SESION_CATEGORIAS_GASTO)[number];

export function isSesionCategoriaGasto(s: string): s is SesionCategoriaGasto {
  return (SESION_CATEGORIAS_GASTO as readonly string[]).includes(s);
}

export interface SesionMovInput {
  tipo: SesionTipoMov;
  fecha: string;             // YYYY-MM-DD del movimiento (puede diferir de fechaSesion)
  local: string;             // ej "LH5" — el ancla del staff
  montoArs: number;          // positivo, sin signo
  montoUsd: number;          // positivo
  concepto: string;
  categoriaFina?: SesionCategoriaGasto | '';
  estado: SesionEstadoMov;
}

export interface SesionInput {
  fechaSesion: string;       // YYYY-MM-DD cuando Iara controló
  local: string;             // local "activo" inicial de la sesión
  movs: SesionMovInput[];
  // Conteo físico
  encontradoArs: number;
  encontradoUsd: number;
  // Saldo registrado en sistema ANTES de esta sesión (snapshot al abrir)
  saldoRegistradoArs: number;
  saldoRegistradoUsd: number;
  // Saldo confirmado final (por default = saldo sugerido; el user puede ajustarlo)
  saldoConfirmadoArs: number;
  saldoConfirmadoUsd: number;
  notas: string;
}

/** Prefijo único de la sesión, base del agrupamiento al leer rows. */
export function prefijoSesion(fechaSesion: string, local: string): string {
  const fecha = fechaToSheet(fechaSesion) || fechaSesion;
  return `SESION ${fecha} - ${local}`;
}

/** Descripción de un mov individual dentro de una sesión.
 *  Si la categoría fina existe se prepende al concepto: "Limpieza · concepto". */
export function descripcionSesionMov(
  fechaSesion: string,
  local: string,
  mov: SesionMovInput,
): string {
  const base = prefijoSesion(fechaSesion, local);
  const partes: string[] = [];
  if (mov.categoriaFina) partes.push(mov.categoriaFina);
  if (mov.concepto.trim()) partes.push(mov.concepto.trim());
  if (mov.estado === 'PARCIAL') partes.push('parcial');
  return partes.length > 0 ? `${base} · ${partes.join(' · ')}` : base;
}

/** Mapea un mov de sesión a la CATEGORIA whitelist del Sheet. */
export function categoriaSheetParaSesion(tipo: SesionTipoMov): Categoria {
  if (tipo === 'RETIRO') return 'CA';
  if (tipo === 'AJUSTE') return 'DIFERENCIA';
  return 'BISTRO';
}

/** Convierte un mov de sesión a importe signed (lo que va a col F):
 *  RETIRO suma (sale del local → entra a caja grande), GASTO resta,
 *  AJUSTE puede ser cualquier signo (lo dejamos como vino). */
export function importeSignedSesion(mov: SesionMovInput, monto: number): number {
  if (mov.tipo === 'GASTO') return -Math.abs(monto);
  if (mov.tipo === 'RETIRO') return Math.abs(monto);
  return monto; // AJUSTE — preserva signo si vino con signo, sino positivo
}

/** True si el row del Sheet es parte de una sesión (concepto arranca con SESION). */
export function esRowDeSesion(desc: string): boolean {
  return /^SESION\s+\d{1,2}\/\d{1,2}\/\d{4}\s+-\s+/.test(desc.trim());
}

/** Parsea el prefijo de un row de sesión. Devuelve { prefijo, fechaSesion, local }
 *  o null si no matchea. */
export function parsePrefijoSesion(desc: string): {
  prefijo: string;
  fechaSesion: string;       // DD/MM/YYYY
  local: string;
} | null {
  const m = desc.trim().match(/^(SESION\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+-\s+(\S+))/);
  if (!m) return null;
  return { prefijo: m[1], fechaSesion: m[2], local: m[3] };
}

