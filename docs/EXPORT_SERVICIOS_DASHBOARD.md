# EXPORT — Servicios (lharmonie-dashboard)

Dump completo del módulo Servicios del dashboard de Lharmonie (a Mayo
2026). Adaptado del módulo del staff app pero con un modelo de datos
distinto porque el Sheet real es **pivot mensual** (un tab por mes,
filas = servicios, cols = locales), no Catálogo+Pagos como el staff.

## Visión general

El dashboard NO tiene un catálogo de servicios estructurado tipo
`Servicios Catalogo` con N columnas por servicio. En su lugar:

1. **Sheet de SERVICIOS** (`SERVICIOS_SHEET_ID =
   1u6zH3X5MB1EyMQJ59YEkGFhbuQwzv7TsZbz2XZKZ_kM`)
   tiene un **tab por mes** con formato `MAYO 26`, `ABRIL 26`,
   `MARZO 26`, etc. Cada tab es una **tabla pivot**:
   - Col A: nombre del servicio (BISTROSOFT, AYSA, ABL, EDENOR, …).
   - Cols B-I: locales fijos (SEGUI, MAURE, NICARAGUA, ZABALA,
     LIBERTADOR, NUÑEZ, CASA MEL Y MARTIN, BAMBINA).
   - Col J: BAIGUN (saldo cta cte del subarriendo LH5).
   - Col K: notas sueltas.
   - Valores de celda: número con `$` (pagado), `NO` (el local no
     tiene ese servicio), `TODAVIA NO` (pendiente), vacío (falta
     cargar), texto libre tipo `7430 USD` (USD), `$ COMEDOR` (mixto).
   - Hay filas calculadas tipo `TOTAL`, `ALQUILERES EN TRANSFERENCIAS`,
     etc. La fila `TOTAL` se filtra del listado.

2. **Tab `ÍNDICE`** (creado por la dashboard, no por Iara):
   - Fuente de verdad para CATEGORIZACIÓN de servicios y locales.
   - Sección LOCALES: `Columna en mes` | `Ancla` | `Nombre largo` | `Notas`.
   - Sección SERVICIOS: `Servicio` | `Categoría` | `Periodicidad` |
     `Día venc` | `Notas`.
   - Sección CONVENCIONES: glosario de NO/TODAVIA NO/etc.
   - Se regenera desde `POST /api/servicios/seed-indice` (owner only,
     idempotente — borra y recrea el tab).

3. **Anclas** (taxonomía operativa, definida en `lib/anclas.ts`):
   LH1..LH6 (locales físicos) + CRONKLAM (empresa) + MyP (personal
   Martín y Melanie). Mapeo a las columnas del Sheet:
   ```
   SEGUI       → LH1
   NICARAGUA   → LH2
   MAURE       → LH3 (Casa Lharmonie)
   ZABALA      → LH4
   LIBERTADOR  → LH5
   NUÑEZ       → LH6
   BAMBINA     → CRONKLAM
   CASA MEL Y MARTIN → MyP
   BAIGUN      → cta cte subarriendo (no es local)
   ```

## La UI tiene 4 tabs

1. **Tabla** — vista pivot del mes seleccionado. Lee `GET /api/servicios/mes?periodo=YYYY-MM`.
   Renderea filas = servicios canonicalizados (ver `nombreCanonico`)
   × cols = locales LH1..LH6. Click en una celda abre
   `RegistrarPagoModal` que escribe a esa celda exacta del Sheet vía
   `POST /api/servicios/celda` (solo si la celda está vacía o
   `TODAVIA NO` — nunca pisa valor cargado salvo `forzar: true`).
   Debajo de la tabla, dos cards separadas: Cronklam (corporativo) +
   Martín y Melanie (filas que solo aparecen en esos anclas, no en
   los locales). El servicio se sigue mostrando con su monto/estado.
2. **Calendario** — agrupa servicios del ÍNDICE por día de
   vencimiento. Cards con día/mes en badge, chip de categoría
   color-coded, "✓ pagado" o "Pendiente" según data del mes
   seleccionado. Auto-scroll al banner HOY al mount.
3. **Listado** — KPI cards (Pagado este mes / Falta pagar) + toggle
   "Por Local" / "Por Categoría". Cada card es expandible y muestra
   los servicios reales con su monto del mes. Click servicio →
   abre RegistrarPagoModal.
4. **Baigun** — saldo cta cte del subarriendo Libertador. Lee la
   columna J del tab del mes. Muestra hero (saldo positivo/negativo),
   débitos/créditos, lista de movimientos.

## Garantías sobre el Sheet

- **Read-only** sobre los tabs mensuales (`MAYO 26`, `ABRIL 26`, …)
  EXCEPTO el endpoint `POST /api/servicios/celda` que escribe en una
  celda específica, y SOLO si la celda está vacía o `TODAVIA NO`.
  Nunca pisa `NO` (afirmación de Iara que el local no tiene el
  servicio) ni un valor cargado (salvo confirmación explícita).
- El endpoint `POST /api/servicios/seed-indice` (owner only) escribe
  el tab `ÍNDICE` — es idempotente, borra y recrea.

## Env vars

- `SERVICIOS_SHEET_ID` (default hardcoded en código por compat).
- `GOOGLE_CREDENTIALS` (JSON del service account `dashboard-sheets-writer@bistrosoft-lharmonie.iam.gserviceaccount.com`).
- Service account compartido como **Editor** del Sheet.

## Endpoints API (todos `force-dynamic`, withAuth)

| Endpoint                                  | Método | Rol         | Qué hace |
|-------------------------------------------|--------|-------------|----------|
| `/api/servicios/meses`                    | GET    | servicios   | Lista todos los tabs mensuales del Sheet (parseados a YYYY-MM, label, etc) |
| `/api/servicios/mes?periodo=YYYY-MM`      | GET    | servicios   | Lee tab del mes pedido, parsea el pivot a ServicioMes (filas locales / cronklam / myp, totales, conteos) |
| `/api/servicios/indice`                   | GET    | servicios   | Lee tab ÍNDICE → `{ locales, servicios, tabExiste }` |
| `/api/servicios/celda`                    | POST   | servicios   | Escribe en una celda específica del mes (validación anti-overwrite) |
| `/api/servicios/seed-indice`              | POST   | owner       | Crea/regenera el tab ÍNDICE con formato + contenido canónico |
| `/api/servicios`                          | GET/POST | servicios | CRUD del catálogo (`Servicios Catalogo` tab — fallback al modelo viejo del staff, devuelve [] si el tab no existe) |
| `/api/servicios/pagos`                    | GET/POST | servicios | CRUD de pagos (`Servicios Pagos` tab — idem fallback) |
| `/api/servicios/marcar-mes-pagado`        | POST   | servicios   | Bulk: marca todos los servicios activos del mes como pagados al monto estimado (legacy del modelo catálogo+pagos) |

## Archivos del módulo

| Archivo | Líneas | Función |
|---------|-------:|---------|
| `src/lib/anclas.ts`                       | 62 | Tipo Ancla + mapping a labels + helper inferAnclaFromLocal |
| `src/lib/servicios.ts`                    | 255 | Types (ServicioCatalogo, ServicioPago, BaigunMovimiento), constantes (TIPOS_SERVICIO, PERIODICIDADES, MEDIOS_PAGO, TIPO_LABELS, TIPO_COLORS, MEDIO_LABELS), headers de tabs, helpers (nuevoIdServicio, nuevoIdPago, periodoActual, hoyISO, sugerirAnclaPorTipo, toSheetBool/fromSheetBool) |
| `src/lib/servicios-mes.ts`                | 432 | Parser del pivot mensual (parseMesPivot), canonicalización (nombreCanonico), mapping LOCAL_TO_ANCLA + reverse, periodoToTab/parsePeriodoTab |
| `src/lib/servicios-server.ts`             | 357 | Sheet I/O (server-only). listCatalogo/appendServicio/updateServicio, listPagos/appendPago/appendPagosBatch, listBaigun/appendBaigun. Devuelve [] si el tab no existe |
| `src/app/api/servicios/route.ts`          | 137 | GET catálogo + POST upsert servicio |
| `src/app/api/servicios/mes/route.ts`      | 69 | GET ?periodo=YYYY-MM → ServicioMes parsed |
| `src/app/api/servicios/meses/route.ts`    | 45 | GET → lista de meses (tabs) |
| `src/app/api/servicios/indice/route.ts`   | 136 | GET → IndiceLocal[] + IndiceServicio[] |
| `src/app/api/servicios/celda/route.ts`    | 218 | POST escribir celda con anti-overwrite |
| `src/app/api/servicios/seed-indice/route.ts` | 456 | POST regenerar tab ÍNDICE con formato |
| `src/app/api/servicios/pagos/route.ts`    | 113 | GET pagos + POST nuevo pago |
| `src/app/api/servicios/marcar-mes-pagado/route.ts` | 115 | POST bulk marcar pagado |
| `src/app/servicios/page.tsx`              | 2485 | UI completa (4 tabs + modal + drawer + helpers) |

Total: ~4880 líneas.

---

# CÓDIGO COMPLETO


## 1. lib/anclas.ts

**Path:** `src/lib/anclas.ts`

```typescript
// Anclas — taxonomía transversal para clasificar todo gasto
// (servicios, caja chica, etc) por unidad de negocio.
//
// Espejo del staff (`~/Desktop/lharmonie-staff/src/lib/servicios.ts`):
// - LH1..LH6 → locales físicos
// - CRONKLAM → empresa (gastos corporativos / impositivos sin local)
// - MyP     → personal de los dueños (NO entra en métricas op)

export type Ancla =
  | 'LH1'
  | 'LH2'
  | 'LH3'
  | 'LH4'
  | 'LH5'
  | 'LH6'
  | 'CRONKLAM'
  | 'MyP';

export const ANCLAS: Ancla[] = [
  'LH1', 'LH2', 'LH3', 'LH4', 'LH5', 'LH6', 'CRONKLAM', 'MyP',
];

export const ANCLA_LABELS: Record<Ancla, string> = {
  LH1: 'Lharmonie 1 (LH1)',
  LH2: 'Lharmonie Nicaragua (LH2)',
  LH3: 'Casa Lharmonie (LH3)',
  LH4: 'Lharmonie Zabala (LH4)',
  LH5: 'Lharmonie Libertador (LH5)',
  LH6: 'Lharmonie 6 (LH6)',
  CRONKLAM: 'Cronklam (empresa)',
  MyP: 'Martín y Melanie (personal)',
};

export const ANCLA_SHORT: Record<Ancla, string> = {
  LH1: 'LH1',
  LH2: 'LH2 Nicaragua',
  LH3: 'LH3 Casa',
  LH4: 'LH4 Zabala',
  LH5: 'LH5 Libertador',
  LH6: 'LH6',
  CRONKLAM: 'Cronklam',
  MyP: 'M&P',
};

export function isAncla(x: string | undefined | null): x is Ancla {
  if (!x) return false;
  return (ANCLAS as string[]).includes(x);
}

/** Bridge: el Sheet de Facturas trae `Local` con strings tipo "Lharmonie 1"
 *  o "Casa Lharmonie". Mapeamos a Ancla cuando podemos. */
export function inferAnclaFromLocal(local: string | undefined | null): Ancla | null {
  if (!local) return null;
  const s = local.toLowerCase().trim();
  if (s.includes('nicaragua') || s.includes('lh2')) return 'LH2';
  if (s.includes('casa') || s.includes('lh3')) return 'LH3';
  if (s.includes('zabala') || s.includes('lh4')) return 'LH4';
  if (s.includes('libertador') || s.includes('lh5')) return 'LH5';
  if (s.includes('lh6')) return 'LH6';
  if (s.includes('lh1') || /\b1\b/.test(s)) return 'LH1';
  return null;
}

```

## 2. lib/servicios.ts

**Path:** `src/lib/servicios.ts`

```typescript
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

```

## 3. lib/servicios-mes.ts (parser pivot mensual)

**Path:** `src/lib/servicios-mes.ts`

```typescript
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

```

## 4. lib/servicios-server.ts (Sheet I/O)

**Path:** `src/lib/servicios-server.ts`

```typescript
import 'server-only';

// Servicios — Sheet I/O (server-only). Lee y escribe al
// `SERVICIOS_SHEET_ID` con service account (`GOOGLE_CREDENTIALS`).
//
// IMPORTANTE: NO hay autocreate de tabs. Si el tab no existe el
// endpoint devuelve un error claro. El usuario decidió que no creemos
// tabs nuevos hasta confirmar el formato existente.

import { google } from 'googleapis';
import {
  SERVICIOS_CATALOGO_HEADERS,
  SERVICIOS_CATALOGO_TAB,
  SERVICIOS_PAGOS_HEADERS,
  SERVICIOS_PAGOS_TAB,
  BAIGUN_CTA_CTE_HEADERS,
  BAIGUN_CTA_CTE_TAB,
  toSheetBool,
  fromSheetBool,
  type ServicioCatalogo,
  type ServicioPago,
  type BaigunMovimiento,
  type TipoServicio,
  type Periodicidad,
  type MedioPago,
} from './servicios';
import { ANCLAS, type Ancla } from './anclas';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';

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

export class ServiciosError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function ensureConfigured(): SheetsClient {
  const sheets = getSheetsClient();
  if (!sheets) {
    throw new ServiciosError(
      500,
      'GOOGLE_CREDENTIALS no configurado. Subí el JSON del service account a Vercel.',
    );
  }
  if (!SHEET_ID) {
    throw new ServiciosError(
      500,
      'SERVICIOS_SHEET_ID no configurado. Setealo en Vercel.',
    );
  }
  return sheets;
}

async function readTab(
  sheets: SheetsClient,
  tab: string,
): Promise<string[][]> {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tab}'!A1:Z3000`,
    });
    return res.data.values || [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error leyendo Sheet';
    // El error típico cuando el tab no existe es:
    //   "Unable to parse range: 'NombreDelTab'!A1:Z3000"
    // En ese caso devolvemos lista vacía en lugar de tirar, así
    // la UI puede mostrar empty state limpio en vez de error rojo.
    // (Esto cubre el caso del Sheet real de SERVICIOS que es pivot
    // mensual y NO tiene los tabs catálogo/pagos que el código viejo
    // del staff asume.)
    if (msg.toLowerCase().includes('unable to parse range')) {
      console.warn(`[servicios] tab "${tab}" no existe — devolviendo vacío.`);
      return [];
    }
    throw new ServiciosError(
      500,
      `No se pudo leer "${tab}". Verificá que el tab exista y que el service account tenga acceso. (${msg})`,
    );
  }
}

