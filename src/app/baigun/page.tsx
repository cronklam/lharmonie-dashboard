'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import EyebrowTag from '../components/EyebrowTag';
import { fmtMonto } from '@/lib/caja';
import type { BaigunMov } from '@/lib/baigun-cta-cte';
import { mesActual, fechaHoyAR, mesToTab } from '@/lib/baigun-cta-cte';

// Baigun — cuenta corriente del subarriendo Libertador (LH5).
// 3 vistas: Resumen (default, mes en curso), Histórico (cta cte completa),
// Calendario (días de vencimiento + estado).

type Vista = 'resumen' | 'historico' | 'calendario';

const VISTAS: Array<{ id: Vista; label: string }> = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'historico', label: 'Histórico' },
  { id: 'calendario', label: 'Calendario' },
];

function fmtMontoPesos(n: number): string {
  return fmtMonto(n, 'PESO');
}

export default function BaigunPage() {
  const { user, loading, isOwner } = useAuth();
  const router = useRouter();

  const [vista, setVista] = useState<Vista>('resumen');
  const [mes, setMes] = useState<string>(mesActual());
  const [items, setItems] = useState<BaigunMov[]>([]);
  const [saldoTotal, setSaldoTotal] = useState(0);
  const [saldoMes, setSaldoMes] = useState(0);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  // Filtros para Histórico
  const [filtroMes, setFiltroMes] = useState<string>('');
  const [filtroServicio, setFiltroServicio] = useState<string>('');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [filtroFuente, setFiltroFuente] = useState<string>('todos');

  const [modalPago, setModalPago] = useState(false);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalDetalle, setModalDetalle] = useState<BaigunMov | null>(null);
  const [generando, setGenerando] = useState(false);

  const flashToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 3000);
  }, []);

  const refresh = useCallback(
    async (mesFiltro: string = '') => {
      setFetching(true);
      try {
        const qs = mesFiltro ? `?mes=${mesFiltro}` : '';
        const r = await fetch(`/api/baigun/cta-cte${qs}`, { cache: 'no-store' });
        const d = await r.json();
        if (d.ok) {
          setItems(d.items || []);
          setSaldoTotal(d.saldoTotal || 0);
          setSaldoMes(d.saldoMes || 0);
          setError(null);
        } else {
          setError(d.error || 'Error');
        }
      } catch {
        setError('Error de red');
      } finally {
        setFetching(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (loading || !user) return;
    if (!isOwner) {
      router.replace('/');
      return;
    }
    // En vista resumen filtramos por el mes seleccionado.
    refresh(vista === 'resumen' || vista === 'calendario' ? mes : '');
  }, [loading, user, isOwner, refresh, router, vista, mes]);

  if (loading || !user) return null;
  if (!isOwner) return null;

  // ─── Lista de meses disponibles ──────────────────────────────────
  const mesesDisponibles = useMemo(() => {
    const set = new Set<string>();
    set.add(mesActual());
    for (const m of items) {
      if (m.mesOrigen) set.add(m.mesOrigen);
    }
    return Array.from(set).sort().reverse();
  }, [items]);

  // ─── Servicios únicos del histórico ──────────────────────────────
  const serviciosDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const m of items) if (m.servicioRef) set.add(m.servicioRef);
    return Array.from(set).sort();
  }, [items]);

  const generarMes = useCallback(async () => {
    if (generando) return;
    setGenerando(true);
    try {
      const r = await fetch('/api/baigun/derivar-mes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes }),
      });
      const d = await r.json();
      if (d.ok) {
        flashToast(
          `+${d.agregados} cargo${d.agregados !== 1 ? 's' : ''} · ${d.actualizados} actualizado${d.actualizados !== 1 ? 's' : ''} · ${d.sinCambios} sin cambios${d.sinPagar?.length ? ` · ${d.sinPagar.length} sin pagar` : ''}`,
        );
        await refresh(mes);
      } else {
        flashToast(d.error || 'Error generando cargos');
      }
    } catch {
      flashToast('Error de red');
    } finally {
      setGenerando(false);
    }
  }, [generando, mes, refresh, flashToast]);

  return (
    <div className="page-enter">
      <PageHeader
        title="Baigun"
        subtitle="Cuenta corriente · subarriendo LH5"
        showBack
      />
      <div
        className="px-4 pt-3 lh-inicio-stagger"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          paddingBottom: 'calc(var(--nav-height) + var(--safe-bottom) + 80px)',
        }}
      >
        {/* Segmented control de vistas */}
        <div
          role="tablist"
          style={{
            display: 'flex',
            gap: 4,
            padding: 4,
            background: 'var(--bg-subtle)',
            borderRadius: 999,
            border: '1px solid var(--border)',
          }}
        >
          {VISTAS.map((v) => {
            const active = vista === v.id;
            return (
              <button
                key={v.id}
                role="tab"
                onClick={() => setVista(v.id)}
                className="press-feedback"
                style={{
                  flex: 1,
                  height: 36,
                  borderRadius: 999,
                  border: 0,
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? '#FDFBF8' : 'var(--text-muted)',
                  fontSize: 12.5,
                  fontWeight: active ? 700 : 500,
                  letterSpacing: active ? '0.02em' : 'normal',
                  cursor: 'pointer',
                  transition: 'background 0.18s, color 0.18s',
                }}
              >
                {v.label}
              </button>
            );
          })}
        </div>

        {/* Selector de mes (resumen/calendario) */}
        {(vista === 'resumen' || vista === 'calendario') && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500 }}>
              Mes:
            </label>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              style={{
                flex: 1,
                height: 36,
                padding: '0 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text)',
                fontSize: 13,
              }}
            >
              {mesesDisponibles.map((m) => (
                <option key={m} value={m}>
                  {m} · {mesToTab(m) || m}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
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
            {error}
          </div>
        )}

        {fetching && items.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="shimmer-modern"
                style={{ height: 76, borderRadius: 14 }}
              />
            ))}
          </div>
        )}

        {/* ─── VISTA A: RESUMEN ──────────────────────────────────────── */}
        {vista === 'resumen' && !fetching && (
          <VistaResumen
            mes={mes}
            items={items}
            saldoTotal={saldoTotal}
            saldoMes={saldoMes}
            onAbrirPago={() => setModalPago(true)}
            onGenerarMes={generarMes}
            generando={generando}
            onTapServicio={(srv) => {
              setFiltroServicio(srv);
              setFiltroMes('');
              setVista('historico');
            }}
          />
        )}

        {/* ─── VISTA B: HISTÓRICO ─────────────────────────────────────── */}
        {vista === 'historico' && !fetching && (
          <VistaHistorico
            items={items}
            filtroMes={filtroMes}
            filtroServicio={filtroServicio}
            filtroTipo={filtroTipo}
            filtroFuente={filtroFuente}
            setFiltroMes={setFiltroMes}
            setFiltroServicio={setFiltroServicio}
            setFiltroTipo={setFiltroTipo}
            setFiltroFuente={setFiltroFuente}
            mesesDisponibles={mesesDisponibles}
            serviciosDisponibles={serviciosDisponibles}
            onTapItem={(m) => setModalDetalle(m)}
            onNuevo={() => setModalNuevo(true)}
          />
        )}

        {/* ─── VISTA C: CALENDARIO ────────────────────────────────────── */}
        {vista === 'calendario' && !fetching && (
          <VistaCalendario mes={mes} items={items} />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: 'calc(var(--nav-height) + var(--safe-bottom) + 16px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--text)',
            color: 'var(--bg-card)',
            padding: '10px 18px',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
            zIndex: 250,
            maxWidth: '92vw',
          }}
        >
          {toast}
        </div>
      )}

      {/* Modal pago */}
      {modalPago && (
        <RegistrarPagoBaigunModal
          mes={mes}
          onClose={() => setModalPago(false)}
          onSaved={async () => {
            setModalPago(false);
            flashToast('Pago registrado');
            await refresh(vista === 'historico' ? '' : mes);
          }}
          onError={flashToast}
        />
      )}

      {/* Modal nuevo movimiento manual */}
      {modalNuevo && (
        <NuevoMovBaigunModal
          mes={mes}
          servicios={serviciosDisponibles}
          onClose={() => setModalNuevo(false)}
          onSaved={async () => {
            setModalNuevo(false);
            flashToast('Movimiento agregado');
            await refresh(vista === 'historico' ? '' : mes);
          }}
          onError={flashToast}
        />
      )}

      {/* Modal detalle */}
      {modalDetalle && (
        <DetalleMovModal
          mov={modalDetalle}
          isOwner={isOwner}
          onClose={() => setModalDetalle(null)}
          onChanged={async () => {
            setModalDetalle(null);
            await refresh(vista === 'historico' ? '' : mes);
          }}
          onError={flashToast}
        />
      )}
    </div>
  );
}

