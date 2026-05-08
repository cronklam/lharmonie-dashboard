"use client";

import { useEffect, useRef, useState } from "react";

// ─── Number counter animado ─────────────────────────────────────────────
// Cuenta desde 0 (o desde el valor anterior) hasta `value` con ease-out-cubic.
// Respeta prefers-reduced-motion saltando directo al valor final.
// Útil para HomeSummary, stats, contadores de eventos, etc.

interface Props {
  value: number;
  duration?: number;          // ms, default 900
  decimals?: number;          // default 0
  format?: (n: number) => string; // custom formatter (ej: currency, miles)
  className?: string;
  style?: React.CSSProperties;
  startOnVisible?: boolean;    // si true, espera que esté en viewport para animar
}

export default function AnimatedNumber({
  value,
  duration = 900,
  decimals = 0,
  format,
  className,
  style,
  startOnVisible = false,
}: Props) {
  const [display, setDisplay] = useState(startOnVisible ? 0 : value);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const elRef = useRef<HTMLSpanElement | null>(null);
  const startedRef = useRef(!startOnVisible);

  // Trigger animation when value changes (and, optionally, when visible)
  useEffect(() => {
    if (!startedRef.current) return; // esperando visibility
    animateTo(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Intersection observer para trigger on-visible
  useEffect(() => {
    if (!startOnVisible) return;
    const el = elRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !startedRef.current) {
            startedRef.current = true;
            animateTo(value);
            io.disconnect();
          }
        }
      },
      { threshold: 0.1 }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function animateTo(target: number) {
    // Respeta prefers-reduced-motion
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(target);
      return;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const from = fromRef.current;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out-cubic
      const val = from + (target - from) * eased;
      setDisplay(val);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  const formatted = format
    ? format(display)
    : decimals === 0
    ? Math.round(display).toString()
    : display.toFixed(decimals);

  // Aplicamos number-tick (blur+slide) al valor entero cuando cambia para que
  // el ojo "vea" el cambio en lugar de pasar imperceptible.
  // key={Math.round(display)} fuerza re-render del span al cambiar el dígito.
  const intKey = decimals === 0 ? Math.round(display) : Math.floor(display * 10);

  return (
    <span ref={elRef} className={className} style={{ ...style, display: "inline-block" }}>
      <span key={intKey} className="number-tick" style={{ display: "inline-block" }}>
        {formatted}
      </span>
    </span>
  );
}
