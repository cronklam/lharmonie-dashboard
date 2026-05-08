'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useFacturasStore } from './FacturasStore';
import { useAuth } from './AuthProvider';

// Bottom nav del management dashboard. 5 tabs: Home, Pagos, Revisar,
// P&L, Perfil. P&L solo visible para owner (admin/viewer ven 4 tabs).
//
// Patrón visual heredado del staff (`page.tsx:1505-1619`): glass blur,
// sliding pill con cubic-bezier(0.32, 0.72, 0, 1), crossfade
// outlined→filled, portal a document.body para escapar transforms.

type TabId = 'home' | 'pagos' | 'revisar' | 'pyl' | 'perfil';

interface TabConfig {
  id: TabId;
  label: string;
  href: string;
  match: (p: string) => boolean;
  ownerOnly?: boolean;
  badge?: 'pending';
}

const TABS: TabConfig[] = [
  {
    id: 'home',
    label: 'Home',
    href: '/',
    match: (p) => p === '/' || p.startsWith('/funciones'),
  },
  {
    id: 'pagos',
    label: 'Pagos',
    href: '/pagos',
    match: (p) =>
      p.startsWith('/pagos') ||
      p.startsWith('/a-pagar') ||
      p.startsWith('/pagadas') ||
      p.startsWith('/factura'),
    badge: 'pending',
  },
  {
    id: 'revisar',
    label: 'Revisar',
    href: '/revisar',
    match: (p) =>
      p.startsWith('/revisar') ||
      p.startsWith('/proveedores') ||
      p.startsWith('/productos') ||
      p.startsWith('/buscar'),
  },
  {
    id: 'pyl',
    label: 'P&L',
    href: '/pyl',
    match: (p) => p.startsWith('/pyl'),
    ownerOnly: true,
  },
  {
    id: 'perfil',
    label: 'Perfil',
    href: '/perfil',
    match: (p) => p.startsWith('/perfil'),
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const { pendingCount } = useFacturasStore();
  const { isOwner } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  if (pathname === '/login' || pathname === '/unauthorized') return null;

  const tabs = TABS.filter((t) => !t.ownerOnly || isOwner);
  const activeIdx = Math.max(
    0,
    tabs.findIndex((t) => t.match(pathname)),
  );
  const tabWidth = 100 / tabs.length;

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
        boxShadow:
          '0 -10px 32px -12px rgba(31,20,16,0.10), 0 -1px 0 rgba(255,255,255,0.7) inset',
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
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          const accent = 'var(--accent)';
          const dim = 'var(--text-dim)';
          const showBadge = tab.badge === 'pending' && pendingCount > 0;
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
                    transition: 'opacity 0.28s cubic-bezier(0.32,0.72,0,1)',
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

// ─── Iconos ─────────────────────────────────────────────────────────

function NavIconOutline({ id, color }: { id: TabId; color: string }) {
  const sw = 1.6;
  if (id === 'home')
    return (
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <path
          d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V10.5z"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9 22V13a1 1 0 011-1h4a1 1 0 011 1v9"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  if (id === 'pagos')
    return (
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <rect
          x="3"
          y="6"
          width="18"
          height="13"
          rx="2.5"
          stroke={color}
          strokeWidth={sw}
        />
        <path d="M3 10h18" stroke={color} strokeWidth={sw} />
        <path
          d="M7 15h3"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      </svg>
    );
  if (id === 'revisar')
    return (
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="6.5" stroke={color} strokeWidth={sw} />
        <path
          d="m20 20-3.5-3.5"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      </svg>
    );
  if (id === 'pyl')
    return (
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <path
          d="M3 20h18"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
        />
        <path
          d="M5 17V8m5 9v-6m5 6V5m5 12v-9"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      </svg>
    );
  // perfil — círculo cabeza + arco hombros
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke={color} strokeWidth={sw} />
      <path
        d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavIconFilled({ id, color }: { id: TabId; color: string }) {
  if (id === 'home')
    return (
      <svg width={26} height={26} viewBox="0 0 24 24" fill={color}>
        <path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1h-5v-8a1 1 0 00-1-1h-4a1 1 0 00-1 1v8H4a1 1 0 01-1-1V10.5z" />
      </svg>
    );
  if (id === 'pagos')
    return (
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="6" width="18" height="13" rx="2.5" fill={color} />
        <rect x="3" y="9" width="18" height="2" fill="#FDFBF8" opacity="0.85" />
        <path
          d="M7 15h3"
          stroke="#FDFBF8"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  if (id === 'revisar')
    return (
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="6.5" fill={color} />
        <circle cx="11" cy="11" r="3" fill="#FDFBF8" opacity="0.45" />
        <path
          d="m20 20-3.5-3.5"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    );
  if (id === 'pyl')
    return (
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="11" width="3" height="7" rx="1" fill={color} opacity="0.55" />
        <rect x="9.5" y="8" width="3" height="10" rx="1" fill={color} opacity="0.75" />
        <rect x="15" y="5" width="3" height="13" rx="1" fill={color} />
        <path
          d="M3 20h18"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
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
