/* Lharmonie Dashboard v4 */

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
  fechaPago:'Fecha de Pago', obs:'Observaciones', procesado:'Procesado',
};

const CHART_COLORS = ['#C9A87C','#8B6340','#4A3020','#D4B896','#6B4C30','#E8D5BA','#3D2314','#A07850','#F0E6D3'];

// Alias map: PROVEEDOR_UPPER -> alias
let aliasMap = {};

function getAlias(proveedor) {
  console.log('getAlias:', proveedor, '->', aliasMap[(proveedor||'').toUpperCase().trim()] || 'NO MATCH');
  if (!proveedor) return '';
  const key = (proveedor || '').toUpperCase().trim();
  if (aliasMap[key]) return aliasMap[key];
  // Try partial match - check if any key is contained in proveedor or vice versa
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
    // Skip first 2 rows (title + header), read col A (razon social) and col D (alias)
    rows.slice(2).forEach(row => {
      const razonSocial = (row[0] || '').trim();
      const alias       = (row[3] || '').trim(); // Col D
      if (razonSocial && alias) {
        aliasMap[razonSocial.toUpperCase().trim()] = alias;
      }
    });
    console.log('Aliases cargados:', Object.keys(aliasMap).length, JSON.stringify(aliasMap));
  } catch(e) { console.warn('Aliases error:', e); }
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
    loadAll();
  } else {
    if (err) err.textContent = 'Usuario o contraseña incorrectos';
  }
}

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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).values || [];
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  let hi = 0;
  if (rows[0][0] && String(rows[0][0]).toUpperCase().includes('LHARMONIE')) hi = 1;
  const headers = rows[hi].map(h => String(h).trim());
  return rows.slice(hi + 1)
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]).trim() : ''; });
      return obj;
    })
    .filter(r => Object.values(r).some(v => v !== ''));
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
    showToast('Actualizado ✓');
  } catch (e) {
    console.error(e);
    showToast('Error al cargar datos');
  }
  btn.classList.remove('spinning');
}

/* ---- HELPERS ---- */
function parseNum(v) {
  const n = parseFloat(String(v || 0).replace(/\$/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.\-]/g,''));
  return isNaN(n) ? 0 : n;
}
function fmtMoney(n) {
  return '$ ' + Math.round(n).toLocaleString('es-AR');
}
function esPagado(f) {
  const e = String(f[COL.estado] || '').toLowerCase();
  return e.includes('previamente') || e.includes('pagado') || e.includes('✅');
}
function esAPagar(f) {
  if (esPagado(f)) return false;
  const e = String(f[COL.estado] || '').toLowerCase();
  return e.includes('a pagar') || e.trim() === 'pagar' || e.includes('transferencia') || (e.includes('efectivo') && !e.includes('pagado'));
}
function filterRows(rows, q) {
  if (!q) return rows;
  const s = q.toLowerCase();
  return rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(s)));
}

/* ---- TOAST ---- */
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

/* ---- RENDER ALL ---- */
function renderAll() {
  const facturas   = state.data.facturas;
  const pendientes = facturas.filter(esAPagar);
  const pagadas    = facturas.filter(esPagado);

  const totalPend  = pendientes.reduce((s, f) => s + parseNum(f[COL.total]), 0);

  // Facturas cargadas hoy — detectar por columna Procesado (DD/MM/YYYY HH:MM)
  const d = new Date();
  const ddmmyyyy = String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
  const ddmm     = String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
  const hoyFacts = facturas.filter(f => {
    const fp = f[COL.procesado] || '';
    const ff = f[COL.fecha]     || '';
    return fp.startsWith(ddmm) || ff === ddmmyyyy;
  });
  const totalHoy = hoyFacts.reduce((s,f) => s + parseNum(f[COL.total]), 0);

  // KPIs inicio
  document.getElementById('summaryTotal').textContent  = fmtMoney(totalPend);
  document.getElementById('summaryCount').textContent  = `${pendientes.length} factura${pendientes.length !== 1 ? 's' : ''} pendiente${pendientes.length !== 1 ? 's' : ''}`;
  document.getElementById('statPendCount').textContent = pendientes.length;
  document.getElementById('statHoyCount').textContent  = hoyFacts.length;
  document.getElementById('statHoyMonto').textContent  = hoyFacts.length ? fmtMoney(totalHoy) : 'ninguna hoy';

  // Sección facturas de hoy
  const hoyTitle = document.getElementById('hoyTitle');
  const hoyList  = document.getElementById('hoyList');
  if (hoyFacts.length) {
    hoyTitle.style.display = '';
    hoyList.style.display  = '';
    // Guardar índice para poder marcar desde inicio también
    const hoyOrdered = [...hoyFacts].reverse();
    state._hoyActuales = hoyOrdered;
    hoyList.innerHTML = hoyOrdered.map((f, i) => {
      const pagado = esPagado(f);
      return `<div class="factura-card ${pagado ? 'pagada' : 'pendiente'}">
        <div class="factura-main">
          <div class="factura-info">
            <div class="factura-proveedor">${f[COL.proveedor] || '—'}</div>
            <div class="factura-meta">Nº ${f[COL.nroFac] || '—'} · ${f[COL.fecha] || '—'}<br>${f[COL.local] || ''}${f[COL.categoria] ? ' · ' + f[COL.categoria] : ''}${f[COL.cajero] ? '<br>📋 Cargada por <strong>' + f[COL.cajero] + '</strong>' : ''}</div>
          </div>
          <div class="factura-monto">${fmtMoney(parseNum(f[COL.total]))}</div>
        </div>
        <div class="factura-footer">
          <span class="factura-estado ${pagado ? 'pagada' : 'pendiente'}">${pagado ? '✅ Pagada' : '⏳ ' + (f[COL.medioPago] || f[COL.estado] || 'Pendiente')}</span>
          ${!pagado ? `<button class="btn-pagar" onclick="abrirModalHoy(${i})">Marcar pagada</button>` : ''}
        </div>
      </div>`;
    }).join('');
  } else {
    hoyTitle.style.display = 'none';
    hoyList.style.display  = 'none';
  }

  // Última carga
  const ultima = [...facturas].reverse()[0];
  const ultimaEl = document.getElementById('ultimaCarga');
  if (ultima) {
    ultimaEl.innerHTML = `
      <div class="ultima-carga-dot"></div>
      <div>
        <div class="ultima-carga-label">Última factura cargada</div>
        <div class="ultima-carga-value">${ultima[COL.proveedor] || '—'} · ${ultima[COL.fecha] || '—'}</div>
      </div>`;
  }

  // Badge
  const badge = document.getElementById('navBadge');
  badge.textContent = pendientes.length > 0 ? pendientes.length : '';

  // Detectar duplicados
  const dupes = detectarDuplicados(facturas);
  renderAlertaDuplicados(dupes);

  renderProvDeudaList(pendientes);
  renderAPagar(pendientes);
  renderHistorial(pagadas);
  renderProveedoresTab();
  renderArticulosTab();
}

