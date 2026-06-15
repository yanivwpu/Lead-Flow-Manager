/**
 * Unified buyer matching pipeline trace — single source of truth.
 * Grep: [BuyerMatchingTrace]
 *
 * message → parsedPatch → previousProfile → mergedProfile → savedProfile
 * → matchingProfile → inventoryFilters → returnedListings → displayedChips
 * → displayedCards → copilotDecision
 */
import type { BuyerPreferenceExtractionPatch, BuyerPreferenceProfile } from "./buyerPreferenceSchema";
import type { BuyerPreferenceChip } from "./buyerPreferenceDisplay";
import { buildBuyerPreferenceSearchChips } from "./buyerPreferenceDisplay";
import { resolveMatchingBudgetBounds } from "./buyerPreferenceBudget";
import {
  buildPersistedProfileSnapshotForDiagnostics,
  describeActiveSearchFilters,
  snapshotPatchTraceFields,
  snapshotProfileTraceFields,
} from "./buyerSearchCommandDebug";
import {
  extractBuyerMatchCriteria,
  type BuyerMatchCriteria,
} from "./inventory/inventoryMatchScoring";
import {
  listingIsLikelySalePrice,
  listingPriceLooksLikeMonthlyRent,
} from "./inventory/listingTransactionIntent";

export const BUYER_MATCHING_TRACE_TAG = "[BuyerMatchingTrace]";
export const AI_RESPONSE_MISMATCH_FIELD = "AI_RESPONSE_MISMATCH";

export type BuyerMatchingTraceStep =
  | "message_received"
  | "parsed_patch"
  | "previous_profile"
  | "merged_profile"
  | "saved_profile"
  | "matching_profile"
  | "inventory_filters"
  | "returned_listings"
  | "displayed_chips"
  | "displayed_cards"
  | "copilot_decision"
  | "pipeline_complete";

export type BuyerMatchingTraceLayer =
  | "parse"
  | "merge"
  | "persist"
  | "matching"
  | "copilot"
  | "ui";

export type BuyerMatchingMismatch = {
  fromLayer: BuyerMatchingTraceLayer;
  toLayer: BuyerMatchingTraceLayer;
  field: string;
  expected: unknown;
  actual: unknown;
  hint: string;
};

export type BuyerMatchingListingSummary = {
  listingId: string;
  city: string | null;
  priceCents: number | null;
  beds: number | null;
  baths: number | null;
  propertyType: string | null;
  score?: number;
};

export type BuyerMatchingTracePayload = {
  event?: "step" | "pipeline" | "warning";
  step: BuyerMatchingTraceStep;
  traceId: string;
  contactId: string;
  userId?: string | null;
  messageId?: string | null;
  conversationId?: string | null;
  source?: string;
  layer?: BuyerMatchingTraceLayer;
  message?: string | null;
  commandKind?: string | null;
  previousProfile?: ReturnType<typeof snapshotProfileTraceFields> | null;
  parsedPatch?: ReturnType<typeof snapshotPatchTraceFields> | null;
  mergedProfile?: ReturnType<typeof snapshotProfileTraceFields> | null;
  savedProfile?: ReturnType<typeof snapshotProfileTraceFields> | null;
  matchingProfile?: ReturnType<typeof buildPersistedProfileSnapshotForDiagnostics> | null;
  inventoryFilters?: string | null;
  returnedListings?: BuyerMatchingListingSummary[];
  matchCount?: number | null;
  displayedChips?: Array<{ id: string; label: string; value: string }>;
  displayedCardCount?: number | null;
  copilotDecisionReason?: string | null;
  primaryRecommendation?: string | null;
  qualificationState?: string | null;
  aiSuggestionPreview?: string | null;
  mismatches?: BuyerMatchingMismatch[];
  loggedAt?: string;
};

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].map((x) => x.toLowerCase()).sort();
  const sb = [...b].map((x) => x.toLowerCase()).sort();
  return sa.every((v, i) => v === sb[i]);
}

