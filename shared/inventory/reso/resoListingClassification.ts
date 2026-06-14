/**
 * RESO / Bridge listing classification — property type, sale vs rent, pool.
 * Single source of truth for sync, backfill, and stored-row re-normalization.
 */

export type ResoListingTransactionType = "sale" | "rent";

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function resoYesNo(value: unknown): boolean | null {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "y" || s === "yes" || s === "true") return true;
  if (s === "n" || s === "no" || s === "false") return false;
  return null;
}

function resoOptionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function extractResoStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;|]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

const NON_SFH_TYPE_RE =
  /\b(townhouse|town[\s_]?house|townhome|town[\s_]?home|villa|condo|condominium|apartment|duplex|triplex|fourplex|multi[\s_]?family|commercial|business[\s_]?opportunity|land|lot|mobile|manufactured)\b/;

const SFH_SUBTYPE_RE =
  /\b(single[\s_]?family[\s_]?residence|single[\s_]?family[\s_]?home|single[\s_]?family|sfh|detached|sfr)\b/;

const SFH_TYPE_RE = /\b(single[\s_]?family|detached|sfr)\b/;

const ATTACHED_STRUCTURE_RE =
  /\b(attached|row[\s_]?house|rowhouse|cluster[\s_]?home|half[\s_]?duplex|zero[\s_]?lot[\s_]?line|patio[\s_]?home)\b/;

export type ResoPropertyClassificationContext = {
  structureType?: unknown;
  architecturalStyle?: unknown;
  unitNumber?: unknown;
  addressLine1?: unknown;
  addressLine2?: unknown;
};

/** Unit / attached address signals — row units (#0) are not detached SFH. */
export function addressIndicatesUnitNumber(
  addressLine1?: unknown,
  addressLine2?: unknown,
  unitNumber?: unknown,
): boolean {
  const parts = [addressLine1, addressLine2, unitNumber]
    .filter((v) => v != null && String(v).trim() !== "")
    .map(String);
  const hay = normalizeText(parts.join(" "));
  if (!hay) return false;
  return (
    /#\s*\d+\b/.test(hay) ||
    /\bunit\s+[a-z0-9]+\b/.test(hay) ||
    /\bapt\.?\s*\w+/i.test(hay) ||
    /\b(?:lot|unit)\s*#\s*\d+/i.test(hay)
  );
}

function attachedStructureSignal(
  combined: string,
  context?: ResoPropertyClassificationContext,
): boolean {
  const extra = [context?.structureType, context?.architecturalStyle]
    .filter(Boolean)
    .map(String)
    .join(" ");
  const hay = `${combined} ${normalizeText(extra)}`.replace(/-/g, "_");
  return ATTACHED_STRUCTURE_RE.test(hay);
}

function hasClearDetachedSfhSignal(
  combined: string,
  context?: ResoPropertyClassificationContext,
): boolean {
  const extra = [context?.structureType, context?.architecturalStyle]
    .filter(Boolean)
    .map(String)
    .join(" ");
  const hay = `${combined} ${normalizeText(extra)}`.replace(/-/g, "_");
  return SFH_SUBTYPE_RE.test(hay) && /\bdetached\b/.test(hay);
}

function unitBlocksDetachedHouse(
  combined: string,
  context?: ResoPropertyClassificationContext,
): boolean {
  if (
    !addressIndicatesUnitNumber(
      context?.addressLine1,
      context?.addressLine2,
      context?.unitNumber,
    )
  ) {
    return false;
  }
  return !hasClearDetachedSfhSignal(combined, context);
}

/**
 * Map RESO PropertyType + PropertySubType to coarse inventory buckets.
 * Townhouse/villa/condo are never collapsed into house.
 */
