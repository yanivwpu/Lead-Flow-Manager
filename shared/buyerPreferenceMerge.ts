import type {
  BuyerGeoConstraint,
  BuyerPreferenceExtractionPatch,
  BuyerPreferenceProfile,
  PreferenceField,
  PreferenceSource,
} from "./buyerPreferenceSchema";
import { deriveProfileStatus } from "./buyerPreferenceSchema";
import type { PreferenceArrayReplaceKey } from "./buyerPreferenceInventorySignals";
import {
  isShowMeAllPropertyRelaxEvidence,
  isExplicitPropertyTypeEvidence,
  stripSfhFromMustHaves,
} from "./buyerPreferencePropertyTypeRelax";
import {
  isPlausibleRentBudgetAmount,
  isPlausibleSaleBudgetAmount,
  isRentIntentEvidence,
  isSaleScaleBudgetAmount,
} from "./buyerRentIntent";
import {
  clearStaleSoftAreas,
  filterSoftMustHaves,
  HARD_SEARCH_FILTER_KEYS,
} from "./buyerPreferenceFieldClassification";

const CONTRADICTION_RE =
  /\b(actually|instead|no longer|don't need|do not need|not anymore|changed my mind|rather than)\b/i;

function sourceRank(source: PreferenceSource): number {
  return source === "explicit" ? 2 : 1;
}

function shouldReplaceField<T>(
  existing: PreferenceField<T> | undefined,
  incoming: PreferenceField<T>,
): boolean {
  if (!existing) return true;
  const incRank = sourceRank(incoming.source);
  const exRank = sourceRank(existing.source);
  if (incRank > exRank) return true;
  if (incRank < exRank) return false;
  if (incoming.confidence >= existing.confidence + 0.08) return true;
  if (incoming.confidence + 0.08 < existing.confidence) return false;
  const evidence = incoming.evidence || "";
  if (CONTRADICTION_RE.test(evidence)) return true;
  return incoming.updatedAt >= existing.updatedAt;
}

function mergeStringArrays(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...a, ...b]) {
    const t = s.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.slice(0, 30);
}

function replaceArrayField(incoming: PreferenceField<string[]>): PreferenceField<string[]> {
  const values = (incoming.value || []).map((s) => s.trim()).filter(Boolean);
  return {
    ...incoming,
    value: [...new Set(values)],
  };
}

function replaceGeoConstraintsField(
  incoming: PreferenceField<BuyerGeoConstraint[]>,
): PreferenceField<BuyerGeoConstraint[]> {
  const values = (incoming.value || []).filter(
    (c) => c && typeof c.referenceId === "string" && c.referenceId.trim(),
  );
  return { ...incoming, value: values };
}

function mergeArrayField(
  existing: PreferenceField<string[]> | undefined,
  incoming: PreferenceField<string[]>,
): PreferenceField<string[]> {
  const mergedValues = mergeStringArrays(existing?.value || [], incoming.value || []);
  const boostedConfidence = Math.min(
    1,
    Math.max(existing?.confidence || 0, incoming.confidence) +
      (existing && mergedValues.length > (existing.value?.length || 0) ? 0.05 : 0),
  );
  return {
    value: mergedValues,
    source:
      sourceRank(incoming.source) >= sourceRank(existing?.source || "inferred")
        ? incoming.source
        : existing!.source,
    confidence: boostedConfidence,
    updatedAt: incoming.updatedAt,
    evidence: incoming.evidence || existing?.evidence,
    conversationId: incoming.conversationId || existing?.conversationId,
    messageId: incoming.messageId || existing?.messageId,
  };
}

function isPoolOptionalEvidence(evidence: string | undefined): boolean {
  return !!evidence && /pool optional in message/i.test(evidence);
}

function mergeScalarField<T>(
  existing: PreferenceField<T> | undefined,
  incoming: PreferenceField<T>,
): PreferenceField<T> {
  if (!shouldReplaceField(existing, incoming)) {
    return existing!;
  }
  return { ...incoming };
}

function isBedBathCorrectionEvidence(evidence: string | undefined): boolean {
  return !!evidence && /beds correction|beds too big correction/i.test(evidence);
}

function isUpToBudgetEvidence(evidence: string | undefined): boolean {
  return !!evidence && /\bup\s+to\b/i.test(evidence);
}

