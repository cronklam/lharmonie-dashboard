import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import {
  listCatalogo,
  appendServicio,
  updateServicio,
  ServiciosError,
} from '@/lib/servicios-server';
import {
  TIPOS_SERVICIO,
  PERIODICIDADES,
  MEDIOS_PAGO,
  nuevoIdServicio,
  hoyISO,
  type ServicioCatalogo,
  type TipoServicio,
  type Periodicidad,
  type MedioPago,
} from '@/lib/servicios';
import { ANCLAS, type Ancla } from '@/lib/anclas';

export const GET = withAuth(async (_req, user) => {
  if (!hasCapability(user.email, 'servicios')) {
    throw new AuthError(403, 'No tenés acceso a Servicios');
  }
  try {
    const items = await listCatalogo();
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return handleError(err);
  }
});

interface PostBody {
  id?: string;
  tipo?: string;
  ancla?: string;
  local?: string;
  nombreVisible?: string;
  titularNombre?: string;
  titularCuit?: string;
  cuentaNumero?: string;
  direccionServicio?: string;
  periodicidad?: string;
  montoEstimadoArs?: number;
  montoEstimadoUsd?: number;
  montoEstimadoTransfer?: number;
  vencimientoDia?: number | null;
  notas?: string;
  activo?: boolean;
  subarrendadoBaigun?: boolean;
  baigunPorcentaje?: number;
  metodoPago?: string;
  cbuPago?: string;
  cuentaPagoAlias?: string;
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

  const tipo = (body.tipo || '').trim().toLowerCase() as TipoServicio;
  if (!TIPOS_SERVICIO.includes(tipo)) {
    return NextResponse.json({ ok: false, error: 'Tipo inválido' }, { status: 400 });
  }
  const ancla = (body.ancla || '').trim() as Ancla;
  if (!ANCLAS.includes(ancla)) {
    return NextResponse.json({ ok: false, error: 'Ancla inválida' }, { status: 400 });
  }
  const periodicidad = (body.periodicidad || 'mensual').trim().toLowerCase() as Periodicidad;
  if (!PERIODICIDADES.includes(periodicidad)) {
    return NextResponse.json({ ok: false, error: 'Periodicidad inválida' }, { status: 400 });
  }
  const metodoPago = (body.metodoPago || '').trim().toLowerCase();
  if (metodoPago && !MEDIOS_PAGO.includes(metodoPago as MedioPago)) {
    return NextResponse.json({ ok: false, error: 'Método pago inválido' }, { status: 400 });
  }

  const isUpdate = !!body.id;
  const servicio: ServicioCatalogo = {
    id: body.id || nuevoIdServicio(),
    tipo,
    ancla,
    local: (body.local || '').trim(),
    nombreVisible: (body.nombreVisible || '').trim(),
    titularNombre: (body.titularNombre || '').trim(),
    titularCuit: (body.titularCuit || '').trim(),
    cuentaNumero: (body.cuentaNumero || '').trim(),
    direccionServicio: (body.direccionServicio || '').trim(),
    periodicidad,
    montoEstimadoArs: Number(body.montoEstimadoArs || 0),
    montoEstimadoUsd: Number(body.montoEstimadoUsd || 0),
    montoEstimadoTransfer: Number(body.montoEstimadoTransfer || 0),
    vencimientoDia: body.vencimientoDia ?? null,
    notas: (body.notas || '').trim(),
    activo: body.activo !== false,
    creadoEn: isUpdate ? '' : hoyISO(),
    creadoPor: isUpdate ? '' : user.email,
    subarrendadoBaigun: !!body.subarrendadoBaigun,
    baigunPorcentaje: Number(body.baigunPorcentaje || 0),
    metodoPago: metodoPago as MedioPago | '',
    cbuPago: (body.cbuPago || '').trim(),
    cuentaPagoAlias: (body.cuentaPagoAlias || '').trim(),
  };

  try {
    if (isUpdate) {
      await updateServicio(servicio);
    } else {
      await appendServicio(servicio);
    }
    return NextResponse.json({
      ok: true,
      action: isUpdate ? 'updated' : 'created',
      id: servicio.id,
    });
  } catch (err) {
    return handleError(err);
  }
});

function handleError(err: unknown) {
  if (err instanceof ServiciosError) {
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
  }
  console.error('[SERVICIOS]', err);
  const msg = err instanceof Error ? err.message : 'Error interno';
  return NextResponse.json({ ok: false, error: msg }, { status: 500 });
}
