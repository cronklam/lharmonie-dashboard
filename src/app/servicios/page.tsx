'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  nombreCanonico,
} from '@/lib/servicios-mes';
import type { Ancla } from '@/lib/anclas';
import { ANCLAS, ANCLA_LABELS } from '@/lib/anclas';
import type {
  IndiceLocal,
  IndiceServicio,
} from '../api/servicios/indice/route';
import type {
  IndiceServicio as CatalogoServicio,
  IndiceTipo as CatalogoTipo,
  IndiceMetodoPago as CatalogoMetodo,
  IndiceFrecuencia as CatalogoFrec,
  IndiceMoneda as CatalogoMoneda,
} from '@/lib/indice';
import {
  INDICE_TIPOS,
  INDICE_TIPO_LABELS,
  INDICE_METODO_PAGO,
  INDICE_METODO_PAGO_LABELS,
  INDICE_FRECUENCIA,
  INDICE_FRECUENCIA_LABELS,
  INDICE_MONEDA,
  localDisplayDefault,
} from '@/lib/indice';

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
  /** State para el modal de edición del Catálogo (Listado).
   *  initial=null = crear nuevo, initial=IndiceServicio = editar uno. */
  const [editingCatalog, setEditingCatalog] = useState<
    | { mode: 'new'; servicio: ''; ancla: Ancla | null }
    | { mode: 'edit'; entry: CatalogoServicio }
    | null
  >(null);

  const refreshIndice = useCallback(async () => {
    const r = await fetch('/api/servicios/indice', { cache: 'no-store' });
    const d = await r.json();
    if (d.ok) {
      setIndice({
        locales: d.locales || [],
        servicios: d.servicios || [],
        tabExiste: d.tabExiste,
      });
    }
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

  // Auto-refresh cuando la pestaña vuelve al foco: si Iara editó el
  // Sheet directo en otra pestaña, al volver a la app refrescamos
  // automáticamente LISTADO + mes para que matchee. Evitamos hacer
  // poll continuo (costo Sheets API) — solo on focus / visibilitychange.
  useEffect(() => {
    if (!isOwner) return;
    function onVisible() {
      if (document.visibilityState === 'visible') {
        refreshIndice();
        reloadMes();
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [isOwner, refreshIndice, reloadMes]);

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
        rightSlot={
          <button
            type="button"
            onClick={() => {
              refreshIndice();
              reloadMes();
            }}
            disabled={mesLoading}
            aria-label="Actualizar desde el Sheet"
            title="Actualizar desde el Sheet"
            className="press-feedback"
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background: 'var(--bg-subtle)',
              border: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: mesLoading ? 'wait' : 'pointer',
              opacity: mesLoading ? 0.5 : 1,
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transition: 'transform 0.4s var(--ease-ios)',
                animation: mesLoading
                  ? 'spinnerRotate 0.9s linear infinite'
                  : undefined,
              }}
            >
              <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
          </button>
        }
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
            meses={meses}
            indice={indice}
            periodo={periodo}
            onMesActualizado={reloadMes}
            flashToast={flashToast}
            onAgregarServicio={() =>
              setEditingCatalog({ mode: 'new', servicio: '', ancla: null })
            }
            onClickCell={(row, ancla) => setEditing({ row, ancla })}
            onMesCreado={async (m) => {
              // Re-fetch meses list + switch al nuevo
              const r = await fetch('/api/servicios/meses', { cache: 'no-store' });
              const d = await r.json();
              if (d.ok && d.meses?.length) {
                setMeses(d.meses);
                setPeriodo(m.periodo);
                flashToast(`Mes ${m.label} creado`);
              }
            }}
            onMesEliminado={async (periodoEliminado) => {
              // Re-fetch meses + switch al más reciente disponible
              const r = await fetch('/api/servicios/meses', { cache: 'no-store' });
              const d = await r.json();
              if (d.ok && d.meses?.length) {
                setMeses(d.meses);
                if (periodo === periodoEliminado) {
                  setPeriodo(d.meses[0].periodo);
                }
                flashToast('Mes eliminado');
              }
            }}
            onError={flashToast}
          />
        )}
        {tab === 'calendario' && (
          <TabCalendario indice={indice} mesData={mesData} />
        )}
        {tab === 'listado' && (
          <TabListado
            indice={indice}
            mesData={mesData}
            onAction={flashToast}
            onClickServicio={(s) => {
              // Busca el entry del Catálogo que matchee (servicio, ancla).
              // Si existe → editar. Si no → abrir modal de "nuevo" con
              // defaults (eso pasa con huérfanos del Sheet que aún no
              // están en el ÍNDICE).
              const matched = indice.servicios.find(
                (i) =>
                  i.servicio.toUpperCase() === s.servicio.toUpperCase() &&
                  i.ancla === s.ancla,
              );
              if (matched) {
                setEditingCatalog({ mode: 'edit', entry: matched });
              } else {
                setEditingCatalog({
                  mode: 'new',
                  servicio: '',
                  ancla: s.ancla,
                });
              }
            }}
            onNuevo={() =>
              setEditingCatalog({ mode: 'new', servicio: '', ancla: null })
            }
          />
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
          catalogo={indice.servicios}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => {
            setEditing(null);
            flashToast(msg);
            // Recargamos ambos: el pivot del mes (para mostrar el pago
            // recién registrado) y el LISTADO (por si la acción fue
            // desactivar fila/columna).
            await Promise.all([reloadMes(), refreshIndice()]);
          }}
          onError={flashToast}
        />
      )}

      {editingCatalog && (
        <CatalogoModal
          initial={
            editingCatalog.mode === 'edit' ? editingCatalog.entry : null
          }
          onClose={() => setEditingCatalog(null)}
          onSaved={async () => {
            setEditingCatalog(null);
            await refreshIndice();
            flashToast('Catálogo actualizado');
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

// Computa el mes inmediatamente posterior al más reciente que hay en
// el array de meses. Devuelve { tab, label, periodo } del mes nuevo a crear.
function siguienteMesA(meses: ParsedPeriodo[]): {
  tab: string;
  label: string;
  periodo: string;
} | null {
  if (meses.length === 0) return null;
  const m = meses[0]; // más reciente (ya viene sorted desc)
  let y = m.year;
  let mn = m.month + 1;
  if (mn > 12) {
    mn = 1;
    y += 1;
  }
  const MESES_ARRAY = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
  ];
  const MESES_LABEL = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  const yy = String(y).slice(-2);
  return {
    tab: `${MESES_ARRAY[mn - 1]} ${yy}`,
    label: `${MESES_LABEL[mn - 1]} ${y}`,
    periodo: `${y}-${String(mn).padStart(2, '0')}`,
  };
}

function CrearMesButton({
  meses,
  onCreated,
  onError,
}: {
  meses: ParsedPeriodo[];
  onCreated: (m: ParsedPeriodo) => void;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const next = siguienteMesA(meses);
  if (!next) return null;

  const run = useCallback(async () => {
    if (busy) return;
    const ok = window.confirm(
      `¿Crear el mes "${next.label}"?\n\nSe copia la estructura del último mes y los montos sugeridos.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch('/api/servicios/crear-mes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo: next.periodo }),
      });
      const d = await r.json();
      if (d.ok) {
        onCreated({
          tab: next.tab,
          year: parseInt(next.periodo.split('-')[0], 10),
          month: parseInt(next.periodo.split('-')[1], 10),
          periodo: next.periodo,
          label: next.label,
        });
      } else {
        onError(d.error || 'Error creando mes');
      }
    } catch {
      onError('Error de red');
    } finally {
      setBusy(false);
    }
  }, [busy, next, onCreated, onError]);

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="press-feedback"
      style={{
        flexShrink: 0,
        minHeight: 32,
        padding: '0 12px',
        borderRadius: 999,
        background: 'var(--accent)',
        color: '#FDFBF8',
        fontWeight: 600,
        fontSize: 12,
        border: 0,
        opacity: busy ? 0.7 : 1,
        cursor: busy ? 'wait' : 'pointer',
      }}
    >
      {busy ? 'Creando…' : `+ Crear ${next.label}`}
    </button>
  );
}

// Botón "Eliminar mes" — borra el tab del mes actual. Owner-only,
// pide confirm. Si es el único mes disponible, el endpoint rechaza.
function EliminarMesButton({
  periodo,
  label,
  onDeleted,
  onError,
}: {
  periodo: string;
  label: string;
  onDeleted: (periodoEliminado: string) => void | Promise<void>;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    if (busy || !periodo) return;
    const ok = window.confirm(
      `¿Eliminar el mes "${label}"?\n\nSe borra el tab completo del Sheet — toda la data cargada de ese mes se pierde.\n\nEsto es irreversible.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch('/api/servicios/eliminar-mes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo }),
      });
      const d = await r.json();
      if (d.ok) {
        await onDeleted(periodo);
      } else {
        onError(d.error || 'Error eliminando mes');
      }
    } catch {
      onError('Error de red');
    } finally {
      setBusy(false);
    }
  }, [busy, periodo, label, onDeleted, onError]);

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="press-feedback"
      style={{
        flexShrink: 0,
        minHeight: 32,
        padding: '0 12px',
        borderRadius: 999,
        background: 'transparent',
        color: '#C84F3F',
        fontWeight: 600,
        fontSize: 12,
        border: '1px solid rgba(200,79,63,0.35)',
        opacity: busy ? 0.7 : 1,
        cursor: busy ? 'wait' : 'pointer',
      }}
    >
      {busy ? 'Eliminando…' : '🗑 Eliminar mes'}
    </button>
  );
}

// Botón "Limpiar huérfanos" — solo aparece si hay filas en el pivot
// que no matchean nombres del LISTADO. Tap 1 → dry-run para mostrar
// los nombres en un confirm. Tap 2 → borra. Refresca mesData al éxito.
function LimpiarHuerfanosButton({
  periodo,
  count,
  onDone,
  onError,
  flashToast,
}: {
  periodo: string;
  count: number;
  onDone: () => void | Promise<void>;
  onError: (m: string) => void;
  flashToast: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    if (busy || !periodo) return;
    // Dry-run primero para mostrar la lista exacta antes de confirmar.
    setBusy(true);
    try {
      const dry = await fetch('/api/servicios/limpiar-huerfanos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo, dryRun: true }),
      });
      const dryData = await dry.json();
      if (!dryData.ok) {
        onError(dryData.error || 'Error consultando huérfanos');
        return;
      }
      const nombres: string[] = dryData.nombres || [];
      if (nombres.length === 0) {
        flashToast('No hay servicios huérfanos.');
        return;
      }
      // Confirm nativo — sencillo y mobile-friendly. Si el user quiere
      // un sheet con preview detallado lo agregamos más adelante.
      const lista =
        nombres.length <= 6
          ? nombres.map((n) => `• ${n}`).join('\n')
          : `${nombres.slice(0, 6).map((n) => `• ${n}`).join('\n')}\n  …y ${nombres.length - 6} más`;
      const ok = window.confirm(
        `Se van a borrar ${nombres.length} fila${nombres.length !== 1 ? 's' : ''} del pivot que no están en el catálogo:\n\n${lista}\n\nEl LISTADO no se toca. ¿Confirmás?`,
      );
      if (!ok) return;

      const real = await fetch('/api/servicios/limpiar-huerfanos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo, dryRun: false }),
      });
      const realData = await real.json();
      if (realData.ok) {
        flashToast(
          `✓ Borradas ${realData.borradas} fila${realData.borradas !== 1 ? 's' : ''}`,
        );
        await onDone();
      } else {
        onError(realData.error || 'Error borrando huérfanos');
      }
    } catch {
      onError('Error de red');
    } finally {
      setBusy(false);
    }
  }, [busy, periodo, onDone, onError, flashToast]);

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="press-feedback"
      style={{
        flexShrink: 0,
        minHeight: 32,
        padding: '0 12px',
        borderRadius: 999,
        background: 'transparent',
        color: '#C84F3F',
        fontWeight: 600,
        fontSize: 12,
        border: '1px solid #C84F3F',
        opacity: busy ? 0.7 : 1,
        cursor: busy ? 'wait' : 'pointer',
      }}
    >
      {busy ? 'Procesando…' : `Limpiar ${count} huérfano${count !== 1 ? 's' : ''}`}
    </button>
  );
}

