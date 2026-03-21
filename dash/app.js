/* Lharmonie Dashboard v5 */

const CONFIG = {
  SHEET_ID:   '1lZER27XWpUIaRIeosoJjMhXaclj8MS-6thOeQ3O3a8o',
  API_KEY:    'AIzaSyCj1vL8svli0VUdZOPb7ADZkRBhCQBLe2o',
  TABS:       { facturas: 'Facturas', articulos: 'Artículos', proveedores: 'Proveedores' },
  WORKER_URL: 'https://worker-production-7f89.up.railway.app',
  API_SECRET: 'lharmonie2026',
};

const USERS = {
  martin:  { pass: '0706', name: 'Martín',  role: 'Administrador' },
  melanie: { pass: '2607', name: 'Melanie', role: 'Gestión' },
  iara:    { pass: '3611', name: 'Iara',    role: 'Gestión' },
};

const COL = {
  fecha:'Fecha FC', proveedor:'Proveedor', cuit:'CUIT', tipoDoc:'Tipo Doc',
  pv:'# PV', nroFac:'# Factura', categoria:'Categoría', local:'Local',
  cajero:'Cajero', importeNeto:'Importe Neto', iva21:'IVA 21%', iva105:'IVA 10.5%',
  total:'Total', medioPago:'Medio de Pago', estado:'Estado',
  fechaPago:'Fecha de Pago', obs:'Observaciones', procesado:'Procesado', imagen:'Imagen',
};

const state = {
  user: null,
  data: { facturas: [], proveedores: [], articulos: [], foodcost: [] },
  charts: {},
  modalFactura: null,
  _pendientesActuales: [],
  _pagadasActuales: [],
  _hoyActuales: [],
  _detalleFactura: null,
};

/* ---- SHARED HELPERS ---- */
let _facturaStore = {};
let _facturaId = 0;
function storeFactura(f) {
  const id = '_f' + (++_facturaId);
  _facturaStore[id] = f;
  return id;
}
function getStoredFactura(id) {
  return _facturaStore[id] || null;
}

function renderFacturaCard(f, idx, source, options = {}) {
  const pagado = esPagado(f);
  const bistro = esBistrosoft(f);
  const cardClass = bistro ? 'bistrosoft' : (pagado ? 'pagada' : 'pendiente');
  const fId = storeFactura(f);

  let estadoHTML;
  if (bistro) {
    estadoHTML = '<span class="factura-estado bistrosoft">🤖 Cargado por Bistrosoft</span>';
  } else if (pagado) {
    estadoHTML = '<span class="factura-estado pagada">✅ Pagada</span>';
  } else {
    estadoHTML = `<span class="factura-estado pendiente">⏳ ${esc(f[COL.medioPago] || f[COL.estado] || 'Pendiente')}</span>`;
  }

  const showPayBtn = options.showPayBtn && !pagado;
  const showUnpayBtn = options.showUnpayBtn && pagado;
  const metaExtra = options.metaExtra || '';

  return `<div class="factura-card ${cardClass}" onclick="abrirDetalle(getStoredFactura('${fId}'))">
    <div class="factura-main">
      <div class="factura-info">
        <div class="factura-proveedor">${esc(f[COL.proveedor] || '—')}</div>
        <div class="factura-meta">${esc('Nº ' + (f[COL.nroFac] || '—') + ' · ' + (f[COL.fecha] || '—'))}${metaExtra}</div>
      </div>
      <div class="factura-monto">${fmtMoney(parseNum(f[COL.total]))}</div>
    </div>
    <div class="factura-footer">
      ${estadoHTML}
      ${showPayBtn ? `<button class="btn-pagar" onclick="event.stopPropagation();abrirModal(${idx},'${source}')">Marcar pagada</button>` : ''}
      ${showUnpayBtn ? `<button class="btn-desmarcar" onclick="event.stopPropagation();desmarcarPagada(${idx})">↩ Desmarcar</button>` : ''}
    </div>
  </div>`;
}

function debounce(fn, ms) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

let aliasMap = {};
function getAlias(proveedor) {
  if (!proveedor) return '';
  const key = (proveedor || '').toUpperCase().trim();
  if (aliasMap[key]) return aliasMap[key];
  for (const [k, v] of Object.entries(aliasMap)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return '';
}

async function cargarAliases() {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/Proveedores?key=${CONFIG.API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const json = await res.json();
    const rows = json.values || [];
    rows.slice(2).forEach(row => {
      const r = (row[0] || '').trim();
      const a = (row[3] || '').trim();
      if (r && a) aliasMap[r.toUpperCase().trim()] = a;
    });
  } catch(e) {}
}

function doLogin() {
  const u = document.getElementById('loginUser').value.trim().toLowerCase();
  const p = document.getElementById('loginPass').value.trim();
  const err = document.getElementById('loginError');
  const user = USERS[u];
  if (user && user.pass === p) {
    state.user = { username: u, ...user };
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appShell').style.display = 'flex';
    document.getElementById('topbarUser').textContent = user.name;
    loadAll();
  } else {
    if (err) err.textContent = 'Usuario o contraseña incorrectos';
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') doLogin();
});

function showPage(name, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');
  if (el) el.classList.add('active');
  if (name === 'proveedores') renderChartsProveedores();
  if (name === 'articulos')   renderChartsArticulos();
  if (name === 'foodcost')    { if (!state.data.foodcost.length) loadFoodCost(); else renderFoodCost(); }
}

async function fetchTab(tab) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent(tab)}?key=${CONFIG.API_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).values || [];
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  let hi = 0;
  if (rows[0][0] && String(rows[0][0]).toUpperCase().includes('LHARMONIE')) hi = 1;
  const headers = rows[hi].map(h => String(h).trim());
  return rows.slice(hi + 1).map((row, rowIdx) => {
    const obj = { _sheetRow: hi + 2 + rowIdx };
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]).trim() : ''; });
    return obj;
  }).filter(r => Object.values(r).some(v => v !== '' && v !== undefined));
}

async function loadAll() {
  const btn = document.getElementById('btnRefresh');
  btn.classList.add('spinning');
  try {
    await cargarAliases();
    const [fRows, pRows, aRows] = await Promise.all([
      fetchTab(CONFIG.TABS.facturas),
      fetchTab(CONFIG.TABS.proveedores),
      fetchTab(CONFIG.TABS.articulos),
    ]);
    state.data.facturas    = rowsToObjects(fRows);
    state.data.proveedores = rowsToObjects(pRows);
    state.data.articulos   = rowsToObjects(aRows);
    renderAll();
    poblarFiltroMes();
    poblarFiltroLocal();
    showToast('Actualizado ✓');
  } catch (e) {
    showToast('Error al cargar datos');
  }
  btn.classList.remove('spinning');
}

