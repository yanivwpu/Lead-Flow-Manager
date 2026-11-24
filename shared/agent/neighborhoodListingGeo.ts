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
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ")
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
  // Closed rings with repeated coordinates but no interior area are not boundaries.
  // Reject self-contained zero-area rings before they reach point-in-polygon.
  const validRing = (ring: unknown): boolean => {
    if (!Array.isArray(ring) || ring.length < 4 || !ring.every(validPosition) ||
        ring[0][0] !== ring[ring.length - 1][0] ||
        ring[0][1] !== ring[ring.length - 1][1]) return false;
    let twiceArea = 0;
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1] as Position;
      const b = ring[i] as Position;
      twiceArea += a[0] * b[1] - b[0] * a[1];
    }
    return Number.isFinite(twiceArea) && Math.abs(twiceArea) > 1e-12;
  };
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


/**
 * Match a named boundary only when exactly one geometry matches. The provider
 * controls which feature fields are genuine names, never substring/ZIP matches.
 * Optional city fields must match the requested city on the same feature.
 */
export function selectExactNamedNeighborhood(
  features: unknown, requestedName: string,
  nameFields: readonly string[],
  expectedCity?: { name: string; fields: readonly string[] },
): NeighborhoodBoundary | null {
  if (!Array.isArray(features)) return null;
  const normalized = normalizeNeighborhoodName(requestedName);
  if (!normalized || normalized.length < 3 || !nameFields.length) return null;
  const matches = features.filter((feature) => {
    if (!feature || typeof feature !== "object") return false;
    const properties = (feature as { properties?: Record<string, unknown> }).properties;
    if (!properties) return false;
    if (expectedCity) {
      const city = expectedCity.fields.some((field) =>
        typeof properties[field] === "string" &&
        normalizeNeighborhoodName(properties[field] as string) === normalizeNeighborhoodName(expectedCity.name));
      if (!city) return false;
    }
    return nameFields.some((field) =>
      typeof properties[field] === "string" &&
      normalizeNeighborhoodName(properties[field] as string) === normalized);
  });
  // Do not silently choose one geometry if the provider has duplicates.
  if (matches.length !== 1) return null;
  return readBoundaryGeometry((matches[0] as { geometry?: unknown }).geometry);
}

export function selectExactOfficialNeighborhood(
  features: unknown, requestedName: string,
): NeighborhoodBoundary | null {
  return selectExactNamedNeighborhood(features, requestedName, ["OFFICIALNAME", "UNOFFICIALNAME"]);
}
