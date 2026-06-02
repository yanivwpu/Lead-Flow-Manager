import type { User, Workflow } from "@shared/schema";
import { subscriptionService, type UserLimits } from "./subscriptionService";
import { storage } from "./storage";

/** Template IDs that denote an installed Growth Engine (extensible for future engines). */
export const GROWTH_ENGINE_TEMPLATE_IDS = new Set<string>(["realtor-growth-engine"]);

export const GROWTH_ENGINE_ACCESS_LOG = "[GrowthEngineAccess]";

export type GrowthEngineDenialReason =
  | "limits_unavailable"
  | "automations_not_in_plan"
  | "pro_plan_required"
  | "ai_brain_required"
  | "admin_override_disabled";

export type GrowthEngineAccessResult =
  | { ok: true; limits: UserLimits }
  | {
      ok: false;
      reason: GrowthEngineDenialReason;
      message: string;
      limits: UserLimits | null;
      hasProTier: boolean;
      hasAIBrainAddon: boolean;
      workflowsEnabled: boolean;
    };

export type GrowthEngineAccessLogPayload = {
  userId: string;
  result: "granted" | "denied";
  reason: GrowthEngineDenialReason | null;
  message: string | null;
  actualSubscription: {
    billingPlan: string | null;
    subscriptionPlan: string | null;
    subscriptionStatus: string | null;
  };
  overrides: {
    planOverrideEnabled: boolean;
    planOverride: string | null;
    aiBrainEntitlementOverrideEnabled: boolean;
    aiBrainEntitlementOverrideGrant: boolean;
    growthEngineEntitlementOverrideEnabled: boolean;
    growthEngineEntitlementOverrideGrant: boolean;
  };
  effective: {
    plan: string | null;
    hasAIBrainAddon: boolean;
    workflowsEnabled: boolean;
    growthEngineEligible: boolean;
  };
};

function buildAccessLogPayload(
  userId: string,
  user: User | undefined,
  limits: UserLimits | null,
  result: GrowthEngineAccessResult,
): GrowthEngineAccessLogPayload {
  const ok = result.ok;
  return {
    userId,
    result: ok ? "granted" : "denied",
    reason: ok ? null : result.reason,
    message: ok ? null : result.message,
    actualSubscription: {
      billingPlan: user?.billingPlan ?? null,
      subscriptionPlan: user?.subscriptionPlan ?? null,
      subscriptionStatus: user?.subscriptionStatus ?? null,
    },
    overrides: {
      planOverrideEnabled: !!user?.planOverrideEnabled,
      planOverride: user?.planOverrideEnabled ? user?.planOverride ?? null : null,
      aiBrainEntitlementOverrideEnabled: !!user?.aiBrainEntitlementOverrideEnabled,
      aiBrainEntitlementOverrideGrant: !!user?.aiBrainEntitlementOverrideGrant,
      growthEngineEntitlementOverrideEnabled: !!user?.growthEngineEntitlementOverrideEnabled,
      growthEngineEntitlementOverrideGrant: !!user?.growthEngineEntitlementOverrideGrant,
    },
    effective: {
      plan: limits?.plan ?? null,
      hasAIBrainAddon: limits?.hasAIBrainAddon ?? false,
      workflowsEnabled: limits?.workflowsEnabled ?? false,
      growthEngineEligible: limits?.growthEngineEligible ?? false,
    },
  };
}

export function logGrowthEngineAccessDecision(
  userId: string,
  user: User | undefined,
  result: GrowthEngineAccessResult,
): void {
  const limits = result.ok ? result.limits : result.limits;
  const payload = buildAccessLogPayload(userId, user, limits, result);
  if (result.ok) {
    console.info(GROWTH_ENGINE_ACCESS_LOG, JSON.stringify(payload));
  } else {
    console.warn(GROWTH_ENGINE_ACCESS_LOG, JSON.stringify(payload));
  }
}

/**
 * True when this workflow row was created from a Growth Engine template install.
 * Uses `templateId` on triggerConditions (authoritative). Falls back to the
 * install-time description prefix for legacy rows missing `templateId`.
 */
export function isGrowthEngineWorkflow(
  workflow: Pick<Workflow, "triggerConditions" | "description">
): boolean {
  const tc = workflow.triggerConditions as { templateId?: string } | undefined;
  if (tc?.templateId && GROWTH_ENGINE_TEMPLATE_IDS.has(tc.templateId)) {
    return true;
  }
  const desc = workflow.description || "";
  if (desc.startsWith("Realtor Growth Engine:")) {
    return true;
  }
  return false;
}

