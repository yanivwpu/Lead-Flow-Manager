/**
 * Sales Admin auth — separate from WhachatCRM owner/user login.
 * Only POST /api/admin/login sets session.isAdmin; token is x-admin-token.
 */

export type AdminAccessCheckInput = {
  sessionIsAdmin?: boolean | null;
  adminToken?: string | null;
};

/**
 * Pure gate used by requireAdmin and tests.
 * Token verification is injected so this stays sync-friendly for session-only checks.
 */
export function hasAdminSession(input: AdminAccessCheckInput): boolean {
  return input.sessionIsAdmin === true;
}

export async function isAdminAuthorized(
  input: AdminAccessCheckInput,
  verifyAdminToken: (token: string) => Promise<boolean>,
): Promise<boolean> {
  if (hasAdminSession(input)) return true;
  const token = String(input.adminToken || "").trim();
  if (!token) return false;
  return verifyAdminToken(token);
}
