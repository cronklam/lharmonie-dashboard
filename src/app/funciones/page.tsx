'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import EyebrowTag from '../components/EyebrowTag';
import { useFacturasStore, esAPagar } from '../components/FacturasStore';
import type { Capability } from '@/lib/users';

// /funciones — grilla completa de la app, agrupada por sección. Espejo
// del staff "Todas las funciones" pero acotada al universo management.
// Cada item: icono SVG dentro de cuadrado coloreado + label tight.
// Filtrado por capabilities del rol del usuario.

interface FnItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  capability: Capability;
  badge?: number;
}

interface FnGroup {
  title: string;
  items: FnItem[];
}

export default function FuncionesPage() {
  const { user, loading, isOwner, isAdmin } = useAuth();
  const { pendingCount } = useFacturasStore();

  const groups: FnGroup[] = useMemo(() => {
    const pagos: FnItem[] = [
      {
        href: '/a-pagar',
        label: 'A pagar',
        icon: <ClockIcon />,
        color: '#C84F3F',
        bg: 'rgba(217,95,78,0.10)',
        capability: 'a-pagar',
        badge: pendingCount,
      },
      {
        href: '/pagadas',
        label: 'Pagadas',
        icon: <CheckIcon />,
        color: 'var(--green)',
        bg: 'var(--green-bg)',
        capability: 'pagadas',
      },
      {
        href: '/servicios',
        label: 'Servicios',
        icon: <BoltIcon />,
        color: 'var(--warn-strong)',
        bg: 'var(--warn-strong-bg)',
        capability: 'servicios',
      },
      {
        href: '/caja',
        label: 'Caja',
        icon: <CashIcon />,
        color: 'var(--secure)',
        bg: 'var(--secure-bg)',
        capability: 'caja',
      },
      {
        href: '/buscar',
        label: 'Buscar',
        icon: <SearchIcon />,
        color: 'var(--accent)',
        bg: 'var(--accent-bg)',
        capability: 'inicio',
      },
    ];
    const revisar: FnItem[] = [
      {
        href: '/proveedores',
        label: 'Proveedores',
        icon: <BuildingIcon />,
        color: '#4E342E',
        bg: 'rgba(78,52,46,0.10)',
        capability: 'proveedores',
      },
      {
        href: '/productos',
        label: 'Productos',
        icon: <BoxIcon />,
        color: '#1565C0',
        bg: 'rgba(21,101,192,0.10)',
        capability: 'productos',
      },
    ];
    const analisis: FnItem[] = [
      {
        href: '/pyl',
        label: 'P&L',
        icon: <BarChartIcon />,
        color: '#7C3AED',
        bg: 'rgba(124,58,237,0.10)',
        capability: 'pyl',
      },
      {
        href: '/baigun',
        label: 'Baigun',
        icon: <ScrollIcon />,
        color: '#4E342E',
        bg: 'rgba(78,52,46,0.10)',
        capability: 'baigun',
      },
    ];
    const equipo: FnItem[] = [
      {
        href: '/perfil/usuarios',
        label: 'Usuarios',
        icon: <UsersIcon />,
        color: 'var(--accent)',
        bg: 'var(--accent-bg)',
        capability: 'usuarios',
      },
      {
        href: '/perfil',
        label: 'Mi perfil',
        icon: <UserIcon />,
        color: 'var(--text-muted)',
        bg: 'var(--bg-subtle)',
        capability: 'inicio',
      },
    ];

    const out: FnGroup[] = [];
    out.push({ title: 'Pagos', items: pagos });
    out.push({ title: 'Revisar', items: revisar });
    if (isOwner) out.push({ title: 'Análisis', items: analisis });
    // "Usuarios" solo para admin+; "Mi perfil" para todos.
    const equipoFiltered = equipo.filter((it) =>
      it.capability === 'usuarios' ? isAdmin : true,
    );
    out.push({ title: 'Equipo', items: equipoFiltered });
    return out;
  }, [pendingCount, isOwner, isAdmin]);

  if (loading || !user) return null;

  return (
    <div className="page-enter">
      <PageHeader title="Todas las funciones" subtitle="Atajos de la app" showBack />
      <div
        className="px-4 pt-4 lh-inicio-stagger"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
          paddingBottom: 'calc(var(--nav-height) + var(--safe-bottom) + 24px)',
        }}
      >
        {groups.map((g) => (
          <section key={g.title}>
            <div style={{ marginBottom: 10, paddingLeft: 4 }}>
              <EyebrowTag>{g.title}</EyebrowTag>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 8,
              }}
            >
              {g.items.map((it) => (
                <FnTile key={it.href + it.label} item={it} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function FnTile({ item }: { item: FnItem }) {
  const showBadge = typeof item.badge === 'number' && item.badge > 0;
  return (
    <Link
      href={item.href}
      className="spring-tap"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '12px 6px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        color: 'var(--text)',
        textAlign: 'center',
        minHeight: 88,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          background: item.bg,
          color: item.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {item.icon}
        {showBadge && (
          <span
            aria-hidden
            className="tabular-nums-strict"
            style={{
              position: 'absolute',
              top: -4,
              right: -6,
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              borderRadius: 999,
              background: '#D95F4E',
              color: '#FDFBF8',
              fontSize: 9.5,
              fontWeight: 700,
              lineHeight: '18px',
              textAlign: 'center',
              boxShadow: '0 0 0 2px var(--bg-card)',
            }}
          >
            {item.badge! > 99 ? '99+' : item.badge}
          </span>
        )}
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text)',
          lineHeight: 1.15,
          letterSpacing: '-0.005em',
        }}
      >
        {item.label}
      </span>
    </Link>
  );
}

// ─── Iconos (stroke 1.7, lucide-style) ──────────────────────────────

function ClockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="m8 12 3 3 5-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
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
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M3.3 8.3 12 13l8.7-4.7M12 22V13" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
function BarChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 20h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 17V8m5 9v-6m5 6V5m5 12v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function BoltIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m13 2-9 13h7l-2 7 9-13h-7l2-7z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function CashIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12.5" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7 9h.01M17 16h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function ScrollIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 2h12a2 2 0 0 1 2 2v15a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a2 2 0 0 1 2-2h3M8 2v6H5M8 2a2 2 0 0 1 2 2v15a3 3 0 0 0 3 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
