import { NextResponse } from 'next/server';
import { withAuth, AuthError } from '@/lib/auth-guard';
import { isOwner } from '@/lib/users';
import { getSheetsClient, ServiciosError } from '@/lib/servicios-server';
import {
  INDICE_TAB,
  INDICE_HEADERS,
  INDICE_LAST_COL,
  INDICE_TIPOS,
  INDICE_METODO_PAGO,
  INDICE_FRECUENCIA,
  INDICE_MONEDA,
  inferirTipo,
  localDisplayDefault,
  defaultSubarrendadoBaigun,
  indiceObjectToRow,
  type IndiceTipo,
} from '@/lib/indice';
import {
  parseMesPivot,
  parsePeriodoTab,
  type ServicioMesRow,
} from '@/lib/servicios-mes';
import { ANCLAS, type Ancla } from '@/lib/anclas';

export const dynamic = 'force-dynamic';

const SHEET_ID = process.env.SERVICIOS_SHEET_ID || '';

// Colores del header (espresso oscuro de Lharmonie)
const COLOR_HEADER_BG = rgb(0x2c, 0x1f, 0x18); // #2C1F18
const COLOR_HEADER_FG = rgb(0xff, 0xff, 0xff); // white bold
const COLOR_BAND_ALT = rgb(0xfa, 0xf6, 0xef); // cream sutil
const COLOR_INACTIVE_FG = rgb(0x8b, 0x80, 0x73); // gris (para activo=false)

function rgb(r: number, g: number, b: number) {
  return { red: r / 255, green: g / 255, blue: b / 255 };
}

interface SeedRow {
  servicio: string;
  tipo: IndiceTipo;
  ancla: Ancla;
  /** monto del último mes (no se escribe al ÍNDICE pero útil para
   *  futuras decisiones — hoy se ignora). */
  ultimoMonto?: number;
}

