/* ============================================================
   Lharmonie Dashboard — Lógica de aplicación
   Cronklam SRL
   ============================================================ */

// ---- CONFIGURACIÓN ----

const CONFIG = {
  SHEET_ID: '1lZER27XWpUIaRIeosoJjMhXaclj8MS-6thOeQ3O3a8o',
  API_KEY:  'AIzaSyCj1vL8svli0VUdZOPb7ADZkRBhCQBLe2o',
  TABS: {
    facturas:    'Facturas',
    articulos:   'Artículos',
    proveedores: 'Proveedores',
  },
};

const USERS = {
  martin:  { pass: '0706', name: 'Martín Masri',  role: 'Administrador' },
  melanie: { pass: '2607', name: 'Melanie',        role: 'Gestión'       },
  iara:    { pass: '3611', name: 'Iara',           role: 'Gestión'       },
};

// ---- ESTADO ----

let state = {
  user: null,
  data: { facturas: [], articulos: [], proveedores: [] },
};

// ---- AUTH ----

function doLogin() {
  const username = document.getElementById('loginUser').value.trim().toLowerCase();
  const password  = document.getElementById('loginPass').value.trim();
  const errorEl   = document.getElementById('loginError');

  const user = USERS[username];
  if (user && user.pass === password) {
    state.user = { username, ...user };
    document.getElementById('sidebarUser').textContent = user.name;
    document.getElementById('sidebarRole').textContent = user.role;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appShell').style.display    = 'flex';
    errorEl.textContent = '';
    loadAll();
  } else {
    errorEl.textContent = 'Usuario o contraseña incorrectos';
  }
}

function doLogout() {
  state.user = null;
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appShell').style.display    = 'none';
  document.getElementById('loginUser').value  = '';
  document.getElementById('loginPass').value  = '';
  document.getElementById('loginError').textContent = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const loginVisible = document.getElementById('loginScreen').style.display !== 'none';
    if (loginVisible) doLogin();
  }
});

// ---- NAVEGACIÓN ----

const PAGE_TITLES = {
  resumen:     'Resumen',
  facturas:    'Facturas',
  articulos:   'Artículos',
  proveedores: 'Proveedores',
};

function showPage(name, activeBtn) {
  // páginas
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');

  // nav items
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  if (activeBtn) activeBtn.classList.add('active');

  // título
  document.getElementById('topbarTitle').textContent = PAGE_TITLES[name] || name;
}

// ---- DATA: GOOGLE SHEETS ----

async function fetchTab(tabName) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent(tabName)}?key=${CONFIG.API_KEY}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al cargar ${tabName}`);
  const json = await res.json();
  return json.values || [];
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
    return obj;
  });
}

async function loadAll() {
  const btn    = document.getElementById('syncBtn');
  const status = document.getElementById('syncStatus');

  btn.disabled     = true;
  btn.textContent  = 'Actualizando…';
  status.textContent = 'Sincronizando con Sheets…';

  try {
    const [facRows, artRows, provRows] = await Promise.all([
      fetchTab(CONFIG.TABS.facturas),
      fetchTab(CONFIG.TABS.articulos),
      fetchTab(CONFIG.TABS.proveedores),
    ]);

    state.data.facturas    = rowsToObjects(facRows);
    state.data.articulos   = rowsToObjects(artRows);
    state.data.proveedores = rowsToObjects(provRows);

    renderAll();

    const now = new Date();
    status.textContent = `Actualizado ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;

  } catch (err) {
    console.error('Error cargando datos:', err);
    status.textContent = 'Error al cargar datos';
    setLoadingError(['recentFacturas', 'topProveedores', 'facturasTable', 'articulosTable', 'proveedoresTable']);
  }

  btn.disabled    = false;
  btn.textContent = 'Actualizar datos';
}

function setLoadingError(ids) {
  const msg = '<div class="error-msg">No se pudieron cargar los datos. Verificá la conexión al Sheet.</div>';
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = msg;
  });
}

// ---- HELPERS ----

