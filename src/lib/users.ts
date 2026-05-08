// ─── Lharmonie Dashboard — Roles & Users ───
//
// Modelo de usuarios espejo del staff: lista hardcoded como fallback,
// fuente principal es el tab "Usuarios" del Sheet de Facturas. Cache
// runtime con TTL 60s.
//
// El dashboard tiene un universo de roles más chico que el staff (solo
// management), así que mapeamos a 3 niveles claros:

export type Role = 'owner' | 'admin' | 'viewer';

export interface UserConfig {
  email: string;
  name: string;
  role: Role;
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Todo + P&L + gestión de usuarios',
  admin: 'Dashboard completo, marca pagadas',
  viewer: 'Solo lectura (no marca pagadas)',
};

export const ROLE_COLORS: Record<Role, string> = {
  owner: 'var(--red)',
  admin: 'var(--accent)',
  viewer: 'var(--text-muted)',
};

// ─── Pantallas / capabilities del dashboard ──────────────────────────
//
// Pensado como capability flags más que routes — `marcar-pagada` es la
// única operación de write user-driven; `pyl` y `usuarios` son admin-only.

export type Capability =
  | 'inicio'
  | 'a-pagar'
  | 'pagadas'
  | 'proveedores'
  | 'productos'
  | 'pyl'
  | 'usuarios'
  | 'marcar-pagada';

export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  owner: [
    'inicio', 'a-pagar', 'pagadas', 'proveedores', 'productos',
    'pyl', 'usuarios', 'marcar-pagada',
  ],
  admin: [
    'inicio', 'a-pagar', 'pagadas', 'proveedores', 'productos',
    'marcar-pagada',
  ],
  viewer: [
    'inicio', 'a-pagar', 'pagadas', 'proveedores', 'productos',
  ],
};

// ─── Authorized users (hardcoded fallback) ──────────────────────────
//
// Si el Sheet no responde, el dashboard usa esta lista. Cuando el Sheet
// está disponible, sus filas tienen prioridad.

export const AUTHORIZED_USERS: UserConfig[] = [
  { email: 'martin.a.masri@gmail.com', name: 'Martin Masri', role: 'owner' },
  { email: 'cronklam@gmail.com', name: 'Cronklam', role: 'owner' },
];

// ─── Sheet-backed users (runtime cache) ─────────────────────────────

let _sheetUsers: UserConfig[] | null = null;
let _sheetUsersLastFetch = 0;
const SHEET_USERS_TTL = 60_000;

export function setSheetUsers(users: UserConfig[]) {
  _sheetUsers = users;
  _sheetUsersLastFetch = Date.now();
}

export function getSheetUsers(): UserConfig[] | null {
  if (_sheetUsers && Date.now() - _sheetUsersLastFetch < SHEET_USERS_TTL) {
    return _sheetUsers;
  }
  return null;
}

export function clearSheetUsersCache() {
  _sheetUsers = null;
  _sheetUsersLastFetch = 0;
}

// ─── Lookup helpers ─────────────────────────────────────────────────

function normalize(email: string | undefined | null): string | null {
  if (!email) return null;
  return email.toLowerCase().trim();
}

export function findUserByEmail(email: string | undefined | null): UserConfig | null {
  const n = normalize(email);
  if (!n) return null;
  const sheetUsers = getSheetUsers();
  if (sheetUsers && sheetUsers.length > 0) {
    const found = sheetUsers.find((u) => u.email.toLowerCase() === n);
    if (found) return found;
  }
  return AUTHORIZED_USERS.find((u) => u.email.toLowerCase() === n) || null;
}

export function isAuthorized(email: string | undefined | null): boolean {
  return findUserByEmail(email) !== null;
}

export function getUserRole(email: string | undefined | null): Role | null {
  return findUserByEmail(email)?.role ?? null;
}

export function isOwner(email: string | undefined | null): boolean {
  return getUserRole(email) === 'owner';
}

export function isAdmin(email: string | undefined | null): boolean {
  const role = getUserRole(email);
  return role === 'owner' || role === 'admin';
}

export function hasCapability(
  email: string | undefined | null,
  cap: Capability
): boolean {
  const role = getUserRole(email);
  if (!role) return false;
  return ROLE_CAPABILITIES[role].includes(cap);
}

/** Devuelve TODOS los usuarios (Sheet + hardcoded), deduped por email,
 *  con prioridad a los del Sheet. */
export function getAllUsers(): UserConfig[] {
  const all = new Map<string, UserConfig>();
  for (const u of AUTHORIZED_USERS) {
    all.set(u.email.toLowerCase(), u);
  }
  const sheetUsers = getSheetUsers();
  if (sheetUsers) {
    for (const u of sheetUsers) {
      all.set(u.email.toLowerCase(), u);
    }
  }
  return Array.from(all.values());
}
