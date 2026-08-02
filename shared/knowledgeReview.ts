/**
 * The review payload shared by the knowledge API and the AI Brain review UI.
 *
 * Facts cross the wire as validated values plus a short excerpt — never raw page bodies.
 * Every derived label (priority, freshness, change type) is computed here once so the
 * client cannot invent its own interpretation of the rules.
 */

import {
  FACT_REVIEW_SECTIONS,
  FACT_TYPE_LABELS,
  describeFactPrecedence,
  detectFactConflicts,
  factFreshness,
  factPrecedence,
  formatFactValue,
  resolveStaleFactBehavior,
  summarizeKnowledgeFreshness,
  formatFactMoney,
  type FactDataMap,
  type FactProposedAction,
  type FactType,
  type FreshnessTier,
  type KnowledgeFact,
  type KnowledgeFreshnessPolicy,
  type KnowledgeFreshnessSummary,
  type StaleFactBehavior,
} from "./businessKnowledgeFacts";

export type FactChangeType = "unchanged" | "new" | "changed" | "removing" | "suggested";

/**
 * A fact split into the parts a reviewer scans for, for the types that read badly as one
 * line. Built from the same stored values as `summary`, with the same money formatter the
 * prompt uses — the review screen re-arranges a fact, it never re-words one.
 */
export type FactDisplay = {
  title: string;
  headline: string | null;
  bullets: string[];
};

function factDisplay(fact: KnowledgeFact): FactDisplay | null {
  if (fact.factType !== "pricing_plan") return null;
  const d = fact.data as FactDataMap["pricing_plan"];
  return {
    title: d.name,
    headline: formatFactMoney(d.price, d.priceQualifier),
    bullets: [...d.benefits],
  };
}

export type KnowledgeFactView = {
  id: string;
  factType: FactType;
  factTypeLabel: string;
  factKey: string;
  state: "draft" | "published" | "retired";
  changeType: FactChangeType;
  proposedAction: FactProposedAction | null;
  summary: string;
  /** Set for fact types worth laying out in parts; `summary` still carries the whole value. */
  display: FactDisplay | null;
  /** Currently published value this draft would replace. */
  previousSummary: string | null;
  origin: string;
  precedence: number;
  precedenceLabel: string;
  confidence: number;
  isPinned: boolean;
  userEdited: boolean;
  sourceUrl: string | null;
  sourceTitle: string | null;
  excerpt: string | null;
  provenanceUrls: string[];
  freshness: { verifiedAt: string; ageDays: number; tier: FreshnessTier };
  staleBehavior: StaleFactBehavior;
  /** Set when this fact lost a same-key disagreement to a higher-priority source. */
  supersededBy: { factId: string; summary: string } | null;
  conflictBlocked: boolean;
};

export type KnowledgeReviewSection = {
  id: string;
  title: string;
  facts: KnowledgeFactView[];
  counts: { total: number; new: number; changed: number; removing: number; suggested: number };
  freshness: KnowledgeFreshnessSummary;
};

export type KnowledgeConflictView = {
  factKey: string;
  factTypeLabel: string;
  resolution: "precedence" | "blocked";
  winner: { factId: string; summary: string; precedenceLabel: string; sourceUrl: string | null };
  losers: Array<{ factId: string; summary: string; precedenceLabel: string; sourceUrl: string | null }>;
};

export type KnowledgeReviewPayload = {
  sections: KnowledgeReviewSection[];
  conflicts: KnowledgeConflictView[];
  totals: {
    published: number;
    drafts: number;
    new: number;
    changed: number;
    removing: number;
    suggested: number;
    blockedConflicts: number;
  };
  freshness: KnowledgeFreshnessSummary;
  hasPendingChanges: boolean;
};

function changeTypeFor(fact: KnowledgeFact): FactChangeType {
  if (fact.state !== "draft") return "unchanged";
  switch (fact.proposedAction) {
    case "add":
      return "new";
    case "update":
      return "changed";
    case "retire":
      return "removing";
    case "suggest":
      return "suggested";
    default:
      return "new";
  }
}

