'use client';

import { useRouter } from 'next/navigation';

// Header sticky para pages internas — mismo lenguaje que AppHeader del staff:
// fondo bg-card, borde inferior, ícono back redondo, título tight + subtítulo.
export function PageHeader({
  title,
  subtitle,
  showBack = false,
  rightSlot,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightSlot?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div
      className="px-3 flex items-center gap-2.5 sticky top-0 z-30"
      style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        paddingTop: 'calc(var(--safe-top) + 12px)',
        paddingBottom: 12,
      }}
    >
      {showBack && (
        <button
          onClick={() => router.back()}
          aria-label="Volver"
          className="spring-tap"
          style={{
            width: 44,
            height: 44,
            marginLeft: -4,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 999,
            background: 'var(--bg-subtle)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1
          className="font-brand heading-tight"
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--text)',
            lineHeight: 1.15,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              fontSize: 11.5,
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {rightSlot}
    </div>
  );
}
