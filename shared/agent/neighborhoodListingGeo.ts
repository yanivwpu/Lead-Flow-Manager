/**
 * Strict neighborhood geography matching. No city, ZIP, name substring or
 * rectangular proximity is sufficient to claim a listing is in a neighborhood.
 * Coordinates are GeoJSON [longitude, latitude].
 */
export type Position = [number, number];
export type PolygonBoundary = { type: "Polygon"; coordinates: Position[][] };
export type MultiPolygonBoundary = { type: "MultiPolygon"; coordinates: Position[][][] };
export type NeighborhoodBoundary = PolygonBoundary | MultiPolygonBoundary;
export type BoundaryBounds = { minLat: number; maxLat: number; minLon: number; maxLon: number };

export function normalizeNeighborhoodName(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(?:civic association|homeowners association|home owners association|residents association|neighborhood association|neighborhood improvement district|community association|homeowners|association|hoa|inc)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}

export function supportsFortLauderdaleBoundary(city: string, state: string): boolean {
  const cityKey = city.toLowerCase().replace(/[.\s-]+/g, "");
  const stateKey = state.toLowerCase().trim();
  return (cityKey === "fortlauderdale" || cityKey === "ftlauderdale") &&
    (stateKey === "fl" || stateKey === "florida");
}

export function readBoundaryGeometry(raw: unknown): NeighborhoodBoundary | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { type?: unknown; coordinates?: unknown };
  if (obj.type !== "Polygon" && obj.type !== "MultiPolygon") return null;
  if (!Array.isArray(obj.coordinates)) return null;
  let vertices = 0;
  const validPosition = (value: unknown): value is Position => {
    if (!Array.isArray(value) || value.length < 2 ||
        typeof value[0] !== "number" || typeof value[1] !== "number") return false;
    const [lon, lat] = value;
    return Number.isFinite(lon) && Number.isFinite(lat) &&
      lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90 && ++vertices <= 25000;
  };
  const validRing = (ring: unknown): boolean => Array.isArray(ring) && ring.length >= 4 &&
    ring.every(validPosition) &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];
  const validPolygon = (polygon: unknown): boolean =>
    Array.isArray(polygon) && polygon.length > 0 && polygon.length <= 50 && polygon.every(validRing);
  const valid = obj.type === "Polygon"
    ? validPolygon(obj.coordinates)
    : obj.coordinates.length > 0 && obj.coordinates.length <= 40 &&
      obj.coordinates.every(validPolygon);
  return valid ? obj as NeighborhoodBoundary : null;
}

export function boundaryBounds(geometry: NeighborhoodBoundary): BoundaryBounds {
  const positions: Position[] = geometry.type === "Polygon"
    ? geometry.coordinates.flat()
    : geometry.coordinates.flat(2);
  return positions.reduce((b, [lon, lat]) => ({
    minLat: Math.min(b.minLat, lat), maxLat: Math.max(b.maxLat, lat),
    minLon: Math.min(b.minLon, lon), maxLon: Math.max(b.maxLon, lon),
  }), { minLat: 90, maxLat: -90, minLon: 180, maxLon: -180 });
}

function insideRing(lon: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    // Boundary point counts as inside (except when on a hole boundary).
    const cross = (lon - xi) * (yj - yi) - (lat - yi) * (xj - xi);
    if (Math.abs(cross) < 1e-10 && lon >= Math.min(xi, xj) - 1e-10 &&
        lon <= Math.max(xi, xj) + 1e-10 && lat >= Math.min(yi, yj) - 1e-10 &&
        lat <= Math.max(yi, yj) + 1e-10) return true;
    const crosses = (yi > lat) !== (yj > lat) &&
      lon < (xj - xi) * (lat - yi) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function coordinateWithinNeighborhood(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  geometry: NeighborhoodBoundary,
): boolean {
  if (latitude == null || longitude == null ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(([outer, ...holes]) => !!outer &&
    insideRing(longitude, latitude, outer) &&
    !holes.some((hole) => insideRing(longitude, latitude, hole)));
}

export function selectExactOfficialNeighborhood(
  features: unknown, requestedName: string,
): NeighborhoodBoundary | null {
  if (!Array.isArray(features)) return null;
  const normalized = normalizeNeighborhoodName(requestedName);
  if (!normalized || normalized.length < 3) return null;
  const matching = features.filter((feature) => {
    if (!feature || typeof feature !== "object") return false;
    const properties = (feature as { properties?: Record<string, unknown> }).properties;
    if (!properties) return false;
    return [properties.OFFICIALNAME, properties.UNOFFICIALNAME].some((name) =>
      typeof name === "string" && normalizeNeighborhoodName(name) === normalized);
  });
  // Ambiguity must fail closed, never select the first guess.
  if (matching.length !== 1) return null;
  return readBoundaryGeometry((matching[0] as { geometry?: unknown }).geometry);
}
