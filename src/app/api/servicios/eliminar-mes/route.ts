import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { isOwner } from '@/lib/users';
import { getSheetsClient } from '@/lib/servicios-server';
import { parsePeriodoTab, periodoToTab } from '@/lib/servicios-mes';

export const dynamic = 'force-dynamic';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';

// POST /api/servicios/eliminar-mes
// Body: { periodo: "YYYY-MM" }
// Borra el tab mensual completo. Owner-only. Irreversible.
export const POST = withAuth(async (req, user) => {
  if (!isOwner(user.email)) {
    throw new AuthError(403, 'Solo el owner puede eliminar meses.');
  }
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    return NextResponse.json(
      { ok: false, error: 'Config faltante' },
      { status: 500 },
    );
  }

  let body: { periodo?: string } = {};
  try {
    body = (await req.json()) as { periodo?: string };
  } catch {
    body = {};
  }

  if (!body.periodo || !/^\d{4}-\d{2}$/.test(body.periodo)) {
    return NextResponse.json(
      { ok: false, error: 'Periodo requerido en formato YYYY-MM.' },
      { status: 400 },
    );
  }

  const [y, m] = body.periodo.split('-').map((n) => parseInt(n, 10));

  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      fields: 'sheets.properties(sheetId,title)',
    });
    const allSheets = meta.data.sheets || [];

    // Match por título exacto del tab mensual (ej "MAYO 26") o por
    // parse del título → mismo periodo.
    const targetTab = periodoToTab(y, m);
    let match = allSheets.find((s) => s.properties?.title === targetTab);
    if (!match) {
      // Fallback: parsear cada tab y comparar periodo.
      match = allSheets.find((s) => {
        const t = s.properties?.title || '';
        const p = parsePeriodoTab(t);
        return p && p.periodo === body.periodo;
      });
    }
    if (!match || !match.properties?.sheetId) {
      return NextResponse.json(
        {
          ok: false,
          error: `No se encontró el tab del periodo ${body.periodo}.`,
        },
        { status: 404 },
      );
    }

    // Contar tabs mensuales válidos — no permitir borrar el último.
    const mensuales = allSheets.filter((s) => {
      const t = s.properties?.title || '';
      return parsePeriodoTab(t) !== null;
    });
    if (mensuales.length <= 1) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'No se puede eliminar el último mes — necesitamos al menos uno como base.',
        },
        { status: 400 },
      );
    }

    const titleEliminado = match.properties.title || targetTab;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ deleteSheet: { sheetId: match.properties.sheetId } }],
      },
    });

    console.log(
      `[ELIMINAR-MES] ${user.email} → eliminó "${titleEliminado}" (${body.periodo})`,
    );
    return NextResponse.json({
      ok: true,
      tab: titleEliminado,
      periodo: body.periodo,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    console.error('[ELIMINAR-MES]', err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