function parseNum(v) {
  const n = parseFloat(String(v || 0).replace(/\$/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.\-]/g,''));
  return isNaN(n) ? 0 : n;
}
function fmtMoney(n) { return '$ ' + Math.round(n).toLocaleString('es-AR'); }
function esPagado(f) {
  const e = String(f[COL.estado] || '').toLowerCase();
  return e.includes('previamente') || e.includes('pagado') || e.includes('✅');
}
function esBistrosoft(f) {
  const e = String(f[COL.estado] || '').toLowerCase();
  const obs = String(f[COL.obs] || '').toLowerCase();
  const proc = String(f[COL.procesado] || '').toLowerCase();
  return e.includes('bistrosoft') || obs.includes('cargada por bistrosoft') || proc.includes('bistrosoft');
}
function esAPagar(f) {
  if (esPagado(f)) return false;
  const e = String(f[COL.estado] || '').toLowerCase();
  return e.includes('a pagar') || e.trim() === 'pagar' || e.includes('transferencia') || (e.includes('efectivo') && !e.includes('pagado')) || e.includes('bistrosoft');
}

function esc(s) {
  if (!s) return '';
  const el = document.createElement('span');
  el.textContent = String(s);
  return el.innerHTML;
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

function poblarFiltroLocal() {
  const locales = new Set();
  state.data.facturas.forEach(f => { if (f[COL.local]) locales.add(f[COL.local]); });
  const opciones = '<option value="">Todos los locales</option>' +
    [...locales].sort().map(l => `<option value="${l}">${l.replace('Lharmonie ', 'LH ')}</option>`).join('');
  document.querySelectorAll('.local-filtro').forEach(sel => {
    if (sel.id && sel.id.includes('Fecha')) return;
    sel.innerHTML = opciones;
  });
}

function _parseFecha(str) {
  if (!str) return null;
  const p = str.split('/');
  if (p.length < 3) return null;
  return new Date(parseInt(p[2].slice(0,4)), parseInt(p[1])-1, parseInt(p[0]));
}

function poblarFiltroFechas() {
  const pendientes = state.data.facturas.filter(esAPagar);
  const pagadas = state.data.facturas.filter(esPagado);
  function fechasUnicas(lista) {
    const fechas = new Set();
    lista.forEach(f => { if (f[COL.fecha]) fechas.add(f[COL.fecha].trim()); });
    return [...fechas].sort((a, b) => {
      const da = _parseFecha(a), db = _parseFecha(b);
      if (!da || !db) return 0;
      return db - da;
    });
  }
  const fechasPend = fechasUnicas(pendientes);
  const fechasPag = fechasUnicas(pagadas);
  const selPend = document.getElementById('apagarFechaFiltro');
  if (selPend) {
    selPend.innerHTML = '<option value="">Todas las fechas</option>' +
      fechasPend.map(f => '<option value="' + f + '">' + f + '</option>').join('');
  }
  const selPag = document.getElementById('historialFechaFiltro');
  if (selPag) {
    selPag.innerHTML = '<option value="">Todas las fechas</option>' +
      fechasPag.map(f => '<option value="' + f + '">' + f + '</option>').join('');
  }
}

function getLocalFiltro(id) {
  const sel = document.getElementById(id);
  return sel ? sel.value : '';
}

function getFechaFiltro(id) {
  const sel = document.getElementById(id);
  return sel ? sel.value : '';
}

function renderAll() {
  const facturas   = state.data.facturas;
  const pendientes = facturas.filter(esAPagar);
  const pagadas    = facturas.filter(esPagado);
  const totalPend  = pendientes.reduce((s, f) => s + parseNum(f[COL.total]), 0);

  const d = new Date();
  const ddmmyyyy = String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
  const ddmm     = String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
  const hoyFacts = facturas.filter(f => {
    const fp = f[COL.procesado] || '';
    const ff = f[COL.fecha]     || '';
    return fp.startsWith(ddmm) || ff === ddmmyyyy;
  });
  const totalHoy = hoyFacts.reduce((s,f) => s + parseNum(f[COL.total]), 0);

  document.getElementById('summaryTotal').textContent  = fmtMoney(totalPend);
  document.getElementById('summaryCount').textContent  = `${pendientes.length} factura${pendientes.length !== 1 ? 's' : ''} pendiente${pendientes.length !== 1 ? 's' : ''}`;
  document.getElementById('statPendCount').textContent = pendientes.length;
  document.getElementById('statHoyCount').textContent  = hoyFacts.length;
  document.getElementById('statHoyMonto').textContent  = hoyFacts.length ? fmtMoney(totalHoy) : 'ninguna hoy';

  const hoyTitle = document.getElementById('hoyTitle');
  const hoyList  = document.getElementById('hoyList');
  if (hoyFacts.length) {
    hoyTitle.style.display = '';
    hoyList.style.display  = '';
    const hoyOrdered = [...hoyFacts].reverse();
    state._hoyActuales = hoyOrdered;
    hoyList.innerHTML = hoyOrdered.map((f, i) =>
      renderFacturaCard(f, i, 'hoy', {
        showPayBtn: true,
        metaExtra: '<br>' + esc(f[COL.local] || '') + (f[COL.cajero] ? '<br>📋 ' + esc(f[COL.cajero]) : '')
      })
    ).join('');
  } else {
    hoyTitle.style.display = 'none';
    hoyList.style.display  = 'none';
  }

  const ultima = [...facturas].reverse()[0];
  if (ultima) {
    document.getElementById('ultimaCarga').innerHTML = `
      <div class="ultima-carga-dot"></div>
      <div><div class="ultima-carga-label">Última factura cargada</div>
      <div class="ultima-carga-value">${ultima[COL.proveedor] || '—'} · ${ultima[COL.fecha] || '—'}</div></div>`;
  }

  document.getElementById('navBadge').textContent = pendientes.length > 0 ? pendientes.length : '';
  renderAlertaDuplicados(detectarDuplicados(facturas));
  poblarFiltroFechas();
  renderProvDeudaList(pendientes);
  renderAPagar(pendientes);
  renderHistorial(pagadas);
  renderProveedoresTab();
  renderArticulosTab();
}

function renderProvDeudaList(pendientes) {
  const el = document.getElementById('provDeudaList');
  if (!pendientes.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🎉</div>Sin deuda pendiente</div>';
    return;
  }
  const mapa = {};
  pendientes.forEach(f => {
    const p = f[COL.proveedor] || '(sin nombre)';
    if (!mapa[p]) mapa[p] = { total: 0, count: 0 };
    mapa[p].total += parseNum(f[COL.total]);
    mapa[p].count++;
  });
  el.innerHTML = Object.entries(mapa).sort((a,b) => b[1].total - a[1].total).map(([prov, d]) => `
    <div class="prov-card">
      <div><div class="prov-name">${prov}</div><div class="prov-count">${d.count} factura${d.count !== 1 ? 's' : ''}</div></div>
      <div style="text-align:right">
        <div class="prov-monto">${fmtMoney(d.total)}</div>
        ${getAlias(prov) ? `<div style="font-size:10px;color:#6B5744;margin-top:1px;font-weight:500;">Alias: ${getAlias(prov)}</div>` : ''}
      </div>
    </div>`).join('');
}

function renderAPagar(pendientes) {
  const el = document.getElementById('apagarList');
  const title = document.getElementById('apagarTitle');
  if (!pendientes) pendientes = state.data.facturas.filter(esAPagar);
  const localFiltro = getLocalFiltro('apagarLocalFiltro');
  const fechaFiltro = getFechaFiltro('apagarFechaFiltro');
  let filtradas = localFiltro ? pendientes.filter(f => f[COL.local] === localFiltro) : pendientes;
  if (fechaFiltro) filtradas = filtradas.filter(f => (f[COL.fecha] || '').trim() === fechaFiltro);
  state._pendientesActuales = filtradas;

  const totalFiltrado = filtradas.reduce((s, f) => s + parseNum(f[COL.total]), 0);
  const subtitulo = fechaFiltro ? ' del ' + fechaFiltro : '';
  title.textContent = filtradas.length + ' factura' + (filtradas.length !== 1 ? 's' : '') + ' pendiente' + (filtradas.length !== 1 ? 's' : '') + subtitulo;

  if (!filtradas.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🎉</div>Todo al día' + (fechaFiltro ? ' para ' + fechaFiltro : '') + '</div>';
    return;
  }

  const resumenDia = '<div class="semana-card" style="background:linear-gradient(135deg,#FFF3E0 0%,#FFE8CC 100%);border-color:rgba(122,61,0,0.15);">' +
    '<div class="semana-label" style="color:#7A3D00;">Total a pagar' + subtitulo + '</div>' +
    '<div class="semana-monto" style="color:#7A3D00;">' + fmtMoney(totalFiltrado) + '</div>' +
    '<div class="semana-sub" style="color:#7A3D00;">' + filtradas.length + ' factura' + (filtradas.length !== 1 ? 's' : '') + '</div>' +
    '</div>';

  el.innerHTML = resumenDia + filtradas.map(function(f, i) {
    return renderFacturaCard(f, i, 'apagar', {
      showPayBtn: true,
      metaExtra: '<br>' + esc(f[COL.local] || '') + (f[COL.categoria] ? ' · ' + esc(f[COL.categoria]) : '')
    });
  }).join('');
}

function renderHistorial(pagadas) {
  const el = document.getElementById('historialList');
  if (!pagadas) pagadas = state.data.facturas.filter(esPagado);
  const localFiltro = getLocalFiltro('historialLocalFiltro');
  const fechaFiltro = getFechaFiltro('historialFechaFiltro');
  const q = (document.getElementById('historialSearch') || {}).value || '';
  let filtradas = [...pagadas].reverse();
  if (localFiltro) filtradas = filtradas.filter(f => f[COL.local] === localFiltro);
  if (fechaFiltro) filtradas = filtradas.filter(f => (f[COL.fecha] || '').trim() === fechaFiltro);
  if (q) filtradas = filtradas.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q.toLowerCase())));

  const hoy = new Date();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  lunes.setHours(0,0,0,0);
  const estaSemana = pagadas.filter(f => {
    const fp = f[COL.procesado] || f[COL.fechaPago] || '';
    const partes = fp.split('/');
    if (partes.length < 3) return false;
    const d2 = new Date(partes[2].slice(0,4), partes[1]-1, partes[0]);
    return d2 >= lunes;
  });
  const totalSemana = estaSemana.reduce((s,f) => s + parseNum(f[COL.total]), 0);
  const totalFiltrado = filtradas.reduce((s,f) => s + parseNum(f[COL.total]), 0);
  let resumenHTML = '';
  if (fechaFiltro) {
    resumenHTML = '<div class="semana-card">' +
      '<div class="semana-label">Pagado el ' + fechaFiltro + '</div>' +
      '<div class="semana-monto">' + fmtMoney(totalFiltrado) + '</div>' +
      '<div class="semana-sub">' + filtradas.length + ' factura' + (filtradas.length !== 1 ? 's' : '') + '</div>' +
      '</div>';
  } else if (estaSemana.length > 0) {
    resumenHTML = '<div class="semana-card">' +
      '<div class="semana-label">Pagado esta semana</div>' +
      '<div class="semana-monto">' + fmtMoney(totalSemana) + '</div>' +
      '<div class="semana-sub">' + estaSemana.length + ' factura' + (estaSemana.length !== 1 ? 's' : '') + '</div>' +
      '</div>';
  }

  state._pagadasActuales = filtradas.slice(0, 60);
  el.innerHTML = resumenHTML + filtradas.slice(0, 60).map((f, i) => {
    const fId = storeFactura(f);
    return `<div class="historial-card" onclick="abrirDetalle(getStoredFactura('${fId}'))">
      <div class="historial-info">
        <div class="historial-prov">${esc(f[COL.proveedor] || '—')}</div>
        <div class="historial-meta">Nº ${esc(f[COL.nroFac] || '—')} · ${esc(f[COL.fecha] || '—')} · ${esc(f[COL.local] || '—')}</div>
        <button class="btn-desmarcar" onclick="event.stopPropagation();desmarcarPagada(${i})">↩ Desmarcar</button>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div class="historial-monto">${fmtMoney(parseNum(f[COL.total]))}</div>
        ${getAlias(f[COL.proveedor]) ? `<div style="font-size:10px;color:#6B5744;margin-top:1px;font-weight:500;">Alias: ${esc(getAlias(f[COL.proveedor]))}</div>` : ''}
        ${(f[COL.imagen] || f['Imagen']) ? `<div style="margin-top:4px;font-size:11px;color:var(--brown-light);font-weight:500;">🖼 foto</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

/* ---- DETALLE FACTURA ---- */
function abrirDetalle(f) {
  if (!f) return;
  if (typeof f === 'string') {
    try { f = JSON.parse(f.replace(/&quot;/g, '"')); } catch(e) { return; }
  }
  state._detalleFactura = f;
  const pagado = esPagado(f);
  const alias = getAlias(f[COL.proveedor]);
  const imgLink = f[COL.imagen] || f['Imagen'] || '';

  const detalles = [
    ['Local',         f[COL.local]       || ''],
    ['Categoría',     f[COL.categoria]   || ''],
    ['Tipo doc',      f[COL.tipoDoc]     || ''],
    ['Medio de pago', f[COL.medioPago]   || f[COL.estado] || ''],
    ['IVA 21%',       f[COL.iva21]       ? fmtMoney(parseNum(f[COL.iva21])) : ''],
    ['IVA 10.5%',     f[COL.iva105]      ? fmtMoney(parseNum(f[COL.iva105])) : ''],
    ['Importe neto',  f[COL.importeNeto] ? fmtMoney(parseNum(f[COL.importeNeto])) : ''],
    ['Cargada por',   f[COL.cajero]      || ''],
    ['Fecha pago',    f[COL.fechaPago]   || ''],
  ].filter(([, v]) => v);

  document.getElementById('detalleProveedor').textContent = f[COL.proveedor] || '—';
  document.getElementById('detalleNro').textContent = `Nº ${f[COL.nroFac] || '—'} · ${f[COL.fecha] || '—'}`;
  document.getElementById('detalleMonto').textContent = fmtMoney(parseNum(f[COL.total]));
  const bistro = esBistrosoft(f);
  document.getElementById('detalleEstado').innerHTML = bistro
    ? '<span class="factura-estado bistrosoft" style="display:inline-flex;">🤖 Bistrosoft</span>'
    : `<span class="factura-estado ${pagado ? 'pagada' : 'pendiente'}" style="display:inline-flex;">${pagado ? '✅ Pagada' : '⏳ Pendiente'}</span>`;

  // Buscar ítems en Artículos por nro de comprobante
  const nroFac = f[COL.nroFac] || '';
  const provFac = (f[COL.proveedor] || '').toLowerCase();
  const keys = state.data.articulos.length ? Object.keys(state.data.articulos[0]) : [];
  const kNombre   = keys.find(k => /art.culo|articulo|nombre/i.test(k)) || keys[0];
  const kComp     = keys.find(k => /comprobante/i.test(k));
  const kProv     = keys.find(k => /proveedor/i.test(k));
  const kPrecio   = keys.find(k => /precio|unit/i.test(k));
  const kUnidad   = keys.find(k => /unidad/i.test(k));
  const kCantidad = keys.find(k => /cantidad|cant/i.test(k));

  let itemsFactura = [];
  if (nroFac && kComp) {
    itemsFactura = state.data.articulos.filter(a => {
      const comp = (a[kComp] || '').toLowerCase();
      const prov = (a[kProv] || '').toLowerCase();
      return comp.includes(nroFac.toLowerCase()) || (prov.includes(provFac.slice(0,6)) && comp.includes(nroFac.slice(-4)));
    });
  }

  const itemsHTML = itemsFactura.length > 0 ? `
    <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px;">
      <div style="font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;font-weight:500;">Artículos</div>
      ${itemsFactura.map(a => {
        const nombre   = a[kNombre] || '—';
        const precio   = kPrecio   && a[kPrecio]   ? parseNum(a[kPrecio])   : 0;
        const unidad   = kUnidad   && a[kUnidad]   ? a[kUnidad]   : '';
        const cantidad = kCantidad && a[kCantidad] ? a[kCantidad] : '';
        const cantStr  = cantidad ? `${cantidad}${unidad ? ' ' + unidad : ''}` : (unidad || '');
        return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);gap:8px;align-items:center;">
          <div>
            <div style="font-size:12px;color:var(--muted);">${nombre}</div>
            ${cantStr ? `<div style="font-size:11px;color:var(--muted);opacity:0.7;">${cantStr}</div>` : ''}
          </div>
          ${precio > 0 ? `<span style="font-size:12px;font-weight:500;color:var(--muted);white-space:nowrap;flex-shrink:0;">${fmtMoney(precio)}</span>` : ''}
        </div>`;
      }).join('')}
    </div>` : '';

  document.getElementById('detalleRows').innerHTML =
    detalles.map(([k, v]) => `<div class="modal-row"><span>${k}</span><span>${v}</span></div>`).join('') +
    (alias ? `<div class="modal-row"><span>Alias CBU</span><span style="font-family:monospace;font-size:12px;word-break:break-all;">${alias}</span></div>` : '') +
    itemsHTML;

  const imgEl = document.getElementById('detalleImagen');
  if (imgLink) {
    imgEl.innerHTML = `
      <a href="${imgLink}" target="_blank" style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--cream);border-radius:12px;text-decoration:none;border:1px solid var(--border);margin-top:14px;">
        <div style="width:48px;height:48px;background:#E8DDD0;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">🖼</div>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;color:#1A0F08;">Ver comprobante</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">Abrir imagen original</div>
        </div>
        <div style="color:var(--muted);font-size:18px;">›</div>
      </a>`;
  } else {
    imgEl.innerHTML = '';
  }

  const btnEl = document.getElementById('detalleBtnAccion');
  if (!pagado) {
    btnEl.style.display = '';
    btnEl.textContent = '✓ Marcar como pagada';
    btnEl.onclick = () => { cerrarDetalle(); state.modalFactura = f; confirmarPagoDirecto(); };
  } else {
    btnEl.style.display = 'none';
  }

  document.getElementById('detalleOverlay').classList.add('open');
}

function cerrarDetalle(e) {
  if (e && e.target !== document.getElementById('detalleOverlay')) return;
  document.getElementById('detalleOverlay').classList.remove('open');
  state._detalleFactura = null;
}

async function confirmarPagoDirecto() {
  const f = state.modalFactura;
  if (!f) return;
  const fechaPago  = new Date().toLocaleDateString('es-AR');
  const filaExacta = f._sheetRow || null;
  try {
    const res = await fetch(`${CONFIG.WORKER_URL}/update-estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-secret': CONFIG.API_SECRET },
      body: JSON.stringify({ nroFactura: f[COL.nroFac]||'', proveedor: f[COL.proveedor]||'', fechaPago, fecha: f[COL.fecha]||'', filaExacta }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { showToast('✅ Factura marcada como pagada'); await loadAll(); return; }
    showToast('❌ Error al guardar: ' + (data.message || res.status));
    console.error('update-estado error:', res.status, data);
    return;
  } catch (err) {
    showToast('❌ No se pudo conectar con el servidor');
    console.error('update-estado fetch error:', err);
    return;
  }
}

