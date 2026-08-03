/**
 * Structured business facts — the fact model for AI Brain V2.
 *
 * Everything about a fact's shape, identity, priority, and freshness is defined here once.
 * Extraction, merge, publish, retrieval, prompt composition, and the review UI all import
 * from this module so those rules cannot drift apart.
 *
 * Pure functions only: no I/O, no dates read from anywhere but the caller's `now`.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Fact payload schemas
// ---------------------------------------------------------------------------

export const MAX_FACT_EXCERPT = 400;

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const BILLING_PERIODS = ["once", "day", "week", "month", "quarter", "year"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export const moneySchema = z.object({
  amount: z.number().finite().nonnegative(),
  /** ISO-4217, uppercased by the parser. */
  currency: z.string().trim().length(3).toUpperCase(),
  billingPeriod: z.enum(BILLING_PERIODS),
});
export type FactMoney = z.infer<typeof moneySchema>;

export const factSchemas = {
  business_summary: z.object({
    summary: shortText(2000),
    positioning: shortText(400).nullish(),
  }),
  product: z.object({
    name: shortText(160),
    description: shortText(600).nullish(),
    price: moneySchema.nullish(),
    url: z.string().trim().url().nullish(),
  }),
  service: z.object({
    name: shortText(160),
    description: shortText(600).nullish(),
    price: moneySchema.nullish(),
    url: z.string().trim().url().nullish(),
  }),
  pricing_plan: z.object({
    name: shortText(120),
    description: shortText(600).nullish(),
    price: moneySchema,
    priceQualifier: z.enum(["from", "up_to", "exact"]).default("exact"),
    /** Benefits live inside the plan so one can never detach or attach to the wrong plan. */
    benefits: z.array(shortText(200)).max(30).default([]),
    planUrl: z.string().trim().url().nullish(),
  }),
  benefit: z.object({
    statement: shortText(240),
    /** Plan / product name this benefit belongs to, when the page attributes it. */
    appliesTo: shortText(120).nullish(),
  }),
  feature: z.object({
    name: shortText(160),
    description: shortText(400).nullish(),
  }),
  faq: z.object({
    question: shortText(300),
    answer: shortText(1500),
  }),
  policy: z.object({
    category: z.enum([
      "shipping",
      "returns",
      "refunds",
      "cancellation",
      "guarantee",
      "privacy",
      "terms",
      "payment",
      "other",
    ]),
    title: shortText(160),
    details: shortText(1500),
    conditions: z.array(shortText(240)).max(20).default([]),
  }),
  location: z.object({
    name: shortText(160).nullish(),
    addressLine: shortText(240).nullish(),
    city: shortText(120).nullish(),
    region: shortText(120).nullish(),
    postalCode: shortText(24).nullish(),
    country: shortText(120).nullish(),
    phone: shortText(60).nullish(),
    url: z.string().trim().url().nullish(),
  }),
  service_area: z.object({
    area: shortText(160),
    notes: shortText(400).nullish(),
  }),
  business_hours: z.object({
    /** One entry per distinct schedule line, kept verbatim from the page. */
    entries: z
      .array(
        z.object({
          days: shortText(80),
          opens: shortText(40),
          closes: shortText(40),
        }),
      )
      .min(1)
      .max(14),
    timezone: shortText(60).nullish(),
    notes: shortText(300).nullish(),
  }),
  contact_method: z.object({
    kind: z.enum(["phone", "email", "whatsapp", "sms", "form", "chat", "other"]),
    value: shortText(240),
    label: shortText(120).nullish(),
  }),
  booking_link: z.object({
    url: z.string().trim().url(),
    label: shortText(120).nullish(),
  }),
  call_to_action: z.object({
    label: shortText(160),
    url: z.string().trim().url().nullish(),
    description: shortText(400).nullish(),
    /**
     * Where to act when the destination is the page itself (on-page form with no separate
     * action URL), e.g. "at the bottom of the advertising page".
     */
    locationHint: shortText(160).nullish(),
    /** Published response timing, e.g. "usually within 1–2 business days". */
    responseTiming: shortText(160).nullish(),
  }),
  eligibility_rule: z.object({
    rule: shortText(400),
    appliesTo: shortText(120).nullish(),
  }),
  numeric_limit: z.object({
    label: shortText(160),
    value: z.number().finite(),
    unit: shortText(40).nullish(),
    appliesTo: shortText(120).nullish(),
  }),
  custom_fact: z.object({
    label: shortText(160),
    value: shortText(1000),
  }),
} as const;

