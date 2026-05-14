/**
 * MIGRACIÓN v2 — Lharmonie Servicios Sheet
 *
 * Cambios vs v1:
 *   - LH5: saco fila duplicada "Telecom" (solo quedan Telecom/Flow Wifi y Flow Wifi)
 *   - LH5: Flow Wifi monto 91331 → 75860 (corregido contra MAYO 26)
 *   - Nueva ancla BAMBINA con 5 servicios (Telecom/Flow Wifi, Aysa, ABL, Edenor, Expensas)
 *   - CRONKLAM: agregar RUBRICA, VEP CS 09, VEP IVA 18
 *   - Nuevo tab CTA CTE BAIGUN con schema 13 cols
 *
 * Funciones:
 *   - migrarSheet()        → renombra LISTADO actual a backup, crea LISTADO nuevo con datos v2
 *   - crearTabCtaCteBaigun() → crea tab CTA CTE BAIGUN con schema + dropdowns
 *   - migrarTodo()         → corre las 2 funciones en orden
 */

const SHEET_ID = '1u6zH3X5MB1EyMQJ59YEkGFhbuQwzv7TsZbz2XZKZ_kM';

const TAB_PORTADA = 'PORTADA';
const TAB_LISTADO = 'LISTADO';
const TAB_INDICE_VIEJO = 'ÍNDICE';
const TAB_CTA_CTE_BAIGUN = 'CTA CTE BAIGUN';

const HEADERS = [
  'Servicio','Tipo','Ancla','Local Display','Día Vencimiento','Frecuencia',
  'Método Pago','Monto Estimado ARS','Monto Estimado USD','Moneda Default',
  'Titular Nombre','Titular CUIT','Cuenta Número','CBU/CVU/Alias',
  'Subarrendado Baigun','Baigun %','Activo','Notas',
];

const LOCAL_DISPLAY = {
  LH1: 'Lharmonie Seguí (LH1)',
  LH2: 'Lharmonie Nicaragua (LH2)',
  LH3: 'Casa Lharmonie (LH3)',
  LH4: 'Lharmonie Zabala (LH4)',
  LH5: 'Lharmonie Libertador (LH5)',
  LH6: 'Lharmonie Núñez (LH6)',
  BAMBINA: 'Bambina (personal)',
  CRONKLAM: 'Cronklam (empresa)',
  MyP: 'Martín y Melanie (personal)',
};

function fila(servicio, tipo, ancla, diaVenc, frecuencia, metodo, montoArs, montoUsd, monedaDefault, opts) {
  opts = opts || {};
  const baigun = !!opts.baigun;
  const baigunPct = baigun ? (opts.baigunPct || 50) : '';
  return [
    servicio, tipo, ancla,
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
    baigun, baigunPct,
    opts.activo === false ? false : true,
    opts.notas || '',
  ];
}