function parseNum(v: string | undefined | null): number {
  if (!v) return 0;
  const n = parseFloat(
    String(v)
      .replace(/\$/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^0-9.\-]/g, ''),
  );
  return isNaN(n) ? 0 : n;
}

function parseInt0(v: string | undefined | null): number {
  if (!v) return 0;
  const n = parseInt(String(v).replace(/[^0-9\-]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

// ─── Catálogo ─────────────────────────────────────────────────────

function rowToServicio(row: string[]): ServicioCatalogo | null {
  const id = (row[0] || '').trim();
  if (!id) return null;
  const ancla = (row[2] || '').trim() as Ancla;
  if (!ANCLAS.includes(ancla)) return null;
  return {
    id,
    tipo: ((row[1] || 'otro').trim().toLowerCase() as TipoServicio) || 'otro',
    ancla,
    local: (row[3] || '').trim(),
    nombreVisible: (row[4] || '').trim(),
    titularNombre: (row[5] || '').trim(),
    titularCuit: (row[6] || '').trim(),
    cuentaNumero: (row[7] || '').trim(),
    direccionServicio: (row[8] || '').trim(),
    periodicidad:
      ((row[9] || 'mensual').trim().toLowerCase() as Periodicidad) || 'mensual',
    montoEstimadoArs: parseNum(row[10]),
    vencimientoDia: row[11] ? parseInt0(row[11]) || null : null,
    notas: (row[12] || '').trim(),
    activo: fromSheetBool(row[13]),
    creadoEn: (row[14] || '').trim(),
    creadoPor: (row[15] || '').trim(),
    subarrendadoBaigun: fromSheetBool(row[16]),
    baigunPorcentaje: parseNum(row[17]),
    metodoPago: ((row[18] || '').trim().toLowerCase() as MedioPago) || '',
    cbuPago: (row[19] || '').trim(),
    cuentaPagoAlias: (row[20] || '').trim(),
    montoEstimadoUsd: parseNum(row[21]),
    montoEstimadoTransfer: parseNum(row[22]),
  };
}

function servicioToRow(s: ServicioCatalogo): string[] {
  return [
    s.id,
    s.tipo,
    s.ancla,
    s.local,
    s.nombreVisible,
    s.titularNombre,
    s.titularCuit,
    s.cuentaNumero,
    s.direccionServicio,
    s.periodicidad,
    String(s.montoEstimadoArs || 0),
    s.vencimientoDia ? String(s.vencimientoDia) : '',
    s.notas,
    toSheetBool(s.activo),
    s.creadoEn,
    s.creadoPor,
    toSheetBool(s.subarrendadoBaigun),
    String(s.baigunPorcentaje || 0),
    s.metodoPago,
    s.cbuPago,
    s.cuentaPagoAlias,
    String(s.montoEstimadoUsd || 0),
    String(s.montoEstimadoTransfer || 0),
  ];
}

export async function listCatalogo(): Promise<ServicioCatalogo[]> {
  const sheets = ensureConfigured();
  const rows = await readTab(sheets, SERVICIOS_CATALOGO_TAB);
  if (rows.length < 2) return [];
  return rows
    .slice(1)
    .map(rowToServicio)
    .filter((s): s is ServicioCatalogo => s !== null);
}

export async function appendServicio(s: ServicioCatalogo): Promise<void> {
  const sheets = ensureConfigured();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${SERVICIOS_CATALOGO_TAB}'!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: [servicioToRow(s)] },
  });
}

export async function updateServicio(s: ServicioCatalogo): Promise<void> {
  const sheets = ensureConfigured();
  const rows = await readTab(sheets, SERVICIOS_CATALOGO_TAB);
  const idx = rows.findIndex((r) => (r[0] || '').trim() === s.id);
  if (idx <= 0) {
    throw new ServiciosError(404, `Servicio ${s.id} no encontrado`);
  }
  const rowNum = idx + 1; // header en fila 1, data desde fila 2; idx es 0-based en rows
  const lastCol = String.fromCharCode(
    'A'.charCodeAt(0) + SERVICIOS_CATALOGO_HEADERS.length - 1,
  );
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${SERVICIOS_CATALOGO_TAB}'!A${rowNum}:${lastCol}${rowNum}`,
    valueInputOption: 'RAW',
    requestBody: { values: [servicioToRow(s)] },
  });
}

// ─── Pagos ────────────────────────────────────────────────────────

function rowToPago(row: string[]): ServicioPago | null {
  const id = (row[0] || '').trim();
  if (!id) return null;
  const ancla = (row[5] || '').trim() as Ancla;
  if (!ANCLAS.includes(ancla)) return null;
  return {
    id,
    servicioId: (row[1] || '').trim(),
    periodo: (row[2] || '').trim(),
    fechaPago: (row[3] || '').trim(),
    fechaAnclada: (row[4] || '').trim(),
    ancla,
    montoTotalArs: parseNum(row[6]),
    montoArsEfectivo: parseNum(row[7]),
    montoUsd: parseNum(row[8]),
    tipoCambioUsd: parseNum(row[9]),
    montoTransferenciaArs: parseNum(row[10]),
    medioPago: ((row[11] || 'efectivo').trim().toLowerCase() as MedioPago) || 'efectivo',
    comprobanteUrl: (row[12] || '').trim(),
    notas: (row[13] || '').trim(),
    cargadoPor: (row[14] || '').trim(),
    baigunShareArs: parseNum(row[15]),
  };
}

function pagoToRow(p: ServicioPago): string[] {
  return [
    p.id,
    p.servicioId,
    p.periodo,
    p.fechaPago,
    p.fechaAnclada,
    p.ancla,
    String(p.montoTotalArs || 0),
    String(p.montoArsEfectivo || 0),
    String(p.montoUsd || 0),
    String(p.tipoCambioUsd || 0),
    String(p.montoTransferenciaArs || 0),
    p.medioPago,
    p.comprobanteUrl,
    p.notas,
    p.cargadoPor,
    String(p.baigunShareArs || 0),
  ];
}

export async function listPagos(servicioId?: string): Promise<ServicioPago[]> {
  const sheets = ensureConfigured();
  const rows = await readTab(sheets, SERVICIOS_PAGOS_TAB);
  if (rows.length < 2) return [];
  const all = rows
    .slice(1)
    .map(rowToPago)
    .filter((p): p is ServicioPago => p !== null);
  return servicioId ? all.filter((p) => p.servicioId === servicioId) : all;
}

export async function appendPago(p: ServicioPago): Promise<void> {
  const sheets = ensureConfigured();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${SERVICIOS_PAGOS_TAB}'!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: [pagoToRow(p)] },
  });
}

/** Append batch — para bulk marcar-mes-pagado, una sola API call. */
export async function appendPagosBatch(pagos: ServicioPago[]): Promise<void> {
  if (pagos.length === 0) return;
  const sheets = ensureConfigured();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${SERVICIOS_PAGOS_TAB}'!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: pagos.map(pagoToRow) },
  });
}

// ─── Baigun ───────────────────────────────────────────────────────

function rowToBaigun(row: string[]): BaigunMovimiento | null {
  const id = (row[0] || '').trim();
  if (!id) return null;
  return {
    id,
    fecha: (row[1] || '').trim(),
    concepto: (row[2] || '').trim(),
    cargo: parseNum(row[3]),
    pago: parseNum(row[4]),
    saldoDespues: parseNum(row[5]),
    notas: (row[6] || '').trim(),
    cargadoPor: (row[7] || '').trim(),
  };
}

export async function listBaigun(): Promise<BaigunMovimiento[]> {
  const sheets = ensureConfigured();
  const rows = await readTab(sheets, BAIGUN_CTA_CTE_TAB);
  if (rows.length < 2) return [];
  return rows
    .slice(1)
    .map(rowToBaigun)
    .filter((m): m is BaigunMovimiento => m !== null);
}

export async function appendBaigun(m: BaigunMovimiento): Promise<void> {
  const sheets = ensureConfigured();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${BAIGUN_CTA_CTE_TAB}'!A2`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        m.id,
        m.fecha,
        m.concepto,
        String(m.cargo || 0),
        String(m.pago || 0),
        String(m.saldoDespues || 0),
        m.notas,
        m.cargadoPor,
      ]],
    },
  });
}

// Re-export para que los routes no necesiten doble import
export {
  SERVICIOS_CATALOGO_HEADERS,
  SERVICIOS_PAGOS_HEADERS,
  BAIGUN_CTA_CTE_HEADERS,
};

```

# API ROUTES

## 5. /api/servicios/route.ts (catálogo CRUD)

**Path:** `src/app/api/servicios/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import {
  listCatalogo,
  appendServicio,
  updateServicio,
  ServiciosError,
} from '@/lib/servicios-server';
import {
  TIPOS_SERVICIO,
  PERIODICIDADES,
  MEDIOS_PAGO,
  nuevoIdServicio,
  hoyISO,
  type ServicioCatalogo,
  type TipoServicio,
  type Periodicidad,
  type MedioPago,
} from '@/lib/servicios';
import { ANCLAS, type Ancla } from '@/lib/anclas';

export const GET = withAuth(async (_req, user) => {
  if (!hasCapability(user.email, 'servicios')) {
    throw new AuthError(403, 'No tenés acceso a Servicios');
  }
  try {
    const items = await listCatalogo();
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return handleError(err);
  }
});

interface PostBody {
  id?: string;
  tipo?: string;
  ancla?: string;
  local?: string;
  nombreVisible?: string;
  titularNombre?: string;
  titularCuit?: string;
  cuentaNumero?: string;
  direccionServicio?: string;
  periodicidad?: string;
  montoEstimadoArs?: number;
  montoEstimadoUsd?: number;
  montoEstimadoTransfer?: number;
  vencimientoDia?: number | null;
  notas?: string;
  activo?: boolean;
  subarrendadoBaigun?: boolean;
  baigunPorcentaje?: number;
  metodoPago?: string;
  cbuPago?: string;
  cuentaPagoAlias?: string;
}

export const POST = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'servicios')) {
    throw new AuthError(403, 'No tenés acceso a Servicios');
  }
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }

  const tipo = (body.tipo || '').trim().toLowerCase() as TipoServicio;
  if (!TIPOS_SERVICIO.includes(tipo)) {
    return NextResponse.json({ ok: false, error: 'Tipo inválido' }, { status: 400 });
  }
  const ancla = (body.ancla || '').trim() as Ancla;
  if (!ANCLAS.includes(ancla)) {
    return NextResponse.json({ ok: false, error: 'Ancla inválida' }, { status: 400 });
  }
  const periodicidad = (body.periodicidad || 'mensual').trim().toLowerCase() as Periodicidad;
  if (!PERIODICIDADES.includes(periodicidad)) {
    return NextResponse.json({ ok: false, error: 'Periodicidad inválida' }, { status: 400 });
  }
  const metodoPago = (body.metodoPago || '').trim().toLowerCase();
  if (metodoPago && !MEDIOS_PAGO.includes(metodoPago as MedioPago)) {
    return NextResponse.json({ ok: false, error: 'Método pago inválido' }, { status: 400 });
  }

  const isUpdate = !!body.id;
  const servicio: ServicioCatalogo = {
    id: body.id || nuevoIdServicio(),
    tipo,
    ancla,
    local: (body.local || '').trim(),
    nombreVisible: (body.nombreVisible || '').trim(),
    titularNombre: (body.titularNombre || '').trim(),
    titularCuit: (body.titularCuit || '').trim(),
    cuentaNumero: (body.cuentaNumero || '').trim(),
    direccionServicio: (body.direccionServicio || '').trim(),
    periodicidad,
    montoEstimadoArs: Number(body.montoEstimadoArs || 0),
    montoEstimadoUsd: Number(body.montoEstimadoUsd || 0),
    montoEstimadoTransfer: Number(body.montoEstimadoTransfer || 0),
    vencimientoDia: body.vencimientoDia ?? null,
    notas: (body.notas || '').trim(),
    activo: body.activo !== false,
    creadoEn: isUpdate ? '' : hoyISO(),
    creadoPor: isUpdate ? '' : user.email,
    subarrendadoBaigun: !!body.subarrendadoBaigun,
    baigunPorcentaje: Number(body.baigunPorcentaje || 0),
    metodoPago: metodoPago as MedioPago | '',
    cbuPago: (body.cbuPago || '').trim(),
    cuentaPagoAlias: (body.cuentaPagoAlias || '').trim(),
  };

  try {
    if (isUpdate) {
      await updateServicio(servicio);
    } else {
      await appendServicio(servicio);
    }
    return NextResponse.json({
      ok: true,
      action: isUpdate ? 'updated' : 'created',
      id: servicio.id,
    });
  } catch (err) {
    return handleError(err);
  }
});

function handleError(err: unknown) {
  if (err instanceof ServiciosError) {
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
  }
  console.error('[SERVICIOS]', err);
  const msg = err instanceof Error ? err.message : 'Error interno';
  return NextResponse.json({ ok: false, error: msg }, { status: 500 });
}

```

## 6. /api/servicios/mes/route.ts (lee mes pivot)

**Path:** `src/app/api/servicios/mes/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import { getSheetsClient } from '@/lib/servicios-server';
import {
  parseMesPivot,
  periodoToTab,
  periodoToLabel,
} from '@/lib/servicios-mes';

export const dynamic = 'force-dynamic';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';