/* ---- DEUDA POR PROVEEDOR (inicio) ---- */
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
  const sorted = Object.entries(mapa).sort((a,b) => b[1].total - a[1].total);
  el.innerHTML = sorted.map(([prov, d]) => `
    <div class="prov-card">
      <div>
        <div class="prov-name">${prov}</div>
        <div class="prov-count">${d.count} factura${d.count !== 1 ? 's' : ''}</div>
      </div>
      <div style="text-align:right">
        <div class="prov-monto">${fmtMoney(d.total)}</div>
        ${getAlias(prov) ? `<div style="font-size:10px;color:#6B5744;margin-top:1px;font-weight:500;">Alias: ${getAlias(prov)}</div>` : ''}
      </div>
    </div>`).join('');
}

/* ---- A PAGAR ---- */
function renderAPagar(pendientes) {
  const el    = document.getElementById('apagarList');
  const title = document.getElementById('apagarTitle');
  if (!pendientes) pendientes = state.data.facturas.filter(esAPagar);
  state._pendientesActuales = pendientes;
  title.textContent = `${pendientes.length} factura${pendientes.length !== 1 ? 's' : ''} pendiente${pendientes.length !== 1 ? 's' : ''}`;
  if (!pendientes.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🎉</div>Todo al día</div>';
    return;
  }
  el.innerHTML = pendientes.map((f, i) => `
    <div class="factura-card pendiente">
      <div class="factura-main">
        <div class="factura-info">
          <div class="factura-proveedor">${f[COL.proveedor] || '—'}</div>
          <div class="factura-meta">Nº ${f[COL.nroFac] || '—'} · ${f[COL.fecha] || '—'}<br>${f[COL.local] || ''}${f[COL.categoria] ? ' · ' + f[COL.categoria] : ''}</div>
        </div>
        <div class="factura-monto">${fmtMoney(parseNum(f[COL.total]))}</div>
      </div>
      <div class="factura-footer">
        <span class="factura-estado pendiente">⏳ ${f[COL.medioPago] || f[COL.estado] || '—'}</span>
        <button class="btn-pagar" onclick="abrirModal(${i})">Marcar pagada</button>
      </div>
    </div>`).join('');
}

/* ---- HISTORIAL ---- */
function renderHistorial(pagadas) {
  const el = document.getElementById('historialList');
  if (!pagadas) pagadas = state.data.facturas.filter(esPagado);
  if (!pagadas.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>Sin facturas pagadas</div>';
    return;
  }

  // Resumen semanal
  const hoy = new Date();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  lunes.setHours(0,0,0,0);

  const estaSemana = pagadas.filter(f => {
    const fp = f[COL.procesado] || f[COL.fechaPago] || '';
    const partes = fp.split('/');
    if (partes.length < 3) return false;
    const d = new Date(partes[2].slice(0,4), partes[1]-1, partes[0]);
    return d >= lunes;
  });
  const totalSemana = estaSemana.reduce((s,f) => s + parseNum(f[COL.total]), 0);

  const resumenHTML = estaSemana.length > 0 ? `
    <div class="semana-card">
      <div class="semana-label">Pagado esta semana</div>
      <div class="semana-monto">${fmtMoney(totalSemana)}</div>
      <div class="semana-sub">${estaSemana.length} factura${estaSemana.length !== 1 ? 's' : ''}</div>
    </div>` : '';

  el.innerHTML = resumenHTML + [...pagadas].reverse().slice(0, 40).map((f, i) => `
    <div class="historial-card">
      <div class="historial-info">
        <div class="historial-prov">${f[COL.proveedor] || '—'}</div>
        <div class="historial-meta">Nº ${f[COL.nroFac] || '—'} · ${f[COL.fecha] || '—'} · ${f[COL.local] || '—'}</div>
        <button class="btn-desmarcar" onclick="desmarcarPagada(${i})">↩ Desmarcar</button>
      </div>
      <div style="text-align:right">
        <div class="historial-monto">${fmtMoney(parseNum(f[COL.total]))}</div>
        ${getAlias(f[COL.proveedor]) ? `<div style="font-size:10px;color:#6B5744;margin-top:1px;font-weight:500;">Alias: ${getAlias(f[COL.proveedor])}</div>` : ''}
        ${f[COL.imagen] ? `<a href="${f[COL.imagen]}" target="_blank" style="font-size:10px;color:var(--brown-light);text-decoration:none;">🖼 ver</a>` : ''}
      </div>
    </div>`).join('');

  state._pagadasActuales = [...pagadas].reverse().slice(0, 40);
}

