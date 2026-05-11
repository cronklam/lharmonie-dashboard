'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SESION_TIPOS_MOV,
  SESION_TIPO_LABEL,
  SESION_TIPO_COLOR,
  SESION_CATEGORIAS_GASTO,
  fmtMonto,
  parseMontoInput,
  type SesionMovInput,
  type SesionTipoMov,
  type SesionEstadoMov,
  type SesionCategoriaGasto,
} from '@/lib/caja';
import { ANCLAS, ANCLA_SHORT, type Ancla } from '@/lib/anclas';

// SesionWizard — wizard de 3 pasos para cargar una sesión de control
// estilo staff. Render inline en /caja (full-content), no es un modal
// full-screen porque ya estamos adentro de la página de Caja.

interface Props {
  saldoRegistradoArs: number;
  saldoRegistradoUsd: number;
  onClose: () => void;
  onCompleted: (msg: string) => void;
  onError: (msg: string) => void;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface DraftMov extends SesionMovInput {
  _id: string;
}

function newDraftMov(local: string, fecha: string): DraftMov {
  return {
    _id: `m_${Date.now()}_${Math.floor(Math.random() * 999)}`,
    tipo: 'RETIRO',
    fecha,
    local,
    montoArs: 0,
    montoUsd: 0,
    concepto: '',
    categoriaFina: '',
    estado: 'COMPLETO',
  };
}

export function SesionWizard({
  saldoRegistradoArs,
  saldoRegistradoUsd,
  onClose,
  onCompleted,
  onError,
}: Props) {
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [localActivo, setLocalActivo] = useState<Ancla>('LH5');
  const [fechaSesion] = useState(todayISO());
  const [movs, setMovs] = useState<DraftMov[]>([]);

  // Paso 2
  const [encontradoArs, setEncontradoArs] = useState('');
  const [encontradoUsd, setEncontradoUsd] = useState('');

  // Paso 3
  const [saldoConfirmadoStr, setSaldoConfirmadoStr] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  // Totales de movs (sin signo, valores absolutos)
  const totals = useMemo(() => {
    let retArs = 0, retUsd = 0;
    let gastoArs = 0, gastoUsd = 0;
    let ajusteArs = 0, ajusteUsd = 0;
    for (const m of movs) {
      const ars = Math.abs(m.montoArs);
      const usd = Math.abs(m.montoUsd);
      if (m.tipo === 'RETIRO') {
        retArs += ars;
        retUsd += usd;
      } else if (m.tipo === 'GASTO') {
        gastoArs += ars;
        gastoUsd += usd;
      } else {
        ajusteArs += ars;
        ajusteUsd += usd;
      }
    }
    const netoArs = retArs - gastoArs + ajusteArs;
    const netoUsd = retUsd - gastoUsd + ajusteUsd;
    return { retArs, retUsd, gastoArs, gastoUsd, ajusteArs, ajusteUsd, netoArs, netoUsd };
  }, [movs]);

  // Saldo sugerido final = registrado + neto de movs
  const sugeridoArs = saldoRegistradoArs + totals.netoArs;
  const sugeridoUsd = saldoRegistradoUsd + totals.netoUsd;

  // Encontrado parsed
  const encontradoArsNum = parseMontoInput(encontradoArs);
  const encontradoUsdNum = parseMontoInput(encontradoUsd);

  // Diferencia "física" = encontrado - (registrado + retiros - gastos)
  // Wait — el saldo sugerido es lo que DEBERÍA quedar en caja grande
  // después de la sesión. Si encontrado != sugerido, hay diferencia
  // física. Pero acá, "saldo registrado" es lo que había ANTES de la
  // sesión. Después de la sesión, el saldo en caja grande debería ser
  // saldoRegistrado + retiros - gastos (porque los gastos pagados con
  // efectivo salen de la caja). Eso es justamente "sugeridoArs".
  const diferenciaArs = encontradoArsNum - sugeridoArs;
  const diferenciaUsd = encontradoUsdNum - sugeridoUsd;

  // Saldo confirmado por default = encontrado (lo que Iara verifica
  // físicamente). Solo se edita si Martín/owner anota movimientos
  // paralelos que no quedaron en la sesión.
  useEffect(() => {
    if (paso === 3 && !saldoConfirmadoStr) {
      setSaldoConfirmadoStr(String(Math.round(encontradoArsNum)));
    }
  }, [paso, saldoConfirmadoStr, encontradoArsNum]);

  const saldoConfirmadoNum = parseMontoInput(saldoConfirmadoStr);

  const addMov = useCallback(() => {
    setMovs((prev) => [...prev, newDraftMov(localActivo, fechaSesion)]);
  }, [localActivo, fechaSesion]);

  const updateMov = useCallback(
    (id: string, patch: Partial<DraftMov>) => {
      setMovs((prev) =>
        prev.map((m) => (m._id === id ? { ...m, ...patch } : m)),
      );
    },
    [],
  );

  const removeMov = useCallback((id: string) => {
    setMovs((prev) => prev.filter((m) => m._id !== id));
  }, []);

  const goSiguiente = useCallback(() => {
    if (paso === 1) {
      // Validar al menos 1 mov con monto > 0
      const valido = movs.some(
        (m) => m.concepto.trim() && (m.montoArs > 0 || m.montoUsd > 0),
      );
      if (!valido) {
        onError('Agregá al menos un movimiento con monto y concepto');
        return;
      }
      setPaso(2);
      return;
    }
    if (paso === 2) {
      setPaso(3);
    }
  }, [paso, movs, onError]);

  const goAtras = useCallback(() => {
    if (paso === 2) setPaso(1);
    if (paso === 3) setPaso(2);
  }, [paso]);

  const submit = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const validMovs = movs.filter(
        (m) => m.concepto.trim() && (m.montoArs > 0 || m.montoUsd > 0),
      );
      const res = await fetch('/api/caja/sesion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fechaSesion,
          local: localActivo,
          movs: validMovs.map((m) => ({
            tipo: m.tipo,
            fecha: m.fecha,
            local: m.local,
            montoArs: m.montoArs,
            montoUsd: m.montoUsd,
            concepto: m.concepto,
            categoriaFina: m.categoriaFina || '',
            estado: m.estado,
          })),
          saldoRegistradoArs,
          saldoRegistradoUsd,
          encontradoArs: encontradoArsNum,
          encontradoUsd: encontradoUsdNum,
          saldoConfirmadoArs: saldoConfirmadoNum,
          saldoConfirmadoUsd: encontradoUsdNum, // por ahora no se edita USD aparte
          notas,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        onCompleted('Sesión guardada');
      } else {
        onError(data.error || 'Error guardando sesión');
      }
    } catch {
      onError('Error de red');
    } finally {
      setSaving(false);
    }
  }, [
    saving, movs, fechaSesion, localActivo, saldoRegistradoArs, saldoRegistradoUsd,
    encontradoArsNum, encontradoUsdNum, saldoConfirmadoNum, notas, onCompleted, onError,
  ]);

  return (
    <div
      className="page-enter"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        paddingBottom: 'calc(var(--nav-height) + var(--safe-bottom) + 96px)',
      }}
    >
      {/* Wizard header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          paddingTop: 4,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancelar sesión"
          className="press-feedback"
          style={{
            width: 'var(--touch-min)',
            height: 'var(--touch-min)',
            minWidth: 'var(--touch-min)',
            borderRadius: '50%',
            background: 'var(--bg-subtle)',
            border: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <CloseIcon />
        </button>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            Caja · Paso {paso} de 3
          </div>
          <h2
            className="font-brand"
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '-0.022em',
              marginTop: 2,
            }}
          >
            {paso === 1 && 'Movimientos'}
            {paso === 2 && '¿Cuánto encontraste?'}
            {paso === 3 && 'Confirmar sesión'}
          </h2>
        </div>
        <StepIndicator paso={paso} />
      </div>

      {/* Paso 1 — movimientos */}
      {paso === 1 && (
        <Paso1
          localActivo={localActivo}
          onLocalChange={setLocalActivo}
          movs={movs}
          onUpdate={updateMov}
          onRemove={removeMov}
          onAdd={addMov}
        />
      )}

      {/* Paso 2 — cuánto encontraste */}
      {paso === 2 && (
        <Paso2
          saldoRegistradoArs={saldoRegistradoArs}
          saldoRegistradoUsd={saldoRegistradoUsd}
          encontradoArs={encontradoArs}
          setEncontradoArs={setEncontradoArs}
          encontradoUsd={encontradoUsd}
          setEncontradoUsd={setEncontradoUsd}
          sugeridoArs={sugeridoArs}
          sugeridoUsd={sugeridoUsd}
          diferenciaArs={diferenciaArs}
          diferenciaUsd={diferenciaUsd}
        />
      )}

      {/* Paso 3 — confirmar */}
      {paso === 3 && (
        <Paso3
          retArs={totals.retArs}
          gastoArs={totals.gastoArs}
          encontradoArs={encontradoArsNum}
          sugeridoArs={sugeridoArs}
          saldoConfirmadoStr={saldoConfirmadoStr}
          setSaldoConfirmadoStr={setSaldoConfirmadoStr}
          notas={notas}
          setNotas={setNotas}
        />
      )}

      {/* Bottom fixed bar */}
      <BottomBar
        paso={paso}
        onAtras={goAtras}
        onSiguiente={goSiguiente}
        onConfirmar={submit}
        retiradoArs={totals.retArs}
        gastadoArs={totals.gastoArs}
        netoArs={totals.netoArs}
        saving={saving}
      />
    </div>
  );
}

