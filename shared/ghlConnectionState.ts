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
    const exact = rows.find(
      (r) => (r.locationId || "").trim() === loc && (r.companyId || "").trim() === company,
    );
    if (exact) return exact;
  }
  if (loc) {
    const byLocation = rows.find((r) => (r.locationId || "").trim() === loc);
    if (byLocation) return byLocation;
  }
  if (!company) return undefined;

  const companyRows = rows.filter((r) => (r.companyId || "").trim() === company);
  const companyWithoutLocation = companyRows.find((r) => !(r.locationId || "").trim());
  if (companyWithoutLocation) return companyWithoutLocation;

  const companyWithLocation = companyRows.filter((r) => Boolean((r.locationId || "").trim()));
  if (companyWithLocation.length === 1) return companyWithLocation[0];

  return undefined;
}

export type CrmMarketplaceConnectionState =
  | "connected"
  | "installed_incomplete"
  | "installed_expired"
  | "not_connected";

export function deriveCrmMarketplaceConnectionState(input: {
  hasUsableTokens: boolean;
  tokenExpired: boolean;
  hasActiveMarketplaceInstall: boolean;
  oauthPending?: boolean;
}): CrmMarketplaceConnectionState {
  const installed = input.hasActiveMarketplaceInstall || Boolean(input.oauthPending);
  if (input.hasUsableTokens && !input.tokenExpired) return "connected";
  if (installed && input.tokenExpired) return "installed_expired";
  if (installed && !input.hasUsableTokens) return "installed_incomplete";
  return "not_connected";
}

/**
 * Customer-facing "currently installed" — not inferred from tokens.
 * Leftover company-only Active OAuth duplicates after a location UNINSTALL
 * are not treated as an active Marketplace installation.
 */
export function hasCustomerFacingActiveGhlMarketplaceInstall(
  rows: Array<{
    locationId?: string | null;
    companyId?: string | null;
    installationStatus?: string | null;
  }>,
): boolean {
  if (!rows.length) return false;
  const active = rows.filter((r) => !isGhlMarketplaceUninstalled(r.installationStatus));
  if (active.length === 0) return false;
  if (active.some((r) => String(r.locationId || "").trim())) return true;

  const uninstalledLocationExists = rows.some(
    (r) => isGhlMarketplaceUninstalled(r.installationStatus) && String(r.locationId || "").trim(),
  );
  // Company-only Active OAuth duplicates left after a location UNINSTALL are not a current install.
  return !uninstalledLocationExists;
}

export const GHL_OAUTH_SECRET_PAYLOAD_KEYS = [
  "access_token",
  "refresh_token",
  "accessToken",
  "refreshToken",
  "refreshTokenId",
  "refresh_token_id",
  "authorizationCode",
  "authorization_code",
  "code",
  "client_secret",
  "clientSecret",
  "authorization",
  "Authorization",
  "cookie",
  "cookies",
  "set-cookie",
  "hmac",
  "signature",
  "state",
  "id_token",
  "idToken",
  "api_key",
  "apiKey",
  "secret",
] as const;

function normalizeGhlSensitiveKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const GHL_SENSITIVE_KEY_NORMALIZED = new Set(
  [
    "accesstoken",
    "refreshtoken",
    "refreshtokenid",
    "authorizationcode",
    "authorization",
    "clientsecret",
    "apikey",
    "idtoken",
    "cookie",
    "cookies",
    "setcookie",
    "hmac",
    "signature",
    "xghlsignature",
    "xwhsignature",
    "state",
    "secret",
    "code",
    "bearer",
  ],
);

export function isGhlSensitivePayloadKey(key: string): boolean {
  return GHL_SENSITIVE_KEY_NORMALIZED.has(normalizeGhlSensitiveKey(key));
}

export function collectGhlSensitivePayloadKeyNames(
  payload: unknown,
  found: Set<string> = new Set(),
): string[] {
  if (Array.isArray(payload)) {
    for (const item of payload) collectGhlSensitivePayloadKeyNames(item, found);
    return [...found].sort();
  }
  if (!payload || typeof payload !== "object") return [...found].sort();
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (isGhlSensitivePayloadKey(key)) found.add(key);
    collectGhlSensitivePayloadKeyNames(value, found);
  }
  return [...found].sort();
}

export function stripGhlOAuthSecretsFromPayload(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const sanitized = sanitizeGhlMarketplaceRawPayload(payload ?? {});
  if (sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)) {
    return sanitized as Record<string, unknown>;
  }
  return {};
}

export function sanitizeGhlMarketplaceRawPayload(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizeGhlMarketplaceRawPayload(item));
  }
  if (payload == null || typeof payload !== "object") return payload;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (isGhlSensitivePayloadKey(key)) continue;
    out[key] = sanitizeGhlMarketplaceRawPayload(value);
  }
  return out;
}

export function ghlPayloadContainsOAuthSecrets(payload: unknown): boolean {
  return collectGhlSensitivePayloadKeyNames(payload).length > 0;
}

/** Overlay sanitized lifecycle fields; never persist secrets into raw_payload. */
export function mergeGhlLifecycleRawPayload(
  existing: Record<string, unknown> | null | undefined,
  sanitized: Record<string, unknown>,
): Record<string, unknown> {
  const base = existing && typeof existing === "object" ? { ...existing } : {};
  return stripGhlOAuthSecretsFromPayload({ ...base, ...sanitized });
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
