'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import type {
  ServicioMes,
  ServicioMesRow,
  ParsedPeriodo,
  CeldaServicio,
} from '@/lib/servicios-mes';
import { ANCLAS_OPERATIVAS, ANCLA_SHORT_LABEL } from '@/lib/servicios-mes';
import type { Ancla } from '@/lib/anclas';
import type {
  IndiceLocal,
  IndiceServicio,
} from '../api/servicios/indice/route';

// /servicios — 4 tabs portados del staff app:
//   Tabla     → pivot servicios × locales, dark espresso
//   Calendario→ servicios por día de vencimiento (lee ÍNDICE)
//   Listado   → KPIs + Por Local / Por Categoría
//   Baigun    → cta cte del subarriendo Libertador

type TabId = 'tabla' | 'calendario' | 'listado' | 'baigun';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'tabla', label: 'Tabla' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'listado', label: 'Listado' },
  { id: 'baigun', label: 'Baigun' },
];

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

  useEffect(() => {
    if (!periodo) return;
    setMesLoading(true);
    setMesError(null);
    fetch(`/api/servicios/mes?periodo=${periodo}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setMesData(d.data);
        else setMesError(d.error || 'Error cargando mes');
      })
      .catch(() => setMesError('Error de red'))
      .finally(() => setMesLoading(false));
  }, [periodo]);

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
          <TabTabla data={mesData} loading={mesLoading} />
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
      className="hide-scrollbar"
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
              boxShadow: active
                ? '0 2px 8px -2px rgba(184,149,111,0.35)'
                : 'none',
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
  // "Mayo 2026" → "Mayo 26"
  return label.replace(/\s(\d{2})(\d{2})$/, ' $2');
}

// ─── Tab: TABLA (espresso dark, pivot, CRONKLAM/MyP split) ───────

function TabTabla({
  data,
  loading,
}: {
  data: ServicioMes | null;
  loading: boolean;
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
      <ResumenMes data={data} />

      <div
        style={{
          fontSize: 11.5,
          color: 'var(--text-muted)',
          padding: '0 4px',
          lineHeight: 1.4,
        }}
      >
        <span style={{ color: '#2D7A4F', fontWeight: 600 }}>Verde</span> = pagado este mes ·{' '}
        <span style={{ color: '#C84F3F', fontWeight: 600 }}>Pagar</span> = pendiente ·{' '}
        <span style={{ color: 'var(--text-faint)' }}>—</span> = no aplica
      </div>

      {/* Tabla espresso oscuro */}
      <div
        style={{
          background: '#0D0805',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          boxShadow: '0 4px 24px -8px rgba(0,0,0,0.30)',
        }}
      >
        <div
          style={{
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
              minWidth: 600,
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    ...thDark,
                    position: 'sticky',
                    left: 0,
                    background: '#0D0805',
                    textAlign: 'left',
                    minWidth: 140,
                    zIndex: 2,
                  }}
                >
                  Servicio
                </th>
                {data.anclasOperativas.map((a) => (
                  <th key={a} style={thDark}>
                    {ANCLA_SHORT_LABEL[a]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.filasLocales.map((row, i) => (
                <FilaTabla
                  key={`${row.servicio}-${i}`}
                  row={row}
                  anclas={data.anclasOperativas}
                  zebra={i % 2 === 1}
                />
              ))}
              {/* TOTAL */}
              {data.filasLocales.length > 0 && (
                <tr style={{ background: 'rgba(196,160,103,0.15)' }}>
                  <td
                    style={{
                      ...tdDark,
                      position: 'sticky',
                      left: 0,
                      background: '#1E1512',
                      fontWeight: 800,
                      letterSpacing: '0.10em',
                      textTransform: 'uppercase',
                      fontSize: 11,
                      zIndex: 1,
                    }}
                  >
                    TOTAL
                  </td>
                  {data.anclasOperativas.map((a) => {
                    const t = data.totalPorAncla[a] || 0;
                    return (
                      <td
                        key={a}
                        style={{
                          ...tdDark,
                          fontWeight: 700,
                          color: '#F9F7F3',
                          fontSize: 11.5,
                        }}
                      >
                        {t > 0
                          ? `$${Math.round(t).toLocaleString('es-AR')}`
                          : '—'}
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CRONKLAM + MyP split */}
      {(data.filasCronklam.length > 0 || data.filasMyP.length > 0) && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: data.filasMyP.length > 0 ? '1fr 1fr' : '1fr',
            gap: 8,
            marginTop: 8,
          }}
        >
          {data.filasCronklam.length > 0 && (
            <SplitSection
              label="Cronklam (corporativo)"
              count={data.filasCronklam.length}
              filas={data.filasCronklam}
              ancla="CRONKLAM"
            />
          )}
          {data.filasMyP.length > 0 && (
            <SplitSection
              label="Martín y Melanie"
              count={data.filasMyP.length}
              filas={data.filasMyP}
              ancla="MyP"
            />
          )}
        </div>
      )}
    </>
  );
}

const thDark: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  color: 'rgba(249,247,243,0.55)',
  textAlign: 'right',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const tdDark: React.CSSProperties = {
  padding: '11px 8px',
  fontSize: 12,
  textAlign: 'right',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  color: '#F9F7F3',
};

function FilaTabla({
  row,
  anclas,
  zebra,
}: {
  row: ServicioMesRow;
  anclas: Ancla[];
  zebra: boolean;
}) {
  const bg = zebra ? 'rgba(196,160,103,0.03)' : 'transparent';
  return (
    <tr style={{ background: bg }}>
      <td
        style={{
          ...tdDark,
          position: 'sticky',
          left: 0,
          background: zebra ? '#110A07' : '#0D0805',
          textAlign: 'left',
          fontWeight: 500,
          color: '#F9F7F3',
          minWidth: 140,
        }}
      >
        {row.servicio}
      </td>
      {anclas.map((a) => {
        const cell = row.porAncla[a];
        return (
          <td key={a} style={tdDark}>
            <CeldaTabla cell={cell} />
          </td>
        );
      })}
    </tr>
  );
}

function CeldaTabla({ cell }: { cell?: CeldaServicio }) {
  if (!cell || cell.estado === 'no_aplica' || cell.estado === 'vacio') {
    return <span style={{ color: 'rgba(249,247,243,0.20)' }}>—</span>;
  }
  if (cell.estado === 'pendiente') {
    return (
      <span
        style={{
          color: '#FCA17D',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}
      >
        Pagar
      </span>
    );
  }
  // pagado
  let texto = cell.raw;
  if (cell.esUsd) {
    // ej "1400 USD" o "USD 800" → "US$ 1.400"
    texto = `US$ ${Math.round(cell.monto).toLocaleString('es-AR')}`;
  } else {
    texto = `$${Math.round(cell.monto).toLocaleString('es-AR')}`;
  }
  return (
    <span
      style={{
        color: '#86C29A',
        fontWeight: 600,
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
}: {
  label: string;
  count: number;
  filas: ServicioMesRow[];
  ancla: 'CRONKLAM' | 'MyP';
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
        }}
      >
        <span>· {label}</span>
        <span style={{ color: 'var(--text-muted)' }}>{count}</span>
      </div>
      <div>
        {filas.map((row, i) => {
          const cell = row.porAncla[ancla];
          return (
            <div
              key={`${row.servicio}-${i}`}
              style={{
                padding: '10px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: i < filas.length - 1 ? '1px solid var(--border)' : 0,
                fontSize: 13,
              }}
            >
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>
                {row.servicio}
              </span>
              <span
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: cell?.estado === 'pagado' ? 700 : 500,
                  color:
                    cell?.estado === 'pagado'
                      ? '#2D7A4F'
                      : cell?.estado === 'pendiente'
                      ? '#C84F3F'
                      : 'var(--text-muted)',
                  fontSize: cell?.estado === 'pagado' ? 13 : 12,
                  textTransform: cell?.estado === 'pendiente' ? 'uppercase' : 'none',
                  letterSpacing: cell?.estado === 'pendiente' ? '0.02em' : 'normal',
                }}
              >
                {cell?.estado === 'pagado'
                  ? cell.esUsd
                    ? `US$ ${Math.round(cell.monto).toLocaleString('es-AR')}`
                    : `$${Math.round(cell.monto).toLocaleString('es-AR')}`
                  : cell?.estado === 'pendiente'
                  ? 'Pagar'
                  : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResumenMes({ data }: { data: ServicioMes }) {
  const totalServs =
    data.filasLocales.length + data.filasCronklam.length + data.filasMyP.length;
  return (
    <section
      className="lh-hero-total spring-in"
      style={{ padding: '18px 20px' }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: '#C4A067',
          fontWeight: 600,
          marginBottom: 6,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 6, height: 6, borderRadius: 999,
              background: '#86C29A', display: 'inline-block',
            }}
          />
          Operativo
        </span>
        <span style={{ opacity: 0.6 }}>·</span>
        <span>{totalServs} servicios</span>
      </div>
      <div
        className="font-brand heading-tight-lg tabular-nums-strict"
        style={{
          fontSize: 30,
          fontWeight: 700,
          lineHeight: 1,
          color: '#F9F7F3',
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
        }}
      >
        $ {Math.round(data.totalGeneral).toLocaleString('es-AR')}
      </div>
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          gap: 14,
          color: 'rgba(249,247,243,0.72)',
          fontSize: 12,
        }}
      >
        <span>{data.conteoPagados} pagados</span>
        {data.conteoPendientes > 0 && (
          <span style={{ color: '#FCA17D', fontWeight: 600 }}>
            {data.conteoPendientes} pendientes
          </span>
        )}
      </div>
    </section>
  );
}

// ─── Tab: CALENDARIO ─────────────────────────────────────────────

function TabCalendario({
  indice,
  mesData,
}: {
  indice: { servicios: IndiceServicio[] };
  mesData: ServicioMes | null;
}) {
  const conVenc = indice.servicios
    .map((s) => ({ ...s, diaNum: parseInt(s.diaVenc, 10) }))
    .filter((s) => !isNaN(s.diaNum) && s.diaNum > 0 && s.diaNum <= 31)
    .sort((a, b) => a.diaNum - b.diaNum);

  const hoy = new Date();
  const hoyLabel = hoy.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).toUpperCase();

  if (!indice.servicios.length) {
    return (
      <EmptyState
        title="Sin ÍNDICE"
        body="Generá el tab ÍNDICE del Sheet primero (botón al fondo)."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Banner HOY */}
      <div
        style={{
          background: 'var(--accent)',
          color: '#FDFBF8',
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{
            width: 8, height: 8, borderRadius: 999,
            background: '#FDFBF8', display: 'inline-block',
          }}
        />
        Hoy · {hoyLabel}
      </div>

      {conVenc.length === 0 && (
        <div
          style={{
            padding: 16,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-muted)',
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          No hay servicios con día de vencimiento en el ÍNDICE.
          <br />
          <span style={{ fontSize: 11.5 }}>
            Editá el tab ÍNDICE → columna "Día venc".
          </span>
        </div>
      )}

      {conVenc.map((s) => {
        const filaMes = mesData?.filasLocales.find(
          (r) => r.servicio.toLowerCase() === s.servicio.toLowerCase(),
        ) || mesData?.filasCronklam.find(
          (r) => r.servicio.toLowerCase() === s.servicio.toLowerCase(),
        );
        const tienePend = filaMes
          ? Object.values(filaMes.porAncla).some((c) => c.estado === 'pendiente')
          : false;
        const tienePag = filaMes
          ? Object.values(filaMes.porAncla).some((c) => c.estado === 'pagado')
          : false;
        const colors = catColors(s.categoria);
        return (
          <div
            key={s.servicio}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              background: 'var(--bg-card)',
              border: `1px solid ${tienePend ? '#C84F3F' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: tienePend ? '#FFF2EE' : 'var(--bg-subtle)',
                color: tienePend ? '#C84F3F' : 'var(--text)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>
                {s.diaVenc}
              </div>
              <div
                style={{
                  fontSize: 8.5,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginTop: 1,
                  fontWeight: 600,
                }}
              >
                {MESES_CORTOS[hoy.getMonth()]}
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
                {s.servicio}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                {s.categoria && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: colors.bg,
                      color: colors.fg,
                    }}
                  >
                    {s.categoria}
                  </span>
                )}
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                  }}
                >
                  {s.periodicidad === 'mensual' ? 'manual' : s.periodicidad}
                </span>
                {tienePag && !tienePend && (
                  <span style={{ fontSize: 11, color: '#2D7A4F', fontWeight: 600 }}>
                    ✓ pagado
                  </span>
                )}
              </div>
            </div>
            {tienePend && (
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
      })}
    </div>
  );
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function catColors(cat: string): { bg: string; fg: string } {
  const c = (cat || '').toLowerCase();
  if (c.includes('impositivo')) return { bg: 'rgba(124,58,237,0.10)', fg: '#7C3AED' };
  if (c.includes('expensas')) return { bg: 'rgba(184,149,111,0.15)', fg: '#8B6F47' };
  if (c.includes('iva')) return { bg: 'rgba(217,95,78,0.10)', fg: '#C84F3F' };
  if (c.includes('agua')) return { bg: 'rgba(21,101,192,0.10)', fg: '#1565C0' };
  if (c.includes('gas')) return { bg: 'rgba(217,95,78,0.10)', fg: '#C84F3F' };
  if (c.includes('luz')) return { bg: 'rgba(217,165,31,0.12)', fg: '#B7791F' };
  if (c.includes('internet')) return { bg: 'rgba(124,58,237,0.10)', fg: '#7C3AED' };
  if (c.includes('alquiler')) return { bg: 'rgba(78,52,46,0.10)', fg: '#4E342E' };
  if (c.includes('sistema')) return { bg: 'var(--bg-subtle)', fg: 'var(--text)' };
  return { bg: 'var(--bg-subtle)', fg: 'var(--text-muted)' };
}

