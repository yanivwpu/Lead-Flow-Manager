/**
 * Rollback switches for structured facts.
 *
 * Two independent levers, because they answer different questions:
 * - `AI_BRAIN_FACTS_DISABLED` turns the whole V2 surface off for the deployment.
 * - `ai_business_knowledge.knowledge_v2_enabled` turns fact consumption off for one
 *   workspace. Publishing sets it; clearing it reverts that workspace to the V1 prose
 *   summary on the next reply, with no data loss either way.
 *
 * Both are read at the point of use rather than cached at boot, so flipping the env var
 * and restarting is the whole rollback procedure.
 */

/** Global kill switch — the V2 surface disappears without a client redeploy. */
export function knowledgeFactsDisabled(): boolean {
  return String(process.env.AI_BRAIN_FACTS_DISABLED || "").toLowerCase() === "true";
}

/**
 * Whether published facts may inform this workspace's AI output. False for every
 * workspace that has never published, which is what keeps existing behaviour byte-identical.
 */
export function knowledgeFactsActiveForWorkspace(knowledgeRow: unknown): boolean {
  if (knowledgeFactsDisabled()) return false;
  return (knowledgeRow as { knowledgeV2Enabled?: unknown } | null | undefined)
    ?.knowledgeV2Enabled === true;
}