export function toKnowledgeFactView(
  fact: KnowledgeFact,
  context: {
    publishedByKey: Map<string, KnowledgeFact>;
    factsById: Map<string, KnowledgeFact>;
    blockedKeys: Set<string>;
    now: Date;
    policy?: KnowledgeFreshnessPolicy;
  },
): KnowledgeFactView {
  const previous =
    fact.state === "draft" ? context.publishedByKey.get(fact.factKey) ?? null : null;
  const superseding = fact.supersededByFactId
    ? context.factsById.get(fact.supersededByFactId) ?? null
    : null;

  return {
    id: fact.id,
    factType: fact.factType,
    factTypeLabel: FACT_TYPE_LABELS[fact.factType],
    factKey: fact.factKey,
    state: fact.state,
    changeType: changeTypeFor(fact),
    proposedAction: fact.proposedAction,
    summary: formatFactValue(fact),
    display: factDisplay(fact),
    previousSummary: previous ? formatFactValue(previous) : null,
    origin: fact.origin,
    precedence: factPrecedence(fact),
    precedenceLabel: describeFactPrecedence(fact),
    confidence: fact.confidence,
    isPinned: fact.isPinned,
    userEdited: fact.userEdited,
    sourceUrl: fact.sourceUrl,
    sourceTitle: fact.sourceTitle,
    excerpt: fact.excerpt,
    provenanceUrls: (fact.provenance || [])
      .map((p) => p.url || "")
      .filter((u): u is string => Boolean(u)),
    freshness: (() => {
      const f = factFreshness(fact, context.now, context.policy);
      return { verifiedAt: f.verifiedAt, ageDays: f.ageDays, tier: f.tier };
    })(),
    staleBehavior: resolveStaleFactBehavior(fact.factType, context.policy),
    supersededBy: superseding
      ? { factId: superseding.id, summary: formatFactValue(superseding) }
      : null,
    conflictBlocked: context.blockedKeys.has(fact.factKey),
  };
}

/**
 * Groups live facts into the review sections, with drafts ordered above published values
 * so what changed is the first thing a reviewer sees.
 */
export function buildKnowledgeReviewPayload(params: {
  facts: KnowledgeFact[];
  now?: Date;
  policy?: KnowledgeFreshnessPolicy;
}): KnowledgeReviewPayload {
  const now = params.now ?? new Date();
  const live = params.facts.filter((f) => f.state !== "retired");
  const factsById = new Map(params.facts.map((f) => [f.id, f]));
  const publishedByKey = new Map(
    live.filter((f) => f.state === "published").map((f) => [f.factKey, f]),
  );

  const conflicts = detectFactConflicts(live);
  const blockedKeys = new Set(
    conflicts.filter((c) => c.resolution === "blocked").map((c) => c.factKey),
  );

  const context = { publishedByKey, factsById, blockedKeys, now, policy: params.policy };
  const views = live.map((fact) => toKnowledgeFactView(fact, context));

  const sections: KnowledgeReviewSection[] = [];
  const totals = {
    published: 0,
    drafts: 0,
    new: 0,
    changed: 0,
    removing: 0,
    suggested: 0,
    blockedConflicts: blockedKeys.size,
  };

  for (const section of FACT_REVIEW_SECTIONS) {
    const inSection = views.filter((v) => section.factTypes.includes(v.factType));
    if (inSection.length === 0) continue;

    inSection.sort((a, b) => {
      if (a.state !== b.state) return a.state === "draft" ? -1 : 1;
      if (b.precedence !== a.precedence) return b.precedence - a.precedence;
      return a.summary.localeCompare(b.summary);
    });

    const counts = {
      total: inSection.length,
      new: inSection.filter((v) => v.changeType === "new").length,
      changed: inSection.filter((v) => v.changeType === "changed").length,
      removing: inSection.filter((v) => v.changeType === "removing").length,
      suggested: inSection.filter((v) => v.changeType === "suggested").length,
    };

    sections.push({
      id: section.id,
      title: section.title,
      facts: inSection,
      counts,
      freshness: summarizeKnowledgeFreshness(
        live.filter((f) => section.factTypes.includes(f.factType)),
        now,
        params.policy,
      ),
    });
  }

  for (const view of views) {
    if (view.state === "published") totals.published += 1;
    if (view.state === "draft") totals.drafts += 1;
    if (view.changeType === "new") totals.new += 1;
    if (view.changeType === "changed") totals.changed += 1;
    if (view.changeType === "removing") totals.removing += 1;
    if (view.changeType === "suggested") totals.suggested += 1;
  }

  const conflictViews: KnowledgeConflictView[] = conflicts.map((c) => ({
    factKey: c.factKey,
    factTypeLabel: FACT_TYPE_LABELS[c.factType],
    resolution: c.resolution,
    winner: {
      factId: c.winner.id,
      summary: formatFactValue(c.winner),
      precedenceLabel: describeFactPrecedence(c.winner),
      sourceUrl: c.winner.sourceUrl,
    },
    losers: c.losers.map((l) => ({
      factId: l.id,
      summary: formatFactValue(l),
      precedenceLabel: describeFactPrecedence(l),
      sourceUrl: l.sourceUrl,
    })),
  }));

  return {
    sections,
    conflicts: conflictViews,
    totals,
    freshness: summarizeKnowledgeFreshness(live, now, params.policy),
    hasPendingChanges: totals.drafts > 0,
  };
}