/* ---- KPI CARDS PROVEEDORES ---- */
function renderChartsProveedores() {
  const facturas = getFacturasFiltradas();
  const kpiEl = document.getElementById('kpiProvGrid');
  if (!kpiEl) return;

  if (!facturas.length) { kpiEl.innerHTML = ''; renderProveedoresTab(); return; }

  // KPI 1: Total gastado
  const totalGastado = facturas.reduce((s,f) => s + parseNum(f[COL.total]), 0);

  // KPI 2: Categoría con más gasto
  const catMap = {};
  facturas.forEach(f => {
    const cat = (f[COL.categoria] || 'Sin cat').replace(/^[^\w\s]+\s*/, '').trim().split('/')[0].trim();
    catMap[cat] = (catMap[cat] || 0) + parseNum(f[COL.total]);
  });
  const topCat = Object.entries(catMap).sort((a,b) => b[1]-a[1])[0];

  // KPI 3: Proveedor con más gasto
  const provMap = {};
  facturas.forEach(f => {
    const p = f[COL.proveedor] || '—';
    provMap[p] = (provMap[p] || 0) + parseNum(f[COL.total]);
  });
  const topProv = Object.entries(provMap).sort((a,b) => b[1]-a[1])[0];
  const cantProveedores = Object.keys(provMap).length;

  kpiEl.innerHTML =
    `<div class="kpi-prov-card">
      <div class="kpi-prov-left"><div class="kpi-prov-label">Total gastado</div><div class="kpi-prov-sub">${cantProveedores} proveedores</div></div>
      <div class="kpi-prov-value">${fmtMoney(totalGastado)}</div>
    </div>
    <div class="kpi-prov-card">
      <div class="kpi-prov-left"><div class="kpi-prov-label">Mayor categoría</div><div class="kpi-prov-sub">${topCat ? topCat[0].replace(/^[^\w\s]+\s*/,'').split('/')[0].trim() : '—'}</div></div>
      <div class="kpi-prov-value">${topCat ? fmtMoney(topCat[1]) : '—'}</div>
    </div>
    <div class="kpi-prov-card">
      <div class="kpi-prov-left"><div class="kpi-prov-label">Top proveedor</div><div class="kpi-prov-sub">${topProv ? topProv[0] : '—'}</div></div>
      <div class="kpi-prov-value">${topProv ? fmtMoney(topProv[1]) : '—'}</div>
    </div>`;

  renderProveedoresTab();
}

/* ---- CHARTS ARTICULOS ---- */
function renderChartsArticulos() { renderArticulosTab(); }

function buildChart(id, type, labels, data, colors, extraOptions) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  if (state.charts[id]) { state.charts[id].destroy(); }
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: type === 'doughnut',
        position: 'bottom',
        labels: { font: { family: 'DM Sans', size: 11 }, padding: 12, boxWidth: 12 }
      },
      tooltip: {
        callbacks: {
          label: ctx => type === 'doughnut'
            ? ` $ ${ctx.raw.toLocaleString('es-AR')}`
            : ` $ ${ctx.raw.toLocaleString('es-AR')}`
        }
      }
    },
    scales: type === 'doughnut' ? {} : {
      x: { ticks: { font: { family: 'DM Sans', size: 10 }, callback: v => '$ ' + Number(v).toLocaleString('es-AR') }, grid: { color: 'rgba(0,0,0,0.04)' } },
      y: { ticks: { font: { family: 'DM Sans', size: 11 } } }
    },
    ...extraOptions,
  };
  if (type === 'bar' && extraOptions && extraOptions.indexAxis === 'y') {
    opts.scales = {
      x: { ticks: { font: { family: 'DM Sans', size: 10 }, callback: v => '$ ' + Number(v).toLocaleString('es-AR') }, grid: { color: 'rgba(0,0,0,0.04)' } },
      y: { ticks: { font: { family: 'DM Sans', size: 11 } } }
    };
  }
  state.charts[id] = new Chart(canvas, {
    type,
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: type === 'doughnut' ? colors : colors[0],
        borderRadius: type === 'bar' ? 5 : 0,
        borderWidth: 0,
      }]
    },
    options: opts,
  });
}

