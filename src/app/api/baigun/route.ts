import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import { listBaigun, appendBaigun, ServiciosError } from '@/lib/servicios-server';
import { hoyISO } from '@/lib/servicios';

// Baigun (subarriendo Libertador) — cuenta corriente. Owner-only.
// GET → lista de movimientos.
// POST → suma movimiento { fecha?, concepto, cargo, pago, notas }

export const GET = withAuth(async (_req, user) => {
  if (!hasCapability(user.email, 'baigun')) {
    throw new AuthError(403, 'No tenés acceso a Baigun');
  }
  try {
    const items = await listBaigun();
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return handleError(err);
  }
});

interface PostBody {
  fecha?: string;
  concepto?: string;
  cargo?: number;
  pago?: number;
  notas?: string;
}

export const POST = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'baigun')) {
    throw new AuthError(403, 'No tenés acceso a Baigun');
  }
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }
  if (!body.concepto) {
    return NextResponse.json({ ok: false, error: 'Concepto vacío' }, { status: 400 });
  }
  try {
    const items = await listBaigun();
    const saldoActual = items.reduce(
      (s, m) => s + (m.cargo || 0) - (m.pago || 0),
      0,
    );
    const cargo = Number(body.cargo || 0);
    const pago = Number(body.pago || 0);
    const id = `bg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    await appendBaigun({
      id,
      fecha: body.fecha || hoyISO(),
      concepto: body.concepto.trim(),
      cargo,
      pago,
      saldoDespues: saldoActual + cargo - pago,
      notas: (body.notas || '').trim(),
      cargadoPor: user.email,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return handleError(err);
  }
});

function handleError(err: unknown) {
  if (err instanceof ServiciosError) {
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
  }
  console.error('[BAIGUN]', err);
  const msg = err instanceof Error ? err.message : 'Error interno';
  return NextResponse.json({ ok: false, error: msg }, { status: 500 });
}
