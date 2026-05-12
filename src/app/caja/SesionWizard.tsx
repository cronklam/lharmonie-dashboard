'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SESION_TIPOS_MOV,
  SESION_TIPO_LABEL,
  SESION_TIPO_COLOR,
  SESION_CATEGORIAS_GASTO,
  MONEDA_SYMBOLS,
  fmtMonto,
  formatMontoLive,
  parseMontoInput,
  type Moneda,
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

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoToARLabel(iso: string): string {
  // YYYY-MM-DD → DD/MM/YYYY
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Draft local-only del wizard. Cada mov es en UNA SOLA moneda
// (PESO o DOLAR) con UN solo monto. Al hacer submit lo mapeamos a
// la shape del SesionMovInput de lib/caja.ts (que tiene montoArs +
// montoUsd separados) — solo uno tiene valor, el otro queda en 0.
interface DraftMov {
  _id: string;
  tipo: SesionMovInput['tipo'];
  fecha: string;
  local: string;
  moneda: 'PESO' | 'DOLAR';
  monto: number;                                       // siempre positivo, sin signo
  concepto: string;
  categoriaFina?: SesionMovInput['categoriaFina'];
  estado: SesionMovInput['estado'];
}

function newDraftMov(local: string, fecha: string): DraftMov {
  return {
    _id: `m_${Date.now()}_${Math.floor(Math.random() * 999)}`,
    tipo: 'RETIRO',
    fecha,
    local,
    moneda: 'PESO',
    monto: 0,
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
  // fechaControl = hoy (cuando Iara controla) → va en col A del Sheet.
  // fechaAuditada = la fecha de la caja que está controlando → va en
  // la descripción "S. {control} - {local} ({auditada}) - {turno}".
  const [fechaControl] = useState(todayISO());
  const [fechaAuditada, setFechaAuditada] = useState(yesterdayISO());
  const [turnoCompleto, setTurnoCompleto] = useState(true);
  const [turnoLabel, setTurnoLabel] = useState('');
  const [movs, setMovs] = useState<DraftMov[]>([]);

  // Paso 2
  const [encontradoArs, setEncontradoArs] = useState('');
  const [encontradoUsd, setEncontradoUsd] = useState('');

  // Paso 3
  const [saldoConfirmadoStr, setSaldoConfirmadoStr] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  // Totales de movs (sin signo, valores absolutos). Cada mov está en
  // UNA sola moneda — sumamos al bucket que corresponda.
  const totals = useMemo(() => {
    let retArs = 0, retUsd = 0;
    let gastoArs = 0, gastoUsd = 0;
    let ajusteArs = 0, ajusteUsd = 0;
    for (const m of movs) {
      const amount = Math.abs(m.monto);
      const isUsd = m.moneda === 'DOLAR';
      if (m.tipo === 'RETIRO') {
        if (isUsd) retUsd += amount; else retArs += amount;
      } else if (m.tipo === 'GASTO') {
        if (isUsd) gastoUsd += amount; else gastoArs += amount;
      } else {
        if (isUsd) ajusteUsd += amount; else ajusteArs += amount;
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
      setSaldoConfirmadoStr(formatMontoLive(String(Math.round(encontradoArsNum))));
    }
  }, [paso, saldoConfirmadoStr, encontradoArsNum]);

  const saldoConfirmadoNum = parseMontoInput(saldoConfirmadoStr);

  const addMov = useCallback(() => {
    setMovs((prev) => [...prev, newDraftMov(localActivo, fechaControl)]);
  }, [localActivo, fechaControl]);

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
      // Validar fecha auditada
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaAuditada)) {
        onError('Cargá la fecha de la caja que estás controlando.');
        return;
      }
      // Validar turno
      if (!turnoCompleto && !turnoLabel.trim()) {
        onError('Si no es turno completo, indicá el turno (ej "T AM", "T PM").');
        return;
      }
      // Validar al menos 1 mov con monto > 0
      const valido = movs.some(
        (m) => m.concepto.trim() && m.monto > 0,
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
  }, [paso, movs, fechaAuditada, turnoCompleto, turnoLabel, onError]);

  const goAtras = useCallback(() => {
    if (paso === 2) setPaso(1);
    if (paso === 3) setPaso(2);
  }, [paso]);

  const submit = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const validMovs = movs.filter(
        (m) => m.concepto.trim() && m.monto > 0,
      );
      const res = await fetch('/api/caja/sesion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fechaControl,
          fechaAuditada,
          turnoCompleto,
          turnoLabel: turnoCompleto ? '' : turnoLabel.trim(),
          local: localActivo,
          movs: validMovs.map((m) => ({
            tipo: m.tipo,
            fecha: m.fecha,
            local: m.local,
            // Cada mov es UNA moneda — el server-side recibe ambos
            // campos por compat, el otro queda en 0.
            montoArs: m.moneda === 'PESO' ? m.monto : 0,
            montoUsd: m.moneda === 'DOLAR' ? m.monto : 0,
            concepto: m.concepto,
            categoriaFina: m.categoriaFina || '',
            estado: m.estado,
          })),
          saldoRegistradoArs,
          saldoRegistradoUsd,
          encontradoArs: encontradoArsNum,
          encontradoUsd: encontradoUsdNum,
          saldoConfirmadoArs: saldoConfirmadoNum,
          saldoConfirmadoUsd: encontradoUsdNum,
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
    saving, movs, fechaControl, fechaAuditada, turnoCompleto, turnoLabel,
    localActivo, saldoRegistradoArs, saldoRegistradoUsd,
    encontradoArsNum, encontradoUsdNum, saldoConfirmadoNum, notas, onCompleted, onError,
  ]);

  return (
    <div
      className="page-enter"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        paddingBottom: 'calc(var(--nav-height) + var(--safe-bottom) + 60px)',
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
          fechaControl={fechaControl}
          fechaAuditada={fechaAuditada}
          setFechaAuditada={setFechaAuditada}
          turnoCompleto={turnoCompleto}
          setTurnoCompleto={setTurnoCompleto}
          turnoLabel={turnoLabel}
          setTurnoLabel={setTurnoLabel}
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
  fechaControl,
  fechaAuditada,
  setFechaAuditada,
  turnoCompleto,
  setTurnoCompleto,
  turnoLabel,
  setTurnoLabel,
  movs,
  onUpdate,
  onRemove,
  onAdd,
}: {
  localActivo: Ancla;
  onLocalChange: (a: Ancla) => void;
  fechaControl: string;
  fechaAuditada: string;
  setFechaAuditada: (s: string) => void;
  turnoCompleto: boolean;
  setTurnoCompleto: (b: boolean) => void;
  turnoLabel: string;
  setTurnoLabel: (s: string) => void;
  movs: DraftMov[];
  onUpdate: (id: string, patch: Partial<DraftMov>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  // Previa de la descripción que va a quedar en el Sheet
  const previa =
    `S. ${isoToARLabel(fechaControl)} - ${localActivo} ` +
    `(${isoToARLabel(fechaAuditada) || '—'}) - ` +
    (turnoCompleto ? 'T COMPLETO' : (turnoLabel.trim() || 'T ___'));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Card de "auditoría" — datos que van al prefijo de la descripción
          de cada mov: cuándo se controló, qué fecha de caja, qué turno. */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Auditoría
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Fecha de la caja a controlar (la que se está auditando)
          </span>
          <input
            type="date"
            value={fechaAuditada}
            onChange={(e) => setFechaAuditada(e.target.value)}
            max={fechaControl}
            className="input-pro"
            style={{ minHeight: 'var(--touch-min)' }}
          />
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 0',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={turnoCompleto}
            onChange={(e) => setTurnoCompleto(e.target.checked)}
            style={{
              width: 18,
              height: 18,
              accentColor: 'var(--accent)',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
            Turno completo
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              color: 'var(--text-muted)',
            }}
          >
            {turnoCompleto ? 'va "T COMPLETO"' : 'cargá el turno abajo'}
          </span>
        </label>

        {!turnoCompleto && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Turno (ej "T AM", "T PM", "T noche")
            </span>
            <input
              type="text"
              value={turnoLabel}
              onChange={(e) => setTurnoLabel(e.target.value)}
              placeholder="T AM"
              maxLength={40}
              className="input-pro"
              style={{
                minHeight: 'var(--touch-min)',
                textTransform: 'uppercase',
              }}
            />
          </label>
        )}

        <div
          style={{
            padding: '8px 10px',
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 11.5,
            color: 'var(--text-muted)',
            fontFamily: "'JetBrains Mono', monospace",
            wordBreak: 'break-all',
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>Va al Sheet: </span>
          <span style={{ color: 'var(--text)' }}>{previa}</span>
        </div>
      </div>

      {/* Local activo — dropdown compacto. Es el default que toman
          los movimientos NUEVOS al agregarse; cada mov individual
          después puede cambiar su local desde su propio select. */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Local activo · default
        </span>
        <select
          value={localActivo}
          onChange={(e) => onLocalChange(e.target.value as Ancla)}
          className="input-pro"
          style={{ minHeight: 'var(--touch-min)' }}
        >
          {ANCLAS.filter((a) => a !== 'MyP' && a !== 'CRONKLAM').map((a) => (
            <option key={a} value={a}>
              {ANCLA_SHORT[a]}
            </option>
          ))}
        </select>
      </label>

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

      {/* Fecha + Local — ambos selects/inputs editables */}
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
          <select
            value={mov.local}
            onChange={(e) => onUpdate({ local: e.target.value })}
            className="input-pro"
            style={{ minHeight: 'var(--touch-min)' }}
          >
            {ANCLAS.filter((a) => a !== 'MyP' && a !== 'CRONKLAM').map((a) => (
              <option key={a} value={a}>
                {ANCLA_SHORT[a]}
              </option>
            ))}
          </select>
        </FieldLabel>
      </div>

      {/* Moneda + Monto (en una sola moneda — no se permite mixto) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
        <FieldLabel label="Moneda">
          <select
            value={mov.moneda}
            onChange={(e) =>
              onUpdate({ moneda: e.target.value as 'PESO' | 'DOLAR' })
            }
            className="input-pro"
            style={{ minHeight: 'var(--touch-min)' }}
          >
            <option value="PESO">Pesos · $</option>
            <option value="DOLAR">Dólares · US$</option>
          </select>
        </FieldLabel>
        <FieldLabel label={`Monto ${mov.moneda === 'DOLAR' ? 'USD' : 'ARS'}`}>
          <MoneyInput
            value={mov.monto}
            moneda={mov.moneda}
            onChange={(n) => onUpdate({ monto: n })}
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
        <PrefixedInput
          prefix={MONEDA_SYMBOLS.PESO}
          value={encontradoArs}
          onChange={(s) => setEncontradoArs(formatMontoLive(s))}
        />
      </FieldLabel>

      <FieldLabel label="Encontrado · USD (opcional)">
        <PrefixedInput
          prefix={MONEDA_SYMBOLS.DOLAR}
          value={encontradoUsd}
          onChange={(s) => setEncontradoUsd(formatMontoLive(s))}
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
        <PrefixedInput
          prefix={MONEDA_SYMBOLS.PESO}
          value={saldoConfirmadoStr}
          onChange={(s) => setSaldoConfirmadoStr(formatMontoLive(s))}
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
  // Barra compacta pegada JUSTO arriba del BottomNav (que vive en
  // layout, altura nav-height + safe-bottom). Stats + CTA integrados
  // en una sola barra negra delgada — sin paddings grandes.
  const slimBtn: React.CSSProperties = {
    minHeight: 38,
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 13,
    border: 0,
    padding: '0 14px',
    cursor: saving ? 'wait' : 'pointer',
  };
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 'calc(var(--nav-height) + var(--safe-bottom))',
        zIndex: 90,
        background: 'var(--header-bg)',
        color: 'var(--text-inverse)',
        borderTop: '1px solid rgba(196,160,103,0.18)',
        boxShadow: '0 -8px 24px -8px rgba(0,0,0,0.35)',
      }}
    >
      {paso === 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '6px 12px',
          }}
        >
          {/* Stats compactos inline */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              fontSize: 11,
            }}
          >
            <SlimStat label="Ret" value={fmtMonto(retiradoArs, 'PESO')} color="#7ED957" />
            <SlimStat label="Gas" value={fmtMonto(gastadoArs, 'PESO')} color="#E8836E" />
            <SlimStat label="Neto" value={fmtMonto(netoArs, 'PESO')} color="#FDFBF8" bold />
          </div>
          <button
            type="button"
            onClick={onSiguiente}
            className="press-feedback"
            style={{
              ...slimBtn,
              background: 'var(--accent)',
              color: '#FDFBF8',
              flexShrink: 0,
            }}
          >
            Siguiente →
          </button>
        </div>
      )}

      {paso === 2 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
          }}
        >
          <button
            type="button"
            onClick={onAtras}
            className="press-feedback"
            style={{
              ...slimBtn,
              background: 'rgba(253,251,248,0.08)',
              color: '#FDFBF8',
              border: '1px solid rgba(253,251,248,0.18)',
              flexShrink: 0,
            }}
          >
            Atrás
          </button>
          <button
            type="button"
            onClick={onSiguiente}
            className="press-feedback"
            style={{
              ...slimBtn,
              background: 'var(--accent)',
              color: '#FDFBF8',
              flex: 1,
            }}
          >
            Siguiente · confirmar
          </button>
        </div>
      )}

      {paso === 3 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
          }}
        >
          <button
            type="button"
            onClick={onAtras}
            disabled={saving}
            className="press-feedback"
            style={{
              ...slimBtn,
              background: 'rgba(253,251,248,0.08)',
              color: '#FDFBF8',
              border: '1px solid rgba(253,251,248,0.18)',
              flexShrink: 0,
              opacity: saving ? 0.6 : 1,
            }}
          >
            Atrás
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={saving}
            className="press-feedback"
            style={{
              ...slimBtn,
              background: 'var(--green)',
              color: '#FDFBF8',
              flex: 1,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Guardando…' : 'Confirmar sesión'}
          </button>
        </div>
      )}
    </div>
  );
}

