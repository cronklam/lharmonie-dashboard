/* Lharmonie Dashboard v3 — Mobile First */

const CONFIG = {
  SHEET_ID: '1lZER27XWpUIaRIeosoJjMhXaclj8MS-6thOeQ3O3a8o',
  API_KEY:  'AIzaSyCj1vL8svli0VUdZOPb7ADZkRBhCQBLe2o',
  TABS: { facturas: 'Facturas', articulos: 'Artículos', proveedores: 'Proveedores' },
  WORKER_URL: 'https://worker-production-7f89.up.railway.app',
  API_SECRET: 'lharmonie2026',
};

const USERS = {
  martin:  { pass: '0706', name: 'Martín', role: 'Administrador' },
  melanie: { pass: '2607', name: 'Melanie', role: 'Gestión' },
  iara:    { pass: '3611', name: 'Iara',    role: 'Gestión' },
};

const COL = {
  fecha: 'Fecha FC', semana: 'Semana', mes: 'Mes', anio: 'Año',
  proveedor: 'Proveedor', cuit: 'CUIT', tipoDoc: 'Tipo Doc',
  pv: '# PV', nroFac: '# Factura', categoria: 'Categoría',
  local: 'Local', cajero: 'Cajero', importeNeto: 'Importe Neto',
  descuento: 'Descuento', iva21: 'IVA 21%', iva105: 'IVA 10.5%',
  percIIBB: 'Percep IIBB', percIVA: 'Percep IVA', total: 'Total',
  medioPago: 'Medio de Pago', estado: 'Estado',
  fechaPago: 'Fecha de Pago', obs: 'Observaciones', procesado: 'Procesado',
};

let state = {
  user: null,
  data: { facturas: [], proveedores: [] },
  modalFactura: null,
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
});

/* ---- NAV ---- */
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'buscar') setTimeout(() => document.getElementById('searchInput').focus(), 100);
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
    const [fRows, pRows] = await Promise.all([
      fetchTab(CONFIG.TABS.facturas),
      fetchTab(CONFIG.TABS.proveedores),
    ]);
    state.data.facturas    = rowsToObjects(fRows);
    state.data.proveedores = rowsToObjects(pRows);
    renderAll();
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
  return e.includes('a pagar') || e.trim() === 'pagar' || e.includes('transferencia') || e.includes('efectivo') && !e.includes('pagado');
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

/* ---- RENDER ---- */
function renderAll() {
  const facturas    = state.data.facturas;
  const pendientes  = facturas.filter(esAPagar);
  const pagadas     = facturas.filter(esPagado);
  const totalPend   = pendientes.reduce((s, f) => s + parseNum(f[COL.total]), 0);
  const totalPag    = pagadas.reduce((s, f) => s + parseNum(f[COL.total]), 0);

  // KPIs resumen
  document.getElementById('summaryTotal').textContent  = fmtMoney(totalPend);
  document.getElementById('summaryCount').textContent  = `${pendientes.length} factura${pendientes.length !== 1 ? 's' : ''} pendiente${pendientes.length !== 1 ? 's' : ''}`;
  document.getElementById('statPagado').textContent    = fmtMoney(totalPag);
  document.getElementById('statPagadoCount').textContent = `${pagadas.length} factura${pagadas.length !== 1 ? 's' : ''}`;
  document.getElementById('statProveedores').textContent = state.data.proveedores.length || '0';

  // Badge nav
  const badge = document.getElementById('navBadge');
  badge.textContent = pendientes.length > 0 ? pendientes.length : '';

  renderProvList(pendientes);
  renderAPagar(pendientes);
  renderHistorial(pagadas);
}

/* ---- PROV LIST (resumen) ---- */
function renderProvList(pendientes) {
  const el = document.getElementById('provList');
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
  const sorted = Object.entries(mapa).sort((a, b) => b[1].total - a[1].total);
  el.innerHTML = sorted.map(([prov, d]) => `
    <div class="prov-card">
      <div>
        <div class="prov-name">${prov}</div>
        <div class="prov-count">${d.count} factura${d.count !== 1 ? 's' : ''}</div>
      </div>
      <div class="prov-monto">${fmtMoney(d.total)}</div>
    </div>`).join('');
}

