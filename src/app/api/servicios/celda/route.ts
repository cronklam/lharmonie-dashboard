import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability } from '@/lib/users';
import { getSheetsClient } from '@/lib/servicios-server';
import { periodoToTab } from '@/lib/servicios-mes';

export const dynamic = 'force-dynamic';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';

// Helpers para identificar el header row + ubicar fila por nombre canónico
// (insensitive). Replicamos la lógica que el parser usa para que el writer
// apunte exactamente al mismo lugar visible en la UI.

function colLetter(idx: number): string {
  // 0-indexed → A, B, ...
  let letter = '';
  let n = idx;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

interface PostBody {
  periodo?: string;       // YYYY-MM
  servicioRaw?: string;   // nombre EXACTO como está en col A del Sheet
  localCol?: string;      // header EXACTO de la columna destino (ej "LIBERTADOR")
  valor?: string;         // texto a escribir (ej "$ 458.832" o "1400 USD")
  /** Si true, sobrescribe aunque la celda no esté vacía / TODAVIA NO. */
  forzar?: boolean;
}

// POST /api/servicios/celda
// Body: { periodo, servicioRaw, localCol, valor, forzar? }
//
// Escribe en la celda específica de la pestaña del mes. Por defecto
// SOLO escribe si la celda está vacía o tiene "TODAVIA NO".
// Para sobrescribir el usuario tiene que pasar `forzar: true` explícito.
//
// Si la celda tiene "NO" (el local no tiene este servicio), tampoco
// escribe — eso es una afirmación de Iara que no queremos pisar.
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
  const servicioRaw = (body.servicioRaw || '').trim();
  const localCol = (body.localCol || '').trim();
  const valor = (body.valor || '').trim();
  const forzar = body.forzar === true;

  if (!periodo.match(/^\d{4}-\d{2}$/)) {
    return NextResponse.json(
      { ok: false, error: 'periodo inválido (esperado YYYY-MM)' },
      { status: 400 },
    );
  }
  if (!servicioRaw) {
    return NextResponse.json(
      { ok: false, error: 'falta servicioRaw' },
      { status: 400 },
    );
  }
  if (!localCol) {
    return NextResponse.json(
      { ok: false, error: 'falta localCol' },
      { status: 400 },
    );
  }
  if (!valor) {
    return NextResponse.json(
      { ok: false, error: 'falta valor' },
      { status: 400 },
    );
  }

  const [yearStr, monthStr] = periodo.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const tabName = periodoToTab(year, month);

  try {
    // 1) Leer el tab del mes.
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A1:Z60`,
    });
    const rows = readRes.data.values || [];

    // 2) Encontrar header row.
    let headerRow = -1;
    for (let i = 0; i < Math.min(rows.length, 6); i++) {
      const a = (rows[i]?.[0] || '').trim().toUpperCase();
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
        { ok: false, error: 'No se encontró fila de headers en el tab.' },
        { status: 500 },
      );
    }
    const headers = (rows[headerRow] || []).map((h) => (h || '').trim().toUpperCase());
    const targetCol = headers.findIndex((h) => h === localCol.toUpperCase());
    if (targetCol < 0) {
      return NextResponse.json(
        { ok: false, error: `Columna "${localCol}" no encontrada en el tab.` },
        { status: 404 },
      );
    }

    // 3) Encontrar fila del servicio (case-insensitive, trim).
    const targetServLower = servicioRaw.toLowerCase();
    let serviceRow = -1;
    for (let i = headerRow + 1; i < rows.length; i++) {
      const a = (rows[i]?.[0] || '').trim();
      if (a.toLowerCase() === targetServLower) {
        serviceRow = i;
        break;
      }
    }
    if (serviceRow < 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Servicio "${servicioRaw}" no encontrado en el tab "${tabName}".`,
        },
        { status: 404 },
      );
    }

    // 4) Leer la celda actual para decidir si escribimos.
    const existing = (rows[serviceRow]?.[targetCol] || '').trim();
    const existingUp = existing.toUpperCase();
    const esEscribible =
      !existing ||
      existingUp === 'TODAVIA NO' ||
      existingUp === 'TODAVÍA NO' ||
      existingUp === 'PENDIENTE' ||
      existingUp === 'PAGAR';

    if (!esEscribible && !forzar) {
      return NextResponse.json(
        {
          ok: false,
          error: `La celda ya tiene "${existing}". Para sobrescribir pasá forzar: true.`,
          valorActual: existing,
        },
        { status: 409 },
      );
    }

    // Nunca pisar "NO" (afirmación de "este local no tiene este servicio").
    if (existingUp === 'NO') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'La celda dice "NO" (ese local no tiene este servicio). Si querés cambiar eso editá el Sheet a mano.',
        },
        { status: 409 },
      );
    }

    // 5) Escribir.
    // Usamos USER_ENTERED para que "$ 1234" lo formatee Sheets como número.
    const cellRange = `'${tabName}'!${colLetter(targetCol)}${serviceRow + 1}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: cellRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[valor]] },
    });

    console.log(
      `[SERVICIOS/CELDA] ${user.email} ${tabName} ${servicioRaw} × ${localCol} = "${valor}" (era "${existing}")`,
    );
    return NextResponse.json({
      ok: true,
      celda: cellRange,
      valorPrevio: existing,
      valorNuevo: valor,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    if (msg.toLowerCase().includes('unable to parse range')) {
      return NextResponse.json(
        { ok: false, error: `El tab "${tabName}" no existe.` },
        { status: 404 },
      );
    }
    console.error('[SERVICIOS/CELDA]', err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
