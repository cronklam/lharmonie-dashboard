import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability, isOwner } from '@/lib/users';
import { ServiciosError } from '@/lib/servicios-server';
import {
  readAllBaigun,
  soloActivos,
  saldoTotal,
  appendMov,
  updateMov,
  softDeleteMov,
  recalcularSaldos,
} from '@/lib/baigun-cta-cte-server';
import {
  BAIGUN_TIPOS,
  delta,
  esFechaDDMMYYYY,
  nuevoIdBaigun,
  type BaigunMov,
  type BaigunTipo,
} from '@/lib/baigun-cta-cte';

export const dynamic = 'force-dynamic';

// ─── GET ?mes=YYYY-MM&servicio=&tipo= ─────────────────────────────

export const GET = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'baigun')) {
    throw new AuthError(403, 'No tenés acceso a Baigun');
  }
  try {
    const url = new URL(req.url);
    const mes = url.searchParams.get('mes') || '';
    const servicio = url.searchParams.get('servicio') || '';
    const tipo = url.searchParams.get('tipo') || '';

    const all = soloActivos(await readAllBaigun());
    const total = saldoTotal(await readAllBaigun()); // mismo que all sin filtros aplicados
    // Aplicar filtros sólo a items, NO al saldoTotal (saldo es global).
    let items = all;
    if (mes) items = items.filter((m) => m.mesOrigen === mes);
    if (servicio) items = items.filter((m) => m.servicioRef === servicio);
    if (tipo && tipo !== 'todos') items = items.filter((m) => m.tipo === tipo);

    // Sort por fecha desc (fallback createdAt desc).
    items.sort((a, b) => {
      const fa = a.fecha, fb = b.fecha;
      // DD/MM/YYYY → ordenamos por createdAt desc que es más confiable.
      return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b._row - a._row;
    });

    // saldoMes = suma signed de los movs del mes (no incluye saldoDespues).
    const saldoMes = (mes ? all.filter((m) => m.mesOrigen === mes) : []).reduce(
      (s, m) => s + delta(m),
      0,
    );

    return NextResponse.json({
      ok: true,
      items,
      saldoTotal: total,
      saldoMes,
    });
  } catch (err) {
    return handleError(err);
  }
});

// ─── POST { fecha, tipo, concepto, monto, metodo, notas, mesOrigen?, servicioRef? } ──

interface PostBody {
  fecha?: string;
  tipo?: string;
  concepto?: string;
  monto?: number | string;
  metodo?: string;
  notas?: string;
  mesOrigen?: string;
  servicioRef?: string;
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

  const fecha = (body.fecha || '').trim();
  if (!esFechaDDMMYYYY(fecha)) {
    return NextResponse.json(
      { ok: false, error: 'fecha debe ser DD/MM/YYYY' },
      { status: 400 },
    );
  }
  const tipo = (body.tipo || '').toLowerCase() as BaigunTipo;
  if (!BAIGUN_TIPOS.includes(tipo)) {
    return NextResponse.json(
      { ok: false, error: `tipo inválido (cargo/pago/ajuste)` },
      { status: 400 },
    );
  }
  const concepto = (body.concepto || '').trim();
  if (!concepto) {
    return NextResponse.json(
      { ok: false, error: 'concepto vacío' },
      { status: 400 },
    );
  }
  const monto = Number(body.monto);
  if (!Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json(
      { ok: false, error: 'monto debe ser > 0' },
      { status: 400 },
    );
  }

  try {
    const all = await readAllBaigun();
    const saldoActual = saldoTotal(all);
    const id = nuevoIdBaigun();
    const now = new Date().toISOString();
    const movNuevo = {
      id,
      fecha,
      mesOrigen: (body.mesOrigen || '').trim(),
      tipo,
      concepto,
      servicioRef: (body.servicioRef || '').trim(),
      monto,
      saldoDespues: saldoActual + delta({ tipo, monto }),
      metodo: (body.metodo || '').trim(),
      notas: (body.notas || '').trim(),
      fuente: 'manual' as const,
      cargadoPor: user.email,
      createdAt: now,
      deletedAt: '',
    };
    await appendMov(movNuevo);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return handleError(err);
  }
});

