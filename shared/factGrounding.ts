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
  formatFactMoney,
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
  | { kind: "unqualified_stale_fact"; detail: string }
  | { kind: "incomplete_required_fact"; detail: string }
  | { kind: "grounding_fallback_requires_review"; detail: string };

export type GroundingCheck = {
  ok: boolean;
  violations: GroundingViolation[];
};

/** Bundle handed from retrieval into prompt build + post-draft gates. */
export type GroundedResponsePackage = {
  retrieved: RetrievedFact[];
  block: GroundedPromptBlock;
  conflictingKeys: string[];
};

/**
 * Appended only on a single regeneration after an incomplete draft. Kept separate from
 * RESPONSE_COMPOSITION_RULES so the primary prompt wording stays unchanged.
 */
export const FACT_COMPLETENESS_RETRY_INSTRUCTION = `FACT-ONLY RETRY — your previous draft omitted published facts that answer this turn.
- State every required verified value from ${VERIFIED_FACTS_HEADER} in the first sentence(s).
- For a pricing question: include the exact published price (currency, amount, period).
- For an inclusions/benefits question: include the published benefits for the matching plan or product.
- For a listing/join question: name the matching plan and answer directly.
- If a published call-to-action, application form, or booking link is listed, end with that next step (label + URL or form location). Never invent a URL.
- Do not replace the answer with a bare qualification question when a next step exists.
- Do not use vague substitutes ("competitively priced", "various options", "contact us for details").
- Answer first. Next step second.`;

