/**
 * Buyer geo constraints — parse inbound text, resolve registry entries, evaluate listings.
 */
import {
  type GeoReferenceDefinition,
  type GeoSide,
  geoReferenceRegistry,
  getGeoReference,
} from "./geoReferenceRegistry";

export type BuyerGeoConstraint = {
  referenceId: string;
  side: GeoSide;
  cityContext?: string;
};

export type ResolvedBuyerGeoConstraint = BuyerGeoConstraint & {
  reference: GeoReferenceDefinition;
};

export type GeoConstraintEvaluation = "pass" | "fail" | "unknown";

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function cityMatchesReference(city: string | null | undefined, ref: GeoReferenceDefinition): boolean {
  if (!ref.cityKeys.length) return true;
  const c = normalizeText(city ?? "");
  if (!c) return false;
  return ref.cityKeys.some((key) => c.includes(key) || key.includes(c));
}

function cityContextMatchesReference(cityContext: string | undefined, ref: GeoReferenceDefinition): boolean {
  if (!cityContext?.trim()) return ref.cityKeys.length === 0;
  const ctx = normalizeText(cityContext);
  return ref.cityKeys.some((key) => ctx.includes(key) || key.includes(ctx));
}

function roadPhraseMatchesReference(roadPhrase: string, ref: GeoReferenceDefinition): boolean {
  const norm = normalizeText(roadPhrase).replace(/\b(the|hwy|highway)\b/g, " ").replace(/\s+/g, " ").trim();
  return ref.roadAliases.some((alias) => {
    const a = normalizeText(alias);
    return norm.includes(a) || a.includes(norm);
  });
}

/** Match buyer road phrase + optional city to a registry entry. */
export function resolveGeoReferenceFromPhrase(
  roadPhrase: string,
  cityContext?: string,
): GeoReferenceDefinition | undefined {
  const candidates = Object.values(geoReferenceRegistry).filter((ref) =>
    roadPhraseMatchesReference(roadPhrase, ref),
  );
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) {
    const ref = candidates[0];
    if (cityContext && ref.cityKeys.length > 0 && !cityContextMatchesReference(cityContext, ref)) {
      return undefined;
    }
    return ref;
  }
  if (cityContext) {
    const withCity = candidates.filter((ref) => cityContextMatchesReference(cityContext, ref));
    if (withCity.length === 1) return withCity[0];
    if (withCity.length > 1) return withCity[0];
  }
  return candidates[0];
}

const SIDE_OF_ROAD_RE =
  /\b(east|west)\s+of\s+(?:the\s+)?(.+?)(?:\s+in\s+([A-Za-z][A-Za-z\s]{1,40}))?(?:\s*[?.!,]|$)/gi;

