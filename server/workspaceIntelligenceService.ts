/**
 * Server load + cache for Workspace Intelligence Snapshot.
 * No LLM calls. Built from AI Brain, Business Profile columns, AI settings, Growth Engines.
 */

import {
  assembleWorkspaceIntelligence,
  toWorkspaceIntelligenceSnapshot,
  workspaceIntelligenceFingerprint,
  type WorkspaceIntelligence,
  type WorkspaceIntelligenceSnapshot,
} from "@shared/workspaceIntelligence";
import { parseKnowledgeFreshnessPolicy } from "@shared/businessKnowledgeFacts";
import { isRgeInstalledForUser } from "./buyerPreferenceService";
import { listPublishedFacts } from "./websiteKnowledge/factStore";
import {
  knowledgeFactsActiveForWorkspace,
  knowledgeFactsDisabled,
} from "./websiteKnowledge/knowledgeFlags";
import { storage } from "./storage";
import {
  getCachedWorkspaceIntelligenceSnapshot,
  invalidateWorkspaceIntelligenceCache,
  setCachedWorkspaceIntelligenceSnapshot,
} from "./workspaceIntelligenceCache";

export { invalidateWorkspaceIntelligenceCache };

const RGE_TEMPLATE_ID = "realtor-growth-engine";

export type LoadWorkspaceIntelligenceOptions = {
  /** Bypass soft TTL + fingerprint cache. */
  forceRefresh?: boolean;
};

async function resolveGrowthEngines(userId: string): Promise<{
  rgeInstalled: boolean;
  installedTemplateIds: string[];
}> {
  const rgeInstalled = await isRgeInstalledForUser(userId);
  const installedTemplateIds: string[] = [];
  if (rgeInstalled) installedTemplateIds.push(RGE_TEMPLATE_ID);
  return { rgeInstalled, installedTemplateIds };
}

/**
 * Full in-memory intelligence (includes websiteKnowledgeSummary for server reuse).
 * Not cached separately — prefer getWorkspaceIntelligenceSnapshot for API/Copilot.
 */
export async function loadWorkspaceIntelligence(
  userId: string,
): Promise<WorkspaceIntelligence> {
  // The kill switch is known without a query, so a disabled deployment does no fact I/O.
  const factsQuery = knowledgeFactsDisabled()
    ? Promise.resolve([])
    : listPublishedFacts(userId).catch((err) => {
        // A workspace with no facts table yet must still get its V1 intelligence.
        console.error(
          "[WorkspaceIntelligence] published facts unavailable",
          err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
        );
        return [];
      });

  const [knowledge, settings, growthEngines, publishedFacts] = await Promise.all([
    storage.getAiBusinessKnowledge(userId),
    storage.getAiSettings(userId),
    resolveGrowthEngines(userId),
    factsQuery,
  ]);

  return assembleWorkspaceIntelligence({
    knowledge: knowledge ?? null,
    settings: settings ?? null,
    growthEngines,
    // Clearing knowledge_v2_enabled reverts this workspace to its V1 intelligence on the
    // next build, without touching a row.
    publishedFacts: knowledgeFactsActiveForWorkspace(knowledge) ? publishedFacts : [],
    freshnessPolicy: parseKnowledgeFreshnessPolicy(knowledge?.knowledgeFreshnessPolicy),
  });
}

/**
 * Client-safe cached snapshot for Inbox / Copilot.
 * Cache key = userId; rebuild when fingerprint (timestamps + GE) changes or TTL expires.
 */
export async function getWorkspaceIntelligenceSnapshot(
  userId: string,
  opts?: LoadWorkspaceIntelligenceOptions,
): Promise<WorkspaceIntelligenceSnapshot> {
  const intel = await loadWorkspaceIntelligence(userId);
  const fingerprint = workspaceIntelligenceFingerprint(intel);

  if (!opts?.forceRefresh) {
    const hit = getCachedWorkspaceIntelligenceSnapshot(userId, fingerprint);
    if (hit) return hit;
  }

  const snapshot = toWorkspaceIntelligenceSnapshot(intel);
  setCachedWorkspaceIntelligenceSnapshot(userId, fingerprint, snapshot);
  return snapshot;
}
