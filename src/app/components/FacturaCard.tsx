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

// Card item de factura — listado y detalle. Tap-feedback + ratio premium.
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
  const pagado = esPagado(f);
  const bistro = esBistrosoft(f);

  const inner = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: 14,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)',
        textAlign: 'left',
        width: '100%',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            letterSpacing: '-0.01em',
          }}
        >
          {f[COL.proveedor] || '—'}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            marginTop: 2,
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <span>{f[COL.fecha] || '—'}</span>
          {showLocal && (
            <>
              <span>·</span>
              <span>{shortLocal(f[COL.local] || '—')}</span>
            </>
          )}
          {f[COL.nroFac] && (
            <>
              <span>·</span>
              <span>Nº {f[COL.nroFac]}</span>
            </>
          )}
          {showCategoria && f[COL.categoria] && (
            <>
              <span>·</span>
              <span>{f[COL.categoria]}</span>
            </>
          )}
        </div>
        <div style={{ marginTop: 6 }}>
          {bistro ? (
            <span className="lh-chip lh-chip-bistrosoft">🤖 Bistrosoft</span>
          ) : pagado ? (
            <span className="lh-chip lh-chip-pagada">✓ Pagada</span>
          ) : (
            <span className="lh-chip lh-chip-pendiente">
              ⏳ {f[COL.medioPago] || f[COL.estado] || 'Pendiente'}
            </span>
          )}
        </div>
      </div>
      <div
        style={{
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          fontWeight: 700,
          fontSize: 17,
          color: 'var(--text)',
          whiteSpace: 'nowrap',
          letterSpacing: '-0.01em',
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
