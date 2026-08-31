/**
 * GHL Marketplace plan IDs — fail closed.
 * Never infer paid access from display names such as "Pro", "Free", or "paid".
 */

export type GhlMarketplacePlanKind = "free" | "pro" | "unknown";

export type GhlMarketplacePlanConfig = {
  freePlanId: string | null;
  proPlanId: string | null;
  /** True only when both Free and Pro IDs are non-empty and distinct. */
  configured: boolean;
};

function trimId(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

export function ghlMarketplacePlanConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): GhlMarketplacePlanConfig {
  const freePlanId = trimId(env.GHL_MARKETPLACE_FREE_PLAN_ID);
  const proPlanId = trimId(env.GHL_MARKETPLACE_PRO_PLAN_ID);
  const configured = Boolean(freePlanId && proPlanId && freePlanId !== proPlanId);
  return { freePlanId, proPlanId, configured };
}

/** Sanitized readiness: configured yes/no only — never the ID values. */
export function ghlMarketplacePlanConfigReadiness(
  config: GhlMarketplacePlanConfig = ghlMarketplacePlanConfigFromEnv(),
): {
  freePlanIdConfigured: boolean;
  proPlanIdConfigured: boolean;
  planIdsConfigured: boolean;
} {
  return {
    freePlanIdConfigured: Boolean(config.freePlanId),
    proPlanIdConfigured: Boolean(config.proPlanId),
    planIdsConfigured: config.configured,
  };
}

export function classifyGhlMarketplacePlanId(
  planId: string | null | undefined,
  config: GhlMarketplacePlanConfig,
): GhlMarketplacePlanKind {
  const id = trimId(planId);
  if (!id || !config.configured) return "unknown";
  if (id === config.proPlanId) return "pro";
  if (id === config.freePlanId) return "free";
  return "unknown";
}