/* ---- PROVEEDORES TAB ---- */
function renderProveedoresTab() {
  const el = document.getElementById('provTabList');
  if (!el) return;

  const facturas = getFacturasFiltradas();
  const q = (document.getElementById('provSearch') || {}).value || '';

  // Build ranking from facturas data
  const mapa = {};
  facturas.forEach(f => {
    const p = f[COL.proveedor] || '(sin nombre)';
    if (!mapa[p]) mapa[p] = { total: 0, count: 0, cats: {} };
    mapa[p].total += parseNum(f[COL.total]);
    mapa[p].count++;
    const cat = (f[COL.categoria] || 'Sin categoría').replace(/^[^\w\s]+\s*/, '').trim();
    mapa[p].cats[cat] = (mapa[p].cats[cat] || 0) + 1;
  });

  let ranking = Object.entries(mapa)
    .map(([prov, d]) => ({
      prov,
      total: d.total,
      count: d.count,
      cat: Object.entries(d.cats).sort((a,b) => b[1]-a[1])[0]?.[0] || '—',
    }))
    .sort((a,b) => b.total - a.total);

  if (q) ranking = ranking.filter(r => r.prov.toLowerCase().includes(q.toLowerCase()));

  if (!ranking.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🏢</div>Sin resultados</div>';
    return;
  }

  const totalGlobal = ranking.reduce((s,r) => s + r.total, 0);

  el.innerHTML = '<div class="list-panel">' +
    ranking.map((r, i) => {
      const pct = totalGlobal > 0 ? Math.round(r.total / totalGlobal * 100) : 0;
      return `<div class="prov-ranking-row">
        <div class="prov-ranking-num">${i+1}</div>
        <div class="prov-ranking-info">
          <div class="prov-ranking-name">${r.prov}</div>
          <div class="prov-ranking-meta">${r.cat} · ${r.count} factura${r.count !== 1 ? 's' : ''}</div>
          <div class="prov-ranking-bar-wrap">
            <div class="prov-ranking-bar" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="prov-ranking-total">${fmtMoney(r.total)}</div>
      </div>`;
    }).join('') +
  '</div>';
}

/* ---- ARTICULOS TAB ---- */
function renderArticulosTab() {
  const el = document.getElementById('artTabList');
  const countEl = document.getElementById('artCount');
  if (!el) return;
  const q     = (document.getElementById('artSearch') || {}).value || '';
  const orden = (document.getElementById('artOrden') || {}).value || 'precio';

  const keys    = state.data.articulos.length ? Object.keys(state.data.articulos[0]) : [];
  const kNombre = keys.find(k => /art.culo|articulo|nombre|desc/i.test(k)) || keys[0];
  const kProv   = keys.find(k => /proveedor/i.test(k));
  const kPrecio = keys.find(k => /precio|unit/i.test(k));
  const kFecha  = keys.find(k => /fecha/i.test(k));
  const kVeces  = keys.find(k => /veces/i.test(k));
  const kLocal  = keys.find(k => /local/i.test(k));

  let rows = [...state.data.articulos];
  if (q) rows = rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q.toLowerCase())));

  if (orden === 'precio')     rows.sort((a,b) => parseNum(b[kPrecio]) - parseNum(a[kPrecio]));
  if (orden === 'frecuencia') rows.sort((a,b) => parseNum(b[kVeces])  - parseNum(a[kVeces]));
  if (orden === 'alfa')       rows.sort((a,b) => (a[kNombre]||'').localeCompare(b[kNombre]||''));

  if (countEl) countEl.textContent = rows.length + ' artículo' + (rows.length !== 1 ? 's' : '');

  if (!rows.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div>Sin resultados</div>';
    return;
  }

  el.innerHTML = '<div class="list-panel">' +
    rows.map(r => {
      const nombre = r[kNombre] || '—';
      const prov   = kProv  && r[kProv]   ? r[kProv]   : '';
      const precio = kPrecio && r[kPrecio] ? parseNum(r[kPrecio]) : 0;
      const fecha  = kFecha  && r[kFecha]  ? r[kFecha]  : '';
      const veces  = kVeces  && r[kVeces]  ? r[kVeces]  : '';
      const local  = kLocal  && r[kLocal]  ? r[kLocal]  : '';
      return `<div class="art-list-row">
        <div class="art-list-dot"></div>
        <div class="art-list-info">
          <div class="art-list-nombre">${nombre}</div>
          <div class="art-list-meta">${prov}${fecha ? ' · ' + fecha : ''}${local ? ' · ' + local : ''}</div>
        </div>
        <div>
          ${precio > 0 ? `<div class="art-list-precio">${fmtMoney(precio)}</div>` : ''}
          ${veces  ? `<div class="art-list-veces">${veces}x visto</div>` : ''}
        </div>
      </div>`;
    }).join('') +
  '</div>';
}