function SlimStat({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: string;
  color: string;
  bold?: boolean;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 4,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(253,251,248,0.5)',
        }}
      >
        {label}
      </span>
      <span
        className="tabular-nums-strict"
        style={{
          fontSize: bold ? 13 : 12,
          fontWeight: 700,
          color,
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
        }}
      >
        {value}
      </span>
    </span>
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

// ─── Money inputs ───────────────────────────────────────────────
// MoneyInput: input controlado por número. Renderea el monto con
// puntos de miles a medida que el usuario escribe, con $ o US$ como
// prefix afuera del input. La parent guarda el número crudo; el
// componente maneja su estado de texto local para preservar el
// rastro del usuario (puede tipear "1.234,5", etc).

function MoneyInput({
  value,
  moneda,
  onChange,
  placeholder = '0',
  large = true,
}: {
  value: number;
  moneda: Moneda;
  onChange: (n: number) => void;
  placeholder?: string;
  large?: boolean;
}) {
  // estado local de texto: lo que muestra el input
  const [text, setText] = useState<string>(() =>
    value ? formatMontoLive(String(value)) : '',
  );
  // si el padre cambia el value externamente (ej al elegir tipo) re-sync
  useEffect(() => {
    const currentParsed = parseMontoInput(text);
    if (Math.round(currentParsed) !== Math.round(value)) {
      setText(value ? formatMontoLive(String(value)) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <PrefixedInput
      prefix={MONEDA_SYMBOLS[moneda]}
      value={text}
      onChange={(s) => {
        const formatted = formatMontoLive(s);
        setText(formatted);
        onChange(parseMontoInput(formatted));
      }}
      placeholder={placeholder}
      large={large}
    />
  );
}

// PrefixedInput: input visual con un símbolo de moneda a la izq.
// El estado es solo string — útil cuando el padre ya formatea.
function PrefixedInput({
  prefix,
  value,
  onChange,
  placeholder = '0',
  large = true,
}: {
  prefix: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  large?: boolean;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 16,
          top: '50%',
          transform: 'translateY(-50%)',
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          fontWeight: 600,
          fontSize: large ? 18 : 14,
          color: 'var(--text-muted)',
          pointerEvents: 'none',
        }}
      >
        {prefix}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-pro tabular-nums-strict"
        style={{
          width: '100%',
          minHeight: large ? 56 : 'var(--touch-min)',
          fontSize: large ? 22 : 16,
          fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
          fontWeight: 700,
          paddingLeft: prefix === 'US$' ? 56 : 38,
        }}
      />
    </div>
  );
}
