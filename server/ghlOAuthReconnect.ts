/**
 * Official GHL Marketplace Reconnect API for lost access/refresh tokens
 * while the app remains installed.
 * @see https://help.gohighlevel.com/support/solutions/articles/155000003717-how-to-reconnect-broken-marketplace-apps-
 *
 * Runtime note (2026-07-25): POST /oauth/reconnect currently returns HTTP 400
 * "API endpoint has been removed" for both companyId and locationId bodies.
 * Keep this client so we can retry when GHL restores or relocates the endpoint.
 */
import { storage } from "./storage";
import {
  exchangeGhlAuthorizationCode,
  persistGhlIntegrationForUser,
  type GhlTokenPayload,
  getDefaultGhlRedirectUri,
} from "./ghlOAuthFlow";
import { refreshGhlOAuthTokens } from "./ghlOAuthRecovery";

const GHL_RECONNECT_URL = "https://services.leadconnectorhq.com/oauth/reconnect";
const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

export type GhlReconnectScope =
  | { mode: "location"; locationId: string; companyId?: string | null }
  | { mode: "company"; companyId: string; locationId?: string | null };

export type GhlReconnectSafeResult = {
  ok: boolean;
  stage: string;
  reconnectMode: "location" | "company" | null;
  locationId: string | null;
  companyId: string | null;
  integrationId: string | null;
  integrationUpdated: boolean;
  integrationCreated: boolean;
  probeOk: boolean;
  refreshOk: boolean;
  tokenExpiresAt: string | null;
  userType: string | null;
  httpStatus?: number;
  error?: string;
};

async function callGhlReconnect(params: {
  clientId: string;
  clientSecret: string;
  locationId?: string;
  companyId?: string;
}): Promise<
  | { ok: true; authorizationCode: string; expiresAt: string | null; httpStatus: number }
  | { ok: false; httpStatus: number; error: string }
> {
  const body: Record<string, string> = {
    clientKey: params.clientId,
    clientSecret: params.clientSecret,
  };
  if (params.locationId) body.locationId = params.locationId;
  if (params.companyId) body.companyId = params.companyId;

  const resp = await fetch(GHL_RECONNECT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });

  let data: { authorizationCode?: string; expiresAt?: string; message?: string; error?: string } | null =
    null;
  try {
    data = (await resp.json()) as typeof data;
  } catch {
    return { ok: false, httpStatus: resp.status, error: "non_json_reconnect_response" };
  }

  if (!resp.ok || !data?.authorizationCode) {
    return {
      ok: false,
      httpStatus: resp.status,
      error: data?.message || data?.error || `reconnect_http_${resp.status}`,
    };
  }

  return {
    ok: true,
    authorizationCode: data.authorizationCode,
    expiresAt: data.expiresAt ?? null,
    httpStatus: resp.status,
  };
}

export async function probeGhlApiWithAccessToken(
  accessToken: string,
  opts: { locationId?: string | null; companyId?: string | null },
): Promise<boolean> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Version: GHL_API_VERSION,
    Accept: "application/json",
  };

  if (opts.locationId) {
    const resp = await fetch(`${GHL_API_BASE}/locations/${opts.locationId}`, { headers });
    if (resp.ok) return true;
    if (resp.status === 401 || resp.status === 403) return false;
  }

  if (opts.companyId) {
    const resp = await fetch(`${GHL_API_BASE}/locations/search`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: opts.companyId, limit: 1 }),
    });
    if (resp.ok) return true;
    if (resp.status === 401 || resp.status === 403) return false;
  }

  const me = await fetch(`${GHL_API_BASE}/users/me`, { headers });
  return me.ok;
}

/**
 * Reconnect → exchange code → update existing integration → probe + refresh check.
 * Never logs raw tokens or authorization codes.
 */
