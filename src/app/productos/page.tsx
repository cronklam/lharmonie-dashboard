'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import { CostosNav } from '../components/CostosNav';
import {
  COL,
  fmtMoney,
  parseNum,
  useFacturasStore,
} from '../components/FacturasStore';

interface FoodCostItem {
  articulo: string;
  categoria: string;
  costoIVA: number;
  pv: number;
  fcPct: number | null;
  fcIdeal: number;
  revisar: boolean;
  faltaCosto: boolean;
}

type View = 'foodcost' | 'articulos';
type FCEstado = 'all' | 'revisar' | 'ok';

export default function ProductosPage() {
  const { user, loading: authLoading } = useAuth();
  const [view, setView] = useState<View>('foodcost');

  if (authLoading || !user) return null;

  return (
    <div className="page-enter">
      <PageHeader
        title="Costos"
        subtitle={view === 'foodcost' ? 'Food Cost' : 'Artículos comprados'}
      />
      <CostosNav />
      <div className="px-4 pt-3" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Toggle */}
        <div
          style={{
            display: 'flex',
            background: 'var(--bg-card-alt)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 4,
            gap: 4,
          }}
        >
          <button
            onClick={() => setView('foodcost')}
            className="spring-tap"
            style={{
              flex: 1,
              height: 38,
              borderRadius: 'calc(var(--radius-md) - 4px)',
              fontWeight: 600,
              fontSize: 13,
              background: view === 'foodcost' ? 'var(--bg-card)' : 'transparent',
              color: view === 'foodcost' ? 'var(--text)' : 'var(--text-muted)',
              boxShadow: view === 'foodcost' ? 'var(--shadow-sm)' : 'none',
            }}
          >
            Food Cost
          </button>
          <button
            onClick={() => setView('articulos')}
            className="spring-tap"
            style={{
              flex: 1,
              height: 38,
              borderRadius: 'calc(var(--radius-md) - 4px)',
              fontWeight: 600,
              fontSize: 13,
              background: view === 'articulos' ? 'var(--bg-card)' : 'transparent',
              color: view === 'articulos' ? 'var(--text)' : 'var(--text-muted)',
              boxShadow: view === 'articulos' ? 'var(--shadow-sm)' : 'none',
            }}
          >
            Artículos
          </button>
        </div>

        {view === 'foodcost' ? <FoodCostView /> : <ArticulosView />}
      </div>
    </div>
  );
}