// ─── Paso 1 ──────────────────────────────────────────────────────

function Paso1({
  localActivo,
  onLocalChange,
  movs,
  onUpdate,
  onRemove,
  onAdd,
}: {
  localActivo: Ancla;
  onLocalChange: (a: Ancla) => void;
  movs: DraftMov[];
  onUpdate: (id: string, patch: Partial<DraftMov>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: 8,
          }}
        >
          Local activo
        </div>
        <div
          className="hide-scrollbar"
          style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            paddingBottom: 2,
          }}
        >
          {ANCLAS.filter((a) => a !== 'MyP' && a !== 'CRONKLAM').map((a) => {
            const selected = a === localActivo;
            return (
              <button
                key={a}
                type="button"
                onClick={() => onLocalChange(a)}
                aria-pressed={selected}
                className="press-feedback"
                style={{
                  minHeight: 36,
                  padding: '0 14px',
                  borderRadius: 999,
                  background: selected ? 'var(--text)' : 'var(--bg-card)',
                  color: selected ? 'var(--text-inverse)' : 'var(--text-muted)',
                  border: `1px solid ${selected ? 'var(--text)' : 'var(--border)'}`,
                  fontSize: 12.5,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {ANCLA_SHORT[a]}
              </button>
            );
          })}
        </div>
      </div>

      {movs.length === 0 && (
        <div
          style={{
            padding: '40px 16px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            background: 'var(--bg-card-alt)',
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
          }}
        >
          Empezá agregando el primer movimiento del control
        </div>
      )}

      {movs.map((m, idx) => (
        <MovForm
          key={m._id}
          idx={idx + 1}
          mov={m}
          onUpdate={(p) => onUpdate(m._id, p)}
          onRemove={() => onRemove(m._id)}
        />
      ))}

      <button
        type="button"
        onClick={onAdd}
        className="press-feedback"
        style={{
          minHeight: 'var(--touch-min)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-card-alt)',
          border: '1px dashed var(--border-strong)',
          color: 'var(--text-muted)',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        + Agregar movimiento
      </button>
    </div>
  );
}

function MovForm({
  idx,
  mov,
  onUpdate,
  onRemove,
}: {
  idx: number;
  mov: DraftMov;
  onUpdate: (patch: Partial<DraftMov>) => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Mov #{idx} · {mov.local}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Eliminar movimiento"
          className="press-feedback"
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'var(--red-bg)',
            color: 'var(--red)',
            border: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Tipo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {SESION_TIPOS_MOV.map((t) => {
          const selected = mov.tipo === t;
          const colors = SESION_TIPO_COLOR[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => onUpdate({ tipo: t })}
              aria-pressed={selected}
              className="press-feedback"
              style={{
                minHeight: 44,
                borderRadius: 'var(--radius-md)',
                background: selected ? colors.fg : 'var(--bg-card)',
                color: selected ? '#FDFBF8' : 'var(--text-muted)',
                border: `1.5px solid ${selected ? colors.fg : 'var(--border)'}`,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {SESION_TIPO_LABEL[t]}
            </button>
          );
        })}
      </div>

      {/* Fecha + Local (local read-only) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <FieldLabel label="Fecha">
          <input
            type="date"
            value={mov.fecha}
            onChange={(e) => onUpdate({ fecha: e.target.value })}
            className="input-pro tabular-nums-strict"
            style={{ minHeight: 'var(--touch-min)' }}
          />
        </FieldLabel>
        <FieldLabel label="Local">
          <input
            type="text"
            value={mov.local}
            readOnly
            className="input-pro"
            style={{ minHeight: 'var(--touch-min)', opacity: 0.7 }}
          />
        </FieldLabel>
      </div>

      {/* Montos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <FieldLabel label="Monto ARS">
          <input
            type="text"
            inputMode="decimal"
            value={mov.montoArs || ''}
            onChange={(e) => onUpdate({ montoArs: parseMontoInput(e.target.value) })}
            placeholder="0"
            className="input-pro tabular-nums-strict"
            style={{ minHeight: 'var(--touch-min)' }}
          />
        </FieldLabel>
        <FieldLabel label="Monto USD">
          <input
            type="text"
            inputMode="decimal"
            value={mov.montoUsd || ''}
            onChange={(e) => onUpdate({ montoUsd: parseMontoInput(e.target.value) })}
            placeholder="0"
            className="input-pro tabular-nums-strict"
            style={{ minHeight: 'var(--touch-min)' }}
          />
        </FieldLabel>
      </div>

      {/* Concepto */}
      <FieldLabel label="Concepto">
        <input
          type="text"
          value={mov.concepto}
          onChange={(e) => onUpdate({ concepto: e.target.value })}
          placeholder="ej: 19/10 turno mañana"
          maxLength={200}
          className="input-pro"
          style={{ minHeight: 'var(--touch-min)' }}
        />
      </FieldLabel>

      {/* Categoría fina (solo gasto) */}
      {mov.tipo === 'GASTO' && (
        <FieldLabel label="Categoría">
          <select
            value={mov.categoriaFina || ''}
            onChange={(e) =>
              onUpdate({ categoriaFina: e.target.value as SesionCategoriaGasto })
            }
            className="input-pro"
            style={{ minHeight: 'var(--touch-min)' }}
          >
            <option value="">— sin categoría —</option>
            {SESION_CATEGORIAS_GASTO.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FieldLabel>
      )}

      {/* Estado */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['COMPLETO', 'PARCIAL'] as SesionEstadoMov[]).map((e) => {
          const selected = mov.estado === e;
          return (
            <button
              key={e}
              type="button"
              onClick={() => onUpdate({ estado: e })}
              aria-pressed={selected}
              className="press-feedback"
              style={{
                minHeight: 36,
                padding: '0 14px',
                borderRadius: 999,
                background: selected ? 'var(--text)' : 'var(--bg-card)',
                color: selected ? 'var(--text-inverse)' : 'var(--text-muted)',
                border: `1px solid ${selected ? 'var(--text)' : 'var(--border)'}`,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {e === 'COMPLETO' ? 'Completo' : 'Parcial'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Paso 2 ──────────────────────────────────────────────────────

function Paso2({
  saldoRegistradoArs,
  saldoRegistradoUsd,
  encontradoArs,
  setEncontradoArs,
  encontradoUsd,
  setEncontradoUsd,
  sugeridoArs,
  diferenciaArs,
  diferenciaUsd,
}: {
  saldoRegistradoArs: number;
  saldoRegistradoUsd: number;
  encontradoArs: string;
  setEncontradoArs: (v: string) => void;
  encontradoUsd: string;
  setEncontradoUsd: (v: string) => void;
  sugeridoArs: number;
  sugeridoUsd: number;
  diferenciaArs: number;
  diferenciaUsd: number;
}) {
  const encontradoNum = parseMontoInput(encontradoArs);
  const showDiff = encontradoArs.trim() !== '' && Math.round(diferenciaArs) !== 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <section
        style={{
          background: 'var(--bg-card-alt)',
          border: '1px solid var(--border-accent)',
          borderRadius: 'var(--radius-md)',
          padding: 14,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--accent-hover)',
            padding: '4px 9px',
            border: '1px solid var(--border-accent)',
            borderRadius: 999,
            marginBottom: 8,
          }}
        >
          <span
            aria-hidden
            style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }}
          />
          Saldo sugerido
        </div>
        <div
          className="font-brand tabular-nums-strict"
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: 'var(--text)',
            lineHeight: 1.05,
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          }}
        >
          {fmtMonto(sugeridoArs, 'PESO')}
          {saldoRegistradoUsd !== 0 && (
            <span
              style={{
                marginLeft: 8,
                color: 'var(--text-muted)',
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              · {fmtMonto(saldoRegistradoUsd, 'DOLAR')}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          Registrado antes ({fmtMonto(saldoRegistradoArs, 'PESO')}) + neto de los movimientos.
        </div>
      </section>

      <FieldLabel label="Encontrado en caja grande · ARS">
        <input
          type="text"
          inputMode="decimal"
          value={encontradoArs}
          onChange={(e) => setEncontradoArs(e.target.value)}
          placeholder="0"
          className="input-pro tabular-nums-strict"
          style={{
            minHeight: 56,
            fontSize: 22,
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            fontWeight: 700,
            textAlign: 'left',
            paddingLeft: 16,
          }}
        />
      </FieldLabel>

      <FieldLabel label="Encontrado · USD (opcional)">
        <input
          type="text"
          inputMode="decimal"
          value={encontradoUsd}
          onChange={(e) => setEncontradoUsd(e.target.value)}
          placeholder="0"
          className="input-pro tabular-nums-strict"
          style={{
            minHeight: 56,
            fontSize: 22,
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            fontWeight: 700,
            paddingLeft: 16,
          }}
        />
      </FieldLabel>

      {showDiff && (
        <section
          style={{
            background: 'var(--warn-strong-bg)',
            border: '1px solid var(--warn-strong)',
            borderRadius: 'var(--radius-md)',
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: 'var(--warn-strong)',
              marginBottom: 4,
            }}
          >
            · Diferencia detectada
          </div>
          <div
            className="font-brand tabular-nums-strict"
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--warn-strong)',
              fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            }}
          >
            {fmtMonto(diferenciaArs, 'PESO')} vs tu registro
            {Math.round(diferenciaUsd) !== 0 && (
              <span style={{ marginLeft: 8, fontSize: 14, fontWeight: 600 }}>
                · {fmtMonto(diferenciaUsd, 'DOLAR')}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              marginTop: 6,
              lineHeight: 1.4,
            }}
          >
            ¿Martín retiró/depositó en paralelo? Si fue así, el siguiente paso te permite confirmar el saldo final.
          </div>
        </section>
      )}
      {encontradoNum > 0 && !showDiff && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--green)',
            fontWeight: 600,
          }}
        >
          ✓ Lo encontrado coincide con el sugerido.
        </div>
      )}
    </div>
  );
}

// ─── Paso 3 ──────────────────────────────────────────────────────

function Paso3({
  retArs,
  gastoArs,
  encontradoArs,
  sugeridoArs,
  saldoConfirmadoStr,
  setSaldoConfirmadoStr,
  notas,
  setNotas,
}: {
  retArs: number;
  gastoArs: number;
  encontradoArs: number;
  sugeridoArs: number;
  saldoConfirmadoStr: string;
  setSaldoConfirmadoStr: (s: string) => void;
  notas: string;
  setNotas: (s: string) => void;
}) {
  const saldoConfirmadoNum = parseMontoInput(saldoConfirmadoStr);
  const diferenciaSugerido = saldoConfirmadoNum - sugeridoArs;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <section
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-accent)',
          borderRadius: 'var(--radius-md)',
          padding: 14,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--accent-hover)',
            padding: '4px 9px',
            border: '1px solid var(--border-accent)',
            borderRadius: 999,
            marginBottom: 10,
          }}
        >
          <span
            aria-hidden
            style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }}
          />
          Resumen del control
        </div>
        <ResumenRow label="Retirado" value={`+${fmtMonto(retArs, 'PESO')}`} color="var(--green)" />
        <ResumenRow label="Gastado" value={`-${fmtMonto(gastoArs, 'PESO')}`} color="var(--red)" />
        <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '8px 0' }} />
        <ResumenRow label="Encontrado en caja grande" value={fmtMonto(encontradoArs, 'PESO')} />
        <ResumenRow
          label="Saldo sugerido final"
          value={fmtMonto(sugeridoArs, 'PESO')}
          bold
        />
      </section>

      <FieldLabel
        label="Saldo confirmado · ARS"
        help="Por defecto = saldo sugerido. Editalo si Martín hizo un movimiento en paralelo."
      >
        <input
          type="text"
          inputMode="decimal"
          value={saldoConfirmadoStr}
          onChange={(e) => setSaldoConfirmadoStr(e.target.value)}
          className="input-pro tabular-nums-strict"
          style={{
            minHeight: 56,
            fontSize: 22,
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            fontWeight: 700,
            paddingLeft: 16,
          }}
        />
      </FieldLabel>

      {Math.round(diferenciaSugerido) !== 0 && (
        <section
          style={{
            background: 'var(--warn-strong-bg)',
            border: '1px solid var(--warn-strong)',
            borderRadius: 'var(--radius-md)',
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: 'var(--warn-strong)',
              marginBottom: 4,
            }}
          >
            Diferencia con sugerido
          </div>
          <div
            className="font-brand tabular-nums-strict"
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--warn-strong)',
              fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            }}
          >
            {fmtMonto(diferenciaSugerido, 'PESO')}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              marginTop: 6,
              lineHeight: 1.4,
            }}
          >
            Esto va a quedar registrado como diferencia en la sesión (categoría DIFERENCIA).
          </div>
        </section>
      )}

      <FieldLabel label="Notas (opcional)">
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={3}
          placeholder="Sobre 50 USD sin abrir, Martín retiró 310k esta tarde, etc."
          maxLength={500}
          className="input-pro"
          style={{ minHeight: 80, paddingTop: 10, paddingBottom: 10 }}
        />
      </FieldLabel>
    </div>
  );
}

