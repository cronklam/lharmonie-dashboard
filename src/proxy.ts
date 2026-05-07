// Edge proxy (Next 16 — antes "middleware"): bloquea /api/* sin sesión
// válida, excepto /api/auth/*. Las pages hacen gating client-side via
// AuthProvider.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/session';

const PUBLIC_PREFIXES = ['/api/auth/'];

function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith('/api/')) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const method = req.method.toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    if (!isSameOrigin(req)) {
      return NextResponse.json(
        { ok: false, error: 'Cross-origin requests not allowed' },
        { status: 403 },
      );
    }
  }

  const session = await verifySession(req.headers.get('cookie'));
  if (!session) {
    return NextResponse.json(
      { ok: false, error: 'No autenticado' },
      { status: 401 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
