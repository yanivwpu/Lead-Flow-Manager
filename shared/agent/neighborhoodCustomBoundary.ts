import { boundaryBounds, readBoundaryGeometry, type PolygonBoundary, type Position } from "./neighborhoodListingGeo";

/** Agent-drawn geographic service area; never an official neighborhood polygon. */
export const CUSTOM_NEIGHBORHOOD_MAX_VERTICES = 128;
export const CUSTOM_NEIGHBORHOOD_MAX_SPAN_DEGREES = 0.25;

function orient(a: Position, b: Position, c: Position): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: Position, b: Position, p: Position): boolean {
  return p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
}

function intersect(a: Position, b: Position, c: Position, d: Position): boolean {
  const o1 = orient(a, b, c), o2 = orient(a, b, d);
  const o3 = orient(c, d, a), o4 = orient(c, d, b);
  return (o1 * o2 < 0 && o3 * o4 < 0) ||
    (o1 === 0 && onSegment(a, b, c)) ||
    (o2 === 0 && onSegment(a, b, d)) ||
    (o3 === 0 && onSegment(c, d, a)) ||
    (o4 === 0 && onSegment(c, d, b));
}

/**
 * Fail closed on invalid GeoJSON, self-intersections, giant polygons,
 * holes, multi-polygons and antimeridian-spanning areas.
 * The source of the shape is always attributed as agent-defined.
 */
export function readCustomNeighborhoodBoundary(raw: unknown): PolygonBoundary | null {
  const geometry = readBoundaryGeometry(raw);
  if (!geometry || geometry.type !== "Polygon" || geometry.coordinates.length !== 1) return null;
  const ring = geometry.coordinates[0];
  if (ring.length < 4 || ring.length > CUSTOM_NEIGHBORHOOD_MAX_VERTICES + 1) return null;
  const bounds = boundaryBounds(geometry);
  if (bounds.minLat < -85 || bounds.maxLat > 85 ||
      bounds.maxLat - bounds.minLat < 0.00002 ||
      bounds.maxLon - bounds.minLon < 0.00002 ||
      bounds.maxLat - bounds.minLat > CUSTOM_NEIGHBORHOOD_MAX_SPAN_DEGREES ||
      bounds.maxLon - bounds.minLon > CUSTOM_NEIGHBORHOOD_MAX_SPAN_DEGREES) return null;
  // Adjacent segments share endpoints; all other segment intersections invalidate.
  const edges = ring.length - 1;
  for (let i = 0; i < edges; i++) {
    const a = ring[i], b = ring[i + 1];
    if (a[0] === b[0] && a[1] === b[1]) return null;
    for (let j = i + 2; j < edges; j++) {
      if (i === 0 && j === edges - 1) continue;
      if (intersect(a, b, ring[j], ring[j + 1])) return null;
    }
  }
  return geometry;
}
