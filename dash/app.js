/* Lharmonie Dashboard v2 — Cronklam SRL */

const CONFIG = {
  SHEET_ID: '1lZER27XWpUIaRIeosoJjMhXaclj8MS-6thOeQ3O3a8o',
  API_KEY:  'AIzaSyCj1vL8svli0VUdZOPb7ADZkRBhCQBLe2o',
  TABS: { facturas: 'Facturas', articulos: 'Artículos', proveedores: 'Proveedores' },
  API_SECRET: 'lharmonie2026',
  WORKER_URL: 'https://worker-production-7f89.up.railway.app',
};

const USERS = {
  martin:  { pass: '0706', name: 'Martín Masri', role: 'Administrador' },
  melanie: { pass: '2607', name: 'Melanie',       role: 'Gestión' },
  iara:    { pass: '3611', name: 'Iara',           role: 'Gestión' },
};

// Mapeo de columnas del Sheet real de Lharmonie
const COL = {
  fecha:       'Fecha FC',
  semana:      'Semana',
  mes:         'Mes',
  anio:        'Año',
  proveedor:   'Proveedor',
  cuit:        'CUIT',
  tipoDoc:     'Tipo Doc',
  pv:          '# PV',
  nroFac:      '# Factura',
  categoria:   'Categoría',
  local:       'Local',
  cajero:      'Cajero',
  importeNeto: 'Importe Neto',
  descuento:   'Descuento',
  iva21:       'IVA 21%',
  iva105:      'IVA 18.5%',
  percIIBB:    'Percep IIBB',
  percIVA:     'Percep IVA',
  total:       'Total',
  medioPago:   'Medio de Pago',
  estado:      'Estado',
  fechaPago:   'Fecha de Pago',
  obs:         'Observaciones',
  procesado:   'Procesado',
};

let state = {
  user: null,
  data: { facturas: [], articulos: [], proveedores: [] },
};

/* ---- AUTH ---- */

function doLogin() {
  const u   = document.getElementById('loginUser').value.trim().toLowerCase();
  const p   = document.getElementById('loginPass').value.trim();
  const err = document.getElementById('loginError');
  const user = USERS[u];
  if (user && user.pass === p) {
    state.user = { username: u, ...user };
    document.getElementById('sidebarUser').textContent = user.name;
    document.getElementById('sidebarRole').textContent = user.role;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appShell').style.display    = 'flex';
    err.textContent = '';
    loadAll();
  } else {
    err.textContent = 'Usuario o contraseña incorrectos';
  }
}

function doLogout() {
  state.user = null;
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appShell').style.display    = 'none';
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') doLogin();
});

/* ---- NAV ---- */

const PAGE_TITLES = {
  resumen:     'Resumen',
  apagar:      'Facturas a pagar',
  facturas:    'Todas las facturas',
  proveedores: 'Proveedores',
  articulos:   'Artículos',
};

function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');
  if (btn) btn.classList.add('active');
  document.getElementById('topbarTitle').textContent = PAGE_TITLES[name] || name;
}

/* ---- DATA ---- */

async function fetchTab(tab) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent(tab)}?key=${CONFIG.API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.values || [];
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  // Fila 1 puede ser título, fila 2 los headers reales
  let headerIdx = 0;
  if (rows.length > 1 && rows[0].length < 5) headerIdx = 1;
  // También detectamos si la primera fila es el título "LHARMONIE — REGISTRO..."
  if (rows[0][0] && String(rows[0][0]).toUpperCase().includes('LHARMONIE')) headerIdx = 1;
  const headers = rows[headerIdx].map(h => String(h).trim());
  return rows.slice(headerIdx + 1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]).trim() : ''; });
    return obj;
  }).filter(r => Object.values(r).some(v => v !== ''));
}

