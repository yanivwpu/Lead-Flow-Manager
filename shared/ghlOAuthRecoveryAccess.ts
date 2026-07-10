import { parseProspectImportAllowedEmails } from "./prospectImportAccess";

/** Emails allowed to recover/link discarded GHL OAuth tokens (union with prospect-import allowlist). */
export function parseGhlOAuthRecoveryAllowedEmails(): string[] {
  const emails = new Set<string>();
  for (const email of parseProspectImportAllowedEmails()) {
    emails.add(email);
  }
  const dedicated = String(process.env.GHL_OAUTH_RECOVERY_ALLOWED_EMAILS || "").trim();
  if (dedicated) {
    for (const part of dedicated.split(",")) {
      const normalized = part.trim().toLowerCase();
      if (normalized) emails.add(normalized);
    }
  }
  return [...emails];
}

export function isGhlOAuthRecoveryAllowlisted(email: string | null | undefined): boolean {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  return parseGhlOAuthRecoveryAllowedEmails().includes(normalized);
}

export type GhlOAuthRecoveryAccessUser = {
  id: string;
  email?: string | null;
};

export type GhlOAuthRecoveryAccessSession = {
  isAdmin?: boolean;
};

/**
 * Sales Admin session (session.isAdmin) OR allowlisted workspace owner (e.g. YaBa).
 * Regular WhachatCRM login does NOT set session.isAdmin — only POST /api/admin/login does.
 */
export function canAccessGhlOAuthRecoveryTools(
  user: GhlOAuthRecoveryAccessUser | null | undefined,
  session?: GhlOAuthRecoveryAccessSession | null,
): boolean {
  if (!user?.id) return false;
  if (session?.isAdmin === true) return true;
  return isGhlOAuthRecoveryAllowlisted(user.email);
}
