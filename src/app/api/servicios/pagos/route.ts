import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import {
  listPagos,
  appendPago,
  ServiciosError,
} from '@/lib/servicios-server';
import {
  MEDIOS_PAGO,
  nuevoIdPago,
  hoyISO,
  type ServicioPago,
  type MedioPago,
} from '@/lib/servicios';
import { ANCLAS, type Ancla } from '@/lib/anclas';

export const GET = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'servicios')) {
    throw new AuthError(403, 'No tenés acceso a Servicios');
  }
  const url = new URL(req.url);
  const servicioId = url.searchParams.get('servicioId') || undefined;
  try {
    const items = await listPagos(servicioId);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return handleError(err);
  }
});

interface PostBody {
  servicioId?: string;
  periodo?: string;
  fechaPago?: string;
  ancla?: string;
  montoTotalArs?: number;
  montoArsEfectivo?: number;
  montoUsd?: number;
  tipoCambioUsd?: number;
  montoTransferenciaArs?: number;
  medioPago?: string;
  comprobanteUrl?: string;
  notas?: string;
  baigunShareArs?: number;
}

export const POST = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'servicios')) {
    throw new AuthError(403, 'No tenés acceso a Servicios');
  }
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }

  if (!body.servicioId || !body.periodo) {
    return NextResponse.json(
      { ok: false, error: 'Faltan servicioId o periodo' },
      { status: 400 },
    );
  }
  const ancla = (body.ancla || '').trim() as Ancla;
  if (!ANCLAS.includes(ancla)) {
    return NextResponse.json({ ok: false, error: 'Ancla inválida' }, { status: 400 });
  }
  const medioPago = (body.medioPago || 'efectivo').trim().toLowerCase() as MedioPago;
  if (!MEDIOS_PAGO.includes(medioPago)) {
    return NextResponse.json({ ok: false, error: 'Medio pago inválido' }, { status: 400 });
  }

  // Periodo "anclado" = primer día del mes
  const fechaAnclada = body.periodo.match(/^\d{4}-\d{2}$/)
    ? `${body.periodo}-01`
    : body.periodo;

  const pago: ServicioPago = {
    id: nuevoIdPago(),
    servicioId: body.servicioId,
    periodo: body.periodo,
    fechaPago: body.fechaPago || hoyISO(),
    fechaAnclada,
    ancla,
    montoTotalArs: Number(body.montoTotalArs || 0),
    montoArsEfectivo: Number(body.montoArsEfectivo || 0),
    montoUsd: Number(body.montoUsd || 0),
    tipoCambioUsd: Number(body.tipoCambioUsd || 0),
    montoTransferenciaArs: Number(body.montoTransferenciaArs || 0),
    medioPago,
    comprobanteUrl: (body.comprobanteUrl || '').trim(),
    notas: (body.notas || '').trim(),
    cargadoPor: user.email,
    baigunShareArs: Number(body.baigunShareArs || 0),
  };

  try {
    await appendPago(pago);
    return NextResponse.json({ ok: true, id: pago.id });
  } catch (err) {
    return handleError(err);
  }
});

function handleError(err: unknown) {
  if (err instanceof ServiciosError) {
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
  }
  console.error('[SERVICIOS/PAGOS]', err);
  const msg = err instanceof Error ? err.message : 'Error interno';
  return NextResponse.json({ ok: false, error: msg }, { status: 500 });
}
