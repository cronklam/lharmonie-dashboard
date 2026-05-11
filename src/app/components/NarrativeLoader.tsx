'use client';

import { useEffect, useState, type ReactNode } from 'react';

// NarrativeLoader — loader con step progression para operaciones que
// tardan más de ~2s. Inspirado en el patrón del staff (@alxui_ux),
// adaptado al estilo dashboard: paleta dorada, SVG icons en lugar de
// emojis, headings Recoleta, fondo crema sutil.
//
// Variants:
//   • "fullscreen" — ocupa la página entera (cold start de Facturas,
//     extracción de docs, generación de PDF).
//   • "compact"    — card inline (loaders inside una sección).
//
// Los steps avanzan client-side por tiempo (fake progression que se
// siente realista). El último queda fijo hasta que el componente se
// desmonta — el padre lo destruye cuando termina la operación real.

export interface LoaderStep {
  /** Icono SVG (preferido) o string (fallback). */
  icon: ReactNode | string;
  label: string;
  detail?: string;
  durationMs?: number;          // default 5500
}

interface Props {
  steps: LoaderStep[];
  /** Texto fino al pie ("Tarda 20-40s. Cold start del servidor."). */
  footnote?: string;
  /** Color de la barra de progreso. Default var(--accent). */
  accent?: string;
  variant?: 'fullscreen' | 'compact';
}

export default function NarrativeLoader({
  steps,
  footnote,
  accent = 'var(--accent)',
  variant = 'fullscreen',
}: Props) {
  const [stepIdx, setStepIdx] = useState(0);

  // Avance temporizado. Último step queda fijo hasta desmontaje.
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    function advance(i: number) {
      if (cancelled || i >= steps.length - 1) return;
      const dur = steps[i].durationMs ?? 5500;
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        setStepIdx(i + 1);
        advance(i + 1);
      }, dur);
    }
    advance(0);
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Progress bar: target por step + ease-out-cubic.
  const [barPct, setBarPct] = useState(5);
  useEffect(() => {
    const count = steps.length;
    const span = 95 - 15;
    const target = 15 + (stepIdx / Math.max(1, count - 1)) * span;
    const start = barPct;
    const dur = 2500;
    const t0 = Date.now();
    let rafId: number;
    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setBarPct(start + (target - start) * eased);
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  const current = steps[stepIdx] || steps[steps.length - 1];

  // ─── Compact inline ─────────────────────────────────────────────
  if (variant === 'compact') {
    return (
      <div
        style={{
          position: 'relative',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 16px',
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden',
        }}
      >
        <style>{`
          @keyframes nlc-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
          @keyframes nlc-fadeInUp { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes nlc-pulse-dot { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.3); opacity: 0.6; } }
          .nlc-step-enter { animation: nlc-fadeInUp 0.3s ease-out both; }
        `}</style>
        {/* shimmer overlay sutil */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'linear-gradient(110deg, transparent 30%, rgba(196,160,103,0.08) 50%, transparent 70%)',
            animation: 'nlc-shimmer 2.2s ease-in-out infinite',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
          <div
            aria-hidden
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              flexShrink: 0,
              background: 'var(--accent-bg)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span key={stepIdx} className="nlc-step-enter">
              <IconRender icon={current.icon} size={20} />
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              key={`${stepIdx}-label`}
              className="nlc-step-enter"
              style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}
            >
              {current.label}
            </div>
            {current.detail && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {current.detail}
              </div>
            )}
          </div>
        </div>
        <div
          style={{
            marginTop: 12,
            height: 4,
            background: 'var(--border)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${barPct}%`,
              background: `linear-gradient(90deg, ${accent}, var(--accent-hover))`,
              transition: 'width 80ms linear',
              borderRadius: 2,
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 10,
            justifyContent: 'center',
          }}
        >
          {steps.map((_, i) => {
            const done = i < stepIdx;
            const active = i === stepIdx;
            return (
              <div
                key={i}
                aria-hidden
                style={{
                  width: active ? 18 : 5,
                  height: 5,
                  borderRadius: 2.5,
                  background: done || active ? accent : 'var(--border-strong)',
                  transition: 'all 0.4s ease',
                  animation: active
                    ? 'nlc-pulse-dot 1.4s ease-in-out infinite'
                    : 'none',
                }}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Fullscreen ─────────────────────────────────────────────────
  return (
    <div
      className="page-enter"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
        background: 'var(--bg)',
      }}
    >
      <style>{`
        @keyframes nl-fadeInUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes nl-pulse-dot { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.25); opacity: 0.6; } }
        .nl-step-enter { animation: nl-fadeInUp 0.35s ease-out both; }
      `}</style>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 20px',
        }}
      >
        {/* Eyebrow + headline del step */}
        <div
          key={stepIdx}
          className="nl-step-enter"
          style={{ textAlign: 'center', marginBottom: 24 }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'var(--accent-bg)',
              border: '1px solid var(--border-accent)',
              color: 'var(--accent)',
              marginBottom: 14,
              boxShadow: '0 4px 16px -4px rgba(196,160,103,0.30)',
            }}
          >
            <IconRender icon={current.icon} size={28} />
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 6,
            }}
          >
            Paso {stepIdx + 1} de {steps.length}
          </div>
          <h2
            className="font-brand"
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--text)',
              letterSpacing: '-0.022em',
              fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            }}
          >
            {current.label}
          </h2>
          {current.detail && (
            <p
              style={{
                fontSize: 12.5,
                color: 'var(--text-muted)',
                marginTop: 6,
                maxWidth: 280,
                lineHeight: 1.5,
              }}
            >
              {current.detail}
            </p>
          )}
        </div>

        {/* Progress bar */}
        <div
          style={{
            marginTop: 12,
            marginBottom: 16,
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 999,
            width: 'min(280px, 70vw)',
            height: 6,
            background: 'var(--border)',
          }}
        >
          <div
            style={{
              height: '100%',
              borderRadius: 999,
              width: `${barPct}%`,
              background: `linear-gradient(90deg, ${accent}, var(--accent-hover))`,
              transition: 'width 80ms linear',
              boxShadow: `0 0 8px ${accent}44`,
            }}
          />
        </div>

        {/* Pulse dots */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          {steps.map((_, i) => {
            const done = i < stepIdx;
            const active = i === stepIdx;
            return (
              <div
                key={i}
                aria-hidden
                style={{
                  width: active ? 24 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: done || active ? accent : 'var(--border-strong)',
                  transition: 'all 0.4s ease',
                  animation: active
                    ? 'nl-pulse-dot 1.4s ease-in-out infinite'
                    : 'none',
                }}
              />
            );
          })}
        </div>

        {footnote && (
          <p
            style={{
              fontSize: 11,
              color: 'var(--text-dim)',
              marginTop: 28,
              textAlign: 'center',
              maxWidth: 280,
              lineHeight: 1.5,
            }}
          >
            {footnote}
          </p>
        )}
      </div>
    </div>
  );
}

function IconRender({ icon, size = 20 }: { icon: ReactNode | string; size?: number }) {
  if (icon == null) return null;
  if (typeof icon === 'string') {
    // String → render como texto centrado (puede ser emoji, símbolo o
    // un caracter unicode). Para SVG inline pasá un ReactNode.
    return (
      <span
        style={{
          fontSize: size,
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </span>
    );
  }
  return <>{icon}</>;
}
