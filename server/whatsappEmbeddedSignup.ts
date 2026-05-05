/**
 * Meta WhatsApp Embedded Signup + coexistence OAuth completion.
 * @see https://developers.facebook.com/docs/whatsapp/embedded-signup/overview
 * @see https://developers.facebook.com/docs/whatsapp/embedded-signup/onboarding-business-app-users
 *
 * Production flow: Embedded Signup **v4** uses the JS SDK (`FB.login`) with `config_id`,
 * `response_type: code`, `override_default_response_type: true`, and `extras: { setup: {} }`,
 * then exchanges `authResponse.code` on the server immediately (TTL ~30s).
 * Redirect OAuth with `config_id` remains supported as a fallback (same token exchange).
 *
 * Webhook **fields** (messages, message statuses, etc.) are subscribed at the WhatsApp Business Account
 * via `POST /{waba-id}/subscribed_apps`; ensure your Meta App Dashboard WhatsApp product webhooks
 * include message + status fields (and `account_update` if your integration relies on it).
 */
import crypto from "crypto";
import { eq, lt, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { whatsappOauthStates } from "@shared/schema";
import { storage } from "./storage";
import { getMetaGraphApiBase, getMetaFacebookOAuthDialogBase } from "./metaGraphVersion";
import { exchangeCodeForToken, exchangeForLongLivedUserToken } from "./metaOAuth";
import { connectUserMeta, type MetaCredentials } from "./userMeta";
import { getAppOrigin } from "./urlOrigins";

const STATE_TTL_MS = 15 * 60 * 1000;

/**
 * Exact SQL from `migrations/0006_whatsapp_embedded_signup.sql` — run in Neon SQL Editor
 * if `whatsapp_oauth_states` is missing (Embedded Signup fails on DELETE/INSERT to that table).
 * Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
 */
export const WHATSAPP_EMBEDDED_SIGNUP_0006_SQL = `-- WhatsApp Embedded Signup / coexistence metadata + OAuth state CSRF table (Neon-safe).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_connection_type" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_token_expires_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_webhook_subscribed" boolean DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_webhook_last_checked_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_integration_status" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_last_error_code" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_last_error_message" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_display_phone_number" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_verified_name" text;

UPDATE "users"
SET "meta_connection_type" = 'manual_legacy'
WHERE "meta_connected" = true AND "meta_connection_type" IS NULL;

CREATE TABLE IF NOT EXISTS "whatsapp_oauth_states" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "state_token" text NOT NULL UNIQUE,
  "flow" text NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "expires_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "whatsapp_oauth_states_expires_idx" ON "whatsapp_oauth_states" ("expires_at");
`;

function isMissingWhatsappOauthRelationError(err: unknown): boolean {
  const any = err as { code?: string; message?: string };
  const code = any?.code;
  const msg = (any?.message || "").toLowerCase();
  if (code === "42P01" || code === "42703") return true;
  if (msg.includes("whatsapp_oauth_states")) return true;
  return false;
}

export function formatMissingWhatsappOauthStatesMessage(): string {
  return (
    "WhatsApp Embedded Signup requires table public.whatsapp_oauth_states (migration 0006). " +
    "In Neon: open SQL Editor, paste migrations/0006_whatsapp_embedded_signup.sql (or WHATSAPP_EMBEDDED_SIGNUP_0006_SQL in server/whatsappEmbeddedSignup.ts), run, then redeploy."
  );
}

/** Call once at server startup; logs clearly if migration 0006 was never applied. */
export async function verifyWhatsappEmbeddedSignupMigration(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1 FROM public.whatsapp_oauth_states LIMIT 1`);
    return true;
  } catch (err: unknown) {
    if (!isMissingWhatsappOauthRelationError(err)) throw err;
    console.error(
      "[WhatsApp Embedded Signup] Database: public.whatsapp_oauth_states is missing or incompatible. " +
        "Apply migration 0006 in Neon (see WHATSAPP_EMBEDDED_SIGNUP_0006_SQL or migrations/0006_whatsapp_embedded_signup.sql)."
    );
    console.error("[WhatsApp Embedded Signup] Postgres error:", (err as Error)?.message || err);
    return false;
  }
}

export function getWhatsappMetaRedirectUri(): string {
  const explicit = process.env.META_WHATSAPP_REDIRECT_URI?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return `${getAppOrigin().replace(/\/+$/, "")}/api/integrations/whatsapp/meta/callback`;
}

export interface WhatsappMetaPublicConfig {
  embeddedSignupEnabled: boolean;
  coexistenceEnabled: boolean;
  metaConfigured: boolean;
  /** Safe client-only fields */
  appId: string | null;
  graphApiVersion: string;
  redirectUri: string;
  embeddedSignupConfigId: string | null;
  coexistenceConfigId: string | null;
  missingEnvHints: string[];
}

export function logWhatsappEmbeddedSignupStartupWarnings(): void {
  const embedded =
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED === "true" ||
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED === "1";
  const coexistenceFlag =
    process.env.WHATSAPP_COEXISTENCE_ENABLED === "true" ||
    process.env.WHATSAPP_COEXISTENCE_ENABLED === "1" ||
    process.env.WHATSAPP_COOEXISTENCE_ENABLED === "true" ||
    process.env.WHATSAPP_COOEXISTENCE_ENABLED === "1";
  if (embedded) {
    const missing: string[] = [];
    if (!process.env.META_APP_ID) missing.push("META_APP_ID");
    if (!process.env.META_APP_SECRET) missing.push("META_APP_SECRET");
    if (!process.env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID) missing.push("META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID");
    if (missing.length) {
      console.warn(
        `[WhatsApp Embedded Signup] WHATSAPP_EMBEDDED_SIGNUP_ENABLED is on but missing: ${missing.join(", ")} — Meta onboarding buttons will stay disabled until configured.`
      );
    }
  }
  if (coexistenceFlag && !process.env.META_WHATSAPP_COEXISTENCE_CONFIG_ID?.trim()) {
    console.warn(
      "[WhatsApp Embedded Signup] WHATSAPP_COEXISTENCE_ENABLED is on but META_WHATSAPP_COEXISTENCE_CONFIG_ID is unset — coexistence onboarding stays disabled (do not fall back to the main Embedded Signup config)."
    );
  }
}

export function getWhatsappMetaPublicConfig(): WhatsappMetaPublicConfig {
  const missingEnvHints: string[] = [];
  if (!process.env.META_APP_ID) missingEnvHints.push("META_APP_ID");
  if (!process.env.META_APP_SECRET) missingEnvHints.push("META_APP_SECRET");

  const embeddedFlag =
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED === "true" ||
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED === "1";
  const coexistenceFlag =
    process.env.WHATSAPP_COOEXISTENCE_ENABLED === "true" ||
    process.env.WHATSAPP_COOEXISTENCE_ENABLED === "1" ||
    process.env.WHATSAPP_COEXISTENCE_ENABLED === "true" ||
    process.env.WHATSAPP_COEXISTENCE_ENABLED === "1";

  const hasConfigId = !!process.env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim();
  const embeddedSignupEnabled =
    embeddedFlag && !!process.env.META_APP_ID && !!process.env.META_APP_SECRET && hasConfigId;

  const coexistenceConfigOnly = process.env.META_WHATSAPP_COEXISTENCE_CONFIG_ID?.trim() || null;
  const coexistenceEnabled =
    coexistenceFlag && embeddedSignupEnabled && !!coexistenceConfigOnly;

  const graphRaw = process.env.META_GRAPH_API_VERSION || "v21.0";

  return {
    embeddedSignupEnabled,
    coexistenceEnabled,
    metaConfigured: !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
    appId: process.env.META_APP_ID || null,
    graphApiVersion: graphRaw.startsWith("v") ? graphRaw : `v${graphRaw}`,
    redirectUri: getWhatsappMetaRedirectUri(),
    embeddedSignupConfigId: process.env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || null,
    coexistenceConfigId: coexistenceEnabled ? coexistenceConfigOnly : null,
    missingEnvHints,
  };
}

function generateStateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

async function cleanupExpiredStates(): Promise<void> {
  try {
    await db.delete(whatsappOauthStates).where(lt(whatsappOauthStates.expiresAt, new Date()));
  } catch (err: unknown) {
    if (!isMissingWhatsappOauthRelationError(err)) throw err;
    const hint = formatMissingWhatsappOauthStatesMessage();
    console.error("[WhatsApp Embedded Signup] cleanupExpiredStates failed:", (err as Error)?.message || err);
    throw new Error(hint);
  }
}

/** Resolve Embedded Signup configuration ID — coexistence never falls back to the main config. */
export function resolveEmbeddedSignupConfigId(flow: "embedded" | "coexistence"): string {
  if (flow === "coexistence") {
    const c = process.env.META_WHATSAPP_COEXISTENCE_CONFIG_ID?.trim();
    if (!c) {
      throw new Error(
        "META_WHATSAPP_COEXISTENCE_CONFIG_ID is required for coexistence — create a separate Embedded Signup configuration in Meta and set this env var."
      );
    }
    return c;
  }
  const e = process.env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim();
  if (!e) throw new Error("META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID is not configured.");
  return e;
}

/** Build Meta OAuth URL with Embedded Signup config_id (redirect fallback; same params as SDK dialog). */
export function buildEmbeddedSignupAuthUrl(stateToken: string, flow: "embedded" | "coexistence"): string {
  const appId = process.env.META_APP_ID;
  if (!appId) throw new Error("META_APP_ID is not configured");

  const redirectUri = getWhatsappMetaRedirectUri();
  const configId = resolveEmbeddedSignupConfigId(flow);

  const dialogBase = getMetaFacebookOAuthDialogBase();

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state: stateToken,
    response_type: "code",
    config_id: configId,
  });
  // Embedded Signup expects override_default_response_type for auth code + config (per Meta samples).
  params.set("override_default_response_type", "true");

  return `${dialogBase}?${params.toString()}`;
}

export interface EmbeddedSignupSdkPayload {
  appId: string;
  graphApiVersion: string;
  configId: string;
}

export interface EmbeddedSignupStartResult {
  state: string;
  authUrl: string;
  sdk: EmbeddedSignupSdkPayload;
}

export async function startEmbeddedSignupSession(
  userId: string,
  flow: "embedded" | "coexistence"
): Promise<EmbeddedSignupStartResult> {
  const cfg = getWhatsappMetaPublicConfig();
  if (flow === "embedded" && !cfg.embeddedSignupEnabled) {
    throw new Error("WhatsApp Embedded Signup is not enabled or Meta app is not fully configured.");
  }
  if (flow === "coexistence" && !cfg.coexistenceEnabled) {
    throw new Error(
      "WhatsApp coexistence onboarding is not enabled — set WHATSAPP_COEXISTENCE_ENABLED and META_WHATSAPP_COEXISTENCE_CONFIG_ID."
    );
  }

  await cleanupExpiredStates();

  const stateToken = generateStateToken();
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);

  await db.insert(whatsappOauthStates).values({
    userId,
    stateToken,
    flow,
    expiresAt,
  });

  const configId = resolveEmbeddedSignupConfigId(flow);
  const appId = process.env.META_APP_ID!;
  const graphRaw = process.env.META_GRAPH_API_VERSION || "v21.0";
  const graphApiVersion = graphRaw.startsWith("v") ? graphRaw : `v${graphRaw}`;

  const authUrl = buildEmbeddedSignupAuthUrl(stateToken, flow);
  return {
    state: stateToken,
    authUrl,
    sdk: {
      appId,
      graphApiVersion,
      configId,
    },
  };
}

interface ResolvedWabaPhone {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
}

/**
 * Resolve WABA ID + phone_number_id from the user access token returned by Embedded Signup.
 * Uses debug_token granular_scopes first, then /{waba-id}/phone_numbers.
 */
function earliestExpiry(a: Date | null | undefined, b: Date | null | undefined): Date | null {
  const dates = [a, b].filter((d): d is Date => !!d && !Number.isNaN(d.getTime()));
  if (!dates.length) return null;
  return new Date(Math.min(...dates.map((d) => d.getTime())));
}

/** Expiry from Graph debug_token (`data.expires_at` unix seconds). */
export async function getAccessTokenExpiryFromDebug(accessToken: string): Promise<Date | null> {
  const base = getMetaGraphApiBase();
  const appId = process.env.META_APP_ID!;
  const appSecret = process.env.META_APP_SECRET!;
  const appAccessToken = `${appId}|${appSecret}`;
  const debugUrl = `${base}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appAccessToken)}`;
  const debugRes = await fetch(debugUrl);
  const debugJson = (await debugRes.json()) as any;
  if (!debugRes.ok) return null;
  const exp = debugJson?.data?.expires_at;
  if (typeof exp === "number" && exp > 0) {
    return new Date(exp * 1000);
  }
  return null;
}

async function resolveWabaAndPhone(accessToken: string): Promise<ResolvedWabaPhone> {
  const base = getMetaGraphApiBase();
  const appId = process.env.META_APP_ID!;
  const appSecret = process.env.META_APP_SECRET!;
  const appAccessToken = `${appId}|${appSecret}`;

  const debugUrl = `${base}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appAccessToken)}`;
  const debugRes = await fetch(debugUrl);
  const debugJson = (await debugRes.json()) as any;
  if (!debugRes.ok) {
    console.warn("[WhatsApp Embedded Signup] debug_token failed", debugJson?.error?.message || debugRes.status);
  }

  const granular = debugJson?.data?.granular_scopes || [];
  const wabaSet = new Set<string>();
  for (const g of granular) {
    if (
      (g.scope === "whatsapp_business_management" || g.scope === "whatsapp_business_messaging") &&
      Array.isArray(g.target_ids)
    ) {
      for (const id of g.target_ids) {
        if (typeof id === "string") wabaSet.add(id);
      }
    }
  }

  let wabaId = [...wabaSet][0];

  if (!wabaId) {
    const sharedUrl = `${base}/me?fields=shared_wa_business_accounts{id}&access_token=${encodeURIComponent(accessToken)}`;
    const sharedRes = await fetch(sharedUrl);
    const sharedJson = (await sharedRes.json()) as any;
    const first = sharedJson?.shared_wa_business_accounts?.data?.[0];
    if (first?.id) wabaId = first.id;
  }

  if (!wabaId) {
    throw new Error(
      "Could not read a WhatsApp Business Account from Meta. Finish Embedded Signup in the Meta window, or confirm your Meta app has WhatsApp products and Embedded Signup configuration."
    );
  }

  const pnUrl = `${base}/${wabaId}/phone_numbers?access_token=${encodeURIComponent(accessToken)}`;
  const pnRes = await fetch(pnUrl);
  const pnJson = (await pnRes.json()) as any;
  if (!pnRes.ok) {
    throw new Error(pnJson?.error?.message || "Failed to load phone numbers for your WhatsApp Business Account.");
  }
  const phones = pnJson?.data || [];
  if (!phones.length) {
    throw new Error("No WhatsApp phone numbers were found on this Business Account yet.");
  }
  const phone =
    phones.find((p: any) => p.is_official_business_account || p.verified_name) || phones[0];

  return {
    wabaId,
    phoneNumberId: phone.id,
    displayPhoneNumber: phone.display_phone_number,
    verifiedName: phone.verified_name,
  };
}

/**
 * Confirm our app id appears on `GET /{waba-id}/subscribed_apps` after POST.
 * Note: WhatsApp **message** and **status** delivery still requires webhook fields
 * configured on the app (WhatsApp product → Configuration).
 */
export async function verifyWabaAppSubscription(wabaId: string, userAccessToken: string): Promise<boolean> {
  const base = getMetaGraphApiBase();
  const appId = process.env.META_APP_ID!;
  const url = `${base}/${wabaId}/subscribed_apps?access_token=${encodeURIComponent(userAccessToken)}`;
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    console.warn("[WhatsApp Embedded Signup] subscribed_apps GET failed", json?.error?.message || res.status);
    return false;
  }
  const rows = json?.data ?? [];
  return rows.some((row: any) => String(row?.id ?? "") === appId);
}

/**
 * Subscribe our Meta app to the WABA (`POST /{waba-id}/subscribed_apps`),
 * then verify via GET that the app is listed.
 * @see https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/subscribed_apps/
 */
export async function subscribeAppToWaba(wabaId: string, userAccessToken: string): Promise<boolean> {
  const base = getMetaGraphApiBase();
  const url = `${base}/${wabaId}/subscribed_apps?access_token=${encodeURIComponent(userAccessToken)}`;
  const res = await fetch(url, { method: "POST" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.warn("[WhatsApp Embedded Signup] subscribed_apps POST failed", { wabaId, err: (json as any)?.error?.message });
    return false;
  }
  const postOk = (json as any)?.success === true || (json as any)?.success === undefined;
  if (!postOk) return false;

  const verified = await verifyWabaAppSubscription(wabaId, userAccessToken);
  if (!verified) {
    console.warn("[WhatsApp Embedded Signup] subscribed_apps POST ok but GET did not list this app yet", { wabaId });
  }
  return verified;
}

const TOKEN_ATTENTION_BEFORE_MS = 7 * 24 * 60 * 60 * 1000;

/** Sets metaIntegrationStatus to needs_attention when the long-lived token is expired or within 7 days. */
export async function applyMetaTokenExpiryAttention(userId: string): Promise<void> {
  const user = await storage.getUser(userId);
  if (!user?.metaConnected || user.whatsappProvider !== "meta") return;

  const exp = user.metaTokenExpiresAt;
  if (!exp) return;

  const t = exp.getTime();
  const now = Date.now();

  if (t <= now) {
    await storage.updateUser(userId, {
      metaIntegrationStatus: "needs_attention",
      metaLastErrorMessage:
        "Meta access token has expired. Disconnect and reconnect WhatsApp in Settings.",
    });
    return;
  }

  if (t - now < TOKEN_ATTENTION_BEFORE_MS && user.metaIntegrationStatus === "connected") {
    await storage.updateUser(userId, {
      metaIntegrationStatus: "needs_attention",
      metaLastErrorMessage:
        "Meta access token expires soon. Reconnect WhatsApp in Settings before it expires.",
    });
  }
}

export interface WhatsappConnectionDebugInfo {
  wabaId: string | null;
  phoneNumberId: string | null;
  provider: string;
  webhookSubscribed: boolean;
  connectionType: string | null;
  status: string;
  lastErrorMessage: string | null;
}

/** Safe diagnostics — no tokens or secrets. */
export async function getWhatsappConnectionDebug(userId: string): Promise<WhatsappConnectionDebugInfo | null> {
  const user = await storage.getUser(userId);
  if (!user) return null;
  return {
    wabaId: user.metaBusinessAccountId ?? null,
    phoneNumberId: user.metaPhoneNumberId ?? null,
    provider: (user.whatsappProvider as string) || "twilio",
    webhookSubscribed: user.metaWebhookSubscribed ?? false,
    connectionType: user.metaConnectionType ?? null,
    status:
      user.metaIntegrationStatus ?? (user.metaConnected ? "connected" : "disconnected"),
    lastErrorMessage: user.metaLastErrorMessage ?? null,
  };
}

/** Complete OAuth: validate state, exchange code, store credentials, subscribe webhooks. */
export async function completeEmbeddedSignupOAuth(params: {
  code: string;
  state: string;
  /** When set (e.g. JS SDK completion), must match the user who started the session. */
  initiatingUserId?: string;
}): Promise<{ success: true; userId: string } | { success: false; error: string }> {
  const { code, state, initiatingUserId } = params;

  await cleanupExpiredStates();

  const rows = await db
    .select()
    .from(whatsappOauthStates)
    .where(eq(whatsappOauthStates.stateToken, state))
    .limit(1);

  const row = rows[0];
  if (!row || row.expiresAt < new Date()) {
    return { success: false, error: "This signup link expired or is invalid. Please start again from Settings." };
  }

  if (initiatingUserId && row.userId !== initiatingUserId) {
    return {
      success: false,
      error: "This signup does not match your session. Start again from Settings.",
    };
  }

  await db.delete(whatsappOauthStates).where(eq(whatsappOauthStates.stateToken, state));

  const redirectUri = getWhatsappMetaRedirectUri();
  let shortToken: string;
  try {
    shortToken = await exchangeCodeForToken(code, redirectUri);
  } catch (e: any) {
    console.warn("[WhatsApp Embedded Signup] code exchange failed", e?.message || e);
    return {
      success: false,
      error:
        "Could not exchange the authorization code with Meta (redirect URI or app settings may not match). Close the window and try again with Continue with Meta.",
    };
  }

  let longToken: string;
  let tokenExpiresAt: Date | null = null;
  try {
    const exchanged = await exchangeForLongLivedUserToken(shortToken);
    longToken = exchanged.accessToken;
    tokenExpiresAt = exchanged.expiresAt;
  } catch {
    longToken = shortToken;
  }

  try {
    const debugExp = await getAccessTokenExpiryFromDebug(longToken);
    tokenExpiresAt = earliestExpiry(tokenExpiresAt, debugExp);
  } catch {
    /* non-fatal */
  }

  let resolved: ResolvedWabaPhone;
  try {
    resolved = await resolveWabaAndPhone(longToken);
  } catch (e: any) {
    const msg = e?.message || "Could not read WhatsApp account details from Meta.";
    await storage.updateUser(row.userId, {
      metaIntegrationStatus: "failed",
      metaLastErrorMessage: msg.slice(0, 500),
    });
    return { success: false, error: msg };
  }

  let subscribed = false;
  try {
    subscribed = await subscribeAppToWaba(resolved.wabaId, longToken);
  } catch (e: any) {
    console.warn("[WhatsApp Embedded Signup] subscribe warning", e?.message || e);
  }

  const credentials: MetaCredentials = {
    accessToken: longToken,
    phoneNumberId: resolved.phoneNumberId,
    businessAccountId: resolved.wabaId,
    appSecret: undefined,
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || undefined,
  };

  const connectionType = row.flow === "coexistence" ? "coexistence" : "embedded_signup";

  const result = await connectUserMeta(row.userId, credentials, {
    connectionType,
    displayPhoneNumber: resolved.displayPhoneNumber || null,
    verifiedName: resolved.verifiedName || null,
    webhookSubscribed: subscribed,
    tokenExpiresAt,
    metaIntegrationStatus: subscribed ? "connected" : "needs_attention",
  });

  if (!result.success) {
    return { success: false, error: result.error || "Could not save WhatsApp connection." };
  }

  if (!subscribed) {
    await storage.updateUser(row.userId, {
      metaIntegrationStatus: "needs_attention",
      metaLastErrorMessage:
        "Connected, but webhook subscription could not be confirmed. In Meta Developer Console, ensure this app is subscribed to your WABA and the callback URL matches our server.",
    });
  }

  return { success: true, userId: row.userId };
}