export type FactDataMap = { [K in keyof typeof factSchemas]: z.infer<(typeof factSchemas)[K]> };
export type FactType = keyof FactDataMap;
export type AnyFactData = FactDataMap[FactType];

export const FACT_TYPES = Object.keys(factSchemas) as FactType[];

export function isFactType(value: unknown): value is FactType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(factSchemas, value);
}

// ---------------------------------------------------------------------------
// Fact row shape (DB-agnostic so merge / retrieval are testable without a database)
// ---------------------------------------------------------------------------

export type FactState = "draft" | "published" | "retired";

/**
 * Priority order, highest first. `document` and `integration` are declared but unused in
 * Phase 1 so later knowledge sources slot into the hierarchy without a migration.
 */
export type FactOrigin =
  | "user_edited"
  | "user_entered"
  | "website_verified"
  | "document"
  | "integration"
  | "ai_extracted"
  | "migrated_source"
  | "legacy_summary";

export type FactConflictResolution = "precedence" | "user";

/**
 * What a draft is asking for.
 * `suggest` is a proposed change to a fact the user controls (pinned or edited, or any
 * higher-precedence origin) — publish never applies it silently.
 */
export type FactProposedAction = "add" | "update" | "retire" | "suggest";

export type FactProvenanceEntry = {
  sourceId: string | null;
  url?: string | null;
  title?: string | null;
  verifiedAt?: string | null;
};

type FactBase = {
  id: string;
  userId: string;
  /** Null means manually entered — survives every rescan and source removal. */
  sourceId: string | null;
  factKey: string;
  state: FactState;
  proposedAction: FactProposedAction | null;
  origin: FactOrigin;
  confidence: number;
  isPinned: boolean;
  userEdited: boolean;
  conflictGroup: string | null;
  conflictResolution: FactConflictResolution | null;
  supersededByFactId: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  excerpt: string | null;
  provenance: FactProvenanceEntry[];
  firstSeenAt: string;
  /** Drives freshness. Bumped whenever a scan re-confirms the same value. */
  lastVerifiedAt: string;
  publishedAt: string | null;
  retiredAt: string | null;
};

export type KnowledgeFactOf<T extends FactType> = FactBase & {
  factType: T;
  data: FactDataMap[T];
};

/** Discriminated union over every fact type. */
export type KnowledgeFact = { [K in FactType]: KnowledgeFactOf<K> }[FactType];

/** A newly extracted fact that has not been assigned an id or lifecycle state yet. */
export type FactCandidate = {
  factType: FactType;
  factKey: string;
  data: AnyFactData;
  origin: FactOrigin;
  confidence: number;
  sourceId: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  excerpt: string | null;
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ParseFactResult =
  | { ok: true; factType: FactType; data: AnyFactData }
  | { ok: false; error: string };

/** Invalid payloads are rejected, never coerced into a half-populated fact. */
export function parseFactData(factType: unknown, data: unknown): ParseFactResult {
  if (!isFactType(factType)) {
    return { ok: false, error: `unknown fact type: ${String(factType)}` };
  }
  const parsed = factSchemas[factType].safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path?.join(".") || "(root)";
    return { ok: false, error: `${factType}.${path}: ${first?.message || "invalid"}` };
  }
  return { ok: true, factType, data: parsed.data as AnyFactData };
}

