import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import { clearFacturaRow } from '@/lib/facturas-write';

// POST /api/factura/eliminar
// Body: { filaExacta }
// Limpia el contenido de la fila exacta en el Sheet de Facturas.
// NO shifta filas siguientes (riesgoso si hay fórmulas que
// referencian rows específicos). Pierde la entrada pero no rompe nada
// abajo.
//
// Permiso: necesita marcar-pagada (todos los autorizados que pueden
// marcar pagada también pueden eliminar — owner + admin, no viewer).
export const POST = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'marcar-pagada')) {
    return NextResponse.json(
      { ok: false, error: 'No tenés permisos para eliminar facturas' },
      { status: 403 },
    );
  }
  try {
    const body = await req.json();
    const filaExacta =
      typeof body.filaExacta === 'number' && Number.isFinite(body.filaExacta)
        ? body.filaExacta
        : null;
    if (!filaExacta) {
      return NextResponse.json(
        { ok: false, error: 'Falta filaExacta (entero ≥ 2)' },
        { status: 400 },
      );
    }
    const result = await clearFacturaRow(filaExacta);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || 'Error eliminando' },
        { status: 500 },
      );
    }
    console.log(`[FACTURA/ELIMINAR] ${user.email} cleared row ${filaExacta}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