/** Extract structured geo constraints from buyer message text. */
export function parseGeoConstraintsFromText(text: string): BuyerGeoConstraint[] {
  const out: BuyerGeoConstraint[] = [];
  const seen = new Set<string>();

  for (const m of text.matchAll(SIDE_OF_ROAD_RE)) {
    const sideRaw = m[1]?.toLowerCase();
    const roadPhrase = m[2]?.trim();
    let cityContext = m[3]?.trim();

    if (!sideRaw || !roadPhrase) continue;
    if (sideRaw !== "east" && sideRaw !== "west") continue;

    if (!cityContext) {
      const inM = text.match(/\bin\s+([A-Za-z][A-Za-z\s]{1,40})\b/i);
      if (inM?.[1]) cityContext = inM[1].trim();
    }

    const ref = resolveGeoReferenceFromPhrase(roadPhrase, cityContext);
    if (!ref) continue;

    const key = `${ref.id}:${sideRaw}:${normalizeText(cityContext ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      referenceId: ref.id,
      side: sideRaw as GeoSide,
      cityContext: cityContext || undefined,
    });
  }

  return out;
}

export function resolveBuyerGeoConstraints(
  constraints: BuyerGeoConstraint[],
): ResolvedBuyerGeoConstraint[] {
  const out: ResolvedBuyerGeoConstraint[] = [];
  for (const c of constraints) {
    const reference = getGeoReference(c.referenceId);
    if (!reference) continue;
    out.push({ ...c, reference });
  }
  return out;
}

function coordinateOnAxis(
  listing: { latitude?: number | null; longitude?: number | null },
  ref: GeoReferenceDefinition,
): number | null {
  if (ref.axis === "longitude") {
    const lng = listing.longitude;
    return lng != null && Number.isFinite(lng) ? lng : null;
  }
  const lat = listing.latitude;
  return lat != null && Number.isFinite(lat) ? lat : null;
}

function sideMatchesCoordinate(
  side: GeoSide,
  value: number,
  ref: GeoReferenceDefinition,
): boolean {
  const eastGreater = ref.eastMeansGreater !== false;
  if (ref.axis === "longitude") {
    if (side === "east") return eastGreater ? value > ref.dividerValue : value < ref.dividerValue;
    if (side === "west") return eastGreater ? value < ref.dividerValue : value > ref.dividerValue;
    return false;
  }
  // latitude: north = greater lat, south = lesser
  if (side === "north") return value > ref.dividerValue;
  if (side === "south") return value < ref.dividerValue;
  return false;
}

/** Evaluate one constraint against a listing. unknown = missing coordinates (no hard exclude). */
export function evaluateGeoConstraintForListing(
  listing: {
    city?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
  constraint: ResolvedBuyerGeoConstraint,
): GeoConstraintEvaluation {
  if (!cityMatchesReference(listing.city, constraint.reference)) return "unknown";
  if (
    constraint.cityContext &&
    constraint.reference.cityKeys.length > 0 &&
    !cityContextMatchesReference(constraint.cityContext, constraint.reference)
  ) {
    return "unknown";
  }

  const coord = coordinateOnAxis(listing, constraint.reference);
  if (coord == null) return "unknown";

  return sideMatchesCoordinate(constraint.side, coord, constraint.reference) ? "pass" : "fail";
}

export function formatGeoConstraintLabel(constraint: BuyerGeoConstraint): string {
  const ref = getGeoReference(constraint.referenceId);
  const side = constraint.side.charAt(0).toUpperCase() + constraint.side.slice(1);
  const road = ref?.label ?? constraint.referenceId;
  const city = constraint.cityContext ? ` in ${constraint.cityContext}` : "";
  return `${side} of ${road}${city}`;
}

export type GeoMatchScoreResult = {
  points: number;
  max: number;
  reasons: string[];
  hardExclude: boolean;
};

const GEO_MATCH_MAX = 15;

/**
 * Score geo constraints for a listing.
 * - fail + has coords → hardExclude
 * - pass → boost points
 * - unknown → no exclude, no boost
 */
export function geoConstraintsMatchScore(
  listing: {
    city?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
  constraints: BuyerGeoConstraint[],
): GeoMatchScoreResult {
  if (!constraints.length) {
    return { points: 0, max: 0, reasons: [], hardExclude: false };
  }

  const resolved = resolveBuyerGeoConstraints(constraints);
  if (!resolved.length) {
    return { points: 0, max: 0, reasons: [], hardExclude: false };
  }

  let passed = 0;
  let evaluated = 0;
  const reasons: string[] = [];

  for (const c of resolved) {
    const result = evaluateGeoConstraintForListing(listing, c);
    if (result === "unknown") continue;
    evaluated += 1;
    if (result === "fail") {
      return { points: 0, max: GEO_MATCH_MAX, reasons: [], hardExclude: true };
    }
    passed += 1;
    reasons.push(formatGeoConstraintLabel(c));
  }

  if (evaluated === 0) {
    return { points: 0, max: GEO_MATCH_MAX, reasons: [], hardExclude: false };
  }

  const points = Math.round((passed / evaluated) * GEO_MATCH_MAX);
  return {
    points,
    max: GEO_MATCH_MAX,
    reasons: reasons.length ? [`${reasons[0]}`] : [],
    hardExclude: false,
  };
}
