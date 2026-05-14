import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import { readAllBaigun, soloActivos } from '@/lib/baigun-cta-cte-server';
import { ServiciosError } from '@/lib/servicios-server';

export const dynamic = 'force-dynamic';

// GET /api/baigun/cta-cte/export?formato=csv&mes=&servicio=&tipo=
// Devuelve CSV con headers en español. Solo movs activos.
export const GET = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'baigun')) {
    throw new AuthError(403, 'No tenés acceso a Baigun');
  }
  try {
    const url = new URL(req.url);
    const formato = (url.searchParams.get('formato') || 'csv').toLowerCase();
    const mes = url.searchParams.get('mes') || '';
    const servicio = url.searchParams.get('servicio') || '';
    const tipo = url.searchParams.get('tipo') || '';

    const all = soloActivos(await readAllBaigun());
    let items = all;
    if (mes) items = items.filter((m) => m.mesOrigen === mes);
    if (servicio) items = items.filter((m) => m.servicioRef === servicio);
    if (tipo && tipo !== 'todos') items = items.filter((m) => m.tipo === tipo);
    // Sort desc por createdAt
    items.sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );

    if (formato !== 'csv') {
      return NextResponse.json({ ok: false, error: 'formato no soportado' }, { status: 400 });
    }

    const headers = [
      'ID', 'Fecha', 'Mes origen', 'Tipo', 'Concepto', 'Servicio',
      'Monto', 'Saldo despues', 'Metodo', 'Notas',
      'Fuente', 'Cargado por', 'Creado en',
    ];
    const esc = (v: string | number) => {
      const s = String(v ?? '');
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [headers.join(',')];
    for (const m of items) {
      lines.push([
        m.id, m.fecha, m.mesOrigen, m.tipo, m.concepto, m.servicioRef,
        m.monto, m.saldoDespues, m.metodo, m.notas,
        m.fuente, m.cargadoPor, m.createdAt,
      ].map(esc).join(','));
    }
    // BOM para que Excel reconozca UTF-8.
    const body = '﻿' + lines.join('\r\n');
    const filename = `cta-cte-baigun${mes ? `-${mes}` : ''}.csv`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    if (err instanceof ServiciosError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('[BAIGUN/EXPORT]', err);
    const msg = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
