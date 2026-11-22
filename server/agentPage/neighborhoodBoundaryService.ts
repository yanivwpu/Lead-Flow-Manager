import {
  boundaryBounds, readBoundaryGeometry, selectExactOfficialNeighborhood,
  supportsFortLauderdaleBoundary, type NeighborhoodBoundary, type BoundaryBounds,
} from "@shared/agent/neighborhoodListingGeo";

/**
 * First supported official boundary adapter. Add more municipal datasets here
 * without coupling boundaries to specific agents or hardcoded neighborhoods.
 * The recognized civic-association polygon is a geographic approximation to
 * the area's commonly used name, not a zoning or parcel ownership determination.
 */
const FORT_LAUDERDALE_GIS =
  "https://gis.fortlauderdale.gov/server/rest/services/Neighborhood_Associations/FeatureServer/0/query";
const DATASET_TTL_MS = 60 * 60 * 1000;
const ERROR_TTL_MS = 5 * 60 * 1000;
const GIS_RESPONSE_MAX_BYTES = 3_000_000;

export type NeighborhoodBoundaryResult =
  | { status: "verified"; source: string; geometry: NeighborhoodBoundary; bounds: BoundaryBounds }
  | { status: "unsupported" | "unmatched" | "unavailable"; source: null };

type CachedDataset = { expires: number; features: unknown[] | null };
let cachedDataset: CachedDataset | null = null;
let pendingDataset: Promise<unknown[] | null> | null = null;

async function fetchOfficialBoundaries(): Promise<unknown[] | null> {
  if (cachedDataset && cachedDataset.expires > Date.now()) return cachedDataset.features;
  if (pendingDataset) return pendingDataset;
  pendingDataset = (async () => {
    let features: unknown[] | null = null;
    try {
      const url = new URL(FORT_LAUDERDALE_GIS);
      url.searchParams.set("where", "1=1");
      url.searchParams.set("outFields", "OFFICIALNAME,UNOFFICIALNAME");
      url.searchParams.set("returnGeometry", "true");
      url.searchParams.set("outSR", "4326");
      url.searchParams.set("f", "geojson");
      const response = await fetch(url, {
        signal: AbortSignal.timeout(4500),
        headers: { Accept: "application/geo+json, application/json" },
      });
      if (!response.ok) throw new Error("GIS status " + response.status);
      const body = await response.text();
      if (body.length > GIS_RESPONSE_MAX_BYTES) throw new Error("GIS payload too large");
      const parsed: unknown = JSON.parse(body);
      if (!parsed || typeof parsed !== "object" ||
          (parsed as { type?: unknown }).type !== "FeatureCollection" ||
          !Array.isArray((parsed as { features?: unknown }).features)) {
        throw new Error("Invalid GIS feature collection");
      }
      const received = (parsed as { features: unknown[] }).features;
      if (received.length < 1 || received.length > 1500) throw new Error("Invalid GIS collection length");
      features = received;
    } catch (error) {
      console.warn("[neighborhood-listings] official boundary unavailable", error instanceof Error ? error.message : String(error));
    }
    cachedDataset = { features, expires: Date.now() + (features ? DATASET_TTL_MS : ERROR_TTL_MS) };
    return features;
  })().finally(() => { pendingDataset = null; });
  return pendingDataset;
}

export async function resolveNeighborhoodBoundary(input: {
  name: string; city: string; state: string;
}): Promise<NeighborhoodBoundaryResult> {
  if (!supportsFortLauderdaleBoundary(input.city, input.state)) {
    return { status: "unsupported", source: null };
  }
  const features = await fetchOfficialBoundaries();
  if (!features) return { status: "unavailable", source: null };
  const geometry = selectExactOfficialNeighborhood(features, input.name);
  if (!geometry) return { status: "unmatched", source: null };
  const bounds = boundaryBounds(geometry);
  // Defensive guard: city GIS must return Florida coordinates in WGS84.
  if (!(bounds.minLat > 25 && bounds.maxLat < 27 &&
    bounds.minLon > -81 && bounds.maxLon < -79 && bounds.maxLat > bounds.minLat &&
    bounds.maxLon > bounds.minLon)) {
    return { status: "unmatched", source: null };
  }
  return {
    status: "verified",
    source: "City of Fort Lauderdale Neighborhood Associations GIS",
    geometry, bounds,
  };
}

/** Only tests use this; no mutable per-agent boundary state is introduced. */
export function isSupportedOfficialNeighborhoodSource(city: string, state: string): boolean {
  return supportsFortLauderdaleBoundary(city, state);
}