// GET /api/servicios/mes?periodo=YYYY-MM
// Lee el tab pivot del mes pedido (formato "MAYO 26") y lo devuelve
// parseado: locales como cols, servicios como filas, celdas
// clasificadas (pagado/pendiente/no_aplica/vacio), totales por local
// y conteo de pendientes.
export const GET = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'servicios')) {
    throw new AuthError(403, 'No tenés acceso a Servicios');
  }
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    return NextResponse.json(
      { ok: false, error: 'GOOGLE_CREDENTIALS o SERVICIOS_SHEET_ID no configurados' },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const periodo = url.searchParams.get('periodo') || '';
  if (!periodo.match(/^\d{4}-\d{2}$/)) {
    return NextResponse.json(
      { ok: false, error: 'periodo inválido (esperado YYYY-MM)' },
      { status: 400 },
    );
  }
  const [yearStr, monthStr] = periodo.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const tabName = periodoToTab(year, month);
  const label = periodoToLabel(year, month);

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A1:Z60`,
    });
    const rows = res.data.values || [];
    const data = parseMesPivot(rows, periodo, tabName, label);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    if (msg.toLowerCase().includes('unable to parse range')) {
      return NextResponse.json(
        {
          ok: false,
          error: `El tab "${tabName}" no existe en el Sheet. Iara tiene que crearlo manual primero.`,
          tabFaltante: tabName,
        },
        { status: 404 },
      );
    }
    console.error('[SERVICIOS/MES]', err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});

```

## 7. /api/servicios/meses/route.ts (lista meses)

**Path:** `src/app/api/servicios/meses/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import { getSheetsClient } from '@/lib/servicios-server';
import { parsePeriodoTab } from '@/lib/servicios-mes';

export const dynamic = 'force-dynamic';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';

// GET /api/servicios/meses
// Devuelve la lista de tabs mensuales del Sheet (formato "MAYO 26" →
// periodo "2026-05"), ordenados del más reciente al más viejo.
export const GET = withAuth(async (_req, user) => {
  if (!hasCapability(user.email, 'servicios')) {
    throw new AuthError(403, 'No tenés acceso a Servicios');
  }
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    return NextResponse.json(
      { ok: false, error: 'GOOGLE_CREDENTIALS o SERVICIOS_SHEET_ID no configurados' },
      { status: 500 },
    );
  }
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      fields: 'sheets.properties.title',
    });
    const tabs = (meta.data.sheets || [])
      .map((s) => s.properties?.title || '')
      .filter((t) => t.length > 0);
    const meses = tabs
      .map((t) => parsePeriodoTab(t))
      .filter((p): p is NonNullable<ReturnType<typeof parsePeriodoTab>> => p !== null)
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
    return NextResponse.json({ ok: true, meses });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});

```

## 8. /api/servicios/indice/route.ts (lee ÍNDICE)

**Path:** `src/app/api/servicios/indice/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import { getSheetsClient } from '@/lib/servicios-server';

export const dynamic = 'force-dynamic';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';
const TAB_NAME = 'ÍNDICE';

export interface IndiceLocal {
  col: string;        // nombre que aparece en los tabs mensuales (ej "SEGUI")
  ancla: string;      // "LH1" / "LH2" / "MyP" / "—" / "?"
  nombre: string;     // "Lharmonie Seguí"
  notas: string;
}

export interface IndiceServicio {
  servicio: string;        // nombre que aparece en el pivot (ej "BISTROSOFT")
  categoria: string;       // "Luz" / "Internet" / "Otro" etc
  periodicidad: string;    // "mensual" / "bimestral" / "—"
  diaVenc: string;         // "25" / "9" / "—"
  notas: string;
}

// GET /api/servicios/indice
// Lee el tab ÍNDICE del Sheet y devuelve locales + servicios + meta.
// Si el tab no existe (todavía no generado), devuelve listas vacías
// sin error.
export const GET = withAuth(async (_req, user) => {
  if (!hasCapability(user.email, 'servicios')) {
    throw new AuthError(403, 'No tenés acceso a Servicios');
  }
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    return NextResponse.json(
      { ok: false, error: 'Config faltante' },
      { status: 500 },
    );
  }

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${TAB_NAME}'!A1:F60`,
    });
    const rows = res.data.values || [];

    // Layout esperado (seed-indice):
    //   row 1: title (merged)
    //   row 2: subtitle
    //   row 3: empty
    //   row 4: "LOCALES" banner
    //   row 5: table headers [Columna, Ancla, Nombre, Notas]
    //   row 6..14: locales data (9 filas)
    //   row 15: empty
    //   row 16: "SERVICIOS" banner
    //   row 17: table headers [Servicio, Categoría, Periodicidad, Día venc, Notas]
    //   row 18..36: servicios data
    //   ...
    //
    // En vez de hardcodear posiciones, recorremos buscando banners.

    const locales: IndiceLocal[] = [];
    const servicios: IndiceServicio[] = [];

    type Section = 'none' | 'locales' | 'servicios';
    let section: Section = 'none';
    let skipNext = false;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      const a = (row[0] || '').trim();
      if (!a) continue;

      const upper = a.toUpperCase();
      if (upper === 'LOCALES') {
        section = 'locales';
        skipNext = true; // saltar la fila de headers
        continue;
      }
      if (upper === 'SERVICIOS') {
        section = 'servicios';
        skipNext = true;
        continue;
      }
      if (upper === 'CONVENCIONES') {
        section = 'none';
        continue;
      }
      if (upper === 'ÍNDICE — SERVICIOS LHARMONIE' ||
          a.includes('Catálogo maestro')) {
        continue;
      }
      if (skipNext) {
        skipNext = false;
        continue;
      }

      if (section === 'locales') {
        locales.push({
          col: a,
          ancla: (row[1] || '').trim(),
          nombre: (row[2] || '').trim(),
          notas: (row[3] || '').trim(),
        });
      } else if (section === 'servicios') {
        servicios.push({
          servicio: a,
          categoria: (row[1] || '').trim(),
          periodicidad: (row[2] || '').trim(),
          diaVenc: (row[3] || '').trim(),
          notas: (row[4] || '').trim(),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      locales,
      servicios,
      tabExiste: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    if (msg.toLowerCase().includes('unable to parse range')) {
      return NextResponse.json({
        ok: true,
        locales: [],
        servicios: [],
        tabExiste: false,
      });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});

```

## 9. /api/servicios/celda/route.ts (escribe celda)

**Path:** `src/app/api/servicios/celda/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import { getSheetsClient } from '@/lib/servicios-server';
import { periodoToTab } from '@/lib/servicios-mes';

export const dynamic = 'force-dynamic';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';

// Helpers para identificar el header row + ubicar fila por nombre canónico
// (insensitive). Replicamos la lógica que el parser usa para que el writer
// apunte exactamente al mismo lugar visible en la UI.

function colLetter(idx: number): string {
  // 0-indexed → A, B, ...
  let letter = '';
  let n = idx;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

interface PostBody {
  periodo?: string;       // YYYY-MM
  servicioRaw?: string;   // nombre EXACTO como está en col A del Sheet
  localCol?: string;      // header EXACTO de la columna destino (ej "LIBERTADOR")
  valor?: string;         // texto a escribir (ej "$ 458.832" o "1400 USD")
  /** Si true, sobrescribe aunque la celda no esté vacía / TODAVIA NO. */
  forzar?: boolean;
}

// POST /api/servicios/celda
// Body: { periodo, servicioRaw, localCol, valor, forzar? }
//
// Escribe en la celda específica de la pestaña del mes. Por defecto
// SOLO escribe si la celda está vacía o tiene "TODAVIA NO".
// Para sobrescribir el usuario tiene que pasar `forzar: true` explícito.
//
// Si la celda tiene "NO" (el local no tiene este servicio), tampoco
// escribe — eso es una afirmación de Iara que no queremos pisar.
export const POST = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'servicios')) {
    throw new AuthError(403, 'No tenés acceso a Servicios');
  }
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    return NextResponse.json(
      { ok: false, error: 'GOOGLE_CREDENTIALS o SERVICIOS_SHEET_ID no configurados' },
      { status: 500 },
    );
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }

  const periodo = (body.periodo || '').trim();
  const servicioRaw = (body.servicioRaw || '').trim();
  const localCol = (body.localCol || '').trim();
  const valor = (body.valor || '').trim();
  const forzar = body.forzar === true;

  if (!periodo.match(/^\d{4}-\d{2}$/)) {
    return NextResponse.json(
      { ok: false, error: 'periodo inválido (esperado YYYY-MM)' },
      { status: 400 },
    );
  }
  if (!servicioRaw) {
    return NextResponse.json(
      { ok: false, error: 'falta servicioRaw' },
      { status: 400 },
    );
  }
  if (!localCol) {
    return NextResponse.json(
      { ok: false, error: 'falta localCol' },
      { status: 400 },
    );
  }
  if (!valor) {
    return NextResponse.json(
      { ok: false, error: 'falta valor' },
      { status: 400 },
    );
  }

  const [yearStr, monthStr] = periodo.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const tabName = periodoToTab(year, month);

  try {
    // 1) Leer el tab del mes.
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A1:Z60`,
    });
    const rows = readRes.data.values || [];

    // 2) Encontrar header row.
    let headerRow = -1;
    for (let i = 0; i < Math.min(rows.length, 6); i++) {
      const a = (rows[i]?.[0] || '').trim().toUpperCase();
      if (
        a.includes('SERVICIOS A PAGAR') ||
        a === 'SERVICIOS' ||
        a.startsWith('SERVICIOS ')
      ) {
        headerRow = i;
        break;
      }
    }
    if (headerRow < 0) {
      return NextResponse.json(
        { ok: false, error: 'No se encontró fila de headers en el tab.' },
        { status: 500 },
      );
    }
    const headers = (rows[headerRow] || []).map((h) => (h || '').trim().toUpperCase());
    const targetCol = headers.findIndex((h) => h === localCol.toUpperCase());
    if (targetCol < 0) {
      return NextResponse.json(
        { ok: false, error: `Columna "${localCol}" no encontrada en el tab.` },
        { status: 404 },
      );
    }

    // 3) Encontrar fila del servicio (case-insensitive, trim).
    const targetServLower = servicioRaw.toLowerCase();
    let serviceRow = -1;
    for (let i = headerRow + 1; i < rows.length; i++) {
      const a = (rows[i]?.[0] || '').trim();
      if (a.toLowerCase() === targetServLower) {
        serviceRow = i;
        break;
      }
    }
    if (serviceRow < 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Servicio "${servicioRaw}" no encontrado en el tab "${tabName}".`,
        },
        { status: 404 },
      );
    }

    // 4) Leer la celda actual para decidir si escribimos.
    const existing = (rows[serviceRow]?.[targetCol] || '').trim();
    const existingUp = existing.toUpperCase();
    const esEscribible =
      !existing ||
      existingUp === 'TODAVIA NO' ||
      existingUp === 'TODAVÍA NO' ||
      existingUp === 'PENDIENTE' ||
      existingUp === 'PAGAR';

    if (!esEscribible && !forzar) {
      return NextResponse.json(
        {
          ok: false,
          error: `La celda ya tiene "${existing}". Para sobrescribir pasá forzar: true.`,
          valorActual: existing,
        },
        { status: 409 },
      );
    }

    // Nunca pisar "NO" (afirmación de "este local no tiene este servicio").
    if (existingUp === 'NO') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'La celda dice "NO" (ese local no tiene este servicio). Si querés cambiar eso editá el Sheet a mano.',
        },
        { status: 409 },
      );
    }

    // 5) Escribir.
    // Usamos USER_ENTERED para que "$ 1234" lo formatee Sheets como número.
    const cellRange = `'${tabName}'!${colLetter(targetCol)}${serviceRow + 1}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: cellRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[valor]] },
    });

    console.log(
      `[SERVICIOS/CELDA] ${user.email} ${tabName} ${servicioRaw} × ${localCol} = "${valor}" (era "${existing}")`,
    );
    return NextResponse.json({
      ok: true,
      celda: cellRange,
      valorPrevio: existing,
      valorNuevo: valor,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    if (msg.toLowerCase().includes('unable to parse range')) {
      return NextResponse.json(
        { ok: false, error: `El tab "${tabName}" no existe.` },
        { status: 404 },
      );
    }
    console.error('[SERVICIOS/CELDA]', err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});

```

## 10. /api/servicios/seed-indice/route.ts (regenera ÍNDICE)