export function mapResoPropertyType(
  raw: unknown,
  subType: unknown,
  context?: ResoPropertyClassificationContext,
): string | null {
  const sub = normalizeText(String(subType ?? "")).replace(/-/g, "_");
  const type = normalizeText(String(raw ?? "")).replace(/-/g, " ");
  const combined = `${type} ${sub}`.trim();

  if (!combined) return null;

  if (/\b(townhouse|town[\s_]?house|townhome|town[\s_]?home)\b/.test(combined)) return "townhouse";
  if (/\bvilla\b/.test(combined)) return "villa";
  if (/\b(condo|condominium|apartment)\b/.test(combined)) return "condo";
  if (/\b(duplex|triplex|fourplex|multi[\s_]?family|multi[\s_]?family)\b/.test(combined)) {
    return "multi_family";
  }
  if (/\b(commercial[\s_]?sale|commercial[\s_]?lease|commercial)\b/.test(combined)) {
    return "commercial";
  }
  if (/\bbusiness[\s_]?opportunity\b/.test(combined)) return "business_opportunity";
  if (/\b(land|lot)\b/.test(combined) && !/\b(single|house|residence)\b/.test(combined)) {
    return "land";
  }

  if (attachedStructureSignal(combined, context)) return "townhouse";

  const isResidentialLease = /\b(residential[\s_]?lease|lease[\s_]?only|rental)\b/.test(combined);
  if (isResidentialLease) {
    if (unitBlocksDetachedHouse(combined, context)) return "townhouse";
    return "residential_lease";
  }

  if (SFH_SUBTYPE_RE.test(sub) || SFH_TYPE_RE.test(type)) {
    if (unitBlocksDetachedHouse(combined, context)) return "townhouse";
    if (attachedStructureSignal(combined, context) && !/\bdetached\b/.test(combined)) {
      return "townhouse";
    }
    return "house";
  }

  if (/\b(house|home)\b/.test(sub) && !/\btown\b/.test(sub) && /\bdetached\b/.test(combined)) {
    return "house";
  }

  if (/\bresidential\b/.test(type) && !NON_SFH_TYPE_RE.test(combined)) {
    if (SFH_SUBTYPE_RE.test(sub)) {
      if (unitBlocksDetachedHouse(combined, context)) return "townhouse";
      if (attachedStructureSignal(combined, context)) return "townhouse";
      return "house";
    }
    return null;
  }

  return raw ? normalizeText(String(raw)).replace(/\s+/g, "_") : null;
}

export function buildResoPropertyClassificationContext(
  row: Record<string, unknown>,
): ResoPropertyClassificationContext {
  const unit = row.UnitNumber != null ? String(row.UnitNumber).trim() : "";
  const line2 = unit ? (unit.startsWith("#") ? unit : `#${unit}`) : undefined;
  const parts = [row.StreetNumber, row.StreetName, row.StreetSuffix].filter(Boolean).map(String);
  const line1 = String(row.UnparsedAddress ?? "").trim() || parts.join(" ").trim() || undefined;
  return {
    structureType: row.StructureType,
    architecturalStyle: row.ArchitecturalStyle,
    unitNumber: row.UnitNumber,
    addressLine1: line1,
    addressLine2: line2,
  };
}

const RENT_PROPERTY_TYPE_RE =
  /\b(residential[\s_]?lease|commercial[\s_]?lease|lease[\s_]?only|for[\s_]?rent|rental|rent[\s_]?only)\b/;

const SALE_PROPERTY_TYPE_RE =
  /\b(residential[\s_]?sale|commercial[\s_]?sale|for[\s_]?sale|sale[\s_]?only)\b/;

const RENT_TRANSACTION_RE = /\b(lease|rent|rental)\b/;
const SALE_TRANSACTION_RE = /\b(sale|for[\s_]?sale|purchase)\b/;

/** RESO sale vs rent from TransactionType, PropertyType, price, and lease fields. */
export function resolveResoListingTransactionType(
  row: Record<string, unknown>,
): ResoListingTransactionType {
  const txnRaw = [row.TransactionType, row.ListTransactionType, row.MlsStatus]
    .filter((v) => v != null && String(v).trim() !== "")
    .map(String)
    .join(" ");
  const txn = normalizeText(txnRaw);
  if (txn && RENT_TRANSACTION_RE.test(txn) && !SALE_TRANSACTION_RE.test(txn)) return "rent";
  if (txn && SALE_TRANSACTION_RE.test(txn) && !RENT_TRANSACTION_RE.test(txn)) return "sale";

  const propCombined = normalizeText(
    `${row.PropertyType ?? ""} ${row.PropertySubType ?? ""}`.replace(/_/g, " "),
  );
  if (RENT_PROPERTY_TYPE_RE.test(propCombined)) return "rent";
  if (SALE_PROPERTY_TYPE_RE.test(propCombined)) return "sale";

  const listPrice = resoOptionalNumber(row.ListPrice);
  const leaseAmount =
    resoOptionalNumber(row.LeaseAmount) ??
    resoOptionalNumber(row.RentAmount) ??
    resoOptionalNumber(row.MonthlyRent) ??
    resoOptionalNumber(row.TotalActualRent);

  if (leaseAmount != null && leaseAmount > 0) {
    if (listPrice == null || listPrice < 50_000) return "rent";
  }

  if (listPrice != null && listPrice >= 100_000) return "sale";
  if (listPrice != null && listPrice > 0 && listPrice < 50_000) return "rent";

  const remarks = normalizeText(String(row.PublicRemarks ?? ""));
  if (/\b(for[\s_]?rent|for[\s_]?lease|monthly[\s_]?rent|rent[\s_]?only)\b/.test(remarks)) return "rent";
  if (/\b(for[\s_]?sale|purchase[\s_]?price)\b/.test(remarks)) return "sale";

  return "sale";
}

