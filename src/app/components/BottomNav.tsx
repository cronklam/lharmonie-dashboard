'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useFacturasStore } from './FacturasStore';

// Replica del BottomTabBar del staff: glass blur + sliding pill +
// crossfade outline/filled icons. 5 tabs del dashboard:
// Inicio, A pagar (con badge), Pagadas, Costos (proveedores+productos), Perfil.
// Costos unifica /proveedores y /productos; el toggle interno (CostosNav)
// permite pasar de una vista a la otra sin salir de la sección.

type TabId = 'inicio' | 'apagar' | 'pagadas' | 'costos' | 'perfil';

const TABS: { id: TabId; label: string; href: string; match: (p: string) => boolean }[] = [
  { id: 'inicio', label: 'Inicio', href: '/', match: (p) => p === '/' || p === '/buscar' },
  { id: 'apagar', label: 'A pagar', href: '/a-pagar', match: (p) => p.startsWith('/a-pagar') || p.startsWith('/factura') },
  { id: 'pagadas', label: 'Pagadas', href: '/pagadas', match: (p) => p.startsWith('/pagadas') },
  { id: 'costos', label: 'Costos', href: '/proveedores', match: (p) => p.startsWith('/proveedores') || p.startsWith('/productos') },
  { id: 'perfil', label: 'Perfil', href: '/perfil', match: (p) => p.startsWith('/perfil') || p.startsWith('/pyl') },
];

function NavIconOutline({ id, color }: { id: TabId; color: string }) {
  const sw = 1.6;
  if (id === 'inicio')
    return (
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V10.5z" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 22V13a1 1 0 011-1h4a1 1 0 011 1v9" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (id === 'apagar')
    return (
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <path d="M5 3h11l3 3v15a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 3v3h3" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        <path d="M8 13h8M8 17h6" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      </svg>
    );
  if (id === 'pagadas')
    return (
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={color} strokeWidth={sw} />
        <path d="m8 12 3 3 5-6" stroke={color} strokeWidth={sw + 0.2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (id === 'costos')
    return (
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <path d="M3 9l1.5-4h15L21 9" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        <path d="M4 9v11a1 1 0 001 1h14a1 1 0 001-1V9" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        <path d="M9 14h6" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      </svg>
    );
  // perfil — círculo cabeza + arco hombros
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke={color} strokeWidth={sw} />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NavIconFilled({ id, color }: { id: TabId; color: string }) {
  if (id === 'inicio')
    return (
      <svg width={26} height={26} viewBox="0 0 24 24" fill={color}>
        <path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1h-5v-8a1 1 0 00-1-1h-4a1 1 0 00-1 1v8H4a1 1 0 01-1-1V10.5z" />
      </svg>
    );
  if (id === 'apagar')
    return (
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <path d="M5 3h11l3 3v15a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" fill={color} />
        <path d="M16 3v3h3z" fill={color} opacity="0.65" />
        <path d="M8 13h8M8 17h6" stroke="#FDFBF8" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  if (id === 'pagadas')
    return (
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" fill={color} />
        <path d="m8 12 3 3 5-6" stroke="#FDFBF8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (id === 'costos')
    return (
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <path d="M3 9l1.5-4h15L21 9z" fill={color} opacity="0.85" />
        <path d="M4 9v11a1 1 0 001 1h14a1 1 0 001-1V9H4z" fill={color} />
      </svg>
    );
  // perfil filled
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" fill={color} />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6z" fill={color} />
    </svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const { pendingCount } = useFacturasStore();
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  if (pathname === '/login' || pathname === '/unauthorized') return null;

  const activeIdx = Math.max(
    0,
    TABS.findIndex((t) => t.match(pathname)),
  );
  const tabWidth = 100 / TABS.length;

  const nav = (
    <nav
      aria-label="Navegación principal"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 110,
        background: 'rgba(253,251,248,0.86)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderTop: '1px solid rgba(31,20,16,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: '0 -10px 32px -12px rgba(31,20,16,0.10), 0 -1px 0 rgba(255,255,255,0.7) inset',
      }}
    >
      <div
        className="relative flex items-stretch justify-around"
        style={{ height: 56, padding: '6px 10px' }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 6,
            bottom: 6,
            width: `calc(${tabWidth}% - 10px)`,
            left: `calc(${activeIdx * tabWidth}% + 5px)`,
            background: 'var(--accent-bg, rgba(184,149,111,0.16))',
            borderRadius: 16,
            transition:
              'left 0.46s cubic-bezier(0.32, 0.72, 0, 1), width 0.46s cubic-bezier(0.32, 0.72, 0, 1)',
            boxShadow:
              '0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 12px -6px rgba(184,149,111,0.4)',
            pointerEvents: 'none',
          }}
        />
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const accent = 'var(--accent)';
          const dim = 'var(--text-dim)';
          const showBadge = tab.id === 'apagar' && pendingCount > 0;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
              className="relative flex items-center justify-center flex-1 spring-tap rounded-2xl"
              style={{ zIndex: 1 }}
            >
              <span
                style={{
                  position: 'relative',
                  width: 26,
                  height: 26,
                  display: 'inline-block',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: active ? 0 : 1,
                    transition:
                      'opacity 0.28s cubic-bezier(0.32,0.72,0,1)',
                  }}
                >
                  <NavIconOutline id={tab.id} color={dim} />
                </span>
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: active ? 1 : 0,
                    transform: active ? 'scale(1)' : 'scale(0.85)',
                    transition:
                      'opacity 0.28s cubic-bezier(0.32,0.72,0,1), transform 0.32s cubic-bezier(0.32,0.72,0,1)',
                  }}
                >
                  <NavIconFilled id={tab.id} color={accent} />
                </span>
                {showBadge && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      top: -3,
                      right: -8,
                      minWidth: 16,
                      height: 16,
                      padding: '0 4px',
                      borderRadius: 999,
                      background: '#D95F4E',
                      color: '#FDFBF8',
                      fontSize: 9.5,
                      fontWeight: 700,
                      lineHeight: '16px',
                      textAlign: 'center',
                      boxShadow: '0 0 0 2px rgba(253,251,248,0.95)',
                    }}
                  >
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );

  return createPortal(nav, document.body);
}
