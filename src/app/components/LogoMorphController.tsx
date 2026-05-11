'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// LogoMorphController — efecto FLIP del wordmark "Lharmonie" entre el
// login screen (centro, serif 42px) y el TopNav del home (izquierda,
// serif 19px). Idéntico al staff pero text-based (no imagen).
//
// Flujo:
//   1. `active=true` → captura el rect del source (data-logo-anchor="login-source").
//   2. Espera al header del home (data-logo-anchor="header-target")
//      con polling de hasta ~30 frames (~500ms) para cubrir el delay
//      de la navegación.
//   3. Renderiza un clon del wordmark vía portal a body en la posición
//      del source con el font-size del source.
//   4. Lo anima a la posición + font-size del target con
//      cubic-bezier(0.65, 0, 0.35, 1) en 1300ms. Drop-shadow dorado
//      peak en mid-flight + micro-rotation -1.5°.
//   5. Al llegar al target: muestra el target, oculta el clon,
//      dispara onComplete.
//
// Si por algún motivo no encuentra el target en 500ms, usa un rect
// fallback (40, 60, 80, 20) para no quedarse pegado.

interface Props {
  active: boolean;
  tone?: 'luxe' | 'ink';
  onComplete?: () => void;
}

const COLORS = {
  luxe: '#F9F7F3',
  ink: 'var(--text)',
};

const FLIGHT_DURATION = 1300;
const FLIGHT_EASING = 'cubic-bezier(0.65, 0, 0.35, 1)';

type Phase = 'idle' | 'starting' | 'flying' | 'ending';

export default function LogoMorphController({
  active,
  tone = 'luxe',
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [sourceRect, setSourceRect] = useState<DOMRect | null>(null);
  const [sourceFontSize, setSourceFontSize] = useState(42);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [targetFontSize, setTargetFontSize] = useState(19);
  const cloneRef = useRef<HTMLSpanElement>(null);
  const sourceLockedRef = useRef(false);

  // Captura del source al activarse
  useEffect(() => {
    if (!active) {
      setPhase('idle');
      setSourceRect(null);
      setTargetRect(null);
      sourceLockedRef.current = false;
      const src = document.querySelector<HTMLElement>(
        '[data-logo-anchor="login-source"]',
      );
      if (src) src.style.opacity = '';
      const tgt = document.querySelector<HTMLElement>(
        '[data-logo-anchor="header-target"]',
      );
      if (tgt) tgt.style.opacity = '';
      return;
    }

    if (sourceLockedRef.current) return;
    const src = document.querySelector<HTMLElement>(
      '[data-logo-anchor="login-source"]',
    );
    if (!src) return;
    const rect = src.getBoundingClientRect();
    setSourceRect(rect);
    const fs = parseFloat(window.getComputedStyle(src).fontSize);
    if (!isNaN(fs)) setSourceFontSize(fs);
    src.style.opacity = '0';
    src.style.transition = 'opacity 0ms';
    sourceLockedRef.current = true;
    setPhase('starting');
  }, [active]);

  // Polling para encontrar el target
  useEffect(() => {
    if (phase !== 'starting' || !sourceRect) return;
    let attempts = 0;
    let raf = 0;
    function findTarget() {
      attempts++;
      const tgt = document.querySelector<HTMLElement>(
        '[data-logo-anchor="header-target"]',
      );
      if (tgt) {
        const rect = tgt.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          tgt.style.opacity = '0';
          tgt.style.transition = 'opacity 280ms ease-out';
          setTargetRect(rect);
          const fs = parseFloat(window.getComputedStyle(tgt).fontSize);
          if (!isNaN(fs)) setTargetFontSize(fs);
          setPhase('flying');
          return;
        }
      }
      if (attempts < 30) {
        raf = requestAnimationFrame(findTarget);
      } else {
        setTargetRect(new DOMRect(24, 70, 120, 22));
        setPhase('flying');
      }
    }
    raf = requestAnimationFrame(findTarget);
    return () => cancelAnimationFrame(raf);
  }, [phase, sourceRect]);

  // Inicio del flight + drop-shadow + rotación
  useEffect(() => {
    if (phase !== 'flying' || !cloneRef.current || !sourceRect || !targetRect)
      return;
    const el = cloneRef.current;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.top = `${targetRect.top}px`;
        el.style.left = `${targetRect.left}px`;
        el.style.width = `${targetRect.width}px`;
        el.style.height = `${targetRect.height}px`;
        el.style.fontSize = `${targetFontSize}px`;
        el.style.transform = 'rotate(0deg)';
        el.style.filter = 'drop-shadow(0 1px 2px rgba(196,160,103,0))';
      });
    });

    const t = setTimeout(() => {
      const tgt = document.querySelector<HTMLElement>(
        '[data-logo-anchor="header-target"]',
      );
      if (tgt) tgt.style.opacity = '1';
      setPhase('ending');
      if (cloneRef.current) {
        cloneRef.current.style.transition = 'opacity 240ms ease-out';
        cloneRef.current.style.opacity = '0';
      }
      setTimeout(() => {
        onComplete?.();
        setPhase('idle');
      }, 240);
    }, FLIGHT_DURATION);
    return () => clearTimeout(t);
  }, [phase, sourceRect, targetRect, targetFontSize, onComplete]);

  // Polish: peak drop-shadow + micro-rotation midway
  useEffect(() => {
    if (phase !== 'flying' || !cloneRef.current) return;
    const el = cloneRef.current;
    el.animate(
      [
        { filter: 'drop-shadow(0 0 0 rgba(196,160,103,0))' },
        { filter: 'drop-shadow(0 4px 18px rgba(196,160,103,0.55))', offset: 0.5 },
        { filter: 'drop-shadow(0 1px 4px rgba(196,160,103,0))' },
      ],
      { duration: FLIGHT_DURATION, easing: FLIGHT_EASING, fill: 'forwards' },
    );
    el.animate(
      [
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(-1.5deg)', offset: 0.4 },
        { transform: 'rotate(0deg)' },
      ],
      { duration: FLIGHT_DURATION, easing: FLIGHT_EASING, fill: 'forwards' },
    );
  }, [phase]);

  if (typeof document === 'undefined') return null;
  if (phase === 'idle' || !sourceRect) return null;

  const startStyle: React.CSSProperties = {
    position: 'fixed',
    top: sourceRect.top,
    left: sourceRect.left,
    width: sourceRect.width,
    height: sourceRect.height,
    fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
    fontWeight: 500,
    letterSpacing: '0.005em',
    color: COLORS[tone],
    fontSize: sourceFontSize,
    lineHeight: 1,
    zIndex: 99999,
    pointerEvents: 'none',
    transition:
      phase === 'flying'
        ? `top ${FLIGHT_DURATION}ms ${FLIGHT_EASING}, left ${FLIGHT_DURATION}ms ${FLIGHT_EASING}, width ${FLIGHT_DURATION}ms ${FLIGHT_EASING}, height ${FLIGHT_DURATION}ms ${FLIGHT_EASING}, font-size ${FLIGHT_DURATION}ms ${FLIGHT_EASING}`
        : undefined,
    transformOrigin: 'left center',
    willChange: 'top, left, width, height, transform, filter, font-size',
    display: 'inline-block',
  };

  return createPortal(
    <span ref={cloneRef} aria-hidden="true" style={startStyle}>
      Lharmonie
    </span>,
    document.body,
  );
}

export const LOGO_MORPH_DURATION = FLIGHT_DURATION;
