'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import { PageShell } from '../components/PageShell';
import {
  COL,
  fmtMoney,
  parseNum,
  shortLocal,
  useFacturasStore,
} from '../components/FacturasStore';

export default function BuscarPage() {
  const { user, loading: authLoading } = useAuth();
  const { facturas } = useFacturasStore();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const lower = q.trim().toLowerCase();

  const facturasMatch = useMemo(() => {
    if (!lower) return [];
    return facturas
      .filter((f) =>
        Object.values(f).some((v) => String(v).toLowerCase().includes(lower)),
      )
      .slice(0, 30);
  }, [facturas, lower]);

  const proveedoresMatch = useMemo(() => {
    if (!lower) return [];
    const set = new Set<string>();
    facturas.forEach((f) => {
      const p = f[COL.proveedor];
      if (p && p.toLowerCase().includes(lower)) set.add(p);
    });
    return Array.from(set).slice(0, 10);
  }, [facturas, lower]);

  const categoriasMatch = useMemo(() => {
    if (!lower) return [];
    const set = new Set<string>();
    facturas.forEach((f) => {
      const c = (f[COL.categoria] || '').replace(/^[^\w\s]+\s*/, '').trim();
      if (c && c.toLowerCase().includes(lower)) set.add(c);
    });
    return Array.from(set).slice(0, 5);
  }, [facturas, lower]);

  if (authLoading || !user) return null;

  return (
    <PageShell title="Buscar" showBack>
        <input
          ref={inputRef}
          type="search"
          placeholder="Proveedor, factura, categoría, monto…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input-field"
          style={{ animation: 'springIn 0.45s var(--ease-spring) both' }}
        />

        {!lower && (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 14,
            }}
          >
            Buscá en todas las facturas del Sheet — proveedor, número, monto, categoría.
          </div>
        )}

        {lower && (
          <>
            {proveedoresMatch.length > 0 && (
              <Section title="Proveedores">
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {proveedoresMatch.map((p) => (
                    <li key={p}>
                      <Link
                        href={`/proveedores/${encodeURIComponent(p)}`}
                        className="spring-tap"
                        style={{
                          display: 'block',
                          padding: 12,
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          color: 'var(--text)',
                          fontSize: 13.5,
                          fontWeight: 600,
                        }}
                      >
                        {p}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {categoriasMatch.length > 0 && (
              <Section title="Categorías">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {categoriasMatch.map((c) => (
                    <span key={c} className="lh-period-chip">
                      {c}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {facturasMatch.length > 0 && (
              <Section title={`Facturas (${facturasMatch.length})`}>
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {facturasMatch.map((f) => (
                    <li key={f._id}>
                      <Link
                        href={`/factura/${encodeURIComponent(f._id || '')}`}
                        className="spring-tap"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: 12,
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          color: 'var(--text)',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13.5,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {f[COL.proveedor] || '—'}
                          </div>
                          <div
                            style={{
                              fontSize: 11.5,
                              color: 'var(--text-muted)',
                            }}
                          >
                            {shortLocal(f[COL.local] || '—')} · {f[COL.fecha] || '—'}
                          </div>
                        </div>
                        <div
                          style={{
                            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
                            fontWeight: 700,
                            fontSize: 14.5,
                          }}
                        >
                          {fmtMoney(parseNum(f[COL.total]))}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {facturasMatch.length === 0 &&
              proveedoresMatch.length === 0 &&
              categoriasMatch.length === 0 && (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: 14,
                  }}
                >
                  Sin resultados para “{q}”
                </div>
              )}
          </>
        )}
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2
        className="font-brand heading-tight"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
