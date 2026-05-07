// Cookie-based session management con HMAC-SHA256.
// Adaptado del staff app — sin dependencias externas, usa Web Crypto.

const COOKIE_NAME = 'lh-dash-session';
const MAX_AGE = 30 * 24 * 60 * 60; // 30 días
const MAX_AGE_MS = MAX_AGE * 1000;

export interface SessionData {
  email: string;
  name: string;
  picture: string;
  iat?: number;
}

let _warnedDevSecret = false;

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'AUTH_SECRET no está configurado (o es muy corto). Configurar en Vercel env vars.',
      );
    }
    if (!_warnedDevSecret) {
      console.warn(
        '[session] AUTH_SECRET no seteado — usando default solo para desarrollo local.',
      );
      _warnedDevSecret = true;
    }
    return 'lharmonie-dashboard-default-secret-change-me-DEV-ONLY';
  }
  return s;
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toBase64Url(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString('base64url');
}

export async function createSessionCookie(data: SessionData): Promise<string> {
  const stamped: SessionData = { ...data, iat: data.iat ?? Date.now() };
  const payload = Buffer.from(JSON.stringify(stamped)).toString('base64url');
  const key = await getKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const token = `${payload}.${toBase64Url(sig)}`;

  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`;
}

export async function verifySession(
  cookieHeader: string | null,
): Promise<SessionData | null> {
  if (!cookieHeader) return null;

  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;

  const token = match.slice(COOKIE_NAME.length + 1);
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx < 0) return null;

  const payload = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);

  try {
    const key = await getKey();
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      Buffer.from(sig, 'base64url'),
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionData;
    if (data.iat && Date.now() - data.iat > MAX_AGE_MS) return null;
    if (typeof data.email !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
