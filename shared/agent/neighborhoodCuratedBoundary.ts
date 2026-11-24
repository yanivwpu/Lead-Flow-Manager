import {
  boundaryBounds, readBoundaryGeometry,
  type BoundaryBounds, type NeighborhoodBoundary,
} from "./neighborhoodListingGeo";
import { exactNeighborhoodIdentityMatch, normalizeBoundaryCountry, type NeighborhoodBoundaryIdentity } from "./neighborhoodBoundaryIdentity";

export const OVERTURE_NEIGHBORHOOD_ATTRIBUTION = "© OpenStreetMap contributors, Overture Maps Foundation";
export const OVERTURE_NEIGHBORHOOD_LICENSE = "ODbL-1.0";

export type CuratedNeighborhoodBoundaryRecord = NeighborhoodBoundaryIdentity & {
  id: string;
  sourceId: string;
  sourceVersion: string;
  subtype: "neighborhood" | "microhood";
  sourceKind: "overture";
  license: string;
  attribution: string;
  geometry: NeighborhoodBoundary;
  reviewed: boolean;
  retrievedAt: Date | string;
};

export type CuratedBoundarySelection =
  | { status: "community_area"; geometry: NeighborhoodBoundary; bounds: BoundaryBounds;
      source: string; attribution: string; sourceId: string }
  | { status: "unmatched" | "ambiguous" | "invalid" | "stale" };

export function selectCuratedNeighborhoodBoundary(
  records: readonly CuratedNeighborhoodBoundaryRecord[],
  input: NeighborhoodBoundaryIdentity,
  now = new Date(),
): CuratedBoundarySelection {
  if (!normalizeBoundaryCountry(input.country)) return { status: "invalid" };
  const matching = records.filter((record) =>
    record.reviewed &&
    record.sourceKind === "overture" &&
    (record.subtype === "neighborhood" || record.subtype === "microhood") &&
    exactNeighborhoodIdentityMatch(input, record));
  if (!matching.length) return { status: "unmatched" };
  // Even if the same source ID is duplicated in the catalog, do not pick first.
  if (matching.length !== 1) return { status: "ambiguous" };
  const candidate = matching[0];
  const retrievedAt = new Date(candidate.retrievedAt);
  const age = now.getTime() - retrievedAt.getTime();
  if (!Number.isFinite(age) || age < -86400000 || age > 180 * 86400000) return { status: "stale" };
  if (candidate.license !== OVERTURE_NEIGHBORHOOD_LICENSE ||
      candidate.attribution !== OVERTURE_NEIGHBORHOOD_ATTRIBUTION ||
      !/^20\d\d-\d\d-\d\d\.\d+$/.test(candidate.sourceVersion) ||
      !/^[a-zA-Z0-9:-]{5,128}$/.test(candidate.sourceId)) return { status: "invalid" };
  const geometry = readBoundaryGeometry(candidate.geometry);
  if (!geometry) return { status: "invalid" };
  const bounds = boundaryBounds(geometry);
  if (bounds.maxLat <= bounds.minLat || bounds.maxLon <= bounds.minLon ||
      bounds.maxLon - bounds.minLon > 1 || bounds.maxLat - bounds.minLat > 1) {
    return { status: "invalid" };
  }
  return {
    status: "community_area", source: "Overture Maps community boundary",
    geometry, bounds, attribution: candidate.attribution, sourceId: candidate.sourceId,
  };
}