function fieldMismatch(
  fromLayer: BuyerMatchingTraceLayer,
  toLayer: BuyerMatchingTraceLayer,
  field: string,
  expected: unknown,
  actual: unknown,
  hint: string,
): BuyerMatchingMismatch | null {
  if (expected === actual) return null;
  if (Array.isArray(expected) && Array.isArray(actual) && arraysEqual(expected, actual)) return null;
  if (expected == null && actual == null) return null;
  return { fromLayer, toLayer, field, expected, actual, hint };
}

function aiMismatch(hint: string, expected: unknown, actual: unknown): BuyerMatchingMismatch {
  return {
    fromLayer: "copilot",
    toLayer: "matching",
    field: AI_RESPONSE_MISMATCH_FIELD,
    expected,
    actual,
    hint,
  };
}

function normalizePropertyToken(raw: string | null | undefined): string {
  return (raw || "").toLowerCase().replace(/[\s_-]+/g, "");
}

function listingPropertyFamily(propertyType: string | null | undefined): string | null {
  const t = normalizePropertyToken(propertyType);
  if (!t) return null;
  if (/condo|apartment|apt|unit|flat/.test(t)) return "apartment";
  if (/townhouse|townhome|rowhouse/.test(t)) return "townhouse";
  if (/house|sfh|singlefamily|detached|residential/.test(t)) return "house";
  return t;
}

function criteriaWantsFamily(criteria: BuyerMatchCriteria, family: string): boolean {
  return criteria.propertyTypes.some((t) => {
    const f = listingPropertyFamily(t);
    return f === family || (family === "house" && f === "house");
  });
}

