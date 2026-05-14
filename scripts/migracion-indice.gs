/**
 * MIGRACIÓN — Lharmonie Servicios Sheet (one-shot)
 *
 * Reorganiza el Sheet de SERVICIOS dejando:
 *   - **PORTADA**  → docs de cómo funciona todo (qué tab hace qué, cómo
 *     editar, reglas). Reemplaza al "ÍNDICE" viejo (lo renombra primero
 *     a backup, después crea PORTADA limpia con docs nuevas).
 *   - **LISTADO**  → catálogo canónico de servicios. 1 fila por
 *     (servicio × ancla), 18 columnas. Lo consume la app y se puede
 *     editar acá directo (reciprocal).
 *
 * NO TOCA:
 *   - Ningún tab mensual (MAYO 26, ABRIL 26, JUNIO, etc).
 *   - No borra el ÍNDICE viejo: lo renombra a `ÍNDICE_BACKUP_<fecha>`.
 *
 * Cómo correrlo:
 *   1) Abrí el Sheet SERVICIOS
 *      (https://docs.google.com/spreadsheets/d/1u6zH3X5MB1EyMQJ59YEkGFhbuQwzv7TsZbz2XZKZ_kM/)
 *   2) Extensiones → Apps Script.
 *   3) Pegá TODO este archivo en `Code.gs` (reemplazá lo que haya).
 *   4) Guardá (💾) y corré la función `migrarSheet` (botón ▶).
 *   5) La primera vez te pide autorización con tu cuenta — aceptá.
 *   6) Al final vas a ver un toast "Migración OK".
 *
 * Es idempotente: si ya hay LISTADO o PORTADA, los renombra a backup
 * antes de crear los nuevos. Podés correrlo varias veces sin miedo.
 */

const SHEET_ID = '1u6zH3X5MB1EyMQJ59YEkGFhbuQwzv7TsZbz2XZKZ_kM';

const TAB_PORTADA = 'PORTADA';
const TAB_LISTADO = 'LISTADO';
const TAB_INDICE_VIEJO = 'ÍNDICE'; // el que renombramos a backup la primera vez

const HEADERS = [
  'Servicio',              // A
  'Tipo',                  // B
  'Ancla',                 // C
  'Local Display',         // D
  'Día Vencimiento',       // E
  'Frecuencia',            // F
  'Método Pago',           // G
  'Monto Estimado ARS',    // H
  'Monto Estimado USD',    // I
  'Moneda Default',        // J
  'Titular Nombre',        // K
  'Titular CUIT',          // L
  'Cuenta Número',         // M
  'CBU/CVU/Alias',         // N
  'Subarrendado Baigun',   // O
  'Baigun %',              // P
  'Activo',                // Q
  'Notas',                 // R
];

const LOCAL_DISPLAY = {
  LH1: 'Lharmonie Seguí (LH1)',
  LH2: 'Lharmonie Nicaragua (LH2)',
  LH3: 'Casa Lharmonie (LH3)',
  LH4: 'Lharmonie Zabala (LH4)',
  LH5: 'Lharmonie Libertador (LH5)',
  LH6: 'Lharmonie Núñez (LH6)',
  CRONKLAM: 'Cronklam (empresa)',
  MyP: 'Martín y Melanie (personal)',
};

// ─── Helper para armar 1 fila del LISTADO ──────────────────────────
function fila(servicio, tipo, ancla, diaVenc, frecuencia, metodo, montoArs, montoUsd, monedaDefault, opts) {
  opts = opts || {};
  const baigun = !!opts.baigun;
  const baigunPct = baigun ? (opts.baigunPct || 50) : '';
  return [
    servicio,
    tipo,
    ancla,
    LOCAL_DISPLAY[ancla] || ancla,
    diaVenc || '',
    frecuencia || 'mensual',
    metodo || '',
    montoArs === null || montoArs === undefined ? '' : montoArs,
    montoUsd === null || montoUsd === undefined ? '' : montoUsd,
    monedaDefault || 'ARS',
    opts.titularNombre || '',
    opts.titularCuit || '',
    opts.cuentaNumero || '',
    opts.cbu || '',
    baigun,
    baigunPct,
    opts.activo === false ? false : true,
    opts.notas || '',
  ];
}

