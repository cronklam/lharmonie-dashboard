'use client';

import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

// SuccessBurst — partículas radiales que estallan desde un punto.
//
// Uso típico: confirmar "Marcar pagada" → un click handler dispara
// `fire(element)` y aparecen N partículas doradas explotando desde el
// centro del elemento. Las partículas viven en un portal a document.body
// para que no las recorte ningún overflow:hidden de un ancestro.
//
// Hook returns:
//   • fire(element)  — disparar el burst desde el rect del elemento
//   • Particles      — JSX para renderear (vive en un portal, no
//                      rompe layout)

interface Particle {
  id: number;
  cx: number;
  cy: number;
  bx: string; // px destino X
  by: string; // px destino Y
  color: string;
  size: number;
}

interface Options {
  /** Cantidad de partículas. Default 10. */
  count?: number;
  /** Color o array de colores. Default dorado Lharmonie. */
  colors?: string | string[];
  /** Radio del burst en px. Default 48. */
  radius?: number;
  /** Variabilidad random del radio (0–1). Default 0.35. */
  jitter?: number;
}

const DEFAULT_COLORS = ['#C4A067', '#D9B97A', '#B8865C', '#E6CC95'];

export function useSuccessBurst(options: Options = {}) {
  const {
    count = 10,
    colors = DEFAULT_COLORS,
    radius = 48,
    jitter = 0.35,
  } = options;
  const [particles, setParticles] = useState<Particle[]>([]);

  const fire = useCallback(
    (target: HTMLElement | null) => {
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const palette = Array.isArray(colors) ? colors : [colors];
      const now = Date.now();
      const next: Particle[] = Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const dist = radius * (1 - jitter + Math.random() * jitter * 2);
        return {
          id: now + i,
          cx,
          cy,
          bx: `${Math.cos(angle) * dist}px`,
          by: `${Math.sin(angle) * dist}px`,
          color: palette[i % palette.length],
          size: 5 + Math.round(Math.random() * 4),
        };
      });
      setParticles((p) => [...p, ...next]);
      // Las partículas terminan su animación a los ~620ms. Limpio al
      // 700ms con margen.
      window.setTimeout(() => {
        setParticles((p) => p.filter((x) => !next.find((n) => n.id === x.id)));
      }, 700);
    },
    [count, colors, radius, jitter],
  );

  const Particles = useCallback(() => {
    if (typeof document === 'undefined' || particles.length === 0) return null;
    return createPortal(
      <>
        {particles.map((p) => (
          <span
            key={p.id}
            aria-hidden
            className="lh-fx-burst-particle"
            style={{
              left: p.cx - p.size / 2,
              top: p.cy - p.size / 2,
              width: p.size,
              height: p.size,
              background: p.color,
              boxShadow: `0 0 6px ${p.color}88`,
              ['--bx' as string]: p.bx,
              ['--by' as string]: p.by,
            }}
          />
        ))}
      </>,
      document.body,
    );
  }, [particles]);

  return { fire, Particles };
}

// RingPulseButton — wrapper liviano sobre un button que dispara un
// ring expandiéndose al click. NO maneja el handler de la acción —
// el caller pasa onClick y nosotros solo agregamos el feedback.

interface RingPulseProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Color del ring. Default 'currentColor' del botón. */
  ringColor?: string;
  /** React 19: ref como prop directo (sin forwardRef). */
  ref?: React.Ref<HTMLButtonElement>;
}

export function RingPulseButton({
  ringColor,
  onClick,
  children,
  style,
  ref,
  ...rest
}: RingPulseProps) {
  const [pulses, setPulses] = useState<number[]>([]);

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    const id = Date.now();
    setPulses((p) => [...p, id]);
    window.setTimeout(() => {
      setPulses((p) => p.filter((x) => x !== id));
    }, 500);
    onClick?.(e);
  }

  return (
    <button
      {...rest}
      ref={ref}
      onClick={handleClick}
      style={{ ...style, position: 'relative' }}
    >
      {pulses.map((id) => (
        <span
          key={id}
          aria-hidden
          className="lh-fx-ring"
          style={ringColor ? { color: ringColor } : undefined}
        />
      ))}
      {children}
    </button>
  );
}