function TabTabla({
  data,
  loading,
  meses,
  indice,
  periodo,
  onMesActualizado,
  flashToast,
  onAgregarServicio,
  onClickCell,
  onMesCreado,
  onMesEliminado,
  onError,
}: {
  data: ServicioMes | null;
  loading: boolean;
  meses: ParsedPeriodo[];
  indice: { servicios: CatalogoServicio[] };
  periodo: string;
  onMesActualizado: () => void | Promise<void>;
  flashToast: (m: string) => void;
  onAgregarServicio: () => void;
  onClickCell: (row: ServicioMesRow, ancla: Ancla) => void;
  onMesCreado: (mes: ParsedPeriodo) => void;
  onMesEliminado: (periodoEliminado: string) => void | Promise<void>;
  onError: (m: string) => void;
}) {
  const [search, setSearch] = useState('');

  // FUENTE = LISTADO en TODAS las vistas (tabla principal + secciones
  // CRONKLAM/MyP). Antes solo la tabla LH1-LH6 usaba LISTADO, las
  // SplitSection seguían leyendo del pivot mensual → desconexión visible
  // (ej. Listado mostraba "Yeshurun" en MyP pero la Tabla mostraba
  // "Ajdut" que era lo cargado en el tab del mes).
  // Construimos un objeto con 3 buckets:
  //   - principales (LH1-LH6) → render en el grid pivot
  //   - cronklam (anclas CRONKLAM + BAMBINA) → SplitSection
  //   - myp (ancla MyP) → SplitSection
  // IMPORTANTE: useMemo va ANTES de cualquier early return — rules of
  // hooks (no condicionales antes de hooks).
  const filasBuckets = useMemo(() => {
    const empty = {
      principales: [] as {
        row: ServicioMesRow;
        meta: CatalogoServicio | null;
        baigunAnclas: Set<Ancla>;
      }[],
      cronklam: [] as { row: ServicioMesRow; meta: CatalogoServicio | null }[],
      myp: [] as { row: ServicioMesRow; meta: CatalogoServicio | null }[],
    };
    if (!data) return empty;
    // Lookup rápido de fila real del pivot por nombre (canónico + raw).
    const allRows = [
      ...data.filasLocales,
      ...data.filasCronklam,
      ...data.filasMyP,
    ];
    const rowByName = new Map<string, ServicioMesRow>();
    for (const row of allRows) {
      rowByName.set(row.servicio.trim().toUpperCase(), row);
      rowByName.set(row.servicioRaw.trim().toUpperCase(), row);
    }

    // Agrupar el LISTADO por nombre canónico de servicio, separando
    // por bucket según ancla.
    type Grupo = { servicio: string; entries: Map<Ancla, CatalogoServicio> };
    const principalesMap = new Map<string, Grupo>();
    const cronklamMap = new Map<string, Grupo>();
    const mypMap = new Map<string, Grupo>();

    const isPrincipal = (a: Ancla) => data.anclasOperativas.includes(a);
    const isCronklam = (a: Ancla) => a === 'CRONKLAM';
    const isMyP = (a: Ancla) => a === 'MyP';

    for (const meta of indice.servicios) {
      if (!meta.activo) continue;
      // Key por nombre canónico: "Alquiler Seguí", "Alquiler Maure" y
      // "Alquiler Nuñez" colapsan a "ALQUILER" → una sola fila con
      // columnas por local. Mismo patrón que el Sheet de Iara.
      const canon = nombreCanonico(meta.servicio);
      const key = (canon || meta.servicio).trim().toUpperCase();
      const target = isPrincipal(meta.ancla)
        ? principalesMap
        : isCronklam(meta.ancla)
          ? cronklamMap
          : isMyP(meta.ancla)
            ? mypMap
            : null;
      if (!target) continue; // ancla desconocida → ignorar
      if (!target.has(key)) {
        target.set(key, { servicio: canon || meta.servicio, entries: new Map() });
      }
      target.get(key)!.entries.set(meta.ancla, meta);
    }

    // Helper: armar fila virtual desde un grupo y un set de anclas a
    // forzar. realAncla = ancla concreta para SplitSection (CRONKLAM/MyP).
    function buildRow(grupo: Grupo): ServicioMesRow {
      const key = grupo.servicio.trim().toUpperCase();
      const realRow = rowByName.get(key);
      const baseRow: ServicioMesRow = realRow || {
        servicio: grupo.servicio,
        servicioRaw: grupo.servicio,
        fila: -1,
        porAncla: {},
        baigun: '',
        baigunMonto: 0,
        notas: '',
        esTotal: false,
        grupo: 'locales',
      };
      const porAncla: Record<string, CeldaServicio> = { ...baseRow.porAncla };
      // Solo para la tabla principal forzamos no_aplica en anclas
      // operativas no presentes en el LISTADO. Para las SplitSection
      // solo necesitamos UNA ancla, así que no aplica.
      return { ...baseRow, porAncla };
    }

    // Buckets principales — necesita el patrón completo (LH1-LH6).
    const principales: typeof empty.principales = [];
    for (const [, grupo] of principalesMap) {
      const baseRow = buildRow(grupo);
      const porAncla: Record<string, CeldaServicio> = { ...baseRow.porAncla };
      for (const a of data.anclasOperativas) {
        if (!grupo.entries.has(a)) {
          porAncla[a] = {
            raw: '',
            monto: 0,
            esUsd: false,
            estado: 'no_aplica',
          };
        } else if (!porAncla[a]) {
          porAncla[a] = {
            raw: '',
            monto: 0,
            esUsd: false,
            estado: 'vacio',
          };
        }
      }
      const row: ServicioMesRow = { ...baseRow, porAncla };
      const firstMeta = Array.from(grupo.entries.values())[0];
      const baigunAnclas = new Set<Ancla>(
        Array.from(grupo.entries.entries())
          .filter(([, m]) => m.subarrendadoBaigun)
          .map(([a]) => a),
      );
      principales.push({ row, meta: firstMeta, baigunAnclas });
    }
    principales.sort((a, b) =>
      a.row.servicio.toLowerCase().localeCompare(b.row.servicio.toLowerCase(), 'es'),
    );

    // Helper para SplitSection: una entry por (servicio, ancla
    // concreta) — porque cada servicio puede tener varias anclas en
    // este bucket (ej. CRONKLAM Y BAMBINA).
    function expandToEntries(
      groupMap: Map<string, Grupo>,
    ): { row: ServicioMesRow; meta: CatalogoServicio | null }[] {
      const result: { row: ServicioMesRow; meta: CatalogoServicio | null }[] =
        [];
      for (const [, grupo] of groupMap) {
        const row = buildRow(grupo);
        for (const [ancla, meta] of grupo.entries) {
          // Asegurar que porAncla tiene la celda real o vacío.
          if (!row.porAncla[ancla]) {
            row.porAncla[ancla] = {
              raw: '',
              monto: 0,
              esUsd: false,
              estado: 'vacio',
            };
          }
          result.push({ row: { ...row }, meta });
        }
      }
      result.sort((a, b) =>
        a.row.servicio
          .toLowerCase()
          .localeCompare(b.row.servicio.toLowerCase(), 'es'),
      );
      return result;
    }

    return {
      principales,
      cronklam: expandToEntries(cronklamMap),
      myp: expandToEntries(mypMap),
    };
  }, [indice.servicios, data]);

  // Backwards-compat alias para el render existente del grid principal.
  const filasFromListado = filasBuckets.principales;

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

  // Calculamos las filas huérfanas (en pivot pero no en catálogo) para
  // mostrar el botón "Limpiar huérfanos" con count visible.
  const catalogoNames = new Set(
    indice.servicios.map((s) => s.servicio.trim().toUpperCase()),
  );
  const huerfanasCount = data.filasLocales.filter(
    (r) => !catalogoNames.has(r.servicioRaw.trim().toUpperCase()),
  ).length;

  // Buscador client-side. Normalize tildes para que "luz" matchee
  // "Luz" y "Telefónos" matchee "telefonos".
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const filterTerm = normalize(search.trim());
  const filasVisibles = filterTerm
    ? filasFromListado.filter((f) =>
        normalize(f.row.servicio).includes(filterTerm) ||
        normalize(f.row.servicioRaw).includes(filterTerm),
      )
    : filasFromListado;

  return (
    <>
      <KPICardsRow data={data} indice={indice} />

      {/* Buscador inline. Filtra client-side por nombre del servicio.
          Solo aparece si hay más de 5 filas — para no hacer ruido en
          listas chicas. */}
      {filasFromListado.length > 5 && (
        <div style={{ position: 'relative', padding: '0 2px' }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar servicio…"
            style={{
              width: '100%',
              height: 38,
              padding: '0 36px 0 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text)',
              fontSize: 13.5,
              outline: 'none',
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Limpiar búsqueda"
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 28,
                height: 28,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-subtle)',
                border: 0,
                borderRadius: 999,
                color: 'var(--text-muted)',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          )}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: '0 2px',
          flexWrap: 'wrap',
        }}
      >
        <p
          style={{
            flex: 1,
            minWidth: 200,
            fontSize: 11.5,
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          Tocá una celda para registrar el pago.{' '}
          <span style={{ color: 'var(--green)', fontWeight: 600 }}>Verde</span> = ya pagado ·{' '}
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Pagar</span> = pendiente ·{' '}
          <span style={{ color: 'var(--text-faint)' }}>—</span> = no aplica.
        </p>
        {huerfanasCount > 0 && (
          <LimpiarHuerfanosButton
            periodo={periodo}
            count={huerfanasCount}
            onDone={onMesActualizado}
            onError={onError}
            flashToast={flashToast}
          />
        )}
        <button
          type="button"
          onClick={onAgregarServicio}
          className="press-feedback"
          style={{
            flexShrink: 0,
            minHeight: 32,
            padding: '0 12px',
            borderRadius: 999,
            background: 'var(--bg-card)',
            color: 'var(--text)',
            fontWeight: 600,
            fontSize: 12,
            border: '1px solid var(--border)',
          }}
        >
          + Servicio
        </button>
        <CrearMesButton
          meses={meses}
          onCreated={onMesCreado}
          onError={onError}
        />
        {meses.length > 1 && periodo && (
          <EliminarMesButton
            periodo={periodo}
            label={
              meses.find((m) => m.periodo === periodo)?.label || periodo
            }
            onDeleted={onMesEliminado}
            onError={onError}
          />
        )}
      </div>

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

            {/* Filas — gobernadas por el LISTADO. Cada item ya trae su
                row virtual + meta + baigunAnclas pre-calculados. */}
            {filasVisibles.map((f, idx) => {
              const bg = idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card-alt)';
              return (
                <FilaTabla
                  key={`${f.row.servicio}-${idx}`}
                  row={f.row}
                  anclas={data.anclasOperativas}
                  bg={bg}
                  meta={f.meta}
                  baigunAnclas={f.baigunAnclas}
                  onClickCell={onClickCell}
                />
              );
            })}
            {/* Empty state cuando el filtro deja todo afuera. */}
            {filterTerm && filasVisibles.length === 0 && (
              <div
                style={{
                  gridColumn: `1 / span ${data.anclasOperativas.length + 1}`,
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                }}
              >
                Sin resultados para “{search}”.
              </div>
            )}

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

      {/* Cronklam + MyP split — ahora desde el LISTADO, no del pivot.
          Si Iara editó el LISTADO con un servicio MyP="Yeshurun",
          acá aparece "Yeshurun" (no "Ajdut" del mes anterior). */}
      {(filasBuckets.cronklam.length > 0 || filasBuckets.myp.length > 0) && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: filasBuckets.myp.length > 0 ? '1fr 1fr' : '1fr',
            gap: 8,
            marginTop: 4,
          }}
        >
          {filasBuckets.cronklam.length > 0 && (
            <SplitSection
              label="Cronklam (corporativo)"
              entries={filasBuckets.cronklam}
              onClickCell={onClickCell}
            />
          )}
          {filasBuckets.myp.length > 0 && (
            <SplitSection
              label="Martín y Melanie"
              entries={filasBuckets.myp}
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
  meta,
  baigunAnclas,
  onClickCell,
}: {
  row: ServicioMesRow;
  anclas: Ancla[];
  bg: string;
  meta: CatalogoServicio | null;
  baigunAnclas: Set<Ancla>;
  onClickCell: (row: ServicioMesRow, ancla: Ancla) => void;
}) {
  const hoyDia = new Date().getDate();
  const diaVenc = meta?.diaVencimiento || null;
  const vencido = diaVenc !== null && hoyDia > diaVenc;
  return (
    <>
      <div
        style={{
          position: 'sticky',
          left: 0,
          zIndex: 1,
          background: bg,
          padding: '10px 12px',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text)',
          borderTop: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <span>{row.servicio}</span>
        {diaVenc !== null && (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              color: vencido ? '#C84F3F' : 'var(--text-muted)',
              letterSpacing: '0.02em',
            }}
          >
            ⏰ Vence día {diaVenc}
            {vencido && ' · vencido'}
          </span>
        )}
      </div>
      {anclas.map((a) => {
        const cell = row.porAncla[a];
        const esBaigun = baigunAnclas.has(a);
        // Highlight rojo si vencido + celda no pagada
        const vencidoSinPago =
          vencido &&
          cell &&
          cell.estado !== 'pagado' &&
          cell.estado !== 'no_aplica';
        return (
          <button
            key={a}
            type="button"
            onClick={() => onClickCell(row, a)}
            className="press-feedback"
            style={{
              background: vencidoSinPago ? 'rgba(217,95,78,0.08)' : bg,
              padding: '10px 6px',
              fontSize: 12,
              textAlign: 'center',
              borderTop: '1px solid var(--border)',
              borderLeft: '1px solid var(--border)',
              cursor: 'pointer',
              minHeight: 44,
              border: 0,
              position: 'relative',
            }}
          >
            <CeldaTabla cell={cell} />
            {esBaigun &&
              cell &&
              (cell.estado === 'pagado' || cell.estado === 'pendiente') && (
                <span
                  title="Subarrendado Baigun (50% al cta cte)"
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 4,
                    fontSize: 9,
                    color: '#7C3AED',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                  }}
                >
                  🏠
                </span>
              )}
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
  entries,
  onClickCell,
}: {
  label: string;
  /** Cada entry trae su propia ancla (CRONKLAM, BAMBINA o MyP) porque
   *  un bucket puede mezclarlas (ej. Cronklam (corporativo) incluye
   *  ambas anclas). */
  entries: { row: ServicioMesRow; meta: CatalogoServicio | null }[];
  onClickCell: (row: ServicioMesRow, ancla: Ancla) => void;
}) {
  const count = entries.length;
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
        {entries.map((entry, i) => {
          const ancla = (entry.meta?.ancla || 'CRONKLAM') as Ancla;
          const cell = entry.row.porAncla[ancla];
          return (
            <button
              key={`${entry.row.servicio}-${ancla}-${i}`}
              type="button"
              onClick={() => onClickCell(entry.row, ancla)}
              className="press-feedback"
              style={{
                width: '100%',
                padding: '12px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: i < count - 1 ? '1px solid var(--border)' : 0,
                fontSize: 13,
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>
                {entry.row.servicio}
              </span>
              <span
                className="numeric-display"
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
        const dia = s.diaVencimiento;
        if (!dia || dia < 1 || dia > 31) continue;
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
  const colors = catColors(entry.servicio.tipo);

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
          {entry.servicio.tipo && (
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
              {entry.servicio.tipo}
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

// ─── Tab: LISTADO — estilo staff con stats + expand por local ────

// Tipo agregado: un servicio en un local (con su metadata de ÍNDICE).
// Lo construimos en runtime cruzando el pivot del mes con el ÍNDICE.
interface ServicioEnLocal {
  servicio: string;       // canónico (display)
  servicioRaw: string;    // raw del Sheet (para escribir celda)
  ancla: Ancla;
  cellEstado: 'pagado' | 'pendiente' | 'vacio' | 'no_aplica';
  cellMonto: number;
  cellEsUsd: boolean;
  cellRaw: string;
  // Enrich del ÍNDICE (catálogo)
  categoria: string;          // tipo (luz, agua, etc) — legacy field name
  periodicidad: string;       // frecuencia
  diaVenc: number | null;
  notas: string;
  metodoPago: string;         // efectivo/transferencia/debito_automatico/tarjeta o ''
  subarrendadoBaigun: boolean;
  activo: boolean;
  enCatalogo: boolean;        // false si es huérfano (en pivot pero no en ÍNDICE)
}

function diasHastaVenc(diaVenc: number | null): number | null {
  if (!diaVenc) return null;
  const hoy = new Date();
  const targetMes = new Date(hoy.getFullYear(), hoy.getMonth(), diaVenc);
  const lastDay = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const diaReal = Math.min(diaVenc, lastDay);
  targetMes.setDate(diaReal);
  const diffMs = targetMes.getTime() - hoy.setHours(0, 0, 0, 0);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function TabListado({
  indice,
  mesData,
  onClickServicio,
  onNuevo,
  onAction,
}: {
  indice: { locales: IndiceLocal[]; servicios: IndiceServicio[]; tabExiste: boolean };
  mesData: ServicioMes | null;
  onClickServicio: (s: ServicioEnLocal) => void;
  onNuevo: () => void;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onAction: (m: string) => void;
}) {
  const [view, setView] = useState<'local' | 'categoria'>('local');
  const [openAncla, setOpenAncla] = useState<string | null>(null);
  const [openTipo, setOpenTipo] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  if (!indice.tabExiste) {
    return (
      <EmptyState
        title="Tab ÍNDICE no existe"
        body="Generá el ÍNDICE primero (botón al fondo)."
      />
    );
  }

  // Build serviciosEnLocal:
  // FUENTE = LISTADO (indice.servicios). Antes iterábamos sobre el
  // pivot mensual y enriquecíamos con catálogo — eso "perdía" entries
  // del catálogo que no aparecían en el mes y mostraba huérfanos del
  // pivot que no tenían lugar en el LISTADO. Ahora al revés:
  //   1. Iterar (servicio × ancla) del LISTADO (filtrando inactivos).
  //   2. Para cada uno, buscar la celda correspondiente en el pivot
  //      del mes (por nombre, case-insensitive).
  //   3. Si la celda dice "no_aplica" → saltar (este local no tiene
  //      este servicio).
  //   4. Si no hay celda (fila no existe en el pivot, o porAncla está
  //      vacío) → estado "vacio" — entry visible como pendiente sin
  //      cargar todavía este mes.
  // Resultado: el LISTADO es la fuente única de verdad; huérfanos del
  // pivot dejan de mostrarse acá.
  const serviciosEnLocal: ServicioEnLocal[] = useMemo(() => {
    if (!indice.servicios.length) return [];
    // Lookup rápido de filas del pivot por nombre (canónico y raw).
    const allRows = mesData
      ? [
          ...mesData.filasLocales,
          ...mesData.filasCronklam,
          ...mesData.filasMyP,
        ]
      : [];
    const rowByName = new Map<string, (typeof allRows)[number]>();
    for (const row of allRows) {
      rowByName.set(row.servicio.trim().toUpperCase(), row);
      rowByName.set(row.servicioRaw.trim().toUpperCase(), row);
    }
    // 1:1 con el Sheet: TODA fila del LISTADO se incluye, sin filtrar
    // por activo/pivot. Inactivos se marcan con el flag `activo: false`
    // para que la UI los muestre con un badge "Inactivo".
    // El estado de la celda viene del pivot del mes para enriquecer
    // (pagado/pendiente/vacío/no_aplica), pero NO se usa para filtrar.
    const out: ServicioEnLocal[] = [];
    for (const meta of indice.servicios) {
      const row = rowByName.get(meta.servicio.trim().toUpperCase());
      const cell = row?.porAncla[meta.ancla];
      out.push({
        servicio: meta.servicio,
        servicioRaw: row?.servicioRaw || meta.servicio,
        ancla: meta.ancla,
        cellEstado: cell?.estado || 'vacio',
        cellMonto: cell?.monto || 0,
        cellEsUsd: cell?.esUsd || false,
        cellRaw: cell?.raw || '',
        categoria: meta.tipo,
        periodicidad: meta.frecuencia || '',
        diaVenc: meta.diaVencimiento ?? null,
        notas: meta.notas || row?.notas || '',
        metodoPago: meta.metodoPago,
        subarrendadoBaigun: meta.subarrendadoBaigun,
        activo: meta.activo,
        enCatalogo: true,
      });
    }
    return out;
  }, [indice.servicios, mesData]);

  // Filtro por buscador (client-side, normalize tildes).
  const filteredServicios = useMemo(() => {
    const term = search
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    if (!term) return serviciosEnLocal;
    return serviciosEnLocal.filter((s) => {
      const hay = `${s.servicio} ${s.servicioRaw} ${s.categoria} ${s.ancla}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
      return hay.includes(term);
    });
  }, [serviciosEnLocal, search]);

  // Stats card
  const stats = useMemo(() => {
    let pagadosCount = 0;
    let pendientesCount = 0;
    let pagadoArs = 0;
    let pagadoUsd = 0;
    let faltaArs = 0;
    let vencidos = 0;
    const hoy = new Date();
    const hoyDia = hoy.getDate();

    for (const e of serviciosEnLocal) {
      if (e.cellEstado === 'pagado') {
        pagadosCount++;
        if (e.cellEsUsd) pagadoUsd += e.cellMonto;
        else pagadoArs += e.cellMonto;
      } else {
        // pendiente o vacio → falta pagar
        pendientesCount++;
        // Sumar al "falta pagar" si tenemos un sugerido (TODO: leer de
        // mes anterior). Por ahora si está pendiente lo dejamos sin monto.
        if (e.cellEstado === 'pendiente') faltaArs += 0;

        if (e.diaVenc && e.diaVenc < hoyDia) vencidos++;
      }
    }

    return { pagadosCount, pendientesCount, pagadoArs, pagadoUsd, faltaArs, vencidos };
  }, [serviciosEnLocal]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stats principal */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 14,
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: 10,
          }}
        >
          Este mes
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--green)',
                marginBottom: 2,
              }}
            >
              Pagado
            </div>
            <div
              className="tabular-nums-strict"
              style={{
                fontSize: 19,
                fontWeight: 700,
                color: 'var(--text)',
                lineHeight: 1.1,
              }}
            >
              ${Math.round(stats.pagadoArs).toLocaleString('es-AR')}
            </div>
            {stats.pagadoUsd > 0 && (
              <div
                className="tabular-nums-strict"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginTop: 2,
                }}
              >
                US$ {Math.round(stats.pagadoUsd).toLocaleString('es-AR')}
              </div>
            )}
            <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 4 }}>
              {stats.pagadosCount} {stats.pagadosCount === 1 ? 'servicio' : 'servicios'}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#92400E',
                marginBottom: 2,
              }}
            >
              Falta pagar
            </div>
            <div
              className="tabular-nums-strict"
              style={{
                fontSize: 19,
                fontWeight: 700,
                color: 'var(--text)',
                lineHeight: 1.1,
              }}
            >
              {stats.pendientesCount}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 4 }}>
              {stats.pendientesCount === 1 ? '1 servicio' : `${stats.pendientesCount} servicios`}
              {stats.vencidos > 0
                ? ` · ${stats.vencidos} vencido${stats.vencidos === 1 ? '' : 's'}`
                : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Toggle Por Local / Por Categoría */}
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

      {/* Buscador inline. Solo aparece si hay >5 servicios en el LISTADO
          (para no hacer ruido cuando el catálogo es chico). Normalize
          tildes — "telefonos" matchea "Telefónos". */}
      {serviciosEnLocal.length > 5 && (
        <div style={{ position: 'relative' }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar en el catálogo…"
            style={{
              width: '100%',
              height: 38,
              padding: '0 36px 0 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text)',
              fontSize: 13.5,
              outline: 'none',
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Limpiar búsqueda"
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 28,
                height: 28,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-subtle)',
                border: 0,
                borderRadius: 999,
                color: 'var(--text-muted)',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          )}
          {search && filteredServicios.length === 0 && (
            <div
              style={{
                marginTop: 8,
                padding: '8px 12px',
                fontSize: 12.5,
                color: 'var(--text-muted)',
                fontStyle: 'italic',
              }}
            >
              Sin resultados para “{search}”
            </div>
          )}
        </div>
      )}

      {view === 'local' ? (
        <ListadoPorLocal
          locales={indice.locales}
          serviciosEnLocal={filteredServicios}
          openAncla={openAncla}
          onToggle={(a) => setOpenAncla((p) => (p === a ? null : a))}
          onClickServicio={onClickServicio}
        />
      ) : (
        <ListadoPorCategoria
          serviciosEnLocal={filteredServicios}
          openTipo={openTipo}
          onToggle={(t) => setOpenTipo((p) => (p === t ? null : t))}
          onClickServicio={onClickServicio}
        />
      )}

      <button
        type="button"
        onClick={onNuevo}
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
        + Nuevo servicio
      </button>
    </div>
  );
}

const ANCLA_ORDER: Ancla[] = ['LH1', 'LH2', 'LH3', 'LH4', 'LH5', 'LH6', 'CRONKLAM', 'BAMBINA', 'MyP'];
const ANCLA_LARGO: Record<Ancla, string> = {
  LH1: 'Lharmonie 1 (LH1)',
  LH2: 'Lharmonie Nicaragua (LH2)',
  LH3: 'Casa Lharmonie (LH3)',
  LH4: 'Lharmonie Zabala (LH4)',
  LH5: 'Lharmonie Libertador (LH5)',
  LH6: 'Lharmonie 6 (LH6)',
  CRONKLAM: 'Cronklam (empresa)',
  BAMBINA: 'Bambina (personal)',
  MyP: 'Martín y Melanie',
};

function ListadoPorLocal_NEW({
  locales: _locales,
  serviciosEnLocal,
  openAncla,
  onToggle,
  onClickServicio,
}: {
  locales: IndiceLocal[];
  serviciosEnLocal: ServicioEnLocal[];
  openAncla: string | null;
  onToggle: (a: string) => void;
  onClickServicio: (s: ServicioEnLocal) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ANCLA_ORDER.map((anclaKey) => {
        const items = serviciosEnLocal.filter((s) => s.ancla === anclaKey);
        if (items.length === 0) return null;
        const isOpen = openAncla === anclaKey;
        const pendientes = items.filter((s) => s.cellEstado !== 'pagado').length;
        const totalArs = items
          .filter((s) => s.cellEstado === 'pagado' && !s.cellEsUsd)
          .reduce((sum, s) => sum + s.cellMonto, 0);

        // Ordenar items por tipo (categoría)
        const sorted = [...items].sort((a, b) =>
          (a.categoria || 'zzz').localeCompare(b.categoria || 'zzz') ||
          a.servicio.localeCompare(b.servicio),
        );

        return (
          <div
            key={anclaKey}
            style={{
              background: 'var(--bg-card)',
              border: `1px solid ${isOpen ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              transition: 'border-color 180ms',
            }}
          >
            <button
              type="button"
              onClick={() => onToggle(anclaKey)}
              className="press-feedback"
              aria-expanded={isOpen}
              style={{
                width: '100%',
                padding: 12,
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
                  width: 42,
                  height: 42,
                  borderRadius: 999,
                  background: 'rgba(184,149,111,0.12)',
                  color: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                }}
              >
                {anclaKey}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ANCLA_LARGO[anclaKey]}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    marginTop: 1,
                  }}
                >
                  {items.length} {items.length === 1 ? 'servicio' : 'servicios'}
                  {pendientes > 0 && ` · ${pendientes} pendientes`}
                  {totalArs > 0 &&
                    ` · $${Math.round(totalArs).toLocaleString('es-AR')}/mes`}
                </div>
              </div>
              {pendientes > 0 && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    background: 'rgba(217,95,78,0.12)',
                    color: '#C84F3F',
                    padding: '2px 7px',
                    borderRadius: 999,
                    flexShrink: 0,
                  }}
                >
                  {pendientes}
                </span>
              )}
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                style={{
                  transition: 'transform 220ms var(--ease-ios)',
                  transform: isOpen ? 'rotate(90deg)' : 'none',
                  flexShrink: 0,
                }}
              >
                <path
                  d="M5 2l5 5-5 5"
                  stroke="var(--text-muted)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                {sorted.map((s, idx) => (
                  <ServicioRowCard
                    key={`${s.servicio}-${idx}`}
                    s={s}
                    onClick={() => onClickServicio(s)}
                    bordered={idx > 0}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Stub vieja signatura para no romper imports — la nueva está arriba.
function ListadoPorLocal(props: {
  locales: IndiceLocal[];
  serviciosEnLocal: ServicioEnLocal[];
  openAncla: string | null;
  onToggle: (a: string) => void;
  onClickServicio: (s: ServicioEnLocal) => void;
}) {
  return <ListadoPorLocal_NEW {...props} />;
}

function ServicioRowCard({
  s,
  onClick,
  bordered,
}: {
  s: ServicioEnLocal;
  onClick: () => void;
  bordered: boolean;
}) {
  const tono = catColors(s.categoria);
  const dias = diasHastaVenc(s.diaVenc);
  const venceRojo = dias !== null && dias < 0;
  const venceAmber = dias !== null && dias >= 0 && dias <= 3;
  const borderLeftColor = venceRojo
    ? '#C84F3F'
    : venceAmber
    ? '#F59E0B'
    : 'transparent';

  const metodoLabel = s.metodoPago
    ? s.metodoPago === 'debito_automatico'
      ? 'Auto'
      : s.metodoPago === 'transferencia'
      ? 'Transf.'
      : s.metodoPago === 'tarjeta'
      ? 'Tarjeta'
      : 'Efectivo'
    : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className="press-feedback"
      style={{
        width: '100%',
        padding: '10px 12px',
        borderTop: bordered ? `1px solid var(--border)` : 'none',
        borderLeft: borderLeftColor !== 'transparent' ? `3px solid ${borderLeftColor}` : '3px solid transparent',
        background: 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'block',
        opacity: !s.activo && s.enCatalogo ? 0.55 : 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            {s.categoria && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: tono.bg,
                  color: tono.fg,
                  flexShrink: 0,
                }}
              >
                {s.categoria}
              </span>
            )}
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text)',
              }}
            >
              {s.servicio}
            </span>
            {metodoLabel && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: 4,
                  background:
                    s.metodoPago === 'debito_automatico'
                      ? 'rgba(15,118,110,0.10)'
                      : 'var(--bg-subtle)',
                  color:
                    s.metodoPago === 'debito_automatico'
                      ? '#0F766E'
                      : 'var(--text-muted)',
                  flexShrink: 0,
                }}
              >
                {metodoLabel}
              </span>
            )}
            {s.subarrendadoBaigun && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: 'rgba(124,58,237,0.10)',
                  color: '#7C3AED',
                  flexShrink: 0,
                }}
              >
                Baigun
              </span>
            )}
            {!s.enCatalogo && (
              <span
                title="Huérfano: en pivot pero no en el ÍNDICE. Tocá para crear la entry del catálogo."
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: 'rgba(245,158,11,0.12)',
                  color: '#A05A00',
                  flexShrink: 0,
                }}
              >
                Sin catálogo
              </span>
            )}
            {!s.activo && s.enCatalogo && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: 'var(--bg-subtle)',
                  flexShrink: 0,
                }}
              >
                Inactivo
              </span>
            )}
          </div>
          <div
            style={{
              marginTop: 4,
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              alignItems: 'center',
              fontSize: 10.5,
            }}
          >
            {s.diaVenc && (
              <span
                style={{
                  color: venceRojo ? '#C84F3F' : 'var(--text-muted)',
                  background: 'var(--bg-subtle)',
                  padding: '2px 7px',
                  borderRadius: 999,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect x="3.5" y="5" width="17" height="15" rx="2.2" stroke="currentColor" strokeWidth="2" />
                  <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Vence el {s.diaVenc} de cada mes
              </span>
            )}
            {s.cellEstado === 'pagado' && (
              <span style={{ color: 'var(--green)', fontWeight: 700 }}>
                ✓{' '}
                {s.cellEsUsd
                  ? `US$ ${Math.round(s.cellMonto).toLocaleString('es-AR')}`
                  : `$${Math.round(s.cellMonto).toLocaleString('es-AR')}`}
              </span>
            )}
            {s.cellEstado === 'pendiente' && (
              <span
                style={{
                  color: '#C84F3F',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Pendiente
              </span>
            )}
            {s.cellEstado === 'vacio' && (
              <span style={{ color: 'var(--text-muted)' }}>Sin cargar</span>
            )}
          </div>
        </div>
        <svg
          width="13"
          height="13"
          viewBox="0 0 14 14"
          fill="none"
          style={{ flexShrink: 0, marginTop: 4 }}
        >
          <path
            d="M5 2l5 5-5 5"
            stroke="var(--text-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </button>
  );
}


function ListadoPorCategoria({
  serviciosEnLocal,
  openTipo,
  onToggle,
  onClickServicio,
}: {
  serviciosEnLocal: ServicioEnLocal[];
  openTipo: string | null;
  onToggle: (t: string) => void;
  onClickServicio: (s: ServicioEnLocal) => void;
}) {
  const porTipo = useMemo(() => {
    const m = new Map<string, ServicioEnLocal[]>();
    for (const s of serviciosEnLocal) {
      const k = s.categoria || 'Sin categoría';
      const arr = m.get(k) || [];
      arr.push(s);
      m.set(k, arr);
    }
    return m;
  }, [serviciosEnLocal]);

  const orderedTipos = Array.from(porTipo.keys()).sort((a, b) =>
    a.localeCompare(b, 'es'),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {orderedTipos.map((tipo) => {
        const items = porTipo.get(tipo) || [];
        const isOpen = openTipo === tipo;
        const pendientes = items.filter((s) => s.cellEstado !== 'pagado').length;
        const tono = catColors(tipo);
        const sorted = [...items].sort((a, b) =>
          (a.ancla || 'zzz').localeCompare(b.ancla || 'zzz') ||
          a.servicio.localeCompare(b.servicio),
        );
        return (
          <div
            key={tipo}
            style={{
              background: isOpen ? tono.bg : 'var(--bg-card)',
              border: `1px solid ${isOpen ? tono.fg : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              transition: 'all 180ms',
            }}
          >
            <button
              type="button"
              onClick={() => onToggle(tipo)}
              className="press-feedback"
              aria-expanded={isOpen}
              style={{
                width: '100%',
                padding: 12,
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
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  background: tono.bg,
                  color: tono.fg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {tipo.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                  {tipo}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                  {items.length} {items.length === 1 ? 'servicio' : 'servicios'}
                  {pendientes > 0 && ` · ${pendientes} pendientes`}
                </div>
              </div>
              {pendientes > 0 && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    background: 'rgba(217,95,78,0.12)',
                    color: '#C84F3F',
                    padding: '2px 7px',
                    borderRadius: 999,
                    flexShrink: 0,
                  }}
                >
                  {pendientes}
                </span>
              )}
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                style={{
                  transition: 'transform 220ms var(--ease-ios)',
                  transform: isOpen ? 'rotate(90deg)' : 'none',
                  flexShrink: 0,
                }}
              >
                <path
                  d="M5 2l5 5-5 5"
                  stroke="var(--text-muted)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                {sorted.map((s, idx) => (
                  <ServicioRowCard
                    key={`${s.servicio}-${s.ancla}-${idx}`}
                    s={s}
                    onClick={() => onClickServicio(s)}
                    bordered={idx > 0}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {orderedTipos.length === 0 && (
        <EmptyState
          title="Sin servicios este mes"
          body="No hay datos cargados en el mes seleccionado."
        />
      )}
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
  catalogo,
  onClose,
  onSaved,
  onError,
}: {
  row: ServicioMesRow;
  ancla: Ancla;
  periodo: string;
  periodoLabel: string;
  catalogo?: CatalogoServicio[];
  onClose: () => void;
  onSaved: (msg: string) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const cell = row.porAncla[ancla];
  const yaPagado = cell?.estado === 'pagado';
  const noAplica = cell?.estado === 'no_aplica';
  const localCol = ANCLA_TO_LOCAL_COL[ancla];

  // Sugerir monto desde el LISTADO si encontramos servicio+ancla matching.
  const sugerido = useMemo(() => {
    if (!catalogo) return null;
    const srvUp = row.servicio.trim().toLowerCase();
    const rawUp = row.servicioRaw.trim().toLowerCase();
    const match = catalogo.find(
      (s) =>
        s.ancla === ancla &&
        (s.servicio.trim().toLowerCase() === srvUp ||
          s.servicio.trim().toLowerCase() === rawUp),
    );
    if (!match) return null;
    if (match.monedaDefault === 'USD' && match.montoEstimadoUsd) {
      return { monto: match.montoEstimadoUsd, moneda: 'USD' as const };
    }
    if (match.montoEstimadoArs) {
      return { monto: match.montoEstimadoArs, moneda: 'ARS' as const };
    }
    return null;
  }, [catalogo, row.servicio, row.servicioRaw, ancla]);

  const [monto, setMonto] = useState(
    sugerido ? String(Math.round(sugerido.monto)) : '',
  );
  const [moneda, setMoneda] = useState<'ARS' | 'USD'>(
    sugerido ? sugerido.moneda : cell?.esUsd ? 'USD' : 'ARS',
  );
  const [saving, setSaving] = useState(false);
  const [confirmForzar, setConfirmForzar] = useState(false);
  /** Tracking del "tipo de write" en curso para que el spinner / loader
   *  vaya en el botón correcto. */
  const [savingKind, setSavingKind] = useState<
    'pago' | 'no-aplica' | 'eliminar-fila' | 'eliminar-columna' | null
  >(null);

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
      setSavingKind('pago');
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
        setSavingKind(null);
      }
    },
    [saving, monto, moneda, periodo, row.servicioRaw, localCol, onError, onSaved],
  );

  // Desactivar bulk en el LISTADO. scope='fila' borra TODAS las anclas
  // de este servicio (= "este servicio para todos los locales").
  // scope='columna' borra TODOS los servicios de esta ancla (= "todo
  // este local"). Soft-delete (activo=FALSE) en el Sheet — la fila
  // queda como referencia histórica.
  const submitDesactivar = useCallback(
    async (scope: 'fila' | 'columna') => {
      if (saving) return;
      const mensaje =
        scope === 'fila'
          ? `Esto va a marcar como inactivos TODOS los locales que pagan "${row.servicio}" en el catálogo. ¿Estás segura?`
          : `Esto va a marcar como inactivos TODOS los servicios del local "${ANCLA_SHORT_LABEL[ancla]}" en el catálogo. ¿Estás segura?`;
      const ok = window.confirm(mensaje);
      if (!ok) return;
      setSaving(true);
      setSavingKind(scope === 'fila' ? 'eliminar-fila' : 'eliminar-columna');
      try {
        const body =
          scope === 'fila' ? { servicio: row.servicio } : { ancla };
        const r = await fetch('/api/servicios/indice/desactivar-bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        if (d.ok) {
          const n = d.desactivadas as number;
          onSaved(
            n === 0
              ? 'No había entries activas para desactivar'
              : `Desactivadas ${n} ${n === 1 ? 'entry' : 'entries'} del catálogo`,
          );
        } else {
          onError(d.error || 'Error desactivando');
        }
      } catch {
        onError('Error de red');
      } finally {
        setSaving(false);
        setSavingKind(null);
      }
    },
    [saving, row.servicio, ancla, onError, onSaved],
  );

  // Marcar como "No aplica": escribe "NO" en la celda. Solo permitido
  // cuando la celda NO tiene un pago hecho — para sobrescribir un pago
  // existente Iara tiene que ir al Sheet manualmente (decisión consciente
  // para evitar borrados accidentales).
  const submitNoAplica = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setSavingKind('no-aplica');
    try {
      const r = await fetch('/api/servicios/celda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodo,
          servicioRaw: row.servicioRaw,
          localCol,
          valor: 'NO',
          forzar: false,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        onSaved('Marcado como "No aplica"');
      } else {
        onError(d.error || 'Error guardando');
      }
    } catch {
      onError('Error de red');
    } finally {
      setSaving(false);
      setSavingKind(null);
    }
  }, [saving, periodo, row.servicioRaw, localCol, onError, onSaved]);

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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(confirmForzar);
            }}
          >
            {/* Quick-pay con monto sugerido del LISTADO. Si lo hay, se
                renderea como pill clicable arriba del input — un tap
                completa el input y dispara submit en simultáneo. */}
            {sugerido && !yaPagado && !confirmForzar && (
              <button
                type="button"
                onClick={() => {
                  const m = String(Math.round(sugerido.monto));
                  setMonto(m);
                  setMoneda(sugerido.moneda);
                  // Submit con el monto fresco: pasamos directo en lugar
                  // de esperar el setState (que es async).
                  setTimeout(() => submit(false), 0);
                }}
                disabled={saving}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '10px 14px',
                  marginBottom: 12,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--accent-bg)',
                  border: '1px solid var(--accent)',
                  color: 'var(--accent-hover)',
                  cursor: saving ? 'wait' : 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.85 }}>
                  Pagar lo del catálogo
                </span>
                <span
                  className="numeric-display"
                  style={{ fontSize: 16, fontWeight: 700 }}
                >
                  {sugerido.moneda === 'USD'
                    ? `US$ ${Math.round(sugerido.monto).toLocaleString('es-AR')}`
                    : `$${Math.round(sugerido.monto).toLocaleString('es-AR')}`}
                </span>
              </button>
            )}

            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {sugerido && !yaPagado ? 'O cargá otro monto' : 'Monto'}
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
                className="numeric-display"
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
                type="submit"
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
                {saving && savingKind === 'pago'
                  ? 'Guardando…'
                  : confirmForzar
                    ? 'Sí, sobrescribir'
                    : 'Guardar pago'}
              </button>
            </div>

            {/* Acción secundaria: "No aplica" — marca la celda como "NO"
                (este local no tiene este servicio). Solo visible cuando
                la celda no tiene pago. Sin destructive: el endpoint la
                escribe solo si está vacía / TODAVIA NO. */}
            {!yaPagado && !confirmForzar && (
              <button
                type="button"
                onClick={submitNoAplica}
                disabled={saving}
                style={{
                  width: '100%',
                  marginTop: 10,
                  height: 38,
                  borderRadius: 'var(--radius-md)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  fontWeight: 500,
                  fontSize: 12.5,
                  border: '1px dashed var(--border)',
                  cursor: saving ? 'wait' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving && savingKind === 'no-aplica'
                  ? 'Marcando…'
                  : 'Marcar "No aplica" (este local no tiene este servicio)'}
              </button>
            )}

            {/* Acciones destructivas — eliminar fila/columna del LISTADO.
                Cada una pide confirm nativo antes de ejecutar. Soft-
                delete (activo=FALSE). Solo visibles si no estamos en el
                medio de un confirm de sobrescribir. */}
            {!confirmForzar && (
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    marginBottom: 2,
                  }}
                >
                  Eliminar del catálogo
                </div>
                <button
                  type="button"
                  onClick={() => submitDesactivar('fila')}
                  disabled={saving}
                  style={{
                    width: '100%',
                    height: 38,
                    borderRadius: 'var(--radius-md)',
                    background: 'transparent',
                    color: '#C84F3F',
                    fontWeight: 600,
                    fontSize: 12.5,
                    border: '1px solid rgba(200,79,63,0.35)',
                    cursor: saving ? 'wait' : 'pointer',
                    opacity: saving ? 0.6 : 1,
                    textAlign: 'left',
                    padding: '0 12px',
                  }}
                >
                  {saving && savingKind === 'eliminar-fila'
                    ? 'Eliminando…'
                    : `🗑 Quitar "${row.servicio}" de TODOS los locales`}
                </button>
                <button
                  type="button"
                  onClick={() => submitDesactivar('columna')}
                  disabled={saving}
                  style={{
                    width: '100%',
                    height: 38,
                    borderRadius: 'var(--radius-md)',
                    background: 'transparent',
                    color: '#C84F3F',
                    fontWeight: 600,
                    fontSize: 12.5,
                    border: '1px solid rgba(200,79,63,0.35)',
                    cursor: saving ? 'wait' : 'pointer',
                    opacity: saving ? 0.6 : 1,
                    textAlign: 'left',
                    padding: '0 12px',
                  }}
                >
                  {saving && savingKind === 'eliminar-columna'
                    ? 'Eliminando…'
                    : `🗑 Quitar TODOS los servicios del local "${ANCLA_SHORT_LABEL[ancla]}"`}
                </button>
              </div>
            )}
          </form>
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

// ─── Tab: CATÁLOGO ─────────────────────────────────────────────────
// Lista editable del ÍNDICE. CRUD vía /api/servicios/indice.

function TabCatalogo({
  servicios,
  tabExiste,
  onChanged,
  onError,
}: {
  servicios: CatalogoServicio[];
  tabExiste: boolean;
  onChanged: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [soloActivos, setSoloActivos] = useState(true);
  const [filterAncla, setFilterAncla] = useState<Ancla | 'todos'>('todos');
  const [editing, setEditing] = useState<CatalogoServicio | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    let list = servicios;
    if (soloActivos) list = list.filter((s) => s.activo);
    if (filterAncla !== 'todos') list = list.filter((s) => s.ancla === filterAncla);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.servicio.toLowerCase().includes(q) ||
          s.localDisplay.toLowerCase().includes(q) ||
          s.tipo.toLowerCase().includes(q),
      );
    }
    return list;
  }, [servicios, soloActivos, filterAncla, search]);

  if (!tabExiste) {
    return (
      <EmptyState
        title="Tab ÍNDICE no existe"
        body="Tocá el botón al fondo de la pantalla para crearlo + poblarlo automático con servicios del mes más reciente."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h3
          className="font-brand"
          style={{ fontSize: 18, fontWeight: 700, margin: 0 }}
        >
          Catálogo de servicios
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          Listado maestro editable. Acá definís fechas, métodos de pago,
          locales, todo. Es la fuente cuando creás un mes nuevo.
        </p>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, local o tipo…"
          className="input-pro"
          style={{ minHeight: 38, fontSize: 13 }}
        />
        <div
          style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            paddingBottom: 4,
          }}
        >
          <Chip
            active={soloActivos}
            onClick={() => setSoloActivos((v) => !v)}
            label={soloActivos ? '✓ Solo activos' : 'Solo activos'}
          />
          <Chip
            active={filterAncla === 'todos'}
            onClick={() => setFilterAncla('todos')}
            label="Todos"
          />
          {(['LH1', 'LH2', 'LH3', 'LH4', 'LH5', 'LH6', 'BAMBINA', 'CRONKLAM', 'MyP'] as Ancla[]).map(
            (a) => (
              <Chip
                key={a}
                active={filterAncla === a}
                onClick={() => setFilterAncla(a)}
                label={a}
              />
            ),
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setCreating(true)}
        className="press-feedback"
        style={{
          alignSelf: 'flex-start',
          minHeight: 38,
          padding: '0 14px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--accent)',
          color: '#FDFBF8',
          fontWeight: 600,
          fontSize: 13,
          border: 0,
        }}
      >
        + Nuevo servicio
      </button>

      {/* Lista */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          body={
            soloActivos
              ? 'Probá destildar "Solo activos" para ver inactivos.'
              : 'Probá otro filtro o creá uno nuevo.'
          }
        />
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {filtered.map((s) => (
            <li key={s._row}>
              <CatalogoRow s={s} onClick={() => setEditing(s)} />
            </li>
          ))}
        </ul>
      )}

      {(editing || creating) && (
        <CatalogoModal
          initial={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={async () => {
            setEditing(null);
            setCreating(false);
            await onChanged();
          }}
          onError={onError}
        />
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press-feedback"
      style={{
        flexShrink: 0,
        padding: '6px 10px',
        borderRadius: 999,
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'var(--accent)' : 'var(--bg-card)',
        color: active ? '#FDFBF8' : 'var(--text-muted)',
        fontSize: 11.5,
        fontWeight: active ? 700 : 500,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function CatalogoRow({
  s,
  onClick,
}: {
  s: CatalogoServicio;
  onClick: () => void;
}) {
  const inactive = !s.activo;
  // Freshness indicator: dot verde si editedAt < 5 min
  const [isFresh, setIsFresh] = useState(false);
  useEffect(() => {
    try {
      const key = `${s.servicio.toLowerCase()}__${s.ancla}`;
      const stash = JSON.parse(localStorage.getItem('lh-catalog-edits') || '{}');
      const editedAt = stash[key] as number | undefined;
      if (editedAt && Date.now() - editedAt < 5 * 60_000) {
        setIsFresh(true);
        const remaining = 5 * 60_000 - (Date.now() - editedAt);
        const t = setTimeout(() => setIsFresh(false), remaining);
        return () => clearTimeout(t);
      }
    } catch { /* ignore */ }
  }, [s.servicio, s.ancla]);
  return (
    <button
      type="button"
      onClick={onClick}
      className="press-feedback"
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 14px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        opacity: inactive ? 0.55 : 1,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {isFresh && (
            <span
              aria-label="editado hace poco"
              title="Editado hace menos de 5 minutos"
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#76C893',
                boxShadow: '0 0 0 2px rgba(118,200,147,0.18)',
                flexShrink: 0,
              }}
            />
          )}
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            {s.servicio}
          </span>
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              padding: '2px 6px',
              borderRadius: 4,
              background: 'var(--bg-subtle)',
              color: 'var(--accent-hover)',
            }}
          >
            {s.ancla}
          </span>
          {s.subarrendadoBaigun && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(124,58,237,0.10)',
                color: '#7C3AED',
              }}
            >
              Baigun
            </span>
          )}
          {inactive && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: 'var(--text-muted)',
                padding: '2px 6px',
                borderRadius: 4,
                background: 'var(--bg-subtle)',
              }}
            >
              Inactivo
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
          {INDICE_TIPO_LABELS[s.tipo]} · {s.localDisplay}
          {s.diaVencimiento ? ` · vence día ${s.diaVencimiento}` : ''}
          {s.metodoPago ? ` · ${INDICE_METODO_PAGO_LABELS[s.metodoPago]}` : ''}
        </div>
      </div>
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden
        style={{ color: 'var(--text-muted)' }}
      >
        <path
          d="M5 2l5 5-5 5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function CatalogoModal({
  initial,
  onClose,
  onSaved,
  onError,
}: {
  initial: CatalogoServicio | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const isEdit = !!initial;
  const [servicio, setServicio] = useState(initial?.servicio || '');
  const [tipo, setTipo] = useState<CatalogoTipo>(initial?.tipo || 'otro');
  const [ancla, setAncla] = useState<Ancla>(initial?.ancla || 'LH1');
  const [localDisplay, setLocalDisplay] = useState(
    initial?.localDisplay || localDisplayDefault(initial?.ancla || 'LH1'),
  );
  const [diaVencimiento, setDiaVencimiento] = useState(
    initial?.diaVencimiento ? String(initial.diaVencimiento) : '',
  );
  const [metodoPago, setMetodoPago] = useState<CatalogoMetodo | ''>(
    initial?.metodoPago || '',
  );
  const [frecuencia, setFrecuencia] = useState<CatalogoFrec | ''>(
    initial?.frecuencia || 'mensual',
  );
  const [activo, setActivo] = useState(initial?.activo ?? true);
  const [subarrendadoBaigun, setSubarrendadoBaigun] = useState(
    initial?.subarrendadoBaigun ?? false,
  );
  const [baigunPct, setBaigunPct] = useState(
    initial?.baigunPct !== undefined && initial?.baigunPct !== null
      ? String(initial.baigunPct)
      : '',
  );
  const [savedOk, setSavedOk] = useState(false);

  const [montoEstimadoArs, setMontoEstimadoArs] = useState(
    initial?.montoEstimadoArs !== undefined && initial?.montoEstimadoArs !== null
      ? String(initial.montoEstimadoArs)
      : '',
  );
  const [montoEstimadoUsd, setMontoEstimadoUsd] = useState(
    initial?.montoEstimadoUsd !== undefined && initial?.montoEstimadoUsd !== null
      ? String(initial.montoEstimadoUsd)
      : '',
  );
  const [monedaDefault, setMonedaDefault] = useState<CatalogoMoneda>(
    initial?.monedaDefault || 'ARS',
  );
  const [titularNombre, setTitularNombre] = useState(initial?.titularNombre || '');
  const [titularCuit, setTitularCuit] = useState(initial?.titularCuit || '');
  const [cuentaNumero, setCuentaNumero] = useState(initial?.cuentaNumero || '');
  const [cbu, setCbu] = useState(initial?.cbu || '');
  const [notas, setNotas] = useState(initial?.notas || '');
  const [saving, setSaving] = useState(false);

  // Limpiar baigunPct si se desmarca subarrendado.
  useEffect(() => {
    if (!subarrendadoBaigun) setBaigunPct('');
  }, [subarrendadoBaigun]);

  // Validaciones inline
  const diaNum = diaVencimiento ? parseInt(diaVencimiento, 10) : NaN;
  const diaError =
    diaVencimiento && (!isFinite(diaNum) || diaNum < 1 || diaNum > 31)
      ? 'Día debe estar entre 1 y 31'
      : '';
  const baigunPctNum = baigunPct ? parseFloat(baigunPct) : NaN;
  const baigunPctError =
    subarrendadoBaigun && baigunPct && (!isFinite(baigunPctNum) || baigunPctNum < 0 || baigunPctNum > 100)
      ? 'Porcentaje debe estar entre 0 y 100'
      : '';
  const cuitError =
    titularCuit && titularCuit.length !== 11 && titularCuit.length !== 0
      ? 'CUIT debe tener 11 dígitos'
      : '';
  const hayErrores = !!(diaError || baigunPctError);

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

  const submit = useCallback(async () => {
    if (saving) return;
    if (!servicio.trim()) {
      onError('Falta nombre del servicio.');
      return;
    }
    if (hayErrores) {
      onError('Corregí los errores marcados en rojo antes de guardar.');
      return;
    }
    setSaving(true);
    try {
      const parseMontoInput = (s: string): number | null => {
        const cleaned = s.replace(/[$\s,]/g, '').trim();
        if (!cleaned) return null;
        const n = parseFloat(cleaned);
        return isNaN(n) ? null : n;
      };
      const body = {
        servicio: servicio.trim(),
        tipo,
        ancla,
        localDisplay: localDisplay.trim() || localDisplayDefault(ancla),
        diaVencimiento: diaVencimiento ? parseInt(diaVencimiento, 10) : null,
        frecuencia,
        metodoPago,
        montoEstimadoArs: parseMontoInput(montoEstimadoArs),
        montoEstimadoUsd: parseMontoInput(montoEstimadoUsd),
        monedaDefault,
        titularNombre: titularNombre.trim(),
        titularCuit: titularCuit.replace(/[^\d]/g, ''),
        cuentaNumero: cuentaNumero.trim(),
        cbu: cbu.trim(),
        subarrendadoBaigun,
        baigunPct: subarrendadoBaigun ? (parseFloat(baigunPct) || 50) : null,
        activo,
        notas: notas.trim(),
      };
      const r = await fetch('/api/servicios/indice', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { ...body, row: initial!._row } : body),
      });
      const d = await r.json();
      if (d.ok) {
        // Marcar editedAt en localStorage para freshness indicator
        try {
          const key = `${(servicio.trim()).toLowerCase()}__${ancla}`;
          const stash = JSON.parse(localStorage.getItem('lh-catalog-edits') || '{}');
          stash[key] = Date.now();
          localStorage.setItem('lh-catalog-edits', JSON.stringify(stash));
        } catch { /* localStorage puede no estar disponible */ }
        // Optimistic UI: mostrar checkmark verde 800ms antes de cerrar.
        setSavedOk(true);
        await new Promise((r) => setTimeout(r, 800));
        await onSaved();
      } else {
        onError(d.error || 'Error guardando');
      }
    } catch {
      onError('Error de red');
    } finally {
      setSaving(false);
    }
  }, [
    saving, hayErrores, servicio, tipo, ancla, localDisplay, diaVencimiento,
    frecuencia, metodoPago, montoEstimadoArs, montoEstimadoUsd, monedaDefault,
    titularNombre, titularCuit, cuentaNumero, cbu,
    activo, subarrendadoBaigun, baigunPct, notas,
    isEdit, initial, onSaved, onError,
  ]);

  const desactivar = useCallback(async () => {
    if (!isEdit || saving) return;
    if (!confirm('¿Eliminar este servicio del catálogo? Queda inactivo, no se borra.')) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/servicios/indice?row=${initial!._row}`, {
        method: 'DELETE',
      });
      const d = await r.json();
      if (d.ok) {
        await onSaved();
      } else {
        onError(d.error || 'Error desactivando');
      }
    } catch {
      onError('Error de red');
    } finally {
      setSaving(false);
    }
  }, [isEdit, saving, initial, onSaved, onError]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(4px)',
          zIndex: 115,
        }}
      />
      <div
        role="dialog"
        aria-modal
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '92vh',
          background: 'var(--bg-card)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          boxShadow: '0 -16px 40px rgba(0,0,0,0.18)',
          zIndex: 120,
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: 'var(--safe-bottom)',
        }}
      >
        <div style={{ padding: '12px 18px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              · Catálogo
            </div>
            <h2
              className="font-brand"
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '-0.022em',
                margin: 0,
                marginTop: 2,
              }}
            >
              {isEdit ? 'Editar servicio' : 'Nuevo servicio'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--bg-subtle)', border: 0, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '6px 18px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <FieldL label="Nombre del servicio">
            <input
              type="text"
              value={servicio}
              onChange={(e) => setServicio(e.target.value)}
              placeholder="ej. EDENOR"
              className="input-pro"
              style={{ minHeight: 'var(--touch-min)' }}
            />
          </FieldL>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FieldL label="Tipo">
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as CatalogoTipo)}
                className="input-pro"
                style={{ minHeight: 'var(--touch-min)' }}
              >
                {INDICE_TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {INDICE_TIPO_LABELS[t]}
                  </option>
                ))}
              </select>
            </FieldL>
            <FieldL label="Ancla / Local">
              <select
                value={ancla}
                onChange={(e) => {
                  const a = e.target.value as Ancla;
                  setAncla(a);
                  setLocalDisplay(localDisplayDefault(a));
                }}
                className="input-pro"
                style={{ minHeight: 'var(--touch-min)' }}
              >
                {ANCLAS.map((a) => (
                  <option key={a} value={a}>
                    {a} · {ANCLA_LABELS[a]}
                  </option>
                ))}
              </select>
            </FieldL>
          </div>
          <FieldL label="Local Display (texto humano)">
            <input
              type="text"
              value={localDisplay}
              onChange={(e) => setLocalDisplay(e.target.value)}
              className="input-pro"
              style={{ minHeight: 'var(--touch-min)' }}
            />
          </FieldL>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <FieldL label="Día venc (1-31)">
              <input
                type="text"
                inputMode="numeric"
                value={diaVencimiento}
                onChange={(e) => setDiaVencimiento(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                placeholder="—"
                className="input-pro tabular-nums-strict"
                style={{
                  minHeight: 'var(--touch-min)',
                  borderColor: diaError ? '#C84F3F' : undefined,
                }}
              />
              {diaError && (
                <span style={{ fontSize: 10.5, color: '#C84F3F', marginTop: 2 }}>{diaError}</span>
              )}
            </FieldL>
            <FieldL label="Frecuencia">
              <select
                value={frecuencia}
                onChange={(e) => setFrecuencia(e.target.value as CatalogoFrec)}
                className="input-pro"
                style={{ minHeight: 'var(--touch-min)' }}
              >
                {INDICE_FRECUENCIA.map((f) => (
                  <option key={f} value={f}>
                    {INDICE_FRECUENCIA_LABELS[f]}
                  </option>
                ))}
              </select>
            </FieldL>
            <FieldL label="Método pago">
              <select
                value={metodoPago}
                onChange={(e) =>
                  setMetodoPago(e.target.value as CatalogoMetodo | '')
                }
                className="input-pro"
                style={{ minHeight: 'var(--touch-min)' }}
              >
                <option value="">—</option>
                {INDICE_METODO_PAGO.map((m) => (
                  <option key={m} value={m}>
                    {INDICE_METODO_PAGO_LABELS[m]}
                  </option>
                ))}
              </select>
            </FieldL>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 110px', gap: 10 }}>
            <FieldL label="Monto estimado ARS">
              <input
                type="text"
                inputMode="decimal"
                value={montoEstimadoArs}
                onChange={(e) =>
                  setMontoEstimadoArs(e.target.value.replace(/[^0-9.,]/g, ''))
                }
                placeholder="—"
                className="input-pro tabular-nums-strict"
                style={{ minHeight: 'var(--touch-min)' }}
              />
            </FieldL>
            <FieldL label="Monto estimado USD">
              <input
                type="text"
                inputMode="decimal"
                value={montoEstimadoUsd}
                onChange={(e) =>
                  setMontoEstimadoUsd(e.target.value.replace(/[^0-9.,]/g, ''))
                }
                placeholder="—"
                className="input-pro tabular-nums-strict"
                style={{ minHeight: 'var(--touch-min)' }}
              />
            </FieldL>
            <FieldL label="Moneda">
              <select
                value={monedaDefault}
                onChange={(e) => setMonedaDefault(e.target.value as CatalogoMoneda)}
                className="input-pro"
                style={{ minHeight: 'var(--touch-min)' }}
              >
                {INDICE_MONEDA.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </FieldL>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 10 }}>
            <FieldL label="Titular (razón social)">
              <input
                type="text"
                value={titularNombre}
                onChange={(e) => setTitularNombre(e.target.value)}
                placeholder="Ej. Lharmonie SRL"
                className="input-pro"
                style={{ minHeight: 'var(--touch-min)' }}
              />
            </FieldL>
            <FieldL label="CUIT (solo dígitos)">
              <input
                type="text"
                inputMode="numeric"
                value={titularCuit}
                onChange={(e) => setTitularCuit(e.target.value.replace(/[^\d]/g, '').slice(0, 11))}
                placeholder="30716239489"
                className="input-pro tabular-nums-strict"
                style={{ minHeight: 'var(--touch-min)' }}
              />
            </FieldL>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
            <FieldL label="Nº cuenta cliente">
              <input
                type="text"
                value={cuentaNumero}
                onChange={(e) => setCuentaNumero(e.target.value)}
                placeholder="Ej. # Edenor"
                className="input-pro"
                style={{ minHeight: 'var(--touch-min)' }}
              />
            </FieldL>
            <FieldL label="CBU/CVU/Alias">
              <input
                type="text"
                value={cbu}
                onChange={(e) => setCbu(e.target.value)}
                placeholder="alias.banco.lharmonie"
                className="input-pro"
                style={{ minHeight: 'var(--touch-min)' }}
              />
            </FieldL>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
              />
              Activo
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={subarrendadoBaigun}
                onChange={(e) => setSubarrendadoBaigun(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
              />
              Subarrendado Baigun
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: subarrendadoBaigun ? 1 : 0.45 }}>
              <input
                type="text"
                inputMode="decimal"
                value={baigunPct}
                onChange={(e) => setBaigunPct(e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))}
                placeholder="50"
                disabled={!subarrendadoBaigun}
                className="input-pro tabular-nums-strict"
                style={{
                  width: 72,
                  minHeight: 'var(--touch-min)',
                  textAlign: 'center',
                  background: subarrendadoBaigun ? undefined : 'var(--bg-subtle)',
                  cursor: subarrendadoBaigun ? 'text' : 'not-allowed',
                  borderColor: baigunPctError ? '#C84F3F' : undefined,
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>% al cta cte</span>
            </div>
          </div>
          {baigunPctError && (
            <div style={{ fontSize: 10.5, color: '#C84F3F', marginTop: -8 }}>{baigunPctError}</div>
          )}
          {cuitError && (
            <div style={{ fontSize: 10.5, color: '#C84F3F', marginTop: -8 }}>{cuitError}</div>
          )}
          <FieldL label="Notas">
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="input-pro"
              rows={2}
              style={{ minHeight: 60, paddingTop: 10, paddingBottom: 10 }}
            />
          </FieldL>
        </div>

        <div
          style={{
            padding: 12,
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: 8,
          }}
        >
          {isEdit && (
            <button
              type="button"
              onClick={desactivar}
              disabled={saving}
              className="press-feedback"
              style={{
                height: 44,
                padding: '0 14px',
                borderRadius: 'var(--radius-md)',
                background: 'transparent',
                color: '#C84F3F',
                border: '1px solid #C84F3F',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Eliminar
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="press-feedback"
            style={{
              flex: 1,
              height: 44,
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-subtle)',
              color: 'var(--text)',
              fontWeight: 500,
              fontSize: 13.5,
              border: '1px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || hayErrores}
            className="press-feedback"
            style={{
              flex: 2,
              height: 44,
              borderRadius: 'var(--radius-md)',
              background: savedOk ? '#76C893' : 'var(--accent)',
              color: '#FDFBF8',
              fontWeight: 700,
              fontSize: 13.5,
              border: 0,
              cursor: hayErrores ? 'not-allowed' : 'pointer',
              opacity: saving || hayErrores ? 0.7 : 1,
              transition: 'background 0.2s',
            }}
          >
            {savedOk
              ? '✓ Guardado'
              : saving
              ? 'Guardando…'
              : isEdit
              ? 'Guardar cambios'
              : 'Crear servicio'}
          </button>
        </div>
        <div
          style={{
            padding: '6px 16px 10px',
            fontSize: 10.5,
            color: 'var(--text-muted)',
            textAlign: 'center',
            opacity: 0.65,
          }}
        >
          Sincronizado con el LISTADO del Sheet · cache 60s
        </div>
      </div>
    </>,
    document.body,
  );
}

function FieldL({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

// ─── KPI cards (control de gastos) ────────────────────────────────
function KPICardsRow({
  data,
  indice,
}: {
  data: ServicioMes;
  indice: { servicios: CatalogoServicio[] };
}) {
  // Total ARS del mes (suma totalPorAncla, ya excluye no_aplica)
  const totalMes = useMemo(
    () => Object.values(data.totalPorAncla).reduce((s, v) => s + v, 0),
    [data.totalPorAncla],
  );

  // Top categoría: agrupar por TIPO (desde catálogo joineado), sumar
  const topCategoria = useMemo(() => {
    const sumByTipo = new Map<string, number>();
    const allRows = [...data.filasLocales, ...data.filasCronklam, ...data.filasMyP];
    for (const row of allRows) {
      const match = indice.servicios.find(
        (s) => s.servicio.toUpperCase() === row.servicioRaw.toUpperCase(),
      );
      const tipo = match?.tipo || 'otro';
      let sum = 0;
      for (const c of Object.values(row.porAncla)) {
        if (c.estado === 'pagado' && !c.esUsd) sum += c.monto;
      }
      sumByTipo.set(tipo, (sumByTipo.get(tipo) || 0) + sum);
    }
    let top: { tipo: string; monto: number } | null = null;
    for (const [t, m] of sumByTipo.entries()) {
      if (!top || m > top.monto) top = { tipo: t, monto: m };
    }
    return top;
  }, [data, indice.servicios]);

  // Top local: el ancla con mayor totalPorAncla
  const topLocal = useMemo(() => {
    let top: { ancla: string; monto: number } | null = null;
    for (const [a, m] of Object.entries(data.totalPorAncla)) {
      if (!top || m > top.monto) top = { ancla: a, monto: m };
    }
    return top;
  }, [data.totalPorAncla]);

  // Sin pagar: servicios activos del LISTADO que no tienen valor en el
  // pivot para alguno de sus locales asignados.
  const sinPagarCount = useMemo(() => {
    let count = 0;
    const allRows = [...data.filasLocales, ...data.filasCronklam, ...data.filasMyP];
    for (const s of indice.servicios) {
      if (!s.activo) continue;
      const match = allRows.find(
        (r) => r.servicioRaw.toUpperCase() === s.servicio.toUpperCase(),
      );
      if (!match) {
        count++;
        continue;
      }
      const cell = match.porAncla[s.ancla];
      if (!cell || cell.estado === 'vacio' || cell.estado === 'pendiente') count++;
    }
    return count;
  }, [data, indice.servicios]);

  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        paddingBottom: 4,
        marginBottom: 4,
      }}
    >
      <KPICard
        label="Total del mes"
        value={fmt(totalMes)}
        hint={`${data.conteoPagados} pagado${data.conteoPagados !== 1 ? 's' : ''}`}
      />
      <KPICard
        label="Top categoría"
        value={topCategoria ? topCategoria.tipo.toUpperCase() : '—'}
        hint={topCategoria ? fmt(topCategoria.monto) : ''}
      />
      <KPICard
        label="Top local"
        value={topLocal ? topLocal.ancla : '—'}
        hint={topLocal ? fmt(topLocal.monto) : ''}
      />
      <KPICard
        label="Sin pagar"
        value={String(sinPagarCount)}
        hint={sinPagarCount > 0 ? 'servicios pendientes' : 'todo al día'}
        dotColor={sinPagarCount > 0 ? '#E0B341' : '#76C893'}
      />
    </div>
  );
}

function KPICard({
  label,
  value,
  hint,
  dotColor,
}: {
  label: string;
  value: string;
  hint: string;
  dotColor?: string;
}) {
  return (
    <div
      style={{
        flexShrink: 0,
        minWidth: 140,
        padding: '12px 14px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 4,
        }}
      >
        {dotColor && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: dotColor,
              display: 'inline-block',
            }}
          />
        )}
        {label}
      </div>
      <div
        className="tabular-nums-strict importe"
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--text)',
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>
      )}
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
