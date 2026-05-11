import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import {
  CATEGORIAS,
  MONEDAS,
  TIPOS,
  type Categoria,
  type Moneda,
  type Tipo,
} from '@/lib/caja';
import { appendMovimiento, CajaError } from '@/lib/caja-server';

// POST /api/caja/movimiento
// Body: { fecha: "YYYY-MM-DD", moneda: "PESO"|"DOLAR",
//         descripcion: string, categoria: Categoria, importe: number,
//         tipo: "INGRESO"|"EGRESO" }

interface PostBody {
  fecha?: unknown;
  moneda?: unknown;
  descripcion?: unknown;
  categoria?: unknown;
  importe?: unknown;
  tipo?: unknown;
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

  // Validación whitelist
  const fecha = typeof body.fecha === 'string' ? body.fecha.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json(
      { ok: false, error: 'Fecha inválida (esperado YYYY-MM-DD)' },
      { status: 400 },
    );
  }
  const moneda = String(body.moneda || '').toUpperCase() as Moneda;
  if (!MONEDAS.includes(moneda)) {
    return NextResponse.json(
      { ok: false, error: 'Moneda inválida — usar "PESO" o "DOLAR"' },
      { status: 400 },
    );
  }
  const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : '';
  if (!descripcion || descripcion.length > 300) {
    return NextResponse.json(
      { ok: false, error: 'Descripción vacía o demasiado larga' },
      { status: 400 },
    );
  }
  const categoria = String(body.categoria || '').toUpperCase() as Categoria;
  if (!CATEGORIAS.includes(categoria)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Categoría inválida. Valores aceptados: ${CATEGORIAS.join(', ')}`,
      },
      { status: 400 },
    );
  }
  const importeAbs = Number(body.importe);
  if (!isFinite(importeAbs) || importeAbs <= 0) {
    return NextResponse.json(
      { ok: false, error: 'Importe inválido (debe ser un número positivo)' },
      { status: 400 },
    );
  }
  const tipo = String(body.tipo || '').toUpperCase() as Tipo;
  if (!TIPOS.includes(tipo)) {
    return NextResponse.json(
      { ok: false, error: 'Tipo inválido — usar "INGRESO" o "EGRESO"' },
      { status: 400 },
    );
  }
  const importeSigned = tipo === 'EGRESO' ? -importeAbs : importeAbs;

  try {
    const result = await appendMovimiento({
      iso: fecha,
      moneda,
      descripcion,
      categoria,
      importeSigned,
    });
    console.log(
      `[CAJA/MOV] ${user.email} → ${result.tab}#${result.fila} ${moneda} ${tipo} ${importeAbs} (${categoria})`,
    );
    return NextResponse.json({
      ok: true,
      tab: result.tab,
      fila: result.fila,
    });
  } catch (err) {
    if (err instanceof CajaError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('[CAJA/MOV] POST error:', err);
    const msg = err instanceof Error ? err.message : 'Error guardando';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
