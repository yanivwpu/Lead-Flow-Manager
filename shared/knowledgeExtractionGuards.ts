/**
 * Post-extraction guards for Business Knowledge.
 *
 * The model and the regex pass can both emit a syntactically valid fact that is still
 * wrong: a missing price coerced to $0, an unknown interval stored as "one-time", a
 * Facebook URL filed as booking, an industry listed as a location. Everything that
 * decides "keep / omit / needs review" lives here so scan, parse, publish, and tests
 * cannot drift.
 *
 * Pure functions only.
 */

import {
  BILLING_PERIODS,
  factKey,
  parseFactData,
  type BillingPeriod,
  type FactCandidate,
  type FactMoney,
  type FactType,
  type KnowledgeFact,
} from "./businessKnowledgeFacts";

export const SOURCE_REMOVED_REVIEW_MESSAGE = "Source removed — analyze again to refresh";

const PAID_PLAN_NAME_RE =
  /\b(pro|plus|premium|business|starter|growth|scale|enterprise|team|professional|paid)\b/i;
const FREE_PLAN_NAME_RE = /\b(free|hobby|community|trial)\b/i;

const SOCIAL_HOST_RE =
  /(?:^|\.)(?:facebook\.com|fb\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com|youtu\.be|pinterest\.com|threads\.net)$/i;

const SIGNUP_OR_NAV_CTA_RE =
  /\b(?:start\s+free|start\s+your\s+free|try\s+free|free\s+trial|start\s+trial|start.{0,40}\btrial|sign\s*up|sign\s*in|log\s*in|register|see\s+plans|compare\s+plans|see\s+pricing|view\s+(?:\w+\s+){0,4}plans)\b/i;

const SIGNUP_PATH_RE =
  /\/(?:auth|signup|sign-up|register|login|log-in|trial|start-free|get-started)(?:\/|$|\?)/i;

