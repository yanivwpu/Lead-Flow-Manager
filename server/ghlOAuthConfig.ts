import {
  buildGhlMarketplaceInstallUrl,
  readGhlMarketplaceAppIdPrefix,
} from "@shared/ghlMarketplaceOAuth";
import { getAppOrigin } from "./urlOrigins";

export type GhlMarketplaceOAuthConfig = {
  configured: boolean;
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

  if (fullOverride) {
    return {
      configured: true,
      installUrl: fullOverride,
      redirectUri,
      appIdPrefix: clientId ? readGhlMarketplaceAppIdPrefix(clientId) : null,
      error: null,
    };
  }

  if (!clientId || !clientSecret) {
    return {
      configured: false,
      installUrl: null,
      redirectUri,
      appIdPrefix: null,
      error:
        "CRM app credentials are not configured on the server (GHL_CLIENT_ID / GHL_CLIENT_SECRET). Contact support.",
    };
  }

  if (!versionId) {
    return {
      configured: false,
      installUrl: null,
      redirectUri,
      appIdPrefix: readGhlMarketplaceAppIdPrefix(clientId),
      error:
        "CRM marketplace app version is not configured (GHL_APP_VERSION_ID). Contact support before installing.",
    };
  }

  try {
    const installUrl = buildGhlMarketplaceInstallUrl({
      clientId,
      redirectUri,
      versionId,
      scopes: scopes || undefined,
    });
    return {
      configured: true,
      installUrl,
      redirectUri,
      appIdPrefix: readGhlMarketplaceAppIdPrefix(clientId),
      error: null,
    };
  } catch (err) {
    return {
      configured: false,
      installUrl: null,
      redirectUri,
      appIdPrefix: readGhlMarketplaceAppIdPrefix(clientId),
      error: err instanceof Error ? err.message : "Failed to build CRM install URL",
    };
  }
}
