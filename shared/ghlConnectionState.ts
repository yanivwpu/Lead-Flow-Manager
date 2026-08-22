/**
 * Canonical GHL / CRM connection state for Sales Admin and marketplace linking.
 * Does not read tokens for display — callers pass booleans / trimmed token presence.
 */

export type GhlAdminLinkState = "Linked" | "Unmatched" | "Uninstalled";

export type GhlIntegrationConnectionFields = {
  type?: string | null;
  isActive?: boolean | null;
  accessToken?: string | null;
  userId?: string | null;
};

export type GhlMarketplaceConnectionFields = {
  locationId?: string | null;
  companyId?: string | null;
  integrationId?: string | null;
  whachatUserId?: string | null;
  installationStatus?: string | null;
  source?: string | null;
};

/** Normalize marketplace install status variants from GHL CSV / webhooks. */
export function normalizeGhlMarketplaceInstallStatus(
  status: string | null | undefined,
): string | null {
  if (status == null) return null;
  const trimmed = String(status).trim();
  if (!trimmed) return null;
  const compact = trimmed.toLowerCase().replace(/[_-\s]+/g, "");
  if (compact === "uninstalled" || compact === "revoked") return "Uninstalled";
  if (compact === "active" || compact === "installed") return "Active";
  return trimmed;
}

export function isGhlMarketplaceUninstalled(status: string | null | undefined): boolean {
  return normalizeGhlMarketplaceInstallStatus(status) === "Uninstalled";
}

export function formatGhlInstallSource(source: string | null | undefined): string {
  const s = String(source || "").trim().toLowerCase();
  if (s === "oauth") return "OAuth";
  if (s === "csv") return "CSV";
  if (s === "webhook") return "webhook";
  if (s === "merged") return "merged";
  if (s === "integration") return "integration";
  if (s === "marketplace") return "marketplace";
  return source?.trim() || "unknown";
}

/**
 * Usable GHL integration: type gohighlevel, active, linked to a user, has an access token.
 * Marketplace uninstall is applied separately via isUsableGhlConnectionForUser.
 */
export function isUsableGhlIntegration(integration: GhlIntegrationConnectionFields | null | undefined): boolean {
  if (!integration) return false;
  if (String(integration.type || "").toLowerCase() !== "gohighlevel") return false;
  if (integration.isActive === false) return false;
  if (!integration.userId) return false;
  return String(integration.accessToken || "").trim().length > 0;
}

/**
 * GREEN CRM for a WhachatCRM account: usable integration, and any linked marketplace
 * row is not uninstalled/revoked.
 */
export function isUsableGhlConnectionForUser(input: {
  integration: GhlIntegrationConnectionFields | null | undefined;
  marketplace?: Pick<GhlMarketplaceConnectionFields, "installationStatus"> | null;
}): boolean {
  if (!isUsableGhlIntegration(input.integration)) return false;
  if (input.marketplace && isGhlMarketplaceUninstalled(input.marketplace.installationStatus)) {
    return false;
  }
  return true;
}

export function classifyGhlAdminLinkState(input: {
  marketplaceStatus?: string | null;
  hasMarketplaceRow?: boolean;
  integration?: GhlIntegrationConnectionFields | null;
}): GhlAdminLinkState {
  if (isGhlMarketplaceUninstalled(input.marketplaceStatus)) return "Uninstalled";
  if (input.integration && input.integration.isActive === false) return "Uninstalled";
  if (isUsableGhlConnectionForUser({ integration: input.integration, marketplace: { installationStatus: input.marketplaceStatus } })) {
    return "Linked";
  }
  return "Unmatched";
}

/** Marketplace install that is still "installed" but has no usable WhachatCRM integration. */
export function isUnmatchedGhlMarketplaceInstall(input: {
  marketplace: GhlMarketplaceConnectionFields;
  integration?: GhlIntegrationConnectionFields | null;
}): boolean {
  if (isGhlMarketplaceUninstalled(input.marketplace.installationStatus)) return false;
  return classifyGhlAdminLinkState({
    marketplaceStatus: input.marketplace.installationStatus,
    hasMarketplaceRow: true,
    integration: input.integration,
  }) === "Unmatched";
}

export function selectMarketplaceRowForOAuthLink<
  T extends { locationId?: string | null; companyId?: string | null },
>(
  rows: T[],
  locationId: string | null | undefined,
  companyId: string | null | undefined,
): T | undefined {
  const loc = (locationId || "").trim() || null;
  const company = (companyId || "").trim() || null;
  if (!loc && !company) return undefined;

  if (loc && company) {
    return rows.find((r) => (r.locationId || "").trim() === loc && (r.companyId || "").trim() === company);
  }
  if (loc) {
    return rows.find((r) => (r.locationId || "").trim() === loc);
  }
  return rows.find((r) => (r.companyId || "").trim() === company && !(r.locationId || "").trim());
}

const ADMIN_SECRET_KEYS = [
  "access_token",
  "refresh_token",
  "accessToken",
  "refreshToken",
  "rawPayload",
  "client_secret",
  "clientSecret",
];

export function assertNoGhlSecretsInAdminPayload(payload: unknown): void {
  const json = JSON.stringify(payload);
  for (const key of ADMIN_SECRET_KEYS) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Admin GHL payload must not include ${key}`);
    }
  }
}
