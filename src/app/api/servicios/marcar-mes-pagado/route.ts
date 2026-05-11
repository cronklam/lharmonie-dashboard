import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import {
  listCatalogo,
  listPagos,
  appendPagosBatch,
  ServiciosError,
} from '@/lib/servicios-server';
import {
  nuevoIdPago,
  hoyISO,
  type ServicioPago,
  type MedioPago,
} from '@/lib/servicios';

export const dynamic = 'force-dynamic';

interface PostBody {
  periodo?: string; // YYYY-MM
  servicioIds?: string[];
  medioPago?: MedioPago;
  fechaPago?: string;
}

// POST /api/servicios/marcar-mes-pagado
// Body: { periodo, servicioIds?, medioPago?, fechaPago? }
// Crea un pago "rápido" por cada servicio activo del periodo dado que
// aún no tenga un pago registrado. Si se pasa `servicioIds`, solo se
// marcan esos. Monto = montoEstimadoArs del catálogo (placeholder
// — el usuario lo edita después si fue distinto).
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

  const periodo = (body.periodo || '').trim();
  if (!periodo.match(/^\d{4}-\d{2}$/)) {
    return NextResponse.json(
      { ok: false, error: 'periodo inválido (esperado YYYY-MM)' },
      { status: 400 },
    );
  }
  const medioPago: MedioPago = body.medioPago || 'efectivo';
  const fechaPago = body.fechaPago || hoyISO();
  const fechaAnclada = `${periodo}-01`;

  try {
    const [catalogo, pagos] = await Promise.all([listCatalogo(), listPagos()]);
    const yaPagados = new Set(
      pagos.filter((p) => p.periodo === periodo).map((p) => p.servicioId),
    );

    const idsFilter = body.servicioIds && body.servicioIds.length > 0
      ? new Set(body.servicioIds)
      : null;

    const candidatos = catalogo.filter((s) => {
      if (!s.activo) return false;
      if (yaPagados.has(s.id)) return false;
      if (idsFilter && !idsFilter.has(s.id)) return false;
      return true;
    });

    if (candidatos.length === 0) {
      return NextResponse.json({ ok: true, marcados: 0, pagos: [] });
    }

    const nuevos: ServicioPago[] = candidatos.map((s) => ({
      id: nuevoIdPago(),
      servicioId: s.id,
      periodo,
      fechaPago,
      fechaAnclada,
      ancla: s.ancla,
      montoTotalArs: s.montoEstimadoArs || 0,
      montoArsEfectivo: medioPago === 'efectivo' ? s.montoEstimadoArs || 0 : 0,
      montoUsd: 0,
      tipoCambioUsd: 0,
      montoTransferenciaArs:
        medioPago === 'transferencia' ? s.montoEstimadoArs || 0 : 0,
      medioPago,
      comprobanteUrl: '',
      notas: 'Marcado rápido (monto estimado del catálogo)',
      cargadoPor: user.email,
      baigunShareArs: 0,
    }));

    await appendPagosBatch(nuevos);
    console.log(
      `[SERVICIOS/MARCAR-MES] ${user.email} ${periodo} +${nuevos.length} pagos`,
    );
    return NextResponse.json({
      ok: true,
      marcados: nuevos.length,
      pagos: nuevos.map((p) => ({ id: p.id, servicioId: p.servicioId })),
    });
  } catch (err) {
    if (err instanceof ServiciosError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status },
      );
    }
    console.error('[SERVICIOS/MARCAR-MES]', err);
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
