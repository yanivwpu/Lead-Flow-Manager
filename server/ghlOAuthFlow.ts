import crypto from "crypto";
import { storage } from "./storage";
import { getAppOrigin } from "./urlOrigins";
import { linkMarketplaceInstallToIntegration } from "./ghlMarketplaceService";
import type { Integration } from "@shared/schema";

const GHL_TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";

export type GhlTokenPayload = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  userType?: string;
  locationId?: string;
  companyId?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

function oauthStateSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.GHL_CLIENT_SECRET ||
    "whachatcrm-ghl-oauth-state"
  );
}

export function createGhlOAuthState(userId: string): string {
  const ts = Date.now();
  const payload = `${userId}:${ts}`;
  const sig = crypto.createHmac("sha256", oauthStateSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyGhlOAuthState(state: string, maxAgeMs = 30 * 60 * 1000): string | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const [userId, tsRaw, sig] = decoded.split(":");
    if (!userId || !tsRaw || !sig) return null;
    const ts = Number(tsRaw);
    if (!Number.isFinite(ts) || Date.now() - ts > maxAgeMs) return null;
    const expected = crypto
      .createHmac("sha256", oauthStateSecret())
      .update(`${userId}:${tsRaw}`)
      .digest("hex");
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return userId;
  } catch {
    return null;
  }
}

export function appendStateToInstallUrl(installUrl: string, state: string): string {
  const url = new URL(installUrl);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function saveSessionValue(
  req: { session?: Record<string, unknown> & { save?: (cb: (err?: Error) => void) => void } },
  key: string,
  value: unknown,
): Promise<void> {
  if (!req.session) return;
  req.session[key] = value;
  if (typeof req.session.save === "function") {
    await new Promise<void>((resolve, reject) => {
      req.session!.save!((err) => (err ? reject(err) : resolve()));
    });
  }
}

export function readGhlOAuthSessionUserId(req: {
  session?: Record<string, unknown>;
  query?: Record<string, unknown>;
}): string | undefined {
  const fromSession = req.session?.ghlOAuthUserId;
  if (typeof fromSession === "string" && fromSession.trim()) return fromSession.trim();

  const state = req.query?.state;
  if (typeof state === "string" && state.trim()) {
    return verifyGhlOAuthState(state.trim()) ?? undefined;
  }
  return undefined;
}

export function clearGhlOAuthSession(req: { session?: Record<string, unknown> }): void {
  if (!req.session) return;
  delete req.session.ghlOAuthUserId;
  delete req.session.ghlOAuthStartedAt;
}

export function clearGhlOAuthPending(req: { session?: Record<string, unknown> }): void {
  if (!req.session) return;
  delete req.session.ghlMarketplaceInstallPending;
}

export async function exchangeGhlAuthorizationCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<{ ok: true; data: GhlTokenPayload } | { ok: false; httpStatus: number; data: GhlTokenPayload | null; raw?: string }> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const tokenResponse = await fetch(GHL_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  const tokenText = await tokenResponse.text();
  let tokenData: GhlTokenPayload | null = null;
  try {
    tokenData = JSON.parse(tokenText) as GhlTokenPayload;
  } catch {
    return { ok: false, httpStatus: tokenResponse.status, data: null, raw: tokenText };
  }

  if (!tokenResponse.ok || !tokenData.access_token) {
    return { ok: false, httpStatus: tokenResponse.status, data: tokenData };
  }

  return { ok: true, data: tokenData };
}

export async function persistGhlIntegrationForUser(
  ownerUserId: string,
  tokenData: GhlTokenPayload,
): Promise<{ integration: Integration; created: boolean }> {
  const tokenExpiresAt = new Date(Date.now() + (tokenData.expires_in || 86400) * 1000);
  const locationOrCompanyId = tokenData.locationId || tokenData.companyId || "unknown";

  const existingIntegrations = await storage.getAllIntegrationsByType("gohighlevel");
  const existing = existingIntegrations.find(
    (i) =>
      i.config &&
      ((tokenData.locationId && (i.config as Record<string, unknown>).locationId === tokenData.locationId) ||
        (tokenData.companyId && (i.config as Record<string, unknown>).companyId === tokenData.companyId)),
  );

  if (existing) {
    await storage.updateIntegration(existing.id, {
      userId: ownerUserId,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt,
      isActive: true,
      config: {
        ...(existing.config as Record<string, unknown>),
        locationId: tokenData.locationId,
        companyId: tokenData.companyId,
        userType: tokenData.userType,
        scope: tokenData.scope,
        installedAt: (existing.config as Record<string, unknown>)?.installedAt || new Date().toISOString(),
        reconnectedAt: new Date().toISOString(),
      },
      lastSyncAt: new Date(),
    });
    const updated = await storage.getIntegration(existing.id);
    const integration = (updated || {
      ...existing,
      userId: ownerUserId,
      accessToken: tokenData.access_token,
    }) as Integration;
    await linkMarketplaceInstallToIntegration(tokenData.locationId, tokenData.companyId, integration);
    return { integration, created: false };
  }

  const integration = await storage.createIntegration({
    userId: ownerUserId,
    type: "gohighlevel",
    name: `CRM Integration - ${tokenData.userType === "Location" ? "Location" : "Agency"} (${locationOrCompanyId})`,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    tokenExpiresAt,
    isActive: true,
    config: {
      locationId: tokenData.locationId,
      companyId: tokenData.companyId,
      userType: tokenData.userType,
      scope: tokenData.scope,
      installedAt: new Date().toISOString(),
    },
  });

  await linkMarketplaceInstallToIntegration(tokenData.locationId, tokenData.companyId, integration);
  return { integration, created: true };
}

export function getDefaultGhlRedirectUri(): string {
  return process.env.GHL_REDIRECT_URI || `${getAppOrigin()}/api/ext/callback`;
}
