import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import { getSheetsClient } from '@/lib/servicios-server';

export const dynamic = 'force-dynamic';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';
const TAB_NAME = 'ÍNDICE';

export interface IndiceLocal {
  col: string;        // nombre que aparece en los tabs mensuales (ej "SEGUI")
  ancla: string;      // "LH1" / "LH2" / "MyP" / "—" / "?"
  nombre: string;     // "Lharmonie Seguí"
  notas: string;
}

export interface IndiceServicio {
  servicio: string;        // nombre que aparece en el pivot (ej "BISTROSOFT")
  categoria: string;       // "Luz" / "Internet" / "Otro" etc
  periodicidad: string;    // "mensual" / "bimestral" / "—"
  diaVenc: string;         // "25" / "9" / "—"
  notas: string;
}

// GET /api/servicios/indice
// Lee el tab ÍNDICE del Sheet y devuelve locales + servicios + meta.
// Si el tab no existe (todavía no generado), devuelve listas vacías
// sin error.
export const GET = withAuth(async (_req, user) => {
  if (!hasCapability(user.email, 'servicios')) {
    throw new AuthError(403, 'No tenés acceso a Servicios');
  }
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    return NextResponse.json(
      { ok: false, error: 'Config faltante' },
      { status: 500 },
    );
  }

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${TAB_NAME}'!A1:F60`,
    });
    const rows = res.data.values || [];

    // Layout esperado (seed-indice):
    //   row 1: title (merged)
    //   row 2: subtitle
    //   row 3: empty
    //   row 4: "LOCALES" banner
    //   row 5: table headers [Columna, Ancla, Nombre, Notas]
    //   row 6..14: locales data (9 filas)
    //   row 15: empty
    //   row 16: "SERVICIOS" banner
    //   row 17: table headers [Servicio, Categoría, Periodicidad, Día venc, Notas]
    //   row 18..36: servicios data
    //   ...
    //
    // En vez de hardcodear posiciones, recorremos buscando banners.

    const locales: IndiceLocal[] = [];
    const servicios: IndiceServicio[] = [];

    type Section = 'none' | 'locales' | 'servicios';
    let section: Section = 'none';
    let skipNext = false;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      const a = (row[0] || '').trim();
      if (!a) continue;

      const upper = a.toUpperCase();
      if (upper === 'LOCALES') {
        section = 'locales';
        skipNext = true; // saltar la fila de headers
        continue;
      }
      if (upper === 'SERVICIOS') {
        section = 'servicios';
        skipNext = true;
        continue;
      }
      if (upper === 'CONVENCIONES') {
        section = 'none';
        continue;
      }
      if (upper === 'ÍNDICE — SERVICIOS LHARMONIE' ||
          a.includes('Catálogo maestro')) {
        continue;
      }
      if (skipNext) {
        skipNext = false;
        continue;
      }

      if (section === 'locales') {
        locales.push({
          col: a,
          ancla: (row[1] || '').trim(),
          nombre: (row[2] || '').trim(),
          notas: (row[3] || '').trim(),
        });
      } else if (section === 'servicios') {
        servicios.push({
          servicio: a,
          categoria: (row[1] || '').trim(),
          periodicidad: (row[2] || '').trim(),
          diaVenc: (row[3] || '').trim(),
          notas: (row[4] || '').trim(),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      locales,
      servicios,
      tabExiste: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    if (msg.toLowerCase().includes('unable to parse range')) {
      return NextResponse.json({
        ok: true,
        locales: [],
        servicios: [],
        tabExiste: false,
      });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