// ─── 47 servicios del catálogo ─────────────────────────────────────
// Cruzados entre las 9 screenshots de la staff app + el tab MAYO 26
// del Sheet. Día de vencimiento y método de pago vienen de los screens
// (cargados a mano por Martín). Los montos vienen del tab MAYO 26 que
// es el último pago real. Donde había conflicto, prioricé screenshots.
function getDataRows() {
  return [
    // ─── LH1 — Lharmonie Seguí ───────────────────────────────────
    fila('Edenor',                   'luz',        'LH1', 4,  'mensual', 'debito_automatico', 31665,     null, 'ARS'),
    fila('Aysa',                     'agua',       'LH1', 29, 'mensual', 'transferencia',     40950,     null, 'ARS'),
    fila('Flow',                     'internet',   'LH1', 7,  'mensual', 'debito_automatico', 22423,     null, 'ARS'),
    fila('Alquiler',                 'alquiler',   'LH1', 6,  'mensual', 'efectivo',          1200000,   null, 'ARS'),
    fila('Alquiler Transferencia',   'alquiler',   'LH1', 5,  'mensual', 'transferencia',     1105000,   null, 'ARS'),
    fila('ABL',                      'impositivo', 'LH1', 5,  'mensual', 'transferencia',     14213,     null, 'ARS'),
    fila('Expensas',                 'expensas',   'LH1', 10, 'mensual', 'transferencia',     267750.02, null, 'ARS'),

    // ─── LH2 — Lharmonie Nicaragua ───────────────────────────────
    fila('Edenor',                   'luz',        'LH2', 6,  'mensual', 'debito_automatico', 1827026,   null, 'ARS'),
    fila('Flow Wifi',                'internet',   'LH2', 7,  'mensual', 'debito_automatico', 38335,     null, 'ARS'),
    fila('Alquiler',                 'alquiler',   'LH2', 5,  'mensual', 'efectivo',          1908000,   null, 'ARS'),
    fila('Bistrosoft',               'sistema',    'LH2', 10, 'mensual', 'transferencia',     213807,    null, 'ARS'),

    // ─── LH3 — Casa Lharmonie (Maure) ────────────────────────────
    fila('Edenor',                   'luz',        'LH3', 5,  'mensual', 'debito_automatico', 944475,    null, 'ARS'),
    fila('Aysa',                     'agua',       'LH3', 14, 'mensual', 'transferencia',     34612,     null, 'ARS'),
    fila('Metrogas',                 'gas',        'LH3', 2,  'mensual', 'transferencia',     4984,      null, 'ARS'),
    fila('Flow 1',                   'internet',   'LH3', 7,  'mensual', 'debito_automatico', 30597,     null, 'ARS'),
    fila('Flow 2',                   'internet',   'LH3', 7,  'mensual', 'debito_automatico', 30597,     null, 'ARS'),
    fila('Alquiler',                 'alquiler',   'LH3', 6,  'mensual', 'efectivo',          null,      1400, 'USD'),
    fila('ABL',                      'impositivo', 'LH3', 12, 'mensual', 'transferencia',     139576,    null, 'ARS'),
    fila('Bistrosoft',               'sistema',    'LH3', 10, 'mensual', 'transferencia',     284598,    null, 'ARS'),

    // ─── LH4 — Lharmonie Zabala ──────────────────────────────────
    fila('Edenor',                   'luz',        'LH4', 5,  'mensual', 'transferencia',     805009,    null, 'ARS'),
    fila('Aysa',                     'agua',       'LH4', 5,  'mensual', 'transferencia',     111419,    null, 'ARS'),
    fila('Flow Wifi',                'internet',   'LH4', 7,  'mensual', 'debito_automatico', 21860,     null, 'ARS'),
    fila('Alquiler',                 'alquiler',   'LH4', 6,  'mensual', 'efectivo',          null,      800,  'USD'),
    fila('ABL',                      'impositivo', 'LH4', 7,  'mensual', 'transferencia',     98719,     null, 'ARS'),
    fila('Bistrosoft',               'sistema',    'LH4', 10, 'mensual', 'transferencia',     238309,    null, 'ARS'),

    // ─── LH5 — Lharmonie Libertador (subarriendo Baigun) ─────────
    fila('Edenor',                   'luz',        'LH5', 8,  'mensual', 'debito_automatico', 1548709,   null, 'ARS', { baigun: true,  baigunPct: 50 }),
    fila('Aysa',                     'agua',       'LH5', 13, 'mensual', 'transferencia',     120771,    null, 'ARS', { baigun: true,  baigunPct: 50 }),
    fila('Telecom/Flow Wifi',        'internet',   'LH5', 7,  'mensual', 'debito_automatico', 91331,     null, 'ARS'),
    fila('Flow Wifi',                'internet',   'LH5', 7,  'mensual', 'debito_automatico', 91331,     null, 'ARS'),
    fila('Telecom',                  'internet',   'LH5', 7,  'mensual', 'transferencia',     91331,     null, 'ARS'),
    fila('IVA Alquiler',             'iva',        'LH5', 5,  'mensual', 'transferencia',     1051050,   null, 'ARS', { baigun: true,  baigunPct: 50 }),
    fila('Alquiler Libertador',      'alquiler',   'LH5', 5,  'mensual', 'transferencia',     null,      7465, 'USD', { baigun: true,  baigunPct: 50 }),
    fila('ABL',                      'impositivo', 'LH5', 5,  'mensual', 'transferencia',     140288,    null, 'ARS'),
    fila('Expensas',                 'expensas',   'LH5', 12, 'mensual', 'transferencia',     682399.02, null, 'ARS', { baigun: true,  baigunPct: 50 }),
    fila('Bistrosoft',               'sistema',    'LH5', 10, 'mensual', 'transferencia',     458832,    null, 'ARS'),

    // ─── LH6 — Lharmonie Núñez ───────────────────────────────────
    fila('Alquiler (B)',             'alquiler',   'LH6', 5,  'mensual', 'efectivo',          2250000,   null, 'ARS'),
    fila('Alquiler (Transf)',        'alquiler',   'LH6', 5,  'mensual', 'transferencia',     2722500,   null, 'ARS'),

    // ─── CRONKLAM (empresa) ──────────────────────────────────────
    fila('Libros IVA digital',       'iva',        'CRONKLAM', 8,  'mensual', 'transferencia', null,     null, 'ARS'),
    fila('IVA mensual AFIP',         'iva',        'CRONKLAM', 18, 'mensual', 'transferencia', 10000000, null, 'ARS'),
    fila('Monotributo Martín',       'iva',        'CRONKLAM', 20, 'mensual', 'transferencia', null,     null, 'ARS', { titularNombre: 'Martín Masri' }),
    fila('IIBB Ingresos Brutos CABA','impositivo', 'CRONKLAM', 16, 'mensual', 'transferencia', null,     null, 'ARS'),
    fila('F.931 Cargas Sociales',    'impositivo', 'CRONKLAM', 9,  'mensual', 'transferencia', null,     null, 'ARS'),
    fila('AJDUT',                    'otro',       'CRONKLAM', 10, 'mensual', 'transferencia', null,     null, 'ARS'),
    fila('Contadoras',               'otro',       'CRONKLAM', 10, 'mensual', 'transferencia', null,     null, 'ARS'),
    fila('SOMO',                     'otro',       'CRONKLAM', 10, 'mensual', 'transferencia', 750000,   null, 'ARS'),
    fila('Aporte sindical UTHGRA',   'impositivo', 'CRONKLAM', 15, 'mensual', 'transferencia', null,     null, 'ARS'),

    // ─── MyP — Martín y Melanie (personal) ───────────────────────
    fila('Yeshurun (Meir + Comedor)','otro',       'MyP',     10, 'mensual', 'transferencia',  1066952,  null, 'ARS'),
  ];
}

