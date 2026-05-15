'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { CommandPalette } from './CommandPalette';

// Top nav exclusive: fondo casi negro espresso (#0D0805) con línea
// inferior dorada y curva en las esquinas inferiores (radio 22px) que
// le da feel de "tarjeta flotante" sobre la página crema. Sticky.
//
// Composición:
//   • Brand "Lharmonie" → /
//   • Pill MANAGEMENT (desktop)
//   • Identidad: chip dorado con inicial + nombre → /perfil
//   • Lupa: abre CommandPalette (buscador de funciones). Atajo
//     global Cmd/Ctrl+K también lo abre.
//
// La búsqueda de FACTURAS (/buscar) sigue accesible como una entrada
// más dentro del CommandPalette.

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
  const { user } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Scroll-aware glass: el header gana refuerzo de border + sombra al
  // bajar > 10px desde el tope. Se calcula contra window.scrollY porque
  // el main no scrollea por separado (es el body).
  const [scrolled, setScrolled] = useState(false);

  // Atajo global Cmd/Ctrl + K para abrir la paleta. No interfiere con
  // inputs porque preventDefault solo cuando es el shortcut.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK =
        (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isCmdK) {
        e.preventDefault();
        setPaletteOpen((p) => !p);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    // Doble guard: la lectura de scrollY pasa por rAF para no
    // disparar dentro del callback de scroll (más liviano en mobile),
    // y comparamos contra el último valor para evitar setState si el
    // bool no cambió — un setState por frame de scroll re-renderea
    // el TopNav 60 veces por segundo si no.
    let ticking = false;
    let lastScrolled = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const next = window.scrollY > 10;
        if (next !== lastScrolled) {
          lastScrolled = next;
          setScrolled(next);
        }
        ticking = false;
      });
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (pathname === '/login' || pathname === '/unauthorized') return null;

  const onPerfil = pathname.startsWith('/perfil');
  const userInitial = initial(user?.name, user?.email);
  const userFirst = firstName(user?.name);

  return (
    <>
      <header
        className="lh-topnav-exclusive"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          // Fondo siempre opaco (cero backdrop-filter — es caro en
          // iOS y se repintaba a 60 fps mientras se scrollea). El
          // cambio al scrollear se hace solo con borde + sombra,
          // que son baratos.
          background: '#0D0805',
          borderBottom: scrolled
            ? '1px solid rgba(196,160,103,0.32)'
            : '1px solid rgba(196,160,103,0.20)',
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 22,
          boxShadow: scrolled
            ? '0 6px 18px -8px rgba(196,160,103,0.22), 0 10px 24px -12px rgba(13,8,5,0.50)'
            : '0 4px 16px -4px rgba(196,160,103,0.10), 0 8px 24px -8px rgba(13,8,5,0.30)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          transition:
            'border-color 0.2s var(--ease-ios), box-shadow 0.2s var(--ease-ios)',
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
          {/* Brand — data-logo-anchor para el morph del wordmark
              desde el login (LogoMorphController). */}
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

          {/* MANAGEMENT pill — se oculta debajo de 420px (CSS).
              Entra con un leve "pop" spring, ~150ms después del brand. */}
          <span
            aria-hidden
            className="lh-topnav-pill lh-fx-spring-pop"
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
              animationDelay: '160ms',
            }}
          >
            Management
          </span>

          <div style={{ flex: 1 }} />

          {/* Identidad: chip dorado con inicial + nombre. Tap → /perfil.
              Entra desde la derecha, ~260ms detrás del brand. */}
          {user && (
            <Link
              href="/perfil"
              aria-label={user.name ? `Perfil — ${user.name}` : 'Perfil'}
              aria-current={onPerfil ? 'page' : undefined}
              className="spring-tap lh-fx-from-right"
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
                animationDelay: '260ms',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background:
                    'linear-gradient(135deg, #C4A067 0%, #B8865C 100%)',
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

          {/* Lupa: abre CommandPalette (buscador de funciones).
              Último elemento en aparecer, con pop spring. */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Buscar función · Cmd K"
            aria-haspopup="dialog"
            className="spring-tap lh-fx-spring-pop"
            style={{
              width: 38,
              height: 38,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#F9F7F3',
              background: 'transparent',
              border: 0,
              borderRadius: 999,
              cursor: 'pointer',
              flexShrink: 0,
              animationDelay: '360ms',
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
