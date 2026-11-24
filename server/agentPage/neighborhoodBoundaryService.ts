import { readCustomNeighborhoodBoundary } from "@shared/agent/neighborhoodCustomBoundary";
import {
  boundaryBounds, normalizeNeighborhoodName, selectExactNamedNeighborhood,
  supportsFortLauderdaleBoundary, type NeighborhoodBoundary, type BoundaryBounds,
} from "@shared/agent/neighborhoodListingGeo";

/**
 * Central municipal provider registry. Each source must publish polygon
 * geometries and identified neighborhood names, not postal/ZIP proximity.
 * Country + state + city gates avoid same-named places in different markets.
 *
 * Geographic data are provider-defined neighborhood approximations, not
 * legal parcel limits. An unsupported city never gets a guessed boundary.
 */
type OfficialBoundarySource = {
  id: "fort-lauderdale" | "miami" | "pompano-beach";
  city: string;
  url: string;
  nameFields: readonly string[];
  cityField?: string;
  source: string;
  guard: { minLat: number; maxLat: number; minLon: number; maxLon: number };
};

const OFFICIAL_SOURCES: readonly OfficialBoundarySource[] = [
  {
    id: "fort-lauderdale",
    city: "Fort Lauderdale",
    url: "https://gis.fortlauderdale.gov/server/rest/services/Neighborhood_Associations/FeatureServer/0/query",
    nameFields: ["OFFICIALNAME", "UNOFFICIALNAME"],
    source: "City of Fort Lauderdale Neighborhood Associations GIS",
    guard: { minLat: 25, maxLat: 27, minLon: -81, maxLon: -79 },
  },
  {
    id: "miami",
    city: "Miami",
    url: "https://gis.miami.gov/gis/rest/services/Maps/Neighborhoods/MapServer/0/query",
    nameFields: ["NEIGHBORHOOD"],
    source: "City of Miami Neighborhoods GIS",
    guard: { minLat: 25.65, maxLat: 25.92, minLon: -80.4, maxLon: -80.1 },
  },
  {
    id: "pompano-beach",
    city: "Pompano Beach",
    url: "https://services.arcgis.com/HnPbdNoPBNAJ6Oel/ArcGIS/rest/services/Neighborhoods_Exposure/FeatureServer/0/query",
    nameFields: ["NEIGHBORHO"],
    cityField: "CITYNAME",
    source: "City of Pompano Beach neighborhood polygons (RS&H exposure dataset)",
    guard: { minLat: 26.12, maxLat: 26.38, minLon: -80.32, maxLon: -80.02 },
  },
];

const DATASET_TTL_MS = 60 * 60 * 1000;
const ERROR_TTL_MS = 5 * 60 * 1000;
const GIS_RESPONSE_MAX_BYTES = 3_000_000;

export type NeighborhoodBoundaryResult =
  | { status: "verified" | "custom"; source: string; geometry: NeighborhoodBoundary; bounds: BoundaryBounds }
  | { status: "unsupported" | "unmatched" | "unavailable"; source: null };

type CachedDataset = { expires: number; features: unknown[] | null };
const cachedDatasets = new Map<OfficialBoundarySource["id"], CachedDataset>();
const pendingDatasets = new Map<OfficialBoundarySource["id"], Promise<unknown[] | null>>();

function normalizedCity(value: string): string {
  return normalizeNeighborhoodName(value).replace(/^(?:ft|st) /, (match) => match === "ft " ? "fort " : "saint ");
}

/**
 * Existing neighborhood pages have no country field yet, so their US legacy
 * default is retained. New foreign-country requests are explicitly rejected
 * until a country-aware Overture source can be proved and configured.
 */
function usContext(input: { state: string; country?: string }): boolean {
  const country = (input.country || "US").toLowerCase().replace(/[.\s]+/g, "");
  const state = input.state.toLowerCase().trim();
  return (country === "us" || country === "usa" || country === "unitedstates" ||
    country === "unitedstatesofamerica") && (state === "fl" || state === "florida");
}

function sourceFor(input: { city: string; state: string; country?: string }): OfficialBoundarySource | undefined {
  if (!usContext(input)) return undefined;
  return OFFICIAL_SOURCES.find((source) => normalizedCity(source.city) === normalizedCity(input.city));
}

