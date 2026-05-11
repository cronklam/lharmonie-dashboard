import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import {
  getUserRole,
  ROLE_LABELS,
  AUTHORIZED_USERS,
  type Role,
} from '@/lib/users';
import {
  readUsuariosRaw,
  upsertUsuario,
  deleteUsuario,
} from '@/lib/users-server';

export const GET = withAuth(async (_req, user) => {
  const role = getUserRole(user.email);
  if (role !== 'owner' && role !== 'admin') {
    throw new AuthError(403, 'Solo owner/admin pueden listar usuarios');
  }
  try {
    const { users, rows, source } = await readUsuariosRaw();
    // `seed` = lista hardcoded del código (lib/users.ts). Siempre
    // autorizados, no editables, no deletables desde la UI.
    const seed = AUTHORIZED_USERS.map((u) => ({
      email: u.email,
      name: u.name,
      role: u.role,
    }));
    return NextResponse.json({ ok: true, users, allRows: rows, seed, source });
  } catch (err) {
    console.error('[USUARIOS] GET error:', err);
    return NextResponse.json(
      { ok: false, error: 'Error leyendo usuarios' },
      { status: 500 },
    );
  }
});

interface PostBody {
  email?: unknown;
  name?: unknown;
  role?: unknown;
  activo?: unknown;
  /** Si vino: el row con este email se borra antes del upsert. Sirve
   *  para rename de email — el UI lo manda cuando cambiás el email
   *  de un usuario existente. */
  oldEmail?: unknown;
}

export const POST = withAuth(async (req, user) => {
  // Solo owner puede crear/editar/desactivar usuarios. Admin solo lee.
  const userRole = getUserRole(user.email);
  if (userRole !== 'owner') {
    throw new AuthError(403, 'Solo el owner puede modificar usuarios');
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }

  const { email, name, role, activo, oldEmail } = body;
  if (typeof email !== 'string' || typeof name !== 'string' || typeof role !== 'string') {
    return NextResponse.json({ ok: false, error: 'Faltan campos' }, { status: 400 });
  }
  if (!/^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Email inválido (formato esperado: usuario@dominio.com)' }, { status: 400 });
  }
  if (name.trim().length === 0 || name.length > 100) {
    return NextResponse.json({ ok: false, error: 'Nombre inválido' }, { status: 400 });
  }
  if (!ROLE_LABELS[role as Role]) {
    return NextResponse.json({ ok: false, error: 'Rol inválido' }, { status: 400 });
  }
  const activoStr = typeof activo === 'string' ? activo : 'Sí';
  const oldEmailStr =
    typeof oldEmail === 'string' && oldEmail.trim() ? oldEmail.trim().toLowerCase() : undefined;

  try {
    const result = await upsertUsuario({
      email: email.trim().toLowerCase(),
      name: name.trim(),
      role: role as Role,
      activo: activoStr,
      addedBy: user.email,
      oldEmail: oldEmailStr,
    });
    console.log(
      `[USUARIOS] ${user.email} ${result.action} ${email} role=${role} activo=${activoStr}${oldEmailStr ? ` (renamed from ${oldEmailStr})` : ''}`,
    );
    return NextResponse.json({ ok: true, action: result.action });
  } catch (err) {
    console.error('[USUARIOS] POST error:', err);
    const msg = err instanceof Error ? err.message : 'Error guardando';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});

// DELETE /api/usuarios?email=foo@bar.com  → borra la fila del Sheet
// con ese email. Si el email también está en el seed hardcoded, el
// row del Sheet (un "override") se va pero el seed sigue activo en
// código — el endpoint avisa al cliente.
export const DELETE = withAuth(async (req, user) => {
  const userRole = getUserRole(user.email);
  if (userRole !== 'owner') {
    throw new AuthError(403, 'Solo el owner puede eliminar usuarios');
  }
  const url = new URL(req.url);
  const email = (url.searchParams.get('email') || '').trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ ok: false, error: 'Falta email' }, { status: 400 });
  }
  // Protección: no permitir borrarse a uno mismo.
  if (email === user.email.toLowerCase()) {
    return NextResponse.json(
      { ok: false, error: 'No podés eliminarte a vos mismo' },
      { status: 400 },
    );
  }
  const isSeed = AUTHORIZED_USERS.some(
    (u) => u.email.toLowerCase() === email,
  );
  try {
    const result = await deleteUsuario(email);
    if (!result.deleted && isSeed) {
      // Email en seed pero sin row en Sheet — no hay nada para borrar
      // sin tocar código.
      return NextResponse.json(
        {
          ok: false,
          error:
            'Este usuario solo existe en código (hardcoded). Para quitarlo, editá lib/users.ts y deployá.',
        },
        { status: 400 },
      );
    }
    console.log(
      `[USUARIOS] ${user.email} deleted ${email} (existed=${result.deleted}, isSeed=${isSeed})`,
    );
    return NextResponse.json({
      ok: true,
      deleted: result.deleted,
      seedFallback: isSeed,
    });
  } catch (err) {
    console.error('[USUARIOS] DELETE error:', err);
    const msg = err instanceof Error ? err.message : 'Error borrando';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
