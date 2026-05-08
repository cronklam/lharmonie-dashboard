# DESIGN.md — Sistema de diseño "Editorial Luxury"

> **Estado:** documento de **referencia**, no norma vinculante en este repo.
>
> La regla operativa de este proyecto sigue siendo `CLAUDE.md` →
> "Visualmente IDÉNTICO al staff (excepto top nav exclusive). No
> reinventar componentes ni animaciones — copiarlas."
>
> Este doc define un sistema más amplio (tokens, componentes, patterns
> para apps de pagos / datos sensibles, accesibilidad, anti-patterns)
> que se usa como **brújula aspiracional** y como base para futuros
> proyectos. Cuando un patrón de acá *no contradice* al staff, podemos
> pullearlo (ej. `tabular-nums-strict`, OTP input, confirm modal con
> type-to-confirm, checklist mobile-first). Cuando contradice (renombre
> de tokens, librería de iconos, lib choice de forms) — gana el staff.

---

# SISTEMA DE DISEÑO — INSTRUCCIONES OBLIGATORIAS

Sos un agente de código trabajando en una app web/mobile. Antes de tocar
CUALQUIER componente UI, leé este documento completo. Define el sistema
de diseño "Editorial Luxury" (warm tones + serif editorial + native iOS
feel) que tenés que replicar consistentemente en TODA la app.

Estas reglas son **no-negociables** salvo que el dominio del proyecto pida
explícitamente otra cosa (en cuyo caso tenés que decírmelo y proponer
alternativa, no asumir). Los principios de touch targets, accesibilidad
y mobile-first son inquebrantables.

Cuando agregues un patrón nuevo o descubras un anti-pattern, sumalo al
final del doc para que la próxima sesión lo respete.

---

## 0. FILOSOFÍA DE DISEÑO

Estética **Editorial Luxury con calidez de café**: fondos crema cálidos,
acentos dorados/caramelo, tipografía editorial para títulos (serif) +
sans humanista para body, micro-animaciones estilo iOS/Linear/Stripe,
profundidad sutil con sombras de capas múltiples, glass effects discretos.

**Principios:**

1. **Mobile-first absoluto.** Cada decisión arranca pensando en un iPhone
   13/14 (375-393px). Touch primero, hover como mejora opcional.
2. **Native-feel.** La app debe sentirse como nativa iOS, no como web
   mobile. Easing curves Apple-style, page transitions con dirección,
   press-feedback en todo lo tappable, safe areas respetadas.
3. **Tokens semánticos siempre.** Cero hex raw en componentes. Todo pasa
   por `var(--xxx)`. Si un color no existe en el token system, agregalo
   como token, NO lo metas inline.
4. **Whitespace como protagonista.** Más aire que el promedio web. La
   densidad informativa nace de jerarquía tipográfica y agrupación, no
   de comprimir.
5. **Cero emojis decorativos en UI estructural.** SVG (Lucide / Heroicons /
   propio) para iconos. Emojis solo si son contenido del usuario.
6. **Animaciones con significado.** Cada movimiento expresa causa-efecto
   o continuidad espacial. `prefers-reduced-motion` SIEMPRE respetado.
7. **App Store quality.** Antes de cerrar UI nueva: correr el Pre-Delivery
   Checklist (§16).

---

## 1. PALETTE COMPLETA (CSS variables)

Pegar tal cual en `globals.css` `:root`. Los nombres semánticos
(`--text-muted`, no `--gray-100`) son CRÍTICOS — los componentes
consumen tokens, no hex.

```css
:root {
  /* ── Core palette (warm coffee tones) ── */
  --bg: #F7F5F1;
  --bg-subtle: #EDE8DE;
  --bg-card: #FFFFFF;
  --bg-card-hover: #FDFBF8;
  --bg-card-alt: #F9F7F3;
  --bg-input: #F7F5F1;

  /* ── Text ── */
  --text: #1A1210;
  --text-secondary: #6B5C52;
  --text-muted: #8B7D72;
  --text-dim: #B0A89F;
  --text-inverse: #FDFBF8;

  /* ── Brand accent (caramel/gold) ── */
  --accent: #C4956A;
  --accent-hover: #B8865C;
  --accent-light: #D4A574;
  --accent-bg: rgba(196, 149, 106, 0.10);
  --accent-bg-strong: rgba(196, 149, 106, 0.20);

  /* ── Header / Dark surfaces ── */
  --header-bg: #1E1512;
  --header-bg-light: #2C1F18;

  /* ── Semantic colors ── */
  --green: #3D8B37;
  --green-light: #4CAF50;
  --green-bg: rgba(61, 139, 55, 0.08);
  --green-bg-strong: rgba(61, 139, 55, 0.15);

  --red: #D44D44;
  --red-light: #E57373;
  --red-bg: rgba(212, 77, 68, 0.08);
  --red-bg-strong: rgba(212, 77, 68, 0.15);

  --amber: #E6A23C;
  --amber-bg: rgba(230, 162, 60, 0.10);

  --blue: #4A90D9;
  --blue-bg: rgba(74, 144, 217, 0.08);

  /* ── Borders & Shadows ── */
  --border: rgba(26, 18, 16, 0.06);
  --border-strong: rgba(26, 18, 16, 0.12);
  --border-accent: rgba(196, 149, 106, 0.30);

  --shadow-sm: 0 1px 2px rgba(0,0,0,0.03), 0 1px 1px rgba(0,0,0,0.04);
  --shadow-md: 0 2px 6px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03);
  --shadow-lg: 0 6px 16px rgba(0,0,0,0.05), 0 4px 8px rgba(0,0,0,0.03);
  --shadow-xl: 0 12px 32px rgba(0,0,0,0.08), 0 8px 16px rgba(0,0,0,0.04);
  --shadow-card: 0 1px 4px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.03);
  --shadow-card-hover: 0 4px 16px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.03);
  --shadow-float: 0 12px 36px rgba(0,0,0,0.08), 0 6px 12px rgba(0,0,0,0.04);

  /* ── Glass effect ── */
  --glass-bg: rgba(255, 255, 255, 0.78);
  --glass-border: rgba(255, 255, 255, 0.5);
  --glass-blur: 24px;
  --glass-bg-strong: rgba(255, 255, 255, 0.92);

  /* ── Tokens extra para apps de pagos / datos sensibles ── */
  --secure: #2E7D32;
  --secure-bg: rgba(46, 125, 50, 0.08);
  --warn-strong: #B7791F;
  --warn-strong-bg: rgba(183, 121, 31, 0.10);
  --critical: #C62828;
  --critical-bg: rgba(198, 40, 40, 0.10);
}
```

