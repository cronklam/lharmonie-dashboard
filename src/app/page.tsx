'use client';

import Link from 'next/link';
import { useAuth } from './components/AuthProvider';

interface QuickAccess {
  href: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  available: boolean;
}

const ACCESSES: QuickAccess[] = [
  {
    href: '/facturas',
    title: 'Facturas',
    desc: 'Ver, filtrar y revisar las facturas de los locales.',
    available: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
        <path d="M5 3h11l3 3v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path d="M16 3v3h3" />
        <path d="M8 11h8M8 15h8M8 19h5" />
      </svg>
    ),
  },
  {
    href: '/operaciones',
    title: 'P&L',
    desc: 'Próximamente — reporte mensual de pérdidas y ganancias.',
    available: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
        <path d="M3 18l5-5 4 4 8-9" />
        <path d="M14 8h6v6" />
      </svg>
    ),
  },
  {
    href: '/operaciones',
    title: 'Sueldos',
    desc: 'Próximamente — liquidaciones, adelantos y horas extras.',
    available: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <circle cx="12" cy="12.5" r="2.6" />
        <path d="M7 6V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v2" />
      </svg>
    ),
  },
  {
    href: '/control',
    title: 'Caja chica',
    desc: 'Próximamente — control de caja por local.',
    available: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 14h2" />
      </svg>
    ),
  },
  {
    href: '/control',
    title: 'Servicios',
    desc: 'Próximamente — luz, gas, alquileres, internet.',
    available: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
        <path d="M12 2l3 5 5 1-3.5 4 1 6L12 15l-5.5 3 1-6L4 8l5-1 3-5z" />
      </svg>
    ),
  },
];

function firstName(name: string | undefined): string {
  if (!name) return 'Hola';
  return name.split(/\s+/)[0] || 'Hola';
}

export default function HomePage() {
  const { user, loading } = useAuth();
  if (loading || !user) return null;

  return (
    <div className="px-5 pt-6 lh-fade-in">
      <header className="mb-7">
        <p
          style={{
            fontSize: 12,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            fontWeight: 600,
          }}
        >
          Hola, {firstName(user.name)}
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
          Panel de management
        </h1>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: 14,
            marginTop: 6,
            lineHeight: 1.45,
          }}
        >
          Acceso rápido a las herramientas de gestión de Lharmonie.
        </p>
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 12,
        }}
      >
        {ACCESSES.map((a, i) => (
          <Link
            key={`${a.title}-${i}`}
            href={a.href}
            className="lh-card-button"
            aria-disabled={!a.available}
          >
            <div className="lh-card-icon">{a.icon}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="lh-card-title">{a.title}</span>
              <span className="lh-card-desc">{a.desc}</span>
            </div>
            <span className={`lh-card-pill${a.available ? '' : ' coming'}`}>
              {a.available ? 'Disponible' : 'Próximamente'}
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
