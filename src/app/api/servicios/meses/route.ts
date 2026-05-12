import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import { getSheetsClient } from '@/lib/servicios-server';
import { parsePeriodoTab } from '@/lib/servicios-mes';

export const dynamic = 'force-dynamic';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';

// GET /api/servicios/meses
// Devuelve la lista de tabs mensuales del Sheet (formato "MAYO 26" →
// periodo "2026-05"), ordenados del más reciente al más viejo.
export const GET = withAuth(async (_req, user) => {
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
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      fields: 'sheets.properties.title',
    });
    const tabs = (meta.data.sheets || [])
      .map((s) => s.properties?.title || '')
      .filter((t) => t.length > 0);
    const meses = tabs
      .map((t) => parsePeriodoTab(t))
      .filter((p): p is NonNullable<ReturnType<typeof parsePeriodoTab>> => p !== null)
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
    return NextResponse.json({ ok: true, meses });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
