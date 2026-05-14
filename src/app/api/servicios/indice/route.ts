import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { hasCapability, isOwner } from '@/lib/users';
import { getSheetsClient } from '@/lib/servicios-server';
import {
  INDICE_TAB,
  INDICE_HEADERS,
  INDICE_TIPOS,
  INDICE_METODO_PAGO,
  INDICE_FRECUENCIA,
  indiceRowToObject,
  indiceObjectToRow,
  type IndiceServicio,
  type IndiceTipo,
  type IndiceMetodoPago,
  type IndiceFrecuencia,
} from '@/lib/indice';
import { ANCLAS, type Ancla } from '@/lib/anclas';

export const dynamic = 'force-dynamic';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';

// ─── Helpers shared ───────────────────────────────────────────────

interface ParsedIndice {
  tabExiste: boolean;
  servicios: IndiceServicio[];
  // Compat: los componentes viejos esperaban un array "locales" del
  // formato anterior del ÍNDICE. Lo derivamos de los servicios
  // (anclas únicas) para que el código que aún lo consuma no rompa.
  locales: Array<{ col: string; ancla: string; nombre: string; notas: string }>;
}

async function readIndice(): Promise<ParsedIndice | { error: string; status: number }> {
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    return { error: 'GOOGLE_CREDENTIALS o SERVICIOS_SHEET_ID faltante', status: 500 };
  }
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${INDICE_TAB}'!A1:K500`,
    });
    const rows = res.data.values || [];
    if (rows.length < 1) {
      return { tabExiste: true, servicios: [], locales: [] };
    }
    // Header check: si A1 no es "Servicio" asumimos que es formato
    // viejo (3 secciones) y devolvemos vacío para indicar que hay
    // que regenerar.
    const a1 = (rows[0][0] || '').trim();
    if (a1 !== 'Servicio') {
      return {
        tabExiste: true,
        servicios: [],
        locales: [],
      };
    }
    const servicios: IndiceServicio[] = [];
    for (let i = 1; i < rows.length; i++) {
      const parsed = indiceRowToObject(rows[i], i);
      if (parsed) servicios.push(parsed);
    }
    const locales = derivarLocales(servicios);
    return { tabExiste: true, servicios, locales };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    if (msg.toLowerCase().includes('unable to parse range')) {
      return { tabExiste: false, servicios: [], locales: [] };
    }
    return { error: msg, status: 500 };
  }
}

function derivarLocales(
  servicios: IndiceServicio[],
): Array<{ col: string; ancla: string; nombre: string; notas: string }> {
  const byAncla = new Map<
    string,
    { col: string; ancla: string; nombre: string; notas: string }
  >();
  // Map ancla → col del Sheet pivot (matches LOCAL_TO_ANCLA en servicios-mes)
  const anclaToCol: Record<string, string> = {
    LH1: 'SEGUI',
    LH2: 'NICARAGUA',
    LH3: 'MAURE',
    LH4: 'ZABALA',
    LH5: 'LIBERTADOR',
    LH6: 'NUÑEZ',
    CRONKLAM: 'BAMBINA',
    MyP: 'CASA MEL Y MARTIN',
  };
  for (const s of servicios) {
    if (byAncla.has(s.ancla)) continue;
    byAncla.set(s.ancla, {
      col: anclaToCol[s.ancla] || s.ancla,
      ancla: s.ancla,
      nombre: s.localDisplay || s.ancla,
      notas: '',
    });
  }
  return Array.from(byAncla.values());
}

// ─── GET /api/servicios/indice ────────────────────────────────────

export const GET = withAuth(async (_req, user) => {
  if (!hasCapability(user.email, 'servicios')) {
    throw new AuthError(403, 'No tenés acceso a Servicios');
  }
  const result = await readIndice();
  if ('error' in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, ...result });
});

// ─── POST /api/servicios/indice ───────────────────────────────────
// Append una fila al ÍNDICE. Owner-only.

interface PostBody {
  servicio?: string;
  tipo?: string;
  ancla?: string;
  localDisplay?: string;
  diaVencimiento?: number | string | null;
  metodoPago?: string;
  frecuencia?: string;
  activo?: boolean;
  subarrendadoBaigun?: boolean;
  cbu?: string;
  notas?: string;
}