**Si tu marca pide otro accent**: cambiá únicamente `--accent`,
`--accent-hover`, `--accent-light`, `--accent-bg`, `--accent-bg-strong`,
`--border-accent`. El resto del sistema sigue funcionando.

---

## 2. TIPOGRAFÍA

**Stack:**

```css
.font-brand {
  font-family: 'Recoleta', 'Fraunces', Georgia, serif;
  letter-spacing: -0.02em;
}
body {
  font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
}
```

**Reglas no-negociables:**

- Headings con serif (Recoleta/Fraunces). Body con DM Sans.
- **NO usar `font-brand` en headings con tildes españolas** (Í, Ó, í).
  Recoleta es buggy con caracteres acentuados en algunos pesos. Solo
  serif en hero/display headlines validados manualmente.
- `font-display: swap` para nunca esconder texto.
- Inputs en mobile: **min 16px** font-size (evita auto-zoom iOS).

**Escala:**

```css
:root {
  --text-xs: 11px;       /* labels, captions */
  --text-sm: 12.5px;     /* metadata, helper */
  --text-base: 14px;     /* body default app dense */
  --text-md: 15px;       /* body comfortable */
  --text-body: 16px;     /* body input — CRÍTICO no auto-zoom iOS */
  --text-lg: 18px;       /* subheading */
  --text-xl: 22px;       /* headline */
  --text-2xl: 28px;      /* display small */
  --text-3xl: 34px;      /* display medium */

  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;

  --lh-tight: 1.15;
  --lh-snug: 1.35;
  --lh-normal: 1.5;
  --lh-relaxed: 1.65;
}
```

**Eyebrow tag** (patrón usado arriba de cada title de pantalla):

```tsx
<span style={{
  fontSize: 9.5, fontWeight: 700, letterSpacing: "0.18em",
  textTransform: "uppercase", color: "var(--text-muted)",
}}>
  · CATEGORÍA · Subtítulo
</span>
```

**Tabular numbers** para datos financieros (CBUs, CUITs, montos, balances):

```css
.tabular-nums-strict {
  font-feature-settings: "tnum" 1, "lnum" 1;
  font-variant-numeric: tabular-nums lining-nums;
}
```

Aplicar SIEMPRE en data financiera. Cero excepciones.

---

## 3. SPACING SCALE (4/8 rhythm)

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```

**Regla:** JAMÁS usar valores arbitrarios (`padding: 13px`). Si tu diseño
pide algo distinto, ajustá la jerarquía o agregá un token.

**Tiers:**
- Items de lista: 8-12px
- Subsecciones de card: 16-20px
- Secciones de pantalla: 24-32px
- Bloques de página: 40-48px

---

## 4. TOUCH TARGETS & SAFE AREAS (CRÍTICO)

```css
:root {
  --touch-min: 44px;          /* iOS HIG */
  --touch-comfortable: 48px;  /* Android Material */
  --touch-spacing: 8px;       /* gap mínimo entre tappables */

  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-top: env(safe-area-inset-top, 0px);
  --nav-height: 56px;         /* altura BottomTabBar interno */
}
```

**Reglas:**
- TODO botón/link/chip/toggle: `min-height: 44px`.
- Botones icon-only: 44×44px exacto, SVG centrado adentro.
- Gap mínimo 8px entre tappables adyacentes.
- Bottom navs/CTAs fijos: SIEMPRE `env(safe-area-inset-bottom)`.

**Pattern back button canónico** (replicar en TODOS los headers):

```tsx
<button
  onClick={onBack}
  className="flex items-center justify-center rounded-full press-feedback"
  style={{
    width: "var(--touch-min)",
    height: "var(--touch-min)",
    background: "var(--bg-subtle)",
  }}
  aria-label="Volver"
>
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M11 4L6 9L11 14" stroke="var(--text)" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" />
  </svg>
</button>
```

**Auto-expand hit area con `:has()`:**

```css
button:has(svg[width="14"]),
button:has(svg[width="16"]),
button:has(svg[width="18"]) {
  min-width: var(--touch-min);
  min-height: var(--touch-min);
}
```

**Pattern CTA fijo arriba del bottom nav:**

```tsx
<div
  className="fixed left-0 right-0 p-3"
  style={{ bottom: "calc(var(--nav-height) + var(--safe-bottom))" }}
>
  <button className="btn-glow-accent w-full py-2.5 rounded-xl text-sm font-bold">
    Confirmar
  </button>
</div>

{/* En el scroll content, padding-bottom para que el CTA no tape */}
<div style={{ paddingBottom: "calc(var(--nav-height) + 72px + var(--safe-bottom))" }}>
  ...