**Path:** `src/app/api/servicios/seed-indice/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { isOwner } from '@/lib/users';
import { getSheetsClient, ServiciosError } from '@/lib/servicios-server';

export const dynamic = 'force-dynamic';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';
const TAB_NAME = 'ÍNDICE';

// ─── Contenido canónico ───────────────────────────────────────────
// Esto es lo que se escribe en el tab. Iara puede editar los campos
// "?" o "(completar)" después en el Sheet directamente.

const LOCALES = [
  ['SEGUI', 'LH1', 'Lharmonie Seguí', ''],
  ['MAURE', '?', '?', '(completar)'],
  ['NICARAGUA', 'LH2', 'Lharmonie Nicaragua', ''],
  ['ZABALA', 'LH4', 'Lharmonie Zabala', ''],
  ['LIBERTADOR', 'LH5', 'Lharmonie Libertador', 'Subarriendo Baigun'],
  ['NUÑEZ', 'LH6', 'Lharmonie Núñez', ''],
  ['CASA MEL Y MARTIN', 'MyP', 'Casa personal Martín y Melanie', 'No entra en métricas operativas'],
  ['BAMBINA', '?', '?', '(completar)'],
  ['BAIGUN', '—', '(no es local)', 'Saldo cta cte del subarriendo'],
];

const SERVICIOS = [
  ['BISTROSOFT', 'Sistema', 'mensual', '—', 'POS / sistema de gestión'],
  ['TELECOM/FLOW WIFI', 'Internet', 'mensual', '~25', 'Débito automático'],
  ['FLOW WIFI', 'Internet', 'mensual', '—', ''],
  ['METROGAS', 'Gas', 'bimestral', '—', ''],
  ['AYSA', 'Agua', 'bimestral', '—', ''],
  ['ABL', 'Impositivo', 'bimestral', '—', ''],
  ['EDENOR', 'Luz', 'bimestral', '—', ''],
  ['EXPENSAS', 'Expensas', 'mensual', '—', ''],
  ['IVA ALQUILER', 'IVA', 'mensual', '18', ''],
  ['ALQUILERES', 'Alquiler', 'mensual', '—', 'Efectivo'],
  ['ALQUILERES EN TRANSFERENCIAS', 'Alquiler', 'mensual', '—', 'Por transferencia'],
  ['AJDUT', 'Otro', '—', '—', ''],
  ['UTHGRA', 'Otro', '—', '—', ''],
  ['RUBRICA', 'Otro', '—', '—', ''],
  ['CONTADORAS', 'Otro', '—', '—', ''],
  ['SOMO', 'Otro', '—', '—', ''],
  ['YESHURUN MEIR', 'Otro', '—', '—', ''],
  ['VEP CS 09 DE CADA MES', 'Impositivo', 'mensual', '9', ''],
  ['VEP IVA 18 DE CADA MES', 'IVA', 'mensual', '18', ''],
];

const CONVENCIONES = [
  ['"NO"', '→', 'el local no tiene ese servicio'],
  ['"TODAVIA NO"', '→', 'pendiente de pago este mes'],
  ['"$ XX.XXX,XX"', '→', 'importe del mes (pagado o estimado)'],
  ['vacío', '→', 'falta cargar / a definir'],
  ['col BAIGUN', '→', 'saldo cta cte del subarriendo Libertador'],
  ['negativos', '→', 'saldo a favor / a cobrar'],
];

// ─── Colores ──────────────────────────────────────────────────────
// Espresso oscuro para el header, dorado Lharmonie para secciones.

const COLOR_HEADER_BG = rgb(0x0d, 0x08, 0x05); // #0D0805
const COLOR_HEADER_FG = rgb(0xf9, 0xf7, 0xf3); // #F9F7F3 cream
const COLOR_SECTION_BG = rgb(0xc4, 0xa0, 0x67); // #C4A067 dorado
const COLOR_SECTION_FG = rgb(0x1e, 0x15, 0x12); // espresso para text
const COLOR_TABLE_HEADER_BG = rgb(0xf5, 0xee, 0xe3); // crema sutil
const COLOR_BORDER = rgb(0xc4, 0xa0, 0x67); // dorado para bordes finos
const COLOR_ROW_ALT = rgb(0xfa, 0xf6, 0xef); // fondo zebra suave

function rgb(r: number, g: number, b: number) {
  return { red: r / 255, green: g / 255, blue: b / 255 };
}

export const POST = withAuth(async (req, user) => {
  if (!isOwner(user.email)) {
    throw new AuthError(403, 'Solo el owner puede regenerar el ÍNDICE.');
  }
  if (!SHEET_ID) {
    return NextResponse.json(
      { ok: false, error: 'SERVICIOS_SHEET_ID no configurado.' },
      { status: 500 },
    );
  }
  const sheets = getSheetsClient();
  if (!sheets) {
    return NextResponse.json(
      { ok: false, error: 'GOOGLE_CREDENTIALS no configurado.' },
      { status: 500 },
    );
  }

  try {
    // 1) Buscar si ya existe el tab.
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      fields: 'sheets.properties(sheetId,title,index)',
    });
    const existing = (meta.data.sheets || []).find(
      (s) => s.properties?.title === TAB_NAME,
    );

    // 2) Si existe, borrar.
    if (existing?.properties?.sheetId !== undefined) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [
            { deleteSheet: { sheetId: existing.properties.sheetId } },
          ],
        },
      });
    }

    // 3) Crear nuevo tab al principio del Sheet (index 0) para que sea lo primero que se ve.
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: TAB_NAME,
                index: 0,
                gridProperties: {
                  rowCount: 60,
                  columnCount: 6,
                  frozenRowCount: 2,
                },
                tabColor: COLOR_SECTION_BG,
              },
            },
          },
        ],
      },
    });
    const newSheetId =
      addRes.data.replies?.[0]?.addSheet?.properties?.sheetId;
    if (newSheetId === undefined || newSheetId === null) {
      throw new Error('No se pudo obtener el sheetId del nuevo tab');
    }

    // 4) Calcular rows para escribir.
    const titleRow = 1;
    const subtitleRow = 2;
    // (fila 3 vacía)
    const localesHeaderRow = 4;        // banner "LOCALES"
    const localesTableHeaderRow = 5;   // headers de la tabla
    const localesFirstDataRow = 6;
    const localesLastDataRow = localesFirstDataRow + LOCALES.length - 1; // 14
    // (1 fila vacía)
    const serviciosHeaderRow = localesLastDataRow + 2;       // 16
    const serviciosTableHeaderRow = serviciosHeaderRow + 1;  // 17
    const serviciosFirstDataRow = serviciosTableHeaderRow + 1; // 18
    const serviciosLastDataRow = serviciosFirstDataRow + SERVICIOS.length - 1; // 36
    // (1 fila vacía)
    const convencionesHeaderRow = serviciosLastDataRow + 2;  // 38
    const convencionesFirstDataRow = convencionesHeaderRow + 1; // 39
    const convencionesLastDataRow = convencionesFirstDataRow + CONVENCIONES.length - 1; // 44

    // 5) Construir matriz de valores y escribir en una llamada.
    const values: string[][] = [];
    const pad = (arr: string[], n: number) => {
      const out = [...arr];
      while (out.length < n) out.push('');
      return out;
    };
    const empty = () => ['', '', '', '', '', ''];

    // Row 1: title (merged A:E)
    values.push(pad(['ÍNDICE — SERVICIOS LHARMONIE'], 6));
    // Row 2: subtitle
    values.push(pad(['Catálogo maestro de servicios, locales y convenciones de uso del Sheet'], 6));
    // Row 3: empty
    values.push(empty());
    // Row 4: LOCALES banner
    values.push(pad(['LOCALES'], 6));
    // Row 5: table headers
    values.push(pad(['Columna en mes', 'Ancla', 'Nombre largo', 'Notas'], 6));
    // Rows 6-14: locales data
    for (const row of LOCALES) values.push(pad(row, 6));
    // Empty
    values.push(empty());
    // Row 16: SERVICIOS banner
    values.push(pad(['SERVICIOS'], 6));
    // Row 17: table headers
    values.push(pad(['Servicio', 'Categoría', 'Periodicidad', 'Día venc', 'Notas'], 6));
    // Rows 18-36: servicios data
    for (const row of SERVICIOS) values.push(pad(row, 6));
    // Empty
    values.push(empty());
    // Row 38: CONVENCIONES banner
    values.push(pad(['CONVENCIONES'], 6));
    // Rows 39-44: convenciones
    for (const row of CONVENCIONES) values.push(pad(row, 6));

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${TAB_NAME}'!A1:F${values.length}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });

    // 6) Formato: merges + estilos + bordes en un solo batchUpdate.
    const requests: object[] = [];

    // Helper para repeatCell
    const fmtRange = (
      startRow: number,
      endRow: number,
      startCol: number,
      endCol: number,
      format: object,
      fields: string,
    ) => ({
      repeatCell: {
        range: {
          sheetId: newSheetId,
          startRowIndex: startRow - 1,
          endRowIndex: endRow,
          startColumnIndex: startCol,
          endColumnIndex: endCol,
        },
        cell: { userEnteredFormat: format },
        fields,
      },
    });

    // Merges
    requests.push({
      mergeCells: {
        range: {
          sheetId: newSheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 6,
        },
        mergeType: 'MERGE_ALL',
      },
    });
    requests.push({
      mergeCells: {
        range: {
          sheetId: newSheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 0,
          endColumnIndex: 6,
        },
        mergeType: 'MERGE_ALL',
      },
    });
    // Section banners merged across full width
    for (const r of [localesHeaderRow, serviciosHeaderRow, convencionesHeaderRow]) {
      requests.push({
        mergeCells: {
          range: {
            sheetId: newSheetId,
            startRowIndex: r - 1,
            endRowIndex: r,
            startColumnIndex: 0,
            endColumnIndex: 6,
          },
          mergeType: 'MERGE_ALL',
        },
      });
    }

    // Title row format
    requests.push(
      fmtRange(1, 1, 0, 6, {
        backgroundColor: COLOR_HEADER_BG,
        textFormat: {
          foregroundColor: COLOR_HEADER_FG,
          fontSize: 18,
          bold: true,
          fontFamily: 'Georgia',
        },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE',
        padding: { top: 16, bottom: 16, left: 12, right: 12 },
      }, 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)'),
    );
    // Subtitle row
    requests.push(
      fmtRange(2, 2, 0, 6, {
        backgroundColor: COLOR_HEADER_BG,
        textFormat: {
          foregroundColor: { red: 0.78, green: 0.74, blue: 0.66 },
          fontSize: 11,
          italic: true,
        },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE',
        padding: { bottom: 14 },
      }, 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)'),
    );

    // Section banners format
    for (const r of [localesHeaderRow, serviciosHeaderRow, convencionesHeaderRow]) {
      requests.push(
        fmtRange(r, r, 0, 6, {
          backgroundColor: COLOR_SECTION_BG,
          textFormat: {
            foregroundColor: COLOR_SECTION_FG,
            fontSize: 12,
            bold: true,
          },
          horizontalAlignment: 'LEFT',
          verticalAlignment: 'MIDDLE',
          padding: { top: 8, bottom: 8, left: 12 },
        }, 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)'),
      );
    }

    // Table header rows (locales + servicios)
    for (const r of [localesTableHeaderRow, serviciosTableHeaderRow]) {
      requests.push(
        fmtRange(r, r, 0, 6, {
          backgroundColor: COLOR_TABLE_HEADER_BG,
          textFormat: {
            foregroundColor: COLOR_SECTION_FG,
            fontSize: 10,
            bold: true,
          },
          horizontalAlignment: 'LEFT',
          verticalAlignment: 'MIDDLE',
          padding: { top: 6, bottom: 6, left: 10 },
        }, 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)'),
      );
    }

    // Data rows base + zebra
    const dataRanges: Array<[number, number]> = [
      [localesFirstDataRow, localesLastDataRow],
      [serviciosFirstDataRow, serviciosLastDataRow],
      [convencionesFirstDataRow, convencionesLastDataRow],
    ];
    for (const [start, end] of dataRanges) {
      // base format
      requests.push(
        fmtRange(start, end, 0, 6, {
          textFormat: { fontSize: 10 },
          verticalAlignment: 'MIDDLE',
          padding: { top: 6, bottom: 6, left: 10, right: 10 },
        }, 'userEnteredFormat(textFormat,verticalAlignment,padding)'),
      );
      // zebra rows (even rows in the data range get tinted)
      for (let r = start; r <= end; r++) {
        if ((r - start) % 2 === 1) {
          requests.push(
            fmtRange(r, r, 0, 6, {
              backgroundColor: COLOR_ROW_ALT,
            }, 'userEnteredFormat.backgroundColor'),
          );
        }
      }
    }

    // Border under table headers (dorado fino)
    for (const r of [localesTableHeaderRow, serviciosTableHeaderRow]) {
      requests.push({
        updateBorders: {
          range: {
            sheetId: newSheetId,
            startRowIndex: r - 1,
            endRowIndex: r,
            startColumnIndex: 0,
            endColumnIndex: 6,
          },
          bottom: {
            style: 'SOLID',
            width: 1,
            color: COLOR_BORDER,
          },
        },
      });
    }

    // Column widths — A más ancho (servicio/local), B-D medianas, E narrow, F amplia
    const colWidths = [220, 110, 200, 110, 280, 40];
    colWidths.forEach((w, i) => {
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId: newSheetId,
            dimension: 'COLUMNS',
            startIndex: i,
            endIndex: i + 1,
          },
          properties: { pixelSize: w },
          fields: 'pixelSize',
        },
      });
    });

    // Row heights — title más alto
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: newSheetId,
          dimension: 'ROWS',
          startIndex: 0,
          endIndex: 1,
        },
        properties: { pixelSize: 56 },
        fields: 'pixelSize',
      },
    });
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: newSheetId,
          dimension: 'ROWS',
          startIndex: 1,
          endIndex: 2,
        },
        properties: { pixelSize: 28 },
        fields: 'pixelSize',
      },
    });

    // Hide gridlines (tipo "portada") — la gridProperties.hideGridlines
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId: newSheetId,
          gridProperties: { hideGridlines: true, frozenRowCount: 2 },
        },
        fields: 'gridProperties.hideGridlines,gridProperties.frozenRowCount',
      },
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests },
    });

    console.log(`[SERVICIOS/SEED-INDICE] ${user.email} regeneró ÍNDICE`);
    return NextResponse.json({
      ok: true,
      message: 'Tab ÍNDICE creado/regenerado',
      locales: LOCALES.length,
      servicios: SERVICIOS.length,
    });
  } catch (err) {
    if (err instanceof ServiciosError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status },
      );
    }
    console.error('[SERVICIOS/SEED-INDICE]', err);
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});

```

## 11. /api/servicios/pagos/route.ts (CRUD pagos)

**Path:** `src/app/api/servicios/pagos/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import {
  listPagos,
  appendPago,
  ServiciosError,
} from '@/lib/servicios-server';
import {
  MEDIOS_PAGO,
  nuevoIdPago,
  hoyISO,
  type ServicioPago,
  type MedioPago,
} from '@/lib/servicios';
import { ANCLAS, type Ancla } from '@/lib/anclas';

export const GET = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'servicios')) {
    throw new AuthError(403, 'No tenés acceso a Servicios');
  }
  const url = new URL(req.url);
  const servicioId = url.searchParams.get('servicioId') || undefined;
  try {
    const items = await listPagos(servicioId);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return handleError(err);
  }
});

interface PostBody {
  servicioId?: string;
  periodo?: string;
  fechaPago?: string;
  ancla?: string;
  montoTotalArs?: number;
  montoArsEfectivo?: number;
  montoUsd?: number;
  tipoCambioUsd?: number;
  montoTransferenciaArs?: number;
  medioPago?: string;
  comprobanteUrl?: string;
  notas?: string;
  baigunShareArs?: number;
}

export const POST = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'servicios')) {
    throw new AuthError(403, 'No tenés acceso a Servicios');
  }
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }

  if (!body.servicioId || !body.periodo) {
    return NextResponse.json(
      { ok: false, error: 'Faltan servicioId o periodo' },
      { status: 400 },
    );
  }
  const ancla = (body.ancla || '').trim() as Ancla;
  if (!ANCLAS.includes(ancla)) {
    return NextResponse.json({ ok: false, error: 'Ancla inválida' }, { status: 400 });
  }
  const medioPago = (body.medioPago || 'efectivo').trim().toLowerCase() as MedioPago;
  if (!MEDIOS_PAGO.includes(medioPago)) {
    return NextResponse.json({ ok: false, error: 'Medio pago inválido' }, { status: 400 });
  }

  // Periodo "anclado" = primer día del mes
  const fechaAnclada = body.periodo.match(/^\d{4}-\d{2}$/)
    ? `${body.periodo}-01`
    : body.periodo;

  const pago: ServicioPago = {
    id: nuevoIdPago(),
    servicioId: body.servicioId,
    periodo: body.periodo,
    fechaPago: body.fechaPago || hoyISO(),
    fechaAnclada,
    ancla,
    montoTotalArs: Number(body.montoTotalArs || 0),
    montoArsEfectivo: Number(body.montoArsEfectivo || 0),
    montoUsd: Number(body.montoUsd || 0),
    tipoCambioUsd: Number(body.tipoCambioUsd || 0),
    montoTransferenciaArs: Number(body.montoTransferenciaArs || 0),
    medioPago,
    comprobanteUrl: (body.comprobanteUrl || '').trim(),
    notas: (body.notas || '').trim(),
    cargadoPor: user.email,
    baigunShareArs: Number(body.baigunShareArs || 0),
  };

  try {
    await appendPago(pago);
    return NextResponse.json({ ok: true, id: pago.id });
  } catch (err) {
    return handleError(err);
  }
});

function handleError(err: unknown) {
  if (err instanceof ServiciosError) {
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
  }
  console.error('[SERVICIOS/PAGOS]', err);
  const msg = err instanceof Error ? err.message : 'Error interno';
  return NextResponse.json({ ok: false, error: msg }, { status: 500 });
}

```

## 12. /api/servicios/marcar-mes-pagado/route.ts (bulk mark)

