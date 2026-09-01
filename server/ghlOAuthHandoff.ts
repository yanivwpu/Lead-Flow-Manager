import crypto from "crypto";
import type { Request, Response } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { ghlOAuthPendingHandoffs } from "@shared/schema";
import {
  GHL_OAUTH_HANDOFF_COOKIE,
  GHL_OAUTH_HANDOFF_TTL_MS,
  assertHandoffIdentityMatch,
  evaluateGhlOAuthHandoffClaim,
  type GhlOAuthHandoffClaimFailure,
} from "@shared/ghlOAuthHandoff";
import { decryptCredential, encryptCredential, isEncrypted } from "./userTwilio";
import { persistGhlIntegrationForUser, type GhlTokenPayload } from "./ghlOAuthFlow";
import { linkMarketplaceInstallToIntegration } from "./ghlMarketplaceService";
import { logGhlOAuthDiagnostic } from "./ghlConnectionDiagnostics";

export function hashGhlOAuthHandoffToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function newHandoffToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function handoffCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GHL_OAUTH_HANDOFF_TTL_MS,
  };
}

export function readGhlOAuthHandoffCookie(req: Request): string | undefined {
  const raw = (req as Request & { cookies?: Record<string, string> }).cookies?.[GHL_OAUTH_HANDOFF_COOKIE];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return undefined;
}

export function clearGhlOAuthHandoffCookie(res: Response): void {
  res.clearCookie(GHL_OAUTH_HANDOFF_COOKIE, { path: "/", httpOnly: true, sameSite: "lax" });
}

function decryptHandoffSecret(encrypted: string | null | undefined): string | null {
  const raw = String(encrypted || "").trim();
  if (!raw) return null;
  if (!isEncrypted(raw)) return null;
  const plain = decryptCredential(raw);
  if (!plain || isEncrypted(plain)) return null;
  return plain;
}

export type CreateGhlOAuthHandoffInput = {
  tokenData: GhlTokenPayload;
  companyId: string;
  locationId?: string | null;
  appId?: string | null;
  versionId?: string | null;
  ghlUserId?: string | null;
  marketplaceInstallId?: string | null;
};

export async function createGhlOAuthPendingHandoff(
  input: CreateGhlOAuthHandoffInput,
  res: Response,
): Promise<{ expiresAt: Date }> {
  const accessToken = String(input.tokenData.access_token || "").trim();
  if (!accessToken) {
    throw new Error("missing_access_token");
  }
  const companyId = input.companyId.trim();
  if (!companyId) {
    throw new Error("missing_company_id");
  }

  const token = newHandoffToken();
  const claimTokenHash = hashGhlOAuthHandoffToken(token);
  const expiresAt = new Date(Date.now() + GHL_OAUTH_HANDOFF_TTL_MS);
  const tokenExpiresAt = input.tokenData.expires_in
    ? new Date(Date.now() + input.tokenData.expires_in * 1000)
    : null;

  await db.insert(ghlOAuthPendingHandoffs).values({
    claimTokenHash,
    accessTokenEncrypted: encryptCredential(accessToken),
    refreshTokenEncrypted: input.tokenData.refresh_token
      ? encryptCredential(input.tokenData.refresh_token)
      : null,
    tokenExpiresAt,
    scope: input.tokenData.scope ?? null,
    userType: input.tokenData.userType ?? null,
    companyId,
    locationId: input.locationId ?? input.tokenData.locationId ?? null,
    appId: input.appId ?? null,
    versionId: input.versionId ?? null,
    ghlUserId: input.ghlUserId ?? null,
    marketplaceInstallId: input.marketplaceInstallId ?? null,
    expiresAt,
  });

  res.cookie(GHL_OAUTH_HANDOFF_COOKIE, token, handoffCookieOptions());
  logGhlOAuthDiagnostic("oauth_handoff_created", {
    companyId,
    locationId: input.locationId ?? input.tokenData.locationId ?? null,
    appId: input.appId ?? null,
    versionId: input.versionId ?? null,
    hasRefreshToken: Boolean(input.tokenData.refresh_token),
    expiresAt: expiresAt.toISOString(),
  });
  return { expiresAt };
}

export type ClaimGhlOAuthHandoffResult =
  | {
      claimed: true;
      integrationId: string;
      created: boolean;
      locationId: string | null;
      companyId: string | null;
    }
  | { claimed: false; reason: GhlOAuthHandoffClaimFailure };