</div>
```

---

## 5. EASING CURVES & DURACIONES

```css
:root {
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);    /* premium enter */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);  /* taps, toasts */
  --ease-ios: cubic-bezier(0.4, 0.0, 0.2, 1);        /* gestures */
  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);   /* sheets, modals */
  --ease-soft: cubic-bezier(0.32, 0.72, 0, 1);       /* Apple-tier nav */

  --dur-press: 120ms;     /* tap feedback */
  --dur-toggle: 220ms;    /* tabs, switches */
  --dur-page: 280ms;      /* page transitions */
  --dur-sheet: 380ms;     /* drawers/modals */
}
```

**Reglas:**
- Micro-interactions: 150-300ms.
- Page transitions: 250-400ms.
- Modales/sheets: 320-450ms.
- **Nunca >500ms ni <100ms.**
- Easing por dirección: enter `ease-out-*`, exit `ease-in-*` (~60-70%
  de duración del enter).
- Page forward: slide horizontal desde derecha (translateX 28px).
- Page back: slide desde izquierda (translateX -28px).
- Solo animar `transform` y `opacity`. NUNCA `width`, `height`, `top`,
  `left` (causan reflow).
- `prefers-reduced-motion` respetado en TODAS las keyframes.

**Press feedback universal:**

```css
.press-feedback {
  transition: transform var(--dur-press) var(--ease-ios),
              opacity var(--dur-press) var(--ease-ios);
  -webkit-tap-highlight-color: transparent;
}
.press-feedback:active {
  transform: scale(0.97);
  opacity: 0.85;
}
@media (hover: hover) {
  .press-feedback:hover { transform: translateY(-1px); }
}
```

**Stagger reveal (listas que aparecen):**

```css
.stagger-reveal > * {
  opacity: 0;
  animation: staggerFadeUp 900ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.stagger-reveal > *:nth-child(1) { animation-delay: 80ms; }
.stagger-reveal > *:nth-child(2) { animation-delay: 180ms; }
.stagger-reveal > *:nth-child(3) { animation-delay: 280ms; }
.stagger-reveal > *:nth-child(4) { animation-delay: 380ms; }
.stagger-reveal > *:nth-child(5) { animation-delay: 480ms; }
.stagger-reveal > *:nth-child(n+6) { animation-delay: 560ms; }

@keyframes staggerFadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .stagger-reveal > * { animation: none; opacity: 1; transform: none; }
}
```

---

## 6. Z-INDEX SCALE

```css
:root {
  --z-base: 0;
  --z-dropdown: 10;
  --z-sticky: 20;
  --z-floating: 40;     /* FAB, floating action bars */
  --z-overlay: 90;      /* backdrops */
  --z-modal: 100;       /* drawers, popovers, modals */
  --z-toast: 1000;      /* notifications globales */
}
```

JAMÁS usar `z-index: 9999`. Si necesitás otro nivel, agregalo al token
system.

---

## 7. RADIUS SCALE

```css
:root {
  --radius-sm: 10px;     /* chips, tags */
  --radius-md: 14px;     /* cards medianas, inputs */
  --radius-lg: 20px;     /* cards grandes */
  --radius-xl: 28px;     /* heroes, sheet mobile top corners */
  --radius-full: 9999px; /* pills, avatares */
}
```

Inputs grandes / CTAs primary: `rounded-xl` (20-22px).
Cards estándar: `rounded-2xl` (~16px Tailwind).
Bottom sheets: top corners 22-28px, bottom 0.

---

## 8. COMPONENTES CORE

### 8.1 Botón primario con luz profesional

Sombras de capas múltiples estilo Linear/Stripe:

```css
.btn-glow-accent {
  background: var(--accent);
  color: #FDFBF8;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),    /* highlight superior */
    inset 0 -1px 0 rgba(0, 0, 0, 0.10),         /* peso inferior */
    0 1px 2px rgba(31, 20, 16, 0.08),           /* lift sutil */
    0 6px 16px -4px rgba(184, 149, 111, 0.45),  /* glow del color */
    0 12px 28px -10px rgba(184, 149, 111, 0.30);
  letter-spacing: -0.01em;
  transition: box-shadow .22s var(--ease-ios), transform .15s var(--ease-ios);
}
.btn-glow-accent:active {
  transform: scale(0.985);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.10),
    inset 0 -1px 0 rgba(0, 0, 0, 0.18),
    0 1px 2px rgba(31, 20, 16, 0.10),
    0 2px 6px -2px rgba(184, 149, 111, 0.40);
}

.btn-glow-dark    { /* idem con var(--header-bg) */ }
.btn-glow-success { /* idem con var(--green) */ }
.btn-glow-danger  { /* idem con #D95F4E */ }
```

### 8.2 Componente Button reutilizable

```tsx
type Variant = "primary" | "secondary" | "ghost" | "outline" | "dark" | "danger" | "success";
type Size = "sm" | "md" | "lg";

interface ButtonProps {
  variant?: Variant;     // default "primary"
  size?: Size;           // default "md"
  loading?: boolean;     // disable + spinner
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  iconOnly?: boolean;    // requiere ariaLabel
  ariaLabel?: string;
}
```

Sizes con `min-height` semánticos:
- `sm`: 36px (solo toolbars densas)
- `md`: 44px (`var(--touch-min)`)
- `lg`: 48px (`var(--touch-comfortable)`)

Loading state: deshabilita + render `<Spinner>` reemplazando contenido.
`aria-busy="true"`.

### 8.3 Card / surface

```tsx
<div className="rounded-2xl"
  style={{
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow-card)",
  }}
>
  <div className="p-4">…</div>
