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
import { getMetaGraphApiBase, getMetaFacebookOAuthDialogBase, getMetaGraphVersionSegment } from "./metaGraphVersion";
import { exchangeCodeForToken, exchangeForLongLivedUserToken, MetaOAuthExchangeError } from "./metaOAuth";
import {
  connectUserMeta,
  type MetaCredentials,
  encryptCredential,
  decryptCredential,
  isEncrypted,
  getMetaAccessToken,
  fetchMetaWhatsAppPhoneNumberGraphSnapshot,
  fetchWhatsAppPhoneNumberParentWabaId,
} from "./userMeta";
import { classifyMetaWhatsAppPhone, type MetaWhatsAppPhoneKind } from "./metaWhatsAppPhoneKind";
import {
  deriveWhatsappConnectedReason,
  type WhatsappConnectedReason,
} from "./whatsappService";

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
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_last_oauth_debug" jsonb;

UPDATE "users"
SET "meta_connection_type" = 'manual_legacy'
WHERE "meta_connected" = true AND "meta_connection_type" IS NULL;

CREATE TABLE IF NOT EXISTS "whatsapp_oauth_states" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "state_token" text NOT NULL UNIQUE,
  "flow" text NOT NULL,
  "redirect_uri" text,
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
  const uri = process.env.META_WHATSAPP_REDIRECT_URI;
  if (!uri) {
    throw new Error("META_WHATSAPP_REDIRECT_URI is not configured");
  }
  return uri;
}

export interface WhatsappMetaPublicConfig {
  embeddedSignupEnabled: boolean;
  /**
   * True when coexistence onboarding can start: Embedded Signup is enabled and
   * `META_WHATSAPP_COEXISTENCE_CONFIG_ID` is set (separate Meta Embedded Signup configuration for Business App coexistence).
   */
  coexistenceEnabled: boolean;
  /** Optional legacy flag — coexistence no longer requires this when coexistence config ID is set. */
  coexistenceFeatureFlagSet: boolean;
  metaConfigured: boolean;
  /** Safe client-only fields */
  appId: string | null;
  graphApiVersion: string;
  redirectUri: string;
  embeddedSignupConfigId: string | null;
  /** Raw env value when present — same ID must exist as a dedicated coexistence Embedded Signup config in Meta. */
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
  const coexistenceId = process.env.META_WHATSAPP_COEXISTENCE_CONFIG_ID?.trim();
  if (coexistenceId && !embedded) {
    console.warn(
      "[WhatsApp Embedded Signup] META_WHATSAPP_COEXISTENCE_CONFIG_ID is set but WHATSAPP_EMBEDDED_SIGNUP_ENABLED is off — enable Embedded Signup base env vars so coexistence can run."
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
  /** Coexistence onboarding is available whenever the dedicated coexistence config ID exists and base Embedded Signup is enabled. */
  const coexistenceEnabled = embeddedSignupEnabled && !!coexistenceConfigOnly;

  const graphRaw = process.env.META_GRAPH_API_VERSION || "v21.0";

  return {
    embeddedSignupEnabled,
    coexistenceEnabled,
    coexistenceFeatureFlagSet: coexistenceFlag,
    metaConfigured: !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
    appId: process.env.META_APP_ID || null,
    graphApiVersion: graphRaw.startsWith("v") ? graphRaw : `v${graphRaw}`,
    redirectUri: getWhatsappMetaRedirectUri(),
    embeddedSignupConfigId: process.env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || null,
    coexistenceConfigId: coexistenceConfigOnly,
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
  /** Same string as META_WHATSAPP_REDIRECT_URI — must match FB.login and Graph code exchange. */
  redirectUri: string;
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
      "WhatsApp coexistence onboarding is not enabled — set META_WHATSAPP_COEXISTENCE_CONFIG_ID (dedicated coexistence Embedded Signup configuration in Meta) and ensure WHATSAPP_EMBEDDED_SIGNUP_ENABLED + META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID are configured."
    );
  }

  await cleanupExpiredStates();

  const stateToken = generateStateToken();
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);
  const redirectUri = getWhatsappMetaRedirectUri();

  await db.insert(whatsappOauthStates).values({
    userId,
    stateToken,
    flow,
    redirectUri,
    expiresAt,
  });

  const configId = resolveEmbeddedSignupConfigId(flow);
  if (flow === "coexistence") {
    logCoexistenceDiagnostic({
      phase: "session_start_redirect",
      userId,
      flow,
      coexistenceUsesEnv: "META_WHATSAPP_COEXISTENCE_CONFIG_ID",
      configId,
    });
  }
  const appId = process.env.META_APP_ID!;
  const graphRaw = process.env.META_GRAPH_API_VERSION || "v21.0";
  const graphApiVersion = graphRaw.startsWith("v") ? graphRaw : `v${graphRaw}`;