function isBudgetRangeEvidence(evidence: string | undefined): boolean {
  return !!evidence && /budget range|between|range in message/i.test(evidence);
}

function isPlausibleSaleBudgetAmountLocal(n: number): boolean {
  return isPlausibleSaleBudgetAmount(n);
}

function isPlausibleRentBudgetAmount(n: number): boolean {
  return Number.isFinite(n) && n >= 400 && n <= 50_000;
}

function budgetPlausibilityMode(
  profile: BuyerPreferenceProfile,
  patch: BuyerPreferenceExtractionPatch,
): "sale" | "rent" {
  if (patch.transactionIntent?.value === "buy") return "sale";
  if (patch.transactionIntent?.value === "rent") return "rent";
  if (profile.transactionIntent?.value === "rent") return "rent";
  return "sale";
}

function isPlausibleBudgetAmount(n: number, mode: "sale" | "rent"): boolean {
  return mode === "rent" ? isPlausibleRentBudgetAmount(n) : isPlausibleSaleBudgetAmountLocal(n);
}

function isBuyIntentEvidence(evidence: string | undefined): boolean {
  return !!evidence && /buy intent|for sale|homes?\s+for\s+sale|purchase/i.test(evidence);
}

function isMonthlyRentBudgetAmount(n: number): boolean {
  return Number.isFinite(n) && n >= 400 && n <= 50_000;
}

/** Clear monthly rent caps when buyer pivots to a for-sale search. */
function clearMonthlyRentBudgetFields(profile: BuyerPreferenceProfile): void {
  if (typeof profile.priceMin?.value === "number" && isMonthlyRentBudgetAmount(profile.priceMin.value)) {
    delete profile.priceMin;
  }
  if (typeof profile.priceMax?.value === "number" && isMonthlyRentBudgetAmount(profile.priceMax.value)) {
    delete profile.priceMax;
  }
}

const RENT_ONLY_PREFERENCE_KEYS = ["shortTermRentalAllowed", "petFriendly"] as const;

/** Clear monthly rent caps and rental bedroom gates when buyer pivots to a purchase search. */
export function stripConflictingRentPreferences(profile: BuyerPreferenceProfile): void {
  for (const key of RENT_ONLY_PREFERENCE_KEYS) {
    delete (profile as Record<string, unknown>)[key];
  }
  clearMonthlyRentBudgetFields(profile);
  delete profile.bedsMin;
  delete profile.bedsMax;
  delete profile.bathsMin;
}

const PURCHASE_FEATURE_KEYS = [
  "pool",
  "waterfront",
  "modernStyle",
  "gatedCommunity",
  "investmentIntent",
  "lowHoa",
  "walkability",
  "schoolPriority",
] as const;

/** Rental search replaces conflicting purchase-only preferences instead of stacking them. */
export function stripConflictingSalePreferences(
  profile: BuyerPreferenceProfile,
  incomingPatch?: BuyerPreferenceExtractionPatch,
): void {
  if (
    typeof profile.priceMin?.value === "number" &&
    isSaleScaleBudgetAmount(profile.priceMin.value) &&
    !isPlausibleRentBudgetAmount(profile.priceMin.value)
  ) {
    delete profile.priceMin;
  }
  if (
    typeof profile.priceMax?.value === "number" &&
    isSaleScaleBudgetAmount(profile.priceMax.value) &&
    !isPlausibleRentBudgetAmount(profile.priceMax.value)
  ) {
    delete profile.priceMax;
  }

  const explicitRentalPool =
    incomingPatch?.pool?.value === true ||
    (incomingPatch?.pool?.value === false && isPoolOptionalEvidence(incomingPatch.pool.evidence));

  for (const key of PURCHASE_FEATURE_KEYS) {
    if (key === "pool" && explicitRentalPool) continue;
    delete (profile as Record<string, unknown>)[key];
  }
  delete profile.financingStatus;

  if (profile.mustHaves?.value?.length) {
    const filtered = profile.mustHaves.value
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((raw) => {
        const lower = raw.toLowerCase();
        if (/^sqft_max:/i.test(lower)) return false;
        if (/\b(ocean|waterfront|pool|modern|gated|luxury|invest|water view)\b/i.test(lower)) {
          return false;
        }
        return true;
      });
    if (filtered.length > 0) {
      profile.mustHaves = { ...profile.mustHaves, value: filtered };
    } else {
      delete profile.mustHaves;
    }
  }
}

