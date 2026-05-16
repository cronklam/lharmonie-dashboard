'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import { CostosNav } from '../components/CostosNav';
import {
  COL,
  fmtMoney,
  parseNum,
  shortLocal,
  useFacturasStore,
} from '../components/FacturasStore';
import AnimatedNumber from '../components/AnimatedNumber';

export default function ProveedoresPage() {
  const { user, loading: authLoading } = useAuth();
  const { facturas, loading } = useFacturasStore();
  const [search, setSearch] = useState('');
  const [mesFilter, setMesFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [localFilter, setLocalFilter] = useState('');

  const meses = useMemo(() => {
    const set = new Set<string>();
    facturas.forEach((f) => {
      const m = f[COL.mes] || '';
      const a = f[COL.anio] || '';
      if (m && a) set.add(`${m} ${a}`);
      else if (m) set.add(m);
    });
    return Array.from(set).sort();
  }, [facturas]);

  const cats = useMemo(() => {
    const set = new Set<string>();
    facturas.forEach((f) => {
      const c = (f[COL.categoria] || '').replace(/^[^\w\s]+\s*/, '').trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [facturas]);

  const locales = useMemo(() => {
    const set = new Set<string>();
    facturas.forEach((f) => f[COL.local] && set.add(f[COL.local]));
    return Array.from(set).sort();
  }, [facturas]);

  const filteredFacturas = useMemo(() => {
    return facturas.filter((f) => {
      if (mesFilter) {
        const m = f[COL.mes] || '';
        const a = f[COL.anio] || '';
        const k = a ? `${m} ${a}` : m;
        if (k !== mesFilter && m !== mesFilter) return false;
      }
      if (catFilter) {
        const c = (f[COL.categoria] || '').replace(/^[^\w\s]+\s*/, '').trim();
        if (!c.includes(catFilter)) return false;
      }
      if (localFilter && f[COL.local] !== localFilter) return false;
      return true;
    });
  }, [facturas, mesFilter, catFilter, localFilter]);

  const ranking = useMemo(() => {
    const map: Record<
      string,
      { total: number; count: number; cats: Record<string, number> }
    > = {};
    filteredFacturas.forEach((f) => {
      const p = f[COL.proveedor] || '(sin nombre)';
      if (!map[p]) map[p] = { total: 0, count: 0, cats: {} };
      map[p].total += parseNum(f[COL.total]);
      map[p].count++;
      const c = (f[COL.categoria] || 'Sin cat').replace(/^[^\w\s]+\s*/, '').trim();
      map[p].cats[c] = (map[p].cats[c] || 0) + 1;
    });
    return Object.entries(map)
      .map(([prov, d]) => ({
        prov,
        total: d.total,
        count: d.count,
        cat:
          Object.entries(d.cats).sort((a, b) => b[1] - a[1])[0]?.[0] || '—',
      }))
      .sort((a, b) => b.total - a.total)
      .filter((r) =>
        search ? r.prov.toLowerCase().includes(search.toLowerCase()) : true,
      );
  }, [filteredFacturas, search]);

  const totalGastado = ranking.reduce((s, r) => s + r.total, 0);
  const topCat = useMemo(() => {
    const map: Record<string, number> = {};
    filteredFacturas.forEach((f) => {
      const c = (f[COL.categoria] || 'Sin cat')
        .replace(/^[^\w\s]+\s*/, '')
        .trim()
        .split('/')[0]
        .trim();
      map[c] = (map[c] || 0) + parseNum(f[COL.total]);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1])[0];
  }, [filteredFacturas]);

  const topProv = ranking[0];

  if (authLoading || !user) return null;

  return (
    <div className="page-enter">
      <PageHeader
        title="Costos"
        subtitle={`${ranking.length} proveedor${ranking.length !== 1 ? 'es' : ''}`}
      />
      <CostosNav />
      <div className="px-4 pt-3" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Filtros */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="search"
            placeholder="Buscar proveedor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field"
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              className="input-field"
              value={mesFilter}
              onChange={(e) => setMesFilter(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">Todos los meses</option>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              className="input-field"
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">Todas las cat.</option>
              {cats.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              className="input-field"
              value={localFilter}
              onChange={(e) => setLocalFilter(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">Locales</option>
              {locales.map((l) => (
                <option key={l} value={l}>
                  {shortLocal(l)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* KPIs — entran cascadeadas en orden i=0,1,2. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8,
            ['--lh-stagger' as string]: '100ms',
          } as React.CSSProperties}
        >
          <KPI
            label="Total gastado"
            revealIndex={0}
            value={
              <AnimatedNumber
                value={totalGastado}
                duration={650}
                format={(n) => fmtMoney(n)}
                index={0}
              />
            }
            sub={`${ranking.length} proveedores`}
          />
          <KPI
            label="Mayor categoría"
            revealIndex={1}
            value={topCat ? fmtMoney(topCat[1]) : '—'}
            sub={topCat?.[0] || '—'}
          />
          <KPI
            label="Top proveedor"
            revealIndex={2}
            value={topProv ? fmtMoney(topProv.total) : '—'}
            sub={topProv?.prov || '—'}
          />
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
        {!loading && ranking.length === 0 && (
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
            <div style={{ fontSize: 28, marginBottom: 6 }}>🏢</div>
            Sin resultados
          </div>
        )}

        {/* Ranking */}
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
          {ranking.map((r, i) => {
            const pct = totalGastado > 0 ? Math.round((r.total / totalGastado) * 100) : 0;
            return (
              <li key={r.prov}>
                <Link
                  href={`/proveedores/${encodeURIComponent(r.prov)}`}
                  className="spring-tap"
                  style={{ display: 'block' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: 'var(--shadow-card)',
                    }}
                  >
                    <div
                      style={{
                        minWidth: 28,
                        height: 28,
                        borderRadius: 999,
                        background: 'var(--accent-bg)',
                        color: 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 12,
                        fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
                      }}
                    >
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 14,
                          color: 'var(--text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {r.prov}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>
                        {r.cat} · {r.count} factura{r.count !== 1 ? 's' : ''}
                      </div>
                      <div className="lh-local-bar">
                        <div
                          className="lh-local-bar-fill"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div
                      className="numeric-display"
                      style={{
                        fontWeight: 600,
                        fontSize: 14.5,
                        color: 'var(--text)',
                      }}
                    >
                      {fmtMoney(r.total)}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function KPI({
  label,
  value,
  sub,
  revealIndex,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  revealIndex?: number;
}) {
  return (
    <div
      className={revealIndex !== undefined ? 'lh-fx-reveal' : undefined}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 10,
        boxShadow: 'var(--shadow-card)',
        ...(revealIndex !== undefined
          ? ({ ['--i' as string]: revealIndex } as React.CSSProperties)
          : {}),
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        className="font-brand tabular-nums-strict"
        style={{
          fontSize: 14.5,
          fontWeight: 700,
          color: 'var(--text)',
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          lineHeight: 1.1,
          marginTop: 2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10.5,
          color: 'var(--text-muted)',
          marginTop: 2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {sub}
      </div>
    </div>
  );
}