  const authUrl = buildEmbeddedSignupAuthUrl(stateToken, flow);
  return {
    state: stateToken,
    authUrl,
    redirectUri,
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

type WabaPhoneChoice = {
  wabaId: string;
  wabaName?: string;
  phoneNumbers: Array<{
    id: string;
    displayPhoneNumber?: string;
    verifiedName?: string;
    qualityRating?: string;
  }>;
};

/** Exported for pending-WABA JSON + client picker (test vs prod badges). */
export type EnrichedWabaPhone = {
  id: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  phoneKind: MetaWhatsAppPhoneKind;
  phoneKindReasons: string[];
};

export type EnrichedWabaPhoneChoice = {
  wabaId: string;
  wabaName?: string;
  phoneNumbers: EnrichedWabaPhone[];
};

function enrichWabaPhoneChoices(choices: WabaPhoneChoice[]): EnrichedWabaPhoneChoice[] {
  return choices.map((w) => ({
    wabaId: w.wabaId,
    wabaName: w.wabaName,
    phoneNumbers: w.phoneNumbers.map((p) => {
      const c = classifyMetaWhatsAppPhone({
        displayPhoneNumber: p.displayPhoneNumber,
        verifiedName: p.verifiedName,
        qualityRating: p.qualityRating,
      });
      return {
        id: p.id,
        displayPhoneNumber: p.displayPhoneNumber,
        verifiedName: p.verifiedName,
        qualityRating: p.qualityRating,
        phoneKind: c.kind,
        phoneKindReasons: c.reasons,
      };
    }),
  }));
}

type FlatEnrichedPhone = EnrichedWabaPhone & { wabaId: string; wabaName?: string };

function flattenEnrichedWabaChoices(choices: EnrichedWabaPhoneChoice[]): FlatEnrichedPhone[] {
  const out: FlatEnrichedPhone[] = [];
  for (const w of choices) {
    for (const p of w.phoneNumbers) {
      out.push({ ...p, wabaId: w.wabaId, wabaName: w.wabaName });
    }
  }
  return out;
}

/**
 * Auto-select only when there is exactly one unambiguous production line, or exactly one “unknown” line
 * and no test lines. Never auto-select Meta test lines when any other candidate exists; otherwise require explicit UI pick.
 */
export function decideEmbeddedSignupPhoneSelection(choices: EnrichedWabaPhoneChoice[]):
  | { mode: "auto"; pick: ResolvedWabaPhone & { phoneKind: MetaWhatsAppPhoneKind } }
  | { mode: "pending_pick"; pendingReason: string } {
  const flat = flattenEnrichedWabaChoices(choices);
  if (flat.length === 0) {
    return { mode: "pending_pick", pendingReason: "no_phone_numbers" };
  }

  const prod = flat.filter((p) => p.phoneKind === "production");
  const unk = flat.filter((p) => p.phoneKind === "unknown");
  const test = flat.filter((p) => p.phoneKind === "test");

  if (prod.length >= 2) {
    return { mode: "pending_pick", pendingReason: "multiple_production_numbers" };
  }
  if (prod.length === 1) {
    const p = prod[0];
    return {
      mode: "auto",
      pick: {
        wabaId: p.wabaId,
        phoneNumberId: p.id,
        displayPhoneNumber: p.displayPhoneNumber,
        verifiedName: p.verifiedName,
        phoneKind: "production",
      },
    };
  }

  if (unk.length >= 2) {
    return { mode: "pending_pick", pendingReason: "multiple_unknown_numbers" };
  }
  if (unk.length === 1 && test.length === 0) {
    const p = unk[0];
    return {
      mode: "auto",
      pick: {
        wabaId: p.wabaId,
        phoneNumberId: p.id,
        displayPhoneNumber: p.displayPhoneNumber,
        verifiedName: p.verifiedName,
        phoneKind: "unknown",
      },
    };
  }

  return {
    mode: "pending_pick",
    pendingReason:
      test.length >= 1 ? "test_or_mixed_candidates_require_explicit_pick" : "ambiguous_phone_choice",
  };
}

function buildWabaDiscoveryDetailPayload(choices: EnrichedWabaPhoneChoice[]) {
  return {
    at: new Date().toISOString(),
    wabas: choices.map((w) => ({
      wabaId: w.wabaId,
      wabaName: w.wabaName ?? null,
      phones: w.phoneNumbers.map((p) => ({
        phoneNumberId: p.id,
        displayPhoneNumber: p.displayPhoneNumber ?? null,
        verifiedName: p.verifiedName ?? null,
        qualityRating: p.qualityRating ?? null,
        phoneKind: p.phoneKind,
        phoneKindReasons: p.phoneKindReasons,
      })),
    })),
  };
}

function logCoexistenceDiagnostic(payload: Record<string, unknown>): void {
  console.log(`[CoexistenceOAuth] ${JSON.stringify(payload)}`);
}

function jsonTruncate(v: unknown, max = 12_000): string {
  try {
    const s = JSON.stringify(v);
    return s.length > max ? `${s.slice(0, max)}…[truncated]` : s;
  } catch {
    return "[unserializable]";
  }
}

/** Full Meta row subset so Option B failures can restore the prior working integration (no decrypted secrets in logs). */
type PersistedMetaIntegrationSnapshot = {
  hadMetaConnection: boolean;
  whatsappProvider: string | null;
  metaAccessToken: string | null;
  metaPhoneNumberId: string | null;
  metaBusinessAccountId: string | null;
  metaAppSecret: string | null;
  metaWebhookVerifyToken: string | null;
  metaConnected: boolean;
  metaConnectionType: string | null;
  metaDisplayPhoneNumber: string | null;
  metaVerifiedName: string | null;
  metaWebhookSubscribed: boolean;
  metaWebhookLastCheckedAt: Date | null;
  metaIntegrationStatus: string | null;
  metaTokenExpiresAt: Date | null;
  metaLastErrorCode: string | null;
  metaLastErrorMessage: string | null;
};

async function capturePersistedMetaSnapshot(userId: string): Promise<PersistedMetaIntegrationSnapshot | null> {
  const u = await storage.getUserForSession(userId);
  if (!u) return null;
  return {
    hadMetaConnection: !!u.metaConnected,
    whatsappProvider: u.whatsappProvider ?? null,
    metaAccessToken: u.metaAccessToken ?? null,
    metaPhoneNumberId: u.metaPhoneNumberId ?? null,
    metaBusinessAccountId: u.metaBusinessAccountId ?? null,
    metaAppSecret: u.metaAppSecret ?? null,
    metaWebhookVerifyToken: u.metaWebhookVerifyToken ?? null,
    metaConnected: !!u.metaConnected,
    metaConnectionType: u.metaConnectionType ?? null,
    metaDisplayPhoneNumber: u.metaDisplayPhoneNumber ?? null,
    metaVerifiedName: u.metaVerifiedName ?? null,
    metaWebhookSubscribed: !!u.metaWebhookSubscribed,
    metaWebhookLastCheckedAt: u.metaWebhookLastCheckedAt ?? null,
    metaIntegrationStatus: u.metaIntegrationStatus ?? null,
    metaTokenExpiresAt: u.metaTokenExpiresAt ?? null,
    metaLastErrorCode: u.metaLastErrorCode ?? null,
    metaLastErrorMessage: u.metaLastErrorMessage ?? null,
  };
}

async function restorePersistedMetaSnapshot(userId: string, snap: PersistedMetaIntegrationSnapshot): Promise<void> {
  if (!snap.hadMetaConnection) return;
  await storage.updateUser(userId, {
    metaAccessToken: snap.metaAccessToken,
    metaPhoneNumberId: snap.metaPhoneNumberId,
    metaBusinessAccountId: snap.metaBusinessAccountId,
    metaAppSecret: snap.metaAppSecret,
    metaWebhookVerifyToken: snap.metaWebhookVerifyToken,
    metaConnected: snap.metaConnected,
    whatsappProvider: (snap.whatsappProvider as any) || "twilio",
    metaConnectionType: snap.metaConnectionType,
    metaDisplayPhoneNumber: snap.metaDisplayPhoneNumber,
    metaVerifiedName: snap.metaVerifiedName,
    metaWebhookSubscribed: snap.metaWebhookSubscribed,
    metaWebhookLastCheckedAt: snap.metaWebhookLastCheckedAt,
    metaIntegrationStatus: snap.metaIntegrationStatus,
    metaTokenExpiresAt: snap.metaTokenExpiresAt,
    metaLastErrorCode: snap.metaLastErrorCode,
    metaLastErrorMessage: snap.metaLastErrorMessage,
  });
}

async function fetchWabaIdsFromUserTokenDebug(accessToken: string): Promise<{
  wabaIds: string[];
  rawTruncated: string;
  httpOk: boolean;
}> {
  const base = getMetaGraphApiBase();
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return { wabaIds: [], rawTruncated: "META_APP_ID/META_APP_SECRET unset", httpOk: false };
  }
  const url = `${base}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const json = (await res.json().catch(() => ({}))) as any;
  const rawTruncated = jsonTruncate(json, 14_000);
  const wabaIds = new Set<string>();
  const granular = json?.data?.granular_scopes;
  if (Array.isArray(granular)) {
    for (const g of granular) {
      const scope = String(g?.scope || "");
      const targets = g?.target_ids;
      if (!Array.isArray(targets)) continue;
      if (/whatsapp|business_management|waba/i.test(scope)) {
        for (const t of targets) {
          const id = normalizeMetaGraphIdLoose(t);
          if (id) wabaIds.add(id);
        }
      }
    }
  }
  return { wabaIds: [...wabaIds], rawTruncated, httpOk: res.ok && !json?.error };
}

function normalizeMetaGraphIdLoose(v: unknown): string {
  if (v == null || v === "") return "";
  const s = String(v).trim();
  return /^\d+$/.test(s) ? s : "";
}

type WabaDiscoveryRunDiagnostics = {
  businessesCount: number;
  distinctWabaCount: number;
  wabasWithPhonesListed: number;
  totalPhonesListed: number;
  debugTokenWabaIdsMerged: number;
  businessesRawTruncated: string;
  debugTokenOk: boolean;
};

/**
 * If Graph discovery returns no usable phones for coexistence, rebuild a synthetic WABA choice
 * from persisted phone IDs / phoneGraphSnapshot and validate the new user token against that phone.
 */
async function buildCoexistenceFallbackWabaChoices(params: {
  userId: string;
  accessToken: string;
  previousSnap: PersistedMetaIntegrationSnapshot | null;
}): Promise<WabaPhoneChoice[] | null> {
  const { userId, accessToken, previousSnap } = params;
  const user = await storage.getUserForSession(userId);
  const oauthDbg =
    user?.metaLastOAuthDebug && typeof user.metaLastOAuthDebug === "object"
      ? (user.metaLastOAuthDebug as Record<string, unknown>)
      : {};
  const phoneSnap = oauthDbg.phoneGraphSnapshot as Record<string, unknown> | undefined;
  const innerData =
    phoneSnap?.data && typeof phoneSnap.data === "object"
      ? (phoneSnap.data as Record<string, unknown>)
      : undefined;
  let phoneNumberId =
    (innerData?.id != null ? String(innerData.id).trim() : "") ||
    (phoneSnap?.phoneNumberId != null ? String(phoneSnap.phoneNumberId).trim() : "") ||
    (user?.metaPhoneNumberId || "").trim() ||
    (previousSnap?.metaPhoneNumberId || "").trim();
  if (!phoneNumberId) {
    logCoexistenceDiagnostic({ phase: "coexistence_fallback", ok: false, reason: "no_phone_id_in_snapshot_or_user" });
    return null;
  }

  const base = getMetaGraphApiBase();
  const probe = await fetch(
    `${base}/${encodeURIComponent(phoneNumberId)}?fields=id&access_token=${encodeURIComponent(accessToken)}`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!probe.ok) {
    const errBody = await probe.json().catch(() => ({}));
    logCoexistenceDiagnostic({
      phase: "coexistence_fallback_phone_probe",
      ok: false,
      phoneNumberId,
      httpStatus: probe.status,
      error: (errBody as any)?.error ?? null,
    });
    return null;
  }

  let wabaId = (user?.metaBusinessAccountId || previousSnap?.metaBusinessAccountId || "").trim();
  const parent = await fetchWhatsAppPhoneNumberParentWabaId(accessToken, phoneNumberId);
  if (parent.ok) {
    wabaId = parent.wabaId;
  }
  if (!wabaId) {
    logCoexistenceDiagnostic({
      phase: "coexistence_fallback",
      ok: false,
      reason: "no_waba_id_and_graph_parent_missing",
      phoneNumberId,
    });
    return null;
  }

  const displayPhone =
    typeof innerData?.display_phone_number === "string"
      ? innerData.display_phone_number
      : user?.metaDisplayPhoneNumber || previousSnap?.metaDisplayPhoneNumber || undefined;
  const verifiedName =
    typeof innerData?.verified_name === "string"
      ? innerData.verified_name
      : user?.metaVerifiedName || previousSnap?.metaVerifiedName || undefined;

  logCoexistenceDiagnostic({
    phase: "coexistence_fallback_synthetic_choice",
    ok: true,
    wabaId,
    phoneNumberId,
    wabaFromGraphParent: parent.ok,
  });

  return [
    {
      wabaId,
      wabaName: "fallback_from_persisted_phone",
      phoneNumbers: [
        {
          id: phoneNumberId,
          displayPhoneNumber: displayPhone,
          verifiedName,
        },
      ],
    },
  ];
}

async function fetchUserWabaChoices(
  accessToken: string
): Promise<{ choices: WabaPhoneChoice[]; diagnostics: WabaDiscoveryRunDiagnostics }> {
  const base = getMetaGraphApiBase();

  // The User node does not expose whatsapp_business_accounts; discover via Business edges instead.
  // A) GET /me/businesses
  const bizRes = await fetch(
    `${base}/me/businesses?fields=id,name&limit=50&access_token=${encodeURIComponent(accessToken)}`
  );
  const bizJson = (await bizRes.json().catch(() => ({}))) as any;
  logCoexistenceDiagnostic({
    phase: "waba_discovery_me_businesses",
    httpOk: bizRes.ok,
    rawTruncated: jsonTruncate({ status: bizRes.status, body: bizJson }),
  });
  if (!bizRes.ok) {
    const msg = bizJson?.error?.message || "Failed to fetch businesses.";
    throw new Error(msg);
  }
  const businesses: Array<{ id: string; name?: string }> = Array.isArray(bizJson?.data)
    ? bizJson.data
        .map((r: any) => ({ id: String(r?.id || ""), name: typeof r?.name === "string" ? r.name : undefined }))
        .filter((r: { id: string }) => !!r.id)
    : [];

  console.log("[WABA DISCOVERY] businesses count", { count: businesses.length });

  // B) For each business: owned_whatsapp_business_accounts and client_whatsapp_business_accounts
  const wabaById = new Map<string, { id: string; name?: string }>();
  let ownedCount = 0;
  let clientCount = 0;

  for (const biz of businesses) {
    const ownedRes = await fetch(
      `${base}/${encodeURIComponent(biz.id)}/owned_whatsapp_business_accounts?fields=id,name&limit=50&access_token=${encodeURIComponent(accessToken)}`
    );
    const ownedJson = (await ownedRes.json().catch(() => ({}))) as any;
    if (ownedRes.ok && Array.isArray(ownedJson?.data)) {
      ownedCount += ownedJson.data.length;
      for (const r of ownedJson.data) {
        const id = String(r?.id || "");
        if (!id) continue;
        wabaById.set(id, { id, name: typeof r?.name === "string" ? r.name : undefined });
      }
    }

    const clientRes = await fetch(
      `${base}/${encodeURIComponent(biz.id)}/client_whatsapp_business_accounts?fields=id,name&limit=50&access_token=${encodeURIComponent(accessToken)}`
    );
    const clientJson = (await clientRes.json().catch(() => ({}))) as any;
    if (clientRes.ok && Array.isArray(clientJson?.data)) {
      clientCount += clientJson.data.length;
      for (const r of clientJson.data) {
        const id = String(r?.id || "");
        if (!id) continue;
        wabaById.set(id, { id, name: typeof r?.name === "string" ? r.name : undefined });
      }
    }
  }

  console.log("[WABA DISCOVERY] owned WABAs count", { count: ownedCount });
  console.log("[WABA DISCOVERY] client WABAs count", { count: clientCount });

  const beforeDebugMerge = wabaById.size;
  const debugPkg = await fetchWabaIdsFromUserTokenDebug(accessToken);
  for (const wid of debugPkg.wabaIds) {
    if (!wabaById.has(wid)) {
      wabaById.set(wid, { id: wid, name: undefined });
    }
  }
  const debugTokenWabaIdsMerged = wabaById.size - beforeDebugMerge;
  logCoexistenceDiagnostic({
    phase: "waba_discovery_debug_token_granular",
    httpOk: debugPkg.httpOk,
    granularWabaCount: debugPkg.wabaIds.length,
    wabaIdsSample: debugPkg.wabaIds.slice(0, 30),
    rawTruncated: debugPkg.rawTruncated.slice(0, 6000),
  });

  const wabas = Array.from(wabaById.values());

  // 2) For each WABA, fetch phone numbers (keep WABAs even when Meta returns zero rows — distinguishes “listing gap” vs “no WABA”.)
  const choices: WabaPhoneChoice[] = [];
  let wabasWithPhonesListed = 0;
  let totalPhonesListed = 0;
  for (const w of wabas) {
    const pnRes = await fetch(
      `${base}/${encodeURIComponent(w.id)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating&limit=50&access_token=${encodeURIComponent(accessToken)}`
    );
    const pnJson = (await pnRes.json().catch(() => ({}))) as any;
    if (!pnRes.ok) {
      logCoexistenceDiagnostic({
        phase: "waba_discovery_phone_numbers_error",
        wabaId: w.id,
        httpOk: pnRes.ok,
        rawTruncated: jsonTruncate({ status: pnRes.status, body: pnJson }, 6000),
      });
      choices.push({
        wabaId: w.id,
        wabaName: w.name,
        phoneNumbers: [],
      });
      continue;
    }
    const phones: any[] = Array.isArray(pnJson?.data) ? pnJson.data : [];
    logCoexistenceDiagnostic({
      phase: "waba_discovery_phone_numbers_ok",
      wabaId: w.id,
      phoneRowCount: phones.length,
      rawTruncated: jsonTruncate({ data: pnJson?.data }),
    });

    const phoneNumbers = phones
      .map((p: any) => ({
        id: String(p?.id || ""),
        displayPhoneNumber: typeof p?.display_phone_number === "string" ? p.display_phone_number : undefined,
        verifiedName: typeof p?.verified_name === "string" ? p.verified_name : undefined,
        qualityRating: typeof p?.quality_rating === "string" ? p.quality_rating : undefined,
      }))
      .filter((p) => !!p.id);

    if (phoneNumbers.length > 0) {
      wabasWithPhonesListed += 1;
      totalPhonesListed += phoneNumbers.length;
    }

    choices.push({
      wabaId: w.id,
      wabaName: w.name,
      phoneNumbers,
    });
  }

  console.log("[WABA DISCOVERY] WABA rows fetched (including zero-phone)", {
    choices: choices.length,
    totalPhonesListed,
    wabasWithPhonesListed,
  });

  return {
    choices,
    diagnostics: {
      businessesCount: businesses.length,
      distinctWabaCount: wabaById.size,
      wabasWithPhonesListed,
      totalPhonesListed,
      debugTokenWabaIdsMerged,
      businessesRawTruncated: jsonTruncate({ ok: bizRes.ok, businesses }, 8000),
      debugTokenOk: debugPkg.httpOk,
    },
  };
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

function sortIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

/**
 * Legacy helper: returns a single selection only when {@link decideEmbeddedSignupPhoneSelection}
 * would auto-pick (no test-vs-prod ambiguity). Otherwise returns null.
 */
export function pickFirstValidWabaSelection(choices: WabaPhoneChoice[]): ResolvedWabaPhone | null {
  if (!choices.length) return null;
  const enriched = enrichWabaPhoneChoices(choices);
  const d = decideEmbeddedSignupPhoneSelection(enriched);
  if (d.mode !== "auto") return null;
  return {
    wabaId: d.pick.wabaId,
    phoneNumberId: d.pick.phoneNumberId,
    displayPhoneNumber: d.pick.displayPhoneNumber,
    verifiedName: d.pick.verifiedName,
  };
}

export async function mergeUserMetaOAuthDebug(
  userId: string,
  patch: Record<string, unknown>
): Promise<void> {
  try {
    const prevRow = await storage.getUserForSession(userId);
    const prev =
      prevRow && prevRow.metaLastOAuthDebug && typeof prevRow.metaLastOAuthDebug === "object"
        ? (prevRow.metaLastOAuthDebug as Record<string, unknown>)
        : {};
    const next = {
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await storage.updateUser(userId, { metaLastOAuthDebug: next as any });
  } catch (e: any) {
    console.warn("[WhatsApp Embedded Signup] could not persist metaLastOAuthDebug", e?.message || e);
  }
}

const PHONE_GRAPH_DEBUG_TTL_MS = 15 * 60 * 1000;

export type WhatsAppInboundRoutingSummary =
  | "coexistence_flow"
  | "standard_embedded_or_manual"
  | "not_connected";

/**
 * Explains whether customer-originated messages are expected on POST /api/webhook/meta vs staying in the WhatsApp Business App.
 * Coexistence Embedded Signup is required for “same number” Business App + Cloud API routing per Meta.
 */
export function buildWhatsAppInboundRoutingDiagnostics(input: {
  metaConnected: boolean;
  activeProvider: string;
  metaConnectionType: string | null;
  coexistenceServerConfigured: boolean;
  webhookSubscribed: boolean;
}): {
  summary: WhatsAppInboundRoutingSummary;
  customerMessageDelivery: "cloud_api_webhook_expected" | "whatsapp_business_app_may_be_primary" | "n_a";
  detail: string;
  coexistenceReconnectRecommended: boolean;
} {
  if (!input.metaConnected || input.activeProvider !== "meta") {
    return {
      summary: "not_connected",
      customerMessageDelivery: "n_a",
      detail: "Meta Cloud API is not the active WhatsApp provider.",
      coexistenceReconnectRecommended: false,
    };
  }

  const usedCoexistence = input.metaConnectionType === "coexistence";

  if (usedCoexistence) {
    return {
      summary: "coexistence_flow",
      customerMessageDelivery: "cloud_api_webhook_expected",
      detail:
        "Coexistence Embedded Signup was used for this connection. Meta should route compatible customer messages to your Cloud API webhook while you keep using the WhatsApp Business App.",
      coexistenceReconnectRecommended: false,
    };
  }

  const reconnect = input.webhookSubscribed && !usedCoexistence;

  const envHint = input.coexistenceServerConfigured
    ? "Disconnect Meta in Settings, then reconnect using the coexistence option (existing WhatsApp Business App number)."
    : "Set META_WHATSAPP_COEXISTENCE_CONFIG_ID to a coexistence Embedded Signup configuration in Meta, redeploy, then disconnect and reconnect using the coexistence option.";

  return {
    summary: "standard_embedded_or_manual",
    customerMessageDelivery: "whatsapp_business_app_may_be_primary",
    detail:
      "This workspace connected Cloud API without the coexistence Embedded Signup flow. If customers message you in the WhatsApp Business App and nothing POSTs to WhachatCRM, Meta is likely delivering those chats only to the mobile app until coexistence is completed. " +
      envHint,
    coexistenceReconnectRecommended: reconnect,
  };
}

/** Periodically refreshes Graph fields for the saved phone number into meta_last_oauth_debug.phoneGraphSnapshot (no secrets). */
export async function refreshWhatsappPhoneGraphDebugIfStale(userId: string): Promise<void> {
  try {
    const user = await storage.getUserForSession(userId);
    if (!user?.metaConnected || !user.metaPhoneNumberId) return;

    const oauthDbg =
      user.metaLastOAuthDebug && typeof user.metaLastOAuthDebug === "object"
        ? (user.metaLastOAuthDebug as Record<string, unknown>)
        : {};
    const prevSnap = oauthDbg.phoneGraphSnapshot as { fetchedAt?: string } | undefined;
    if (prevSnap?.fetchedAt) {
      const t = new Date(prevSnap.fetchedAt).getTime();
      if (!Number.isNaN(t) && Date.now() - t < PHONE_GRAPH_DEBUG_TTL_MS) return;
    }

    const token = await getMetaAccessToken(userId);
    if (!token) return;

    const snap = await fetchMetaWhatsAppPhoneNumberGraphSnapshot(token, user.metaPhoneNumberId);
    await mergeUserMetaOAuthDebug(userId, {
      phoneGraphSnapshot: {
        fetchedAt: new Date().toISOString(),
        phoneNumberId: user.metaPhoneNumberId,
        ...snap,
      },
    });
  } catch (e: any) {
    console.warn("[WhatsApp Embedded Signup] phoneGraphSnapshot refresh skipped:", e?.message || e);
  }
}

/** Persist Meta redirect callback query params (errors only — never tokens). */
export async function recordWhatsappMetaRedirectCallbackDebug(params: {
  state?: string;
  query: Record<string, string | undefined>;
}): Promise<void> {
  const state = params.state?.trim();
  if (!state) return;
  try {
    const rows = await db
      .select({ userId: whatsappOauthStates.userId, expiresAt: whatsappOauthStates.expiresAt })
      .from(whatsappOauthStates)
      .where(eq(whatsappOauthStates.stateToken, state))
      .limit(1);
    const row = rows[0];
    if (!row || row.expiresAt < new Date()) return;

    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "meta_redirect_callback",
      oauthState: state,
      query: params.query,
    });
  } catch {
    /* ignore */
  }
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

/**
 * Confirm our app id appears on `GET /{waba-id}/subscribed_apps` after POST.
 * Note: WhatsApp **message** and **status** delivery still requires webhook fields
 * configured on the app (WhatsApp product → Configuration).
 */
type MetaGraphErrorShape = { code?: number; message?: string; type?: string };

function logWhatsAppWebhookSubscribe(params: {
  wabaId: string;
  phoneNumberId: string | null;
  userId: string;
  graphVersion: string;
  subscribeStatus: string;
  verifyStatus: string;
  errorCode: number | string | null;
  errorMessage: string | null;
}): void {
  console.log(
    `[WhatsAppWebhookSubscribe] ${JSON.stringify({
      wabaId: params.wabaId,
      phoneNumberId: params.phoneNumberId,
      userId: params.userId,
      graphVersion: params.graphVersion,
      subscribeStatus: params.subscribeStatus,
      verifyStatus: params.verifyStatus,
      errorCode: params.errorCode,
      errorMessage: params.errorMessage,
    })}`
  );
}

/** Safe summary from Graph `debug_token` for the **user** access token — never logs the token. */
export type MetaUserTokenDebugSummary = {
  ok: boolean;
  httpStatus?: number;
  app_id?: string | null;
  type?: string | null;
  is_valid?: boolean | null;
  expires_at?: number | null;
  scopes?: string[] | null;
  granular_scopes_summary?: Array<{ scope: string; target_ids_count: number }>;
  error?: { message?: string; code?: number };
};

export async function fetchMetaUserTokenDebugSummary(userAccessToken: string): Promise<MetaUserTokenDebugSummary> {
  const base = getMetaGraphApiBase();
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    return { ok: false, error: { message: "META_APP_ID or META_APP_SECRET unset", code: 0 } };
  }
  const url = `${base}/debug_token?input_token=${encodeURIComponent(userAccessToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    const json = (await res.json().catch(() => ({}))) as any;
    const d = json?.data;
    const granular = Array.isArray(d?.granular_scopes) ? d.granular_scopes : [];
    const granular_scopes_summary = granular.map((g: any) => ({
      scope: String(g?.scope || ""),
      target_ids_count: Array.isArray(g?.target_ids) ? g.target_ids.length : 0,
    }));
    return {
      ok: res.ok && !json?.error && d?.is_valid !== false,
      httpStatus: res.status,
      app_id: d?.app_id != null ? String(d.app_id) : null,
      type: d?.type ?? null,
      is_valid: typeof d?.is_valid === "boolean" ? d.is_valid : null,
      expires_at: typeof d?.expires_at === "number" ? d.expires_at : null,
      scopes: Array.isArray(d?.scopes) ? d.scopes.map(String) : null,
      granular_scopes_summary,
      error: json?.error ? { message: json.error.message, code: json.error.code } : undefined,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { message: msg, code: 0 } };
  }
}

async function postWabaSubscribedAppsDetailed(
  wabaId: string,
  userAccessToken: string
): Promise<{ httpOk: boolean; graphSuccess: boolean; error?: MetaGraphErrorShape }> {
  const base = getMetaGraphApiBase();
  const url = `${base}/${wabaId}/subscribed_apps?access_token=${encodeURIComponent(userAccessToken)}`;
  const res = await fetch(url, { method: "POST" });
  const rawText = await res.text();
  let json: any = {};
  try {
    json = rawText ? JSON.parse(rawText) : {};
  } catch {
    json = { _parseError: true as const, rawSnippet: rawText.slice(0, 2000) };
  }
  const truncated =
    typeof rawText === "string" && rawText.length > 14_000 ? `${rawText.slice(0, 14_000)}…[truncated]` : rawText;
  console.log(
    `[WABA SubscribedApps POST] ${JSON.stringify({
      wabaId,
      httpStatus: res.status,
      httpOk: res.ok,
      rawResponse: truncated,
      graphError: json?.error ?? null,
    })}`
  );
  if (!res.ok) {
    return { httpOk: false, graphSuccess: false, error: json?.error };
  }
  const graphSuccess = json?.success === true || json?.success === undefined;
  return { httpOk: true, graphSuccess, error: graphSuccess ? undefined : { message: "Graph returned success=false" } };
}

function normalizeMetaId(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return null;
  if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v));
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  return null;
}

/** Compare Meta app IDs allowing string/number/BigInt equivalence (FB ids are large integers). */
function metaAppIdsEqual(configured: string, candidate: string): boolean {
  const a = String(configured).trim();
  const b = String(candidate).trim();
  if (a === b) return true;
  if (a == b) return true;
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
}

/**
 * Collect candidate app ids from Graph `GET /{waba-id}/subscribed_apps` payload.
 * Handles id vs number, nested application/app objects, and extra keys Graph may add.
 */
function extractReturnedAppIdsFromSubscribedAppsJson(json: any): {
  ids: string[];
  rowSnapshots: Array<{ keys: string[]; idFields: Record<string, unknown> }>;
} {
  const ids = new Set<string>();
  const rowSnapshots: Array<{ keys: string[]; idFields: Record<string, unknown> }> = [];
  const rows = Array.isArray(json?.data) ? json.data : [];

  function walk(obj: unknown, depth: number): void {
    if (depth > 6 || obj == null) return;
    if (typeof obj !== "object") return;
    const o = obj as Record<string, unknown>;
    for (const key of ["id", "app_id", "application_id"]) {
      const n = normalizeMetaId(o[key]);
      if (n) ids.add(n);
    }
    const app = (o.application ?? o.app) as Record<string, unknown> | undefined;
    if (app && typeof app === "object") {
      for (const key of ["id", "app_id"]) {
        const n = normalizeMetaId(app[key]);
        if (n) ids.add(n);
      }
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === "object" && !Array.isArray(v)) walk(v, depth + 1);
    }
  }

