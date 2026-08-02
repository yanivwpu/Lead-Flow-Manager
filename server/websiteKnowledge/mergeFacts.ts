/**
 * Deterministic merge between what a source used to say and what it says now.
 *
 * Pure functions over arrays: no database, no clock of its own, no LLM. Every rule that
 * decides whether a scan may change live knowledge lives here so it can be tested directly.
 *
 * Invariants:
 *  - A scan never mutates a published fact's value. It only proposes drafts.
 *  - A lower-precedence proposal can never overwrite a higher-precedence fact.
 *  - Nothing disappears silently: removals become retirement proposals, superseded values
 *    stay linked to their winner.
 */

import {
  factPrecedence,
  factValueSignature,
  type FactCandidate,
  type FactProposedAction,
  type FactProvenanceEntry,
  type KnowledgeFact,
} from "@shared/businessKnowledgeFacts";

export type MergeFactsInput = {
  /** The source that was just scanned. Null when merging manually entered facts. */
  sourceId: string | null;
  /** Every live (draft or published) fact for the workspace. */
  existingFacts: KnowledgeFact[];
  /** Validated candidates extracted from this source only. */
  candidates: FactCandidate[];
  /**
   * True when the page content hash was unchanged, so the source re-confirms its previous
   * facts without a model call and nothing can be proposed or retired.
   */
  contentUnchanged?: boolean;
  now: Date;
};

export type FactMergeOperation =
  /** Create or replace the draft proposal for this fact key. */
  | {
      kind: "upsert_draft";
      factKey: string;
      proposedAction: FactProposedAction;
      candidate: FactCandidate;
      /** Published fact this proposal targets, when there is one. */
      targetFactId: string | null;
      provenance: FactProvenanceEntry[];
    }
  /** Same value as before: bump verification time and record supporting sources. */
  | {
      kind: "touch_verified";
      factId: string;
      verifiedAt: string;
      provenance: FactProvenanceEntry[];
    }
  /** The value vanished from the page. Stays published until a human confirms. */
  | {
      kind: "propose_retire";
      factKey: string;
      factId: string;
      provenance: FactProvenanceEntry[];
    }
  /** A stale draft that no longer reflects the page. */
  | { kind: "discard_draft"; factId: string };

export type MergeFactsResult = {
  operations: FactMergeOperation[];
  stats: {
    added: number;
    changed: number;
    unchanged: number;
    retiring: number;
    suggestions: number;
  };
};

function provenanceEntry(candidate: FactCandidate, verifiedAt: string): FactProvenanceEntry {
  return {
    sourceId: candidate.sourceId,
    url: candidate.sourceUrl,
    title: candidate.sourceTitle,
    verifiedAt,
  };
}

/** Union by sourceId (or url when the source is manual), keeping the newest verification. */
export function mergeProvenance(
  existing: FactProvenanceEntry[],
  incoming: FactProvenanceEntry,
): FactProvenanceEntry[] {
  const key = (e: FactProvenanceEntry) => e.sourceId ?? `url:${(e.url || "").toLowerCase()}`;
  const out = [...existing];
  const idx = out.findIndex((e) => key(e) === key(incoming));
  if (idx === -1) {
    out.push(incoming);
    return out;
  }
  const prev = out[idx];
  const prevMs = prev.verifiedAt ? new Date(prev.verifiedAt).getTime() : 0;
  const nextMs = incoming.verifiedAt ? new Date(incoming.verifiedAt).getTime() : 0;
  out[idx] = {
    ...prev,
    url: incoming.url ?? prev.url,
    title: incoming.title ?? prev.title,
    verifiedAt: nextMs >= prevMs ? incoming.verifiedAt : prev.verifiedAt,
  };
  return out;
}

/** Precedence of a candidate, evaluated with the same rules as a stored fact. */
function candidatePrecedence(candidate: FactCandidate): number {
  return factPrecedence({
    origin: candidate.origin,
    isPinned: false,
    userEdited: candidate.origin === "user_edited" || candidate.origin === "user_entered",
  });
}

/**
 * A source only owns the facts it alone supports. A fact backed by several sources keeps
 * its remaining provenance when one of them stops mentioning it.
 */
function isSolelySupportedBy(fact: KnowledgeFact, sourceId: string | null): boolean {
  const supporters = new Set(
    (fact.provenance || []).map((p) => p.sourceId ?? `url:${(p.url || "").toLowerCase()}`),
  );
  if (fact.sourceId) supporters.add(fact.sourceId);
  const self = sourceId ?? "manual";
  return supporters.size <= 1 && (supporters.size === 0 || supporters.has(self));
}

