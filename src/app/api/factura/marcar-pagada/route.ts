import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-guard';
import { markFacturaPagada } from '@/lib/worker';

// POST /api/factura/marcar-pagada
// Body: { nroFactura, proveedor, fecha, filaExacta }
// Auth: cookie de sesión + whitelist (withAuth).
export const POST = withAuth(async (req) => {
  try {
    const body = await req.json();
    const payload = {
      nroFactura: String(body.nroFactura || ''),
      proveedor: String(body.proveedor || ''),
      fecha: String(body.fecha || ''),
      filaExacta:
        typeof body.filaExacta === 'number' && Number.isFinite(body.filaExacta)
          ? body.filaExacta
          : null,
    };
    if (!payload.nroFactura && !payload.filaExacta) {
      return NextResponse.json(
        { ok: false, error: 'Falta nroFactura o filaExacta' },
        { status: 400 },
      );
    }
    const result = await markFacturaPagada(payload);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.message || 'Worker error' },
        { status: result.status },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
