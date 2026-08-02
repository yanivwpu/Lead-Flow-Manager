import { randomUUID } from "crypto";
import type { WebsiteKnowledgeSourceEntry } from "@shared/websiteKnowledgeSources";

/** Short-lived server-side binding between a scan result and the authenticated user (V1). */
type Draft = {
  userId: string;
  /** Homepage result only; null means "keep whatever the workspace already has". */
  url: string | null;
  summary: string;
  sourceUrls: string[];
  sources: WebsiteKnowledgeSourceEntry[];
  /** [WK-DIAG] correlation id linking scan stages to the save stage. Temporary. */
  trace?: string;
  createdAt: number;
};

const drafts = new Map<string, Draft>();
const TTL_MS = 20 * 60 * 1000;
const MAX_ENTRIES = 2000;

function prune(): void {
  const now = Date.now();
  if (drafts.size <= MAX_ENTRIES) {
    for (const [id, d] of drafts) {
      if (now - d.createdAt > TTL_MS) drafts.delete(id);
    }
    return;
  }
  const sorted = [...drafts.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  const drop = sorted.length - Math.floor(MAX_ENTRIES * 0.85);
  for (let i = 0; i < drop; i++) drafts.delete(sorted[i][0]);
}

export function putWebsiteKnowledgeDraft(d: Omit<Draft, "createdAt">): string {
  prune();
  const id = randomUUID();
  drafts.set(id, { ...d, createdAt: Date.now() });
  return id;
}

export function takeWebsiteKnowledgeDraft(
  scanId: string,
  userId: string,
): Omit<Draft, "userId" | "createdAt"> | null {
  prune();
  const d = drafts.get(scanId);
  if (!d) return null;
  if (Date.now() - d.createdAt > TTL_MS) {
    drafts.delete(scanId);
    return null;
  }
  if (d.userId !== userId) return null;
  drafts.delete(scanId);
  return {
    url: d.url,
    summary: d.summary,
    sourceUrls: d.sourceUrls,
    sources: d.sources,
    trace: d.trace,
  };
}
