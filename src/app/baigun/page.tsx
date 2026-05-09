'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import EyebrowTag from '../components/EyebrowTag';
import { fmtArs } from '@/lib/caja';

interface BaigunMovimientoUI {
  id: string;
  fecha: string;
  concepto: string;
  cargo: number;
  pago: number;
  saldoDespues: number;
  notas: string;
  cargadoPor: string;
}

// Baigun — cuenta corriente del subarriendo Libertador (LH5).
// Owner-only. Esta es la primera versión, simple: lista de movimientos
// + saldo actual. La carga de movimientos se hace contra
// `POST /api/baigun` (suma cargo o pago, recalcula saldo después).

export default function BaigunPage() {
  const { user, loading, isOwner } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<BaigunMovimientoUI[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/baigun', { cache: 'no-store' });
      const d = await r.json();
      if (d.ok) {
        setItems((d.items || []).slice().reverse());
        setError(null);
      } else {
        setError(d.error || 'Error');
      }
    } catch {
      setError('Error de red');
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    if (!isOwner) {
      router.replace('/');
      return;
    }
    refresh();
  }, [loading, user, isOwner, refresh, router]);

  if (loading || !user) return null;
  if (!isOwner) return null;

  const saldo = items[0]?.saldoDespues ?? 0;

  return (
    <div className="page-enter">
      <PageHeader
        title="Baigun"
        subtitle="Cuenta corriente · subarriendo LH5"
        showBack
      />
      <div
        className="px-4 pt-4 lh-inicio-stagger"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          paddingBottom: 'calc(var(--nav-height) + var(--safe-bottom) + 24px)',
        }}
      >
        <section className="lh-hero-total spring-in" style={{ padding: '20px 22px' }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#C4A067',
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            Saldo Baigun
          </div>
          <div
            className="font-brand heading-tight-lg tabular-nums-strict"
            style={{
              fontSize: 36,
              fontWeight: 700,
              lineHeight: 1,
              color: '#F9F7F3',
              fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            }}
          >
            {fmtArs(saldo)}
          </div>
          <div style={{ marginTop: 8, color: 'rgba(249,247,243,0.72)', fontSize: 13 }}>
            {items.length} movimiento{items.length !== 1 ? 's' : ''} · saldo a favor &gt; 0
          </div>
        </section>

        {error && (
          <div
            role="alert"
            style={{
              background: 'var(--critical-bg)',
              border: '1px solid var(--critical)',
              borderRadius: 'var(--radius-md)',
              padding: 12,
              fontSize: 12.5,
              color: 'var(--critical)',
              lineHeight: 1.45,
            }}
          >
            <strong style={{ display: 'block', marginBottom: 2 }}>Error</strong>
            {error}
            <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-muted)' }}>
              El tab Baigun CtaCte tiene que existir en el Sheet de Servicios.
            </div>
          </div>
        )}

        {fetching && items.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="shimmer-modern"
                style={{ height: 76, borderRadius: 14 }}
              />
            ))}
          </div>
        )}

        {!fetching && items.length === 0 && !error && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              padding: '40px 16px',
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
              Sin movimientos
            </h3>
            <p
              style={{
                fontSize: 13,
                color: 'var(--text-muted)',
                marginTop: 4,
                maxWidth: 280,
                lineHeight: 1.45,
              }}
            >
              La cuenta corriente Baigun se alimenta automáticamente cuando
              registrás un pago de un servicio marcado como
              &ldquo;subarrendado a Baigun&rdquo;. Por ahora está vacía.
            </p>
          </div>
        )}

        {items.length > 0 && (
          <section>
            <div style={{ marginBottom: 8, paddingLeft: 4 }}>
              <EyebrowTag>Movimientos</EyebrowTag>
            </div>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {items.map((m) => (
                <li
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-card)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {m.concepto}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: 'var(--text-muted)',
                        marginTop: 2,
                      }}
                    >
                      {m.fecha}
                    </div>
                  </div>
                  <div
                    className="tabular-nums-strict"
                    style={{
                      fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
                      fontWeight: 700,
                      fontSize: 14,
                      color: m.pago > 0 ? 'var(--green)' : 'var(--text)',
                      textAlign: 'right',
                      flexShrink: 0,
                    }}
                  >
                    <div>
                      {m.pago > 0 ? `-${fmtArs(m.pago)}` : fmtArs(m.cargo)}
                    </div>
                    <div
                      style={{
                        fontSize: 10.5,
                        color: 'var(--text-muted)',
                        fontWeight: 500,
                        marginTop: 2,
                      }}
                    >
                      Saldo: {fmtArs(m.saldoDespues)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