function getDataRows() {
  return [
    // LH1 — Seguí
    fila('Edenor','luz','LH1',4,'mensual','debito_automatico',31665,null,'ARS'),
    fila('Aysa','agua','LH1',29,'mensual','transferencia',40950,null,'ARS'),
    fila('Flow','internet','LH1',7,'mensual','debito_automatico',22423,null,'ARS'),
    fila('Alquiler','alquiler','LH1',6,'mensual','efectivo',1200000,null,'ARS'),
    fila('Alquiler Transferencia','alquiler','LH1',5,'mensual','transferencia',1105000,null,'ARS'),
    fila('ABL','impositivo','LH1',5,'mensual','transferencia',14213,null,'ARS'),
    fila('Expensas','expensas','LH1',10,'mensual','transferencia',267750.02,null,'ARS'),

    // LH2 — Nicaragua
    fila('Edenor','luz','LH2',6,'mensual','debito_automatico',1827026,null,'ARS'),
    fila('Flow Wifi','internet','LH2',7,'mensual','debito_automatico',38335,null,'ARS'),
    fila('Alquiler','alquiler','LH2',5,'mensual','efectivo',1908000,null,'ARS'),
    fila('Bistrosoft','sistema','LH2',10,'mensual','transferencia',213807,null,'ARS'),

    // LH3 — Maure
    fila('Edenor','luz','LH3',5,'mensual','debito_automatico',944475,null,'ARS'),
    fila('Aysa','agua','LH3',14,'mensual','transferencia',34612,null,'ARS'),
    fila('Metrogas','gas','LH3',2,'mensual','transferencia',4984,null,'ARS'),
    fila('Flow 1','internet','LH3',7,'mensual','debito_automatico',30597,null,'ARS'),
    fila('Flow 2','internet','LH3',7,'mensual','debito_automatico',30597,null,'ARS'),
    fila('Alquiler','alquiler','LH3',6,'mensual','efectivo',null,1400,'USD'),
    fila('ABL','impositivo','LH3',12,'mensual','transferencia',139576,null,'ARS'),
    fila('Bistrosoft','sistema','LH3',10,'mensual','transferencia',284598,null,'ARS'),

    // LH4 — Zabala
    fila('Edenor','luz','LH4',5,'mensual','transferencia',805009,null,'ARS'),
    fila('Aysa','agua','LH4',5,'mensual','transferencia',111419,null,'ARS'),
    fila('Flow Wifi','internet','LH4',7,'mensual','debito_automatico',21860,null,'ARS'),
    fila('Alquiler','alquiler','LH4',6,'mensual','efectivo',null,800,'USD'),
    fila('ABL','impositivo','LH4',7,'mensual','transferencia',98719,null,'ARS'),
    fila('Bistrosoft','sistema','LH4',10,'mensual','transferencia',238309,null,'ARS'),

    // LH5 — Libertador (subarriendo Baigun) — Telecom duplicado FUERA, Flow Wifi corregido
    fila('Edenor','luz','LH5',8,'mensual','debito_automatico',1548709,null,'ARS',{baigun:true,baigunPct:50}),
    fila('Aysa','agua','LH5',13,'mensual','transferencia',120771,null,'ARS',{baigun:true,baigunPct:50}),
    fila('Telecom/Flow Wifi','internet','LH5',7,'mensual','debito_automatico',91331,null,'ARS'),
    fila('Flow Wifi','internet','LH5',7,'mensual','debito_automatico',75860,null,'ARS'),
    fila('IVA Alquiler','iva','LH5',5,'mensual','transferencia',1051050,null,'ARS',{baigun:true,baigunPct:50}),
    fila('Alquiler Libertador','alquiler','LH5',5,'mensual','transferencia',null,7465,'USD',{baigun:true,baigunPct:50}),
    fila('ABL','impositivo','LH5',5,'mensual','transferencia',140288,null,'ARS'),
    fila('Expensas','expensas','LH5',12,'mensual','transferencia',682399.02,null,'ARS',{baigun:true,baigunPct:50}),
    fila('Bistrosoft','sistema','LH5',10,'mensual','transferencia',458832,null,'ARS'),

    // LH6 — Núñez
    fila('Alquiler (B)','alquiler','LH6',5,'mensual','efectivo',2250000,null,'ARS'),
    fila('Alquiler (Transf)','alquiler','LH6',5,'mensual','transferencia',2722500,null,'ARS'),

    // BAMBINA — propiedad personal nueva ancla
    fila('Telecom/Flow Wifi','internet','BAMBINA',25,'mensual','debito_automatico',37575.21,null,'ARS'),
    fila('Aysa','agua','BAMBINA',14,'mensual','transferencia',null,null,'ARS',{notas:'TODAVIA NO en MAYO 26 — saldo a favor histórico'}),
    fila('ABL','impositivo','BAMBINA',12,'mensual','transferencia',null,null,'ARS',{notas:'TODAVIA NO en MAYO 26 — saldo a favor histórico'}),
    fila('Edenor','luz','BAMBINA',6,'mensual','debito_automatico',23107,null,'ARS'),
    fila('Expensas','expensas','BAMBINA',10,'mensual','transferencia',112495,null,'ARS'),

    // CRONKLAM (empresa) — agregadas RUBRICA, VEP CS, VEP IVA
    fila('Libros IVA digital','iva','CRONKLAM',8,'mensual','transferencia',null,null,'ARS'),
    fila('IVA mensual AFIP','iva','CRONKLAM',18,'mensual','transferencia',10000000,null,'ARS'),
    fila('Monotributo Martín','iva','CRONKLAM',20,'mensual','transferencia',null,null,'ARS',{titularNombre:'Martín Masri'}),
    fila('IIBB Ingresos Brutos CABA','impositivo','CRONKLAM',16,'mensual','transferencia',null,null,'ARS'),
    fila('F.931 Cargas Sociales','impositivo','CRONKLAM',9,'mensual','transferencia',null,null,'ARS'),
    fila('AJDUT','otro','CRONKLAM',10,'mensual','transferencia',null,null,'ARS'),
    fila('Contadoras','otro','CRONKLAM',10,'mensual','transferencia',null,null,'ARS'),
    fila('SOMO','otro','CRONKLAM',10,'mensual','transferencia',750000,null,'ARS'),
    fila('Aporte sindical UTHGRA','impositivo','CRONKLAM',15,'mensual','transferencia',null,null,'ARS'),
    fila('RUBRICA','otro','CRONKLAM',10,'mensual','transferencia',null,null,'ARS'),
    fila('VEP CS 09','impositivo','CRONKLAM',9,'mensual','transferencia',null,null,'ARS',{notas:'Cargas sociales vencimiento día 9'}),
    fila('VEP IVA 18','iva','CRONKLAM',18,'mensual','transferencia',null,null,'ARS',{notas:'IVA vencimiento día 18'}),

    // MyP — Personal Martín y Melanie
    fila('Yeshurun (Meir + Comedor)','otro','MyP',10,'mensual','transferencia',1066952,null,'ARS'),
  ];
}