function normalizeRentBudgetFields(profile: BuyerPreferenceProfile): void {
  if (profile.transactionIntent?.value !== "rent") return;
  if (typeof profile.priceMax?.value === "number" && profile.priceMax.value > 50_000) {
    delete profile.priceMax;
  }
  if (typeof profile.priceMin?.value === "number" && profile.priceMin.value > 50_000) {
    delete profile.priceMin;
  }
}

function shouldForceReplaceBudgetCap(
  existing: PreferenceField<number> | undefined,
  incoming: PreferenceField<number>,
): boolean {
  if (!existing || typeof existing.value !== "number" || typeof incoming.value !== "number") {
    return false;
  }
  if (
    !isPlausibleBudgetAmount(incoming.value, "sale") &&
    !isPlausibleBudgetAmount(incoming.value, "rent")
  ) {
    return false;
  }
  const evidence = incoming.evidence || "";
  if (!/budget/i.test(evidence)) return false;
  if (incoming.value <= existing.value) return true;
  if (/\bup\s+to\b/i.test(evidence) || evidence.includes("up to budget")) return true;
  if (/\bunder\b/i.test(evidence) || evidence.includes("under budget")) return true;
  return false;
}

function mergePriceRange(
  profile: BuyerPreferenceProfile,
  patch: BuyerPreferenceExtractionPatch,
): void {
  const mode = budgetPlausibilityMode(profile, patch);
  const plausible = (n: number) => isPlausibleBudgetAmount(n, mode);
  const incomingMin = patch.priceMin;
  const incomingMax = patch.priceMax;
  const rangeReplace =
    incomingMin &&
    incomingMax &&
    plausible(incomingMin.value) &&
    plausible(incomingMax.value) &&
    (isBudgetRangeEvidence(incomingMin.evidence) || isBudgetRangeEvidence(incomingMax.evidence));

  if (rangeReplace) {
    profile.priceMin = { ...incomingMin };
    profile.priceMax = { ...incomingMax };
    return;
  }

  if (incomingMin && plausible(incomingMin.value)) {
    profile.priceMin = mergeScalarField(profile.priceMin, incomingMin);
  }
  if (incomingMax && plausible(incomingMax.value)) {
    profile.priceMax = shouldForceReplaceBudgetCap(profile.priceMax, incomingMax)
      ? { ...incomingMax }
      : mergeScalarField(profile.priceMax, incomingMax);
  }

  const upToOnly =
    incomingMax &&
    !incomingMin &&
    isUpToBudgetEvidence(incomingMax.evidence);
  const equalCap =
    profile.priceMin?.value != null &&
    profile.priceMax?.value != null &&
    profile.priceMin.value === profile.priceMax.value &&
    !isBudgetRangeEvidence(profile.priceMin.evidence) &&
    !isBudgetRangeEvidence(profile.priceMax.evidence);

  if (upToOnly || equalCap || isUpToBudgetEvidence(profile.priceMax?.evidence)) {
    delete profile.priceMin;
  }
}

export type BuyerPreferenceMergeOptions = {
  replaceArrayFields?: PreferenceArrayReplaceKey[];
  /** Replacement search — drop pool/beds/waterfront not present in incoming patch. */
  clearUnmentionedHardGates?: boolean;
  /** Heuristic patch from the current inbound message (authoritative for gate clearing). */
  currentMessagePatch?: BuyerPreferenceExtractionPatch;
};

const HARD_GATE_SCALAR_KEYS = HARD_SEARCH_FILTER_KEYS;

function filterPoolWaterfrontMustHaves(
  mustHaves: PreferenceField<string[]> | undefined,
): PreferenceField<string[]> | undefined {
  if (!mustHaves?.value?.length) return mustHaves;
  const filtered = mustHaves.value
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((raw) => !/\b(pool|waterfront|ocean view)\b/i.test(raw));
  if (filtered.length) return { ...mustHaves, value: filtered };
  return undefined;
}

function filterStaleMustHavesOnReplacement(
  mustHaves: PreferenceField<string[]> | undefined,
): PreferenceField<string[]> | undefined {
  const afterPool = filterPoolWaterfrontMustHaves(mustHaves);
  if (!afterPool?.value?.length) return undefined;
  const softFiltered = filterSoftMustHaves(afterPool);
  if (!softFiltered?.length) return undefined;
  return { ...afterPool, value: softFiltered };
}

