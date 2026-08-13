/**
 * WhatsApp Business App Coexistence — controlled test gate (server-authoritative).
 *
 * Public users remain blocked ("Coming soon") until we explicitly approve public release.
 * Phase 2 unlock is allowlist-only:
 *   WHATSAPP_COEXISTENCE_TEST_ENABLED=true|1
 *   WHATSAPP_COEXISTENCE_ALLOWLIST_USER_IDS=<comma-separated user IDs>
 *
 * Also requires dedicated META_WHATSAPP_COEXISTENCE_CONFIG_ID and base Embedded Signup env.
 * Never trusts client flags, query params, or Sales Admin alone.
 * Public config must never expose allowlist membership beyond a per-user boolean.
 */

import { configIdLast4 } from "./whatsappEmbeddedSignupVersion";

export type CoexistenceGateDecision = {
  allowed: boolean;
  reason:
    | "allowed"
    | "test_flag_disabled"
    | "not_on_allowlist"
    | "missing_coexistence_config"
    | "base_embedded_signup_not_ready"
    | "config_isolation_failed"
    | "empty_user_id";
};

export type CoexistenceConfigIsolationResult = {
  ok: boolean;
  coexistenceConfigIdLast4: string | null;
  v2ConfigIdLast4: string | null;
  v4ConfigIdLast4: string | null;
  /** True when coexistence config collides with v2 and/or v4. */
  collisionWithStandard: boolean;
};

function isTruthyFlag(raw: unknown): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "true" || s === "1";
}

function parseAllowlistUserIds(env: NodeJS.ProcessEnv): string[] {
  return String(env.WHATSAPP_COEXISTENCE_ALLOWLIST_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isBaseEmbeddedSignupReady(env: NodeJS.ProcessEnv): boolean {
  const embeddedFlag =
    env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED === "true" ||
    env.WHATSAPP_EMBEDDED_SIGNUP_ENABLED === "1";
  return (
    embeddedFlag &&
    !!env.META_APP_ID?.trim() &&
    !!env.META_APP_SECRET?.trim() &&
    !!env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim()
  );
}

/** Pairwise isolation: coexistence config must not equal Standard v2 or v4. */
export function evaluateCoexistenceConfigIsolation(
  env: NodeJS.ProcessEnv = process.env,
): CoexistenceConfigIsolationResult {
  const coexistenceConfigId = env.META_WHATSAPP_COEXISTENCE_CONFIG_ID?.trim() || null;
  const v2ConfigId = env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || null;
  const v4ConfigId = env.META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID?.trim() || null;

  let collisionWithStandard = false;
  if (coexistenceConfigId) {
    if (v2ConfigId && coexistenceConfigId === v2ConfigId) collisionWithStandard = true;
    if (v4ConfigId && coexistenceConfigId === v4ConfigId) collisionWithStandard = true;
  }

  return {
    ok: !collisionWithStandard,
    coexistenceConfigIdLast4: configIdLast4(coexistenceConfigId),
    v2ConfigIdLast4: configIdLast4(v2ConfigId),
    v4ConfigIdLast4: configIdLast4(v4ConfigId),
    collisionWithStandard,
  };
}

/**
 * Server-authoritative: may this user start Coexistence onboarding?
 * Does not imply public availability.
 */
export function evaluateCoexistenceOnboardingGate(params: {
  userId: string;
  env?: NodeJS.ProcessEnv;
}): CoexistenceGateDecision {
  const env = params.env ?? process.env;
  const userId = String(params.userId || "").trim();
  if (!userId) return { allowed: false, reason: "empty_user_id" };

  if (!isTruthyFlag(env.WHATSAPP_COEXISTENCE_TEST_ENABLED)) {
    return { allowed: false, reason: "test_flag_disabled" };
  }

  if (!isBaseEmbeddedSignupReady(env)) {
    return { allowed: false, reason: "base_embedded_signup_not_ready" };
  }

  const coexistenceConfigId = env.META_WHATSAPP_COEXISTENCE_CONFIG_ID?.trim() || "";
  if (!coexistenceConfigId) {
    return { allowed: false, reason: "missing_coexistence_config" };
  }

  const isolation = evaluateCoexistenceConfigIsolation(env);
  if (!isolation.ok) {
    return { allowed: false, reason: "config_isolation_failed" };
  }

  const allowlist = parseAllowlistUserIds(env);
  if (!allowlist.includes(userId)) {
    return { allowed: false, reason: "not_on_allowlist" };
  }

  return { allowed: true, reason: "allowed" };
}

export function isCoexistenceOnboardingAllowedForUser(
  userId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return evaluateCoexistenceOnboardingGate({ userId, env }).allowed;
}

/** Safe operator diagnostics — last4 / booleans only. */
export function buildSanitizedCoexistenceGateSummary(
  env: NodeJS.ProcessEnv = process.env,
): {
  testFlagEnabled: boolean;
  allowlistCount: number;
  coexistenceConfigConfigured: boolean;
  coexistenceConfigIdLast4: string | null;
  configIsolationOk: boolean;
  baseEmbeddedSignupReady: boolean;
} {
  const isolation = evaluateCoexistenceConfigIsolation(env);
  return {
    testFlagEnabled: isTruthyFlag(env.WHATSAPP_COEXISTENCE_TEST_ENABLED),
    allowlistCount: parseAllowlistUserIds(env).length,
    coexistenceConfigConfigured: !!env.META_WHATSAPP_COEXISTENCE_CONFIG_ID?.trim(),
    coexistenceConfigIdLast4: isolation.coexistenceConfigIdLast4,
    configIsolationOk: isolation.ok,
    baseEmbeddedSignupReady: isBaseEmbeddedSignupReady(env),
  };
}

/** Customer-facing copy when public/unauthorized callers try to start Coexistence. */
export const COEXISTENCE_COMING_SOON_MESSAGE =
  "Coexistence onboarding is coming soon.";
