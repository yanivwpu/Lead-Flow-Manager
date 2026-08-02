/**
 * In-process cache for Workspace Intelligence snapshots.
 * Invalidated on Brain / Profile / AI settings / Growth Engine writes.
 */

import type { WorkspaceIntelligenceSnapshot } from "@shared/workspaceIntelligence";

type CacheEntry = {
  fingerprint: string;
  expiresAt: number;
  snapshot: WorkspaceIntelligenceSnapshot;
};

/** Soft TTL — fingerprint mismatch also forces rebuild. */
export const WORKSPACE_INTELLIGENCE_SOFT_TTL_MS = 10 * 60 * 1000;

const cache = new Map<string, CacheEntry>();

export function invalidateWorkspaceIntelligenceCache(userId: string): void {
  if (!userId) return;
  cache.delete(userId);
}

export function getCachedWorkspaceIntelligenceSnapshot(
  userId: string,
  fingerprint: string,
): WorkspaceIntelligenceSnapshot | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (entry.fingerprint !== fingerprint) {
    cache.delete(userId);
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(userId);
    return null;
  }
  return entry.snapshot;
}

export function setCachedWorkspaceIntelligenceSnapshot(
  userId: string,
  fingerprint: string,
  snapshot: WorkspaceIntelligenceSnapshot,
  ttlMs: number = WORKSPACE_INTELLIGENCE_SOFT_TTL_MS,
): void {
  cache.set(userId, {
    fingerprint,
    expiresAt: Date.now() + ttlMs,
    snapshot,
  });
}

/** Test helper — clears all entries. */
export function clearWorkspaceIntelligenceCacheForTests(): void {
  cache.clear();
}
