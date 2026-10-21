/**
 * Replace only the access token on an existing manual Meta WhatsApp connection.
 * Never reset WABA, phone, webhook verification token, subscription or provider.
 * A new Embedded Signup or /api/meta/connect would rotate the webhook token.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { users } from "@shared/schema";
import { storage } from "./storage";
import { encryptCredential } from "./metaCredentialCrypto";
import { getMetaGraphApiBase } from "./metaGraphVersion";
import { fetchMetaUserTokenDebugSummary } from "./whatsappEmbeddedSignup";
import { validateManualMetaTokenReplacement, MetaTokenReplacementError } from "../shared/manualMetaTokenReplacementValidation";
export { MetaTokenReplacementError } from "../shared/manualMetaTokenReplacementValidation";

export async function replaceManualMetaAccessToken(userId: string, token: string): Promise<{ expiresAt: string | null }> {
  const user = await storage.getUserForSession(userId);
  const appId = String(process.env.META_APP_ID || "").trim();
  // Check ownership before any Graph call: fail closed without sending unrelated tokens.
  if (
    !user?.metaConnected ||
    user.whatsappProvider !== "meta" ||
    user.metaConnectionType !== "manual_legacy" ||
    !/^\d{8,}$/.test(user.metaBusinessAccountId || "") ||
    !/^\d{8,}$/.test(user.metaPhoneNumberId || "") ||
    !appId
  ) {
    throw new MetaTokenReplacementError("not_manual_connection", "An existing manual WhatsApp connection is required.");
  }
  if (!token || token.length < 20 || token.length > 8192 || /\s/.test(token)) {
    throw new MetaTokenReplacementError("invalid_token", "Enter a valid Meta access token.");
  }

  const debug = await fetchMetaUserTokenDebugSummary(token);
  // Avoid an unnecessary Graph call to any phone if the app/token does not match.
  if (!debug.ok || !debug.is_valid || String(debug.app_id ?? "") !== appId) {
    throw new MetaTokenReplacementError("wrong_meta_app", "Meta token is invalid or belongs to a different app.");
  }
  const base = getMetaGraphApiBase();
  const r = await fetch(
    `${base}/${encodeURIComponent(user.metaBusinessAccountId)}/phone_numbers?fields=id&limit=100`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) },
  ).catch(() => null);
  if (!r?.ok) {
    throw new MetaTokenReplacementError("cannot_verify_waba", "Meta could not verify this token's access to the connected WhatsApp Business Account.");
  }
  const json = await r.json().catch(() => ({})) as { data?: Array<{ id?: string }> };
  const graphPhoneIds = Array.isArray(json.data) ? json.data.map(p => String(p.id || "")) : [];
  const result = validateManualMetaTokenReplacement({
    connected: user,
    expectedAppId: appId,
    token,
    debug,
    graphPhoneIds,
    nowSeconds: Math.floor(Date.now() / 1000),
  });

  const encrypted = encryptCredential(token); // requires configured environment encryption key
  // Atomically update the token *only for the same bound manual integration*. Leave all
  // webhook settings, sender IDs, consent data and inbound subscriptions untouched.
  const updated = await db.update(users).set({
    metaAccessToken: encrypted,
    metaTokenExpiresAt: result.expiresAt,
    metaIntegrationStatus: "connected",
    metaLastErrorCode: null,
    metaLastErrorMessage: null,
  }).where(and(
    eq(users.id, userId),
    eq(users.metaConnected, true),
    eq(users.whatsappProvider, "meta"),
    eq(users.metaConnectionType, "manual_legacy"),
    eq(users.metaPhoneNumberId, user.metaPhoneNumberId),
    eq(users.metaBusinessAccountId, user.metaBusinessAccountId),
  )).returning({ id: users.id });
  if (updated.length !== 1) {
    throw new MetaTokenReplacementError("connection_changed", "WhatsApp connection changed. Refresh Settings and try again.");
  }
  return { expiresAt: result.expiresAt?.toISOString() || null };
}
