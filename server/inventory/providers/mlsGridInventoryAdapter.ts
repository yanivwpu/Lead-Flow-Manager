import {
  mlsGridCredentialsSchema,
  mlsGridSourceConfigSchema,
  normalizedInventoryListingSchema,
  type NormalizedInventoryListing,
} from "@shared/inventory/inventoryListingSchema";
import type { InventoryListingStatus } from "@shared/inventory/inventoryListingSchema";
import type {
  InventoryAdapterContext,
  InventoryProviderAdapter,
  ValidateConnectionResult,
} from "./types";

const MLS_GRID_BASE = "https://api.mlsgrid.com/v2";
const PAGE_TOP_WITH_MEDIA = 1000;
const MIN_REQUEST_INTERVAL_MS = 550;

let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = MIN_REQUEST_INTERVAL_MS - (now - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function mlsGridFetchJson(url: string, accessToken: string): Promise<Record<string, unknown>> {
  await throttle();
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Accept-Encoding": "gzip",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`MLS Grid HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function mapStandardStatus(raw: unknown): InventoryListingStatus {
  const s = String(raw ?? "").replace(/\s+/g, "");
  const lower = s.toLowerCase();
  if (lower === "active") return "active";
  if (lower === "activeundercontract" || lower === "pending") return "pending";
  if (lower === "closed" || lower === "sold") return "sold";
  if (lower === "canceled" || lower === "cancelled" || lower === "expired" || lower === "withdrawn") {
    return "off_market";
  }
  if (lower === "inactive" || lower === "delete") return "inactive";
  return "inactive";
}

function mapPropertyType(raw: unknown, subType: unknown): string | null {
  const combined = `${String(raw ?? "")} ${String(subType ?? "")}`.toLowerCase();
  if (combined.includes("condo")) return "condo";
  if (combined.includes("townhouse") || combined.includes("town house")) return "townhouse";
  if (combined.includes("multi")) return "multi_family";
  if (combined.includes("land")) return "land";
  if (combined.includes("house") || combined.includes("single")) return "house";
  return raw ? String(raw).toLowerCase().replace(/\s+/g, "_") : null;
}

function priceToCents(listPrice: unknown): number | null {
  if (listPrice == null || listPrice === "") return null;
  const n = typeof listPrice === "number" ? listPrice : parseFloat(String(listPrice));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function extractPhotos(media: unknown): NormalizedInventoryListing["photos"] {
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

function buildAddress(row: Record<string, unknown>): NormalizedInventoryListing["address"] {
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

export function normalizeMlsGridProperty(raw: unknown): NormalizedInventoryListing | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const listingId = row.ListingId ?? row.ListingKey;
  if (listingId == null || String(listingId).trim() === "") return null;

  const mlgCanView = row.MlgCanView;
  const status = mlgCanView === false ? "inactive" : mapStandardStatus(row.StandardStatus);

  const candidate: NormalizedInventoryListing = {
    provider: "mls_grid",
    providerListingId: String(listingId).trim(),
    status,
    priceCents: priceToCents(row.ListPrice),
    currency: "USD",
    address: buildAddress(row),
    latitude: typeof row.Latitude === "number" ? row.Latitude : null,
    longitude: typeof row.Longitude === "number" ? row.Longitude : null,
    beds: row.BedroomsTotal != null ? Number(row.BedroomsTotal) : null,
    baths:
      row.BathroomsTotalInteger != null
        ? Number(row.BathroomsTotalInteger)
        : row.BathroomsFull != null
          ? Number(row.BathroomsFull)
          : null,
    propertyType: mapPropertyType(row.PropertyType, row.PropertySubType),
    description: row.PublicRemarks != null ? String(row.PublicRemarks).slice(0, 8000) : undefined,
    features: [],
    photos: extractPhotos(row.Media),
    listingUrl: null,
    sourceUpdatedAt:
      typeof row.ModificationTimestamp === "string" ? row.ModificationTimestamp : undefined,
  };

  const parsed = normalizedInventoryListingSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function buildInitialFilter(originatingSystemName: string, since?: Date): string {
  const escaped = originatingSystemName.replace(/'/g, "''");
  let filter = `OriginatingSystemName eq '${escaped}' and MlgCanView eq true`;
  if (since) {
    filter += ` and ModificationTimestamp gt ${since.toISOString()}`;
  }
  return filter;
}

export const mlsGridInventoryAdapter: InventoryProviderAdapter = {
  provider: "mls_grid",

  async validateConnection(ctx: InventoryAdapterContext): Promise<ValidateConnectionResult> {
    const creds = mlsGridCredentialsSchema.safeParse(ctx.credentials);
    const cfg = mlsGridSourceConfigSchema.safeParse(ctx.config);
    if (!creds.success) {
      return { ok: false, message: "Missing MLS Grid access token" };
    }
    if (!cfg.success) {
      return { ok: false, message: "Missing originatingSystemName in source config" };
    }
    try {
      const filter = encodeURIComponent(
        `OriginatingSystemName eq '${cfg.data.originatingSystemName.replace(/'/g, "''")}'`,
      );
      const url = `${MLS_GRID_BASE}/Property?$filter=${filter}&$top=1`;
      const body = await mlsGridFetchJson(url, creds.data.accessToken);
      const count = Array.isArray(body.value) ? body.value.length : 0;
      return {
        ok: true,
        message: "MLS Grid connection verified",
        details: { sampleRows: count },
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async fetchListings(ctx, options) {
    const creds = mlsGridCredentialsSchema.parse(ctx.credentials);
    const cfg = mlsGridSourceConfigSchema.parse(ctx.config);
    const filter = buildInitialFilter(cfg.data.originatingSystemName, options?.since);
    const expand = cfg.data.expandMedia !== false ? "&$expand=Media" : "";
    let url: string | null =
      `${MLS_GRID_BASE}/Property?$filter=${encodeURIComponent(filter)}&$top=${PAGE_TOP_WITH_MEDIA}${expand}`;

    const listings: unknown[] = [];
    let pagesFetched = 0;

    while (url) {
      const body = await mlsGridFetchJson(url, creds.data.accessToken);
      pagesFetched += 1;
      const value = body.value;
      if (Array.isArray(value)) listings.push(...value);
      const next = body["@odata.nextLink"];
      url = typeof next === "string" && next.length > 0 ? next : null;
    }

    return { listings, pagesFetched };
  },

  normalizeListing(raw: unknown, _ctx: InventoryAdapterContext): NormalizedInventoryListing | null {
    return normalizeMlsGridProperty(raw);
  },
};
