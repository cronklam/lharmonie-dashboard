import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import { getSaldosGlobales, CajaError } from '@/lib/caja-server';

// GET /api/caja/saldos → { ok, pesos, dolares }
// Suma de TODAS las pestañas mensuales (no la PORTADA). Cálculo
// client-of-the-Sheet: leemos importes de cada tab y sumamos por moneda.

export const GET = withAuth(async (_req, user) => {
  if (!hasCapability(user.email, 'caja')) {
    throw new AuthError(403, 'No tenés acceso a Caja');
  }
  try {
    const { pesos, dolares } = await getSaldosGlobales();
    return NextResponse.json({ ok: true, pesos, dolares });
  } catch (err) {
    if (err instanceof CajaError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('[CAJA/SALDOS] GET error:', err);
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
