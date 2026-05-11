'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import { PageHeader } from '../components/PageHeader';
import EyebrowTag from '../components/EyebrowTag';
import {
  TIPO_LABELS,
  TIPO_COLORS,
  TIPOS_SERVICIO,
  PERIODICIDADES,
  MEDIOS_PAGO,
  MEDIO_LABELS,
  sugerirAnclaPorTipo,
  type ServicioCatalogo,
  type ServicioPago,
  type TipoServicio,
  type Periodicidad,
  type MedioPago,
} from '@/lib/servicios';
import { ANCLAS, ANCLA_SHORT, ANCLA_LABELS, type Ancla } from '@/lib/anclas';

// Panel /servicios — owner-only. Lista del catálogo agrupada por
// ancla, con suma de monto estimado mensual. Tap en un servicio →
// drawer con datos de pago + historial. Botón "Nuevo servicio" abre
// bottom sheet.

export default function ServiciosPage() {
  const { user, loading, isOwner } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<ServicioCatalogo[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNuevo, setShowNuevo] = useState(false);
  const [toast, setToast] = useState('');

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/servicios', { cache: 'no-store' });
      const d = await r.json();
      if (d.ok) {
        setItems(d.items || []);
        setError(null);
      } else {
        setError(d.error || 'Error');
      }
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

  const grouped = useMemo(() => {
    const map = new Map<Ancla, ServicioCatalogo[]>();
    for (const s of items) {
      const arr = map.get(s.ancla) || [];
      arr.push(s);
      map.set(s.ancla, arr);
    }
    const out: { ancla: Ancla; items: ServicioCatalogo[]; totalArs: number }[] = [];
    for (const a of ANCLAS) {
      const arr = map.get(a);
      if (!arr || arr.length === 0) continue;
      const total = arr.reduce((s, x) => s + (x.activo ? x.montoEstimadoArs : 0), 0);
      out.push({ ancla: a, items: arr, totalArs: total });
    }
    return out;
  }, [items]);

  const totalActivosArs = useMemo(
    () =>
      items
        .filter((s) => s.activo)
        .reduce((s, x) => s + x.montoEstimadoArs, 0),
    [items],
  );

  if (loading || !user) return null;
  if (!isOwner) return null;

  return (
    <div className="page-enter">
      <PageHeader
        title="Servicios"
        subtitle={`${items.length} en catálogo · gasto estimado mensual`}
        showBack
      />
      <div
        className="px-4 pt-4 lh-inicio-stagger"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          paddingBottom: 'calc(var(--nav-height) + var(--safe-bottom) + 24px)',
        }}
      >
        {/* Hero estimado */}
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
            Gasto estimado mensual
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
            $ {Math.round(totalActivosArs).toLocaleString('es-AR')}
          </div>
          <div style={{ marginTop: 8, color: 'rgba(249,247,243,0.72)', fontSize: 13 }}>
            {items.filter((s) => s.activo).length} servicios activos
          </div>
        </section>

        {error && (
          <ErrorBanner
            text={error}
            hint="Verificá GOOGLE_CREDENTIALS, SERVICIOS_SHEET_ID, y que el service account tenga acceso de Editor al Sheet."
          />
        )}

        {/* CTA nuevo */}
        <button
          type="button"
          onClick={() => setShowNuevo(true)}
          className="press-feedback"
          style={{
            minHeight: 'var(--touch-min)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            background: 'var(--accent)',
            color: '#FDFBF8',
            fontWeight: 600,
            fontSize: 14,
            border: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.10), 0 1px 2px rgba(31,20,16,0.08), 0 6px 16px -4px rgba(184,149,111,0.45)',
          }}
        >
          <PlusIcon /> Nuevo servicio
        </button>

        {/* Listado */}
        {fetching && items.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="shimmer-modern"
                style={{ height: 84, borderRadius: 14 }}
              />
            ))}
          </div>
        )}

        {!fetching && items.length === 0 && !error && (
          <EmptyState onAdd={() => setShowNuevo(true)} />
        )}

        {/* Mantenimiento: regenerar tab ÍNDICE del Sheet (owner only).
            Botón pegado al final como link discreto. */}
        <SeedIndiceButton onDone={flashToast} />

        {grouped.map((g) => (
          <section key={g.ancla}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingLeft: 4,
                marginBottom: 8,
              }}
            >
              <EyebrowTag>{ANCLA_LABELS[g.ancla]}</EyebrowTag>
              <span
                className="tabular-nums-strict"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
                }}
              >
                $ {Math.round(g.totalArs).toLocaleString('es-AR')}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {g.items.map((s) => (
                <ServicioRow
                  key={s.id}
                  servicio={s}
                  isOpen={openId === s.id}
                  onToggle={() => setOpenId((p) => (p === s.id ? null : s.id))}
                  onPagado={async (msg) => {
                    await refresh();
                    flashToast(msg);
                  }}
                  onError={flashToast}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {showNuevo && (
        <NuevoServicioSheet
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

// ─── Servicio row con expand ────────────────────────────────────

function ServicioRow({
  servicio,
  isOpen,
  onToggle,
  onPagado,
  onError,
}: {
  servicio: ServicioCatalogo;
  isOpen: boolean;
  onToggle: () => void;
  onPagado: (msg: string) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const colors = TIPO_COLORS[servicio.tipo];
  const [pagos, setPagos] = useState<ServicioPago[]>([]);
  const [loadingPagos, setLoadingPagos] = useState(false);
  const [showRegistrar, setShowRegistrar] = useState(false);

  useEffect(() => {
    if (!isOpen || pagos.length > 0) return;
    setLoadingPagos(true);
    fetch(`/api/servicios/pagos?servicioId=${encodeURIComponent(servicio.id)}`, {
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setPagos(d.items || []);
      })
      .finally(() => setLoadingPagos(false));
  }, [isOpen, servicio.id, pagos.length]);

  const ultimoPago = pagos[pagos.length - 1];

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${isOpen ? 'var(--border-accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
        transition: 'border-color 220ms var(--ease-ios)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="press-feedback"
        style={{
          width: '100%',
          minHeight: 'var(--touch-min)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          background: 'transparent',
          border: 0,
          textAlign: 'left',
          cursor: 'pointer',
          color: 'var(--text)',
          opacity: servicio.activo ? 1 : 0.55,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: colors.bg,
            color: colors.fg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          }}
        >
          {servicio.tipo.slice(0, 3)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14.5,
              fontWeight: 600,
              color: 'var(--text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {servicio.nombreVisible || `${TIPO_LABELS[servicio.tipo]} — ${servicio.local}`}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--text-muted)',
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {TIPO_LABELS[servicio.tipo]} · {servicio.periodicidad}
            {servicio.vencimientoDia ? ` · vence día ${servicio.vencimientoDia}` : ''}
          </div>
        </div>
        <div
          className="tabular-nums-strict"
          style={{
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            fontWeight: 700,
            fontSize: 14,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          $ {Math.round(servicio.montoEstimadoArs).toLocaleString('es-AR')}
        </div>
        <Chevron isOpen={isOpen} />
      </button>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: 'grid-template-rows 240ms var(--ease-ios)',
        }}
      >
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div
            style={{
              borderTop: '1px solid var(--border)',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <Field label="Titular" value={servicio.titularNombre || '—'} />
            {servicio.cuentaNumero && (
              <Field label="Cuenta" value={servicio.cuentaNumero} mono />
            )}
            {servicio.metodoPago && (
              <Field
                label="Método de pago"
                value={MEDIO_LABELS[servicio.metodoPago as MedioPago] || servicio.metodoPago}
              />
            )}
            {servicio.cbuPago && <Field label="CBU" value={servicio.cbuPago} mono />}
            {servicio.cuentaPagoAlias && (
              <Field label="Alias" value={servicio.cuentaPagoAlias} mono />
            )}
            {servicio.subarrendadoBaigun && (
              <Field
                label="Subarriendo Baigun"
                value={`${servicio.baigunPorcentaje}% se redirige a la cta cte`}
              />
            )}
            {ultimoPago && (
              <Field
                label="Último pago"
                value={`${ultimoPago.fechaPago} · $ ${Math.round(ultimoPago.montoTotalArs).toLocaleString('es-AR')}`}
              />
            )}
            {loadingPagos && pagos.length === 0 && (
              <div
                className="shimmer-modern"
                style={{ height: 32, borderRadius: 8 }}
              />
            )}
            <button
              type="button"
              onClick={() => setShowRegistrar(true)}
              className="press-feedback"
              style={{
                minHeight: 'var(--touch-min)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--accent)',
                color: '#FDFBF8',
                fontWeight: 600,
                fontSize: 13.5,
                border: 0,
              }}
            >
              Registrar pago
            </button>
          </div>
        </div>
      </div>

      {showRegistrar && (
        <RegistrarPagoSheet
          servicio={servicio}
          onClose={() => setShowRegistrar(false)}
          onSaved={async (msg) => {
            setShowRegistrar(false);
            // Limpiar cache de pagos para forzar refresh
            setPagos([]);
            await onPagado(msg);
          }}
          onError={onError}
        />
      )}
    </div>
  );
}

// ─── Bottom sheet: nuevo servicio ───────────────────────────────

function NuevoServicioSheet({
  onClose,
  onSaved,
  onError,
}: {
  onClose: () => void;
  onSaved: (msg: string) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const [tipo, setTipo] = useState<TipoServicio>('luz');
  const [ancla, setAncla] = useState<Ancla>('LH1');
  const [local, setLocal] = useState('');
  const [nombreVisible, setNombreVisible] = useState('');
  const [titularNombre, setTitularNombre] = useState('');
  const [titularCuit, setTitularCuit] = useState('');
  const [cuentaNumero, setCuentaNumero] = useState('');
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>('mensual');
  const [montoArs, setMontoArs] = useState('');
  const [vencDia, setVencDia] = useState('');
  const [metodoPago, setMetodoPago] = useState<MedioPago | ''>('');
  const [cbuPago, setCbuPago] = useState('');
  const [aliasPago, setAliasPago] = useState('');
  const [subBaigun, setSubBaigun] = useState(false);
  const [baigunPct, setBaigunPct] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  // Auto-set ancla cuando el tipo lo sugiere (IVA/impositivo → CRONKLAM)
  useEffect(() => {
    const sug = sugerirAnclaPorTipo(tipo);
    if (sug) setAncla(sug);
  }, [tipo]);

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
    setSaving(true);
    try {
      const res = await fetch('/api/servicios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          ancla,
          local: local.trim(),
          nombreVisible: nombreVisible.trim(),
          titularNombre: titularNombre.trim(),
          titularCuit: titularCuit.trim(),
          cuentaNumero: cuentaNumero.trim(),
          periodicidad,
          montoEstimadoArs: parseFloat(montoArs) || 0,
          vencimientoDia: vencDia ? parseInt(vencDia, 10) : null,
          activo: true,
          subarrendadoBaigun: subBaigun,
          baigunPorcentaje: parseFloat(baigunPct) || 0,
          metodoPago,
          cbuPago: cbuPago.trim(),
          cuentaPagoAlias: aliasPago.trim(),
          notas: notas.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok) onSaved('Servicio creado');
      else onError(data.error || 'Error guardando');
    } catch {
      onError('Error de red');
    } finally {
      setSaving(false);
    }
  }, [
    saving, tipo, ancla, local, nombreVisible, titularNombre, titularCuit,
    cuentaNumero, periodicidad, montoArs, vencDia, subBaigun, baigunPct,
    metodoPago, cbuPago, aliasPago, notas, onSaved, onError,
  ]);

  return (
    <SheetShell title="Nuevo servicio" eyebrow="· Catálogo" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Tipo">
          <SelectChipsInline
            options={TIPOS_SERVICIO.map((t) => ({ value: t, label: TIPO_LABELS[t] }))}
            value={tipo}
            onChange={(v) => setTipo(v as TipoServicio)}
          />
        </Field>
        <Field label="Ancla (local / empresa / personal)">
          <SelectChipsInline
            options={ANCLAS.map((a) => ({ value: a, label: ANCLA_SHORT[a] }))}
            value={ancla}
            onChange={(v) => setAncla(v as Ancla)}
          />
        </Field>
        <Field label="Nombre visible">
          <input
            className="input-pro"
            style={{ minHeight: 'var(--touch-min)' }}
            value={nombreVisible}
            onChange={(e) => setNombreVisible(e.target.value)}
            placeholder="EDESUR — LH2"
          />
        </Field>
        <Field label="Local (texto libre)">
          <input
            className="input-pro"
            style={{ minHeight: 'var(--touch-min)' }}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            placeholder="Lharmonie Nicaragua"
          />
        </Field>
        <Field label="Periodicidad">
          <SelectChipsInline
            options={PERIODICIDADES.map((p) => ({ value: p, label: p }))}
            value={periodicidad}
            onChange={(v) => setPeriodicidad(v as Periodicidad)}
          />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
          <Field label="Monto estimado ARS">
            <input
              className="input-pro tabular-nums-strict"
              type="text"
              inputMode="numeric"
              style={{ minHeight: 'var(--touch-min)' }}
              value={montoArs}
              onChange={(e) => setMontoArs(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Vence día">
            <input
              className="input-pro tabular-nums-strict"
              type="text"
              inputMode="numeric"
              style={{ minHeight: 'var(--touch-min)' }}
              value={vencDia}
              onChange={(e) => setVencDia(e.target.value)}
              placeholder="10"
            />
          </Field>
        </div>
        <Field label="Titular (opcional)">
          <input
            className="input-pro"
            style={{ minHeight: 'var(--touch-min)' }}
            value={titularNombre}
            onChange={(e) => setTitularNombre(e.target.value)}
            placeholder="Cronklam SRL"
          />
        </Field>
        <Field label="CUIT (opcional)">
          <input
            className="input-pro"
            style={{ minHeight: 'var(--touch-min)' }}
            value={titularCuit}
            onChange={(e) => setTitularCuit(e.target.value)}
            placeholder="30-71234567-8"
            inputMode="numeric"
          />
        </Field>
        <Field label="Número de cuenta del servicio (opcional)">
          <input
            className="input-pro"
            style={{ minHeight: 'var(--touch-min)' }}
            value={cuentaNumero}
            onChange={(e) => setCuentaNumero(e.target.value)}
            placeholder="123456789"
          />
        </Field>
        <Field label="Método de pago (opcional)">
          <SelectChipsInline
            options={[{ value: '', label: 'Sin definir' }, ...MEDIOS_PAGO.map((m) => ({ value: m, label: MEDIO_LABELS[m] }))]}
            value={metodoPago}
            onChange={(v) => setMetodoPago(v as MedioPago | '')}
          />
        </Field>
        {metodoPago === 'transferencia' && (
          <>
            <Field label="CBU">
              <input
                className="input-pro tabular-nums-strict"
                style={{ minHeight: 'var(--touch-min)' }}
                value={cbuPago}
                onChange={(e) => setCbuPago(e.target.value)}
                inputMode="numeric"
                placeholder="0000003100012345678901"
              />
            </Field>
            <Field label="Alias">
              <input
                className="input-pro"
                style={{ minHeight: 'var(--touch-min)' }}
                value={aliasPago}
                onChange={(e) => setAliasPago(e.target.value)}
                placeholder="lharmonie.cuenta"
              />
            </Field>
          </>
        )}
        <Field label="Subarrendado a Baigun">
          <ToggleRow
            checked={subBaigun}
            onChange={setSubBaigun}
            labelOn="Sí"
            labelOff="No"
          />
        </Field>
        {subBaigun && (
          <Field label="Porcentaje a Baigun (%)">
            <input
              className="input-pro tabular-nums-strict"
              type="text"
              inputMode="numeric"
              style={{ minHeight: 'var(--touch-min)' }}
              value={baigunPct}
              onChange={(e) => setBaigunPct(e.target.value)}
              placeholder="50"
            />
          </Field>
        )}
        <Field label="Notas (opcional)">
          <textarea
            className="input-pro"
            style={{ minHeight: 60, paddingTop: 10, paddingBottom: 10 }}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
          />
        </Field>
      </div>
      <SheetFooter onCancel={onClose} onSubmit={submit} saving={saving} />
    </SheetShell>
  );
}

// ─── Bottom sheet: registrar pago ───────────────────────────────

function RegistrarPagoSheet({
  servicio,
  onClose,
  onSaved,
  onError,
}: {
  servicio: ServicioCatalogo;
  onClose: () => void;
  onSaved: (msg: string) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const periodoDefault = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const [periodo, setPeriodo] = useState(periodoDefault);
  const [fechaPago, setFechaPago] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [medioPago, setMedioPago] = useState<MedioPago>(
    (servicio.metodoPago as MedioPago) || 'transferencia',
  );
  const [montoTotal, setMontoTotal] = useState(
    String(servicio.montoEstimadoArs || ''),
  );
  const [montoArsEf, setMontoArsEf] = useState('');
  const [montoUsd, setMontoUsd] = useState('');
  const [tcUsd, setTcUsd] = useState('');
  const [montoTransfer, setMontoTransfer] = useState('');
  const [comprobante, setComprobante] = useState('');
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
    if (!periodo || !fechaPago) {
      onError('Periodo y fecha son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const baigunShare = servicio.subarrendadoBaigun
        ? (parseFloat(montoTotal) || 0) * (servicio.baigunPorcentaje / 100)
        : 0;
      const res = await fetch('/api/servicios/pagos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          servicioId: servicio.id,
          periodo,
          fechaPago,
          ancla: servicio.ancla,
          montoTotalArs: parseFloat(montoTotal) || 0,
          montoArsEfectivo: parseFloat(montoArsEf) || 0,
          montoUsd: parseFloat(montoUsd) || 0,
          tipoCambioUsd: parseFloat(tcUsd) || 0,
          montoTransferenciaArs: parseFloat(montoTransfer) || 0,
          medioPago,
          comprobanteUrl: comprobante.trim(),
          notas: notas.trim(),
          baigunShareArs: baigunShare,
        }),
      });
      const data = await res.json();
      if (data.ok) onSaved('Pago registrado');
      else onError(data.error || 'Error guardando');
    } catch {
      onError('Error de red');
    } finally {
      setSaving(false);
    }
  }, [
    saving, periodo, fechaPago, servicio, montoTotal, montoArsEf, montoUsd,
    tcUsd, montoTransfer, medioPago, comprobante, notas, onSaved, onError,
  ]);

  return (
    <SheetShell title={`Pagar — ${servicio.nombreVisible || servicio.tipo}`} eyebrow="· Pago" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Periodo (YYYY-MM)">
            <input
              className="input-pro tabular-nums-strict"
              style={{ minHeight: 'var(--touch-min)' }}
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
            />
          </Field>
          <Field label="Fecha de pago">
            <input
              className="input-pro tabular-nums-strict"
              type="date"
              style={{ minHeight: 'var(--touch-min)' }}
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Medio de pago">
          <SelectChipsInline
            options={MEDIOS_PAGO.map((m) => ({ value: m, label: MEDIO_LABELS[m] }))}
            value={medioPago}
            onChange={(v) => setMedioPago(v as MedioPago)}
          />
        </Field>
        <Field label="Monto total ARS">
          <input
            className="input-pro tabular-nums-strict"
            type="text"
            inputMode="decimal"
            style={{ minHeight: 'var(--touch-min)' }}
            value={montoTotal}
            onChange={(e) => setMontoTotal(e.target.value)}
          />
        </Field>
        {medioPago === 'mix' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="ARS efectivo">
                <input
                  className="input-pro tabular-nums-strict"
                  inputMode="decimal"
                  style={{ minHeight: 'var(--touch-min)' }}
                  value={montoArsEf}
                  onChange={(e) => setMontoArsEf(e.target.value)}
                />
              </Field>
              <Field label="ARS transfer">
                <input
                  className="input-pro tabular-nums-strict"
                  inputMode="decimal"
                  style={{ minHeight: 'var(--touch-min)' }}
                  value={montoTransfer}
                  onChange={(e) => setMontoTransfer(e.target.value)}
                />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="USD">
                <input
                  className="input-pro tabular-nums-strict"
                  inputMode="decimal"
                  style={{ minHeight: 'var(--touch-min)' }}
                  value={montoUsd}
                  onChange={(e) => setMontoUsd(e.target.value)}
                />
              </Field>
              <Field label="TC USD">
                <input
                  className="input-pro tabular-nums-strict"
                  inputMode="decimal"
                  style={{ minHeight: 'var(--touch-min)' }}
                  value={tcUsd}
                  onChange={(e) => setTcUsd(e.target.value)}
                />
              </Field>
            </div>
          </>
        )}
        <Field label="URL comprobante (opcional)">
          <input
            className="input-pro"
            type="url"
            style={{ minHeight: 'var(--touch-min)' }}
            value={comprobante}
            onChange={(e) => setComprobante(e.target.value)}
            placeholder="https://drive.google.com/…"
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

// ─── Componentes utilitarios ────────────────────────────────────

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
  const ref = useRef<HTMLDivElement>(null);
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
        ref={ref}
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
  value,
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
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
      {children ?? (
        <span
          style={{
            fontSize: 13.5,
            color: 'var(--text)',
            fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
            wordBreak: 'break-all',
          }}
        >
          {value}
        </span>
      )}
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

function ToggleRow({
  checked,
  onChange,
  labelOn,
  labelOff,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  labelOn: string;
  labelOff: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className="press-feedback"
      style={{
        minHeight: 'var(--touch-min)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 14px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 600 }}>
        {checked ? labelOn : labelOff}
      </span>
      <span
        aria-hidden
        style={{
          width: 38,
          height: 22,
          borderRadius: 999,
          background: checked ? 'var(--green)' : 'var(--border-strong)',
          position: 'relative',
          transition: 'background 220ms var(--ease-ios)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#FFFFFF',
            boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
            transition: 'left 220ms var(--ease-ios)',
          }}
        />
      </span>
    </button>
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

function EmptyState({ onAdd }: { onAdd: () => void }) {
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
        <path d="M3 3h18v18H3z" />
        <path d="M7 8h10M7 12h10M7 16h6" />
      </svg>
      <h3
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--text)',
          marginTop: 10,
        }}
      >
        Sin servicios cargados
      </h3>
      <p
        style={{
          fontSize: 13,
          color: 'var(--text-muted)',
          marginTop: 4,
          maxWidth: 280,
          lineHeight: 1.45,
        }}
      >
        Sumá luz, agua, alquileres, IVA, expensas y demás obligaciones
        recurrentes para verlas todas en un lugar.
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
        Crear el primero
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

function Chevron({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--text-muted)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{
        transition: 'transform 220ms var(--ease-ios)',
        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
        flexShrink: 0,
      }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
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

// ─── Botón: regenerar tab ÍNDICE en el Sheet (owner only) ─────────
function SeedIndiceButton({ onDone }: { onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/servicios/seed-indice', { method: 'POST' });
      const d = await r.json();
      if (d.ok) onDone('Tab ÍNDICE creado / regenerado en el Sheet');
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
          minHeight: 38,
          borderRadius: 'var(--radius-md)',
          padding: '8px 12px',
          background: 'transparent',
          color: 'var(--text-muted)',
          fontWeight: 500,
          fontSize: 12,
          border: '1px dashed var(--border)',
          letterSpacing: '0.02em',
        }}
      >
        Regenerar tab ÍNDICE en el Sheet
      </button>
    );
  }

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-accent, #C4A067)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
        Regenerar ÍNDICE
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Esto va a borrar y recrear el tab <strong>ÍNDICE</strong> del Sheet de
        Servicios con la estructura canónica de la app. Cualquier edición
        manual que hayas hecho en ese tab se pierde. ¿Seguir?
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          style={{
            flex: 1,
            height: 38,
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-subtle)',
            color: 'var(--text)',
            fontWeight: 500,
            fontSize: 13,
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
            flex: 2,
            height: 38,
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent)',
            color: '#FDFBF8',
            fontWeight: 600,
            fontSize: 13,
            border: 0,
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Generando…' : 'Sí, regenerar'}
        </button>
      </div>
    </div>
  );
}
