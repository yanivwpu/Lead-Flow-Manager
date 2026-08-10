/**
 * Meta WhatsApp Embedded Signup + coexistence OAuth completion.
 * @see https://developers.facebook.com/docs/whatsapp/embedded-signup/overview
 * @see https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/versions
 * @see https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4
 * @see https://developers.facebook.com/docs/whatsapp/embedded-signup/onboarding-business-app-users
 *
 * Production public path: Embedded Signup **architecture v2** via JS SDK (`FB.login`) with
 * `META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`, `response_type: code`, and v2 extras.
 * Internal gated path: architecture **v4** uses a dedicated `META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID`
 * (new Login for Business configuration) with purposely empty extras per Meta Versions docs.
 * Redirect OAuth remains a v2-safe fallback (same token exchange).
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
import { exchangeForLongLivedUserToken, MetaOAuthExchangeError, exchangeWhatsappEmbeddedSignupAuthorizationCode, classifyMetaCodeExchangeFailure } from "./metaOAuth";
import {
  extractMetaPhoneGraphRegistrationFields,
  isMetaPhoneCloudApiOperational,
  isMetaPhoneCloudApiRegistrationRequired,
} from "@shared/whatsappPhoneRegistration";
import {
  connectUserMeta,
  type MetaCredentials,
  encryptCredential,
  decryptCredential,
  isEncrypted,
  getMetaAccessToken,
  fetchMetaWhatsAppPhoneNumberGraphSnapshot,
  fetchWhatsAppPhoneNumberParentWabaId,
  findMetaPhoneNumberConflict,
} from "./userMeta";
import { classifyMetaWhatsAppPhone, type MetaWhatsAppPhoneKind, META_WABA_PHONE_DISCOVERY_FIELD_SETS, mapGraphPhoneRowToDiscoveryFields } from "./metaWhatsAppPhoneKind";
import {
  deriveWhatsappConnectedReason,
  type WhatsappConnectedReason,
} from "./whatsappService";
import { stripSensitiveWhatsAppFields } from "./whatsappStatusSanitize";
import {
  shouldUseV4DirectAssetValidation,
  resolveV4EmbeddedSignupAssets,
} from "./whatsappEmbeddedSignupV4Assets";
import {
  buildStandardEmbeddedSignupLoginOptions,
  configIdLast4,
  parseWhatsappEmbeddedSignupArchitecture,
  readEmbeddedSignupV4GateFromEnv,
  resolveEmbeddedSignupConfigIdFromEnv,
  selectEmbeddedSignupArchitecture,
  type WhatsappEmbeddedSignupArchitecture,
  type WhatsappEmbeddedSignupFlow,
} from "@shared/whatsappEmbeddedSignupVersion";

/**
 * OAuth state TTL for Embedded Signup.
 * Meta’s in-dialog WABA/phone creation often exceeds 15 minutes; a short TTL caused
 * production v4 complete-sdk to fail with “expired or invalid” after a successful Finish.
 * Auth codes remain ~30s TTL and are exchanged only at Finish — this TTL covers the dialog, not the code.
 */
export const WHATSAPP_OAUTH_STATE_TTL_MS = 60 * 60 * 1000;
const STATE_TTL_MS = WHATSAPP_OAUTH_STATE_TTL_MS;

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
  /** Always META_APP_ID — never INSTAGRAM_APP_ID. */
  appIdSource: "META_APP_ID";
  /** True when META_APP_ID equals INSTAGRAM_APP_ID (misconfiguration). */
  appIdMatchesInstagramAppId: boolean;
  embeddedSignupEnabled: boolean;
  /**
   * True when coexistence onboarding can start: Embedded Signup is enabled and
   * `META_WHATSAPP_COEXISTENCE_CONFIG_ID` is set (separate Meta Embedded Signup configuration for Business App coexistence).
   */
  coexistenceEnabled: boolean;
  /** Optional legacy flag — coexistence no longer requires this when coexistence config ID is set. */
  coexistenceFeatureFlagSet: boolean;
  /** Server flag WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED (does not alone unlock v4 for a user). */
  embeddedSignupV4FlagEnabled: boolean;
  /** Whether META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID is set. */
  embeddedSignupV4ConfigConfigured: boolean;
  /** Env ready for v4 (flag + config). Explicit user-ID allowlist still required to launch v4. */
  embeddedSignupV4EnvReady: boolean;
  metaConfigured: boolean;
  /** Safe client-only fields */
  appId: string | null;
  graphApiVersion: string;
  redirectUri: string;
  embeddedSignupConfigId: string | null;
  /** Last 4 of v2 config only — never full secret. */
  embeddedSignupConfigIdLast4: string | null;
  /** Present when configured — client may need it only after server selects v4 for the session. */
  embeddedSignupV4ConfigId: string | null;
  embeddedSignupV4ConfigIdLast4: string | null;
  /** Raw env value when present — same ID must exist as a dedicated coexistence Embedded Signup config in Meta. */
  coexistenceConfigId: string | null;
  coexistenceConfigIdLast4: string | null;
  missingEnvHints: string[];
}

/** Deprecated General login config — use WhatsApp Embedded Signup variation instead. */
const DEPRECATED_EMBEDDED_SIGNUP_CONFIG_ID = "1334305135262470";

