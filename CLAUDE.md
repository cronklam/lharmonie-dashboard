# CLAUDE.md — Lharmonie Dashboard (Management)

> **OBLIGATORIO:** Leer este archivo COMPLETO antes de tocar cualquier
> archivo del repo. Sin excepciones.

---

## Que es este proyecto

Dashboard web privado para el management de Lharmonie. Replica el shell
de la app de staff (`cronklam/lharmonie-staff`) para que management tenga
una experiencia visual y de auth idéntica, pero con un top nav más
"exclusive" (oscuro/luxury) que diferencia este surface como privado.

La primera funcionalidad es **Facturas** — lee del Sheet que el bot de
Telegram llena. Resto de modulos (P&L, Sueldos, Caja chica, Servicios)
vienen en próximas fases como placeholders.

**URL:** `lharmonie-dashboard.vercel.app`
**Repo:** `cronklam/lharmonie-dashboard`
**Deploy:** Vercel (auto-deploy desde `main`)

**Dueno:** Martin Masri (martin.a.masri@gmail.com).
**Nombre:** siempre "Lharmonie" (sin apostrofe). Nunca "L'Harmonie".

---

## Stack

- **Next.js 16** (App Router, Turbopack) + TypeScript
- **React 19**
- **Tailwind v4** (via `@tailwindcss/postcss`)
- **googleapis** (verificación de Google ID tokens en `/api/auth/login`)
- **Web Crypto** (HMAC-SHA256 para cookie de sesión)
- **PWA** estática (`public/manifest.json` + `public/sw.js`)

Mismo stack que el staff app, salvo que el dashboard NO usa el Sheet de
"Usuarios" para gating — usa una whitelist hardcoded en código.

---

## Estructura del repo

```
lharmonie-dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx         ← top nav exclusive + bottom nav + AuthProvider
│   │   ├── globals.css        ← paleta + tokens + variantes "exclusive"
│   │   ├── page.tsx           ← Inicio (saludo + grid de accesos rápidos)
│   │   ├── facturas/page.tsx  ← migración de la app vieja (lista + detalle)
│   │   ├── operaciones/page.tsx (placeholder)
│   │   ├── control/page.tsx     (placeholder)
│   │   ├── equipo/page.tsx      (placeholder)
│   │   ├── perfil/page.tsx      (info del usuario logueado + logout)
│   │   ├── login/page.tsx       (Google Sign-In)
│   │   ├── unauthorized/page.tsx (rebote para emails fuera de la whitelist)
│   │   ├── components/
│   │   │   ├── AuthProvider.tsx       ← context + redirect a /login
│   │   │   ├── TopNav.tsx             ← variante exclusive
│   │   │   ├── BottomNav.tsx          ← 5 tabs MercadoPago-style
│   │   │   ├── PlaceholderScreen.tsx  ← reusable para módulos pendientes
│   │   │   └── ServiceWorkerRegister.tsx
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/route.ts    ← verifica Google JWT + whitelist + cookie HMAC
│   │       │   ├── logout/route.ts   ← clear cookie
│   │       │   └── session/route.ts  ← lee cookie + valida whitelist
│   │       └── facturas/route.ts     ← lee Sheet server-side, valida sesión
│   ├── lib/
│   │   ├── authorized-emails.ts ← whitelist hardcoded (FUENTE DE GATING)
│   │   ├── session.ts           ← cookie HMAC-SHA256
│   │   ├── auth-guard.ts        ← withAuth wrapper para API routes
│   │   └── sheets.ts            ← cliente del Sheet de Facturas (READ-ONLY)
│   └── proxy.ts                 ← edge proxy: bloquea /api/* sin sesión
├── public/
│   ├── manifest.json (PWA)
│   ├── sw.js (service worker pasivo)
│   ├── icon-192.png, icon-512.png, logo.png
├── CLAUDE.md (este archivo)
├── package.json, tsconfig.json, next.config.ts, postcss.config.mjs
└── vercel.json (sin outputDirectory — Next standard)
```

---

## Diseno visual

### Paleta base (idéntica al staff)

| Token | Valor | Uso |
|------|-------|-----|
| `--bg` | `#EDE8DE` | Fondo |
| `--bg-card` | `#FDFBF8` | Tarjetas, inputs |
| `--text` | `#1F1410` | Texto principal |
| `--text-muted` | `#8B6D5A` | Texto secundario |
| `--accent` | `#B8956F` | Acento (botones, tabs activas) |
| `--green` / `--red` | `#4A7C3E` / `#C85A54` | Pagada / Pendiente |

### Top nav EXCLUSIVE — diferencia clave vs. staff

