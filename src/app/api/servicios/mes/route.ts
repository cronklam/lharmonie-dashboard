import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import { getSheetsClient } from '@/lib/servicios-server';
import {
  parseMesPivot,
  periodoToTab,
  periodoToLabel,
} from '@/lib/servicios-mes';

export const dynamic = 'force-dynamic';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';

// GET /api/servicios/mes?periodo=YYYY-MM
// Lee el tab pivot del mes pedido (formato "MAYO 26") y lo devuelve
// parseado: locales como cols, servicios como filas, celdas
// clasificadas (pagado/pendiente/no_aplica/vacio), totales por local
// y conteo de pendientes.
export const GET = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'servicios')) {
    throw new AuthError(403, 'No tenés acceso a Servicios');
  }
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    return NextResponse.json(
      { ok: false, error: 'GOOGLE_CREDENTIALS o SERVICIOS_SHEET_ID no configurados' },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const periodo = url.searchParams.get('periodo') || '';
  if (!periodo.match(/^\d{4}-\d{2}$/)) {
    return NextResponse.json(
      { ok: false, error: 'periodo inválido (esperado YYYY-MM)' },
      { status: 400 },
    );
  }
  const [yearStr, monthStr] = periodo.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const tabName = periodoToTab(year, month);
  const label = periodoToLabel(year, month);

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A1:Z60`,
    });
    const rows = res.data.values || [];
    const data = parseMesPivot(rows, periodo, tabName, label);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    if (msg.toLowerCase().includes('unable to parse range')) {
      return NextResponse.json(
        {
          ok: false,
          error: `El tab "${tabName}" no existe en el Sheet. Iara tiene que crearlo manual primero.`,
          tabFaltante: tabName,
        },
        { status: 404 },
      );
    }
    console.error('[SERVICIOS/MES]', err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
