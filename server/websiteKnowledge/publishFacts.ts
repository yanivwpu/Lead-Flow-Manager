/**
 * Publishing: the single moment where a scan is allowed to change live AI behaviour.
 *
 * One transaction promotes approved drafts, retires what they replace, rewrites the legacy
 * prose summary from the new facts, and flips the workspace onto V2. If any step throws,
 * nothing changes — a workspace is never left half-published.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { aiBusinessKnowledge, businessKnowledgeFacts } from "@shared/schema";
import {
  buildFactNarrativeSummary,
  detectFactConflicts,
  factPrecedence,
  type FactConflict,
  type KnowledgeFact,
} from "@shared/businessKnowledgeFacts";
import { invalidateWorkspaceIntelligenceCache } from "../workspaceIntelligenceCache";
import { invalidatePublishedFactsCache } from "./factContext";
import { listFacts, rowToKnowledgeFact } from "./factStore";

export type PublishResult = {
  published: number;
  updated: number;
  retired: number;
  supersededByPrecedence: number;
  /** Keys held back because equal-precedence sources disagree. */
  blockedConflicts: Array<{ factKey: string; reason: string }>;
  skippedSuggestions: number;
  summaryChars: number;
};

/**
 * Equal-precedence disagreements block publication for that key only. Everything else in
 * the batch still publishes, so one contested price cannot hold up the whole review.
 */
export function partitionConflicts(facts: KnowledgeFact[]): {
  blockedKeys: Set<string>;
  precedenceConflicts: FactConflict[];
} {
  const blockedKeys = new Set<string>();
  const precedenceConflicts: FactConflict[] = [];
  for (const conflict of detectFactConflicts(facts)) {
    if (conflict.resolution === "blocked") blockedKeys.add(conflict.factKey);
    else precedenceConflicts.push(conflict);
  }
  return { blockedKeys, precedenceConflicts };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Regenerate the V1 prose summary from whatever is published right now.
 *
 * Every path that changes the published set calls this inside its own transaction, which
 * is what keeps `websiteKnowledgeSummary` from advertising a fact that no longer exists.
 * Returns the new summary length.
 */
async function rebuildLegacySummary(
  tx: Tx,
  userId: string,
  now: Date,
  opts: { enableV2: boolean },
): Promise<number> {
  const rows = await tx
    .select()
    .from(businessKnowledgeFacts)
    .where(
      and(eq(businessKnowledgeFacts.userId, userId), eq(businessKnowledgeFacts.state, "published")),
    );
  const publishedFacts = rows
    .map(rowToKnowledgeFact)
    .filter((f): f is KnowledgeFact => f !== null);
  const summary = buildFactNarrativeSummary(publishedFacts);

  const knowledgeRows = await tx
    .select({ id: aiBusinessKnowledge.id })
    .from(aiBusinessKnowledge)
    .where(eq(aiBusinessKnowledge.userId, userId));

  const patch = {
    ...(opts.enableV2 ? { knowledgeV2Enabled: true } : {}),
    websiteKnowledgeUpdatedAt: now,
    updatedAt: now,
    // Never blank an existing summary: an empty fact set keeps the V1 text as fallback.
    ...(summary ? { websiteKnowledgeSummary: summary } : {}),
  };

  if (knowledgeRows[0]) {
    await tx.update(aiBusinessKnowledge).set(patch).where(eq(aiBusinessKnowledge.userId, userId));
  } else {
    await tx.insert(aiBusinessKnowledge).values({ userId, ...patch });
  }
  return summary.length;
}

export async function publishKnowledgeFacts(
  userId: string,
  now = new Date(),
): Promise<PublishResult> {
  const result: PublishResult = {
    published: 0,
    updated: 0,
    retired: 0,
    supersededByPrecedence: 0,
    blockedConflicts: [],
    skippedSuggestions: 0,
    summaryChars: 0,
  };

  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(businessKnowledgeFacts)
      .where(
        and(
          eq(businessKnowledgeFacts.userId, userId),
          inArray(businessKnowledgeFacts.state, ["draft", "published"]),
        ),
      );
    const live = rows
      .map(rowToKnowledgeFact)
      .filter((f): f is KnowledgeFact => f !== null);

    const drafts = live.filter((f) => f.state === "draft");
    const publishedByKey = new Map(
      live.filter((f) => f.state === "published").map((f) => [f.factKey, f]),
    );

    const { blockedKeys } = partitionConflicts(live);
    for (const key of blockedKeys) {
      result.blockedConflicts.push({
        factKey: key,
        reason: "Two sources of equal priority disagree on this value.",
      });
    }

    for (const draft of drafts) {
      if (blockedKeys.has(draft.factKey)) continue;

      // A suggestion against a fact the user controls is never applied by publish.
      if (draft.proposedAction === "suggest") {
        result.skippedSuggestions += 1;
        continue;
      }

      const current = publishedByKey.get(draft.factKey);

      if (draft.proposedAction === "retire") {
        if (current) {
          await tx
            .update(businessKnowledgeFacts)
            .set({ state: "retired", retiredAt: now, updatedAt: now })
            .where(eq(businessKnowledgeFacts.id, current.id));
          result.retired += 1;
        }
        await tx.delete(businessKnowledgeFacts).where(eq(businessKnowledgeFacts.id, draft.id));
        continue;
      }

      if (current) {
        // Guard again at write time: a lower tier must never replace a higher one.
        if (factPrecedence(draft) < factPrecedence(current)) {
          result.skippedSuggestions += 1;
          continue;
        }
        await tx
          .update(businessKnowledgeFacts)
          .set({
            state: "retired",
            retiredAt: now,
            supersededByFactId: draft.id,
            conflictResolution: "precedence",
            updatedAt: now,
          })
          .where(eq(businessKnowledgeFacts.id, current.id));
        result.updated += 1;
        result.supersededByPrecedence += 1;
      } else {
        result.published += 1;
      }

      await tx
        .update(businessKnowledgeFacts)
        .set({
          state: "published",
          proposedAction: null,
          publishedAt: now,
          updatedAt: now,
        })
        .where(eq(businessKnowledgeFacts.id, draft.id));
    }

    result.summaryChars = await rebuildLegacySummary(tx, userId, now, { enableV2: true });
  });

  invalidateWorkspaceIntelligenceCache(userId);
  invalidatePublishedFactsCache(userId);
  return result;
}