// ────────────────────────────────────────────────────────────────────
//  Main
// ────────────────────────────────────────────────────────────────────
function migrarSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  // ── 1) PORTADA — renombrar ÍNDICE viejo si existe, después crear ───
  // Si ya existe una PORTADA de un run anterior, la mandamos a backup.
  const portadaExistente = ss.getSheetByName(TAB_PORTADA);
  if (portadaExistente) {
    portadaExistente.setName(uniqueBackupName(ss, 'PORTADA_BACKUP_' + fecha));
  }
  // Renombramos el ÍNDICE viejo (con sus 3 tablas markdown) a backup
  // — la PORTADA nueva se construye de cero, así queda limpia.
  const indiceViejo = ss.getSheetByName(TAB_INDICE_VIEJO);
  if (indiceViejo) {
    indiceViejo.setName(uniqueBackupName(ss, 'ÍNDICE_BACKUP_' + fecha));
  }
  const portada = ss.insertSheet(TAB_PORTADA, 0);
  portada.setTabColor('#8B7355');
  poblarPortada(portada);

  // ── 2) LISTADO — crear con catálogo 18 cols ──────────────────────
  const listadoExistente = ss.getSheetByName(TAB_LISTADO);
  if (listadoExistente) {
    listadoExistente.setName(uniqueBackupName(ss, 'LISTADO_BACKUP_' + fecha));
  }
  const listado = ss.insertSheet(TAB_LISTADO, 1);
  listado.setTabColor('#C4A067');
  poblarListado(listado);

  SpreadsheetApp.getActive().toast('Migración OK · PORTADA + LISTADO listos.', '✓', 6);
  Logger.log('Migración completada: PORTADA + LISTADO');
}

