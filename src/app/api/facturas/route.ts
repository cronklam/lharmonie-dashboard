import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-guard';
import { getFacturasFromSheet, SheetsError } from '@/lib/sheets';

// GET /api/facturas
// Devuelve todas las filas del tab "Facturas" del Sheet.
// La cookie + whitelist se valida via withAuth (defensa en profundidad
// además del middleware /api/* que ya gating todas las routes).
export const GET = withAuth(async () => {
  try {
    const facturas = await getFacturasFromSheet();
    return NextResponse.json({ ok: true, facturas });
  } catch (e) {
    const status = e instanceof SheetsError ? e.status : 500;
    const msg = e instanceof Error ? e.message : 'Error leyendo el Sheet';
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
});
