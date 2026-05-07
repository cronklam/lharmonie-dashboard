"use client";

/**
 * FunctionBanner — Card oscura compacta para encabezado contextual de funciones.
 *
 * Mismo lenguaje visual que HomeHero pero más chico. Se coloca justo debajo
 * del header de un form para dar contexto del estado actual de esa función.
 *
 * Ejemplos:
 *   <FunctionBanner kicker="Stock" title="Última carga hace 2h" subtitle="Cargó Juan" />
 *   <FunctionBanner kicker="Envío" title="3 salieron hoy" subtitle="Último hace 30min" accent="green" />
 */

import React from "react";
import AnimatedNumber from "./AnimatedNumber";

interface Props {
  /** Línea superior chica, estilo eyebrow (ej "Stock · LH5") */
  kicker?: string;
  /** Mensaje principal — frase corta y directa */
  title: string;
  /** Subtítulo opcional — detalle o horario */
  subtitle?: string;
  /** Color del punto pulsante y acento. Default: amber. */
  accent?: "amber" | "green" | "red" | "blue" | "accent";
  /** Si es true, el punto palpita — útil para estados urgentes. Default false. */
  urgent?: boolean;
  /** Dato grande a la derecha opcional (ej "3", "+12%", "48 min"). */
  metric?: string | number;
  /** Label del metric. */
  metricLabel?: string;
}

const ACCENT_COLORS: Record<NonNullable<Props["accent"]>, string> = {
  amber: "#F59E0B",
  green: "var(--green)",
  red: "#DC2626",
  blue: "var(--blue)",
  accent: "var(--accent)",
};

export default function FunctionBanner({
  kicker,
  title,
  subtitle,
  accent = "accent",
  urgent = false,
  metric,
  metricLabel,
}: Props) {
  const dotColor = ACCENT_COLORS[accent];

  // Si metric es numérico, animamos el counter desde 0 (TASTE.md §3 Rule 5
  // - tactile feedback + perpetual micro-interactions). Sino, mostramos texto.
  const metricIsNumeric = typeof metric === "number" && Number.isFinite(metric);

  return (
    <div className="px-4 pt-3">
      {/* Double-Bezel pattern (SOFT.md §4A): outer shell sutil + inner core. */}
      <div className="bezel-shell" style={{ borderRadius: 22, padding: 4 }}>
        <div
          className="relative overflow-hidden"
          style={{
            background: "var(--bg-card)",
            color: "var(--text)",
            borderRadius: 18,
            padding: "12px 14px",
            boxShadow: "0 1px 1px rgba(255,255,255,0.4) inset",
          }}
        >
          <div className="relative flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {kicker && (
                <div className="mb-1.5">
                  <span
                    className="eyebrow"
                    style={{
                      background: `${dotColor}15`,
                      color: dotColor,
                      borderColor: `${dotColor}33`,
                      fontSize: 9.5,
                    }}
                  >
                    <span
                      className="eyebrow-dot"
                      style={{
                        animationDuration: urgent ? "0.9s" : "1.6s",
                        boxShadow: urgent ? `0 0 6px ${dotColor}` : "none",
                      }}
                    />
                    {kicker}
                  </span>
                </div>
              )}
              <h3
                className="text-[14.5px] font-bold leading-snug truncate heading-tight"
                style={{ color: "var(--text)" }}
              >
                {title}
              </h3>
              {subtitle && (
                <p
                  className="text-[11.5px] truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {subtitle}
                </p>
              )}
            </div>

            {metric !== undefined && (
              <div className="shrink-0 text-right">
                {metricIsNumeric ? (
                  <AnimatedNumber
                    value={metric as number}
                    className="block text-[22px] font-bold leading-none tabular-nums-strict"
                    style={{ color: dotColor, letterSpacing: "-0.02em" }}
                    duration={900}
                  />
                ) : (
                  <div
                    className="text-[22px] font-bold leading-none tabular-nums-strict"
                    style={{ color: dotColor, letterSpacing: "-0.02em" }}
                  >
                    {metric}
                  </div>
                )}
                {metricLabel && (
                  <div
                    className="text-[9.5px] font-semibold uppercase tracking-wide mt-0.5"
                    style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}
                  >
                    {metricLabel}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
