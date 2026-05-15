import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-guard';
import { markFacturaPagadaDirect } from '@/lib/facturas-write';

// POST /api/factura/marcar-pagada
// Body: { filaExacta }  (también acepta nroFactura/proveedor/fecha
// por compat con el cliente viejo, pero solo usa filaExacta).
//
// Ya NO usa el worker Railway. Escribe directo al Sheet vía service
// account (`GOOGLE_CREDENTIALS`). Si algo falla, el error real del
// Sheets API se bubblea al cliente para diagnosticar.
export const POST = withAuth(async (req) => {
  try {
    const body = await req.json();
    const filaExacta =
      typeof body.filaExacta === 'number' && Number.isFinite(body.filaExacta)
        ? body.filaExacta
        : null;
    if (!filaExacta || filaExacta < 2) {
      // Pseudo-facturas (origen tab Proveedores) llegan con filaExacta=-1.
      // No se pueden marcar pagadas con este endpoint — son cuentas
      // corrientes del proveedor, hay que editar el tab Proveedores en el
      // Sheet directamente.
      const detalle =
        filaExacta === -1
          ? 'Esta deuda viene del tab Proveedores (cuenta corriente). Editala desde el Sheet o el tab Proveedores.'
          : 'Falta filaExacta (entero ≥ 2)';
      return NextResponse.json({ ok: false, error: detalle }, { status: 400 });
    }
    const result = await markFacturaPagadaDirect(filaExacta);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || 'Error marcando pagada' },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