**Path:** `src/app/api/servicios/marcar-mes-pagado/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import {
  listCatalogo,
  listPagos,
  appendPagosBatch,
  ServiciosError,
} from '@/lib/servicios-server';
import {
  nuevoIdPago,
  hoyISO,
  type ServicioPago,
  type MedioPago,
} from '@/lib/servicios';

export const dynamic = 'force-dynamic';

interface PostBody {
  periodo?: string; // YYYY-MM
  servicioIds?: string[];
  medioPago?: MedioPago;
  fechaPago?: string;
}

// POST /api/servicios/marcar-mes-pagado
// Body: { periodo, servicioIds?, medioPago?, fechaPago? }
// Crea un pago "rápido" por cada servicio activo del periodo dado que
// aún no tenga un pago registrado. Si se pasa `servicioIds`, solo se
// marcan esos. Monto = montoEstimadoArs del catálogo (placeholder
// — el usuario lo edita después si fue distinto).
export const POST = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'servicios')) {
    throw new AuthError(403, 'No tenés acceso a Servicios');
  }
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }

  const periodo = (body.periodo || '').trim();
  if (!periodo.match(/^\d{4}-\d{2}$/)) {
    return NextResponse.json(
      { ok: false, error: 'periodo inválido (esperado YYYY-MM)' },
      { status: 400 },
    );
  }
  const medioPago: MedioPago = body.medioPago || 'efectivo';
  const fechaPago = body.fechaPago || hoyISO();
  const fechaAnclada = `${periodo}-01`;

  try {
    const [catalogo, pagos] = await Promise.all([listCatalogo(), listPagos()]);
    const yaPagados = new Set(
      pagos.filter((p) => p.periodo === periodo).map((p) => p.servicioId),
    );

    const idsFilter = body.servicioIds && body.servicioIds.length > 0
      ? new Set(body.servicioIds)
      : null;

    const candidatos = catalogo.filter((s) => {
      if (!s.activo) return false;
      if (yaPagados.has(s.id)) return false;
      if (idsFilter && !idsFilter.has(s.id)) return false;
      return true;
    });

    if (candidatos.length === 0) {
      return NextResponse.json({ ok: true, marcados: 0, pagos: [] });
    }

    const nuevos: ServicioPago[] = candidatos.map((s) => ({
      id: nuevoIdPago(),
      servicioId: s.id,
      periodo,
      fechaPago,
      fechaAnclada,
      ancla: s.ancla,
      montoTotalArs: s.montoEstimadoArs || 0,
      montoArsEfectivo: medioPago === 'efectivo' ? s.montoEstimadoArs || 0 : 0,
      montoUsd: 0,
      tipoCambioUsd: 0,
      montoTransferenciaArs:
        medioPago === 'transferencia' ? s.montoEstimadoArs || 0 : 0,
      medioPago,
      comprobanteUrl: '',
      notas: 'Marcado rápido (monto estimado del catálogo)',
      cargadoPor: user.email,
      baigunShareArs: 0,
    }));

    await appendPagosBatch(nuevos);
    console.log(
      `[SERVICIOS/MARCAR-MES] ${user.email} ${periodo} +${nuevos.length} pagos`,
    );
    return NextResponse.json({
      ok: true,
      marcados: nuevos.length,
      pagos: nuevos.map((p) => ({ id: p.id, servicioId: p.servicioId })),
    });
  } catch (err) {
    if (err instanceof ServiciosError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status },
      );
    }
    console.error('[SERVICIOS/MARCAR-MES]', err);
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});

```

# UI PRINCIPAL

## 13. /servicios/page.tsx (4 tabs + modal + drawer)

**Path:** `src/app/servicios/page.tsx`

```tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import type {
  ServicioMes,
  ServicioMesRow,
  ParsedPeriodo,
  CeldaServicio,
} from '@/lib/servicios-mes';
import {
  ANCLAS_OPERATIVAS,
  ANCLA_SHORT_LABEL,
  ANCLA_TO_LOCAL_COL,
} from '@/lib/servicios-mes';
import type { Ancla } from '@/lib/anclas';
import type {
  IndiceLocal,
  IndiceServicio,
} from '../api/servicios/indice/route';

type TabId = 'tabla' | 'calendario' | 'listado' | 'baigun';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'tabla', label: 'Tabla' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'listado', label: 'Listado' },
  { id: 'baigun', label: 'Baigun' },
];

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const MESES_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function ServiciosPage() {
  const { user, loading, isOwner } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<TabId>('tabla');
  const [meses, setMeses] = useState<ParsedPeriodo[]>([]);
  const [periodo, setPeriodo] = useState<string>('');

  const [mesData, setMesData] = useState<ServicioMes | null>(null);
  const [mesError, setMesError] = useState<string | null>(null);
  const [mesLoading, setMesLoading] = useState(false);

  const [indice, setIndice] = useState<{
    locales: IndiceLocal[];
    servicios: IndiceServicio[];
    tabExiste: boolean;
  }>({ locales: [], servicios: [], tabExiste: false });

  const [toast, setToast] = useState('');
  const flashToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 3000);
  }, []);

  const [editing, setEditing] = useState<{
    row: ServicioMesRow;
    ancla: Ancla;
  } | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    if (!isOwner) {
      router.replace('/');
      return;
    }
    fetch('/api/servicios/meses')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.meses?.length) {
          setMeses(d.meses);
          setPeriodo(d.meses[0].periodo);
        } else {
          setMesError(d.error || 'No se encontraron meses en el Sheet');
        }
      })
      .catch(() => setMesError('Error de red leyendo meses'));
  }, [loading, user, isOwner, router]);

  const reloadMes = useCallback(async () => {
    if (!periodo) return;
    setMesLoading(true);
    setMesError(null);
    try {
      const r = await fetch(`/api/servicios/mes?periodo=${periodo}`, {
        cache: 'no-store',
      });
      const d = await r.json();
      if (d.ok) setMesData(d.data);
      else setMesError(d.error || 'Error cargando mes');
    } catch {
      setMesError('Error de red');
    } finally {
      setMesLoading(false);
    }
  }, [periodo]);

  useEffect(() => {
    reloadMes();
  }, [reloadMes]);

  useEffect(() => {
    if (loading || !user || !isOwner) return;
    fetch('/api/servicios/indice')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setIndice({
            locales: d.locales || [],
            servicios: d.servicios || [],
            tabExiste: d.tabExiste,
          });
        }
      })
      .catch(() => {});
  }, [loading, user, isOwner]);

  if (loading || !user) return null;
  if (!isOwner) return null;

  const totalServs =
    (mesData?.filasLocales.length || 0) +
    (mesData?.filasCronklam.length || 0) +
    (mesData?.filasMyP.length || 0);

  return (
    <div className="page-enter">
      <PageHeader
        title="Servicios"
        subtitle={
          mesData
            ? `${totalServs} servicios · alquiler · públicos · IVA · impositivo`
            : 'Cargando…'
        }
        showBack
      />
      <div
        className="px-4 pt-4 lh-inicio-stagger"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          paddingBottom: 'calc(var(--nav-height) + var(--safe-bottom) + 32px)',
        }}
      >
        <TabNav active={tab} onChange={setTab} />

        {meses.length > 0 && (
          <PeriodoChips meses={meses} value={periodo} onChange={setPeriodo} />
        )}

        {mesError && <ErrorBanner text={mesError} />}

        {tab === 'tabla' && (
          <TabTabla
            data={mesData}
            loading={mesLoading}
            onClickCell={(row, ancla) => setEditing({ row, ancla })}
          />
        )}
        {tab === 'calendario' && (
          <TabCalendario indice={indice} mesData={mesData} />
        )}
        {tab === 'listado' && (
          <TabListado
            indice={indice}
            mesData={mesData}
            onAction={flashToast}
            onClickServicio={(s) => {
              if (!mesData) return;
              const all = [
                ...mesData.filasLocales,
                ...mesData.filasCronklam,
                ...mesData.filasMyP,
              ];
              const row = all.find((r) => r.servicioRaw === s.servicioRaw);
              if (row) setEditing({ row, ancla: s.ancla });
            }}
          />
        )}
        {tab === 'baigun' && (
          <TabBaigun mesData={mesData} loading={mesLoading} />
        )}

        <SeedIndiceButton onDone={flashToast} />
      </div>

      {editing && (
        <RegistrarPagoModal
          row={editing.row}
          ancla={editing.ancla}
          periodo={periodo}
          periodoLabel={mesData?.label || ''}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => {
            setEditing(null);
            flashToast(msg);
            await reloadMes();
          }}
          onError={flashToast}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

// ─── Tab nav (pill segmented control) ─────────────────────────────

function TabNav({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: 4,
        background: 'var(--bg-subtle)',
        borderRadius: 999,
        border: '1px solid var(--border)',
        alignSelf: 'center',
        marginTop: 4,
      }}
    >
      {TABS.map((t) => {
        const sel = active === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={sel}
            onClick={() => onChange(t.id)}
            className="press-feedback"
            style={{
              minHeight: 32,
              padding: '0 14px',
              borderRadius: 999,
              background: sel ? 'var(--text)' : 'transparent',
              color: sel ? 'var(--bg-card)' : 'var(--text-muted)',
              fontWeight: sel ? 600 : 500,
              fontSize: 13,
              border: 0,
              cursor: 'pointer',
              transition: 'all 180ms var(--ease-ios)',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Period chips (horizontal scroll) ─────────────────────────────

function PeriodoChips({
  meses,
  value,
  onChange,
}: {
  meses: ParsedPeriodo[];
  value: string;
  onChange: (p: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        flexWrap: 'nowrap',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        margin: '0 -16px',
        padding: '4px 16px 8px 16px',
      }}
    >
      {meses.map((m) => {
        const active = m.periodo === value;
        return (
          <button
            key={m.periodo}
            type="button"
            onClick={() => onChange(m.periodo)}
            className="press-feedback"
            style={{
              flexShrink: 0,
              padding: '8px 14px',
              borderRadius: 999,
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              background: active ? 'var(--accent)' : 'var(--bg-card)',
              color: active ? '#FDFBF8' : 'var(--text)',
              fontSize: 12.5,
              fontWeight: active ? 700 : 500,
              whiteSpace: 'nowrap',
            }}
          >
            {abbrevLabel(m.label)}
          </button>
        );
      })}
    </div>
  );
}

function abbrevLabel(label: string): string {
  return label.replace(/\s(\d{2})(\d{2})$/, ' $2');
}

// ─── Tab: TABLA — light theme con celdas clickables ──────────────

function TabTabla({
  data,
  loading,
  onClickCell,
}: {
  data: ServicioMes | null;
  loading: boolean;
  onClickCell: (row: ServicioMesRow, ancla: Ancla) => void;
}) {
  if (loading && !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="shimmer-modern"
            style={{ height: 44, borderRadius: 10 }}
          />
        ))}
      </div>
    );
  }
  if (!data) return null;

  return (
    <>
      <p
        style={{
          fontSize: 11.5,
          color: 'var(--text-muted)',
          lineHeight: 1.5,
          padding: '0 2px',
        }}
      >
        Tocá una celda para registrar el pago.{' '}
        <span style={{ color: 'var(--green)', fontWeight: 600 }}>Verde</span> = ya pagado este mes ·{' '}
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Pagar</span> = pendiente ·{' '}
        <span style={{ color: 'var(--text-faint)' }}>—</span> = no aplica.
      </p>

      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-card)',
          border: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `130px repeat(${data.anclasOperativas.length}, minmax(82px, 1fr))`,
              minWidth: `calc(130px + ${data.anclasOperativas.length * 82}px)`,
            }}
          >
            {/* Header: esquina */}
            <div
              style={{
                position: 'sticky',
                left: 0,
                zIndex: 4,
                background: 'var(--header-bg)',
                color: 'var(--text-inverse)',
                padding: '10px 12px',
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                borderRight: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              Servicio
            </div>
            {/* Header: columnas */}
            {data.anclasOperativas.map((a) => (
              <div
                key={a}
                style={{
                  background: 'var(--header-bg)',
                  color: 'var(--text-inverse)',
                  padding: '10px 6px',
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textAlign: 'center',
                  borderLeft: '1px solid rgba(255,255,255,0.08)',
                  whiteSpace: 'nowrap',
                }}
              >
                {ANCLA_SHORT_LABEL[a]}
              </div>
            ))}

            {/* Filas locales */}
            {data.filasLocales.map((row, idx) => {
              const bg = idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card-alt)';
              return (
                <FilaTabla
                  key={`${row.servicio}-${idx}`}
                  row={row}
                  anclas={data.anclasOperativas}
                  bg={bg}
                  onClickCell={onClickCell}
                />
              );
            })}

            {/* Fila TOTAL */}
            {data.filasLocales.length > 0 && (
              <>
                <div
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 2,
                    background: 'var(--header-bg-light)',
                    color: 'var(--text-inverse)',
                    padding: '12px 12px',
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    borderTop: '1px solid var(--border)',
                    borderRight: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  Total
                </div>
                {data.anclasOperativas.map((a) => {
                  const t = data.totalPorAncla[a] || 0;
                  return (
                    <div
                      key={a}
                      className="tabular-nums-strict"
                      style={{
                        background: 'var(--header-bg-light)',
                        color: 'var(--text-inverse)',
                        padding: '12px 6px',
                        fontSize: 10.5,
                        fontWeight: 700,
                        textAlign: 'center',
                        borderTop: '1px solid var(--border)',
                        borderLeft: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      {t > 0 ? `$${Math.round(t).toLocaleString('es-AR')}` : '—'}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cronklam + MyP split 50/50 */}
      {(data.filasCronklam.length > 0 || data.filasMyP.length > 0) && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: data.filasMyP.length > 0 ? '1fr 1fr' : '1fr',
            gap: 8,
            marginTop: 4,
          }}
        >
          {data.filasCronklam.length > 0 && (
            <SplitSection
              label="Cronklam (corporativo)"
              count={data.filasCronklam.length}
              filas={data.filasCronklam}
              ancla="CRONKLAM"
              onClickCell={onClickCell}
            />
          )}
          {data.filasMyP.length > 0 && (
            <SplitSection
              label="Martín y Melanie"
              count={data.filasMyP.length}
              filas={data.filasMyP}
              ancla="MyP"
              onClickCell={onClickCell}
            />
          )}
        </div>
      )}
    </>
  );
}

function FilaTabla({
  row,
  anclas,
  bg,
  onClickCell,
}: {
  row: ServicioMesRow;
  anclas: Ancla[];
  bg: string;
  onClickCell: (row: ServicioMesRow, ancla: Ancla) => void;
}) {
  return (
    <>
      <div
        style={{
          position: 'sticky',
          left: 0,
          zIndex: 1,
          background: bg,
          padding: '12px 12px',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text)',
          borderTop: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {row.servicio}
      </div>
      {anclas.map((a) => {
        const cell = row.porAncla[a];
        return (
          <button
            key={a}
            type="button"
            onClick={() => onClickCell(row, a)}
            className="press-feedback"
            style={{
              background: bg,
              padding: '12px 6px',
              fontSize: 12,
              textAlign: 'center',
              borderTop: '1px solid var(--border)',
              borderLeft: '1px solid var(--border)',
              cursor: 'pointer',
              minHeight: 44,
              border: 0,
            }}
          >
            <CeldaTabla cell={cell} />
          </button>
        );
      })}
    </>
  );
}

function CeldaTabla({ cell }: { cell?: CeldaServicio }) {
  if (!cell || cell.estado === 'vacio') {
    return (
      <span
        style={{
          color: 'var(--accent)',
          fontWeight: 600,
          fontSize: 11,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          opacity: 0.7,
        }}
      >
        Pagar
      </span>
    );
  }
  if (cell.estado === 'no_aplica') {
    return <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>—</span>;
  }
  if (cell.estado === 'pendiente') {
    return (
      <span
        style={{
          color: '#C84F3F',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}
      >
        Pagar
      </span>
    );
  }
  // pagado
  let texto: string;
  if (cell.esUsd) {
    texto = `US$ ${Math.round(cell.monto).toLocaleString('es-AR')}`;
  } else {
    texto = `$${Math.round(cell.monto).toLocaleString('es-AR')}`;
  }
  return (
    <span
      className="tabular-nums-strict"
      style={{
        color: 'var(--green)',
        fontWeight: 600,
        fontSize: 12,
      }}
    >
      {texto}
    </span>
  );
}

function SplitSection({
  label,
  count,
  filas,
  ancla,
  onClickCell,
}: {
  label: string;
  count: number;
  filas: ServicioMesRow[];
  ancla: 'CRONKLAM' | 'MyP';
  onClickCell: (row: ServicioMesRow, ancla: Ancla) => void;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: 'var(--accent-hover)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-subtle)',
        }}
      >
        <span>· {label}</span>
        <span style={{ color: 'var(--text-muted)' }}>{count}</span>
      </div>
      <div>
        {filas.map((row, i) => {
          const cell = row.porAncla[ancla];
          return (
            <button
              key={`${row.servicio}-${i}`}
              type="button"
              onClick={() => onClickCell(row, ancla as Ancla)}
              className="press-feedback"
              style={{
                width: '100%',
                padding: '12px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: i < filas.length - 1 ? '1px solid var(--border)' : 0,
                fontSize: 13,
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>
                {row.servicio}
              </span>
              <span
                className="tabular-nums-strict"
                style={{
                  fontWeight: cell?.estado === 'pagado' ? 700 : 600,
                  color:
                    cell?.estado === 'pagado'
                      ? 'var(--green)'
                      : cell?.estado === 'pendiente'
                      ? '#C84F3F'
                      : 'var(--accent)',
                  fontSize: cell?.estado === 'pagado' ? 13 : 11,
                  textTransform: cell?.estado === 'pagado' ? 'none' : 'uppercase',
                  letterSpacing: cell?.estado === 'pagado' ? 'normal' : '0.04em',
                }}
              >
                {cell?.estado === 'pagado'
                  ? cell.esUsd
                    ? `US$ ${Math.round(cell.monto).toLocaleString('es-AR')}`
                    : `$${Math.round(cell.monto).toLocaleString('es-AR')}`
                  : cell?.estado === 'no_aplica'
                  ? '—'
                  : 'Pagar'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab: CALENDARIO con scroll-to-today ─────────────────────────

function TabCalendario({
  indice,
  mesData,
}: {
  indice: { servicios: IndiceServicio[] };
  mesData: ServicioMes | null;
}) {
  const todayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scrollear al banner HOY cuando se monta
    const t = setTimeout(() => {
      todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => clearTimeout(t);
  }, []);

  const hoy = new Date();

  // Rango: mes anterior + actual + 12 adelante. Mismo patrón staff.
  const entries = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    type Entry = {
      id: string;
      servicio: IndiceServicio;
      fecha: Date;
      periodo: string;
      pagado: boolean;
      pendiente: boolean;
    };
    const out: Entry[] = [];

    for (let i = 0; i < 14; i++) {
      const m = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1);
      const lastDay = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      const periodo = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;

      for (const s of indice.servicios) {
        const dia = parseInt(s.diaVenc, 10);
        if (isNaN(dia) || dia < 1 || dia > 31) continue;
        const diaReal = Math.min(dia, lastDay);
        const fecha = new Date(m.getFullYear(), m.getMonth(), diaReal);

        // Buscar si está pagado en mesData (solo si periodo matchea el actual)
        let pagado = false;
        let pendiente = false;
        if (mesData && mesData.periodo === periodo) {
          const fila = [
            ...mesData.filasLocales,
            ...mesData.filasCronklam,
            ...mesData.filasMyP,
          ].find(
            (r) => r.servicio.toLowerCase() === s.servicio.toLowerCase(),
          );
          if (fila) {
            const cells = Object.values(fila.porAncla);
            pagado = cells.some((c) => c.estado === 'pagado');
            pendiente = cells.some((c) => c.estado === 'pendiente') && !pagado;
          }
        }

        out.push({
          id: `${s.servicio}-${periodo}`,
          servicio: s,
          fecha,
          periodo,
          pagado,
          pendiente,
        });
      }
    }
    out.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    return out;
  }, [indice.servicios, mesData]);

  if (!indice.servicios.length) {
    return (
      <EmptyState
        title="Sin ÍNDICE"
        body="Generá el tab ÍNDICE del Sheet primero (botón al fondo)."
      />
    );
  }

  // Agrupar por mes
  const grupos = new Map<string, typeof entries>();
  for (const e of entries) {
    const k = `${e.fecha.getFullYear()}-${String(e.fecha.getMonth() + 1).padStart(2, '0')}`;
    const arr = grupos.get(k) || [];
    arr.push(e);
    grupos.set(k, arr);
  }

  const hoyKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from(grupos.entries()).map(([mkey, items]) => {
        const [y, mNum] = mkey.split('-').map((x) => parseInt(x, 10));
        const label = `${MESES[mNum - 1]} ${y}`;
        const esEsteMes = mkey === hoyKey;
        return (
          <section key={mkey}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 4px',
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: esEsteMes ? 'var(--accent-hover)' : 'var(--text-muted)',
                }}
              >
                {esEsteMes && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: 'var(--accent)',
                      marginRight: 6,
                      verticalAlign: 'middle',
                    }}
                  />
                )}
                {label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {items.length} servs
              </span>
            </div>

            {/* Banner HOY si este mes */}
            {esEsteMes && (
              <div
                ref={todayRef}
                style={{
                  background: 'var(--accent)',
                  color: '#FDFBF8',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                  boxShadow: '0 4px 16px -4px rgba(196,160,103,0.35)',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: '#FDFBF8',
                    display: 'inline-block',
                  }}
                />
                Hoy · {hoy.getDate()} de {MESES[hoy.getMonth()]} de {hoy.getFullYear()}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((e) => (
                <CalendarioCard key={e.id} entry={e} hoy={hoy} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CalendarioCard({
  entry,
  hoy,
}: {
  entry: {
    id: string;
    servicio: IndiceServicio;
    fecha: Date;
    periodo: string;
    pagado: boolean;
    pendiente: boolean;
  };
  hoy: Date;
}) {
  const dia = entry.fecha.getDate();
  const mes = MESES_ABBR[entry.fecha.getMonth()].toUpperCase();
  const esHoy =
    entry.fecha.getDate() === hoy.getDate() &&
    entry.fecha.getMonth() === hoy.getMonth() &&
    entry.fecha.getFullYear() === hoy.getFullYear();
  const esPasado = entry.fecha.getTime() < hoy.setHours(0, 0, 0, 0);
  const colors = catColors(entry.servicio.categoria);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        background: 'var(--bg-card)',
        border: `1px solid ${
          entry.pendiente ? '#C84F3F' : esHoy ? 'var(--accent)' : 'var(--border)'
        }`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        opacity: esPasado && !entry.pagado && !entry.pendiente ? 0.65 : 1,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: entry.pagado
            ? 'var(--green-bg)'
            : entry.pendiente
            ? 'rgba(217,95,78,0.10)'
            : 'var(--bg-subtle)',
          color: entry.pagado
            ? 'var(--green)'
            : entry.pendiente
            ? '#C84F3F'
            : 'var(--text)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <div
          className="tabular-nums-strict"
          style={{ fontSize: 17, fontWeight: 700, lineHeight: 1 }}
        >
          {dia}
        </div>
        <div
          style={{
            fontSize: 8.5,
            letterSpacing: '0.10em',
            marginTop: 1,
            fontWeight: 600,
          }}
        >
          {mes}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text)',
            marginBottom: 4,
          }}
        >
          {entry.servicio.servicio}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {entry.servicio.categoria && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                padding: '2px 6px',
                borderRadius: 4,
                background: colors.bg,
                color: colors.fg,
              }}
            >
              {entry.servicio.categoria}
            </span>
          )}
          {entry.servicio.notas && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {entry.servicio.notas}
            </span>
          )}
          {entry.pagado && (
            <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>
              ✓ pagado
            </span>
          )}
        </div>
      </div>
      {entry.pendiente && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#C84F3F',
          }}
        >
          Pendiente
        </span>
      )}
    </div>
  );
}

function catColors(cat: string): { bg: string; fg: string } {
  const c = (cat || '').toLowerCase();
  if (c.includes('luz')) return { bg: 'rgba(245,158,11,0.14)', fg: '#A05A00' };
  if (c.includes('agua')) return { bg: 'rgba(59,130,246,0.14)', fg: '#1E40AF' };
  if (c.includes('gas')) return { bg: 'rgba(220,38,38,0.12)', fg: '#991B1B' };
  if (c.includes('internet')) return { bg: 'rgba(124,58,237,0.12)', fg: '#5B21B6' };
  if (c.includes('iva')) return { bg: 'rgba(31,20,16,0.10)', fg: '#3E2A1F' };
  if (c.includes('alquiler')) return { bg: 'rgba(74,124,62,0.14)', fg: '#2E7D32' };
  if (c.includes('expensas')) return { bg: 'rgba(184,149,111,0.16)', fg: '#8B6D5A' };
  if (c.includes('impositivo')) return { bg: 'rgba(124,58,237,0.10)', fg: '#7C3AED' };
  if (c.includes('sistema')) return { bg: 'var(--bg-subtle)', fg: 'var(--text)' };
  return { bg: 'var(--bg-subtle)', fg: 'var(--text-muted)' };
}

// ─── Tab: LISTADO — estilo staff con stats + expand por local ────

// Tipo agregado: un servicio en un local (con su metadata de ÍNDICE).
// Lo construimos en runtime cruzando el pivot del mes con el ÍNDICE.
interface ServicioEnLocal {
  servicio: string;       // canónico (display)
  servicioRaw: string;    // raw del Sheet (para escribir celda)
  ancla: Ancla;
  cellEstado: 'pagado' | 'pendiente' | 'vacio' | 'no_aplica';
  cellMonto: number;
  cellEsUsd: boolean;
  cellRaw: string;
  // Enrich del ÍNDICE
  categoria: string;
  periodicidad: string;
  diaVenc: number | null;
  notas: string;
}

function diasHastaVenc(diaVenc: number | null): number | null {
  if (!diaVenc) return null;
  const hoy = new Date();
  const targetMes = new Date(hoy.getFullYear(), hoy.getMonth(), diaVenc);
  const lastDay = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const diaReal = Math.min(diaVenc, lastDay);
  targetMes.setDate(diaReal);
  const diffMs = targetMes.getTime() - hoy.setHours(0, 0, 0, 0);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function TabListado({
  indice,
  mesData,
  onClickServicio,
  onAction,
}: {
  indice: { locales: IndiceLocal[]; servicios: IndiceServicio[]; tabExiste: boolean };
  mesData: ServicioMes | null;
  onClickServicio: (s: ServicioEnLocal) => void;
  onAction: (m: string) => void;
}) {
  const [view, setView] = useState<'local' | 'categoria'>('local');
  const [openAncla, setOpenAncla] = useState<string | null>(null);
  const [openTipo, setOpenTipo] = useState<string | null>(null);

  if (!indice.tabExiste) {
    return (
      <EmptyState
        title="Tab ÍNDICE no existe"
        body="Generá el ÍNDICE primero (botón al fondo)."
      />
    );
  }

  // Index ÍNDICE por nombre (case-insensitive) para enrich rápido
  const indiceByNombre = useMemo(() => {
    const m = new Map<string, IndiceServicio>();
    for (const s of indice.servicios) {
      m.set(s.servicio.trim().toLowerCase(), s);
    }
    return m;
  }, [indice.servicios]);

  // Build serviciosEnLocal: para cada (servicio × ancla) donde la
  // celda no es no_aplica → un entry.
  const serviciosEnLocal: ServicioEnLocal[] = useMemo(() => {
    if (!mesData) return [];
    const all = [
      ...mesData.filasLocales,
      ...mesData.filasCronklam,
      ...mesData.filasMyP,
    ];
    const out: ServicioEnLocal[] = [];
    for (const row of all) {
      const meta = indiceByNombre.get(row.servicio.trim().toLowerCase());
      for (const [ancla, cell] of Object.entries(row.porAncla)) {
        if (!cell || cell.estado === 'no_aplica') continue;
        out.push({
          servicio: row.servicio,
          servicioRaw: row.servicioRaw,
          ancla: ancla as Ancla,
          cellEstado: cell.estado,
          cellMonto: cell.monto,
          cellEsUsd: cell.esUsd,
          cellRaw: cell.raw,
          categoria: meta?.categoria || '',
          periodicidad: meta?.periodicidad || '',
          diaVenc: meta?.diaVenc ? parseInt(meta.diaVenc, 10) || null : null,
          notas: meta?.notas || row.notas || '',
        });
      }
    }
    return out;
  }, [mesData, indiceByNombre]);

  // Stats card
  const stats = useMemo(() => {
    let pagadosCount = 0;
    let pendientesCount = 0;
    let pagadoArs = 0;
    let pagadoUsd = 0;
    let faltaArs = 0;
    let vencidos = 0;
    const hoy = new Date();
    const hoyDia = hoy.getDate();

    for (const e of serviciosEnLocal) {
      if (e.cellEstado === 'pagado') {
        pagadosCount++;
        if (e.cellEsUsd) pagadoUsd += e.cellMonto;
        else pagadoArs += e.cellMonto;
      } else {
        // pendiente o vacio → falta pagar
        pendientesCount++;
        // Sumar al "falta pagar" si tenemos un sugerido (TODO: leer de
        // mes anterior). Por ahora si está pendiente lo dejamos sin monto.
        if (e.cellEstado === 'pendiente') faltaArs += 0;

        if (e.diaVenc && e.diaVenc < hoyDia) vencidos++;
      }
    }

    return { pagadosCount, pendientesCount, pagadoArs, pagadoUsd, faltaArs, vencidos };
  }, [serviciosEnLocal]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stats principal */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 14,
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: 10,
          }}
        >
          Este mes
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--green)',
                marginBottom: 2,
              }}
            >
              Pagado
            </div>
            <div
              className="tabular-nums-strict"
              style={{
                fontSize: 19,
                fontWeight: 700,
                color: 'var(--text)',
                lineHeight: 1.1,
              }}
            >
              ${Math.round(stats.pagadoArs).toLocaleString('es-AR')}
            </div>
            {stats.pagadoUsd > 0 && (
              <div
                className="tabular-nums-strict"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginTop: 2,
                }}
              >
                US$ {Math.round(stats.pagadoUsd).toLocaleString('es-AR')}
              </div>
            )}
            <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 4 }}>
              {stats.pagadosCount} {stats.pagadosCount === 1 ? 'servicio' : 'servicios'}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#92400E',
                marginBottom: 2,
              }}
            >
              Falta pagar
            </div>
            <div
              className="tabular-nums-strict"
              style={{
                fontSize: 19,
                fontWeight: 700,
                color: 'var(--text)',
                lineHeight: 1.1,
              }}
            >
              {stats.pendientesCount}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 4 }}>
              {stats.pendientesCount === 1 ? '1 servicio' : `${stats.pendientesCount} servicios`}
              {stats.vencidos > 0
                ? ` · ${stats.vencidos} vencido${stats.vencidos === 1 ? '' : 's'}`
                : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Toggle Por Local / Por Categoría */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 4,
          padding: 4,
          background: 'var(--bg-subtle)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
        }}
      >
        {(['local', 'categoria'] as const).map((v) => {
          const sel = view === v;
          return (
            <button
              key={v}
              onClick={() => setView(v)}
              className="press-feedback"
              style={{
                minHeight: 36,
                borderRadius: 'var(--radius-sm)',
                background: sel ? 'var(--bg-card)' : 'transparent',
                color: sel ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: sel ? 600 : 500,
                fontSize: 13,
                border: 0,
                cursor: 'pointer',
                boxShadow: sel ? 'var(--shadow-card)' : 'none',
              }}
            >
              {v === 'local' ? 'Por Local' : 'Por Categoría'}
            </button>
          );
        })}
      </div>

      {view === 'local' ? (
        <ListadoPorLocal
          locales={indice.locales}
          serviciosEnLocal={serviciosEnLocal}
          openAncla={openAncla}
          onToggle={(a) => setOpenAncla((p) => (p === a ? null : a))}
          onClickServicio={onClickServicio}
        />
      ) : (
        <ListadoPorCategoria
          serviciosEnLocal={serviciosEnLocal}
          openTipo={openTipo}
          onToggle={(t) => setOpenTipo((p) => (p === t ? null : t))}
          onClickServicio={onClickServicio}
        />
      )}

      <button
        type="button"
        onClick={() =>
          onAction(
            'Para sumar un servicio nuevo: edita el tab ÍNDICE del Sheet y agregá la fila. La app lo va a leer automático.',
          )
        }
        className="press-feedback"
        style={{
          minHeight: 42,
          borderRadius: 'var(--radius-md)',
          padding: '10px 14px',
          background: 'transparent',
          color: 'var(--accent-hover)',
          fontWeight: 600,
          fontSize: 13,
          border: '1px dashed var(--accent)',
        }}
      >
        + Sumar servicio o local
      </button>
    </div>
  );
}

const ANCLA_ORDER: Ancla[] = ['LH1', 'LH2', 'LH3', 'LH4', 'LH5', 'LH6', 'CRONKLAM', 'MyP'];
const ANCLA_LARGO: Record<Ancla, string> = {
  LH1: 'Lharmonie 1 (LH1)',
  LH2: 'Lharmonie Nicaragua (LH2)',
  LH3: 'Casa Lharmonie (LH3)',
  LH4: 'Lharmonie Zabala (LH4)',
  LH5: 'Lharmonie Libertador (LH5)',
  LH6: 'Lharmonie 6 (LH6)',
  CRONKLAM: 'Cronklam (empresa)',
  MyP: 'Martín y Melanie',
};

function ListadoPorLocal_NEW({
  locales: _locales,
  serviciosEnLocal,
  openAncla,
  onToggle,
  onClickServicio,
}: {
  locales: IndiceLocal[];
  serviciosEnLocal: ServicioEnLocal[];
  openAncla: string | null;
  onToggle: (a: string) => void;
  onClickServicio: (s: ServicioEnLocal) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ANCLA_ORDER.map((anclaKey) => {
        const items = serviciosEnLocal.filter((s) => s.ancla === anclaKey);
        if (items.length === 0) return null;
        const isOpen = openAncla === anclaKey;
        const pendientes = items.filter((s) => s.cellEstado !== 'pagado').length;
        const totalArs = items
          .filter((s) => s.cellEstado === 'pagado' && !s.cellEsUsd)
          .reduce((sum, s) => sum + s.cellMonto, 0);

        // Ordenar items por tipo (categoría)
        const sorted = [...items].sort((a, b) =>
          (a.categoria || 'zzz').localeCompare(b.categoria || 'zzz') ||
          a.servicio.localeCompare(b.servicio),
        );

        return (
          <div
            key={anclaKey}
            style={{
              background: 'var(--bg-card)',
              border: `1px solid ${isOpen ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              transition: 'border-color 180ms',
            }}
          >
            <button
              type="button"
              onClick={() => onToggle(anclaKey)}
              className="press-feedback"
              aria-expanded={isOpen}
              style={{
                width: '100%',
                padding: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 999,
                  background: 'rgba(184,149,111,0.12)',
                  color: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                }}
              >
                {anclaKey}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ANCLA_LARGO[anclaKey]}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    marginTop: 1,
                  }}
                >
                  {items.length} {items.length === 1 ? 'servicio' : 'servicios'}
                  {pendientes > 0 && ` · ${pendientes} pendientes`}
                  {totalArs > 0 &&
                    ` · $${Math.round(totalArs).toLocaleString('es-AR')}/mes`}
                </div>
              </div>
              {pendientes > 0 && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    background: 'rgba(217,95,78,0.12)',
                    color: '#C84F3F',
                    padding: '2px 7px',
                    borderRadius: 999,
                    flexShrink: 0,
                  }}
                >
                  {pendientes}
                </span>
              )}
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                style={{
                  transition: 'transform 220ms var(--ease-ios)',
                  transform: isOpen ? 'rotate(90deg)' : 'none',
                  flexShrink: 0,
                }}
              >
                <path
                  d="M5 2l5 5-5 5"
                  stroke="var(--text-muted)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                {sorted.map((s, idx) => (
                  <ServicioRowCard
                    key={`${s.servicio}-${idx}`}
                    s={s}
                    onClick={() => onClickServicio(s)}
                    bordered={idx > 0}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Stub vieja signatura para no romper imports — la nueva está arriba.
