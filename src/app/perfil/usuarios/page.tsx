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

interface SheetRow {
  email: string;
  name: string;
  role: string;
  activo: string;
  addedBy: string;
  date: string;
}

interface SeedUser {
  email: string;
  name: string;
  role: Role;
}

type Source = 'seed' | 'sheet';

interface MergedUser {
  email: string;
  name: string;
  role: Role;
  activo: boolean;
  source: Source;
  emailValid: boolean;
}

const ROLE_ORDER: Role[] = ['owner', 'admin', 'viewer'];

const EMAIL_REGEX = /^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$/;

// /perfil/usuarios — quién tiene acceso al dashboard.
//
// Dos fuentes de verdad, unificadas en pantalla:
//   1. Hardcoded (lib/users.ts) — siempre autorizados, no editables
//      desde la UI. Chip "Por código".
//   2. Sheet "Usuarios" del Sheet de Facturas — editable, deletable.
//
// Cada card muestra el email COMPLETO con monospace, y si el email no
// matchea el formato estándar (sin @, etc) se ve un chip rojo
// "Email inválido — no autoriza a nadie" + opción Eliminar para limpiar
// la fila rota.

export default function UsuariosPage() {
  const { user, loading, isOwner, isAdmin } = useAuth();
  const router = useRouter();

  const [sheetRows, setSheetRows] = useState<SheetRow[]>([]);
  const [seed, setSeed] = useState<SeedUser[]>([]);
  const [fetching, setFetching] = useState(true);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState('');

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/usuarios', { cache: 'no-store' });
      const data = await res.json();
      if (data.ok) {
        setSheetRows(data.allRows || []);
        setSeed(data.seed || []);
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

  // Merge: el Sheet GANA sobre seed (porque representa una edición
  // explícita del owner). Si un seed tiene fila en el Sheet con su
  // mismo email, la del Sheet es la que se muestra. Eso permite
  // editar seeds: al guardar se crea un row en el Sheet que sirve
  // como override.
  const merged: MergedUser[] = useMemo(() => {
    const sheetEmails = new Set(
      sheetRows
        .map((r) => (r.email || '').toLowerCase().trim())
        .filter(Boolean),
    );
    const out: MergedUser[] = [];
    // Seeds que NO tienen override en el Sheet
    for (const s of seed) {
      if (sheetEmails.has(s.email.toLowerCase())) continue;
      out.push({
        email: s.email,
        name: s.name,
        role: s.role,
        activo: true,
        source: 'seed',
        emailValid: EMAIL_REGEX.test(s.email),
      });
    }
    // Filas del Sheet (incluye overrides de seeds y entries nuevos)
    for (const r of sheetRows) {
      const emailLc = (r.email || '').toLowerCase().trim();
      if (!emailLc) continue;
      const role = (ROLE_LABELS[r.role as Role] ? r.role : 'viewer') as Role;
      out.push({
        email: r.email,
        name: r.name || '',
        role,
        activo: (r.activo || 'Sí') !== 'No',
        source: 'sheet',
        emailValid: EMAIL_REGEX.test(emailLc),
      });
    }
    // Orden: seeds puros primero; dentro de cada bloque por rol; alfabético.
    return out.sort((a, b) => {
      if (a.source !== b.source) return a.source === 'seed' ? -1 : 1;
      const oa = ROLE_ORDER.indexOf(a.role);
      const ob = ROLE_ORDER.indexOf(b.role);
      if (oa !== ob) return oa - ob;
      return (a.name || a.email).localeCompare(b.name || b.email);
    });
  }, [seed, sheetRows]);

  const totalAuth = merged.filter((u) => u.activo && u.emailValid).length;
  const invalidCount = merged.filter((u) => !u.emailValid).length;

  if (loading || !user) return null;

  return (
    <div className="page-enter">
      <PageHeader title="Usuarios" subtitle="Quién entra al dashboard" showBack />
      <div
        className="px-4 pt-4 lh-inicio-stagger"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          paddingBottom: 'calc(var(--nav-height) + var(--safe-bottom) + 24px)',
        }}
      >
        {/* Hero */}
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
            Acceso al dashboard
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
            {totalAuth} {totalAuth === 1 ? 'mail autorizado' : 'mails autorizados'}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--text-muted)',
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            {seed.length} por código (siempre activos)
            {sheetRows.length > 0 && ` · ${sheetRows.length} en el Sheet`}
            {invalidCount > 0 && (
              <span style={{ color: 'var(--red)', fontWeight: 600 }}>
                {' · '}
                {invalidCount} con email inválido
              </span>
            )}
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

        {/* Skeleton inicial */}
        {fetching && merged.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="shimmer-modern"
                style={{ height: 84, borderRadius: 14 }}
              />
            ))}
          </div>
        )}

        {/* Lista plana — seed primero, después sheet */}
        {merged.length > 0 && (
          <section>
            <div style={{ marginBottom: 8, paddingLeft: 4 }}>
              <EyebrowTag>Lista</EyebrowTag>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {merged.map((u) => (
                <UserCard
                  key={`${u.source}:${u.email}`}
                  user={u}
                  isMe={u.email.toLowerCase() === (user.email || '').toLowerCase()}
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
                  onDeleted={async (msg) => {
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
  isMe,
  canEdit,
  isEditing,
  onToggleEdit,
  onSaved,
  onDeleted,
  onError,
}: {
  user: MergedUser;
  isMe: boolean;
  canEdit: boolean;
  isEditing: boolean;
  onToggleEdit: () => void;
  onSaved: (msg: string) => Promise<void> | void;
  onDeleted: (msg: string) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const roleColor = ROLE_COLORS[user.role];
  const isSeed = user.source === 'seed';

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${isEditing ? 'var(--border-accent)' : !user.emailValid ? 'var(--red)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
        transition: 'border-color 220ms var(--ease-ios)',
        opacity: user.activo ? 1 : 0.6,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
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
            {user.name || user.email.split('@')[0] || '—'}
            {isMe && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-muted)',
                  padding: '2px 7px',
                  borderRadius: 999,
                  verticalAlign: 'middle',
                }}
              >
                Vos
              </span>
            )}
          </div>
          {/* Email completo, sin truncar */}
          <div
            style={{
              fontSize: 12,
              color: user.emailValid ? 'var(--text-muted)' : 'var(--red)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              marginTop: 3,
              wordBreak: 'break-all',
              lineHeight: 1.4,
              fontWeight: user.emailValid ? 400 : 600,
            }}
          >
            {user.email || '(sin email)'}
          </div>
          <div style={{ marginTop: 7, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
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
              {ROLE_LABELS[user.role]}
            </span>
            {isSeed && (
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-muted)',
                  padding: '2px 8px',
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                }}
              >
                Por código
              </span>
            )}
            {!user.activo && (
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
            {!user.emailValid && (
              <span
                title="Sin @ en el email — no autoriza a nadie"
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
                Email inválido
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
          {isEditing && canEdit && (
            <div
              style={{
                borderTop: '1px solid var(--border)',
                padding: 14,
              }}
            >
              <UserEditor
                user={user}
                onSaved={onSaved}
                onDeleted={onDeleted}
                onError={onError}
              />
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
  onDeleted,
  onError,
}: {
  user: MergedUser;
  onSaved: (msg: string) => Promise<void> | void;
  onDeleted: (msg: string) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const [email, setEmail] = useState(user.email);
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [activo, setActivo] = useState(user.activo);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isSeed = user.source === 'seed';
  const emailNuevoLc = email.trim().toLowerCase();
  const emailValidNow = EMAIL_REGEX.test(emailNuevoLc);
  const emailChanged = emailNuevoLc !== user.email.toLowerCase();

  const submit = useCallback(async () => {
    if (saving) return;
    if (!emailValidNow) {
      onError('Email inválido — formato: usuario@dominio.com');
      return;
    }
    if (!name.trim()) {
      onError('Nombre vacío');
      return;
    }
    setSaving(true);
    try {
      // Si cambió el email Y la fila existía en el Sheet, mandamos
      // oldEmail para que el server borre la fila vieja antes del
      // upsert (rename atómico). Para seeds sin override, oldEmail
      // no aplica — la fila vieja no existe en el Sheet.
      const sendOldEmail = emailChanged && !isSeed ? user.email : undefined;
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailNuevoLc,
          name: name.trim(),
          role,
          activo: activo ? 'Sí' : 'No',
          oldEmail: sendOldEmail,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        onSaved(
          isSeed && !emailChanged
            ? 'Override creado · ahora editable desde Sheet'
            : data.action === 'renamed'
            ? 'Email renombrado'
            : 'Usuario actualizado',
        );
      } else {
        onError(data.error || 'Error guardando');
      }
    } catch {
      onError('Error de conexión');
    } finally {
      setSaving(false);
    }
  }, [
    activo, emailChanged, emailNuevoLc, emailValidNow, isSeed, name, onError, onSaved, role, saving, user.email,
  ]);

  const remove = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/usuarios?email=${encodeURIComponent(user.email)}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (data.ok) onDeleted('Usuario eliminado');
      else onError(data.error || 'Error eliminando');
    } catch {
      onError('Error de conexión');
    } finally {
      setSaving(false);
      setConfirmingDelete(false);
    }
  }, [saving, user.email, onDeleted, onError]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Banner explicativo si es seed (Por código) */}
      {isSeed && (
        <div
          style={{
            background: 'var(--accent-bg)',
            border: '1px solid var(--border-accent)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 12px',
            fontSize: 12,
            color: 'var(--accent-hover)',
            lineHeight: 1.45,
          }}
        >
          <strong style={{ display: 'block', marginBottom: 2 }}>
            Usuario hardcoded
          </strong>
          Al guardar se crea un row en el Sheet que <em>override</em> al del
          código. Si borrás el row del Sheet más adelante, vuelve al estado
          original.
        </div>
      )}

      {/* Email — read-only para seeds (cambiarlo requiere tocar
          lib/users.ts), editable para filas del Sheet. Si cambia para
          un sheet row, el server hace rename atómico (delete + insert
          en una sola transacción). */}
      <FieldLabel label={isSeed ? 'Email · fijo en código' : 'Email'}>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          readOnly={isSeed}
          className="input-pro"
          style={{
            minHeight: 'var(--touch-min)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            borderColor: emailValidNow ? undefined : 'var(--red)',
            background: isSeed ? 'var(--bg-card-alt)' : undefined,
            opacity: isSeed ? 0.7 : 1,
            cursor: isSeed ? 'not-allowed' : 'text',
          }}
        />
        {!emailValidNow && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--red)',
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            Falta @ o dominio. Ejemplo: nombre@gmail.com
          </span>
        )}
        {emailValidNow && emailChanged && !isSeed && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--warn-strong)',
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            Renombrar: al guardar, el row con &ldquo;{user.email}&rdquo; se borra y se
            crea uno nuevo con este email.
          </span>
        )}
        {isSeed && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            Para renombrar este email hay que editar <code>lib/users.ts</code> y deployar.
          </span>
        )}
      </FieldLabel>

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

      {/* Save */}
      <button
        type="button"
        onClick={submit}
        disabled={saving || !emailValidNow}
        className="press-feedback"
        style={{
          minHeight: 'var(--touch-min)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--green)',
          color: '#FDFBF8',
          fontWeight: 600,
          fontSize: 14,
          border: 0,
          opacity: saving || !emailValidNow ? 0.5 : 1,
          cursor: saving ? 'wait' : 'pointer',
        }}
      >
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </button>

      {/* Delete — solo si la fila existe en el Sheet (seed puro no
          tiene nada que borrar; para sacarlo hay que tocar código). */}
      {isSeed ? null : !confirmingDelete ? (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={saving}
          className="press-feedback"
          style={{
            minHeight: 'var(--touch-min)',
            borderRadius: 'var(--radius-md)',
            background: 'transparent',
            color: 'var(--red)',
            fontWeight: 600,
            fontSize: 13.5,
            border: '1px solid var(--red)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <TrashIcon /> Eliminar usuario
        </button>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            padding: 8,
            background: 'var(--red-bg)',
            border: '1px solid var(--red)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            disabled={saving}
            className="press-feedback"
            style={{
              minHeight: 'var(--touch-min)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-card)',
              color: 'var(--text)',
              fontWeight: 600,
              fontSize: 13,
              border: '1px solid var(--border)',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={saving}
            className="press-feedback"
            style={{
              minHeight: 'var(--touch-min)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--red)',
              color: '#FDFBF8',
              fontWeight: 700,
              fontSize: 13,
              border: 0,
            }}
          >
            {saving ? 'Borrando…' : 'Sí, eliminar'}
          </button>
        </div>
      )}
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
    if (!EMAIL_REGEX.test(e)) {
      onError('Email inválido — formato: usuario@dominio.com');
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

  const emailLooksOk = email.trim().length === 0 || EMAIL_REGEX.test(email.trim().toLowerCase());

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
          <FieldLabel label="Email de Google">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@gmail.com"
              className="input-pro"
              style={{
                minHeight: 'var(--touch-min)',
                borderColor: emailLooksOk ? undefined : 'var(--red)',
              }}
            />
            <span
              style={{
                fontSize: 11,
                color: emailLooksOk ? 'var(--text-muted)' : 'var(--red)',
                marginTop: 4,
                lineHeight: 1.4,
              }}
            >
              {emailLooksOk
                ? 'Tiene que ser el email exacto con el que entra a Google (Gmail u otro de Google Workspace).'
                : 'Falta @ o dominio. Ejemplo válido: nombre@gmail.com'}
            </span>
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

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
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