// ─── PATCH { id, ...campos } ──────────────────────────────────────

export const PATCH = withAuth(async (req, user) => {
  if (!isOwner(user.email)) {
    throw new AuthError(403, 'Solo el owner puede editar movimientos.');
  }
  let body: { id?: string } & PostBody;
  try {
    body = (await req.json()) as { id?: string } & PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }
  const id = (body.id || '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 400 });

  try {
    const all = await readAllBaigun();
    const target = all.find((m) => m.id === id);
    if (!target) {
      return NextResponse.json({ ok: false, error: 'mov no encontrado' }, { status: 404 });
    }
    if (target.deletedAt) {
      return NextResponse.json({ ok: false, error: 'mov eliminado' }, { status: 400 });
    }

    // Apply patch (campo por campo).
    const patched: Omit<BaigunMov, '_row'> = {
      id: target.id,
      fecha: body.fecha !== undefined ? String(body.fecha).trim() : target.fecha,
      mesOrigen: body.mesOrigen !== undefined ? String(body.mesOrigen).trim() : target.mesOrigen,
      tipo: body.tipo !== undefined
        ? ((String(body.tipo).toLowerCase() as BaigunTipo))
        : target.tipo,
      concepto: body.concepto !== undefined ? String(body.concepto).trim() : target.concepto,
      servicioRef: body.servicioRef !== undefined ? String(body.servicioRef).trim() : target.servicioRef,
      monto: body.monto !== undefined ? Number(body.monto) : target.monto,
      saldoDespues: target.saldoDespues, // se recalcula después
      metodo: body.metodo !== undefined ? String(body.metodo).trim() : target.metodo,
      notas: body.notas !== undefined ? String(body.notas).trim() : target.notas,
      fuente: target.fuente,
      cargadoPor: target.cargadoPor,
      createdAt: target.createdAt,
      deletedAt: target.deletedAt,
    };

    // Validación de tipos parseados
    if (!BAIGUN_TIPOS.includes(patched.tipo)) {
      return NextResponse.json({ ok: false, error: 'tipo inválido' }, { status: 400 });
    }
    if (!Number.isFinite(patched.monto) || patched.monto <= 0) {
      return NextResponse.json({ ok: false, error: 'monto debe ser > 0' }, { status: 400 });
    }
    if (patched.fecha && !esFechaDDMMYYYY(patched.fecha)) {
      return NextResponse.json({ ok: false, error: 'fecha debe ser DD/MM/YYYY' }, { status: 400 });
    }

    await updateMov(target._row, patched);

    // Recalcular saldoDespues en cascada de TODOS los movs (más simple
    // y robusto que recorrer solo los posteriores).
    const recalculados = await recalcularSaldos();
    return NextResponse.json({ ok: true, recalculados });
  } catch (err) {
    return handleError(err);
  }
});

// ─── DELETE ?id=X ─────────────────────────────────────────────────

export const DELETE = withAuth(async (req, user) => {
  if (!isOwner(user.email)) {
    throw new AuthError(403, 'Solo el owner puede eliminar movimientos.');
  }
  const url = new URL(req.url);
  const id = (url.searchParams.get('id') || '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 400 });

  try {
    const all = await readAllBaigun();
    const target = all.find((m) => m.id === id);
    if (!target) {
      return NextResponse.json({ ok: false, error: 'mov no encontrado' }, { status: 404 });
    }
    if (target.deletedAt) {
      return NextResponse.json({ ok: true, recalculados: 0, alreadyDeleted: true });
    }
    await softDeleteMov(target._row, new Date().toISOString());
    const recalculados = await recalcularSaldos();
    return NextResponse.json({ ok: true, recalculados });
  } catch (err) {
    return handleError(err);
  }
});

function handleError(err: unknown) {
  if (err instanceof ServiciosError) {
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
  }
  console.error('[BAIGUN/CTA-CTE]', err);
  const msg = err instanceof Error ? err.message : 'Error interno';
  return NextResponse.json({ ok: false, error: msg }, { status: 500 });
}
