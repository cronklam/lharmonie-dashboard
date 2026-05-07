"use client";

import React from "react";

/**
 * EyebrowTag — micro pill uppercase con tracking ancho que precede headers.
 * SOFT.md §4C "Eyebrow Tags" — agrega jerarquía sin repetir el peso del título.
 *
 * Default tiene un dot pulsante (status). Si onDark, ajusta a fondo dark.
 */
export default function EyebrowTag({
  children,
  onDark = false,
  showDot = true,
  className = "",
}: {
  children: React.ReactNode;
  onDark?: boolean;
  showDot?: boolean;
  className?: string;
}) {
  return (
    <span className={`eyebrow ${onDark ? "eyebrow-on-dark" : ""} ${className}`}>
      {showDot && <span className="eyebrow-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
