import {
  buildGhlMarketplaceInstallUrl,
  buildGhlOAuthAuthorizeUrl,
  ghlOAuthUrlIncludesVersionId,
  readGhlMarketplaceAppIdPrefix,
} from "@shared/ghlMarketplaceOAuth";
import { getAppOrigin } from "./urlOrigins";

export type GhlMarketplaceOAuthConfig = {
  /** OAuth is ready when client credentials exist and authorize URL can be built. */
  configured: boolean;
  /** Standard OAuth authorization URL (no version_id) — use for Connect CRM / Complete OAuth. */
  oauthAuthorizeUrl: string | null;
  /**
   * Marketplace install URL (with version_id) — first-time install from GHL portal only.
   * Paid apps cannot complete this flow externally.
   */
  marketplaceInstallUrl: string | null;
  /** @deprecated Use oauthAuthorizeUrl or marketplaceInstallUrl explicitly. */
  installUrl: string | null;
  redirectUri: string;
  appIdPrefix: string | null;
  error: string | null;
};

export function getGhlMarketplaceOAuthConfig(): GhlMarketplaceOAuthConfig {
  const clientId = String(process.env.GHL_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GHL_CLIENT_SECRET || "").trim();
  const redirectUri =
    String(process.env.GHL_REDIRECT_URI || "").trim() || `${getAppOrigin()}/api/ext/callback`;
  const versionId = String(process.env.GHL_APP_VERSION_ID || "").trim();
  const scopes = String(process.env.GHL_OAUTH_SCOPES || "").trim();
  const fullOverride = String(process.env.GHL_MARKETPLACE_INSTALL_URL || "").trim();

  const base = {
    redirectUri,
    appIdPrefix: clientId ? readGhlMarketplaceAppIdPrefix(clientId) : null,
  };

  if (!clientId || !clientSecret) {
    return {
      ...base,
      configured: false,
      oauthAuthorizeUrl: null,
      marketplaceInstallUrl: null,
      installUrl: null,
      error:
        "CRM app credentials are not configured on the server (GHL_CLIENT_ID / GHL_CLIENT_SECRET). Contact support.",
    };
  }

  let oauthAuthorizeUrl: string | null = null;
  let marketplaceInstallUrl: string | null = null;

  try {
    oauthAuthorizeUrl = buildGhlOAuthAuthorizeUrl({
      clientId,
      redirectUri,
      scopes: scopes || undefined,
    });
  } catch (err) {
    return {
      ...base,
      configured: false,
      oauthAuthorizeUrl: null,
      marketplaceInstallUrl: null,
      installUrl: null,
      error: err instanceof Error ? err.message : "Failed to build CRM OAuth authorize URL",
    };
  }

  if (fullOverride) {
    marketplaceInstallUrl = fullOverride;
    if (!ghlOAuthUrlIncludesVersionId(fullOverride)) {
      console.warn(
        "[LeadConnector] GHL_MARKETPLACE_INSTALL_URL override has no version_id — it is not a marketplace install link.",
      );
    }
  } else if (versionId) {
    try {
      marketplaceInstallUrl = buildGhlMarketplaceInstallUrl({
        clientId,
        redirectUri,
        versionId,
        scopes: scopes || undefined,
      });
    } catch (err) {
      console.warn(
        "[LeadConnector] Could not build marketplace install URL:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    ...base,
    configured: true,
    oauthAuthorizeUrl,
    marketplaceInstallUrl,
    installUrl: marketplaceInstallUrl,
    error: null,
  };
}
