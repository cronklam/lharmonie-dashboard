import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import { getSaldo, listMovimientosGrande, CajaError } from '@/lib/caja-server';

// GET /api/caja/saldo → { ok, ars, usd, ultimosMovimientos }
//
// El saldo se calcula sumando todos los movimientos de caja grande.
// `ultimosMovimientos` permite a la UI mostrar la actividad reciente
// sin un segundo round-trip.

export const GET = withAuth(async (_req, user) => {
  if (!hasCapability(user.email, 'caja')) {
    throw new AuthError(403, 'No tenés acceso a Caja');
  }
  try {
    const movs = await listMovimientosGrande();
    const saldo = await getSaldo();
    const ultimos = movs
      .slice()
      .reverse()
      .slice(0, 10);
    return NextResponse.json({
      ok: true,
      ars: saldo.ars,
      usd: saldo.usd,
      ultimosMovimientos: ultimos,
      totalMovimientos: movs.length,
    });
  } catch (err) {
    if (err instanceof CajaError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('[CAJA/SALDO]', err);
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