export type FactRemovalOutcome = "not_found" | "draft_discarded" | "published_retired";

/**
 * Remove one fact from review.
 *
 * A draft is only a proposal, so it is discarded. A published fact is retired rather than
 * deleted — the row stays for provenance, disappears from retrieval, and the prose summary
 * is rebuilt in the same transaction. The id is matched together with the user id, so an id
 * belonging to another workspace resolves to nothing rather than to someone else's fact.
 */
export async function removeKnowledgeFact(
  userId: string,
  factId: string,
  now = new Date(),
): Promise<FactRemovalOutcome> {
  const outcome = await db.transaction<FactRemovalOutcome>(async (tx) => {
    const rows = await tx
      .select()
      .from(businessKnowledgeFacts)
      .where(
        and(eq(businessKnowledgeFacts.userId, userId), eq(businessKnowledgeFacts.id, factId)),
      );
    const row = rows[0];
    if (!row) return "not_found";

    if (row.state === "draft") {
      await tx
        .delete(businessKnowledgeFacts)
        .where(
          and(
            eq(businessKnowledgeFacts.userId, userId),
            eq(businessKnowledgeFacts.id, factId),
            eq(businessKnowledgeFacts.state, "draft"),
          ),
        );
      return "draft_discarded";
    }

    if (row.state !== "published") return "not_found";

    await tx
      .update(businessKnowledgeFacts)
      .set({ state: "retired", retiredAt: now, updatedAt: now })
      .where(
        and(
          eq(businessKnowledgeFacts.userId, userId),
          eq(businessKnowledgeFacts.id, factId),
          eq(businessKnowledgeFacts.state, "published"),
        ),
      );
    await rebuildLegacySummary(tx, userId, now, { enableV2: false });
    return "published_retired";
  });

  // Only after the commit, so a rolled-back removal cannot flush a cache that still matches.
  if (outcome === "published_retired") {
    invalidateWorkspaceIntelligenceCache(userId);
    invalidatePublishedFactsCache(userId);
  }
  return outcome;
}

export type SourceRemovalPreview = {
  sourceId: string;
  orphanedFacts: Array<{ id: string; factType: string; summary: string }>;
  retainedCount: number;
};

export async function previewSourceRemoval(
  userId: string,
  sourceId: string,
): Promise<SourceRemovalPreview> {
  const { analyzeSourceRemoval } = await import("./mergeFacts");
  const { formatFactValue } = await import("@shared/businessKnowledgeFacts");
  const facts = await listFacts(userId, { states: ["draft", "published"] });
  const impact = analyzeSourceRemoval(facts, sourceId);
  return {
    sourceId,
    orphanedFacts: impact.orphanedFacts.map((f) => ({
      id: f.id,
      factType: f.factType,
      summary: formatFactValue(f),
    })),
    retainedCount: impact.retainedFacts.length,
  };
}
