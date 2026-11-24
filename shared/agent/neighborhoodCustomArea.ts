import { boundaryBounds, readBoundaryGeometry, type PolygonBoundary, type Position } from "./neighborhoodListingGeo";

/** Tiny, local agent-defined service area, never an administrative boundary. */
export const CUSTOM_AREA_MAX_VERTICES = 120;
export const CUSTOM_AREA_MAX_LAT_SPAN = 0.5;
export const CUSTOM_AREA_MAX_LON_SPAN = 0.5;

function cross(a: Position, b: Position, c: Position): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function intersect(a: Position, b: Position, c: Position, d: Position): boolean {
  const ab1 = cross(a, b, c), ab2 = cross(a, b, d);
  const cd1 = cross(c, d, a), cd2 = cross(c, d, b);
  return ((ab1 > 0 && ab2 < 0) || (ab1 < 0 && ab2 > 0)) &&
    ((cd1 > 0 && cd2 < 0) || (cd1 < 0 && cd2 > 0));
}
function nearlySame(a: Position, b: Position): boolean {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

/**
 * Tighten general GeoJSON checks for agent-authored shapes:
 * single closed ring, no holes, no bow-ties, bounded area and number of points.
 * Uses longitude/latitude pairs, not city proximity or ZIP-derived rectangles.
 */
export function validateAgentDefinedArea(raw: unknown): PolygonBoundary | null {
  const boundary = readBoundaryGeometry(raw);
  if (!boundary || boundary.type !== "Polygon" || boundary.coordinates.length !== 1) return null;
  const ring = boundary.coordinates[0];
  if (ring.length < 4 || ring.length > CUSTOM_AREA_MAX_VERTICES + 1) return null;
  if (!nearlySame(ring[0], ring[ring.length - 1])) return null;
  for (let i = 0; i < ring.length - 1; i++) {
    if (nearlySame(ring[i], ring[i + 1])) return null;
    for (let j = 0; j < i; j++) {
      if (nearlySame(ring[i], ring[j])) return null;
    }
  }
  const bounds = boundaryBounds(boundary);
  if (bounds.maxLat - bounds.minLat > CUSTOM_AREA_MAX_LAT_SPAN ||
      bounds.maxLon - bounds.minLon > CUSTOM_AREA_MAX_LON_SPAN ||
      bounds.maxLat - bounds.minLat < 0.00001 ||
      bounds.maxLon - bounds.minLon < 0.00001) return null;
  let twiceArea = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    twiceArea += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    // Every non-adjacent pair of segments must be disjoint.
    for (let j = i + 2; j < ring.length - 1; j++) {
      if (i === 0 && j === ring.length - 2) continue;
      if (intersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) return null;
    }
  }
  if (Math.abs(twiceArea) < 1e-8) return null;
  return boundary;
}