// ─── Tab: LISTADO (KPIs + Por Local / Por Categoría) ─────────────

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

  if (!indice.tabExiste) {
    return (
      <EmptyState
        title="Tab ÍNDICE no existe"
        body="Generá el ÍNDICE primero (botón al fondo)."
      />
    );
  }

  // KPIs
  const pagadoArs = mesData?.totalGeneral || 0;
  const pagadosCount = mesData?.conteoPagados || 0;
  const pendientesCount = mesData?.conteoPendientes || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPI cards 2x2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <KPICard
          eyebrow="Pagado · este mes"
          value={`$${Math.round(pagadoArs).toLocaleString('es-AR')}`}
          sub={`${pagadosCount} celdas pagadas`}
          color="#2D7A4F"
        />
        <KPICard
          eyebrow="Falta pagar"
          value={String(pendientesCount)}
          sub={pendientesCount === 1 ? '1 servicio' : `${pendientesCount} servicios`}
          color={pendientesCount > 0 ? '#C84F3F' : 'var(--text)'}
        />
      </div>

      {/* Toggle Por Local | Por Categoría */}
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
        <ListadoPorLocal locales={indice.locales} mesData={mesData} />
      ) : (
        <ListadoPorCategoria servicios={indice.servicios} />
      )}

      <button
        type="button"
        onClick={() =>
          onAction(
            'Editá el tab ÍNDICE del Sheet para sumar nuevos servicios o locales.',
          )
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

function ListadoPorLocal({
  locales,
  mesData,
}: {
  locales: IndiceLocal[];
  mesData: ServicioMes | null;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {locales.map((l) => {
        const totalLocal = mesData
          ? Object.values(mesData.totalPorAncla).reduce((s, v) => {
              // sum del local específico — buscamos por ancla
              return s;
            }, 0)
          : 0;
        const ancla = l.ancla || '—';
        const totalAncla = mesData?.totalPorAncla[ancla] || 0;
        const servCount = mesData
          ? mesData.filasLocales.filter((r) =>
              r.porAncla[ancla] &&
              (r.porAncla[ancla].estado === 'pagado' ||
                r.porAncla[ancla].estado === 'pendiente'),
            ).length
          : 0;
        return (
          <div
            key={l.col}
            style={{
              padding: '12px 14px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 44, height: 44,
                borderRadius: 999,
                background: 'var(--bg-subtle)',
                color: 'var(--accent-hover)',
                fontWeight: 700, fontSize: 11,
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
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                {servCount > 0
                  ? `${servCount} servicios · $${Math.round(totalAncla).toLocaleString('es-AR')}/mes`
                  : 'sin movimiento este mes'}
              </div>
            </div>
            <span style={{ color: 'var(--text-faint)', fontSize: 18 }}>›</span>
          </div>
        );
      })}
    </div>
  );
}

function ListadoPorCategoria({ servicios }: { servicios: IndiceServicio[] }) {
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
              {arr.map((s) => (
                <div
                  key={s.servicio}
                  style={{
                    padding: '10px 12px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.servicio}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {s.periodicidad}
                    {s.diaVenc && s.diaVenc !== '—' ? ` · vence ${s.diaVenc}` : ''}
                    {s.notas ? ` · ${s.notas}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
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
    return (
      <div className="shimmer-modern" style={{ height: 200, borderRadius: 10 }} />
    );
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
          borderLeft: `4px solid ${saldoActual >= 0 ? '#2D7A4F' : '#C84F3F'}`,
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
            color: saldoActual >= 0 ? '#2D7A4F' : '#C84F3F',
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          }}
        >
          {saldoActual < 0 ? '−' : ''}${Math.abs(Math.round(saldoActual)).toLocaleString('es-AR')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          {saldoActual > 0 ? 'a favor de Lharmonie' : saldoActual < 0 ? 'a favor de Baigun' : 'sin saldo'}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 12,
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
                      color: m.baigunMonto < 0 ? '#C84F3F' : '#2D7A4F',
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

// ─── Helpers UI compartidos ───────────────────────────────────────

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
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
        {title}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>
        {body}
      </div>
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
