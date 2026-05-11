'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

// CommandPalette — buscador de funciones del dashboard estilo
// Linear / Raycast / Cmd+K. Se abre con el ícono de lupa del TopNav
// o con el atajo Cmd/Ctrl+K. Filtra funciones por texto fuzzy,
// navega con flechas + Enter, ESC cierra.
//
// Las funciones se filtran por rol del usuario (P&L → owner only,
// Usuarios → admin/owner, etc).
//
// Diseño: bottom sheet en mobile, centered card en desktop. Hero
// dorado-tinted con el input grande arriba, lista scrolleable abajo,
// hint de atajos al pie.

interface CommandItem {
  id: string;
  label: string;
  hint?: string;             // ej. "Owner only"
  keywords: string;          // texto a usar para matching, además del label
  href: string;
  section: 'navegar' | 'facturas' | 'caja' | 'cuenta';
  icon: ReactNode;
  visible: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  const { isOwner, isAdmin } = useAuth();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build catálogo + filtrar por rol
  const items = useMemo<CommandItem[]>(() => {
    const all: CommandItem[] = [
      // Navegación principal
      {
        id: 'home',
        label: 'Inicio',
        keywords: 'home inicio dashboard total a pagar',
        href: '/',
        section: 'navegar',
        icon: <HomeIcon />,
        visible: true,
      },
      {
        id: 'pagos',
        label: 'Pagos',
        keywords: 'pagos hub a pagar pagadas',
        href: '/pagos',
        section: 'navegar',
        icon: <WalletIcon />,
        visible: true,
      },
      {
        id: 'revisar',
        label: 'Revisar',
        keywords: 'revisar análisis proveedores productos',
        href: '/revisar',
        section: 'navegar',
        icon: <MagnifierIcon />,
        visible: true,
      },
      {
        id: 'pyl',
        label: 'P&L',
        hint: 'Owner',
        keywords: 'pnl pyl financiero análisis',
        href: '/pyl',
        section: 'navegar',
        icon: <BarChartIcon />,
        visible: isOwner,
      },
      {
        id: 'funciones',
        label: 'Todas las funciones',
        keywords: 'funciones grilla todo lista',
        href: '/funciones',
        section: 'navegar',
        icon: <GridIcon />,
        visible: true,
      },

      // Facturas
      {
        id: 'a-pagar',
        label: 'A pagar',
        keywords: 'a pagar pendientes facturas pendientes',
        href: '/a-pagar',
        section: 'facturas',
        icon: <ClockIcon />,
        visible: true,
      },
      {
        id: 'pagadas',
        label: 'Pagadas',
        keywords: 'pagadas historial facturas pagadas',
        href: '/pagadas',
        section: 'facturas',
        icon: <CheckCircleIcon />,
        visible: true,
      },
      {
        id: 'buscar-facturas',
        label: 'Buscar factura',
        keywords: 'buscar factura proveedor cuit local',
        href: '/buscar',
        section: 'facturas',
        icon: <SearchSmallIcon />,
        visible: true,
      },
      {
        id: 'proveedores',
        label: 'Proveedores',
        keywords: 'proveedores ranking deuda',
        href: '/proveedores',
        section: 'facturas',
        icon: <BuildingIcon />,
        visible: true,
      },
      {
        id: 'productos',
        label: 'Productos · Food Cost',
        keywords: 'productos food cost recetario margenes',
        href: '/productos',
        section: 'facturas',
        icon: <BoxIcon />,
        visible: true,
      },

      // Caja / Servicios (owner)
      {
        id: 'caja',
        label: 'Caja efectivo',
        hint: 'Owner',
        keywords: 'caja efectivo pesos dolares saldo sesion control',
        href: '/caja',
        section: 'caja',
        icon: <CashIcon />,
        visible: isOwner,
      },
      {
        id: 'servicios',
        label: 'Servicios',
        hint: 'Owner',
        keywords: 'servicios luz agua gas internet alquiler iva expensas',
        href: '/servicios',
        section: 'caja',
        icon: <BoltIcon />,
        visible: isOwner,
      },
      {
        id: 'baigun',
        label: 'Baigun · cta cte',
        hint: 'Owner',
        keywords: 'baigun subarriendo libertador cuenta corriente',
        href: '/baigun',
        section: 'caja',
        icon: <ScrollIcon />,
        visible: isOwner,
      },

      // Cuenta / equipo
      {
        id: 'usuarios',
        label: 'Usuarios',
        hint: 'Admin',
        keywords: 'usuarios acceso roles equipo permisos',
        href: '/perfil/usuarios',
        section: 'cuenta',
        icon: <UsersIcon />,
        visible: isAdmin,
      },
      {
        id: 'perfil',
        label: 'Perfil',
        keywords: 'perfil cuenta cerrar sesion logout',
        href: '/perfil',
        section: 'cuenta',
        icon: <UserIcon />,
        visible: true,
      },
    ];
    return all.filter((it) => it.visible);
  }, [isOwner, isAdmin]);

