import type { NeighborhoodContent } from "@shared/agent/neighborhoodPages";
import { validateAgentDefinedArea } from "@shared/agent/neighborhoodCustomArea";
import { normalizeBoundaryCountry } from "@shared/agent/neighborhoodBoundaryIdentity";

export const NEW_NEIGHBORHOOD = "new";
export const EMPTY_NEIGHBORHOOD: NeighborhoodContent = { name: "", city: "", state: "", country: "US", customBoundary: null, content: "", photos: [] };
const limits = { name: 80, city: 80, state: 60, content: 5000 };
function validPhotos(photos: unknown): boolean {
  return photos === undefined || (Array.isArray(photos) && photos.length <= 6 &&
    photos.every((photo) => photo && typeof photo.url === "string" && photo.url.length <= 600 &&
      typeof photo.alt === "string" && photo.alt.length <= 140));
}

export type NeighborhoodDraft = { values: NeighborhoodContent; baseVersion: string | null };
export type NeighborhoodDrafts = { active: string | null; entries: Record<string, NeighborhoodDraft> };

export function neighborhoodDraftKey(userId: string): string {
  return `rge:neighborhood-drafts:v1:${encodeURIComponent(userId)}`;
}

export function sameNeighborhoodContent(a: NeighborhoodContent, b: NeighborhoodContent): boolean {
  return a.name === b.name && a.city === b.city && a.state === b.state && a.content === b.content &&
    (a.country ?? "US") === (b.country ?? "US") &&
    JSON.stringify(a.customBoundary ?? null) === JSON.stringify(b.customBoundary ?? null) &&
    JSON.stringify(a.photos ?? []) === JSON.stringify(b.photos ?? []);
}

function validIdentity(id: unknown): id is string {
  return typeof id === "string" && (id === NEW_NEIGHBORHOOD || /^[0-9a-f-]{36}$/i.test(id));
}

export function readNeighborhoodDrafts(storage: Pick<Storage, "getItem">, key: string): NeighborhoodDrafts {
  const entries: NeighborhoodDrafts["entries"] = {};
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? "null");
    if (!parsed || typeof parsed !== "object") return { active: null, entries };
    for (const [id, raw] of Object.entries(parsed.entries ?? {})) {
      const draft = raw as NeighborhoodDraft | undefined;
      if (!validIdentity(id) || !draft?.values ||
        (id === NEW_NEIGHBORHOOD ? draft.baseVersion !== null : typeof draft.baseVersion !== "string")) continue;
      const { name, city, state, content, photos, country, customBoundary } = draft.values;
      const values: NeighborhoodContent = {
        name, city, state, content,
        ...(photos === undefined ? {} : { photos }),
        ...(country === undefined ? {} : { country }),
        ...(customBoundary === undefined ? {} : { customBoundary }),
      };
      if ((Object.keys(limits) as Array<keyof typeof limits>).every(
        (field) => typeof values[field] === "string" && values[field].length <= limits[field],
      ) && validPhotos(photos) &&
        (country === undefined || normalizeBoundaryCountry(country) === country) &&
        (customBoundary === undefined || customBoundary === null || Boolean(validateAgentDefinedArea(customBoundary)))
      ) entries[id] = { values, baseVersion: draft.baseVersion };
    }
    return { active: validIdentity(parsed.active) ? parsed.active : null, entries };
  } catch {
    return { active: null, entries };
  }
}

export function writeNeighborhoodDrafts(storage: Pick<Storage, "setItem" | "removeItem">, key: string, state: NeighborhoodDrafts): boolean {
  try {
    if (state.active || Object.keys(state.entries).length) storage.setItem(key, JSON.stringify(state));
    else storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
