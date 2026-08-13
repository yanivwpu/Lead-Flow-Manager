/**
 * WhatsApp Business App Coexistence — public onboarding gate (server-authoritative).
 *
 * Kill switch (either flag enables public Coexistence for authenticated users):
 *   WHATSAPP_COEXISTENCE_TEST_ENABLED=true|1   (existing prod ENV — preferred; no rename required)
 *   WHATSAPP_COEXISTENCE_ENABLED=true|1        (optional alias)
 *
 * Allowlist is no longer required for launch. WHATSAPP_COEXISTENCE_ALLOWLIST_USER_IDS
 * is ignored for gating (kept only in diagnostics for operators).
 *
 * Also requires dedicated META_WHATSAPP_COEXISTENCE_CONFIG_ID and base Embedded Signup env.
 * Never trusts client flags, query params, or Sales Admin alone.
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

/** Public enable kill switch — TEST_ENABLED (current Railway) or ENABLED alias. */
export function isCoexistencePublicFlagEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    isTruthyFlag(env.WHATSAPP_COEXISTENCE_TEST_ENABLED) ||
    isTruthyFlag(env.WHATSAPP_COEXISTENCE_ENABLED)
  );
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
 * Server-authoritative: may this authenticated user start Coexistence onboarding?
 * When the public flag is on, any non-empty user id may launch (no allowlist).
 */
export function evaluateCoexistenceOnboardingGate(params: {
  userId: string;
  env?: NodeJS.ProcessEnv;
}): CoexistenceGateDecision {
  const env = params.env ?? process.env;
  const userId = String(params.userId || "").trim();
  if (!userId) return { allowed: false, reason: "empty_user_id" };

  if (!isCoexistencePublicFlagEnabled(env)) {
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
  publicFlagEnabled: boolean;
  /** @deprecated alias of publicFlagEnabled (was test-only). */
  testFlagEnabled: boolean;
  allowlistCount: number;
  allowlistRequired: false;
  coexistenceConfigConfigured: boolean;
  coexistenceConfigIdLast4: string | null;
  configIsolationOk: boolean;
  baseEmbeddedSignupReady: boolean;
} {
  const isolation = evaluateCoexistenceConfigIsolation(env);
  const publicFlagEnabled = isCoexistencePublicFlagEnabled(env);
  return {
    publicFlagEnabled,
    testFlagEnabled: publicFlagEnabled,
    allowlistCount: parseAllowlistUserIds(env).length,
    allowlistRequired: false,
    coexistenceConfigConfigured: !!env.META_WHATSAPP_COEXISTENCE_CONFIG_ID?.trim(),
    coexistenceConfigIdLast4: isolation.coexistenceConfigIdLast4,
    configIsolationOk: isolation.ok,
    baseEmbeddedSignupReady: isBaseEmbeddedSignupReady(env),
  };
}

/** Customer-facing copy when Coexistence is disabled or unavailable. */
export const COEXISTENCE_COMING_SOON_MESSAGE =
  "Coexistence onboarding is coming soon.";