  // Filtrado fuzzy simple: cada token del query tiene que estar en
  // label o keywords. Case-insensitive, sin tildes para que "pyl"
  // matchee "P&L".
  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return items;
    const tokens = q.split(/\s+/).filter(Boolean);
    return items.filter((it) => {
      const haystack = normalize(`${it.label} ${it.keywords}`);
      return tokens.every((t) => haystack.includes(t));
    });
  }, [items, query]);

  // Agrupar por sección manteniendo el orden filtrado
  const grouped = useMemo(() => {
    const order: CommandItem['section'][] = [
      'navegar',
      'facturas',
      'caja',
      'cuenta',
    ];
    const map = new Map<CommandItem['section'], CommandItem[]>();
    for (const it of filtered) {
      const arr = map.get(it.section) || [];
      arr.push(it);
      map.set(it.section, arr);
    }
    return order
      .map((s) => ({ section: s, items: map.get(s) || [] }))
      .filter((g) => g.items.length > 0);
  }, [filtered]);

  // Reset al abrir
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIdx(0);
    setTimeout(() => inputRef.current?.focus(), 30);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Reset active index cuando cambia el filtro
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const choose = useCallback(
    (item: CommandItem) => {
      onClose();
      router.push(item.href);
    },
    [router, onClose],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = filtered[activeIdx];
        if (item) choose(item);
      }
    },
    [open, filtered, activeIdx, choose, onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  // Scroll auto del activeIdx
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-cmd-idx="${activeIdx}"]`,
    );
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeIdx, open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(13,8,5,0.55)',
          backdropFilter: 'blur(8px)',
          zIndex: 200,
          animation: 'fadeIn 0.18s var(--ease-ios) both',
        }}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar función"
        style={{
          position: 'fixed',
          top: 'max(env(safe-area-inset-top, 0px), 24px)',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(620px, calc(100vw - 24px))',
          maxHeight: 'calc(100dvh - 48px)',
          background: 'var(--bg-card)',
          borderRadius: 22,
          boxShadow:
            '0 24px 56px -8px rgba(13,8,5,0.45), 0 0 0 1px var(--border-accent)',
          zIndex: 201,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'sheetSlideUp 0.26s var(--ease-out-expo) both',
        }}
      >
        {/* Input row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 18px 14px',
            borderBottom: '1px solid var(--border)',
            background:
              'linear-gradient(180deg, var(--accent-bg) 0%, transparent 100%)',
          }}
        >
          <span aria-hidden style={{ color: 'var(--accent)', flexShrink: 0 }}>
            <SearchSmallIcon />
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar función…"
            aria-label="Buscar función"
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: 0,
              background: 'transparent',
              fontSize: 16,
              fontWeight: 500,
              color: 'var(--text)',
              fontFamily: 'inherit',
              letterSpacing: '-0.005em',
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="press-feedback"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--bg-subtle)',
              border: 0,
              color: 'var(--text-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Lista */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 8px 12px',
            scrollbarWidth: 'thin',
          }}
        >
          {filtered.length === 0 && (
            <div
              style={{
                padding: '40px 16px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 13,
              }}
            >
              Sin resultados para &ldquo;{query}&rdquo;.
            </div>
          )}

          {grouped.map((group) => (
            <div key={group.section} style={{ marginBottom: 4 }}>
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  padding: '8px 12px 4px',
                }}
              >
                {SECTION_LABELS[group.section]}
              </div>
              {group.items.map((it) => {
                const idx = filtered.indexOf(it);
                const active = idx === activeIdx;
                return (
                  <button
                    key={it.id}
                    data-cmd-idx={idx}
                    onClick={() => choose(it)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    type="button"
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: active ? 'var(--accent-bg)' : 'transparent',
                      border: 0,
                      color: 'var(--text)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 120ms var(--ease-ios)',
                    }}
                  >
                    <div
                      aria-hidden
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        background: active ? 'var(--accent)' : 'var(--bg-subtle)',
                        color: active ? '#FDFBF8' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'all 120ms var(--ease-ios)',
                      }}
                    >
                      {it.icon}
                    </div>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 14,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {it.label}
                    </span>
                    {it.hint && (
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: active ? 'var(--accent-hover)' : 'var(--text-muted)',
                          padding: '2px 7px',
                          background: active ? 'var(--bg-card)' : 'var(--bg-subtle)',
                          borderRadius: 999,
                          flexShrink: 0,
                        }}
                      >
                        {it.hint}
                      </span>
                    )}
                    {active && (
                      <span
                        aria-hidden
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: 'var(--accent-hover)',
                          flexShrink: 0,
                        }}
                      >
                        ↵
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Hint footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 14px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-card-alt)',
            fontSize: 10.5,
            color: 'var(--text-muted)',
            fontWeight: 500,
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navegar
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Kbd>↵</Kbd> abrir
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Kbd>esc</Kbd> cerrar
          </span>
        </div>
      </div>
    </>,
    document.body,
  );
}

const SECTION_LABELS: Record<CommandItem['section'], string> = {
  navegar: 'Navegar',
  facturas: 'Facturas',
  caja: 'Caja · Servicios',
  cuenta: 'Cuenta',
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[&]/g, '');
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        fontFamily: 'inherit',
        fontSize: 10,
        fontWeight: 600,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '1px 5px',
        color: 'var(--text)',
        minWidth: 18,
        textAlign: 'center',
        display: 'inline-block',
      }}
    >
      {children}
    </kbd>
  );
}

// ─── Iconos ──────────────────────────────────────────────────────

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V10.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function WalletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function MagnifierIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
function BarChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 20h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 17V8m5 9v-6m5 6V5m5 12v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CheckCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="m8 12 3 3 5-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SearchSmallIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
function BuildingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 21h18M5 21V7l7-4 7 4v14M9 9h2m2 0h2m-6 4h2m2 0h2m-6 4h2m2 0h2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function BoxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M3.3 8.3 12 13l8.7-4.7M12 22V13" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
function CashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12.5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function BoltIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="m13 2-9 13h7l-2 7 9-13h-7l2-7z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
function ScrollIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 2h12a2 2 0 0 1 2 2v15a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a2 2 0 0 1 2-2h3M8 2v6H5M8 2a2 2 0 0 1 2 2v15a3 3 0 0 0 3 3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