</div>
```

### 8.4 Section card con eyebrow + heading

```tsx
<section className="section-card p-4">
  <p style={{
    fontSize: 9.5, fontWeight: 700, letterSpacing: "0.18em",
    textTransform: "uppercase", color: "var(--text-muted)",
    marginBottom: 8,
  }}>
    Datos del cliente
  </p>
  <h2 className="font-brand" style={{
    fontSize: 22, fontWeight: 600, letterSpacing: "-0.022em",
    lineHeight: 1.05, color: "var(--text)",
  }}>
    Tu título acá
  </h2>
</section>
```

### 8.5 Bottom sheet / drawer (modal mobile)

```tsx
{open && createPortal(
  <>
    {/* Backdrop */}
    <div
      className="fixed inset-0 z-[90]"
      style={{
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(4px)",
        animation: "fadeIn 0.22s var(--ease-ios) both",
      }}
      onClick={onClose}
    />
    {/* Sheet */}
    <div
      role="dialog"
      aria-modal="true"
      className="fixed z-[100] flex flex-col"
      style={{
        left: 0, right: 0, bottom: 0,
        maxHeight: "90vh",
        background: "var(--bg)",
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        animation: "sheetSlideUp 0.32s var(--ease-out-expo) both",
        boxShadow: "0 -16px 40px rgba(0,0,0,0.18)",
      }}
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-2 pb-1 shrink-0">
        <div style={{
          width: 38, height: 4, borderRadius: 999,
          background: "var(--border-strong)", opacity: 0.5,
        }} />
      </div>
      {/* Header */}
      <div className="px-5 pb-3 flex items-start justify-between gap-3 shrink-0">
        <div className="flex-1 min-w-0">
          <EyebrowTag>Subtítulo</EyebrowTag>
          <h2 className="font-brand mt-1 truncate" style={{
            fontSize: 22, fontWeight: 600, letterSpacing: "-0.022em",
          }}>Título</h2>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center rounded-full press-feedback shrink-0"
          style={{
            width: "var(--touch-min)", height: "var(--touch-min)",
            background: "var(--bg-subtle)",
          }}
          aria-label="Cerrar"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M11 3l-8 8" stroke="var(--text)"
                  strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {/* Content scrolleable */}
      <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-4">
        {/* form */}
      </div>
      {/* Footer fijo con CTAs */}
      <div className="grid grid-cols-2 gap-2 p-3 shrink-0"
           style={{ borderTop: "1px solid var(--border)" }}>
        <button onClick={onClose} className="btn-secondary">Cancelar</button>
        <button onClick={onSubmit} className="btn-glow-accent">Confirmar</button>
      </div>
    </div>
  </>,
  document.body
)}
```

**Reglas:**
- Drag handle visual SIEMPRE arriba.
- Close button en esquina superior derecha (44×44 círculo).
- ESC cierra. Click backdrop cierra.
- `body.style.overflow = "hidden"` mientras está abierto.
- `aria-modal="true"` + `role="dialog"` + `aria-label`.
- Forms largos: footer sticky con CTAs.

### 8.6 BottomTabBar (Island Nav)

Glass effect + sliding indicator. Max 5 tabs, icono + label.

```tsx
<nav
  className="fixed bottom-0 left-0 right-0 z-[40] grid"
  style={{
    gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
    background: "var(--glass-bg)",
    backdropFilter: "blur(20px) saturate(160%)",
    borderTop: "1px solid var(--border)",
    paddingBottom: "var(--safe-bottom)",
    height: "calc(var(--nav-height) + var(--safe-bottom))",
  }}
>
  <div
    className="absolute"
    style={{
      top: 4,
      width: `${100 / tabs.length}%`,
      left: `${(activeIdx / tabs.length) * 100}%`,
      height: "calc(var(--nav-height) - 8px)",
      background: "var(--accent-bg)",
      borderRadius: 14,
      transition: "left 420ms var(--ease-soft)",
      pointerEvents: "none",
    }}
  />
  {tabs.map((tab, i) => (
    <button
      key={tab.key}
      onClick={() => setActive(i)}
      className="relative flex flex-col items-center justify-center gap-0.5 press-feedback"
      style={{ minHeight: "var(--nav-height)" }}
      aria-current={i === activeIdx ? "page" : undefined}
    >
      <Icon name={tab.icon} size={20}
        color={i === activeIdx ? "var(--accent)" : "var(--text-muted)"} />
      <span style={{
        fontSize: 10,
        fontWeight: i === activeIdx ? 700 : 500,
        color: i === activeIdx ? "var(--text)" : "var(--text-muted)",
      }}>
        {tab.label}
      </span>
    </button>
  ))}
</nav>
```

### 8.7 Inputs

```tsx
<input className="input-pro" style={{ minHeight: 44 }} />
```

```css
.input-pro {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  padding: 0 14px;
  font-size: var(--text-body);   /* 16px — NO bajar de 16 en mobile */
  color: var(--text);
  transition:
    border-color 180ms var(--ease-ios),
    box-shadow 180ms var(--ease-ios),
    background 180ms var(--ease-ios);
}
.input-pro::placeholder { color: var(--text-dim); }
.input-pro:focus {
  outline: none;
  border-color: var(--accent);
  background: var(--bg-card);
  box-shadow: 0 0 0 3px var(--accent-bg);
}
.input-pro:disabled { opacity: 0.5; cursor: not-allowed; }
```

**Autocomplete nativo:** `<input list="...">` + `<datalist>`. Sin libs,
permite sugerencias del browser y custom values.

```tsx
<input list="categorias" value={cat} onChange={e => setCat(e.target.value)} />
<datalist id="categorias">
  {opciones.map(o => <option key={o} value={o} />)}
