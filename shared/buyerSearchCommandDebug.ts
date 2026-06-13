/**
 * Human-readable active filter summary for matching diagnostics.
 */
import type { BuyerPreferenceProfile } from "./buyerPreferenceSchema";
import { resolveMatchingBudgetBounds } from "./buyerPreferenceBudget";
import { formatBuyerPreferenceBudgetLabel } from "./buyerPreferenceDisplay";
import { extractBuyerMatchCriteria, type BuyerMatchCriteria } from "./inventory/inventoryMatchScoring";
import type { BuyerSearchCommand } from "./buyerSearchCommand";

function formatPropertyTypes(types: string[]): string {
  return types.map((t) => (t === "house" ? "SFH/house" : t)).join(", ");
}

export function describeActiveSearchFilters(
  profile: BuyerPreferenceProfile,
  criteria?: BuyerMatchCriteria,
): string {
  const c = criteria ?? extractBuyerMatchCriteria(profile);
  const budget = resolveMatchingBudgetBounds(profile);
  const parts: string[] = [];

  if (c.transactionIntent) {
    parts.push(c.transactionIntent === "rent" ? "Rent" : "Buy");
  }
  if (c.propertyTypes.length) {
    parts.push(`Types: ${formatPropertyTypes(c.propertyTypes)}`);
  }
  if (c.areas.length) {
    parts.push(`Areas: ${c.areas.slice(0, 3).join("; ")}`);
  }
  if (c.geoConstraints.length) {
    parts.push(`Geo: ${c.geoConstraints.length} constraint(s)`);
  }

  const budgetLabel = formatBuyerPreferenceBudgetLabel(profile);
  if (budgetLabel) {
    parts.push(`Budget: ${budgetLabel}`);
  } else if (budget.priceMax != null || budget.priceMin != null) {
    if (budget.priceMin != null && budget.priceMax != null) {
      parts.push(`Budget: $${budget.priceMin.toLocaleString()}–$${budget.priceMax.toLocaleString()}`);
    } else if (budget.priceMax != null) {
      parts.push(`Budget: up to $${budget.priceMax.toLocaleString()}`);
    }
  }

  if (c.bedsMin != null) {
    parts.push(
      c.bedsMax != null && c.bedsMax !== c.bedsMin
        ? `Beds: ${c.bedsMin}–${c.bedsMax}`
        : `Beds: ${c.bedsMin}+`,
    );
  }
  if (c.bathsMin != null) parts.push(`Baths: ${c.bathsMin}+`);
  if (c.hardRequirePool) parts.push("Pool required");
  if (c.hardRequireWaterfront) parts.push("Waterfront required");

  return parts.length ? parts.join(" · ") : "No active search filters";
}

export function formatSearchCommandLog(command: BuyerSearchCommand): string {
  return `[${command.kind}] ${command.explanation}`;
}

/** Persisted profile fields used by live DB matching — for funnel diagnostics. */
export function buildPersistedProfileSnapshotForDiagnostics(
  profile: BuyerPreferenceProfile,
  criteria?: BuyerMatchCriteria,
): {
  priceMax: number | null;
  priceMin: number | null;
  pool: boolean | null;
  bedsMin: number | null;
  propertyTypes: string[];
  areas: string[];
  hardRequirePool: boolean;
  transactionIntent: string;
} {
  const c = criteria ?? extractBuyerMatchCriteria(profile);
  const budget = resolveMatchingBudgetBounds(profile);
  return {
    priceMax: budget.priceMax ?? null,
    priceMin: budget.priceMin ?? null,
    pool: profile.pool?.value ?? null,
    bedsMin: c.bedsMin ?? null,
    propertyTypes: c.propertyTypes,
    areas: c.areas,
    hardRequirePool: c.hardRequirePool,
    transactionIntent: c.transactionIntent,
  };
}

/** Compact profile snapshot for replacement-search E2E tracing. */
export function snapshotProfileTraceFields(profile: BuyerPreferenceProfile) {
  const c = extractBuyerMatchCriteria(profile);
  const budget = resolveMatchingBudgetBounds(profile);
  return {
    priceMax: budget.priceMax ?? null,
    priceMin: budget.priceMin ?? null,
    bedsMin: c.bedsMin ?? null,
    pool: profile.pool?.value ?? null,
    hardRequirePool: c.hardRequirePool,
    propertyTypes: c.propertyTypes,
    areas: c.areas,
    transactionIntent: c.transactionIntent,
  };
}

/** Compact extraction patch snapshot for replacement-search E2E tracing. */
export function snapshotPatchTraceFields(patch: import("./buyerPreferenceSchema").BuyerPreferenceExtractionPatch) {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(patch)) {
    if (field && typeof field === "object" && "value" in field) {
      out[key] = (field as { value: unknown }).value;
    }
  }
  return out;
}
