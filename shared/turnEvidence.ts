/**
 * One tenant-scoped evidence bundle per AI turn.
 *
 * Generation, grounding, Auto-send, and privacy-safe diagnostics must all read this
 * object — never a parallel slice of tenant storage that the model did not see.
 */

import { createHash } from "node:crypto";
import { formatFactValue, type FactType } from "./businessKnowledgeFacts";
import type { RetrievedFact } from "./knowledgeRetrieval";

export const WEBSITE_KNOWLEDGE_PROMPT_LIMIT = 3500;

export const EVIDENCE_SOURCE_TYPES = [
  "published_fact",
  "live_offer",
  "business_profile",
  "website_chunk",
] as const;

export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

export type LiveOfferEvidenceInput = {
  providerId?: string;
  summary: string;
  data?: Record<string, unknown> | null;
};

export type ExtractedAmount = {
  amount: string;
  currency: string | null;
  interval: string | null;
  identity: string | null;
  sourceType: EvidenceSourceType;
  supportsAuto: boolean;
};

export type TurnEvidenceItem = {
  sourceType: EvidenceSourceType;
  text: string;
  factType?: string;
  identity: string | null;
  stale: boolean;
  inactive: boolean;
  amounts: ExtractedAmount[];
};

export type TurnEvidenceBundle = {
  userId: string;
  items: TurnEvidenceItem[];
  publishedFactCount: number;
  publishedFactTypes: string[];
  liveOfferRecordCount: number;
  tenantKnowledgeChunkCount: number;
  tenantKnowledgeAmountCount: number;
  supportedAmountSourceTypes: EvidenceSourceType[];
  conflictingIdentities: string[];
  conflictReason: string | null;
  promptWebsiteText: string;
  promptProfileText: string;
};

const CURRENCY_CODES = "USD|EUR|GBP|ILS|JPY|INR|CAD|AUD|NZD|CHF|BRL|MXN|ZAR|AED|SAR|TRY|SGD|HKD|KRW|CNY";
const CURRENCY_AMOUNT_RE = new RegExp(
  `(?:US\\$|R\\$|C\\$|A\\$|[$€£₪¥₹₩₺])\\s*\\d[\\d.,]*|\\b(?:${CURRENCY_CODES})\\s*\\d[\\d.,]*|\\b\\d[\\d.,]*\\s*(?:${CURRENCY_CODES})\\b`,
  "gi",
);
const BARE_RATE_RE =
  /\b(\d{1,5}(?:\.\d{1,2})?)\s*(?:\/\s*|per\s+)(month|months|mo|year|years|yr|week|weeks|wk|day|days)\b/gi;

const SKIP_AMOUNT_FACT_TYPES = new Set<string>([
  "contact_method",
  "booking_link",
  "location",
  "business_hours",
  "service_area",
]);

const INACTIVE_STATUSES = new Set(["unavailable", "draft", "inactive", "archived", "waitlist"]);

function normalizeAmount(raw: string): string {
  return raw.replace(/[^\d.,]/g, "").replace(/,(?=\d{3}\b)/g, "");
}

function integerDigitCount(amount: string): number {
  return amount.split(".")[0]?.replace(/\D/g, "").length ?? 0;
}

function isPlausiblePriceAmount(amount: string): boolean {
  if (!amount) return false;
  const digits = integerDigitCount(amount);
  return digits >= 1 && digits <= 6;
}

function normalizeInterval(raw: string | null | undefined): string | null {
  const v = String(raw || "").toLowerCase();
  if (!v) return null;
  if (v.startsWith("month") || v === "mo") return "month";
  if (v.startsWith("year") || v === "yr") return "year";
  if (v.startsWith("week") || v === "wk") return "week";
  if (v.startsWith("day")) return "day";
  if (v === "once") return "once";
  if (v === "quarter") return "quarter";
  return v;
}

export function normalizeEvidenceIdentity(value: string | null | undefined): string | null {
  const t = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (t.length < 3) return null;
  return t.slice(0, 80);
}