function parseBudgetMaxFromText(text: string): number | null {
  const m = text.match(/\b(?:under|up to|below|max(?:imum)?)\s*\$?\s*([\d,.]+)\s*(k|m|million)?/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const suffix = (m[2] || "").toLowerCase();
  if (suffix === "k") n *= 1_000;
  if (suffix === "m" || suffix === "million") n *= 1_000_000;
  return Math.round(n);
}

function truncateMessage(text: string | null | undefined, max = 500): string | null {
  if (!text) return null;
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** Compare profile snapshots across layers. */
export function detectProfileSnapshotMismatches(
  from: ReturnType<typeof snapshotProfileTraceFields>,
  to: ReturnType<typeof snapshotProfileTraceFields> | ReturnType<typeof buildPersistedProfileSnapshotForDiagnostics>,
  fromLayer: BuyerMatchingTraceLayer,
  toLayer: BuyerMatchingTraceLayer,
): BuyerMatchingMismatch[] {
  const out: BuyerMatchingMismatch[] = [];
  const checks: Array<{ field: keyof typeof from; hint: string }> = [
    { field: "transactionIntent", hint: "buy/rent intent diverged between layers" },
    { field: "priceMin", hint: "budget min diverged between layers" },
    { field: "priceMax", hint: "budget max diverged between layers" },
    { field: "bedsMin", hint: "beds min diverged between layers" },
    { field: "pool", hint: "pool preference diverged between layers" },
    { field: "hardRequirePool", hint: "hard pool gate diverged between layers" },
  ];

  for (const { field, hint } of checks) {
    const m = fieldMismatch(fromLayer, toLayer, field, from[field], (to as typeof from)[field], hint);
    if (m) out.push(m);
  }

  if (!arraysEqual(from.propertyTypes ?? [], (to as typeof from).propertyTypes ?? [])) {
    out.push({
      fromLayer,
      toLayer,
      field: "propertyTypes",
      expected: from.propertyTypes,
      actual: (to as typeof from).propertyTypes,
      hint: "property types diverged between layers",
    });
  }
  if (!arraysEqual(from.areas ?? [], (to as typeof from).areas ?? [])) {
    out.push({
      fromLayer,
      toLayer,
      field: "areas",
      expected: from.areas,
      actual: (to as typeof from).areas,
      hint: "areas diverged between layers",
    });
  }
  return out;
}

/** Persisted profile vs UI chips. */
export function detectChipProfileMismatches(
  profile: BuyerPreferenceProfile,
  chips: BuyerPreferenceChip[],
): BuyerMatchingMismatch[] {
  const criteria = extractBuyerMatchCriteria(profile);
  const out: BuyerMatchingMismatch[] = [];
  const chipIds = new Set(chips.map((c) => c.id));
  const chipValues = chips.map((c) => c.value.toLowerCase()).join(" ");

  const budget = resolveMatchingBudgetBounds(profile);
  if ((budget.priceMax != null || budget.priceMin != null) && !chipIds.has("budget")) {
    out.push({
      fromLayer: "persist",
      toLayer: "ui",
      field: "budget",
      expected: "budget chip",
      actual: null,
      hint: "profile has budget but UI chips omit budget",
    });
  }
  if (criteria.areas.length > 0 && !chips.some((c) => c.id.startsWith("area:"))) {
    out.push({
      fromLayer: "persist",
      toLayer: "ui",
      field: "areas",
      expected: criteria.areas,
      actual: [],
      hint: "profile has areas but UI chips omit area chips",
    });
  }
  if (criteria.propertyTypes.length > 0 && !chipIds.has("propertyTypes")) {
    out.push({
      fromLayer: "persist",
      toLayer: "ui",
      field: "propertyTypes",
      expected: criteria.propertyTypes,
      actual: null,
      hint: "profile has property types but UI chips omit propertyTypes chip",
    });
  }
  if (criteria.hardRequirePool && !chipIds.has("pool") && !chipValues.includes("pool")) {
    out.push({
      fromLayer: "persist",
      toLayer: "ui",
      field: "pool",
      expected: "pool chip",
      actual: null,
      hint: "hardRequirePool set but UI chips omit pool",
    });
  }
  return out;
}

/** Matching criteria vs returned listings. */
export function detectMatchingListingsMismatches(
  profile: BuyerPreferenceProfile,
  listings: BuyerMatchingListingSummary[],
): BuyerMatchingMismatch[] {
  if (!listings.length) return [];
  const criteria = extractBuyerMatchCriteria(profile);
  const budget = resolveMatchingBudgetBounds(profile);
  const out: BuyerMatchingMismatch[] = [];

  for (const listing of listings.slice(0, 3)) {
    const priceCents = listing.priceCents;
    if (priceCents != null && budget.priceMax != null) {
      const maxCents = budget.priceMax * 100;
      if (priceCents > maxCents * 1.12) {
        out.push({
          fromLayer: "matching",
          toLayer: "matching",
          field: "priceMax",
          expected: `<= $${budget.priceMax.toLocaleString()}`,
          actual: `$${Math.round(priceCents / 100).toLocaleString()} (${listing.listingId})`,
          hint: "returned listing exceeds profile budget max",
        });
      }
    }

    if (criteria.transactionIntent === "buy" && priceCents != null && listingPriceLooksLikeMonthlyRent(priceCents)) {
      out.push({
        fromLayer: "matching",
        toLayer: "matching",
        field: "transactionIntent",
        expected: "buy/sale listings",
        actual: `rent-like price (${listing.listingId})`,
        hint: "buy intent but returned listing looks like monthly rent",
      });
    }
    if (criteria.transactionIntent === "rent" && priceCents != null && listingIsLikelySalePrice(priceCents)) {
      out.push({
        fromLayer: "matching",
        toLayer: "matching",
        field: "transactionIntent",
        expected: "rent/lease listings",
        actual: `sale-like price (${listing.listingId})`,
        hint: "rent intent but returned listing looks like sale price",
      });
    }

    const family = listingPropertyFamily(listing.propertyType);
    if (family && criteria.propertyTypes.length > 0) {
      if (criteriaWantsFamily(criteria, "house") && (family === "apartment" || family === "townhouse")) {
        out.push({
          fromLayer: "matching",
          toLayer: "matching",
          field: "propertyTypes",
          expected: criteria.propertyTypes,
          actual: listing.propertyType,
          hint: `house/SFH criteria but listing ${listing.listingId} is ${family}`,
        });
      }
      if (criteriaWantsFamily(criteria, "apartment") && family === "house") {
        out.push({
          fromLayer: "matching",
          toLayer: "matching",
          field: "propertyTypes",
          expected: criteria.propertyTypes,
          actual: listing.propertyType,
          hint: `apartment criteria but listing ${listing.listingId} is house/SFH`,
        });
      }
    }
  }

  return out;
}

/** Chips vs displayed listing cards. */
export function detectChipsCardsMismatches(
  chips: BuyerPreferenceChip[],
  listings: BuyerMatchingListingSummary[],
): BuyerMatchingMismatch[] {
  if (!chips.length || !listings.length) return [];
  const chipText = chips.map((c) => `${c.label} ${c.value}`).join(" ").toLowerCase();
  const out: BuyerMatchingMismatch[] = [];

  const chipsSayBuy = /\b(buy|purchase|for sale|sale)\b/.test(chipText);
  const chipsSayRent = /\b(rent|rental|lease|\/mo)\b/.test(chipText);
  const chipsSayHouse = /\b(house|sfh|single[- ]family)\b/.test(chipText);
  const chipsSayApt = /\b(apartment|condo|unit)\b/.test(chipText);

  const budgetChip = chips.find((c) => c.id === "budget")?.value ?? "";
  const budgetMax = parseBudgetMaxFromText(budgetChip);

  for (const listing of listings.slice(0, 3)) {
    const priceCents = listing.priceCents;
    if (budgetMax != null && priceCents != null && priceCents > budgetMax * 100 * 1.12) {
      out.push({
        fromLayer: "ui",
        toLayer: "ui",
        field: "budget",
        expected: budgetChip,
        actual: `$${Math.round(priceCents / 100).toLocaleString()} (${listing.listingId})`,
        hint: "chip budget does not match displayed listing card price",
      });
    }
    if (chipsSayBuy && priceCents != null && listingPriceLooksLikeMonthlyRent(priceCents)) {
      out.push({
        fromLayer: "ui",
        toLayer: "ui",
        field: "transactionIntent",
        expected: "buy chips",
        actual: `rent-like listing ${listing.listingId}`,
        hint: "chips imply buy but card looks like rental",
      });
    }
    if (chipsSayRent && priceCents != null && listingIsLikelySalePrice(priceCents)) {
      out.push({
        fromLayer: "ui",
        toLayer: "ui",
        field: "transactionIntent",
        expected: "rent chips",
        actual: `sale-like listing ${listing.listingId}`,
        hint: "chips imply rent but card looks like sale",
      });
    }
    const family = listingPropertyFamily(listing.propertyType);
    if (chipsSayHouse && family === "apartment") {
      out.push({
        fromLayer: "ui",
        toLayer: "ui",
        field: "propertyTypes",
        expected: "house/SFH chips",
        actual: listing.propertyType,
        hint: "chips say house/SFH but card is apartment/condo",
      });
    }
    if (chipsSayApt && family === "house") {
      out.push({
        fromLayer: "ui",
        toLayer: "ui",
        field: "propertyTypes",
        expected: "apartment/condo chips",
        actual: listing.propertyType,
        hint: "chips say apartment but card is house/SFH",
      });
    }
  }

  return out;
}

/** AI suggestion text vs matching output — always warn on conflict. */
export function detectAiResponseMismatches(params: {
  aiText: string;
  profile: BuyerPreferenceProfile;
  listings: BuyerMatchingListingSummary[];
}): BuyerMatchingMismatch[] {
  const text = params.aiText.trim();
  if (!text || !params.listings.length) return [];

  const criteria = extractBuyerMatchCriteria(params.profile);
  const budget = resolveMatchingBudgetBounds(params.profile);
  const out: BuyerMatchingMismatch[] = [];

  const aiSaysSale = /\b(for sale|buy(?:ing)?|purchase|homes? for sale|apartments? for sale|condos? for sale|houses? for sale)\b/i.test(text);
  const aiSaysRent = /\b(for rent|rental|lease|leasing|apartments? for rent|homes? for rent)\b/i.test(text);
  const aiSaysHouse = /\b(single[- ]family|sfh|detached home|houses?)\b/i.test(text);
  const aiSaysApt = /\b(apartments?|condos?)\b/i.test(text);
  const aiSaysTownhouse = /\b(town\s*house|townhome)\b/i.test(text);
  const aiBudgetMax = parseBudgetMaxFromText(text) ?? budget.priceMax;

  const rentalListings = params.listings.filter(
    (l) => l.priceCents != null && listingPriceLooksLikeMonthlyRent(l.priceCents),
  );
  const saleListings = params.listings.filter(
    (l) => l.priceCents != null && listingIsLikelySalePrice(l.priceCents),
  );

  if (aiSaysSale && rentalListings.length > 0 && saleListings.length === 0) {
    out.push(
      aiMismatch(
        'AI mentions "for sale" but returned listings look like rentals',
        "sale listings",
        rentalListings.map((l) => l.listingId),
      ),
    );
  }
  if (aiSaysRent && saleListings.length > 0 && rentalListings.length === 0) {
    out.push(
      aiMismatch(
        'AI mentions rent/lease but returned listings look like sales',
        "rental listings",
        saleListings.map((l) => l.listingId),
      ),
    );
  }

  if (aiSaysHouse) {
    const nonHouse = params.listings.filter((l) => {
      const f = listingPropertyFamily(l.propertyType);
      return f === "apartment" || f === "townhouse";
    });
    if (nonHouse.length === params.listings.length) {
      out.push(
        aiMismatch(
          'AI says single-family/houses but returned listings are not SFH',
          "house/SFH",
          params.listings.map((l) => l.propertyType),
        ),
      );
    }
  }

  if (aiSaysApt && !aiSaysTownhouse) {
    const houses = params.listings.filter((l) => listingPropertyFamily(l.propertyType) === "house");
    if (houses.length === params.listings.length) {
      out.push(
        aiMismatch(
          'AI says apartments/condos but returned listings are houses',
          "apartment/condo",
          params.listings.map((l) => l.propertyType),
        ),
      );
    }
  }

  if (aiSaysTownhouse) {
    const notTownhouse = params.listings.filter(
      (l) => listingPropertyFamily(l.propertyType) !== "townhouse",
    );
    if (notTownhouse.length === params.listings.length) {
      out.push(
        aiMismatch(
          "AI says townhouses but returned listings are not townhouses",
          "townhouse",
          params.listings.map((l) => l.propertyType),
        ),
      );
    }
  }

  if (aiBudgetMax != null) {
    const overBudget = params.listings.filter(
      (l) => l.priceCents != null && l.priceCents > aiBudgetMax * 100 * 1.12,
    );
    if (overBudget.length > 0) {
      out.push(
        aiMismatch(
          `AI says under $${aiBudgetMax.toLocaleString()} but listings exceed budget`,
          `<= $${aiBudgetMax.toLocaleString()}`,
          overBudget.map((l) => ({
            listingId: l.listingId,
            price: l.priceCents != null ? Math.round(l.priceCents / 100) : null,
          })),
        ),
      );
    }
  }

  if (criteria.transactionIntent === "buy" && rentalListings.length > 0 && aiSaysSale) {
    out.push(
      aiMismatch(
        "AI sale language with buy criteria but rental-shaped listing prices returned",
        criteria.transactionIntent,
        rentalListings.map((l) => l.listingId),
      ),
    );
  }

  return out;
}

export function summarizeListingsForTrace(
  matches: Array<{
    listingId: string;
    score?: number;
    listing?: {
      city?: string | null;
      priceCents?: number | null;
      beds?: number | null;
      baths?: number | null;
      propertyType?: string | null;
    };
  }>,
  limit = 5,
): BuyerMatchingListingSummary[] {
  return matches.slice(0, limit).map((m) => ({
    listingId: m.listingId,
    city: m.listing?.city ?? null,
    priceCents: m.listing?.priceCents ?? null,
    beds: m.listing?.beds ?? null,
    baths: m.listing?.baths ?? null,
    propertyType: m.listing?.propertyType ?? null,
    score: m.score,
  }));
}

/** @deprecated Use server/buyerMatchingTraceRegistry.resolveBuyerMatchingTraceId in server code. */
export function buildBuyerMatchingTraceId(
  contactId: string,
  messageId?: string | null,
  refreshAt?: number,
): string {
  const id = contactId.trim();
  if (!id) return `unknown:refresh:${refreshAt ?? Date.now()}`;
  if (messageId?.trim()) return `${id}:${messageId.trim()}`;
  return `${id}:refresh:${refreshAt ?? Date.now()}`;
}

export function isBuyerMatchingTraceVerbose(): boolean {
  if (typeof process !== "undefined" && process.env) {
    return (
      process.env.DEBUG_BUYER_MATCHING === "1" ||
      process.env.DEBUG_BUYER_PREFS === "1" ||
      process.env.DEBUG_REPLACEMENT_SEARCH === "1"
    );
  }
  return false;
}

function hasWarnings(payload: BuyerMatchingTracePayload): boolean {
  return (payload.mismatches?.length ?? 0) > 0 || payload.event === "warning";
}

function shouldEmitVerboseStep(payload: BuyerMatchingTracePayload): boolean {
  return isBuyerMatchingTraceVerbose() && !hasWarnings(payload);
}

/** Emit trace — warnings always; full steps only in debug mode. */
export function logBuyerMatchingTrace(payload: BuyerMatchingTracePayload): void {
  const mismatches = payload.mismatches ?? [];
  const body = {
    tag: BUYER_MATCHING_TRACE_TAG,
    event: mismatches.length > 0 ? "warning" : payload.event ?? "step",
    ...payload,
    message: truncateMessage(payload.message),
    aiSuggestionPreview: truncateMessage(payload.aiSuggestionPreview, 300),
    mismatches: mismatches.length ? mismatches : undefined,
    loggedAt: payload.loggedAt ?? new Date().toISOString(),
  };

  if (hasWarnings(body)) {
    console.warn(JSON.stringify(body));
    return;
  }
  if (shouldEmitVerboseStep(body)) {
    console.info(JSON.stringify(body));
  }
}

/** Legacy alias — routes to unified trace in verbose mode only. */
export function logReplacementSearchTraceAlias(
  legacyStep: string,
  payload: Record<string, unknown>,
): void {
  if (!isBuyerMatchingTraceVerbose()) return;
  logBuyerMatchingTrace({
    event: "step",
    step: "pipeline_complete",
    traceId: typeof payload.traceId === "string" ? payload.traceId : "unknown",
    contactId: typeof payload.contactId === "string" ? payload.contactId : "unknown",
    source: `ReplacementSearchTrace:${legacyStep}`,
    layer: "parse",
    mismatches: undefined,
    ...payload,
  } as BuyerMatchingTracePayload);
}

export type BuyerMatchingPipelineInput = {
  traceId: string;
  contactId: string;
  userId?: string | null;
  messageId?: string | null;
  conversationId?: string | null;
  source: string;
  message?: string | null;
  commandKind?: string | null;
  previousProfile?: BuyerPreferenceProfile | null;
  parsedPatch?: BuyerPreferenceExtractionPatch | null;
  mergedProfile?: BuyerPreferenceProfile | null;
  savedProfile?: BuyerPreferenceProfile | null;
  copilotDecisionReason?: string | null;
  primaryRecommendation?: string | null;
  qualificationState?: string | null;
};

export function traceBuyerMatchingPipeline(input: BuyerMatchingPipelineInput): BuyerMatchingMismatch[] {
  const mismatches: BuyerMatchingMismatch[] = [];
  const previous = input.previousProfile ? snapshotProfileTraceFields(input.previousProfile) : null;
  const parsed = input.parsedPatch ? snapshotPatchTraceFields(input.parsedPatch) : null;
  const merged = input.mergedProfile ? snapshotProfileTraceFields(input.mergedProfile) : null;
  const saved = input.savedProfile ? snapshotProfileTraceFields(input.savedProfile) : null;

  if (merged && saved) {
    mismatches.push(...detectProfileSnapshotMismatches(merged, saved, "merge", "persist"));
  }

  let matchingProfile: ReturnType<typeof buildPersistedProfileSnapshotForDiagnostics> | null = null;
  let inventoryFilters: string | null = null;

  if (input.savedProfile) {
    const criteria = extractBuyerMatchCriteria(input.savedProfile);
    matchingProfile = buildPersistedProfileSnapshotForDiagnostics(input.savedProfile, criteria);
    inventoryFilters = describeActiveSearchFilters(input.savedProfile, criteria);
    if (saved && matchingProfile) {
      mismatches.push(...detectProfileSnapshotMismatches(saved, matchingProfile, "persist", "matching"));
    }
  }

  const chips = input.savedProfile ? buildBuyerPreferenceSearchChips(input.savedProfile) : [];
  if (input.savedProfile) {
    mismatches.push(...detectChipProfileMismatches(input.savedProfile, chips));
  }

  logBuyerMatchingTrace({
    event: mismatches.length ? "warning" : "pipeline",
    step: "pipeline_complete",
    traceId: input.traceId,
    contactId: input.contactId,
    userId: input.userId,
    messageId: input.messageId,
    conversationId: input.conversationId,
    source: input.source,
    layer: mismatches.some((m) => m.toLayer === "ui") ? "ui" : "persist",
    message: input.message,
    commandKind: input.commandKind,
    previousProfile: previous,
    parsedPatch: parsed,
    mergedProfile: merged,
    savedProfile: saved,
    matchingProfile,
    inventoryFilters,
    displayedChips: chips.map((c) => ({ id: c.id, label: c.label, value: c.value })),
    copilotDecisionReason: input.copilotDecisionReason,
    primaryRecommendation: input.primaryRecommendation,
    qualificationState: input.qualificationState,
    mismatches,
  });

  return mismatches;
}

export function traceBuyerMatchingInventoryResult(input: {
  traceId: string;
  contactId: string;
  userId: string;
  source: string;
  profile: BuyerPreferenceProfile;
  matches: BuyerMatchingListingSummary[];
  matchCount: number;
  activeFilterSummary?: string | null;
}): BuyerMatchingMismatch[] {
  const criteria = extractBuyerMatchCriteria(input.profile);
  const saved = snapshotProfileTraceFields(input.profile);
  const matchingProfile = buildPersistedProfileSnapshotForDiagnostics(input.profile, criteria);
  const inventoryFilters = input.activeFilterSummary ?? describeActiveSearchFilters(input.profile, criteria);
  const mismatches = [
    ...detectProfileSnapshotMismatches(saved, matchingProfile, "persist", "matching"),
    ...detectMatchingListingsMismatches(input.profile, input.matches),
  ];

  logBuyerMatchingTrace({
    step: "returned_listings",
    traceId: input.traceId,
    contactId: input.contactId,
    userId: input.userId,
    source: input.source,
    layer: "matching",
    savedProfile: saved,
    matchingProfile,
    inventoryFilters,
    returnedListings: input.matches,
    matchCount: input.matchCount,
    mismatches,
  });

  return mismatches;
}

export function traceBuyerMatchingCopilotDecision(input: {
  traceId: string;
  contactId: string;
  userId: string;
  source: string;
  profile: BuyerPreferenceProfile;
  listings: BuyerMatchingListingSummary[];
  matchCount: number;
  copilotDecisionReason: string;
  primaryRecommendation?: string | null;
  qualificationState?: string | null;
  aiSuggestion?: string | null;
}): BuyerMatchingMismatch[] {
  const saved = snapshotProfileTraceFields(input.profile);
  const criteria = extractBuyerMatchCriteria(input.profile);
  const matchingProfile = buildPersistedProfileSnapshotForDiagnostics(input.profile, criteria);
  const inventoryFilters = describeActiveSearchFilters(input.profile, criteria);

  const mismatches = [
    ...detectMatchingListingsMismatches(input.profile, input.listings),
    ...(input.aiSuggestion
      ? detectAiResponseMismatches({
          aiText: input.aiSuggestion,
          profile: input.profile,
          listings: input.listings,
        })
      : []),
  ];

  logBuyerMatchingTrace({
    step: "copilot_decision",
    traceId: input.traceId,
    contactId: input.contactId,
    userId: input.userId,
    source: input.source,
    layer: "copilot",
    savedProfile: saved,
    matchingProfile,
    inventoryFilters,
    returnedListings: input.listings,
    matchCount: input.matchCount,
    copilotDecisionReason: input.copilotDecisionReason,
    primaryRecommendation: input.primaryRecommendation ?? null,
    qualificationState: input.qualificationState ?? null,
    aiSuggestionPreview: input.aiSuggestion ?? null,
    mismatches,
  });

  return mismatches;
}

export {
  snapshotPatchTraceFields,
  snapshotProfileTraceFields,
  buildPersistedProfileSnapshotForDiagnostics,
  describeActiveSearchFilters,
};