function uniqueBackupName(ss, base) {
  let name = base;
  let n = 2;
  while (ss.getSheetByName(name)) {
    name = base + '_' + n;
    n++;
  }
  return name;
}

// ────────────────────────────────────────────────────────────────────
//  PORTADA — contenido de documentación
// ────────────────────────────────────────────────────────────────────
function poblarPortada(sh) {
  // Bloques de docs: title, sub, list
  const ROWS = [
    ['Lharmonie · Sheet de Servicios'],
    [''],
    ['Fuente única de verdad para los servicios recurrentes (luz, agua, gas, internet, alquileres, IVA, impositivos, expensas, sistema, etc).'],
    ['Lo consume el dashboard (lharmonie-dashboard.vercel.app/servicios) y se puede editar desde acá directo. Los cambios son recíprocos.'],
    [''],
    ['─── TABS DE ESTE SHEET ───'],
    [''],
    ['PORTADA', 'esta hoja. Documentación.'],
    ['LISTADO', 'catálogo canónico. 1 fila por (servicio × ancla). 18 cols con tipo, día venc, método, montos, titular, CUIT, etc.'],
    ['MAYO 26, ABRIL 26, …', 'tabs mensuales. 1 fila por servicio × 1 col por local. Registran el pago efectivo de cada mes.'],
    ['ÍNDICE_BACKUP_xxx', 'backups automáticos del ÍNDICE viejo. Se pueden borrar cuando el LISTADO esté OK.'],
    ['LISTADO_BACKUP_xxx', 'backups del LISTADO previo (si corriste la migración más de una vez).'],
    [''],
    ['─── COLUMNAS DEL LISTADO ───'],
    [''],
    ['A · Servicio',           'nombre del servicio. Ej "Edenor", "Flow Wifi", "Alquiler Libertador".'],
    ['B · Tipo',               'categoría operativa. Dropdown: luz, agua, gas, internet, telefono, alquiler, iva, expensas, sistema, impositivo, otro.'],
    ['C · Ancla',              'local físico o entidad. Dropdown: LH1..LH6, CRONKLAM (empresa), MyP (personal Martín y Melanie).'],
    ['D · Local Display',      'texto humano del local. Ej "Lharmonie Seguí (LH1)".'],
    ['E · Día Vencimiento',    'número 1-31. Día del mes en que vence el pago.'],
    ['F · Frecuencia',         'dropdown: mensual, bimestral, trimestral, anual, unico.'],
    ['G · Método Pago',        'dropdown: efectivo, transferencia, debito_automatico, tarjeta.'],
    ['H · Monto Estimado ARS', 'número en pesos, sin $. Sirve como sugerido para nuevos meses.'],
    ['I · Monto Estimado USD', 'para servicios en dólares (alquileres LH3/LH4/LH5).'],
    ['J · Moneda Default',     'ARS o USD. Indica cuál de los dos montos es el canónico.'],
    ['K · Titular Nombre',     'razón social que factura. Ej "Lharmonie SRL", "Martín Masri".'],
    ['L · Titular CUIT',       'CUIT/CUIL del titular, solo dígitos.'],
    ['M · Cuenta Número',      '# de cliente del servicio (Edenor, Aysa, etc).'],
    ['N · CBU/CVU/Alias',      'para transferir o débito automático.'],
    ['O · Subarrendado Baigun','checkbox. TRUE si el costo se reparte con el subarriendo de Libertador (LH5).'],
    ['P · Baigun %',           'porcentaje al cta cte de Baigun (típicamente 50). Vacío si no aplica.'],
    ['Q · Activo',             'checkbox. FALSE = el servicio no se sugiere al crear un mes nuevo.'],
    ['R · Notas',              'texto libre. Lo que no entre en las otras cols.'],
    [''],
    ['─── CÓMO EDITAR ───'],
    [''],
    ['Desde el Sheet', 'abrís LISTADO, editás celdas. Los dropdowns y checkboxes validan los valores. La app refleja los cambios al toque (cache 60s).'],
    ['Desde la app',   'Servicios → tab "Listado" → tap en un servicio → modal con los 18 campos → Guardar. Escribe directo al Sheet.'],
    [''],
    ['─── REGLAS ───'],
    [''],
    ['• NO tocar la estructura de los tabs mensuales (MAYO 26, etc). La app los lee con el formato que tienen — col SEGUI / MAURE / NICARAGUA / ZABALA / LIBERTADOR / NUÑEZ / CASA MEL Y MARTIN / BAMBINA / BAIGUN.'],
    ['• Para crear un mes nuevo: NO duplicar a mano. Usar dashboard → Servicios → botón "+ Mes nuevo". Lo arma copiando del último mes.'],
    ['• En el pivot mensual: "NO" = el local no tiene ese servicio. "TODAVIA NO" = pendiente este mes. Número = pagado o estimado.'],
    ['• En el LISTADO, si subarrendadoBaigun = TRUE, completar el % (típicamente 50 para LH5).'],
    ['• El catálogo se llama LISTADO (lo que ves en la app como "Catálogo" o "Listado"). El ÍNDICE viejo (3 tablas markdown) quedó como ÍNDICE_BACKUP_xxx.'],
    [''],
    ['─── ÚLTIMA ACTUALIZACIÓN ───'],
    [''],
    ['Migración corrida el ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') + ' por el Apps Script `scripts/migracion-indice.gs`.'],
    ['Si necesitás regenerar el LISTADO destructivamente, corré la misma función `migrarSheet` de nuevo — te hace backup de lo que haya.'],
  ];

  sh.getRange(1, 1, ROWS.length, 2).setValues(ROWS.map(function (r) {
    return r.length === 1 ? [r[0], ''] : r;
  }));

  // Estilos
  sh.setColumnWidth(1, 220);
  sh.setColumnWidth(2, 780);
  sh.setRowHeight(1, 56);

  // Title (row 1)
  const title = sh.getRange(1, 1, 1, 2);
  title.merge();
  title.setFontFamily('Georgia');
  title.setFontSize(22);
  title.setFontWeight('bold');
  title.setFontColor('#2C1F18');
  title.setHorizontalAlignment('left');
  title.setVerticalAlignment('middle');
  title.setBackground('#FAF6EF');

  // Section headers (rows que arrancan con ─── ... ───)
  for (let i = 0; i < ROWS.length; i++) {
    const row = ROWS[i];
    const txt = String(row[0] || '');
    if (txt.startsWith('───') && txt.endsWith('───')) {
      const r = sh.getRange(i + 1, 1, 1, 2);
      r.merge();
      r.setFontWeight('bold');
      r.setFontColor('#FFFFFF');
      r.setBackground('#2C1F18');
      r.setHorizontalAlignment('left');
      r.setVerticalAlignment('middle');
      sh.setRowHeight(i + 1, 32);
    } else if (txt.match(/^[A-R] · /)) {
      // Col definition lines: tag espresso en col A
      sh.getRange(i + 1, 1).setFontWeight('bold').setFontColor('#C4A067');
      sh.getRange(i + 1, 2).setWrap(true);
    } else if (row[1] && txt.match(/^[A-Z]/) && txt.length < 30) {
      // Tab names / labels en col A con valor en col B
      sh.getRange(i + 1, 1).setFontWeight('bold');
      sh.getRange(i + 1, 2).setWrap(true);
    } else if (row.length === 1 || !row[1]) {
      // Paragraph / merged cell
      const r = sh.getRange(i + 1, 1, 1, 2);
      r.merge();
      r.setWrap(true);
      r.setFontColor('#3D2F26');
    }
  }

  sh.setHiddenGridlines(true);
  sh.getRange('A:B').setVerticalAlignment('top');
  sh.setFrozenRows(1);
}

