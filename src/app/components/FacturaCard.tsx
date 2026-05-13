'use client';

import Link from 'next/link';
import {
  COL,
  type Factura,
  fmtMoney,
  parseNum,
  esPagado,
  esBistrosoft,
  shortLocal,
} from './FacturasStore';

// Card item de factura. Patrón "transacción" del DESIGN.md §13.2:
// avatar circular coloreado por estado, monto tabular-nums-strict a
// la derecha, fecha + local + número en línea secundaria, chip estado.
//
// Estados → map único `STATUS` (color, bg, label, icon) para que
// pendiente/pagada/bistrosoft sean coherentes en toda la app.

type Status = 'pendiente' | 'pagada' | 'bistrosoft';

interface StatusConfig {
  bg: string;
  color: string;
  label: string;
  iconBg: string;
  iconColor: string;
  icon: React.ReactNode;
}

const STATUS: Record<Status, StatusConfig> = {
  pendiente: {
    bg: 'rgba(217,95,78,0.10)',
    color: '#C84F3F',
    label: 'Pendiente',
    iconBg: 'rgba(217,95,78,0.10)',
    iconColor: '#C84F3F',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  pagada: {
    bg: 'var(--green-bg)',
    color: 'var(--green)',
    label: 'Pagada',
    iconBg: 'var(--green-bg)',
    iconColor: 'var(--green)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
        <path d="m8 12 3 3 5-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  bistrosoft: {
    bg: 'var(--accent-bg)',
    color: 'var(--accent-hover)',
    label: 'Bistrosoft',
    iconBg: 'var(--accent-bg)',
    iconColor: 'var(--accent)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4" y="6" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8 2v4m8-4v4M4 11h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
};

function statusOf(f: Factura): Status {
  if (esBistrosoft(f)) return 'bistrosoft';
  if (esPagado(f)) return 'pagada';
  return 'pendiente';
}

export function FacturaCard({
  f,
  href,
  onClick,
  showLocal = true,
  showCategoria = false,
}: {
  f: Factura;
  href?: string;
  onClick?: () => void;
  showLocal?: boolean;
  showCategoria?: boolean;
}) {
  const status = statusOf(f);
  const cfg = STATUS[status];
  const medio = f[COL.medioPago] || f[COL.estado] || '';

  const inner = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        width: '100%',
      }}
    >
      {/* Avatar coloreado por estado */}
      <div
        aria-hidden
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: cfg.iconBg,
          color: cfg.iconColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {cfg.icon}
      </div>

      {/* Datos */}
      <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
        <div
          style={{
            fontSize: 14.5,
            fontWeight: 600,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            letterSpacing: '-0.005em',
          }}
        >
          {f[COL.proveedor] || '—'}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: 'var(--text-muted)',
            marginTop: 1.5,
            display: 'flex',
            gap: 5,
            flexWrap: 'nowrap',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          <span>{f[COL.fecha] || '—'}</span>
          {showLocal && f[COL.local] && (
            <>
              <span aria-hidden>·</span>
              <span>{shortLocal(f[COL.local])}</span>
            </>
          )}
          {f[COL.nroFac] && (
            <>
              <span aria-hidden>·</span>
              <span>#{f[COL.nroFac]}</span>
            </>
          )}
          {showCategoria && f[COL.categoria] && (
            <>
              <span aria-hidden>·</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {f[COL.categoria]}
              </span>
            </>
          )}
        </div>
        <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              background: cfg.bg,
              color: cfg.color,
              padding: '2px 7px',
              borderRadius: 999,
            }}
          >
            {cfg.label}
          </span>
          {status === 'pendiente' && medio && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 140,
              }}
            >
              {medio}
            </span>
          )}
        </div>
      </div>

      {/* Monto */}
      <div
        className="importe"
        style={{
          fontSize: 16,
          color: status === 'pagada' ? 'var(--text-muted)' : 'var(--text)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {fmtMoney(parseNum(f[COL.total]))}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="spring-tap" style={{ display: 'block' }}>
        {inner}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className="spring-tap" style={{ width: '100%' }}>
      {inner}
    </button>
  );
}
