'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import EyebrowTag from '../components/EyebrowTag';
import {
  CATEGORIAS,
  CATEGORIA_COLORS,
  MONEDA_SYMBOLS,
  TIPO_LABELS,
  fmtMonto,
  mesTabFromISO,
  nuevoIdMov,
  parseMontoInput,
  type Categoria,
  type Moneda,
  type MovimientoCaja,
  type Tipo,
} from '@/lib/caja';

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

  useEffect(() => {
    if (loading || !user) return;
    if (!isOwner) {
      router.replace('/');
      return;
    }
    refreshMes(mes);
    refreshSaldos();
  }, [loading, user, isOwner, mes, refreshMes, refreshSaldos, router]);

  const flashToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 2400);
  }, []);

  // Filtros aplicados a items
  const itemsFiltered = useMemo(() => {
    let list = items;
    if (filterMoneda !== 'todas') list = list.filter((i) => i.moneda === filterMoneda);
    if (filterCategoria !== 'todas') list = list.filter((i) => i.categoria === filterCategoria);
    return list;
  }, [items, filterMoneda, filterCategoria]);

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

  if (loading || !user) return null;
  if (!isOwner) return null;

  const tabDisplay = tabName || mesTabFromISO(`${mes}-01`) || mes;

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
        {/* Hero — saldo global */}
        <section
          className="lh-hero-total spring-in"
          style={{ padding: '20px 22px' }}
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
            Saldo total · efectivo
          </div>
          <div
            className="font-brand heading-tight-lg tabular-nums-strict"
            style={{
              fontSize: 36,
              fontWeight: 700,
              lineHeight: 1,
              color: '#F9F7F3',
              fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            }}
          >
            {saldos ? fmtMonto(saldos.pesos, 'PESO') : '—'}
          </div>
          {saldos && saldos.dolares !== 0 && (
            <div
              className="tabular-nums-strict"
              style={{
                marginTop: 4,
                fontSize: 14,
                color: 'rgba(249,247,243,0.85)',
                fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
                fontWeight: 600,
              }}
            >
              {fmtMonto(saldos.dolares, 'DOLAR')}
            </div>
          )}
          <div style={{ marginTop: 8, color: 'rgba(249,247,243,0.72)', fontSize: 13 }}>
            Acumulado en todas las pestañas del Sheet
          </div>
        </section>

        {error && (
          <ErrorBanner text={error} />
        )}

        {/* Selector mes + filtros + CTA */}
        <section
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <MesSelector
              value={mes}
              available={meses}
              onChange={(m) => {
                setMes(m);
              }}
            />
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="press-feedback"
              aria-label="Nuevo movimiento"
              style={{
                minHeight: 'var(--touch-min)',
                padding: '0 16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--accent)',
                color: '#FDFBF8',
                fontWeight: 600,
                fontSize: 13,
                border: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.10), 0 6px 16px -4px rgba(184,149,111,0.45)',
              }}
            >
              <PlusIcon /> Agregar
            </button>
          </div>

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
              className="tabular-nums-strict"
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: saldoMes.pesos >= 0 ? 'var(--green)' : 'var(--red)',
                fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
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
                  <MovRow mov={m} />
                </li>
              ))}
            </ul>
          </section>
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