/* ---- BUSCAR ---- */
function renderBuscar() {
  const q  = document.getElementById('searchInput').value.trim();
  const el = document.getElementById('searchResults');
  if (!q) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div>Escribí para buscar</div>'; return; }
  const rows = filterRows(state.data.facturas, q).slice(0, 20);
  if (!rows.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">😕</div>Sin resultados</div>'; return; }
  el.innerHTML = rows.map(f => {
    const pagado = esPagado(f);
    return `
    <div class="factura-card ${pagado ? 'pagada' : 'pendiente'}">
      <div class="factura-main">
        <div class="factura-info">
          <div class="factura-proveedor">${f[COL.proveedor] || '—'}</div>
          <div class="factura-meta">Nº ${f[COL.nroFac] || '—'} · ${f[COL.fecha] || '—'} · ${f[COL.local] || '—'}</div>
        </div>
        <div class="factura-monto">${fmtMoney(parseNum(f[COL.total]))}</div>
      </div>
      <div class="factura-footer">
        <span class="factura-estado ${pagado ? 'pagada' : 'pendiente'}">${pagado ? '✅ Pagada' : '⏳ Pendiente'}</span>
      </div>
    </div>`;
  }).join('');
}

/* ---- MODAL ---- */
function abrirModal(idx) {
  const f = state._pendientesActuales[idx];
  if (!f) return;
  state.modalFactura = f;
  document.getElementById('modalProveedor').textContent = f[COL.proveedor] || '—';
  document.getElementById('modalNro').textContent       = `Factura Nº ${f[COL.nroFac] || '—'} · ${f[COL.fecha] || '—'}`;
  document.getElementById('modalMonto').textContent     = fmtMoney(parseNum(f[COL.total]));
  const detalles = [
    ['Local',         f[COL.local]       || ''],
    ['Categoría',     f[COL.categoria]   || ''],
    ['Medio de pago', f[COL.medioPago]   || f[COL.estado] || ''],
    ['IVA 21%',       f[COL.iva21]       ? fmtMoney(parseNum(f[COL.iva21])) : ''],
    ['Importe neto',  f[COL.importeNeto] ? fmtMoney(parseNum(f[COL.importeNeto])) : ''],
    ['Observaciones', f[COL.obs]         || ''],
  ].filter(([, v]) => v);
  document.getElementById('modalDetalles').innerHTML =
    detalles.map(([k, v]) => `<div class="modal-row"><span>${k}</span><span>${v}</span></div>`).join('');
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
  const nroFactura = f[COL.nroFac]     || '';
  const proveedor  = f[COL.proveedor]  || '';
  const fecha      = f[COL.fecha]      || '';
  const fechaPago  = new Date().toLocaleDateString('es-AR');
  try {
    const res = await fetch(`${CONFIG.WORKER_URL}/update-estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-secret': CONFIG.API_SECRET },
      body: JSON.stringify({ nroFactura, proveedor, fechaPago, fecha }),
    });
    if (res.ok) {
      document.getElementById('modalOverlay').classList.remove('open');
      showToast('✅ Factura marcada como pagada');
      await loadAll();
      btn.textContent = '✓ Marcar como pagada';
      btn.disabled = false;
      return;
    }
  } catch (_) {}
  // Fallback optimista
  state.data.facturas = state.data.facturas.map(fac =>
    fac[COL.nroFac] === nroFactura && fac[COL.proveedor] === proveedor
      ? { ...fac, [COL.estado]: '✅ Pagado', [COL.fechaPago]: fechaPago }
      : fac
  );
  renderAll();
  document.getElementById('modalOverlay').classList.remove('open');
  showToast('Marcada localmente');
  btn.textContent = '✓ Marcar como pagada';
  btn.disabled = false;
}

/* ---- FILTRO MES PROVEEDORES ---- */
function poblarFiltroMes() {
  const sel = document.getElementById('provMesFiltro');
  const selCat = document.getElementById('provCatFiltro');
  if (!sel) return;

  // Meses
  const meses = new Set();
  state.data.facturas.forEach(f => {
    const mes = f['Mes'] || '';
    const anio = f['Año'] || '';
    if (mes && anio) meses.add(`${mes} ${anio}`);
    else if (mes) meses.add(mes);
  });
  const MESES_ES = ['January','February','March','April','May','June','July','August','September','October','November','December',
                    'Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
                    'enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const arr = [...meses].sort((a, b) => {
    const [mA, yA] = a.split(' '); const [mB, yB] = b.split(' ');
    if (yA !== yB) return (yA || 0) - (yB || 0);
    return MESES_ES.indexOf(mA) - MESES_ES.indexOf(mB);
  });
  sel.innerHTML = '<option value="">Todos los meses</option>' +
    arr.map(m => `<option value="${m}">${m}</option>`).join('');

  // Categorías
  if (selCat) {
    const cats = new Set();
    state.data.facturas.forEach(f => {
      const c = (f[COL.categoria] || '').replace(/^[^\w\s]+\s*/, '').trim();
      if (c) cats.add(c);
    });
    const catArr = [...cats].sort();
    selCat.innerHTML = '<option value="">Todas las categorías</option>' +
      catArr.map(c => `<option value="${c}">${c}</option>`).join('');
  }
}

function getFacturasFiltradas() {
  const selMes = document.getElementById('provMesFiltro');
  const selCat = document.getElementById('provCatFiltro');
  const filtroMes = selMes ? selMes.value : '';
  const filtroCat = selCat ? selCat.value : '';

  return state.data.facturas.filter(f => {
    if (filtroMes) {
      const mes  = f['Mes']  || '';
      const anio = f['Año']  || '';
      const clave = anio ? `${mes} ${anio}` : mes;
      if (clave !== filtroMes && mes !== filtroMes) return false;
    }
    if (filtroCat) {
      const cat = (f[COL.categoria] || '').replace(/^[^\w\s]+\s*/, '').trim();
      if (cat !== filtroCat) return false;
    }
    return true;
  });
}

function onMesFiltroChange() {
  renderChartsProveedores();
  renderProveedoresTab();
}



/* ---- MODAL DESDE HOY ---- */
function abrirModalHoy(idx) {
  const f = (state._hoyActuales || [])[idx];
  if (!f) return;
  // Reusar el mismo modal pero con referencia a hoy
  state.modalFactura = f;
  document.getElementById('modalProveedor').textContent = f[COL.proveedor] || '—';
  document.getElementById('modalNro').textContent       = 'Factura Nº ' + (f[COL.nroFac] || '—') + ' · ' + (f[COL.fecha] || '—');
  document.getElementById('modalMonto').textContent     = fmtMoney(parseNum(f[COL.total]));
  const detalles = [
    ['Local',         f[COL.local]       || ''],
    ['Categoría',     f[COL.categoria]   || ''],
    ['Medio de pago', f[COL.medioPago]   || f[COL.estado] || ''],
    ['IVA 21%',       f[COL.iva21]       ? fmtMoney(parseNum(f[COL.iva21])) : ''],
    ['Importe neto',  f[COL.importeNeto] ? fmtMoney(parseNum(f[COL.importeNeto])) : ''],
    ['Observaciones', f[COL.obs]         || ''],
  ].filter(([, v]) => v);
  // Add imagen link if available
  const imgLink = f[COL.imagen] || '';
  const imgHTML = imgLink
    ? `<a href="${imgLink}" target="_blank" style="display:block;margin-top:16px;padding:12px;background:#F5F0E8;border-radius:10px;text-align:center;color:#1A0F08;font-size:13px;font-weight:500;text-decoration:none;">🖼 Ver imagen del comprobante →</a>`
    : '';
  document.getElementById('modalDetalles').innerHTML =
    detalles.map(([k, v]) => '<div class="modal-row"><span>' + k + '</span><span>' + v + '</span></div>').join('') + imgHTML;
  document.getElementById('modalOverlay').classList.add('open');
}


/* ---- DUPLICADOS ---- */
function detectarDuplicados(facturas) {
  const visto = {};
  const dupes = [];
  facturas.forEach(f => {
    const key = (f[COL.proveedor] || '') + '|' + (f[COL.nroFac] || '');
    if (!key || key === '|') return;
    if (visto[key]) {
      if (!dupes.find(d => d.key === key)) dupes.push({ key, prov: f[COL.proveedor], nro: f[COL.nroFac] });
    } else {
      visto[key] = true;
    }
  });
  return dupes;
}

function renderAlertaDuplicados(dupes) {
  let el = document.getElementById('alertaDuplicados');
  if (!el) {
    el = document.createElement('div');
    el.id = 'alertaDuplicados';
    const header = document.querySelector('.summary-header') || document.getElementById('page-inicio');
    header.appendChild(el);
  }
  if (!dupes.length) { el.innerHTML = ''; el.style.cssText=''; return; }
  el.style.cssText = 'display:flex;align-items:center;gap:8px;background:rgba(26,15,8,0.12);border-radius:8px;padding:8px 14px;margin:8px 16px 0;color:#1A0F08;';
  el.innerHTML = `<div style="font-size:12px"><span style="font-weight:600;color:#1A0F08;">⚠️ Posibles duplicados:</span> ${dupes.slice(0,2).map(d => `<span style="color:rgba(26,15,8,0.7)">${d.prov}${d.nro ? ' Nº'+d.nro : ''}</span>`).join(', ')}${dupes.length > 2 ? `<span style="color:rgba(26,15,8,0.5)"> y ${dupes.length-2} más</span>` : ''}</div>`;
  return;
  // legacy below kept for reference
  el.innerHTML = `<div class="alerta-duplicados">
    <div class="alerta-icon">⚠️</div>
    <div>
      <div class="alerta-titulo">Posibles facturas duplicadas</div>
      ${dupes.map(d => `<div class="alerta-item">${d.prov} · Nº ${d.nro}</div>`).join('')}
    </div>
  </div>`;
}

/* ---- DESMARCAR PAGADA ---- */
async function desmarcarPagada(idx) {
  const f = (state._pagadasActuales || [])[idx];
  if (!f) return;
  const confirmar = confirm(`¿Desmarcar "${f[COL.proveedor]}" Nº ${f[COL.nroFac]} como pendiente?`);
  if (!confirmar) return;

  // Optimistic local update
  state.data.facturas = state.data.facturas.map(fac =>
    fac[COL.nroFac] === f[COL.nroFac] && fac[COL.proveedor] === f[COL.proveedor]
      ? { ...fac, [COL.estado]: 'A pagar', [COL.fechaPago]: '' }
      : fac
  );
  renderAll();
  showToast('↩ Factura desmarcada');

  // Try to sync with worker
  try {
    await fetch(`${CONFIG.WORKER_URL}/update-estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-secret': CONFIG.API_SECRET },
      body: JSON.stringify({ nroFactura: f[COL.nroFac], proveedor: f[COL.proveedor], estado: 'A pagar', fechaPago: '' }),
    });
  } catch(_) {}
}