export async function claimGhlOAuthHandoffForUser(
  req: Request,
  res: Response,
  userId: string,
  claimedIdentity?: {
    companyId?: string | null;
    locationId?: string | null;
    appId?: string | null;
    versionId?: string | null;
    ghlUserId?: string | null;
  },
): Promise<ClaimGhlOAuthHandoffResult> {
  const token = readGhlOAuthHandoffCookie(req);
  if (!token) {
    return { claimed: false, reason: "missing_token" };
  }

  const tokenHash = hashGhlOAuthHandoffToken(token);
  const rows = await db
    .select()
    .from(ghlOAuthPendingHandoffs)
    .where(eq(ghlOAuthPendingHandoffs.claimTokenHash, tokenHash))
    .limit(1);
  const row = rows[0];
  const evaluation = evaluateGhlOAuthHandoffClaim(
    row
      ? {
          claimTokenHash: row.claimTokenHash,
          expiresAt: row.expiresAt,
          consumedAt: row.consumedAt,
          companyId: row.companyId,
          locationId: row.locationId,
          appId: row.appId,
          versionId: row.versionId,
          ghlUserId: row.ghlUserId,
        }
      : null,
    tokenHash,
  );

  if (!evaluation.ok) {
    logGhlOAuthDiagnostic("oauth_handoff_rejected", {
      userId,
      reason: evaluation.reason,
    });
    if (evaluation.reason === "expired" || evaluation.reason === "already_consumed" || evaluation.reason === "not_found") {
      clearGhlOAuthHandoffCookie(res);
    }
    return { claimed: false, reason: evaluation.reason };
  }

  const identity = assertHandoffIdentityMatch(
    {
      companyId: row.companyId,
      locationId: row.locationId,
      appId: row.appId,
      versionId: row.versionId,
      ghlUserId: row.ghlUserId,
    },
    claimedIdentity || {},
  );
  if (!identity.ok) {
    logGhlOAuthDiagnostic("oauth_handoff_rejected", {
      userId,
      reason: identity.reason,
      companyId: row.companyId,
      locationId: row.locationId,
    });
    return { claimed: false, reason: identity.reason };
  }

  const accessToken = decryptHandoffSecret(row.accessTokenEncrypted);
  const refreshToken = row.refreshTokenEncrypted
    ? decryptHandoffSecret(row.refreshTokenEncrypted)
    : undefined;
  if (!accessToken) {
    logGhlOAuthDiagnostic("oauth_handoff_rejected", { userId, reason: "decrypt_failed" });
    return { claimed: false, reason: "decrypt_failed" };
  }
  if (row.refreshTokenEncrypted && !refreshToken) {
    logGhlOAuthDiagnostic("oauth_handoff_rejected", { userId, reason: "decrypt_failed" });
    return { claimed: false, reason: "decrypt_failed" };
  }

  const consumed = await db
    .update(ghlOAuthPendingHandoffs)
    .set({
      consumedAt: new Date(),
      consumedByUserId: userId,
    })
    .where(
      and(eq(ghlOAuthPendingHandoffs.id, row.id), isNull(ghlOAuthPendingHandoffs.consumedAt)),
    )
    .returning({ id: ghlOAuthPendingHandoffs.id });

  if (!consumed[0]) {
    logGhlOAuthDiagnostic("oauth_handoff_rejected", { userId, reason: "already_consumed" });
    clearGhlOAuthHandoffCookie(res);
    return { claimed: false, reason: "already_consumed" };
  }

  const tokenData: GhlTokenPayload = {
    access_token: accessToken,
    refresh_token: refreshToken || undefined,
    expires_in: row.tokenExpiresAt
      ? Math.max(60, Math.round((row.tokenExpiresAt.getTime() - Date.now()) / 1000))
      : 86400,
    userType: row.userType || undefined,
    locationId: row.locationId || undefined,
    companyId: row.companyId,
    scope: row.scope || undefined,
  };

  const { integration, created } = await persistGhlIntegrationForUser(userId, tokenData, {
    appId: row.appId,
    versionId: row.versionId,
    ghlUserId: row.ghlUserId,
  });

  await linkMarketplaceInstallToIntegration(row.locationId, row.companyId, integration, {
    appId: row.appId,
    versionId: row.versionId,
    ghlUserId: row.ghlUserId,
  });

  clearGhlOAuthHandoffCookie(res);
  logGhlOAuthDiagnostic("oauth_handoff_claimed", {
    userId,
    integrationId: integration.id,
    created,
    companyId: row.companyId,
    locationId: row.locationId,
    appId: row.appId,
    versionId: row.versionId,
  });

  return {
    claimed: true,
    integrationId: integration.id,
    created,
    locationId: row.locationId,
    companyId: row.companyId,
  };
}

export async function claimGhlOAuthHandoffIfPresent(
  req: Request,
  res: Response,
  userId: string,
): Promise<ClaimGhlOAuthHandoffResult | null> {
  if (!readGhlOAuthHandoffCookie(req)) return null;
  try {
    return await claimGhlOAuthHandoffForUser(req, res, userId);
  } catch (error) {
    logGhlOAuthDiagnostic("oauth_handoff_rejected", {
      userId,
      reason: "claim_failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return { claimed: false, reason: "decrypt_failed" };
  }
}

export async function revokeGhlOAuthHandoffsForInstall(params: {
  locationId?: string | null;
  companyId?: string | null;
}): Promise<void> {
  const locationId = params.locationId?.trim() || null;
  const companyId = params.companyId?.trim() || null;
  if (!locationId && !companyId) return;

  const now = new Date();
  if (locationId && companyId) {
    await db
      .update(ghlOAuthPendingHandoffs)
      .set({ expiresAt: now, consumedAt: now })
      .where(
        and(
          eq(ghlOAuthPendingHandoffs.locationId, locationId),
          eq(ghlOAuthPendingHandoffs.companyId, companyId),
          isNull(ghlOAuthPendingHandoffs.consumedAt),
        ),
      );
    return;
  }
  if (locationId) {
    await db
      .update(ghlOAuthPendingHandoffs)
      .set({ expiresAt: now, consumedAt: now })
      .where(
        and(eq(ghlOAuthPendingHandoffs.locationId, locationId), isNull(ghlOAuthPendingHandoffs.consumedAt)),
      );
    return;
  }
  if (companyId) {
    await db
      .update(ghlOAuthPendingHandoffs)
      .set({ expiresAt: now, consumedAt: now })
      .where(
        and(
          eq(ghlOAuthPendingHandoffs.companyId, companyId),
          sql`${ghlOAuthPendingHandoffs.locationId} IS NULL`,
          isNull(ghlOAuthPendingHandoffs.consumedAt),
        ),
      );
  }
}
