import type { BuyerPreferenceProfile, PreferenceField } from "./buyerPreferenceSchema";
import { normalizeBuyerPreferenceProfile } from "./buyerPreferenceSchema";
import { formatGeoConstraintLabel } from "./inventory/buyerGeoConstraints";
import { resolveMatchingBudgetBounds } from "./buyerPreferenceBudget";
import { isAreaSpecificSoftArea } from "./buyerPreferenceFieldClassification";

export type BuyerPreferenceChip = {
  id: string;
  label: string;
  value: string;
  source?: "explicit" | "inferred";
};

function titleCaseWords(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatArea(area: string): string {
  return titleCaseWords(area.trim());
}

function formatPropertyType(raw: string): string {
  const key = raw.toLowerCase().replace(/\s+/g, "_");
  const map: Record<string, string> = {
    condo: "Condo",
    house: "House",
    townhouse: "Townhouse",
    multi_family: "Multi-family",
    land: "Land",
  };
  return map[key] || titleCaseWords(raw.replace(/_/g, " "));
}

function formatTimeline(raw: string): string {
  const key = raw.toLowerCase();
  const map: Record<string, string> = {
    asap: "ASAP",
    "30d": "30 days",
    "60_90d": "60–90 days",
    browsing: "Browsing",
    unknown: "",
  };
  return map[key] ?? raw.toUpperCase().replace(/_/g, " ");
}

function formatFinancing(raw: string): string {
  const key = raw.toLowerCase();
  const map: Record<string, string> = {
    cash: "Cash",
    pre_approved: "Pre-approved",
    exploring: "Exploring",
    unknown: "",
  };
  return map[key] ?? titleCaseWords(raw.replace(/_/g, " "));
}

function formatMoneyShort(n: number): string {
  if (n >= 1_000_000) return `$${Math.round(n / 100_000) / 10}M`;
  if (n >= 1_000) {
    const k = n / 1_000;
    return k % 1 === 0 ? `$${k}k` : `$${k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `$${n}`;
}

/** Maps free-text must-haves to feature keys when they duplicate bool chips. */
const MUST_HAVE_FEATURE_ALIASES: Record<string, string> = {
  pool: "feature:pool",
  pools: "feature:pool",
  modern: "feature:modern",
  "modern style": "feature:modern",
  waterfront: "feature:waterfront",
  gated: "feature:gated",
  parking: "feature:parking",
  "pet friendly": "feature:pet-friendly",
  "pet-friendly": "feature:pet-friendly",
  "low hoa": "feature:low-hoa",
  walkable: "feature:walkable",
  walkability: "feature:walkable",
  schools: "feature:schools",
  str: "feature:str",
  investor: "feature:investor",
  "investment": "feature:investor",
};

function chipSemanticKey(chip: BuyerPreferenceChip): string | null {
  const v = chip.value.trim().toLowerCase();
  if (!v) return null;

  if (chip.id.startsWith("area:")) return `area:${v}`;
  if (chip.id.startsWith("geo-pref:") || chip.id.startsWith("soft-area:")) return `geo-pref:${v}`;
  if (chip.id === "budget") return "budget";
  if (chip.id === "propertyTypes") return `type:${v}`;
  if (chip.id === "beds") return `beds:${v.replace(/\s+/g, "")}`;
  if (chip.id === "baths") return `baths:${v.replace(/\s+/g, "")}`;
  if (chip.id === "timeline") return `timeline:${v}`;
  if (chip.id === "financing") return `financing:${v}`;

  if (chip.id === "pool" || v === "pool") return "feature:pool";
  if (chip.id === "modern" || v === "modern") return "feature:modern";
  if (chip.id === "waterfront" || v === "waterfront") return "feature:waterfront";
  if (chip.id === "gated" || v === "gated") return "feature:gated";
  if (chip.id === "parking" || v === "parking") return "feature:parking";
  if (chip.id === "pet-friendly" || v === "pet-friendly") return "feature:pet-friendly";
  if (chip.id === "low-hoa" || v === "low hoa") return "feature:low-hoa";
  if (chip.id === "walkable" || v === "walkable") return "feature:walkable";
  if (chip.id === "schools" || v === "schools") return "feature:schools";
  if (chip.id === "str" || v === "str") return "feature:str";
  if (chip.id === "investor" || v === "investor") return "feature:investor";

  if (chip.id.startsWith("mh:") || chip.label === "Must-have") {
    const alias = MUST_HAVE_FEATURE_ALIASES[v];
    if (alias) return alias;
    return `must-have:${v}`;
  }

  return `${chip.id}:${v}`;
}

function dedupeChips(chips: BuyerPreferenceChip[]): BuyerPreferenceChip[] {
  const seen = new Set<string>();
  const out: BuyerPreferenceChip[] = [];
  for (const chip of chips) {
    const key = chipSemanticKey(chip);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(chip);
  }
  return out;
}

const PROFILE_FIELD_KEYS = [
  "transactionIntent",
  "targetAreas",
  "priceMin",
  "priceMax",
  "bedsMin",
  "bedsMax",
  "bathsMin",
  "propertyTypes",
  "timeline",
  "financingStatus",
  "mustHaves",
  "dealBreakers",
  "geoConstraints",
  "geoPreferences",
  "pool",
  "waterfront",
  "modernStyle",
  "gatedCommunity",
  "parking",
  "petFriendly",
  "lowHoa",
  "walkability",
  "schoolPriority",
  "shortTermRentalAllowed",
  "investmentIntent",
] as const;

/** UI/display: retry normalize when strict parse fails on persisted jsonb (extra keys, missing schemaVersion). */
export function normalizeForDisplay(raw: unknown): BuyerPreferenceProfile {
  const first = normalizeBuyerPreferenceProfile(raw);
  if (first.profileStatus !== "empty" || !raw || typeof raw !== "object") {
    return first;
  }
  const obj = raw as Record<string, unknown>;
  const hasPreferenceFields = PROFILE_FIELD_KEYS.some((k) => obj[k] != null);
  if (!hasPreferenceFields) return first;

  const stripped: Record<string, unknown> = {
    schemaVersion: 1,
    profileStatus: typeof obj.profileStatus === "string" ? obj.profileStatus : "partial",
  };
  for (const key of PROFILE_FIELD_KEYS) {
    if (obj[key] != null) stripped[key] = obj[key];
  }
  if (typeof obj.lastExtractedAt === "string") stripped.lastExtractedAt = obj.lastExtractedAt;
  if (typeof obj.lastInboundAt === "string") stripped.lastInboundAt = obj.lastInboundAt;
  return normalizeBuyerPreferenceProfile(stripped);
}

export type BuyerPreferenceChipScope = "search" | "metadata" | "all";

export function buildBuyerPreferenceChips(
  raw: unknown,
  scope: BuyerPreferenceChipScope = "all",
): BuyerPreferenceChip[] {
  if (scope === "metadata") {
    return buildBuyerPreferenceMetadataChips(raw);
  }

  const profile = normalizeForDisplay(raw);
  const chips: BuyerPreferenceChip[] = [];

  if (
    profile.transactionIntent &&
    profile.transactionIntent.confidence >= 0.45 &&
    (profile.transactionIntent.value === "rent" || profile.transactionIntent.value === "buy")
  ) {
    chips.push({
      id: "transactionIntent",
      label: "Intent",
      value: profile.transactionIntent.value === "rent" ? "Rent" : "Buy",
      source: profile.transactionIntent.source,
    });
  }

  if (profile.geoConstraints && profile.geoConstraints.confidence >= 0.45) {
    for (const constraint of (profile.geoConstraints.value || []).slice(0, 4)) {
      chips.push({
        id: `geo:${constraint.referenceId}:${constraint.side}`,
        label: "Location",
        value: formatGeoConstraintLabel(constraint),
        source: profile.geoConstraints.source,
      });
    }
  }

  if (profile.targetAreas && profile.targetAreas.confidence >= 0.45) {
    const areas = (profile.targetAreas.value || [])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .filter((area) => !isAreaSpecificSoftArea(area));
    for (const area of areas.slice(0, 6)) {
      const formatted = formatArea(area);
      chips.push({
        id: `area:${formatted.toLowerCase()}`,
        label: "Area",
        value: formatted,
        source: profile.targetAreas.source,
      });
    }
  }

  if (profile.geoPreferences && profile.geoPreferences.confidence >= 0.45) {
    for (const raw of (profile.geoPreferences.value || []).map(String).map((s) => s.trim()).filter(Boolean)) {
      const formatted = formatArea(raw);
      chips.push({
        id: `geo-pref:${formatted.toLowerCase()}`,
        label: "Area",
        value: formatted,
        source: profile.geoPreferences.source,
      });
    }
  } else if (profile.mustHaves && profile.mustHaves.confidence >= 0.45) {
    for (const raw of (profile.mustHaves.value || []).map(String).map((s) => s.trim()).filter(Boolean)) {
      if (!isAreaSpecificSoftArea(raw)) continue;
      const formatted = formatArea(raw);
      chips.push({
        id: `geo-pref:${formatted.toLowerCase()}`,
        label: "Area",
        value: formatted,
        source: profile.mustHaves.source,
      });
    }
  }

  if (profile.priceMin || profile.priceMax) {
    const { priceMin: minN, priceMax: maxN } = resolveMatchingBudgetBounds(profile);
    const isRent = profile.transactionIntent?.value === "rent";
    const rentSuffix = isRent ? "/mo" : "";
    const hasMax = maxN != null && maxN > 0;
    const hasMin = minN != null && minN > 0;

    if (hasMax || hasMin) {
      let text: string;
      if (hasMax && hasMin) {
        text = `${formatMoneyShort(minN!)}–${formatMoneyShort(maxN!)}${rentSuffix}`;
      } else if (hasMax) {
        text = `Up to ${formatMoneyShort(maxN!)}${rentSuffix}`;
      } else {
        text = `From ${formatMoneyShort(minN!)}${rentSuffix}`;
      }
      const src =
        profile.priceMax?.source === "explicit" || profile.priceMin?.source === "explicit"
          ? "explicit"
          : "inferred";
      chips.push({ id: "budget", label: "Budget", value: text, source: src });
    }
  }

  if (profile.propertyTypes && profile.propertyTypes.confidence >= 0.45) {
    const types = (profile.propertyTypes.value || []).map((t) => formatPropertyType(String(t)));
    const unique = [...new Set(types)].filter(Boolean);
    if (unique.length === 1) {
      chips.push({
        id: "propertyTypes",
        label: "Type",
        value: unique[0],
        source: profile.propertyTypes.source,
      });
    } else if (unique.length > 1) {
      chips.push({
        id: "propertyTypes",
        label: "Type",
        value: unique.join(", "),
        source: profile.propertyTypes.source,
      });
    }
  }

  if (profile.bedsMin && profile.bedsMin.confidence >= 0.45 && profile.bedsMin.value > 0) {
    const bedLabel =
      profile.bedsMax &&
      profile.bedsMax.confidence >= 0.45 &&
      profile.bedsMax.value > 0 &&
      profile.bedsMax.value !== profile.bedsMin.value
        ? `${profile.bedsMin.value}–${profile.bedsMax.value} bed`
        : `${profile.bedsMin.value} bed`;
    chips.push({
      id: "beds",
      label: "Beds",
      value: bedLabel,
      source: profile.bedsMin.source,
    });
  }

  if (profile.bathsMin && profile.bathsMin.confidence >= 0.45 && profile.bathsMin.value > 0) {
    chips.push({
      id: "baths",
      label: "Baths",
      value: `${profile.bathsMin.value} bath`,
      source: profile.bathsMin.source,
    });
  }

  const feature = (id: string, display: string, f?: PreferenceField<boolean>) => {
    if (!f?.value || f.confidence < 0.5) return;
    chips.push({ id, label: display, value: display, source: f.source });
  };
  feature("pool", "Pool", profile.pool);
  feature("modern", "Modern", profile.modernStyle);
  feature("waterfront", "Waterfront", profile.waterfront);
  feature("gated", "Gated", profile.gatedCommunity);
  feature("parking", "Parking", profile.parking);
  feature("pet-friendly", "Pet-friendly", profile.petFriendly);
  feature("low-hoa", "Low HOA", profile.lowHoa);
  feature("walkable", "Walkable", profile.walkability);
  feature("schools", "Schools", profile.schoolPriority);
  feature("str", "STR", profile.shortTermRentalAllowed);
  feature("investor", "Investor", profile.investmentIntent);

  if (profile.mustHaves && profile.mustHaves.confidence >= 0.45) {
    const items = (profile.mustHaves.value || []).map((s) => String(s).trim()).filter(Boolean);
    for (const item of items.slice(0, 8)) {
      const lower = item.toLowerCase();
      if (MUST_HAVE_FEATURE_ALIASES[lower]) continue;
      if (isAreaSpecificSoftArea(item)) continue;
      chips.push({
        id: `mh:${lower}`,
        label: "Must-have",
        value: titleCaseWords(item),
        source: profile.mustHaves.source,
      });
    }
  }

  if (scope === "all") {
    chips.push(...buildBuyerPreferenceMetadataChips(profile));
  }

  return dedupeChips(chips);
}

/** Active search criteria only — excludes buyer metadata chips (timeline, financing). */
export function buildBuyerPreferenceSearchChips(raw: unknown): BuyerPreferenceChip[] {
  return buildBuyerPreferenceChips(raw, "search");
}

export function buildBuyerPreferenceMetadataChips(raw: unknown): BuyerPreferenceChip[] {
  const profile = normalizeForDisplay(raw);
  const chips: BuyerPreferenceChip[] = [];

  if (profile.timeline && profile.timeline.confidence >= 0.45) {
    const text = formatTimeline(String(profile.timeline.value));
    if (text) {
      chips.push({
        id: "timeline",
        label: "Timeline",
        value: text,
        source: profile.timeline.source,
      });
    }
  }

  if (profile.financingStatus && profile.financingStatus.confidence >= 0.45) {
    const text = formatFinancing(String(profile.financingStatus.value));
    if (text) {
      chips.push({
        id: "financing",
        label: "Financing",
        value: text,
        source: profile.financingStatus.source,
      });
    }
  }

  return dedupeChips(chips);
}

export function formatBuyerPreferenceSummaryForAi(profile: BuyerPreferenceProfile): string {
  const chips = buildBuyerPreferenceSearchChips(profile);
  if (!chips.length) return "";
  const lines = chips.map((c) => `- ${c.label}: ${c.value}${c.source === "inferred" ? " (inferred)" : ""}`);
  return `Buyer preferences (from conversation memory):\n${lines.join("\n")}`;
}

/** Budget label for CRM / suggest-reply context — same source as matching engine. */
export function formatBuyerPreferenceBudgetLabel(profile: BuyerPreferenceProfile): string | null {
  const chip = buildBuyerPreferenceChips(profile).find((c) => c.id === "budget");
  return chip?.value ?? null;
}

export type BuyerPreferenceAiContextFields = {
  buyerPreferences?: string;
  budget?: string;
  timeline?: string;
  financing?: string;
};

/** CRM + AI fields derived from one persisted profile — keeps AI and matching aligned. */
export function buildBuyerPreferenceAiContext(
  profile: BuyerPreferenceProfile,
): BuyerPreferenceAiContextFields {
  const searchChips = buildBuyerPreferenceSearchChips(profile);
  const metadataChips = buildBuyerPreferenceMetadataChips(profile);
  const chip = (chips: BuyerPreferenceChip[], id: string) => chips.find((c) => c.id === id)?.value;
  const summary = formatBuyerPreferenceSummaryForAi(profile);
  return {
    buyerPreferences: summary || undefined,
    budget: chip(searchChips, "budget"),
    timeline: chip(metadataChips, "timeline"),
    financing: chip(metadataChips, "financing"),
  };
}
