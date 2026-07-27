/**
 * RGE no-reply workflow stage rules (W4–W6).
 * Installed workflows store conditions under `triggerConditions.rgeConditions`.
 */

export const RGE_TEMPLATE_ID = "realtor-growth-engine";

/** Canonical Meta-safe delays (hours after last customer inbound). */
export const RGE_W4_DELAY_HOURS = 20;
export const RGE_W5_DELAY_HOURS = 72;
export const RGE_W6_DELAY_HOURS = 168;

/** Prior seed default for W4 — used by repair to detect uncustomized installs. */
export const RGE_W4_LEGACY_DELAY_HOURS = 24;

export const RGE_NO_REPLY_ANCHOR = "last_inbound" as const;

/** Product-facing W4 name (internal templateKey remains W4). */
export const RGE_W4_WORKFLOW_NAME = "Re-engagement Follow-Up";
export const RGE_W5_WORKFLOW_NAME = "Quiet Lead Nurture";
export const RGE_W6_WORKFLOW_NAME = "Week Nurture Follow-Up";
export const RGE_W4_LEGACY_WORKFLOW_NAMES = [
  "No Response Follow-Up (24h)",
  "Re-engagement Follow-Up",
] as const;
export const RGE_W5_LEGACY_WORKFLOW_NAMES = [
  "No Response Follow-Up (3d)",
  "Quiet Lead Nurture",
] as const;
export const RGE_W6_LEGACY_WORKFLOW_NAMES = [
  "No Response Follow-Up (7d) + Nurture",
  "Week Nurture Follow-Up",
] as const;

/** User-facing CRM message template titles (keys stay followup_24h / followup_3d / followup_7d). */
export const RGE_MSG_FOLLOWUP_24H_TITLE = "Next-Day Re-engagement";
export const RGE_MSG_FOLLOWUP_3D_TITLE = "Quiet Lead Nurture";
export const RGE_MSG_FOLLOWUP_7D_TITLE = "Week Nurture Follow-Up";

/** Pipeline stages where W4 re-engagement follow-up must not run. */
export const RGE_W4_EXCLUDED_PIPELINE_STAGES = [
  "Closed",
  "Unqualified",
  "Lost",
  "DNC / Do Not Contact",
  "Do Not Contact",
] as const;

export type RgeNoReplyStageRule = {
  type?: string;
  stages?: string[];
};

export function rgeW4NoReplyConditions(): RgeNoReplyStageRule[] {
  return [
    {
      type: "stage_not_in",
      stages: [...RGE_W4_EXCLUDED_PIPELINE_STAGES],
    },
  ];
}

export function noReplyStageConditionsAllow(
  rgeConditions: RgeNoReplyStageRule[] | undefined,
  contact: { pipelineStage?: string | null },
): boolean {
  const rules = rgeConditions;
  if (!rules?.length) return true;
  const stage = (contact.pipelineStage || "").trim();
  for (const rule of rules) {
    const t = (rule.type || "").trim();
    const stages = Array.isArray(rule.stages) ? rule.stages.map((s) => String(s).trim()) : [];
    if (t === "stage_in") {
      if (stages.length > 0 && !stages.includes(stage)) return false;
    } else if (t === "stage_not_in") {
      if (stages.length > 0 && stages.includes(stage)) return false;
    }
  }
  return true;
}
