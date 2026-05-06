// Server-side helpers para validar sesión + whitelist en API routes.
// Defensa en profundidad: aunque el middleware ya bloquee /api/*, las
// routes que tocan datos del Sheet vuelven a chequear acá.

import { NextResponse } from 'next/server';
import { verifySession, type SessionData } from './session';
import { isAuthorized } from './authorized-emails';

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getSessionUser(req: Request): Promise<SessionData | null> {
  const cookieHeader = req.headers.get('cookie');
  const session = await verifySession(cookieHeader);
  if (!session) return null;
  // Defensa en profundidad: aunque la cookie sea válida, re-chequear
  // que el email siga en la whitelist (por si lo sacamos del archivo
  // y la cookie todavía vive).
  if (!isAuthorized(session.email)) return null;
  return session;
}

export async function requireAuth(req: Request): Promise<SessionData> {
  const user = await getSessionUser(req);
  if (!user) throw new AuthError(401, 'No autenticado');
  return user;
}

export function withAuth<T>(
  handler: (req: Request, user: SessionData) => Promise<T>,
): (req: Request) => Promise<NextResponse | T> {
  return async (req: Request) => {
    try {
      const user = await requireAuth(req);
      return await handler(req, user);
    } catch (e) {
      if (e instanceof AuthError) {
        return NextResponse.json(
          { ok: false, error: e.message },
          { status: e.status },
        );
      }
      throw e;
    }
  };
}