  for (const row of rows) {
    if (row && typeof row === "object") {
      const r = row as Record<string, unknown>;
      rowSnapshots.push({
        keys: Object.keys(r),
        idFields: {
          id: r.id,
          app_id: r.app_id,
          application: r.application,
          app: r.app,
        },
      });
      walk(row, 0);
    }
  }

  return { ids: [...ids], rowSnapshots };
}

async function verifyWabaAppSubscriptionDetailed(
  wabaId: string,
  userAccessToken: string,
  attemptLabel = "attempt"
): Promise<{ verified: boolean; error?: MetaGraphErrorShape; matchedId?: string }> {
  const configuredAppId = (process.env.META_APP_ID ?? "").trim();
  const base = getMetaGraphApiBase();
  const url = `${base}/${wabaId}/subscribed_apps?access_token=${encodeURIComponent(userAccessToken)}`;
  const res = await fetch(url);
  const rawText = await res.text();
  let json: any = {};
  try {
    json = rawText ? JSON.parse(rawText) : {};
  } catch {
    json = { _parseError: true as const, rawSnippet: rawText.slice(0, 800) };
  }

  const httpOk = res.ok;
  const { ids: returnedAppIds, rowSnapshots } = extractReturnedAppIdsFromSubscribedAppsJson(json);

  let verified = false;
  let matchedId: string | undefined;
  const equalityChecks = returnedAppIds.map((rid) => ({
    returnedId: rid,
    strictEq: configuredAppId === rid,
    looseEq: configuredAppId == rid,
    bigintEq: metaAppIdsEqual(configuredAppId, rid),
    matched: metaAppIdsEqual(configuredAppId, rid),
  }));

  for (const row of equalityChecks) {
    if (row.matched) {
      verified = true;
      matchedId = row.returnedId;
      break;
    }
  }

  console.log(
    `[SubscribedAppsGET] ${JSON.stringify({
      phase: "verify_raw",
      attemptLabel,
      wabaId,
      metaAppIdConfigured: configuredAppId,
      metaAppIdConfiguredType: typeof configuredAppId,
      httpStatus: res.status,
      httpOk,
      returnedAppIds,
      returnedCount: returnedAppIds.length,
      equalityChecks,
      verified,
      matchedId: matchedId ?? null,
      dataArrayLength: Array.isArray(json?.data) ? json.data.length : null,
      rowSnapshots: rowSnapshots.slice(0, 5),
      rawResponseTruncated: typeof rawText === "string" ? rawText.slice(0, 8000) : null,
      graphError: json?.error ?? null,
    })}`
  );

  if (!httpOk) {
    return { verified: false, error: json?.error };
  }
  return { verified, matchedId };
}

