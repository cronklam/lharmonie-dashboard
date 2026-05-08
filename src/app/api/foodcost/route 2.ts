import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-guard';
import { getFoodCostFromSheet, SheetsError } from '@/lib/sheets';

export const GET = withAuth(async () => {
  try {
    const items = await getFoodCostFromSheet();
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    const status = e instanceof SheetsError ? e.status : 500;
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'error' },
      { status },
    );
  }
});