/**
 * Product rule: Growth Engine install, activation, and runtime all require
 * Pro (or Scale) + AI Brain + plan automations enabled.
 *
 * Admin overrides (plan / AI Brain / Growth Engine) are honored here.
 * This is the single source of truth for server-side Growth Engine gating.
 * Do not infer entitlement from `templateKey` alone (W1–W8 keys are not unique across products).
 */
export async function evaluateGrowthEngineAccess(userId: string): Promise<GrowthEngineAccessResult> {
  const user = await storage.getUserForSession(userId);
  const limits = await subscriptionService.getUserLimits(userId);
  if (!limits) {
    const result: GrowthEngineAccessResult = {
      ok: false,
      reason: "limits_unavailable",
      message: "Subscription state could not be loaded; Growth Engine actions are blocked.",
      limits: null,
      hasProTier: false,
      hasAIBrainAddon: false,
      workflowsEnabled: false,
    };
    logGrowthEngineAccessDecision(userId, user, result);
    return result;
  }

  const hasProTier = limits.plan === "pro" || limits.plan === "scale";
  const hasAIBrainAddon = !!limits.hasAIBrainAddon;
  const workflowsEnabled = !!limits.workflowsEnabled;

  if (limits.growthEngineEntitlementOverrideEnabled) {
    if (limits.growthEngineEntitlementOverrideGrant) {
      const result: GrowthEngineAccessResult = { ok: true, limits };
      logGrowthEngineAccessDecision(userId, user, result);
      return result;
    }
    const result: GrowthEngineAccessResult = {
      ok: false,
      reason: "admin_override_disabled",
      message: "Growth Engine is disabled by an administrator override for this account.",
      limits,
      hasProTier,
      hasAIBrainAddon,
      workflowsEnabled,
    };
    logGrowthEngineAccessDecision(userId, user, result);
    return result;
  }

  if (!workflowsEnabled) {
    const result: GrowthEngineAccessResult = {
      ok: false,
      reason: "automations_not_in_plan",
      message:
        "Automations are not enabled on your current plan. Upgrade to Pro with AI Brain to use Growth Engine.",
      limits,
      hasProTier,
      hasAIBrainAddon,
      workflowsEnabled,
    };
    logGrowthEngineAccessDecision(userId, user, result);
    return result;
  }

  if (!hasProTier) {
    const result: GrowthEngineAccessResult = {
      ok: false,
      reason: "pro_plan_required",
      message: "Growth Engine requires an active Pro (or Scale) subscription.",
      limits,
      hasProTier,
      hasAIBrainAddon,
      workflowsEnabled,
    };
    logGrowthEngineAccessDecision(userId, user, result);
    return result;
  }

  if (!hasAIBrainAddon) {
    const result: GrowthEngineAccessResult = {
      ok: false,
      reason: "ai_brain_required",
      message: "Growth Engine requires the AI Brain add-on on your account.",
      limits,
      hasProTier,
      hasAIBrainAddon,
      workflowsEnabled,
    };
    logGrowthEngineAccessDecision(userId, user, result);
    return result;
  }

  const result: GrowthEngineAccessResult = { ok: true, limits };
  logGrowthEngineAccessDecision(userId, user, result);
  return result;
}

/**
 * CRM / orchestration actions: execute whenever Growth Engine access passes.
 * (No per-action AI Brain check — product access already implies AI Brain is on.)
 */
export const GROWTH_ENGINE_RUNTIME_SAFE_ACTION_TYPES = new Set<string>([
  "apply_tag",
  "tag",
  "set_pipeline",
  "set_pipeline_stage",
  "assign",
  "set_status",
  "add_note",
  "set_followup",
]);

/**
 * When implemented, these should call AI Brain / model code paths and may need
 * extra checks or metering. Today many are no-ops in the executor — this set drives logging.
 */
export const AI_BRAIN_WORKFLOW_ACTION_TYPES = new Set<string>([
  "run_lead_scoring",
  "ai_generate",
  "ai_enrich",
  "ai_classify",
  "ai_summarize",
  "ai_reply",
  "detect_language",
  "conditional",
]);

export function isRuntimeSafeWorkflowActionType(actionType: string | undefined): boolean {
  if (!actionType) return false;
  return GROWTH_ENGINE_RUNTIME_SAFE_ACTION_TYPES.has(actionType);
}

export function isAiBrainWorkflowActionType(actionType: string | undefined): boolean {
  if (!actionType) return false;
  return AI_BRAIN_WORKFLOW_ACTION_TYPES.has(actionType);
}
