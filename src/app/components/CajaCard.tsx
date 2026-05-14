'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AnimatedNumber from './AnimatedNumber';
import { fmtMoney } from './FacturasStore';
import { useAuth } from './AuthProvider';

// CajaCard — chip "CAJA GRANDE · OWNER", saldo serif grande,
// subtítulo con info del último control (cuando exista). Tap → /caja.
//
// Visualmente espejo del staff `CajaGrandeWidget` pero con la paleta
// editorial luxury del dashboard: borde dorado sutil, fondo crema,
// halo de fondo radial.
//
// Renderiza null si el user no es owner. Auto-fetchea /api/caja/saldos
// al montar (no requiere prop drilling). Si vas a renderizarlo en
// múltiples lugares en la misma página, considerá levantar el state
// en el padre — por ahora el fetch es liviano.

interface SaldosPayload {
  pesos: number;
  dolares: number;
}

interface UltimoControlInfo {
  fechaSesion: string;        // DD/MM/YYYY
  iso: string;                // YYYY-MM-DD
  local: string;
}

function diasDesde(iso: string): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function CajaCard({
  showChip = true,
}: {
  showChip?: boolean;
}) {
  const { isOwner } = useAuth();
  const [saldos, setSaldos] = useState<SaldosPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [ultimo, setUltimo] = useState<UltimoControlInfo | null>(null);

  useEffect(() => {
    if (!isOwner) {
      setFetching(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [rSaldos, rSesiones] = await Promise.all([
          fetch('/api/caja/saldos', { cache: 'no-store' }).then((r) => r.json()),
          fetch('/api/caja/sesiones', { cache: 'no-store' }).then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (rSaldos.ok) {
          setSaldos({ pesos: rSaldos.pesos, dolares: rSaldos.dolares });
          setError(null);
        } else {
          setError(rSaldos.error || 'Error');
        }
        if (rSesiones.ok && Array.isArray(rSesiones.items) && rSesiones.items.length > 0) {
          const last = rSesiones.items[0] as {
            fechaSesion: string;
            iso: string;
            local: string;
          };
          setUltimo({
            fechaSesion: last.fechaSesion,
            iso: last.iso,
            local: last.local,
          });
        }
      } catch {
        if (!cancelled) setError('Error de red');
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  if (!isOwner) return null;

  return (
    <Link
      href="/caja"
      aria-label="Ir a Caja efectivo"
      className="spring-tap"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '16px 18px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-accent)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)',
        color: 'var(--text)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Halo dorado de fondo */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -40,
          right: -40,
          width: 140,
          height: 140,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(196,160,103,0.14) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        {showChip && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--accent-hover)',
              padding: '4px 9px',
              border: '1px solid var(--border-accent)',
              borderRadius: 999,
              marginBottom: 8,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--accent)',
              }}
            />
            Caja grande · Owner
          </div>
        )}
        {fetching && !saldos && (
          <div
            className="shimmer-modern"
            style={{
              height: 28,
              width: '60%',
              borderRadius: 6,
            }}
          />
        )}
        {!fetching && error && (
          <div
            style={{
              fontSize: 13,
              color: 'var(--red)',
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}
        {saldos && (
          <>
            <div
              className="importe"
              style={{
                fontSize: 40,
                color: 'var(--text)',
              }}
            >
              <AnimatedNumber
                value={saldos.pesos}
                duration={1100}
                format={(n) => fmtMoney(n)}
              />
              {saldos.dolares !== 0 && (
                <span
                  className="importe"
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 22,
                    marginLeft: 10,
                  }}
                >
                  ·{' '}
                  <AnimatedNumber
                    value={saldos.dolares}
                    duration={1100}
                    format={(n) =>
                      'US$ ' + Math.round(n).toLocaleString('es-AR')
                    }
                  />
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                marginTop: 6,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {ultimo
                ? (() => {
                    const dias = diasDesde(ultimo.iso);
                    const diasLabel =
                      dias <= 0
                        ? 'hoy'
                        : dias === 1
                        ? 'hace 1 día'
                        : `hace ${dias} días`;
                    return `Última sesión ${diasLabel} · ${ultimo.local}`;
                  })()
                : 'Sin sesión de Iara registrada todavía'}
            </div>
          </>
        )}
      </div>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        style={{ flexShrink: 0, position: 'relative' }}
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </Link>
  );
}
