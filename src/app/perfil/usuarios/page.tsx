'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';
import { PageHeader } from '../../components/PageHeader';
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

export default function UsuariosPage() {
  const { user, loading, isOwner, isAdmin } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<UsuarioRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [source, setSource] = useState<'sheet' | 'hardcoded' | null>(null);
  const [openRole, setOpenRole] = useState<Role | null>(null);
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

  const grouped = useMemo(() => {
    const byRole = new Map<Role, UsuarioRow[]>();
    for (const r of rows) {
      const role = (ROLE_LABELS[r.role as Role] ? r.role : 'viewer') as Role;
      const arr = byRole.get(role) || [];
      arr.push(r);
      byRole.set(role, arr);
    }
    const ordered: { role: Role; users: UsuarioRow[] }[] = [];
    for (const r of ROLE_ORDER) {
      if (byRole.has(r)) ordered.push({ role: r, users: byRole.get(r)! });
    }
    return ordered;
  }, [rows]);

  if (loading || !user || fetching) {
    return (
      <div className="page-enter">
        <PageHeader title="Usuarios" subtitle="Acceso al dashboard" showBack />
        <div className="px-4 pt-6">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <PageHeader title="Usuarios" subtitle="Acceso al dashboard" showBack />
      <div
        className="px-4 pt-4"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          paddingBottom: 'calc(var(--nav-height) + var(--safe-bottom) + 24px)',
        }}
      >
        {source === 'hardcoded' && (
          <FallbackBanner />
        )}

        {isOwner && (
          <button
            type="button"
            onClick={() => {
              setEditingEmail(null);
              setShowAdd(true);
            }}
            className="press-feedback"
            style={{
              minHeight: 'var(--touch-min)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              background: 'var(--accent)',
              color: '#FDFBF8',
              fontWeight: 600,
              fontSize: 14,
              letterSpacing: '-0.01em',
              border: 0,
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.10), 0 1px 2px rgba(31,20,16,0.08), 0 6px 16px -4px rgba(184,149,111,0.45)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <PlusIcon />
            Agregar usuario
          </button>
        )}

        {grouped.length === 0 ? (
          <EmptyState owner={isOwner} onAdd={() => setShowAdd(true)} />
        ) : (
          grouped.map(({ role, users }) => (
            <RoleCard
              key={role}
              role={role}
              users={users}
              isOpen={openRole === role}
              onToggle={() => setOpenRole((p) => (p === role ? null : role))}
              canEdit={isOwner}
              onEdit={(email) => {
                setShowAdd(false);
                setEditingEmail((p) => (p === email ? null : email));
              }}
              editingEmail={editingEmail}
              onSaved={async (msg) => {
                setEditingEmail(null);
                await refresh();
                flashToast(msg);
              }}
              onError={flashToast}
            />
          ))
        )}
      </div>

      {showAdd && isOwner && (
        <UserSheet
          mode="add"
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

// ─── Banner cuando no hay Sheet ─────────────────────────────────────

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
      <strong style={{ display: 'block', marginBottom: 2 }}>
        Modo fallback
      </strong>
      Mostrando lista hardcoded. Configurá <code>GOOGLE_CREDENTIALS</code> en
      Vercel para habilitar lectura/escritura del tab &ldquo;Usuarios&rdquo;.
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────────────

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
      <UsersOutlineIcon />
      <h3
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--text)',
          marginTop: 12,
        }}
      >
        Todavía no hay usuarios cargados
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
        Agregá el primero para que aparezca en la lista.
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

// ─── Card de rol con accordion ──────────────────────────────────────

function RoleCard({
  role,
  users,
  isOpen,
  onToggle,
  canEdit,
  onEdit,
  editingEmail,
  onSaved,
  onError,
}: {
  role: Role;
  users: UsuarioRow[];
  isOpen: boolean;
  onToggle: () => void;
  canEdit: boolean;
  onEdit: (email: string) => void;
  editingEmail: string | null;
  onSaved: (msg: string) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const color = ROLE_COLORS[role];
  const activos = users.filter((u) => u.activo !== 'No').length;
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${isOpen ? color : 'var(--border)'}`,
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
          color: 'var(--text)',
          cursor: 'pointer',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: color,
            color: '#FDFBF8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <UserIcon />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
            {ROLE_LABELS[role]}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
            {users.length} {users.length === 1 ? 'persona' : 'personas'}
            {activos !== users.length && ` · ${activos} activas`}
          </div>
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
              padding: '4px 0',
            }}
          >
            <p
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                padding: '8px 14px 4px',
                lineHeight: 1.4,
              }}
            >
              {ROLE_DESCRIPTIONS[role]}
            </p>
            {users.map((u, i) => (
              <UserRow
                key={u.email + i}
                user={u}
                isFirst={i === 0}
                color={color}
                canEdit={canEdit}
                isEditing={editingEmail === u.email}
                onToggleEdit={() => onEdit(u.email)}
                onSaved={onSaved}
                onError={onError}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Fila de usuario ────────────────────────────────────────────────

function UserRow({
  user,
  isFirst,
  color,
  canEdit,
  isEditing,
  onToggleEdit,
  onSaved,
  onError,
}: {
  user: UsuarioRow;
  isFirst: boolean;
  color: string;
  canEdit: boolean;
  isEditing: boolean;
  onToggleEdit: () => void;
  onSaved: (msg: string) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const isActive = user.activo !== 'No';
  return (
    <div
      style={{
        borderTop: isFirst ? '1px solid var(--border)' : '1px solid var(--border)',
        opacity: isActive ? 1 : 0.55,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--bg-subtle)',
            color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 13,
            fontFamily: "'Recoleta', 'Fraunces', Georgia, serif",
            flexShrink: 0,
          }}
        >
          {(user.name || user.email).slice(0, 1).toUpperCase()}
        </div>
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
            {user.name || user.email}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {user.email}
          </div>
          {!isActive && (
            <span
              style={{
                display: 'inline-block',
                marginTop: 4,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                background: 'var(--red-bg)',
                color: 'var(--red)',
                padding: '2px 7px',
                borderRadius: 999,
              }}
            >
              Inactivo
            </span>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={onToggleEdit}
            className="press-feedback"
            aria-label={isEditing ? 'Cerrar edición' : 'Editar'}
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
            }}
          >
            <PencilIcon />
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
            <div style={{ padding: '0 14px 14px' }}>
              <UserEditor user={user} onSaved={onSaved} onError={onError} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Editor inline (rol + activo/inactivo) ──────────────────────────

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
      if (data.ok) {
        onSaved('Usuario actualizado');
      } else {
        onError(data.error || 'Error guardando');
      }
    } catch {
      onError('Error de conexión');
    } finally {
      setSaving(false);
    }
  }, [activo, name, onError, onSaved, role, saving, user.email]);

  return (
    <div
      style={{
        background: 'var(--bg-card-alt)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <Field label="Nombre">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          className="input-pro"
          style={{ minHeight: 'var(--touch-min)' }}
        />
      </Field>
      <Field label="Rol">
        <RolePicker value={role} onChange={setRole} />
      </Field>
      <Field label="Estado">
        <ToggleRow
          checked={activo}
          onChange={setActivo}
          labelOn="Activo"
          labelOff="Inactivo"
        />
      </Field>
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

// ─── Bottom sheet para "Agregar usuario" ────────────────────────────

function UserSheet({
  mode,
  onClose,
  onSaved,
  onError,
}: {
  mode: 'add';
  onClose: () => void;
  onSaved: (msg: string) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

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
          zIndex: 'var(--z-overlay)' as unknown as number,
          animation: 'fadeIn 0.22s var(--ease-ios) both',
        }}
      />
      <div
        ref={dialogRef}
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
          zIndex: 'var(--z-modal)' as unknown as number,
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
              · Nuevo usuario
            </div>
            <h2
              className="font-brand"
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '-0.022em',
                marginTop: 2,
              }}
            >
              {mode === 'add' ? 'Agregar usuario' : 'Editar usuario'}
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
          <Field label="Email">
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
          </Field>
          <Field label="Nombre">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre y apellido"
              maxLength={100}
              className="input-pro"
              style={{ minHeight: 'var(--touch-min)' }}
            />
          </Field>
          <Field label="Rol">
            <RolePicker value={role} onChange={setRole} />
          </Field>
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

// ─── Subcomponentes utilitarios ─────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
              padding: '10px 12px',
              textAlign: 'left',
              background: selected ? 'var(--accent-bg)' : 'var(--bg-card)',
              border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
              color: selected ? 'var(--accent-hover)' : 'var(--text)',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13 }}>{ROLE_LABELS[r]}</div>
            <div
              style={{
                fontSize: 11,
                marginTop: 2,
                color: selected ? 'var(--accent-hover)' : 'var(--text-muted)',
                opacity: 0.85,
                lineHeight: 1.35,
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

function SkeletonRow() {
  return (
    <div
      className="shimmer-modern"
      style={{
        height: 64,
        borderRadius: 'var(--radius-md)',
        marginBottom: 10,
      }}
    />
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
        zIndex: 'var(--z-toast)' as unknown as number,
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

// ─── Iconos (SVG inline, stroke 1.6) ────────────────────────────────

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
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3 3l8 8M11 3l-8 8"
        stroke="var(--text)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
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

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UsersOutlineIcon() {
  return (
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
  );
}
