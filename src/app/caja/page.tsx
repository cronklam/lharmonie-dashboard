'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import EyebrowTag from '../components/EyebrowTag';
import {
  CATEGORIAS,
  CATEGORIA_COLORS,
  MONEDA_SYMBOLS,
  TIPO_LABELS,
  esRowDeSesion,
  fmtMonto,
  formatMontoLive,
  mesTabFromISO,
  nuevoIdMov,
  parseMontoInput,
  parsePrefijoSesion,
  type Categoria,
  type Moneda,
  type MovimientoCaja,
  type Tipo,
} from '@/lib/caja';
import { SesionWizard } from './SesionWizard';

type CajaTab = 'sesion' | 'movs' | 'conciliacion';

interface SesionResumenAPI {
  prefijo: string;
  fechaSesion: string;
  iso: string;
  local: string;
  retiradoArs: number;
  gastadoArs: number;
  diferenciaArs: number;
  retiradoUsd: number;
  gastadoUsd: number;
  diferenciaUsd: number;
  totalRows: number;
}

// /caja — Caja efectivo. Owner-only.
//
// Form: Ingreso/Egreso, Fecha, Moneda, Categoría, Descripción, Importe.
// Optimistic UI: el mov aparece en la lista al instante; rollback si
// la API falla. El selector de mes filtra a una pestaña específica
// del Sheet (formato "Mayo 2026"). Saldo total mostrado arriba.

interface OptimisticMov extends MovimientoCaja {
  _localId: string;
  _pending?: boolean;
  _failed?: boolean;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentMesISO(): string {
  return todayISO().slice(0, 7);
}

export default function CajaPage() {
  const { user, loading, isOwner } = useAuth();
  const router = useRouter();

  const [mes, setMes] = useState<string>(currentMesISO());
  const [meses, setMeses] = useState<string[]>([]);
  const [items, setItems] = useState<OptimisticMov[]>([]);
  const [tabName, setTabName] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saldos, setSaldos] = useState<{ pesos: number; dolares: number } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState('');

  // Filtros
  const [filterMoneda, setFilterMoneda] = useState<Moneda | 'todas'>('todas');
  const [filterCategoria, setFilterCategoria] = useState<Categoria | 'todas'>('todas');
  const [filterTexto, setFilterTexto] = useState('');
  const [hideSesionRows, setHideSesionRows] = useState(true);
  // Orden: 'recientes' (desc por fila) o 'cronologico' (asc por fila).
  // Recientes arriba es el default para que Iara vea al toque lo que
  // acaba de cargar.
  const [orden, setOrden] = useState<'recientes' | 'cronologico'>('recientes');

  // Tabs + sesiones
  const [tab, setTab] = useState<CajaTab>('sesion');
  const [sesiones, setSesiones] = useState<SesionResumenAPI[]>([]);
  const [sesionesError, setSesionesError] = useState<string | null>(null);
  const [wizardActive, setWizardActive] = useState(false);
  const [deletingPrefijo, setDeletingPrefijo] = useState<string | null>(null);

  const refreshMes = useCallback(async (m: string) => {
    setFetching(true);
    setError(null);
    try {
      const r = await fetch(`/api/caja/movimientos?mes=${encodeURIComponent(m)}`, {
        cache: 'no-store',
      });
      const d = await r.json();
      if (d.ok) {
        setItems(
          (d.items || []).map((it: MovimientoCaja) => ({
            ...it,
            _localId: `s_${it.fila}`,
          })),
        );
        setTabName(d.tab);
        if (Array.isArray(d.mesesDisponibles)) {
          setMeses(d.mesesDisponibles);
        }
      } else {
        setError(d.error || 'Error');
        setItems([]);
        setTabName(null);
      }
    } catch {
      setError('Error de red');
      setItems([]);
      setTabName(null);
    } finally {
      setFetching(false);
    }
  }, []);

  const refreshSaldos = useCallback(async () => {
    try {
      const r = await fetch('/api/caja/saldos', { cache: 'no-store' });
      const d = await r.json();
      if (d.ok) setSaldos({ pesos: d.pesos, dolares: d.dolares });
    } catch {
      // silencio — el banner principal ya muestra error si aplica
    }
  }, []);

  const refreshSesiones = useCallback(async () => {
    try {
      const r = await fetch('/api/caja/sesiones', { cache: 'no-store' });
      const d = await r.json();
      if (d.ok) {
        setSesiones(d.items || []);
        setSesionesError(null);
      } else {
        setSesionesError(d.error || 'Error');
      }
    } catch {
      setSesionesError('Error de red');
    }
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    if (!isOwner) {
      router.replace('/');
      return;
    }
    refreshMes(mes);
    refreshSaldos();
    refreshSesiones();
  }, [loading, user, isOwner, mes, refreshMes, refreshSaldos, refreshSesiones, router]);