function ListadoPorLocal(props: {
  locales: IndiceLocal[];
  serviciosEnLocal: ServicioEnLocal[];
  openAncla: string | null;
  onToggle: (a: string) => void;
  onClickServicio: (s: ServicioEnLocal) => void;
}) {
  return <ListadoPorLocal_NEW {...props} />;
}

function ServicioRowCard({
  s,
  onClick,
  bordered,
}: {
  s: ServicioEnLocal;
  onClick: () => void;
  bordered: boolean;
}) {
  const tono = catColors(s.categoria);
  const dias = diasHastaVenc(s.diaVenc);
  const venceRojo = dias !== null && dias < 0;
  const venceAmber = dias !== null && dias >= 0 && dias <= 3;
  const borderLeftColor = venceRojo
    ? '#C84F3F'
    : venceAmber
    ? '#F59E0B'
    : 'transparent';

  return (
    <button
      type="button"
      onClick={onClick}
      className="press-feedback"
      style={{
        width: '100%',
        padding: '10px 12px',
        borderTop: bordered ? `1px solid var(--border)` : 'none',
        borderLeft: borderLeftColor !== 'transparent' ? `3px solid ${borderLeftColor}` : '3px solid transparent',
        background: 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'block',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            {s.categoria && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: tono.bg,
                  color: tono.fg,
                  flexShrink: 0,
                }}
              >
                {s.categoria}
              </span>
            )}
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text)',
              }}
            >
              {s.servicio}
            </span>
          </div>
          <div
            style={{
              marginTop: 4,
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              alignItems: 'center',
              fontSize: 10.5,
            }}
          >
            {s.diaVenc && (
              <span
                style={{
                  color: venceRojo ? '#C84F3F' : 'var(--text-muted)',
                  background: 'var(--bg-subtle)',
                  padding: '2px 7px',
                  borderRadius: 999,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect x="3.5" y="5" width="17" height="15" rx="2.2" stroke="currentColor" strokeWidth="2" />
                  <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Vence el {s.diaVenc} de cada mes
              </span>
            )}
            {s.cellEstado === 'pagado' && (
              <span style={{ color: 'var(--green)', fontWeight: 700 }}>
                ✓{' '}
                {s.cellEsUsd
                  ? `US$ ${Math.round(s.cellMonto).toLocaleString('es-AR')}`
                  : `$${Math.round(s.cellMonto).toLocaleString('es-AR')}`}
              </span>
            )}
            {s.cellEstado === 'pendiente' && (
              <span
                style={{
                  color: '#C84F3F',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Pendiente
              </span>
            )}
            {s.cellEstado === 'vacio' && (
              <span style={{ color: 'var(--text-muted)' }}>Sin cargar</span>
            )}
          </div>
        </div>
        <svg
          width="13"
          height="13"
          viewBox="0 0 14 14"
          fill="none"
          style={{ flexShrink: 0, marginTop: 4 }}
        >
          <path
            d="M5 2l5 5-5 5"
            stroke="var(--text-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </button>
  );
}


function ListadoPorCategoria({
  serviciosEnLocal,
  openTipo,
  onToggle,
  onClickServicio,
}: {
  serviciosEnLocal: ServicioEnLocal[];
  openTipo: string | null;
  onToggle: (t: string) => void;
  onClickServicio: (s: ServicioEnLocal) => void;
}) {
  const porTipo = useMemo(() => {
    const m = new Map<string, ServicioEnLocal[]>();
    for (const s of serviciosEnLocal) {
      const k = s.categoria || 'Sin categoría';
      const arr = m.get(k) || [];
      arr.push(s);
      m.set(k, arr);
    }
    return m;
  }, [serviciosEnLocal]);

  const orderedTipos = Array.from(porTipo.keys()).sort((a, b) =>
    a.localeCompare(b, 'es'),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {orderedTipos.map((tipo) => {
        const items = porTipo.get(tipo) || [];
        const isOpen = openTipo === tipo;
        const pendientes = items.filter((s) => s.cellEstado !== 'pagado').length;
        const tono = catColors(tipo);
        const sorted = [...items].sort((a, b) =>
          (a.ancla || 'zzz').localeCompare(b.ancla || 'zzz') ||
          a.servicio.localeCompare(b.servicio),
        );
        return (
          <div
            key={tipo}
            style={{
              background: isOpen ? tono.bg : 'var(--bg-card)',
              border: `1px solid ${isOpen ? tono.fg : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              transition: 'all 180ms',
            }}
          >
            <button
              type="button"
              onClick={() => onToggle(tipo)}
              className="press-feedback"
              aria-expanded={isOpen}
              style={{
                width: '100%',
                padding: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  background: tono.bg,
                  color: tono.fg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {tipo.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                  {tipo}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                  {items.length} {items.length === 1 ? 'servicio' : 'servicios'}
                  {pendientes > 0 && ` · ${pendientes} pendientes`}
                </div>
              </div>
              {pendientes > 0 && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    background: 'rgba(217,95,78,0.12)',
                    color: '#C84F3F',
                    padding: '2px 7px',
                    borderRadius: 999,
                    flexShrink: 0,
                  }}
                >
                  {pendientes}
                </span>
              )}
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                style={{
                  transition: 'transform 220ms var(--ease-ios)',
                  transform: isOpen ? 'rotate(90deg)' : 'none',
                  flexShrink: 0,
                }}
              >
                <path
                  d="M5 2l5 5-5 5"
                  stroke="var(--text-muted)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                {sorted.map((s, idx) => (
                  <ServicioRowCard
                    key={`${s.servicio}-${s.ancla}-${idx}`}
                    s={s}
                    onClick={() => onClickServicio(s)}
                    bordered={idx > 0}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {orderedTipos.length === 0 && (
        <EmptyState
          title="Sin servicios este mes"
          body="No hay datos cargados en el mes seleccionado."
        />
      )}
    </div>
  );
}

// ─── Tab: BAIGUN ──────────────────────────────────────────────────

function TabBaigun({
  mesData,
  loading,
}: {
  mesData: ServicioMes | null;
  loading: boolean;
}) {
  if (loading && !mesData) {
    return <div className="shimmer-modern" style={{ height: 200, borderRadius: 10 }} />;
  }
  if (!mesData) return null;

  const movs = [
    ...mesData.filasLocales,
    ...mesData.filasCronklam,
    ...mesData.filasMyP,
  ].filter((r) => !r.esTotal && r.baigun);

  const saldoActual = movs.reduce((s, r) => s + r.baigunMonto, 0);
  const debitos = movs.filter((m) => m.baigunMonto < 0).reduce((s, m) => s + m.baigunMonto, 0);
  const creditos = movs.filter((m) => m.baigunMonto > 0).reduce((s, m) => s + m.baigunMonto, 0);

  return (
    <>
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 18,
          boxShadow: 'var(--shadow-card)',
          borderLeft: `4px solid ${saldoActual >= 0 ? 'var(--green)' : '#C84F3F'}`,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          Saldo actual · {mesData.label}
        </div>
        <div
          className="tabular-nums-strict"
          style={{
            fontSize: 32,
            fontWeight: 700,
            lineHeight: 1,
            color: saldoActual >= 0 ? 'var(--green)' : '#C84F3F',
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          }}
        >
          {saldoActual < 0 ? '−' : ''}${Math.abs(Math.round(saldoActual)).toLocaleString('es-AR')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          {saldoActual > 0
            ? 'a favor de Lharmonie'
            : saldoActual < 0
            ? 'a favor de Baigun'
            : 'sin saldo'}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 14,
            marginTop: 12,
            fontSize: 11.5,
            color: 'var(--text-muted)',
          }}
        >
          <span>
            Débitos{' '}
            <strong className="tabular-nums-strict" style={{ color: 'var(--text)' }}>
              ${Math.abs(Math.round(debitos)).toLocaleString('es-AR')}
            </strong>
          </span>
          <span>·</span>
          <span>
            Créditos{' '}
            <strong className="tabular-nums-strict" style={{ color: 'var(--text)' }}>
              ${Math.round(creditos).toLocaleString('es-AR')}
            </strong>
          </span>
        </div>
      </div>

      {movs.length === 0 ? (
        <EmptyState
          title="Sin movimientos Baigun"
          body="La columna BAIGUN está vacía este mes."
        />
      ) : (
        <>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              padding: '0 4px',
              marginTop: 4,
            }}
          >
            Movimientos · {movs.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {movs.map((m, i) => (
              <div
                key={`${m.servicio}-${i}`}
                style={{
                  padding: '12px 14px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0 }}>
                    {m.servicio} · {mesData.periodo}
                  </div>
                  <div
                    className="tabular-nums-strict"
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: m.baigunMonto < 0 ? '#C84F3F' : 'var(--green)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m.baigunMonto >= 0 ? '+' : ''}
                    ${Math.abs(Math.round(m.baigunMonto)).toLocaleString('es-AR')}
                  </div>
                </div>
                {m.notas && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {m.notas}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ─── Modal: Registrar pago (click celda) ─────────────────────────

function RegistrarPagoModal({
  row,
  ancla,
  periodo,
  periodoLabel,
  onClose,
  onSaved,
  onError,
}: {
  row: ServicioMesRow;
  ancla: Ancla;
  periodo: string;
  periodoLabel: string;
  onClose: () => void;
  onSaved: (msg: string) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const cell = row.porAncla[ancla];
  const yaPagado = cell?.estado === 'pagado';
  const noAplica = cell?.estado === 'no_aplica';
  const localCol = ANCLA_TO_LOCAL_COL[ancla];

  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>(cell?.esUsd ? 'USD' : 'ARS');
  const [saving, setSaving] = useState(false);
  const [confirmForzar, setConfirmForzar] = useState(false);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const submit = useCallback(
    async (forzar: boolean) => {
      if (saving) return;
      const m = parseFloat(monto.replace(/\./g, '').replace(',', '.'));
      if (!m || isNaN(m) || m <= 0) {
        onError('Monto inválido');
        return;
      }
      setSaving(true);
      try {
        const valor =
          moneda === 'USD'
            ? `${Math.round(m).toLocaleString('es-AR')} USD`
            : `$${Math.round(m).toLocaleString('es-AR')}`;
        const r = await fetch('/api/servicios/celda', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            periodo,
            servicioRaw: row.servicioRaw,
            localCol,
            valor,
            forzar,
          }),
        });
        const d = await r.json();
        if (d.ok) {
          onSaved('Pago registrado');
        } else if (r.status === 409 && !forzar) {
          setConfirmForzar(true);
        } else {
          onError(d.error || 'Error guardando');
        }
      } catch {
        onError('Error de red');
      } finally {
        setSaving(false);
      }
    },
    [saving, monto, moneda, periodo, row.servicioRaw, localCol, onError, onSaved],
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(13,8,5,0.50)',
        backdropFilter: 'blur(4px)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'var(--bg-card)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: 20,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 -8px 32px -8px rgba(0,0,0,0.30)',
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 999,
            background: 'var(--border)',
            margin: '0 auto 16px',
          }}
        />

        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--accent-hover)',
            marginBottom: 6,
          }}
        >
          · {ANCLA_SHORT_LABEL[ancla]} · {periodoLabel}
        </div>
        <h2
          style={{
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--text)',
            margin: 0,
            marginBottom: 12,
          }}
        >
          {row.servicio}
        </h2>

        {noAplica && (
          <div
            style={{
              background: 'rgba(217,95,78,0.08)',
              border: '1px solid rgba(217,95,78,0.25)',
              borderRadius: 'var(--radius-md)',
              padding: 12,
              fontSize: 12.5,
              color: '#C84F3F',
              marginBottom: 12,
            }}
          >
            La celda dice <strong>NO</strong> (ese local no tiene este servicio). Si querés
            cambiar eso, editá el Sheet a mano.
          </div>
        )}

        {yaPagado && !confirmForzar && (
          <div
            style={{
              background: 'var(--green-bg)',
              border: '1px solid var(--green)',
              borderRadius: 'var(--radius-md)',
              padding: 12,
              fontSize: 12.5,
              color: 'var(--green)',
              marginBottom: 12,
            }}
          >
            <strong>✓ Ya está pagada</strong>: <span className="tabular-nums-strict">{cell?.raw}</span>.<br />
            Solo cargá un monto si querés sobrescribir (te va a pedir confirmación).
          </div>
        )}

        {confirmForzar && (
          <div
            style={{
              background: 'rgba(217,95,78,0.10)',
              border: '1px solid #C84F3F',
              borderRadius: 'var(--radius-md)',
              padding: 12,
              fontSize: 12.5,
              color: '#C84F3F',
              marginBottom: 12,
            }}
          >
            ⚠ La celda ya tiene un valor cargado. ¿Sobrescribir? Esta acción no se puede deshacer.
          </div>
        )}

        {!noAplica && (
          <>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Monto
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['ARS', 'USD'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMoneda(m)}
                    style={{
                      padding: '0 12px',
                      height: 44,
                      borderRadius: 'var(--radius-md)',
                      background: moneda === m ? 'var(--text)' : 'var(--bg-subtle)',
                      color: moneda === m ? 'var(--bg-card)' : 'var(--text-muted)',
                      border: '1px solid var(--border)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {m === 'ARS' ? '$' : 'US$'}
                  </button>
                ))}
              </div>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0"
                className="tabular-nums-strict"
                style={{
                  flex: 1,
                  height: 44,
                  padding: '0 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text)',
                  fontSize: 16,
                  fontWeight: 600,
                  outline: 'none',
                  textAlign: 'right',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-subtle)',
                  color: 'var(--text)',
                  fontWeight: 600,
                  fontSize: 13.5,
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => submit(confirmForzar)}
                disabled={saving}
                style={{
                  flex: 2,
                  height: 44,
                  borderRadius: 'var(--radius-md)',
                  background: confirmForzar ? '#C84F3F' : 'var(--accent)',
                  color: '#FDFBF8',
                  fontWeight: 700,
                  fontSize: 13.5,
                  border: 0,
                  cursor: 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving
                  ? 'Guardando…'
                  : confirmForzar
                  ? 'Sí, sobrescribir'
                  : 'Guardar pago'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Helpers UI ───────────────────────────────────────────────────

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        padding: 24,
        background: 'var(--bg-card)',
        border: '1px dashed var(--border)',
        borderRadius: 'var(--radius-md)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>{body}</div>
    </div>
  );
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: 12,
        background: 'rgba(217,95,78,0.10)',
        border: '1px solid rgba(217,95,78,0.25)',
        borderRadius: 'var(--radius-md)',
        color: '#C84F3F',
        fontSize: 12.5,
        lineHeight: 1.5,
      }}
    >
      <strong style={{ fontSize: 13 }}>Error</strong>
      <div style={{ marginTop: 2 }}>{text}</div>
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(var(--nav-height) + var(--safe-bottom) + 16px)',
        transform: 'translateX(-50%)',
        background: 'var(--text)',
        color: 'var(--bg-card)',
        padding: '10px 16px',
        borderRadius: 'var(--radius-md)',
        fontSize: 13,
        fontWeight: 500,
        boxShadow: 'var(--shadow-lg)',
        zIndex: 100,
        maxWidth: '90vw',
      }}
    >
      {message}
    </div>
  );
}

function SeedIndiceButton({ onDone }: { onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/servicios/seed-indice', { method: 'POST' });
      const d = await r.json();
      if (d.ok) onDone('Tab ÍNDICE regenerado en el Sheet — recargá la página');
      else onDone(d.error || 'Error generando ÍNDICE');
    } catch {
      onDone('Error de red');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }, [onDone]);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="press-feedback"
        style={{
          marginTop: 24,
          minHeight: 36,
          borderRadius: 'var(--radius-md)',
          padding: '6px 12px',
          background: 'transparent',
          color: 'var(--text-muted)',
          fontWeight: 500,
          fontSize: 11.5,
          border: '1px dashed var(--border)',
        }}
      >
        Regenerar tab ÍNDICE en el Sheet
      </button>
    );
  }
  return (
    <div
      style={{
        marginTop: 24,
        background: 'var(--bg-card)',
        border: '1px solid #C4A067',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600 }}>Regenerar ÍNDICE</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Borra y recrea el tab <strong>ÍNDICE</strong> del Sheet. Las ediciones
        manuales se pierden.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          style={{
            flex: 1, height: 36, borderRadius: 'var(--radius-md)',
            background: 'var(--bg-subtle)', color: 'var(--text)',
            fontWeight: 500, fontSize: 13,
            border: '1px solid var(--border)',
          }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          style={{
            flex: 2, height: 36, borderRadius: 'var(--radius-md)',
            background: 'var(--accent)', color: '#FDFBF8',
            fontWeight: 600, fontSize: 13, border: 0,
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Generando…' : 'Sí, regenerar'}
        </button>
      </div>
    </div>
  );
}

```

---

# FLOW DE DATA: cómo se renderiza un mes

```
[User abre /servicios]
    │
    ├─→ useEffect: fetch /api/servicios/meses → setMeses, setPeriodo (más reciente)
    │
    ├─→ useEffect (periodo changes): fetch /api/servicios/mes?periodo=YYYY-MM
    │     │
    │     └─ caja-server.ts: sheets.values.get('MAYO 26'!A1:Z60)
    │        → parseMesPivot(rows, periodo, tab, label)
    │          ├─ detecta header row (col A == "SERVICIOS A PAGAR")
    │          ├─ mapea cols a anclas via LOCAL_TO_ANCLA
    │          ├─ para cada fila data:
    │          │   ├─ clasifica cada celda: pagado/pendiente/no_aplica/vacio
    │          │   ├─ aplica nombreCanonico al servicio (BISTROSOFT → "Bistrosoft")
    │          │   └─ asigna grupo: locales / cronklam / myp
    │          └─ retorna ServicioMes { filasLocales[], filasCronklam[], filasMyP[],
    │             totalPorAncla, totalGeneral, conteoPendientes, conteoPagados }
    │
    └─→ useEffect: fetch /api/servicios/indice (one-time) → setIndice
                         (locales y servicios canónicos del tab ÍNDICE)

[UI renderiza 4 tabs según `tab` state]
```

# FLOW: registrar un pago (click celda → write Sheet)

```
[User toca celda en tab Tabla]
    │
    ├─→ onClickCell(row, ancla) → setEditing({ row, ancla })
    │
    ├─→ RegistrarPagoModal monta
    │     ├─ muestra periodo, servicio canonical, ancla
    │     └─ form: input monto + toggle $ / USD
    │
    └─→ User submit → POST /api/servicios/celda
          body: { periodo, servicioRaw, localCol, valor, forzar? }
          │
          ├─→ celda/route.ts:
          │     1. Valida payload
          │     2. Lee el tab del mes
          │     3. Busca header row + col index (localCol)
          │     4. Busca service row (mov.servicioRaw, case-insensitive)
          │     5. Lee celda actual
          │     6. Si !empty && !TODAVIA NO && !forzar → 409 (con valorActual)
          │     7. Si "NO" → 409 jamás
          │     8. spreadsheets.values.update con USER_ENTERED
          │
          └─→ Modal: si 409 → muestra "¿sobrescribir?" → re-submit con forzar:true
              si 200 → onSaved → reload mes → cierra modal
```

# Bugs / TODOs conocidos

- **Tab `ÍNDICE` regenerable destructiva**: el botón "Regenerar
  ÍNDICE" borra el tab entero. Las anotaciones manuales (categorías,
  notas de Iara) se pierden. Mejora futura: merge en lugar de
  rewrite, o leer del ÍNDICE existente antes de regenerar.
- **Nombres canónicos hardcoded** (REMAP_EXACTO en servicios-mes.ts).
  Si Iara renombra "BISTROSOFT" a "BISTROSOFT MAYO" en el Sheet, la
  app la trataría como servicio distinto. Solución: leer canónicos
  del ÍNDICE.
- **Calendario solo usa día venc del ÍNDICE**. Si el servicio
  no tiene `diaVenc` en el ÍNDICE, no aparece en Calendario aunque
  exista en el pivot mensual.
- **Listado depende del ÍNDICE para metadata**. Si el ÍNDICE no
  existe, el Listado muestra empty state. La tabla y Baigun
  funcionan solos.
- **No hay "+ Sumar servicio" funcional**. El botón existe en
  Listado pero solo muestra un toast diciendo "editá el ÍNDICE en
  el Sheet". El crear servicios nuevos vía UI no escribe al Sheet
  (lo cual es correcto — los servicios viven en el ÍNDICE manual
  + en el pivot mensual donde Iara los carga).
- **El catálogo legacy (`Servicios Catalogo`, `Servicios Pagos`)**
  está medio vestigial. Las APIs `/api/servicios` (GET/POST) y
  `/api/servicios/pagos` (GET/POST) escriben a tabs que NO EXISTEN
  en el Sheet real. `readTab` devuelve `[]` por la lógica de
  "unable to parse range" → la UI funciona pero los writes pegarían
  en tabs vacíos que se autocrearían si existieran.
- **BAIGUN cta cte limitado al mes seleccionado**. El tab Baigun
  solo suma la col J del mes actual. No hay vista histórica acumulada
  (el staff tenía un tab `Baigun CtaCte` con todo el historial).

# Preguntas pendientes con Martín

1. ¿La UI debe escribir DIRECTO al pivot mensual (como hace hoy via
   `/api/servicios/celda`) o tirar también al tab `Servicios Pagos`
   para histórico? Hoy: solo escribe al pivot.
2. ¿El tab `ÍNDICE` debe ser editable directamente en la UI o solo
   por edición manual del Sheet? Hoy: solo manual.
3. ¿Quién mantiene los REMAP_EXACTO de canonicalización? Si Iara
   cambia un nombre, hay que tocar código.