| Token | Valor | Uso |
|------|-------|-----|
| `--header-bg` | `#0D0805` | Casi negro espresso (más oscuro que staff `#1E1512`) |
| `--header-accent` | `#C4A067` | Dorado tenue del logo / tag |
| `--header-text` | `#F9F7F3` | Cream blanco roto |
| `--header-divider` | `rgba(196,160,103,0.20)` | Línea inferior dorada al 20% |
| `--shadow-header-exclusive` | `0 1px 8px rgba(196,160,103,0.08)` | Tinte dorado |

A la derecha del top nav va el tag `MANAGEMENT` en DM Sans uppercase
10px, letter-spacing 0.15em, color `--header-accent`. Esto es lo que
visualmente diferencia este dashboard como surface privado.

### Tipografía

- **Títulos:** `'Recoleta', 'Fraunces', Georgia, serif`
  (Recoleta es la oficial; Fraunces es fallback web vía Google Fonts)
- **Body:** `'DM Sans', system-ui, sans-serif` (Google Fonts)
- Recoleta self-hosted opcional en `/public/fonts/Recoleta-*.woff2`.
  Si no existen los archivos, el browser cae a Fraunces sin romper.

### Layout

- Mobile-first.
- Top nav sticky 56px (alto + safe-area).
- Bottom nav fija 5 tabs (Inicio / Operaciones / Control / Equipo / Perfil).
- `<main className="lh-page">` agrega padding inferior para no quedar
  tapado por la bottom nav.

---

## Auth: Google OAuth + whitelist hardcoded

### Flujo

1. El usuario abre `/login` y aprieta "Sign in with Google" (Google
   Identity Services con `ux_mode: 'popup'` + `use_fedcm_for_prompt: true`).
2. El cliente recibe el ID token y lo POSTea a `/api/auth/login`.
3. El server verifica el token con `googleapis` (`OAuth2.verifyIdToken`).
4. Si el email NO está en `src/lib/authorized-emails.ts` → 403 con
   `error: 'not_authorized'`. El cliente redirige a `/unauthorized`.
5. Si está autorizado → genera cookie HMAC-SHA256 (`lh-dash-session`,
   30 días, HttpOnly, SameSite=Lax, Secure en prod) y devuelve user.
6. `AuthProvider` polea `/api/auth/session` al iniciar la app y
   redirige a `/login` si no hay sesión válida.

### Whitelist (única fuente de gating)

Vive en `src/lib/authorized-emails.ts` y se chequea **dos veces**:
- En `/api/auth/login` (al crear sesión)
- En `/api/auth/session` y `withAuth` (defensa en profundidad — si alguien
  sale de la whitelist y todavía tiene cookie, igual rebota)

```ts
export const AUTHORIZED_EMAILS = [
  'martin.a.masri@gmail.com',
  'cronklam@gmail.com',
  // 'iara.zayat@gmail.com',  ← agregar cuando Martín confirme el email
] as const;
```

### Defensa en profundidad

- El edge proxy (`src/proxy.ts`, antes "middleware") bloquea cualquier
  `/api/*` sin cookie válida (excepto `/api/auth/*`).
- `withAuth` en `lib/auth-guard.ts` re-valida la cookie + whitelist en
  cada API route que sirva data sensible (ej. `/api/facturas`).
- CSP cerrado en `next.config.ts` (sólo Google OAuth + Google Sheets +
  Google Fonts).

---

## Datos: Facturas (READ-ONLY)

- **Sheet ID:** `1lZER27XWpUIaRIeosoJjMhXaclj8MS-6thOeQ3O3a8o` (env
  `FACTURAS_SHEET_ID`)
- **Tab:** `Facturas`
- **API key del proyecto GCP:** env `GOOGLE_API_KEY` (server-side ONLY).
- **Endpoint:** `GET /api/facturas` → devuelve `{ ok, facturas }` con
  cada fila como `{ [columna]: string }`.
- Revalidate de 60 segundos (Next fetch cache) para evitar 429 contra
  Sheets API.

**El dashboard NUNCA escribe al Sheet** — es READ-ONLY. El bot de
Telegram (`cronklam/lharmonie-bot`) es el único que escribe facturas.

Las columnas se mapean en `src/app/facturas/page.tsx` con la constante
`COL` (Fecha FC, Proveedor, CUIT, Tipo Doc, # PV, # Factura, Categoría,
Local, Cajero, Importe Neto, IVA 21%, IVA 10.5%, Total, Medio de Pago,
Estado, Fecha de Pago, Observaciones, Procesado, Imagen).

---

## Env vars (Vercel project: lharmonie-dashboard)