function FoodCostView() {
  const [items, setItems] = useState<FoodCostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState('');
  const [estado, setEstado] = useState<FCEstado>('all');
  const [orden, setOrden] = useState<
    'revisar' | 'az' | 'costo_desc' | 'pv_desc' | 'fc_desc'
  >('revisar');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/foodcost', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        if (data.ok) setItems(data.items || []);
        else setError(data.error || 'No se pudo cargar el Food Cost');
      } catch {
        if (!cancelled) setError('Error de conexión');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const cats = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.categoria && set.add(i.categoria));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (cat) list = list.filter((i) => i.categoria === cat);
    if (estado === 'revisar') list = list.filter((i) => i.revisar);
    if (estado === 'ok') list = list.filter((i) => !i.revisar);
    list = list.slice().sort((a, b) => {
      if (orden === 'az') return a.articulo.localeCompare(b.articulo);
      if (orden === 'costo_desc') return b.costoIVA - a.costoIVA;
      if (orden === 'pv_desc') return b.pv - a.pv;
      if (orden === 'fc_desc') return (b.fcPct || 0) - (a.fcPct || 0);
      return (b.revisar ? 1 : 0) - (a.revisar ? 1 : 0);
    });
    return list;
  }, [items, cat, estado, orden]);

  const stats = useMemo(() => {
    const todos = items.filter((r) => (cat ? r.categoria === cat : true));
    const revisar = todos.filter((r) => r.revisar).length;
    const ok = todos.length - revisar;
    const margenes = todos.map((r) => r.fcPct).filter((m) => m !== null) as number[];
    const promedio = margenes.length
      ? Math.round(margenes.reduce((s, m) => s + m, 0) / margenes.length)
      : 0;
    return { revisar, ok, promedio };
  }, [items, cat]);

  return (
    <>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8 }}>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="input-field"
          style={{ flex: 1 }}
        >
          <option value="">Todas las categorías</option>
          {cats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as FCEstado)}
          className="input-field"
          style={{ flex: 1 }}
        >
          <option value="all">Todos</option>
          <option value="revisar">A revisar</option>
          <option value="ok">En orden</option>
        </select>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <KPI label="A revisar" value={stats.revisar} tone="red" />
        <KPI label="En orden" value={stats.ok} tone="green" />
        <KPI label="FC promedio" value={`${stats.promedio}%`} />
      </div>

      <select
        value={orden}
        onChange={(e) => setOrden(e.target.value as typeof orden)}
        className="input-field"
      >
        <option value="revisar">A revisar primero</option>
        <option value="az">Alfabético</option>
        <option value="costo_desc">Mayor costo</option>
        <option value="pv_desc">Mayor venta</option>
        <option value="fc_desc">Mayor FC%</option>
      </select>

      {loading && (
        <div
          style={{
            padding: '24px 0',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 14,
          }}
        >
          Cargando food cost…
        </div>
      )}
      {error && (
        <div
          style={{
            background: 'rgba(217,95,78,0.10)',
            color: '#C84F3F',
            padding: 12,
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
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
          <div style={{ fontSize: 28, marginBottom: 6 }}>🍽️</div>
          Sin resultados
        </div>
      )}

      <div
        style={{
          fontSize: 11.5,
          color: 'var(--text-muted)',
          fontWeight: 500,
        }}
      >
        {filtered.length} plato{filtered.length !== 1 ? 's' : ''}
      </div>

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
        {filtered.map((r) => {
          const margenColor = r.revisar
            ? '#C0392B'
            : r.fcPct !== null && r.fcPct > r.fcIdeal + 2
            ? '#8B6340'
            : '#3B6D11';
          return (
            <li key={r.articulo + r.categoria}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 13.5,
                      color: 'var(--text)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {r.articulo}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    {r.categoria}
                    {r.costoIVA > 0 && ` · Costo: ${fmtMoney(r.costoIVA)}`}
                    {r.pv > 0 && ` · Venta: ${fmtMoney(r.pv)}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div
                    style={{
                      fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
                      fontSize: 16,
                      fontWeight: 700,
                      color: margenColor,
                      lineHeight: 1,
                    }}
                  >
                    {r.fcPct !== null ? `FC ${r.fcPct}%` : '—'}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <span
                      className={`lh-chip ${
                        r.revisar ? 'lh-chip-pendiente' : 'lh-chip-pagada'
                      }`}
                      style={{ fontSize: 9.5 }}
                    >
                      {r.revisar ? '⚠ Revisar' : '✓ OK'}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ArticulosView() {
  const { facturas } = useFacturasStore();
  const [search, setSearch] = useState('');

  // Reconstruimos artículos a partir del recorrido por facturas: tomamos
  // pares proveedor + categoría + precio aproximado (importe neto / qty).
  // Esto es aproximado pero suficiente para listar lo más comprado por proveedor.
  // Para evitar agregar otra API por ahora, agrupamos por proveedor + categoría.
  const items = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    facturas.forEach((f) => {
      const key = `${f[COL.proveedor] || '—'} · ${(f[COL.categoria] || '').replace(/^[^\w\s]+\s*/, '').trim()}`;
      if (!map[key]) map[key] = { count: 0, total: 0 };
      map[key].count++;
      map[key].total += parseNum(f[COL.total]);
    });
    return Object.entries(map)
      .map(([k, d]) => ({ key: k, count: d.count, total: d.total }))
      .sort((a, b) => b.total - a.total);
  }, [facturas]);

  const filtered = search
    ? items.filter((i) => i.key.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <>
      <input
        type="search"
        placeholder="Buscar por proveedor o categoría…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input-field"
      />
      <div
        style={{
          fontSize: 11.5,
          color: 'var(--text-muted)',
          fontWeight: 500,
        }}
      >
        {filtered.length} grupo{filtered.length !== 1 ? 's' : ''}
      </div>
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
        {filtered.map((r) => (
          <li key={r.key}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: 12,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 13.5,
                    color: 'var(--text)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {r.key}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {r.count} compra{r.count !== 1 ? 's' : ''}
                </div>
              </div>
              <div
                className="tabular-nums-strict"
                style={{
                  fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
                  fontWeight: 700,
                  fontSize: 14.5,
                  color: 'var(--text)',
                }}
              >
                {fmtMoney(r.total)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function KPI({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'red' | 'green';
}) {
  const color =
    tone === 'red' ? '#C0392B' : tone === 'green' ? 'var(--green)' : 'var(--text)';
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 10,
        boxShadow: 'var(--shadow-card)',
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
          fontSize: 20,
          fontWeight: 700,
          color,
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          lineHeight: 1,
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}
