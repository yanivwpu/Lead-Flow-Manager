import {
  DEFAULT_GHL_OAUTH_SCOPES,
  ghlOAuthUrlIncludesVersionId,
  readGhlMarketplaceAppIdPrefix,
} from "@shared/ghlMarketplaceOAuth";
import { getGhlMarketplaceOAuthConfig } from "./ghlOAuthConfig";
import { appendStateToInstallUrl, createGhlOAuthState } from "./ghlOAuthFlow";
import { getAppOrigin } from "./urlOrigins";

export type GhlOAuthAuthorizeDebugSnapshot = {
  generatedAt: string;
  flow: "oauth_authorize";
  authorizeUrl: string;
  authorizeUrlBase: string;
  includesVersionId: boolean;
  redirectUri: string;
  clientId: string | null;
  scope: string;
  statePresent: boolean;
  responseType: string | null;
  host: string;
  path: string;
  chooseLocationBase: string;
  appIdPrefix: string | null;
  expectedCallbackExample: string;
  redirectUriMatchesAppOrigin: boolean;
  warnings: string[];
  notes: string[];
};

export function parseGhlOAuthUrlForDebug(url: string): {
  includesVersionId: boolean;
  redirectUri: string | null;
  clientId: string | null;
  scope: string | null;
  statePresent: boolean;
  responseType: string | null;
  versionId: string | null;
  host: string;
  path: string;
} {
  const parsed = new URL(url);
  return {
    includesVersionId: parsed.searchParams.has("version_id"),
    redirectUri: parsed.searchParams.get("redirect_uri"),
    clientId: parsed.searchParams.get("client_id"),
    scope: parsed.searchParams.get("scope"),
    statePresent: parsed.searchParams.has("state"),
    responseType: parsed.searchParams.get("response_type"),
    versionId: parsed.searchParams.get("version_id"),
    host: parsed.host,
    path: parsed.pathname,
  };
}

export function buildGhlOAuthAuthorizeDebugSnapshot(
  userId?: string,
): GhlOAuthAuthorizeDebugSnapshot {
  const config = getGhlMarketplaceOAuthConfig();
  const appOrigin = getAppOrigin();
  const expectedCallback = `${appOrigin}/api/ext/callback`;
  const warnings: string[] = [];
  const notes: string[] = [
    "OAuth authorize must use chooselocation WITHOUT version_id (version_id is marketplace install only).",
    "If GHL sends you to app.leadconnectorhq.com/agency_dashboard with no code, the SPA likely detected an existing GHL session + installed app. Try the authorize URL in a private/incognito window, or connect from GHL Settings → Connected Apps / sub-account Marketplace.",
  ];

  if (!config.configured || !config.oauthAuthorizeUrl) {
    warnings.push(config.error || "CRM OAuth is not configured (missing GHL_CLIENT_ID / GHL_CLIENT_SECRET).");
    return {
      generatedAt: new Date().toISOString(),
      flow: "oauth_authorize",
      authorizeUrl: "",
      authorizeUrlBase: "",
      includesVersionId: false,
      redirectUri: config.redirectUri,
      clientId: null,
      scope: DEFAULT_GHL_OAUTH_SCOPES,
      statePresent: false,
      responseType: "code",
      host: "",
      path: "/oauth/chooselocation",
      chooseLocationBase: "",
      appIdPrefix: config.appIdPrefix,
      expectedCallbackExample: expectedCallback,
      redirectUriMatchesAppOrigin: config.redirectUri === expectedCallback,
      warnings,
      notes,
    };
  }

  const state = userId ? createGhlOAuthState(userId) : null;
  const authorizeUrlBase = config.oauthAuthorizeUrl;
  const authorizeUrl = state ? appendStateToInstallUrl(authorizeUrlBase, state) : authorizeUrlBase;
  const parsed = parseGhlOAuthUrlForDebug(authorizeUrl);

  if (parsed.includesVersionId) {
    warnings.push("authorize URL includes version_id — this is a marketplace INSTALL link, not OAuth authorization.");
  }
  if (parsed.path !== "/oauth/chooselocation") {
    warnings.push(`Unexpected OAuth path: ${parsed.path} (expected /oauth/chooselocation).`);
  }
  if (!parsed.host.includes("marketplace.")) {
    warnings.push(`Unexpected OAuth host: ${parsed.host} (expected marketplace.* domain).`);
  }
  if (config.redirectUri !== expectedCallback) {
    warnings.push(
      `redirect_uri (${config.redirectUri}) does not match APP_URL callback (${expectedCallback}). GHL allowlist must match exactly.`,
    );
  }
  if (process.env.GHL_REDIRECT_URI && process.env.GHL_REDIRECT_URI.trim() !== config.redirectUri) {
    warnings.push("GHL_REDIRECT_URI env differs from resolved redirectUri — verify production env.");
  }

  return {
    generatedAt: new Date().toISOString(),
    flow: "oauth_authorize",
    authorizeUrl,
    authorizeUrlBase,
    includesVersionId: parsed.includesVersionId,
    redirectUri: parsed.redirectUri || config.redirectUri,
    clientId: parsed.clientId,
    scope: parsed.scope || DEFAULT_GHL_OAUTH_SCOPES,
    statePresent: parsed.statePresent,
    responseType: parsed.responseType,
    host: parsed.host,
    path: parsed.path,
    chooseLocationBase: authorizeUrlBase.split("?")[0] || "",
    appIdPrefix: config.appIdPrefix || (parsed.clientId ? readGhlMarketplaceAppIdPrefix(parsed.clientId) : null),
    expectedCallbackExample: expectedCallback,
    redirectUriMatchesAppOrigin: config.redirectUri === expectedCallback,
    warnings,
    notes,
  };
}

export function logGhlOAuthAuthorizeDebugSnapshot(
  event: string,
  snapshot: GhlOAuthAuthorizeDebugSnapshot,
  extra?: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      tag: "[GHL-OAuth-Diagnostic]",
      event,
      at: snapshot.generatedAt,
      flow: snapshot.flow,
      authorizeUrl: snapshot.authorizeUrl,
      authorizeUrlBase: snapshot.authorizeUrlBase,
      includesVersionId: snapshot.includesVersionId,
      redirectUri: snapshot.redirectUri,
      clientId: snapshot.clientId,
      scope: snapshot.scope,
      statePresent: snapshot.statePresent,
      responseType: snapshot.responseType,
      host: snapshot.host,
      path: snapshot.path,
      appIdPrefix: snapshot.appIdPrefix,
      expectedCallbackExample: snapshot.expectedCallbackExample,
      redirectUriMatchesAppOrigin: snapshot.redirectUriMatchesAppOrigin,
      warnings: snapshot.warnings,
      ...extra,
    }),
  );
}
