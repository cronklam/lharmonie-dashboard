'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../components/AuthProvider';

// Mismo mapping de columnas que el dash original — coincide con los
// headers del tab "Facturas" del Sheet de Lharmonie.
const COL = {
  fecha: 'Fecha FC',
  proveedor: 'Proveedor',
  cuit: 'CUIT',
  tipoDoc: 'Tipo Doc',
  pv: '# PV',
  nroFac: '# Factura',
  categoria: 'Categoría',
  local: 'Local',
  cajero: 'Cajero',
  importeNeto: 'Importe Neto',
  iva21: 'IVA 21%',
  iva105: 'IVA 10.5%',
  total: 'Total',
  medioPago: 'Medio de Pago',
  estado: 'Estado',
  fechaPago: 'Fecha de Pago',
  obs: 'Observaciones',
  procesado: 'Procesado',
  imagen: 'Imagen',
} as const;

type Factura = Record<string, string>;

function parseNum(v: string | number | undefined): number {
  if (typeof v === 'number') return v;
  const n = parseFloat(
    String(v || 0)
      .replace(/\$/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^0-9.\-]/g, ''),
  );
  return isNaN(n) ? 0 : n;
}

function fmtMoney(n: number): string {
  return '$ ' + Math.round(n).toLocaleString('es-AR');
}

function esPagado(f: Factura): boolean {
  const e = String(f[COL.estado] || '').toLowerCase();
  return (
    e.includes('previamente') ||
    e.includes('pagado') ||
    e.includes('pagada') ||
    e.includes('✅')
  );
}

function esBistrosoft(f: Factura): boolean {
  const e = String(f[COL.estado] || '').toLowerCase();
  const obs = String(f[COL.obs] || '').toLowerCase();
  const proc = String(f[COL.procesado] || '').toLowerCase();
  return (
    e.includes('bistrosoft') ||
    obs.includes('cargada por bistrosoft') ||
    proc.includes('bistrosoft')
  );
}

function shortLocal(s: string): string {
  return (s || '').replace(/Lharmonie\s+/i, 'LH ');
}

type EstadoFiltro = 'todos' | 'pendientes' | 'pagadas';

