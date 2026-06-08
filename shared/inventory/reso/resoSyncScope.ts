import { z } from "zod";
import type { ResoSyncMode } from "./resoSyncTypes";
import { buildODataFilter, escapeODataString } from "./resoOData";

/** RESO StandardStatus values imported on initial sync. */
export const RESO_SYNCABLE_STANDARD_STATUSES = ["Active", "Coming Soon"] as const;

export const INVENTORY_MAX_LISTINGS_OPTIONS = [500, 1000, 2500, 5000] as const;
export const DEFAULT_MAX_LISTINGS = 1000;

export type InventoryMaxListings = (typeof INVENTORY_MAX_LISTINGS_OPTIONS)[number];

export const inventoryMaxListingsSchema = z.union([
  z.literal(500),
  z.literal(1000),
  z.literal(2500),
  z.literal(5000),
]);

export const inventorySyncScopeFieldsSchema = z.object({
  /** City names to include on initial import (stored as array). */
  syncCities: z.array(z.string()).optional(),
  /** ZIP / postal codes to include on initial import (stored as array). */
  syncZipCodes: z.array(z.string()).optional(),
  /** Cap for the first full import; incremental sync is not capped. */
  maxListings: inventoryMaxListingsSchema.optional(),
});

export type InventorySyncScopeFields = z.infer<typeof inventorySyncScopeFieldsSchema>;

export type InventorySyncScope = {
  cities: string[];
  zipCodes: string[];
  maxListings: InventoryMaxListings;
};

/** Parse comma-separated connector input into trimmed unique values. */
export function parseCommaSeparatedList(raw: string | undefined | null): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function formatCommaSeparatedList(values: string[] | undefined): string {
  return values?.join(", ") ?? "";
}

function readStringArrayField(config: Record<string, unknown>, key: string): string[] {
  const raw = config[key];
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  }
  if (typeof raw === "string") {
    return parseCommaSeparatedList(raw);
  }
  return [];
}

export function readInventorySyncScope(config: Record<string, unknown>): InventorySyncScope {
  const parsed = inventorySyncScopeFieldsSchema.safeParse(config);
  const cities = parsed.success && parsed.data.syncCities?.length
    ? parsed.data.syncCities
    : readStringArrayField(config, "syncCities");
  const zipCodes = parsed.success && parsed.data.syncZipCodes?.length
    ? parsed.data.syncZipCodes
    : readStringArrayField(config, "syncZipCodes");
  const maxRaw = parsed.success ? parsed.data.maxListings : config.maxListings;
  const maxParsed = inventoryMaxListingsSchema.safeParse(maxRaw);
  return {
    cities,
    zipCodes,
    maxListings: maxParsed.success ? maxParsed.data : DEFAULT_MAX_LISTINGS,
  };
}

export function buildSyncScopeConfigPatch(form: {
  syncCities: string;
  syncZipCodes: string;
  maxListings: InventoryMaxListings;
}): InventorySyncScopeFields {
  const cities = parseCommaSeparatedList(form.syncCities);
  const zipCodes = parseCommaSeparatedList(form.syncZipCodes);
  return {
    syncCities: cities.length > 0 ? cities : undefined,
    syncZipCodes: zipCodes.length > 0 ? zipCodes : undefined,
    maxListings: form.maxListings,
  };
}

/** OData `(StandardStatus eq 'Active' or StandardStatus eq 'Coming Soon')`. */
export function buildSyncableStandardStatusFilter(): string {
  const parts = RESO_SYNCABLE_STANDARD_STATUSES.map(
    (status) => `StandardStatus eq '${escapeODataString(status)}'`,
  );
  return parts.length === 1 ? parts[0]! : `(${parts.join(" or ")})`;
}

function buildODataOrEquals(field: string, values: string[]): string | null {
  if (values.length === 0) return null;
  const parts = values.map((value) => `${field} eq '${escapeODataString(value)}'`);
  return parts.length === 1 ? parts[0]! : `(${parts.join(" or ")})`;
}

/** City and/or ZIP scope — combined with OR when both are set. */
export function buildAreaScopeFilter(cities: string[], zipCodes: string[]): string | null {
  const cityClause = buildODataOrEquals("City", cities);
  const zipClause = buildODataOrEquals("PostalCode", zipCodes);
  if (cityClause && zipClause) return `(${cityClause} or ${zipClause})`;
  return cityClause ?? zipClause;
}

/**
 * Status + area filters for initial import and reconciliation.
 * Incremental sync omits these so off-market status changes are still received.
 */
export function buildMarketListingScopeClauses(
  mode: ResoSyncMode,
  scope: Pick<InventorySyncScope, "cities" | "zipCodes">,
): string[] {
  if (mode !== "initial" && mode !== "reconciliation") return [];
  const clauses = [buildSyncableStandardStatusFilter()];
  const area = buildAreaScopeFilter(scope.cities, scope.zipCodes);
  if (area) clauses.push(area);
  return clauses;
}

export function appendScopeToPropertyFilter(
  baseFilter: string,
  mode: ResoSyncMode,
  scope: Pick<InventorySyncScope, "cities" | "zipCodes">,
): string {
  return buildODataFilter([...buildMarketListingScopeClauses(mode, scope), baseFilter].filter(Boolean));
}
