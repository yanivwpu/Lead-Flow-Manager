/**
 * GoHighLevel / LeadConnector Marketplace OAuth URL builders.
 *
 * GHL documents a single chooselocation host, but two distinct flows:
 * - **OAuth authorization** (Connect CRM / Complete OAuth): client_id + redirect_uri + scope.
 *   Does NOT include version_id. Used for new authorization and re-authorization of an
 *   already-installed app to obtain tokens.
 * - **Marketplace install link** (first install from GHL portal): includes version_id.
 *   Paid apps must use this only inside the GHL platform; external install links error with
 *   "Paid apps can only be installed within the platform."
 *
 * @see https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0/
 * @see https://help.gohighlevel.com/support/solutions/articles/155000005002-api-security-oauth-consent-for-marketplace-apps
 */

export const DEFAULT_GHL_OAUTH_SCOPES = [
  "conversations.readonly",
  "conversations.write",
  "conversations/message.readonly",
  "conversations/message.write",
  "conversations/livechat.write",
  "locations.readonly",
  "contacts.write",
  "contacts.readonly",
].join(" ");

export function resolveGhlOAuthChooseLocationBase(): string {
  const override = String(process.env.GHL_OAUTH_CHOOSELOCATION_BASE || "").trim();
  if (override) return override.replace(/\/+$/, "");
  return "https://marketplace.leadconnectorhq.com/oauth/chooselocation";
}

const GHL_MARKETPLACE_OAUTH_BASE = resolveGhlOAuthChooseLocationBase();

export type GhlOAuthAuthorizeUrlParams = {
  clientId: string;
  redirectUri: string;
  scopes?: string;
};

export type GhlMarketplaceInstallUrlParams = GhlOAuthAuthorizeUrlParams & {
  versionId: string;
};

function buildGhlChooselocationQuery(params: {
  clientId: string;
  redirectUri: string;
  scopes?: string;
  versionId?: string;
}): URLSearchParams {
  const clientId = params.clientId.trim();
  const redirectUri = params.redirectUri.trim();
  if (!clientId || !redirectUri) {
    throw new Error("clientId and redirectUri are required to build the CRM OAuth URL");
  }

  const query = new URLSearchParams({
    response_type: "code",
    redirect_uri: redirectUri,
    client_id: clientId,
    scope: (params.scopes?.trim() || DEFAULT_GHL_OAUTH_SCOPES).trim(),
  });

  const versionId = params.versionId?.trim();
  if (versionId) {
    query.set("version_id", versionId);
  }

  return query;
}

/** Standard OAuth authorization — no version_id (Connect CRM / Complete OAuth / re-auth). */
export function buildGhlOAuthAuthorizeUrl(params: GhlOAuthAuthorizeUrlParams): string {
  const query = buildGhlChooselocationQuery(params);
  return `${GHL_MARKETPLACE_OAUTH_BASE}?${query.toString()}`;
}

/** Marketplace install link from developer portal — includes version_id (first-time install only). */
export function buildGhlMarketplaceInstallUrl(params: GhlMarketplaceInstallUrlParams): string {
  const versionId = params.versionId.trim();
  if (!versionId) {
    throw new Error("versionId is required to build the CRM marketplace install URL");
  }
  const query = buildGhlChooselocationQuery({ ...params, versionId });
  return `${GHL_MARKETPLACE_OAUTH_BASE}?${query.toString()}`;
}

/** Extract marketplace app id prefix (before optional suffix) for diagnostics. */
export function readGhlMarketplaceAppIdPrefix(clientId: string): string {
  const id = clientId.trim();
  const dash = id.indexOf("-");
  return dash > 0 ? id.slice(0, dash) : id;
}

/** True when URL targets marketplace install (version_id present) rather than OAuth authorize. */
export function ghlOAuthUrlIncludesVersionId(url: string): boolean {
  try {
    return new URL(url).searchParams.has("version_id");
  } catch {
    return url.includes("version_id=");
  }
}
