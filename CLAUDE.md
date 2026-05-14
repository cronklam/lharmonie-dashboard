# CLAUDE.md — Lharmonie Dashboard (Management)

> **OBLIGATORIO:** Leer este archivo COMPLETO antes de tocar cualquier
> archivo del repo. Sin excepciones.

---

## Que es este proyecto

Dashboard web privado para el management de Lharmonie. Visualmente es una
**réplica 1:1 del shell de lharmonie-staff** (mismo top nav, mismo bottom
nav, mismo layout, mismas animaciones, misma tipografía y paleta), con
**una sola diferencia visual**: el top nav es más oscuro/luxury (negro
espresso `#0D0805` + tag dorado "MANAGEMENT") para diferenciar este
surface como privado de management.

Funcionalmente es el **dashboard de facturas** que antes vivía en
`dash/app.js` (vanilla HTML/JS). Lee del Sheet de Facturas que llena
el bot de Telegram, calcula KPIs, deuda por proveedor, charts, y
expone la única operación de write: **marcar factura como pagada**
(que pasa por el worker de Railway).

**URL:** `lharmonie-dashboard.vercel.app`
**Repo:** `cronklam/lharmonie-dashboard`
**Deploy:** Vercel (auto-deploy desde `main`, sin PRs)
**Dueño:** Martin Masri (martin.a.masri@gmail.com)
**Nombre:** siempre "Lharmonie" (sin apostrofe). Nunca "L'Harmonie".

---

## Stack

- **Next.js 16** (App Router, Turbopack) + TypeScript
- **React 19**
- **Tailwind v4** (`@tailwindcss/postcss`)
- **Chart.js 4** (NO Recharts — explícito)
- **googleapis** (verificación de Google ID tokens)
- **Web Crypto** (HMAC-SHA256 para cookie de sesión)
- PWA estática (`public/manifest.json` + `public/sw.js`)

Mismo stack que el staff, salvo que el dashboard NO usa Sheet de
"Usuarios" para gating — usa whitelist hardcoded.

---

## Estructura del repo

```
lharmonie-dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx               ← AuthProvider + FacturasProvider + TopNav + BottomNav
│   │   ├── globals.css              ← Copia entera del staff + overrides al final
│   │   ├── page.tsx                 ← / (Inicio): hero "Total a pagar" + KPIs + charts
│   │   ├── a-pagar/page.tsx         ← Lista de pendientes con filtros
│   │   ├── pagadas/page.tsx         ← Historial pagado con búsqueda
│   │   ├── factura/[id]/page.tsx    ← Detalle + botón "Marcar pagada"
│   │   ├── proveedores/page.tsx     ← Ranking con KPIs
│   │   ├── proveedores/[nombre]/page.tsx ← Detalle proveedor + chart evolución
│   │   ├── productos/page.tsx       ← Toggle Food Cost / Artículos
│   │   ├── pyl/page.tsx             ← Admin-only (martin + cronklam) — placeholder
│   │   ├── buscar/page.tsx          ← Búsqueda global (proveedor / cat / facturas)
│   │   ├── perfil/page.tsx          ← Avatar + accesos + logout
│   │   ├── login/page.tsx           ← Hero + Google Sign-In
│   │   ├── unauthorized/page.tsx    ← Rebote para emails fuera de whitelist
│   │   ├── components/
│   │   │   ├── AuthProvider.tsx       ← Context + redirect a /login
│   │   │   ├── FacturasStore.tsx      ← Carga /api/facturas una vez + helpers + types
│   │   │   ├── TopNav.tsx             ← Variante exclusive + ícono lupa → /buscar
│   │   │   ├── BottomNav.tsx          ← Portal + 5 tabs glass blur + sliding pill
│   │   │   ├── PageHeader.tsx         ← Header sticky con back para /factura, /proveedores/[n], etc.
│   │   │   ├── FacturaCard.tsx        ← Card item de factura
│   │   │   ├── Charts.tsx             ← BarChart + DoughnutChart (Chart.js wrapper)
│   │   │   ├── AnimatedNumber.tsx     ← Copia del staff
│   │   │   ├── EyebrowTag.tsx         ← Copia del staff
│   │   │   ├── Button.tsx             ← Copia del staff
│   │   │   ├── DoubleBezelCard.tsx    ← Copia del staff
│   │   │   ├── FunctionBanner.tsx     ← Copia del staff
│   │   │   └── ServiceWorkerRegister.tsx
│   │   └── api/
│   │       ├── auth/login/route.ts        ← Verifica Google JWT + whitelist + cookie HMAC
│   │       ├── auth/logout/route.ts       ← Clear cookie
│   │       ├── auth/session/route.ts      ← Lee cookie + valida whitelist
│   │       ├── facturas/route.ts          ← Lee Sheet de Facturas server-side
│   │       ├── foodcost/route.ts          ← Lee Recetario Sheet (Foodcost GRAL tab)
│   │       └── factura/marcar-pagada/route.ts ← Proxy al worker Railway (única op. write)
│   ├── lib/
│   │   ├── authorized-emails.ts ← Whitelist hardcoded (FUENTE DE GATING)
│   │   ├── session.ts           ← Cookie HMAC-SHA256
│   │   ├── auth-guard.ts        ← withAuth wrapper para API routes
│   │   ├── sheets.ts            ← Cliente Sheets (Facturas + Recetario, READ-ONLY)
│   │   └── worker.ts            ← Cliente del worker Railway (única op. write)
│   └── proxy.ts                 ← Edge proxy: bloquea /api/* sin sesión
├── public/
│   ├── fonts/Recoleta-Regular.woff2 (oficial)
│   ├── manifest.json (PWA)
│   ├── sw.js (service worker pasivo)
│   ├── icon-192.png, icon-512.png, logo.png
├── CLAUDE.md (este archivo)
├── package.json, tsconfig.json, next.config.ts, postcss.config.mjs
└── vercel.json (framework: nextjs)
```

