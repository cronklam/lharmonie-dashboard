import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import {
  SESION_TIPOS_MOV,
  SESION_ESTADOS_MOV,
  SESION_CATEGORIAS_GASTO,
  type SesionInput,
  type SesionMovInput,
  type SesionTipoMov,
  type SesionEstadoMov,
  type SesionCategoriaGasto,
} from '@/lib/caja';
import {
  writeSesion,
  deleteSesionByPrefix,
  CajaError,
} from '@/lib/caja-server';

// POST /api/caja/sesion → escribe una sesión completa (N filas) al
// Sheet con DESCRIPCION prefijada `SESION DD/MM/YYYY - LOCAL · ...`.
// Devuelve el prefijo (id de la sesión).
//
// DELETE /api/caja/sesion?id=SESION%2010%2F05%2F2026%20-%20LH5
// → borra todas las filas que arranquen con ese prefijo.

interface PostMov {
  tipo?: unknown;
  fecha?: unknown;
  local?: unknown;
  montoArs?: unknown;
  montoUsd?: unknown;
  concepto?: unknown;
  categoriaFina?: unknown;
  estado?: unknown;
}

interface PostBody {
  // Aliases nuevos (mayo 2026+)
  fechaControl?: unknown;
  fechaAuditada?: unknown;
  turnoCompleto?: unknown;
  turnoLabel?: unknown;
  // Legacy (acepta fechaSesion como fechaControl si llega del cliente viejo)
  fechaSesion?: unknown;
  local?: unknown;
  movs?: unknown;
  saldoRegistradoArs?: unknown;
  saldoRegistradoUsd?: unknown;
  encontradoArs?: unknown;
  encontradoUsd?: unknown;
  saldoConfirmadoArs?: unknown;
  saldoConfirmadoUsd?: unknown;
  notas?: unknown;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  return isFinite(n) ? n : 0;
}

function strict<T extends string>(v: unknown, whitelist: readonly T[]): T | null {
  const s = String(v ?? '').trim();
  return (whitelist as readonly string[]).includes(s) ? (s as T) : null;
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

  const fechaControl =
    (typeof body.fechaControl === 'string' && body.fechaControl.trim()) ||
    (typeof body.fechaSesion === 'string' && body.fechaSesion.trim()) ||
    '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaControl)) {
    return NextResponse.json(
      { ok: false, error: 'fechaControl inválida (esperado YYYY-MM-DD)' },
      { status: 400 },
    );
  }
  const fechaAuditada =
    typeof body.fechaAuditada === 'string' ? body.fechaAuditada.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaAuditada)) {
    return NextResponse.json(
      { ok: false, error: 'fechaAuditada inválida (esperado YYYY-MM-DD)' },
      { status: 400 },
    );
  }
  const turnoCompleto = body.turnoCompleto === true || body.turnoCompleto === 'true';
  const turnoLabel =
    typeof body.turnoLabel === 'string' ? body.turnoLabel.trim().slice(0, 40) : '';
  if (!turnoCompleto && !turnoLabel) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Si el turno no es completo hay que indicar el turno (ej "T AM", "T PM").',
      },
      { status: 400 },
    );
  }
  const local = typeof body.local === 'string' ? body.local.trim() : '';
  if (!local) {
    return NextResponse.json({ ok: false, error: 'Falta local' }, { status: 400 });
  }
  if (!Array.isArray(body.movs)) {
    return NextResponse.json({ ok: false, error: 'movs debe ser un array' }, { status: 400 });
  }

  // Validar y normalizar movs
  const movs: SesionMovInput[] = [];
  for (const raw of body.movs as PostMov[]) {
    const tipo = strict<SesionTipoMov>(raw?.tipo, SESION_TIPOS_MOV);
    if (!tipo) {
      return NextResponse.json({ ok: false, error: 'Tipo de mov inválido' }, { status: 400 });
    }
    const fecha = typeof raw.fecha === 'string' ? raw.fecha.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return NextResponse.json(
        { ok: false, error: 'Fecha de mov inválida (YYYY-MM-DD)' },
        { status: 400 },
      );
    }
    const movLocal = typeof raw.local === 'string' && raw.local.trim() ? raw.local.trim() : local;
    const montoArs = Math.abs(num(raw.montoArs));
    const montoUsd = Math.abs(num(raw.montoUsd));
    if (montoArs === 0 && montoUsd === 0) {
      return NextResponse.json(
        { ok: false, error: 'Cada mov debe tener montoArs o montoUsd > 0' },
        { status: 400 },
      );
    }
    const concepto = typeof raw.concepto === 'string' ? raw.concepto.trim().slice(0, 200) : '';
    const estado =
      strict<SesionEstadoMov>(raw?.estado, SESION_ESTADOS_MOV) || 'COMPLETO';
    const categoriaFina =
      strict<SesionCategoriaGasto>(raw?.categoriaFina, SESION_CATEGORIAS_GASTO) || '';

    movs.push({
      tipo,
      fecha,
      local: movLocal,
      montoArs,
      montoUsd,
      concepto,
      categoriaFina,
      estado,
    });
  }

  if (movs.length === 0) {
    return NextResponse.json({ ok: false, error: 'La sesión no tiene movimientos' }, { status: 400 });
  }

  const sesion: SesionInput = {
    fechaControl,
    fechaAuditada,
    turnoCompleto,
    turnoLabel,
    local,
    movs,
    encontradoArs: num(body.encontradoArs),
    encontradoUsd: num(body.encontradoUsd),
    saldoRegistradoArs: num(body.saldoRegistradoArs),
    saldoRegistradoUsd: num(body.saldoRegistradoUsd),
    saldoConfirmadoArs: num(body.saldoConfirmadoArs),
    saldoConfirmadoUsd: num(body.saldoConfirmadoUsd),
    notas: typeof body.notas === 'string' ? body.notas.trim().slice(0, 500) : '',
  };

  try {
    const result = await writeSesion(sesion);
    console.log(
      `[CAJA/SESION] ${user.email} → ${result.prefijo} · ${result.filasEscritas.length} filas · diff ARS ${result.diferenciaCierreArs}`,
    );
    return NextResponse.json({
      ok: true,
      prefijo: result.prefijo,
      filasEscritas: result.filasEscritas.length,
      diferenciaCierreArs: result.diferenciaCierreArs,
      diferenciaCierreUsd: result.diferenciaCierreUsd,
    });
  } catch (err) {
    if (err instanceof CajaError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('[CAJA/SESION] POST error:', err);
    const msg = err instanceof Error ? err.message : 'Error guardando';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});

export const DELETE = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'caja')) {
    throw new AuthError(403, 'No tenés acceso a Caja');
  }
  const url = new URL(req.url);
  const id = (url.searchParams.get('id') || '').trim();
  if (!id || (!id.startsWith('SESION ') && !id.startsWith('S. '))) {
    return NextResponse.json(
      { ok: false, error: 'id inválido (debe arrancar con "S. " o "SESION ")' },
      { status: 400 },
    );
  }
  try {
    const result = await deleteSesionByPrefix(id);
    console.log(`[CAJA/SESION] ${user.email} deleted ${id} (${result.borradas} filas)`);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof CajaError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('[CAJA/SESION] DELETE error:', err);
    const msg = err instanceof Error ? err.message : 'Error borrando';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
