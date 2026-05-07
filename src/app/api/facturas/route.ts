import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-guard';
import { getFacturasFromSheet, SheetsError } from '@/lib/sheets';

// GET /api/facturas
// Devuelve todas las filas del tab "Facturas" del Sheet con su _sheetRow
// para que el cliente pueda llamar a /api/factura/marcar-pagada con la
// fila exacta.
export const GET = withAuth(async () => {
  try {
    const facturas = await getFacturasFromSheet();
    return NextResponse.json({ ok: true, facturas });
  } catch (e) {
    const status = e instanceof SheetsError ? e.status : 500;
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'error' },
      { status },
    );
  }
});