function identityFromLine(line: string, amountRaw: string): string | null {
  const idx = line.toLowerCase().indexOf(amountRaw.toLowerCase());
  const prefix = idx >= 0 ? line.slice(0, idx) : line;
  const segment = (prefix.split(/[.;,•]/).pop() || prefix)
    .replace(/[:|–—,-]+$/g, "")
    .replace(/\b(?:price|cost|fee|rate|from|only|just|for|a|an|the|our|with|is|are)\b/gi, "")
    .trim();
  const words = segment.split(/\s+/).filter(Boolean);
  return normalizeEvidenceIdentity(words.slice(-6).join(" "));
}

function currencyFromMatch(raw: string): string | null {
  const t = raw.toUpperCase();
  const code = t.match(/\b(USD|EUR|GBP|ILS|JPY|INR|CAD|AUD|NZD|CHF)\b/);
  if (code) return code[1];
  if (/[€]/.test(raw)) return "EUR";
  if (/[£]/.test(raw)) return "GBP";
  if (/[$]/.test(raw)) return "USD";
  return null;
}

/**
 * Pulls currency amounts and "29/month"-style rates from selected evidence text.
 * Phone-length numbers and contact-method rows are ignored.
 */
export function extractSupportedAmountsFromText(
  text: string,
  sourceType: EvidenceSourceType,
): ExtractedAmount[] {
  const src = String(text || "");
  if (!src.trim()) return [];
  const out: ExtractedAmount[] = [];
  const seen = new Set<string>();

  const push = (amount: string, currency: string | null, interval: string | null, identity: string | null) => {
    if (!isPlausiblePriceAmount(amount)) return;
    const key = `${amount}|${interval || ""}|${identity || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      amount,
      currency,
      interval: normalizeInterval(interval),
      identity,
      sourceType,
      supportsAuto: true,
    });
  };

  for (const line of src.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const match of trimmed.matchAll(CURRENCY_AMOUNT_RE)) {
      const raw = match[0];
      const amount = normalizeAmount(raw);
      const after = trimmed.slice((match.index ?? 0) + raw.length, (match.index ?? 0) + raw.length + 24);
      const intervalMatch = after.match(/^\s*(?:\/\s*|per\s+)?(month|months|mo|year|years|yr|week|weeks|wk|day|days)\b/i);
      push(amount, currencyFromMatch(raw), intervalMatch?.[1] ?? null, identityFromLine(trimmed, raw));
    }
    for (const match of trimmed.matchAll(BARE_RATE_RE)) {
      push(match[1], null, match[2], identityFromLine(trimmed, match[0]));
    }
  }
  return out;
}

function liveOfferIsInactive(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  const status = String(data.status || "").toLowerCase();
  const availability = String(data.availability || "").toLowerCase();
  const active = data.active;
  if (active === false) return true;
  if (INACTIVE_STATUSES.has(status) || INACTIVE_STATUSES.has(availability)) return true;
  if (data.archivedAt) return true;
  return false;
}

function liveOfferIdentity(data: Record<string, unknown> | null | undefined, summary: string): string | null {
  return (
    normalizeEvidenceIdentity(String(data?.displayName || data?.internalName || "")) ||
    identityFromLine(summary, extractSupportedAmountsFromText(summary, "live_offer")[0]?.amount || "")
  );
}

function conflictReasonForIdentities(identities: string[]): string | null {
  if (identities.length === 0) return null;
  return "conflicting_selected_prices";
}

/**
 * Build the turn bundle from the exact slices that will enter the model prompt.
 * Callers must not later add tenant storage that is not represented here.
 */
export function buildTurnEvidenceBundle(params: {
  userId: string;
  retrieved?: RetrievedFact[];
  conflictingKeys?: string[];
  liveRecords?: LiveOfferEvidenceInput[];
  servicesProducts?: string | null;
  /** Already extracted and capped website chunk that will enter the prompt. */
  websiteKnowledgeText?: string | null;
}): TurnEvidenceBundle {
  const userId = String(params.userId || "").trim();
  const blocked = new Set(params.conflictingKeys ?? []);
  const items: TurnEvidenceItem[] = [];

  for (const entry of params.retrieved ?? []) {
    const factType = entry.fact.factType as FactType;
    const text = formatFactValue(entry.fact);
    const stale = entry.freshness.tier === "stale";
    const skipAmounts = SKIP_AMOUNT_FACT_TYPES.has(factType) || blocked.has(entry.fact.factKey);
    const identity =
      normalizeEvidenceIdentity(
        String(
          (entry.fact.data as { name?: string; label?: string } | undefined)?.name ||
            (entry.fact.data as { label?: string } | undefined)?.label ||
            "",
        ),
      );
    const amounts = skipAmounts
      ? []
      : extractSupportedAmountsFromText(text, "published_fact").map((a) => ({
          ...a,
          identity: a.identity || identity,
          supportsAuto: !stale && !blocked.has(entry.fact.factKey),
        }));
    items.push({
      sourceType: "published_fact",
      text,
      factType,
      identity,
      stale,
      inactive: false,
      amounts,
    });
  }

  let liveOfferRecordCount = 0;
  for (const record of params.liveRecords ?? []) {
    const summary = String(record.summary || "").trim();
    if (!summary) continue;
    if (record.providerId && record.providerId !== "businessPackages") continue;
    liveOfferRecordCount += 1;
    const inactive = liveOfferIsInactive(record.data);
    const identity = liveOfferIdentity(record.data ?? null, summary);
    const amounts = extractSupportedAmountsFromText(summary, "live_offer").map((a) => ({
      ...a,
      identity: a.identity || identity,
      supportsAuto: !inactive,
    }));
    items.push({
      sourceType: "live_offer",
      text: summary,
      identity,
      stale: false,
      inactive,
      amounts,
    });
  }

  const promptProfileText = String(params.servicesProducts || "").trim();
  const promptWebsiteText = String(params.websiteKnowledgeText || "")
    .trim()
    .slice(0, WEBSITE_KNOWLEDGE_PROMPT_LIMIT);

  let tenantKnowledgeChunkCount = 0;
  if (promptProfileText) {
    tenantKnowledgeChunkCount += 1;
    items.push({
      sourceType: "business_profile",
      text: promptProfileText,
      identity: null,
      stale: false,
      inactive: false,
      amounts: extractSupportedAmountsFromText(promptProfileText, "business_profile"),
    });
  }
  if (promptWebsiteText) {
    tenantKnowledgeChunkCount += 1;
    items.push({
      sourceType: "website_chunk",
      text: promptWebsiteText,
      identity: null,
      stale: false,
      inactive: false,
      amounts: extractSupportedAmountsFromText(promptWebsiteText, "website_chunk"),
    });
  }

  const supporting = items.flatMap((item) => item.amounts.filter((a) => a.supportsAuto));
  const byIdentity = new Map<string, Set<string>>();
  for (const amount of supporting) {
    if (!amount.identity) continue;
    const set = byIdentity.get(amount.identity) ?? new Set<string>();
    set.add(amount.amount);
    byIdentity.set(amount.identity, set);
  }
  const conflictingIdentities = [...byIdentity.entries()]
    .filter(([, amounts]) => amounts.size > 1)
    .map(([identity]) => identity);

  const sourceTypes = [...new Set(supporting.map((a) => a.sourceType))];
  const publishedTypes = [
    ...new Set(
      items.filter((i) => i.sourceType === "published_fact" && i.factType).map((i) => i.factType as string),
    ),
  ];

  return {
    userId,
    items,
    publishedFactCount: (params.retrieved ?? []).length,
    publishedFactTypes: publishedTypes,
    liveOfferRecordCount,
    tenantKnowledgeChunkCount,
    tenantKnowledgeAmountCount: items
      .filter((i) => i.sourceType === "business_profile" || i.sourceType === "website_chunk")
      .reduce((n, i) => n + i.amounts.length, 0),
    supportedAmountSourceTypes: sourceTypes,
    conflictingIdentities,
    conflictReason: conflictReasonForIdentities(conflictingIdentities),
    promptWebsiteText,
    promptProfileText,
  };
}

export function supportingAmounts(bundle: TurnEvidenceBundle): ExtractedAmount[] {
  const blocked = new Set(bundle.conflictingIdentities);
  return bundle.items.flatMap((item) =>
    item.amounts.filter((a) => a.supportsAuto && (!a.identity || !blocked.has(a.identity))),
  );
}

export function draftAmountsFromText(draft: string): ExtractedAmount[] {
  return extractSupportedAmountsFromText(draft, "website_chunk").map((a) => ({
    ...a,
    sourceType: "website_chunk",
  }));
}

export type AmountGroundingResult = {
  ok: boolean;
  unsupportedAmounts: string[];
  conflictReason: string | null;
};

function identitiesCompatible(claimed: string | null, evidence: string | null): boolean {
  if (!claimed || !evidence) return true;
  if (claimed === evidence) return true;
  return claimed.includes(evidence) || evidence.includes(claimed);
}

export function evaluateBundleAmountGrounding(params: {
  draft: string;
  bundle: TurnEvidenceBundle;
}): AmountGroundingResult {
  const draftAmounts = extractSupportedAmountsFromText(params.draft, "website_chunk");
  if (draftAmounts.length === 0) {
    return { ok: true, unsupportedAmounts: [], conflictReason: params.bundle.conflictReason };
  }

  const draftLower = params.draft.toLowerCase();
  const namedConflict = params.bundle.conflictingIdentities.some((id) => draftLower.includes(id));
  if (namedConflict || params.bundle.conflictReason) {
    return {
      ok: false,
      unsupportedAmounts: [],
      conflictReason: params.bundle.conflictReason || "conflicting_selected_prices",
    };
  }

  const supported = supportingAmounts(params.bundle);
  const unsupportedAmounts: string[] = [];
  for (const claimed of draftAmounts) {
    const matches = supported.filter((s) => s.amount === claimed.amount);
    if (matches.length === 0) {
      if (!unsupportedAmounts.includes(claimed.amount)) unsupportedAmounts.push(claimed.amount);
      continue;
    }
    if (claimed.identity) {
      const compatible = matches.filter(
        (s) => !s.identity || identitiesCompatible(claimed.identity, s.identity),
      );
      if (compatible.length === 0 && !unsupportedAmounts.includes(claimed.amount)) {
        unsupportedAmounts.push(claimed.amount);
      }
    }
  }

  return {
    ok: unsupportedAmounts.length === 0,
    unsupportedAmounts,
    conflictReason: params.bundle.conflictReason,
  };
}

export function evidenceDiagnostics(bundle: TurnEvidenceBundle): {
  liveOfferRecordCount: number;
  tenantKnowledgeChunkCount: number;
  tenantKnowledgeAmountCount: number;
  supportedAmountSourceTypes: string;
  publishedFactCount: number;
  publishedFactTypeCounts: string;
  conflictReason: string | null;
} {
  const typeCounts = new Map<string, number>();
  for (const item of bundle.items) {
    if (item.sourceType !== "published_fact" || !item.factType) continue;
    typeCounts.set(item.factType, (typeCounts.get(item.factType) || 0) + 1);
  }
  const publishedFactTypeCounts = [...typeCounts.entries()]
    .map(([type, count]) => `${type}:${count}`)
    .sort()
    .join(",");
  return {
    liveOfferRecordCount: bundle.liveOfferRecordCount,
    tenantKnowledgeChunkCount: bundle.tenantKnowledgeChunkCount,
    tenantKnowledgeAmountCount: bundle.tenantKnowledgeAmountCount,
    supportedAmountSourceTypes: bundle.supportedAmountSourceTypes.join(","),
    publishedFactCount: bundle.publishedFactCount,
    publishedFactTypeCounts,
    conflictReason: bundle.conflictReason,
  };
}

/** Privacy-safe fingerprint of selected published fact types for this tenant turn. */
export function hashPublishedFactTypes(userId: string, types: string[]): string {
  return createHash("sha256")
    .update(`${userId}|${[...types].sort().join(",")}`)
    .digest("hex")
    .slice(0, 16);
}