/** Drop stale hard gates when buyer sends a full replacement search. */
export function clearUnmentionedHardGates(
  profile: BuyerPreferenceProfile,
  patch: BuyerPreferenceExtractionPatch,
): void {
  for (const key of HARD_GATE_SCALAR_KEYS) {
    if (patch[key] !== undefined) continue;
    delete (profile as Record<string, unknown>)[key];
  }

  if (patch.geoConstraints === undefined) {
    delete profile.geoConstraints;
  }

  if (patch.dealBreakers === undefined) {
    delete profile.dealBreakers;
  }

  clearStaleSoftAreas(profile, patch);

  if (!patch.mustHaves && profile.mustHaves?.value?.length) {
    const filtered = filterStaleMustHavesOnReplacement(profile.mustHaves);
    if (filtered) profile.mustHaves = filtered;
    else delete profile.mustHaves;
  }
}

/**
 * Remove history-derived hard gates from LLM patch when current message did not mention them.
 * Prevents conversation-history extraction from re-applying pool/beds after a replacement search.
 */
export function stripStaleHardGatesFromPatch(
  patch: BuyerPreferenceExtractionPatch,
  currentMessagePatch: BuyerPreferenceExtractionPatch,
): void {
  for (const key of HARD_GATE_SCALAR_KEYS) {
    if (currentMessagePatch[key] === undefined) {
      delete (patch as Record<string, unknown>)[key];
    }
  }

  if (!currentMessagePatch.mustHaves && patch.mustHaves?.value?.length) {
    const filtered = filterStaleMustHavesOnReplacement(patch.mustHaves);
    if (filtered) patch.mustHaves = filtered;
    else delete patch.mustHaves;
  }

  if (currentMessagePatch.geoConstraints === undefined) {
    delete patch.geoConstraints;
  }

  if (currentMessagePatch.geoPreferences === undefined) {
    delete patch.geoPreferences;
  }

  if (currentMessagePatch.dealBreakers === undefined) {
    delete patch.dealBreakers;
  }

  if (currentMessagePatch.targetAreas?.value?.length) {
    const incoming = currentMessagePatch.targetAreas.value;
    if (patch.targetAreas?.value?.length) {
      patch.targetAreas = {
        ...patch.targetAreas,
        value: patch.targetAreas.value.filter((a) => {
          const s = String(a).trim();
          return incoming.some((inc) => inc.toLowerCase() === s.toLowerCase()) || incoming.length === 0;
        }),
      };
      if (!patch.targetAreas.value.length) delete patch.targetAreas;
    }
  }
}

