/**
 * The factual-grounding contract every AI surface shares.
 *
 * One definition of how facts enter a prompt and what counts as a violation, so Auto Reply,
 * Suggest Reply, and Copilot cannot drift into three different notions of "grounded".
 *
 * The rule this encodes: answer with verified facts first, then qualify. Saying "let me
 * check" while a published price sits in the prompt is the failure this module exists to
 * catch.
 */

import {
  formatFactValue,
  type FactType,
  type KnowledgeFact,
} from "./businessKnowledgeFacts";
import type { RetrievedFact } from "./knowledgeRetrieval";

export const VERIFIED_FACTS_HEADER = "VERIFIED BUSINESS FACTS";

/**
 * Shared across every AI consumer. Ordered deliberately: the answer-first rule is stated
 * before the caution rules, because a model that reads "don't guess" first tends to hedge
 * even when it was handed the answer.
 */
export const RESPONSE_COMPOSITION_RULES = `ANSWER WITH VERIFIED FACTS FIRST, THEN QUALIFY.
1. If the ${VERIFIED_FACTS_HEADER} section answers the customer's question, lead with that answer in your first sentence. State the exact value — the price, the hours, the policy — before anything else.
2. Never say you will "check", "find out", "look into it", or that you "don't have that information" about something the facts section already answers.
3. Use the facts exactly as written. Do not round prices, merge plans, convert currencies, or restate a benefit under a different plan than the one it is listed with.
4. If the facts section does not cover the question, say plainly what you do not have and offer the closest thing you do have. Never invent a value or infer one from a similar plan.
5. A fact marked "last verified" more than its freshness window ago must be given with a short qualifier such as "as of our last update" — state it, then qualify it.
6. If the facts section flags conflicting values, do not pick one. Say the detail needs confirming and offer to check.
7. Only after answering may you ask a qualifying question, and only one.`;

export type GroundedPromptBlock = {
  /** Prompt text, empty when there is nothing published to ground on. */
  text: string;
  factCount: number;
  staleFactCount: number;
  /** Fact types present, so a caller can tell what the answer is allowed to cover. */
  coveredTypes: FactType[];
};

function freshnessNote(entry: RetrievedFact): string {
  const { tier, ageDays } = entry.freshness;
  const age = ageDays === 0 ? "today" : ageDays === 1 ? "1 day ago" : `${ageDays} days ago`;
  if (tier === "stale") return ` [last verified ${age} — OUT OF DATE, qualify it]`;
  if (tier === "aging") return ` [last verified ${age}]`;
  return "";
}

/**
 * Renders retrieved facts as prompt text. Values only — never the page body the fact came
 * from, so a customer-facing prompt cannot leak unrelated site content.
 */
