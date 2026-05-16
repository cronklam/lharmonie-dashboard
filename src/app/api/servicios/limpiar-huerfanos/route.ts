import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import { getSheetsClient } from '@/lib/servicios-server';
import { periodoToTab } from '@/lib/servicios-mes';
import { INDICE_TAB, INDICE_LAST_COL } from '@/lib/indice';

export const dynamic = 'force-dynamic';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';

// POST /api/servicios/limpiar-huerfanos
// Body: { periodo: "YYYY-MM", dryRun?: boolean }
//
// Limpia las filas del pivot mensual cuyo nombre NO matchea ningún
// servicio del LISTADO (catálogo canónico). Match es case-insensitive
// y trim — el LISTADO tiene "Luz" como entry "Luz LH2" (servicio +
// ancla), pero acá comparamos solo el nombre (col A del LISTADO vs
// col A del pivot). Si el nombre aparece en el LISTADO con CUALQUIER
// ancla, la fila se conserva.
//
// `dryRun: true` → devuelve los nombres encontrados sin borrar nada.
// Owner / admin (capability 'servicios') only.
//
// La fila se "borra" con values.clear sobre A..Z de esa fila — NO se
// shift-eliminan filas (preserva fórmulas/posiciones de otras filas).

interface PostBody {
  periodo?: string;
  dryRun?: boolean;
}

export const POST = withAuth(async (req, user) => {
  if (!hasCapability(user.email, 'servicios')) {
    throw new AuthError(403, 'No tenés acceso a Servicios');
  }
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    return NextResponse.json(
      { ok: false, error: 'GOOGLE_CREDENTIALS o SERVICIOS_SHEET_ID no configurados' },
      { status: 500 },
    );
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }

  const periodo = (body.periodo || '').trim();
  const dryRun = body.dryRun === true;

  if (!periodo.match(/^\d{4}-\d{2}$/)) {
    return NextResponse.json(
      { ok: false, error: 'periodo inválido (esperado YYYY-MM)' },
      { status: 400 },
    );
  }

  const [yearStr, monthStr] = periodo.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const tabName = periodoToTab(year, month);

  try {
    // 1) Leer el LISTADO entero. Construir set de nombres canónicos
    //    (col A, sin importar ancla) en uppercase trim.
    const indiceRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${INDICE_TAB}'!A2:${INDICE_LAST_COL}`,
    });
    const indiceRows = indiceRes.data.values || [];
    const catalogoNames = new Set<string>();
    for (const row of indiceRows) {
      const nombre = (row[0] || '').toString().trim().toUpperCase();
      if (nombre) catalogoNames.add(nombre);
    }
    if (catalogoNames.size === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'El LISTADO está vacío. Cargá servicios al catálogo antes de limpiar huérfanos.',
        },
        { status: 400 },
      );
    }

    // 2) Leer el pivot del mes.
    let pivotRes;
    try {
      pivotRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `'${tabName}'!A1:Z60`,
      });
    } catch {
      return NextResponse.json(
        { ok: false, error: `El tab "${tabName}" no existe.` },
        { status: 404 },
      );
    }
    const rows = pivotRes.data.values || [];

    // 3) Identificar header row (misma heurística que /celda).
    let headerRow = -1;
    for (let i = 0; i < Math.min(rows.length, 6); i++) {
      const a = (rows[i]?.[0] || '').toString().trim().toUpperCase();
      if (
        a.includes('SERVICIOS A PAGAR') ||
        a === 'SERVICIOS' ||
        a.startsWith('SERVICIOS ')
      ) {
        headerRow = i;
        break;
      }
    }
    if (headerRow < 0) {
      return NextResponse.json(
        { ok: false, error: 'No se encontró fila de headers en el tab del mes.' },
        { status: 500 },
      );
    }

    // 4) Recorrer filas de servicios. Identificar las huérfanas.
    const huerfanas: { nombre: string; row: number }[] = [];
    for (let i = headerRow + 1; i < rows.length; i++) {
      const nombre = (rows[i]?.[0] || '').toString().trim();
      if (!nombre) continue;
      // Saltear filas que solo tienen un título / agrupador sin valores —
      // pero ahora limpiamos por nombre, no por tipo de fila.
      const nombreUp = nombre.toUpperCase();
      if (!catalogoNames.has(nombreUp)) {
        huerfanas.push({ nombre, row: i + 1 }); // row 1-indexed para Sheets
      }
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        tab: tabName,
        encontradas: huerfanas.length,
        nombres: huerfanas.map((h) => h.nombre),
      });
    }

    if (huerfanas.length === 0) {
      return NextResponse.json({
        ok: true,
        dryRun: false,
        tab: tabName,
        encontradas: 0,
        borradas: 0,
        nombres: [],
      });
    }

    // 5) Borrar contenido fila por fila con batchClear. Solo limpiamos
    //    A..Z (no eliminamos filas físicamente — mantenemos posiciones).
    const ranges = huerfanas.map((h) => `'${tabName}'!A${h.row}:Z${h.row}`);
    await sheets.spreadsheets.values.batchClear({
      spreadsheetId: SHEET_ID,
      requestBody: { ranges },
    });

    console.log(
      `[SERVICIOS/LIMPIAR-HUERFANOS] ${user.email} ${tabName}: borró ${huerfanas.length} filas → ${huerfanas.map((h) => h.nombre).join(', ')}`,
    );

    return NextResponse.json({
      ok: true,
      dryRun: false,
      tab: tabName,
      encontradas: huerfanas.length,
      borradas: huerfanas.length,
      nombres: huerfanas.map((h) => h.nombre),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[SERVICIOS/LIMPIAR-HUERFANOS]', err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