function applyPatchField<K extends keyof BuyerPreferenceExtractionPatch>(
  profile: BuyerPreferenceProfile,
  patch: BuyerPreferenceExtractionPatch,
  key: K,
  mergeOptions?: BuyerPreferenceMergeOptions,
): void {
  const incoming = patch[key];
  if (!incoming) return;

  if (key === "geoConstraints") {
    (profile as Record<string, unknown>)[key] = replaceGeoConstraintsField(
      incoming as PreferenceField<BuyerGeoConstraint[]>,
    );
    return;
  }

  if (key === "targetAreas" || key === "propertyTypes" || key === "mustHaves" || key === "dealBreakers" || key === "geoPreferences") {
    const cur = profile[key] as PreferenceField<string[]> | undefined;
    const incomingField = incoming as PreferenceField<string[]>;
    const explicitIncomingPropertyType =
      key === "propertyTypes" && isExplicitPropertyTypeEvidence(incomingField.evidence);
    const replacePropertyTypes =
      mergeOptions?.replaceArrayFields?.includes("propertyTypes") || explicitIncomingPropertyType;
    if (
      key === "propertyTypes" &&
      cur &&
      isShowMeAllPropertyRelaxEvidence(cur.evidence) &&
      !isShowMeAllPropertyRelaxEvidence(incomingField.evidence) &&
      (incomingField.value?.length ?? 0) < (cur.value?.length ?? 0) &&
      !replacePropertyTypes
    ) {
      return;
    }
    const shouldReplace =
      (key === "targetAreas" || key === "propertyTypes") &&
      (mergeOptions?.replaceArrayFields?.includes(key as PreferenceArrayReplaceKey) ||
        (key === "propertyTypes" &&
          (isShowMeAllPropertyRelaxEvidence((incoming as PreferenceField<string[]>).evidence) ||
            explicitIncomingPropertyType)));
    (profile as Record<string, unknown>)[key] = shouldReplace
      ? replaceArrayField(incoming as PreferenceField<string[]>)
      : mergeArrayField(cur, incoming as PreferenceField<string[]>);
    return;
  }

  if (key === "priceMin" || key === "priceMax") {
    mergePriceRange(profile, patch);
    return;
  }

  if (key === "pool") {
    const incoming = patch.pool;
    if (incoming && incoming.value === false && isPoolOptionalEvidence(incoming.evidence)) {
      delete (profile as Record<string, unknown>).pool;
      return;
    }
  }

  if (key === "bedsMin" || key === "bedsMax" || key === "bathsMin") {
    const incoming = patch[key];
    if (incoming && isBedBathCorrectionEvidence(incoming.evidence)) {
      (profile as Record<string, unknown>)[key] = { ...incoming };
      return;
    }
  }

  if (key === "transactionIntent") {
    const incoming = patch.transactionIntent;
    if (incoming?.value === "rent" && isRentIntentEvidence(incoming.evidence)) {
      (profile as Record<string, unknown>)[key] = { ...incoming };
      return;
    }
    if (incoming?.value === "buy" && isBuyIntentEvidence(incoming.evidence)) {
      (profile as Record<string, unknown>)[key] = { ...incoming };
      return;
    }
  }

  const cur = profile[key] as PreferenceField<unknown> | undefined;
  (profile as Record<string, unknown>)[key] = mergeScalarField(
    cur,
    incoming as PreferenceField<unknown>,
  );
}

const PATCH_KEYS: (keyof BuyerPreferenceExtractionPatch)[] = [
  "transactionIntent",
  "targetAreas",
  "priceMin",
  "priceMax",
  "bedsMin",
  "bedsMax",
  "bathsMin",
  "propertyTypes",
  "investmentIntent",
  "waterfront",
  "pool",
  "gatedCommunity",
  "parking",
  "petFriendly",
  "shortTermRentalAllowed",
  "modernStyle",
  "lowHoa",
  "walkability",
  "schoolPriority",
  "timeline",
  "financingStatus",
  "mustHaves",
  "dealBreakers",
  "geoConstraints",
  "geoPreferences",
];

export function mergeBuyerPreferenceProfile(
  current: BuyerPreferenceProfile,
  patch: BuyerPreferenceExtractionPatch,
  meta?: { lastInboundAt?: string; lastExtractedAt?: string },
  mergeOptions?: BuyerPreferenceMergeOptions,
): BuyerPreferenceProfile {
  const profile: BuyerPreferenceProfile = {
    ...current,
    schemaVersion: 1,
  };

  const switchingToRent =
    patch.transactionIntent?.value === "rent" && isRentIntentEvidence(patch.transactionIntent.evidence);
  const switchingToBuy =
    patch.transactionIntent?.value === "buy" && profile.transactionIntent?.value === "rent";

  if (switchingToBuy) {
    stripConflictingRentPreferences(profile);
  }

  if (mergeOptions?.clearUnmentionedHardGates) {
    const authoritative = mergeOptions.currentMessagePatch ?? patch;
    stripStaleHardGatesFromPatch(patch, authoritative);
    clearUnmentionedHardGates(profile, authoritative);
  }

  for (const key of PATCH_KEYS) {
    applyPatchField(profile, patch, key, mergeOptions);
  }

  if (switchingToRent || profile.transactionIntent?.value === "rent") {
    stripConflictingSalePreferences(profile, patch);
    normalizeRentBudgetFields(profile);
  }

  if (profile.transactionIntent?.value === "buy") {
    clearMonthlyRentBudgetFields(profile);
  }

  if (isShowMeAllPropertyRelaxEvidence(patch.propertyTypes?.evidence)) {
    stripSfhFromMustHaves(profile);
  }

  if (meta?.lastInboundAt) profile.lastInboundAt = meta.lastInboundAt;
  if (meta?.lastExtractedAt) profile.lastExtractedAt = meta.lastExtractedAt;
  profile.profileStatus = deriveProfileStatus(profile);
  return profile;
}
