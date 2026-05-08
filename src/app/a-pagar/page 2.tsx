'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import { FacturaCard } from '../components/FacturaCard';
import {
  COL,
  esAPagar,
  fmtMoney,
  parseFechaFC,
  parseNum,
  shortLocal,
  useFacturasStore,
} from '../components/FacturasStore';
import AnimatedNumber from '../components/AnimatedNumber';

type Sort = 'fecha-asc' | 'fecha-desc' | 'monto-desc' | 'monto-asc';

export default function APagarPage() {
  const { user, loading: authLoading } = useAuth();
  const { facturas, loading } = useFacturasStore();
  const [localFilter, setLocalFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [sort, setSort] = useState<Sort>('fecha-desc');

  const pendientes = useMemo(() => facturas.filter(esAPagar), [facturas]);

  const locales = useMemo(() => {
    const set = new Set<string>();
    pendientes.forEach((f) => f[COL.local] && set.add(f[COL.local]));
    return Array.from(set).sort();
  }, [pendientes]);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    pendientes.forEach((f) => {
      const c = (f[COL.categoria] || '').replace(/^[^\w\s]+\s*/, '').trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [pendientes]);

  const filtered = useMemo(() => {
    let list = pendientes;
    if (localFilter) list = list.filter((f) => f[COL.local] === localFilter);
    if (catFilter)
      list = list.filter((f) =>
        (f[COL.categoria] || '').replace(/^[^\w\s]+\s*/, '').trim().includes(catFilter),
      );
    list = list.slice().sort((a, b) => {
      if (sort === 'monto-desc') return parseNum(b[COL.total]) - parseNum(a[COL.total]);
      if (sort === 'monto-asc') return parseNum(a[COL.total]) - parseNum(b[COL.total]);
      const dA = parseFechaFC(a[COL.fecha])?.getTime() || 0;
      const dB = parseFechaFC(b[COL.fecha])?.getTime() || 0;
      return sort === 'fecha-asc' ? dA - dB : dB - dA;
    });
    return list;
  }, [pendientes, localFilter, catFilter, sort]);

  const total = filtered.reduce((s, f) => s + parseNum(f[COL.total]), 0);

  if (authLoading || !user) return null;

  return (
    <div className="page-enter">
      <PageHeader
        title="A pagar"
        subtitle={`${filtered.length} factura${filtered.length !== 1 ? 's' : ''} · ${fmtMoney(total)}`}
      />

      <div className="px-4 pt-4" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Total animado */}
        <div
          className="lh-hero-total"
          style={{ padding: '18px 20px' }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#C4A067',
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Total a pagar
          </div>
          <div
            className="font-brand heading-tight-lg"
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: '#F9F7F3',
              fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
              lineHeight: 1,
            }}
          >
            <AnimatedNumber value={total} duration={900} format={(n) => fmtMoney(n)} />
          </div>
          <div style={{ marginTop: 6, color: 'rgba(249,247,243,0.72)', fontSize: 12.5 }}>
            {filtered.length} factura{filtered.length !== 1 ? 's' : ''}
            {(localFilter || catFilter) && ' (con filtros)'}
          </div>
        </div>

        {/* Filtros + Sort */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              className="input-field"
              value={localFilter}
              onChange={(e) => setLocalFilter(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">Todos los locales</option>
              {locales.map((l) => (
                <option key={l} value={l}>
                  {shortLocal(l)}
                </option>
              ))}
            </select>
            <select
              className="input-field"
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">Todas las categorías</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <select
            className="input-field"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
          >
            <option value="fecha-desc">Más recientes primero</option>
            <option value="fecha-asc">Más antiguas primero</option>
            <option value="monto-desc">Mayor monto</option>
            <option value="monto-asc">Menor monto</option>
          </select>
        </div>

        {/* Lista */}
        {loading && (
          <div
            style={{
              padding: '24px 0',
              color: 'var(--text-muted)',
              textAlign: 'center',
              fontSize: 14,
            }}
          >
            Cargando facturas…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div
            style={{
              padding: '40px 16px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              background: 'var(--bg-card-alt)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 6 }}>🎉</div>
            Todo al día
          </div>
        )}

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
          {filtered.map((f) => (
            <li key={f._id}>
              <Link
                href={`/factura/${encodeURIComponent(f._id || '')}`}
                className="spring-tap"
                style={{ display: 'block' }}
              >
                <FacturaCard f={f} showCategoria />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
