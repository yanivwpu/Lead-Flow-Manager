/** GoHighLevel / LeadConnector Marketplace OAuth install URL builder. */

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

const GHL_MARKETPLACE_OAUTH_BASE = "https://marketplace.leadconnectorhq.com/oauth/chooselocation";

export type GhlMarketplaceInstallUrlParams = {
  clientId: string;
  redirectUri: string;
  versionId: string;
  scopes?: string;
};

export function buildGhlMarketplaceInstallUrl(params: GhlMarketplaceInstallUrlParams): string {
  const clientId = params.clientId.trim();
  const redirectUri = params.redirectUri.trim();
  const versionId = params.versionId.trim();
  if (!clientId || !redirectUri || !versionId) {
    throw new Error("clientId, redirectUri, and versionId are required to build the CRM install URL");
  }

  const query = new URLSearchParams({
    response_type: "code",
    redirect_uri: redirectUri,
    client_id: clientId,
    scope: (params.scopes?.trim() || DEFAULT_GHL_OAUTH_SCOPES).trim(),
    version_id: versionId,
  });

  return `${GHL_MARKETPLACE_OAUTH_BASE}?${query.toString()}`;
}

/** Extract marketplace app id prefix (before optional suffix) for diagnostics. */
export function readGhlMarketplaceAppIdPrefix(clientId: string): string {
  const id = clientId.trim();
  const dash = id.indexOf("-");
  return dash > 0 ? id.slice(0, dash) : id;
}