const DEFLECTION_RE =
  /\b(?:i(?:'m| am)?\s*(?:not\s+sure|unsure)|i\s*(?:don'?t|do not)\s+have|we\s*(?:don'?t|do not)\s+have|no\s+(?:information|details|pricing)\s+(?:on|about)|let\s+me\s+(?:check|find\s+out|look)|i(?:'ll| will)\s+(?:check|find\s+out|look\s+into|get\s+back)|need\s+to\s+(?:check|confirm)\s+(?:on\s+)?that|i\s+can'?t\s+say)\b/i;

const GENERIC_PRICING_HEDGE_RE =
  /\b(?:competitively\s+priced|various\s+(?:needs|budgets|options|packages|plans)|suit\s+various|pricing\s+(?:varies|depends)|contact\s+us\s+for\s+(?:details|pricing|more)|reach\s+out\s+for\s+(?:details|pricing)|depends\s+on\s+(?:your|the)\s+(?:needs|budget|package))\b/i;

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

function normalizePhrase(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

type PricedFact = {
  entry: RetrievedFact;
  amounts: string[];
  name?: string;
  benefits: string[];
};

/** Structured facts that can supply an exact price/name/benefits answer. */
function extractAnswerableFacts(
  retrieved: RetrievedFact[],
  conflictingKeys?: string[],
): PricedFact[] {
  const blocked = new Set(conflictingKeys ?? []);
  const out: PricedFact[] = [];
  for (const entry of retrieved) {
    if (blocked.has(entry.fact.factKey)) continue;
    const { fact } = entry;
    if (fact.factType === "pricing_plan") {
      const d = fact.data as {
        name: string;
        price: { amount: number; currency: string; billingPeriod: string };
        benefits?: string[];
      };
      const rendered = formatFactValue(fact);
      out.push({
        entry,
        name: d.name,
        amounts: [...rendered.matchAll(AMOUNT_RE)].map((m) => normalizeAmount(m[0])),
        benefits: Array.isArray(d.benefits) ? d.benefits.filter(Boolean) : [],
      });
      continue;
    }
    if (fact.factType === "product" || fact.factType === "service") {
      const d = fact.data as { name: string; price?: { amount: number } | null };
      const rendered = formatFactValue(fact);
      const amounts = [...rendered.matchAll(AMOUNT_RE)].map((m) => normalizeAmount(m[0]));
      if (amounts.length === 0 && !d.price) continue;
      out.push({ entry, name: d.name, amounts, benefits: [] });
      continue;
    }
    if (fact.factType === "benefit") {
      const d = fact.data as { statement: string; appliesTo?: string | null };
      out.push({
        entry,
        name: d.appliesTo ?? undefined,
        amounts: [],
        benefits: d.statement ? [d.statement] : [],
      });
      continue;
    }
    if (fact.factType === "numeric_limit" || fact.factType === "feature") {
      const rendered = formatFactValue(fact);
      const amounts = [...rendered.matchAll(AMOUNT_RE)].map((m) => normalizeAmount(m[0]));
      if (amounts.length === 0) continue;
      out.push({ entry, amounts, benefits: [] });
    }
  }
  return out;
}

function draftContainsAmount(draft: string, amounts: string[]): boolean {
  if (amounts.length === 0) return false;
  const present = new Set<string>();
  for (const match of draft.matchAll(AMOUNT_RE)) {
    present.add(normalizeAmount(match[0]));
  }
  return amounts.some((a) => present.has(a));
}

function draftContainsBenefit(draft: string, benefits: string[]): boolean {
  const lower = normalizePhrase(draft);
  return benefits.some((b) => {
    const phrase = normalizePhrase(b);
    if (phrase.length < 4) return false;
    return lower.includes(phrase);
  });
}

function draftMentionsNextAction(draft: string, actions: RetrievedFact[]): boolean {
  const lower = normalizePhrase(draft);
  const raw = draft.toLowerCase();
  for (const entry of actions) {
    if (entry.fact.factType === "call_to_action") {
      const d = entry.fact.data as {
        label: string;
        url?: string | null;
        locationHint?: string | null;
        responseTiming?: string | null;
      };
      if (d.label && lower.includes(normalizePhrase(d.label))) return true;
      if (d.locationHint && lower.includes(normalizePhrase(d.locationHint))) return true;
      if (d.url && raw.includes(d.url.toLowerCase())) return true;
      if (/\b(?:application form|apply(?:\s+for|\s+here)?|advertising page)\b/i.test(draft) && d.url) {
        try {
          const host = new URL(d.url).hostname.replace(/^www\./, "");
          if (host && raw.includes(host)) return true;
        } catch {
          /* ignore */
        }
      }
    }
    if (entry.fact.factType === "booking_link") {
      const d = entry.fact.data as { url: string; label?: string | null };
      if (d.url && raw.includes(d.url.toLowerCase())) return true;
      if (d.label && lower.includes(normalizePhrase(d.label))) return true;
    }
  }
  return false;
}

/** Renders a retrieved CTA/booking as a closing next-step sentence. Never invents a URL. */
export function formatNextActionSentence(entry: RetrievedFact): string | null {
  if (entry.fact.factType === "call_to_action") {
    const d = entry.fact.data as {
      label: string;
      url?: string | null;
      locationHint?: string | null;
      responseTiming?: string | null;
    };
    let sentence: string;
    if (d.locationHint && d.url) {
      sentence = `${d.locationHint.replace(/\.$/, "")}: ${d.url}`;
    } else if (d.url) {
      sentence = `${d.label}: ${d.url}`;
    } else {
      sentence = d.label;
    }
    if (d.responseTiming) {
      const timing = d.responseTiming.trim().replace(/\.$/, "");
      sentence += /confirm availability/i.test(timing)
        ? `. ${timing}.`
        : `. We'll confirm availability — ${timing}.`;
    } else {
      sentence += ".";
    }
    return sentence;
  }
  if (entry.fact.factType === "booking_link") {
    const d = entry.fact.data as { url: string; label?: string | null };
    return d.label ? `${d.label}: ${d.url}.` : `Book here: ${d.url}.`;
  }
  return null;
}

/**
 * Checks a draft reply against the facts it was given.
 *
 * Flags mechanically decidable contradictions: deflecting on a question the facts answered,
 * quoting an amount no fact contains, and stating a stale fact with no qualifier.
 * Completeness (must include the retrieved price/benefits) is a separate gate.
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

/**
 * Requires the draft to actually use retrieved facts that answer the turn.
 *
 * Separate from unsupported-amount checks: a vague "competitively priced" reply states no
 * wrong number, but still fails when a published price was retrieved.
 */
export function validateResponseCompleteness(params: {
  draft: string;
  retrieved: RetrievedFact[];
  subIntents?: string[];
  conflictingKeys?: string[];
}): GroundingCheck {
  const draft = (params.draft || "").trim();
  const violations: GroundingViolation[] = [];
  if (!draft) return { ok: true, violations };

  const intents = new Set(params.subIntents ?? []);
  const answerable = extractAnswerableFacts(params.retrieved, params.conflictingKeys);
  const priced = answerable.filter((a) => a.amounts.length > 0);
  const withBenefits = answerable.filter((a) => a.benefits.length > 0);
  const namedPlans = answerable.filter((a) => a.name);

  if (intents.has("pricing_question") && priced.length > 0) {
    const requiredAmounts = priced.flatMap((p) => p.amounts);
    if (!draftContainsAmount(draft, requiredAmounts)) {
      violations.push({
        kind: "incomplete_required_fact",
        detail: GENERIC_PRICING_HEDGE_RE.test(draft)
          ? "The reply used a generic pricing hedge instead of the published price."
          : "A pricing question was asked and published prices were retrieved, but the reply omitted them.",
      });
    }
  }

  if (intents.has("benefits_question") && withBenefits.length > 0) {
    const benefits = withBenefits.flatMap((b) => b.benefits);
    if (!draftContainsBenefit(draft, benefits)) {
      violations.push({
        kind: "incomplete_required_fact",
        detail: "An inclusions/benefits question was asked and published benefits were retrieved, but the reply omitted them.",
      });
    }
  }

  if (intents.has("listing_join_question") && namedPlans.length > 0) {
    const lower = normalizePhrase(draft);
    const named = namedPlans.some((p) => p.name && lower.includes(normalizePhrase(p.name)));
    const answered =
      named &&
      (priced.length === 0 || draftContainsAmount(draft, priced.flatMap((p) => p.amounts)));
    if (!answered) {
      violations.push({
        kind: "incomplete_required_fact",
        detail: "A listing/join question matched a published plan, but the reply did not name it and answer directly.",
      });
    }
  }

  const nextActions = params.retrieved.filter(
    (e) =>
      !(params.conflictingKeys ?? []).includes(e.fact.factKey) &&
      (e.fact.factType === "call_to_action" || e.fact.factType === "booking_link"),
  );
  if (
    nextActions.length > 0 &&
    (intents.has("listing_join_question") ||
      intents.has("booking_question") ||
      intents.has("pricing_question") ||
      intents.has("benefits_question"))
  ) {
    if (!draftMentionsNextAction(draft, nextActions)) {
      violations.push({
        kind: "incomplete_required_fact",
        detail: "A published next step (application CTA, form, or booking link) was retrieved, but the reply omitted it.",
      });
    }
  }

  // Deduplicate identical incomplete details from hedge + missing price.
  const seen = new Set<string>();
  const unique = violations.filter((v) => {
    const key = `${v.kind}:${v.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { ok: unique.length === 0, violations: unique };
}

export function mergeGroundingChecks(...checks: GroundingCheck[]): GroundingCheck {
  const violations = checks.flatMap((c) => c.violations);
  return { ok: violations.length === 0, violations };
}

/**
 * Human-review draft built only from retrieved structured facts. Used when the model
 * omits required facts twice. Never invents values.
 */
export function assembleDeterministicGroundedDraft(params: {
  retrieved: RetrievedFact[];
  subIntents?: string[];
  conflictingKeys?: string[];
}): string {
  const intents = new Set(params.subIntents ?? []);
  const blocked = new Set(params.conflictingKeys ?? []);
  const conflicted = params.retrieved.filter((e) => blocked.has(e.fact.factKey));
  if (conflicted.length > 0 && extractAnswerableFacts(params.retrieved, params.conflictingKeys).length === 0) {
    return "I want to confirm the current details before quoting them — can I check and get back to you with the exact figures?";
  }

  const answerable = extractAnswerableFacts(params.retrieved, params.conflictingKeys);
  if (answerable.length === 0) {
    return "I do not have a verified figure for that on hand. Tell me which package or service you mean and I will confirm the published details.";
  }

  const prefer =
    intents.has("pricing_question") || intents.has("benefits_question") || intents.has("listing_join_question")
      ? answerable
      : answerable.slice(0, 1);

  const parts: string[] = [];
  for (const item of prefer.slice(0, 2)) {
    const stale = item.entry.freshness.tier === "stale" || item.entry.freshness.tier === "aging";
    const prefix = stale ? "As of our last update, " : "";
    if (item.entry.fact.factType === "pricing_plan") {
      const d = item.entry.fact.data as {
        name: string;
        price: { amount: number; currency: string; billingPeriod: string };
        priceQualifier?: string;
        benefits: string[];
        planUrl?: string | null;
      };
      const price = formatFactMoney(d.price, d.priceQualifier);
      let line = `${prefix}${d.name} is ${price}.`;
      if (
        (intents.has("benefits_question") || intents.has("pricing_question") || intents.has("listing_join_question")) &&
        d.benefits.length > 0
      ) {
        line += ` It includes: ${d.benefits.join("; ")}.`;
      }
      parts.push(line);
      continue;
    }
    parts.push(`${prefix}${formatFactValue(item.entry.fact)}.`);
  }

  const next = params.retrieved.find(
    (e) =>
      !(params.conflictingKeys ?? []).includes(e.fact.factKey) &&
      (e.fact.factType === "call_to_action" || e.fact.factType === "booking_link"),
  );
  if (next) {
    const sentence = formatNextActionSentence(next);
    if (sentence) parts.push(sentence);
  } else {
    const planWithUrl = prefer.find(
      (p) =>
        p.entry.fact.factType === "pricing_plan" &&
        typeof (p.entry.fact.data as { planUrl?: string | null }).planUrl === "string",
    );
    if (planWithUrl) {
      const url = (planWithUrl.entry.fact.data as { planUrl: string }).planUrl;
      parts.push(`Get started here: ${url}.`);
    }
  }

  return parts.join(" ").trim();
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
