'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

// Top nav exclusive: más oscuro/luxury que el del staff. Sticky 56px
// con tag MANAGEMENT en dorado y un ícono de búsqueda a la derecha
// que va a /buscar.
//
// Nota visual: usamos un fondo casi negro espresso (#0D0805) con una
// línea inferior dorada al 20% que diferencia este surface como
// "management privado" del staff app.
export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === '/login' || pathname === '/unauthorized') return null;

  // Si la página actual es /buscar, ocultamos el ícono y mostramos
  // back. Mantiene la geometría limpia.
  const isBuscar = pathname === '/buscar';

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
          padding: '0 16px',
          gap: 12,
        }}
      >
        <Link
          href="/"
          aria-label="Inicio"
          className="spring-tap"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            color: '#F9F7F3',
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            fontSize: 20,
            fontWeight: 500,
            letterSpacing: '0.005em',
          }}
        >
          Lharmonie
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#C4A067',
              opacity: 0.9,
              padding: '4px 9px',
              border: '1px solid rgba(196,160,103,0.25)',
              borderRadius: 999,
            }}
          >
            Management
          </span>

          {!isBuscar && (
            <button
              onClick={() => router.push('/buscar')}
              aria-label="Buscar"
              className="spring-tap"
              style={{
                width: 38,
                height: 38,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#F9F7F3',
                background: 'transparent',
                borderRadius: 999,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
