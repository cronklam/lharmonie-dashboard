'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

// Top nav exclusive: más oscuro/luxury que el del staff. Sticky 56px
// con tag MANAGEMENT en dorado, identidad del usuario (nombre + chip
// con inicial) tappeable que lleva a /perfil, e ícono lupa que va a
// /buscar. La lupa NO se oculta nunca (en /buscar queda inerte pero
// presente, así la geometría del header no salta entre pantallas).
//
// Nota visual: fondo casi negro espresso (#0D0805) con línea inferior
// dorada al 20% que diferencia este surface como "management privado"
// del staff app.

function firstName(name?: string): string {
  if (!name) return '';
  return name.split(/\s+/)[0] || '';
}

function initial(name: string | undefined, email: string | undefined): string {
  const src = (name || email || '').trim();
  if (!src) return '·';
  return src.slice(0, 1).toUpperCase();
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  if (pathname === '/login' || pathname === '/unauthorized') return null;

  const onPerfil = pathname.startsWith('/perfil');
  const onBuscar = pathname === '/buscar';
  const userInitial = initial(user?.name, user?.email);
  const userFirst = firstName(user?.name);

  return (
    <header
      className="lh-topnav-exclusive"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: '#0D0805',
        borderBottom: '1px solid rgba(196,160,103,0.20)',
        boxShadow: '0 1px 8px rgba(196,160,103,0.08)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div
        style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
          gap: 10,
        }}
      >
        {/* Brand — `data-logo-anchor="header-target"` para el morph
            del wordmark desde el login (LogoMorphController). */}
        <Link
          href="/"
          aria-label="Inicio"
          className="spring-tap"
          data-logo-anchor="header-target"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            color: '#F9F7F3',
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            fontSize: 19,
            fontWeight: 500,
            letterSpacing: '0.005em',
            flexShrink: 0,
          }}
        >
          Lharmonie
        </Link>

        {/* MANAGEMENT pill — visible en desktop, oculto en muy pequeño */}
        <span
          aria-hidden
          className="lh-topnav-pill"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#C4A067',
            opacity: 0.9,
            padding: '4px 9px',
            border: '1px solid rgba(196,160,103,0.25)',
            borderRadius: 999,
            flexShrink: 0,
          }}
        >
          Management
        </span>

        <div style={{ flex: 1 }} />

        {/* Identidad: chip con inicial + nombre. Tappable → /perfil. */}
        {user && (
          <Link
            href="/perfil"
            aria-label={user.name ? `Perfil — ${user.name}` : 'Perfil'}
            aria-current={onPerfil ? 'page' : undefined}
            className="spring-tap"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 10px 4px 4px',
              borderRadius: 999,
              background: onPerfil
                ? 'rgba(196,160,103,0.18)'
                : 'rgba(196,160,103,0.08)',
              border: `1px solid ${onPerfil ? 'rgba(196,160,103,0.35)' : 'rgba(196,160,103,0.18)'}`,
              minHeight: 32,
              flexShrink: 1,
              maxWidth: 'min(45vw, 160px)',
              overflow: 'hidden',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #C4A067 0%, #B8865C 100%)',
                color: '#0D0805',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
                fontWeight: 700,
                fontSize: 12,
                flexShrink: 0,
                lineHeight: 1,
              }}
            >
              {userInitial}
            </span>
            {userFirst && (
              <span
                className="lh-topnav-name"
                style={{
                  color: '#F9F7F3',
                  fontSize: 12.5,
                  fontWeight: 600,
                  letterSpacing: '-0.005em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {userFirst}
              </span>
            )}
          </Link>
        )}

        {/* Lupa — siempre presente, inerte en /buscar */}
        <button
          type="button"
          onClick={() => {
            if (!onBuscar) router.push('/buscar');
          }}
          disabled={onBuscar}
          aria-label="Buscar"
          aria-current={onBuscar ? 'page' : undefined}
          className="spring-tap"
          style={{
            width: 38,
            height: 38,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#F9F7F3',
            background: onBuscar ? 'rgba(196,160,103,0.18)' : 'transparent',
            border: 0,
            borderRadius: 999,
            cursor: onBuscar ? 'default' : 'pointer',
            opacity: onBuscar ? 0.8 : 1,
            flexShrink: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </button>
      </div>
    </header>
  );
}
