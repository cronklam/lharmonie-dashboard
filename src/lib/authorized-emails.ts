// Shim de compatibilidad. La fuente de verdad es `lib/users.ts` —
// ahora con sistema Sheet-backed (tab "Usuarios" del Sheet de Facturas)
// con fallback hardcoded a `AUTHORIZED_USERS`.
//
// Este archivo se mantiene para no romper imports existentes.

export {
  AUTHORIZED_USERS,
  isAuthorized,
  isAdmin,
  isOwner,
  findUserByEmail,
  getUserRole,
  hasCapability,
  type Role,
  type UserConfig,
  type Capability,
} from './users';

export type AuthorizedUser = import('./users').UserConfig;
