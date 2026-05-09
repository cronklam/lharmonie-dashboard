'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import EyebrowTag from '../components/EyebrowTag';
import {
  CAJA_TIPOS_MOV,
  CAJA_TIPO_MOV_LABEL,
  CAJA_TIPO_MOV_COLORS,
  CAJA_GRANDE_TIPOS,
  CAJA_GRANDE_TIPO_LABEL,
  CAJA_GRANDE_TIPO_COLORS,
  CAJA_CATEGORIAS,
  fmtArs,
  fmtUsd,
  type CajaMovimiento,
  type CajaGrandeMovimiento,
  type CajaTipoMov,
  type CajaGrandeTipo,
  type CajaCategoria,
} from '@/lib/caja';

// Panel /caja — owner-only. Hero con saldo de caja grande (ARS + USD)
// + toggle entre Caja Chica y Caja Grande, listado de movimientos,
// botón "Nuevo movimiento".

type View = 'grande' | 'chica';

export default function CajaPage() {
  const { user, loading, isOwner } = useAuth();
  const router = useRouter();

  const [view, setView] = useState<View>('grande');
  const [saldo, setSaldo] = useState<{ ars: number; usd: number } | null>(null);
  const [movsGrande, setMovsGrande] = useState<CajaGrandeMovimiento[]>([]);
  const [movsChica, setMovsChica] = useState<CajaMovimiento[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNuevo, setShowNuevo] = useState(false);
  const [toast, setToast] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [sR, gR, cR] = await Promise.all([
        fetch('/api/caja/saldo', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/caja/movimientos?caja=grande', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/caja/movimientos?caja=chica', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      if (sR.ok) {
        setSaldo({ ars: sR.ars, usd: sR.usd });
        setError(null);
      } else {
        setError(sR.error || 'Error');
      }
      if (gR.ok) setMovsGrande((gR.items || []).slice().reverse());
      if (cR.ok) setMovsChica((cR.items || []).slice().reverse());
    } catch {
      setError('Error de red');
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    if (!isOwner) {
      router.replace('/');
      return;
    }
    refresh();
  }, [loading, user, isOwner, refresh, router]);

  const flashToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 2400);
  }, []);

  if (loading || !user) return null;
  if (!isOwner) return null;

  return (
    <div className="page-enter">
      <PageHeader title="Caja" subtitle="Saldo central + movimientos" showBack />
      <div
        className="px-4 pt-4 lh-inicio-stagger"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          paddingBottom: 'calc(var(--nav-height) + var(--safe-bottom) + 24px)',
        }}
      >
        {/* Hero saldo */}
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
            Saldo caja grande
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
            {saldo ? fmtArs(saldo.ars) : '—'}
          </div>
          {saldo && saldo.usd !== 0 && (
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
              {fmtUsd(saldo.usd)}
            </div>
          )}
          <div style={{ marginTop: 8, color: 'rgba(249,247,243,0.72)', fontSize: 13 }}>
            {movsGrande.length} movimiento{movsGrande.length !== 1 ? 's' : ''} totales
          </div>
        </section>

        {error && (
          <ErrorBanner
            text={error}
            hint="Verificá GOOGLE_CREDENTIALS, CAJA_SHEET_ID, y que el service account tenga acceso de Editor al Sheet de Caja."
          />
        )}

        {/* Toggle vista + CTA */}
        <section style={{ display: 'flex', gap: 8 }}>
          <ViewToggle view={view} onChange={setView} />
          <button
            type="button"
            onClick={() => setShowNuevo(true)}
            className="press-feedback"
            aria-label="Nuevo movimiento"
            style={{
              minHeight: 'var(--touch-min)',
              minWidth: 'var(--touch-min)',
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
            <PlusIcon /> Nuevo
          </button>
        </section>

        {/* Lista */}
        {fetching && (view === 'grande' ? movsGrande : movsChica).length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="shimmer-modern"
                style={{ height: 76, borderRadius: 14 }}
              />
            ))}
          </div>
        )}

        {!fetching && (view === 'grande' ? movsGrande : movsChica).length === 0 && !error && (
          <EmptyState view={view} onAdd={() => setShowNuevo(true)} />
        )}

        {view === 'grande' && movsGrande.length > 0 && (
          <section>
            <div style={{ marginBottom: 8, paddingLeft: 4 }}>
              <EyebrowTag>Movimientos · caja grande</EyebrowTag>
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
              {movsGrande.map((m) => (
                <li key={m.id}>
                  <MovimientoGrandeRow mov={m} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {view === 'chica' && movsChica.length > 0 && (
          <section>
            <div style={{ marginBottom: 8, paddingLeft: 4 }}>
              <EyebrowTag>Movimientos · caja chica</EyebrowTag>
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
              {movsChica.map((m) => (
                <li key={m.id}>
                  <MovimientoChicaRow mov={m} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {showNuevo && (
        <NuevoMovimientoSheet
          defaultView={view}
          onClose={() => setShowNuevo(false)}
          onSaved={async (msg) => {
            setShowNuevo(false);
            await refresh();
            flashToast(msg);
          }}
          onError={flashToast}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

// ─── Filas de movimiento ────────────────────────────────────────

function MovimientoGrandeRow({ mov }: { mov: CajaGrandeMovimiento }) {
  const colors = CAJA_GRANDE_TIPO_COLORS[mov.tipo];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: colors.bg,
          color: colors.fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {iconForGrande(mov.tipo)}
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
          {mov.concepto || CAJA_GRANDE_TIPO_LABEL[mov.tipo]}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: 'var(--text-muted)',
            marginTop: 2,
          }}
        >
          {mov.fecha?.slice(0, 10) || '—'} · {CAJA_GRANDE_TIPO_LABEL[mov.tipo]}
        </div>
      </div>
      <div
        className="tabular-nums-strict"
        style={{
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          fontWeight: 700,
          fontSize: 15,
          color: mov.montoArs >= 0 ? 'var(--green)' : 'var(--red)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {mov.montoArs >= 0 ? '+' : ''}{fmtArs(mov.montoArs)}
      </div>
    </div>
  );
}

function MovimientoChicaRow({ mov }: { mov: CajaMovimiento }) {
  const colors = CAJA_TIPO_MOV_COLORS[mov.tipo];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: colors.bg,
          color: colors.fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {iconForChica(mov.tipo)}
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
          {mov.concepto || CAJA_TIPO_MOV_LABEL[mov.tipo]}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: 'var(--text-muted)',
            marginTop: 2,
          }}
        >
          {mov.fechaMov || '—'} · {mov.local || '—'}
          {mov.categoria ? ` · ${mov.categoria}` : ''}
        </div>
      </div>
      <div
        className="tabular-nums-strict"
        style={{
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          fontWeight: 700,
          fontSize: 15,
          color: mov.montoArs >= 0 ? 'var(--text)' : 'var(--red)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {fmtArs(mov.montoArs)}
      </div>
    </div>
  );
}

// ─── Nuevo movimiento sheet ─────────────────────────────────────

function NuevoMovimientoSheet({
  defaultView,
  onClose,
  onSaved,
  onError,
}: {
  defaultView: View;
  onClose: () => void;
  onSaved: (msg: string) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const [caja, setCaja] = useState<View>(defaultView);
  // grande
  const [tipoGrande, setTipoGrande] = useState<CajaGrandeTipo>('DEPOSITO');
  // chica
  const [tipoChica, setTipoChica] = useState<CajaTipoMov>('GASTO');
  const [categoria, setCategoria] = useState<CajaCategoria | ''>('');
  const [local, setLocal] = useState('');
  // shared
  const [montoArs, setMontoArs] = useState('');
  const [montoUsd, setMontoUsd] = useState('');
  const [concepto, setConcepto] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

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
    if (!concepto.trim()) {
      onError('Concepto vacío');
      return;
    }
    setSaving(true);
    try {
      const ars = parseFloat(montoArs.replace(',', '.')) || 0;
      const usd = parseFloat(montoUsd.replace(',', '.')) || 0;
      const body: Record<string, unknown> = {
        caja,
        montoArs: ars,
        montoUsd: usd,
        concepto: concepto.trim(),
        notas: notas.trim(),
      };
      if (caja === 'grande') {
        body.tipo = tipoGrande;
        // RETIRO y AJUSTE deberían restar — el usuario debería ingresar
        // monto signed o lo forzamos según tipo.
        if (tipoGrande === 'RETIRO' && ars > 0) body.montoArs = -ars;
        if (tipoGrande === 'RETIRO' && usd > 0) body.montoUsd = -usd;
      } else {
        body.tipo = tipoChica;
        body.local = local.trim();
        body.categoria = tipoChica === 'GASTO' ? categoria : '';
        // GASTO y RETIRO deberían restar caja chica.
        if ((tipoChica === 'GASTO' || tipoChica === 'RETIRO') && ars > 0) body.montoArs = -ars;
        if ((tipoChica === 'GASTO' || tipoChica === 'RETIRO') && usd > 0) body.montoUsd = -usd;
      }
      const res = await fetch('/api/caja/movimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) onSaved('Movimiento registrado');
      else onError(data.error || 'Error guardando');
    } catch {
      onError('Error de red');
    } finally {
      setSaving(false);
    }
  }, [
    saving, caja, tipoGrande, tipoChica, categoria, local, montoArs, montoUsd,
    concepto, notas, onSaved, onError,
  ]);

  return (
    <SheetShell title="Nuevo movimiento" eyebrow="· Caja" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Caja">
          <SelectChipsInline
            options={[
              { value: 'grande' as View, label: 'Grande' },
              { value: 'chica' as View, label: 'Chica' },
            ]}
            value={caja}
            onChange={(v) => setCaja(v)}
          />
        </Field>

        {caja === 'grande' && (
          <Field label="Tipo">
            <SelectChipsInline
              options={CAJA_GRANDE_TIPOS.map((t) => ({
                value: t,
                label: CAJA_GRANDE_TIPO_LABEL[t],
              }))}
              value={tipoGrande}
              onChange={(v) => setTipoGrande(v as CajaGrandeTipo)}
            />
          </Field>
        )}

        {caja === 'chica' && (
          <>
            <Field label="Tipo">
              <SelectChipsInline
                options={CAJA_TIPOS_MOV.map((t) => ({
                  value: t,
                  label: CAJA_TIPO_MOV_LABEL[t],
                }))}
                value={tipoChica}
                onChange={(v) => setTipoChica(v as CajaTipoMov)}
              />
            </Field>
            <Field label="Local">
              <input
                className="input-pro"
                style={{ minHeight: 'var(--touch-min)' }}
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Lharmonie 1 / LH2 / etc"
              />
            </Field>
            {tipoChica === 'GASTO' && (
              <Field label="Categoría">
                <SelectChipsInline
                  options={[
                    { value: '' as CajaCategoria, label: 'Sin categoría' },
                    ...CAJA_CATEGORIAS.map((c) => ({ value: c, label: c })),
                  ]}
                  value={categoria}
                  onChange={(v) => setCategoria(v as CajaCategoria | '')}
                />
              </Field>
            )}
          </>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Monto ARS">
            <input
              className="input-pro tabular-nums-strict"
              type="text"
              inputMode="decimal"
              style={{ minHeight: 'var(--touch-min)' }}
              value={montoArs}
              onChange={(e) => setMontoArs(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Monto USD (opcional)">
            <input
              className="input-pro tabular-nums-strict"
              type="text"
              inputMode="decimal"
              style={{ minHeight: 'var(--touch-min)' }}
              value={montoUsd}
              onChange={(e) => setMontoUsd(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>

        <Field label="Concepto">
          <input
            className="input-pro"
            style={{ minHeight: 'var(--touch-min)' }}
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Depósito banco, Pago proveedor, etc"
          />
        </Field>

        <Field label="Notas (opcional)">
          <textarea
            className="input-pro"
            style={{ minHeight: 60, paddingTop: 10, paddingBottom: 10 }}
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
        </Field>
      </div>
      <SheetFooter onCancel={onClose} onSubmit={submit} saving={saving} />
    </SheetShell>
  );
}

// ─── Componentes utilitarios ─────────────────────────────────────

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 4,
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 3,
      }}
    >
      {[
        { id: 'grande' as View, label: 'Caja grande' },
        { id: 'chica' as View, label: 'Caja chica' },
      ].map((o) => {
        const selected = view === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className="press-feedback"
            aria-pressed={selected}
            style={{
              minHeight: 36,
              borderRadius: 'var(--radius-sm)',
              background: selected ? 'var(--bg-card)' : 'transparent',
              color: selected ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: selected ? 700 : 500,
              fontSize: 12.5,
              border: 0,
              boxShadow: selected ? 'var(--shadow-card)' : 'none',
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function iconForGrande(tipo: CajaGrandeTipo) {
  if (tipo === 'DEPOSITO') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 5v14m-6-6 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (tipo === 'RETIRO') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 19V5m6 6-6-6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (tipo === 'SESION_IARA') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
        <path d="M5 21c1.5-3.5 4-5 7-5s5.5 1.5 7 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 12h18M12 3v18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function iconForChica(tipo: CajaTipoMov) {
  if (tipo === 'GASTO') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4" y="6" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M4 11h16M8 16h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (tipo === 'RETIRO') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 19V5m6 6-6-6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 12h18M12 3v18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ErrorBanner({ text, hint }: { text: string; hint?: string }) {
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
      {hint && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-muted)' }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function EmptyState({ view, onAdd }: { view: View; onAdd: () => void }) {
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
        <path d="M3 10h18M7 15h3" />
      </svg>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginTop: 10 }}>
        Sin movimientos en caja {view === 'grande' ? 'grande' : 'chica'}
      </h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, maxWidth: 280, lineHeight: 1.45 }}>
        Empezá registrando el primer depósito o gasto para que aparezca el saldo y el historial.
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
        Cargar primero
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

// SheetShell, SheetFooter, Field, SelectChipsInline duplican el patrón
// usado en /servicios. Se podrían extraer a un componente compartido,
// pero por ahora mantenemos copias para que cada surface sea
// autocontenida y tu primer pasada de feedback toque solo lo necesario.

function SheetShell({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
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
        aria-label={title}
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
              {eyebrow}
            </div>
            <h2
              className="font-brand"
              style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.022em', marginTop: 2 }}
            >
              {title}
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
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}

function SheetFooter({
  onCancel,
  onSubmit,
  saving,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  saving: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
        padding: '12px 0 4px',
        marginTop: 12,
        borderTop: '1px solid var(--border)',
      }}
    >
      <button
        type="button"
        onClick={onCancel}
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
        onClick={onSubmit}
        disabled={saving}
        className="press-feedback"
        style={{
          minHeight: 'var(--touch-min)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--accent)',
          color: '#FDFBF8',
          fontWeight: 600,
          fontSize: 14,
          border: 0,
          opacity: saving ? 0.6 : 1,
          cursor: saving ? 'wait' : 'pointer',
        }}
      >
        {saving ? 'Guardando…' : 'Confirmar'}
      </button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
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
    </label>
  );
}

function SelectChipsInline<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="hide-scrollbar"
      style={{
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        scrollSnapType: 'x mandatory',
        paddingBottom: 2,
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
              minHeight: 36,
              padding: '0 14px',
              borderRadius: 999,
              background: selected ? 'var(--accent)' : 'var(--bg-card)',
              color: selected ? '#FDFBF8' : 'var(--text-muted)',
              border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
              fontSize: 12.5,
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
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
