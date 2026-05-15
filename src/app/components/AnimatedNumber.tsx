"use client";

import { useEffect, useRef, useState } from "react";

// AnimatedNumber — cuenta de 0 (o desde el valor anterior) hasta
// `value` con easing quintic-out (linger lujoso al final), envuelto
// en un reveal fade-up de entrada para que el número no aparezca de
// golpe sino que "suba" a su lugar mientras se completa la cuenta.
//
// Diferencias clave vs versión anterior:
//   • Easing cubic-out → quintic-out: el último 30% es más lento,
//     dando esa sensación de "se asienta" tipo iOS Wallet.
//   • Quitado el `numberTick` por dígito — animaba cada vez que
//     cambiaba la parte entera y eso tartamudeaba durante el count.
//     Reemplazado por un único reveal-up al mount inicial.
//   • Soporte para stagger via prop `index` (cada AnimatedNumber en
//     una lista puede animar con su propio delay).

interface Props {
  value: number;
  /** ms de count. Default 600 — ágil pero visible. */
  duration?: number;
  /** Decimales del display. */
  decimals?: number;
  /** Formatter custom (currency, miles, etc). */
  format?: (n: number) => string;
  className?: string;
  style?: React.CSSProperties;
  /** Solo arranca el count cuando entra al viewport. */
  startOnVisible?: boolean;
  /**
   * Índice para stagger: si el padre tiene `--lh-stagger` set,
   * el count arranca con delay calc(index * --lh-stagger). Si no,
   * usa default 80ms para que coincida con el reveal CSS del wrapper.
   */
  index?: number;
  /**
   * Tono del reveal del wrapper:
   *   • 'soft'  — fade + 10px slide (default)
   *   • 'hero'  — fade + 14px slide + escalita 0.96→1
   *   • false   — sin reveal (solo cuenta)
   */
  reveal?: 'soft' | 'hero' | false;
  /** Delay extra en ms sobre el calculado por index. */
  delayMs?: number;
}

export default function AnimatedNumber({
  value,
  duration = 600,
  decimals = 0,
  format,
  className,
  style,
  startOnVisible = false,
  index,
  reveal = 'soft',
  delayMs,
}: Props) {
  const [display, setDisplay] = useState(startOnVisible ? 0 : value);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const elRef = useRef<HTMLSpanElement | null>(null);
  const startedRef = useRef(!startOnVisible);

  // Trigger count when value changes
  useEffect(() => {
    if (!startedRef.current) return;
    animateTo(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Trigger on visibility
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
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function animateTo(target: number) {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setDisplay(target);
      fromRef.current = target;
      return;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const from = fromRef.current;
    // Sincronizar con el reveal del wrapper: si hay index, el count
    // arranca con el mismo delay (80ms * i por default). Así el
    // número entra deslizándose mientras cuenta — no aparece y
    // después se queda contando un segundo más.
    const stagger = (index ?? 0) * 80 + (delayMs ?? 0);
    const t0 = performance.now() + stagger;
    const tick = (now: number) => {
      if (now < t0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (now - t0) / duration);
      // Quartic out — un poco más ágil que quintic.
      const eased = 1 - Math.pow(1 - t, 4);
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

  // Reveal wrapper: si se pidió, aplicamos animación fade-up al span
  // externo. CSS var --i drivea el stagger; --lh-stagger se hereda del
  // padre (o usa default 70ms si no está set).
  const revealClass =
    reveal === 'hero'
      ? 'lh-fx-reveal-hero'
      : reveal === 'soft'
        ? 'lh-fx-reveal'
        : '';

  const revealStyle: React.CSSProperties =
    reveal && index !== undefined
      ? ({ ['--i' as string]: index } as React.CSSProperties)
      : {};

  return (
    <span
      ref={elRef}
      className={[revealClass, className].filter(Boolean).join(' ')}
      style={{ display: 'inline-block', ...revealStyle, ...style }}
    >
      {formatted}
    </span>
  );
}
