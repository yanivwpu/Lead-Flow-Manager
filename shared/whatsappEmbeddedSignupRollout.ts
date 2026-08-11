/**
 * WhatsApp Embedded Signup v4 controlled rollout (standard flow only).
 * Coexistence never uses this path.
 *
 * Kill switch: WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED (must be true/1).
 * Mode: WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE
 *   - disabled | allowlist_only | percentage | public
 * Percent: WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_PERCENT (0–100)
 * Allowlist: WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS (comma-separated user IDs)
 *
 * Missing / malformed / unknown mode → treat as disabled → v2 for everyone.
 * Admin / Sales Admin never grants v4. Clients never select architecture.
 *
 * Note: hashing is pure JS (no node:crypto) so this shared module stays safe if
 * imported transitively by client bundles. Selection itself remains server-side only.
 */

import {
  configIdLast4,
  type WhatsappEmbeddedSignupArchitecture,
  type WhatsappEmbeddedSignupFlow,
} from "./whatsappEmbeddedSignupVersion";

export const WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODES = [
  "disabled",
  "allowlist_only",
  "percentage",
  "public",
] as const;

export type WhatsappEmbeddedSignupV4RolloutMode =
  (typeof WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODES)[number];

export type V4PrerequisiteKey =
  | "v4_config_id"
  | "meta_app_id"
  | "meta_app_secret"
  | "redirect_or_app_url"
  | "webhook_verify_token"
  | "token_encryption"
  | "oauth_states_schema"
  | "config_isolation";

export type V4PrerequisitesResult = {
  ok: boolean;
  missing: V4PrerequisiteKey[];
  /** Sanitized — last4 only, never full secrets/config IDs. */
  diagnostics: {
    v4ConfigIdLast4: string | null;
    v2ConfigIdLast4: string | null;
    coexistenceConfigIdLast4: string | null;
    metaAppIdConfigured: boolean;
    metaAppSecretConfigured: boolean;
    redirectUriConfigured: boolean;
    appUrlConfigured: boolean;
    webhookVerifyTokenConfigured: boolean;
    tokenEncryptionConfigured: boolean;
    oauthStatesSchemaAvailable: boolean | null;
    configIsolationOk: boolean;
  };
};

const ROLLOUT_HASH_PREFIX = "wa-es-v4-rollout:v1:";

/**
 * Deterministic FNV-1a 32-bit hash → bucket 0–99.
 * Pure JS (no Math.random / IP / email / session). Same userId always same bucket.
 */
