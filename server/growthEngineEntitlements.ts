import type { Workflow } from "@shared/schema";
import { subscriptionService, type UserLimits } from "./subscriptionService";

/** Template IDs that denote an installed Growth Engine (extensible for future engines). */
export const GROWTH_ENGINE_TEMPLATE_IDS = new Set<string>(["realtor-growth-engine"]);

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
 * This is the single source of truth for server-side Growth Engine gating.
 * Do not infer entitlement from `templateKey` alone (W1–W8 keys are not unique across products).
 */
export async function evaluateGrowthEngineAccess(userId: string): Promise<GrowthEngineAccessResult> {
  const limits = await subscriptionService.getUserLimits(userId);
  if (!limits) {
    return {
      ok: false,
      reason: "limits_unavailable",
      message: "Subscription state could not be loaded; Growth Engine actions are blocked.",
      limits: null,
      hasProTier: false,
      hasAIBrainAddon: false,
      workflowsEnabled: false,
    };
  }

  const hasProTier = limits.plan === "pro" || limits.plan === "scale";
  const hasAIBrainAddon = !!limits.hasAIBrainAddon;
  const workflowsEnabled = !!limits.workflowsEnabled;

  if (limits.growthEngineEntitlementOverrideEnabled) {
    if (limits.growthEngineEntitlementOverrideGrant) {
      return { ok: true, limits };
    }
    return {
      ok: false,
      reason: "admin_override_disabled",
      message: "Growth Engine is disabled by an administrator override for this account.",
      limits,
      hasProTier,
      hasAIBrainAddon,
      workflowsEnabled,
    };
  }

  if (!workflowsEnabled) {
    return {
      ok: false,
      reason: "automations_not_in_plan",
      message:
        "Automations are not enabled on your current plan. Upgrade to Pro with AI Brain to use Growth Engine.",
      limits,
      hasProTier,
      hasAIBrainAddon,
      workflowsEnabled,
    };
  }

  if (!hasProTier) {
    return {
      ok: false,
      reason: "pro_plan_required",
      message: "Growth Engine requires an active Pro (or Scale) subscription.",
      limits,
      hasProTier,
      hasAIBrainAddon,
      workflowsEnabled,
    };
  }

  if (!hasAIBrainAddon) {
    return {
      ok: false,
      reason: "ai_brain_required",
      message: "Growth Engine requires the AI Brain add-on on your account.",
      limits,
      hasProTier,
      hasAIBrainAddon,
      workflowsEnabled,
    };
  }

  return { ok: true, limits };
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