---

## Bottom nav: 5 tabs (en orden)

Espejo del patrón staff (`page.tsx:1505-1619`): glass blur 86%, sliding
pill con `cubic-bezier(0.32, 0.72, 0, 1)`, crossfade outlined→filled,
portal a `document.body`. **No es SPA** — cada tab es un `<Link>` y la
pill anima entre rutas (Next App Router preserva el layout).

| # | Tab | Ruta principal | Match (rutas hijas) | Visible para |
|---|-----|----------------|---------------------|---------------|
| 1 | **Home** | `/` | `/`, `/funciones` | Todos |
| 2 | **Pagos** | `/pagos` | `/pagos`, `/a-pagar`, `/pagadas`, `/factura/*` | Todos |
| 3 | **Revisar** | `/revisar` | `/revisar`, `/proveedores/*`, `/productos`, `/buscar` | Todos |
| 4 | **P&L** | `/pyl` | `/pyl` | Solo `owner` |
| 5 | **Perfil** | `/perfil` | `/perfil/*` | Todos |

Owner ve los 5 tabs; admin/viewer ven 4 (sin P&L).

### Hubs

- **`/pagos`** — hub de operación: hero deuda total + cards "A pagar"
  (con badge), "Pagadas" (count del mes), "Buscar factura" + top 3
  deudores. Las cards linkean a las páginas existentes (`/a-pagar`,
  `/pagadas`, `/buscar`).
- **`/revisar`** — hub de análisis: stats (proveedores únicos,
  categorías) + cards "Proveedores", "Productos / Food Cost", "Buscar
  global".
- **`/funciones`** — grilla 4-col agrupada por sección (Pagos /
  Revisar / Análisis / Equipo). Filtrada por capabilities del rol.
  Accesible desde Home ("Acceso rápido → Ver todas") y desde el botón
  "Todas las funciones" al pie del Home.

### Otras rutas

- **Buscar** (`/buscar`): lupa en TopNav + accesible desde Pagos / Revisar / Funciones.
- **Usuarios** (`/perfil/usuarios`): admin (`owner` o `admin`) puede ver;
  solo `owner` puede crear/editar/desactivar.
- **Servicios** (`/servicios`): owner-only. Catálogo de servicios
  recurrentes (luz/agua/gas/internet/alquiler/IVA/expensas/sistema/
  impositivo) agrupado por ancla, con registro de pagos individuales.
- **Caja** (`/caja`): owner-only. Saldo central (caja grande) +
  movimientos chica/grande. Caja grande arma su saldo sumando todos
  los movimientos; saldo después se anota en cada fila para auditoría.
