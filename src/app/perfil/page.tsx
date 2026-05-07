'use client';

import Link from 'next/link';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';

const ADMIN_EMAILS = ['martin.a.masri@gmail.com', 'cronklam@gmail.com'];

function isAdmin(email: string | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

export default function PerfilPage() {
  const { user, loading, logout } = useAuth();
  if (loading || !user) return null;
  const admin = isAdmin(user.email);

  return (
    <div className="page-enter">
      <PageHeader title="Perfil" subtitle="Tu cuenta" />
      <div className="px-4 pt-4" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Tarjeta de usuario */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: 18,
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          {user.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.picture}
              alt=""
              width={56}
              height={56}
              style={{
                borderRadius: '50%',
                border: '2px solid var(--border-accent)',
                objectFit: 'cover',
              }}
            />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'var(--accent-bg)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 22,
                fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
              }}
            >
              {(user.name || user.email).slice(0, 1).toUpperCase()}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text)' }}>
              {user.name || 'Usuario'}
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {user.email}
            </div>
            <span
              className="lh-chip lh-chip-bistrosoft"
              style={{ marginTop: 6, fontSize: 9.5 }}
            >
              Management
            </span>
          </div>
        </div>

        {/* Accesos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <NavRow href="/buscar" label="Buscar" desc="Búsqueda global de facturas, proveedores, categorías" />
          {admin && (
            <NavRow
              href="/pyl"
              label="P&L"
              desc="Análisis financiero — solo administradores"
              accent
            />
          )}
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className="btn-glow-light spring-tap"
          style={{
            height: 48,
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
            width: '100%',
            color: '#C84F3F',
            fontSize: 14,
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function NavRow({
  href,
  label,
  desc,
  accent,
}: {
  href: string;
  label: string;
  desc: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="spring-tap"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--text)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14.5,
            fontWeight: 600,
            color: accent ? 'var(--accent-hover)' : 'var(--text)',
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
          {desc}
        </div>
      </div>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--text-muted)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </Link>
  );
}