export async function verifyWabaAppSubscription(wabaId: string, userAccessToken: string): Promise<boolean> {
  const r = await verifyWabaAppSubscriptionDetailed(wabaId, userAccessToken);
  if (!r.verified && r.error) {
    console.warn("[WhatsApp Embedded Signup] subscribed_apps GET failed", r.error?.message || wabaId);
  }
  return r.verified;
}

/**
 * Subscribe our Meta app to the WABA (`POST /{waba-id}/subscribed_apps`),
 * then verify via GET that the app is listed.
 * @see https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/subscribed_apps/
 */
export async function subscribeAppToWaba(wabaId: string, userAccessToken: string): Promise<boolean> {
  const post = await postWabaSubscribedAppsDetailed(wabaId, userAccessToken);
  if (!post.httpOk || !post.graphSuccess) {
    console.warn("[WhatsApp Embedded Signup] subscribed_apps POST failed", {
      wabaId,
      err: post.error?.message,
    });
    return false;
  }
  const verified = await verifyWabaAppSubscription(wabaId, userAccessToken);
  if (!verified) {
    console.warn("[WhatsApp Embedded Signup] subscribed_apps POST ok but GET did not list this app yet", { wabaId });
  }
  return verified;
}

/**
 * Production repair: `POST /{waba-id}/subscribed_apps` using the **saved** user token, then
 * `GET /{waba-id}/subscribed_apps` to confirm this app id is listed. Updates DB webhook flags.
 * Uses `meta_business_account_id` from the user row (current production WABA).
 */
