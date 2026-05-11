import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { isOwner } from '@/lib/users';
import { getSheetsClient, ServiciosError } from '@/lib/servicios-server';

export const dynamic = 'force-dynamic';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';
const TAB_NAME = 'ÍNDICE';

// ─── Contenido canónico ───────────────────────────────────────────
// Esto es lo que se escribe en el tab. Iara puede editar los campos
// "?" o "(completar)" después en el Sheet directamente.

const LOCALES = [
  ['SEGUI', 'LH1', 'Lharmonie Seguí', ''],
  ['MAURE', '?', '?', '(completar)'],
  ['NICARAGUA', 'LH2', 'Lharmonie Nicaragua', ''],
  ['ZABALA', 'LH4', 'Lharmonie Zabala', ''],
  ['LIBERTADOR', 'LH5', 'Lharmonie Libertador', 'Subarriendo Baigun'],
  ['NUÑEZ', 'LH6', 'Lharmonie Núñez', ''],
  ['CASA MEL Y MARTIN', 'MyP', 'Casa personal Martín y Melanie', 'No entra en métricas operativas'],
  ['BAMBINA', '?', '?', '(completar)'],
  ['BAIGUN', '—', '(no es local)', 'Saldo cta cte del subarriendo'],
];

const SERVICIOS = [
  ['BISTROSOFT', 'Sistema', 'mensual', '—', 'POS / sistema de gestión'],
  ['TELECOM/FLOW WIFI', 'Internet', 'mensual', '~25', 'Débito automático'],
  ['FLOW WIFI', 'Internet', 'mensual', '—', ''],
  ['METROGAS', 'Gas', 'bimestral', '—', ''],
  ['AYSA', 'Agua', 'bimestral', '—', ''],
  ['ABL', 'Impositivo', 'bimestral', '—', ''],
  ['EDENOR', 'Luz', 'bimestral', '—', ''],
  ['EXPENSAS', 'Expensas', 'mensual', '—', ''],
  ['IVA ALQUILER', 'IVA', 'mensual', '18', ''],
  ['ALQUILERES', 'Alquiler', 'mensual', '—', 'Efectivo'],
  ['ALQUILERES EN TRANSFERENCIAS', 'Alquiler', 'mensual', '—', 'Por transferencia'],
  ['AJDUT', 'Otro', '—', '—', ''],
  ['UTHGRA', 'Otro', '—', '—', ''],
  ['RUBRICA', 'Otro', '—', '—', ''],
  ['CONTADORAS', 'Otro', '—', '—', ''],
  ['SOMO', 'Otro', '—', '—', ''],
  ['YESHURUN MEIR', 'Otro', '—', '—', ''],
  ['VEP CS 09 DE CADA MES', 'Impositivo', 'mensual', '9', ''],
  ['VEP IVA 18 DE CADA MES', 'IVA', 'mensual', '18', ''],
];

const CONVENCIONES = [
  ['"NO"', '→', 'el local no tiene ese servicio'],
  ['"TODAVIA NO"', '→', 'pendiente de pago este mes'],
  ['"$ XX.XXX,XX"', '→', 'importe del mes (pagado o estimado)'],
  ['vacío', '→', 'falta cargar / a definir'],
  ['col BAIGUN', '→', 'saldo cta cte del subarriendo Libertador'],
  ['negativos', '→', 'saldo a favor / a cobrar'],
];

// ─── Colores ──────────────────────────────────────────────────────
// Espresso oscuro para el header, dorado Lharmonie para secciones.

const COLOR_HEADER_BG = rgb(0x0d, 0x08, 0x05); // #0D0805
const COLOR_HEADER_FG = rgb(0xf9, 0xf7, 0xf3); // #F9F7F3 cream
const COLOR_SECTION_BG = rgb(0xc4, 0xa0, 0x67); // #C4A067 dorado
const COLOR_SECTION_FG = rgb(0x1e, 0x15, 0x12); // espresso para text
const COLOR_TABLE_HEADER_BG = rgb(0xf5, 0xee, 0xe3); // crema sutil
const COLOR_BORDER = rgb(0xc4, 0xa0, 0x67); // dorado para bordes finos
const COLOR_ROW_ALT = rgb(0xfa, 0xf6, 0xef); // fondo zebra suave

function rgb(r: number, g: number, b: number) {
  return { red: r / 255, green: g / 255, blue: b / 255 };
}

