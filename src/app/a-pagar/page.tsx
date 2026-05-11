'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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
  type Factura,
} from '../components/FacturasStore';
import AnimatedNumber from '../components/AnimatedNumber';

type Sort = 'fecha-asc' | 'fecha-desc' | 'monto-desc' | 'monto-asc';
type Rango = 'todo' | 'hoy' | 'semana' | 'mes' | 'pasado';

const RANGO_LABELS: Record<Rango, string> = {
  todo: 'Todo',
  hoy: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
  pasado: 'Mes pasado',
};

const SORT_LABELS: Record<Sort, string> = {
  'fecha-desc': 'Más recientes primero',
  'fecha-asc': 'Más antiguas primero',
  'monto-desc': 'Mayor monto',
  'monto-asc': 'Menor monto',
};

// Normaliza para búsqueda: lowercase, sin tildes, sin caracteres
// extraños. "café" matchea "cafe", "ñoquis" matchea "noquis".
function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function searchableText(f: Factura): string {
  return normalizeSearch(
    [
      f[COL.proveedor],
      f[COL.categoria],
      f[COL.nroFac],
      f[COL.cuit],
      f[COL.local],
      f[COL.medioPago],
      f[COL.estado],
      f[COL.obs],
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function isInRango(f: Factura, rango: Rango): boolean {
  if (rango === 'todo') return true;
  const d = parseFechaFC(f[COL.fecha]);
  if (!d) return false;
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  if (rango === 'hoy') {
    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);
    return d >= today0 && d <= now;
  }
  if (rango === 'semana') {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);
    return d >= weekAgo && d <= now;
  }
  if (rango === 'mes') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return d >= first && d <= now;
  }
  // pasado: mes anterior completo
  const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endPrev = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  return d >= startPrev && d <= endPrev;
}