const PRICING_PATH_RE = /\/(?:pricing|plans?)(?:\/|$|\?|#)/i;

const CONTACT_OR_SCHEDULING_PATH_RE =
  /\/(?:contact|book(?:ing)?|demo|schedule|appointment)(?:\/|$|\?|#)/i;

const PRODUCT_OFFER_PATH_RE = /\/realtor-growth-engine(?:\/|$|\?|#)/i;

const BOOKING_HOST_RE =
  /(?:calendly\.com|cal\.com|acuityscheduling\.com|squareup\.com\/appointments|setmore\.com|youcanbook\.me|hubspot\.com\/meetings|book(?:ing)?\.)/i;

const BOOKING_OR_DEMO_RE =
  /\b(?:book|booking|schedule|calendly|demo|walkthrough|appointment|consult|reserve)\b/i;

const GROWTH_ENGINE_NAME_RE = /\bgrowth\s+engine\b/i;
const GROWTH_ENGINE_PATH_RE = /\/realtor-growth-engine(?:\/|$|\?|#)/i;
const ENTITLEMENT_DEPENDENCY_RE = /\brequires(?:\s+an)?(?:\s+active)?\s+pro\b/i;
const BILLING_NAME_SUFFIX_RE =
  /(?:\s*[—–:-]\s*|\s+)(?:monthly|yearly|annual(?:ly)?|one[-\s]?time|subscription)(?:\s+(?:plan|tier|offer))?$/i;
const MISSING_PRICE_REASON_RE =
  /price could not be read|price was not stated|left unknown|billing frequency was not stated|currency was not stated|price amount could not be read|price and billing frequency could not be read/i;
export const MISSING_PRICE_REVIEW_REASON = "Price could not be read from the page and was left unknown.";

const INDUSTRY_OR_AUDIENCE_RE =
  /\b(?:industr(?:y|ies)|use\s+cases?|who\s+it(?:'s| is)\s+for|built\s+for|for\s+(?:agenc(?:y|ies)|teams?|realtors?|brokers?|coaches?)|real estate|realtors?|agenc(?:y|ies)|saas|e-?commerce|healthcare|dentists?|law firms?)\b/i;

const AFFIRMATIVE_PLACE_RE =
  /\b(?:city|county|metro|nationwide|statewide|region|\d+\s*(?:km|miles?)|greater\s+[a-z]|serving\s+[a-z]|timezone)\b/i;

const AUDIENCE_OR_CAPABILITY_RE =
  /\b(?:prospects?|customers?|clients?|audience|segments?|verticals?|industr(?:y|ies)|wellness|spas?|agenc(?:y|ies)|businesses|use\s+cases?)\b/i;

const NAV_ONLY_RE =
  /^(?:home|about|pricing|features?|blog|contact|login|sign\s*up|get\s+started|docs|support|privacy|terms)$/i;

export type ReviewNotice = {
  kind: "source_removed";
  message: string;
};

export type PublishItemError = {
  factId: string;
  factKey: string;
  summary: string;
  reasons: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Empty / missing / unparsed strings must never become 0. `Number("") === 0` in JS. */
export function parseExplicitAmount(value: unknown): number | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return undefined;
    return value;
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || !/\d/.test(trimmed)) return undefined;
  const cleaned = trimmed.replace(/[^\d,.-]/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return undefined;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const normalized =
    lastComma > lastDot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return amount;
}

export function parseBillingPeriod(value: unknown): BillingPeriod | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!v) return undefined;
  if (v === "once" || v === "one time" || v === "onetime" || v === "lifetime") return "once";
  if (v === "day" || v === "daily") return "day";
  if (v === "week" || v === "weekly") return "week";
  if (v === "month" || v === "monthly" || v === "mo") return "month";
  if (v === "quarter" || v === "quarterly") return "quarter";
  if (v === "year" || v === "yearly" || v === "annual" || v === "annually" || v === "yr") {
    return "year";
  }
  if ((BILLING_PERIODS as readonly string[]).includes(v)) return v as BillingPeriod;
  return undefined;
}

export function planLooksPaid(name: string): boolean {
  if (FREE_PLAN_NAME_RE.test(name) && !PAID_PLAN_NAME_RE.test(name)) return false;
  return PAID_PLAN_NAME_RE.test(name);
}

export function planLooksFree(name: string): boolean {
  return FREE_PLAN_NAME_RE.test(name) && !/\bpro\b/i.test(name);
}

/** “Requires Pro” is an entitlement dependency, never a purchasable plan name. */
export function isEntitlementDependencyText(text: string): boolean {
  return ENTITLEMENT_DEPENDENCY_RE.test(text);
}

export function stripBillingDecorationsFromOfferName(name: string): string {
  return name.replace(BILLING_NAME_SUFFIX_RE, "").replace(/\s+/g, " ").trim() || name.trim();
}

function pageIdentityNames(sourceTitle?: string | null): string[] {
  if (!sourceTitle) return [];
  return sourceTitle
    .split(/[|–—]/)
    .map((part) => part.replace(/\bpricing\b/gi, "").replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 2);
}

/**
 * Company / page-title wrappers are not purchasable plans. A name that matches the
 * page or business identity, without a stated amount and interval, is the umbrella
 * product — not a tier.
 */
export function isUmbrellaCommercialName(name: string, sourceTitle?: string | null): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  return pageIdentityNames(sourceTitle).some((id) => id.toLowerCase() === lower);
}

export function looksLikeAudienceOrCapability(text: string): boolean {
  return looksLikeIndustryOrUseCase(text) || AUDIENCE_OR_CAPABILITY_RE.test(text);
}

export function hasAffirmativePlaceEvidence(text: string, data?: Record<string, unknown>): boolean {
  if (data && locationHasPhysicalSignal(data)) return true;
  return AFFIRMATIVE_PLACE_RE.test(text);
}

export function listedCandidatePrices(data: Record<string, unknown>): FactMoney[] {
  return uniquePlanPrices(
    (data.price as FactMoney | null | undefined) ?? null,
    Array.isArray(data.additionalPrices) ? (data.additionalPrices as FactMoney[]) : [],
  );
}

function subscriptionPrices(prices: FactMoney[]): FactMoney[] {
  return prices.filter((p) => p.billingPeriod === "month" || p.billingPeriod === "year");
}

function oncePrices(prices: FactMoney[]): FactMoney[] {
  return prices.filter((p) => p.billingPeriod === "once");
}

function candidateBlob(data: Record<string, unknown>): string {
  const benefits = Array.isArray(data.benefits) ? data.benefits.join(" ") : "";
  return `${data.name || ""} ${data.description || ""} ${benefits} ${data.planUrl || ""} ${data.url || ""}`;
}

function growthEnginePath(data: Record<string, unknown>): boolean {
  return GROWTH_ENGINE_PATH_RE.test(String(data.planUrl || data.url || ""));
}

/**
 * Growth Engine is a distinct one-time product. Name, URL, and description may say so;
 * “requires Pro” and feature bullets that merely mention Pro must not rename it to Pro.
 */
export function looksLikeGrowthEngineOffer(data: Record<string, unknown>, prices?: FactMoney[]): boolean {
  const name = String(data.name || "");
  if (GROWTH_ENGINE_NAME_RE.test(name)) return true;
  const blob = candidateBlob(data);
  const listed = prices ?? listedCandidatePrices(data);
  if (subscriptionPrices(listed).length > 0) return false;
  if (GROWTH_ENGINE_NAME_RE.test(blob)) return true;
  if (growthEnginePath(data) && oncePrices(listed).length > 0) return true;
  return false;
}

export function recoveredGrowthEngineName(data: Record<string, unknown>): string {
  const name = String(data.name || "").trim();
  if (GROWTH_ENGINE_NAME_RE.test(name) && !isEntitlementDependencyText(name)) {
    return stripBillingDecorationsFromOfferName(name);
  }
  const blob = `${data.description || ""} ${Array.isArray(data.benefits) ? data.benefits.join(" ") : ""}`;
  const match = blob.match(/([A-Za-z][\w]*(?:\s+[A-Za-z][\w]*)*\s+Growth\s+Engine)/i);
  if (match?.[1]) return match[1].replace(/\s+/g, " ").trim();
  return "Growth Engine";
}

function isStaleMissingPriceReason(reason: string): boolean {
  return MISSING_PRICE_REASON_RE.test(reason);
}

function reasonsForPricingPlan(reasons: string[], prices: FactMoney[]): string[] {
  if (prices.length === 0) {
    return reasons.length ? reasons : [MISSING_PRICE_REVIEW_REASON];
  }
  return reasons.filter((reason) => !isStaleMissingPriceReason(reason));
}

function dropUmbrellaPricingPlans(candidates: FactCandidate[]): FactCandidate[] {
  return candidates.filter((candidate) => {
    if (candidate.factType !== "pricing_plan") return true;
    const name = String((candidate.data as { name?: string }).name || "");
    const prices = listedCandidatePrices(candidate.data as Record<string, unknown>);
    return !(isUmbrellaCommercialName(name, candidate.sourceTitle) && prices.length === 0);
  });
}

function moneyKey(money: FactMoney): string {
  return `${money.currency}:${money.amount}:${money.billingPeriod}`;
}

export function uniquePlanPrices(primary: FactMoney | null | undefined, extra: FactMoney[] = []): FactMoney[] {
  const out: FactMoney[] = [];
  const seen = new Set<string>();
  for (const item of [primary, ...extra]) {
    if (!item) continue;
    const key = moneyKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  const rank = (p: BillingPeriod) =>
    p === "month" ? 0 : p === "year" ? 1 : p === "once" ? 9 : 5;
  out.sort((a, b) => rank(a.billingPeriod) - rank(b.billingPeriod) || a.amount - b.amount);
  return out;
}

export type NormalizedMoney =
  | { ok: true; money: FactMoney }
  | { ok: false; reason: string };

/**
 * A price is only kept when both amount and billing interval were stated.
 * Missing values stay unknown — they are never filled with 0 or "once".
 */
export function normalizeExtractedMoney(
  raw: unknown,
  opts: { planName?: string } = {},
): NormalizedMoney | { ok: true; money: null; reason: string } {
  if (raw == null) {
    return { ok: true, money: null, reason: "Price was not stated on the page." };
  }
  if (!isRecord(raw)) {
    return { ok: false, reason: "Price was not a structured amount." };
  }

  const amount = parseExplicitAmount(raw.amount ?? raw.value ?? raw.price);
  const currencyRaw = typeof raw.currency === "string" ? raw.currency.trim().toUpperCase() : "";
  const currency = currencyRaw.length === 3 ? currencyRaw : undefined;
  const billingPeriod = parseBillingPeriod(
    raw.billingPeriod ?? raw.interval ?? raw.billingInterval ?? raw.period,
  );

  if (amount === undefined && !billingPeriod) {
    return { ok: true, money: null, reason: "Price and billing frequency could not be read." };
  }
  if (amount === undefined) {
    return {
      ok: true,
      money: null,
      reason: "Price amount could not be read and was left unknown instead of $0.",
    };
  }
  if (!billingPeriod) {
    return {
      ok: true,
      money: null,
      reason: "Billing frequency was not stated, so it was not stored as one-time.",
    };
  }
  if (!currency) {
    return { ok: true, money: null, reason: "Currency was not stated." };
  }

  const planName = opts.planName || "";
  if (amount === 0 && planLooksPaid(planName) && !planLooksFree(planName)) {
    return {
      ok: true,
      money: null,
      reason: `“${planName}” looks like a paid plan, so an inferred $0 price was omitted.`,
    };
  }
  if (amount === 0 && billingPeriod === "once" && planLooksFree(planName)) {
    return {
      ok: true,
      money: null,
      reason: "A free plan was not stored as a one-time $0 charge; billing frequency was unclear.",
    };
  }

  return { ok: true, money: { amount, currency, billingPeriod } };
}

export function socialNetworkFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    if (!SOCIAL_HOST_RE.test(host)) return null;
    if (host.includes("facebook") || host.includes("fb.com")) return "facebook";
    if (host.includes("instagram")) return "instagram";
    if (host.includes("linkedin")) return "linkedin";
    if (host.includes("twitter") || host === "x.com") return "x";
    if (host.includes("tiktok")) return "tiktok";
    if (host.includes("youtube") || host.includes("youtu.be")) return "youtube";
    if (host.includes("pinterest")) return "pinterest";
    if (host.includes("threads")) return "threads";
    return "social";
  } catch {
    return null;
  }
}

export function isSocialUrl(url: string): boolean {
  return socialNetworkFromUrl(url) !== null;
}

export type KnowledgeDestinationKind = "booking" | "pricing" | "product" | "signup" | "other";

function destinationPath(url: string): string {
  try {
    if (url.startsWith("/")) return url.split(/[?#]/)[0] || url;
    return new URL(url).pathname || url;
  } catch {
    return url;
  }
}

function absoluteFactUrl(raw: string, base?: string | null): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    return new URL(value, base || "https://www.whachatcrm.com").toString();
  } catch {
    return /^https?:\/\//i.test(value) ? value : null;
  }
}

/** Classify a link by where it goes, not by the marketing label on the anchor. */
export function destinationKindFromUrl(url?: string | null): KnowledgeDestinationKind {
  if (!url || !url.trim()) return "other";
  const raw = url.trim();
  if (BOOKING_HOST_RE.test(raw)) return "booking";
  const haystack = `${destinationPath(raw)} ${raw}`;
  if (CONTACT_OR_SCHEDULING_PATH_RE.test(haystack)) return "booking";
  if (PRICING_PATH_RE.test(haystack)) return "pricing";
  if (PRODUCT_OFFER_PATH_RE.test(haystack)) return "product";
  if (SIGNUP_PATH_RE.test(haystack)) return "signup";
  return "other";
}

export function isSignupTrialOrNavCta(label: string, url?: string | null): boolean {
  const dest = destinationKindFromUrl(url);
  if (dest === "booking") return false;
  if (dest === "pricing" || dest === "signup" || dest === "product") return true;
  if (SIGNUP_OR_NAV_CTA_RE.test(label)) return true;
  if (NAV_ONLY_RE.test(label.trim())) return true;
  return false;
}

export function isGenuineBookingOrDemo(label: string, url?: string | null): boolean {
  const dest = destinationKindFromUrl(url);
  if (dest === "pricing" || dest === "signup" || dest === "product") return false;
  if (dest === "booking") return true;
  if (isSignupTrialOrNavCta(label, url)) return false;
  return BOOKING_OR_DEMO_RE.test(label);
}

export function locationHasPhysicalSignal(data: Record<string, unknown>): boolean {
  const fields = ["addressLine", "city", "region", "postalCode", "country"];
  return fields.some((k) => typeof data[k] === "string" && String(data[k]).trim().length > 1);
}

export function looksLikeIndustryOrUseCase(text: string): boolean {
  return INDUSTRY_OR_AUDIENCE_RE.test(text);
}

function withReasons(candidate: FactCandidate, reasons: string[]): FactCandidate {
  const merged = [...(candidate.reviewReasons || [])];
  for (const reason of reasons) {
    if (reason && !merged.includes(reason)) merged.push(reason);
  }
  return merged.length ? { ...candidate, reviewReasons: merged } : candidate;
}

function rebuildCandidate(candidate: FactCandidate, data: unknown, extraReasons: string[] = []): FactCandidate | null {
  const parsed = parseFactData(candidate.factType, data);
  if (!parsed.ok) return null;
  return withReasons(
    {
      ...candidate,
      factType: parsed.factType,
      factKey: factKey(parsed.factType, parsed.data),
      data: parsed.data,
    },
    extraReasons,
  );
}

function drop(reasons: string[]): { keep: false; reasons: string[] } {
  return { keep: false, reasons };
}

function keepAs(
  factType: FactType,
  data: unknown,
  candidate: FactCandidate,
  reasons: string[] = [],
): { keep: true; candidate: FactCandidate } | { keep: false; reasons: string[] } {
  const parsed = parseFactData(factType, data);
  if (!parsed.ok) return drop(reasons.length ? reasons : [parsed.error]);
  return {
    keep: true,
    candidate: withReasons(
      {
        ...candidate,
        factType: parsed.factType,
        factKey: factKey(parsed.factType, parsed.data),
        data: parsed.data,
      },
      reasons,
    ),
  };
}

/**
 * Reclassify or drop a candidate that landed in the wrong review section.
 * Low-confidence navigation text is omitted rather than published as a business fact.
 */
export function classifyExtractedCandidate(
  candidate: FactCandidate,
): { keep: true; candidate: FactCandidate } | { keep: false; reasons: string[] } {
  const data = candidate.data as Record<string, unknown>;

  if (candidate.factType === "pricing_plan") {
    const rawName = String(data.name || "");
    const extras = Array.isArray(data.additionalPrices) ? data.additionalPrices : [];
    const normalized: FactMoney[] = [];
    const reasons: string[] = [...(candidate.reviewReasons || [])];

    for (const raw of [data.price, ...extras]) {
      if (raw == null) continue;
      const result = normalizeExtractedMoney(raw, { planName: rawName });
      if ("money" in result && result.money) normalized.push(result.money);
      else if ("reason" in result && result.reason) reasons.push(result.reason);
    }

    const allPrices = uniquePlanPrices(normalized[0], normalized.slice(1));
    const growth = looksLikeGrowthEngineOffer(data, allPrices);
    const subs = subscriptionPrices(allPrices);
    const prices = growth && subs.length > 0 ? uniquePlanPrices(subs[0], subs.slice(1)) : allPrices;
    const rawBenefits = Array.isArray(data.benefits)
      ? (data.benefits as unknown[]).map((item) => String(item).trim()).filter(Boolean)
      : [];
    const benefits =
      growth && subs.length > 0
        ? rawBenefits.filter((item) => !GROWTH_ENGINE_NAME_RE.test(item) && !isEntitlementDependencyText(item))
        : rawBenefits;

    if (isEntitlementDependencyText(rawName) && !GROWTH_ENGINE_NAME_RE.test(rawName) && !subs.length && !growth) {
      return drop(["“Requires Pro” describes a dependency, not a plan name."]);
    }

    const name = stripBillingDecorationsFromOfferName(rawName);
    const next = rebuildCandidate(
      candidate,
      {
        ...data,
        name,
        price: prices[0] ?? null,
        additionalPrices: prices.slice(1),
        benefits,
      },
      reasonsForPricingPlan(reasons, prices),
    );
    if (!next) return drop(["Pricing plan did not match a known shape."]);
    if (growth && subs.length === 0) {
      const once = oncePrices(allPrices)[0] ?? allPrices[0] ?? null;
      const planUrl = typeof data.planUrl === "string" ? data.planUrl : null;
      const recovered = recoveredGrowthEngineName({ ...data, name });
      return keepAs(
        "product",
        {
          name: recovered,
          description: data.description ?? null,
          price: once,
          url: planUrl && /^https?:\/\//i.test(planUrl) ? planUrl : null,
        },
        next,
        reasons.filter((reason) => !isStaleMissingPriceReason(reason)),
      );
    }
    return { keep: true, candidate: next };
  }

  if (candidate.factType === "location") {
    const blob = [data.name, data.addressLine, data.city, data.url].filter(Boolean).join(" ");
    const industry = looksLikeAudienceOrCapability(blob) || looksLikeAudienceOrCapability(String(data.name || ""));
    const physical = locationHasPhysicalSignal(data);
    if (industry && !physical) {
      return keepAs(
        "audience",
        { label: String(data.name || blob || "Audience"), description: null },
        candidate,
      );
    }
    if (!physical) {
      return drop(["Skipped a location that had no address, city, or service area."]);
    }
    return { keep: true, candidate };
  }

  if (candidate.factType === "service_area") {
    const area = String(data.area || "");
    const notes = String(data.notes || "");
    const blob = `${area} ${notes}`;
    const industry = looksLikeAudienceOrCapability(blob);
    const geo = hasAffirmativePlaceEvidence(blob);
    if (industry && !geo) {
      return keepAs("audience", { label: area, description: data.notes ?? null }, candidate);
    }
    if (!geo) {
      return drop(["Skipped a service area that had no city, region, or service geography."]);
    }
    if (NAV_ONLY_RE.test(area.trim()) || area.trim().length < 3) {
      return drop(["Skipped a service area that was only navigation text."]);
    }
    return { keep: true, candidate };
  }

  if (candidate.factType === "contact_method") {
    const value = String(data.value || "");
    const label = String(data.label || "");
    const network = isSocialUrl(value) ? socialNetworkFromUrl(value) : null;
    if (network) {
      return keepAs(
        "social_link",
        { network, url: value, label: data.label ?? null },
        candidate,
      );
    }
    const resolved = absoluteFactUrl(value, candidate.sourceUrl);
    const dest = destinationKindFromUrl(resolved || value);
    if (dest === "pricing" || dest === "signup" || dest === "product") {
      return drop(["Pricing, signup, and product URLs are not contact methods."]);
    }
    if (dest === "booking" && resolved) {
      return keepAs("booking_link", { url: resolved, label: label || null }, candidate);
    }
    return { keep: true, candidate };
  }

  if (candidate.factType === "booking_link") {
    const url = String(data.url || "");
    const label = String(data.label || "");
    const network = socialNetworkFromUrl(url);
    if (network) {
      return keepAs("social_link", { network, url, label: label || null }, candidate);
    }
    const dest = destinationKindFromUrl(url);
    if (dest === "pricing" || dest === "signup") {
      return drop(["Signup, trial, pricing, and navigation links are not booking details."]);
    }
    if (dest === "product") {
      return drop(["Product pages are not booking destinations."]);
    }
    if (isSignupTrialOrNavCta(label, url)) {
      return drop(["Signup, trial, pricing, and navigation links are not booking details."]);
    }
    return { keep: true, candidate };
  }

  if (candidate.factType === "call_to_action") {
    const label = String(data.label || "");
    const url = typeof data.url === "string" ? data.url : null;
    const network = url ? socialNetworkFromUrl(url) : null;
    if (network && url) {
      return keepAs("social_link", { network, url, label }, candidate);
    }
    const dest = destinationKindFromUrl(url);
    if ((dest === "booking" || (url && isGenuineBookingOrDemo(label, url))) && url) {
      const resolved = absoluteFactUrl(url, candidate.sourceUrl);
      if (resolved) {
        return keepAs("booking_link", { url: resolved, label: label || null }, candidate);
      }
    }
    if (dest === "pricing" || dest === "signup" || dest === "product") {
      return drop(["Signup, trial, pricing, product, and navigation CTAs are not booking details."]);
    }
    if (isSignupTrialOrNavCta(label, url)) {
      return drop(["Signup, trial, pricing, and navigation CTAs are not booking details."]);
    }
    if (NAV_ONLY_RE.test(label.trim()) || (candidate.confidence < 0.5 && label.trim().split(/\s+/).length <= 3)) {
      return drop(["Skipped low-confidence navigation text that is not a business fact."]);
    }
    if (url && isSocialUrl(url)) {
      return drop(["Social profile URLs are not contact or booking details."]);
    }
    return { keep: true, candidate };
  }

  if (candidate.factType === "custom_fact") {
    const label = String(data.label || "");
    const value = String(data.value || "");
    const blob = `${label} ${value}`;
    if (looksLikeIndustryOrUseCase(blob)) {
      return keepAs("audience", { label: label || value, description: label ? value : null }, candidate);
    }
    const network = socialNetworkFromUrl(value) || socialNetworkFromUrl(label);
    if (network) {
      return keepAs(
        "social_link",
        { network, url: isSocialUrl(value) ? value : label, label: label || null },
        candidate,
      );
    }
    if (NAV_ONLY_RE.test(label.trim()) || NAV_ONLY_RE.test(value.trim())) {
      return drop(["Skipped navigation-only text that is not a business fact."]);
    }
    return { keep: true, candidate };
  }

  if (candidate.factType === "audience" || candidate.factType === "social_link") {
    return { keep: true, candidate };
  }

  return { keep: true, candidate };
}

export function sanitizeExtractedCandidates(candidates: FactCandidate[]): FactCandidate[] {
  const kept: FactCandidate[] = [];
  const byKey = new Map<string, FactCandidate>();

  for (const candidate of candidates) {
    const classified = classifyExtractedCandidate(candidate);
    if (!classified.keep) continue;
    const next = classified.candidate;
    const existing = byKey.get(next.factKey);
    if (!existing) {
      byKey.set(next.factKey, next);
      kept.push(next);
      continue;
    }
    if (next.factType === "pricing_plan" && existing.factType === "pricing_plan") {
      const merged = mergePricingPlanCandidates(existing, next);
      byKey.set(merged.factKey, merged);
      const idx = kept.findIndex((c) => c.factKey === merged.factKey);
      if (idx >= 0) kept[idx] = merged;
    }
  }

  return dropUmbrellaPricingPlans(kept);
}

function candidateIsCompletePricingPlan(candidate: FactCandidate): boolean {
  if (candidate.factType !== "pricing_plan") return false;
  return listedCandidatePrices(candidate.data as Record<string, unknown>).length > 0;
}

function incomingPricingPlanContaminates(existing: FactCandidate, incoming: FactCandidate): boolean {
  const da = existing.data as Record<string, unknown>;
  const db = incoming.data as Record<string, unknown>;
  const existingPrices = listedCandidatePrices(da);
  const incomingPrices = listedCandidatePrices(db);
  const existingSubs = subscriptionPrices(existingPrices);
  const incomingGrowth = looksLikeGrowthEngineOffer(db, incomingPrices);
  if (incomingGrowth && existingSubs.length > 0 && subscriptionPrices(incomingPrices).length === 0) {
    return true;
  }
  if (existingSubs.length > 0 && oncePrices(incomingPrices).length > 0 && subscriptionPrices(incomingPrices).length === 0) {
    return true;
  }
  if (isUmbrellaCommercialName(String(db.name || ""), incoming.sourceTitle) && candidateIsCompletePricingPlan(existing)) {
    return true;
  }
  if (incomingPrices.length === 0 && existingPrices.length > 0) {
    return true;
  }
  return false;
}

export function mergePricingPlanCandidates(a: FactCandidate, b: FactCandidate): FactCandidate {
  const complete = candidateIsCompletePricingPlan(a)
    ? a
    : candidateIsCompletePricingPlan(b)
      ? b
      : (a.confidence || 0) >= (b.confidence || 0)
        ? a
        : b;
  const incoming = complete === a ? b : a;
  if (incomingPricingPlanContaminates(complete, incoming)) {
    const prices = listedCandidatePrices(complete.data as Record<string, unknown>);
    const rebuilt = rebuildCandidate(
      complete,
      complete.data,
      reasonsForPricingPlan(complete.reviewReasons || [], prices),
    );
    return rebuilt || complete;
  }

  const da = a.data as Record<string, unknown>;
  const db = b.data as Record<string, unknown>;
  const aPrices = listedCandidatePrices(da);
  const bPrices = listedCandidatePrices(db);
  const aGrowth = looksLikeGrowthEngineOffer(da, aPrices);
  const bGrowth = looksLikeGrowthEngineOffer(db, bPrices);
  const mixedGrowthOntoSubscription =
    aGrowth !== bGrowth &&
    (subscriptionPrices(aPrices).length > 0 || subscriptionPrices(bPrices).length > 0);

  const pricePool = mixedGrowthOntoSubscription
    ? [...subscriptionPrices(aPrices), ...subscriptionPrices(bPrices)]
    : [...aPrices, ...bPrices];
  const prices = uniquePlanPrices(pricePool[0] ?? null, pricePool.slice(1));

  const incomingBenefits = ((incoming.data as { benefits?: string[] }).benefits || [])
    .map((s) => s.trim())
    .filter(Boolean);
  const completeBenefits = ((complete.data as { benefits?: string[] }).benefits || [])
    .map((s) => s.trim())
    .filter(Boolean);
  const takeIncomingBenefits =
    !mixedGrowthOntoSubscription && !looksLikeGrowthEngineOffer(incoming.data as Record<string, unknown>);
  const benefits = [...new Set([...completeBenefits, ...(takeIncomingBenefits ? incomingBenefits : [])])].slice(0, 30);

  const preferred = a.origin === "website_verified" ? a : b.origin === "website_verified" ? b : complete;
  const origin =
    a.origin === "website_verified" || b.origin === "website_verified"
      ? "website_verified"
      : preferred.origin;
  const completeData = complete.data as Record<string, unknown>;
  const incomingData = incoming.data as Record<string, unknown>;
  const incomingUrl = typeof incomingData.planUrl === "string" ? incomingData.planUrl : null;
  const completeUrl = typeof completeData.planUrl === "string" ? completeData.planUrl : null;
  const planUrl =
    completeUrl || (incomingUrl && !GROWTH_ENGINE_PATH_RE.test(incomingUrl) ? incomingUrl : completeUrl);

  const rebuilt = rebuildCandidate(
    { ...preferred, origin },
    {
      ...completeData,
      name: completeData.name || incomingData.name,
      description: completeData.description || incomingData.description,
      price: prices[0] ?? null,
      additionalPrices: prices.slice(1),
      benefits,
      planUrl,
    },
    reasonsForPricingPlan(
      [...(complete.reviewReasons || []), ...(incomingPricesComplete(incoming) ? incoming.reviewReasons || [] : [])],
      prices,
    ),
  );
  return rebuilt || complete;
}

function incomingPricesComplete(candidate: FactCandidate): boolean {
  return listedCandidatePrices(candidate.data as Record<string, unknown>).length > 0;
}

export function collectReviewReasons(fact: Pick<KnowledgeFact, "factType" | "data" | "reviewReasons" | "provenance" | "confidence">): string[] {
  const reasons: string[] = [];
  const add = (reason: string | null | undefined) => {
    if (reason && !reasons.includes(reason)) reasons.push(reason);
  };
  for (const reason of fact.reviewReasons || []) add(reason);
  for (const entry of fact.provenance || []) {
    for (const reason of entry.reviewReasons || []) add(reason);
  }
  if (fact.factType === "pricing_plan") {
    const d = fact.data as { name?: string; price?: FactMoney | null; additionalPrices?: FactMoney[] };
    const prices = uniquePlanPrices(d.price, d.additionalPrices || []);
    if (prices.length === 0) {
      add(MISSING_PRICE_REVIEW_REASON);
    } else {
      const kept = reasons.filter((reason) => !isStaleMissingPriceReason(reason));
      reasons.length = 0;
      for (const reason of kept) reasons.push(reason);
      for (const price of prices) {
        if (price.amount === 0 && d.name && planLooksPaid(d.name) && !planLooksFree(d.name)) {
          add(`“${d.name}” looks like a paid plan, so an inferred $0 price must not be published.`);
        }
      }
    }
  }
  return reasons;
}

export function factNeedsReview(fact: Pick<KnowledgeFact, "factType" | "data" | "reviewReasons" | "provenance" | "confidence" | "state">): boolean {
  if (fact.state === "published") return false;
  return collectReviewReasons(fact).length > 0;
}

/** Paid plans stored as $0 (or missing interval filled as one-time) must not go live. */
export function validateFactForPublish(
  fact: KnowledgeFact,
): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (fact.proposedAction === "source_removed") {
    reasons.push(SOURCE_REMOVED_REVIEW_MESSAGE);
  }
  if (fact.factType === "pricing_plan") {
    const d = fact.data as {
      name: string;
      price?: FactMoney | null;
      additionalPrices?: FactMoney[];
    };
    const prices = uniquePlanPrices(d.price, d.additionalPrices || []);
    for (const price of prices) {
      if (price.amount === 0 && planLooksPaid(d.name) && !planLooksFree(d.name)) {
        reasons.push(`“${d.name}” is a paid plan and cannot be published at $0.`);
      }
    }
  }
  if (fact.factType === "location") {
    if (!locationHasPhysicalSignal(fact.data as Record<string, unknown>)) {
      reasons.push("Locations and Hours cannot include industries or use cases.");
    }
  }
  if (fact.factType === "contact_method" || fact.factType === "booking_link" || fact.factType === "call_to_action") {
    const url =
      fact.factType === "contact_method"
        ? String((fact.data as { value?: string }).value || "")
        : String((fact.data as { url?: string }).url || "");
    const label =
      fact.factType === "contact_method"
        ? String((fact.data as { label?: string }).label || "")
        : String((fact.data as { label?: string }).label || "");
    if (isSocialUrl(url)) reasons.push("Social links cannot be published as contact or booking details.");
    if (isSignupTrialOrNavCta(label, url) && fact.factType !== "contact_method") {
      reasons.push("Signup, trial, pricing, and navigation CTAs cannot be published as booking details.");
    }
  }
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

export function isDraftFromRemovedSource(
  fact: Pick<KnowledgeFact, "state" | "sourceId" | "provenance" | "userEdited" | "isPinned" | "proposedAction" | "origin">,
  activeSourceIds: Set<string>,
): boolean {
  if (fact.state !== "draft") return false;
  if (fact.userEdited || fact.isPinned) return false;
  if (fact.proposedAction === "source_removed") return true;
  if (fact.origin === "user_entered" || fact.origin === "user_edited") return false;
  if (fact.sourceId) return !activeSourceIds.has(fact.sourceId);
  const ids = (fact.provenance || []).map((p) => p.sourceId).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return false;
  return ids.every((id) => !activeSourceIds.has(id));
}

export function workspaceHasRemovedSourceNotice(
  facts: Array<Pick<KnowledgeFact, "state" | "sourceId" | "provenance" | "proposedAction">>,
  activeSourceIds: Set<string>,
): boolean {
  for (const fact of facts) {
    if (fact.proposedAction === "source_removed") return true;
    if (fact.state === "draft" && fact.sourceId && !activeSourceIds.has(fact.sourceId)) return true;
    const ids = (fact.provenance || []).map((p) => p.sourceId).filter((id): id is string => Boolean(id));
    if (ids.length > 0 && ids.every((id) => !activeSourceIds.has(id))) return true;
  }
  return false;
}

/**
 * Rewrite AI JSON before zod so missing amounts/intervals are omitted rather than
 * coerced into { amount: 0, billingPeriod: "once" }.
 */
export function preprocessAiFactData(factType: unknown, data: unknown): unknown {
  if (!isRecord(data)) return data;
  if (factType !== "pricing_plan" && factType !== "product" && factType !== "service") return data;

  const planName = typeof data.name === "string" ? data.name : "";
  const extras = Array.isArray(data.additionalPrices) ? data.additionalPrices : [];
  const prices: FactMoney[] = [];
  let omittedReason: string | null = null;

  for (const raw of [data.price, ...extras]) {
    if (raw == null) continue;
    const result = normalizeExtractedMoney(raw, { planName });
    if ("money" in result && result.money) prices.push(result.money);
    else if ("reason" in result) omittedReason = result.reason;
  }

  if (factType === "pricing_plan") {
    const unique = uniquePlanPrices(prices[0], prices.slice(1));
    return {
      ...data,
      price: unique[0] ?? null,
      additionalPrices: unique.slice(1),
      reviewReasons: omittedReason && unique.length === 0 ? [omittedReason] : data.reviewReasons,
    };
  }

  return {
    ...data,
    price: prices[0] ?? null,
  };
}
