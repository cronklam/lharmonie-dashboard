import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import { listSesiones, CajaError } from '@/lib/caja-server';

// GET /api/caja/sesiones → lista de sesiones recientes agrupadas
// por prefijo, ordenadas por fecha desc.

export const GET = withAuth(async (_req, user) => {
  if (!hasCapability(user.email, 'caja')) {
    throw new AuthError(403, 'No tenés acceso a Caja');
  }
  try {
    const items = await listSesiones(6);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    if (err instanceof CajaError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('[CAJA/SESIONES] GET error:', err);
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
