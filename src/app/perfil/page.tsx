'use client';

import Link from 'next/link';
import { useAuth } from '../components/AuthProvider';
import { PageShell } from '../components/PageShell';
import EyebrowTag from '../components/EyebrowTag';

// /perfil — patrón staff (secciones Administración / Cuenta) pero con
// el tono editorial del management: greeting serif, paleta cálida,
// cards con icono cuadrado dorado a la izquierda, chevron sutil a la
// derecha.
//
// Decisiones explícitas:
// - SIN foto de perfil (M. lo pidió). Saludo serif + email muted.
// - SIN "Buscar" acá: vive en TopNav y siempre está visible.
// - SIN P&L acá: ya tiene su tab propia en bottom nav.

function firstName(name?: string): string {
  if (!name) return 'Hola';
  return name.split(/\s+/)[0] || 'Hola';
}

function roleLabel(role: string | null | undefined): string {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  if (role === 'viewer') return 'Viewer';
  return 'Management';
}

export default function PerfilPage() {
  const { user, loading, logout, isOwner, isAdmin } = useAuth();
  if (loading || !user) return null;

  return (
    <PageShell
      title="Perfil"
      subtitle="Tu cuenta"
      gap={22}
      contentClassName="lh-inicio-stagger"
      contentStyle={{
        paddingBottom: 'calc(var(--nav-height) + var(--safe-bottom) + 24px)',
      }}
    >
        {/* Greeting hero — serif, sin foto */}
        <section
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: 20,
            boxShadow: 'var(--shadow-card)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Acento dorado sutil de fondo */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: -40,
              right: -40,
              width: 140,
              height: 140,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(196,160,103,0.12) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            Sesión iniciada
          </div>
          <h1
            className="font-brand heading-tight"
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: '-0.022em',
              color: 'var(--text)',
              lineHeight: 1.1,
              fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            }}
          >
            {firstName(user.name)}
          </h1>
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--text-muted)',
              marginTop: 6,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {user.email}
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                background: 'var(--accent-bg)',
                color: 'var(--accent-hover)',
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid var(--border-accent)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                }}
              />
              {roleLabel(user.role)}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid var(--border-strong)',
              }}
            >
              Management
            </span>
          </div>
        </section>

        {/* Administración */}
        {isAdmin && (
          <Section title="Administración">
            <NavCard
              href="/perfil/usuarios"
              label="Usuarios"
              desc="Accesos al dashboard, alta y baja"
              icon={<UsersIcon />}
              iconBg="var(--accent-bg)"
              iconColor="var(--accent)"
            />
            {/* Permisos: pendiente. Cuando exista, va acá con icon shield.
                Actividad: pendiente. Cuando exista, va en sección propia. */}
          </Section>
        )}

        {/* Cuenta */}
        <Section title="Cuenta">
          <button
            type="button"
            onClick={logout}
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
              color: '#C84F3F',
              minHeight: 'var(--touch-min)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <div
              aria-hidden
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'var(--red-bg)',
                color: '#C84F3F',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <LogoutIcon />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: '#C84F3F' }}>
                Cerrar sesión
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Vas a tener que iniciar sesión de nuevo
              </div>
            </div>
          </button>
        </Section>

        {/* Footer técnico discreto */}
        <div
          style={{
            textAlign: 'center',
            fontSize: 10.5,
            color: 'var(--text-dim)',
            letterSpacing: '0.06em',
            marginTop: 4,
          }}
        >
          Lharmonie · Management · v1
        </div>
    </PageShell>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div style={{ marginBottom: 10, paddingLeft: 4 }}>
        <EyebrowTag>{title}</EyebrowTag>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </section>
  );
}

function NavCard({
  href,
  label,
  desc,
  icon,
  iconBg,
  iconColor,
}: {
  href: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
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
          width: 40,
          height: 40,
          borderRadius: 12,
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
        <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)' }}>
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
          {desc}
        </div>
      </div>
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
    </Link>
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

function LogoutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
