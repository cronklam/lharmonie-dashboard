'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import type {
  ServicioMes,
  ServicioMesRow,
  ParsedPeriodo,
  CeldaServicio,
} from '@/lib/servicios-mes';
import {
  ANCLAS_OPERATIVAS,
  ANCLA_SHORT_LABEL,
  ANCLA_TO_LOCAL_COL,
} from '@/lib/servicios-mes';
import type { Ancla } from '@/lib/anclas';
import type {
  IndiceLocal,
  IndiceServicio,
} from '../api/servicios/indice/route';

type TabId = 'tabla' | 'calendario' | 'listado' | 'baigun';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'tabla', label: 'Tabla' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'listado', label: 'Listado' },
  { id: 'baigun', label: 'Baigun' },
];

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const MESES_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function ServiciosPage() {
  const { user, loading, isOwner } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<TabId>('tabla');
  const [meses, setMeses] = useState<ParsedPeriodo[]>([]);
  const [periodo, setPeriodo] = useState<string>('');

  const [mesData, setMesData] = useState<ServicioMes | null>(null);
  const [mesError, setMesError] = useState<string | null>(null);
  const [mesLoading, setMesLoading] = useState(false);

  const [indice, setIndice] = useState<{
    locales: IndiceLocal[];
    servicios: IndiceServicio[];
    tabExiste: boolean;
  }>({ locales: [], servicios: [], tabExiste: false });

  const [toast, setToast] = useState('');
  const flashToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 3000);
  }, []);

  const [editing, setEditing] = useState<{
    row: ServicioMesRow;
    ancla: Ancla;
  } | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    if (!isOwner) {
      router.replace('/');
      return;
    }
    fetch('/api/servicios/meses')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.meses?.length) {
          setMeses(d.meses);
          setPeriodo(d.meses[0].periodo);
        } else {
          setMesError(d.error || 'No se encontraron meses en el Sheet');
        }
      })
      .catch(() => setMesError('Error de red leyendo meses'));
  }, [loading, user, isOwner, router]);

  const reloadMes = useCallback(async () => {
    if (!periodo) return;
    setMesLoading(true);
    setMesError(null);
    try {
      const r = await fetch(`/api/servicios/mes?periodo=${periodo}`, {
        cache: 'no-store',
      });
      const d = await r.json();
      if (d.ok) setMesData(d.data);
      else setMesError(d.error || 'Error cargando mes');
    } catch {
      setMesError('Error de red');
    } finally {
      setMesLoading(false);
    }
  }, [periodo]);

  useEffect(() => {
    reloadMes();
  }, [reloadMes]);

  useEffect(() => {
    if (loading || !user || !isOwner) return;
    fetch('/api/servicios/indice')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setIndice({
            locales: d.locales || [],
            servicios: d.servicios || [],
            tabExiste: d.tabExiste,
          });
        }
      })
      .catch(() => {});
  }, [loading, user, isOwner]);

  if (loading || !user) return null;
  if (!isOwner) return null;

  const totalServs =
    (mesData?.filasLocales.length || 0) +
    (mesData?.filasCronklam.length || 0) +
    (mesData?.filasMyP.length || 0);

  return (
    <div className="page-enter">
      <PageHeader
        title="Servicios"
        subtitle={
          mesData
            ? `${totalServs} servicios · alquiler · públicos · IVA · impositivo`
            : 'Cargando…'
        }
        showBack
      />
      <div
        className="px-4 pt-4 lh-inicio-stagger"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          paddingBottom: 'calc(var(--nav-height) + var(--safe-bottom) + 32px)',
        }}
      >
        <TabNav active={tab} onChange={setTab} />

        {meses.length > 0 && (
          <PeriodoChips meses={meses} value={periodo} onChange={setPeriodo} />
        )}

        {mesError && <ErrorBanner text={mesError} />}

        {tab === 'tabla' && (
          <TabTabla
            data={mesData}
            loading={mesLoading}
            onClickCell={(row, ancla) => setEditing({ row, ancla })}
          />
        )}
        {tab === 'calendario' && (
          <TabCalendario indice={indice} mesData={mesData} />
        )}
        {tab === 'listado' && (
          <TabListado indice={indice} mesData={mesData} onAction={flashToast} />
        )}
        {tab === 'baigun' && (
          <TabBaigun mesData={mesData} loading={mesLoading} />
        )}

        <SeedIndiceButton onDone={flashToast} />
      </div>

      {editing && (
        <RegistrarPagoModal
          row={editing.row}
          ancla={editing.ancla}
          periodo={periodo}
          periodoLabel={mesData?.label || ''}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => {
            setEditing(null);
            flashToast(msg);
            await reloadMes();
          }}
          onError={flashToast}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

// ─── Tab nav (pill segmented control) ─────────────────────────────

function TabNav({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: 4,
        background: 'var(--bg-subtle)',
        borderRadius: 999,
        border: '1px solid var(--border)',
        alignSelf: 'center',
        marginTop: 4,
      }}
    >
      {TABS.map((t) => {
        const sel = active === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={sel}
            onClick={() => onChange(t.id)}
            className="press-feedback"
            style={{
              minHeight: 32,
              padding: '0 14px',
              borderRadius: 999,
              background: sel ? 'var(--text)' : 'transparent',
              color: sel ? 'var(--bg-card)' : 'var(--text-muted)',
              fontWeight: sel ? 600 : 500,
              fontSize: 13,
              border: 0,
              cursor: 'pointer',
              transition: 'all 180ms var(--ease-ios)',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Period chips (horizontal scroll) ─────────────────────────────

function PeriodoChips({
  meses,
  value,
  onChange,
}: {
  meses: ParsedPeriodo[];
  value: string;
  onChange: (p: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        flexWrap: 'nowrap',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        margin: '0 -16px',
        padding: '4px 16px 8px 16px',
      }}
    >
      {meses.map((m) => {
        const active = m.periodo === value;
        return (
          <button
            key={m.periodo}
            type="button"
            onClick={() => onChange(m.periodo)}
            className="press-feedback"
            style={{
              flexShrink: 0,
              padding: '8px 14px',
              borderRadius: 999,
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              background: active ? 'var(--accent)' : 'var(--bg-card)',
              color: active ? '#FDFBF8' : 'var(--text)',
              fontSize: 12.5,
              fontWeight: active ? 700 : 500,
              whiteSpace: 'nowrap',
            }}
          >
            {abbrevLabel(m.label)}
          </button>
        );
      })}
    </div>
  );
}

function abbrevLabel(label: string): string {
  return label.replace(/\s(\d{2})(\d{2})$/, ' $2');
}

// ─── Tab: TABLA — light theme con celdas clickables ──────────────

function TabTabla({
  data,
  loading,
  onClickCell,
}: {
  data: ServicioMes | null;
  loading: boolean;
  onClickCell: (row: ServicioMesRow, ancla: Ancla) => void;
}) {
  if (loading && !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="shimmer-modern"
            style={{ height: 44, borderRadius: 10 }}
          />
        ))}
      </div>
    );
  }
  if (!data) return null;

  return (
    <>
      <p
        style={{
          fontSize: 11.5,
          color: 'var(--text-muted)',
          lineHeight: 1.5,
          padding: '0 2px',
        }}
      >
        Tocá una celda para registrar el pago.{' '}
        <span style={{ color: 'var(--green)', fontWeight: 600 }}>Verde</span> = ya pagado este mes ·{' '}
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Pagar</span> = pendiente ·{' '}
        <span style={{ color: 'var(--text-faint)' }}>—</span> = no aplica.
      </p>

      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-card)',
          border: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `130px repeat(${data.anclasOperativas.length}, minmax(82px, 1fr))`,
              minWidth: `calc(130px + ${data.anclasOperativas.length * 82}px)`,
            }}
          >
            {/* Header: esquina */}
            <div
              style={{
                position: 'sticky',
                left: 0,
                zIndex: 4,
                background: 'var(--header-bg)',
                color: 'var(--text-inverse)',
                padding: '10px 12px',
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                borderRight: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              Servicio
            </div>
            {/* Header: columnas */}
            {data.anclasOperativas.map((a) => (
              <div
                key={a}
                style={{
                  background: 'var(--header-bg)',
                  color: 'var(--text-inverse)',
                  padding: '10px 6px',
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textAlign: 'center',
                  borderLeft: '1px solid rgba(255,255,255,0.08)',
                  whiteSpace: 'nowrap',
                }}
              >
                {ANCLA_SHORT_LABEL[a]}
              </div>
            ))}

            {/* Filas locales */}
            {data.filasLocales.map((row, idx) => {
              const bg = idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card-alt)';
              return (
                <FilaTabla
                  key={`${row.servicio}-${idx}`}
                  row={row}
                  anclas={data.anclasOperativas}
                  bg={bg}
                  onClickCell={onClickCell}
                />
              );
            })}

            {/* Fila TOTAL */}
            {data.filasLocales.length > 0 && (
              <>
                <div
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 2,
                    background: 'var(--header-bg-light)',
                    color: 'var(--text-inverse)',
                    padding: '12px 12px',
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    borderTop: '1px solid var(--border)',
                    borderRight: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  Total
                </div>
                {data.anclasOperativas.map((a) => {
                  const t = data.totalPorAncla[a] || 0;
                  return (
                    <div
                      key={a}
                      className="tabular-nums-strict"
                      style={{
                        background: 'var(--header-bg-light)',
                        color: 'var(--text-inverse)',
                        padding: '12px 6px',
                        fontSize: 10.5,
                        fontWeight: 700,
                        textAlign: 'center',
                        borderTop: '1px solid var(--border)',
                        borderLeft: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      {t > 0 ? `$${Math.round(t).toLocaleString('es-AR')}` : '—'}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cronklam + MyP split 50/50 */}
      {(data.filasCronklam.length > 0 || data.filasMyP.length > 0) && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: data.filasMyP.length > 0 ? '1fr 1fr' : '1fr',
            gap: 8,
            marginTop: 4,
          }}
        >
          {data.filasCronklam.length > 0 && (
            <SplitSection
              label="Cronklam (corporativo)"
              count={data.filasCronklam.length}
              filas={data.filasCronklam}
              ancla="CRONKLAM"
              onClickCell={onClickCell}
            />
          )}
          {data.filasMyP.length > 0 && (
            <SplitSection
              label="Martín y Melanie"
              count={data.filasMyP.length}
              filas={data.filasMyP}
              ancla="MyP"
              onClickCell={onClickCell}
            />
          )}
        </div>
      )}
    </>
  );
}

function FilaTabla({
  row,
  anclas,
  bg,
  onClickCell,
}: {
  row: ServicioMesRow;
  anclas: Ancla[];
  bg: string;
  onClickCell: (row: ServicioMesRow, ancla: Ancla) => void;
}) {
  return (
    <>
      <div
        style={{
          position: 'sticky',
          left: 0,
          zIndex: 1,
          background: bg,
          padding: '12px 12px',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text)',
          borderTop: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {row.servicio}
      </div>
      {anclas.map((a) => {
        const cell = row.porAncla[a];
        return (
          <button
            key={a}
            type="button"
            onClick={() => onClickCell(row, a)}
            className="press-feedback"
            style={{
              background: bg,
              padding: '12px 6px',
              fontSize: 12,
              textAlign: 'center',
              borderTop: '1px solid var(--border)',
              borderLeft: '1px solid var(--border)',
              cursor: 'pointer',
              minHeight: 44,
              border: 0,
            }}
          >
            <CeldaTabla cell={cell} />
          </button>
        );
      })}
    </>
  );
}

function CeldaTabla({ cell }: { cell?: CeldaServicio }) {
  if (!cell || cell.estado === 'vacio') {
    return (
      <span
        style={{
          color: 'var(--accent)',
          fontWeight: 600,
          fontSize: 11,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          opacity: 0.7,
        }}
      >
        Pagar
      </span>
    );
  }
  if (cell.estado === 'no_aplica') {
    return <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>—</span>;
  }
  if (cell.estado === 'pendiente') {
    return (
      <span
        style={{
          color: '#C84F3F',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}
      >
        Pagar
      </span>
    );
  }
  // pagado
  let texto: string;
  if (cell.esUsd) {
    texto = `US$ ${Math.round(cell.monto).toLocaleString('es-AR')}`;
  } else {
    texto = `$${Math.round(cell.monto).toLocaleString('es-AR')}`;
  }
  return (
    <span
      className="tabular-nums-strict"
      style={{
        color: 'var(--green)',
        fontWeight: 600,
        fontSize: 12,
      }}
    >
      {texto}
    </span>
  );
}

function SplitSection({
  label,
  count,
  filas,
  ancla,
  onClickCell,
}: {
  label: string;
  count: number;
  filas: ServicioMesRow[];
  ancla: 'CRONKLAM' | 'MyP';
  onClickCell: (row: ServicioMesRow, ancla: Ancla) => void;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: 'var(--accent-hover)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-subtle)',
        }}
      >
        <span>· {label}</span>
        <span style={{ color: 'var(--text-muted)' }}>{count}</span>
      </div>
      <div>
        {filas.map((row, i) => {
          const cell = row.porAncla[ancla];
          return (
            <button
              key={`${row.servicio}-${i}`}
              type="button"
              onClick={() => onClickCell(row, ancla as Ancla)}
              className="press-feedback"
              style={{
                width: '100%',
                padding: '12px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: i < filas.length - 1 ? '1px solid var(--border)' : 0,
                fontSize: 13,
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>
                {row.servicio}
              </span>
              <span
                className="tabular-nums-strict"
                style={{
                  fontWeight: cell?.estado === 'pagado' ? 700 : 600,
                  color:
                    cell?.estado === 'pagado'
                      ? 'var(--green)'
                      : cell?.estado === 'pendiente'
                      ? '#C84F3F'
                      : 'var(--accent)',
                  fontSize: cell?.estado === 'pagado' ? 13 : 11,
                  textTransform: cell?.estado === 'pagado' ? 'none' : 'uppercase',
                  letterSpacing: cell?.estado === 'pagado' ? 'normal' : '0.04em',
                }}
              >
                {cell?.estado === 'pagado'
                  ? cell.esUsd
                    ? `US$ ${Math.round(cell.monto).toLocaleString('es-AR')}`
                    : `$${Math.round(cell.monto).toLocaleString('es-AR')}`
                  : cell?.estado === 'no_aplica'
                  ? '—'
                  : 'Pagar'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab: CALENDARIO con scroll-to-today ─────────────────────────

function TabCalendario({
  indice,
  mesData,
}: {
  indice: { servicios: IndiceServicio[] };
  mesData: ServicioMes | null;
}) {
  const todayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scrollear al banner HOY cuando se monta
    const t = setTimeout(() => {
      todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => clearTimeout(t);
  }, []);

  const hoy = new Date();

  // Rango: mes anterior + actual + 12 adelante. Mismo patrón staff.
  const entries = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    type Entry = {
      id: string;
      servicio: IndiceServicio;
      fecha: Date;
      periodo: string;
      pagado: boolean;
      pendiente: boolean;
    };
    const out: Entry[] = [];

    for (let i = 0; i < 14; i++) {
      const m = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1);
      const lastDay = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      const periodo = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;

      for (const s of indice.servicios) {
        const dia = parseInt(s.diaVenc, 10);
        if (isNaN(dia) || dia < 1 || dia > 31) continue;
        const diaReal = Math.min(dia, lastDay);
        const fecha = new Date(m.getFullYear(), m.getMonth(), diaReal);

        // Buscar si está pagado en mesData (solo si periodo matchea el actual)
        let pagado = false;
        let pendiente = false;
        if (mesData && mesData.periodo === periodo) {
          const fila = [
            ...mesData.filasLocales,
            ...mesData.filasCronklam,
            ...mesData.filasMyP,
          ].find(
            (r) => r.servicio.toLowerCase() === s.servicio.toLowerCase(),
          );
          if (fila) {
            const cells = Object.values(fila.porAncla);
            pagado = cells.some((c) => c.estado === 'pagado');
            pendiente = cells.some((c) => c.estado === 'pendiente') && !pagado;
          }
        }

        out.push({
          id: `${s.servicio}-${periodo}`,
          servicio: s,
          fecha,
          periodo,
          pagado,
          pendiente,
        });
      }
    }
    out.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    return out;
  }, [indice.servicios, mesData]);

  if (!indice.servicios.length) {
    return (
      <EmptyState
        title="Sin ÍNDICE"
        body="Generá el tab ÍNDICE del Sheet primero (botón al fondo)."
      />
    );
  }

  // Agrupar por mes
  const grupos = new Map<string, typeof entries>();
  for (const e of entries) {
    const k = `${e.fecha.getFullYear()}-${String(e.fecha.getMonth() + 1).padStart(2, '0')}`;
    const arr = grupos.get(k) || [];
    arr.push(e);
    grupos.set(k, arr);
  }

  const hoyKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from(grupos.entries()).map(([mkey, items]) => {
        const [y, mNum] = mkey.split('-').map((x) => parseInt(x, 10));
        const label = `${MESES[mNum - 1]} ${y}`;
        const esEsteMes = mkey === hoyKey;
        return (
          <section key={mkey}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 4px',
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: esEsteMes ? 'var(--accent-hover)' : 'var(--text-muted)',
                }}
              >
                {esEsteMes && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: 'var(--accent)',
                      marginRight: 6,
                      verticalAlign: 'middle',
                    }}
                  />
                )}
                {label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {items.length} servs
              </span>
            </div>

            {/* Banner HOY si este mes */}
            {esEsteMes && (
              <div
                ref={todayRef}
                style={{
                  background: 'var(--accent)',
                  color: '#FDFBF8',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                  boxShadow: '0 4px 16px -4px rgba(196,160,103,0.35)',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: '#FDFBF8',
                    display: 'inline-block',
                  }}
                />
                Hoy · {hoy.getDate()} de {MESES[hoy.getMonth()]} de {hoy.getFullYear()}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((e) => (
                <CalendarioCard key={e.id} entry={e} hoy={hoy} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CalendarioCard({
  entry,
  hoy,
}: {
  entry: {
    id: string;
    servicio: IndiceServicio;
    fecha: Date;
    periodo: string;
    pagado: boolean;
    pendiente: boolean;
  };
  hoy: Date;
}) {
  const dia = entry.fecha.getDate();
  const mes = MESES_ABBR[entry.fecha.getMonth()].toUpperCase();
  const esHoy =
    entry.fecha.getDate() === hoy.getDate() &&
    entry.fecha.getMonth() === hoy.getMonth() &&
    entry.fecha.getFullYear() === hoy.getFullYear();
  const esPasado = entry.fecha.getTime() < hoy.setHours(0, 0, 0, 0);
  const colors = catColors(entry.servicio.categoria);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        background: 'var(--bg-card)',
        border: `1px solid ${
          entry.pendiente ? '#C84F3F' : esHoy ? 'var(--accent)' : 'var(--border)'
        }`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        opacity: esPasado && !entry.pagado && !entry.pendiente ? 0.65 : 1,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: entry.pagado
            ? 'var(--green-bg)'
            : entry.pendiente
            ? 'rgba(217,95,78,0.10)'
            : 'var(--bg-subtle)',
          color: entry.pagado
            ? 'var(--green)'
            : entry.pendiente
            ? '#C84F3F'
            : 'var(--text)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <div
          className="tabular-nums-strict"
          style={{ fontSize: 17, fontWeight: 700, lineHeight: 1 }}
        >
          {dia}
        </div>
        <div
          style={{
            fontSize: 8.5,
            letterSpacing: '0.10em',
            marginTop: 1,
            fontWeight: 600,
          }}
        >
          {mes}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text)',
            marginBottom: 4,
          }}
        >
          {entry.servicio.servicio}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {entry.servicio.categoria && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                padding: '2px 6px',
                borderRadius: 4,
                background: colors.bg,
                color: colors.fg,
              }}
            >
              {entry.servicio.categoria}
            </span>
          )}
          {entry.servicio.notas && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {entry.servicio.notas}
            </span>
          )}
          {entry.pagado && (
            <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>
              ✓ pagado
            </span>
          )}
        </div>
      </div>
      {entry.pendiente && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#C84F3F',
          }}
        >
          Pendiente
        </span>
      )}
    </div>
  );
}

function catColors(cat: string): { bg: string; fg: string } {
  const c = (cat || '').toLowerCase();
  if (c.includes('luz')) return { bg: 'rgba(245,158,11,0.14)', fg: '#A05A00' };
  if (c.includes('agua')) return { bg: 'rgba(59,130,246,0.14)', fg: '#1E40AF' };
  if (c.includes('gas')) return { bg: 'rgba(220,38,38,0.12)', fg: '#991B1B' };
  if (c.includes('internet')) return { bg: 'rgba(124,58,237,0.12)', fg: '#5B21B6' };
  if (c.includes('iva')) return { bg: 'rgba(31,20,16,0.10)', fg: '#3E2A1F' };
  if (c.includes('alquiler')) return { bg: 'rgba(74,124,62,0.14)', fg: '#2E7D32' };
  if (c.includes('expensas')) return { bg: 'rgba(184,149,111,0.16)', fg: '#8B6D5A' };
  if (c.includes('impositivo')) return { bg: 'rgba(124,58,237,0.10)', fg: '#7C3AED' };
  if (c.includes('sistema')) return { bg: 'var(--bg-subtle)', fg: 'var(--text)' };
  return { bg: 'var(--bg-subtle)', fg: 'var(--text-muted)' };
}

// ─── Tab: LISTADO con cards expandables ───────────────────────────

function TabListado({
  indice,
  mesData,
  onAction,
}: {
  indice: { locales: IndiceLocal[]; servicios: IndiceServicio[]; tabExiste: boolean };
  mesData: ServicioMes | null;
  onAction: (m: string) => void;
}) {
  const [view, setView] = useState<'local' | 'categoria'>('local');
  const [expandedAncla, setExpandedAncla] = useState<string | null>(null);

  if (!indice.tabExiste) {
    return (
      <EmptyState
        title="Tab ÍNDICE no existe"
        body="Generá el ÍNDICE primero (botón al fondo)."
      />
    );
  }

  const pagadoArs = mesData?.totalGeneral || 0;
  const pendientesCount = mesData?.conteoPendientes || 0;
  const pagadosCount = mesData?.conteoPagados || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <KPICard
          eyebrow="Pagado este mes"
          value={`$${Math.round(pagadoArs).toLocaleString('es-AR')}`}
          sub={`${pagadosCount} pagos cargados`}
          color="var(--green)"
        />
        <KPICard
          eyebrow="Falta pagar"
          value={String(pendientesCount)}
          sub={pendientesCount === 1 ? '1 servicio' : `${pendientesCount} servicios`}
          color={pendientesCount > 0 ? '#C84F3F' : 'var(--text)'}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 4,
          padding: 4,
          background: 'var(--bg-subtle)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
        }}
      >
        {(['local', 'categoria'] as const).map((v) => {
          const sel = view === v;
          return (
            <button
              key={v}
              onClick={() => setView(v)}
              className="press-feedback"
              style={{
                minHeight: 36,
                borderRadius: 'var(--radius-sm)',
                background: sel ? 'var(--bg-card)' : 'transparent',
                color: sel ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: sel ? 600 : 500,
                fontSize: 13,
                border: 0,
                cursor: 'pointer',
                boxShadow: sel ? 'var(--shadow-card)' : 'none',
              }}
            >
              {v === 'local' ? 'Por Local' : 'Por Categoría'}
            </button>
          );
        })}
      </div>

      {view === 'local' ? (
        <ListadoPorLocal
          locales={indice.locales}
          mesData={mesData}
          expandedAncla={expandedAncla}
          onToggle={(a) => setExpandedAncla((p) => (p === a ? null : a))}
        />
      ) : (
        <ListadoPorCategoria servicios={indice.servicios} mesData={mesData} />
      )}

      <button
        type="button"
        onClick={() =>
          onAction('Editá el tab ÍNDICE del Sheet para sumar nuevos servicios o locales.')
        }
        className="press-feedback"
        style={{
          minHeight: 42,
          borderRadius: 'var(--radius-md)',
          padding: '10px 14px',
          background: 'var(--accent)',
          color: '#FDFBF8',
          fontWeight: 600,
          fontSize: 13,
          border: 0,
        }}
      >
        + Sumar servicio o local
      </button>
    </div>
  );
}