export const POST = withAuth(async (req, user) => {
  if (!isOwner(user.email)) {
    throw new AuthError(403, 'Solo el owner puede regenerar el ÍNDICE.');
  }
  if (!SHEET_ID) {
    return NextResponse.json(
      { ok: false, error: 'SERVICIOS_SHEET_ID no configurado.' },
      { status: 500 },
    );
  }
  const sheets = getSheetsClient();
  if (!sheets) {
    return NextResponse.json(
      { ok: false, error: 'GOOGLE_CREDENTIALS no configurado.' },
      { status: 500 },
    );
  }

  try {
    // 1) Buscar si ya existe el tab.
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      fields: 'sheets.properties(sheetId,title,index)',
    });
    const existing = (meta.data.sheets || []).find(
      (s) => s.properties?.title === TAB_NAME,
    );

    // 2) Si existe, borrar.
    if (existing?.properties?.sheetId !== undefined) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [
            { deleteSheet: { sheetId: existing.properties.sheetId } },
          ],
        },
      });
    }

    // 3) Crear nuevo tab al principio del Sheet (index 0) para que sea lo primero que se ve.
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: TAB_NAME,
                index: 0,
                gridProperties: {
                  rowCount: 60,
                  columnCount: 6,
                  frozenRowCount: 2,
                },
                tabColor: COLOR_SECTION_BG,
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

    // 4) Calcular rows para escribir.
    const titleRow = 1;
    const subtitleRow = 2;
    // (fila 3 vacía)
    const localesHeaderRow = 4;        // banner "LOCALES"
    const localesTableHeaderRow = 5;   // headers de la tabla
    const localesFirstDataRow = 6;
    const localesLastDataRow = localesFirstDataRow + LOCALES.length - 1; // 14
    // (1 fila vacía)
    const serviciosHeaderRow = localesLastDataRow + 2;       // 16
    const serviciosTableHeaderRow = serviciosHeaderRow + 1;  // 17
    const serviciosFirstDataRow = serviciosTableHeaderRow + 1; // 18
    const serviciosLastDataRow = serviciosFirstDataRow + SERVICIOS.length - 1; // 36
    // (1 fila vacía)
    const convencionesHeaderRow = serviciosLastDataRow + 2;  // 38
    const convencionesFirstDataRow = convencionesHeaderRow + 1; // 39
    const convencionesLastDataRow = convencionesFirstDataRow + CONVENCIONES.length - 1; // 44

    // 5) Construir matriz de valores y escribir en una llamada.
    const values: string[][] = [];
    const pad = (arr: string[], n: number) => {
      const out = [...arr];
      while (out.length < n) out.push('');
      return out;
    };
    const empty = () => ['', '', '', '', '', ''];

    // Row 1: title (merged A:E)
    values.push(pad(['ÍNDICE — SERVICIOS LHARMONIE'], 6));
    // Row 2: subtitle
    values.push(pad(['Catálogo maestro de servicios, locales y convenciones de uso del Sheet'], 6));
    // Row 3: empty
    values.push(empty());
    // Row 4: LOCALES banner
    values.push(pad(['LOCALES'], 6));
    // Row 5: table headers
    values.push(pad(['Columna en mes', 'Ancla', 'Nombre largo', 'Notas'], 6));
    // Rows 6-14: locales data
    for (const row of LOCALES) values.push(pad(row, 6));
    // Empty
    values.push(empty());
    // Row 16: SERVICIOS banner
    values.push(pad(['SERVICIOS'], 6));
    // Row 17: table headers
    values.push(pad(['Servicio', 'Categoría', 'Periodicidad', 'Día venc', 'Notas'], 6));
    // Rows 18-36: servicios data
    for (const row of SERVICIOS) values.push(pad(row, 6));
    // Empty
    values.push(empty());
    // Row 38: CONVENCIONES banner
    values.push(pad(['CONVENCIONES'], 6));
    // Rows 39-44: convenciones
    for (const row of CONVENCIONES) values.push(pad(row, 6));

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${TAB_NAME}'!A1:F${values.length}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });

    // 6) Formato: merges + estilos + bordes en un solo batchUpdate.
    const requests: object[] = [];

    // Helper para repeatCell
    const fmtRange = (
      startRow: number,
      endRow: number,
      startCol: number,
      endCol: number,
      format: object,
      fields: string,
    ) => ({
      repeatCell: {
        range: {
          sheetId: newSheetId,
          startRowIndex: startRow - 1,
          endRowIndex: endRow,
          startColumnIndex: startCol,
          endColumnIndex: endCol,
        },
        cell: { userEnteredFormat: format },
        fields,
      },
    });

    // Merges
    requests.push({
      mergeCells: {
        range: {
          sheetId: newSheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 6,
        },
        mergeType: 'MERGE_ALL',
      },
    });
    requests.push({
      mergeCells: {
        range: {
          sheetId: newSheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 0,
          endColumnIndex: 6,
        },
        mergeType: 'MERGE_ALL',
      },
    });
    // Section banners merged across full width
    for (const r of [localesHeaderRow, serviciosHeaderRow, convencionesHeaderRow]) {
      requests.push({
        mergeCells: {
          range: {
            sheetId: newSheetId,
            startRowIndex: r - 1,
            endRowIndex: r,
            startColumnIndex: 0,
            endColumnIndex: 6,
          },
          mergeType: 'MERGE_ALL',
        },
      });
    }

    // Title row format
    requests.push(
      fmtRange(1, 1, 0, 6, {
        backgroundColor: COLOR_HEADER_BG,
        textFormat: {
          foregroundColor: COLOR_HEADER_FG,
          fontSize: 18,
          bold: true,
          fontFamily: 'Georgia',
        },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE',
        padding: { top: 16, bottom: 16, left: 12, right: 12 },
      }, 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)'),
    );
    // Subtitle row
    requests.push(
      fmtRange(2, 2, 0, 6, {
        backgroundColor: COLOR_HEADER_BG,
        textFormat: {
          foregroundColor: { red: 0.78, green: 0.74, blue: 0.66 },
          fontSize: 11,
          italic: true,
        },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE',
        padding: { bottom: 14 },
      }, 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)'),
    );

    // Section banners format
    for (const r of [localesHeaderRow, serviciosHeaderRow, convencionesHeaderRow]) {
      requests.push(
        fmtRange(r, r, 0, 6, {
          backgroundColor: COLOR_SECTION_BG,
          textFormat: {
            foregroundColor: COLOR_SECTION_FG,
            fontSize: 12,
            bold: true,
          },
          horizontalAlignment: 'LEFT',
          verticalAlignment: 'MIDDLE',
          padding: { top: 8, bottom: 8, left: 12 },
        }, 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)'),
      );
    }

    // Table header rows (locales + servicios)
    for (const r of [localesTableHeaderRow, serviciosTableHeaderRow]) {
      requests.push(
        fmtRange(r, r, 0, 6, {
          backgroundColor: COLOR_TABLE_HEADER_BG,
          textFormat: {
            foregroundColor: COLOR_SECTION_FG,
            fontSize: 10,
            bold: true,
          },
          horizontalAlignment: 'LEFT',
          verticalAlignment: 'MIDDLE',
          padding: { top: 6, bottom: 6, left: 10 },
        }, 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)'),
      );
    }

    // Data rows base + zebra
    const dataRanges: Array<[number, number]> = [
      [localesFirstDataRow, localesLastDataRow],
      [serviciosFirstDataRow, serviciosLastDataRow],
      [convencionesFirstDataRow, convencionesLastDataRow],
    ];
    for (const [start, end] of dataRanges) {
      // base format
      requests.push(
        fmtRange(start, end, 0, 6, {
          textFormat: { fontSize: 10 },
          verticalAlignment: 'MIDDLE',
          padding: { top: 6, bottom: 6, left: 10, right: 10 },
        }, 'userEnteredFormat(textFormat,verticalAlignment,padding)'),
      );
      // zebra rows (even rows in the data range get tinted)
      for (let r = start; r <= end; r++) {
        if ((r - start) % 2 === 1) {
          requests.push(
            fmtRange(r, r, 0, 6, {
              backgroundColor: COLOR_ROW_ALT,
            }, 'userEnteredFormat.backgroundColor'),
          );
        }
      }
    }

    // Border under table headers (dorado fino)
    for (const r of [localesTableHeaderRow, serviciosTableHeaderRow]) {
      requests.push({
        updateBorders: {
          range: {
            sheetId: newSheetId,
            startRowIndex: r - 1,
            endRowIndex: r,
            startColumnIndex: 0,
            endColumnIndex: 6,
          },
          bottom: {
            style: 'SOLID',
            width: 1,
            color: COLOR_BORDER,
          },
        },
      });
    }

    // Column widths — A más ancho (servicio/local), B-D medianas, E narrow, F amplia
    const colWidths = [220, 110, 200, 110, 280, 40];
    colWidths.forEach((w, i) => {
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId: newSheetId,
            dimension: 'COLUMNS',
            startIndex: i,
            endIndex: i + 1,
          },
          properties: { pixelSize: w },
          fields: 'pixelSize',
        },
      });
    });

    // Row heights — title más alto
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: newSheetId,
          dimension: 'ROWS',
          startIndex: 0,
          endIndex: 1,
        },
        properties: { pixelSize: 56 },
        fields: 'pixelSize',
      },
    });
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: newSheetId,
          dimension: 'ROWS',
          startIndex: 1,
          endIndex: 2,
        },
        properties: { pixelSize: 28 },
        fields: 'pixelSize',
      },
    });

    // Hide gridlines (tipo "portada") — la gridProperties.hideGridlines
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId: newSheetId,
          gridProperties: { hideGridlines: true, frozenRowCount: 2 },
        },
        fields: 'gridProperties.hideGridlines,gridProperties.frozenRowCount',
      },
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests },
    });

    console.log(`[SERVICIOS/SEED-INDICE] ${user.email} regeneró ÍNDICE`);
    return NextResponse.json({
      ok: true,
      message: 'Tab ÍNDICE creado/regenerado',
      locales: LOCALES.length,
      servicios: SERVICIOS.length,
    });
  } catch (err) {
    if (err instanceof ServiciosError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status },
      );
    }
    console.error('[SERVICIOS/SEED-INDICE]', err);
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
});
