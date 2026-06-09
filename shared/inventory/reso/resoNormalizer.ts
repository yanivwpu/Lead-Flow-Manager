import type { InventoryProvider } from "../inventoryProviderSchema";
import {
  normalizedInventoryListingSchema,
  type InventoryListingStatus,
  type NormalizedInventoryListing,
} from "../inventoryListingSchema";

/** Provider implements status + listing id resolution; shared layer maps RESO fields. */
export interface ResoPropertyNormalizerContract {
  readonly provider: InventoryProvider;
  extractListingId(row: Record<string, unknown>): string | null;
  resolveStatus(row: Record<string, unknown>): InventoryListingStatus;
  extractPhotos?(row: Record<string, unknown>): NormalizedInventoryListing["photos"];
  extractListingUrl?(row: Record<string, unknown>): string | null;
}

export function mapResoStandardStatus(raw: unknown): InventoryListingStatus {
  const s = String(raw ?? "").replace(/\s+/g, "");
  const lower = s.toLowerCase();
  if (lower === "active") return "active";
  if (lower === "comingsoon") return "coming_soon";
  if (lower === "activeundercontract" || lower === "pending") return "pending";
  if (lower === "closed" || lower === "sold") return "sold";
  if (
    lower === "canceled" ||
    lower === "cancelled" ||
    lower === "expired" ||
    lower === "withdrawn" ||
    lower === "rented" ||
    lower === "leased"
  ) {
    return "off_market";
  }
  if (lower === "inactive" || lower === "delete") return "inactive";
  return "inactive";
}

export function mapResoPropertyType(raw: unknown, subType: unknown): string | null {
  const combined = `${String(raw ?? "")} ${String(subType ?? "")}`.toLowerCase();
  if (combined.includes("condo")) return "condo";
  if (combined.includes("townhouse") || combined.includes("town house")) return "townhouse";
  if (combined.includes("multi")) return "multi_family";
  if (combined.includes("land")) return "land";
  if (combined.includes("house") || combined.includes("single")) return "house";
  return raw ? String(raw).toLowerCase().replace(/\s+/g, "_") : null;
}