export async function reconnectGhlMarketplaceOAuth(params: {
  ownerUserId: string;
  scope: GhlReconnectScope;
  redirectUri?: string;
}): Promise<GhlReconnectSafeResult> {
  const clientId = String(process.env.GHL_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GHL_CLIENT_SECRET || "").trim();
  const redirectUri =
    String(params.redirectUri || process.env.GHL_REDIRECT_URI || "").trim() ||
    getDefaultGhlRedirectUri();

  const base: GhlReconnectSafeResult = {
    ok: false,
    stage: "init",
    reconnectMode: params.scope.mode,
    locationId: params.scope.mode === "location" ? params.scope.locationId : params.scope.locationId ?? null,
    companyId: params.scope.mode === "company" ? params.scope.companyId : params.scope.companyId ?? null,
    integrationId: null,
    integrationUpdated: false,
    integrationCreated: false,
    probeOk: false,
    refreshOk: false,
    tokenExpiresAt: null,
    userType: null,
  };

  if (!clientId || !clientSecret) {
    return { ...base, stage: "missing_credentials", error: "GHL_CLIENT_ID or GHL_CLIENT_SECRET missing" };
  }

  const reconnect = await callGhlReconnect({
    clientId,
    clientSecret,
    locationId: params.scope.mode === "location" ? params.scope.locationId : undefined,
    companyId: params.scope.mode === "company" ? params.scope.companyId : undefined,
  });

  if (!reconnect.ok) {
    return {
      ...base,
      stage: "reconnect_api",
      httpStatus: reconnect.httpStatus,
      error: reconnect.error,
    };
  }

  const exchange = await exchangeGhlAuthorizationCode(
    reconnect.authorizationCode,
    redirectUri,
    clientId,
    clientSecret,
  );

  if (!exchange.ok || !exchange.data.access_token) {
    return {
      ...base,
      stage: "token_exchange",
      httpStatus: exchange.ok ? 200 : exchange.httpStatus,
      error:
        exchange.ok
          ? "missing_access_token"
          : exchange.data?.error_description || exchange.data?.error || `exchange_http_${exchange.httpStatus}`,
    };
  }

  const tokenData: GhlTokenPayload = {
    ...exchange.data,
    // Preserve install scope when exchange omits ids
    locationId:
      exchange.data.locationId ||
      (params.scope.mode === "location" ? params.scope.locationId : params.scope.locationId) ||
      undefined,
    companyId:
      exchange.data.companyId ||
      (params.scope.mode === "company" ? params.scope.companyId : params.scope.companyId) ||
      undefined,
  };

  const { integration, created } = await persistGhlIntegrationForUser(params.ownerUserId, tokenData);

  const probeOk = await probeGhlApiWithAccessToken(tokenData.access_token, {
    locationId: tokenData.locationId ?? null,
    companyId: tokenData.companyId ?? null,
  });

  let refreshOk = false;
  if (tokenData.refresh_token) {
    const refreshed = await refreshGhlOAuthTokens(tokenData.refresh_token);
    if (refreshed?.access_token) {
      refreshOk = true;
      // Persist the post-refresh pair (GHL invalidates the prior refresh token once used)
      await storage.updateIntegration(integration.id, {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || tokenData.refresh_token,
        tokenExpiresAt: new Date(Date.now() + (refreshed.expires_in || 86400) * 1000),
        isActive: true,
        lastSyncAt: new Date(),
      });
    }
  }

  const fresh = await storage.getIntegration(integration.id);

  return {
    ok: Boolean(probeOk && refreshOk),
    stage: "completed",
    reconnectMode: params.scope.mode,
    locationId: tokenData.locationId ?? null,
    companyId: tokenData.companyId ?? null,
    integrationId: integration.id,
    integrationUpdated: !created,
    integrationCreated: created,
    probeOk,
    refreshOk,
    tokenExpiresAt: fresh?.tokenExpiresAt?.toISOString() ?? null,
    userType: (fresh?.config as Record<string, unknown>)?.userType
      ? String((fresh?.config as Record<string, unknown>).userType)
      : tokenData.userType ?? null,
    error: !probeOk
      ? "ghl_api_probe_failed"
      : !refreshOk
        ? "refresh_health_failed"
        : undefined,
  };
}