// ────────────────────────────────────────────────────────────────────
//  LISTADO — catálogo 18 cols × 47 servicios
// ────────────────────────────────────────────────────────────────────
function poblarListado(sh) {
  const rows = getDataRows();
  const nCols = HEADERS.length;
  const nRows = rows.length;

  // Header + data
  sh.getRange(1, 1, 1, nCols).setValues([HEADERS]);
  sh.getRange(2, 1, nRows, nCols).setValues(rows);

  // Header format
  const hr = sh.getRange(1, 1, 1, nCols);
  hr.setBackground('#2C1F18');
  hr.setFontColor('#FFFFFF');
  hr.setFontWeight('bold');
  hr.setFontSize(11);
  hr.setHorizontalAlignment('left');
  hr.setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 36);

  // Banded rows
  try {
    sh.getRange(2, 1, nRows, nCols)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  } catch (e) {
    // Si ya hay banding (no debería en tab nuevo) lo dejamos pasar.
  }

  // Column widths
  const widths = [200, 110, 90, 220, 120, 110, 150, 140, 140, 100, 180, 140, 140, 180, 140, 90, 80, 280];
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  // Data validations
  const dataEndRow = Math.max(1 + nRows, 60);
  const dropdown = function (colIdx, list) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(list, true)
      .setAllowInvalid(true)
      .build();
    sh.getRange(2, colIdx, dataEndRow - 1, 1).setDataValidation(rule);
  };
  dropdown(2,  ['luz','agua','gas','internet','telefono','alquiler','iva','expensas','sistema','impositivo','otro']);
  dropdown(3,  ['LH1','LH2','LH3','LH4','LH5','LH6','CRONKLAM','MyP']);
  dropdown(6,  ['mensual','bimestral','trimestral','anual','unico']);
  dropdown(7,  ['efectivo','transferencia','debito_automatico','tarjeta']);
  dropdown(10, ['ARS','USD']);

  // Checkboxes: Subarrendado Baigun (col 15) y Activo (col 17)
  const checkboxRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  sh.getRange(2, 15, dataEndRow - 1, 1).setDataValidation(checkboxRule);
  sh.getRange(2, 17, dataEndRow - 1, 1).setDataValidation(checkboxRule);

  // Formato numérico
  sh.getRange(2, 8, dataEndRow - 1, 2).setNumberFormat('#,##0.00');      // ARS, USD
  sh.getRange(2, 16, dataEndRow - 1, 1).setNumberFormat('0.0"%"');        // Baigun %
  sh.getRange(2, 5, dataEndRow - 1, 1).setNumberFormat('0');              // Día venc
  sh.getRange(2, 12, dataEndRow - 1, 2).setNumberFormat('@');             // CUIT, Cuenta Nº como texto
}