| Var | Valor / fuente | Notas |
|-----|---------------|-------|
| `GOOGLE_CLIENT_ID` | Mismo que el staff | Copiar del Vercel project `lharmonie-staff` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Idem | Idéntico al anterior |
| `AUTH_SECRET` | `openssl rand -base64 32` | **NUEVO** — NO usar el del staff |
| `GOOGLE_API_KEY` | API key con acceso a Sheets API | `AIzaSyCj1vL8svli0VUdZOPb7ADZkRBhCQBLe2o` (la del Sheet de Facturas) |
| `FACTURAS_SHEET_ID` | `1lZER27XWpUIaRIeosoJjMhXaclj8MS-6thOeQ3O3a8o` | |

Ver `.env.example` para una plantilla local.

---

## Reglas que no se deben romper

1. **El dashboard es READ-ONLY.** Solo lee del Sheet de Facturas. El bot
   de Telegram es el único que escribe.
2. **Mobile-first.** Todo cambio de UI debe verse bien en celular.
3. **Whitelist hardcoded en código** — NO leer una lista de usuarios
   desde Sheet ni DB. El control vive en commits.
4. **No agregar a Iara a la whitelist** hasta que Martín confirme el email
   exacto. La línea está marcada como comentario en `authorized-emails.ts`.
5. **AUTH_SECRET distinto del staff.** Si compartimos secret, las cookies
   son intercambiables → fuga del modelo de auth.
6. **CSP cerrado.** Si rompe algo del UI, los errores aparecen en consola
   — primero entender por qué, no abrir la CSP.
7. **El Sheet de Facturas es la única fuente de verdad.** No cachear
   datos en una DB paralela.

---

## Como correrlo

```bash
# Local
cp .env.example .env.local  # y completar valores
npm install
npm run dev   # http://localhost:3000

# Build
npm run build && npm start

# Deploy: push a main → Vercel auto-deploys
```

---

## Bottom nav: 5 tabs

| Tab | Ruta | Estado |
|-----|------|--------|
| Inicio | `/` | Grid de accesos rápidos (Facturas + placeholders) |
| Operaciones | `/operaciones` | Placeholder (P&L, Sueldos, Compras) |
| Control | `/control` | Placeholder (Caja chica, Caja grande, Servicios) |
| Equipo | `/equipo` | Placeholder (Directorio, Asistencia, Cumpleaños) |
| Perfil | `/perfil` | Info del usuario logueado + logout |

`/facturas` se accede desde el grid del Inicio, **no** es una tab del
bottom nav (las 5 tabs son fijas, mismo patrón que el staff).

---

## Ideas ya descartadas

- Login user/pass con USERS hardcoded → reemplazado por Google OAuth.
- Biometric login (WebAuthn/fingerprint) → no aplica con Google OAuth.
- DB propia (SQLite/Postgres) → Sheet alcanza por ahora.
- Reportes P&L en este dashboard → fase posterior, hoy sólo placeholder.
- Dashboard con edición de facturas → el bot de Telegram es la única
  entrada de escritura.

---

## Bugs conocidos / estado actual

- [ ] Verificar que el deploy en Vercel quede bien después del merge —
      tirar un login real con `martin.a.masri@gmail.com` desde mobile.
- [ ] Cuando Martín confirme el email de Iara, descomentar la línea en
      `src/lib/authorized-emails.ts` y pushear.

---

## Lecciones aprendidas

1. **`middleware.ts` deprecado en Next 16.** El archivo va en
   `src/proxy.ts` y debe exportar `proxy(req)` en lugar de
   `middleware(req)`.
2. **`useSearchParams()` requiere `<Suspense>`.** En cualquier page que
   lo use directamente, hay que envolver el inner component en
   `<Suspense>` para que el build de Next 16 no falle al pre-renderizar.
3. **Sheets API rate limits (429).** Por eso `next: { revalidate: 60 }`
   en el fetch de `/api/facturas`.

---

## Relacion con otros repos

- **lharmonie-staff** (`cronklam/lharmonie-staff`): App de staff. Misma
  paleta y misma forma del bottom nav — este repo replica el shell.
  Auth secret es **distinto** (cookies no intercambiables).
- **lharmonie-bot** (`cronklam/lharmonie-bot`): El bot de Telegram que
  escribe facturas al Sheet que lee este dashboard.
- **lharmonie-pnl-upload** (`cronklam/lharmonie-pnl-upload`): Pipeline
  de P&L; el módulo `/operaciones → P&L` (placeholder hoy) eventualmente
  se va a integrar acá o coexistir con un dashboard separado.