function migrarTodo() {
  migrarSheet();
  crearTabCtaCteBaigun();
}

function migrarSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const portadaExistente = ss.getSheetByName(TAB_PORTADA);
  if (portadaExistente) portadaExistente.setName(uniqueBackupName(ss, 'PORTADA_BACKUP_' + fecha));

  const indiceViejo = ss.getSheetByName(TAB_INDICE_VIEJO);
  if (indiceViejo) indiceViejo.setName(uniqueBackupName(ss, 'ÍNDICE_BACKUP_' + fecha));

  const portada = ss.insertSheet(TAB_PORTADA, 0);
  portada.setTabColor('#8B7355');
  poblarPortada(portada);

  const listadoExistente = ss.getSheetByName(TAB_LISTADO);
  if (listadoExistente) listadoExistente.setName(uniqueBackupName(ss, 'LISTADO_BACKUP_' + fecha));

  const listado = ss.insertSheet(TAB_LISTADO, 1);
  listado.setTabColor('#C4A067');
  poblarListado(listado);

  SpreadsheetApp.getActive().toast('Migración OK · PORTADA + LISTADO listos.', '✓', 6);
  Logger.log('Migración completada: PORTADA + LISTADO');
}

function uniqueBackupName(ss, base) {
  let name = base, n = 2;
  while (ss.getSheetByName(name)) { name = base + '_' + n; n++; }
  return name;
}