export default function APagarPage() {
  const { user, loading: authLoading } = useAuth();
  const { facturas, loading } = useFacturasStore();

  // Filtros
  const [query, setQuery] = useState('');
  const [rango, setRango] = useState<Rango>('todo');
  const [localFilter, setLocalFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [sort, setSort] = useState<Sort>('fecha-desc');

  const [filtersOpen, setFiltersOpen] = useState(false);

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
    if (rango !== 'todo') list = list.filter((f) => isInRango(f, rango));
    if (localFilter) list = list.filter((f) => f[COL.local] === localFilter);
    if (catFilter)
      list = list.filter((f) =>
        (f[COL.categoria] || '').replace(/^[^\w\s]+\s*/, '').trim().includes(catFilter),
      );
    if (query.trim()) {
      const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);
      list = list.filter((f) => {
        const hay = searchableText(f);
        return tokens.every((t) => hay.includes(t));
      });
    }
    list = list.slice().sort((a, b) => {
      if (sort === 'monto-desc') return parseNum(b[COL.total]) - parseNum(a[COL.total]);
      if (sort === 'monto-asc') return parseNum(a[COL.total]) - parseNum(b[COL.total]);
      const dA = parseFechaFC(a[COL.fecha])?.getTime() || 0;
      const dB = parseFechaFC(b[COL.fecha])?.getTime() || 0;
      return sort === 'fecha-asc' ? dA - dB : dB - dA;
    });
    return list;
  }, [pendientes, query, rango, localFilter, catFilter, sort]);

  const total = filtered.reduce((s, f) => s + parseNum(f[COL.total]), 0);

  // Filtros activos (sin contar query y sort, que tienen su propio
  // affordance visual).
  const activeFilterCount =
    (rango !== 'todo' ? 1 : 0) + (localFilter ? 1 : 0) + (catFilter ? 1 : 0);

  const clearFilters = useCallback(() => {
    setRango('todo');
    setLocalFilter('');
    setCatFilter('');
    setSort('fecha-desc');
  }, []);

  if (authLoading || !user) return null;

  return (
    <div className="page-enter">
      <PageHeader
        title="A pagar"
        subtitle={`${filtered.length} factura${filtered.length !== 1 ? 's' : ''} · ${fmtMoney(total)}`}
      />

      <div className="px-4 pt-4" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Total animado */}
        <div className="lh-hero-total" style={{ padding: '18px 20px' }}>
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
            className="font-brand heading-tight-lg tabular-nums-strict"
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
            {(activeFilterCount > 0 || query) && ' (con filtros)'}
          </div>
        </div>

        {/* Search + filtros */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          {/* Input de búsqueda */}
          <div
            style={{
              flex: 1,
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: 12,
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            >
              <SearchIcon />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por proveedor, materia prima…"
              aria-label="Buscar"
              className="input-pro"
              style={{
                width: '100%',
                minHeight: 44,
                paddingLeft: 36,
                paddingRight: query ? 36 : 14,
                fontSize: 14,
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Limpiar búsqueda"
                className="press-feedback"
                style={{
                  position: 'absolute',
                  right: 8,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'var(--bg-subtle)',
                  border: 0,
                  color: 'var(--text-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <CloseIcon />
              </button>
            )}
          </div>

          {/* Botón filtros con badge si hay activos */}
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-label="Abrir filtros"
            className="press-feedback"
            style={{
              minHeight: 44,
              padding: '0 14px',
              borderRadius: 'var(--radius-md)',
              background: activeFilterCount > 0 ? 'var(--accent-bg)' : 'var(--bg-card)',
              border: `1px solid ${activeFilterCount > 0 ? 'var(--accent)' : 'var(--border)'}`,
              color: activeFilterCount > 0 ? 'var(--accent-hover)' : 'var(--text)',
              fontWeight: 600,
              fontSize: 13,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              boxShadow: 'var(--shadow-card)',
              position: 'relative',
              flexShrink: 0,
            }}
          >
            <FilterIcon />
            Filtros
            {activeFilterCount > 0 && (
              <span
                aria-hidden
                className="tabular-nums-strict"
                style={{
                  minWidth: 18,
                  height: 18,
                  padding: '0 5px',
                  borderRadius: 999,
                  background: 'var(--accent)',
                  color: '#FDFBF8',
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: '18px',
                  textAlign: 'center',
                }}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Chip row con filtros activos para clearizar de un tap */}
        {(activeFilterCount > 0 || sort !== 'fecha-desc') && (
          <div
            className="hide-scrollbar"
            style={{
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              paddingBottom: 2,
            }}
          >
            {rango !== 'todo' && (
              <ActiveChip
                label={RANGO_LABELS[rango]}
                onClear={() => setRango('todo')}
              />
            )}
            {localFilter && (
              <ActiveChip
                label={shortLocal(localFilter)}
                onClear={() => setLocalFilter('')}
              />
            )}
            {catFilter && (
              <ActiveChip
                label={catFilter}
                onClear={() => setCatFilter('')}
              />
            )}
            {sort !== 'fecha-desc' && (
              <ActiveChip
                label={SORT_LABELS[sort]}
                onClear={() => setSort('fecha-desc')}
                subtle
              />
            )}
            {(activeFilterCount > 0 || sort !== 'fecha-desc') && (
              <button
                type="button"
                onClick={clearFilters}
                className="press-feedback"
                style={{
                  minHeight: 28,
                  padding: '0 10px',
                  borderRadius: 999,
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Limpiar todo
              </button>
            )}
          </div>
        )}

        {/* Lista */}
        {loading && filtered.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="shimmer-modern"
                style={{ height: 76, borderRadius: 'var(--radius-md)' }}
              />
            ))}
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              padding: '40px 16px',
              background: 'var(--bg-card-alt)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--green)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" />
              <path d="m8 12 3 3 5-6" />
            </svg>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--text)',
                marginTop: 10,
              }}
            >
              {query || activeFilterCount > 0 ? 'Sin resultados' : 'Todo al día'}
            </h3>
            <p
              style={{
                fontSize: 13,
                color: 'var(--text-muted)',
                marginTop: 4,
                maxWidth: 260,
                lineHeight: 1.45,
              }}
            >
              {query || activeFilterCount > 0
                ? 'Probá ajustar los filtros o limpiar la búsqueda.'
                : 'No hay facturas pendientes de pago.'}
            </p>
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

      {filtersOpen && (
        <FiltrosSheet
          rango={rango}
          setRango={setRango}
          localFilter={localFilter}
          setLocalFilter={setLocalFilter}
          locales={locales}
          catFilter={catFilter}
          setCatFilter={setCatFilter}
          categorias={categorias}
          sort={sort}
          setSort={setSort}
          onClose={() => setFiltersOpen(false)}
          onClearAll={() => {
            clearFilters();
            setFiltersOpen(false);
          }}
          resultsCount={filtered.length}
        />
      )}
    </div>
  );
}

// ─── Chip de filtro activo ──────────────────────────────────────

function ActiveChip({
  label,
  onClear,
  subtle,
}: {
  label: string;
  onClear: () => void;
  subtle?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={`Quitar filtro ${label}`}
      className="press-feedback"
      style={{
        minHeight: 28,
        padding: '0 8px 0 12px',
        borderRadius: 999,
        background: subtle ? 'var(--bg-card)' : 'var(--accent-bg)',
        border: `1px solid ${subtle ? 'var(--border)' : 'var(--border-accent)'}`,
        color: subtle ? 'var(--text)' : 'var(--accent-hover)',
        fontSize: 11.5,
        fontWeight: 700,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {label}
      <span
        aria-hidden
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: subtle ? 'var(--bg-subtle)' : 'rgba(196,160,103,0.30)',
          color: subtle ? 'var(--text-muted)' : 'var(--accent-hover)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="8" height="8" viewBox="0 0 14 14" fill="none">
          <path
            d="M3 3l8 8M11 3l-8 8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </button>
  );
}

// ─── Bottom sheet de filtros ────────────────────────────────────

function FiltrosSheet({
  rango,
  setRango,
  localFilter,
  setLocalFilter,
  locales,
  catFilter,
  setCatFilter,
  categorias,
  sort,
  setSort,
  onClose,
  onClearAll,
  resultsCount,
}: {
  rango: Rango;
  setRango: (r: Rango) => void;
  localFilter: string;
  setLocalFilter: (s: string) => void;
  locales: string[];
  catFilter: string;
  setCatFilter: (s: string) => void;
  categorias: string[];
  sort: Sort;
  setSort: (s: Sort) => void;
  onClose: () => void;
  onClearAll: () => void;
  resultsCount: number;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(4px)',
          zIndex: 90,
          animation: 'fadeIn 0.22s var(--ease-ios) both',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filtros"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '88vh',
          background: 'var(--bg)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          boxShadow: '0 -16px 40px rgba(0,0,0,0.18)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: 'var(--safe-bottom)',
          animation: 'sheetSlideUp 0.32s var(--ease-out-expo) both',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
          <div
            style={{
              width: 38,
              height: 4,
              borderRadius: 999,
              background: 'var(--border-strong)',
              opacity: 0.5,
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            padding: '4px 20px 12px',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              · A pagar
            </div>
            <h2
              className="font-brand"
              style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.022em', marginTop: 2 }}
            >
              Filtros
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="press-feedback"
            style={{
              width: 'var(--touch-min)',
              height: 'var(--touch-min)',
              borderRadius: '50%',
              background: 'var(--bg-subtle)',
              border: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CloseIcon />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* Rango — chips */}
          <FilterField label="Rango de fecha">
            <div
              className="hide-scrollbar"
              style={{
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                paddingBottom: 2,
              }}
            >
              {(Object.keys(RANGO_LABELS) as Rango[]).map((r) => {
                const selected = r === rango;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRango(r)}
                    aria-pressed={selected}
                    className="press-feedback"
                    style={{
                      minHeight: 36,
                      padding: '0 14px',
                      borderRadius: 999,
                      background: selected ? 'var(--accent)' : 'var(--bg-card)',
                      color: selected ? '#FDFBF8' : 'var(--text-muted)',
                      border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      fontSize: 12.5,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {RANGO_LABELS[r]}
                  </button>
                );
              })}
            </div>
          </FilterField>

          {/* Local — dropdown */}
          <FilterField label="Local">
            <select
              value={localFilter}
              onChange={(e) => setLocalFilter(e.target.value)}
              className="input-pro"
              style={{ minHeight: 'var(--touch-min)' }}
            >
              <option value="">Todos los locales</option>
              {locales.map((l) => (
                <option key={l} value={l}>
                  {shortLocal(l)}
                </option>
              ))}
            </select>
          </FilterField>

          {/* Categoría — dropdown */}
          <FilterField label="Categoría">
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="input-pro"
              style={{ minHeight: 'var(--touch-min)' }}
            >
              <option value="">Todas las categorías</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FilterField>

          {/* Sort — dropdown */}
          <FilterField label="Ordenar por">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="input-pro"
              style={{ minHeight: 'var(--touch-min)' }}
            >
              {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </FilterField>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.5fr',
            gap: 8,
            padding: 12,
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            type="button"
            onClick={onClearAll}
            className="press-feedback"
            style={{
              minHeight: 'var(--touch-min)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="press-feedback"
            style={{
              minHeight: 'var(--touch-min)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent)',
              color: '#FDFBF8',
              fontWeight: 700,
              fontSize: 14,
              border: 0,
              cursor: 'pointer',
            }}
          >
            Ver {resultsCount} resultado{resultsCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

// ─── Iconos ──────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 6h18M6 12h12M10 18h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