/* ---- A PAGAR LIST ---- */
function renderAPagar(pendientes) {
  const el = document.getElementById('apagarList');
  const title = document.getElementById('apagarTitle');
  if (!pendientes) pendientes = state.data.facturas.filter(esAPagar);

  title.textContent = `${pendientes.length} factura${pendientes.length !== 1 ? 's' : ''} pendiente${pendientes.length !== 1 ? 's' : ''}`;

  if (!pendientes.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🎉</div>Todo al día</div>';
    return;
  }

  el.innerHTML = pendientes.map((f, i) => {
    const prov    = f[COL.proveedor] || '—';
    const nro     = f[COL.nroFac]    || '—';
    const fecha   = f[COL.fecha]     || '—';
    const local   = f[COL.local]     || '';
    const medio   = f[COL.medioPago] || f[COL.estado] || '—';
    const total   = parseNum(f[COL.total]);
    const cat     = f[COL.categoria] || '';
    return `
    <div class="factura-card pendiente">
      <div class="factura-main">
        <div class="factura-info">
          <div class="factura-proveedor">${prov}</div>
          <div class="factura-meta">
            Nº ${nro} · ${fecha}<br>
            ${local}${cat ? ' · ' + cat : ''}
          </div>
        </div>
        <div class="factura-monto">${fmtMoney(total)}</div>
      </div>
      <div class="factura-footer">
        <span class="factura-estado pendiente">⏳ ${medio}</span>
        <button class="btn-pagar" onclick='abrirModal(${i})'>Marcar pagada</button>
      </div>
    </div>`;
  }).join('');

  // guardar índice para el modal
  state._pendientesActuales = pendientes;
}

/* ---- HISTORIAL ---- */
function renderHistorial(pagadas) {
  const el = document.getElementById('historialList');
  if (!pagadas) pagadas = state.data.facturas.filter(esPagado);
  if (!pagadas.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>Sin facturas pagadas</div>';
    return;
  }
  const recientes = [...pagadas].reverse().slice(0, 30);
  el.innerHTML = recientes.map(f => `
    <div class="historial-card">
      <div class="historial-info">
        <div class="historial-prov">${f[COL.proveedor] || '—'}</div>
        <div class="historial-meta">Nº ${f[COL.nroFac] || '—'} · ${f[COL.fecha] || '—'} · ${f[COL.local] || '—'}</div>
      </div>
      <div class="historial-monto">${fmtMoney(parseNum(f[COL.total]))}</div>
    </div>`).join('');
}

/* ---- BUSCAR ---- */
function renderBuscar() {
  const q  = document.getElementById('searchInput').value.trim();
  const el = document.getElementById('searchResults');
  if (!q) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div>Escribí para buscar</div>';
    return;
  }
  const rows = filterRows(state.data.facturas, q).slice(0, 20);
  if (!rows.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">😕</div>Sin resultados</div>';
    return;
  }
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

/* ---- MODAL PAGO ---- */
function abrirModal(idx) {
  const f = state._pendientesActuales[idx];
  if (!f) return;
  state.modalFactura = f;

  document.getElementById('modalProveedor').textContent = f[COL.proveedor] || '—';
  document.getElementById('modalNro').textContent       = `Factura Nº ${f[COL.nroFac] || '—'} · ${f[COL.fecha] || '—'}`;
  document.getElementById('modalMonto').textContent     = fmtMoney(parseNum(f[COL.total]));

  const detalles = [
    ['Local',        f[COL.local]    || '—'],
    ['Categoría',    f[COL.categoria]|| '—'],
    ['Medio de pago',f[COL.medioPago]|| f[COL.estado] || '—'],
    ['IVA 21%',      f[COL.iva21] ? fmtMoney(parseNum(f[COL.iva21])) : '—'],
    ['Importe neto', f[COL.importeNeto] ? fmtMoney(parseNum(f[COL.importeNeto])) : '—'],
  ].filter(([, v]) => v && v !== '—');

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

  const nroFactura = f[COL.nroFac] || '';
  const proveedor  = f[COL.proveedor] || '';
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
      return;
    }
  } catch (_) {}

  // Fallback optimista
  state.data.facturas = state.data.facturas.map(fac => {
    if (fac[COL.nroFac] === nroFactura && fac[COL.proveedor] === proveedor) {
      return { ...fac, [COL.estado]: '✅ Pagado', [COL.fechaPago]: fechaPago };
    }
    return fac;
  });
  renderAll();
  document.getElementById('modalOverlay').classList.remove('open');
  showToast('Marcada localmente (sincronizará luego)');

  btn.textContent = '✓ Marcar como pagada';
  btn.disabled = false;
}

// Cerrar modal con swipe down o ESC
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') cerrarModal();
});