export async function repairMetaWabaWebhookSubscription(userId: string): Promise<{
  success: boolean;
  verified: boolean;
  errorMessage?: string;
}> {
  const graphVersion = getMetaGraphVersionSegment();
  const user = await storage.getUserForSession(userId);
  const wabaId = user?.metaBusinessAccountId ?? "";
  const phoneNumberId = user?.metaPhoneNumberId ?? null;

  const failLog = (
    subscribeStatus: string,
    verifyStatus: string,
    errorCode: number | string | null,
    errorMessage: string | null
  ) => {
    logWhatsAppWebhookSubscribe({
      wabaId: wabaId || "(none)",
      phoneNumberId,
      userId,
      graphVersion,
      subscribeStatus,
      verifyStatus,
      errorCode,
      errorMessage,
    });
  };

  if (!user?.metaConnected || !wabaId || user.whatsappProvider !== "meta") {
    failLog("skipped", "skipped", null, "meta_not_active_or_missing_waba");
    return {
      success: false,
      verified: false,
      errorMessage: "Meta Cloud API is not the active WhatsApp provider or WABA is missing.",
    };
  }

  const token = await getMetaAccessToken(userId);
  if (!token) {
    failLog("failed", "skipped", null, "no_meta_access_token");
    return { success: false, verified: false, errorMessage: "No Meta access token." };
  }

  const debugBefore = await fetchMetaUserTokenDebugSummary(token);
  console.log(
    `[WABA Repair] debug_token ${JSON.stringify({
      phase: "before_subscribed_apps_post",
      userId,
      wabaId,
      tokenType: debugBefore.type ?? null,
      tokenScopes: debugBefore.scopes ?? null,
      granular_scopes_summary: debugBefore.granular_scopes_summary ?? null,
      app_id_from_token: debugBefore.app_id ?? null,
      is_valid: debugBefore.is_valid ?? null,
      expires_at: debugBefore.expires_at ?? null,
      debug_ok: debugBefore.ok,
      debug_error: debugBefore.error ?? null,
    })}`
  );

  const post = await postWabaSubscribedAppsDetailed(wabaId, token);
  let subscribeStatus = post.httpOk && post.graphSuccess ? "ok" : "failed";
  let errorCode: number | string | null = post.error?.code ?? null;
  let errorMessage: string | null = post.error?.message ?? null;

  const backoffMs = [2000, 4000, 8000, 12000, 16000];
  let verifyResult = await verifyWabaAppSubscriptionDetailed(wabaId, token, "repair_attempt_0");
  let verifyAttempt = 0;
  while (
    !verifyResult.verified &&
    post.httpOk &&
    post.graphSuccess &&
    verifyAttempt < backoffMs.length
  ) {
    await new Promise((r) => setTimeout(r, backoffMs[verifyAttempt]));
    verifyAttempt++;
    verifyResult = await verifyWabaAppSubscriptionDetailed(
      wabaId,
      token,
      `repair_attempt_${verifyAttempt}`
    );
  }

  const verifyStatus = verifyResult.verified ? "ok" : "failed";
  if (!verifyResult.verified && verifyResult.error) {
    errorCode = verifyResult.error.code ?? errorCode;
    errorMessage = verifyResult.error.message ?? errorMessage;
  }

  logWhatsAppWebhookSubscribe({
    wabaId,
    phoneNumberId,
    userId,
    graphVersion,
    subscribeStatus,
    verifyStatus,
    errorCode,
    errorMessage,
  });

  const now = new Date();
  const fullyOk = post.httpOk && post.graphSuccess && verifyResult.verified;

  if (fullyOk) {
    await storage.updateUser(userId, {
      metaWebhookSubscribed: true,
      metaWebhookLastCheckedAt: now,
      metaIntegrationStatus: "connected",
      metaLastErrorCode: null,
      metaLastErrorMessage: null,
    });
    return { success: true, verified: true };
  }

  await storage.updateUser(userId, {
    metaWebhookSubscribed: verifyResult.verified,
    metaWebhookLastCheckedAt: now,
    metaIntegrationStatus: verifyResult.verified ? "connected" : "needs_attention",
    metaLastErrorCode: errorCode != null ? String(errorCode) : null,
    metaLastErrorMessage:
      (errorMessage?.slice(0, 500) ||
        (!verifyResult.verified ? "Could not confirm this app on GET subscribed_apps." : null)) ??
      null,
  });

  return {
    success: verifyResult.verified,
    verified: verifyResult.verified,
    errorMessage: errorMessage ?? undefined,
  };
}