function ListadoPorLocal({
  locales,
  mesData,
  expandedAncla,
  onToggle,
}: {
  locales: IndiceLocal[];
  mesData: ServicioMes | null;
  expandedAncla: string | null;
  onToggle: (a: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {locales.map((l) => {
        const ancla = l.ancla || '—';
        // Servicios que tienen data en este local este mes
        const allRows = mesData
          ? [...mesData.filasLocales, ...mesData.filasCronklam, ...mesData.filasMyP]
          : [];
        const servicios = allRows.filter((r) => {
          const cell = r.porAncla[ancla];
          return cell && (cell.estado === 'pagado' || cell.estado === 'pendiente');
        });
        const totalLocal = servicios.reduce((s, r) => {
          const c = r.porAncla[ancla];
          if (!c || c.estado !== 'pagado' || c.esUsd) return s;
          return s + c.monto;
        }, 0);
        const expanded = expandedAncla === ancla;
        return (
          <div
            key={l.col}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-card)',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => onToggle(ancla)}
              className="press-feedback"
              aria-expanded={expanded}
              style={{
                width: '100%',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  background: 'var(--bg-subtle)',
                  color: 'var(--accent-hover)',
                  fontWeight: 700,
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  letterSpacing: '0.02em',
                  flexShrink: 0,
                }}
              >
                {l.ancla || '?'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                  {l.nombre || l.col}
                </div>
                <div
                  className="tabular-nums-strict"
                  style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}
                >
                  {servicios.length} servicios
                  {totalLocal > 0
                    ? ` · $${Math.round(totalLocal).toLocaleString('es-AR')}/mes`
                    : ''}
                </div>
              </div>
              <Chevron expanded={expanded} />
            </button>

            <div
              style={{
                display: 'grid',
                gridTemplateRows: expanded ? '1fr' : '0fr',
                transition: 'grid-template-rows 240ms var(--ease-ios)',
              }}
            >
              <div style={{ overflow: 'hidden', minHeight: 0 }}>
                {servicios.length === 0 ? (
                  <div
                    style={{
                      padding: '12px 14px',
                      borderTop: '1px solid var(--border)',
                      fontSize: 12.5,
                      color: 'var(--text-muted)',
                      textAlign: 'center',
                    }}
                  >
                    Sin movimientos este mes.
                  </div>
                ) : (
                  <div>
                    {servicios.map((r, i) => {
                      const cell = r.porAncla[ancla];
                      return (
                        <div
                          key={`${r.servicio}-${i}`}
                          style={{
                            padding: '10px 14px',
                            borderTop: '1px solid var(--border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>
                              {r.servicio}
                            </div>
                            {r.notas && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: 'var(--text-muted)',
                                  marginTop: 1,
                                }}
                              >
                                {r.notas}
                              </div>
                            )}
                          </div>
                          <span
                            className="tabular-nums-strict"
                            style={{
                              fontSize: 12.5,
                              fontWeight: cell?.estado === 'pagado' ? 700 : 600,
                              color:
                                cell?.estado === 'pagado'
                                  ? 'var(--green)'
                                  : '#C84F3F',
                              whiteSpace: 'nowrap',
                              textTransform: cell?.estado === 'pendiente' ? 'uppercase' : 'none',
                              letterSpacing: cell?.estado === 'pendiente' ? '0.04em' : 'normal',
                            }}
                          >
                            {cell?.estado === 'pagado'
                              ? cell.esUsd
                                ? `US$ ${Math.round(cell.monto).toLocaleString('es-AR')}`
                                : `$${Math.round(cell.monto).toLocaleString('es-AR')}`
                              : 'Pagar'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      style={{
        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 240ms var(--ease-ios)',
        color: 'var(--text-muted)',
        flexShrink: 0,
      }}
    >
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ListadoPorCategoria({
  servicios,
  mesData,
}: {
  servicios: IndiceServicio[];
  mesData: ServicioMes | null;
}) {
  const porCategoria = new Map<string, IndiceServicio[]>();
  for (const s of servicios) {
    const cat = s.categoria || 'Sin categoría';
    const arr = porCategoria.get(cat) || [];
    arr.push(s);
    porCategoria.set(cat, arr);
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from(porCategoria.entries()).map(([cat, arr]) => {
        const colors = catColors(cat);
        return (
          <section key={cat}>
            <div
              style={{
                display: 'inline-block',
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                background: colors.bg,
                color: colors.fg,
                marginBottom: 6,
              }}
            >
              {cat} · {arr.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {arr.map((s) => {
                // Buscar último monto pagado
                const allRows = mesData
                  ? [
                      ...mesData.filasLocales,
                      ...mesData.filasCronklam,
                      ...mesData.filasMyP,
                    ]
                  : [];
                const fila = allRows.find(
                  (r) => r.servicio.toLowerCase() === s.servicio.toLowerCase(),
                );
                const pagados = fila
                  ? Object.values(fila.porAncla).filter((c) => c.estado === 'pagado')
                  : [];
                const totalPagado = pagados.reduce(
                  (sum, c) => sum + (c.esUsd ? 0 : c.monto),
                  0,
                );
                return (
                  <div
                    key={s.servicio}
                    style={{
                      padding: '10px 12px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.servicio}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          marginTop: 1,
                        }}
                      >
                        {s.periodicidad}
                        {s.diaVenc && s.diaVenc !== '—'
                          ? ` · vence ${s.diaVenc}`
                          : ''}
                      </div>
                    </div>
                    {totalPagado > 0 && (
                      <span
                        className="tabular-nums-strict"
                        style={{
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: 'var(--green)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ${Math.round(totalPagado).toLocaleString('es-AR')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function KPICard({
  eyebrow,
  value,
  sub,
  color,
}: {
  eyebrow: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div
      style={{
        padding: 14,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginBottom: 6,
        }}
      >
        {eyebrow}
      </div>
      <div
        className="tabular-nums-strict"
        style={{
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          fontSize: 22,
          fontWeight: 700,
          color,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
        {sub}
      </div>
    </div>
  );
}

// ─── Tab: BAIGUN ──────────────────────────────────────────────────

function TabBaigun({
  mesData,
  loading,
}: {
  mesData: ServicioMes | null;
  loading: boolean;
}) {
  if (loading && !mesData) {
    return <div className="shimmer-modern" style={{ height: 200, borderRadius: 10 }} />;
  }
  if (!mesData) return null;

  const movs = [
    ...mesData.filasLocales,
    ...mesData.filasCronklam,
    ...mesData.filasMyP,
  ].filter((r) => !r.esTotal && r.baigun);

  const saldoActual = movs.reduce((s, r) => s + r.baigunMonto, 0);
  const debitos = movs.filter((m) => m.baigunMonto < 0).reduce((s, m) => s + m.baigunMonto, 0);
  const creditos = movs.filter((m) => m.baigunMonto > 0).reduce((s, m) => s + m.baigunMonto, 0);

  return (
    <>
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 18,
          boxShadow: 'var(--shadow-card)',
          borderLeft: `4px solid ${saldoActual >= 0 ? 'var(--green)' : '#C84F3F'}`,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          Saldo actual · {mesData.label}
        </div>
        <div
          className="tabular-nums-strict"
          style={{
            fontSize: 32,
            fontWeight: 700,
            lineHeight: 1,
            color: saldoActual >= 0 ? 'var(--green)' : '#C84F3F',
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          }}
        >
          {saldoActual < 0 ? '−' : ''}${Math.abs(Math.round(saldoActual)).toLocaleString('es-AR')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          {saldoActual > 0
            ? 'a favor de Lharmonie'
            : saldoActual < 0
            ? 'a favor de Baigun'
            : 'sin saldo'}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 14,
            marginTop: 12,
            fontSize: 11.5,
            color: 'var(--text-muted)',
          }}
        >
          <span>
            Débitos{' '}
            <strong className="tabular-nums-strict" style={{ color: 'var(--text)' }}>
              ${Math.abs(Math.round(debitos)).toLocaleString('es-AR')}
            </strong>
          </span>
          <span>·</span>
          <span>
            Créditos{' '}
            <strong className="tabular-nums-strict" style={{ color: 'var(--text)' }}>
              ${Math.round(creditos).toLocaleString('es-AR')}
            </strong>
          </span>
        </div>
      </div>

      {movs.length === 0 ? (
        <EmptyState
          title="Sin movimientos Baigun"
          body="La columna BAIGUN está vacía este mes."
        />
      ) : (
        <>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              padding: '0 4px',
              marginTop: 4,
            }}
          >
            Movimientos · {movs.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {movs.map((m, i) => (
              <div
                key={`${m.servicio}-${i}`}
                style={{
                  padding: '12px 14px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0 }}>
                    {m.servicio} · {mesData.periodo}
                  </div>
                  <div
                    className="tabular-nums-strict"
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: m.baigunMonto < 0 ? '#C84F3F' : 'var(--green)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m.baigunMonto >= 0 ? '+' : ''}
                    ${Math.abs(Math.round(m.baigunMonto)).toLocaleString('es-AR')}
                  </div>
                </div>
                {m.notas && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {m.notas}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ─── Modal: Registrar pago (click celda) ─────────────────────────

function RegistrarPagoModal({
  row,
  ancla,
  periodo,
  periodoLabel,
  onClose,
  onSaved,
  onError,
}: {
  row: ServicioMesRow;
  ancla: Ancla;
  periodo: string;
  periodoLabel: string;
  onClose: () => void;
  onSaved: (msg: string) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const cell = row.porAncla[ancla];
  const yaPagado = cell?.estado === 'pagado';
  const noAplica = cell?.estado === 'no_aplica';
  const localCol = ANCLA_TO_LOCAL_COL[ancla];

  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>(cell?.esUsd ? 'USD' : 'ARS');
  const [saving, setSaving] = useState(false);
  const [confirmForzar, setConfirmForzar] = useState(false);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const submit = useCallback(
    async (forzar: boolean) => {
      if (saving) return;
      const m = parseFloat(monto.replace(/\./g, '').replace(',', '.'));
      if (!m || isNaN(m) || m <= 0) {
        onError('Monto inválido');
        return;
      }
      setSaving(true);
      try {
        const valor =
          moneda === 'USD'
            ? `${Math.round(m).toLocaleString('es-AR')} USD`
            : `$${Math.round(m).toLocaleString('es-AR')}`;
        const r = await fetch('/api/servicios/celda', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            periodo,
            servicioRaw: row.servicioRaw,
            localCol,
            valor,
            forzar,
          }),
        });
        const d = await r.json();
        if (d.ok) {
          onSaved('Pago registrado');
        } else if (r.status === 409 && !forzar) {
          setConfirmForzar(true);
        } else {
          onError(d.error || 'Error guardando');
        }
      } catch {
        onError('Error de red');
      } finally {
        setSaving(false);
      }
    },
    [saving, monto, moneda, periodo, row.servicioRaw, localCol, onError, onSaved],
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(13,8,5,0.50)',
        backdropFilter: 'blur(4px)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'var(--bg-card)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: 20,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 -8px 32px -8px rgba(0,0,0,0.30)',
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 999,
            background: 'var(--border)',
            margin: '0 auto 16px',
          }}
        />

        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--accent-hover)',
            marginBottom: 6,
          }}
        >
          · {ANCLA_SHORT_LABEL[ancla]} · {periodoLabel}
        </div>
        <h2
          style={{
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--text)',
            margin: 0,
            marginBottom: 12,
          }}
        >
          {row.servicio}
        </h2>

        {noAplica && (
          <div
            style={{
              background: 'rgba(217,95,78,0.08)',
              border: '1px solid rgba(217,95,78,0.25)',
              borderRadius: 'var(--radius-md)',
              padding: 12,
              fontSize: 12.5,
              color: '#C84F3F',
              marginBottom: 12,
            }}
          >
            La celda dice <strong>NO</strong> (ese local no tiene este servicio). Si querés
            cambiar eso, editá el Sheet a mano.
          </div>
        )}

        {yaPagado && !confirmForzar && (
          <div
            style={{
              background: 'var(--green-bg)',
              border: '1px solid var(--green)',
              borderRadius: 'var(--radius-md)',
              padding: 12,
              fontSize: 12.5,
              color: 'var(--green)',
              marginBottom: 12,
            }}
          >
            <strong>✓ Ya está pagada</strong>: <span className="tabular-nums-strict">{cell?.raw}</span>.<br />
            Solo cargá un monto si querés sobrescribir (te va a pedir confirmación).
          </div>
        )}

        {confirmForzar && (
          <div
            style={{
              background: 'rgba(217,95,78,0.10)',
              border: '1px solid #C84F3F',
              borderRadius: 'var(--radius-md)',
              padding: 12,
              fontSize: 12.5,
              color: '#C84F3F',
              marginBottom: 12,
            }}
          >
            ⚠ La celda ya tiene un valor cargado. ¿Sobrescribir? Esta acción no se puede deshacer.
          </div>
        )}

        {!noAplica && (
          <>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Monto
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['ARS', 'USD'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMoneda(m)}
                    style={{
                      padding: '0 12px',
                      height: 44,
                      borderRadius: 'var(--radius-md)',
                      background: moneda === m ? 'var(--text)' : 'var(--bg-subtle)',
                      color: moneda === m ? 'var(--bg-card)' : 'var(--text-muted)',
                      border: '1px solid var(--border)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {m === 'ARS' ? '$' : 'US$'}
                  </button>
                ))}
              </div>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0"
                className="tabular-nums-strict"
                style={{
                  flex: 1,
                  height: 44,
                  padding: '0 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text)',
                  fontSize: 16,
                  fontWeight: 600,
                  outline: 'none',
                  textAlign: 'right',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-subtle)',
                  color: 'var(--text)',
                  fontWeight: 600,
                  fontSize: 13.5,
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => submit(confirmForzar)}
                disabled={saving}
                style={{
                  flex: 2,
                  height: 44,
                  borderRadius: 'var(--radius-md)',
                  background: confirmForzar ? '#C84F3F' : 'var(--accent)',
                  color: '#FDFBF8',
                  fontWeight: 700,
                  fontSize: 13.5,
                  border: 0,
                  cursor: 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving
                  ? 'Guardando…'
                  : confirmForzar
                  ? 'Sí, sobrescribir'
                  : 'Guardar pago'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Helpers UI ───────────────────────────────────────────────────

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        padding: 24,
        background: 'var(--bg-card)',
        border: '1px dashed var(--border)',
        borderRadius: 'var(--radius-md)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>{body}</div>
    </div>
  );
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: 12,
        background: 'rgba(217,95,78,0.10)',
        border: '1px solid rgba(217,95,78,0.25)',
        borderRadius: 'var(--radius-md)',
        color: '#C84F3F',
        fontSize: 12.5,
        lineHeight: 1.5,
      }}
    >
      <strong style={{ fontSize: 13 }}>Error</strong>
      <div style={{ marginTop: 2 }}>{text}</div>
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(var(--nav-height) + var(--safe-bottom) + 16px)',
        transform: 'translateX(-50%)',
        background: 'var(--text)',
        color: 'var(--bg-card)',
        padding: '10px 16px',
        borderRadius: 'var(--radius-md)',
        fontSize: 13,
        fontWeight: 500,
        boxShadow: 'var(--shadow-lg)',
        zIndex: 100,
        maxWidth: '90vw',
      }}
    >
      {message}
    </div>
  );
}

function SeedIndiceButton({ onDone }: { onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/servicios/seed-indice', { method: 'POST' });
      const d = await r.json();
      if (d.ok) onDone('Tab ÍNDICE regenerado en el Sheet — recargá la página');
      else onDone(d.error || 'Error generando ÍNDICE');
    } catch {
      onDone('Error de red');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }, [onDone]);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="press-feedback"
        style={{
          marginTop: 24,
          minHeight: 36,
          borderRadius: 'var(--radius-md)',
          padding: '6px 12px',
          background: 'transparent',
          color: 'var(--text-muted)',
          fontWeight: 500,
          fontSize: 11.5,
          border: '1px dashed var(--border)',
        }}
      >
        Regenerar tab ÍNDICE en el Sheet
      </button>
    );
  }
  return (
    <div
      style={{
        marginTop: 24,
        background: 'var(--bg-card)',
        border: '1px solid #C4A067',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600 }}>Regenerar ÍNDICE</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Borra y recrea el tab <strong>ÍNDICE</strong> del Sheet. Las ediciones
        manuales se pierden.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          style={{
            flex: 1, height: 36, borderRadius: 'var(--radius-md)',
            background: 'var(--bg-subtle)', color: 'var(--text)',
            fontWeight: 500, fontSize: 13,
            border: '1px solid var(--border)',
          }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          style={{
            flex: 2, height: 36, borderRadius: 'var(--radius-md)',
            background: 'var(--accent)', color: '#FDFBF8',
            fontWeight: 600, fontSize: 13, border: 0,
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Generando…' : 'Sí, regenerar'}
        </button>
      </div>
    </div>
  );
}