</datalist>
```

### 8.8 Eyebrow tag

```tsx
function EyebrowTag({ children, dot = true, onDark = false }: Props) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 9.5, fontWeight: 700,
      letterSpacing: "0.18em", textTransform: "uppercase",
      color: onDark ? "rgba(253,251,248,0.7)" : "var(--text-muted)",
    }}>
      {dot && <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: onDark ? "var(--accent-light)" : "var(--accent)",
      }} />}
      {children}
    </span>
  );
}
```

### 8.9 Chips / status pills

```tsx
<span style={{
  display: "inline-flex", alignItems: "center", gap: 4,
  fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
  textTransform: "uppercase",
  background: "var(--green-bg)", color: "var(--green)",
  padding: "3px 8px", borderRadius: 999,
}}>
  Verificado
</span>
```

Multi-estado → map único:

```tsx
const STATUS_CONFIG: Record<Status, { bg: string; color: string; label: string }> = {
  pendiente: { bg: "#FFF8E1", color: "var(--amber)", label: "Pendiente" },
  aprobado:  { bg: "#DBEAFE", color: "var(--blue)",  label: "Aprobado" },
  enviado:   { bg: "#EDE4F7", color: "#7C3AED",      label: "Enviado" },
  recibido:  { bg: "var(--green-bg-strong)", color: "var(--green)", label: "Recibido" },
  cancelado: { bg: "var(--red-bg-strong)",   color: "var(--red)",   label: "Cancelado" },
};
```

NUNCA Tailwind raw (`bg-amber-100`) — rompe la paleta.

### 8.10 Toast / notifications

```tsx
<div
  role="status"
  aria-live="polite"
  className="fixed left-1/2 -translate-x-1/2 z-[1000] toast-in"
  style={{
    bottom: "calc(var(--nav-height) + var(--safe-bottom) + 12px)",
    background: "var(--header-bg)",
    color: "var(--text-inverse)",
    borderRadius: 14,
    padding: "10px 16px",
    fontSize: 13,
    fontWeight: 600,
    maxWidth: "calc(100vw - 32px)",
    boxShadow: "var(--shadow-float)",
  }}
>
  {message}
</div>
```

```css
@keyframes toastIn {
  0%   { transform: translateY(40px) translateX(-50%) scale(0.92); opacity: 0; }
  60%  { transform: translateY(-3px) translateX(-50%) scale(1.02); opacity: 1; }
  100% { transform: translateY(0) translateX(-50%) scale(1); opacity: 1; }
}
.toast-in { animation: toastIn 0.5s var(--ease-spring); }
```

**Reglas:** auto-dismiss 3-5s (8-12s con acción), `aria-live="polite"`,
máx 1 toast (cola simple).

### 8.11 Empty state

NUNCA pantalla en blanco. Siempre icono + texto + acción.

```tsx
<div className="flex flex-col items-center justify-center text-center py-16 px-6">
  <Icon name="inbox" size={48} color="var(--text-dim)" />
  <h3 className="font-brand mt-3" style={{
    fontSize: 18, fontWeight: 600, color: "var(--text)",
  }}>
    Todavía no hay nada acá
  </h3>
  <p style={{
    fontSize: 13, color: "var(--text-muted)",
    marginTop: 4, maxWidth: 280, lineHeight: 1.5,
  }}>
    Cargá el primero para que aparezca.
  </p>
  <Button variant="primary" className="mt-4" onClick={onCreate}>
    Crear nuevo
  </Button>
