import type { Position } from "@shared/agent/neighborhoodListingGeo";

export type NeighborhoodMapSession = {
  open: boolean;
  center: { lat: number; lon: number };
  zoom: number;
  vertices: Position[];
  boundaryKey: string;
};
const MAX_SESSION_BYTES = 20000;

/** Per-user, per-neighborhood, per-browser-tab ephemeral editor navigation. */
export function neighborhoodMapSessionKey(userId: string, pageId: string): string {
  return "rge:map-editor:v1:" + encodeURIComponent(userId) + ":" + encodeURIComponent(pageId);
}

function validPosition(point: unknown): point is Position {
  return Array.isArray(point) && point.length === 2 &&
    point.every((n) => typeof n === "number" && Number.isFinite(n)) &&
    Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 85;
}

/** Never trust browser storage values; corrupted navigation must not break the map. */
export function readNeighborhoodMapSession(storage: Pick<Storage, "getItem"> | undefined, key: string): NeighborhoodMapSession | null {
  try {
    const source = storage?.getItem(key);
    if (!source || source.length > MAX_SESSION_BYTES) return null;
    const data = JSON.parse(source) as Partial<NeighborhoodMapSession>;
    if (typeof data.open !== "boolean" || typeof data.boundaryKey !== "string" ||
      data.boundaryKey.length > 12000 || !data.center ||
      typeof data.center.lat !== "number" || typeof data.center.lon !== "number" ||
      !Number.isFinite(data.center.lat) || !Number.isFinite(data.center.lon) ||
      Math.abs(data.center.lat) > 85 || Math.abs(data.center.lon) > 180 ||
      !Number.isInteger(data.zoom) || data.zoom! < 2 || data.zoom! > 17 ||
      !Array.isArray(data.vertices) || data.vertices.length > 128 ||
      !data.vertices.every(validPosition)) return null;
    return data as NeighborhoodMapSession;
  } catch { return null; }
}

export function writeNeighborhoodMapSession(storage: Pick<Storage, "setItem"> | undefined, key: string, view: NeighborhoodMapSession): boolean {
  try {
    const json = JSON.stringify(view);
    if (json.length > MAX_SESSION_BYTES) return false;
    storage?.setItem(key, json);
    return Boolean(storage);
  } catch { return false; }
}

/** Discard removes only this neighborhood's temporary map view/corners. */
export function clearNeighborhoodMapSession(storage: Pick<Storage, "removeItem"> | undefined, key: string): void {
  try { storage?.removeItem(key); } catch { /* private-mode storage may be blocked */ }
}
