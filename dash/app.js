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

let state = {
  user: null,
  data: { facturas: [], proveedores: [], articulos: [] },
  modalFactura: null,
  _pendientesActuales: [],
  charts: {},
};

/* ---- AUTH ---- */
function doLogin() {
  const u = document.getElementById('loginUser').value.trim().toLowerCase();
  const p = document.getElementById('loginPass').value.trim();
  const err = document.getElementById('loginError');
  const user = USERS[u];
  if (user && user.pass === p) {
    state.user = { username: u, ...user };
    document.getElementById('topbarUser').textContent = user.name;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appShell').style.display = 'flex';
    err.textContent = '';
    loadAll();
  } else {
    err.textContent = 'Usuario o contraseña incorrectos';
    document.getElementById('loginPass').value = '';
  }
}
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') doLogin();
  if (e.key === 'Escape') cerrarModal();
});

/* ---- NAV ---- */
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'buscar') setTimeout(() => document.getElementById('searchInput').focus(), 100);
  // Render charts when tab becomes visible (they need the canvas to be visible)
  if (name === 'proveedores') renderChartsProveedores();
  if (name === 'articulos')   renderChartsArticulos();
}

/* ---- DATA ---- */
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
    state._hoyActuales = hoyFacts;
    hoyList.innerHTML = hoyFacts.map((f, i) => {
      const pagado = esPagado(f);
      return `<div class="factura-card ${pagado ? 'pagada' : 'pendiente'}">
        <div class="factura-main">
          <div class="factura-info">
            <div class="factura-proveedor">${f[COL.proveedor] || '—'}</div>
            <div class="factura-meta">Nº ${f[COL.nroFac] || '—'} · ${f[COL.fecha] || '—'}<br>${f[COL.local] || ''} ${f[COL.categoria] ? '· ' + f[COL.categoria] : ''}</div>
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
      <div class="prov-monto">${fmtMoney(d.total)}</div>
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
  el.innerHTML = [...pagadas].reverse().slice(0, 40).map(f => `
    <div class="historial-card">
      <div class="historial-info">
        <div class="historial-prov">${f[COL.proveedor] || '—'}</div>
        <div class="historial-meta">Nº ${f[COL.nroFac] || '—'} · ${f[COL.fecha] || '—'} · ${f[COL.local] || '—'}</div>
      </div>
      <div class="historial-monto">${fmtMoney(parseNum(f[COL.total]))}</div>
    </div>`).join('');
}

/* ---- CHARTS PROVEEDORES ---- */
function renderChartsProveedores() {
  const facturas = getFacturasFiltradas();
  if (!facturas.length) return;

  const catMap = {};
  facturas.forEach(f => {
    const cat = f[COL.categoria] || 'Sin categoría';
    catMap[cat] = (catMap[cat] || 0) + parseNum(f[COL.total]);
  });
  const catSorted = Object.entries(catMap).sort((a,b) => b[1]-a[1]).slice(0,8);
  buildChart('chartCategoria', 'doughnut',
    catSorted.map(([k]) => k.replace(/^[^\w\s]+\s/, '')),
    catSorted.map(([,v]) => Math.round(v)),
    CHART_COLORS
  );

  const provMap = {};
  facturas.forEach(f => {
    const p = f[COL.proveedor] || '—';
    provMap[p] = (provMap[p] || 0) + parseNum(f[COL.total]);
  });
  const provTop = Object.entries(provMap).sort((a,b) => b[1]-a[1]).slice(0,8);
  buildChart('chartProveedores', 'bar',
    provTop.map(([k]) => k.length > 16 ? k.slice(0,14)+'…' : k),
    provTop.map(([,v]) => Math.round(v)),
    CHART_COLORS,
    { indexAxis: 'y' }
  );
}

/* ---- CHARTS ARTICULOS ---- */
function renderChartsArticulos() {
  const articulos = state.data.articulos;
  if (!articulos.length) return;

  const keys    = Object.keys(articulos[0]);
  const kNombre = keys.find(k => /art.culo|articulo|nombre|desc/i.test(k)) || keys[0];
  const kPrecio = keys.find(k => /precio|unit/i.test(k));
  const kVeces  = keys.find(k => /veces|frecuencia|cant/i.test(k));

  // 1. Top artículos por precio unitario
  if (kPrecio) {
    const sorted = [...articulos]
      .filter(a => parseNum(a[kPrecio]) > 0)
      .sort((a,b) => parseNum(b[kPrecio]) - parseNum(a[kPrecio]))
      .slice(0, 10);
    buildChart('chartArticulos', 'bar',
      sorted.map(a => { const n = a[kNombre] || '—'; return n.length > 18 ? n.slice(0,16)+'…' : n; }),
      sorted.map(a => Math.round(parseNum(a[kPrecio]))),
      CHART_COLORS,
      { indexAxis: 'y' }
    );
  }

  // 2. Artículos más vistos/frecuentes (donut)
  if (kVeces) {
    const sorted = [...articulos]
      .filter(a => parseNum(a[kVeces]) > 0)
      .sort((a,b) => parseNum(b[kVeces]) - parseNum(a[kVeces]))
      .slice(0, 7);
    buildChart('chartFrecuencia', 'doughnut',
      sorted.map(a => { const n = a[kNombre] || '—'; return n.length > 20 ? n.slice(0,18)+'…' : n; }),
      sorted.map(a => parseNum(a[kVeces])),
      CHART_COLORS
    );
  }
}

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
  const q    = (document.getElementById('provSearch') || {}).value || '';
  const rows = filterRows(state.data.proveedores, q).slice(0, 50);
  if (!rows.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">🏢</div>Sin resultados</div>'; return; }
  const keys = Object.keys(rows[0]);
  const kNombre = keys.find(k => /raz.n|razon|nombre|proveedor/i.test(k)) || keys[0];
  const kCuit   = keys.find(k => /cuit/i.test(k));
  const kCat    = keys.find(k => /categor/i.test(k));
  const kTotal  = keys.find(k => /total/i.test(k));
  el.innerHTML = '<div class="list-panel">' + rows.map(r => `
    <div class="prov-tab-row">
      <div>
        <div class="prov-tab-name">${r[kNombre] || '—'}</div>
        <div class="prov-tab-meta">${kCuit && r[kCuit] ? r[kCuit] : ''}${kCat && r[kCat] ? ' · ' + r[kCat].replace(/^[^\w]+\s/,'') : ''}</div>
      </div>
      ${kTotal && r[kTotal] ? `<div class="prov-tab-total">${fmtMoney(parseNum(r[kTotal]))}</div>` : ''}
    </div>`).join('') + '</div>';
}

/* ---- ARTICULOS TAB ---- */
function renderArticulosTab() {
  const el = document.getElementById('artTabList');
  if (!el) return;
  const q    = (document.getElementById('artSearch') || {}).value || '';
  const rows = filterRows(state.data.articulos, q).slice(0, 50);
  if (!rows.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div>Sin resultados</div>'; return; }
  const keys    = Object.keys(rows[0]);
  const kNombre = keys.find(k => /art.culo|articulo|nombre|desc/i.test(k)) || keys[0];
  const kProv   = keys.find(k => /proveedor/i.test(k));
  const kPrecio = keys.find(k => /precio|unit/i.test(k));
  const kFecha  = keys.find(k => /fecha/i.test(k));
  el.innerHTML = '<div class="list-panel">' + rows.map(r => `
    <div class="art-row">
      <div>
        <div class="art-nombre">${r[kNombre] || '—'}</div>
        <div class="art-meta">${kProv && r[kProv] ? r[kProv] : ''}${kFecha && r[kFecha] ? ' · ' + r[kFecha] : ''}</div>
      </div>
      ${kPrecio && r[kPrecio] ? `<div class="art-precio">${fmtMoney(parseNum(r[kPrecio]))}</div>` : ''}
    </div>`).join('') + '</div>';
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
  const fechaPago  = new Date().toLocaleDateString('es-AR');
  try {
    const res = await fetch(`${CONFIG.WORKER_URL}/update-estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-secret': CONFIG.API_SECRET },
      body: JSON.stringify({ nroFactura, proveedor, fechaPago }),
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
  if (!sel) return;
  const meses = new Set();
  state.data.facturas.forEach(f => {
    const mes = f['Mes'] || '';
    const anio = f['Año'] || '';
    if (mes && anio) meses.add(`${mes} ${anio}`);
    else if (mes) meses.add(mes);
  });
  // Ordenar cronológicamente
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
}

function getFacturasFiltradas() {
  const sel = document.getElementById('provMesFiltro');
  const filtro = sel ? sel.value : '';
  if (!filtro) return state.data.facturas;
  return state.data.facturas.filter(f => {
    const mes  = f['Mes']  || '';
    const anio = f['Año']  || '';
    const clave = anio ? `${mes} ${anio}` : mes;
    return clave === filtro || mes === filtro;
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
  document.getElementById('modalDetalles').innerHTML =
    detalles.map(([k, v]) => '<div class="modal-row"><span>' + k + '</span><span>' + v + '</span></div>').join('');
  document.getElementById('modalOverlay').classList.add('open');
}