/* ---- MODAL CLÁSICO ---- */
function abrirModal(idx, fuente) {
  let f;
  if (fuente === 'hoy') f = (state._hoyActuales || [])[idx];
  else                  f = (state._pendientesActuales || [])[idx];
  if (!f) return;
  state.modalFactura = f;
  document.getElementById('modalProveedor').textContent = f[COL.proveedor] || '—';
  document.getElementById('modalNro').textContent = `Factura Nº ${f[COL.nroFac] || '—'} · ${f[COL.fecha] || '—'}`;
  document.getElementById('modalMonto').textContent = fmtMoney(parseNum(f[COL.total]));
  const alias = getAlias(f[COL.proveedor]);
  const imgLink = f[COL.imagen] || f['Imagen'] || '';
  const detalles = [
    ['Local',         f[COL.local]       || ''],
    ['Categoría',     f[COL.categoria]   || ''],
    ['Medio de pago', f[COL.medioPago]   || f[COL.estado] || ''],
    ['IVA 21%',       f[COL.iva21]       ? fmtMoney(parseNum(f[COL.iva21])) : ''],
    ['Importe neto',  f[COL.importeNeto] ? fmtMoney(parseNum(f[COL.importeNeto])) : ''],
    ['Observaciones', f[COL.obs]         || ''],
  ].filter(([, v]) => v);
  document.getElementById('modalDetalles').innerHTML =
    detalles.map(([k, v]) => `<div class="modal-row"><span>${k}</span><span>${v}</span></div>`).join('') +
    (alias ? `<div class="modal-row"><span>Alias CBU</span><span style="font-family:monospace;font-size:12px;word-break:break-all;">${alias}</span></div>` : '') +
    (imgLink ? `<a href="${imgLink}" target="_blank" style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--cream);border-radius:10px;text-decoration:none;border:1px solid var(--border);margin-top:14px;"><div style="font-size:20px;">🖼</div><div style="font-size:13px;font-weight:600;color:#1A0F08;">Ver comprobante →</div></a>` : '');
  document.getElementById('modalOverlay').classList.add('open');
}

function cerrarModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.remove('open');
  state.modalFactura = null;
}

async function confirmarPago() {
  const f = state.modalFactura;
  if (!f) return;
  const btn = document.getElementById('btnConfirmar');
  btn.textContent = 'Guardando…';
  btn.disabled = true;
  const fechaPago  = new Date().toLocaleDateString('es-AR');
  const filaExacta = f._sheetRow || null;
  try {
    const res = await fetch(`${CONFIG.WORKER_URL}/update-estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-secret': CONFIG.API_SECRET },
      body: JSON.stringify({ nroFactura: f[COL.nroFac]||'', proveedor: f[COL.proveedor]||'', fechaPago, fecha: f[COL.fecha]||'', filaExacta }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      document.getElementById('modalOverlay').classList.remove('open');
      showToast('✅ Factura marcada como pagada');
      await loadAll();
      btn.textContent = '✓ Marcar como pagada';
      btn.disabled = false;
      return;
    }
    showToast('❌ Error al guardar: ' + (data.message || res.status));
    console.error('update-estado error:', res.status, data);
  } catch (err) {
    showToast('❌ No se pudo conectar con el servidor');
    console.error('update-estado fetch error:', err);
  }
  btn.textContent = '✓ Marcar como pagada';
  btn.disabled = false;
}

/* ---- FILTROS ---- */
function poblarFiltroMes() {
  const sel = document.getElementById('provMesFiltro');
  const selCat = document.getElementById('provCatFiltro');
  if (!sel) return;
  const meses = new Set();
  state.data.facturas.forEach(f => {
    const mes = f['Mes'] || '', anio = f['Año'] || '';
    if (mes && anio) meses.add(`${mes} ${anio}`);
    else if (mes) meses.add(mes);
  });
  const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre',
                    'Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const arr = [...meses].sort((a, b) => {
    const [mA, yA] = a.split(' '); const [mB, yB] = b.split(' ');
    if (yA !== yB) return (yA || 0) - (yB || 0);
    return MESES_ES.indexOf(mA.toLowerCase()) - MESES_ES.indexOf(mB.toLowerCase());
  });
  sel.innerHTML = '<option value="">Todos los meses</option>' + arr.map(m => `<option value="${m}">${m}</option>`).join('');
  if (selCat) {
    const cats = new Set();
    state.data.facturas.forEach(f => { const c = (f[COL.categoria]||'').replace(/^[^\w\s]+\s*/,'').trim(); if(c) cats.add(c); });
    selCat.innerHTML = '<option value="">Todas las categorías</option>' + [...cats].sort().map(c=>`<option value="${c}">${c}</option>`).join('');
  }
}

function getFacturasFiltradas() {
  const filtroMes   = (document.getElementById('provMesFiltro') || {}).value || '';
  const filtroCat   = (document.getElementById('provCatFiltro') || {}).value || '';
  const filtroLocal = getLocalFiltro('provLocalFiltro');
  return state.data.facturas.filter(f => {
    if (filtroMes) { const mes=f['Mes']||'', anio=f['Año']||''; const clave=anio?`${mes} ${anio}`:mes; if(clave!==filtroMes&&mes!==filtroMes) return false; }
    if (filtroCat) { const cat=(f[COL.categoria]||'').replace(/^[^\w\s]+\s*/,'').trim(); if(cat!==filtroCat) return false; }
    if (filtroLocal && f[COL.local]!==filtroLocal) return false;
    return true;
  });
}

function onMesFiltroChange() { renderChartsProveedores(); renderProveedoresTab(); }

/* ---- KPIs PROVEEDORES ---- */
function renderChartsProveedores() {
  const facturas = getFacturasFiltradas();
  const kpiEl = document.getElementById('kpiProvGrid');
  if (!kpiEl) return;
  if (!facturas.length) { kpiEl.innerHTML = ''; renderProveedoresTab(); return; }
  const totalGastado = facturas.reduce((s,f) => s + parseNum(f[COL.total]), 0);
  const catMap = {}, provMap = {};
  facturas.forEach(f => {
    const cat = (f[COL.categoria]||'Sin cat').replace(/^[^\w\s]+\s*/,'').trim().split('/')[0].trim();
    catMap[cat] = (catMap[cat]||0) + parseNum(f[COL.total]);
    const p = f[COL.proveedor]||'—';
    provMap[p] = (provMap[p]||0) + parseNum(f[COL.total]);
  });
  const topCat  = Object.entries(catMap).sort((a,b) => b[1]-a[1])[0];
  const topProv = Object.entries(provMap).sort((a,b) => b[1]-a[1])[0];
  kpiEl.innerHTML = `
    <div class="kpi-prov-card"><div class="kpi-prov-left"><div class="kpi-prov-label">Total gastado</div><div class="kpi-prov-sub">${Object.keys(provMap).length} proveedores</div></div><div class="kpi-prov-value">${fmtMoney(totalGastado)}</div></div>
    <div class="kpi-prov-card"><div class="kpi-prov-left"><div class="kpi-prov-label">Mayor categoría</div><div class="kpi-prov-sub">${topCat?topCat[0]:'—'}</div></div><div class="kpi-prov-value">${topCat?fmtMoney(topCat[1]):'—'}</div></div>
    <div class="kpi-prov-card"><div class="kpi-prov-left"><div class="kpi-prov-label">Top proveedor</div><div class="kpi-prov-sub">${topProv?topProv[0]:'—'}</div></div><div class="kpi-prov-value">${topProv?fmtMoney(topProv[1]):'—'}</div></div>`;
  renderProveedoresTab();
}

function renderChartsArticulos() { renderArticulosTab(); }

/* ---- PROVEEDORES TAB ---- */
function renderProveedoresTab() {
  const el = document.getElementById('provTabList');
  if (!el) return;
  const facturas = getFacturasFiltradas();
  const q = (document.getElementById('provSearch')||{}).value||'';
  const mapa = {};
  facturas.forEach(f => {
    const p = f[COL.proveedor]||'(sin nombre)';
    if (!mapa[p]) mapa[p] = { total:0, count:0, cats:{} };
    mapa[p].total += parseNum(f[COL.total]);
    mapa[p].count++;
    const cat = (f[COL.categoria]||'Sin categoría').replace(/^[^\w\s]+\s*/,'').trim();
    mapa[p].cats[cat] = (mapa[p].cats[cat]||0) + 1;
  });
  let ranking = Object.entries(mapa).map(([prov,d]) => ({
    prov, total:d.total, count:d.count,
    cat: Object.entries(d.cats).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—',
  })).sort((a,b) => b.total - a.total);
  if (q) ranking = ranking.filter(r => r.prov.toLowerCase().includes(q.toLowerCase()));
  if (!ranking.length) { el.innerHTML='<div class="empty-state"><div class="empty-icon">🏢</div>Sin resultados</div>'; return; }
  const totalGlobal = ranking.reduce((s,r) => s+r.total, 0);
  el.innerHTML = '<div class="list-panel">' +
    ranking.map((r,i) => {
      const pct = totalGlobal > 0 ? Math.round(r.total/totalGlobal*100) : 0;
      return `<div class="prov-ranking-row">
        <div class="prov-ranking-num">${i+1}</div>
        <div class="prov-ranking-info">
          <div class="prov-ranking-name">${r.prov}</div>
          <div class="prov-ranking-meta">${r.cat} · ${r.count} factura${r.count!==1?'s':''}</div>
          <div class="prov-ranking-bar-wrap"><div class="prov-ranking-bar" style="width:${pct}%"></div></div>
        </div>
        <div class="prov-ranking-total">${fmtMoney(r.total)}</div>
      </div>`;
    }).join('') + '</div>';
}

/* ---- ARTICULOS TAB ---- */
function renderArticulosTab() {
  const el = document.getElementById('artTabList');
  const countEl = document.getElementById('artCount');
  if (!el) return;
  const q     = (document.getElementById('artSearch')||{}).value||'';
  const orden = (document.getElementById('artOrden')||{}).value||'precio';
  const keys    = state.data.articulos.length ? Object.keys(state.data.articulos[0]) : [];
  const kNombre = keys.find(k => /art.culo|articulo|nombre|desc/i.test(k)) || keys[0];
  const kProv   = keys.find(k => /proveedor/i.test(k));
  const kPrecio = keys.find(k => /precio|unit/i.test(k));
  const kFecha  = keys.find(k => /fecha/i.test(k));
  const kVeces  = keys.find(k => /veces/i.test(k));
  const kLocal  = keys.find(k => /local/i.test(k));
  let rows = [...state.data.articulos];
  if (q) rows = rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q.toLowerCase())));
  if (orden==='precio')     rows.sort((a,b) => parseNum(b[kPrecio])-parseNum(a[kPrecio]));
  if (orden==='frecuencia') rows.sort((a,b) => parseNum(b[kVeces])-parseNum(a[kVeces]));
  if (orden==='alfa')       rows.sort((a,b) => (a[kNombre]||'').localeCompare(b[kNombre]||''));
  if (countEl) countEl.textContent = rows.length + ' artículo' + (rows.length!==1?'s':'');
  if (!rows.length) { el.innerHTML='<div class="empty-state"><div class="empty-icon">📦</div>Sin resultados</div>'; return; }
  el.innerHTML = '<div class="list-panel">' +
    rows.map(r => {
      const nombre = r[kNombre]||'—';
      const prov   = kProv&&r[kProv]?r[kProv]:'';
      const precio = kPrecio&&r[kPrecio]?parseNum(r[kPrecio]):0;
      const fecha  = kFecha&&r[kFecha]?r[kFecha]:'';
      const veces  = kVeces&&r[kVeces]?r[kVeces]:'';
      const local  = kLocal&&r[kLocal]?r[kLocal]:'';
      return `<div class="art-list-row">
        <div class="art-list-dot"></div>
        <div class="art-list-info">
          <div class="art-list-nombre">${nombre}</div>
          <div class="art-list-meta">${prov}${fecha?' · '+fecha:''}${local?' · '+local:''}</div>
        </div>
        <div>${precio>0?`<div class="art-list-precio">${fmtMoney(precio)}</div>`:''}${veces?`<div class="art-list-veces">${veces}x visto</div>`:''}</div>
      </div>`;
    }).join('') + '</div>';
}

/* ---- BUSCAR ---- */
function renderBuscar() {
  const q  = document.getElementById('searchInput').value.trim();
  const el = document.getElementById('searchResults');
  if (!q) { el.innerHTML='<div class="empty-state"><div class="empty-icon">🔍</div>Escribí para buscar</div>'; return; }
  const rows = state.data.facturas.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q.toLowerCase()))).slice(0,20);
  if (!rows.length) { el.innerHTML='<div class="empty-state"><div class="empty-icon">😕</div>Sin resultados</div>'; return; }
  el.innerHTML = rows.map((f, i) =>
    renderFacturaCard(f, i, 'buscar', {
      metaExtra: ' · ' + esc(f[COL.local] || '—')
    })
  ).join('');
}

/* ---- DUPLICADOS ---- */
function detectarDuplicados(facturas) {
  const visto = {}, dupes = [];
  facturas.forEach(f => {
    const key = (f[COL.proveedor]||'') + '|' + (f[COL.nroFac]||'');
    if (!key || key==='|') return;
    if (visto[key]) { if (!dupes.find(d=>d.key===key)) dupes.push({key, prov:f[COL.proveedor], nro:f[COL.nroFac]}); }
    else visto[key] = true;
  });
  return dupes;
}

function renderAlertaDuplicados(dupes) {
  let el = document.getElementById('alertaDuplicados');
  if (!el) {
    el = document.createElement('div'); el.id = 'alertaDuplicados';
    const header = document.querySelector('.summary-header') || document.getElementById('page-inicio');
    header.appendChild(el);
  }
  if (!dupes.length) { el.innerHTML=''; el.style.cssText=''; return; }
  el.style.cssText = 'display:flex;align-items:center;gap:8px;background:rgba(26,15,8,0.12);border-radius:8px;padding:8px 14px;margin:8px 16px 0;color:#1A0F08;cursor:pointer;';
  el.onclick = () => {
    document.getElementById('searchInput').value = dupes[0].prov || '';
    renderBuscar();
    showPage('buscar', null);
  };
  el.innerHTML = `<div style="font-size:12px"><span style="font-weight:600;">⚠️ Posibles duplicados:</span> ${dupes.slice(0,2).map(d=>`${d.prov}${d.nro?' Nº'+d.nro:''}`).join(', ')}${dupes.length>2?` y ${dupes.length-2} más`:''} <span style="color:rgba(26,15,8,0.4);font-size:11px;">· Tap →</span></div>`;
}

/* ---- DESMARCAR ---- */
async function desmarcarPagada(idx) {
  const f = (state._pagadasActuales||[])[idx];
  if (!f) return;
  if (!confirm(`¿Desmarcar "${f[COL.proveedor]}" Nº ${f[COL.nroFac]} como pendiente?`)) return;
  const filaExacta = f._sheetRow || null;
  state.data.facturas = state.data.facturas.map(fac =>
    fac[COL.nroFac]===f[COL.nroFac] && fac[COL.proveedor]===f[COL.proveedor]
      ? {...fac, [COL.estado]:'A pagar', [COL.fechaPago]:''} : fac);
  renderAll();
  showToast('↩ Factura desmarcada');
  try {
    const res = await fetch(`${CONFIG.WORKER_URL}/update-estado`, {
      method:'POST', headers:{'Content-Type':'application/json','x-api-secret':CONFIG.API_SECRET},
      body: JSON.stringify({nroFactura:f[COL.nroFac], proveedor:f[COL.proveedor], estado:'A pagar', fechaPago:'', filaExacta}),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast('⚠️ Error al desmarcar: ' + (data.message || res.status));
      console.error('desmarcar error:', res.status, data);
    }
  } catch(err) {
    showToast('⚠️ No se pudo conectar al servidor');
    console.error('desmarcar fetch error:', err);
  }
}

/* ---- FOOD COST ---- */
const FC_SHEET_ID = '15tlHXgIKznAxjc8Accpe6xVK4ghaMcUo0Uwq1-A4b6E';
const FC_TAB = 'Foodcost GRAL';

async function loadFoodCost() {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${FC_SHEET_ID}/values/${encodeURIComponent(FC_TAB)}?key=${CONFIG.API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()).values || [];
    const I = {cat:0,cod:1,art:2,costoUN:3,costoIVA:4,pv:5,pvNuevo:6,pvMartin:7,margenActual:8,margenIdeal:9,costoActual:10,costoIdeal:11,costo20:12,precioSug20:13,costo25:14,precioSug25:15,costo30:16,precioSug30:17};
    const g = (row,idx) => (row[idx]!==undefined?String(row[idx]).trim():'');
    const pct = v => { const n=parseFloat(String(v).replace('%','').replace(',','.').trim()); return isNaN(n)?null:(n<1&&n>0?Math.round(n*100):Math.round(n)); };
    let currentCat = '';
    const items = [];
    for (let i=1; i<rows.length; i++) {
      const row=rows[i], colA=g(row,I.cat), colC=g(row,I.art);
      if (colC==='Articulo'||colC==='Artículo'||colA==='Categoria'||colA==='Categoría') continue;
      if (colA&&colA!==currentCat) currentCat=colA;
      if (!colC) continue;
      const pvRaw=g(row,I.pv);
      if (!pvRaw||pvRaw.includes('#')||pvRaw==='$ 0'||pvRaw==='0') continue;
      const pvVal=parseNum(pvRaw);
      if (pvVal===0) continue;
      const costoIVA=parseNum(g(row,I.costoIVA));
      const fcPct=pct(g(row,I.costoActual));
      const fcIdeal=pct(g(row,I.margenIdeal))||25;
      const falta=g(row,I.costo25).toUpperCase().includes('FALTA')||g(row,I.costo30).toUpperCase().includes('FALTA');
      const revisar=g(row,I.costo25).toUpperCase()==='REVISAR'||g(row,I.precioSug25).toUpperCase().includes('REVISAR')||g(row,I.costo30).toUpperCase()==='REVISAR'||falta||(fcPct!==null&&fcPct>fcIdeal+2);
      items.push({_articulo:colC,'Categoría':currentCat,_costoIVA:costoIVA,_pv:pvVal,_fcPct:fcPct,_fcIdeal:fcIdeal,_revisar:revisar,_faltaCosto:falta});
    }
    state.data.foodcost = items;
    poblarFiltrosFoodCost();
    renderFoodCost();
  } catch(e) {
    document.getElementById('foodCostList').innerHTML = '<div class="empty-state">No se pudo cargar el recetario.</div>';
  }
}

function poblarFiltrosFoodCost() {
  const sel = document.getElementById('fcCatFiltro');
  if (!sel||!state.data.foodcost) return;
  const cats = new Set();
  state.data.foodcost.forEach(r => { if(r['Categoría']) cats.add(r['Categoría']); });
  cats.delete(''); cats.delete('Categoria'); cats.delete('Categoría');
  sel.innerHTML = '<option value="">Todas las categorías</option>' + [...cats].map(c=>`<option value="${c}">${c}</option>`).join('');
}

function esRevisar(row) { return !!row._revisar; }
function getMargenActual(row) { const v=row._fcPct; return (v===null||v===undefined||v==='')?null:Math.round(v); }
function getMargenIdeal(row) { return row._fcIdeal||25; }
function getCostoActual(row) { return row._costoIVA||0; }
function getPV(row) { return row._pv||0; }

function renderFoodCost() {
  const el=document.getElementById('foodCostList'), countEl=document.getElementById('fcCount'), kpiEl=document.getElementById('kpiFoodCost');
  const catFiltro=(document.getElementById('fcCatFiltro')||{}).value||'';
  const estadoFiltro=(document.getElementById('fcEstadoFiltro')||{}).value||'';
  let rows=[...(state.data.foodcost||[])];
  if (catFiltro) rows=rows.filter(r=>r['Categoría']===catFiltro);
  if (estadoFiltro==='revisar') rows=rows.filter(esRevisar);
  if (estadoFiltro==='ok') rows=rows.filter(r=>!esRevisar(r));
  const orden=(document.getElementById('fcOrden')||{}).value||'revisar';
  switch(orden) {
    case 'az': rows.sort((a,b)=>(a._articulo||'').localeCompare(b._articulo||'')); break;
    case 'costo_asc': rows.sort((a,b)=>(a._costoIVA||0)-(b._costoIVA||0)); break;
    case 'costo_desc': rows.sort((a,b)=>(b._costoIVA||0)-(a._costoIVA||0)); break;
    case 'pv_asc': rows.sort((a,b)=>(a._pv||0)-(b._pv||0)); break;
    case 'pv_desc': rows.sort((a,b)=>(b._pv||0)-(a._pv||0)); break;
    case 'fc_asc': rows.sort((a,b)=>(a._fcPct||0)-(b._fcPct||0)); break;
    case 'fc_desc': rows.sort((a,b)=>(b._fcPct||0)-(a._fcPct||0)); break;
    default: rows.sort((a,b)=>(esRevisar(b)?1:0)-(esRevisar(a)?1:0)); break;
  }
  if (kpiEl&&state.data.foodcost) {
    const todos=state.data.foodcost.filter(r=>catFiltro?r['Categoría']===catFiltro:true);
    const rc=todos.filter(esRevisar).length, okc=todos.length-rc;
    const margenes=todos.map(getMargenActual).filter(m=>m!==null);
    const mp=margenes.length?Math.round(margenes.reduce((s,m)=>s+m,0)/margenes.length):0;
    const catMap={};
    todos.filter(esRevisar).forEach(r=>{const c=r['Categoría']||'—';catMap[c]=(catMap[c]||0)+1;});
    const topC=Object.entries(catMap).sort((a,b)=>b[1]-a[1])[0];
    kpiEl.innerHTML=`
      <div class="kpi-prov-card" style="border-left:3px solid #C0392B;"><div class="kpi-prov-left"><div class="kpi-prov-label">A revisar</div><div class="kpi-prov-sub">precios fuera de margen</div></div><div class="kpi-prov-value" style="color:#C0392B">${rc}</div></div>
      <div class="kpi-prov-card" style="border-left:3px solid #3B6D11;"><div class="kpi-prov-left"><div class="kpi-prov-label">En orden</div><div class="kpi-prov-sub">margen ideal</div></div><div class="kpi-prov-value" style="color:#3B6D11">${okc}</div></div>
      <div class="kpi-prov-card"><div class="kpi-prov-left"><div class="kpi-prov-label">Food cost promedio</div><div class="kpi-prov-sub">${topC?`más crítico: ${topC[0]}`:'del menú'}</div></div><div class="kpi-prov-value">${mp}%</div></div>`;
  }
  if (countEl) countEl.textContent=`${rows.length} plato${rows.length!==1?'s':''}`;
  if (!rows.length) { el.innerHTML='<div class="empty-state"><div class="empty-icon">🍽️</div>Sin resultados</div>'; return; }
  let lastCat='';
  el.innerHTML='<div class="list-panel">'+rows.map(r=>{
    const revisar=esRevisar(r), margen=getMargenActual(r), costo=getCostoActual(r), pv=getPV(r), cat=r['Categoría']||'';
    let catHeader='';
    if (cat&&cat!==lastCat) { lastCat=cat; catHeader=`<div style="padding:10px 16px 4px;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);border-top:1px solid var(--border);background:var(--surface);">${cat}</div>`; }
    const fcIdeal2=getMargenIdeal(r);
    const mc=revisar?'#C0392B':(margen!==null&&margen>fcIdeal2+2?'#8B6340':'#3B6D11');
    const badge=revisar?`<span style="background:#FCF0EE;color:#C0392B;font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;">⚠ Revisar</span>`:`<span style="background:#EAF3DE;color:#3B6D11;font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;">✓ OK</span>`;
    return `${catHeader}<div class="art-list-row"><div class="art-list-info"><div class="art-list-nombre">${r._articulo||'—'}</div><div class="art-list-meta">${costo>0?'Costo c/IVA: '+fmtMoney(costo):''}${pv>0?' · Venta: '+fmtMoney(pv):''}</div></div><div style="text-align:right;flex-shrink:0;"><div style="font-size:16px;font-weight:700;color:${mc};line-height:1;">${margen!==null?'FC '+margen+'%':'—'}</div><div style="margin-top:4px;">${badge}</div></div></div>`;
  }).join('')+'</div>';
}

/* ---- DEBOUNCED SEARCH ---- */
const _debouncedBuscar = debounce(renderBuscar, 250);
const _debouncedHistorial = debounce(renderHistorial, 250);
const _debouncedProv = debounce(renderProveedoresTab, 250);
const _debouncedArt = debounce(renderArticulosTab, 250);
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.addEventListener('input', _debouncedBuscar);
  const histSearch = document.getElementById('historialSearch');
  if (histSearch) histSearch.addEventListener('input', _debouncedHistorial);
  const provSearch = document.getElementById('provSearch');
  if (provSearch) provSearch.addEventListener('input', _debouncedProv);
  const artSearch = document.getElementById('artSearch');
  if (artSearch) artSearch.addEventListener('input', _debouncedArt);
});
