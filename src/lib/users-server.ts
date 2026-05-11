import 'server-only';

// Helpers que dependen de googleapis y solo deben correr server-side.
// Todo lo que toque el Sheet de "Usuarios" pasa por acá.
//
// Patrón espejo del staff (`src/lib/users-server.ts` allá): refresh
// idempotente con TTL 60s, fallback silencioso si no hay credenciales.

import { google } from 'googleapis';
import {
  setSheetUsers,
  getSheetUsers,
  clearSheetUsersCache,
  AUTHORIZED_USERS,
  ROLE_LABELS,
  type Role,
  type UserConfig,
} from './users';

const SHEET_ID = process.env.FACTURAS_SHEET_ID || '';
const TAB = 'Usuarios';
const HEADERS = ['Email', 'Nombre', 'Rol', 'Activo', 'Agregado por', 'Fecha'];

function getAuth() {
  const creds = process.env.GOOGLE_CREDENTIALS;
  if (!creds) return null;
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(creds),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export function getSheetsClient() {
  const auth = getAuth();
  if (!auth) return null;
  return google.sheets({ version: 'v4', auth });
}

type SheetsClient = NonNullable<ReturnType<typeof getSheetsClient>>;

/** Crea el tab "Usuarios" con headers + seed si no existe. Idempotente. */
export async function ensureUsuariosTab(sheets: SheetsClient): Promise<void> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets.properties.title',
  });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === TAB);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: TAB } } }],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${TAB}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
  });
  const seed = AUTHORIZED_USERS.map((u) => [
    u.email,
    u.name,
    u.role,
    'Sí',
    'sistema',
    new Date().toISOString(),
  ]);
  if (seed.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `'${TAB}'!A2`,
      valueInputOption: 'RAW',
      requestBody: { values: seed },
    });
  }
}

export interface UsuarioRow {
  email: string;
  name: string;
  role: string;
  activo: string;
  addedBy: string;
  date: string;
}

export function rowToUser(row: string[]): UserConfig | null {
  const email = (row[0] || '').trim().toLowerCase();
  const name = (row[1] || '').trim();
  const role = (row[2] || 'viewer').trim().toLowerCase() as Role;
  const activo = (row[3] || 'Sí').trim();
  if (!email || activo === 'No') return null;
  if (!ROLE_LABELS[role]) return null;
  return { email, name, role };
}

export function rowToRaw(row: string[]): UsuarioRow {
  return {
    email: row[0] || '',
    name: row[1] || '',
    role: row[2] || 'viewer',
    activo: row[3] || 'Sí',
    addedBy: row[4] || '',
    date: row[5] || '',
  };
}

/** Refresca el cache desde el Sheet si está vencido. Silencioso. */
export async function refreshSheetUsersCache(): Promise<void> {
  if (getSheetUsers()) return;
  try {
    const sheets = getSheetsClient();
    if (!sheets || !SHEET_ID) return;
    await ensureUsuariosTab(sheets);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${TAB}'!A2:F500`,
    });
    const rows = res.data.values || [];
    const users: UserConfig[] = [];
    for (const row of rows) {
      const u = rowToUser(row);
      if (u) users.push(u);
    }
    if (users.length > 0) setSheetUsers(users);
  } catch {
    // silencioso — fallback a hardcoded
  }
}

/** Lee filas crudas del Sheet (incluye Activo=No). Hidrata cache. */
export async function readUsuariosRaw(): Promise<{
  users: UserConfig[];
  rows: UsuarioRow[];
  source: 'sheet' | 'hardcoded';
}> {
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    return { users: AUTHORIZED_USERS, rows: [], source: 'hardcoded' };
  }
  await ensureUsuariosTab(sheets);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${TAB}'!A2:F500`,
  });
  const rows = res.data.values || [];
  const users: UserConfig[] = [];
  const rawRows: UsuarioRow[] = [];
  for (const row of rows) {
    const u = rowToUser(row);
    if (u) users.push(u);
    rawRows.push(rowToRaw(row));
  }
  setSheetUsers(users);
  return { users, rows: rawRows, source: 'sheet' };
}

export interface UpsertInput {
  email: string;
  name: string;
  role: Role;
  activo?: string;
  addedBy: string;
}

/** Upsert (insert o update si ya existe email). Limpia cache al terminar. */
export async function upsertUsuario(
  input: UpsertInput
): Promise<{ action: 'created' | 'updated' }> {
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    throw new Error('Sheets no configurado (falta GOOGLE_CREDENTIALS o FACTURAS_SHEET_ID)');
  }
  await ensureUsuariosTab(sheets);
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${TAB}'!A2:F500`,
  });
  const rows = existing.data.values || [];
  const normalized = input.email.toLowerCase().trim();
  const existingIdx = rows.findIndex(
    (r) => (r[0] || '').toLowerCase().trim() === normalized
  );
  const fecha = new Date().toISOString();
  const values = [[
    input.email,
    input.name,
    input.role,
    input.activo ?? 'Sí',
    input.addedBy,
    fecha,
  ]];
  if (existingIdx >= 0) {
    const rowNum = existingIdx + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${TAB}'!A${rowNum}:F${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
    clearSheetUsersCache();
    return { action: 'updated' };
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${TAB}'!A2`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
  clearSheetUsersCache();
  return { action: 'created' };
}

/** Borra fila del Sheet matcheada por email. Hard delete (no soft). */
export async function deleteUsuario(email: string): Promise<{ deleted: boolean }> {
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    throw new Error('Sheets no configurado (falta GOOGLE_CREDENTIALS o FACTURAS_SHEET_ID)');
  }
  await ensureUsuariosTab(sheets);
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${TAB}'!A2:F500`,
  });
  const rows = existing.data.values || [];
  const normalized = email.toLowerCase().trim();
  const existingIdx = rows.findIndex(
    (r) => (r[0] || '').toLowerCase().trim() === normalized,
  );
  if (existingIdx < 0) {
    clearSheetUsersCache();
    return { deleted: false };
  }
  // Para borrar la fila completa hay que usar batchUpdate con
  // DeleteDimensionRequest. El sheetId del tab "Usuarios" lo
  // obtenemos vía spreadsheets.get.
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets.properties(title,sheetId)',
  });
  const tabMeta = meta.data.sheets?.find((s) => s.properties?.title === TAB);
  const tabSheetId = tabMeta?.properties?.sheetId;
  if (tabSheetId == null) {
    throw new Error(`No se pudo encontrar sheetId del tab "${TAB}"`);
  }
  const startIndex = existingIdx + 1; // fila 0-based; row 1 = header
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: tabSheetId,
              dimension: 'ROWS',
              startIndex,
              endIndex: startIndex + 1,
            },
          },
        },
      ],
    },
  });
  clearSheetUsersCache();
  return { deleted: true };
}
