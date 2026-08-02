/**
 * Picks the handful of published facts that belong in one reply's prompt.
 *
 * Two stages, in this order: relevance decides *which* facts are eligible, then the
 * priority hierarchy decides which of those survive the cap. Sorting by relevance alone
 * would let a stale AI-extracted price outrank the one the user corrected by hand.
 */

import {
  compareFactsForRetrieval,
  factFreshness,
  factPrecedence,
  formatFactValue,
  type FactType,
  type KnowledgeFact,
  type KnowledgeFreshnessPolicy,
  type FactFreshness,
} from "./businessKnowledgeFacts";

export const DEFAULT_FACT_LIMIT = 10;

/** Fact types that answer each sub-intent, most directly answering first. */
export const SUB_INTENT_FACT_TYPES: Record<string, FactType[]> = {
  pricing_question: ["pricing_plan", "product", "service", "numeric_limit", "eligibility_rule"],
  benefits_question: ["benefit", "feature", "pricing_plan", "service"],
  listing_join_question: ["pricing_plan", "service", "eligibility_rule", "call_to_action", "faq"],
  hours_question: ["business_hours", "location"],
  location_question: ["location", "service_area", "business_hours"],
  policy_question: ["policy", "eligibility_rule", "faq"],
  booking_question: ["booking_link", "business_hours", "contact_method", "call_to_action"],
};

/** Used when no sub-intent matched: what a business is and how to reach it. */
const GENERAL_FACT_TYPES: FactType[] = [
  "business_summary",
  "service",
  "product",
  "pricing_plan",
  "contact_method",
];

const STOP_WORDS = new Set([
  "the", "and", "for", "you", "your", "our", "can", "how", "what", "does", "with", "are", "any",
  "have", "get", "this", "that", "there", "here", "much", "many", "want", "need", "would", "will",
  "about", "into", "from", "they", "them", "their", "please", "just", "like", "some", "was", "were",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9$]+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t)),
  );
}

export type RetrievedFact = {
  fact: KnowledgeFact;
  freshness: FactFreshness;
  precedence: number;
  /** 0 = directly answers the question, 1 = related, 2 = general context. */
  relevanceRank: number;
  lexicalOverlap: number;
};

export type RetrieveFactsInput = {
  facts: KnowledgeFact[];
  message?: string;
  subIntents?: string[];
  limit?: number;
  now?: Date;
  policy?: KnowledgeFreshnessPolicy;
};

/**
 * Ranks published facts for a turn. Only published facts are eligible — a draft has not
 * been approved, so it must never reach a customer.
 */
export function retrieveFactsForTurn(input: RetrieveFactsInput): RetrievedFact[] {
  const now = input.now ?? new Date();
  const limit = input.limit ?? DEFAULT_FACT_LIMIT;
  const published = input.facts.filter((f) => f.state === "published");
  if (published.length === 0) return [];

  const subIntents = input.subIntents ?? [];
  const primary = new Set<FactType>();
  const secondary = new Set<FactType>();
  for (const intent of subIntents) {
    const types = SUB_INTENT_FACT_TYPES[intent];
    if (!types) continue;
    types.forEach((type, index) => (index === 0 ? primary : secondary).add(type));
  }
  if (primary.size === 0 && secondary.size === 0) {
    GENERAL_FACT_TYPES.forEach((t) => secondary.add(t));
  }

  const messageTokens = tokenize(input.message || "");

  const scored: RetrievedFact[] = published.map((fact) => {
    const factTokens = tokenize(`${formatFactValue(fact)} ${fact.factKey}`);
    let overlap = 0;
    for (const token of messageTokens) if (factTokens.has(token)) overlap += 1;

    let relevanceRank = 2;
    if (primary.has(fact.factType)) relevanceRank = 0;
    else if (secondary.has(fact.factType)) relevanceRank = 1;
    // A direct wording match pulls an otherwise unrelated fact type into scope.
    else if (overlap >= 2) relevanceRank = 1;

    return {
      fact,
      freshness: factFreshness(fact, now, input.policy),
      precedence: factPrecedence(fact),
      relevanceRank,
      lexicalOverlap: overlap,
    };
  });

  scored.sort((a, b) => {
    if (a.relevanceRank !== b.relevanceRank) return a.relevanceRank - b.relevanceRank;
    // Within one relevance band, the hierarchy decides — never wording similarity.
    const byPriority = compareFactsForRetrieval(a.fact, b.fact);
    if (byPriority !== 0) return byPriority;
    return b.lexicalOverlap - a.lexicalOverlap;
  });

  // A general-context fact only fills space the question did not need.
  const relevant = scored.filter((s) => s.relevanceRank < 2);
  if (relevant.length >= limit) return relevant.slice(0, limit);
  return [...relevant, ...scored.filter((s) => s.relevanceRank === 2)].slice(0, limit);
}

/** True when the question maps to fact types the workspace has nothing published for. */
export function hasCoverageGap(retrieved: RetrievedFact[], subIntents: string[]): boolean {
  if (subIntents.length === 0) return false;
  const wanted = new Set<FactType>();
  for (const intent of subIntents) {
    for (const type of SUB_INTENT_FACT_TYPES[intent] ?? []) wanted.add(type);
  }
  if (wanted.size === 0) return false;
  return !retrieved.some((r) => wanted.has(r.fact.factType));
}