- **Baigun** (`/baigun`): owner-only. Cuenta corriente del subarriendo
  Libertador (LH5).
- **Detalle factura** (`/factura/[id]`): tap en una card. Highlight en
  tab "Pagos".
- **Detalle proveedor** (`/proveedores/[nombre]`): tap en un proveedor.
  Highlight en tab "Revisar".

### Anclas (taxonomía transversal)

`lib/anclas.ts` define 9 anclas: `LH1 LH2 LH3 LH4 LH5 LH6` (locales),
`CRONKLAM` (empresa, gastos corporativos / IVA / impositivo),
`BAMBINA` (propiedad personal con servicios — Telecom/Flow, Aysa, ABL,
Edenor, Expensas; hasta mayo 2026 los movs se agrupaban bajo CRONKLAM,
ahora es ancla propia) y `MyP` (personal Martín y Melanie — NO entra en
métricas operativas, solo owner ve/carga). Cada movimiento de Servicios
y Caja se asigna a una.

### Caja Efectivo — schema del Sheet (REAL)

Sheet de Caja (`CAJA_SHEET_ID`) tiene **una pestaña por mes** con
formato exacto **`Mayo 2026`** (mes en español + año, separados por
espacio). Una pestaña `PORTADA` reservada para el resumen — **NO
escribir nunca ahí**. Las pestañas históricas existen desde Julio 2021
en adelante. Si el usuario carga un movimiento de un mes sin pestaña,
el endpoint devuelve 404 con mensaje claro ("La pestaña 'Junio 2026'
no existe en el Sheet. Pedile a Martín que la cree."). **NO se
autocrean pestañas.**

Estructura de cada pestaña mensual:
- Fila 1: título mergeado "Caja efectivo — Mayo 2026".
- Fila 2: HEADERS (no escribir): `A=FECHA · B=MONEDA · C=DESCRIPCION ·
  D=# · E=CATEGORIA · F=IMPORTE · G=SALDO`.
- Fila 3+: data. Filas pre-llenadas con dropdowns y fórmulas hasta
  una fila X variable.

**Columnas que el dashboard escribe** (solo estas 5):
- **A (FECHA):** formato DD/MM/YYYY locale es-AR (ej `10/05/2026`).
- **B (MONEDA):** `PESO` o `DOLAR` (singular, mayúsculas).
- **C (DESCRIPCION):** texto libre.
- **E (CATEGORIA):** uno de los 11 valores whitelist (mayúsculas):
  `BISTRO`, `SUELDOS`, `CAMBIO USD`, `MYP`, `CONSULTORIA`, `ALQUILER`,
  `SERVICIOS`, `DIFERENCIA`, `MES ANTERIOR`, `VENTA IVA`, `CA`.
- **F (IMPORTE):** número plano signed. Positivo = INGRESO, negativo
  = EGRESO. Tipo (Ingreso/Egreso) en el form determina el signo
  server-side, no en el body del request.

**Columnas que el dashboard NUNCA toca si ya tienen fórmula:**
- **D (#):** `=SI(C{row}<>"";FILA()-2;"")` — auto-incremental.
- **G (SALDO):** `=SI(C{row}="";"";SUMAR.SI.CONJUNTO($F$3:F{row};$B$3:B{row};B{row}))` — saldo acumulado por moneda.

**Si la fila destino está más allá del rango pre-llenado** (no tiene
fórmula en D), el server agrega las fórmulas en D y G de esa fila
para mantener el patrón. Detección: `values.get` con
`valueRenderOption: 'FORMULA'` chequea si D arranca con `=`.

**Endpoints:**
- `POST /api/caja/movimiento` (owner only) — body
  `{ fecha, moneda, descripcion, categoria, importe, tipo }`. Server
  calcula `importe_final = tipo === 'EGRESO' ? -importe : importe`,
  busca pestaña del mes correspondiente a `fecha`, encuentra primera
  fila con C vacía ≥ fila 3, escribe A B C E F (y D, G si faltan).
- `GET /api/caja/movimientos?mes=YYYY-MM` — lista de movs de esa
  pestaña + `mesesDisponibles` (todas las pestañas válidas).
- `GET /api/caja/saldos` — suma de TODAS las pestañas mensuales
  agrupada por moneda (saldo total actual).

### Módulo CTA CTE BAIGUN (cuenta corriente subarriendo LH5)

Tab `CTA CTE BAIGUN` del `SERVICIOS_SHEET_ID` (schema preparado por otra
instancia — **no se crea ni modifica desde el dashboard**, solo append y
update de filas):

```
A id | B fecha DD/MM/YYYY | C mes_origen YYYY-MM | D tipo (cargo|pago|ajuste)
E concepto | F servicio_ref | G monto (positivo) | H saldo_despues (signed)
I metodo | J notas | K fuente (auto|manual) | L cargado_por | M created_at ISO
N deleted_at ISO | '' = activo (soft delete)
```

**Lib helpers:** `src/lib/baigun-cta-cte.ts` (parser + types puro) +
`src/lib/baigun-cta-cte-server.ts` (Sheet I/O con service account).

**Endpoints** (todos owner-only salvo GET que también permite manager):
- `GET /api/baigun/cta-cte?mes=&servicio=&tipo=` →
  `{ items, saldoTotal, saldoMes }`.
- `POST /api/baigun/cta-cte` body `{ fecha, tipo, concepto, monto,
  metodo, notas, mesOrigen?, servicioRef? }` → append fila manual.
- `PATCH /api/baigun/cta-cte` body `{ id, ...campos }` → update +
  recalcula saldos en cascada.
- `DELETE /api/baigun/cta-cte?id=X` → soft delete (col N) + recalcula
  saldos.
- `GET /api/baigun/cta-cte/export?formato=csv&mes=&servicio=&tipo=` →
  CSV con headers en español + BOM UTF-8.
- `POST /api/baigun/derivar-mes` body `{ mes: 'YYYY-MM' }` → genera
  cargos auto idempotentes: por cada servicio del LISTADO con
  `subarrendadoBaigun=true && activo=true` que tenga monto en col LH5
  del pivot mensual, crea `tipo='cargo'` con monto `lh5 * baigunPct/100`.
  Si ya existe mov auto con mismo `(mesOrigen, servicioRef)`, lo
  actualiza si difiere el monto; si no, skip. Devuelve
  `{ agregados, actualizados, sinCambios, sinPagar }`.
- `GET /api/baigun/derivar-mes-cron` (sin sesión user; auth con
  `Authorization: Bearer ${CRON_SECRET}`) → corre `derivar-mes` para
  el mes actual. Configurado en `vercel.json` con cron `0 12 5 * *`
  (día 5 de cada mes 12:00 UTC). Vercel Hobby permite 2 crons gratis.
  Setear `CRON_SECRET` en Vercel env para producción.

**Sign convention:** saldo > 0 = Baigun debe a Lharmonie. cargo suma,
pago resta. Ajuste suma (puede ser + o - según interpretación).

**UI** (`/baigun`): 3 vistas con segmented control (Resumen / Histórico
/ Calendario). Resumen muestra hero saldo total + sub-cards mes +
botón "+ Registrar pago" + "🔄 Generar cargos del mes" + tabla por
servicio. Histórico = filtros + lista cronológica + export CSV + nuevo
mov manual. Calendario = grid 7×N del mes con dots por día.

### Convención al leer pivot mensual (marcar pagado)

Cuando se escribe el monto en la celda mensual, el dashboard escribe
**el monto exacto** (formato `$1.234`), no "OK". El form pre-rellena
con `montoEstimadoArs` (o `montoEstimadoUsd`) del LISTADO como
sugerencia editable. Lectura del Sheet:

| Valor en celda | Estado parseado | Notas |
|----------------|-----------------|-------|
| número con `$` | `pagado` | monto se usa en sumas |
| `OK` / `Ok` / `ok` | `pagado_sin_monto` | (legacy, se considera pagado; sumas usan fallback al `montoEstimadoArs` del LISTADO) |
| `NO` | `no_aplica` | el local no tiene este servicio |
| `TODAVIA NO` / `PENDIENTE` / `PAGAR` | `pendiente` | falta cargar este mes |
| (vacío) | `vacio` | sin cargar |

### Servicios — TODO de configuración

Para Servicios y Baigun, ver `TODO_TOMORROW.md` (raíz): compartir el
Sheet de Servicios con el service account, setear `SERVICIOS_SHEET_ID`
en Vercel, confirmar nombres de tabs. Hasta que se complete, los
endpoints `/api/servicios/*` y `/api/baigun` devuelven error claro.

---

## Diseño visual — qué se copia del staff y qué cambia

### Lo que se copia 1:1 del staff (`~/Desktop/lharmonie-staff/`)

- **`globals.css` entero** (1964 líneas). Paleta `:root`, todos los
  `@keyframes`, todas las utility classes (`.tap-feedback`,
  `.spring-tap`, `.page-enter`, `.page-back-enter`, `.lh-inicio-fade-up`,
  `.lh-inicio-scale-in`, `.lh-inicio-stagger`, `.spring-in`,
  `.btn-glow-*`, `.glass-card`, `.bezel-shell`, `.eyebrow`, etc.).
- **Tipografía:** Recoleta self-hosted + Fraunces (Google) + DM Sans.
- **Componentes core:** `AnimatedNumber`, `EyebrowTag`, `Button`,
  `DoubleBezelCard`, `FunctionBanner`.
- **BottomNav:** glass blur 86%, sliding pill con
  `cubic-bezier(0.32, 0.72, 0, 1)`, crossfade outlined→filled icons,
  portal a `document.body` (mismo patrón que `staff/page.tsx:1505-1619`).
- **Login hero:** gradient + ambient glow + decorative line + badge.
- **Animaciones de page:** `.page-enter` aplicado a cada page; los
  contenidos usan `.lh-inicio-stagger` y `.spring-in` donde el staff
  los usa.

### Diferencias permitidas (top nav exclusive)

| Token | Staff | Dashboard |
|-------|-------|-----------|
| `--header-bg` | `#1E1512` | `#0D0805` (más oscuro) |
| Border-bottom del header | `var(--border)` | `rgba(196,160,103,0.20)` (dorado) |
| Box-shadow del header | sutil neutral | `0 1px 8px rgba(196,160,103,0.08)` (tinte dorado) |
| Tag a la derecha | "Staff" | "MANAGEMENT" en pill bordeado dorado |
| Ícono extra | NotifBell | Lupa → `/buscar` |

Esos overrides van AL FINAL de `globals.css` (`/* ── Lharmonie Dashboard
— overrides exclusive ─ */`), nunca dentro de `:root`.

---

## Auth (sin tocar lo que ya funciona)

### Flujo

1. Usuario abre `/login` y aprieta "Sign in with Google" (GIS popup +
   FedCM + ITP support).
2. Cliente recibe el ID token y POSTea a `/api/auth/login`.
3. Server verifica el token con `googleapis` (`OAuth2.verifyIdToken`).
4. Si email ∉ `src/lib/authorized-emails.ts` → 403 `error: 'not_authorized'`,
   cliente redirige a `/unauthorized`.
5. Si OK → cookie HMAC-SHA256 (`lh-dash-session`, 30 días, HttpOnly,
   SameSite=Lax, Secure en prod).
6. `AuthProvider` polea `/api/auth/session` al iniciar.

### Sistema de usuarios (Sheet-backed con fallback hardcoded)

**Fuente de verdad:** tab `Usuarios` del Sheet de Facturas
(`FACTURAS_SHEET_ID`), columnas `Email | Nombre | Rol | Activo |
Agregado por | Fecha`.

**Fallback:** `AUTHORIZED_USERS` hardcoded en `src/lib/users.ts` —
seed inicial de owners (Martin + Cronklam). Si el Sheet no responde
(falta `GOOGLE_CREDENTIALS` o el tab no existe), el dashboard sigue
funcionando con la lista hardcoded.

**Cache runtime:** TTL 60s en proceso (`setSheetUsers/getSheetUsers`).
Cada `getSessionUser` llama `refreshSheetUsersCache()` antes de validar
para que cambios en el Sheet impacten al próximo poll de sesión.

**Roles del dashboard** (definidos en `lib/users.ts`):

| Rol | Capabilities |
|-----|-------------|
| `owner` | Todo + P&L + gestión de usuarios (CRUD) |
| `admin` | Dashboard completo + marcar pagadas. Puede VER usuarios pero no editar |
| `viewer` | Solo lectura — sin marcar pagadas |

Espejo del patrón staff (`~/Desktop/lharmonie-staff/src/lib/users.ts`)
pero simplificado: el dashboard tiene un universo más chico que el
staff, así que 3 niveles claros en lugar de 11.

**API:**
- `GET /api/usuarios` (admin/owner) → `{ users, allRows, source }`.
  Hidrata cache. Autocrea el tab "Usuarios" + headers + seed si no existe.
- `POST /api/usuarios` (owner only) → upsert por email
  (`{ email, name, role, activo }`). Validación email + rol server-side.

**Defensa en profundidad:** se chequea isAuthorized en `/api/auth/login`
(crear sesión) y en `withAuth` para cada request a /api/* que sirva data
sensible. `getUserRole()` se usa en `/api/auth/session` para devolver el
rol al cliente; `AuthProvider` expone `isOwner` / `isAdmin`.

### Defensa en profundidad

- **Edge proxy** (`src/proxy.ts`, antes "middleware") bloquea `/api/*`
  sin cookie válida (excepto `/api/auth/*`).
- `withAuth` re-valida cookie + whitelist en cada API route que sirva
  data sensible (`/api/facturas`, `/api/foodcost`, `/api/factura/marcar-pagada`).
- CSP cerrado en `next.config.ts` (Google OAuth + Sheets + Fonts + jsdelivr
  para charts).

---

## Datos: Facturas (READ-ONLY) + Marcar pagada (única write)

### Lectura

- **Sheet ID Facturas:** `1lZER27XWpUIaRIeosoJjMhXaclj8MS-6thOeQ3O3a8o` (env `FACTURAS_SHEET_ID`).
- **Sheet ID Recetario:** `15tlHXgIKznAxjc8Accpe6xVK4ghaMcUo0Uwq1-A4b6E` (env `RECETARIO_SHEET_ID`, hay default en `lib/sheets.ts`).
- **Tab Facturas:** `Facturas`. Tab Recetario: `Foodcost GRAL`.
- **API key:** `GOOGLE_API_KEY` server-side, NUNCA expuesta al cliente.
- **Endpoints:**
  - `GET /api/facturas` → `{ ok, facturas }` cada fila como `{ [columna]: string }` + `_sheetRow` (numérico, fila exacta).
  - `GET /api/foodcost` → `{ ok, items }` con `articulo`, `categoria`, `costoIVA`, `pv`, `fcPct`, `fcIdeal`, `revisar`, `faltaCosto`.
- **Cache:** `revalidate: 60` para Facturas, `revalidate: 300` para Recetario.

### Escrituras

**(1) Marcar factura pagada** — proxea al worker.

`POST /api/factura/marcar-pagada` con body
`{ nroFactura, proveedor, fecha, filaExacta }`.

Internamente proxea al **worker de Railway**:
- `WORKER_URL = https://worker-production-7f89.up.railway.app`
- `POST /update-estado` con header `x-api-secret: $API_SECRET`
- Mismo body + `fechaPago = new Date().toLocaleDateString('es-AR')`.

El worker escribe medio de pago + fecha en la fila exacta. El bot de
Telegram también lo usa. Para `marcar-pagada` **no escribir directo al
Sheet desde Next.js** — sigue pasando por el worker.

**(2) Tab "Usuarios"** — escribe directo desde Next.js con service
account.

`POST /api/usuarios` (owner only) usa `googleapis` con
`GOOGLE_CREDENTIALS` (service account JSON) para hacer upsert en el tab
"Usuarios" del Sheet de Facturas. Diferente de marcar-pagada porque la
gestión de acceso es responsabilidad del dashboard mismo (no del
worker), y el worker no expone endpoints genéricos de upsert.

### Mapping de columnas (`COL` en `FacturasStore.tsx`)

```
fecha:'Fecha FC', proveedor:'Proveedor', cuit:'CUIT', tipoDoc:'Tipo Doc',
pv:'# PV', nroFac:'# Factura', categoria:'Categoría', local:'Local',
cajero:'Cajero', importeNeto:'Importe Neto', iva21:'IVA 21%',
iva105:'IVA 10.5%', total:'Total', medioPago:'Medio de Pago',
estado:'Estado', fechaPago:'Fecha de Pago', obs:'Observaciones',
procesado:'Procesado', imagen:'Imagen', mes:'Mes', anio:'Año'
```

---

## Env vars (Vercel project: `lharmonie-dashboard`)

| Var | Valor / fuente | Notas |
|-----|----------------|-------|
| `GOOGLE_CLIENT_ID` | mismo que el staff | copiar del project `lharmonie-staff` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | idem | idéntico al de arriba |
| `AUTH_SECRET` | `openssl rand -base64 32` | **DISTINTO** del staff |
| `GOOGLE_API_KEY` | `AIzaSyCj1vL8svli0VUdZOPb7ADZkRBhCQBLe2o` | API key con acceso a Sheets API |
| `FACTURAS_SHEET_ID` | `1lZER27XWpUIaRIeosoJjMhXaclj8MS-6thOeQ3O3a8o` | |
| `RECETARIO_SHEET_ID` | `15tlHXgIKznAxjc8Accpe6xVK4ghaMcUo0Uwq1-A4b6E` | opcional, hay default en código |
| `WORKER_URL` | `https://worker-production-7f89.up.railway.app` | worker Railway que escribe al Sheet |
| `API_SECRET` | `lharmonie2026` | mismo que el dash viejo + bot Telegram |
| `GOOGLE_CREDENTIALS` | JSON del service account | Necesario para escribir el tab "Usuarios", Servicios y Caja. Si falta, el sistema cae a la lista hardcoded de `AUTHORIZED_USERS` y los módulos Servicios/Caja devuelven error visible. Mismo service account del staff sirve. |
| `SERVICIOS_SHEET_ID` | `1u6zH3X5MB1EyMQJ59YEkGFhbuQwzv7TsZbz2XZKZ_kM` | Sheet con tabs `Servicios Catalogo`, `Servicios Pagos`, `Baigun CtaCte`. Service account compartido como Editor. |
| `CAJA_SHEET_ID` | `1Vx2aOlbf79GKSL-LaZUBYiluWnqiCv3EWaVv1oEej1Q` | Sheet con tabs `CajaChica_Movimientos`, `CajaChica_Sesiones`, `CajaGrande_Movimientos`. |
| `SERVICIOS_CATALOGO_TAB`, `SERVICIOS_PAGOS_TAB`, `BAIGUN_CTA_CTE_TAB`, `CAJA_CHICA_MOV_TAB`, `CAJA_CHICA_SES_TAB`, `CAJA_GRANDE_TAB` | (overrides) | Defaults heredados del staff. Si los tabs reales tienen otros nombres, sobrescribir acá. NO se autocrean — el tab tiene que existir. `BAIGUN_CTA_CTE_TAB` default es `'CTA CTE BAIGUN'`. |
| `CRON_SECRET` | string secreto (opcional) | Si está set, `/api/baigun/derivar-mes-cron` requiere `Authorization: Bearer <CRON_SECRET>`. Vercel-cron lo envía automáticamente. Sin secret, el endpoint queda abierto (loguea warning). |

`.env.example` tiene la plantilla local.

---

## Reglas que no se deben romper

1. **Sheet de Facturas es READ-ONLY desde Next.js,** salvo:
   - `Marcar pagada` → worker Railway.
   - Tab `Usuarios` → service account directo (`GOOGLE_CREDENTIALS`).

   Cualquier write nuevo a otro tab debe revisar primero CON Martín.
2. **Sistema de usuarios Sheet-backed con fallback hardcoded.**
   Owner se mantiene en `AUTHORIZED_USERS` (`lib/users.ts`) por si el
   Sheet se rompe — nunca quitar a Martin/Cronklam de ahí.
3. **Mobile-first.** Todo cambio de UI debe verse bien en celular.
4. **`AUTH_SECRET` distinto del staff.** Si compartimos secret, las cookies
   son intercambiables → fuga del modelo de auth.
5. **Mantener Chart.js**, no migrar a Recharts.
6. **El bot de Telegram** sigue siendo el único punto de entrada para
   crear facturas; el dashboard solo lee y marca pagadas.
7. **Diseño:** el shell visual (TopNav, BottomNav, animaciones, paleta,
   tipografía) sigue siendo réplica del staff. `DESIGN.md` (raíz del
   repo) es referencia/brújula — usalo cuando el staff no cubra un
   patrón (datos sensibles, OTP, type-to-confirm, etc).

---

## Como correrlo

```bash
# Local
cp .env.example .env.local  # completar valores
npm install
npm run dev   # http://localhost:3000

# Build
npm run build && npm start

# Deploy: push a main → Vercel auto-deploys (sin PRs)
git checkout main && git merge --ff-only feat/<branch> && git push origin main
```

---

## Lecciones aprendidas

1. **Next.js 16:** `middleware.ts` deprecado → `proxy.ts` con
   `export async function proxy(req)`.
2. **`useSearchParams()`** requiere `<Suspense>` boundary en Next 16.
   Wrappear el contenido en un componente interno.
3. **Vercel "Root Directory"** se configura en Project Settings, NO en
   `vercel.json`. Si el repo tenía pin a `dash/`, hay que cambiarlo
   manualmente en la UI de Vercel.
4. **CSS `@import` order:** todos los `@import` van antes de cualquier
   otra regla CSS (incluyendo `@font-face`), sino el browser los ignora.
5. **Tipo `Factura`:** Record<string, string> + `_sheetRow` numérico
   genera conflicto de index signature en TS. Solución: en el server
   guardamos `_sheetRow` como `Record<string, string | number>`, y al
   recibirlo en el cliente lo convertimos a string (parsing a int
   solo cuando llamamos al worker).
6. **Sheets API rate limits (429):** `next: { revalidate: 60 }` para
   Facturas y `300` para Recetario. Si el dashboard hace muchas
   refresh, se cachea correctamente del lado de Next.
7. **Bottom nav portal:** el BottomTabBar del staff usa `createPortal`
   a `document.body` para escapar `transform` de wrappers que rompen
   `position: fixed`. Replicado igual.

---

## Bugs conocidos / próximos pasos

- [ ] Cuando Martín confirme el email de Iara, descomentar la línea
      en `src/lib/authorized-emails.ts` y pushear.
- [ ] `/pyl` es placeholder. Cuando esté listo el pipeline P&L
      (`cronklam/lharmonie-pnl-upload`), conectar al pipeline real.
- [ ] `/productos → Artículos` actualmente muestra agrupado por
      proveedor + categoría (resumen útil pero no la lista granular
      del Sheet "Artículos" — eso lo hacía la API key del dash viejo
      contra el tab "Artículos" de Facturas. Ver si se quiere migrar
      esa data específica más adelante).
- [ ] Setear `CRON_SECRET` en Vercel cuando se confirme el cron de
      `/api/baigun/derivar-mes-cron`. Vercel Hobby permite 2 crons
      gratis — si subimos a Pro podemos aumentar la frecuencia
      (semanal/diaria) según necesidad.
- [ ] **PARTE 3 (control de gastos) — MVP shippeado**: hay KPI cards
      arriba del Tab Tabla en `/servicios` (Total mes, Top categoría,
      Top local, Sin pagar). Falta: semáforos por servicio (delta vs
      mediana 3m), banner alertas colapsable + endpoint
      `/api/servicios/alertas`, forecast endpoint + toggle, flags
      rojo/amarillo en Tab Calendario. Diseño definido, implementación
      pendiente para próxima iteración.
- [ ] **Servicios — sync con staff PENDIENTE**: el staff
      (`~/Desktop/lharmonie-staff/`) tiene su propio catálogo en
      `ENVIOS_SHEETS_ID` tab "Servicios Catalogo". El dashboard ahora
      tiene su catálogo canónico en el tab "ÍNDICE" del
      `SERVICIOS_SHEET_ID`. Por ahora coexisten — en una fase
      posterior queremos que el staff lea el ÍNDICE del dashboard
      como fuente única, para que no haya divergencia. Hasta entonces,
      si cambia un servicio acá hay que cambiarlo también allá manual.

---

## Relación con otros repos

- **lharmonie-staff** (`cronklam/lharmonie-staff`): app de staff. Misma
  paleta, mismo shell. Auth secret **distinto** (cookies no intercambiables).
- **lharmonie-bot** (`cronklam/lharmonie-bot`): bot de Telegram que
  escribe facturas al Sheet que lee este dashboard.
- **lh-staff-whatsapp** (`cronklam/lh-staff-whatsapp`): worker de Railway
  que también escribe al Sheet (`/update-estado`). El dashboard usa
  este mismo worker para "marcar pagada".
- **lharmonie-pnl-upload** (`cronklam/lharmonie-pnl-upload`): pipeline
  de P&L; eventualmente alimenta `/pyl`.
