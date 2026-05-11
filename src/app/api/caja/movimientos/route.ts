import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import {
  listMeses,
  listMovimientosMes,
  CajaError,
} from '@/lib/caja-server';

// GET /api/caja/movimientos?mes=YYYY-MM
//   → { ok, mes, tab, items: MovimientoCaja[], mesesDisponibles: string[] }
//
// Si no se pasa `mes`, devuelve los meses disponibles sin items (para
// que la UI sepa qué selector mostrar antes de cargar data).

export const GET = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'caja')) {
    throw new AuthError(403, 'No tenés acceso a Caja');
  }
  const url = new URL(req.url);
  const mes = (url.searchParams.get('mes') || '').trim();

  try {
    const tabs = await listMeses();
    const mesesDisponibles = tabs.map((t) => t.iso);

    if (!mes) {
      return NextResponse.json({
        ok: true,
        items: [],
        mes: null,
        tab: null,
        mesesDisponibles,
      });
    }
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return NextResponse.json(
        { ok: false, error: 'mes inválido (esperado YYYY-MM)' },
        { status: 400 },
      );
    }
    const { tab, items } = await listMovimientosMes(mes);
    return NextResponse.json({ ok: true, mes, tab, items, mesesDisponibles });
  } catch (err) {
    if (err instanceof CajaError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('[CAJA/MOVS] GET error:', err);
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