export function resoListPriceToCents(listPrice: unknown): number | null {
  if (listPrice == null || listPrice === "") return null;
  const n = typeof listPrice === "number" ? listPrice : parseFloat(String(listPrice));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Normalize RESO Media resource rows or expanded Property.Media arrays. */
export function normalizeResoMediaItems(media: unknown): NormalizedInventoryListing["photos"] {
  if (!Array.isArray(media)) return [];
  const items = media
    .map((m, idx) => {
      if (!m || typeof m !== "object") return null;
      const row = m as Record<string, unknown>;
      const url = row.MediaURL ?? row.MediaUrl ?? row.Url;
      if (typeof url !== "string" || !url.startsWith("http")) return null;
      const order = typeof row.Order === "number" ? row.Order : idx;
      return { url, order };
    })
    .filter(Boolean) as NormalizedInventoryListing["photos"];
  items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return items;
}

export function buildResoAddress(row: Record<string, unknown>): NormalizedInventoryListing["address"] {
  const parts = [row.StreetNumber, row.StreetName, row.StreetSuffix].filter(Boolean).map(String);
  const line1 = String(row.UnparsedAddress ?? "").trim() || parts.join(" ").trim() || undefined;
  return {
    line1: line1 || undefined,
    line2: undefined,
    city: row.City != null ? String(row.City) : undefined,
    state: row.StateOrProvince != null ? String(row.StateOrProvince) : undefined,
    zip: row.PostalCode != null ? String(row.PostalCode) : undefined,
    country: row.Country != null ? String(row.Country) : "US",
  };
}

function resoOptionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeResoTimestamp(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/** RESO / MLS public URL fields used when provider omits extractListingUrl. */
export function defaultResoListingUrl(row: Record<string, unknown>): string | null {
  const candidates = [
    row.ListingURL,
    row.ListingUrl,
    row.VirtualTourURLUnbranded,
    row.VirtualTourURLBranded,
    row.UnparsedAddressURL,
  ];
  for (const raw of candidates) {
    if (typeof raw === "string" && /^https?:\/\//i.test(raw.trim())) {
      return raw.trim();
    }
  }
  return null;
}

export function defaultResoListingId(row: Record<string, unknown>): string | null {
  const id = row.ListingId ?? row.ListingKey;
  if (id == null || String(id).trim() === "") return null;
  return String(id).trim();
}

export function normalizeResoPropertyRow(
  raw: unknown,
  contract: ResoPropertyNormalizerContract,
  options?: {
    modificationTimestampField?: string;
    descriptionMaxLength?: number;
  },
): NormalizedInventoryListing | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const providerListingId = contract.extractListingId(row);
  if (!providerListingId) return null;

  const modField = options?.modificationTimestampField ?? "ModificationTimestamp";

  const candidate: NormalizedInventoryListing = {
    provider: contract.provider,
    providerListingId,
    status: contract.resolveStatus(row),
    priceCents: resoListPriceToCents(row.ListPrice),
    currency: "USD",
    address: buildResoAddress(row),
    latitude: resoOptionalNumber(row.Latitude),
    longitude: resoOptionalNumber(row.Longitude),
    beds: resoOptionalNumber(row.BedroomsTotal),
    baths:
      resoOptionalNumber(row.BathroomsTotalInteger) ??
      resoOptionalNumber(row.BathroomsFull),
    propertyType: mapResoPropertyType(row.PropertyType, row.PropertySubType),
    description:
      row.PublicRemarks != null
        ? String(row.PublicRemarks).slice(0, options?.descriptionMaxLength ?? 8000)
        : undefined,
    features: [],
    photos: contract.extractPhotos?.(row) ?? normalizeResoMediaItems(row.Media),
    listingUrl: contract.extractListingUrl?.(row) ?? null,
    sourceUpdatedAt: normalizeResoTimestamp(row[modField]),
  };

  const parsed = normalizedInventoryListingSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  return null;
}

/** First validation issue for import diagnostics. */
export function describeResoNormalizationFailure(
  raw: unknown,
  contract?: ResoPropertyNormalizerContract,
  options?: { modificationTimestampField?: string },
): string | null {
  if (!raw || typeof raw !== "object") return "row is not an object";
  if (!contract) {
    const row = raw as Record<string, unknown>;
    const id = row.ListingId ?? row.ListingKey;
    if (id == null || String(id).trim() === "") return "missing ListingId/ListingKey";
    return "listing failed normalization";
  }
  const row = raw as Record<string, unknown>;
  const modField = options?.modificationTimestampField ?? "ModificationTimestamp";
  const providerListingId = contract.extractListingId(row);
  if (!providerListingId) return "missing ListingId/ListingKey";

  const candidate = {
    provider: contract.provider,
    providerListingId,
    status: contract.resolveStatus(row),
    priceCents: resoListPriceToCents(row.ListPrice),
    currency: "USD",
    address: buildResoAddress(row),
    latitude: resoOptionalNumber(row.Latitude),
    longitude: resoOptionalNumber(row.Longitude),
    beds: resoOptionalNumber(row.BedroomsTotal),
    baths:
      resoOptionalNumber(row.BathroomsTotalInteger) ?? resoOptionalNumber(row.BathroomsFull),
    propertyType: mapResoPropertyType(row.PropertyType, row.PropertySubType),
    description:
      row.PublicRemarks != null
        ? String(row.PublicRemarks).slice(0, 8000)
        : undefined,
    features: [] as string[],
    photos: contract.extractPhotos?.(row) ?? normalizeResoMediaItems(row.Media),
    listingUrl: contract.extractListingUrl?.(row) ?? null,
    sourceUpdatedAt: normalizeResoTimestamp(row[modField]),
  };

  const parsed = normalizedInventoryListingSchema.safeParse(candidate);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  return issue ? `${issue.path.join(".")}: ${issue.message}` : "schema validation failed";
}