export function logWhatsappEmbeddedSignupStartupWarnings(): void {
  const embeddedConfigId = process.env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || "";
  if (embeddedConfigId === DEPRECATED_EMBEDDED_SIGNUP_CONFIG_ID) {
    console.error(
      "[WhatsApp Embedded Signup] META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID is still the deprecated General login config (1334305135262470). Set the WhatsApp Embedded Signup configuration ID (1774700346847063) and redeploy."
    );
  }
  const legacyMetaConfigId = process.env.META_CONFIG_ID?.trim() || "";
  if (legacyMetaConfigId === DEPRECATED_EMBEDDED_SIGNUP_CONFIG_ID) {
    console.warn(
      "[WhatsApp Embedded Signup] META_CONFIG_ID is the deprecated General login config (1334305135262470) — Embedded Signup ignores META_CONFIG_ID; use META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID=1774700346847063 instead."
    );
  }
  const embedded =
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED === "true" ||
    process.env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED === "1";
  const coexistenceFlag =
    process.env.WHATSAPP_COEXISTENCE_ENABLED === "true" ||
    process.env.WHATSAPP_COEXISTENCE_ENABLED === "1" ||
    process.env.WHATSAPP_COOEXISTENCE_ENABLED === "true" ||
    process.env.WHATSAPP_COOEXISTENCE_ENABLED === "1";
  const metaAppId = process.env.META_APP_ID?.trim() || "";
  const igAppId = process.env.INSTAGRAM_APP_ID?.trim() || "";
  if (metaAppId && igAppId && metaAppId === igAppId) {
    console.error(
      "[WhatsApp Embedded Signup] META_APP_ID equals INSTAGRAM_APP_ID — Embedded Signup must use the WhatsApp/Meta app id, not the Instagram API app. Real users will see “Feature unavailable” until fixed."
    );
  }
  if (process.env.META_CONFIG_ID?.trim() && !process.env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim()) {
    console.warn(
      "[WhatsApp Embedded Signup] META_CONFIG_ID is set but META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID is unset — Embedded Signup uses META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID only."
    );
  }
  if (embedded) {
    const missing: string[] = [];
    if (!process.env.META_APP_ID) missing.push("META_APP_ID");
    if (!process.env.META_APP_SECRET) missing.push("META_APP_SECRET");
    if (!process.env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID) missing.push("META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID");
    if (!process.env.META_WHATSAPP_REDIRECT_URI?.trim()) missing.push("META_WHATSAPP_REDIRECT_URI");
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

  const v4Gate = readEmbeddedSignupV4GateFromEnv();
  const embeddedV2Config = process.env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || null;

  const graphRaw = process.env.META_GRAPH_API_VERSION || "v21.0";
  const metaAppId = process.env.META_APP_ID?.trim() || null;
  const igAppId = process.env.INSTAGRAM_APP_ID?.trim() || null;

  return {
    appIdSource: "META_APP_ID",
    appIdMatchesInstagramAppId: !!(metaAppId && igAppId && metaAppId === igAppId),
    embeddedSignupEnabled,
    coexistenceEnabled,
    coexistenceFeatureFlagSet: coexistenceFlag,
    embeddedSignupV4FlagEnabled: v4Gate.flagEnabled,
    embeddedSignupV4ConfigConfigured: v4Gate.v4ConfigIdConfigured,
    embeddedSignupV4EnvReady: v4Gate.flagEnabled && v4Gate.v4ConfigIdConfigured,
    metaConfigured: !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
    appId: process.env.META_APP_ID || null,
    graphApiVersion: graphRaw.startsWith("v") ? graphRaw : `v${graphRaw}`,
    redirectUri: getWhatsappMetaRedirectUri(),
    embeddedSignupConfigId: embeddedV2Config,
    embeddedSignupConfigIdLast4: configIdLast4(embeddedV2Config),
    embeddedSignupV4ConfigId: v4Gate.v4ConfigId,
    embeddedSignupV4ConfigIdLast4: configIdLast4(v4Gate.v4ConfigId),
    coexistenceConfigId: coexistenceConfigOnly,
    coexistenceConfigIdLast4: configIdLast4(coexistenceConfigOnly),
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

/** Resolve Embedded Signup configuration ID — v2 / v4 / coexistence never silently swap. */
export function resolveEmbeddedSignupConfigId(
  flow: WhatsappEmbeddedSignupFlow,
  architecture: WhatsappEmbeddedSignupArchitecture = "v2",
): string {
  return resolveEmbeddedSignupConfigIdFromEnv(flow, architecture).configId;
}

/** Build Meta OAuth URL with Embedded Signup config_id (redirect fallback; same params as SDK dialog). */
export function buildEmbeddedSignupAuthUrl(
  stateToken: string,
  flow: WhatsappEmbeddedSignupFlow,
  architecture: WhatsappEmbeddedSignupArchitecture = "v2",
): string {
  const appId = process.env.META_APP_ID;
  if (!appId) throw new Error("META_APP_ID is not configured");

  const redirectUri = getWhatsappMetaRedirectUri();
  const configId = resolveEmbeddedSignupConfigId(flow, architecture);

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
  /** Server-selected architecture bound to this OAuth state. */
  architecture: WhatsappEmbeddedSignupArchitecture;
  /** FB.login options for the selected architecture (standard embedded only). */
  loginOptions: ReturnType<typeof buildStandardEmbeddedSignupLoginOptions>;
  configIdLast4: string | null;
}

export interface EmbeddedSignupStartResult {
  state: string;
  authUrl: string;
  /** Same string as META_WHATSAPP_REDIRECT_URI — must match FB.login and Graph code exchange. */
  redirectUri: string;
  flow: WhatsappEmbeddedSignupFlow;
  architecture: WhatsappEmbeddedSignupArchitecture;
  architectureSelectionReason: string;
  sdk: EmbeddedSignupSdkPayload;
}

export async function startEmbeddedSignupSession(
  userId: string,
  flow: WhatsappEmbeddedSignupFlow,
  options?: {
    /** Force architecture (server policy). Redirect fallback always forces v2. */
    architecture?: WhatsappEmbeddedSignupArchitecture;
  },
): Promise<EmbeddedSignupStartResult> {
  const cfg = getWhatsappMetaPublicConfig();
  if (flow === "embedded" && !cfg.embeddedSignupEnabled) {
    throw new Error("WhatsApp Embedded Signup is not enabled or Meta app is not fully configured.");
  }
  if (flow === "coexistence" && !cfg.coexistenceEnabled) {
    throw new Error(
      "WhatsApp coexistence onboarding is not enabled — set META_WHATSAPP_COEXISTENCE_CONFIG_ID (dedicated coexistence Embedded Signup configuration in Meta) and ensure WHATSAPP_EMBEDDED_SIGNUP_ENABLED + META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID are configured.",
    );
  }

  const selected =
    options?.architecture != null
      ? {
          architecture: options.architecture,
          reason: "caller_forced_architecture",
          v4EnvReady: cfg.embeddedSignupV4EnvReady,
          userAuthorizedForV4: true,
        }
      : selectEmbeddedSignupArchitecture({
          flow,
          userId,
        });

  const architecture = selected.architecture;
  if (architecture === "v4" && flow !== "embedded") {
    throw new Error("Embedded Signup architecture v4 is only valid for the standard embedded flow.");
  }

  await cleanupExpiredStates();

  const stateToken = generateStateToken();
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);
  const redirectUri = getWhatsappMetaRedirectUri();

  await db.insert(whatsappOauthStates).values({
    userId,
    stateToken,
    flow,
    architectureVersion: architecture,
    redirectUri,
    expiresAt,
  });

  const { configId, envName } = resolveEmbeddedSignupConfigIdFromEnv(flow, architecture);
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
  const igAppId = process.env.INSTAGRAM_APP_ID?.trim() || "";

  console.log("[WhatsApp Embedded Signup] session_start", {
    userId,
    flow,
    architecture,
    architectureSelectionReason: selected.reason,
    configEnv: envName,
    appIdSource: "META_APP_ID",
    appIdTail: appId.slice(-6),
    configIdTail: configId.slice(-8),
    graphApiVersion,
    stateTtlMs: STATE_TTL_MS,
    redirectUriHost: (() => {
      try {
        return new URL(redirectUri).host;
      } catch {
        return "(invalid_redirect_uri)";
      }
    })(),
    appIdMatchesInstagramAppId: !!(igAppId && igAppId === appId),
    embeddedSignupEnabled: cfg.embeddedSignupEnabled,
  });

  // Persist architecture/flow immediately so diagnostics survive even if complete never runs.
  await mergeUserMetaOAuthDebug(userId, {
    phase: "session_start",
    flow,
    architecture,
    architectureSelectionReason: selected.reason,
    configEnv: envName,
    configIdLast4: configIdLast4(configId),
    stateTokenTail: stateToken.slice(-8),
    codeCallbackReceived: false,
    sessionEventReceived: false,
    completeSdkAttempted: false,
  });

  const loginOptions =
    flow === "embedded"
      ? buildStandardEmbeddedSignupLoginOptions({ architecture, configId })
      : buildStandardEmbeddedSignupLoginOptions({ architecture: "v2", configId });

  const authUrl = buildEmbeddedSignupAuthUrl(stateToken, flow, architecture);
  return {
    state: stateToken,
    authUrl,
    redirectUri,
    flow,
    architecture,
    architectureSelectionReason: selected.reason,
    sdk: {
      appId,
      graphApiVersion,
      configId,
      architecture,
      loginOptions,
      configIdLast4: configIdLast4(configId),
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
    platformType?: string;
    accountMode?: string;
    status?: string;
    codeVerificationStatus?: string;
    graphFieldsRequested?: string;
  }>;
};

/** Exported for pending-WABA JSON + client picker (test vs prod badges). */
export type EnrichedWabaPhone = {
  id: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  platformType?: string;
  accountMode?: string;
  status?: string;
  codeVerificationStatus?: string;
  graphFieldsRequested?: string;
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
        platformType: p.platformType,
        accountMode: p.accountMode,
        status: p.status,
        codeVerificationStatus: p.codeVerificationStatus,
      });
      return {
        id: p.id,
        displayPhoneNumber: p.displayPhoneNumber,
        verifiedName: p.verifiedName,
        qualityRating: p.qualityRating,
        platformType: p.platformType,
        accountMode: p.accountMode,
        status: p.status,
        codeVerificationStatus: p.codeVerificationStatus,
        graphFieldsRequested: p.graphFieldsRequested,
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
 * Auto-select only when there is exactly one unambiguous production line.
 * Never auto-select test or unknown lines — always require explicit UI pick.
 */
export function decideEmbeddedSignupPhoneSelection(choices: EnrichedWabaPhoneChoice[]):
  | { mode: "auto"; pick: ResolvedWabaPhone & { phoneKind: MetaWhatsAppPhoneKind } }
  | { mode: "pending_pick"; pendingReason: string } {
  const flat = flattenEnrichedWabaChoices(choices);
  if (flat.length === 0) {
    return { mode: "pending_pick", pendingReason: "no_phone_numbers" };
  }

  const prod = flat.filter((p) => p.phoneKind === "production");

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

  const unk = flat.filter((p) => p.phoneKind === "unknown");
  if (unk.length >= 1) {
    return { mode: "pending_pick", pendingReason: "unknown_phone_requires_explicit_pick" };
  }

  const test = flat.filter((p) => p.phoneKind === "test");
  return {
    mode: "pending_pick",
    pendingReason:
      test.length >= 1 ? "test_number_requires_explicit_pick" : "ambiguous_phone_choice",
  };
}

function buildWabaDiscoveryDetailPayload(
  choices: EnrichedWabaPhoneChoice[],
  selection?: { method: "auto" | "user"; wabaId?: string; phoneNumberId?: string },
) {
  return {
    at: new Date().toISOString(),
    selection: selection ?? null,
    wabas: choices.map((w) => ({
      wabaId: w.wabaId,
      wabaName: w.wabaName ?? null,
      phones: w.phoneNumbers.map((p) => ({
        phoneNumberId: p.id,
        displayPhoneNumber: p.displayPhoneNumber ?? null,
        verifiedName: p.verifiedName ?? null,
        qualityRating: p.qualityRating ?? null,
        platformType: p.platformType ?? null,
        accountMode: p.accountMode ?? null,
        status: p.status ?? null,
        codeVerificationStatus: p.codeVerificationStatus ?? null,
        graphFieldsRequested: p.graphFieldsRequested ?? null,
        phoneKind: p.phoneKind,
        phoneKindReasons: p.phoneKindReasons,
        selected:
          selection?.wabaId === w.wabaId && selection?.phoneNumberId === p.id ? true : undefined,
      })),
    })),
  };
}

function logWabaDiscoveryTree(
  userId: string,
  choices: EnrichedWabaPhoneChoice[],
  selection: { method: "auto" | "user"; wabaId: string; phoneNumberId: string; phoneKind?: MetaWhatsAppPhoneKind },
): void {
  const tree = buildWabaDiscoveryDetailPayload(choices, selection);
  console.log(
    `[WhatsApp Discovery Tree] ${JSON.stringify({
      userId,
      selectionMethod: selection.method,
      wabaId: selection.wabaId,
      phoneNumberId: selection.phoneNumberId,
      phoneKind: selection.phoneKind ?? null,
      tree,
    })}`,
  );
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

async function fetchWabaPhoneNumbersForDiscovery(
  base: string,
  wabaId: string,
  accessToken: string,
): Promise<{ phones: WabaPhoneChoice["phoneNumbers"]; fieldsRequested: string; httpOk: boolean; raw: unknown }> {
  for (const fields of META_WABA_PHONE_DISCOVERY_FIELD_SETS) {
    const pnRes = await fetch(
      `${base}/${encodeURIComponent(wabaId)}/phone_numbers?fields=${encodeURIComponent(fields)}&limit=50&access_token=${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(12_000) },
    );
    const pnJson = (await pnRes.json().catch(() => ({}))) as any;
    if (!pnRes.ok || pnJson?.error) {
      if (fields !== META_WABA_PHONE_DISCOVERY_FIELD_SETS[META_WABA_PHONE_DISCOVERY_FIELD_SETS.length - 1]) {
        continue;
      }
      return { phones: [], fieldsRequested: fields, httpOk: false, raw: pnJson };
    }
    const rows: any[] = Array.isArray(pnJson?.data) ? pnJson.data : [];
    const phoneNumbers = rows
      .map((row) => {
        const mapped = mapGraphPhoneRowToDiscoveryFields(row as Record<string, unknown>);
        if (!mapped.id) return null;
        return { ...mapped, graphFieldsRequested: fields };
      })
      .filter((p): p is NonNullable<typeof p> => !!p);
    return { phones: phoneNumbers, fieldsRequested: fields, httpOk: true, raw: pnJson?.data };
  }
  return { phones: [], fieldsRequested: META_WABA_PHONE_DISCOVERY_FIELD_SETS[0], httpOk: false, raw: null };
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
    console.warn("[WABA DISCOVERY] GET /me/businesses failed", {
      endpoint: `${base}/me/businesses?fields=id,name`,
      graphVersion: getMetaGraphVersionSegment(),
      httpStatus: bizRes.status,
      meta_code: bizJson?.error?.code ?? null,
      meta_type: bizJson?.error?.type ?? null,
      meta_subcode: bizJson?.error?.error_subcode ?? null,
      meta_message: typeof bizJson?.error?.message === "string" ? bizJson.error.message.slice(0, 300) : null,
    });
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
    const pnFetch = await fetchWabaPhoneNumbersForDiscovery(base, w.id, accessToken);
    if (!pnFetch.httpOk) {
      logCoexistenceDiagnostic({
        phase: "waba_discovery_phone_numbers_error",
        wabaId: w.id,
        httpOk: pnFetch.httpOk,
        fieldsRequested: pnFetch.fieldsRequested,
        rawTruncated: jsonTruncate({ body: pnFetch.raw }, 6000),
      });
      choices.push({
        wabaId: w.id,
        wabaName: w.name,
        phoneNumbers: [],
      });
      continue;
    }
    logCoexistenceDiagnostic({
      phase: "waba_discovery_phone_numbers_ok",
      wabaId: w.id,
      phoneRowCount: pnFetch.phones.length,
      fieldsRequested: pnFetch.fieldsRequested,
      rawTruncated: jsonTruncate({ data: pnFetch.raw }),
    });

    const phoneNumbers = pnFetch.phones;

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
    const next: Record<string, unknown> = {
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    // Clear stale failure codes when a later phase succeeds (or when a new failure code is written).
    if (patch.ok === true) {
      if (patch.error === undefined) delete next.error;
      if (patch.errorCode === undefined) delete next.errorCode;
      if (patch.exchangeFailureCategory === undefined) delete next.exchangeFailureCategory;
      if (patch.discoveryFailureCategory === undefined) delete next.discoveryFailureCategory;
    }
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
  /** Optional Graph platform_type — only recommend coexistence when Business-App association is evident. */
  phonePlatformType?: string | null;
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

  const platform = String(input.phonePlatformType ?? "").toUpperCase();
  void platform;
  // Do not recommend Coexistence merely because connectionType=embedded.
  // Coexistence remains Coming soon in the product UI; recommendation stays false for standard Cloud API numbers.
  const coexistenceReconnectRecommended = false;

  return {
    summary: "standard_embedded_or_manual",
    customerMessageDelivery: "cloud_api_webhook_expected",
    detail:
      "This workspace connected via standard Embedded Signup for Cloud API. Customer messages are expected on your Cloud API webhook when the phone is registered and CONNECTED. Coexistence is only needed if you also use the WhatsApp Business mobile app on the same number.",
    coexistenceReconnectRecommended,
  };
}

/** Periodically refreshes Graph fields for the saved phone number into meta_last_oauth_debug.phoneGraphSnapshot (no secrets). */
export async function refreshWhatsappPhoneGraphDebugIfStale(
  userId: string,
  opts?: { force?: boolean },
): Promise<void> {
  try {
    const user = await storage.getUserForSession(userId);
    if (!user?.metaConnected || !user.metaPhoneNumberId) return;

    const oauthDbg =
      user.metaLastOAuthDebug && typeof user.metaLastOAuthDebug === "object"
        ? (user.metaLastOAuthDebug as Record<string, unknown>)
        : {};
    const prevSnap = oauthDbg.phoneGraphSnapshot as { fetchedAt?: string } | undefined;
    if (!opts?.force && prevSnap?.fetchedAt) {
      const t = new Date(prevSnap.fetchedAt).getTime();
      if (!Number.isNaN(t) && Date.now() - t < PHONE_GRAPH_DEBUG_TTL_MS) return;
    }

    const token = await getMetaAccessToken(userId);
    if (!token) return;

    const snap = await fetchMetaWhatsAppPhoneNumberGraphSnapshot(token, user.metaPhoneNumberId);
    const regFields = extractMetaPhoneGraphRegistrationFields(
      snap.ok ? { data: snap.data as Record<string, unknown> } : null,
    );
    const coexistence = user.metaConnectionType === "coexistence";
    const isTest = isMetaTestPhoneFromSavedFields({
      displayPhoneNumber: user.metaDisplayPhoneNumber ?? null,
      verifiedName: user.metaVerifiedName ?? null,
    });
    const needsReg =
      !coexistence &&
      user.metaConnectionType !== "manual_legacy" &&
      snap.ok &&
      isMetaPhoneCloudApiRegistrationRequired(regFields, {
        coexistence: false,
        isTestNumber: isTest,
      });
    const operational = snap.ok && (isTest || isMetaPhoneCloudApiOperational(regFields));

    await mergeUserMetaOAuthDebug(userId, {
      phoneGraphSnapshot: {
        fetchedAt: new Date().toISOString(),
        phoneNumberId: user.metaPhoneNumberId,
        ...snap,
      },
      ...(needsReg
        ? {
            phase: "phone_registration_required",
            needsPhoneRegistration: true,
            graphStatus: regFields.status || null,
            platformType: regFields.platformType || null,
          }
        : operational
          ? { needsPhoneRegistration: false }
          : {}),
    });

    // Recovery path: persisted Cloud API phone still PENDING → prompt for PIN without reconnect.
    if (needsReg && user.metaIntegrationStatus !== "needs_phone_registration") {
      await storage.updateUser(userId, {
        metaIntegrationStatus: "needs_phone_registration",
        metaLastErrorCode: "phone_registration_required",
        metaLastErrorMessage:
          "Phone registration required. Enter a six-digit WhatsApp PIN to finish Cloud API setup.",
      });
    } else if (
      operational &&
      user.metaIntegrationStatus === "needs_phone_registration" &&
      !needsReg
    ) {
      await storage.updateUser(userId, {
        metaIntegrationStatus: "connected",
        metaLastErrorCode: null,
        metaLastErrorMessage: null,
      });
    }
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
  const probed = await probeAccessTokenExpiryFromDebug(accessToken);
  return probed.expiresAt;
}

/**
 * Probe token lifetime via debug_token.
 * Meta Never-expire tokens typically report `expires_at: 0`.
 */
export async function probeAccessTokenExpiryFromDebug(accessToken: string): Promise<{
  ok: boolean;
  expiresAt: Date | null;
  /** True when Meta explicitly reports expires_at === 0 (never-expiring). */
  neverExpires: boolean;
}> {
  try {
    const base = getMetaGraphApiBase();
    const appId = process.env.META_APP_ID!;
    const appSecret = process.env.META_APP_SECRET!;
    const appAccessToken = `${appId}|${appSecret}`;
    const debugUrl = `${base}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appAccessToken)}`;
    const debugRes = await fetch(debugUrl);
    const debugJson = (await debugRes.json()) as any;
    if (!debugRes.ok) return { ok: false, expiresAt: null, neverExpires: false };
    const exp = debugJson?.data?.expires_at;
    if (typeof exp === "number" && exp === 0) {
      return { ok: true, expiresAt: null, neverExpires: true };
    }
    if (typeof exp === "number" && exp > 0) {
      return { ok: true, expiresAt: new Date(exp * 1000), neverExpires: false };
    }
    return { ok: true, expiresAt: null, neverExpires: false };
  } catch {
    return { ok: false, expiresAt: null, neverExpires: false };
  }
}

/**
 * Runtime-safe gate used by completion + tests.
 * Ensures `shouldUseV4DirectAssetValidation` is imported into this module (not a free identifier).
 */
export function isV4SdkDirectAssetValidationEnabled(
  architecture: string,
  tokenExchange: "sdk" | "redirect",
): boolean {
  return shouldUseV4DirectAssetValidation({ architecture, tokenExchange });
}

/** Map unexpected runtime/engine errors to a safe client message (no raw identifiers). */
export function sanitizeEmbeddedSignupClientError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (
    /is not defined|ReferenceError|TypeError|Cannot read propert|Cannot access|Unexpected token|Internal Server Error/i.test(
      msg,
    )
  ) {
    return "Could not finish WhatsApp setup. Please try Continue with Meta again.";
  }
  const trimmed = msg.trim();
  return trimmed || "Could not read WhatsApp account details from Meta.";
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
 * Handles id vs number, nested application/app objects, `whatsapp_business_api_data.id`, and extra keys Graph may add.
 */
function extractReturnedAppIdsFromSubscribedAppsJson(json: any): {
  ids: string[];
  rowSnapshots: Array<{ keys: string[]; idFields: Record<string, unknown> }>;
} {
  const ids = new Set<string>();
  const rowSnapshots: Array<{ keys: string[]; idFields: Record<string, unknown> }> = [];
  const rows = Array.isArray(json?.data) ? json.data : [];

  function collectRowTopLevelAppIds(r: Record<string, unknown>): void {
    for (const key of ["id", "app_id"]) {
      const n = normalizeMetaId(r[key]);
      if (n) ids.add(n);
    }
    const wb = r.whatsapp_business_api_data;
    if (wb && typeof wb === "object") {
      const w = wb as Record<string, unknown>;
      for (const key of ["id", "app_id"]) {
        const n = normalizeMetaId(w[key]);
        if (n) ids.add(n);
      }
    }
    const app = (r.application ?? r.app) as Record<string, unknown> | undefined;
    if (app && typeof app === "object") {
      for (const key of ["id", "app_id"]) {
        const n = normalizeMetaId(app[key]);
        if (n) ids.add(n);
      }
    }
  }

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
      collectRowTopLevelAppIds(r);
      rowSnapshots.push({
        keys: Object.keys(r),
        idFields: {
          id: r.id,
          app_id: r.app_id,
          whatsapp_business_api_data: r.whatsapp_business_api_data,
          application: r.application,
          app: r.app,
        },
      });
      walk(row, 0);
    }
  }

  return { ids: [...ids], rowSnapshots };
}

/** Deduped app ids from GET `/{waba-id}/subscribed_apps` for diagnostics + parity with subscription verify. */
export function extractAppIdsFromWabaSubscribedAppsPayload(json: unknown): string[] {
  const { ids } = extractReturnedAppIdsFromSubscribedAppsJson(json as any);
  return [...new Set(ids.map((s) => String(s).trim()).filter(Boolean))];
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
      ? stripSensitiveWhatsAppFields(oauthDbg.phoneGraphSnapshot as Record<string, unknown>)
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
        ? stripSensitiveWhatsAppFields(user.metaLastOAuthDebug as Record<string, unknown>)
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
  | { success: true; userId: string; needsPhoneRegistration?: boolean }
  | { success: true; needsWabaPick: true; state: string }
  | {
      success: false;
      error: string;
      errorCode?:
        | "oauth_state_expired"
        | "architecture_mismatch"
        | "phone_setup_incomplete"
        | "no_valid_waba_or_phone"
        | "code_exchange_failed"
        | "discovery_failed"
        | "session_assets_missing"
        | "waba_discovery_missing_permission"
        | "waba_access_denied"
        | "phone_not_under_waba"
        | "phone_ambiguous"
        | "waba_subscription_failed";
      wabaId?: string | null;
    };

function isPhoneRoutingReadyFromGraphSnapshot(data: any): boolean {
  const status = String(data?.status ?? "").toUpperCase();
  const code = String(data?.code_verification_status ?? "").toUpperCase();
  const platform = String(data?.platform_type ?? "").toUpperCase();
  if (status === "DISCONNECTED") return false;
  if (code === "NOT_VERIFIED") return false;
  if (status === "PENDING") return false;
  if (platform === "NOT_APPLICABLE") return false;
  if (status !== "CONNECTED") return false;
  if (platform && platform !== "CLOUD_API") return false;
  return true;
}

function isMetaTestPhoneFromSavedFields(input: { displayPhoneNumber?: string | null; verifiedName?: string | null }): boolean {
  try {
    return classifyMetaWhatsAppPhone({
      displayPhoneNumber: input.displayPhoneNumber ?? null,
      verifiedName: input.verifiedName ?? null,
    }).kind === "test";
  } catch {
    return false;
  }
}

/** Complete OAuth: validate state, exchange code, store credentials, subscribe webhooks. */
export async function completeEmbeddedSignupOAuth(params: {
  code: string;
  state: string;
  /** When set (e.g. JS SDK completion), must match the user who started the session. */
  initiatingUserId?: string;
  /** `sdk` = POST complete-sdk; `redirect` = GET meta/callback — same redirect_uri / exchange for both. */
  tokenExchange: "sdk" | "redirect";
  /**
   * Optional client-reported architecture from the launch response.
   * Must match the OAuth state when provided (prevents client/server mismatch).
   */
  expectedArchitecture?: WhatsappEmbeddedSignupArchitecture;
  /** Safe session-event summary only (no tokens). Merged into oauth debug. */
  sessionEventSummary?: {
    event?: string;
    wabaId?: string;
    phoneNumberId?: string;
  };
}): Promise<EmbeddedSignupOAuthResult> {
  const { code, state, initiatingUserId, tokenExchange, expectedArchitecture, sessionEventSummary } = params;

  await cleanupExpiredStates();

  const rows = await db
    .select()
    .from(whatsappOauthStates)
    .where(eq(whatsappOauthStates.stateToken, state))
    .limit(1);

  const row = rows[0];
  if (!row || row.expiresAt < new Date()) {
    if (initiatingUserId) {
      await mergeUserMetaOAuthDebug(initiatingUserId, {
        phase: "complete_sdk_state_missing_or_expired",
        ok: false,
        error: "oauth_state_expired_or_invalid",
        errorCode: "oauth_state_expired",
        architecture: expectedArchitecture || null,
        flow: "embedded",
        tokenExchange,
        codeCallbackReceived: true,
        sessionEventReceived: !!sessionEventSummary,
        sessionEvent: sessionEventSummary
          ? {
              event: sessionEventSummary.event || null,
              wabaId: sessionEventSummary.wabaId || null,
              phoneNumberId: sessionEventSummary.phoneNumberId || null,
            }
          : null,
        completeSdkAttempted: true,
      });
    }
    return {
      success: false,
      error:
        "This signup session expired before Meta finished (signup can take longer than expected). Close any Facebook windows and start again from Settings — do not use a second browser Login tab.",
      errorCode: "oauth_state_expired",
      wabaId: sessionEventSummary?.wabaId || null,
    };
  }

  if (initiatingUserId && row.userId !== initiatingUserId) {
    return {
      success: false,
      error: "This signup does not match your session. Start again from Settings.",
    };
  }

  const architecture =
    parseWhatsappEmbeddedSignupArchitecture(row.architectureVersion) || ("v2" as const);

  if (expectedArchitecture && expectedArchitecture !== architecture) {
    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "architecture_mismatch",
      ok: false,
      errorCode: "architecture_mismatch",
      expectedArchitecture,
      stateArchitecture: architecture,
      architecture,
      flow: row.flow,
      codeCallbackReceived: true,
      sessionEventReceived: !!sessionEventSummary,
      completeSdkAttempted: true,
    });
    return {
      success: false,
      error: "Signup version mismatch. Close the window and start again from Settings.",
      errorCode: "architecture_mismatch",
    };
  }

  await mergeUserMetaOAuthDebug(row.userId, {
    flow: row.flow,
    architecture,
    tokenExchange,
    phase: "started",
    oauthStateTail: state.slice(-8),
    codeCallbackReceived: true,
    sessionEventReceived: !!sessionEventSummary,
    completeSdkAttempted: true,
    sessionEvent: sessionEventSummary
      ? {
          event: sessionEventSummary.event || null,
          wabaId: sessionEventSummary.wabaId || null,
          phoneNumberId: sessionEventSummary.phoneNumberId || null,
        }
      : null,
  });

  // Code exchange:
  // - Redirect OAuth (v2 fallback): MUST send the exact redirect_uri from the dialog.
  // - SDK + architecture v4 (Login for Business config_id / system-user style): Meta docs use
  //   client_id + client_secret + code only — do NOT send our callback redirect_uri (FB.login never used it).
  // - SDK + v2: preserve production contract (include state redirect_uri).
  const redirectUri = row.redirectUri || getWhatsappMetaRedirectUri();
  const omitRedirectUriForSdkV4 = tokenExchange === "sdk" && architecture === "v4";
  let shortToken: string;
  let codeExchangeExpiresIn: number | null = null;
  let codeExchangeAttemptCount = 0;
  try {
    console.log("[META EXCHANGE DEBUG]", {
      flow: tokenExchange,
      architecture,
      redirectUriUsed: omitRedirectUriForSdkV4 ? null : redirectUri,
      redirectUriOmitted: omitRedirectUriForSdkV4,
      redirectUriSource: omitRedirectUriForSdkV4
        ? "omitted_for_v4_sdk"
        : row.redirectUri
          ? "state_row"
          : "env_fallback",
      graphApiVersion: getMetaGraphVersionSegment(),
      graphApiBase: getMetaGraphApiBase(),
      appIdTail: (process.env.META_APP_ID || "").slice(-6) || null,
    });
    codeExchangeAttemptCount += 1;
    const exchangedCode = await exchangeWhatsappEmbeddedSignupAuthorizationCode({
      code,
      includeRedirectUri: !omitRedirectUriForSdkV4,
      redirectUri: omitRedirectUriForSdkV4 ? null : redirectUri,
    });
    shortToken = exchangedCode.accessToken;
    codeExchangeExpiresIn = exchangedCode.expiresIn;
    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "code_exchange",
      ok: true,
      architecture,
      flow: row.flow,
      tokenExchange,
      redirectUriUsed: exchangedCode.redirectUriSent ? redirectUri : null,
      redirectUriSent: exchangedCode.redirectUriSent,
      redirectUriSource: omitRedirectUriForSdkV4
        ? "omitted_for_v4_sdk"
        : row.redirectUri
          ? "state_row"
          : "env_fallback",
      graphEndpoint: exchangedCode.graphEndpoint,
      tokenType: exchangedCode.tokenType,
      expiresInFromCodeExchange: exchangedCode.expiresIn,
      codeExchangeAttemptCount,
    });
  } catch (e: any) {
    const ex = e as MetaOAuthExchangeError;
    const failureCategory =
      ex?.failureCategory ||
      classifyMetaCodeExchangeFailure({
        httpStatus: ex?.httpStatus,
        meta: ex?.meta,
      });
    console.warn("[WhatsApp Embedded Signup] code exchange failed", {
      message: (ex as any)?.message || String(e),
      meta_code: ex?.meta?.code,
      meta_type: ex?.meta?.type,
      meta_subcode: ex?.meta?.subcode,
      meta_message: ex?.meta?.message,
      meta_fbtrace_id: ex?.meta?.fbtraceId,
      http_status: (ex as any)?.httpStatus,
      failureCategory,
      tokenExchange,
      architecture,
      redirectUriUsed: omitRedirectUriForSdkV4 ? null : redirectUri,
      redirectUriOmitted: omitRedirectUriForSdkV4,
      codeExchangeAttemptCount,
    });
    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "code_exchange",
      ok: false,
      error: "code_exchange_failed",
      errorCode: "code_exchange_failed",
      exchangeFailureCategory: failureCategory,
      meta: ex?.meta
        ? {
            code: ex.meta.code ?? null,
            type: ex.meta.type ?? null,
            subcode: ex.meta.subcode ?? null,
            message: ex.meta.message ?? null,
            fbtraceId: ex.meta.fbtraceId ?? null,
          }
        : null,
      httpStatus: (ex as any)?.httpStatus,
      redirectUriUsed: omitRedirectUriForSdkV4 ? null : redirectUri,
      redirectUriSent: !omitRedirectUriForSdkV4,
      redirectUriSource: omitRedirectUriForSdkV4
        ? "omitted_for_v4_sdk"
        : row.redirectUri
          ? "state_row"
          : "env_fallback",
      architecture,
      flow: row.flow,
      codeCallbackReceived: true,
      sessionEventReceived: !!sessionEventSummary,
      completeSdkAttempted: true,
      codeExchangeAttemptCount,
    });
    return {
      success: false,
      error:
        failureCategory === "redirect_uri_mismatch"
          ? "Meta rejected the authorization-code exchange (redirect URI mismatch for this signup method). Close Facebook windows and try Continue with Meta again."
          : "Could not exchange the authorization code with Meta (redirect URI or app settings may not match). Close the window and try again with Continue with Meta.",
      errorCode: "code_exchange_failed",
    };
  }

  let longToken: string;
  let tokenExpiresAt: Date | null = null;
  let longLivedOk = false;
  if (architecture === "v4") {
    // v4 Login for Business returns a business-integration / system-user style token.
    // Do not run the v2 user-token fb_exchange_token extension.
    longToken = shortToken;
    if (codeExchangeExpiresIn && codeExchangeExpiresIn > 0) {
      tokenExpiresAt = new Date(Date.now() + codeExchangeExpiresIn * 1000);
    }
    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "long_lived_token",
      ok: true,
      skipped: true,
      reason: "v4_business_integration_token_no_user_fb_exchange",
      expiresInFromCodeExchange: codeExchangeExpiresIn,
      tokenExpiresAt: tokenExpiresAt ? tokenExpiresAt.toISOString() : null,
      architecture,
    });
  } else {
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
        errorCode: "long_lived_exchange_failed",
        exchangeFailureCategory: "long_lived_exchange_failed",
        note: "exchange_failed_using_short_lived_token",
        architecture,
      });
    }
    if (longLivedOk) {
      await mergeUserMetaOAuthDebug(row.userId, {
        phase: "long_lived_token",
        ok: true,
        tokenExpiresAt: tokenExpiresAt ? tokenExpiresAt.toISOString() : null,
        architecture,
      });
    }
  }

  try {
    const probed = await probeAccessTokenExpiryFromDebug(longToken);
    if (probed.ok && probed.neverExpires) {
      // Never-expiration Login for Business / Business Integration tokens.
      tokenExpiresAt = null;
    } else {
      tokenExpiresAt = earliestExpiry(tokenExpiresAt, probed.expiresAt);
    }
  } catch {
    /* non-fatal */
  }

  const coexistenceRestoreSnap =
    row.flow === "coexistence" ? await capturePersistedMetaSnapshot(row.userId) : null;
  /** Internal v4 tests must not wipe an existing working Meta connection on failure. */
  const v4ProtectSnap =
    row.flow === "embedded" && architecture === "v4"
      ? await capturePersistedMetaSnapshot(row.userId)
      : null;
  const protectSnap = coexistenceRestoreSnap || v4ProtectSnap;

  if (row.flow === "coexistence") {
    try {
      const cfgIdResolved = resolveEmbeddedSignupConfigId("coexistence", "v2");
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
    if (shouldUseV4DirectAssetValidation({ architecture, tokenExchange })) {
      // v4 SDK: never call /me/businesses (requires business_management).
      // Prefer FINISH session assets and validate directly with WhatsApp scopes.
      console.log("[WhatsApp Embedded Signup] v4_direct_asset_validation_start", {
        architecture,
        tokenExchange,
        hasSessionWabaId: !!sessionEventSummary?.wabaId,
        hasSessionPhoneNumberId: !!sessionEventSummary?.phoneNumberId,
        graphApiVersion: getMetaGraphVersionSegment(),
      });
      const v4Assets = await resolveV4EmbeddedSignupAssets({
        accessToken: longToken,
        sessionWabaId: sessionEventSummary?.wabaId,
        sessionPhoneNumberId: sessionEventSummary?.phoneNumberId,
      });
      await mergeUserMetaOAuthDebug(row.userId, {
        phase: "waba_discovery",
        architecture,
        flow: row.flow,
        discoveryMethod: "v4_direct_session_assets",
        ok: v4Assets.ok,
        errorCode: v4Assets.ok ? null : v4Assets.errorCode,
        discoveryFailureCategory: v4Assets.ok ? null : v4Assets.errorCode,
        graphVersion: v4Assets.graphVersion,
        endpointsUsed: v4Assets.endpointsUsed,
        failedEndpoint: v4Assets.ok ? null : v4Assets.failedEndpoint || null,
        meta: v4Assets.ok ? null : v4Assets.meta || null,
        debugTokenScopes: v4Assets.debugTokenScopes || null,
        debugTokenType: v4Assets.debugTokenType || null,
        sessionWabaId: sessionEventSummary?.wabaId || null,
        sessionPhoneNumberId: sessionEventSummary?.phoneNumberId || null,
        codeCallbackReceived: true,
        sessionEventReceived: !!sessionEventSummary,
        completeSdkAttempted: true,
        usedMeBusinessesEnumeration: false,
      });
      if (!v4Assets.ok) {
        const recoverableMsg = protectSnap?.hadMetaConnection
          ? `${v4Assets.error} Your previous WhatsApp connection was preserved; see Settings → WhatsApp for details.`
          : v4Assets.error;
        if (protectSnap?.hadMetaConnection) {
          await restorePersistedMetaSnapshot(row.userId, protectSnap);
          await storage.updateUser(row.userId, {
            metaIntegrationStatus: "needs_attention",
            metaLastErrorCode: v4Assets.errorCode,
            metaLastErrorMessage: recoverableMsg.slice(0, 500),
          });
        } else {
          await storage.updateUser(row.userId, {
            metaConnected: false,
            metaIntegrationStatus:
              v4Assets.errorCode === "phone_setup_incomplete" ? "needs_attention" : "failed",
            metaLastErrorCode: v4Assets.errorCode,
            metaLastErrorMessage: v4Assets.error.slice(0, 500),
          });
        }
        return {
          success: false,
          error: recoverableMsg.slice(0, 400),
          errorCode: v4Assets.errorCode,
          wabaId: v4Assets.wabaId || sessionEventSummary?.wabaId || null,
        };
      }

      const conflict = await findMetaPhoneNumberConflict(v4Assets.resolved.phoneNumberId, row.userId);
      if (conflict) {
        const msg =
          "This WhatsApp phone number is already connected to another WhachatCRM workspace. Disconnect it there first, or choose a different number in Meta.";
        await mergeUserMetaOAuthDebug(row.userId, {
          phase: "waba_discovery",
          ok: false,
          errorCode: "discovery_failed",
          discoveryFailureCategory: "phone_workspace_conflict",
          architecture,
        });
        if (protectSnap?.hadMetaConnection) {
          await restorePersistedMetaSnapshot(row.userId, protectSnap);
          await storage.updateUser(row.userId, {
            metaIntegrationStatus: "needs_attention",
            metaLastErrorCode: "phone_workspace_conflict",
            metaLastErrorMessage: msg.slice(0, 500),
          });
        } else {
          await storage.updateUser(row.userId, {
            metaConnected: false,
            metaIntegrationStatus: "failed",
            metaLastErrorCode: "phone_workspace_conflict",
            metaLastErrorMessage: msg.slice(0, 500),
          });
        }
        return { success: false, error: msg, errorCode: "discovery_failed", wabaId: v4Assets.resolved.wabaId };
      }

      resolved = {
        wabaId: v4Assets.resolved.wabaId,
        phoneNumberId: v4Assets.resolved.phoneNumberId,
        displayPhoneNumber: v4Assets.resolved.displayPhoneNumber,
        verifiedName: v4Assets.resolved.verifiedName,
      };
      await mergeUserMetaOAuthDebug(row.userId, {
        phase: "waba_selection",
        ok: true,
        phoneSelectionMethod: v4Assets.method,
        selectedWabaId: resolved.wabaId,
        selectedPhoneNumberId: resolved.phoneNumberId,
        architecture,
        errorCode: null,
      });
    } else {
    const fetched = await fetchUserWabaChoices(longToken);
    discoveryDiagnostics = fetched.diagnostics;
    let rawChoices = fetched.choices;

    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "waba_discovery_summary",
      ok: true,
      diagnostics: discoveryDiagnostics,
      discoveryMethod: "v2_me_businesses_enumeration",
      usedMeBusinessesEnumeration: true,
      architecture,
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
      let errorCode: "phone_setup_incomplete" | "no_valid_waba_or_phone" = "no_valid_waba_or_phone";
      const isCoexistence = row.flow === "coexistence";
      const sessionWabaId = sessionEventSummary?.wabaId?.trim() || null;
      const sessionFinishOnlyWaba =
        sessionEventSummary?.event === "FINISH_ONLY_WABA" ||
        (sessionWabaId && !sessionEventSummary?.phoneNumberId);
      const discoveredWabaOnly =
        !!discoveryDiagnostics &&
        discoveryDiagnostics.distinctWabaCount > 0 &&
        discoveryDiagnostics.totalPhonesListed === 0;

      if (
        discoveryDiagnostics &&
        discoveryDiagnostics.distinctWabaCount === 0 &&
        discoveryDiagnostics.businessesCount === 0 &&
        !sessionWabaId
      ) {
        msg = isCoexistence
          ? "Meta returned no Businesses linked to this login. Confirm you used the coexistence Embedded Signup configuration and granted WhatsApp / Business scopes."
          : "Meta returned no Business Manager linked to this Facebook account. Create or join a Business Manager at business.facebook.com, then try again.";
      } else if (discoveredWabaOnly || sessionFinishOnlyWaba || sessionWabaId) {
        errorCode = "phone_setup_incomplete";
        msg = isCoexistence
          ? "Meta lists your WhatsApp Business Account but returned no phone numbers from Graph (GET …/phone_numbers empty). This is often a discovery or permission gap; your number may still exist in Meta. Try again or use Option A."
          : "WhatsApp Business Account was created, but phone setup is incomplete — no phone number ID is available yet. Finish adding/verifying the number in Meta Business Manager, then reconnect with Continue with Meta (do not start a second Facebook Login tab).";
      } else {
        msg = isCoexistence
          ? "WhatsApp discovery did not yield a selectable phone line. Confirm the number appears under your WABA in Meta Business Manager."
          : "We could not find a WhatsApp phone number on your account. Finish setup in Meta Embedded Signup or add a number in Meta Business Manager, then reconnect.";
      }

      const recoverableMsg =
        protectSnap?.hadMetaConnection
          ? `${msg} Your previous WhatsApp connection was preserved; see Settings → WhatsApp for details.`
          : msg;

      if (protectSnap?.hadMetaConnection) {
        await restorePersistedMetaSnapshot(row.userId, protectSnap);
        await storage.updateUser(row.userId, {
          metaIntegrationStatus: "needs_attention",
          metaLastErrorCode: errorCode,
          metaLastErrorMessage: recoverableMsg.slice(0, 500),
        });
      } else {
        await storage.updateUser(row.userId, {
          metaConnected: false,
          metaIntegrationStatus: errorCode === "phone_setup_incomplete" ? "needs_attention" : "failed",
          metaLastErrorCode: errorCode,
          metaLastErrorMessage: msg.slice(0, 500),
        });
      }
      const wabaFromDiscovery =
        rawChoices.length > 0 ? sortIds(rawChoices.map((c) => c.wabaId)).find(Boolean) || null : null;
      await mergeUserMetaOAuthDebug(row.userId, {
        phase: "complete",
        ok: false,
        error: usedSyntheticFallback ? "no_phone_after_fallback" : errorCode,
        errorCode,
        discoveryDiagnostics,
        connectivityRestored: !!protectSnap?.hadMetaConnection,
        architecture,
        flow: row.flow,
        sessionWabaId,
        wabaId: sessionWabaId || wabaFromDiscovery,
        codeCallbackReceived: true,
        sessionEventReceived: !!sessionEventSummary,
        completeSdkAttempted: true,
      });
      return {
        success: false,
        error: recoverableMsg.slice(0, 400),
        errorCode,
        wabaId: sessionWabaId || wabaFromDiscovery,
      };
    }

    const enrichedChoices = enrichWabaPhoneChoices(rawChoices);
    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "waba_discovery",
      ok: true,
      validWabaCount: rawChoices.length,
      wabaIdsSample: sortIds(rawChoices.map((c) => c.wabaId)).slice(0, 25),
      wabaDiscoveryDetail: buildWabaDiscoveryDetailPayload(enrichedChoices),
      selectionPolicy: "auto_production_only_never_auto_test_or_unknown",
      coexistenceSyntheticFallback: usedSyntheticFallback,
      errorCode: null,
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
        wabaDiscoveryDetail: buildWabaDiscoveryDetailPayload(enrichedChoices),
        phoneSelectionMethod: "pending_user",
      });

      return { success: true, needsWabaPick: true, state };
    }

    resolved = {
      wabaId: decision.pick.wabaId,
      phoneNumberId: decision.pick.phoneNumberId,
      displayPhoneNumber: decision.pick.displayPhoneNumber,
      verifiedName: decision.pick.verifiedName,
    };
    logWabaDiscoveryTree(row.userId, enrichedChoices, {
      method: "auto",
      wabaId: resolved.wabaId,
      phoneNumberId: resolved.phoneNumberId,
      phoneKind: decision.pick.phoneKind,
    });
    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "waba_selection",
      phoneSelectionMethod: "auto",
      selectedPhoneKind: decision.pick.phoneKind,
      wabaDiscoveryDetail: buildWabaDiscoveryDetailPayload(enrichedChoices, {
        method: "auto",
        wabaId: resolved.wabaId,
        phoneNumberId: resolved.phoneNumberId,
      }),
    });
    } // end v2 discovery branch
  } catch (e: any) {
    const rawMsg = e?.message || "Could not read WhatsApp account details from Meta.";
    const msg = sanitizeEmbeddedSignupClientError(e);
    console.warn("[WhatsApp Embedded Signup] waba_discovery error", {
      architecture,
      tokenExchange,
      rawError: String(rawMsg).slice(0, 300),
      name: e?.name || null,
    });
    const missingPerm =
      /missing permission/i.test(rawMsg) || /\(#100\).*permission/i.test(rawMsg);
    const errorCode = missingPerm
      ? ("waba_discovery_missing_permission" as const)
      : ("discovery_failed" as const);
    if (protectSnap?.hadMetaConnection) {
      await restorePersistedMetaSnapshot(row.userId, protectSnap);
      await storage.updateUser(row.userId, {
        metaIntegrationStatus: "needs_attention",
        metaLastErrorCode: errorCode,
        metaLastErrorMessage: `${msg} Your previous WhatsApp connection was preserved.`.slice(0, 500),
      });
    } else {
      await storage.updateUser(row.userId, {
        metaIntegrationStatus: "failed",
        metaLastErrorCode: errorCode,
        metaLastErrorMessage: msg.slice(0, 500),
      });
    }
    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "waba_discovery",
      ok: false,
      error: msg.slice(0, 500),
      errorCode,
      discoveryFailureCategory: errorCode,
      failedEndpointHint: missingPerm ? "GET /me/businesses?fields=id,name" : null,
      discoveryDiagnosticsSnapshot: discoveryDiagnostics,
      connectivityRestored: !!protectSnap?.hadMetaConnection,
      architecture,
      usedMeBusinessesEnumeration: architecture !== "v4",
    });
    return { success: false, error: msg, errorCode };
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

  // Immediately fetch the phone node after connection so UI can distinguish
  // “connected but routing inactive” vs “ready for Cloud API”.
  let needsPhoneRegistration = false;
  try {
    const snap = await fetchMetaWhatsAppPhoneNumberGraphSnapshot(longToken, resolved.phoneNumberId);
    const isTest = isMetaTestPhoneFromSavedFields({
      displayPhoneNumber: resolved.displayPhoneNumber ?? null,
      verifiedName: resolved.verifiedName ?? null,
    });
    const regFields = extractMetaPhoneGraphRegistrationFields(
      snap.ok ? { data: snap.data as Record<string, unknown> } : null,
    );
    const operational = snap.ok && (isTest || isMetaPhoneCloudApiOperational(regFields));
    needsPhoneRegistration =
      row.flow === "embedded" &&
      !isTest &&
      snap.ok &&
      isMetaPhoneCloudApiRegistrationRequired(regFields, { coexistence: false, isTestNumber: false });

    await mergeUserMetaOAuthDebug(row.userId, {
      phase: needsPhoneRegistration ? "phone_registration_required" : "phone_graph_post_connect",
      ok: snap.ok,
      routingReady: operational,
      isMetaTestNumber: isTest,
      needsPhoneRegistration,
      httpStatus: snap.httpStatus ?? null,
      error: snap.ok ? null : snap.error ?? null,
      phoneGraphSnapshot: {
        fetchedAt: new Date().toISOString(),
        phoneNumberId: resolved.phoneNumberId,
        ...snap,
      },
      graphStatus: regFields.status || null,
      platformType: regFields.platformType || null,
      architecture,
      flow: row.flow,
    });

    if (needsPhoneRegistration) {
      await storage.updateUser(row.userId, {
        metaIntegrationStatus: "needs_phone_registration",
        metaLastErrorCode: "phone_registration_required",
        metaLastErrorMessage:
          "Phone registration required. Enter a six-digit WhatsApp PIN to finish Cloud API setup.",
        metaWebhookLastCheckedAt: new Date(),
      });
    } else {
      await storage.updateUser(row.userId, {
        metaIntegrationStatus: operational ? "connected" : "needs_attention",
        metaLastErrorMessage: operational
          ? null
          : "WhatsApp setup is incomplete. Finish phone verification in Meta.",
        metaWebhookLastCheckedAt: new Date(),
      });
    }
  } catch (e: any) {
    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "phone_graph_post_connect",
      ok: false,
      error: e?.message || String(e),
    });
    // Keep connection but mark needs_attention until we can verify the phone status.
    await storage.updateUser(row.userId, {
      metaIntegrationStatus: "needs_attention",
      metaLastErrorMessage: "WhatsApp setup is incomplete. Finish phone verification in Meta.",
      metaWebhookLastCheckedAt: new Date(),
    });
  }

  await repairMetaWabaWebhookSubscription(row.userId);

  // Success path: state is no longer needed (credentials are persisted on the user).
  await db.delete(whatsappOauthStates).where(eq(whatsappOauthStates.stateToken, state));

  return { success: true, userId: row.userId, needsPhoneRegistration };
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

  logWabaDiscoveryTree(row.userId, allowed, {
    method: "user",
    wabaId: matchWaba.wabaId,
    phoneNumberId: matchPhone.id,
    phoneKind: matchPhone.phoneKind,
  });
  await mergeUserMetaOAuthDebug(row.userId, {
    phase: "waba_selection",
    phoneSelectionMethod: "user",
    selectedPhoneKind: matchPhone.phoneKind,
    wabaDiscoveryDetail: buildWabaDiscoveryDetailPayload(allowed, {
      method: "user",
      wabaId: matchWaba.wabaId,
      phoneNumberId: matchPhone.id,
    }),
  });

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

  // Immediately verify the phone node for routing readiness / registration need.
  try {
    const snap = await fetchMetaWhatsAppPhoneNumberGraphSnapshot(token, matchPhone.id);
    const isTest = isMetaTestPhoneFromSavedFields({
      displayPhoneNumber: matchPhone.displayPhoneNumber ?? null,
      verifiedName: matchPhone.verifiedName ?? null,
    });
    const regFields = extractMetaPhoneGraphRegistrationFields(
      snap.ok ? { data: snap.data as Record<string, unknown> } : null,
    );
    const operational = snap.ok && (isTest || isMetaPhoneCloudApiOperational(regFields));
    const needsPhoneRegistration =
      row.flow === "embedded" &&
      !isTest &&
      snap.ok &&
      isMetaPhoneCloudApiRegistrationRequired(regFields, { coexistence: false, isTestNumber: false });

    await mergeUserMetaOAuthDebug(row.userId, {
      phase: needsPhoneRegistration ? "phone_registration_required" : "phone_graph_post_connect",
      ok: snap.ok,
      routingReady: operational,
      isMetaTestNumber: isTest,
      needsPhoneRegistration,
      httpStatus: snap.httpStatus ?? null,
      error: snap.ok ? null : snap.error ?? null,
      phoneGraphSnapshot: {
        fetchedAt: new Date().toISOString(),
        phoneNumberId: matchPhone.id,
        ...snap,
      },
      graphStatus: regFields.status || null,
      platformType: regFields.platformType || null,
    });

    if (needsPhoneRegistration) {
      await storage.updateUser(row.userId, {
        metaIntegrationStatus: "needs_phone_registration",
        metaLastErrorCode: "phone_registration_required",
        metaLastErrorMessage:
          "Phone registration required. Enter a six-digit WhatsApp PIN to finish Cloud API setup.",
        metaWebhookLastCheckedAt: new Date(),
      });
    } else {
      await storage.updateUser(row.userId, {
        metaIntegrationStatus: operational ? "connected" : "needs_attention",
        metaLastErrorMessage: operational
          ? null
          : "WhatsApp setup is incomplete. Finish phone verification in Meta.",
        metaWebhookLastCheckedAt: new Date(),
      });
    }
  } catch (e: any) {
    await mergeUserMetaOAuthDebug(row.userId, {
      phase: "phone_graph_post_connect",
      ok: false,
      error: e?.message || String(e),
    });
    await storage.updateUser(row.userId, {
      metaIntegrationStatus: "needs_attention",
      metaLastErrorMessage: "WhatsApp setup is incomplete. Finish phone verification in Meta.",
      metaWebhookLastCheckedAt: new Date(),
    });
  }

  await repairMetaWabaWebhookSubscription(row.userId);

  await db.delete(whatsappOauthStates).where(eq(whatsappOauthStates.stateToken, state));
  return { success: true };
}

/** Client-reported diagnostics (no secrets) — for production Meta login failures. */
export function logWhatsappEmbeddedSignupClientDiagnostics(
  userId: string,
  userEmail: string | null | undefined,
  payload: Record<string, unknown>,
): void {
  const safe: Record<string, unknown> = { ...payload };
  delete safe.code;
  delete safe.access_token;
  delete safe.authResponse;
  console.log("[WhatsApp Embedded Signup] client_diagnostics", {
    userId,
    userEmail: userEmail || null,
    at: new Date().toISOString(),
    ...safe,
  });
}
