'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import { FacturaCard } from '../components/FacturaCard';
import {
  COL,
  esPagado,
  fmtMoney,
  parseFechaFC,
  parseNum,
  shortLocal,
  useFacturasStore,
} from '../components/FacturasStore';

export default function PagadasPage() {
  const { user, loading: authLoading } = useAuth();
  const { facturas, loading } = useFacturasStore();
  const [search, setSearch] = useState('');
  const [localFilter, setLocalFilter] = useState('');
  const [fechaInput, setFechaInput] = useState('');

  const pagadas = useMemo(() => facturas.filter(esPagado), [facturas]);

  const locales = useMemo(() => {
    const set = new Set<string>();
    pagadas.forEach((f) => f[COL.local] && set.add(f[COL.local]));
    return Array.from(set).sort();
  }, [pagadas]);

  const filtered = useMemo(() => {
    let list = pagadas.slice().reverse();
    if (localFilter) list = list.filter((f) => f[COL.local] === localFilter);
    if (fechaInput) {
      const [y, m, d] = fechaInput.split('-');
      const fechaFiltro = `${d}/${m}/${y}`;
      list = list.filter((f) => (f[COL.fecha] || '').trim() === fechaFiltro);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((f) =>
        Object.values(f).some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return list;
  }, [pagadas, localFilter, fechaInput, search]);

  const totalSemana = useMemo(() => {
    const hoy = new Date();
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    lunes.setHours(0, 0, 0, 0);
    return pagadas
      .filter((f) => {
        const fp = f[COL.procesado] || f[COL.fechaPago] || '';
        const d = parseFechaFC(fp);
        return d && d >= lunes;
      })
      .reduce((s, f) => s + parseNum(f[COL.total]), 0);
  }, [pagadas]);

  const totalFiltrado = filtered.reduce((s, f) => s + parseNum(f[COL.total]), 0);

  if (authLoading || !user) return null;

  return (
    <div className="page-enter">
      <PageHeader title="Pagadas" subtitle={`${pagadas.length} historial`} />
      <div className="px-4 pt-4" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <SmallCard label="Pagado esta semana" value={fmtMoney(totalSemana)} />
          <SmallCard
            label={search || localFilter || fechaInput ? 'Total filtrado' : 'Total pagado'}
            value={fmtMoney(totalFiltrado)}
          />
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="search"
            placeholder="Buscar en pagadas…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field"
          />
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
            <input
              type="date"
              value={fechaInput}
              onChange={(e) => setFechaInput(e.target.value)}
              className="input-field"
              style={{ flex: 1 }}
            />
            {fechaInput && (
              <button
                onClick={() => setFechaInput('')}
                className="spring-tap"
                style={{
                  padding: '0 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-subtle)',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {loading && (
          <div
            style={{
              padding: '24px 0',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 14,
            }}
          >
            Cargando…
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
            Sin resultados
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
                <FacturaCard f={f} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SmallCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          fontWeight: 600,
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        className="font-brand heading-tight"
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--text)',
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
    </div>
  );
}
