/**
 * Lista hardcoded de emails autorizados a entrar al dashboard.
 *
 * Este dashboard es PRIVADO — solo management de Lharmonie. A diferencia
 * del staff app (que lee usuarios desde un Sheet), acá la lista vive en
 * código para mantenerlo aislado y controlado por commit.
 *
 * Para agregar a alguien, agregá su email acá y pusheá. Vercel auto-deploy.
 */
export const AUTHORIZED_EMAILS: readonly string[] = [
  'martin.a.masri@gmail.com',
  'cronklam@gmail.com',
  // 'iara.zayat@gmail.com',  // ← agregar cuando Martín confirme el email exacto de Iara
] as const;

export function isAuthorized(email: string | undefined | null): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  return AUTHORIZED_EMAILS.some((e) => e.toLowerCase().trim() === normalized);
}