/* ---- FOOD COST ---- */

const FC_SHEET_ID = '15tlHXgIKznAxjc8Accpe6xVK4ghaMcUo0Uwq1-A4b6E';
const FC_TAB      = 'Foodcost GRAL';

async function loadFoodCost() {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${FC_SHEET_ID}/values/${encodeURIComponent(FC_TAB)}?key=${CONFIG.API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const rows = json.values || [];

    // Estructura del Sheet:
    // Fila 1 (idx 0): headers
    // Fila 2 (idx 1): "Categoria" label — saltar
    // Fila 3 (idx 2): fila vacía/totales — saltar
    // Fila 4+: Categoría en col A sola, luego platos

    // Posiciones fijas por columna
    const I = { cat:0, cod:1, art:2, costoUN:3, costoIVA:4, pv:5, pvNuevo:6, pvMartin:7,
                margenActual:8, margenIdeal:9, costoActual:10, costoIdeal:11,
                costo20:12, precioSug20:13, costo25:14, precioSug25:15, costo30:16, precioSug30:17 };

    const g = (row, idx) => (row[idx] !== undefined ? String(row[idx]).trim() : '');
    const pct = v => { const n = parseFloat(String(v).replace('%','').replace(',','.').trim()); return isNaN(n) ? null : (n < 1 && n > 0 ? Math.round(n*100) : Math.round(n)); };

    let currentCat = '';
    const items = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const colA = g(row, I.cat);
      const colB = g(row, I.cod);
      const colC = g(row, I.art);

      // Saltar fila de header y label "Categoria"
      if (colC === 'Articulo' || colC === 'Artículo') continue;
      if (colA === 'Categoria' || colA === 'Categoría') continue;

      // Si col A tiene texto → actualizar categoría (puede venir junto con un artículo)
      if (colA && colA !== currentCat) currentCat = colA;

      // Necesita artículo en col C
      if (!colC) continue;

      // PV — usar col F (idx 5), si es #N/A o vacío no lo vendemos
      const pvRaw = g(row, I.pv);
      if (!pvRaw || pvRaw === '' || pvRaw.includes('#') || pvRaw === '$ 0' || pvRaw === '0') continue;
      const pvVal = parseNum(pvRaw);
      if (pvVal === 0) continue;

      const costoIVA   = parseNum(g(row, I.costoIVA));
      // Food cost % = valor directo de col K (Costo Actual)
      const fcPctRaw   = g(row, I.costoActual);
      const fcPct      = pct(fcPctRaw); // ej: "29%" → 29
      // FC ideal = col J (Margen Ideal) — es el tope de FC que querés
      const fcIdeal    = pct(g(row, I.margenIdeal)) || 25;
      const falta      = g(row, I.costo25).toUpperCase().includes('FALTA') || g(row, I.costo30).toUpperCase().includes('FALTA');
      const revisar    = g(row, I.costo25).toUpperCase() === 'REVISAR' || g(row, I.precioSug25).toUpperCase().includes('REVISAR') ||
                         g(row, I.costo30).toUpperCase() === 'REVISAR' || falta ||
                         (fcPct !== null && fcPct > fcIdeal + 2);

      items.push({
        _articulo:    colC,
        'Categoría':  currentCat,
        _costoIVA:    costoIVA,
        _pv:          pvVal,
        _fcPct:       fcPct,      // Food cost % directo de col K
        _fcIdeal:     fcIdeal,    // FC ideal de col J
        _revisar:     revisar,
        _faltaCosto:  falta,
      });
    }

    state.data.foodcost = items;
    poblarFiltrosFoodCost();
    renderFoodCost();
  } catch(e) {
    console.error('Food cost error:', e);
    document.getElementById('foodCostList').innerHTML =
      '<div class="error-msg">No se pudo cargar el recetario. Verificá que el Sheet sea público.</div>';
  }
}

