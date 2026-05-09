import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import {
  listMovimientosChica,
  appendMovimientoChica,
  listMovimientosGrande,
  appendMovimientoGrande,
  CajaError,
} from '@/lib/caja-server';
import {
  CAJA_TIPOS_MOV,
  CAJA_GRANDE_TIPOS,
  CAJA_ESTADOS_MOV,
  CAJA_CATEGORIAS,
  nuevoIdMovChica,
  nuevoIdMovGrande,
  type CajaTipoMov,
  type CajaGrandeTipo,
  type CajaEstadoMov,
  type CajaCategoria,
  type CajaMovimiento,
} from '@/lib/caja';

// GET /api/caja/movimientos?caja=chica|grande
// POST /api/caja/movimientos { caja: 'chica' | 'grande', ... }

export const GET = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'caja')) {
    throw new AuthError(403, 'No tenés acceso a Caja');
  }
  const url = new URL(req.url);
  const caja = url.searchParams.get('caja') || 'chica';
  try {
    if (caja === 'grande') {
      const items = await listMovimientosGrande();
      return NextResponse.json({ ok: true, items });
    }
    const items = await listMovimientosChica();
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return handleError(err);
  }
});

interface PostBody {
  caja?: 'chica' | 'grande';
  // chica
  fechaMov?: string;
  local?: string;
  tipo?: string;
  montoArs?: number;
  montoUsd?: number;
  concepto?: string;
  estado?: string;
  sesionId?: string;
  notas?: string;
  fuente?: string;
  categoria?: string;
  // grande
  fecha?: string; // ISO
  sesionIdRef?: string;
}

export const POST = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'caja')) {
    throw new AuthError(403, 'No tenés acceso a Caja');
  }
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }

  const caja = body.caja || 'chica';

  try {
    if (caja === 'grande') {
      const tipo = (body.tipo || '').trim().toUpperCase() as CajaGrandeTipo;
      if (!CAJA_GRANDE_TIPOS.includes(tipo)) {
        return NextResponse.json({ ok: false, error: 'Tipo grande inválido' }, { status: 400 });
      }
      const result = await appendMovimientoGrande({
        id: nuevoIdMovGrande(),
        fecha: body.fecha || new Date().toISOString(),
        tipo,
        montoArs: Number(body.montoArs || 0),
        montoUsd: Number(body.montoUsd || 0),
        concepto: (body.concepto || '').trim(),
        sesionIdRef: (body.sesionIdRef || '').trim(),
        cargadoPor: user.email,
      });
      return NextResponse.json({ ok: true, id: result.id, saldoDespuesArs: result.saldoDespuesArs, saldoDespuesUsd: result.saldoDespuesUsd });
    }

    // caja chica
    const tipo = (body.tipo || '').trim().toUpperCase() as CajaTipoMov;
    if (!CAJA_TIPOS_MOV.includes(tipo)) {
      return NextResponse.json({ ok: false, error: 'Tipo chica inválido' }, { status: 400 });
    }
    const estado = ((body.estado || 'COMPLETO').trim().toUpperCase() as CajaEstadoMov) || 'COMPLETO';
    if (!CAJA_ESTADOS_MOV.includes(estado)) {
      return NextResponse.json({ ok: false, error: 'Estado inválido' }, { status: 400 });
    }
    const categoria = (body.categoria || '').trim() as CajaCategoria | '';
    if (categoria && !CAJA_CATEGORIAS.includes(categoria as CajaCategoria)) {
      return NextResponse.json({ ok: false, error: 'Categoría inválida' }, { status: 400 });
    }
    const mov: CajaMovimiento = {
      id: nuevoIdMovChica(),
      fechaMov: body.fechaMov || new Date().toISOString().slice(0, 10),
      local: (body.local || '').trim(),
      tipo,
      montoArs: Number(body.montoArs || 0),
      montoUsd: Number(body.montoUsd || 0),
      concepto: (body.concepto || '').trim(),
      estado,
      cargadoPor: user.email,
      cargadoEl: new Date().toISOString(),
      sesionId: (body.sesionId || '').trim(),
      notas: (body.notas || '').trim(),
      fuente: (body.fuente || 'dashboard').trim(),
      categoria,
    };
    await appendMovimientoChica(mov);
    return NextResponse.json({ ok: true, id: mov.id });
  } catch (err) {
    return handleError(err);
  }
});

function handleError(err: unknown) {
  if (err instanceof CajaError) {
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
  }
  console.error('[CAJA/MOVS]', err);
  const msg = err instanceof Error ? err.message : 'Error interno';
  return NextResponse.json({ ok: false, error: msg }, { status: 500 });
}
