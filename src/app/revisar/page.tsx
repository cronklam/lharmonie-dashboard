'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import EyebrowTag from '../components/EyebrowTag';
import {
  COL,
  esAPagar,
  fmtMoney,
  parseNum,
  useFacturasStore,
} from '../components/FacturasStore';

// Hub /revisar — surface read-only de análisis. Cards a Proveedores,
// Productos / Food Cost, Buscar global. Encima un mini-summary con
// ranking de proveedores por deuda.

export default function RevisarPage() {
  const { user, loading: authLoading } = useAuth();
  const { facturas, loading } = useFacturasStore();

  const summary = useMemo(() => {
    const proveedores = new Set<string>();
    const categorias = new Set<string>();
    let totalDeuda = 0;
    let countPendientes = 0;
    facturas.forEach((f) => {
      if (f[COL.proveedor]) proveedores.add(f[COL.proveedor]);
      if (f[COL.categoria]) categorias.add(f[COL.categoria]);
      if (esAPagar(f)) {
        totalDeuda += parseNum(f[COL.total]);
        countPendientes++;
      }
    });
    return {
      proveedoresCount: proveedores.size,
      categoriasCount: categorias.size,
      totalDeuda,
      countPendientes,
    };
  }, [facturas]);

  if (authLoading || !user) return null;

  return (
    <div className="page-enter">
      <PageHeader title="Revisar" subtitle="Análisis y consultas" />
      <div
        className="px-4 pt-4 lh-inicio-stagger"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          paddingBottom: 'calc(var(--nav-height) + var(--safe-bottom) + 24px)',
        }}
      >
        {/* Stats row */}
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Stat
            label="Proveedores"
            value={summary.proveedoresCount.toString()}
            sub="distintos en el Sheet"
          />
          <Stat
            label="Categorías"
            value={summary.categoriasCount.toString()}
            sub="únicas registradas"
          />
        </section>

        {/* Cards de navegación */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <NavCard
            href="/proveedores"
            iconBg="rgba(78,52,46,0.10)"
            iconColor="#4E342E"
            icon={<BuildingIcon />}
            label="Proveedores"
            description={`Ranking de ${summary.proveedoresCount} proveedor${summary.proveedoresCount !== 1 ? 'es' : ''} · KPIs y deuda`}
          />
          <NavCard
            href="/productos"
            iconBg="rgba(21,101,192,0.10)"
            iconColor="#1565C0"
            icon={<BoxIcon />}
            label="Productos / Food Cost"
            description="Recetario, % FC actual vs ideal, artículos a revisar"
          />
          <NavCard
            href="/buscar"
            iconBg="var(--accent-bg)"
            iconColor="var(--accent)"
            icon={<SearchIcon />}
            label="Buscar global"
            description="Facturas, proveedores, categorías"
          />
        </section>

        {loading && facturas.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="shimmer-modern" style={{ height: 72, borderRadius: 14 }} />
            <div className="shimmer-modern" style={{ height: 72, borderRadius: 14 }} />
          </div>
        )}

        <section
          style={{
            background: 'var(--bg-card-alt)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 14,
          }}
        >
          <EyebrowTag>Tip</EyebrowTag>
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            Tap en un proveedor para ver evolución mensual, facturas
            pendientes y total acumulado. Productos cruza Recetario con
            costos reales de Food Cost.
          </p>
        </section>
      </div>
    </div>
  );
}

// ─── Subcomponentes ─────────────────────────────────────────────────

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
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
          fontSize: 10.5,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        className="font-brand tabular-nums-strict"
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--text)',
          lineHeight: 1,
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
        {sub}
      </div>
    </div>
  );
}

function NavCard({
  href,
  iconBg,
  iconColor,
  icon,
  label,
  description,
}: {
  href: string;
  iconBg: string;
  iconColor: string;
  icon: React.ReactNode;
  label: string;
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
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
          {label}
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

// ─── Iconos ─────────────────────────────────────────────────────────

function BuildingIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 21h18M5 21V7l7-4 7 4v14M9 9h2m2 0h2m-6 4h2m2 0h2m-6 4h2m2 0h2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 8 12 3 3 8v8l9 5 9-5V8z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M3.3 8.3 12 13l8.7-4.7M12 22V13"
        stroke="currentColor"
        strokeWidth="1.7"
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
