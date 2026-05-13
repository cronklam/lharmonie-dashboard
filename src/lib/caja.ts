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

// Categoría "CA" se sacó del whitelist (2026-05-12) — era un error
// en la primera versión. Si alguna fila vieja del Sheet quedó con
// CA, queda como string libre pero no se acepta más como opción.
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

/** Formatea un input mientras el usuario escribe.
 *  Entrada: lo que escribió el usuario (ej "1234567" o "1.234,5").
 *  Salida: el mismo input pero con puntos de miles en la parte entera
 *  (ej "1.234.567" o "1.234,5"). No prepende el símbolo de moneda —
 *  eso lo dibuja la UI como prefix afuera del input.
 *
 *  Preserva los siguientes caracteres del usuario:
 *    - signo - al inicio
 *    - dígitos
 *    - una sola coma como separador decimal (max 2 decimales)
 *  Descarta todo lo demás (espacios, $, letras, etc).
 *
 *  Si el usuario termina escribiendo "1.234." porque viene tipeando,
 *  igualmente devolvemos un string bien formado — la coma decimal
 *  solo aparece si el usuario la escribió explícitamente. */
export function formatMontoLive(raw: string): string {
  if (!raw) return '';
  // Permitir signo negativo al inicio (Iara puede escribir "-" antes de
  // tipear el monto para indicar egreso). Si el user solo escribió "-"
  // sin dígitos atrás, devolvemos "-" para que el caret no salte.
  const neg = raw.trim().startsWith('-');
  // Quitar todo menos dígitos y coma (la coma es decimal)
  let cleaned = raw.replace(/[^0-9,]/g, '');
  // Una sola coma permitida — quedarnos con la primera
  const partes = cleaned.split(',');
  let entero = partes[0] || '';
  let decimal = partes.length > 1 ? partes.slice(1).join('') : null;
  // Quitar ceros a la izquierda salvo que sea solo "0"
  entero = entero.replace(/^0+(?=\d)/, '');
  // Insertar puntos de miles en la parte entera (de derecha a izquierda)
  if (entero) {
    entero = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  // Recortar decimal a 2 dígitos máximo
  if (decimal !== null) {
    decimal = decimal.slice(0, 2);
  }
  cleaned = decimal !== null ? `${entero},${decimal}` : entero;
  // Caso "solo escribió -": preservamos el guión para que pueda seguir.
  if (!cleaned) return neg ? '-' : '';
  return neg ? `-${cleaned}` : cleaned;
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
  /** Fecha en la que Iara hizo el control (col A del Sheet). */
  fechaControl: string;      // YYYY-MM-DD
  /** Fecha de la caja que se está auditando (va en la descripción). */
  fechaAuditada: string;     // YYYY-MM-DD
  local: string;             // local "activo" inicial de la sesión
  /** Si true → suffix de la descripción es "T COMPLETO". */
  turnoCompleto: boolean;
  /** Si turnoCompleto es false, esta etiqueta va al final (ej "T AM", "T PM"). */
  turnoLabel: string;
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

/** Prefijo único de la sesión, base del agrupamiento al leer rows.
 *  Formato (mayo 2026):
 *    "S. {fechaControl} - {local} ({fechaAuditada}) - {turno}"
 *  donde:
 *    - fechaControl = cuando Iara hizo el control (hoy)
 *    - local = LH1..LH6
 *    - fechaAuditada = fecha de la caja que se controla
 *    - turno = "T COMPLETO" si turnoCompleto, sino texto libre (ej "T AM")
 */
export function prefijoSesion(
  fechaControl: string,
  local: string,
  fechaAuditada: string,
  turnoSuffix: string,
): string {
  const fC = fechaToSheet(fechaControl) || fechaControl;
  const fA = fechaToSheet(fechaAuditada) || fechaAuditada;
  return `S. ${fC} - ${local} (${fA}) - ${turnoSuffix}`;
}

/** Suffix del turno para el prefijo. */
export function turnoSuffix(turnoCompleto: boolean, turnoLabel: string): string {
  if (turnoCompleto) return 'T COMPLETO';
  return (turnoLabel || '').trim() || 'T PARCIAL';
}

/** Descripción de un mov individual dentro de una sesión.
 *  Si la categoría fina existe se prepende al concepto: "Limpieza · concepto". */
export function descripcionSesionMov(
  input: Pick<
    SesionInput,
    'fechaControl' | 'fechaAuditada' | 'local' | 'turnoCompleto' | 'turnoLabel'
  >,
  mov: SesionMovInput,
): string {
  const base = prefijoSesion(
    input.fechaControl,
    input.local,
    input.fechaAuditada,
    turnoSuffix(input.turnoCompleto, input.turnoLabel),
  );
  const partes: string[] = [];
  if (mov.categoriaFina) partes.push(mov.categoriaFina);
  if (mov.concepto.trim()) partes.push(mov.concepto.trim());
  if (mov.estado === 'PARCIAL') partes.push('parcial');
  return partes.length > 0 ? `${base} · ${partes.join(' · ')}` : base;
}

/** Mapea un mov de sesión a la CATEGORIA whitelist del Sheet.
 *  Reglas confirmadas con Martín (2026-05-12):
 *    - RETIRO          → siempre BISTRO.
 *    - GASTO           → depende de la categoríaFina elegida.
 *    - AJUSTE          → DIFERENCIA.
 *  El mapping de categoriaFina → Categoria:
 *    Servicios → SERVICIOS
 *    Personal  → SUELDOS
 *    resto     → BISTRO (Limpieza, Insumos, Bebidas, Mantenimiento,
 *                Mensajería, Papelería, Imprevistos, Otros, sin def). */
export function categoriaSheetParaSesion(
  tipo: SesionTipoMov,
  categoriaFina?: SesionCategoriaGasto | '',
): Categoria {
  if (tipo === 'AJUSTE') return 'DIFERENCIA';
  if (tipo === 'RETIRO') return 'BISTRO';
  // GASTO — depende de la categoría fina
  if (categoriaFina === 'Servicios') return 'SERVICIOS';
  if (categoriaFina === 'Personal') return 'SUELDOS';
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

/** True si el row del Sheet es parte de una sesión.
 *  Acepta dos formatos:
 *    1. NUEVO (mayo 2026+): "S. DD/MM/YYYY - LHX (DD/MM/YYYY) - T XX"
 *    2. VIEJO (pre-mayo 2026): "SESION DD/MM/YYYY - LHX" */
export function esRowDeSesion(desc: string): boolean {
  const t = desc.trim();
  return (
    /^S\.\s+\d{1,2}\/\d{1,2}\/\d{4}\s+-\s+/.test(t) ||
    /^SESION\s+\d{1,2}\/\d{1,2}\/\d{4}\s+-\s+/.test(t)
  );
}

/** Parsea el prefijo de un row de sesión. Soporta ambos formatos
 *  (nuevo "S." y viejo "SESION"). */
export function parsePrefijoSesion(desc: string): {
  prefijo: string;
  fechaControl: string;      // DD/MM/YYYY (cuando se hizo el control)
  local: string;
  fechaAuditada: string;     // DD/MM/YYYY si está; '' en formato viejo
  turno: string;             // texto del suffix; '' en formato viejo
} | null {
  const t = desc.trim();
  // Formato nuevo: "S. 12/05/2026 - LH2 (04/05/2026) - T COMPLETO"
  const mNuevo = t.match(
    /^(S\.\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+-\s+(\S+)\s+\((\d{1,2}\/\d{1,2}\/\d{4})\)\s+-\s+([^·]+?))(?:\s+·|$)/,
  );
  if (mNuevo) {
    return {
      prefijo: mNuevo[1].trim(),
      fechaControl: mNuevo[2],
      local: mNuevo[3],
      fechaAuditada: mNuevo[4],
      turno: mNuevo[5].trim(),
    };
  }
  // Formato viejo: "SESION 12/05/2026 - LH2"
  const mViejo = t.match(/^(SESION\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+-\s+(\S+))/);
  if (mViejo) {
    return {
      prefijo: mViejo[1],
      fechaControl: mViejo[2],
      local: mViejo[3],
      fechaAuditada: '',
      turno: '',
    };
  }
  return null;
}