function parseNum(v) {
  if (!v && v !== 0) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.,\-]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function fmtMoney(n) {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

function findKey(obj, regex) {
  return Object.keys(obj).find((k) => regex.test(k));
}

function filterRows(rows, query) {
  if (!query) return rows;
  const q = query.toLowerCase();
  return rows.filter((r) =>
    Object.values(r).some((v) => String(v).toLowerCase().includes(q))
  );
}

function buildTable(rows) {
  if (!rows.length) return '<div class="empty-state">Sin resultados</div>';
  const keys = Object.keys(rows[0]);
  const head = keys.map((k) => `<th>${k}</th>`).join('');
  const body = rows.map((r) =>
    `<tr>${keys.map((k) => `<td>${r[k] !== '' ? r[k] : '—'}</td>`).join('')}</tr>`
  ).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// ---- RENDER ----

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

  // suma montos si existe columna de monto
  if (facturas.length) {
    const montoKey = findKey(facturas[0], /monto|total|importe/i);
    if (montoKey) {
      const total = facturas.reduce((s, f) => s + parseNum(f[montoKey]), 0);
      document.getElementById('kpiMonto').textContent = fmtMoney(total);
    } else {
      document.getElementById('kpiMonto').textContent = '—';
    }
  } else {
    document.getElementById('kpiMonto').textContent = '0';
  }
}

function renderRecentFacturas() {
  const el   = document.getElementById('recentFacturas');
  const rows = state.data.facturas.slice(-8).reverse();
  if (!rows.length) {
    el.innerHTML = '<div class="empty-state">Sin facturas registradas</div>';
    return;
  }
  // mostrar solo primeras 5 columnas para no saturar
  const allKeys = Object.keys(rows[0]);
  const keys    = allKeys.slice(0, 5);
  const head    = keys.map((k) => `<th>${k}</th>`).join('');
  const body    = rows.map((r) =>
    `<tr>${keys.map((k) => `<td>${r[k] || '—'}</td>`).join('')}</tr>`
  ).join('');
  el.innerHTML  = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderTopProveedores() {
  const el   = document.getElementById('topProveedores');
  const rows = state.data.proveedores;
  if (!rows.length) {
    el.innerHTML = '<div class="empty-state">Sin proveedores registrados</div>';
    return;
  }

  const nameKey   = rows[0] ? (findKey(rows[0], /nombre|proveedor|name/i) || Object.keys(rows[0])[0]) : null;
  const montoKey  = rows[0] ? findKey(rows[0], /monto|total/i) : null;
  const detailKey = rows[0] ? findKey(rows[0], /cuit|rubro|categoria|tipo/i) : null;

  el.innerHTML = rows.slice(0, 7).map((p) => {
    const nombre = nameKey  ? (p[nameKey]  || '—') : '—';
    const monto  = montoKey ? parseNum(p[montoKey]) : 0;
    const detail = detailKey ? p[detailKey] : '';
    return `
      <div class="prov-item">
        <div>
          <div class="prov-name">${nombre}</div>
          ${detail ? `<div class="prov-detail">${detail}</div>` : ''}
        </div>
        ${monto > 0 ? `<div class="prov-amount">${fmtMoney(monto)}</div>` : ''}
      </div>`;
  }).join('');
}

function renderFacturasPage() {
  const el    = document.getElementById('facturasTable');
  const query = document.getElementById('filterFactura')?.value || '';
  const rows  = filterRows(state.data.facturas, query);
  el.innerHTML = buildTable(rows);
}

function renderArticulosPage() {
  const el    = document.getElementById('articulosTable');
  const query = document.getElementById('filterArt')?.value || '';
  const rows  = filterRows(state.data.articulos, query);
  el.innerHTML = buildTable(rows);
}

function renderProveedoresPage() {
  const el    = document.getElementById('proveedoresTable');
  const query = document.getElementById('filterProv')?.value || '';
  const rows  = filterRows(state.data.proveedores, query);
  el.innerHTML = buildTable(rows);
}
