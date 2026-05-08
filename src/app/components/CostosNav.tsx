'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Toggle de sección que comparten /proveedores y /productos: el bottom nav
// los unifica en un solo slot ("Costos") y este componente permite flipar
// entre las dos vistas sin volver a tocar la tab bar.
const SECTIONS: { id: 'proveedores' | 'productos'; label: string; href: string }[] = [
  { id: 'proveedores', label: 'Proveedores', href: '/proveedores' },
  { id: 'productos', label: 'Productos', href: '/productos' },
];

export function CostosNav() {
  const pathname = usePathname();
  const activeId =
    pathname.startsWith('/productos') ? 'productos' : 'proveedores';

  return (
    <div
      className="px-4"
      style={{ marginTop: 12, marginBottom: 4 }}
    >
      <div
        style={{
          display: 'flex',
          background: 'var(--bg-card-alt)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 4,
          gap: 4,
        }}
      >
        {SECTIONS.map((s) => {
          const active = s.id === activeId;
          return (
            <Link
              key={s.id}
              href={s.href}
              className="spring-tap"
              aria-current={active ? 'page' : undefined}
              style={{
                flex: 1,
                height: 38,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'calc(var(--radius-md) - 4px)',
                fontWeight: 600,
                fontSize: 13,
                background: active ? 'var(--bg-card)' : 'transparent',
                color: active ? 'var(--text)' : 'var(--text-muted)',
                boxShadow: active ? 'var(--shadow-sm)' : 'none',
                textDecoration: 'none',
              }}
            >
              {s.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