const POOL_FEATURE_RE =
  /\b(private[\s_]?pool|heated[\s_]?pool|swimming[\s_]?pool|in[\s-]?ground[\s_]?pool|community[\s_]?pool|\bpool\b)/i;
const NO_POOL_RE = /\b(no[\s_]?pool|without[\s_]?pool|pool[\s_]?none)\b/i;

/** Pool flag from RESO YN fields, feature lists, and PublicRemarks. */
export function extractResoPoolFlag(
  row: Record<string, unknown>,
  options?: { publicRemarks?: string },
): boolean | null {
  for (const field of [row.PoolPrivateYN, row.PrivatePoolYN]) {
    const yn = resoYesNo(field);
    if (yn != null) return yn;
  }

  let sawPool = false;
  let sawNoPool = false;

  for (const item of extractResoStringList(row.PoolFeatures)) {
    const t = normalizeText(item);
    if (NO_POOL_RE.test(t)) sawNoPool = true;
    else if (t.length > 0) sawPool = true;
  }

  const otherFeatureFields = [
    row.ExteriorFeatures,
    row.CommunityFeatures,
    row.InteriorFeatures,
    row.WaterfrontFeatures,
  ];

  for (const field of otherFeatureFields) {
    for (const item of extractResoStringList(field)) {
      const t = normalizeText(item);
      if (NO_POOL_RE.test(t)) sawNoPool = true;
      if (POOL_FEATURE_RE.test(t) && !NO_POOL_RE.test(t)) sawPool = true;
    }
  }

  if (sawNoPool) return false;
  if (sawPool) return true;

  const remarks = normalizeText(
    options?.publicRemarks ?? (row.PublicRemarks != null ? String(row.PublicRemarks) : ""),
  );
  if (NO_POOL_RE.test(remarks)) return false;
  if (/\b(private[\s_]?pool|heated[\s_]?pool|swimming[\s_]?pool|\bpool\b)/.test(remarks)) return true;

  return null;
}

export type StoredListingRenormalizeInput = {
  propertyType: string | null;
  propertySubtype: string | null;
  priceCents: number | null;
  description: string | null;
  features: string[];
  addressLine1?: string | null;
  addressLine2?: string | null;
  listingDetails?: { pool?: boolean; listingTransactionType?: ResoListingTransactionType } | null;
};

/** Re-derive normalized fields from persisted DB columns (no raw RESO payload). */
export function renormalizeStoredListingFields(input: StoredListingRenormalizeInput): {
  propertyType: string | null;
  listingTransactionType: ResoListingTransactionType;
  pool: boolean | null;
} {
  const propertyType = mapResoPropertyType(input.propertyType, input.propertySubtype, {
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
  });

  const hay = normalizeText(
    [
      input.propertyType,
      input.propertySubtype,
      input.description,
      ...(input.features ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );

  let listingTransactionType: ResoListingTransactionType =
    input.listingDetails?.listingTransactionType ?? "sale";

  if (RENT_PROPERTY_TYPE_RE.test(hay)) {
    listingTransactionType = "rent";
  } else if (SALE_PROPERTY_TYPE_RE.test(hay)) {
    listingTransactionType = "sale";
  } else {
    const price = input.priceCents != null ? input.priceCents / 100 : null;
    if (price != null && price >= 100_000) listingTransactionType = "sale";
    else if (price != null && price > 0 && price < 50_000) listingTransactionType = "rent";
    else if (/\b(for[\s_]?rent|for[\s_]?lease|monthly[\s_]?rent)\b/.test(hay)) listingTransactionType = "rent";
    else if (/\bfor[\s_]?sale\b/.test(hay)) listingTransactionType = "sale";
  }

  let pool: boolean | null = input.listingDetails?.pool ?? null;
  if (pool == null) {
    for (const raw of input.features ?? []) {
      const t = normalizeText(String(raw));
      if (NO_POOL_RE.test(t)) {
        pool = false;
        break;
      }
      if (POOL_FEATURE_RE.test(t) && !NO_POOL_RE.test(t)) {
        pool = true;
      }
    }
  }
  if (pool == null && input.description) {
    const d = normalizeText(input.description);
    if (NO_POOL_RE.test(d)) pool = false;
    else if (/\b(private[\s_]?pool|heated[\s_]?pool|swimming[\s_]?pool|\bpool\b)/.test(d)) pool = true;
  }

  return { propertyType, listingTransactionType, pool };
}
