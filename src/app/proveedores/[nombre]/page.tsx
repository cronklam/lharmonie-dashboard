'use client';

import Link from 'next/link';
import { use, useMemo } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { PageHeader } from '../../components/PageHeader';
import { FacturaCard } from '../../components/FacturaCard';
import {
  COL,
  esAPagar,
  esPagado,
  fmtMoney,
  mesIndex,
  mesLabel,
  parseNum,
  useFacturasStore,
} from '../../components/FacturasStore';
import { BarChart } from '../../components/Charts';

export default function ProveedorDetallePage({
  params,
}: {
  params: Promise<{ nombre: string }>;
}) {
  const { nombre } = use(params);
  const decoded = decodeURIComponent(nombre);
  const { user, loading: authLoading } = useAuth();
  const { facturas, loading } = useFacturasStore();

  const proveedorFacts = useMemo(
    () => facturas.filter((f) => f[COL.proveedor] === decoded),
    [facturas, decoded],
  );

  const totalGastado = proveedorFacts.reduce(
    (s, f) => s + parseNum(f[COL.total]),
    0,
  );
  const pendientes = proveedorFacts.filter(esAPagar);
  const pagadas = proveedorFacts.filter(esPagado);
  const totalDeuda = pendientes.reduce((s, f) => s + parseNum(f[COL.total]), 0);

  const ultimoPago = useMemo(() => {
    return pagadas
      .map((f) => f[COL.fechaPago] || f[COL.procesado] || '')
      .filter(Boolean)
      .sort()
      .pop();
  }, [pagadas]);

  const monthSeries = useMemo(() => {
    const map: Record<string, number> = {};
    proveedorFacts.forEach((f) => {
      const m = (f[COL.mes] || '').toLowerCase().trim();
      const a = f[COL.anio] || '';
      const key = m && a ? `${m} ${a}` : '';
      if (!key) return;
      map[key] = (map[key] || 0) + parseNum(f[COL.total]);
    });
    const sorted = Object.entries(map).sort((a, b) => {
      const [mA, yA] = a[0].split(' ');
      const [mB, yB] = b[0].split(' ');
      if (yA !== yB) return parseInt(yA) - parseInt(yB);
      return mesIndex(mA) - mesIndex(mB);
    });
    return {
      labels: sorted.map(([k]) => {
        const idx = mesIndex(k.split(' ')[0]);
        return idx >= 0 ? mesLabel(idx) : k.split(' ')[0];
      }),
      values: sorted.map(([, v]) => v),
    };
  }, [proveedorFacts]);

  if (authLoading || !user) return null;

  return (
    <div className="page-enter">
      <PageHeader
        title={decoded}
        subtitle={`${proveedorFacts.length} factura${proveedorFacts.length !== 1 ? 's' : ''}`}
        showBack
      />
      <div className="px-4 pt-4" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <SmallCard label="Total gastado" value={fmtMoney(totalGastado)} />
          <SmallCard
            label="Deuda pendiente"
            value={fmtMoney(totalDeuda)}
            tone={totalDeuda > 0 ? 'red' : undefined}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <SmallCard
            label="Pendientes"
            value={`${pendientes.length}`}
            sub="facturas a pagar"
          />
          <SmallCard
            label="Último pago"
            value={ultimoPago || '—'}
            sub={ultimoPago ? '' : 'sin historial'}
          />
        </div>

        {/* Chart evolución */}
        {monthSeries.values.length > 0 && (
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: 14,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Evolución de gasto
            </div>
            <BarChart labels={monthSeries.labels} values={monthSeries.values} />
          </div>
        )}

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

        {/* Lista de facturas */}
        {proveedorFacts.length > 0 && (
          <div>
            <h2
              className="font-brand heading-tight"
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--text)',
                marginBottom: 10,
              }}
            >
              Todas las facturas
            </h2>
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
              {proveedorFacts.slice().reverse().map((f) => (
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
        )}
      </div>
    </div>
  );
}

function SmallCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'red';
}) {
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
        className="font-brand heading-tight tabular-nums-strict"
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: tone === 'red' ? '#C84F3F' : 'var(--text)',
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