// POST /api/servicios/seed-indice
// Owner-only. Crea (o regenera) el tab ÍNDICE como catálogo canónico
// con schema flat de 11 columnas. SI YA EXISTE un tab ÍNDICE, lo
// renombra a ÍNDICE_BACKUP_<fecha> antes de crear el nuevo — así se
// preservan ediciones manuales para que Martín pueda copiarlas a mano
// al nuevo si quiere.
//
// El catálogo se popula automático leyendo el tab mensual más reciente
// (MAYO 26, ABRIL 26, etc): por cada (servicio, ancla) que tenga data
// (monto > 0 o "TODAVIA NO"), genera una fila del catálogo.
//
// Aplica formato:
//   - Row 1 = header espresso oscuro #2C1F18, texto blanco bold, frozen
//   - Rows 2+ = data con banded rows crema
//   - Data validation (dropdowns) en Tipo, Ancla, Método Pago,
//     Frecuencia, Activo, Subarrendado Baigun
//
// Idempotente: si el ÍNDICE ya está en formato nuevo (header
// "Servicio" en A1), no hace nada y devuelve un mensaje claro. Para
// forzar regenerar, pasar { forzar: true } en el body.
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

  let body: { forzar?: boolean } = {};
  try {
    body = (await req.json()) as { forzar?: boolean };
  } catch {
    body = {};
  }
  const forzar = body.forzar === true;

  try {
    // 1) Buscar tabs existentes.
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      fields: 'sheets.properties(sheetId,title,index)',
    });
    const allSheets = meta.data.sheets || [];
    const existingIndice = allSheets.find(
      (s) => s.properties?.title === INDICE_TAB,
    );

    // 2) Si existe en formato NUEVO y no forzar, no hacer nada.
    if (existingIndice && !forzar) {
      try {
        const probe = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: `'${INDICE_TAB}'!A1:${INDICE_LAST_COL}1`,
        });
        const a1 = (probe.data.values?.[0]?.[0] || '').trim();
        if (a1 === 'Servicio') {
          return NextResponse.json({
            ok: true,
            message:
              'El tab ÍNDICE ya tiene el formato canónico nuevo. Para regenerar destructivamente, mandá { forzar: true }.',
            skipped: true,
          });
        }
      } catch {
        // Si no se puede leer, seguimos al regenerate.
      }
    }

    // 3) Si existe (formato viejo o forzar), renombrar a backup.
    if (existingIndice?.properties?.sheetId !== undefined) {
      const fecha = new Date().toISOString().slice(0, 10);
      const backupName = `ÍNDICE_BACKUP_${fecha}`;
      // Asegurar que el nombre del backup no choca con uno previo.
      let finalBackupName = backupName;
      let n = 2;
      while (
        allSheets.some((s) => s.properties?.title === finalBackupName)
      ) {
        finalBackupName = `${backupName}_${n}`;
        n++;
      }
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId: existingIndice.properties.sheetId,
                  title: finalBackupName,
                },
                fields: 'title',
              },
            },
          ],
        },
      });
    }

    // 4) Popular: leer el tab mensual más reciente para deducir el
    //    catálogo inicial.
    const tabs = allSheets
      .map((s) => s.properties?.title || '')
      .filter(Boolean);
    const mesesParseados = tabs
      .map((t) => parsePeriodoTab(t))
      .filter((p): p is NonNullable<ReturnType<typeof parsePeriodoTab>> => p !== null)
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
    const ultimoMes = mesesParseados[0];

    const seedRows: SeedRow[] = [];
    const orphans: string[] = [];
    if (ultimoMes) {
      try {
        const mesRes = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: `'${ultimoMes.tab}'!A1:Z60`,
        });
        const parsed = parseMesPivot(
          mesRes.data.values || [],
          ultimoMes.periodo,
          ultimoMes.tab,
          ultimoMes.label,
        );
        // Combinar filas de los 3 grupos
        const allRows: ServicioMesRow[] = [
          ...parsed.filasLocales,
          ...parsed.filasCronklam,
          ...parsed.filasMyP,
        ];
        for (const row of allRows) {
          if (row.esTotal) continue;
          if (!row.servicioRaw) continue;
          // Por cada ancla con data, crear un entry
          const anclasConData = Object.entries(row.porAncla).filter(
            ([, c]) =>
              c &&
              (c.estado === 'pagado' || c.estado === 'pendiente'),
          );
          if (anclasConData.length === 0) {
            // Servicio sin data en ninguna ancla — lo registramos
            // como huérfano para reporte, pero NO lo sumamos (no
            // sabemos qué ancla asignarle).
            orphans.push(row.servicioRaw);
            continue;
          }
          for (const [anclaStr, cell] of anclasConData) {
            const ancla = anclaStr as Ancla;
            if (!ANCLAS.includes(ancla)) continue;
            const tipo = inferirTipo(row.servicioRaw);
            seedRows.push({
              servicio: row.servicioRaw,
              tipo,
              ancla,
              ultimoMonto: cell.monto,
            });
          }
        }
      } catch (err) {
        // Si falla la lectura del mes, seguimos con seed vacío.
        console.warn('[seed-indice] No se pudo leer mes mas reciente:', err);
      }
    }

    // Dedup (servicio, ancla)
    const seen = new Set<string>();
    const seedUnique = seedRows.filter((r) => {
      const k = `${r.servicio.toUpperCase()}|${r.ancla}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Orden: por tipo (alquiler primero, después servicios públicos,
    // después impositivos/IVA, después otros), luego servicio, luego
    // ancla LH1...LH6 CRONKLAM MyP.
    const tipoOrder: Record<IndiceTipo, number> = {
      alquiler: 0,
      luz: 1,
      agua: 2,
      gas: 3,
      internet: 4,
      telefono: 5,
      expensas: 6,
      iva: 7,
      impositivo: 8,
      sistema: 9,
      otro: 10,
    };
    const anclaOrder: Record<Ancla, number> = {
      LH1: 0,
      LH2: 1,
      LH3: 2,
      LH4: 3,
      LH5: 4,
      LH6: 5,
      CRONKLAM: 6,
      BAMBINA: 7,
      MyP: 8,
    };
    seedUnique.sort((a, b) => {
      const t = tipoOrder[a.tipo] - tipoOrder[b.tipo];
      if (t !== 0) return t;
      const s = a.servicio.localeCompare(b.servicio, 'es');
      if (s !== 0) return s;
      return anclaOrder[a.ancla] - anclaOrder[b.ancla];
    });

    // 5) Crear tab nuevo al principio (index 0) — primera vista
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: INDICE_TAB,
                index: 0,
                gridProperties: {
                  rowCount: Math.max(60, seedUnique.length + 20),
                  columnCount: INDICE_HEADERS.length,
                  frozenRowCount: 1,
                },
                tabColor: rgb(0xc4, 0xa0, 0x67),
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

    // 6) Escribir header + data en una sola call.
    const values: string[][] = [];
    values.push([...INDICE_HEADERS]);
    for (const s of seedUnique) {
      const baigun = defaultSubarrendadoBaigun(s.ancla, s.tipo);
      values.push(
        indiceObjectToRow({
          servicio: s.servicio,
          tipo: s.tipo,
          ancla: s.ancla,
          localDisplay: localDisplayDefault(s.ancla),
          diaVencimiento: null,
          frecuencia: 'mensual',
          metodoPago: '',
          montoEstimadoArs: null,
          montoEstimadoUsd: null,
          monedaDefault: 'ARS',
          titularNombre: '',
          titularCuit: '',
          cuentaNumero: '',
          cbu: '',
          subarrendadoBaigun: baigun,
          baigunPct: baigun ? 50 : null,
          activo: true,
          notas: '',
        }),
      );
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${INDICE_TAB}'!A1:${INDICE_LAST_COL}${values.length}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });

    // 7) Formato: header bg, banded rows, dropdowns, anchos cols.
    const dataEndRow = Math.max(seedUnique.length + 1, 50);
    const requests: object[] = [];

    // Header row: bg + texto blanco bold + frozen
    requests.push({
      repeatCell: {
        range: {
          sheetId: newSheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: INDICE_HEADERS.length,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: COLOR_HEADER_BG,
            textFormat: {
              foregroundColor: COLOR_HEADER_FG,
              fontSize: 11,
              bold: true,
            },
            horizontalAlignment: 'LEFT',
            verticalAlignment: 'MIDDLE',
            padding: { top: 8, bottom: 8, left: 10, right: 10 },
          },
        },
        fields:
          'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)',
      },
    });

    // Banded rows en data (zebra crema)
    requests.push({
      addBanding: {
        bandedRange: {
          range: {
            sheetId: newSheetId,
            startRowIndex: 1,
            endRowIndex: dataEndRow,
            startColumnIndex: 0,
            endColumnIndex: INDICE_HEADERS.length,
          },
          rowProperties: {
            headerColor: COLOR_HEADER_BG,
            headerColorStyle: { rgbColor: COLOR_HEADER_BG },
            firstBandColor: rgb(0xff, 0xff, 0xff),
            firstBandColorStyle: { rgbColor: rgb(0xff, 0xff, 0xff) },
            secondBandColor: COLOR_BAND_ALT,
            secondBandColorStyle: { rgbColor: COLOR_BAND_ALT },
          },
        },
      },
    });

    // Data validations (dropdowns)
    // Col B: Tipo
    requests.push({
      setDataValidation: {
        range: {
          sheetId: newSheetId,
          startRowIndex: 1,
          endRowIndex: dataEndRow,
          startColumnIndex: 1,
          endColumnIndex: 2,
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: INDICE_TIPOS.map((v) => ({ userEnteredValue: v })),
          },
          strict: false,
          showCustomUi: true,
        },
      },
    });
    // Col C: Ancla
    requests.push({
      setDataValidation: {
        range: {
          sheetId: newSheetId,
          startRowIndex: 1,
          endRowIndex: dataEndRow,
          startColumnIndex: 2,
          endColumnIndex: 3,
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: ANCLAS.map((v) => ({ userEnteredValue: v })),
          },
          strict: false,
          showCustomUi: true,
        },
      },
    });
    // Col F: Frecuencia (índice 5)
    requests.push({
      setDataValidation: {
        range: {
          sheetId: newSheetId,
          startRowIndex: 1,
          endRowIndex: dataEndRow,
          startColumnIndex: 5,
          endColumnIndex: 6,
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: INDICE_FRECUENCIA.map((v) => ({ userEnteredValue: v })),
          },
          strict: false,
          showCustomUi: true,
        },
      },
    });
    // Col G: Método Pago (índice 6)
    requests.push({
      setDataValidation: {
        range: {
          sheetId: newSheetId,
          startRowIndex: 1,
          endRowIndex: dataEndRow,
          startColumnIndex: 6,
          endColumnIndex: 7,
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: INDICE_METODO_PAGO.map((v) => ({ userEnteredValue: v })),
          },
          strict: false,
          showCustomUi: true,
        },
      },
    });
    // Col J: Moneda Default (índice 9)
    requests.push({
      setDataValidation: {
        range: {
          sheetId: newSheetId,
          startRowIndex: 1,
          endRowIndex: dataEndRow,
          startColumnIndex: 9,
          endColumnIndex: 10,
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: INDICE_MONEDA.map((v) => ({ userEnteredValue: v })),
          },
          strict: false,
          showCustomUi: true,
        },
      },
    });
    // Col O: Subarrendado Baigun (índice 14), Col Q: Activo (índice 16)
    for (const colIdx of [14, 16]) {
      requests.push({
        setDataValidation: {
          range: {
            sheetId: newSheetId,
            startRowIndex: 1,
            endRowIndex: dataEndRow,
            startColumnIndex: colIdx,
            endColumnIndex: colIdx + 1,
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'TRUE' },
                { userEnteredValue: 'FALSE' },
              ],
            },
            strict: false,
            showCustomUi: true,
          },
        },
      });
    }

    // Anchos de columna (18 cols)
    const colWidths = [200, 110, 90, 220, 120, 110, 150, 140, 140, 100, 180, 140, 140, 180, 140, 90, 80, 280];
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

    // Altura del header
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: newSheetId,
          dimension: 'ROWS',
          startIndex: 0,
          endIndex: 1,
        },
        properties: { pixelSize: 36 },
        fields: 'pixelSize',
      },
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests },
    });

    console.log(
      `[SERVICIOS/SEED-INDICE] ${user.email} regeneró ÍNDICE con ${seedUnique.length} entries (mes base: ${ultimoMes?.tab || 'ninguno'})`,
    );
    return NextResponse.json({
      ok: true,
      message: 'Tab ÍNDICE regenerado',
      mesBase: ultimoMes?.tab || null,
      entriesCreadas: seedUnique.length,
      huerfanosDetectados: orphans,
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