const TOKEN_ATTENTION_BEFORE_MS = 7 * 24 * 60 * 60 * 1000;

/** Sets metaIntegrationStatus to needs_attention when the long-lived token is expired or within 7 days. */
export async function applyMetaTokenExpiryAttention(userId: string): Promise<void> {
  const user = await storage.getUserForSession(userId);
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

export type WabaDiscoverySnapshot = {
  at?: string;
  wabas: Array<{
    wabaId: string;
    wabaName: string | null;
    phones: Array<{
      phoneNumberId: string;
      displayPhoneNumber: string | null;
      verifiedName: string | null;
      qualityRating: string | null;
      phoneKind: MetaWhatsAppPhoneKind;
      phoneKindReasons: string[];
    }>;
  }>;
};

function extractWabaDiscoverySnapshotFromDebug(debug: unknown): WabaDiscoverySnapshot | null {
  if (!debug || typeof debug !== "object") return null;
  const d = debug as Record<string, unknown>;
  const detail = d.wabaDiscoveryDetail;
  if (!detail || typeof detail !== "object") return null;
  const det = detail as Record<string, unknown>;
  const wabas = det.wabas;
  if (!Array.isArray(wabas)) return null;
  return detail as WabaDiscoverySnapshot;
}

export interface WhatsappConnectionDebugInfo {
  wabaId: string | null;
  phoneNumberId: string | null;
  provider: string;
  /** Effective routing for WhatsApp (follows `whatsapp_provider` + connection flags). */
  whatsappConnectedReason: WhatsappConnectedReason;
  /**
   * True when Meta credentials exist but `whatsapp_provider` is still `twilio`.
   * Inbox + sends follow `whatsapp_provider` — switch to Meta in Settings for Cloud API.
   */
  metaPersistedButTwilioSelected: boolean;
  /** Latest Embedded Signup discovery tree (from `meta_last_oauth_debug`), when present. */
  wabaDiscoverySnapshot: WabaDiscoverySnapshot | null;
  webhookSubscribed: boolean;
  connectionType: string | null;
  status: string;
  lastErrorMessage: string | null;
  /** Structured diagnostics from last OAuth attempt(s); excludes secrets/tokens. */
  lastOAuthDebug: Record<string, unknown> | null;
  coexistenceServerConfigured: boolean;
  coexistenceConfigId: string | null;
  inboundRouting: ReturnType<typeof buildWhatsAppInboundRoutingDiagnostics>;
  /** Last Graph snapshot for the saved phone number id (from meta_last_oauth_debug.phoneGraphSnapshot). */
  phoneGraphSnapshot: Record<string, unknown> | null;
}

/** Safe diagnostics — no tokens or secrets. */
export async function getWhatsappConnectionDebug(userId: string): Promise<WhatsappConnectionDebugInfo | null> {
  const user = await storage.getUserForSession(userId);
  if (!user) return null;
  const oauthDbg =
    user.metaLastOAuthDebug && typeof user.metaLastOAuthDebug === "object"
      ? (user.metaLastOAuthDebug as Record<string, unknown>)
      : null;
  const coexistenceCfg = getWhatsappMetaPublicConfig();
  const phoneGraphSnapshot =
    oauthDbg?.phoneGraphSnapshot && typeof oauthDbg.phoneGraphSnapshot === "object"
      ? (oauthDbg.phoneGraphSnapshot as Record<string, unknown>)
      : null;
  return {
    wabaId: user.metaBusinessAccountId ?? null,
    phoneNumberId: user.metaPhoneNumberId ?? null,
    provider: (user.whatsappProvider as string) || "twilio",
    whatsappConnectedReason: deriveWhatsappConnectedReason(user),
    metaPersistedButTwilioSelected: !!(user.metaConnected && user.whatsappProvider !== "meta"),
    wabaDiscoverySnapshot: extractWabaDiscoverySnapshotFromDebug(oauthDbg),
    webhookSubscribed: user.metaWebhookSubscribed ?? false,
    connectionType: user.metaConnectionType ?? null,
    status:
      user.metaIntegrationStatus ?? (user.metaConnected ? "connected" : "disconnected"),
    lastErrorMessage: user.metaLastErrorMessage ?? null,
    lastOAuthDebug:
      user.metaLastOAuthDebug && typeof user.metaLastOAuthDebug === "object"
        ? (user.metaLastOAuthDebug as Record<string, unknown>)
        : null,
    coexistenceServerConfigured: coexistenceCfg.coexistenceEnabled,
    coexistenceConfigId: coexistenceCfg.coexistenceConfigId,
    inboundRouting: buildWhatsAppInboundRoutingDiagnostics({
      metaConnected: !!user.metaConnected,
      activeProvider: (user.whatsappProvider as string) || "twilio",
      metaConnectionType: user.metaConnectionType ?? null,
      coexistenceServerConfigured: coexistenceCfg.coexistenceEnabled,
      webhookSubscribed: !!user.metaWebhookSubscribed,
    }),
    phoneGraphSnapshot,
  };
}

export type EmbeddedSignupOAuthResult =
  | { success: true; userId: string }
  | { success: true; needsWabaPick: true; state: string }
  | { success: false; error: string };

/** Complete OAuth: validate state, exchange code, store credentials, subscribe webhooks. */
export async function completeEmbeddedSignupOAuth(params: {
  code: string;
  state: string;
  /** When set (e.g. JS SDK completion), must match the user who started the session. */
  initiatingUserId?: string;
  /** `sdk` = POST complete-sdk; `redirect` = GET meta/callback — same redirect_uri / exchange for both. */
  tokenExchange: "sdk" | "redirect";
}): Promise<EmbeddedSignupOAuthResult> {
  const { code, state, initiatingUserId, tokenExchange } = params;

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

  await mergeUserMetaOAuthDebug(row.userId, {
    flow: row.flow,
    tokenExchange,
    phase: "started",
    oauthState: state,
  });

  // IMPORTANT: exchange MUST use byte-for-byte redirect URI from the start of this OAuth state.
  // (If row.redirectUri is null due to older rows, fall back to env but log that mismatch risk.)
  const redirectUri = row.redirectUri || getWhatsappMetaRedirectUri();
  let shortToken: string;
  try {
    console.log("[META EXCHANGE DEBUG]", {
      flow: tokenExchange,
      redirectUriUsed: redirectUri,
      redirectUriSource: row.redirectUri ? "state_row" : "env_fallback",
      graphApiVersion: getMetaGraphVersionSegment(),
      graphApiBase: getMetaGraphApiBase(),
    });
    shortToken = await exchangeCodeForToken(code, redirectUri);
    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "code_exchange",
      ok: true,
      redirectUriUsed: redirectUri,
      redirectUriSource: row.redirectUri ? "state_row" : "env_fallback",
    });
  } catch (e: any) {
    const ex = e as MetaOAuthExchangeError;
    console.warn("[WhatsApp Embedded Signup] code exchange failed", {
      message: (ex as any)?.message || String(e),
      meta_code: ex?.meta?.code,
      meta_type: ex?.meta?.type,
      meta_subcode: ex?.meta?.subcode,
      meta_message: ex?.meta?.message,
      http_status: (ex as any)?.httpStatus,
      tokenExchange,
      redirectUriUsed: redirectUri,
    });
    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "code_exchange",
      ok: false,
      error: "code_exchange_failed",
      meta: ex?.meta,
      httpStatus: (ex as any)?.httpStatus,
      redirectUriUsed: redirectUri,
      redirectUriSource: row.redirectUri ? "state_row" : "env_fallback",
    });
    return {
      success: false,
      error:
        "Could not exchange the authorization code with Meta (redirect URI or app settings may not match). Close the window and try again with Continue with Meta.",
    };
  }

  let longToken: string;
  let tokenExpiresAt: Date | null = null;
  let longLivedOk = false;
  try {
    const exchanged = await exchangeForLongLivedUserToken(shortToken);
    longToken = exchanged.accessToken;
    tokenExpiresAt = exchanged.expiresAt;
    longLivedOk = true;
  } catch {
    longToken = shortToken;
    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "long_lived_token",
      ok: false,
      note: "exchange_failed_using_short_lived_token",
    });
  }
  if (longLivedOk) {
    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "long_lived_token",
      ok: true,
      tokenExpiresAt: tokenExpiresAt ? tokenExpiresAt.toISOString() : null,
    });
  }

  try {
    const debugExp = await getAccessTokenExpiryFromDebug(longToken);
    tokenExpiresAt = earliestExpiry(tokenExpiresAt, debugExp);
  } catch {
    /* non-fatal */
  }

  const coexistenceRestoreSnap =
    row.flow === "coexistence" ? await capturePersistedMetaSnapshot(row.userId) : null;
  if (row.flow === "coexistence") {
    try {
      const cfgIdResolved = resolveEmbeddedSignupConfigId("coexistence");
      logCoexistenceDiagnostic({
        phase: "coexistence_oauth_post_token",
        userId: row.userId,
        flow: row.flow,
        coexistenceEmbeddedConfigIdResolved: cfgIdResolved,
      });
      await mergeUserMetaOAuthDebug(row.userId, {
        coexistenceConfigIdUsed: cfgIdResolved,
        coexistencePreviousConnection: coexistenceRestoreSnap
          ? {
              hadMetaConnection: coexistenceRestoreSnap.hadMetaConnection,
              previousWabaId: coexistenceRestoreSnap.metaBusinessAccountId,
              previousPhoneNumberId: coexistenceRestoreSnap.metaPhoneNumberId,
              previousWhatsAppProvider: coexistenceRestoreSnap.whatsappProvider,
              previousMetaConnectionType: coexistenceRestoreSnap.metaConnectionType,
            }
          : null,
      });
    } catch (e: any) {
      logCoexistenceDiagnostic({
        phase: "coexistence_config_id_resolve_error",
        message: e?.message || String(e),
      });
    }
  }

  let resolved: ResolvedWabaPhone;
  let discoveryDiagnostics: WabaDiscoveryRunDiagnostics | null = null;
  try {
    const fetched = await fetchUserWabaChoices(longToken);
    discoveryDiagnostics = fetched.diagnostics;
    let rawChoices = fetched.choices;

    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "waba_discovery_summary",
      ok: true,
      diagnostics: discoveryDiagnostics,
    });

    let usedSyntheticFallback = false;
    const totalListedPhones = rawChoices.reduce((n, w) => n + w.phoneNumbers.length, 0);

    if (row.flow === "coexistence" && totalListedPhones === 0) {
      const fb = await buildCoexistenceFallbackWabaChoices({
        userId: row.userId,
        accessToken: longToken,
        previousSnap: coexistenceRestoreSnap,
      });
      if (fb?.length) {
        rawChoices = fb;
        usedSyntheticFallback = true;
      }
    }

    const totalPhones = rawChoices.reduce((n, w) => n + w.phoneNumbers.length, 0);
    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "coexistence_discovery_merge",
      flow: row.flow,
      phonesListedFromEdges: totalListedPhones,
      phonesAfterSyntheticFallback: totalPhones,
      usedSyntheticFallback,
    });

    if (totalPhones === 0) {
      let msg: string;
      if (
        discoveryDiagnostics &&
        discoveryDiagnostics.distinctWabaCount === 0 &&
        discoveryDiagnostics.businessesCount === 0
      ) {
        msg =
          "Coexistence: Meta returned no Businesses linked to this login. Confirm you used the coexistence Embedded Signup configuration and granted WhatsApp / Business scopes.";
      } else if (
        discoveryDiagnostics &&
        discoveryDiagnostics.distinctWabaCount > 0 &&
        discoveryDiagnostics.totalPhonesListed === 0
      ) {
        msg =
          "Coexistence: Meta lists your WhatsApp Business Account but returned no phone numbers from Graph (GET …/phone_numbers empty). This is often a discovery or permission gap; your number may still exist in Meta. Try again or use Option A.";
      } else {
        msg =
          "Coexistence: WhatsApp discovery did not yield a selectable phone line. Confirm the number appears under your WABA in Meta Business Manager.";
      }

      const recoverableMsg =
        row.flow === "coexistence" && coexistenceRestoreSnap?.hadMetaConnection
          ? `${msg} Your previous WhatsApp connection was preserved; see Settings → WhatsApp for details.`
          : msg;

      if (row.flow === "coexistence" && coexistenceRestoreSnap?.hadMetaConnection) {
        await restorePersistedMetaSnapshot(row.userId, coexistenceRestoreSnap);
        await storage.updateUser(row.userId, {
          metaIntegrationStatus: "needs_attention",
          metaLastErrorMessage: recoverableMsg.slice(0, 500),
        });
      } else {
        await storage.updateUser(row.userId, {
          metaIntegrationStatus: "failed",
          metaLastErrorMessage: msg.slice(0, 500),
        });
      }
      await mergeUserMetaOAuthDebug(row.userId, {
        phase: "complete",
        ok: false,
        error: usedSyntheticFallback ? "no_phone_after_fallback" : "no_valid_waba_or_phone",
        discoveryDiagnostics,
        connectivityRestored: row.flow === "coexistence" && !!coexistenceRestoreSnap?.hadMetaConnection,
      });
      return { success: false, error: recoverableMsg.slice(0, 400) };
    }

    const enrichedChoices = enrichWabaPhoneChoices(rawChoices);
    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "waba_discovery",
      ok: true,
      validWabaCount: rawChoices.length,
      wabaIdsSample: sortIds(rawChoices.map((c) => c.wabaId)).slice(0, 25),
      wabaDiscoveryDetail: buildWabaDiscoveryDetailPayload(enrichedChoices),
      selectionPolicy: "prefer_production_avoid_auto_test",
      coexistenceSyntheticFallback: usedSyntheticFallback,
    });

    const decision = decideEmbeddedSignupPhoneSelection(enrichedChoices);

    if (decision.mode === "pending_pick") {
      await db
        .update(whatsappOauthStates)
        .set({
          pendingAccessToken: encryptCredential(longToken),
          pendingWabaChoices: enrichedChoices as any,
        })
        .where(eq(whatsappOauthStates.stateToken, state));

      await mergeUserMetaOAuthDebug(row.userId, {
        phase: "waba_selection",
        pendingUserSelection: true,
        pendingReason: decision.pendingReason,
      });

      return { success: true, needsWabaPick: true, state };
    }

    resolved = {
      wabaId: decision.pick.wabaId,
      phoneNumberId: decision.pick.phoneNumberId,
      displayPhoneNumber: decision.pick.displayPhoneNumber,
      verifiedName: decision.pick.verifiedName,
    };
    console.log("[WABA SELECTED] auto", {
      wabaId: resolved.wabaId,
      phoneNumberId: resolved.phoneNumberId,
      phoneKind: decision.pick.phoneKind,
    });
  } catch (e: any) {
    const msg = e?.message || "Could not read WhatsApp account details from Meta.";
    if (row.flow === "coexistence" && coexistenceRestoreSnap?.hadMetaConnection) {
      await restorePersistedMetaSnapshot(row.userId, coexistenceRestoreSnap);
      await storage.updateUser(row.userId, {
        metaIntegrationStatus: "needs_attention",
        metaLastErrorMessage: `${msg} Your previous WhatsApp connection was preserved.`.slice(0, 500),
      });
    } else {
      await storage.updateUser(row.userId, {
        metaIntegrationStatus: "failed",
        metaLastErrorMessage: msg.slice(0, 500),
      });
    }
    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "waba_discovery",
      ok: false,
      error: msg.slice(0, 500),
      discoveryDiagnosticsSnapshot: discoveryDiagnostics,
      coexistenceConnectivityRestored: row.flow === "coexistence" && !!coexistenceRestoreSnap?.hadMetaConnection,
    });
    return { success: false, error: msg };
  }

  let subscribed = false;
  try {
    subscribed = await subscribeAppToWaba(resolved.wabaId, longToken);
  } catch (e: any) {
    console.warn("[WhatsApp Embedded Signup] subscribe warning", e?.message || e);
  }
  await mergeUserMetaOAuthDebug(row.userId, {
    phase: "waba_subscribe",
    ok: subscribed,
    subscribed,
  });

  const credentials: MetaCredentials = {
    accessToken: longToken,
    phoneNumberId: resolved.phoneNumberId,
    businessAccountId: resolved.wabaId,
    appSecret: undefined,
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || undefined,
  };

  const connectionType = row.flow === "coexistence" ? "coexistence" : "embedded";

  let result = await connectUserMeta(row.userId, credentials, {
    connectionType,
    displayPhoneNumber: resolved.displayPhoneNumber || null,
    verifiedName: resolved.verifiedName || null,
    webhookSubscribed: subscribed,
    tokenExpiresAt,
    metaIntegrationStatus: subscribed ? "connected" : "needs_attention",
  });

  if (!result.success) {
    console.warn("[WHATSAPP SAVE] connectUserMeta failed; forcing save without Graph validation", {
      userId: row.userId,
      wabaId: resolved.wabaId,
      phoneNumberId: resolved.phoneNumberId,
      error: result.error,
    });
    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "persist_integration",
      ok: false,
      connectUserMetaError: result.error || "unknown",
      forcedSave: true,
    });
    result = await connectUserMeta(row.userId, credentials, {
      connectionType,
      displayPhoneNumber: resolved.displayPhoneNumber || null,
      verifiedName: resolved.verifiedName || null,
      webhookSubscribed: subscribed,
      tokenExpiresAt,
      metaIntegrationStatus: subscribed ? "connected" : "needs_attention",
      skipCredentialValidation: true,
    });
  }

  if (!result.success) {
    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "persist_integration",
      ok: false,
      error: result.error || "Could not save WhatsApp connection.",
      forcedSave: false,
    });
    return { success: false, error: result.error || "Could not save WhatsApp connection." };
  }

  await mergeUserMetaOAuthDebug(row.userId, {
    phase: "persist_integration",
    ok: true,
    forcedSave: false,
    wabaId: resolved.wabaId,
    phoneNumberId: resolved.phoneNumberId,
    connectionType,
    metaConnected: true,
  });

  await repairMetaWabaWebhookSubscription(row.userId);

  // Success path: state is no longer needed.
  await db.delete(whatsappOauthStates).where(eq(whatsappOauthStates.stateToken, state));

  return { success: true, userId: row.userId };
}

