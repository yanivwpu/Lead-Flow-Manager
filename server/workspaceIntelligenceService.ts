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
import { isRgeInstalledForUser } from "./buyerPreferenceService";
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
  const [knowledge, settings, growthEngines] = await Promise.all([
    storage.getAiBusinessKnowledge(userId),
    storage.getAiSettings(userId),
    resolveGrowthEngines(userId),
  ]);

  return assembleWorkspaceIntelligence({
    knowledge: knowledge ?? null,
    settings: settings ?? null,
    growthEngines,
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