function poblarFiltrosFoodCost() {
  const sel = document.getElementById('fcCatFiltro');
  if (!sel || !state.data.foodcost) return;
  const cats = new Set();
  state.data.foodcost.forEach(r => { if (r['Categoría']) cats.add(r['Categoría']); });
  // Remove empty/header entries
  cats.delete('');  cats.delete('Categoria');  cats.delete('Categoría');
  sel.innerHTML = '<option value="">Todas las categorías</option>' +
    [...cats].map(c => `<option value="${c}">${c}</option>`).join('');
}

function getMargenActual(row) {
  const v = row._margenActual;
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace('%','').replace(',','.').trim());
  return isNaN(n) ? null : Math.round(n);
}

function getCostoActual(row) { return parseNum(row._costoIVA || row._costoUN || '0'); }

function getPV(row) { return parseNum(row._pvMartin || row._pvNuevo || row._pv || '0'); }


function esRevisar(row) { return !!row._revisar; }

function getMargenActual(row) {
  const v = row._fcPct;
  if (v === null || v === undefined || v === '') return null;
  return Math.round(v);
}

function getMargenIdeal(row) {
  return row._fcIdeal || 25;
}

function getCostoActual(row) { return row._costoIVA || 0; }
function getPV(row) { return row._pv || 0; }