export function embeddedSignupV4RolloutBucket(userId: string): number {
  const id = String(userId || "").trim();
  if (!id) return 100; // empty → never in percentage cohort
  const input = `${ROLLOUT_HASH_PREFIX}${id}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

export function parseEmbeddedSignupV4RolloutMode(
  raw: unknown,
): { mode: WhatsappEmbeddedSignupV4RolloutMode; valid: boolean } {
  if (raw == null || raw === "") {
    return { mode: "disabled", valid: false };
  }
  const s = String(raw).trim().toLowerCase();
  if (
    s === "disabled" ||
    s === "allowlist_only" ||
    s === "percentage" ||
    s === "public"
  ) {
    return { mode: s, valid: true };
  }
  return { mode: "disabled", valid: false };
}

export function parseEmbeddedSignupV4RolloutPercent(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 100) return 100;
  return Math.floor(n);
}

function isNonEmpty(v: string | null | undefined): boolean {
  return !!(v && String(v).trim());
}

function looksLikeHttpUrl(v: string): boolean {
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Sync/env prerequisites for selecting v4.
 * Pass `oauthStatesSchemaAvailable` from server DB probe when known.
 */
export function evaluateEmbeddedSignupV4Prerequisites(
  env: NodeJS.ProcessEnv = process.env,
  options?: { oauthStatesSchemaAvailable?: boolean | null },
): V4PrerequisitesResult {
  const v4ConfigId = env.META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID?.trim() || null;
  const v2ConfigId = env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || null;
  const coexistenceConfigId = env.META_WHATSAPP_COEXISTENCE_CONFIG_ID?.trim() || null;
  const metaAppId = env.META_APP_ID?.trim() || null;
  const metaAppSecret = env.META_APP_SECRET?.trim() || null;
  const redirectUri = env.META_WHATSAPP_REDIRECT_URI?.trim() || null;
  const appUrl = env.APP_URL?.trim() || null;
  const webhookVerify = env.META_WEBHOOK_VERIFY_TOKEN?.trim() || null;
  const encKey =
    env.META_ENCRYPTION_KEY?.trim() ||
    env.SESSION_SECRET?.trim() ||
    null;

  const missing: V4PrerequisiteKey[] = [];

  if (!isNonEmpty(v4ConfigId)) missing.push("v4_config_id");
  if (!isNonEmpty(metaAppId)) missing.push("meta_app_id");
  if (!isNonEmpty(metaAppSecret)) missing.push("meta_app_secret");

  const redirectOk = !!(redirectUri && looksLikeHttpUrl(redirectUri));
  const appUrlOk = !!(appUrl && looksLikeHttpUrl(appUrl));
  // App routing readiness only (webhook callbacks / app origin). This does NOT require
  // redirect_uri to be sent on the v4 SDK token exchange — that path continues to omit it.
  if (!redirectOk && !appUrlOk) missing.push("redirect_or_app_url");

  if (!isNonEmpty(webhookVerify)) missing.push("webhook_verify_token");
  if (!isNonEmpty(encKey)) missing.push("token_encryption");

  const schemaAvail =
    options?.oauthStatesSchemaAvailable === undefined
      ? null
      : options.oauthStatesSchemaAvailable;
  if (schemaAvail === false) missing.push("oauth_states_schema");

  let configIsolationOk = true;
  if (v4ConfigId) {
    if (v2ConfigId && v4ConfigId === v2ConfigId) {
      configIsolationOk = false;
      missing.push("config_isolation");
    } else if (coexistenceConfigId && v4ConfigId === coexistenceConfigId) {
      configIsolationOk = false;
      missing.push("config_isolation");
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    diagnostics: {
      v4ConfigIdLast4: configIdLast4(v4ConfigId),
      v2ConfigIdLast4: configIdLast4(v2ConfigId),
      coexistenceConfigIdLast4: configIdLast4(coexistenceConfigId),
      metaAppIdConfigured: !!metaAppId,
      metaAppSecretConfigured: !!metaAppSecret,
      redirectUriConfigured: redirectOk,
      appUrlConfigured: appUrlOk,
      webhookVerifyTokenConfigured: !!webhookVerify,
      tokenEncryptionConfigured: !!encKey,
      oauthStatesSchemaAvailable: schemaAvail,
      configIsolationOk,
    },
  };
}

export type EmbeddedSignupV4GateSnapshot = {
  flagEnabled: boolean;
  v4ConfigIdConfigured: boolean;
  v4ConfigId: string | null;
  allowlistUserIds: string[];
  rolloutMode: WhatsappEmbeddedSignupV4RolloutMode;
  rolloutModeValid: boolean;
  rolloutPercent: number;
};

export function readEmbeddedSignupV4GateFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddedSignupV4GateSnapshot {
  const flagEnabled =
    env.WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED === "true" ||
    env.WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED === "1";
  const v4ConfigId = env.META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID?.trim() || null;
  const allowlistUserIds = String(env.WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const parsedMode = parseEmbeddedSignupV4RolloutMode(
    env.WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE,
  );
  const rolloutPercent = parseEmbeddedSignupV4RolloutPercent(
    env.WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_PERCENT,
  );
  return {
    flagEnabled,
    v4ConfigIdConfigured: !!v4ConfigId,
    v4ConfigId,
    allowlistUserIds,
    rolloutMode: parsedMode.mode,
    rolloutModeValid: parsedMode.valid,
    rolloutPercent,
  };
}

export type EmbeddedSignupArchitectureSelection = {
  architecture: WhatsappEmbeddedSignupArchitecture;
  reason: string;
  v4EnvReady: boolean;
  userAuthorizedForV4: boolean;
  rolloutMode: WhatsappEmbeddedSignupV4RolloutMode;
  rolloutPercent: number;
  rolloutBucket: number | null;
  prerequisitesOk: boolean;
  prerequisitesMissing: V4PrerequisiteKey[];
};

/**
 * Server-side architecture selection for **standard** Embedded Signup.
 * Never selects v4 for coexistence. Never trusts client/admin for eligibility.
 */
export function selectEmbeddedSignupArchitecture(params: {
  flow: WhatsappEmbeddedSignupFlow;
  userId: string;
  /** Ignored for v4 eligibility — retained for API compatibility. */
  sessionIsAdmin?: boolean;
  env?: NodeJS.ProcessEnv;
  /** Optional DB probe result; omit/null skips schema gate (tests). */
  oauthStatesSchemaAvailable?: boolean | null;
}): EmbeddedSignupArchitectureSelection {
  const env = params.env ?? process.env;
  const gate = readEmbeddedSignupV4GateFromEnv(env);
  const bucket = embeddedSignupV4RolloutBucket(params.userId);
  const prereq = evaluateEmbeddedSignupV4Prerequisites(env, {
    oauthStatesSchemaAvailable: params.oauthStatesSchemaAvailable,
  });

  const base = {
    rolloutMode: gate.rolloutMode,
    rolloutPercent: gate.rolloutPercent,
    rolloutBucket: null as number | null,
    prerequisitesOk: prereq.ok,
    prerequisitesMissing: prereq.missing,
  };

  if (params.flow === "coexistence") {
    return {
      architecture: "v2",
      reason: "coexistence_uses_dedicated_config_not_standard_v4",
      v4EnvReady: false,
      userAuthorizedForV4: false,
      ...base,
    };
  }

  const v4EnvReady = gate.flagEnabled && gate.v4ConfigIdConfigured && prereq.ok;
  const onAllowlist = gate.allowlistUserIds.includes(params.userId);

  if (!gate.flagEnabled) {
    return {
      architecture: "v2",
      reason: "v4_flag_disabled",
      v4EnvReady: false,
      userAuthorizedForV4: false,
      ...base,
    };
  }

  if (!gate.v4ConfigIdConfigured) {
    return {
      architecture: "v2",
      reason: "v4_config_id_missing",
      v4EnvReady: false,
      userAuthorizedForV4: false,
      ...base,
    };
  }

  if (!prereq.ok) {
    return {
      architecture: "v2",
      reason: `v4_prerequisites_incomplete:${prereq.missing.join(",")}`,
      v4EnvReady: false,
      userAuthorizedForV4: false,
      ...base,
    };
  }

  if (!gate.rolloutModeValid) {
    return {
      architecture: "v2",
      reason: "v4_rollout_mode_invalid",
      v4EnvReady: true,
      userAuthorizedForV4: false,
      ...base,
    };
  }

  // Allowlist is an explicit internal-testing override for allowlist_only / percentage / public.
  // Mode `disabled` blocks everyone (including allowlist) until ops picks allowlist_only+.
  if (gate.rolloutMode === "disabled") {
    return {
      architecture: "v2",
      reason: "v4_rollout_disabled",
      v4EnvReady: true,
      userAuthorizedForV4: false,
      ...base,
    };
  }

  if (gate.rolloutMode === "allowlist_only") {
    if (gate.allowlistUserIds.length === 0) {
      return {
        architecture: "v2",
        reason: "v4_allowlist_empty",
        v4EnvReady: true,
        userAuthorizedForV4: false,
        ...base,
      };
    }
    if (!onAllowlist) {
      return {
        architecture: "v2",
        reason: "v4_env_ready_but_user_not_allowlisted",
        v4EnvReady: true,
        userAuthorizedForV4: false,
        ...base,
      };
    }
    return {
      architecture: "v4",
      reason: "v4_allowlisted_user",
      v4EnvReady: true,
      userAuthorizedForV4: true,
      ...base,
      rolloutBucket: bucket,
    };
  }

  if (gate.rolloutMode === "percentage") {
    if (onAllowlist) {
      return {
        architecture: "v4",
        reason: "v4_allowlisted_user",
        v4EnvReady: true,
        userAuthorizedForV4: true,
        ...base,
        rolloutBucket: bucket,
      };
    }
    if (bucket < gate.rolloutPercent) {
      return {
        architecture: "v4",
        reason: "v4_percentage_included",
        v4EnvReady: true,
        userAuthorizedForV4: true,
        ...base,
        rolloutBucket: bucket,
      };
    }
    return {
      architecture: "v2",
      reason: "v4_percentage_excluded",
      v4EnvReady: true,
      userAuthorizedForV4: false,
      ...base,
      rolloutBucket: bucket,
    };
  }

  // public
  return {
    architecture: "v4",
    reason: onAllowlist ? "v4_allowlisted_user" : "v4_public_rollout",
    v4EnvReady: true,
    userAuthorizedForV4: true,
    ...base,
    rolloutBucket: bucket,
  };
}

/** Sanitized rollout summary fields for Sales Admin (no secrets / customer identifiers). */
export function buildSanitizedV4RolloutConfigSummary(
  env: NodeJS.ProcessEnv = process.env,
  options?: { oauthStatesSchemaAvailable?: boolean | null },
): {
  killSwitchEnabled: boolean;
  rolloutMode: WhatsappEmbeddedSignupV4RolloutMode;
  rolloutModeValid: boolean;
  rolloutPercent: number;
  allowlistCount: number;
  v4ConfigPresent: boolean;
  v4ConfigIdLast4: string | null;
  prerequisites: V4PrerequisitesResult;
} {
  const gate = readEmbeddedSignupV4GateFromEnv(env);
  const prerequisites = evaluateEmbeddedSignupV4Prerequisites(env, options);
  return {
    killSwitchEnabled: gate.flagEnabled,
    rolloutMode: gate.rolloutMode,
    rolloutModeValid: gate.rolloutModeValid,
    rolloutPercent: gate.rolloutPercent,
    allowlistCount: gate.allowlistUserIds.length,
    v4ConfigPresent: gate.v4ConfigIdConfigured,
    v4ConfigIdLast4: configIdLast4(gate.v4ConfigId),
    prerequisites,
  };
}
