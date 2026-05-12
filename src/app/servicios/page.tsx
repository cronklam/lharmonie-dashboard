'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import EyebrowTag from '../components/EyebrowTag';
import type {
  ServicioMes,
  ServicioMesRow,
  ParsedPeriodo,
  CellEstado,
} from '@/lib/servicios-mes';
import type {
  IndiceLocal,
  IndiceServicio,
} from '../api/servicios/indice/route';

// /servicios — pantalla principal con 4 tabs:
//   Tabla     → vista pivot del mes seleccionado (servicios × locales)
//   Calendario→ servicios por día de vencimiento (lee ÍNDICE)
//   Listado   → lista plana del catálogo (lee ÍNDICE)
//   Baigun    → saldo cta cte del subarriendo Libertador (col J)

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

  // Lista de meses disponibles en el Sheet
  const [meses, setMeses] = useState<ParsedPeriodo[]>([]);
  const [periodo, setPeriodo] = useState<string>('');

  // Data del mes seleccionado
  const [mesData, setMesData] = useState<ServicioMes | null>(null);
  const [mesError, setMesError] = useState<string | null>(null);
  const [mesLoading, setMesLoading] = useState(false);

  // ÍNDICE catalog
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

  // 1) Cargar meses disponibles al iniciar
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
          // Default: mes más reciente
          setPeriodo(d.meses[0].periodo);
        } else {
          setMesError(d.error || 'No se encontraron meses en el Sheet');
        }
      })
      .catch(() => setMesError('Error de red leyendo meses'));
  }, [loading, user, isOwner, router]);

  // 2) Cargar data del mes cuando cambia
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

  // 3) Cargar ÍNDICE
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

  const periodoActual = meses.find((m) => m.periodo === periodo);

  return (
    <div className="page-enter">
      <PageHeader
        title="Servicios"
        subtitle={periodoActual ? periodoActual.label : 'Cargando…'}
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
        {/* Tab nav */}
        <TabNav active={tab} onChange={setTab} />

        {/* Period selector — siempre visible */}
        {meses.length > 0 && (
          <PeriodoSelector
            meses={meses}
            value={periodo}
            onChange={setPeriodo}
          />
        )}

        {mesError && tab !== 'listado' && (
          <ErrorBanner text={mesError} />
        )}

        {/* Tab content */}
        {tab === 'tabla' && (
          <TabTabla data={mesData} loading={mesLoading} indice={indice} />
        )}
        {tab === 'calendario' && (
          <TabCalendario
            indice={indice}
            mesData={mesData}
            periodo={periodoActual}
          />
        )}
        {tab === 'listado' && (
          <TabListado indice={indice} onAction={flashToast} />
        )}
        {tab === 'baigun' && (
          <TabBaigun mesData={mesData} loading={mesLoading} />
        )}

        {/* Mantenimiento — siempre al fondo, owner only */}
        <SeedIndiceButton onDone={flashToast} />
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}

// ─── Tab nav ──────────────────────────────────────────────────────

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
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 4,
        padding: 4,
        background: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
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
              minHeight: 38,
              borderRadius: 'var(--radius-sm)',
              background: sel ? 'var(--bg-card)' : 'transparent',
              color: sel ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: sel ? 600 : 500,
              fontSize: 13,
              border: 0,
              cursor: 'pointer',
              boxShadow: sel ? 'var(--shadow-card)' : 'none',
              transition: 'all 180ms var(--ease-ios)',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Period selector ──────────────────────────────────────────────