export function buildGroundedPromptBlock(
  retrieved: RetrievedFact[],
  options?: { conflictingKeys?: string[] },
): GroundedPromptBlock {
  if (retrieved.length === 0) {
    return { text: "", factCount: 0, staleFactCount: 0, coveredTypes: [] };
  }

  const conflicting = new Set(options?.conflictingKeys ?? []);
  const lines: string[] = [];
  const coveredTypes = new Set<FactType>();
  let staleFactCount = 0;

  for (const entry of retrieved) {
    coveredTypes.add(entry.fact.factType);
    if (entry.freshness.tier === "stale") staleFactCount += 1;
    const conflictNote = conflicting.has(entry.fact.factKey)
      ? " [CONFLICTING SOURCES — do not state a value, offer to confirm]"
      : "";
    lines.push(`- ${formatFactValue(entry.fact)}${freshnessNote(entry)}${conflictNote}`);
  }

  const text = `${VERIFIED_FACTS_HEADER} (published and verified — treat as true):
${lines.join("\n")}

${RESPONSE_COMPOSITION_RULES}`;

  return {
    text,
    factCount: retrieved.length,
    staleFactCount,
    coveredTypes: [...coveredTypes],
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type GroundingViolation =
  | { kind: "denies_available_fact"; detail: string }
  | { kind: "unsupported_amount"; detail: string }
  | { kind: "unqualified_stale_fact"; detail: string };

export type GroundingCheck = {
  ok: boolean;
  violations: GroundingViolation[];
};

const DEFLECTION_RE =
  /\b(?:i(?:'m| am)?\s*(?:not\s+sure|unsure)|i\s*(?:don'?t|do not)\s+have|we\s*(?:don'?t|do not)\s+have|no\s+(?:information|details|pricing)\s+(?:on|about)|let\s+me\s+(?:check|find\s+out|look)|i(?:'ll| will)\s+(?:check|find\s+out|look\s+into|get\s+back)|need\s+to\s+(?:check|confirm)\s+(?:on\s+)?that|i\s+can'?t\s+say)\b/i;

const CURRENCY_CODES = "USD|EUR|GBP|ILS|JPY|INR|CAD|AUD|NZD|CHF|BRL|MXN|ZAR|AED|SAR|TRY|SGD|HKD|KRW|CNY";
/** Matches `$29`, `29 USD`, and `USD 29` — the fact renderer emits the last form. */
const AMOUNT_RE = new RegExp(
  `(?:US\\$|R\\$|C\\$|A\\$|[$€£₪¥₹₩₺])\\s*\\d[\\d.,]*|\\b(?:${CURRENCY_CODES})\\s*\\d[\\d.,]*|\\b\\d[\\d.,]*\\s*(?:${CURRENCY_CODES})\\b`,
  "gi",
);

const QUALIFIER_RE =
  /\b(?:as of (?:our|my) last|last (?:updated|verified|checked)|at the time of writing|may have changed|worth (?:double[- ]?)?checking|please confirm|subject to change|i'?d recommend confirming)\b/i;

function normalizeAmount(raw: string): string {
  return raw.replace(/[^\d.,]/g, "").replace(/,(?=\d{3}\b)/g, "");
}

/**
 * Checks a draft reply against the facts it was given.
 *
 * Deliberately narrow: it flags only what can be decided mechanically — deflecting on a
 * question the facts answered, quoting an amount no fact contains, and stating a stale
 * fact with no qualifier. Anything softer belongs to the prompt, not to a gate that can
 * block an auto-send.
 */
export function validateGroundedClaims(params: {
  draft: string;
  retrieved: RetrievedFact[];
  /** Sub-intents for the turn, used to decide whether a deflection is warranted. */
  subIntents?: string[];
}): GroundingCheck {
  const draft = (params.draft || "").trim();
  const violations: GroundingViolation[] = [];
  if (!draft || params.retrieved.length === 0) return { ok: true, violations };

  if (DEFLECTION_RE.test(draft)) {
    violations.push({
      kind: "denies_available_fact",
      detail: "The reply defers or denies knowledge while published facts answer the question.",
    });
  }

  const supported = new Set<string>();
  for (const entry of params.retrieved) {
    for (const match of formatFactValue(entry.fact).matchAll(AMOUNT_RE)) {
      supported.add(normalizeAmount(match[0]));
    }
  }
  for (const match of draft.matchAll(AMOUNT_RE)) {
    const amount = normalizeAmount(match[0]);
    if (!supported.has(amount)) {
      violations.push({
        kind: "unsupported_amount",
        detail: `The reply states ${match[0].trim()}, which no published fact supports.`,
      });
    }
  }

  const staleUsed = params.retrieved.filter((entry) => {
    if (entry.freshness.tier !== "stale") return false;
    const tokens = formatFactValue(entry.fact)
      .toLowerCase()
      .split(/[^a-z0-9$]+/)
      .filter((t) => t.length > 3);
    if (tokens.length === 0) return false;
    const lower = draft.toLowerCase();
    const hits = tokens.filter((t) => lower.includes(t)).length;
    return hits / tokens.length >= 0.5;
  });
  if (staleUsed.length > 0 && !QUALIFIER_RE.test(draft)) {
    violations.push({
      kind: "unqualified_stale_fact",
      detail: "The reply states a fact that has not been verified recently without qualifying it.",
    });
  }

  return { ok: violations.length === 0, violations };
}

/** Compact provenance for logs and the Copilot "why" panel. No page bodies. */
export function describeGroundingSources(retrieved: RetrievedFact[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of retrieved) {
    const url = entry.fact.sourceUrl;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export function factsAreEmpty(facts: KnowledgeFact[]): boolean {
  return facts.every((f) => f.state !== "published");
}