async function fetchOfficialBoundaries(source: OfficialBoundarySource): Promise<unknown[] | null> {
  const cached = cachedDatasets.get(source.id);
  if (cached && cached.expires > Date.now()) return cached.features;
  const pending = pendingDatasets.get(source.id);
  if (pending) return pending;

  const task = (async () => {
    let features: unknown[] | null = null;
    try {
      // All URL hosts and query fields are fixed by the server-side allowlist.
      // User-authored neighborhood names are never interpolated into requests.
      const url = new URL(source.url);
      url.searchParams.set("where", "1=1");
      url.searchParams.set("outFields", [...source.nameFields, ...(source.cityField ? [source.cityField] : [])].join(","));
      url.searchParams.set("returnGeometry", "true");
      url.searchParams.set("outSR", "4326");
      url.searchParams.set("f", "geojson");
      const response = await fetch(url, {
        signal: AbortSignal.timeout(4500),
        headers: { Accept: "application/geo+json, application/json" },
      });
      if (!response.ok) throw new Error("GIS status " + response.status);
      if (Number(response.headers.get("content-length") || 0) > GIS_RESPONSE_MAX_BYTES) {
        throw new Error("GIS content exceeds maximum");
      }
      const body = await response.text();
      if (body.length > GIS_RESPONSE_MAX_BYTES) throw new Error("GIS payload too large");
      const parsed: unknown = JSON.parse(body);
      if (!parsed || typeof parsed !== "object" ||
          (parsed as { type?: unknown }).type !== "FeatureCollection" ||
          !Array.isArray((parsed as { features?: unknown }).features)) {
        throw new Error("Invalid GIS feature collection");
      }
      if ((parsed as { exceededTransferLimit?: unknown }).exceededTransferLimit === true) {
        throw new Error("GIS features truncated");
      }
      const received = (parsed as { features: unknown[] }).features;
      if (received.length < 1 || received.length > 1500) throw new Error("Invalid GIS collection length");
      features = received;
    } catch (error) {
      console.warn("[neighborhood-listings] official boundary unavailable", {
        source: source.id, message: error instanceof Error ? error.message : String(error),
      });
    }
    cachedDatasets.set(source.id, {
      features, expires: Date.now() + (features ? DATASET_TTL_MS : ERROR_TTL_MS),
    });
    return features;
  })().finally(() => { pendingDatasets.delete(source.id); });
  pendingDatasets.set(source.id, task);
  return task;
}

export async function resolveNeighborhoodBoundary(input: {
  name: string; city: string; state: string; country?: string;
  customBoundary?: unknown;
}): Promise<NeighborhoodBoundaryResult> {
  if (input.customBoundary != null) {
    const geometry = readCustomNeighborhoodBoundary(input.customBoundary);
    if (!geometry) return { status: "unmatched", source: null };
    return { status: "custom", source: "Agent-defined custom area (not official GIS)",
      geometry, bounds: boundaryBounds(geometry) };
  }
  const source = sourceFor(input);
  if (!source) return { status: "unsupported", source: null };
  const features = await fetchOfficialBoundaries(source);
  if (!features) return { status: "unavailable", source: null };

  const geometry = selectExactNamedNeighborhood(features, input.name, source.nameFields,
    source.cityField ? { name: source.city, fields: [source.cityField] } : undefined);
  if (!geometry) return { status: "unmatched", source: null };
  const bounds = boundaryBounds(geometry);
  const guard = source.guard;
  // Data can move or be mislabeled upstream; never treat a polygon in a
  // different region (or zero-area geometry) as proof of listing membership.
  if (!(bounds.minLat >= guard.minLat && bounds.maxLat <= guard.maxLat &&
    bounds.minLon >= guard.minLon && bounds.maxLon <= guard.maxLon &&
    bounds.maxLat > bounds.minLat && bounds.maxLon > bounds.minLon)) {
    return { status: "unmatched", source: null };
  }
  return { status: "verified", source: source.source, geometry, bounds };
}

/** Provider registry enables adding new cities without hardcoding agent IDs. */
export function isSupportedOfficialNeighborhoodSource(city: string, state: string, country?: string): boolean {
  return sourceFor({ city, state, country }) !== undefined;
}

// Preserve the original public helper's exact behavior for existing callers.
export { supportsFortLauderdaleBoundary };
