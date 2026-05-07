import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';
import { isAuthorized } from '@/lib/authorized-emails';

export async function GET(req: NextRequest) {
  const session = await verifySession(req.headers.get('cookie'));
  if (!session || !isAuthorized(session.email)) {
    return NextResponse.json({ ok: false, user: null });
  }
  return NextResponse.json({ ok: true, user: session });
}
