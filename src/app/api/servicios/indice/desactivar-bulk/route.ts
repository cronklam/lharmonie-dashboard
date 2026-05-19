import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { isOwner } from '@/lib/users';
import { getSheetsClient } from '@/lib/servicios-server';
import { INDICE_TAB, INDICE_HEADERS, INDICE_LAST_COL } from '@/lib/indice';

export const dynamic = 'force-dynamic';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';

// POST /api/servicios/indice/desactivar-bulk
// Body: { servicio?: string, ancla?: string }
//
// Soft-delete (activo = FALSE) sobre entries del LISTADO:
//   - Solo servicio  → todas las filas con ese nombre de servicio
//                       (= "eliminar esa fila para todos los locales").
//   - Solo ancla     → todas las filas con esa ancla
//                       (= "eliminar esa columna para todos los
//                        servicios").
//   - Ambos          → solo la entry exacta (1 fila).
//   - Ninguno        → 400.
//
// Owner-only. Devuelve { ok, desactivadas, nombres }.

interface PostBody {
  servicio?: string;
  ancla?: string;
}

export const POST = withAuth(async (req, user) => {
  if (!isOwner(user.email)) {
    throw new AuthError(403, 'Solo el owner puede desactivar servicios.');
  }
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    return NextResponse.json(
      { ok: false, error: 'GOOGLE_CREDENTIALS o SERVICIOS_SHEET_ID faltante' },
      { status: 500 },
    );
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }
  const servicio = (body.servicio || '').trim();
  const ancla = (body.ancla || '').trim();
  if (!servicio && !ancla) {
    return NextResponse.json(
      { ok: false, error: 'Pasá servicio y/o ancla' },
      { status: 400 },
    );
  }

  try {
    // Leer todo el LISTADO.
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${INDICE_TAB}'!A1:${INDICE_LAST_COL}500`,
    });
    const rows = res.data.values || [];
    if (rows.length < 2) {
      return NextResponse.json({
        ok: true,
        desactivadas: 0,
        nombres: [],
      });
    }
    // Header check.
    const a1 = (rows[0][0] || '').toString().trim();
    if (a1 !== 'Servicio') {
      return NextResponse.json(
        { ok: false, error: 'Formato del LISTADO inesperado (col A no es "Servicio")' },
        { status: 500 },
      );
    }

    // Posiciones de columnas relevantes.
    const idxServicio = 0; // col A
    const idxAncla = 2; // col C
    const idxActivo = INDICE_HEADERS.indexOf('Activo');
    if (idxActivo < 0) {
      return NextResponse.json(
        { ok: false, error: 'Columna "Activo" no encontrada en headers' },
        { status: 500 },
      );
    }
    const activoColLetter = String.fromCharCode('A'.charCodeAt(0) + idxActivo);

    // Match rows.
    const target: { row: number; servicio: string; ancla: string }[] = [];
    const servicioUp = servicio.toUpperCase();
    const anclaUp = ancla.toUpperCase();
    for (let i = 1; i < rows.length; i++) {
      const rowServ = (rows[i][idxServicio] || '').toString().trim();
      const rowAncla = (rows[i][idxAncla] || '').toString().trim();
      const matchServ = servicio
        ? rowServ.toUpperCase() === servicioUp
        : true;
      const matchAncla = ancla ? rowAncla.toUpperCase() === anclaUp : true;
      // Skip si ya está inactivo (no recontamos).
      const activo = (rows[i][idxActivo] || '').toString().trim().toUpperCase();
      const yaInactivo = activo === 'FALSE' || activo === 'NO' || activo === '0';
      if (matchServ && matchAncla && rowServ && !yaInactivo) {
        target.push({ row: i + 1, servicio: rowServ, ancla: rowAncla });
      }
    }

    if (target.length === 0) {
      return NextResponse.json({
        ok: true,
        desactivadas: 0,
        nombres: [],
      });
    }

    // BatchUpdate de la col Activo en cada fila target.
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: target.map((t) => ({
          range: `'${INDICE_TAB}'!${activoColLetter}${t.row}`,
          values: [['FALSE']],
        })),
      },
    });

    console.log(
      `[INDICE/DESACTIVAR-BULK] ${user.email} servicio="${servicio}" ancla="${ancla}" → ${target.length} desactivadas`,
    );

    return NextResponse.json({
      ok: true,
      desactivadas: target.length,
      nombres: target.map((t) => `${t.servicio} · ${t.ancla}`),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[INDICE/DESACTIVAR-BULK]', err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
