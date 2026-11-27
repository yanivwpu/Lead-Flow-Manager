/**
 * Locate a neighborhood for an owner-side map starting point only.
 * This never verifies an MLS property area or changes a saved polygon.
 * Use existing Google Geocoding + Places credentials; no browser API key.
 */
import { normalizeNeighborhoodName } from "@shared/agent/neighborhoodListingGeo";

export type NeighborhoodMapLocation = {
  latitude: number;
  longitude: number;
  precision: "neighborhood" | "city";
};
type MapQuery = { name: string; city: string; state: string; country: string };
type MapFetch = typeof fetch;
type Candidate = {
  displayName?: { text?: string };
  formattedAddress?: string;
  types?: string[];
  location?: { latitude?: number; longitude?: number };
};
const GOOGLE_GEOCODE = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_PLACES = "https://places.googleapis.com/v1/places:searchText";
const GEO_TYPES = new Set(["neighborhood", "sublocality", "sublocality_level_1",
  "political", "locality", "administrative_area_level_3"]);
const CITY_TYPES = new Set(["locality", "political", "administrative_area_level_3"]);
const ADDRESS_TYPES = new Set(["street_address", "route", "intersection", "premise", "subpremise"]);

function geocodePrecision(types: string[]): NeighborhoodMapLocation["precision"] | null {
  if (types.some((type) => ADDRESS_TYPES.has(type))) return null;
  if (types.some((type) => type === "locality" || type === "administrative_area_level_3")) return "city";
  if (types.some((type) => type === "neighborhood" || /^sublocality(?:_level_[1-5])?$/.test(type))) {
    return "neighborhood";
  }
  return null;
}

function safeCoordinates(latitude: unknown, longitude: unknown): NeighborhoodMapLocation | null {
  if (typeof latitude !== "number" || typeof longitude !== "number" ||
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    Math.abs(latitude) > 85 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude, precision: "neighborhood" };
}

function comparable(value: string): string {
  return normalizeNeighborhoodName(value).replace(/^dr /, "doctor ").replace(/^st /, "saint ");
}

type Lookup = { location: NeighborhoodMapLocation | null; unavailable: boolean };
async function googleGeocode(address: string, scope: "neighborhood" | "city", key: string, fetchFn: MapFetch): Promise<Lookup> {
  const url = new URL(GOOGLE_GEOCODE);
  url.searchParams.set("address", address);
  url.searchParams.set("key", key);
  try {
    const response = await fetchFn(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { location: null, unavailable: response.status !== 404 };
    const data = await response.json() as {
      status?: string; results?: { types?: string[];
        geometry?: { location?: { lat?: number; lng?: number } } }[];
    };
    if (data.status === "ZERO_RESULTS") return { location: null, unavailable: false };
    if (data.status !== "OK") return { location: null, unavailable: true };
    for (const result of Array.isArray(data.results) ? data.results : []) {
      const precision = geocodePrecision(result.types ?? []);
      if (!precision || (scope === "city" && precision !== "city")) continue;
      const point = safeCoordinates(result.geometry?.location?.lat, result.geometry?.location?.lng);
      if (point) return { location: { ...point, precision }, unavailable: false };
    }
    return { location: null, unavailable: false };
  } catch { return { location: null, unavailable: true }; }
}

async function googlePlacesSearch(
  textQuery: string, country: string, expectedName: string, scope: "neighborhood" | "city",
  key: string, fetchFn: MapFetch,
): Promise<Lookup> {
  try {
    // Deliberately request only minimum fields required for locating geography.
    // Do not use the prospect-discovery field mask with paid phones/ratings.
    const response = await fetchFn(GOOGLE_PLACES, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.types,places.location" },
      body: JSON.stringify({ textQuery, regionCode: country.toUpperCase(), pageSize: 5 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { location: null, unavailable: response.status !== 404 };
    const data = await response.json() as { places?: Candidate[] };
    const expected = comparable(expectedName);
    for (const place of Array.isArray(data.places) ? data.places : []) {
      const name = comparable(place.displayName?.text ?? "");
      const types = place.types ?? [];
      const allowed = scope === "neighborhood" ? GEO_TYPES : CITY_TYPES;
      if (name !== expected || types.some((type) => ADDRESS_TYPES.has(type)) ||
          !types.some((type) => allowed.has(type))) continue;
      const point = safeCoordinates(place.location?.latitude, place.location?.longitude);
      if (point) return { location: { ...point, precision: scope }, unavailable: false };
    }
    return { location: null, unavailable: false };
  } catch { return { location: null, unavailable: true }; }
}

/** Result distinguished from provider failures so the UI can show useful feedback. */
export async function findNeighborhoodMapLocation(
  input: MapQuery, apiKey: string, fetchFn: MapFetch = fetch,
): Promise<{ location: NeighborhoodMapLocation | null; unavailable: boolean }> {
  const { name, city, state, country } = input;
  const neighborhoodQuery = [name, city, state, country].join(", ");
  const cityQuery = [city, state, country].join(", ");
  let unavailable = false;
  const lookups: Array<() => Promise<Lookup>> = [
    () => googleGeocode(neighborhoodQuery, "neighborhood", apiKey, fetchFn),
    () => googlePlacesSearch(neighborhoodQuery, country, name, "neighborhood", apiKey, fetchFn),
    () => googleGeocode(cityQuery, "city", apiKey, fetchFn),
    () => googlePlacesSearch(cityQuery, country, city, "city", apiKey, fetchFn),
  ];
  for (let i = 0; i < lookups.length; i++) {
    const result = await lookups[i]();
    unavailable ||= result.unavailable;
    if (result.location) {
      return { location: { ...result.location,
        // Searching for the city explicitly is approximate, not a verified neighborhood.
        precision: i >= 2 ? "city" : result.location.precision }, unavailable: false };
    }
  }
  return { location: null, unavailable };
}