export function truncateExcerpt(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length <= MAX_FACT_EXCERPT
    ? trimmed
    : `${trimmed.slice(0, MAX_FACT_EXCERPT - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Fact identity
// ---------------------------------------------------------------------------

export function slugifyFactPart(value: string, maxLen = 60): string {
  const slug = (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, maxLen).replace(/-+$/g, "") || "unnamed";
}

function normalizeUrlForKey(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    return u.href.toLowerCase().replace(/\/$/, "");
  } catch {
    return (raw || "").trim().toLowerCase();
  }
}

/**
 * Stable dedupe identity derived from the fact's natural key, so the same plan found on
 * two pages (or on the same page next month) resolves to one fact rather than a duplicate.
 */
export function factKey(factType: FactType, data: AnyFactData): string {
  switch (factType) {
    case "business_summary":
      return "business_summary:primary";
    case "business_hours":
      return "business_hours:primary";
    case "product":
    case "service": {
      const d = data as FactDataMap["product"];
      return `${factType}:${slugifyFactPart(d.name)}`;
    }
    case "pricing_plan": {
      const d = data as FactDataMap["pricing_plan"];
      return `pricing_plan:${slugifyFactPart(d.name)}`;
    }
    case "benefit": {
      const d = data as FactDataMap["benefit"];
      const scope = d.appliesTo ? slugifyFactPart(d.appliesTo, 40) : "general";
      return `benefit:${scope}:${slugifyFactPart(d.statement, 60)}`;
    }
    case "feature": {
      const d = data as FactDataMap["feature"];
      return `feature:${slugifyFactPart(d.name)}`;
    }
    case "faq": {
      const d = data as FactDataMap["faq"];
      return `faq:${slugifyFactPart(d.question, 80)}`;
    }
    case "policy": {
      const d = data as FactDataMap["policy"];
      return `policy:${d.category}:${slugifyFactPart(d.title, 60)}`;
    }
    case "location": {
      const d = data as FactDataMap["location"];
      const identity = d.name || d.addressLine || d.city || d.postalCode || "primary";
      return `location:${slugifyFactPart(identity)}`;
    }
    case "service_area": {
      const d = data as FactDataMap["service_area"];
      return `service_area:${slugifyFactPart(d.area)}`;
    }
    case "contact_method": {
      const d = data as FactDataMap["contact_method"];
      const value = d.kind === "form" || d.kind === "chat" ? normalizeUrlForKey(d.value) : d.value;
      return `contact_method:${d.kind}:${slugifyFactPart(value, 80)}`;
    }
    case "booking_link": {
      const d = data as FactDataMap["booking_link"];
      return `booking_link:${slugifyFactPart(normalizeUrlForKey(d.url), 80)}`;
    }
    case "call_to_action": {
      const d = data as FactDataMap["call_to_action"];
      return `call_to_action:${slugifyFactPart(d.label)}`;
    }
    case "eligibility_rule": {
      const d = data as FactDataMap["eligibility_rule"];
      const scope = d.appliesTo ? slugifyFactPart(d.appliesTo, 40) : "general";
      return `eligibility_rule:${scope}:${slugifyFactPart(d.rule, 60)}`;
    }
    case "numeric_limit": {
      const d = data as FactDataMap["numeric_limit"];
      const scope = d.appliesTo ? slugifyFactPart(d.appliesTo, 40) : "general";
      return `numeric_limit:${scope}:${slugifyFactPart(d.label)}`;
    }
    case "custom_fact": {
      const d = data as FactDataMap["custom_fact"];
      return `custom_fact:${slugifyFactPart(d.label)}`;
    }
    default: {
      const exhaustive: never = factType;
      return String(exhaustive);
    }
  }
}

/** Order-independent value signature used to decide "same value" vs "changed value". */
export function factValueSignature(factType: FactType, data: unknown): string {
  return `${factType}|${stableStringify(normalizeForSignature(data))}`;
}

function normalizeForSignature(value: unknown): unknown {
  if (Array.isArray(value)) {
    // Benefit / condition ordering on a page is cosmetic; a reorder is not a value change.
    return value.map(normalizeForSignature).sort(compareSignatureItems);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined || v === null || v === "") continue;
      out[k] = normalizeForSignature(v);
    }
    return out;
  }
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim().toLowerCase();
  return value;
}

function compareSignatureItems(a: unknown, b: unknown): number {
  const as = stableStringify(a);
  const bs = stableStringify(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function factsHaveSameValue(
  a: Pick<KnowledgeFact, "factType" | "data">,
  b: Pick<KnowledgeFact, "factType" | "data">,
): boolean {
  return factValueSignature(a.factType, a.data) === factValueSignature(b.factType, b.data);
}

// ---------------------------------------------------------------------------
// Fact precedence — the deterministic priority hierarchy
// ---------------------------------------------------------------------------

/**
 * User Edited > Pinned > Official Website > Documents > Integrations > AI Extracted > Legacy.
 *
 * `website_verified` means the value was read literally off an owned website source by the
 * deterministic pass (JSON-LD, price regex, tel/mailto, hours table). Model-inferred facts
 * from the same page stay `ai_extracted`, which is what makes a literal price outrank a
 * paraphrased one.
 */
export const FACT_PRECEDENCE = {
  user_edited: 100,
  user_entered: 100,
  pinned: 90,
  website_verified: 80,
  document: 70,
  integration: 60,
  ai_extracted: 40,
  migrated_source: 20,
  legacy_summary: 10,
} as const;

export type FactPrecedenceInput = Pick<KnowledgeFact, "origin" | "isPinned" | "userEdited">;

export function factPrecedence(fact: FactPrecedenceInput): number {
  if (fact.userEdited) return FACT_PRECEDENCE.user_edited;
  if (fact.isPinned) return FACT_PRECEDENCE.pinned;
  return FACT_PRECEDENCE[fact.origin] ?? FACT_PRECEDENCE.ai_extracted;
}

/**
 * Shown next to every value in the review step, so these read as provenance a merchant
 * recognises. The two lowest tiers describe knowledge carried over from an earlier setup;
 * they must not name the internal migration, which means nothing to the person reading it.
 */
const PRECEDENCE_LABELS: Record<number, string> = {
  100: "You entered or edited this",
  90: "Pinned",
  80: "Verified on your website",
  70: "From an uploaded document",
  60: "From a connected integration",
  40: "AI extracted from your website",
  20: "From a page you saved earlier",
  10: "From your existing business description",
};

export function describeFactPrecedence(fact: FactPrecedenceInput): string {
  return PRECEDENCE_LABELS[factPrecedence(fact)] || "AI extracted";
}

// ---------------------------------------------------------------------------
// Knowledge freshness
// ---------------------------------------------------------------------------

export type FreshnessTier = "fresh" | "aging" | "stale";
export type StaleFactBehavior = "use" | "caution" | "escalate";

/** How long a fact of each type stays trustworthy without re-verification. */
export const FACT_TTL_DAYS: Record<FactType, number> = {
  pricing_plan: 30,
  business_hours: 30,
  contact_method: 60,
  booking_link: 60,
  numeric_limit: 60,
  eligibility_rule: 90,
  policy: 90,
  product: 90,
  service: 90,
  location: 90,
  service_area: 90,
  benefit: 90,
  feature: 90,
  call_to_action: 90,
  custom_fact: 90,
  faq: 120,
  business_summary: 180,
};

export const DEFAULT_STALE_FACT_BEHAVIOR: StaleFactBehavior = "caution";

/** A wrong answer on these costs money, so a stale value escalates instead of asserting. */
export const CRITICAL_FACT_TYPES: readonly FactType[] = [
  "pricing_plan",
  "business_hours",
  "eligibility_rule",
  "numeric_limit",
];

export type KnowledgeFreshnessPolicy = {
  ttlDaysByType?: Partial<Record<FactType, number>>;
  staleFactBehavior?: StaleFactBehavior;
  staleBehaviorByType?: Partial<Record<FactType, StaleFactBehavior>>;
};

const staleBehaviorSchema = z.enum(["use", "caution", "escalate"]);

export function parseKnowledgeFreshnessPolicy(raw: unknown): KnowledgeFreshnessPolicy {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const policy: KnowledgeFreshnessPolicy = {};

  const behavior = staleBehaviorSchema.safeParse(o.staleFactBehavior);
  if (behavior.success) policy.staleFactBehavior = behavior.data;

  if (o.ttlDaysByType && typeof o.ttlDaysByType === "object") {
    const ttl: Partial<Record<FactType, number>> = {};
    for (const [k, v] of Object.entries(o.ttlDaysByType as Record<string, unknown>)) {
      if (!isFactType(k)) continue;
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) ttl[k] = Math.round(n);
    }
    if (Object.keys(ttl).length) policy.ttlDaysByType = ttl;
  }

  if (o.staleBehaviorByType && typeof o.staleBehaviorByType === "object") {
    const byType: Partial<Record<FactType, StaleFactBehavior>> = {};
    for (const [k, v] of Object.entries(o.staleBehaviorByType as Record<string, unknown>)) {
      if (!isFactType(k)) continue;
      const parsed = staleBehaviorSchema.safeParse(v);
      if (parsed.success) byType[k] = parsed.data;
    }
    if (Object.keys(byType).length) policy.staleBehaviorByType = byType;
  }

  return policy;
}

export function resolveFactTtlDays(factType: FactType, policy?: KnowledgeFreshnessPolicy): number {
  return policy?.ttlDaysByType?.[factType] ?? FACT_TTL_DAYS[factType] ?? 90;
}

export function resolveStaleFactBehavior(
  factType: FactType,
  policy?: KnowledgeFreshnessPolicy,
): StaleFactBehavior {
  const explicit = policy?.staleBehaviorByType?.[factType];
  if (explicit) return explicit;
  if (policy?.staleFactBehavior) return policy.staleFactBehavior;
  return CRITICAL_FACT_TYPES.includes(factType) ? "escalate" : DEFAULT_STALE_FACT_BEHAVIOR;
}

export type FactFreshness = {
  verifiedAt: string;
  ageDays: number;
  ttlDays: number;
  tier: FreshnessTier;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Derived from `lastVerifiedAt` rather than stored, so the freshness value can never itself
 * go stale. Fresh within the TTL, aging up to twice the TTL, stale beyond that.
 */
export function factFreshness(
  fact: Pick<KnowledgeFact, "factType" | "lastVerifiedAt">,
  now: Date = new Date(),
  policy?: KnowledgeFreshnessPolicy,
): FactFreshness {
  const ttlDays = resolveFactTtlDays(fact.factType, policy);
  const verified = new Date(fact.lastVerifiedAt);
  const verifiedMs = Number.isNaN(verified.getTime()) ? now.getTime() : verified.getTime();
  const ageDays = Math.max(0, Math.floor((now.getTime() - verifiedMs) / MS_PER_DAY));
  const tier: FreshnessTier =
    ageDays <= ttlDays ? "fresh" : ageDays <= ttlDays * 2 ? "aging" : "stale";
  return { verifiedAt: new Date(verifiedMs).toISOString(), ageDays, ttlDays, tier };
}

export type KnowledgeFreshnessSummary = {
  total: number;
  fresh: number;
  aging: number;
  stale: number;
  oldestVerifiedAt: string | null;
  /** Doubles as a change stamp: publishing always moves it forward. */
  newestVerifiedAt: string | null;
};

/** Counts only — safe to put in the client snapshot without shipping fact payloads. */
export function summarizeKnowledgeFreshness(
  facts: Array<Pick<KnowledgeFact, "factType" | "lastVerifiedAt">>,
  now: Date = new Date(),
  policy?: KnowledgeFreshnessPolicy,
): KnowledgeFreshnessSummary {
  let fresh = 0;
  let aging = 0;
  let stale = 0;
  let oldest: number | null = null;
  let newest: number | null = null;
  for (const fact of facts) {
    const f = factFreshness(fact, now, policy);
    if (f.tier === "fresh") fresh += 1;
    else if (f.tier === "aging") aging += 1;
    else stale += 1;
    const ms = new Date(f.verifiedAt).getTime();
    if (oldest === null || ms < oldest) oldest = ms;
    if (newest === null || ms > newest) newest = ms;
  }
  return {
    total: facts.length,
    fresh,
    aging,
    stale,
    oldestVerifiedAt: oldest === null ? null : new Date(oldest).toISOString(),
    newestVerifiedAt: newest === null ? null : new Date(newest).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Ordering and conflicts
// ---------------------------------------------------------------------------

/**
 * Retrieval order: precedence, then most recently verified, then confidence.
 * Applied before any per-turn cap so the cap can never drop a user-edited fact in
 * favour of an AI-extracted one.
 */
export function compareFactsForRetrieval(a: KnowledgeFact, b: KnowledgeFact): number {
  const byPrecedence = factPrecedence(b) - factPrecedence(a);
  if (byPrecedence !== 0) return byPrecedence;
  const bySeen =
    new Date(b.lastVerifiedAt).getTime() - new Date(a.lastVerifiedAt).getTime();
  if (bySeen !== 0) return bySeen;
  const byConfidence = b.confidence - a.confidence;
  if (byConfidence !== 0) return byConfidence;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export type FactConflict = {
  factKey: string;
  factType: FactType;
  /** Highest-precedence claimant. */
  winner: KnowledgeFact;
  losers: KnowledgeFact[];
  /**
   * `precedence` when the tiers differ and the winner is unambiguous;
   * `blocked` when equal-precedence sources disagree and a human must decide.
   */
  resolution: "precedence" | "blocked";
};

/**
 * Facts that claim the same key with different values.
 *
 * Cross-tier disagreements resolve deterministically to the higher tier (and are still
 * surfaced in review, never silently dropped). Same-tier disagreements are blocked so a
 * human confirms which value is correct.
 */
export function detectFactConflicts(facts: KnowledgeFact[]): FactConflict[] {
  const byKey = new Map<string, KnowledgeFact[]>();
  for (const fact of facts) {
    if (fact.state === "retired") continue;
    const list = byKey.get(fact.factKey);
    if (list) list.push(fact);
    else byKey.set(fact.factKey, [fact]);
  }

  const conflicts: FactConflict[] = [];
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    const signatures = new Set(group.map((f) => factValueSignature(f.factType, f.data)));
    if (signatures.size < 2) continue;

    const ordered = [...group].sort(compareFactsForRetrieval);
    const winner = ordered[0];
    const losers = ordered.slice(1);
    const winnerPrecedence = factPrecedence(winner);
    const tiedAtTop = losers.some(
      (l) =>
        factPrecedence(l) === winnerPrecedence &&
        factValueSignature(l.factType, l.data) !== factValueSignature(winner.factType, winner.data),
    );
    conflicts.push({
      factKey: key,
      factType: winner.factType,
      winner,
      losers,
      resolution: tiedAtTop ? "blocked" : "precedence",
    });
  }
  return conflicts;
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

export function formatFactMoney(money: FactMoney, qualifier?: string): string {
  const amount =
    Number.isInteger(money.amount) ? String(money.amount) : money.amount.toFixed(2);
  const period = money.billingPeriod === "once" ? "one-time" : `per ${money.billingPeriod}`;
  const prefix = qualifier === "from" ? "from " : qualifier === "up_to" ? "up to " : "";
  return `${prefix}${money.currency} ${amount} ${period}`;
}

/** Single-line rendering used by both the prompt block and the review UI. */
export function formatFactValue(fact: Pick<KnowledgeFact, "factType" | "data">): string {
  switch (fact.factType) {
    case "business_summary": {
      const d = fact.data as FactDataMap["business_summary"];
      return d.summary;
    }
    case "pricing_plan": {
      const d = fact.data as FactDataMap["pricing_plan"];
      const price = formatFactMoney(d.price, d.priceQualifier);
      const benefits = d.benefits.length ? ` — includes: ${d.benefits.join("; ")}` : "";
      return `${d.name}: ${price}${benefits}`;
    }
    case "product":
    case "service": {
      const d = fact.data as FactDataMap["product"];
      const price = d.price ? ` (${formatFactMoney(d.price)})` : "";
      return `${d.name}${price}${d.description ? ` — ${d.description}` : ""}`;
    }
    case "benefit": {
      const d = fact.data as FactDataMap["benefit"];
      return d.appliesTo ? `${d.appliesTo}: ${d.statement}` : d.statement;
    }
    case "feature": {
      const d = fact.data as FactDataMap["feature"];
      return d.description ? `${d.name} — ${d.description}` : d.name;
    }
    case "faq": {
      const d = fact.data as FactDataMap["faq"];
      return `Q: ${d.question} A: ${d.answer}`;
    }
    case "policy": {
      const d = fact.data as FactDataMap["policy"];
      const conditions = d.conditions.length ? ` Conditions: ${d.conditions.join("; ")}` : "";
      return `${d.title} (${d.category}): ${d.details}${conditions}`;
    }
    case "location": {
      const d = fact.data as FactDataMap["location"];
      const parts = [d.name, d.addressLine, d.city, d.region, d.postalCode, d.country]
        .map((p) => (p ?? "").trim())
        .filter(Boolean);
      return parts.join(", ") || "Location";
    }
    case "service_area": {
      const d = fact.data as FactDataMap["service_area"];
      return d.notes ? `${d.area} — ${d.notes}` : d.area;
    }
    case "business_hours": {
      const d = fact.data as FactDataMap["business_hours"];
      const lines = d.entries.map((e) => `${e.days} ${e.opens}–${e.closes}`).join("; ");
      return d.timezone ? `${lines} (${d.timezone})` : lines;
    }
    case "contact_method": {
      const d = fact.data as FactDataMap["contact_method"];
      return `${d.label || d.kind}: ${d.value}`;
    }
    case "booking_link": {
      const d = fact.data as FactDataMap["booking_link"];
      return d.label ? `${d.label}: ${d.url}` : d.url;
    }
    case "call_to_action": {
      const d = fact.data as FactDataMap["call_to_action"];
      const dest = d.url ? ` (${d.url})` : "";
      const where = d.locationHint ? ` — ${d.locationHint}` : "";
      const when = d.responseTiming ? ` ${d.responseTiming}` : "";
      const desc = d.description && !d.locationHint ? ` — ${d.description}` : "";
      return `${d.label}${dest}${where}${desc}${when}`.trim();
    }
    case "eligibility_rule": {
      const d = fact.data as FactDataMap["eligibility_rule"];
      return d.appliesTo ? `${d.appliesTo}: ${d.rule}` : d.rule;
    }
    case "numeric_limit": {
      const d = fact.data as FactDataMap["numeric_limit"];
      return `${d.label}: ${d.value}${d.unit ? ` ${d.unit}` : ""}`;
    }
    case "custom_fact": {
      const d = fact.data as FactDataMap["custom_fact"];
      return `${d.label}: ${d.value}`;
    }
    default: {
      const exhaustive: never = fact.factType;
      return String(exhaustive);
    }
  }
}

export const FACT_TYPE_LABELS: Record<FactType, string> = {
  business_summary: "Business overview",
  product: "Product",
  service: "Service",
  pricing_plan: "Pricing plan",
  benefit: "Benefit",
  feature: "Feature",
  faq: "FAQ",
  policy: "Policy",
  location: "Location",
  service_area: "Service area",
  business_hours: "Business hours",
  contact_method: "Contact method",
  booking_link: "Booking link",
  call_to_action: "Call to action",
  eligibility_rule: "Eligibility rule",
  numeric_limit: "Limit",
  custom_fact: "Other detail",
};

/** Review UI grouping. Order is the display order. */
export const FACT_REVIEW_SECTIONS: ReadonlyArray<{
  id: string;
  title: string;
  factTypes: readonly FactType[];
}> = [
  { id: "overview", title: "Business Overview", factTypes: ["business_summary"] },
  { id: "offerings", title: "Products and Services", factTypes: ["product", "service"] },
  { id: "pricing", title: "Pricing and Plans", factTypes: ["pricing_plan"] },
  { id: "benefits", title: "Benefits and Features", factTypes: ["benefit", "feature"] },
  { id: "faqs", title: "FAQs", factTypes: ["faq"] },
  {
    id: "policies",
    title: "Policies",
    factTypes: ["policy", "eligibility_rule", "numeric_limit"],
  },
  {
    id: "locations",
    title: "Locations and Hours",
    factTypes: ["location", "service_area", "business_hours"],
  },
  {
    id: "contact",
    title: "Contact and Booking",
    factTypes: ["contact_method", "booking_link", "call_to_action", "custom_fact"],
  },
] as const;

export function factReviewSectionId(factType: FactType): string {
  return FACT_REVIEW_SECTIONS.find((s) => s.factTypes.includes(factType))?.id || "contact";
}

/**
 * Readable prose rebuilt from published facts, with no model call.
 *
 * Written back into the legacy `websiteKnowledgeSummary` column on publish so the V1
 * fallback, the AI Brain preview, and any consumer not yet migrated all stay consistent
 * with the facts instead of drifting from them.
 */
export function buildFactNarrativeSummary(facts: KnowledgeFact[], maxLen = 6000): string {
  const published = facts.filter((f) => f.state === "published");
  if (published.length === 0) return "";

  const byType = new Map<FactType, KnowledgeFact[]>();
  for (const fact of published) {
    const list = byType.get(fact.factType);
    if (list) list.push(fact);
    else byType.set(fact.factType, [fact]);
  }

  const blocks: string[] = [];
  for (const section of FACT_REVIEW_SECTIONS) {
    const sectionFacts: KnowledgeFact[] = [];
    for (const type of section.factTypes) {
      const list = byType.get(type);
      if (list) sectionFacts.push(...[...list].sort(compareFactsForRetrieval));
    }
    if (sectionFacts.length === 0) continue;

    if (section.id === "overview") {
      blocks.push(sectionFacts.map((f) => formatFactValue(f)).join("\n\n"));
      continue;
    }
    const lines = sectionFacts.map((f) => `- ${formatFactValue(f)}`);
    blocks.push(`${section.title}:\n${lines.join("\n")}`);
  }

  const text = blocks.join("\n\n").trim();
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1).trimEnd()}…`;
}