function poblarPortada(sh) {
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
    ['CTA CTE BAIGUN', 'cuenta corriente del subarriendo Libertador. Cargos auto-derivados de tabs mensuales + pagos manuales de Iara.'],
    ['MAYO 26, ABRIL 26, …', 'tabs mensuales. 1 fila por servicio × 1 col por local. Registran el pago efectivo de cada mes.'],
    ['BAIGUN_BACKUP_xxx, LISTADO_BACKUP_xxx', 'backups automáticos de runs previos.'],
    [''],
    ['─── COLUMNAS DEL LISTADO ───'],
    [''],
    ['A · Servicio', 'nombre del servicio. Ej "Edenor", "Flow Wifi", "Alquiler Libertador".'],
    ['B · Tipo', 'dropdown: luz, agua, gas, internet, telefono, alquiler, iva, expensas, sistema, impositivo, otro.'],
    ['C · Ancla', 'dropdown: LH1..LH6, BAMBINA (personal), CRONKLAM (empresa), MyP (personal Martín y Melanie).'],
    ['D · Local Display', 'texto humano. Ej "Lharmonie Seguí (LH1)".'],
    ['E · Día Vencimiento', 'número 1-31.'],
    ['F · Frecuencia', 'mensual, bimestral, trimestral, anual, unico.'],
    ['G · Método Pago', 'efectivo, transferencia, debito_automatico, tarjeta.'],
    ['H · Monto Estimado ARS', 'número en pesos.'],
    ['I · Monto Estimado USD', 'para servicios en dólares.'],
    ['J · Moneda Default', 'ARS o USD.'],
    ['K · Titular Nombre', 'razón social.'],
    ['L · Titular CUIT', 'solo dígitos.'],
    ['M · Cuenta Número', '# de cliente del servicio.'],
    ['N · CBU/CVU/Alias', 'para transferir.'],
    ['O · Subarrendado Baigun', 'checkbox. TRUE si va al cta cte de Baigun.'],
    ['P · Baigun %', 'porcentaje al cta cte (típicamente 50). Vacío si no aplica.'],
    ['Q · Activo', 'checkbox. FALSE = no se sugiere al crear mes nuevo.'],
    ['R · Notas', 'texto libre.'],
    [''],
    ['─── COLUMNAS DEL TAB CTA CTE BAIGUN ───'],
    [''],
    ['A · id', 'UUID único del movimiento.'],
    ['B · fecha', 'DD/MM/YYYY. Fecha contable.'],
    ['C · mes_origen', 'YYYY-MM. Solo para cargos auto. Vacío en pagos.'],
    ['D · tipo', 'cargo / pago / ajuste.'],
    ['E · concepto', 'descripción humana. Ej "Edenor · MAYO 26 · 50%".'],
    ['F · servicio_ref', 'nombre del servicio del LISTADO. Solo para cargos auto.'],
    ['G · monto', 'positivo siempre. El signo lo da el tipo.'],
    ['H · saldo_despues', 'saldo acumulado después del mov. Lo calcula la app.'],
    ['I · metodo', 'transferencia / efectivo / compensacion / auto / otro.'],
    ['J · notas', 'texto libre.'],
    ['K · fuente', 'auto (derivado del pivot mensual) / manual (cargado por Iara).'],
    ['L · cargado_por', 'email del user o "sistema" si fue auto.'],
    ['M · created_at', 'ISO timestamp.'],
    [''],
    ['─── CÓMO EDITAR ───'],
    [''],
    ['Desde el Sheet', 'abrís LISTADO o CTA CTE BAIGUN y editás celdas. La app refleja al toque (cache 60s).'],
    ['Desde la app', 'Servicios → tab Listado → tap servicio → modal con 18 campos. /baigun → Resumen / Histórico / Calendario.'],
    [''],
    ['─── REGLAS ───'],
    [''],
    ['• NO tocar estructura de los tabs mensuales (MAYO 26, etc).'],
    ['• Para crear mes nuevo: dashboard → Servicios → "+ Mes nuevo".'],
    ['• Pivot mensual: "NO"=no aplica · "TODAVIA NO"=pendiente · número=pagado/estimado.'],
    ['• En LISTADO si subarrendadoBaigun=TRUE completar % (típicamente 50).'],
    ['• Convención "marcar pagado": la app escribe MONTO exacto al Sheet, no "OK".'],
    [''],
    ['─── ÚLTIMA ACTUALIZACIÓN ───'],
    [''],
    ['Migración v2 corrida el ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') + '.'],
    ['Cambios v2: LH5 sin Telecom duplicado, Flow Wifi LH5=75860, ancla BAMBINA con 5 servicios, CRONKLAM con RUBRICA/VEP CS/VEP IVA, tab CTA CTE BAIGUN nuevo.'],
  ];

  sh.getRange(1, 1, ROWS.length, 2).setValues(ROWS.map(function(r){return r.length===1?[r[0],'']:r;}));

  sh.setColumnWidth(1, 220);
  sh.setColumnWidth(2, 780);
  sh.setRowHeight(1, 56);

  const title = sh.getRange(1,1,1,2);
  title.merge();
  title.setFontFamily('Georgia').setFontSize(22).setFontWeight('bold')
       .setFontColor('#2C1F18').setHorizontalAlignment('left')
       .setVerticalAlignment('middle').setBackground('#FAF6EF');

  for (let i = 0; i < ROWS.length; i++) {
    const row = ROWS[i];
    const txt = String(row[0]||'');
    if (txt.startsWith('───') && txt.endsWith('───')) {
      const r = sh.getRange(i+1,1,1,2);
      r.merge();
      r.setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#2C1F18')
       .setHorizontalAlignment('left').setVerticalAlignment('middle');
      sh.setRowHeight(i+1, 32);
    } else if (txt.match(/^[A-R] · /)) {
      sh.getRange(i+1,1).setFontWeight('bold').setFontColor('#C4A067');
      sh.getRange(i+1,2).setWrap(true);
    } else if (row[1] && txt.match(/^[A-Z]/) && txt.length < 30) {
      sh.getRange(i+1,1).setFontWeight('bold');
      sh.getRange(i+1,2).setWrap(true);
    } else if (row.length === 1 || !row[1]) {
      const r = sh.getRange(i+1,1,1,2);
      r.merge();
      r.setWrap(true).setFontColor('#3D2F26');
    }
  }

  sh.setHiddenGridlines(true);
  sh.getRange('A:B').setVerticalAlignment('top');
  sh.setFrozenRows(1);
}