function renderFoodCost() {
  const el       = document.getElementById('foodCostList');
  const countEl  = document.getElementById('fcCount');
  const kpiEl    = document.getElementById('kpiFoodCost');
  const catFiltro    = (document.getElementById('fcCatFiltro') || {}).value || '';
  const estadoFiltro = (document.getElementById('fcEstadoFiltro') || {}).value || '';

  let rows = [...(state.data.foodcost || [])];
  if (catFiltro)    rows = rows.filter(r => r['Categoría'] === catFiltro);
  if (estadoFiltro === 'revisar') rows = rows.filter(esRevisar);
  if (estadoFiltro === 'ok')      rows = rows.filter(r => !esRevisar(r));

  // Ordenar
  const orden = (document.getElementById('fcOrden') || {}).value || 'revisar';
  switch(orden) {
    case 'az':        rows.sort((a,b) => (a._articulo||'').localeCompare(b._articulo||'')); break;
    case 'costo_asc': rows.sort((a,b) => (a._costoIVA||0) - (b._costoIVA||0)); break;
    case 'costo_desc':rows.sort((a,b) => (b._costoIVA||0) - (a._costoIVA||0)); break;
    case 'pv_asc':    rows.sort((a,b) => (a._pv||0) - (b._pv||0)); break;
    case 'pv_desc':   rows.sort((a,b) => (b._pv||0) - (a._pv||0)); break;
    case 'fc_asc':    rows.sort((a,b) => (a._fcPct||0) - (b._fcPct||0)); break;
    case 'fc_desc':   rows.sort((a,b) => (b._fcPct||0) - (a._fcPct||0)); break;
    default:          rows.sort((a,b) => (esRevisar(b)?1:0) - (esRevisar(a)?1:0)); break;
  }

  // KPIs
  if (kpiEl && state.data.foodcost) {
    const todos = state.data.foodcost.filter(r => catFiltro ? r['Categoría'] === catFiltro : true);
    const revisarCount = todos.filter(esRevisar).length;
    const okCount      = todos.length - revisarCount;
    const margenes   = todos.map(getMargenActual).filter(m => m !== null);
    const margenProm = margenes.length ? Math.round(margenes.reduce((s,m) => s+m, 0) / margenes.length) : 0;
    // Categoría con más REVISAR
    const catMap = {};
    todos.filter(esRevisar).forEach(r => {
      const c = r['Categoría'] || '—';

      catMap[c] = (catMap[c] || 0) + 1;
    });
    const topCatRevisar = Object.entries(catMap).sort((a,b) => b[1]-a[1])[0];

    kpiEl.innerHTML = `
      <div class="kpi-prov-card" style="border-left:3px solid #C0392B;">
        <div class="kpi-prov-left"><div class="kpi-prov-label">A revisar</div><div class="kpi-prov-sub">precios fuera de margen</div></div>
        <div class="kpi-prov-value" style="color:#C0392B">${revisarCount}</div>
      </div>
      <div class="kpi-prov-card" style="border-left:3px solid #3B6D11;">
        <div class="kpi-prov-left"><div class="kpi-prov-label">En orden</div><div class="kpi-prov-sub">margen ideal</div></div>
        <div class="kpi-prov-value" style="color:#3B6D11">${okCount}</div>
      </div>
      <div class="kpi-prov-card">
        <div class="kpi-prov-left"><div class="kpi-prov-label">Food cost promedio</div><div class="kpi-prov-sub">${topCatRevisar ? `más crítico: ${topCatRevisar[0]}` : 'del menú'}</div></div>
        <div class="kpi-prov-value">${margenProm}%</div>
      </div>`;
  }

  if (countEl) countEl.textContent = `${rows.length} plato${rows.length !== 1 ? 's' : ''}`;

  if (!rows.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🍽️</div>Sin resultados</div>';
    return;
  }



  // Agrupar por categoría
  let lastCat = '';
  el.innerHTML = '<div class="list-panel">' +
    rows.map(r => {
      const revisar = esRevisar(r);
      const margen  = getMargenActual(r);
      const costo   = getCostoActual(r);
      const pv      = getPV(r);
      const cat     = r['Categoría'] || '';
      const margenIdeal = parseFloat(String(r['Margen Ideal'] || r['Margen ideal'] || '').replace('%','')) || 25;

      let catHeader = '';
      if (cat && cat !== lastCat) {
        lastCat = cat;
        catHeader = `<div style="padding:10px 16px 4px; font-size:9px; letter-spacing:0.15em; text-transform:uppercase; color:var(--muted); border-top:1px solid var(--border); background:var(--surface);">${cat}</div>`;
      }

      const fcIdeal2 = getMargenIdeal(r);
  // FC%: menor es mejor. Verde si está bien, rojo si supera el ideal
  const margenColor = revisar ? '#C0392B' : (margen !== null && margen > fcIdeal2 + 2 ? '#8B6340' : '#3B6D11');
      const badge = revisar
        ? `<span style="background:#FCF0EE;color:#C0392B;font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;">⚠ Revisar</span>`
        : `<span style="background:#EAF3DE;color:#3B6D11;font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;">✓ OK</span>`;

      return `${catHeader}<div class="art-list-row">
        <div class="art-list-info">
          <div class="art-list-nombre">${r._articulo || '—'}</div>
          <div class="art-list-meta">${costo > 0 ? 'Costo c/IVA: ' + fmtMoney(costo) : ''}${pv > 0 ? '  ·  Venta: ' + fmtMoney(pv) : ''}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:16px;font-weight:700;color:${margenColor};line-height:1;">${margen !== null ? 'FC ' + margen + '%' : '—'}</div>
          <div style="margin-top:4px;">${badge}</div>
        </div>
      </div>`;
    }).join('') +
  '</div>';
}
