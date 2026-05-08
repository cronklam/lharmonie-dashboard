'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import EyebrowTag from '../components/EyebrowTag';
import AnimatedNumber from '../components/AnimatedNumber';
import {
  COL,
  esAPagar,
  esPagado,
  fmtMoney,
  parseFechaFC,
  parseNum,
  useFacturasStore,
} from '../components/FacturasStore';

// Hub /pagos — punto de entrada al ciclo de pagos. Muestra:
//   1. Hero deuda total (tabular-nums) + chip count.
//   2. Cards de acción: A pagar, Pagadas, Buscar factura.
//   3. Top 3 deudores y últimos pagos (preview).
// Cada card linkea a la página existente para no romper deep-links.

export default function PagosPage() {
  const { user, loading: authLoading } = useAuth();
  const { facturas, loading } = useFacturasStore();

  const pendientes = useMemo(() => facturas.filter(esAPagar), [facturas]);
  const pagadas = useMemo(() => facturas.filter(esPagado), [facturas]);

  const totalPendiente = useMemo(
    () => pendientes.reduce((s, f) => s + parseNum(f[COL.total]), 0),
    [pendientes],
  );

  const totalPagadoMes = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return pagadas
      .filter((f) => {
        const d = parseFechaFC(f[COL.fechaPago] || f[COL.fecha]);
        return d && d >= first && d <= now;
      })
      .reduce((s, f) => s + parseNum(f[COL.total]), 0);
  }, [pagadas]);

  const topDeudores = useMemo(() => {
    const map: Record<string, number> = {};
    pendientes.forEach((f) => {
      const p = f[COL.proveedor] || '(sin nombre)';
      map[p] = (map[p] || 0) + parseNum(f[COL.total]);
    });
    return Object.entries(map)
      .map(([prov, total]) => ({ prov, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
  }, [pendientes]);

  if (authLoading || !user) return null;

  return (
    <div className="page-enter">
      <PageHeader title="Pagos" subtitle="Operación de facturas" />
      <div
        className="px-4 pt-4 lh-inicio-stagger"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          paddingBottom: 'calc(var(--nav-height) + var(--safe-bottom) + 24px)',
        }}
      >
        {/* Hero deuda total */}
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
            Total a pagar
          </div>
          <div
            className="font-brand heading-tight-lg tabular-nums-strict"
            style={{
              fontSize: 38,
              fontWeight: 700,
              lineHeight: 1,
              color: '#F9F7F3',
              fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            }}
          >
            <AnimatedNumber
              value={totalPendiente}
              duration={1100}
              format={(n) => fmtMoney(n)}
            />
          </div>
          <div style={{ marginTop: 8, color: 'rgba(249,247,243,0.72)', fontSize: 13 }}>
            {pendientes.length} factura{pendientes.length !== 1 ? 's' : ''} pendiente
            {pendientes.length !== 1 ? 's' : ''}
            {totalPagadoMes > 0 && (
              <>
                {' · '}
                <span className="tabular-nums-strict">{fmtMoney(totalPagadoMes)}</span> pagado este mes
              </>
            )}
          </div>
        </section>

        {/* Cards de acción */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ActionCard
            href="/a-pagar"
            iconBg="rgba(217,95,78,0.10)"
            iconColor="#C84F3F"
            icon={<ClockIcon />}
            label="A pagar"
            count={pendientes.length}
            description={
              pendientes.length > 0
                ? `${fmtMoney(totalPendiente)} en ${pendientes.length} factura${pendientes.length !== 1 ? 's' : ''}`
                : 'Sin deuda pendiente'
            }
          />
          <ActionCard
            href="/pagadas"
            iconBg="var(--green-bg)"
            iconColor="var(--green)"
            icon={<CheckIcon />}
            label="Pagadas"
            description={
              pagadas.length > 0
                ? `${pagadas.length} histórico${pagadas.length !== 1 ? 's' : ''} · ${fmtMoney(totalPagadoMes)} este mes`
                : 'Sin facturas pagadas todavía'
            }
          />
          <ActionCard
            href="/buscar"
            iconBg="var(--accent-bg)"
            iconColor="var(--accent)"
            icon={<SearchIcon />}
            label="Buscar factura"
            description="Por proveedor, número, CUIT o local"
          />
        </section>

        {/* Top 3 deudores */}
        {topDeudores.length > 0 && (
          <section>
            <SectionTitle>Top deudores</SectionTitle>
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
              {topDeudores.map((d) => (
                <li key={d.prov}>
                  <Link
                    href={`/proveedores/${encodeURIComponent(d.prov)}`}
                    className="lh-prov-row spring-tap"
                    style={{ display: 'flex' }}
                  >
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
                        {d.prov}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {totalPendiente > 0 &&
                          `${Math.round((d.total / totalPendiente) * 100)}% del total`}
                      </div>
                    </div>
                    <div
                      className="tabular-nums-strict"
                      style={{
                        fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
                        fontWeight: 700,
                        fontSize: 15,
                        color: 'var(--text)',
                      }}
                    >
                      {fmtMoney(d.total)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {loading && facturas.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="shimmer-modern" style={{ height: 72, borderRadius: 14 }} />
            <div className="shimmer-modern" style={{ height: 72, borderRadius: 14 }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Action card ────────────────────────────────────────────────────

function ActionCard({
  href,
  iconBg,
  iconColor,
  icon,
  label,
  count,
  description,
}: {
  href: string;
  iconBg: string;
  iconColor: string;
  icon: React.ReactNode;
  label: string;
  count?: number;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="spring-tap"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        color: 'var(--text)',
        minHeight: 'var(--touch-min)',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          background: iconBg,
          color: iconColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
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
            {label}
          </div>
          {typeof count === 'number' && count > 0 && (
            <span
              className="tabular-nums-strict"
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
                background: '#D95F4E',
                color: '#FDFBF8',
                padding: '2px 8px',
                borderRadius: 999,
                flexShrink: 0,
              }}
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--text-muted)',
            marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {description}
        </div>
      </div>
      <ChevronIcon />
    </Link>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <EyebrowTag>{children}</EyebrowTag>
    </div>
  );
}

// ─── Iconos ─────────────────────────────────────────────────────────

function ClockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="m8 12 3 3 5-6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="m20 20-3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--text-muted)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