async function loadAll() {
  const btn = document.getElementById('syncBtn');
  btn.disabled = true;
  btn.textContent = '↻ Cargando…';
  try {
    const [f, a, p] = await Promise.all([
      fetchTab(CONFIG.TABS.facturas),
      fetchTab(CONFIG.TABS.articulos),
      fetchTab(CONFIG.TABS.proveedores),
    ]);
    state.data.facturas    = rowsToObjects(f);
    state.data.articulos   = rowsToObjects(a);
    state.data.proveedores = rowsToObjects(p);
    renderAll();
    const now = new Date();
    document.getElementById('syncInfo').textContent =
      `Actualizado ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (e) {
    console.error(e);
    document.getElementById('syncInfo').textContent = 'Error al cargar';
    showError(['resumenPendientes','deudaPorProv','ultimasFacturas','apagarTable','facturasTable','proveedoresTable','articulosTable']);
  }
  btn.disabled = false;
  btn.textContent = '↻ Actualizar';
}

function showError(ids) {
  const msg = '<div class="error-msg">No se pudieron cargar los datos. Verificá que el Sheet sea público (ver → compartir → cualquier persona con el enlace).</div>';
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = msg; });
}

/* ---- HELPERS ---- */

function parseNum(v) {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/\$/g, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function fmtMoney(n) {
  return '$ ' + Math.round(n).toLocaleString('es-AR');
}

function esAPagar(f) {
  const e = String(f[COL.estado] || '').toLowerCase();
  return e.includes('pagar') && !e.includes('pagado') && !e.includes('pagad');
}

function esPagado(f) {
  const e = String(f[COL.estado] || '').toLowerCase();
  return e.includes('pagado') || e.includes('pagad') || e.includes('previamente');
}

function estadoBadge(f) {
  if (esPagado(f)) return `<span class="badge badge-pagado">Pagado</span>`;
  if (esAPagar(f)) return `<span class="badge badge-apagar">A pagar</span>`;
  const e = f[COL.estado] || '—';
  return `<span class="badge" style="background:#F5F0E8;color:#8B6340;">${e}</span>`;
}

function filterRows(rows, q) {
  if (!q) return rows;
  const s = q.toLowerCase();
  return rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(s)));
}

/* ---- RENDER ALL ---- */

function renderAll() {
  renderKPIs();
  renderResumenPendientes();
  renderDeudaPorProv();
  renderUltimasFacturas();
  renderAPagar();
  renderFacturas();
  renderProveedores();
  renderArticulos();
  updateNavBadge();
}

/* ---- KPIs ---- */

function renderKPIs() {
  const { facturas, proveedores } = state.data;
  const pendientes = facturas.filter(esAPagar);
  const pagadas    = facturas.filter(esPagado);
  const totalPend  = pendientes.reduce((s, f) => s + parseNum(f[COL.total]), 0);
  const totalPag   = pagadas.reduce((s, f)    => s + parseNum(f[COL.total]), 0);

  document.getElementById('kpiAPagar').textContent      = fmtMoney(totalPend);
  document.getElementById('kpiAPagarCount').textContent = `${pendientes.length} factura${pendientes.length !== 1 ? 's' : ''} pendiente${pendientes.length !== 1 ? 's' : ''}`;
  document.getElementById('kpiPagado').textContent      = fmtMoney(totalPag);
  document.getElementById('kpiPagadoCount').textContent = `${pagadas.length} factura${pagadas.length !== 1 ? 's' : ''}`;
  document.getElementById('kpiProv').textContent        = proveedores.length || '0';
  document.getElementById('kpiTotal').textContent       = facturas.length || '0';
}

function updateNavBadge() {
  const count = state.data.facturas.filter(esAPagar).length;
  const badge = document.getElementById('navBadgeApagar');
  badge.textContent = count > 0 ? count : '';
}

/* ---- RESUMEN: PENDIENTES ---- */

function renderResumenPendientes() {
  const el  = document.getElementById('resumenPendientes');
  const rows = state.data.facturas.filter(esAPagar).slice(0, 8);
  if (!rows.length) {
    el.innerHTML = '<div class="empty-state">Sin facturas pendientes de pago 🎉</div>';
    return;
  }
  el.innerHTML = buildFacturasTable(rows, false);
}

/* ---- RESUMEN: DEUDA POR PROVEEDOR ---- */

function renderDeudaPorProv() {
  const el = document.getElementById('deudaPorProv');
  const pendientes = state.data.facturas.filter(esAPagar);
  if (!pendientes.length) {
    el.innerHTML = '<div class="empty-state">Sin deuda pendiente</div>';
    return;
  }
  // agrupar
  const mapa = {};
  pendientes.forEach(f => {
    const prov = f[COL.proveedor] || '(sin nombre)';
    if (!mapa[prov]) mapa[prov] = { total: 0, count: 0 };
    mapa[prov].total += parseNum(f[COL.total]);
    mapa[prov].count++;
  });
  const sorted = Object.entries(mapa).sort((a, b) => b[1].total - a[1].total);
  el.innerHTML = sorted.map(([prov, d]) => `
    <div class="prov-row">
      <div>
        <div class="prov-row-name">${prov}</div>
        <div class="prov-row-count">${d.count} factura${d.count !== 1 ? 's' : ''}</div>
      </div>
      <div class="prov-row-monto">${fmtMoney(d.total)}</div>
    </div>`).join('');
}

/* ---- RESUMEN: ÚLTIMAS FACTURAS ---- */

function renderUltimasFacturas() {
  const el   = document.getElementById('ultimasFacturas');
  const rows = [...state.data.facturas].slice(-6).reverse();
  if (!rows.length) { el.innerHTML = '<div class="empty-state">Sin facturas</div>'; return; }
  el.innerHTML = buildFacturasTable(rows, false);
}

/* ---- A PAGAR ---- */

function renderAPagar() {
  const el    = document.getElementById('apagarTable');
  const totEl = document.getElementById('totalesApagar');
  const q     = document.getElementById('filterApagar')?.value || '';
  const medio = document.getElementById('filterMedioPago')?.value || '';

  let rows = state.data.facturas.filter(esAPagar);
  if (q)     rows = filterRows(rows, q);
  if (medio) rows = rows.filter(f => String(f[COL.medioPago] || '').toLowerCase().includes(medio.toLowerCase()));

  if (!rows.length) {
    el.innerHTML  = '<div class="empty-state">Sin facturas pendientes</div>';
    totEl.innerHTML = '';
    return;
  }

  el.innerHTML = buildFacturasTable(rows, true);

  // totales bar
  const total = rows.reduce((s, f) => s + parseNum(f[COL.total]), 0);
  totEl.innerHTML = `
    <div>
      <div class="totales-item-label">Total pendiente</div>
      <div class="totales-item-value">${fmtMoney(total)}</div>
    </div>
    <div>
      <div class="totales-item-label">Facturas</div>
      <div class="totales-item-value">${rows.length}</div>
    </div>`;
}

/* ---- TODAS LAS FACTURAS ---- */

function renderFacturas() {
  const el     = document.getElementById('facturasTable');
  const q      = document.getElementById('filterFactura')?.value || '';
  const estado = document.getElementById('filterEstadoFac')?.value || '';
  let rows = [...state.data.facturas];
  if (q) rows = filterRows(rows, q);
  if (estado === 'apagar')  rows = rows.filter(esAPagar);
  if (estado === 'pagado')  rows = rows.filter(esPagado);
  el.innerHTML = buildFacturasTable(rows, false);
}

/* ---- TABLE BUILDER ---- */

function buildFacturasTable(rows, showMarkBtn) {
  if (!rows.length) return '<div class="empty-state">Sin resultados</div>';
  return `<table>
    <thead><tr>
      <th>Fecha</th>
      <th>Proveedor</th>
      <th>N° Factura</th>
      <th>Local</th>
      <th>Total</th>
      <th>Medio de pago</th>
      <th>Estado</th>
      ${showMarkBtn ? '<th></th>' : ''}
    </tr></thead>
    <tbody>
      ${rows.map(f => `<tr>
        <td>${f[COL.fecha] || '—'}</td>
        <td>${f[COL.proveedor] || '—'}</td>
        <td>${f[COL.nroFac] || '—'}</td>
        <td>${f[COL.local] || '—'}</td>
        <td><strong>${f[COL.total] ? fmtMoney(parseNum(f[COL.total])) : '—'}</strong></td>
        <td>${f[COL.medioPago] || '—'}</td>
        <td>${estadoBadge(f)}</td>
        ${showMarkBtn ? `<td><button class="btn-pagar" onclick="marcarPagada(this, '${(f[COL.nroFac] || '').replace(/'/g,"\\'")}')">✓ Marcar pagada</button></td>` : ''}
      </tr>`).join('')}
    </tbody>
  </table>`;
}

/* ---- MARCAR COMO PAGADA ---- */

async function marcarPagada(btn, nroFactura) {
  if (!nroFactura) return;
  const confirmar = confirm(`¿Marcar la factura ${nroFactura} como pagada?`);
  if (!confirmar) return;

  btn.disabled = true;
  btn.textContent = 'Guardando…';

  try {
    // Intentar actualizar via worker de Railway
    const res = await fetch(`${CONFIG.WORKER_URL}/update-estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-secret': CONFIG.API_SECRET },
      body: JSON.stringify({ nroFactura, estado: 'Pagado', fechaPago: new Date().toLocaleDateString('es-AR') }),
    });
    if (res.ok) {
      alert(`Factura ${nroFactura} marcada como pagada.`);
      await loadAll();
      return;
    }
  } catch (_) { /* fallback */ }

  // Fallback: actualización local optimista
  state.data.facturas = state.data.facturas.map(f => {
    if (f[COL.nroFac] === nroFactura) {
      return { ...f, [COL.estado]: 'Pagado previamente', [COL.fechaPago]: new Date().toLocaleDateString('es-AR') };
    }
    return f;
  });
  renderAll();
  alert(`Factura ${nroFactura} marcada como pagada localmente.\n\nNota: para que persista en el Sheet, el worker de Railway necesita el endpoint /update-estado.`);
}

/* ---- PROVEEDORES ---- */

function renderProveedores() {
  const el  = document.getElementById('proveedoresTable');
  const q   = document.getElementById('filterProv')?.value || '';
  let rows  = filterRows(state.data.proveedores, q);
  if (!rows.length) { el.innerHTML = '<div class="empty-state">Sin proveedores</div>'; return; }
  const keys = Object.keys(rows[0]);
  const head = keys.map(k => `<th>${k}</th>`).join('');
  const body = rows.map(r => `<tr>${keys.map(k => `<td>${r[k] || '—'}</td>`).join('')}</tr>`).join('');
  el.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/* ---- ARTÍCULOS ---- */

function renderArticulos() {
  const el  = document.getElementById('articulosTable');
  const q   = document.getElementById('filterArt')?.value || '';
  let rows  = filterRows(state.data.articulos, q);
  if (!rows.length) { el.innerHTML = '<div class="empty-state">Sin artículos</div>'; return; }
  const keys = Object.keys(rows[0]);
  const head = keys.map(k => `<th>${k}</th>`).join('');
  const body = rows.map(r => `<tr>${keys.map(k => `<td>${r[k] || '—'}</td>`).join('')}</tr>`).join('');
  el.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