  const flashToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 2400);
  }, []);

  const deleteMov = useCallback(
    async (mov: OptimisticMov) => {
      if (!tabName || mov.fila < 3) return false;
      // Optimistic remove
      setItems((prev) => prev.filter((i) => i._localId !== mov._localId));
      try {
        const res = await fetch(
          `/api/caja/movimiento?tab=${encodeURIComponent(tabName)}&fila=${mov.fila}`,
          { method: 'DELETE' },
        );
        const data = await res.json();
        if (!data.ok) {
          // Rollback: refetch para traer la fila de vuelta
          await refreshMes(mes);
          flashToast(data.error || 'No se pudo borrar');
          return false;
        }
        flashToast('Movimiento borrado');
        refreshSaldos();
        return true;
      } catch {
        await refreshMes(mes);
        flashToast('Error de red');
        return false;
      }
    },
    [tabName, mes, refreshMes, refreshSaldos, flashToast],
  );

  // Filtros aplicados a items
  const itemsFiltered = useMemo(() => {
    let list = items;
    if (hideSesionRows) {
      // Las filas que pertenecen a una sesión (descripción arranca con
      // "S. " o "SESION ") las ocultamos por default — esos movs viven
      // dentro del card de su sesión en el tab Sesión y rellenan ruido
      // acá. El toggle permite verlas si Iara quiere.
      list = list.filter((i) => !esRowDeSesion(i.descripcion));
    }
    if (filterMoneda !== 'todas') list = list.filter((i) => i.moneda === filterMoneda);
    if (filterCategoria !== 'todas') list = list.filter((i) => i.categoria === filterCategoria);
    const q = filterTexto.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.descripcion.toLowerCase().includes(q) ||
          (i.categoria || '').toLowerCase().includes(q),
      );
    }
    // Sort: por fila desc (newest top) o asc (cronológico).
    const sorted = [...list].sort((a, b) =>
      orden === 'recientes' ? b.fila - a.fila : a.fila - b.fila,
    );
    return sorted;
  }, [items, filterMoneda, filterCategoria, filterTexto, hideSesionRows, orden]);

  // Saldo del mes (por moneda)
  const saldoMes = useMemo(() => {
    let pesos = 0;
    let dolares = 0;
    for (const it of items) {
      if (it._failed) continue;
      if (it.moneda === 'PESO') pesos += it.importe;
      else dolares += it.importe;
    }
    return { pesos, dolares };
  }, [items]);

  // ─── Optimistic submit ─────────────────────────────────────────

  const submitMovimiento = useCallback(
    async (input: {
      tipo: Tipo;
      fecha: string;
      moneda: Moneda;
      categoria: Categoria;
      descripcion: string;
      importeAbs: number;
    }) => {
      const localId = nuevoIdMov();
      const signed = input.tipo === 'EGRESO' ? -input.importeAbs : input.importeAbs;
      // Si el mov no es del mes vista, lo guardamos pero NO lo
      // metemos en la lista visible.
      const targetMes = input.fecha.slice(0, 7);
      const inCurrentView = targetMes === mes;
      if (inCurrentView) {
        const optimistic: OptimisticMov = {
          fila: -1,
          fecha: input.fecha,
          moneda: input.moneda,
          descripcion: input.descripcion,
          categoria: input.categoria,
          importe: signed,
          saldoCol: null,
          _localId: localId,
          _pending: true,
        };
        setItems((prev) => [optimistic, ...prev]);
      }

      try {
        const res = await fetch('/api/caja/movimiento', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fecha: input.fecha,
            moneda: input.moneda,
            descripcion: input.descripcion,
            categoria: input.categoria,
            importe: input.importeAbs,
            tipo: input.tipo,
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          // Marcar la fila optimistic como _failed (rollback visual)
          if (inCurrentView) {
            setItems((prev) =>
              prev.map((i) =>
                i._localId === localId ? { ...i, _pending: false, _failed: true } : i,
              ),
            );
          }
          flashToast(data.error || 'No se pudo guardar');
          return false;
        }
        // Refetch para traer la fila real (con saldoCol) + saldos.
        if (inCurrentView) {
          await refreshMes(mes);
        } else {
          flashToast(`Guardado en "${data.tab}"`);
        }
        refreshSaldos();
        return true;
      } catch {
        if (inCurrentView) {
          setItems((prev) =>
            prev.map((i) =>
              i._localId === localId ? { ...i, _pending: false, _failed: true } : i,
            ),
          );
        }
        flashToast('Error de red');
        return false;
      }
    },
    [mes, refreshMes, refreshSaldos, flashToast],
  );

  const deleteSesion = useCallback(
    async (prefijo: string) => {
      setDeletingPrefijo(null);
      // Optimistic remove
      setSesiones((prev) => prev.filter((s) => s.prefijo !== prefijo));
      try {
        const res = await fetch(
          `/api/caja/sesion?id=${encodeURIComponent(prefijo)}`,
          { method: 'DELETE' },
        );
        const data = await res.json();
        if (!data.ok) {
          await refreshSesiones();
          flashToast(data.error || 'No se pudo borrar');
          return;
        }
        flashToast(`Sesión borrada (${data.borradas} filas)`);
        refreshSaldos();
        refreshMes(mes);
      } catch {
        await refreshSesiones();
        flashToast('Error de red');
      }
    },
    [mes, refreshSesiones, refreshSaldos, refreshMes, flashToast],
  );

  if (loading || !user) return null;
  if (!isOwner) return null;

  const tabDisplay = tabName || mesTabFromISO(`${mes}-01`) || mes;
  const lastSesion = sesiones[0];

  return (
    <div className="page-enter">
      <PageHeader title="Caja efectivo" subtitle="Movimientos del mes" showBack />
      <div
        className="px-4 pt-4 lh-inicio-stagger"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          paddingBottom: 'calc(var(--nav-height) + var(--safe-bottom) + 24px)',
        }}
      >
        {/* Hero — saldo global + CTA "+ Movimiento" siempre visible.
            El botón abre el bottom sheet de nuevo movimiento
            independientemente de la tab activa, así Iara o Martín
            pueden sumar a Caja Grande de un solo tap desde cualquier
            vista (Sesión / Movimientos / Conciliación). */}
        <section
          className="lh-hero-total spring-in"
          style={{ padding: '20px 22px', position: 'relative' }}
        >
          {/* Quick-add CTA — pill dorado top-right */}
          <button
            type="button"
            onClick={() => setShowForm(true)}
            aria-label="Nuevo movimiento rápido"
            className="press-feedback"
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              minHeight: 32,
              padding: '0 12px',
              borderRadius: 999,
              background: 'rgba(196,160,103,0.16)',
              color: '#C4A067',
              border: '1px solid rgba(196,160,103,0.40)',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '-0.005em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              backdropFilter: 'blur(6px)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 12px -4px rgba(196,160,103,0.30)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
            Mov. rápido
          </button>
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
            Saldo total · efectivo
          </div>
          <div
            className="importe"
            style={{
              fontSize: 40,
              color: '#F9F7F3',
            }}
          >
            {saldos ? fmtMonto(saldos.pesos, 'PESO') : '—'}
          </div>
          {saldos && saldos.dolares !== 0 && (
            <div
              className="importe"
              style={{
                marginTop: 6,
                fontSize: 22,
                color: 'rgba(249,247,243,0.85)',
              }}
            >
              {fmtMonto(saldos.dolares, 'DOLAR')}
            </div>
          )}
          <div style={{ marginTop: 8, color: 'rgba(249,247,243,0.72)', fontSize: 13 }}>
            {lastSesion
              ? `Última sesión ${lastSesion.fechaSesion} · ${lastSesion.local}`
              : 'Sin sesiones de control registradas'}
          </div>
        </section>

        {error && (
          <ErrorBanner text={error} />
        )}

        {/* Tabs */}
        {!wizardActive && (
          <section>
            <div
              style={{
                display: 'inline-flex',
                gap: 6,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 999,
                padding: 4,
                boxShadow: 'var(--shadow-card)',
              }}
            >
              {([
                { id: 'sesion', label: 'Sesión de control' },
                { id: 'movs', label: 'Movimientos' },
                { id: 'conciliacion', label: 'Conciliación' },
              ] as { id: CajaTab; label: string }[]).map((t) => {
                const selected = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    aria-pressed={selected}
                    className="press-feedback"
                    style={{
                      minHeight: 32,
                      padding: '0 14px',
                      borderRadius: 999,
                      background: selected ? 'var(--header-bg)' : 'transparent',
                      color: selected ? '#FDFBF8' : 'var(--text-muted)',
                      border: 0,
                      fontSize: 12.5,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Wizard activo: ocupa toda la pantalla */}
        {wizardActive && (
          <SesionWizard
            saldoRegistradoArs={saldos?.pesos ?? 0}
            saldoRegistradoUsd={saldos?.dolares ?? 0}
            onClose={() => setWizardActive(false)}
            onCompleted={async (m) => {
              setWizardActive(false);
              await refreshSesiones();
              refreshSaldos();
              refreshMes(mes);
              flashToast(m);
            }}
            onError={flashToast}
          />
        )}

        {/* TAB SESION */}
        {!wizardActive && tab === 'sesion' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <button
              type="button"
              onClick={() => setWizardActive(true)}
              className="press-feedback"
              style={{
                minHeight: 56,
                borderRadius: 'var(--radius-md)',
                background: 'var(--header-bg)',
                color: '#FDFBF8',
                fontWeight: 700,
                fontSize: 15,
                border: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.10), 0 6px 16px -4px rgba(0,0,0,0.25)',
              }}
            >
              <PlusIcon /> Nueva sesión
            </button>

            {sesionesError && (
              <ErrorBanner text={sesionesError} />
            )}

            {sesiones.length > 0 && (
              <div>
                <div style={{ marginBottom: 10, paddingLeft: 4 }}>
                  <EyebrowTag>Sesiones recientes</EyebrowTag>
                </div>
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {sesiones.map((s) => {
                    const movsDeLaSesion = items
                      .filter((it) => it.descripcion.startsWith(s.prefijo))
                      .sort((a, b) => a.fila - b.fila);
                    return (
                      <li key={s.prefijo}>
                        <SesionRow
                          sesion={s}
                          movs={movsDeLaSesion}
                          confirming={deletingPrefijo === s.prefijo}
                          onAskDelete={() => setDeletingPrefijo(s.prefijo)}
                          onCancelDelete={() => setDeletingPrefijo(null)}
                          onConfirmDelete={() => deleteSesion(s.prefijo)}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {sesiones.length === 0 && !sesionesError && (
              <div
                style={{
                  padding: '40px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  background: 'var(--bg-card-alt)',
                  border: '1px dashed var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                Sin sesiones registradas todavía. Iniciá la primera tocando &ldquo;Nueva sesión&rdquo;.
              </div>
            )}
          </section>
        )}

        {/* TAB CONCILIACION (placeholder) */}
        {!wizardActive && tab === 'conciliacion' && (
          <section
            style={{
              padding: '32px 18px',
              textAlign: 'center',
              background: 'var(--bg-card-alt)',
              border: '1px dashed var(--border-strong)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--accent-hover)',
                padding: '4px 10px',
                border: '1px solid var(--border-accent)',
                borderRadius: 999,
                display: 'inline-block',
                marginBottom: 10,
              }}
            >
              Próximo
            </div>
            <h3
              className="font-brand"
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--text)',
                fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
              }}
            >
              Conciliación con Bistrosoft
            </h3>
            <p
              style={{
                fontSize: 12.5,
                color: 'var(--text-muted)',
                marginTop: 6,
                maxWidth: 320,
                margin: '6px auto 0',
                lineHeight: 1.5,
              }}
            >
              Cruce automático de los retiros declarados contra los reportes de
              Bistrosoft. Pronto.
            </p>
          </section>
        )}

        {/* TAB MOVIMIENTOS (vista clásica) */}
        {!wizardActive && tab === 'movs' && (
          <>
        {/* Selector mes — el CTA "Agregar" se sacó porque el hero
            tiene un "Mov. rápido" siempre visible que abre el mismo
            modal desde cualquier tab. */}
        <section
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <MesSelector
            value={mes}
            available={meses}
            onChange={(m) => {
              setMes(m);
            }}
          />

          {/* Saldo del mes mostrado debajo del selector */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 4px 0',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              {tabDisplay} · neto del mes
            </span>
            <span
              className="importe"
              style={{
                fontSize: 13,
                color: saldoMes.pesos >= 0 ? 'var(--green)' : 'var(--red)',
              }}
            >
              {fmtMonto(saldoMes.pesos, 'PESO')}
              {saldoMes.dolares !== 0 && (
                <>
                  {' · '}
                  <span style={{ color: saldoMes.dolares >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {fmtMonto(saldoMes.dolares, 'DOLAR')}
                  </span>
                </>
              )}
            </span>
          </div>
        </section>

        {/* Filtros */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Buscador */}
          <div style={{ position: 'relative' }}>
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="text"
              value={filterTexto}
              onChange={(e) => setFilterTexto(e.target.value)}
              placeholder="Buscar por descripción o categoría…"
              className="input-pro"
              style={{
                width: '100%',
                paddingLeft: 34,
                paddingRight: filterTexto ? 32 : 12,
                minHeight: 40,
                fontSize: 13,
              }}
            />
            {filterTexto && (
              <button
                type="button"
                onClick={() => setFilterTexto('')}
                aria-label="Limpiar búsqueda"
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  background: 'var(--bg-subtle)',
                  border: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <CloseIcon />
              </button>
            )}
          </div>
          <FilterRow
            label="Moneda"
            options={[
              { value: 'todas', label: 'Todas' },
              { value: 'PESO', label: 'Pesos' },
              { value: 'DOLAR', label: 'Dólares' },
            ]}
            value={filterMoneda}
            onChange={(v) => setFilterMoneda(v as Moneda | 'todas')}
          />
          <FilterRow
            label="Categoría"
            options={[
              { value: 'todas', label: 'Todas' },
              ...CATEGORIAS.map((c) => ({ value: c, label: c })),
            ]}
            value={filterCategoria}
            onChange={(v) => setFilterCategoria(v as Categoria | 'todas')}
          />
          <FilterRow
            label="Orden"
            options={[
              { value: 'recientes', label: 'Recientes ↑' },
              { value: 'cronologico', label: 'Cronológico' },
            ]}
            value={orden}
            onChange={(v) => setOrden(v as 'recientes' | 'cronologico')}
          />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--text-muted)',
              padding: '4px 4px',
            }}
          >
            <input
              type="checkbox"
              checked={hideSesionRows}
              onChange={(e) => setHideSesionRows(e.target.checked)}
              style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
            />
            <span>Ocultar filas de sesiones (se ven adentro de cada sesión)</span>
          </label>
        </section>

        {/* Lista */}
        {fetching && items.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="shimmer-modern"
                style={{ height: 72, borderRadius: 14 }}
              />
            ))}
          </div>
        )}

        {!fetching && itemsFiltered.length === 0 && !error && (
          <EmptyState
            tabDisplay={tabDisplay}
            anyFilter={filterMoneda !== 'todas' || filterCategoria !== 'todas'}
            onAdd={() => setShowForm(true)}
          />
        )}

        {itemsFiltered.length > 0 && (
          <section>
            <div style={{ marginBottom: 8, paddingLeft: 4 }}>
              <EyebrowTag>Movimientos · {tabDisplay}</EyebrowTag>
            </div>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {itemsFiltered.map((m) => (
                <li key={m._localId}>
                  <MovRow mov={m} onDelete={deleteMov} />
                </li>
              ))}
            </ul>
          </section>
        )}
          </>
        )}
      </div>

      {showForm && (
        <NuevoMovSheet
          defaultFecha={todayISO()}
          onClose={() => setShowForm(false)}
          onSubmit={submitMovimiento}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

// ─── Mov row ─────────────────────────────────────────────────────

function MovRow({
  mov,
  onDelete,
}: {
  mov: OptimisticMov;
  onDelete: (m: OptimisticMov) => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isIngreso = mov.importe >= 0;
  const catColors = mov.categoria
    ? CATEGORIA_COLORS[mov.categoria as Categoria] ||
      { fg: 'var(--accent-hover)', bg: 'var(--accent-bg)' }
    : { fg: 'var(--text-muted)', bg: 'var(--bg-subtle)' };
  const canDelete = !mov._pending && !mov._failed && mov.fila >= 3;
  const fechaAR = mov.fecha
    ? (() => {
        const m = mov.fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : mov.fecha;
      })()
    : '—';
  return (
    <div
      style={{
        background: mov._failed
          ? 'var(--red-bg)'
          : confirming
          ? 'var(--red-bg)'
          : 'var(--bg-card)',
        border: `1px solid ${mov._failed || confirming ? 'var(--red)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        opacity: mov._pending ? 0.7 : 1,
        overflow: 'hidden',
        transition: 'background 180ms var(--ease-ios), border-color 180ms var(--ease-ios)',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="press-feedback"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          textAlign: 'left',
          color: 'inherit',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: isIngreso ? 'var(--green-bg)' : 'var(--red-bg)',
            color: isIngreso ? 'var(--green)' : 'var(--red)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {isIngreso ? <ArrowDownIcon /> : <ArrowUpIcon />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {mov.descripcion || '—'}
          </div>
          <div
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              marginTop: 3,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              {fechaAR}
            </span>
            {mov.categoria && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  background: catColors.bg,
                  color: catColors.fg,
                  padding: '2px 7px',
                  borderRadius: 999,
                }}
              >
                {mov.categoria}
              </span>
            )}
            {mov._pending && (
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                }}
              >
                · guardando…
              </span>
            )}
            {mov._failed && (
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: 'var(--red)',
                }}
              >
                · falló · reintentá
              </span>
            )}
          </div>
        </div>
        <div
          className="importe"
          style={{
            fontSize: 15,
            color: isIngreso ? 'var(--green)' : 'var(--red)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {isIngreso ? '+' : ''}{fmtMonto(mov.importe, mov.moneda)}
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden
          style={{
            transition: 'transform 220ms var(--ease-ios)',
            transform: expanded ? 'rotate(90deg)' : 'none',
            flexShrink: 0,
            color: 'var(--text-muted)',
          }}
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

      {/* Panel expandido — detalles + acción borrar */}
      {expanded && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            padding: '12px 14px',
            background: 'var(--bg-card-alt)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11.5 }}>
            <Detalle label="Fila Sheet" value={String(mov.fila)} mono />
            <Detalle label="Fecha" value={fechaAR} mono />
            <Detalle label="Moneda" value={mov.moneda} />
            <Detalle
              label="Tipo"
              value={isIngreso ? 'Ingreso' : 'Egreso'}
              color={isIngreso ? 'var(--green)' : 'var(--red)'}
            />
            <Detalle
              label="Importe firmado"
              value={fmtMonto(mov.importe, mov.moneda)}
              mono
              color={isIngreso ? 'var(--green)' : 'var(--red)'}
            />
            {mov.saldoCol !== null && (
              <Detalle
                label="Saldo en Sheet"
                value={fmtMonto(mov.saldoCol, mov.moneda)}
                mono
              />
            )}
          </div>
          {mov.descripcion && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--text)',
                background: 'var(--bg-card)',
                borderRadius: 8,
                padding: '8px 10px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.45,
              }}
            >
              {mov.descripcion}
            </div>
          )}
          {canDelete && !confirming && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(true);
              }}
              className="press-feedback"
              style={{
                alignSelf: 'flex-end',
                height: 32,
                padding: '0 12px',
                borderRadius: 16,
                background: 'transparent',
                border: '1px solid var(--red)',
                color: 'var(--red)',
                fontWeight: 700,
                fontSize: 11.5,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <TrashIcon /> Eliminar
            </button>
          )}
          {canDelete && confirming && (
            <div
              style={{
                display: 'flex',
                gap: 6,
                alignSelf: 'stretch',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="press-feedback"
                style={{
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 16,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  setDeleting(true);
                  await onDelete(mov);
                }}
                disabled={deleting}
                className="press-feedback"
                style={{
                  height: 32,
                  padding: '0 14px',
                  borderRadius: 16,
                  background: 'var(--red)',
                  color: '#FDFBF8',
                  border: 0,
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: deleting ? 'wait' : 'pointer',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? 'Borrando…' : 'Sí, borrar'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Detalle({
  label,
  value,
  mono,
  color,
}: {
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginBottom: 1,
        }}
      >
        {label}
      </div>
      <div
        className={mono ? 'importe' : undefined}
        style={{
          fontSize: 13,
          fontWeight: mono ? 700 : 600,
          color: color || 'var(--text)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
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

// ─── Selector de mes ─────────────────────────────────────────────

function MesSelector({
  value,
  available,
  onChange,
}: {
  value: string;
  available: string[];
  onChange: (iso: string) => void;
}) {
  // Si el value no está en available todavía (porque no se cargó la
  // lista o porque es un mes futuro), igual lo mostramos.
  const list = useMemo(() => {
    const set = new Set(available);
    if (!set.has(value)) set.add(value);
    return Array.from(set).sort().reverse();
  }, [available, value]);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Seleccionar mes"
      style={{
        flex: 1,
        minHeight: 'var(--touch-min)',
        padding: '0 12px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        color: 'var(--text)',
        fontSize: 13.5,
        fontWeight: 600,
        boxShadow: 'var(--shadow-card)',
        appearance: 'none',
        backgroundImage:
          "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B7D72' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
        backgroundSize: '12px',
        paddingRight: 36,
      }}
    >
      {list.map((iso) => (
        <option key={iso} value={iso}>
          {mesTabFromISO(`${iso}-01`) || iso}
        </option>
      ))}
    </select>
  );
}

// ─── Filter row ──────────────────────────────────────────────────

function FilterRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          flexShrink: 0,
          width: 64,
        }}
      >
        {label}
      </span>
      <div
        className="hide-scrollbar"
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 2,
          scrollSnapType: 'x mandatory',
          flex: 1,
        }}
      >
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => onChange(o.value)}
              className="press-feedback"
              aria-pressed={selected}
              style={{
                minHeight: 32,
                padding: '0 11px',
                borderRadius: 999,
                background: selected ? 'var(--accent)' : 'var(--bg-card)',
                color: selected ? '#FDFBF8' : 'var(--text-muted)',
                border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                fontSize: 11.5,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                flexShrink: 0,
                scrollSnapAlign: 'start',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Nuevo movimiento — bottom sheet ────────────────────────────

function NuevoMovSheet({
  defaultFecha,
  onClose,
  onSubmit,
}: {
  defaultFecha: string;
  onClose: () => void;
  onSubmit: (input: {
    tipo: Tipo;
    fecha: string;
    moneda: Moneda;
    categoria: Categoria;
    descripcion: string;
    importeAbs: number;
  }) => Promise<boolean>;
}) {
  const [fecha, setFecha] = useState(defaultFecha);
  const [moneda, setMoneda] = useState<Moneda>('PESO');
  const [categoria, setCategoria] = useState<Categoria | '__NEW__'>('BISTRO');
  const [customCategoria, setCustomCategoria] = useState('');
  const [descripcion, setDescripcion] = useState('');
  // Importe puede ser positivo (ingreso) o negativo (egreso). El signo
  // determina el tipo: + = INGRESO, − = EGRESO. Sin botones aparte.
  const [importeRaw, setImporteRaw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // El raw es lo que tipea el user (puede tener "-", separadores, etc).
  // Lo parseamos a número con signo para validar y previsualizar.
  const importeNum = parseMontoInput(importeRaw);
  const tipo: Tipo = importeNum >= 0 ? 'INGRESO' : 'EGRESO';
  const tipoColor = importeNum > 0
    ? 'var(--green)'
    : importeNum < 0
    ? 'var(--red)'
    : 'var(--text-muted)';

  const submit = useCallback(async () => {
    if (saving) return;
    setError(null);
    if (!descripcion.trim()) {
      setError('Descripción vacía');
      return;
    }
    if (importeNum === 0) {
      setError('Importe en 0 — ingresá un monto');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      setError('Fecha inválida');
      return;
    }
    // Resolver categoría final: si eligió "+ Nueva categoría" usar el
    // texto custom; si no, el valor del select. Trim + uppercase
    // para mantener la convención del Sheet.
    const finalCategoria: Categoria =
      categoria === '__NEW__'
        ? ((customCategoria.trim().toUpperCase() || 'BISTRO') as Categoria)
        : (categoria as Categoria);
    if (categoria === '__NEW__' && !customCategoria.trim()) {
      setError('Cargá el nombre de la nueva categoría.');
      return;
    }
    setSaving(true);
    const ok = await onSubmit({
      tipo,
      fecha,
      moneda,
      categoria: finalCategoria,
      descripcion: descripcion.trim(),
      importeAbs: Math.abs(importeNum),
    });
    setSaving(false);
    if (ok) onClose();
  }, [
    saving, descripcion, importeNum, fecha, tipo, moneda, categoria,
    customCategoria, onSubmit, onClose,
  ]);

  // Portaleamos a document.body porque el wrapper de /caja tiene
  // .page-enter con transform que crea un stacking context propio.
  // Sin portal, no podemos subir arriba del BottomNav (z=110) que
  // ya está portaleado al body.
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
          // El BottomNav usa zIndex 110, así que el overlay tiene que
          // estar arriba (115) para que cubra también el nav, y el
          // sheet aún más alto (120) para que su footer Cancelar/Guardar
          // no quede tapado por el nav.
          zIndex: 115,
          animation: 'fadeIn 0.22s var(--ease-ios) both',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo movimiento"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '92vh',
          background: 'var(--bg)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          boxShadow: '0 -16px 40px rgba(0,0,0,0.18)',
          zIndex: 120,
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: 'var(--safe-bottom)',
          animation: 'sheetSlideUp 0.32s var(--ease-out-expo) both',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
          <div
            style={{
              width: 38,
              height: 4,
              borderRadius: 999,
              background: 'var(--border-strong)',
              opacity: 0.5,
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            padding: '4px 20px 12px',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              · Caja efectivo
            </div>
            <h2
              className="font-brand"
              style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.022em', marginTop: 2 }}
            >
              Nuevo movimiento
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="press-feedback"
            aria-label="Cerrar"
            style={{
              width: 'var(--touch-min)',
              height: 'var(--touch-min)',
              borderRadius: '50%',
              background: 'var(--bg-subtle)',
              border: 0,
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CloseIcon />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {/* Fecha — por default asume hoy. El help text cambia según
              si el usuario dejó la fecha en hoy o la cambió a otra:
              en el primer caso le recordamos que puede modificarla;
              en el segundo le mostramos a qué tab del Sheet va a ir. */}
          <FieldLabel
            label="Fecha"
            help={
              fecha === todayISO()
                ? 'Hoy. Si el movimiento no es de hoy, modificá esta fecha.'
                : `Va al tab "${mesTabFromISO(fecha.slice(0, 7) + '-01') || ''}"`
            }
          >
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="input-pro tabular-nums-strict"
              style={{ minHeight: 'var(--touch-min)' }}
            />
          </FieldLabel>

          {/* Moneda — dropdown compacto en lugar de 2 botones grandes */}
          <FieldLabel label="Moneda">
            <select
              value={moneda}
              onChange={(e) => setMoneda(e.target.value as Moneda)}
              className="input-pro"
              style={{ minHeight: 'var(--touch-min)' }}
            >
              <option value="PESO">Pesos · $</option>
              <option value="DOLAR">Dólares · US$</option>
            </select>
          </FieldLabel>

          {/* Categoría — dropdown compacto + opción "Nueva categoría"
              que abre un input libre. Si el user elige "Nueva categoría"
              el submit usa customCategoria en vez del valor del select. */}
          <FieldLabel label="Categoría">
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as Categoria | '__NEW__')}
              className="input-pro"
              style={{ minHeight: 'var(--touch-min)' }}
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="__NEW__">+ Nueva categoría…</option>
            </select>
          </FieldLabel>
          {categoria === '__NEW__' && (
            <FieldLabel label="Nombre de la nueva categoría">
              <input
                type="text"
                value={customCategoria}
                onChange={(e) =>
                  setCustomCategoria(e.target.value.toUpperCase().slice(0, 30))
                }
                placeholder="ej. EQUIPOS"
                className="input-pro"
                style={{
                  minHeight: 'var(--touch-min)',
                  letterSpacing: '0.02em',
                }}
              />
            </FieldLabel>
          )}

          {/* Descripción */}
          <FieldLabel label="Descripción">
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Pago alquiler Nicaragua mayo"
              maxLength={300}
              className="input-pro"
              style={{ minHeight: 'var(--touch-min)' }}
            />
          </FieldLabel>

          {/* Importe con signo — − = egreso (rojo), + = ingreso (verde) */}
          <FieldLabel
            label="Importe"
            help="Anteponé un menos si es egreso. Ej: -50000 = egreso de $50.000."
          >
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                  fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
                }}
              >
                {MONEDA_SYMBOLS[moneda]}
              </span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9\-.,]*"
                value={importeRaw}
                onChange={(e) => setImporteRaw(formatMontoLive(e.target.value))}
                placeholder="0 ó -0 para egreso"
                className="input-pro tabular-nums-strict"
                style={{
                  minHeight: 'var(--touch-min)',
                  paddingLeft: moneda === 'DOLAR' ? 50 : 32,
                  fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
                  fontSize: 17,
                  fontWeight: 700,
                  color: tipoColor,
                  borderColor:
                    importeNum > 0
                      ? 'var(--green)'
                      : importeNum < 0
                      ? 'var(--red)'
                      : undefined,
                }}
              />
            </div>
            {importeNum !== 0 && (
              <span
                className="tabular-nums-strict"
                style={{
                  marginTop: 6,
                  fontSize: 11.5,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: tipoColor,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: tipoColor,
                  }}
                />
                {tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'} ·{' '}
                {Math.round(Math.abs(importeNum)).toLocaleString('es-AR')}{' '}
                {MONEDA_SYMBOLS[moneda]}
              </span>
            )}
          </FieldLabel>

          {error && (
            <div
              role="alert"
              style={{
                background: 'var(--red-bg)',
                border: '1px solid var(--red)',
                borderRadius: 'var(--radius-md)',
                padding: 10,
                fontSize: 12.5,
                color: 'var(--red)',
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.5fr',
            gap: 8,
            padding: 12,
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="press-feedback"
            style={{
              minHeight: 'var(--touch-min)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || importeNum === 0}
            className="press-feedback"
            style={{
              minHeight: 'var(--touch-min)',
              borderRadius: 'var(--radius-md)',
              background:
                importeNum > 0
                  ? 'var(--green)'
                  : importeNum < 0
                  ? 'var(--red)'
                  : 'var(--bg-subtle)',
              color: importeNum !== 0 ? '#FDFBF8' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: 14,
              border: 0,
              opacity: saving ? 0.6 : 1,
              cursor: saving ? 'wait' : importeNum === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {saving
              ? 'Guardando…'
              : importeNum === 0
              ? 'Ingresá un monto'
              : `Agregar ${TIPO_LABELS[tipo].toLowerCase()}`}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

function BigToggle({
  label,
  selected,
  tone,
  onClick,
}: {
  label: string;
  selected: boolean;
  tone: 'green' | 'red';
  onClick: () => void;
}) {
  const color = tone === 'green' ? 'var(--green)' : 'var(--red)';
  const bg = tone === 'green' ? 'var(--green-bg)' : 'var(--red-bg)';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="press-feedback"
      style={{
        minHeight: 54,
        borderRadius: 'var(--radius-md)',
        background: selected ? bg : 'var(--bg-card)',
        border: `1.5px solid ${selected ? color : 'var(--border)'}`,
        color: selected ? color : 'var(--text-muted)',
        fontWeight: 700,
        fontSize: 15,
        letterSpacing: '-0.005em',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      {tone === 'green' ? <ArrowDownIcon /> : <ArrowUpIcon />}
      {label}
    </button>
  );
}

function ChipButton({
  label,
  selected,
  onClick,
  small,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="press-feedback"
      style={{
        minHeight: 'var(--touch-min)',
        borderRadius: 'var(--radius-md)',
        background: selected ? 'var(--accent-bg)' : 'var(--bg-card)',
        border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        color: selected ? 'var(--accent-hover)' : 'var(--text)',
        fontWeight: 600,
        fontSize: small ? 11.5 : 13,
        letterSpacing: '-0.005em',
        cursor: 'pointer',
        padding: small ? '0 8px' : '0 12px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {label}
    </button>
  );
}

function FieldLabel({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </span>
      {children}
      {help && (
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          {help}
        </span>
      )}
    </label>
  );
}

// ─── Banners / states ───────────────────────────────────────────

function ErrorBanner({ text }: { text: string }) {
  return (
    <div
      role="alert"
      style={{
        background: 'var(--critical-bg)',
        border: '1px solid var(--critical)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        fontSize: 12.5,
        color: 'var(--critical)',
        lineHeight: 1.45,
      }}
    >
      <strong style={{ display: 'block', marginBottom: 2 }}>Error</strong>
      {text}
    </div>
  );
}

function EmptyState({
  tabDisplay,
  anyFilter,
  onAdd,
}: {
  tabDisplay: string;
  anyFilter: boolean;
  onAdd: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '40px 16px',
      }}
    >
      <svg
        width="44"
        height="44"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--text-dim)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <circle cx="12" cy="12.5" r="2.5" />
      </svg>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginTop: 10 }}>
        Sin movimientos en {tabDisplay}
      </h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, maxWidth: 280, lineHeight: 1.45 }}>
        {anyFilter
          ? 'No hay movimientos que coincidan con los filtros.'
          : 'Cargá el primer movimiento del mes.'}
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="press-feedback"
        style={{
          marginTop: 16,
          minHeight: 'var(--touch-min)',
          borderRadius: 'var(--radius-md)',
          padding: '0 20px',
          background: 'var(--accent)',
          color: '#FDFBF8',
          fontWeight: 600,
          fontSize: 14,
          border: 0,
        }}
      >
        Agregar movimiento
      </button>
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(var(--nav-height) + var(--safe-bottom) + 14px)',
        zIndex: 1000,
        background: 'var(--header-bg)',
        color: 'var(--text-inverse)',
        borderRadius: 14,
        padding: '10px 16px',
        fontSize: 13,
        fontWeight: 600,
        maxWidth: 'calc(100vw - 32px)',
        boxShadow: 'var(--shadow-float)',
        animation: 'toastIn 0.5s var(--ease-spring)',
      }}
    >
      {message}
    </div>
  );
}

// ─── Iconos ──────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 3l8 8M11 3l-8 8" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function ArrowDownIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14m-6-6 6 6 6-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ArrowUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 19V5m6 6-6-6-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Sesion row ──────────────────────────────────────────────────

function SesionRow({
  sesion,
  movs,
  confirming,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  sesion: SesionResumenAPI;
  movs: OptimisticMov[];
  confirming: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalArs = sesion.retiradoArs - sesion.gastadoArs + sesion.diferenciaArs;
  // Sacar el turno del prefijo si está en el formato nuevo
  const parsed = parsePrefijoSesion(sesion.prefijo);
  const turno = parsed?.turno || '';
  const fechaAuditada = parsed?.fechaAuditada || '';
  return (
    <div
      style={{
        background: confirming ? 'var(--red-bg)' : 'var(--bg-card)',
        border: `1px solid ${confirming ? 'var(--red)' : expanded ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
        transition: 'background 180ms var(--ease-ios), border-color 180ms var(--ease-ios)',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="press-feedback"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          textAlign: 'left',
          color: 'inherit',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {sesion.fechaSesion} · {sesion.local}
            {turno && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--accent-hover)',
                  background: 'var(--accent-bg)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  marginLeft: 8,
                  verticalAlign: 'middle',
                }}
              >
                {turno}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--text-muted)',
              marginTop: 3,
            }}
          >
            Retiró {fmtMonto(sesion.retiradoArs, 'PESO')} · Gastó {fmtMonto(sesion.gastadoArs, 'PESO')}
            {Math.round(sesion.diferenciaArs) !== 0 && (
              <span style={{ color: 'var(--warn-strong)', fontWeight: 600 }}>
                {' · '}dif {fmtMonto(sesion.diferenciaArs, 'PESO')}
              </span>
            )}
            {fechaAuditada && (
              <span style={{ marginLeft: 6, color: 'var(--text-faint)' }}>
                · cierra caja del {fechaAuditada}
              </span>
            )}
          </div>
        </div>
        <div
          className="importe"
          style={{
            fontSize: 16,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {fmtMonto(totalArs, 'PESO')}
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden
          style={{
            transition: 'transform 220ms var(--ease-ios)',
            transform: expanded ? 'rotate(90deg)' : 'none',
            flexShrink: 0,
            color: 'var(--text-muted)',
          }}
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

      {expanded && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-card-alt)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Detalles compactos arriba */}
          <div
            style={{
              padding: '10px 14px 8px',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
              borderBottom: movs.length > 0 ? '1px solid var(--border)' : 'none',
            }}
          >
            <Detalle label="Retiró" value={fmtMonto(sesion.retiradoArs, 'PESO')} mono color="var(--green)" />
            <Detalle label="Gastó" value={fmtMonto(sesion.gastadoArs, 'PESO')} mono color="var(--red)" />
            <Detalle
              label="Diferencia"
              value={fmtMonto(sesion.diferenciaArs, 'PESO')}
              mono
              color={Math.abs(sesion.diferenciaArs) > 0 ? 'var(--warn-strong)' : 'var(--text-muted)'}
            />
            {sesion.retiradoUsd > 0 && (
              <Detalle label="Retiró USD" value={fmtMonto(sesion.retiradoUsd, 'DOLAR')} mono color="var(--green)" />
            )}
            {sesion.gastadoUsd > 0 && (
              <Detalle label="Gastó USD" value={fmtMonto(sesion.gastadoUsd, 'DOLAR')} mono color="var(--red)" />
            )}
            <Detalle label="Filas Sheet" value={String(sesion.totalRows)} mono />
          </div>

          {/* Lista de movs */}
          {movs.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '8px 8px',
              }}
            >
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  padding: '0 6px 4px',
                }}
              >
                Movimientos · {movs.length}
              </div>
              {movs.map((m) => {
                const ingreso = m.importe >= 0;
                const cat = m.categoria
                  ? CATEGORIA_COLORS[m.categoria as Categoria] ||
                    { fg: 'var(--accent-hover)', bg: 'var(--accent-bg)' }
                  : { fg: 'var(--text-muted)', bg: 'var(--bg-subtle)' };
                // Limpiamos el prefijo del concepto para mostrar solo lo útil
                const conceptoLimpio = m.descripcion
                  .replace(sesion.prefijo, '')
                  .replace(/^\s*·\s*/, '')
                  .trim();
                return (
                  <div
                    key={m._localId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      background: 'var(--bg-card)',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: 'var(--text)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {conceptoLimpio || '(sin descripción)'}
                      </div>
                      {m.categoria && (
                        <span
                          style={{
                            display: 'inline-block',
                            marginTop: 2,
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            background: cat.bg,
                            color: cat.fg,
                            padding: '1px 6px',
                            borderRadius: 999,
                          }}
                        >
                          {m.categoria}
                        </span>
                      )}
                    </div>
                    <div
                      className="importe"
                      style={{
                        fontSize: 13,
                        color: ingreso ? 'var(--green)' : 'var(--red)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ingreso ? '+' : ''}
                      {fmtMonto(m.importe, m.moneda)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Acciones */}
          <div
            style={{
              padding: '8px 14px 12px',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 6,
            }}
          >
            {!confirming ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAskDelete();
                }}
                className="press-feedback"
                style={{
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 16,
                  background: 'transparent',
                  border: '1px solid var(--red)',
                  color: 'var(--red)',
                  fontWeight: 700,
                  fontSize: 11.5,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Eliminar sesión
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelDelete();
                  }}
                  className="press-feedback"
                  style={{
                    height: 32,
                    padding: '0 12px',
                    borderRadius: 16,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                    fontSize: 11.5,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onConfirmDelete();
                  }}
                  className="press-feedback"
                  style={{
                    height: 32,
                    padding: '0 14px',
                    borderRadius: 16,
                    background: 'var(--red)',
                    color: '#FDFBF8',
                    border: 0,
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Sí, borrar todo
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