function MovRow({ mov }: { mov: OptimisticMov }) {
  const isIngreso = mov.importe >= 0;
  const catColors = mov.categoria
    ? CATEGORIA_COLORS[mov.categoria]
    : { fg: 'var(--text-muted)', bg: 'var(--bg-subtle)' };
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        background: mov._failed ? 'var(--red-bg)' : 'var(--bg-card)',
        border: `1px solid ${mov._failed ? 'var(--red)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        opacity: mov._pending ? 0.7 : 1,
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
            {mov.fecha || '—'}
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
        className="tabular-nums-strict"
        style={{
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          fontWeight: 700,
          fontSize: 15,
          color: isIngreso ? 'var(--green)' : 'var(--red)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {isIngreso ? '+' : ''}{fmtMonto(mov.importe, mov.moneda)}
      </div>
    </div>
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
  const [tipo, setTipo] = useState<Tipo>('EGRESO');
  const [fecha, setFecha] = useState(defaultFecha);
  const [moneda, setMoneda] = useState<Moneda>('PESO');
  const [categoria, setCategoria] = useState<Categoria>('BISTRO');
  const [descripcion, setDescripcion] = useState('');
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

  const importeNum = parseMontoInput(importeRaw);
  const importeDisplay = importeNum > 0 ? Math.round(importeNum).toLocaleString('es-AR') : '';

  const submit = useCallback(async () => {
    if (saving) return;
    setError(null);
    if (!descripcion.trim()) {
      setError('Descripción vacía');
      return;
    }
    if (importeNum <= 0) {
      setError('Importe inválido (mayor a 0)');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      setError('Fecha inválida');
      return;
    }
    setSaving(true);
    const ok = await onSubmit({
      tipo,
      fecha,
      moneda,
      categoria,
      descripcion: descripcion.trim(),
      importeAbs: importeNum,
    });
    setSaving(false);
    if (ok) onClose();
  }, [saving, descripcion, importeNum, fecha, tipo, moneda, categoria, onSubmit, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(4px)',
          zIndex: 90,
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
          zIndex: 100,
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
          {/* Tipo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <BigToggle
              label="Ingreso"
              selected={tipo === 'INGRESO'}
              tone="green"
              onClick={() => setTipo('INGRESO')}
            />
            <BigToggle
              label="Egreso"
              selected={tipo === 'EGRESO'}
              tone="red"
              onClick={() => setTipo('EGRESO')}
            />
          </div>

          {/* Fecha */}
          <FieldLabel
            label="Fecha"
            help={`Va al tab "${mesTabFromISO(fecha.slice(0, 7) + '-01') || ''}"`}
          >
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="input-pro tabular-nums-strict"
              style={{ minHeight: 'var(--touch-min)' }}
            />
          </FieldLabel>

          {/* Moneda */}
          <FieldLabel label="Moneda">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <ChipButton
                label="Pesos · $"
                selected={moneda === 'PESO'}
                onClick={() => setMoneda('PESO')}
              />
              <ChipButton
                label="Dólares · US$"
                selected={moneda === 'DOLAR'}
                onClick={() => setMoneda('DOLAR')}
              />
            </div>
          </FieldLabel>

          {/* Categoría */}
          <FieldLabel label="Categoría">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 6,
              }}
            >
              {CATEGORIAS.map((c) => (
                <ChipButton
                  key={c}
                  label={c}
                  selected={categoria === c}
                  onClick={() => setCategoria(c)}
                  small
                />
              ))}
            </div>
          </FieldLabel>

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

          {/* Importe */}
          <FieldLabel label="Importe (positivo)" help="Mostrá el valor absoluto. El signo lo aplica el tipo.">
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
                inputMode="decimal"
                value={importeDisplay}
                onChange={(e) => setImporteRaw(e.target.value)}
                placeholder="0"
                className="input-pro tabular-nums-strict"
                style={{
                  minHeight: 'var(--touch-min)',
                  paddingLeft: moneda === 'DOLAR' ? 50 : 32,
                  fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
                  fontSize: 17,
                  fontWeight: 700,
                }}
              />
            </div>
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
            disabled={saving}
            className="press-feedback"
            style={{
              minHeight: 'var(--touch-min)',
              borderRadius: 'var(--radius-md)',
              background: tipo === 'INGRESO' ? 'var(--green)' : 'var(--accent)',
              color: '#FDFBF8',
              fontWeight: 700,
              fontSize: 14,
              border: 0,
              opacity: saving ? 0.6 : 1,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Guardando…' : `Agregar ${TIPO_LABELS[tipo].toLowerCase()}`}
          </button>
        </div>
      </div>
    </>
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