function ResumenRow({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: string;
  color?: string;
  bold?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 8,
        padding: '4px 0',
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
      <span
        className="tabular-nums-strict"
        style={{
          fontSize: bold ? 16 : 14,
          fontWeight: bold ? 700 : 600,
          color: color || 'var(--text)',
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Bottom bar ──────────────────────────────────────────────────

function BottomBar({
  paso,
  onAtras,
  onSiguiente,
  onConfirmar,
  retiradoArs,
  gastadoArs,
  netoArs,
  saving,
}: {
  paso: 1 | 2 | 3;
  onAtras: () => void;
  onSiguiente: () => void;
  onConfirmar: () => void;
  retiradoArs: number;
  gastadoArs: number;
  netoArs: number;
  saving: boolean;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 90,
        background: 'var(--bg)',
        borderTop: '1px solid var(--border)',
        paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {paso === 1 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 0,
            background: 'var(--header-bg)',
            color: 'var(--text-inverse)',
            padding: '8px 12px',
          }}
        >
          <Stat label="Retirado" value={fmtMonto(retiradoArs, 'PESO')} color="#7ED957" />
          <Stat label="Gastado" value={fmtMonto(gastadoArs, 'PESO')} color="#E8836E" />
          <Stat label="Neto" value={fmtMonto(netoArs, 'PESO')} color="#FDFBF8" />
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: paso === 1 ? '1fr' : '1fr 2fr',
          gap: 8,
          padding: 12,
        }}
      >
        {paso !== 1 && (
          <button
            type="button"
            onClick={onAtras}
            className="press-feedback"
            style={{
              minHeight: 48,
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Atrás
          </button>
        )}
        {paso === 1 && (
          <button
            type="button"
            onClick={onSiguiente}
            className="press-feedback"
            style={{
              minHeight: 48,
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent)',
              color: '#FDFBF8',
              fontWeight: 700,
              fontSize: 14,
              border: 0,
            }}
          >
            Siguiente · contar caja
          </button>
        )}
        {paso === 2 && (
          <button
            type="button"
            onClick={onSiguiente}
            className="press-feedback"
            style={{
              minHeight: 48,
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent)',
              color: '#FDFBF8',
              fontWeight: 700,
              fontSize: 14,
              border: 0,
            }}
          >
            Siguiente · confirmar
          </button>
        )}
        {paso === 3 && (
          <button
            type="button"
            onClick={onConfirmar}
            disabled={saving}
            className="press-feedback"
            style={{
              minHeight: 48,
              borderRadius: 'var(--radius-md)',
              background: 'var(--header-bg)',
              color: '#FDFBF8',
              fontWeight: 700,
              fontSize: 14,
              border: 0,
              opacity: saving ? 0.6 : 1,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Guardando…' : 'Confirmar sesión'}
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'rgba(253,251,248,0.55)',
        }}
      >
        {label}
      </div>
      <div
        className="tabular-nums-strict"
        style={{
          fontSize: 14,
          fontWeight: 700,
          color,
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StepIndicator({ paso }: { paso: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          aria-hidden
          style={{
            width: paso === n ? 18 : 6,
            height: 6,
            borderRadius: 999,
            background: paso === n ? 'var(--accent)' : 'var(--border-strong)',
            transition: 'width 220ms var(--ease-ios)',
          }}
        />
      ))}
    </div>
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

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