function poblarListado(sh) {
  const rows = getDataRows();
  const nCols = HEADERS.length;
  const nRows = rows.length;

  sh.getRange(1, 1, 1, nCols).setValues([HEADERS]);
  sh.getRange(2, 1, nRows, nCols).setValues(rows);

  const hr = sh.getRange(1, 1, 1, nCols);
  hr.setBackground('#2C1F18').setFontColor('#FFFFFF').setFontWeight('bold')
    .setFontSize(11).setHorizontalAlignment('left').setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 36);

  try {
    sh.getRange(2, 1, nRows, nCols)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  } catch(e) {}

  const widths = [200,110,90,220,120,110,150,140,140,100,180,140,140,180,140,90,80,280];
  widths.forEach(function(w,i){ sh.setColumnWidth(i+1, w); });

  const dataEndRow = Math.max(1 + nRows, 80);
  const dropdown = function(colIdx, list) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(list, true).setAllowInvalid(true).build();
    sh.getRange(2, colIdx, dataEndRow-1, 1).setDataValidation(rule);
  };
  dropdown(2, ['luz','agua','gas','internet','telefono','alquiler','iva','expensas','sistema','impositivo','otro']);
  dropdown(3, ['LH1','LH2','LH3','LH4','LH5','LH6','BAMBINA','CRONKLAM','MyP']);
  dropdown(6, ['mensual','bimestral','trimestral','anual','unico']);
  dropdown(7, ['efectivo','transferencia','debito_automatico','tarjeta']);
  dropdown(10, ['ARS','USD']);

  const checkboxRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  sh.getRange(2, 15, dataEndRow-1, 1).setDataValidation(checkboxRule);
  sh.getRange(2, 17, dataEndRow-1, 1).setDataValidation(checkboxRule);

  sh.getRange(2, 8, dataEndRow-1, 2).setNumberFormat('#,##0.00');
  sh.getRange(2, 16, dataEndRow-1, 1).setNumberFormat('0.0"%"');
  sh.getRange(2, 5, dataEndRow-1, 1).setNumberFormat('0');
  sh.getRange(2, 12, dataEndRow-1, 2).setNumberFormat('@');
}

function crearTabCtaCteBaigun() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const existente = ss.getSheetByName(TAB_CTA_CTE_BAIGUN);
  if (existente) {
    existente.setName(uniqueBackupName(ss, 'BAIGUN_BACKUP_' + fecha));
  }

  const sh = ss.insertSheet(TAB_CTA_CTE_BAIGUN, 2);
  sh.setTabColor('#A02C2C');

  const headers = [
    'id','fecha','mes_origen','tipo','concepto','servicio_ref','monto',
    'saldo_despues','metodo','notas','fuente','cargado_por','created_at'
  ];
  const nCols = headers.length;

  sh.getRange(1, 1, 1, nCols).setValues([headers]);

  const hr = sh.getRange(1, 1, 1, nCols);
  hr.setBackground('#2C1F18').setFontColor('#FFFFFF').setFontWeight('bold')
    .setFontSize(11).setHorizontalAlignment('left').setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 36);

  const widths = [160, 100, 100, 90, 280, 180, 130, 130, 130, 280, 90, 200, 160];
  widths.forEach(function(w, i){ sh.setColumnWidth(i+1, w); });

  const dataEndRow = 500;
  const dropdown = function(colIdx, list) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(list, true).setAllowInvalid(true).build();
    sh.getRange(2, colIdx, dataEndRow-1, 1).setDataValidation(rule);
  };
  dropdown(4, ['cargo','pago','ajuste']);
  dropdown(9, ['transferencia','efectivo','compensacion','auto','otro']);
  dropdown(11, ['auto','manual']);

  sh.getRange(2, 2, dataEndRow-1, 1).setNumberFormat('dd/MM/yyyy');
  sh.getRange(2, 7, dataEndRow-1, 2).setNumberFormat('#,##0.00');
  sh.getRange(2, 13, dataEndRow-1, 1).setNumberFormat('yyyy-MM-dd HH:mm:ss');

  try {
    sh.getRange(2, 1, dataEndRow-1, nCols)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  } catch(e) {}

  sh.setHiddenGridlines(false);

  SpreadsheetApp.getActive().toast('Tab CTA CTE BAIGUN creado · 13 cols con dropdowns.', '✓', 6);
  Logger.log('CTA CTE BAIGUN listo');
}
