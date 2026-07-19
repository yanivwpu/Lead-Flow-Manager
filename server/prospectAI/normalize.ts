import type { ProspectAiNormalizedProspect } from "@shared/prospectAI";

const MAX_NAME = 200;
const MAX_TEXT = 500;
const MAX_PHONE = 40;
const MAX_URL = 500;
const MAX_EMAIL = 254;

function trimOrNull(value: unknown, max: number): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function finiteNumberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function normalizePhone(value: unknown): string | null {
  const raw = trimOrNull(value, MAX_PHONE);
  if (!raw) return null;
  // Keep leading + and digits; drop other punctuation for storage consistency.
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.replace(/\D/g, "").length < 7) return null;
  return cleaned.slice(0, MAX_PHONE);
}

function normalizeWebsite(value: unknown): string | null {
  const raw = trimOrNull(value, MAX_URL);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(raw)) return `https://${raw}`;
  return null;
}

function normalizeEmail(value: unknown): string | null {
  const raw = trimOrNull(value, MAX_EMAIL);
  if (!raw || !raw.includes("@")) return null;
  return raw.toLowerCase();
}

/**
 * Validate and normalize a provider prospect into a safe persisted shape.
 * Drops entries without a usable place id + name.
 */
export function normalizeProspectCandidate(
  input: Partial<ProspectAiNormalizedProspect> & { providerPlaceId?: string; name?: string },
): ProspectAiNormalizedProspect | null {
  const providerPlaceId = trimOrNull(input.providerPlaceId, 200);
  const name = trimOrNull(input.name, MAX_NAME);
  if (!providerPlaceId || !name) return null;

  const rating = finiteNumberOrNull(input.rating);
  const reviewCount = finiteNumberOrNull(input.reviewCount);
  const latitude = finiteNumberOrNull(input.latitude);
  const longitude = finiteNumberOrNull(input.longitude);

  return {
    providerPlaceId,
    name,
    businessType: trimOrNull(input.businessType, MAX_TEXT),
    address: trimOrNull(input.address, MAX_TEXT),
    phone: normalizePhone(input.phone),
    website: normalizeWebsite(input.website),
    email: normalizeEmail(input.email),
    latitude:
      latitude != null && latitude >= -90 && latitude <= 90 ? latitude : null,
    longitude:
      longitude != null && longitude >= -180 && longitude <= 180 ? longitude : null,
    rating: rating != null && rating >= 0 && rating <= 5 ? Math.round(rating * 10) / 10 : null,
    reviewCount:
      reviewCount != null && reviewCount >= 0 ? Math.floor(reviewCount) : null,
  };
}

export function normalizeProspectList(
  rows: Array<Partial<ProspectAiNormalizedProspect> & { providerPlaceId?: string; name?: string }>,
): ProspectAiNormalizedProspect[] {
  const seen = new Set<string>();
  const out: ProspectAiNormalizedProspect[] = [];
  for (const row of rows) {
    const n = normalizeProspectCandidate(row);
    if (!n) continue;
    if (seen.has(n.providerPlaceId)) continue;
    seen.add(n.providerPlaceId);
    out.push(n);
  }
  return out;
}

export type DiscoverInputValidation =
  | { ok: true; businessType: string; location: string; radiusKm?: number }
  | { ok: false; error: string };

export function validateDiscoverInput(body: unknown): DiscoverInputValidation {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body is required" };
  }
  const b = body as Record<string, unknown>;
  const businessType = String(b.businessType ?? "").trim();
  const location = String(b.location ?? "").trim();
  if (businessType.length < 2) {
    return { ok: false, error: "businessType is required (min 2 characters)" };
  }
  if (businessType.length > 120) {
    return { ok: false, error: "businessType is too long" };
  }
  if (location.length < 2) {
    return { ok: false, error: "location is required (min 2 characters)" };
  }
  if (location.length > 200) {
    return { ok: false, error: "location is too long" };
  }

  if (b.radiusKm === undefined || b.radiusKm === null || b.radiusKm === "") {
    return { ok: true, businessType, location };
  }

  const radiusKm = typeof b.radiusKm === "number" ? b.radiusKm : Number(b.radiusKm);
  if (!Number.isFinite(radiusKm)) {
    return { ok: false, error: "radiusKm must be a number" };
  }
  if (radiusKm < 0.5 || radiusKm > 50) {
    return { ok: false, error: "radiusKm must be between 0.5 and 50" };
  }
  return { ok: true, businessType, location, radiusKm };
}
