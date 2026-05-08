import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { getUserRole, ROLE_LABELS, type Role } from '@/lib/users';
import { readUsuariosRaw, upsertUsuario } from '@/lib/users-server';

export const GET = withAuth(async (_req, user) => {
  const role = getUserRole(user.email);
  if (role !== 'owner' && role !== 'admin') {
    throw new AuthError(403, 'Solo owner/admin pueden listar usuarios');
  }
  try {
    const { users, rows, source } = await readUsuariosRaw();
    return NextResponse.json({ ok: true, users, allRows: rows, source });
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

  const { email, name, role, activo } = body;
  if (typeof email !== 'string' || typeof name !== 'string' || typeof role !== 'string') {
    return NextResponse.json({ ok: false, error: 'Faltan campos' }, { status: 400 });
  }
  if (!/^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Email inválido' }, { status: 400 });
  }
  if (name.trim().length === 0 || name.length > 100) {
    return NextResponse.json({ ok: false, error: 'Nombre inválido' }, { status: 400 });
  }
  if (!ROLE_LABELS[role as Role]) {
    return NextResponse.json({ ok: false, error: 'Rol inválido' }, { status: 400 });
  }
  const activoStr = typeof activo === 'string' ? activo : 'Sí';

  try {
    const result = await upsertUsuario({
      email: email.trim().toLowerCase(),
      name: name.trim(),
      role: role as Role,
      activo: activoStr,
      addedBy: user.email,
    });
    console.log(
      `[USUARIOS] ${user.email} ${result.action} ${email} role=${role} activo=${activoStr}`,
    );
    return NextResponse.json({ ok: true, action: result.action });
  } catch (err) {
    console.error('[USUARIOS] POST error:', err);
    const msg = err instanceof Error ? err.message : 'Error guardando';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