export default function FacturasPage() {
  const { user, loading } = useAuth();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [localFilter, setLocalFilter] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<EstadoFiltro>('todos');
  const [selected, setSelected] = useState<Factura | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setFetching(true);
      setError(null);
      try {
        const res = await fetch('/api/facturas', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        if (!data.ok) {
          setError(data.error || 'Error cargando facturas');
          setFacturas([]);
        } else {
          setFacturas(data.facturas || []);
        }
      } catch {
        if (!cancelled) setError('Error de conexión');
      } finally {
        if (!cancelled) setFetching(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const locales = useMemo(() => {
    const set = new Set<string>();
    facturas.forEach((f) => {
      const l = f[COL.local];
      if (l) set.add(l);
    });
    return Array.from(set).sort();
  }, [facturas]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return facturas
      .filter((f) => {
        if (localFilter && f[COL.local] !== localFilter) return false;
        if (estadoFilter === 'pagadas' && !esPagado(f)) return false;
        if (estadoFilter === 'pendientes' && esPagado(f)) return false;
        if (q) {
          const hit = Object.values(f).some((v) =>
            String(v).toLowerCase().includes(q),
          );
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // ordenar por fecha desc (string DD/MM/YYYY o YYYY-MM-DD)
        const da = a[COL.fecha] || '';
        const db = b[COL.fecha] || '';
        return db.localeCompare(da);
      });
  }, [facturas, localFilter, estadoFilter, search]);

  const stats = useMemo(() => {
    const totalFacturas = filtered.length;
    let totalMonto = 0;
    let pendientesMonto = 0;
    let pendientesCount = 0;
    filtered.forEach((f) => {
      const t = parseNum(f[COL.total]);
      totalMonto += t;
      if (!esPagado(f)) {
        pendientesMonto += t;
        pendientesCount += 1;
      }
    });
    return { totalFacturas, totalMonto, pendientesMonto, pendientesCount };
  }, [filtered]);

  if (loading || !user) return null;

  return (
    <div className="px-5 pt-6 lh-fade-in">
      <header className="mb-5">
        <p
          style={{
            fontSize: 12,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            fontWeight: 600,
          }}
        >
          Lharmonie · Facturas
        </p>
        <h1
          className="font-brand"
          style={{
            fontSize: 28,
            fontWeight: 600,
            marginTop: 4,
            color: 'var(--text)',
          }}
        >
          Facturas
        </h1>
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          marginBottom: 16,
        }}
      >
        <StatCard label="Facturas" value={String(stats.totalFacturas)} />
        <StatCard label="Total" value={fmtMoney(stats.totalMonto)} />
        <StatCard
          label="Pendiente"
          value={fmtMoney(stats.pendientesMonto)}
          tone={stats.pendientesCount > 0 ? 'red' : 'neutral'}
        />
      </section>

      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <input
          type="search"
          placeholder="Buscar proveedor, número, observación…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            outline: 'none',
            fontSize: 16,
          }}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={localFilter}
            onChange={(e) => setLocalFilter(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 12px',
              outline: 'none',
            }}
          >
            <option value="">Todos los locales</option>
            {locales.map((l) => (
              <option key={l} value={l}>
                {shortLocal(l)}
              </option>
            ))}
          </select>

          <div
            style={{
              display: 'flex',
              gap: 4,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: 4,
            }}
            role="tablist"
          >
            {(['todos', 'pendientes', 'pagadas'] as EstadoFiltro[]).map((s) => (
              <button
                key={s}
                onClick={() => setEstadoFilter(s)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 'calc(var(--radius-md) - 4px)',
                  fontSize: 12,
                  fontWeight: 600,
                  background:
                    estadoFilter === s ? 'var(--accent)' : 'transparent',
                  color: estadoFilter === s ? 'white' : 'var(--text-muted)',
                  textTransform: 'capitalize',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      {fetching && (
        <div
          style={{ color: 'var(--text-muted)', fontSize: 14, padding: '20px 0' }}
        >
          Cargando facturas…
        </div>
      )}
      {error && (
        <div
          style={{
            background: 'var(--red-bg)',
            color: 'var(--red)',
            padding: 12,
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}
      {!fetching && !error && filtered.length === 0 && (
        <div
          style={{
            color: 'var(--text-muted)',
            fontSize: 14,
            padding: '24px 0',
            textAlign: 'center',
          }}
        >
          Sin facturas para este filtro.
        </div>
      )}

      <ul
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          listStyle: 'none',
          padding: 0,
          margin: 0,
        }}
      >
        {filtered.map((f, i) => (
          <li key={i}>
            <FacturaCard f={f} onClick={() => setSelected(f)} />
          </li>
        ))}
      </ul>

      {selected && (
        <FacturaModal f={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'red' | 'neutral';
}) {
  return (
    <div
      className="lh-card"
      style={{
        padding: 12,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          color: tone === 'red' ? 'var(--red)' : 'var(--text)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function FacturaCard({
  f,
  onClick,
}: {
  f: Factura;
  onClick: () => void;
}) {
  const pagado = esPagado(f);
  const bistro = esBistrosoft(f);

  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        boxShadow: 'var(--shadow-card)',
        transition: 'transform 0.15s ease',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {f[COL.proveedor] || '—'}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--text-muted)',
            marginTop: 2,
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <span>{f[COL.fecha] || '—'}</span>
          <span>·</span>
          <span>{shortLocal(f[COL.local] || '—')}</span>
          {f[COL.nroFac] && (
            <>
              <span>·</span>
              <span>Nº {f[COL.nroFac]}</span>
            </>
          )}
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
          {bistro ? (
            <span className="lh-chip lh-chip-bistrosoft">🤖 Bistrosoft</span>
          ) : pagado ? (
            <span className="lh-chip lh-chip-pagada">✓ Pagada</span>
          ) : (
            <span className="lh-chip lh-chip-pendiente">
              {f[COL.medioPago] || f[COL.estado] || 'Pendiente'}
            </span>
          )}
        </div>
      </div>
      <div
        style={{
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          fontWeight: 700,
          fontSize: 16,
          color: 'var(--text)',
          whiteSpace: 'nowrap',
        }}
      >
        {fmtMoney(parseNum(f[COL.total]))}
      </div>
    </button>
  );
}

function FacturaModal({ f, onClose }: { f: Factura; onClose: () => void }) {
  const pagado = esPagado(f);
  const bistro = esBistrosoft(f);

  const allFields: [string, string][] = [
    ['Fecha', f[COL.fecha] || ''],
    ['Local', f[COL.local] || ''],
    ['Cajero', f[COL.cajero] || ''],
    ['CUIT', f[COL.cuit] || ''],
    ['Tipo doc', f[COL.tipoDoc] || ''],
    ['Punto venta', f[COL.pv] || ''],
    ['Nº factura', f[COL.nroFac] || ''],
    ['Categoría', f[COL.categoria] || ''],
    ['Importe neto', f[COL.importeNeto] ? fmtMoney(parseNum(f[COL.importeNeto])) : ''],
    ['IVA 21%', f[COL.iva21] ? fmtMoney(parseNum(f[COL.iva21])) : ''],
    ['IVA 10.5%', f[COL.iva105] ? fmtMoney(parseNum(f[COL.iva105])) : ''],
    ['Total', fmtMoney(parseNum(f[COL.total]))],
    ['Medio de pago', f[COL.medioPago] || f[COL.estado] || ''],
    ['Fecha de pago', f[COL.fechaPago] || ''],
    ['Observaciones', f[COL.obs] || ''],
  ];
  const fields = allFields.filter(([, v]) => v);

  const imgUrl = f[COL.imagen];

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(31, 20, 16, 0.55)',
        zIndex: 'var(--z-modal)' as unknown as number,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 0,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          width: '100%',
          maxWidth: 540,
          maxHeight: '90dvh',
          overflowY: 'auto',
          borderTopLeftRadius: 'var(--radius-xl)',
          borderTopRightRadius: 'var(--radius-xl)',
          padding: '12px 18px 28px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            paddingBottom: 8,
          }}
        >
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: 'var(--border-strong)',
              opacity: 0.6,
            }}
          />
        </div>

        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              className="font-brand"
              style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}
            >
              {f[COL.proveedor] || 'Factura'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {fmtMoney(parseNum(f[COL.total]))} · {f[COL.fecha] || '—'}
            </div>
            <div style={{ marginTop: 6 }}>
              {bistro ? (
                <span className="lh-chip lh-chip-bistrosoft">🤖 Bistrosoft</span>
              ) : pagado ? (
                <span className="lh-chip lh-chip-pagada">✓ Pagada</span>
              ) : (
                <span className="lh-chip lh-chip-pendiente">⏳ Pendiente</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              fontSize: 22,
              color: 'var(--text-muted)',
              padding: 4,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>

        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '6px 14px',
            margin: 0,
            padding: '12px 0',
            borderTop: '1px solid var(--border)',
          }}
        >
          {fields.map(([k, v]) => (
            <FieldRow key={k} label={k} value={v} />
          ))}
        </dl>

        {imgUrl && (
          <div style={{ marginTop: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgUrl}
              alt="Factura"
              style={{
                width: '100%',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt
        style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          fontWeight: 500,
          paddingRight: 8,
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: 0,
          fontSize: 13.5,
          color: 'var(--text)',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </dd>
    </>
  );
}