export function mergeFactsForSource(input: MergeFactsInput): MergeFactsResult {
  const verifiedAt = input.now.toISOString();
  const operations: FactMergeOperation[] = [];
  const stats = { added: 0, changed: 0, unchanged: 0, retiring: 0, suggestions: 0 };

  const publishedByKey = new Map<string, KnowledgeFact>();
  const draftByKey = new Map<string, KnowledgeFact>();
  for (const fact of input.existingFacts) {
    if (fact.state === "published") publishedByKey.set(fact.factKey, fact);
    else if (fact.state === "draft") draftByKey.set(fact.factKey, fact);
  }

  // Rule 1: unchanged page content re-confirms its facts without proposing anything.
  if (input.contentUnchanged) {
    for (const fact of input.existingFacts) {
      if (fact.state !== "published") continue;
      if (!factBelongsToSource(fact, input.sourceId)) continue;
      operations.push({
        kind: "touch_verified",
        factId: fact.id,
        verifiedAt,
        provenance: mergeProvenance(fact.provenance || [], {
          sourceId: input.sourceId,
          url: fact.sourceUrl,
          title: fact.sourceTitle,
          verifiedAt,
        }),
      });
      stats.unchanged += 1;
    }
    return { operations, stats };
  }

  const seenKeys = new Set<string>();

  for (const candidate of input.candidates) {
    if (seenKeys.has(candidate.factKey)) continue;
    seenKeys.add(candidate.factKey);

    const published = publishedByKey.get(candidate.factKey);
    const existingDraft = draftByKey.get(candidate.factKey);
    const provenance = published?.provenance || existingDraft?.provenance || [];
    const nextProvenance = mergeProvenance(provenance, provenanceEntry(candidate, verifiedAt));

    // Rule 2: nothing published yet — a plain addition.
    if (!published) {
      operations.push({
        kind: "upsert_draft",
        factKey: candidate.factKey,
        proposedAction: "add",
        candidate,
        targetFactId: null,
        provenance: nextProvenance,
      });
      stats.added += 1;
      continue;
    }

    const sameValue =
      factValueSignature(published.factType, published.data) ===
      factValueSignature(candidate.factType, candidate.data);

    // Rule 3: same value from a (possibly different) source — one fact, shared provenance.
    if (sameValue) {
      operations.push({
        kind: "touch_verified",
        factId: published.id,
        verifiedAt,
        provenance: nextProvenance,
      });
      stats.unchanged += 1;
      if (existingDraft) operations.push({ kind: "discard_draft", factId: existingDraft.id });
      continue;
    }

    // Rule 4: precedence gate. A lower tier may propose, never overwrite.
    const publishedPrecedence = factPrecedence(published);
    const incomingPrecedence = candidatePrecedence(candidate);
    const action: FactProposedAction =
      incomingPrecedence < publishedPrecedence ? "suggest" : "update";

    operations.push({
      kind: "upsert_draft",
      factKey: candidate.factKey,
      proposedAction: action,
      candidate,
      targetFactId: published.id,
      provenance: nextProvenance,
    });
    if (action === "suggest") stats.suggestions += 1;
    else stats.changed += 1;
  }

  // Rule 5: values this source used to support but no longer mentions.
  for (const fact of input.existingFacts) {
    if (fact.state !== "published") continue;
    if (seenKeys.has(fact.factKey)) continue;
    if (!factBelongsToSource(fact, input.sourceId)) continue;

    // Facts the user controls are never proposed for retirement by a scan.
    if (fact.userEdited || fact.isPinned) continue;

    if (!isSolelySupportedBy(fact, input.sourceId)) {
      // Another source still vouches for it: drop only this source's provenance entry.
      const remaining = (fact.provenance || []).filter(
        (p) => (p.sourceId ?? null) !== (input.sourceId ?? null),
      );
      operations.push({
        kind: "touch_verified",
        factId: fact.id,
        verifiedAt: fact.lastVerifiedAt,
        provenance: remaining,
      });
      continue;
    }

    operations.push({
      kind: "propose_retire",
      factKey: fact.factKey,
      factId: fact.id,
      provenance: fact.provenance || [],
    });
    stats.retiring += 1;
  }

  // A stale draft from a previous scan of this source that the page no longer supports.
  for (const [key, draft] of draftByKey) {
    if (seenKeys.has(key)) continue;
    if (!factBelongsToSource(draft, input.sourceId)) continue;
    if (draft.proposedAction === "retire") continue;
    if (draft.userEdited || draft.isPinned) continue;
    operations.push({ kind: "discard_draft", factId: draft.id });
  }

  return { operations, stats };
}

function factBelongsToSource(fact: KnowledgeFact, sourceId: string | null): boolean {
  if (fact.sourceId && fact.sourceId === sourceId) return true;
  if (!fact.sourceId && sourceId === null) return true;
  return (fact.provenance || []).some((p) => (p.sourceId ?? null) === (sourceId ?? null));
}

// ---------------------------------------------------------------------------
// Source removal impact
// ---------------------------------------------------------------------------

export type SourceRemovalImpact = {
  /** Facts that would lose their only support. */
  orphanedFacts: KnowledgeFact[];
  /** Facts that survive on remaining provenance. */
  retainedFacts: KnowledgeFact[];
};

/**
 * What removing a source would cost, computed before anything is deleted so the user
 * confirms against a real list rather than a warning.
 */
export function analyzeSourceRemoval(
  facts: KnowledgeFact[],
  sourceId: string,
): SourceRemovalImpact {
  const orphanedFacts: KnowledgeFact[] = [];
  const retainedFacts: KnowledgeFact[] = [];
  for (const fact of facts) {
    if (fact.state === "retired") continue;
    if (!factBelongsToSource(fact, sourceId)) continue;
    // Manual and user-controlled facts never depend on a scanned source.
    if (fact.userEdited || fact.isPinned || !fact.sourceId) {
      retainedFacts.push(fact);
      continue;
    }
    if (isSolelySupportedBy(fact, sourceId)) orphanedFacts.push(fact);
    else retainedFacts.push(fact);
  }
  return { orphanedFacts, retainedFacts };
}