function PeriodoSelector({
  meses,
  value,
  onChange,
}: {
  meses: ParsedPeriodo[];
  value: string;
  onChange: (p: string) => void;
}) {
  const idx = meses.findIndex((m) => m.periodo === value);
  const prev = idx >= 0 && idx < meses.length - 1 ? meses[idx + 1] : null;
  const next = idx > 0 ? meses[idx - 1] : null;
  const curr = idx >= 0 ? meses[idx] : null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr 40px',
        alignItems: 'center',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 4,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <button
        type="button"
        onClick={() => prev && onChange(prev.periodo)}
        disabled={!prev}
        className="press-feedback"
        aria-label="Mes anterior"
        style={{
          height: 36,
          borderRadius: 'var(--radius-sm)',
          background: 'transparent',
          border: 0,
          cursor: prev ? 'pointer' : 'default',
          color: prev ? 'var(--text)' : 'var(--text-faint)',
          fontSize: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ‹
      </button>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text)',
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          }}
        >
          {curr?.label || '—'}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
          {curr?.tab || ''}
        </div>
      </div>
      <button
        type="button"
        onClick={() => next && onChange(next.periodo)}
        disabled={!next}
        className="press-feedback"
        aria-label="Mes siguiente"
        style={{
          height: 36,
          borderRadius: 'var(--radius-sm)',
          background: 'transparent',
          border: 0,
          cursor: next ? 'pointer' : 'default',
          color: next ? 'var(--text)' : 'var(--text-faint)',
          fontSize: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ›
      </button>
    </div>
  );
}

// ─── Tab: Tabla (vista pivot) ─────────────────────────────────────

