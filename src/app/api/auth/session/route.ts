import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';
import { isAuthorized, getUserRole } from '@/lib/users';
import { refreshSheetUsersCache } from '@/lib/users-server';

export async function GET(req: NextRequest) {
  const session = await verifySession(req.headers.get('cookie'));
  if (!session) return NextResponse.json({ ok: false, user: null });
  await refreshSheetUsersCache();
  if (!isAuthorized(session.email)) {
    return NextResponse.json({ ok: false, user: null });
  }
  return NextResponse.json({
    ok: true,
    user: { ...session, role: getUserRole(session.email) },
  });
}
