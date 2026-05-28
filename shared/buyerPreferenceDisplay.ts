import type { BuyerPreferenceProfile, PreferenceField } from "./buyerPreferenceSchema";
import { normalizeBuyerPreferenceProfile } from "./buyerPreferenceSchema";

export type BuyerPreferenceChip = {
  id: string;
  label: string;
  value: string;
  source?: "explicit" | "inferred";
};

function fieldValue<T>(
  field: PreferenceField<T> | undefined,
  minConfidence = 0.45,
  format?: (v: T) => string,
): { text: string; source: "explicit" | "inferred" } | null {
  if (!field || field.confidence < minConfidence) return null;
  const text = format ? format(field.value) : String(field.value);
  if (!text || text === "unknown") return null;
  return { text, source: field.source };
}

function boolFlags(profile: BuyerPreferenceProfile): string[] {
  const flags: string[] = [];
  const add = (label: string, f?: PreferenceField<boolean>) => {
    if (f?.value && f.confidence >= 0.5) flags.push(label);
  };
  add("pool", profile.pool);
  add("waterfront", profile.waterfront);
  add("modern", profile.modernStyle);
  add("gated", profile.gatedCommunity);
  add("parking", profile.parking);
  add("pet-friendly", profile.petFriendly);
  add("low HOA", profile.lowHoa);
  add("walkable", profile.walkability);
  add("schools", profile.schoolPriority);
  add("STR", profile.shortTermRentalAllowed);
  add("investor", profile.investmentIntent);
  return flags;
}

const PROFILE_FIELD_KEYS = [
  "targetAreas",
  "priceMin",
  "priceMax",
  "bedsMin",
  "bathsMin",
  "propertyTypes",
  "timeline",
  "financingStatus",
  "mustHaves",
  "dealBreakers",
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

export function buildBuyerPreferenceChips(raw: unknown): BuyerPreferenceChip[] {
  const profile = normalizeForDisplay(raw);
  const chips: BuyerPreferenceChip[] = [];

  const push = (id: string, label: string, field: PreferenceField<unknown> | undefined, format?: (v: unknown) => string) => {
    if (!field) return;
    const row = fieldValue(field as PreferenceField<unknown>, 0.45, format as (v: unknown) => string);
    if (!row) return;
    chips.push({ id, label, value: row.text, source: row.source });
  };

  // Areas: show one chip per area for compact display
  if (profile.targetAreas && profile.targetAreas.confidence >= 0.45) {
    const areas = (profile.targetAreas.value || []).map((s) => String(s).trim()).filter(Boolean);
    for (const area of areas.slice(0, 6)) {
      chips.push({ id: `area:${area.toLowerCase()}`, label: "Area", value: area, source: profile.targetAreas.source });
    }
  }
  if (profile.priceMin || profile.priceMax) {
    const min = profile.priceMin?.value;
    const max = profile.priceMax?.value;
    if (min != null || max != null) {
      const fmt = (n: number) => {
        if (n >= 1_000_000) return `$${Math.round(n / 100_000) / 10}M`;
        if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
        return `$${n}`;
      };
      const text = max != null && min == null ? fmt(Number(max)) : max != null ? `${fmt(Number(min || 0))}–${fmt(Number(max))}` : fmt(Number(min || 0));
      const src =
        profile.priceMax?.source === "explicit" || profile.priceMin?.source === "explicit"
          ? "explicit"
          : "inferred";
      chips.push({ id: "budget", label: "Budget", value: text, source: src });
    }
  }
  push("propertyTypes", "Type", profile.propertyTypes, (v) => (v as string[]).map((s) => String(s)).join(", "));
  push("beds", "Beds", profile.bedsMin, (v) => `${v} bed`);
  push("baths", "Baths", profile.bathsMin, (v) => `${v} bath`);
  push("timeline", "Timeline", profile.timeline, (v) => String(v).toUpperCase().replace(/_/g, " "));
  push("financing", "Financing", profile.financingStatus, (v) =>
    String(v)
      .replace(/_/g, " ")
      .replace(/\bpre approved\b/i, "Pre-approved")
      .replace(/\bcash\b/i, "Cash")
      .replace(/\bexploring\b/i, "Exploring"),
  );

  // Individual feature chips (pool/modern/etc.) for compact memory display
  const feature = (id: string, label: string, f?: PreferenceField<boolean>) => {
    if (!f || !f.value || f.confidence < 0.5) return;
    chips.push({ id, label, value: label, source: f.source });
  };
  feature("pool", "Pool", profile.pool);
  feature("modern", "Modern", profile.modernStyle);
  feature("waterfront", "Waterfront", profile.waterfront);

  // Must-haves list (free text)
  if (profile.mustHaves && profile.mustHaves.confidence >= 0.45) {
    const items = (profile.mustHaves.value || []).map((s) => String(s).trim()).filter(Boolean);
    for (const item of items.slice(0, 8)) {
      chips.push({ id: `mh:${item.toLowerCase()}`, label: "Must-have", value: item, source: profile.mustHaves.source });
    }
  }

  return chips;
}

export function formatBuyerPreferenceSummaryForAi(profile: BuyerPreferenceProfile): string {
  const chips = buildBuyerPreferenceChips(profile);
  if (!chips.length) return "";
  const lines = chips.map((c) => `- ${c.label}: ${c.value}${c.source === "inferred" ? " (inferred)" : ""}`);
  return `Buyer preferences (from conversation memory):\n${lines.join("\n")}`;
}
