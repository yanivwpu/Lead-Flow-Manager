import {
  PROSPECT_AI_DEFAULT_PAGE_SIZE,
  PROSPECT_AI_MAX_RADIUS_KM,
  type ProspectAiNormalizedProspect,
} from "@shared/prospectAI";
import { normalizeProspectList } from "../normalize";
import type {
  FetchLike,
  ProspectDiscoveryProvider,
  ProspectDiscoveryProviderResult,
  ProspectDiscoveryQuery,
} from "./types";

const PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.location",
  "places.types",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
].join(",");

type GeocodeResult = { latitude: number; longitude: number } | null;

type PlacesApiPlace = {
  id?: string;
  name?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
};

function readPlacesApiKey(): string {
  const key = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
  if (!key) {
    throw new Error("GOOGLE_PLACES_API_KEY is not configured");
  }
  return key;
}

/** Strip secrets from any object that might be logged or persisted. */
export function sanitizePlacesRaw(place: PlacesApiPlace): Record<string, unknown> {
  return {
    id: place.id ?? null,
    displayName: place.displayName?.text ?? null,
    formattedAddress: place.formattedAddress ?? null,
    types: Array.isArray(place.types) ? place.types.slice(0, 10) : [],
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? null,
    businessStatus: place.businessStatus ?? null,
    hasPhone: Boolean(place.nationalPhoneNumber || place.internationalPhoneNumber),
    hasWebsite: Boolean(place.websiteUri),
    location: place.location
      ? { latitude: place.location.latitude ?? null, longitude: place.location.longitude ?? null }
      : null,
  };
}

export function mapPlacesApiPlaceToCandidate(place: PlacesApiPlace): Partial<ProspectAiNormalizedProspect> {
  const placeId = String(place.id || "").replace(/^places\//, "").trim();
  const name = String(place.displayName?.text || "").trim();
  const primaryType =
    Array.isArray(place.types) && place.types.length > 0
      ? String(place.types[0]).replace(/_/g, " ")
      : null;

  return {
    providerPlaceId: placeId,
    name,
    businessType: primaryType,
    address: place.formattedAddress ?? null,
    phone: place.internationalPhoneNumber || place.nationalPhoneNumber || null,
    website: place.websiteUri ?? null,
    email: null,
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? null,
  };
}

export async function geocodeLocation(
  location: string,
  apiKey: string,
  fetchFn: FetchLike = fetch,
): Promise<GeocodeResult> {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("address", location);
  url.searchParams.set("key", apiKey);

  const res = await fetchFn(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Geocoding failed (${res.status})`);
  }
  const data = (await res.json()) as {
    status?: string;
    results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
  };
  if (data.status !== "OK" || !data.results?.[0]?.geometry?.location) {
    return null;
  }
  const loc = data.results[0].geometry.location;
  const latitude = Number(loc.lat);
  const longitude = Number(loc.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function radiusMeters(radiusKm: number | undefined): number | null {
  if (radiusKm == null || !Number.isFinite(radiusKm)) return null;
  const clamped = Math.min(Math.max(radiusKm, 0.5), PROSPECT_AI_MAX_RADIUS_KM);
  return Math.round(clamped * 1000);
}

export class GooglePlacesDiscoveryProvider implements ProspectDiscoveryProvider {
  readonly id = "google_places" as const;

  constructor(private readonly fetchFn: FetchLike = fetch) {}

  async discover(query: ProspectDiscoveryQuery): Promise<ProspectDiscoveryProviderResult> {
    const apiKey = readPlacesApiKey();
    const textQuery = `${query.businessType} in ${query.location}`.trim();

    const body: Record<string, unknown> = {
      textQuery,
      pageSize: PROSPECT_AI_DEFAULT_PAGE_SIZE,
    };

    const meters = radiusMeters(query.radiusKm);
    if (meters != null) {
      const geo = await geocodeLocation(query.location, apiKey, this.fetchFn);
      if (geo) {
        body.locationBias = {
          circle: {
            center: { latitude: geo.latitude, longitude: geo.longitude },
            radius: meters,
          },
        };
      }
    }

    const res = await this.fetchFn(PLACES_TEXT_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = "";
      try {
        const errJson = (await res.json()) as { error?: { message?: string } };
        detail = errJson?.error?.message || "";
      } catch {
        /* ignore */
      }
      // Never include the API key in error messages.
      throw new Error(
        detail
          ? `Google Places search failed (${res.status}): ${detail}`
          : `Google Places search failed (${res.status})`,
      );
    }

    const data = (await res.json()) as { places?: PlacesApiPlace[] };
    const places = Array.isArray(data.places) ? data.places : [];
    const candidates = places
      .filter((p) => !p.businessStatus || p.businessStatus === "OPERATIONAL")
      .map(mapPlacesApiPlaceToCandidate);
    const prospects = normalizeProspectList(candidates);

    return {
      prospects,
      meta: {
        provider: this.id,
        requested: places.length,
        returned: prospects.length,
        usedLocationBias: Boolean(body.locationBias),
      },
    };
  }
}

export function createGooglePlacesProvider(fetchFn?: FetchLike): ProspectDiscoveryProvider {
  return new GooglePlacesDiscoveryProvider(fetchFn);
}
