import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { isOwner } from '@/lib/users';
import { getSheetsClient } from '@/lib/servicios-server';
import {
  parsePeriodoTab,
  periodoToTab,
  periodoToLabel,
  ANCLA_TO_LOCAL_COL,
} from '@/lib/servicios-mes';
import {
  INDICE_TAB,
  INDICE_LAST_COL,
  indiceRowToObject,
  type IndiceServicio,
} from '@/lib/indice';
import { type Ancla } from '@/lib/anclas';

export const dynamic = 'force-dynamic';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';

// POST /api/servicios/crear-mes
// Body: { periodo?: "YYYY-MM" }  (default: mes siguiente al último
// tab mensual existente)
//
// Crea un tab nuevo con estructura idéntica al último, popula filas
// con los servicios ACTIVOS del Catálogo (ÍNDICE), y rellena los
// montos sugeridos copiando del mes anterior cuando hay valor.
//
// IMPORTANTE: no toca ningún tab existente. Solo crea uno nuevo.
export const POST = withAuth(async (req, user) => {
  if (!isOwner(user.email)) {
    throw new AuthError(403, 'Solo el owner puede crear meses nuevos.');
  }
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    return NextResponse.json(
      { ok: false, error: 'Config faltante' },
      { status: 500 },
    );
  }

  let body: { periodo?: string } = {};
  try {
    body = (await req.json()) as { periodo?: string };
  } catch {
    body = {};
  }

  try {
    // 1) Listar todos los tabs del sheet.
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      fields: 'sheets.properties(sheetId,title)',
    });
    const allSheets = meta.data.sheets || [];
    const tabTitles = allSheets
      .map((s) => s.properties?.title || '')
      .filter(Boolean);

    // 2) Detectar meses parseables, ordenados desc.
    const meses = tabTitles
      .map((t) => parsePeriodoTab(t))
      .filter((p): p is NonNullable<ReturnType<typeof parsePeriodoTab>> => p !== null)
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
    if (meses.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No se detectó ningún tab mensual existente (MAYO 26, etc).',
        },
        { status: 400 },
      );
    }
    const ultimo = meses[0];

    // 3) Determinar el nuevo periodo.
    let nuevoYear = ultimo.year;
    let nuevoMonth = ultimo.month + 1;
    if (nuevoMonth > 12) {
      nuevoMonth = 1;
      nuevoYear++;
    }
    if (body.periodo && /^\d{4}-\d{2}$/.test(body.periodo)) {
      const [y, m] = body.periodo.split('-').map((n) => parseInt(n, 10));
      nuevoYear = y;
      nuevoMonth = m;
    }
    const nuevoTab = periodoToTab(nuevoYear, nuevoMonth);
    const nuevoLabel = periodoToLabel(nuevoYear, nuevoMonth);

    // 4) Verificar si ya existe el tab destino.
    if (allSheets.some((s) => s.properties?.title === nuevoTab)) {
      return NextResponse.json({
        ok: false,
        error: `El tab "${nuevoTab}" ya existe en el Sheet. Abrilo desde el dashboard.`,
        yaExiste: true,
      }, { status: 409 });
    }

    // 5) Leer el tab anterior para copiar estructura + montos.
    const prevRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${ultimo.tab}'!A1:Z80`,
    });
    const prevRows = prevRes.data.values || [];
    if (prevRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: `El tab anterior "${ultimo.tab}" está vacío.` },
        { status: 400 },
      );
    }
    // Detectar fila header (A == "SERVICIOS A PAGAR")
    let prevHeaderRow = -1;
    for (let i = 0; i < Math.min(prevRows.length, 6); i++) {
      const a = (prevRows[i]?.[0] || '').trim().toUpperCase();
      if (a.includes('SERVICIOS A PAGAR') || a === 'SERVICIOS') {
        prevHeaderRow = i;
        break;
      }
    }
    if (prevHeaderRow < 0) {
      return NextResponse.json(
        { ok: false, error: `No se encontró header en "${ultimo.tab}".` },
        { status: 500 },
      );
    }
    const prevHeaders = (prevRows[prevHeaderRow] || []).map((h) =>
      (h || '').trim().toUpperCase(),
    );

    // Index por servicio raw del mes anterior → row
    const prevByServicio = new Map<string, string[]>();
    for (let i = prevHeaderRow + 1; i < prevRows.length; i++) {
      const r = prevRows[i] || [];
      const servicio = (r[0] || '').trim();
      if (!servicio) continue;
      prevByServicio.set(servicio.toUpperCase(), r);
    }

    // 6) Leer Catálogo ÍNDICE para saber qué servicios activos sumar.
    let catalogo: IndiceServicio[] = [];
    try {
      const indRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `'${INDICE_TAB}'!A1:${INDICE_LAST_COL}500`,
      });
      const indRows = indRes.data.values || [];
      if (indRows.length > 0 && (indRows[0][0] || '').trim() === 'Servicio') {
        for (let i = 1; i < indRows.length; i++) {
          const parsed = indiceRowToObject(indRows[i], i);
          if (parsed && parsed.activo) catalogo.push(parsed);
        }
      }
    } catch {
      // ÍNDICE no existe — usaremos servicios del mes anterior solamente
      catalogo = [];
    }

    // 7) Agrupar catálogo por servicio (un servicio puede aparecer
    //    en múltiples anclas — todas hablan del mismo nombre).
    const serviciosCatalog = new Map<string, IndiceServicio[]>();
    for (const c of catalogo) {
      const k = c.servicio.toUpperCase();
      const arr = serviciosCatalog.get(k) || [];
      arr.push(c);
      serviciosCatalog.set(k, arr);
    }

    // 8) Construir filas del nuevo mes.
    //    Estrategia: usar TODAS las filas del mes anterior como base
    //    (preserva orden y estructura). Para cada celda, si el mes
    //    anterior tiene un valor numérico (pagado), copiarlo como
    //    "sugerido". Si el mes anterior tiene "NO", copiar "NO".
    //    Lo que estaba "TODAVIA NO" o vacío → vacío (a cargar).
    //    Si el Catálogo tiene servicios que no están en el mes
    //    anterior, sumarlos al final.
    const nuevoData: string[][] = [];
    // Header rows (copia las primeras prevHeaderRow + 1 filas)
    for (let i = 0; i <= prevHeaderRow; i++) {
      nuevoData.push([...(prevRows[i] || [])]);
    }
    const serviciosYaIncluidos = new Set<string>();
    for (let i = prevHeaderRow + 1; i < prevRows.length; i++) {
      const r = prevRows[i] || [];
      const servicio = (r[0] || '').trim();
      if (!servicio) continue;
      // Filas TOTAL — copiamos vacío
      if (/^TOTAL\b/i.test(servicio)) {
        const nueva: string[] = [servicio];
        for (let c = 1; c < prevHeaders.length; c++) nueva.push('');
        nuevoData.push(nueva);
        continue;
      }
      serviciosYaIncluidos.add(servicio.toUpperCase());
      const nueva: string[] = [servicio];
      for (let c = 1; c < prevHeaders.length; c++) {
        const prevVal = (r[c] || '').trim();
        const upper = prevVal.toUpperCase();
        if (upper === 'NO') {
          // Preservar marca "NO aplica" del local — estructura del mes.
          nueva.push('NO');
        } else {
          // Mes nuevo: todas las celdas arrancan vacías = "A pagar".
          // El monto sugerido se lee del LISTADO (montoEstimadoArs) y se
          // muestra como hint debajo del label "Pagar" en la UI, no se
          // pre-llena en el Sheet.
          nueva.push('');
        }
      }
      nuevoData.push(nueva);
    }
    // Sumar servicios del Catálogo que NO están en el mes anterior
    for (const [servicioUpper, entries] of serviciosCatalog.entries()) {
      if (serviciosYaIncluidos.has(servicioUpper)) continue;
      const nombre = entries[0].servicio;
      const nueva: string[] = [nombre];
      const anclasConServicio = new Set(entries.map((e) => e.ancla));
      for (let c = 1; c < prevHeaders.length; c++) {
        const colHeader = prevHeaders[c];
        // Mapear col → ancla. Si esta col matchea alguna ancla del
        // servicio, lo dejamos vacío (a cargar). Sino → "NO".
        const ancla = colHeaderToAncla(colHeader);
        if (ancla && anclasConServicio.has(ancla)) {
          nueva.push(''); // a cargar
        } else if (ancla) {
          nueva.push('NO');
        } else {
          // Col no mapeable (BAIGUN, notas, etc)
          nueva.push('');
        }
      }
      nuevoData.push(nueva);
    }

    // 9) Crear el tab y escribir data.
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: nuevoTab,
                gridProperties: {
                  rowCount: Math.max(60, nuevoData.length + 10),
                  columnCount: Math.max(15, prevHeaders.length + 2),
                  frozenRowCount: prevHeaderRow + 1,
                },
              },
            },
          },
        ],
      },
    });
    const newSheetId =
      addRes.data.replies?.[0]?.addSheet?.properties?.sheetId;
    if (newSheetId === undefined || newSheetId === null) {
      throw new Error('No se pudo obtener el sheetId del nuevo tab');
    }

    // Reemplazar título del tab por algo más útil si el primer row
    // tiene "Mayo 2026" o similar — actualizamos para reflejar el nuevo mes.
    if (nuevoData[0] && nuevoData[0][0]) {
      const a0 = nuevoData[0][0];
      // Si arranca con "Caja efectivo" o tiene un label de mes, intentar reemplazar
      if (a0.match(/[A-Z][a-z]+\s+\d{4}/)) {
        nuevoData[0][0] = a0.replace(/[A-Z][a-z]+\s+\d{4}/, nuevoLabel);
      }
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${nuevoTab}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: nuevoData },
    });

    console.log(
      `[CREAR-MES] ${user.email} → ${nuevoTab} (${nuevoData.length - prevHeaderRow - 1} servicios, base: ${ultimo.tab})`,
    );
    return NextResponse.json({
      ok: true,
      tab: nuevoTab,
      label: nuevoLabel,
      filasCreadas: nuevoData.length - prevHeaderRow - 1,
      mesBase: ultimo.tab,
      serviciosDelCatalogoAgregados:
        serviciosCatalog.size -
        Array.from(serviciosYaIncluidos).filter((s) =>
          serviciosCatalog.has(s),
        ).length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    console.error('[CREAR-MES]', err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});

// Reverse de LOCAL_TO_ANCLA: convierte el header de una columna del
// Sheet (ej "SEGUI", "LIBERTADOR") al ancla correspondiente.
function colHeaderToAncla(headerUpper: string): Ancla | null {
  for (const [ancla, col] of Object.entries(ANCLA_TO_LOCAL_COL)) {
    if (col.toUpperCase() === headerUpper) return ancla as Ancla;
  }
  return null;
}
