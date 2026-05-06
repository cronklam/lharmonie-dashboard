import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { isAuthorized } from '@/lib/authorized-emails';
import { createSessionCookie } from '@/lib/session';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

export async function POST(req: NextRequest) {
  try {
    const { credential } = await req.json();

    if (!credential || typeof credential !== 'string' || credential.length > 8000) {
      return NextResponse.json(
        { ok: false, error: 'Invalid credential' },
        { status: 400 },
      );
    }
    if (!GOOGLE_CLIENT_ID) {
      return NextResponse.json(
        { ok: false, error: 'Google OAuth not configured' },
        { status: 500 },
      );
    }

    const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID);
    const ticket = await oauth2Client.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 });
    }

    if (!isAuthorized(payload.email)) {
      return NextResponse.json(
        { ok: false, error: 'not_authorized', email: payload.email },
        { status: 403 },
      );
    }

    const sessionData = {
      email: payload.email,
      name: payload.name || '',
      picture: payload.picture || '',
    };

    const cookie = await createSessionCookie(sessionData);
    const res = NextResponse.json({ ok: true, user: sessionData });
    res.headers.set('Set-Cookie', cookie);
    return res;
  } catch (err) {
    console.error('[AUTH/LOGIN] Error:', err);
    return NextResponse.json({ ok: false, error: 'Auth failed' }, { status: 500 });
  }
}
