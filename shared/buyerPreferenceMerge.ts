import type {
  BuyerGeoConstraint,
  BuyerPreferenceExtractionPatch,
  BuyerPreferenceProfile,
  PreferenceField,
  PreferenceSource,
} from "./buyerPreferenceSchema";
import { deriveProfileStatus } from "./buyerPreferenceSchema";
import type { PreferenceArrayReplaceKey } from "./buyerPreferenceInventorySignals";

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

function isPlausibleBudgetAmount(n: number): boolean {
  return Number.isFinite(n) && n >= 10_000;
}

function shouldForceReplaceBudgetCap(
  existing: PreferenceField<number> | undefined,
  incoming: PreferenceField<number>,
): boolean {
  if (!existing || typeof existing.value !== "number" || typeof incoming.value !== "number") {
    return false;
  }
  if (!isPlausibleBudgetAmount(incoming.value)) return false;
  const evidence = incoming.evidence || "";
  if (!/budget/i.test(evidence)) return false;
  if (incoming.value <= existing.value) return true;
  if (/\bup\s+to\b/i.test(evidence) || evidence.includes("up to budget")) return true;
  return false;
}

function mergePriceRange(
  profile: BuyerPreferenceProfile,
  patch: BuyerPreferenceExtractionPatch,
): void {
  const incomingMin = patch.priceMin;
  const incomingMax = patch.priceMax;
  const rangeReplace =
    incomingMin &&
    incomingMax &&
    isPlausibleBudgetAmount(incomingMin.value) &&
    isPlausibleBudgetAmount(incomingMax.value) &&
    (isBudgetRangeEvidence(incomingMin.evidence) || isBudgetRangeEvidence(incomingMax.evidence));

  if (rangeReplace) {
    profile.priceMin = { ...incomingMin };
    profile.priceMax = { ...incomingMax };
    return;
  }

  if (incomingMin && isPlausibleBudgetAmount(incomingMin.value)) {
    profile.priceMin = mergeScalarField(profile.priceMin, incomingMin);
  }
  if (incomingMax && isPlausibleBudgetAmount(incomingMax.value)) {
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
};

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

  if (key === "targetAreas" || key === "propertyTypes" || key === "mustHaves" || key === "dealBreakers") {
    const cur = profile[key] as PreferenceField<string[]> | undefined;
    const shouldReplace =
      (key === "targetAreas" || key === "propertyTypes") &&
      mergeOptions?.replaceArrayFields?.includes(key as PreferenceArrayReplaceKey);
    (profile as Record<string, unknown>)[key] = shouldReplace
      ? replaceArrayField(incoming as PreferenceField<string[]>)
      : mergeArrayField(cur, incoming as PreferenceField<string[]>);
    return;
  }

  if (key === "priceMin" || key === "priceMax") {
    mergePriceRange(profile, patch);
    return;
  }

  if (key === "bedsMin" || key === "bedsMax" || key === "bathsMin") {
    const incoming = patch[key];
    if (incoming && isBedBathCorrectionEvidence(incoming.evidence)) {
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
  "transactionIntent",
  "financingStatus",
  "mustHaves",
  "dealBreakers",
  "geoConstraints",
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

  for (const key of PATCH_KEYS) {
    applyPatchField(profile, patch, key, mergeOptions);
  }

  if (meta?.lastInboundAt) profile.lastInboundAt = meta.lastInboundAt;
  if (meta?.lastExtractedAt) profile.lastExtractedAt = meta.lastExtractedAt;
  profile.profileStatus = deriveProfileStatus(profile);
  return profile;
}
