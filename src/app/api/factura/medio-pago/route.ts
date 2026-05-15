import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import { setMedioPagoDirect } from '@/lib/facturas-write';

export const dynamic = 'force-dynamic';

// Medios válidos. Whitelisted server-side para evitar que el cliente
// escriba cualquier cosa en el Sheet por error.
const MEDIOS_VALIDOS = [
  'Efectivo',
  'Transferencia',
  'Tarjeta',
  'Mix',
  'Cheque',
  'Mercado Pago',
];

export const POST = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'marcar-pagada')) {
    return NextResponse.json(
      { ok: false, error: 'No tenés permisos para editar facturas' },
      { status: 403 },
    );
  }
  try {
    const body = await req.json();
    const filaExacta =
      typeof body.filaExacta === 'number' && Number.isFinite(body.filaExacta)
        ? body.filaExacta
        : null;
    const medioPago = typeof body.medioPago === 'string' ? body.medioPago.trim() : '';

    if (!filaExacta || filaExacta < 2) {
      const detalle =
        filaExacta === -1
          ? 'Esta deuda viene del tab Proveedores. Cambiá el medio de pago editando esa fila en el Sheet.'
          : 'Falta filaExacta (entero ≥ 2)';
      return NextResponse.json({ ok: false, error: detalle }, { status: 400 });
    }
    if (!MEDIOS_VALIDOS.includes(medioPago)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Medio de pago inválido. Permitidos: ${MEDIOS_VALIDOS.join(', ')}`,
        },
        { status: 400 },
      );
    }

    const result = await setMedioPagoDirect(filaExacta, medioPago);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || 'Error actualizando medio de pago' },
        { status: 500 },
      );
    }
    console.log(
      `[FACTURA/MEDIO-PAGO] ${user.email} row=${filaExacta} → ${medioPago}`,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
