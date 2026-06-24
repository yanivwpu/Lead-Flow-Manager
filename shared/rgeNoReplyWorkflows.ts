/**
 * RGE no-reply workflow stage rules (W4–W6).
 * Installed workflows store conditions under `triggerConditions.rgeConditions`.
 */

/** Pipeline stages where W4 24h follow-up must not run. */
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
