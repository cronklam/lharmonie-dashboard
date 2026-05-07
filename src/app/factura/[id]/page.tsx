'use client';

import { use, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';
import { PageHeader } from '../../components/PageHeader';
import {
  COL,
  esBistrosoft,
  esPagado,
  fmtMoney,
  parseNum,
  shortLocal,
  useFacturasStore,
} from '../../components/FacturasStore';

export default function FacturaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { facturas, marcarPagada, loading } = useFacturasStore();
  const [confirming, setConfirming] = useState(false);
  const [marking, setMarking] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const f = useMemo(
    () => facturas.find((x) => x._id === decodeURIComponent(id)),
    [facturas, id],
  );

  if (authLoading || !user) return null;

  if (loading && !f) {
    return (
      <div className="page-enter">
        <PageHeader title="Cargando…" showBack />
      </div>
    );
  }

  if (!f) {
    return (
      <div className="page-enter">
        <PageHeader title="Factura no encontrada" showBack />
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            color: 'var(--text-muted)',
          }}
        >
          Esta factura ya no existe o el id es inválido.
        </div>
      </div>
    );
  }

  const pagado = esPagado(f);
  const bistro = esBistrosoft(f);
  const imgUrl = f[COL.imagen];

  const fields: [string, string][] = (
    [
      ['Local', f[COL.local] || ''],
      ['Cajero', f[COL.cajero] || ''],
      ['CUIT', f[COL.cuit] || ''],
      ['Tipo doc', f[COL.tipoDoc] || ''],
      ['Punto venta', f[COL.pv] || ''],
      ['Categoría', f[COL.categoria] || ''],
      [
        'Importe neto',
        f[COL.importeNeto] ? fmtMoney(parseNum(f[COL.importeNeto])) : '',
      ],
      ['IVA 21%', f[COL.iva21] ? fmtMoney(parseNum(f[COL.iva21])) : ''],
      ['IVA 10.5%', f[COL.iva105] ? fmtMoney(parseNum(f[COL.iva105])) : ''],
      ['Medio de pago', f[COL.medioPago] || f[COL.estado] || ''],
      ['Fecha de pago', f[COL.fechaPago] || ''],
      ['Procesado', f[COL.procesado] || ''],
      ['Observaciones', f[COL.obs] || ''],
    ] as [string, string][]
  ).filter(([, v]) => v);

  async function handleMark() {
    if (!f) return;
    setMarking(true);
    setErrMsg(null);
    const ok = await marcarPagada(f);
    setMarking(false);
    if (ok) {
      setOkMsg('Factura marcada como pagada');
      setConfirming(false);
      setTimeout(() => router.replace('/pagadas'), 800);
    } else {
      setErrMsg('No se pudo marcar como pagada. Intentá de nuevo.');
    }
  }

  return (
    <div className="page-enter">
      <PageHeader
        title={f[COL.proveedor] || 'Factura'}
        subtitle={`Nº ${f[COL.nroFac] || '—'} · ${f[COL.fecha] || '—'}`}
        showBack
      />

      <div className="px-4 pt-4" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Hero amount */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: 18,
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              fontWeight: 600,
            }}
          >
            Monto total
          </div>
          <div
            className="font-brand heading-tight-lg"
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: 'var(--text)',
              fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
              marginTop: 2,
              lineHeight: 1,
            }}
          >
            {fmtMoney(parseNum(f[COL.total]))}
          </div>
          <div style={{ marginTop: 8 }}>
            {bistro ? (
              <span className="lh-chip lh-chip-bistrosoft">🤖 Bistrosoft</span>
            ) : pagado ? (
              <span className="lh-chip lh-chip-pagada">
                ✓ Pagada{f[COL.fechaPago] ? ` el ${f[COL.fechaPago]}` : ''}
              </span>
            ) : (
              <span className="lh-chip lh-chip-pendiente">⏳ Pendiente</span>
            )}
          </div>
          <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 12.5 }}>
            {shortLocal(f[COL.local] || '—')}
          </div>
        </div>

        {/* Marcar pagada (solo si no está pagada) */}
        {!pagado && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                className="btn-glow-success spring-tap"
                style={{
                  height: 48,
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  width: '100%',
                  fontSize: 14.5,
                }}
              >
                ✓ Marcar como pagada
              </button>
            ) : (
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                  ¿Confirmar pago?
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                  Se marca {fmtMoney(parseNum(f[COL.total]))} como pagado en el Sheet.
                  Esta acción se sincroniza con el bot de Telegram.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setConfirming(false)}
                    className="spring-tap"
                    style={{
                      flex: 1,
                      height: 44,
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-subtle)',
                      color: 'var(--text)',
                      fontWeight: 600,
                      border: '1px solid var(--border)',
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleMark}
                    disabled={marking}
                    className="btn-glow-success spring-tap"
                    style={{
                      flex: 2,
                      height: 44,
                      borderRadius: 'var(--radius-md)',
                      fontWeight: 600,
                      opacity: marking ? 0.7 : 1,
                    }}
                  >
                    {marking ? 'Guardando…' : 'Sí, marcar pagada'}
                  </button>
                </div>
              </div>
            )}
            {errMsg && (
              <div
                style={{
                  background: 'rgba(217,95,78,0.10)',
                  color: '#C84F3F',
                  padding: 10,
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13,
                }}
              >
                {errMsg}
              </div>
            )}
            {okMsg && (
              <div
                style={{
                  background: 'var(--green-bg)',
                  color: 'var(--green)',
                  padding: 10,
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13,
                }}
              >
                ✓ {okMsg}
              </div>
            )}
          </div>
        )}

        {/* Detalles */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: 6,
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              rowGap: 0,
              columnGap: 14,
              margin: 0,
            }}
          >
            {fields.map(([k, v], i) => (
              <FieldRow key={k} label={k} value={v} divider={i < fields.length - 1} />
            ))}
          </dl>
        </div>

        {/* Comprobante */}
        {imgUrl && (
          <a
            href={imgUrl}
            target="_blank"
            rel="noreferrer"
            className="spring-tap"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 14,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-card)',
              color: 'var(--text)',
            }}
          >
            <span style={{ fontSize: 22 }}>🖼</span>
            <span style={{ fontWeight: 600, fontSize: 13.5 }}>Ver comprobante →</span>
          </a>
        )}
      </div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  divider,
}: {
  label: string;
  value: string;
  divider: boolean;
}) {
  const cellStyle: React.CSSProperties = {
    padding: '12px 14px',
    borderBottom: divider ? '1px solid var(--border)' : 'none',
  };
  return (
    <>
      <dt
        style={{
          ...cellStyle,
          fontSize: 12,
          color: 'var(--text-muted)',
          fontWeight: 500,
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          ...cellStyle,
          margin: 0,
          fontSize: 13.5,
          color: 'var(--text)',
          textAlign: 'right',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </dd>
    </>
  );
}