export async function finalizeEmbeddedSignupWabaSelection(params: {
  state: string;
  initiatingUserId: string;
  wabaId: string;
  phoneNumberId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { state, initiatingUserId, wabaId, phoneNumberId } = params;
  await cleanupExpiredStates();

  const rows = await db
    .select()
    .from(whatsappOauthStates)
    .where(eq(whatsappOauthStates.stateToken, state))
    .limit(1);
  const row = rows[0];
  if (!row || row.expiresAt < new Date()) {
    return { success: false, error: "This signup selection expired. Please start again from Settings." };
  }
  if (row.userId !== initiatingUserId) {
    return { success: false, error: "This signup does not match your session. Start again from Settings." };
  }
  if (!row.pendingAccessToken) {
    return { success: false, error: "No pending WhatsApp token found. Please start again from Settings." };
  }
  const token = isEncrypted(row.pendingAccessToken) ? decryptCredential(row.pendingAccessToken) : row.pendingAccessToken;

  const choices = (row.pendingWabaChoices as any) as EnrichedWabaPhoneChoice[] | null;
  const allowed = Array.isArray(choices) ? choices : [];
  const matchWaba = allowed.find((c) => c.wabaId === wabaId);
  const matchPhone = matchWaba?.phoneNumbers?.find((p) => p.id === phoneNumberId);
  if (!matchWaba || !matchPhone) {
    return { success: false, error: "Invalid WhatsApp Business Account selection. Please start again." };
  }

  // Guardrail: NEVER proceed with a WABA that has zero phone numbers.
  if (!matchWaba.phoneNumbers || matchWaba.phoneNumbers.length === 0) {
    return { success: false, error: "No WhatsApp phone number found. Please add a phone number in Meta Business Manager." };
  }

  const subscribed = await subscribeAppToWaba(matchWaba.wabaId, token).catch(() => false);

  console.log("[WABA SELECTED] user_choice", { wabaId: matchWaba.wabaId, phoneNumberId: matchPhone.id });

  const credentials: MetaCredentials = {
    accessToken: token,
    phoneNumberId: matchPhone.id,
    businessAccountId: matchWaba.wabaId,
    appSecret: undefined,
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || undefined,
  };

  const connectionType = row.flow === "coexistence" ? "coexistence" : "embedded";
  let result = await connectUserMeta(row.userId, credentials, {
    connectionType,
    displayPhoneNumber: matchPhone.displayPhoneNumber ?? null,
    verifiedName: matchPhone.verifiedName ?? null,
    webhookSubscribed: subscribed,
    tokenExpiresAt: null,
    metaIntegrationStatus: subscribed ? "connected" : "needs_attention",
  });

  if (!result.success) {
    result = await connectUserMeta(row.userId, credentials, {
      connectionType,
      displayPhoneNumber: matchPhone.displayPhoneNumber ?? null,
      verifiedName: matchPhone.verifiedName ?? null,
      webhookSubscribed: subscribed,
      tokenExpiresAt: null,
      metaIntegrationStatus: subscribed ? "connected" : "needs_attention",
      skipCredentialValidation: true,
    });
  }

  if (!result.success) {
    return { success: false, error: result.error || "Could not save WhatsApp connection." };
  }

  await repairMetaWabaWebhookSubscription(row.userId);

  await db.delete(whatsappOauthStates).where(eq(whatsappOauthStates.stateToken, state));
  return { success: true };
}
