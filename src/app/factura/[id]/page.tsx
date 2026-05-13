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
  const { facturas, marcarPagada, eliminarFactura, actualizarMedioPago, loading } =
    useFacturasStore();
  const [confirmingPay, setConfirmingPay] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingMedio, setEditingMedio] = useState(false);
  const [marking, setMarking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingMedio, setSavingMedio] = useState<string | null>(null);
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
    setOkMsg(null);
    const res = await marcarPagada(f);
    setMarking(false);
    if (res.ok) {
      setOkMsg('Factura marcada como pagada');
      setConfirmingPay(false);
      setTimeout(() => router.replace('/pagadas'), 800);
    } else {
      // Bubble up el error real del Sheet API / server.
      setErrMsg(res.error || 'No se pudo marcar como pagada. Intentá de nuevo.');
    }
  }

  async function handleChangeMedio(medio: string) {
    if (!f || savingMedio) return;
    setSavingMedio(medio);
    setErrMsg(null);
    setOkMsg(null);
    const res = await actualizarMedioPago(f, medio);
    setSavingMedio(null);
    if (res.ok) {
      setOkMsg(`Método de pago actualizado a ${medio}`);
      setEditingMedio(false);
    } else {
      setErrMsg(res.error || 'No se pudo actualizar el método de pago.');
    }
  }

  async function handleDelete() {
    if (!f) return;
    setDeleting(true);
    setErrMsg(null);
    setOkMsg(null);
    const res = await eliminarFactura(f);
    setDeleting(false);
    if (res.ok) {
      setOkMsg('Factura eliminada del Sheet');
      setConfirmingDelete(false);
      setTimeout(() => router.replace('/a-pagar'), 800);
    } else {
      setErrMsg(res.error || 'No se pudo eliminar. Intentá de nuevo.');
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
            className="importe"
            style={{
              fontSize: 40,
              color: 'var(--text)',
              marginTop: 2,
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

        {/* Acciones: Eliminar (rojo, izq) + Marcar pagada (verde, der).
            Si la factura ya está pagada, solo se muestra Eliminar. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!confirmingPay && !confirmingDelete && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: pagado ? '1fr' : '1fr 2fr',
                gap: 8,
              }}
            >
              <button
                onClick={() => {
                  setErrMsg(null);
                  setConfirmingDelete(true);
                }}
                className="spring-tap"
                aria-label="Eliminar factura"
                style={{
                  height: 48,
                  borderRadius: 'var(--radius-md)',
                  background: 'transparent',
                  color: '#C84F3F',
                  fontWeight: 600,
                  fontSize: 13.5,
                  border: '1px solid #C84F3F',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <TrashIcon /> Eliminar
              </button>
              {!pagado && (
                <button
                  onClick={() => {
                    setErrMsg(null);
                    setConfirmingPay(true);
                  }}
                  className="btn-glow-success spring-tap"
                  style={{
                    height: 48,
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 600,
                    fontSize: 14.5,
                  }}
                >
                  ✓ Marcar como pagada
                </button>
              )}
            </div>
          )}

          {/* Confirm: marcar pagada */}
          {confirmingPay && (
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--green)',
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
                Se va a escribir <strong>Estado = Pagada</strong> y{' '}
                <strong>Fecha de Pago = hoy</strong> en la fila{' '}
                {f._sheetRow || '?'} del Sheet de Facturas.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setConfirmingPay(false)}
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

          {/* Confirm: eliminar */}
          {confirmingDelete && (
            <div
              style={{
                background: 'var(--red-bg)',
                border: '1px solid #C84F3F',
                borderRadius: 'var(--radius-lg)',
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: '#C84F3F' }}>
                ¿Estás segura?
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Se va a borrar el contenido de la fila{' '}
                <strong>{f._sheetRow || '?'}</strong> del Sheet de Facturas
                ({f[COL.proveedor]} · {fmtMoney(parseNum(f[COL.total]))}). Esta
                acción no se puede deshacer desde la app — habría que cargar la
                factura de vuelta a mano.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="spring-tap"
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-card)',
                    color: 'var(--text)',
                    fontWeight: 600,
                    border: '1px solid var(--border)',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="spring-tap"
                  style={{
                    flex: 2,
                    height: 44,
                    borderRadius: 'var(--radius-md)',
                    background: '#C84F3F',
                    color: '#FDFBF8',
                    fontWeight: 700,
                    border: 0,
                    opacity: deleting ? 0.7 : 1,
                  }}
                >
                  {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                </button>
              </div>
            </div>
          )}

          {/* Cambiar método de pago (siempre visible salvo durante confirm de pago/borrado).
              Útil cuando la bot la cargó con "Transferencia" pero fue "Efectivo", o viceversa. */}
          {!confirmingPay && !confirmingDelete && (
            <div>
              {!editingMedio ? (
                <button
                  onClick={() => {
                    setErrMsg(null);
                    setOkMsg(null);
                    setEditingMedio(true);
                  }}
                  className="spring-tap"
                  style={{
                    width: '100%',
                    height: 44,
                    borderRadius: 'var(--radius-md)',
                    background: 'transparent',
                    color: 'var(--text)',
                    fontWeight: 500,
                    fontSize: 13.5,
                    border: '1px dashed var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  Cambiar método de pago{f[COL.medioPago] ? ` (actual: ${f[COL.medioPago]})` : ''}
                </button>
              ) : (
                <div
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
                    Nuevo método de pago
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Se escribe en la columna <strong>Medio de Pago</strong> de la fila{' '}
                    {f._sheetRow || '?'}. No se modifica Estado ni Fecha de Pago.
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 8,
                    }}
                  >
                    {['Efectivo', 'Transferencia', 'Tarjeta', 'Mix', 'Cheque', 'Mercado Pago'].map(
                      (medio) => {
                        const actual = (f[COL.medioPago] || '').trim() === medio;
                        const loadingThis = savingMedio === medio;
                        return (
                          <button
                            key={medio}
                            onClick={() => handleChangeMedio(medio)}
                            disabled={!!savingMedio || actual}
                            className="spring-tap"
                            style={{
                              height: 40,
                              borderRadius: 'var(--radius-md)',
                              background: actual ? 'var(--accent-bg)' : 'var(--bg-subtle)',
                              color: actual ? 'var(--accent-hover)' : 'var(--text)',
                              fontWeight: 600,
                              fontSize: 13,
                              border: `1px solid ${actual ? 'var(--accent)' : 'var(--border)'}`,
                              cursor: actual ? 'default' : 'pointer',
                              opacity: savingMedio && !loadingThis ? 0.5 : 1,
                            }}
                          >
                            {loadingThis ? 'Guardando…' : medio}
                            {actual && !loadingThis ? ' ✓' : ''}
                          </button>
                        );
                      },
                    )}
                  </div>
                  <button
                    onClick={() => setEditingMedio(false)}
                    className="spring-tap"
                    style={{
                      height: 38,
                      borderRadius: 'var(--radius-md)',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      fontWeight: 500,
                      fontSize: 13,
                      border: '1px solid var(--border)',
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              )}
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
                lineHeight: 1.4,
                wordBreak: 'break-word',
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

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
