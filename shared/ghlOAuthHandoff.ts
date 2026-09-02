/**
 * Pure GHL OAuth pending-handoff helpers (no I/O).
 * Tokens themselves are never represented here — only hashes, expiry, and claim rules.
 */

export const GHL_OAUTH_HANDOFF_COOKIE = "ghl_oauth_handoff";
export const GHL_OAUTH_HANDOFF_TTL_MS = 30 * 60 * 1000;
export const GHL_OAUTH_HANDOFF_POST_AUTH_REDIRECT = "/app/integrations";

/** True only for a same-origin, already-validated Integrations handoff redirect. */
export function isCrmMarketplaceHandoffRedirect(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== "string") return false;
  let candidate = raw.trim();
  if (!candidate) return false;
  if (candidate.startsWith("%2F") || candidate.startsWith("%2f")) {
    try {
      candidate = decodeURIComponent(candidate);
    } catch {
      return false;
    }
  }
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("://")) {
    return false;
  }
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return false;
  try {
    const resolved = new URL(candidate, "https://placeholder.local");
    return resolved.pathname === GHL_OAUTH_HANDOFF_POST_AUTH_REDIRECT;
  } catch {
    return false;
  }
}

export type GhlOAuthHandoffClaimFailure =
  | "missing_token"
  | "not_found"
  | "expired"
  | "already_consumed"
  | "hash_mismatch"
  | "decrypt_failed"
  | "identity_mismatch";

export type GhlOAuthHandoffRowView = {
  claimTokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  companyId: string;
  locationId: string | null;
  appId?: string | null;
  versionId?: string | null;
  ghlUserId?: string | null;
};

export function evaluateGhlOAuthHandoffClaim(
  row: GhlOAuthHandoffRowView | null | undefined,
  tokenHash: string | null | undefined,
  now: Date = new Date(),
): { ok: true } | { ok: false; reason: GhlOAuthHandoffClaimFailure } {
  if (!tokenHash || !tokenHash.trim()) return { ok: false, reason: "missing_token" };
  if (!row) return { ok: false, reason: "not_found" };
  if (row.consumedAt) return { ok: false, reason: "already_consumed" };
  const expiresAt = row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || now.getTime() > expiresAt.getTime()) {
    return { ok: false, reason: "expired" };
  }
  if (row.claimTokenHash !== tokenHash) return { ok: false, reason: "hash_mismatch" };
  return { ok: true };
}

/**
 * A claim may only attach the GHL identity stored on the handoff.
 * Client-supplied company/location/app ids are rejected when they disagree.
 */
export function assertHandoffIdentityMatch(
  row: Pick<GhlOAuthHandoffRowView, "companyId" | "locationId" | "appId" | "versionId" | "ghlUserId">,
  claimed: {
    companyId?: string | null;
    locationId?: string | null;
    appId?: string | null;
    versionId?: string | null;
    ghlUserId?: string | null;
  },
): { ok: true } | { ok: false; reason: "identity_mismatch" } {
  const same = (a?: string | null, b?: string | null) => {
    const left = (a || "").trim();
    const right = (b || "").trim();
    if (!right) return true;
    return left === right;
  };
  if (!same(row.companyId, claimed.companyId)) return { ok: false, reason: "identity_mismatch" };
  if (!same(row.locationId, claimed.locationId)) return { ok: false, reason: "identity_mismatch" };
  if (!same(row.appId, claimed.appId)) return { ok: false, reason: "identity_mismatch" };
  if (!same(row.versionId, claimed.versionId)) return { ok: false, reason: "identity_mismatch" };
  if (!same(row.ghlUserId, claimed.ghlUserId)) return { ok: false, reason: "identity_mismatch" };
  return { ok: true };
}
