'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';
import { PageHeader } from '../../components/PageHeader';
import EyebrowTag from '../../components/EyebrowTag';
import {
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_COLORS,
  type Role,
} from '@/lib/users';

interface UsuarioRow {
  email: string;
  name: string;
  role: string;
  activo: string;
  addedBy: string;
  date: string;
}

const ROLE_ORDER: Role[] = ['owner', 'admin', 'viewer'];

// /perfil/usuarios — pensado para un equipo chico (owner + 1-3 más).
// Por eso lista PLANA (sin accordion por rol). Hero con total +
// "Agregar usuario" prominente, cards de usuario con avatar + chip
// rol + lápiz de edición. Tap en el lápiz despliega el editor inline.

export default function UsuariosPage() {
  const { user, loading, isOwner, isAdmin } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<UsuarioRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [source, setSource] = useState<'sheet' | 'hardcoded' | null>(null);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState('');

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/usuarios', { cache: 'no-store' });
      const data = await res.json();
      if (data.ok) {
        setRows(data.allRows || []);
        setSource(data.source ?? null);
      }
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    if (!isAdmin) {
      router.replace('/perfil');
      return;
    }
    refresh();
  }, [loading, user, isAdmin, refresh, router]);

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2400);
  }, []);

  // Lista ordenada: primero owner, después admin, después viewer.
  // Dentro de cada bloque, alfabético por nombre.
  const sorted = useMemo(() => {
    const order = new Map(ROLE_ORDER.map((r, i) => [r, i]));
    return rows.slice().sort((a, b) => {
      const oa = order.get(a.role as Role) ?? 99;
      const ob = order.get(b.role as Role) ?? 99;
      if (oa !== ob) return oa - ob;
      return (a.name || a.email).localeCompare(b.name || b.email);
    });
  }, [rows]);

  const activos = sorted.filter((u) => u.activo !== 'No').length;

  if (loading || !user) return null;

  return (
    <div className="page-enter">
      <PageHeader title="Usuarios" subtitle="Accesos al dashboard" showBack />
      <div
        className="px-4 pt-4 lh-inicio-stagger"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          paddingBottom: 'calc(var(--nav-height) + var(--safe-bottom) + 24px)',
        }}
      >
        {/* Hero: count + "Agregar" */}
        <section
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: 20,
            boxShadow: 'var(--shadow-card)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: -40,
              right: -40,
              width: 140,
              height: 140,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(196,160,103,0.12) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            Equipo autorizado
          </div>
          <div
            className="font-brand heading-tight tabular-nums-strict"
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: 'var(--text)',
              lineHeight: 1,
              fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            }}
          >
            {sorted.length} {sorted.length === 1 ? 'persona' : 'personas'}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--text-muted)',
              marginTop: 6,
            }}
          >
            {activos === sorted.length
              ? 'Todas activas'
              : `${activos} activas · ${sorted.length - activos} inactivas`}
          </div>
          {isOwner && (
            <button
              type="button"
              onClick={() => {
                setEditingEmail(null);
                setShowAdd(true);
              }}
              className="press-feedback"
              style={{
                marginTop: 14,
                minHeight: 'var(--touch-min)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 18px',
                background: 'var(--accent)',
                color: '#FDFBF8',
                fontWeight: 600,
                fontSize: 13.5,
                border: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.10), 0 6px 16px -4px rgba(184,149,111,0.45)',
              }}
            >
              <PlusIcon /> Agregar usuario
            </button>
          )}
        </section>

        {source === 'hardcoded' && <FallbackBanner />}

        {/* Skeleton inicial */}
        {fetching && sorted.length === 0 && (
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

        {/* Empty */}
        {!fetching && sorted.length === 0 && (
          <EmptyState owner={isOwner} onAdd={() => setShowAdd(true)} />
        )}

        {/* Lista plana */}
        {sorted.length > 0 && (
          <section>
            <div style={{ marginBottom: 8, paddingLeft: 4 }}>
              <EyebrowTag>Lista</EyebrowTag>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sorted.map((u) => (
                <UserCard
                  key={u.email}
                  user={u}
                  canEdit={isOwner}
                  isEditing={editingEmail === u.email}
                  onToggleEdit={() =>
                    setEditingEmail((p) => (p === u.email ? null : u.email))
                  }
                  onSaved={async (msg) => {
                    setEditingEmail(null);
                    await refresh();
                    flashToast(msg);
                  }}
                  onError={flashToast}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {showAdd && isOwner && (
        <AddUserSheet
          onClose={() => setShowAdd(false)}
          onSaved={async (msg) => {
            setShowAdd(false);
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

// ─── User card ───────────────────────────────────────────────────

function UserCard({
  user,
  canEdit,
  isEditing,
  onToggleEdit,
  onSaved,
  onError,
}: {
  user: UsuarioRow;
  canEdit: boolean;
  isEditing: boolean;
  onToggleEdit: () => void;
  onSaved: (msg: string) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const isActive = user.activo !== 'No';
  const role = (ROLE_LABELS[user.role as Role] ? user.role : 'viewer') as Role;
  const roleColor = ROLE_COLORS[role];

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${isEditing ? 'var(--border-accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
        transition: 'border-color 220ms var(--ease-ios)',
        opacity: isActive ? 1 : 0.6,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 14,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'var(--bg-subtle)',
            color: roleColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 16,
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            flexShrink: 0,
            border: `1.5px solid ${roleColor}`,
          }}
        >
          {(user.name || user.email).slice(0, 1).toUpperCase()}
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
            {user.name || user.email.split('@')[0]}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--text-muted)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {user.email}
          </div>
          <div style={{ marginTop: 5, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                background: 'var(--accent-bg)',
                color: roleColor,
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              {ROLE_LABELS[role]}
            </span>
            {!isActive && (
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  background: 'var(--red-bg)',
                  color: 'var(--red)',
                  padding: '2px 8px',
                  borderRadius: 999,
                }}
              >
                Inactivo
              </span>
            )}
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={onToggleEdit}
            className="press-feedback"
            aria-label={isEditing ? 'Cerrar edición' : 'Editar usuario'}
            aria-expanded={isEditing}
            style={{
              width: 'var(--touch-min)',
              height: 'var(--touch-min)',
              minWidth: 'var(--touch-min)',
              borderRadius: '50%',
              background: isEditing ? 'var(--accent-bg)' : 'var(--bg-subtle)',
              border: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isEditing ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {isEditing ? <CloseIcon /> : <PencilIcon />}
          </button>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: isEditing ? '1fr' : '0fr',
          transition: 'grid-template-rows 240ms var(--ease-ios)',
        }}
      >
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          {isEditing && (
            <div
              style={{
                borderTop: '1px solid var(--border)',
                padding: 14,
              }}
            >
              <UserEditor user={user} onSaved={onSaved} onError={onError} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Editor inline ───────────────────────────────────────────────

function UserEditor({
  user,
  onSaved,
  onError,
}: {
  user: UsuarioRow;
  onSaved: (msg: string) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>((user.role as Role) || 'viewer');
  const [activo, setActivo] = useState(user.activo !== 'No');
  const [saving, setSaving] = useState(false);

  const submit = useCallback(async () => {
    if (saving) return;
    if (!name.trim()) {
      onError('Nombre vacío');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          name: name.trim(),
          role,
          activo: activo ? 'Sí' : 'No',
        }),
      });
      const data = await res.json();
      if (data.ok) onSaved('Usuario actualizado');
      else onError(data.error || 'Error guardando');
    } catch {
      onError('Error de conexión');
    } finally {
      setSaving(false);
    }
  }, [activo, name, onError, onSaved, role, saving, user.email]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <FieldLabel label="Nombre">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          className="input-pro"
          style={{ minHeight: 'var(--touch-min)' }}
        />
      </FieldLabel>
      <FieldLabel label="Rol">
        <RolePicker value={role} onChange={setRole} />
      </FieldLabel>
      <FieldLabel label="Estado">
        <ToggleRow
          checked={activo}
          onChange={setActivo}
          labelOn="Activo"
          labelOff="Inactivo"
        />
      </FieldLabel>
      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="press-feedback"
        style={{
          minHeight: 'var(--touch-min)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--green)',
          color: '#FDFBF8',
          fontWeight: 600,
          fontSize: 14,
          border: 0,
          opacity: saving ? 0.6 : 1,
          cursor: saving ? 'wait' : 'pointer',
        }}
      >
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </div>
  );
}

// ─── Bottom sheet: Agregar usuario ───────────────────────────────

function AddUserSheet({
  onClose,
  onSaved,
  onError,
}: {
  onClose: () => void;
  onSaved: (msg: string) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('admin');
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
    const e = email.trim().toLowerCase();
    const n = name.trim();
    if (!/^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(e)) {
      onError('Email inválido');
      return;
    }
    if (!n) {
      onError('Nombre vacío');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e, name: n, role, activo: 'Sí' }),
      });
      const data = await res.json();
      if (data.ok) {
        onSaved(data.action === 'updated' ? 'Usuario actualizado' : 'Usuario agregado');
      } else {
        onError(data.error || 'Error guardando');
      }
    } catch {
      onError('Error de conexión');
    } finally {
      setSaving(false);
    }
  }, [email, name, onError, onSaved, role, saving]);

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
        aria-label="Agregar usuario"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '90vh',
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
              · Nuevo
            </div>
            <h2
              className="font-brand"
              style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.022em', marginTop: 2 }}
            >
              Agregar usuario
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
          <FieldLabel label="Email">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@gmail.com"
              className="input-pro"
              style={{ minHeight: 'var(--touch-min)' }}
            />
          </FieldLabel>
          <FieldLabel label="Nombre">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre y apellido"
              maxLength={100}
              className="input-pro"
              style={{ minHeight: 'var(--touch-min)' }}
            />
          </FieldLabel>
          <FieldLabel label="Rol">
            <RolePicker value={role} onChange={setRole} />
          </FieldLabel>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
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
      </div>
    </>
  );
}

// ─── Utilities ────────────────────────────────────────────────────

function FieldLabel({
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

function RolePicker({
  value,
  onChange,
}: {
  value: Role;
  onChange: (r: Role) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
      {ROLE_ORDER.map((r) => {
        const selected = value === r;
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            className="press-feedback"
            aria-pressed={selected}
            style={{
              minHeight: 'var(--touch-min)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 6px',
              textAlign: 'center',
              background: selected ? 'var(--accent-bg)' : 'var(--bg-card)',
              border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
              color: selected ? 'var(--accent-hover)' : 'var(--text)',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>{ROLE_LABELS[r]}</div>
            <div
              style={{
                fontSize: 9.5,
                marginTop: 2,
                color: selected ? 'var(--accent-hover)' : 'var(--text-muted)',
                lineHeight: 1.2,
                fontWeight: 500,
              }}
            >
              {ROLE_DESCRIPTIONS[r]}
            </div>
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

function FallbackBanner() {
  return (
    <div
      role="status"
      style={{
        background: 'var(--warn-strong-bg)',
        border: '1px solid var(--warn-strong)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        fontSize: 12.5,
        color: 'var(--warn-strong)',
        lineHeight: 1.45,
      }}
    >
      <strong style={{ display: 'block', marginBottom: 2 }}>Modo fallback</strong>
      Mostrando lista hardcoded. Configurá <code>GOOGLE_CREDENTIALS</code> en
      Vercel para habilitar lectura/escritura del tab &ldquo;Usuarios&rdquo;.
    </div>
  );
}

function EmptyState({ owner, onAdd }: { owner: boolean; onAdd: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '48px 16px',
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
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
      <h3
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--text)',
          marginTop: 12,
        }}
      >
        Sin usuarios todavía
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
        Agregá el primero para habilitarle el acceso al dashboard.
      </p>
      {owner && (
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
          Agregar usuario
        </button>
      )}
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
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
