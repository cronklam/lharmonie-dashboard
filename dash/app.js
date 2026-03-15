const CONFIG = {
  SHEET_ID: '1lZER27XWpUIaRIeosoJjMhXaclj8MS-6thOeQ3O3a8o',
  API_KEY:  'AIzaSyCj1vL8svli0VUdZOPb7ADZkRBhCQBLe2o',
  TABS: { facturas: 'Facturas', articulos: 'Artículos', proveedores: 'Proveedores' },
};

const USERS = {
  martin:  { pass: '0706', name: 'Martín Masri', role: 'Administrador' },
  melanie: { pass: '2607', name: 'Melanie',       role: 'Gestión' },
  iara:    { pass: '3611', name: 'Iara',           role: 'Gestión' },
};

let state = { user: null, data: { facturas: [], articulos: [], proveedores: [] } };

/* ---- AUTH ---- */

function doLogin() {
  const u = document.getElementById('loginUser').value.trim().toLowerCase();
  const p = document.getElementById('loginPass').value.trim();
  const err = document.getElementById('loginError');
  const user = USERS[u];
  if (user && user.pass === p) {
    state.user = { username: u, ...user };
    document.getElementById('sidebarUser').textContent = user.name;
    document.getElementById('sidebarRole').textContent = user.role;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appShell').style.display = 'flex';
    err.textContent = '';
    loadAll();
  } else {
    err.textContent = 'Usuario o contraseña incorrectos';
  }
}

function doLogout() {
  state.user = null;
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
  document.getElementById('loginError').textContent = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') doLogin();
});

/* ---- NAV ---- */

const PAGE_TITLES = { resumen: 'Resumen', facturas: 'Facturas', articulos: 'Artículos', proveedores: 'Proveedores' };

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
  const headers = rows[0].map(h => String(h).trim());
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
    return obj;
  });
}

async function loadAll() {
  const btn = document.getElementById('syncBtn');
  const status = document.getElementById('syncStatus');
  btn.disabled = true;
  btn.textContent = 'Actualizando…';
  status.textContent = 'Sincronizando…';
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
    status.textContent = `Actualizado ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (e) {
    console.error(e);
    status.textContent = 'Error al cargar datos';
    ['recentFacturas','topProveedores','facturasTable','articulosTable','proveedoresTable'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="error-msg">No se pudieron cargar los datos. Verificá que el Sheet sea público.</div>';
    });
  }
  btn.disabled = false;
  btn.textContent = 'Actualizar datos';
}

/* ---- HELPERS ---- */

function parseNum(v) {
  const n = parseFloat(String(v || 0).replace(/[^0-9.,\-]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function fmtMoney(n) {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

function findKey(obj, regex) {
  return Object.keys(obj).find(k => regex.test(k));
}

function filterRows(rows, q) {
  if (!q) return rows;
  const s = q.toLowerCase();
  return rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(s)));
}

function buildTable(rows) {
  if (!rows.length) return '<div class="empty-state">Sin resultados</div>';
  const keys = Object.keys(rows[0]);
  const head = keys.map(k => `<th>${k}</th>`).join('');
  const body = rows.map(r => `<tr>${keys.map(k => `<td>${r[k] || '—'}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/* ---- RENDER ---- */

function renderAll() {
  renderKPIs();
  renderRecentFacturas();
  renderTopProveedores();
  renderFacturasPage();
  renderArticulosPage();
  renderProveedoresPage();
}

function renderKPIs() {
  const { facturas, articulos, proveedores } = state.data;
  document.getElementById('kpiTotal').textContent = facturas.length || '0';
  document.getElementById('kpiProv').textContent  = proveedores.length || '0';
  document.getElementById('kpiArt').textContent   = articulos.length || '0';
  if (facturas.length) {
    const mk = findKey(facturas[0], /monto|total|importe/i);
    document.getElementById('kpiMonto').textContent = mk
      ? fmtMoney(facturas.reduce((s, f) => s + parseNum(f[mk]), 0))
      : '—';
  } else {
    document.getElementById('kpiMonto').textContent = '0';
  }
}

function renderRecentFacturas() {
  const el = document.getElementById('recentFacturas');
  const rows = state.data.facturas.slice(-8).reverse();
  if (!rows.length) { el.innerHTML = '<div class="empty-state">Sin facturas registradas</div>'; return; }
  const keys = Object.keys(rows[0]).slice(0, 5);
  const head = keys.map(k => `<th>${k}</th>`).join('');
  const body = rows.map(r => `<tr>${keys.map(k => `<td>${r[k] || '—'}</td>`).join('')}</tr>`).join('');
  el.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderTopProveedores() {
  const el = document.getElementById('topProveedores');
  const rows = state.data.proveedores;
  if (!rows.length) { el.innerHTML = '<div class="empty-state">Sin proveedores registrados</div>'; return; }
  const nk = findKey(rows[0], /nombre|proveedor|name/i) || Object.keys(rows[0])[0];
  const mk = findKey(rows[0], /monto|total/i);
  const dk = findKey(rows[0], /cuit|rubro|categoria|tipo/i);
  el.innerHTML = rows.slice(0, 7).map(p => `
    <div class="prov-item">
      <div>
        <div class="prov-name">${p[nk] || '—'}</div>
        ${dk && p[dk] ? `<div class="prov-detail">${p[dk]}</div>` : ''}
      </div>
      ${mk && parseNum(p[mk]) > 0 ? `<div class="prov-amount">${fmtMoney(parseNum(p[mk]))}</div>` : ''}
    </div>`).join('');
}

function renderFacturasPage() {
  document.getElementById('facturasTable').innerHTML =
    buildTable(filterRows(state.data.facturas, document.getElementById('filterFactura')?.value || ''));
}

function renderArticulosPage() {
  document.getElementById('articulosTable').innerHTML =
    buildTable(filterRows(state.data.articulos, document.getElementById('filterArt')?.value || ''));
}

function renderProveedoresPage() {
  document.getElementById('proveedoresTable').innerHTML =
    buildTable(filterRows(state.data.proveedores, document.getElementById('filterProv')?.value || ''));
}
