import { eq } from "drizzle-orm";
import { ghlMarketplaceInstalls, type GhlMarketplaceInstall, type Integration } from "@shared/schema";
import { db } from "../drizzle/db";
import { logGhlOAuthDiagnostic } from "./ghlConnectionDiagnostics";
import {
  listRecoverableMarketplaceInstallsForUser,
  type RecoverableMarketplaceInstall,
} from "./ghlMarketplaceService";
import {
  persistGhlIntegrationForUser,
  type GhlTokenPayload,
} from "./ghlOAuthFlow";

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_TOKEN_URL = `${GHL_API_BASE}/oauth/token`;
const GHL_API_VERSION = "2021-07-28";

async function probeGhlAccessToken(
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

  const resp = await fetch(`${GHL_API_BASE}/users/me`, { headers });
  if (resp.ok) return true;
  return resp.status !== 401 && resp.status !== 403;
}

export async function refreshGhlOAuthTokens(
  refreshToken: string,
): Promise<GhlTokenPayload | null> {
  const clientId = process.env.GHL_CLIENT_ID ?? "";
  const clientSecret = process.env.GHL_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret || !refreshToken.trim()) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const resp = await fetch(GHL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: params.toString(),
  });

  let data: GhlTokenPayload | null = null;
  try {
    data = (await resp.json()) as GhlTokenPayload;
  } catch {
    return null;
  }

  if (!resp.ok || !data.access_token) return null;
  return data;
}

export async function resolveValidTokenPayload(
  stored: GhlTokenPayload,
  install: GhlMarketplaceInstall,
): Promise<{ ok: true; data: GhlTokenPayload; refreshed: boolean } | { ok: false; reason: string }> {
  const locationId = stored.locationId ?? install.locationId ?? null;
  const companyId = stored.companyId ?? install.companyId ?? null;

  const accessValid = await probeGhlAccessToken(stored.access_token, { locationId, companyId });
  if (accessValid) {
    return { ok: true, data: stored, refreshed: false };
  }

  if (!stored.refresh_token) {
    return { ok: false, reason: "access_token_invalid_no_refresh" };
  }

  const refreshed = await refreshGhlOAuthTokens(stored.refresh_token);
  if (!refreshed?.access_token) {
    return { ok: false, reason: "refresh_failed" };
  }

  const merged: GhlTokenPayload = {
    ...stored,
    ...refreshed,
    locationId: refreshed.locationId ?? stored.locationId ?? install.locationId ?? undefined,
    companyId: refreshed.companyId ?? stored.companyId ?? install.companyId ?? undefined,
    userType: refreshed.userType ?? stored.userType,
    scope: refreshed.scope ?? stored.scope,
  };

  const refreshedValid = await probeGhlAccessToken(merged.access_token, {
    locationId: merged.locationId ?? null,
    companyId: merged.companyId ?? null,
  });
  if (!refreshedValid) {
    return { ok: false, reason: "refreshed_token_invalid" };
  }

  return { ok: true, data: merged, refreshed: true };
}

export async function linkMarketplaceInstallById(
  marketplaceInstallId: string,
  integration: Integration,
): Promise<void> {
  await db
    .update(ghlMarketplaceInstalls)
    .set({
      integrationId: integration.id,
      whachatUserId: integration.userId,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ghlMarketplaceInstalls.id, marketplaceInstallId));
}

export async function linkMarketplaceInstallsForCompany(
  companyId: string,
  integration: Integration,
): Promise<void> {
  const rows = await db
    .select()
    .from(ghlMarketplaceInstalls)
    .where(eq(ghlMarketplaceInstalls.companyId, companyId));

  for (const row of rows) {
    if ((row.installationStatus || "").toLowerCase() === "uninstalled") continue;
    await linkMarketplaceInstallById(row.id, integration);
  }
}

export type GhlOAuthRecoveryResult =
  | {
      recovered: true;
      integrationId: string;
      created: boolean;
      refreshed: boolean;
      companyId: string | null;
      locationId: string | null;
      marketplaceInstallId: string;
    }
  | {
      recovered: false;
      reason: string;
      oauthRequired: boolean;
      recoverableCount?: number;
    };

export async function recoverGhlOAuthFromMarketplaceInstall(params: {
  userId: string;
  userEmail?: string | null;
  isPlatformAdmin?: boolean;
  marketplaceInstallId?: string;
}): Promise<GhlOAuthRecoveryResult> {
  const candidates = await listRecoverableMarketplaceInstallsForUser(
    params.userId,
    params.userEmail,
    { isPlatformAdmin: params.isPlatformAdmin },
  );

  if (candidates.length === 0) {
    logGhlOAuthDiagnostic("oauth_recovery_no_candidates", {
      userId: params.userId,
      isPlatformAdmin: Boolean(params.isPlatformAdmin),
    });
    return { recovered: false, reason: "no_recoverable_install", oauthRequired: true };
  }

  let target: RecoverableMarketplaceInstall | undefined;
  if (params.marketplaceInstallId) {
    target = candidates.find((row) => row.id === params.marketplaceInstallId);
    if (!target) {
      return { recovered: false, reason: "install_not_owned_or_missing_tokens", oauthRequired: true };
    }
  } else {
    target = candidates[0];
  }

  const tokenResult = await resolveValidTokenPayload(target.tokenPayload, target);
  if (!tokenResult.ok) {
    logGhlOAuthDiagnostic("oauth_recovery_token_invalid", {
      userId: params.userId,
      marketplaceInstallId: target.id,
      companyId: target.companyId,
      locationId: target.locationId,
      reason: tokenResult.reason,
    });
    return {
      recovered: false,
      reason: tokenResult.reason,
      oauthRequired: true,
      recoverableCount: candidates.length,
    };
  }

  const { integration, created } = await persistGhlIntegrationForUser(
    params.userId,
    tokenResult.data,
  );

  await linkMarketplaceInstallById(target.id, integration);
  const companyId = tokenResult.data.companyId ?? target.companyId;
  if (companyId) {
    await linkMarketplaceInstallsForCompany(companyId, integration);
  }

  await db
    .update(ghlMarketplaceInstalls)
    .set({
      rawPayload: {
        ...((target.rawPayload as Record<string, unknown>) || {}),
        ...tokenResult.data,
        recoveredAt: new Date().toISOString(),
        recoveredByUserId: params.userId,
      },
      source: target.source || "oauth",
      updatedAt: new Date(),
    })
    .where(eq(ghlMarketplaceInstalls.id, target.id));

  logGhlOAuthDiagnostic("oauth_recovery_succeeded", {
    userId: params.userId,
    integrationId: integration.id,
    created,
    refreshed: tokenResult.refreshed,
    marketplaceInstallId: target.id,
    companyId: tokenResult.data.companyId ?? target.companyId,
    locationId: tokenResult.data.locationId ?? target.locationId,
  });

  return {
    recovered: true,
    integrationId: integration.id,
    created,
    refreshed: tokenResult.refreshed,
    companyId: tokenResult.data.companyId ?? target.companyId ?? null,
    locationId: tokenResult.data.locationId ?? target.locationId ?? null,
    marketplaceInstallId: target.id,
  };
}
