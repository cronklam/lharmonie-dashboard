'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// LogoLharmonie — wordmark serif "Lharmonie". El brand del dashboard
// es text-based (no imagen), entonces este componente renderiza un
// span con Recoleta. Soporta:
//
//   • enter:        fade + scale 0.85 → 1 en 1200ms (entrada del login).
//   • exiting:      zoom 1 → 8x + fade estilo X.com (1000ms), portal
//                   a body para escapar overflow:hidden de padres.
//   • morphAnchor:  data-attr para que LogoMorphController encuentre
//                   source ("login-source") y target ("header-target").
//
// Tone:
//   • "luxe"  → blanco crema (#F9F7F3) sobre fondos oscuros (login, topnav).
//   • "ink"   → texto oscuro (var(--text)) sobre fondos claros.

type Tone = 'luxe' | 'ink';

interface Props {
  tone?: Tone;
  size?: number;                // font-size en px (default 19)
  className?: string;
  style?: React.CSSProperties;
  exiting?: boolean;
  enter?: boolean;
  morphAnchor?: 'login-source' | 'header-target';
  ariaLabel?: string;
}

const COLORS: Record<Tone, string> = {
  luxe: '#F9F7F3',
  ink: 'var(--text)',
};

export default function LogoLharmonie({
  tone = 'luxe',
  size = 19,
  className,
  style: extraStyle,
  exiting = false,
  enter = false,
  morphAnchor,
  ariaLabel = 'Lharmonie',
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [exitRect, setExitRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (exiting && ref.current && !exitRect) {
      setExitRect(ref.current.getBoundingClientRect());
    }
    if (!exiting && exitRect) setExitRect(null);
  }, [exiting, exitRect]);

  const enterAnim = enter
    ? 'lhLogoEnter 1200ms cubic-bezier(0.32, 0.72, 0, 1) both'
    : undefined;

  const baseStyle: React.CSSProperties = {
    fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
    fontWeight: 500,
    letterSpacing: '0.005em',
    color: COLORS[tone],
    fontSize: size,
    lineHeight: 1,
    display: 'inline-block',
    transformOrigin: 'center center',
    animation: enterAnim,
    opacity: exiting ? 0 : undefined,
    ...extraStyle,
  };

  return (
    <>
      <span
        ref={ref}
        className={className}
        aria-label={ariaLabel}
        data-logo-anchor={morphAnchor}
        style={baseStyle}
      >
        Lharmonie
      </span>
      {exiting && exitRect && typeof document !== 'undefined' &&
        createPortal(
          <span
            aria-hidden="true"
            style={{
              position: 'fixed',
              top: exitRect.top,
              left: exitRect.left,
              width: exitRect.width,
              height: exitRect.height,
              fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
              fontWeight: 500,
              letterSpacing: '0.005em',
              color: COLORS[tone],
              fontSize: size,
              lineHeight: 1,
              transformOrigin: 'center center',
              animation: 'lhLogoExit 1000ms cubic-bezier(0.6, 0, 0.4, 1) both',
              zIndex: 9999,
              pointerEvents: 'none',
            }}
          >
            Lharmonie
          </span>,
          document.body,
        )}
    </>
  );
}