function TabTabla({
  data,
  loading,
  indice,
}: {
  data: ServicioMes | null;
  loading: boolean;
  indice: { locales: IndiceLocal[]; servicios: IndiceServicio[] };
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

  const dataRows = data.rows.filter((r) => !r.esTotal);

  // Resumen arriba
  return (
    <>
      <ResumenMes data={data} />

      {/* Tabla scroll horizontal */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ background: 'var(--bg-subtle)' }}>
                <th
                  style={{
                    ...thStyle,
                    position: 'sticky',
                    left: 0,
                    background: 'var(--bg-subtle)',
                    zIndex: 2,
                    minWidth: 150,
                    textAlign: 'left',
                  }}
                >
                  Servicio
                </th>
                {data.locales.map((loc) => (
                  <th key={loc} style={thStyle}>
                    {abreviarLocal(loc)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, i) => (
                <tr
                  key={`${row.servicio}-${i}`}
                  style={{
                    background: i % 2 === 1 ? 'rgba(196,160,103,0.04)' : 'transparent',
                  }}
                >
                  <td
                    style={{
                      ...tdStyle,
                      position: 'sticky',
                      left: 0,
                      background: i % 2 === 1 ? '#faf6ef' : 'var(--bg-card)',
                      zIndex: 1,
                      minWidth: 150,
                      fontWeight: 500,
                      color: 'var(--text)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span>{titleCase(row.servicio)}</span>
                      <CategoriaChip
                        servicio={row.servicio}
                        indice={indice}
                      />
                    </div>
                  </td>
                  {data.locales.map((loc) => {
                    const cell = row.porLocal[loc];
                    return (
                      <td key={loc} style={tdStyle}>
                        <Celda cell={cell} />
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr style={{ background: 'var(--bg-subtle)', fontWeight: 700 }}>
                <td
                  style={{
                    ...tdStyle,
                    position: 'sticky',
                    left: 0,
                    background: 'var(--bg-subtle)',
                    zIndex: 1,
                    fontSize: 12,
                  }}
                >
                  TOTAL
                </td>
                {data.locales.map((loc) => (
                  <td
                    key={loc}
                    style={{
                      ...tdStyle,
                      fontSize: 11.5,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {data.totalPorLocal[loc]
                      ? `$ ${Math.round(data.totalPorLocal[loc]).toLocaleString('es-AR')}`
                      : '—'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  textAlign: 'right',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: 11.5,
  color: 'var(--text)',
  textAlign: 'right',
  whiteSpace: 'nowrap',
  fontFamily: "'JetBrains Mono', monospace",
  fontVariantNumeric: 'tabular-nums',
};

function Celda({ cell }: { cell?: { raw: string; monto: number; estado: CellEstado } }) {
  if (!cell) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
  if (cell.estado === 'no_aplica') {
    return <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>no</span>;
  }
  if (cell.estado === 'pendiente') {
    return (
      <span
        style={{
          color: '#C84F3F',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}
      >
        pendiente
      </span>
    );
  }
  if (cell.estado === 'pagado') {
    return (
      <span style={{ color: 'var(--text)' }}>
        {cell.raw.includes('USD')
          ? cell.raw.replace(/\s+/g, ' ').trim()
          : `$ ${Math.round(cell.monto).toLocaleString('es-AR')}`}
      </span>
    );
  }
  return <span style={{ color: 'var(--text-faint)' }}>·</span>;
}

function ResumenMes({ data }: { data: ServicioMes }) {
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
        }}
      >
        Total pagado · {data.label}
      </div>
      <div
        className="font-brand heading-tight-lg tabular-nums-strict"
        style={{
          fontSize: 32,
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
          gap: 16,
          color: 'rgba(249,247,243,0.72)',
          fontSize: 12.5,
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

function CategoriaChip({
  servicio,
  indice,
}: {
  servicio: string;
  indice: { servicios: IndiceServicio[] };
}) {
  const it = indice.servicios.find(
    (s) => s.servicio.toUpperCase() === servicio.toUpperCase(),
  );
  if (!it || !it.categoria || it.categoria === '—') return null;
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}
    >
      {it.categoria}
    </span>
  );
}

// ─── Tab: Calendario ──────────────────────────────────────────────

function TabCalendario({
  indice,
  mesData,
  periodo,
}: {
  indice: { servicios: IndiceServicio[] };
  mesData: ServicioMes | null;
  periodo: ParsedPeriodo | undefined;
}) {
  const conVenc = indice.servicios
    .map((s) => ({ ...s, diaNum: parseInt(s.diaVenc, 10) }))
    .filter((s) => !isNaN(s.diaNum) && s.diaNum > 0 && s.diaNum <= 31)
    .sort((a, b) => a.diaNum - b.diaNum);

  if (conVenc.length === 0 && !indice.servicios.length) {
    return (
      <EmptyState
        title="Sin ÍNDICE"
        body="Generá el tab ÍNDICE del Sheet primero (botón al fondo)."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <EyebrowTag>Vencimientos del mes</EyebrowTag>
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
          No hay servicios con día de vencimiento definido en el ÍNDICE.
          <br />
          <span style={{ fontSize: 11.5 }}>
            Editá el tab ÍNDICE del Sheet para agregarlos (columna "Día venc").
          </span>
        </div>
      )}
      {conVenc.map((s) => {
        const filaMes = mesData?.rows.find(
          (r) => r.servicio.toUpperCase() === s.servicio.toUpperCase(),
        );
        const tienePend = filaMes
          ? Object.values(filaMes.porLocal).some((c) => c.estado === 'pendiente')
          : false;
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
                width: 44,
                height: 44,
                borderRadius: 12,
                background: tienePend ? '#FFF2EE' : 'var(--bg-subtle)',
                color: tienePend ? '#C84F3F' : 'var(--accent)',
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
                  fontSize: 8,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginTop: 1,
                }}
              >
                {periodo?.label.slice(0, 3).toLowerCase() || 'mes'}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                {titleCase(s.servicio)}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                {s.categoria} · {s.periodicidad}
                {s.notas ? ` · ${s.notas}` : ''}
              </div>
            </div>
            {tienePend && (
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#C84F3F',
                  whiteSpace: 'nowrap',
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

// ─── Tab: Listado (catálogo desde ÍNDICE) ─────────────────────────

function TabListado({
  indice,
  onAction,
}: {
  indice: { locales: IndiceLocal[]; servicios: IndiceServicio[]; tabExiste: boolean };
  onAction: (m: string) => void;
}) {
  if (!indice.tabExiste) {
    return (
      <EmptyState
        title="Tab ÍNDICE no existe"
        body="Generá el ÍNDICE primero (botón al fondo) para ver el listado."
      />
    );
  }

  // Agrupar servicios por categoría
  const porCategoria = new Map<string, IndiceServicio[]>();
  for (const s of indice.servicios) {
    const cat = s.categoria || 'Sin categoría';
    const arr = porCategoria.get(cat) || [];
    arr.push(s);
    porCategoria.set(cat, arr);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Servicios agrupados */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <EyebrowTag>Servicios — {indice.servicios.length} en catálogo</EyebrowTag>
        {Array.from(porCategoria.entries()).map(([cat, arr]) => (
          <section key={cat}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--accent-hover)',
                paddingLeft: 4,
                marginBottom: 6,
              }}
            >
              {cat}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {titleCase(s.servicio)}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    {s.periodicidad}
                    {s.diaVenc && s.diaVenc !== '—'
                      ? ` · vence día ${s.diaVenc}`
                      : ''}
                    {s.notas ? ` · ${s.notas}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Locales */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <EyebrowTag>Locales — {indice.locales.length}</EyebrowTag>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {indice.locales.map((l) => (
            <div
              key={l.col}
              style={{
                padding: '10px 12px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  background: 'var(--bg-subtle)',
                  color: 'var(--accent-hover)',
                  padding: '4px 8px',
                  borderRadius: 6,
                  minWidth: 36,
                  textAlign: 'center',
                  flexShrink: 0,
                }}
              >
                {l.ancla || '—'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{l.col}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                  {l.nombre || '—'}
                  {l.notas ? ` · ${l.notas}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onAction('Editá el tab ÍNDICE del Sheet para agregar nuevos servicios o locales.')}
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

// ─── Tab: Baigun ──────────────────────────────────────────────────

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

  const movs = mesData.rows.filter((r) => !r.esTotal && r.baigun);
  const saldoActual = movs.reduce((s, r) => s + r.baigunMonto, 0);

  return (
    <>
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
          }}
        >
          Saldo Baigun · {mesData.label}
        </div>
        <div
          className="font-brand heading-tight-lg tabular-nums-strict"
          style={{
            fontSize: 30,
            fontWeight: 700,
            lineHeight: 1,
            color: saldoActual >= 0 ? '#F9F7F3' : '#FCA17D',
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          }}
        >
          {saldoActual < 0 ? '−' : ''}$ {Math.abs(Math.round(saldoActual)).toLocaleString('es-AR')}
        </div>
        <div style={{ marginTop: 8, color: 'rgba(249,247,243,0.72)', fontSize: 12 }}>
          {movs.length} movimientos asociados a Baigun este mes
        </div>
      </section>

      {movs.length === 0 ? (
        <EmptyState
          title="Sin movimientos Baigun"
          body="La columna BAIGUN está vacía o sin valores numéricos en este mes."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {movs.map((m, i) => (
            <div
              key={`${m.servicio}-${i}`}
              style={{
                padding: '10px 14px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {titleCase(m.servicio)}
                </div>
                {m.notas && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {m.notas}
                  </div>
                )}
              </div>
              <div
                className="tabular-nums-strict"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: m.baigunMonto < 0 ? '#C84F3F' : 'var(--text)',
                  fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
                  whiteSpace: 'nowrap',
                }}
              >
                {m.baigun}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Helpers UI ───────────────────────────────────────────────────

function abreviarLocal(loc: string): string {
  const map: Record<string, string> = {
    'SEGUI': 'Seguí',
    'MAURE': 'Maure',
    'NICARAGUA': 'Nicaragua',
    'ZABALA': 'Zabala',
    'LIBERTADOR': 'Libertador',
    'NUÑEZ': 'Núñez',
    'CASA MEL Y MARTIN': 'Casa M&M',
    'BAMBINA': 'Bambina',
    'BAIGUN': 'Baigun',
  };
  const upper = loc.toUpperCase();
  return map[upper] || titleCase(loc);
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
    .join(' ');
}

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

// ─── Botón: regenerar tab ÍNDICE en el Sheet ──────────────────────

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
        Borra y recrea el tab <strong>ÍNDICE</strong> del Sheet con la
        estructura canónica. Cualquier edición manual se pierde.
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
