"use client";

import React from "react";

/**
 * DoubleBezelCard — wrapper que aplica el patrón "Doppelrand" de SOFT.md §4A.
 * Outer shell con borde sutil + Inner core con su propio fondo y curvatura
 * concéntrica. Las cards se ven como "machined hardware" (vidrio dentro de
 * una bandeja de aluminio).
 *
 * Variantes:
 *   - light: bg-subtle outer + bg-card inner (paneles claros)
 *   - dark: rgba(255,255,255,0.04) outer + rgba(255,255,255,0.03) inner
 *
 * Props:
 *   padding: padding del inner core (default p-5)
 *   className: clases extras al outer shell
 *   coreClassName: clases extras al inner core
 *
 * El padding del shell es 6px (concéntrico), no se cambia.
 */
export default function DoubleBezelCard({
  children,
  variant = "light",
  padding = "p-5",
  className = "",
  coreClassName = "",
}: {
  children: React.ReactNode;
  variant?: "light" | "dark";
  padding?: string;
  className?: string;
  coreClassName?: string;
}) {
  const shell = variant === "dark" ? "bezel-shell-dark" : "bezel-shell";
  const core = variant === "dark" ? "bezel-core-dark" : "bezel-core";
  return (
    <div className={`${shell} ${className}`}>
      <div className={`${core} ${padding} ${coreClassName}`}>{children}</div>
    </div>
  );
}