function validateBody(body: PostBody): {
  data?: Omit<IndiceServicio, '_row'>;
  error?: string;
} {
  const servicio = (body.servicio || '').trim();
  if (!servicio) return { error: 'Falta servicio' };
  const tipo = (body.tipo || 'otro').toLowerCase() as IndiceTipo;
  if (!(INDICE_TIPOS as readonly string[]).includes(tipo)) {
    return { error: `Tipo inválido: ${tipo}` };
  }
  const ancla = (body.ancla || '').trim() as Ancla;
  if (!ANCLAS.includes(ancla)) {
    return { error: `Ancla inválida: ${ancla}` };
  }
  const dia =
    body.diaVencimiento === null || body.diaVencimiento === ''
      ? null
      : Number(body.diaVencimiento);
  if (dia !== null && (isNaN(dia) || dia < 1 || dia > 31)) {
    return { error: `Día de vencimiento fuera de rango (1-31): ${body.diaVencimiento}` };
  }
  const metodoPagoRaw = (body.metodoPago || '').toLowerCase();
  const metodoPago: IndiceMetodoPago | '' = metodoPagoRaw
    ? ((INDICE_METODO_PAGO as readonly string[]).includes(metodoPagoRaw)
      ? (metodoPagoRaw as IndiceMetodoPago)
      : '')
    : '';
  if (metodoPagoRaw && !metodoPago) {
    return { error: `Método de pago inválido: ${metodoPagoRaw}` };
  }
  const frecRaw = (body.frecuencia || 'mensual').toLowerCase();
  const frecuencia: IndiceFrecuencia | '' = (
    INDICE_FRECUENCIA as readonly string[]
  ).includes(frecRaw)
    ? (frecRaw as IndiceFrecuencia)
    : 'mensual';
  return {
    data: {
      servicio,
      tipo,
      ancla,
      localDisplay: (body.localDisplay || '').trim(),
      diaVencimiento: dia,
      metodoPago,
      frecuencia,
      activo: body.activo !== false,
      subarrendadoBaigun: body.subarrendadoBaigun === true,
      cbu: (body.cbu || '').trim(),
      notas: (body.notas || '').trim(),
    },
  };
}

export const POST = withAuth(async (req, user) => {
  if (!isOwner(user.email)) {
    throw new AuthError(403, 'Solo el owner puede editar el catálogo.');
  }
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    return NextResponse.json({ ok: false, error: 'Config faltante' }, { status: 500 });
  }
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }
  const v = validateBody(body);
  if (!v.data) {
    return NextResponse.json({ ok: false, error: v.error || 'inválido' }, { status: 400 });
  }
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `'${INDICE_TAB}'!A2:K`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [indiceObjectToRow(v.data)] },
    });
    console.log(`[INDICE/POST] ${user.email} + ${v.data.servicio} / ${v.data.ancla}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error escribiendo';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});

// ─── PATCH /api/servicios/indice ──────────────────────────────────
// Body: { row: number (1-indexed), ...campos a actualizar }

export const PATCH = withAuth(async (req, user) => {
  if (!isOwner(user.email)) {
    throw new AuthError(403, 'Solo el owner puede editar el catálogo.');
  }
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    return NextResponse.json({ ok: false, error: 'Config faltante' }, { status: 500 });
  }
  let body: PostBody & { row?: number };
  try {
    body = (await req.json()) as PostBody & { row?: number };
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }
  const row = Number(body.row);
  if (!Number.isFinite(row) || row < 2) {
    return NextResponse.json(
      { ok: false, error: 'row inválido (entero ≥ 2)' },
      { status: 400 },
    );
  }
  const v = validateBody(body);
  if (!v.data) {
    return NextResponse.json({ ok: false, error: v.error || 'inválido' }, { status: 400 });
  }
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${INDICE_TAB}'!A${row}:K${row}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [indiceObjectToRow(v.data)] },
    });
    console.log(`[INDICE/PATCH] ${user.email} row=${row} → ${v.data.servicio}/${v.data.ancla}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error escribiendo';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});

// ─── DELETE /api/servicios/indice ─────────────────────────────────
// Soft delete: marca activo=FALSE en lugar de borrar la fila. Así
// la fila queda como referencia histórica.
// Body: { row: number }

export const DELETE = withAuth(async (req, user) => {
  if (!isOwner(user.email)) {
    throw new AuthError(403, 'Solo el owner puede desactivar servicios.');
  }
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    return NextResponse.json({ ok: false, error: 'Config faltante' }, { status: 500 });
  }
  const url = new URL(req.url);
  const rowParam = url.searchParams.get('row');
  let row: number;
  if (rowParam) {
    row = Number(rowParam);
  } else {
    let body: { row?: number };
    try {
      body = (await req.json()) as { row?: number };
    } catch {
      return NextResponse.json({ ok: false, error: 'Falta row' }, { status: 400 });
    }
    row = Number(body.row);
  }
  if (!Number.isFinite(row) || row < 2) {
    return NextResponse.json(
      { ok: false, error: 'row inválido (entero ≥ 2)' },
      { status: 400 },
    );
  }
  try {
    // Solo escribir la celda H (activo)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${INDICE_TAB}'!H${row}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['FALSE']] },
    });
    console.log(`[INDICE/DELETE] ${user.email} soft-deleted row=${row}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});

// ─── Compat types para componentes legacy ────────────────────────
// (servicios/page.tsx aún importa estos types desde acá. Mantenemos
// la export para no romper.)

export type { IndiceServicio } from '@/lib/indice';
export interface IndiceLocal {
  col: string;
  ancla: string;
  nombre: string;
  notas: string;
}
// El field "Servicio" del IndiceServicio compat — el page.tsx usa
// `s.servicio` que sigue existiendo, y `categoria` que ya no. Vamos
// a actualizar el page.tsx para usar el nuevo type.