</div>
```

### 8.12 Skeleton / loading shimmer

```css
.shimmer-modern {
  background: linear-gradient(
    110deg,
    var(--bg-card) 30%,
    var(--bg-card-alt) 50%,
    var(--bg-card) 70%
  );
  background-size: 200% 100%;
  animation: shimmerSweep 1.6s infinite linear;
  border-radius: 8px;
}
@keyframes shimmerSweep {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

**Reglas:** skeleton si async >300ms, reservar la altura/forma exacta
del componente final (evita CLS), 3-5 placeholders máximo.

### 8.13 Confirm modal (acciones destructivas)

```tsx
<ConfirmModal
  title="¿Eliminar este pago?"
  description="Esta acción no se puede deshacer fácilmente."
  confirmLabel="Sí, eliminar"
  cancelLabel="Cancelar"
  destructive
  onConfirm={...}
  onClose={...}
/>
```

**Reglas:**
- Botón rojo (`btn-glow-danger`) visualmente separado del primario.
- CTA explícito ("Sí, eliminar"), no "Confirmar".
- Body explica QUÉ se pierde y si es reversible.
- Para muy destructivas: type-to-confirm (escribir nombre exacto).

---

## 9. LAYOUT PATTERNS

### 9.1 Page wrapper

```tsx
<div className="min-h-dvh flex flex-col" style={{ background: "var(--bg)" }}>
  <header className="sticky top-0 z-[20] px-4 py-3"
          style={{
            background: "var(--bg)",
            borderBottom: "1px solid var(--border)",
          }}>
    <div className="flex items-start gap-3">
      <BackButton onClick={onBack} />
      <div className="flex-1 min-w-0">
        <EyebrowTag>Sección</EyebrowTag>
        <h1 className="font-brand truncate" style={{
          fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em",
          marginTop: 4,
        }}>Título</h1>
      </div>
    </div>
  </header>

  <main className="flex-1 overflow-y-auto"
        style={{
          paddingBottom: "calc(var(--nav-height) + 72px + var(--safe-bottom))",
        }}>
    {children}
  </main>
</div>
```

**`min-h-dvh`** > `min-h-screen`. `dvh` se ajusta al viewport real en
mobile (excluye URL bar dinámica de Safari).

### 9.2 FunctionBanner (header de módulo)

Wrapper crema con eyebrow + heading + acento. **Header oscuro es la
ÚNICA excepción al fondo crema** (solo para contexto urgente). Forms,
panels, módulos: SIEMPRE banner crema.

```tsx
<div className="rounded-2xl px-4 py-5 mb-4"
  style={{
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow-card)",
  }}>
  <div style={{
    width: 28, height: 3, borderRadius: 2,
    background: moduleAccent /* ej. "var(--accent)" */,
    marginBottom: 8,
  }} />
  <EyebrowTag>{moduloLabel}</EyebrowTag>
  <h2 className="font-brand mt-1" style={{
    fontSize: 24, fontWeight: 600, letterSpacing: "-0.022em",
    lineHeight: 1.1,
  }}>
    {tituloLocal}
  </h2>
</div>
```

### 9.3 ScrollFadeIn wrapper

```tsx
function ScrollFadeIn({ children, delay = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setVisible(true),
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(28px)",
        filter: visible ? "blur(0)" : "blur(8px)",
        transition: `all 600ms var(--ease-out-expo) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
```

---

## 10. FORMS & FEEDBACK

**Reglas no-negociables:**

- Label visible siempre (no usar placeholder como label).
- Helper text bajo el field cuando aplique.
- Error text bajo el field afectado, en `var(--red)`.
- Inputs con `autocomplete` attrs (`email`, `tel`, `current-password`,
  `cc-number`, etc) — VITAL para apps de pagos.
- `inputmode` correcto:
  - `inputmode="email"` para emails
  - `inputmode="tel"` para teléfonos / OTP
  - `inputmode="numeric"` para CBU/CUIT/montos
  - `inputmode="decimal"` para precios/cantidades
- `type="email" | "tel" | "number"` para teclados móviles correctos.
- **Inline validation en BLUR**, no en cada keystroke.
- Submit button: `loading` state + disable durante async.
- Tras error de submit: focus al primer field inválido.

**Pattern field con label + error:**

```tsx
<div>
  <label htmlFor="email" style={{
    display: "block", fontSize: 11, fontWeight: 700,
    letterSpacing: "0.08em", textTransform: "uppercase",
    color: "var(--text-muted)", marginBottom: 6,
  }}>
    Email del cliente
    {required && <span style={{ color: "var(--red)", marginLeft: 4 }}>*</span>}
  </label>
  <input
    id="email"
    type="email"
    inputMode="email"
    autoComplete="email"
    value={email}
    onChange={e => setEmail(e.target.value)}
    onBlur={validateEmail}
    aria-invalid={!!error}
    aria-describedby={error ? "email-error" : "email-hint"}
    className="input-pro"
    style={{ minHeight: 44 }}
  />
  {error ? (
    <p id="email-error" style={{
      fontSize: 11.5, color: "var(--red)", marginTop: 4,
    }}>{error}</p>
  ) : hint ? (
    <p id="email-hint" style={{
      fontSize: 11, color: "var(--text-dim)", marginTop: 4,
    }}>{hint}</p>
  ) : null}
</div>
```

---

## 11. ICONOGRAFÍA

- **Una sola familia.** Recomendado: `lucide-react` o Heroicons. JAMÁS
  mezclar.
- Stroke width consistente: 1.6-1.8px.
- Tamaños tokens: `icon-sm = 14`, `icon-md = 16-18`, `icon-lg = 22-24`.
- SVG inline o componentes — nunca img/png para iconos.
- En botón: icono + label visible. Solo-icono únicamente cuando el
  contexto lo hace obvio (close, back, more).
- Icon-only buttons: `aria-label` SIEMPRE. Sin excepciones.

---

## 12. ACCESIBILIDAD (CRÍTICO en apps de pagos)

- Contraste mínimo 4.5:1 body, 3:1 large text.
- `:focus-visible` ring custom en TODO interactivo:

```css
*:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}
```

- Tab order = visual order. Probar con Tab desde el inicio.
- Modales con focus trap mientras están abiertos.
- ESC cierra modales.
- `aria-live="polite"` en toasts/status.
- `aria-live="assertive"` solo en errores críticos (raro).
- `aria-busy` durante async.
- `aria-current="page"` en nav active.
- NO usar color como única señal — agregar icon + texto.
- `prefers-reduced-motion` respetado en TODAS las animations.
- Soportar dynamic type sin layout breakage.
- Imágenes con `alt`. Iconos decorativos con `aria-hidden="true"`.

**Para datos sensibles:**

- Inputs de password/PIN: `type="password"` + toggle "ojito" con
  `aria-label="Mostrar contraseña"`.
- Mostrar últimos 4 dígitos de tarjetas/cuentas, ocultar resto con `••••`.
- Confirmación type-to-confirm para transferencias irreversibles.
- Loading durante operaciones críticas con feedback claro: "Procesando
  pago…" con timeout de seguridad.
- Cero datos sensibles en URLs / query params.
- Cero datos sensibles en logs de cliente.
- Auto-logout por inactividad (~5-15min según criticidad).

---

## 13. PATTERNS PARA APPS DE PAGOS / DATOS SENSIBLES

### 13.1 Composición de montos

```tsx
function formatArs(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
```

```tsx
<span className="tabular-nums-strict" style={{
  fontSize: 24, fontWeight: 700,
  letterSpacing: "-0.02em", color: "var(--text)",
}}>
  {formatArs(balance)}
</span>
```

Negativos: prefijo `-` + `var(--red)`. Positivos crédito: prefijo `+`
+ `var(--green)`. Sin signos cuando el contexto ya lo deja claro.

### 13.2 Card de transacción

```tsx
<div className="rounded-xl p-3 flex items-center gap-3"
  style={{
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
  }}>
  <div className="flex items-center justify-center rounded-full shrink-0"
    style={{
      width: 40, height: 40,
      background: tipo === "ingreso" ? "var(--green-bg)" : "var(--red-bg)",
      color: tipo === "ingreso" ? "var(--green)" : "var(--red)",
    }}>
    <Icon name={tipo === "ingreso" ? "arrow-down" : "arrow-up"} size={18} />
  </div>
  <div className="flex-1 min-w-0">
    <p className="truncate" style={{
      fontSize: 14, fontWeight: 600, color: "var(--text)",
    }}>{concepto}</p>
    <p style={{
      fontSize: 11, color: "var(--text-muted)", marginTop: 1,
    }}>{fechaRelativa(fecha)} · {medio}</p>
  </div>
  <span className="tabular-nums-strict shrink-0" style={{
    fontSize: 14, fontWeight: 700,
    color: tipo === "ingreso" ? "var(--green)" : "var(--text)",
  }}>
    {tipo === "ingreso" ? "+" : ""}{formatArs(monto)}
  </span>
</div>
```

### 13.3 Confirmación de transferencia (3 pasos)

1. **Form** con datos (destinatario, monto, concepto).
2. **Review** read-only: card grande con monto destacado + destinatario
   + medio. Botón "Confirmar" abajo, "Editar" arriba.
3. **Resultado**: success animation + monto + detalle + acciones
   ("Volver al inicio", "Ver comprobante", "Compartir").

Cada paso con back nav predecible. Paso 2 → vuelve al 1 con form populado.

### 13.4 OTP / código de verificación

```tsx
<div className="flex justify-center gap-2">
  {[0,1,2,3,4,5].map(i => (
    <input
      key={i}
      ref={r => inputs.current[i] = r}
      type="tel"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={1}
      autoComplete={i === 0 ? "one-time-code" : "off"}
      className="text-center input-pro tabular-nums-strict"
      style={{
        width: 44, height: 52,
        fontSize: 22, fontWeight: 700,
      }}
      onChange={e => {
        setDigit(i, e.target.value);
        if (e.target.value && i < 5) inputs.current[i+1]?.focus();
      }}
      onKeyDown={e => {
        if (e.key === "Backspace" && !digits[i] && i > 0) {
          inputs.current[i-1]?.focus();
        }
      }}
    />
  ))}
</div>
```

`autocomplete="one-time-code"` en el primer input — iOS auto-rellena
del SMS sin pedir copy/paste.

### 13.5 Estados de pago

```tsx
const PAGO_STATUS: Record<Status, Config> = {
  procesando: { color: "var(--blue)",       bg: "var(--blue-bg)",  label: "Procesando", icon: "loader" },
  aprobado:   { color: "var(--green)",      bg: "var(--green-bg)", label: "Aprobado",   icon: "check-circle" },
  rechazado:  { color: "var(--red)",        bg: "var(--red-bg)",   label: "Rechazado",  icon: "x-circle" },
  pendiente:  { color: "var(--amber)",      bg: "var(--amber-bg)", label: "Pendiente",  icon: "clock" },
  reversado:  { color: "var(--text-muted)", bg: "var(--bg-subtle)", label: "Reversado", icon: "rotate-ccw" },
};
```

`procesando` con `glow-pulse` o `loader` rotando.

### 13.6 Comprobante / receipt

Patrón "boleto digital":
- Fondo blanco crema, sombra fuerte (`var(--shadow-xl)`).
- Borde dashed sutil arriba/abajo (simula ticket).
- Monto BIG (32px+) y centrado.
- Datos en grid 2-col label/value, label en `--text-muted`, value
  en tabular-nums.
- ID de transacción al final, font monospace, copy-on-tap.
- Acción "Descargar PDF" o "Compartir" debajo.

---

## 14. MOBILE-FIRST CHECKLIST POR PANTALLA

Cada pantalla nueva DEBE cumplir:

- [ ] Funciona perfecta en 375px (iPhone SE/13 mini).
- [ ] Funciona perfecta en 390px (iPhone 14/15).
- [ ] No hay scroll horizontal nunca.
- [ ] Touch targets ≥44px.
- [ ] CTA primario fijado al fondo arriba del tab bar.
- [ ] Inputs con type/inputMode/autoComplete correctos.
- [ ] Loading skeletons para data async >300ms.
- [ ] Empty state con icon + texto + acción.
- [ ] Error state con causa + cómo arreglar.
- [ ] Press feedback en TODO lo tappable.
- [ ] Back button SIEMPRE visible y funcional.
- [ ] Safe-area respetada (iPhone notch + home indicator).
- [ ] Animations <500ms y respetando prefers-reduced-motion.

---

## 15. ANTI-PATTERNS (NO HACER)

1. **Hex raw en componentes.** Usar tokens.
2. **Tailwind raw color classes** (`bg-red-100`, `text-amber-800`).
   Rompen la paleta editorial. Usar tokens o un map config.
3. **`font-brand` en headings con tildes.** Recoleta es buggy.
4. **Emojis como iconos estructurales.** Solo SVG.
5. **Hover-only interactions.** Mobile primero.
6. **Animar `width`, `height`, `top`, `left`.** Solo `transform` y
   `opacity`.
7. **`100vh` en mobile.** Usar `min-h-dvh`.
8. **Botones <44px.** Touch target mínimo siempre.
9. **Inputs <16px font-size en mobile.** iOS auto-zoom destruye UX.
10. **Layout que dependa de gestures sin alternativa.** Swipe debe
    tener equivalente tap.
11. **Modales sin escape (sin X, sin ESC, sin click-backdrop).**
12. **Empty states en blanco.** Siempre icon + texto + acción.
13. **Async sin loading visible >300ms.** El user asume que rompió.
14. **Toasts con `aria-live="assertive"` por default.** Interrumpe
    screen readers.
15. **Stack de toasts.** Cola de 1 a la vez.
16. **Volver y perder scroll/state.** Preservar al hacer back.
17. **Mezclar bottom nav + sidebar + tabs en la misma pantalla.**
18. **Numeros sin tabular-nums** en data financiera.
19. **`z-index: 9999`.** Usar el token system.
20. **Comments inútiles en código UI.** Cada decisión tiene un "por
    qué" — si no, es ruido eliminable.

---

## 16. PRE-DELIVERY CHECKLIST

Antes de cerrar cualquier UI nueva o refactor, verificar:

### Visual
- [ ] Cero emojis como iconos (todo SVG).
- [ ] Iconos de UNA familia consistente.
- [ ] Press-state visual NO shiftea layout.
- [ ] Tokens semánticos (no hex raw).
- [ ] Tipografía respetando escala + weights.

### Interacción
- [ ] Press feedback (scale 0.97 / opacity 0.85) en TODO lo tappable.
- [ ] Touch targets ≥44×44px.
- [ ] Micro-interactions 150-300ms.
- [ ] Disabled states claros (opacity 0.5 + cursor + atributo).
- [ ] Loading button durante async.

### Layout
- [ ] Safe areas respetadas (top y bottom).
- [ ] Scroll content NO oculto detrás de fixed bars.
- [ ] Verificado en 375px y 390px.
- [ ] 4/8dp spacing rhythm en todos los levels.
- [ ] `min-h-dvh` en wrappers (no `min-h-screen`).

### Forms
- [ ] Labels visibles (no solo placeholder).
- [ ] Error text debajo del field afectado.
- [ ] inputmode/type/autocomplete correctos.
- [ ] Inline validation en blur.
- [ ] Submit con loading + disable.

### Accesibilidad
- [ ] Contraste 4.5:1 body, 3:1 large.
- [ ] `:focus-visible` ring custom.
- [ ] aria-labels en icon-only buttons.
- [ ] Modales con role/aria-modal/aria-label.
- [ ] Color NO es la única señal.
- [ ] `prefers-reduced-motion` respetado.

### Performance
- [ ] Lazy import de componentes pesados.
- [ ] Skeleton para async >300ms.
- [ ] Reservar w/h o aspect-ratio en imágenes.
- [ ] Cero animations que causen reflow.

### Datos sensibles (apps de pagos)
- [ ] Cero datos sensibles en URLs / logs.
- [ ] Inputs de password/PIN con type correcto + toggle reveal.
- [ ] Mostrar últimos 4 dígitos de cuentas, ocultar resto.
- [ ] Confirmación type-to-confirm para destructivas críticas.
- [ ] Auto-logout por inactividad.
- [ ] Tabular-nums en TODO valor monetario.

---

## 17. STACK TÉCNICO RECOMENDADO

- **Framework:** Next.js 16 con App Router + TypeScript.
- **Styling:** Tailwind CSS v4 + CSS variables custom (los tokens de
  arriba). Tailwind para utilities, tokens para colores/spacing
  semánticos.
- **Componentes:** propios. Evitar libs UI heavy (MUI, Chakra). Las
  primitivas que valen: `react-hot-toast` para toasts, `cmdk` para
  command palettes, `@radix-ui/react-*` primitives accesibles si
  necesitás dropdowns/tooltips/popovers complejos (sin estilos —
  los pones vos).
- **Fonts:** self-host de Recoleta (.woff2 en /public/fonts) +
  CDN para DM Sans / Fraunces como fallback.
- **Animations:** CSS keyframes + `framer-motion` solo si necesitás
  layout animations o gestos complejos.
- **State management:** Zustand para state global + React Query/SWR
  para server state. Cero Redux.
- **Forms:** `react-hook-form` + `zod`. Esquemas Zod compartidos
  client/server.
- **PWA:** manifest.json + service worker básico para offline.
  Theme color = `--header-bg` (`#1E1512`).

---

## 18. ESTRUCTURA DE CARPETAS

```
src/
├── app/                          # Next.js App Router
│   ├── globals.css               # Tokens + keyframes + utilities
│   ├── layout.tsx                # Root layout con fonts + theme
│   ├── page.tsx                  # Home / login
│   ├── (auth)/                   # Pantallas con auth
│   ├── (public)/                 # Pantallas públicas
│   ├── api/                      # API routes
│   └── components/               # Componentes específicos
├── components/                   # Componentes COMPARTIDOS
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── BottomTabBar.tsx
│   ├── EyebrowTag.tsx
│   ├── Toast.tsx
│   ├── ConfirmModal.tsx
│   └── icons/
├── lib/
│   ├── format.ts                 # formatArs, formatPercent, formatDate
│   ├── api-client.ts
│   └── auth.ts
└── hooks/
    ├── useToast.ts
    └── useConfirm.ts
```

---

## 19. WORKFLOW DEL AGENTE

1. Antes de tocar UI: leer este documento entero.
2. Antes de elegir un color/spacing/animation: chequear si existe el
   token. Si no, agregarlo al `:root` y usarlo desde ahí.
3. Antes de escribir un componente nuevo: chequear si hay un patrón
   en este doc que aplique. Si lo hay, seguilo.
4. Antes de cerrar un task: correr el Pre-Delivery Checklist (§16).
5. Si descubrís un patrón nuevo o anti-pattern: actualizá este doc.
6. Si hay conflicto entre este doc y reglas de dominio del proyecto:
   ganan las del dominio, pero los principios de touch targets,
   accesibilidad y mobile-first son inquebrantables.

---

FIN.
