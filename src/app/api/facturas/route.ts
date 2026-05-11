import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-guard';
import { getFacturasFromSheet, SheetsError } from '@/lib/sheets';

// Garantía: el endpoint nunca se cachea estáticamente. Es la pieza que
// más se llama después de un write (marcar pagada / eliminar) y la caché
// vieja causaba data fantasma en la UI.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
