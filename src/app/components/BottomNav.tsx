'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 5 tabs estilo MercadoPago, idénticas al staff.
const TABS = [
  { href: '/', label: 'Inicio', match: (p: string) => p === '/' },
  { href: '/operaciones', label: 'Operaciones', match: (p: string) => p.startsWith('/operaciones') },
  { href: '/control', label: 'Control', match: (p: string) => p.startsWith('/control') },
  { href: '/equipo', label: 'Equipo', match: (p: string) => p.startsWith('/equipo') },
  { href: '/perfil', label: 'Perfil', match: (p: string) => p.startsWith('/perfil') },
] as const;

const ICONS: Record<string, React.ReactNode> = {
  Inicio: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="lh-bottomnav-icon">
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  ),
  Operaciones: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="lh-bottomnav-icon">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  Control: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="lh-bottomnav-icon">
      <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  Equipo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="lh-bottomnav-icon">
      <circle cx="9" cy="8" r="3.2" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" />
      <path d="M15 19c0-2 1.5-4 4-4s2 1 2 1" />
    </svg>
  ),
  Perfil: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="lh-bottomnav-icon">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6" />
    </svg>
  ),
};

export function BottomNav() {
  const pathname = usePathname();
  if (pathname === '/login' || pathname === '/unauthorized') return null;

  return (
    <nav className="lh-bottomnav" aria-label="Navegación principal">
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`lh-bottomnav-item${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {ICONS[t.label]}
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