// ─── Vista Resumen ──────────────────────────────────────────────────

function VistaResumen({
  mes,
  items,
  saldoTotal,
  saldoMes,
  onAbrirPago,
  onGenerarMes,
  generando,
  onTapServicio,
}: {
  mes: string;
  items: BaigunMov[];
  saldoTotal: number;
  saldoMes: number;
  onAbrirPago: () => void;
  onGenerarMes: () => void;
  generando: boolean;
  onTapServicio: (srv: string) => void;
}) {
  // Cargos y pagos del mes
  const cargosMes = useMemo(
    () =>
      items
        .filter((m) => m.mesOrigen === mes && m.tipo === 'cargo')
        .reduce((s, m) => s + m.monto, 0),
    [items, mes],
  );
  const pagosMes = useMemo(
    () =>
      items
        .filter((m) => m.mesOrigen === mes && m.tipo === 'pago')
        .reduce((s, m) => s + m.monto, 0),
    [items, mes],
  );

  // Tabla por servicio: agrupamos cargos del mes por servicioRef
  const porServicio = useMemo(() => {
    const map = new Map<
      string,
      { servicio: string; cargosMes: number; pagosMes: number; saldo: number }
    >();
    for (const m of items) {
      if (!m.servicioRef) continue;
      const cur = map.get(m.servicioRef) || {
        servicio: m.servicioRef,
        cargosMes: 0,
        pagosMes: 0,
        saldo: 0,
      };
      if (m.mesOrigen === mes && m.tipo === 'cargo') cur.cargosMes += m.monto;
      if (m.mesOrigen === mes && m.tipo === 'pago') cur.pagosMes += m.monto;
      // saldo del servicio en histórico (cargo - pago - ajuste positivos sumados)
      if (m.tipo === 'cargo') cur.saldo += m.monto;
      else if (m.tipo === 'pago') cur.saldo -= m.monto;
      map.set(m.servicioRef, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.cargosMes - a.cargosMes);
  }, [items, mes]);

  const saldoPositivo = saldoTotal >= 0;

  return (
    <>
      {/* HERO saldo total */}
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
          Saldo total cta cte Baigun
        </div>
        <div
          className="font-brand heading-tight-lg tabular-nums-strict importe"
          style={{
            fontSize: 36,
            fontWeight: 700,
            lineHeight: 1,
            color: saldoPositivo ? '#76C893' : '#E07A5F',
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          }}
        >
          {fmtMontoPesos(saldoTotal)}
        </div>
        <div style={{ marginTop: 8, color: 'rgba(249,247,243,0.72)', fontSize: 12.5 }}>
          {saldoPositivo
            ? 'Baigun debe a Lharmonie'
            : 'Lharmonie debe a Baigun (anticipo)'}
        </div>
      </section>

      {/* Sub-cards mes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <SubCard label="Cargos del mes" value={cargosMes} color="var(--text)" />
        <SubCard label="Pagos del mes" value={pagosMes} color="#76C893" />
      </div>

      {/* Botones acción */}
      <button
        type="button"
        onClick={onAbrirPago}
        className="press-feedback btn-glow-accent"
        style={{
          width: '100%',
          height: 50,
          borderRadius: 'var(--radius-md)',
          background: 'var(--accent)',
          color: '#FDFBF8',
          border: 0,
          fontWeight: 700,
          fontSize: 14,
          cursor: 'pointer',
          letterSpacing: '0.01em',
        }}
      >
        + Registrar pago de Baigun
      </button>
      <button
        type="button"
        onClick={onGenerarMes}
        disabled={generando}
        className="press-feedback"
        style={{
          width: '100%',
          height: 44,
          borderRadius: 'var(--radius-md)',
          background: 'transparent',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
          opacity: generando ? 0.6 : 1,
        }}
      >
        {generando ? 'Generando…' : '🔄 Generar cargos del mes'}
      </button>

      {/* Tabla por servicio */}
      {porServicio.length > 0 && (
        <section>
          <div style={{ marginBottom: 8, paddingLeft: 4 }}>
            <EyebrowTag>Por servicio · {mes}</EyebrowTag>
          </div>
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 12,
              }}
            >
              <thead>
                <tr style={{ background: 'var(--bg-subtle)' }}>
                  <th style={th}>Servicio</th>
                  <th style={{ ...th, textAlign: 'right' }}>Cargos</th>
                  <th style={{ ...th, textAlign: 'right' }}>Pagos</th>
                  <th style={{ ...th, textAlign: 'right' }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {porServicio.map((s) => (
                  <tr
                    key={s.servicio}
                    onClick={() => onTapServicio(s.servicio)}
                    style={{
                      borderTop: '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    <td style={td}>{s.servicio}</td>
                    <td style={{ ...td, textAlign: 'right' }} className="tabular-nums-strict">
                      {s.cargosMes > 0 ? fmtMontoPesos(s.cargosMes) : '—'}
                    </td>
                    <td
                      style={{ ...td, textAlign: 'right', color: s.pagosMes > 0 ? '#76C893' : 'var(--text-muted)' }}
                      className="tabular-nums-strict"
                    >
                      {s.pagosMes > 0 ? fmtMontoPesos(s.pagosMes) : '—'}
                    </td>
                    <td
                      style={{ ...td, textAlign: 'right', fontWeight: 600 }}
                      className="tabular-nums-strict"
                    >
                      {fmtMontoPesos(s.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

const th: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 10.5,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};
const td: React.CSSProperties = {
  padding: '12px',
  color: 'var(--text)',
  verticalAlign: 'middle',
};

function SubCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        className="tabular-nums-strict importe"
        style={{
          fontSize: 18,
          fontWeight: 700,
          color,
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
        }}
      >
        {fmtMontoPesos(value)}
      </div>
    </div>
  );
}

// ─── Vista Histórico ────────────────────────────────────────────────

function VistaHistorico({
  items,
  filtroMes,
  filtroServicio,
  filtroTipo,
  filtroFuente,
  setFiltroMes,
  setFiltroServicio,
  setFiltroTipo,
  setFiltroFuente,
  mesesDisponibles,
  serviciosDisponibles,
  onTapItem,
  onNuevo,
}: {
  items: BaigunMov[];
  filtroMes: string;
  filtroServicio: string;
  filtroTipo: string;
  filtroFuente: string;
  setFiltroMes: (v: string) => void;
  setFiltroServicio: (v: string) => void;
  setFiltroTipo: (v: string) => void;
  setFiltroFuente: (v: string) => void;
  mesesDisponibles: string[];
  serviciosDisponibles: string[];
  onTapItem: (m: BaigunMov) => void;
  onNuevo: () => void;
}) {
  const filtered = useMemo(() => {
    return items.filter((m) => {
      if (filtroMes && m.mesOrigen !== filtroMes) return false;
      if (filtroServicio && m.servicioRef !== filtroServicio) return false;
      if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false;
      if (filtroFuente !== 'todos' && m.fuente !== filtroFuente) return false;
      return true;
    });
  }, [items, filtroMes, filtroServicio, filtroTipo, filtroFuente]);

  const exportUrl = useMemo(() => {
    const p = new URLSearchParams();
    p.set('formato', 'csv');
    if (filtroMes) p.set('mes', filtroMes);
    if (filtroServicio) p.set('servicio', filtroServicio);
    if (filtroTipo !== 'todos') p.set('tipo', filtroTipo);
    return `/api/baigun/cta-cte/export?${p.toString()}`;
  }, [filtroMes, filtroServicio, filtroTipo]);

  return (
    <>
      {/* Filtros */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          <FilterChip
            value={filtroMes}
            onChange={setFiltroMes}
            label="Mes"
            options={[
              { value: '', label: 'Todos' },
              ...mesesDisponibles.map((m) => ({ value: m, label: m })),
            ]}
          />
          <FilterChip
            value={filtroServicio}
            onChange={setFiltroServicio}
            label="Servicio"
            options={[
              { value: '', label: 'Todos' },
              ...serviciosDisponibles.map((s) => ({ value: s, label: s })),
            ]}
          />
          <FilterChip
            value={filtroTipo}
            onChange={setFiltroTipo}
            label="Tipo"
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'cargo', label: 'Cargo' },
              { value: 'pago', label: 'Pago' },
              { value: 'ajuste', label: 'Ajuste' },
            ]}
          />
          <FilterChip
            value={filtroFuente}
            onChange={setFiltroFuente}
            label="Fuente"
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'auto', label: 'Auto' },
              { value: 'manual', label: 'Manual' },
            ]}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href={exportUrl}
            download
            className="press-feedback"
            style={{
              flex: 1,
              height: 36,
              padding: '0 10px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-subtle)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'center',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              textDecoration: 'none',
            }}
          >
            Exportar CSV
          </a>
          <button
            type="button"
            onClick={onNuevo}
            className="press-feedback"
            style={{
              flex: 1,
              height: 36,
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent)',
              color: '#FDFBF8',
              border: 0,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + Nuevo movimiento
          </button>
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 && (
        <div
          style={{
            padding: '32px 16px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 13,
          }}
        >
          Sin movimientos con esos filtros.
        </div>
      )}

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
        {filtered.map((m) => {
          const isPago = m.tipo === 'pago';
          const isAjuste = m.tipo === 'ajuste';
          const color = isPago ? '#76C893' : isAjuste ? 'var(--text-muted)' : 'var(--text)';
          const sign = isPago ? '−' : isAjuste ? '±' : '+';
          return (
            <li
              key={m.id}
              onClick={() => onTapItem(m)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 14,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-card)',
                cursor: 'pointer',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: 'var(--text)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {m.concepto}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    marginTop: 3,
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                  }}
                >
                  <span>{m.fecha}</span>
                  {m.fuente === 'auto' && (
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 999,
                        background: 'rgba(196,160,103,0.10)',
                        color: 'var(--accent-hover)',
                        fontSize: 9.5,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      auto
                    </span>
                  )}
                  {m.cargadoPor && m.cargadoPor !== 'sistema' && (
                    <span style={{ opacity: 0.7 }}>
                      · {m.cargadoPor.split('@')[0]}
                    </span>
                  )}
                </div>
              </div>
              <div
                className="tabular-nums-strict importe"
                style={{
                  fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
                  fontWeight: 700,
                  fontSize: 14,
                  color,
                  textAlign: 'right',
                  flexShrink: 0,
                }}
              >
                <div>
                  {sign}{fmtMontoPesos(m.monto)}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    fontWeight: 500,
                    marginTop: 2,
                  }}
                >
                  Saldo: {fmtMontoPesos(m.saldoDespues)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function FilterChip({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div style={{ flexShrink: 0 }}>
      <label
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginRight: 6,
        }}
      >
        {label}:
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '6px 10px',
          borderRadius: 999,
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
          fontSize: 12,
          color: 'var(--text)',
          minHeight: 32,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Vista Calendario ──────────────────────────────────────────────

function VistaCalendario({ mes, items }: { mes: string; items: BaigunMov[] }) {
  // Por servicio en el mes: agrupamos cargos y pagos
  const porDiaServicio = useMemo(() => {
    const map = new Map<number, Array<{ servicio: string; estado: 'verde' | 'amarillo' | 'rojo' | 'gris' }>>();
    // No tenemos día de venc en BaigunMov; solo tenemos cargos/pagos por mes.
    // Para los days, miramos los movs del mes y los agrupamos por día del campo `fecha`.
    for (const m of items) {
      if (m.mesOrigen !== mes) continue;
      const ddmmyyyy = m.fecha;
      const match = ddmmyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!match) continue;
      const day = parseInt(match[1], 10);
      const cur = map.get(day) || [];
      const estado = m.tipo === 'pago' ? 'verde' : m.tipo === 'cargo' ? 'amarillo' : 'gris';
      cur.push({ servicio: m.concepto, estado });
      map.set(day, cur);
    }
    return map;
  }, [items, mes]);

  const [yearStr, monthStr] = mes.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  // Primer día del mes y total de días
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const startMonday = (firstDay + 6) % 7; // 0=Mon
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const todayDay =
    today.getFullYear() === year && today.getMonth() + 1 === month ? today.getDate() : 0;

  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < startMonday; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });

  const [diaSel, setDiaSel] = useState<number | null>(null);

  return (
    <section>
      <div style={{ marginBottom: 8, paddingLeft: 4 }}>
        <EyebrowTag>Calendario · {mes}</EyebrowTag>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 4,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 8,
        }}
      >
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div
            key={i}
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: 'var(--text-muted)',
              textAlign: 'center',
              padding: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {d}
          </div>
        ))}
        {cells.map((c, i) => {
          if (c.day === null) return <div key={i} style={{ height: 44 }} />;
          const dots = porDiaServicio.get(c.day) || [];
          const isToday = c.day === todayDay;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setDiaSel(c.day)}
              className="press-feedback"
              style={{
                height: 44,
                borderRadius: 8,
                border: isToday ? '1.5px solid var(--accent)' : '1px solid transparent',
                background: dots.length ? 'var(--bg-subtle)' : 'transparent',
                color: 'var(--text)',
                fontSize: 12,
                fontWeight: isToday ? 700 : 500,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                padding: 0,
              }}
            >
              <div>{c.day}</div>
              {dots.length > 0 && (
                <div style={{ display: 'flex', gap: 2 }}>
                  {dots.slice(0, 3).map((d, j) => (
                    <div
                      key={j}
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        background:
                          d.estado === 'verde'
                            ? '#76C893'
                            : d.estado === 'amarillo'
                            ? '#E0B341'
                            : d.estado === 'rojo'
                            ? '#E07A5F'
                            : 'var(--text-muted)',
                      }}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {diaSel !== null && (
        <DrilldownDia
          day={diaSel}
          mes={mes}
          items={(porDiaServicio.get(diaSel) || []).map((d) => d.servicio)}
          onClose={() => setDiaSel(null)}
        />
      )}
    </section>
  );
}

function DrilldownDia({
  day,
  mes,
  items,
  onClose,
}: {
  day: number;
  mes: string;
  items: string[];
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(13,8,5,0.50)',
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
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          padding: 20,
          paddingBottom: 'calc(var(--safe-bottom) + 20px)',
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 999,
            background: 'var(--border)',
            margin: '0 auto 12px',
          }}
        />
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--accent-hover)',
            marginBottom: 4,
          }}
        >
          · Día {String(day).padStart(2, '0')} · {mes}
        </div>
        <h3 style={{ fontSize: 18, margin: 0, marginBottom: 12 }}>
          {items.length} movimiento{items.length !== 1 ? 's' : ''}
        </h3>
        {items.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Sin movimientos este día.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map((it, i) => (
              <li
                key={i}
                style={{
                  fontSize: 13,
                  padding: 10,
                  background: 'var(--bg-subtle)',
                  borderRadius: 8,
                }}
              >
                {it}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Modal: registrar pago ─────────────────────────────────────────

function RegistrarPagoBaigunModal({
  mes,
  onClose,
  onSaved,
  onError,
}: {
  mes: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const [fecha, setFecha] = useState(fechaHoyAR());
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('transferencia');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const submit = useCallback(async () => {
    if (saving) return;
    const m = parseFloat(monto.replace(/\./g, '').replace(',', '.'));
    if (!m || isNaN(m) || m <= 0) {
      onError('Monto inválido');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/baigun/cta-cte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha,
          tipo: 'pago',
          concepto: `Pago de Baigun · ${mes}`,
          monto: m,
          metodo,
          notas,
          mesOrigen: mes,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        await onSaved();
      } else {
        onError(d.error || 'Error');
      }
    } catch {
      onError('Error de red');
    } finally {
      setSaving(false);
    }
  }, [saving, monto, fecha, metodo, notas, mes, onSaved, onError]);

  return (
    <ModalShell onClose={onClose} title="Registrar pago de Baigun" eyebrow={mes}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Fecha (DD/MM/YYYY)">
          <input
            type="text"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="input-pro tabular-nums-strict"
            style={inputStyle}
          />
        </Field>
        <Field label="Monto (ARS)">
          <input
            type="text"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value.replace(/[^0-9.,]/g, ''))}
            placeholder="0"
            autoFocus
            className="input-pro tabular-nums-strict"
            style={inputStyle}
          />
        </Field>
        <Field label="Método">
          <select
            value={metodo}
            onChange={(e) => setMetodo(e.target.value)}
            className="input-pro"
            style={inputStyle}
          >
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="mix">Mix</option>
          </select>
        </Field>
        <Field label="Notas (opcional)">
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="input-pro"
            rows={2}
            style={{ ...inputStyle, minHeight: 56 }}
          />
        </Field>
      </div>
      <ModalFooter
        onCancel={onClose}
        onSubmit={submit}
        saving={saving}
        submitLabel="Registrar pago"
      />
    </ModalShell>
  );
}

// ─── Modal: nuevo movimiento manual ────────────────────────────────

function NuevoMovBaigunModal({
  mes,
  servicios,
  onClose,
  onSaved,
  onError,
}: {
  mes: string;
  servicios: string[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const [fecha, setFecha] = useState(fechaHoyAR());
  const [tipo, setTipo] = useState<'cargo' | 'pago' | 'ajuste'>('cargo');
  const [concepto, setConcepto] = useState('');
  const [servicioRef, setServicioRef] = useState('');
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('');
  const [notas, setNotas] = useState('');
  const [mesOrigen, setMesOrigen] = useState(mes);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const submit = useCallback(async () => {
    if (saving) return;
    const m = parseFloat(monto.replace(/\./g, '').replace(',', '.'));
    if (!m || isNaN(m) || m <= 0) {
      onError('Monto inválido');
      return;
    }
    if (!concepto.trim()) {
      onError('Falta concepto');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/baigun/cta-cte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha, tipo, concepto, monto: m, metodo, notas,
          mesOrigen, servicioRef,
        }),
      });
      const d = await r.json();
      if (d.ok) await onSaved();
      else onError(d.error || 'Error');
    } catch {
      onError('Error de red');
    } finally {
      setSaving(false);
    }
  }, [saving, fecha, tipo, concepto, monto, metodo, notas, mesOrigen, servicioRef, onSaved, onError]);

  return (
    <ModalShell onClose={onClose} title="Nuevo movimiento" eyebrow="Baigun · cta cte">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Tipo">
          <div style={{ display: 'flex', gap: 4 }}>
            {(['cargo', 'pago', 'ajuste'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className="press-feedback"
                style={{
                  flex: 1,
                  height: 36,
                  borderRadius: 8,
                  background: tipo === t ? 'var(--accent)' : 'var(--bg-subtle)',
                  color: tipo === t ? '#FDFBF8' : 'var(--text)',
                  border: '1px solid var(--border)',
                  fontWeight: 600,
                  fontSize: 12.5,
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Fecha (DD/MM/YYYY)">
          <input type="text" value={fecha} onChange={(e) => setFecha(e.target.value)}
            className="input-pro tabular-nums-strict" style={inputStyle} />
        </Field>
        <Field label="Mes origen (YYYY-MM)">
          <input type="text" value={mesOrigen} onChange={(e) => setMesOrigen(e.target.value)}
            className="input-pro tabular-nums-strict" style={inputStyle} placeholder="2026-05" />
        </Field>
        <Field label="Concepto">
          <input type="text" value={concepto} onChange={(e) => setConcepto(e.target.value)}
            className="input-pro" style={inputStyle} />
        </Field>
        <Field label="Servicio (opcional)">
          <input
            list="srv-list-baigun"
            type="text" value={servicioRef} onChange={(e) => setServicioRef(e.target.value)}
            className="input-pro" style={inputStyle} placeholder="ej. EDESUR"
          />
          <datalist id="srv-list-baigun">
            {servicios.map((s) => <option key={s} value={s} />)}
          </datalist>
        </Field>
        <Field label="Monto">
          <input type="text" inputMode="decimal" value={monto}
            onChange={(e) => setMonto(e.target.value.replace(/[^0-9.,]/g, ''))}
            className="input-pro tabular-nums-strict" style={inputStyle} />
        </Field>
        <Field label="Método (opcional)">
          <input type="text" value={metodo} onChange={(e) => setMetodo(e.target.value)}
            className="input-pro" style={inputStyle} placeholder="efectivo / transferencia" />
        </Field>
        <Field label="Notas (opcional)">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)}
            className="input-pro" rows={2} style={{ ...inputStyle, minHeight: 56 }} />
        </Field>
      </div>
      <ModalFooter onCancel={onClose} onSubmit={submit} saving={saving} submitLabel="Crear movimiento" />
    </ModalShell>
  );
}

// ─── Modal: detalle (con editar + eliminar para owner) ─────────────

function DetalleMovModal({
  mov,
  isOwner,
  onClose,
  onChanged,
  onError,
}: {
  mov: BaigunMov;
  isOwner: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const eliminar = useCallback(async () => {
    if (busy) return;
    if (!confirm('¿Eliminar este movimiento? Queda como soft-delete (auditable).')) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/baigun/cta-cte?id=${encodeURIComponent(mov.id)}`, { method: 'DELETE' });
      const d = await r.json();
      if (d.ok) await onChanged();
      else onError(d.error || 'Error');
    } catch {
      onError('Error de red');
    } finally {
      setBusy(false);
    }
  }, [busy, mov.id, onChanged, onError]);

  return (
    <ModalShell onClose={onClose} title={mov.concepto} eyebrow={`${mov.tipo} · ${mov.fecha}`}>
      <dl style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, margin: 0 }}>
        <Detalle k="Monto" v={fmtMontoPesos(mov.monto)} />
        <Detalle k="Saldo después" v={fmtMontoPesos(mov.saldoDespues)} />
        <Detalle k="Mes origen" v={mov.mesOrigen || '—'} />
        <Detalle k="Servicio" v={mov.servicioRef || '—'} />
        <Detalle k="Método" v={mov.metodo || '—'} />
        <Detalle k="Fuente" v={mov.fuente} />
        <Detalle k="Cargado por" v={mov.cargadoPor || '—'} />
        {mov.notas && <Detalle k="Notas" v={mov.notas} />}
        <Detalle k="ID" v={mov.id} />
      </dl>
      {isOwner && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={eliminar}
            disabled={busy}
            className="press-feedback"
            style={{
              flex: 1,
              height: 44,
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
          <button
            type="button"
            onClick={onClose}
            className="press-feedback"
            style={{
              flex: 1,
              height: 44,
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-subtle)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
        </div>
      )}
    </ModalShell>
  );
}

function Detalle({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <dt style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{k}</dt>
      <dd style={{ color: 'var(--text)', textAlign: 'right', margin: 0, fontWeight: 500 }}>{v}</dd>
    </div>
  );
}

// ─── UI primitives ─────────────────────────────────────────────────

function ModalShell({
  onClose,
  title,
  eyebrow,
  children,
}: {
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
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
          paddingBottom: 'calc(var(--safe-bottom) + 20px)',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 -8px 32px -8px rgba(0,0,0,0.30)',
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--border)', margin: '0 auto 16px' }} />
        {eyebrow && (
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.10em',
            textTransform: 'uppercase', color: 'var(--accent-hover)', marginBottom: 6,
          }}>· {eyebrow}</div>
        )}
        <h2 style={{
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0, marginBottom: 14,
        }}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

function ModalFooter({
  onCancel, onSubmit, saving, submitLabel,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="press-feedback"
        style={{
          flex: 1, height: 44, borderRadius: 'var(--radius-md)',
          background: 'var(--bg-subtle)', color: 'var(--text)',
          fontWeight: 600, fontSize: 13.5, border: '1px solid var(--border)',
          cursor: 'pointer',
        }}
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={saving}
        className="press-feedback"
        style={{
          flex: 2, height: 44, borderRadius: 'var(--radius-md)',
          background: 'var(--accent)', color: '#FDFBF8',
          fontWeight: 700, fontSize: 13.5, border: 0,
          cursor: 'pointer', opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? 'Guardando…' : submitLabel}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{
        fontSize: 10.5, fontWeight: 600,
        color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  height: 40,
  padding: '0 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--bg-card)',
  color: 'var(--text)',
  fontSize: 14,
  outline: 'none',
  width: '100%',
};
