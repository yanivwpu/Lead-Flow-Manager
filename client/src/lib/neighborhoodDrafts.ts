import type { NeighborhoodContent } from "@shared/agent/neighborhoodPages";
import { readCustomNeighborhoodBoundary } from "@shared/agent/neighborhoodCustomBoundary";

export const NEW_NEIGHBORHOOD = "new";
export const EMPTY_NEIGHBORHOOD: NeighborhoodContent = { name: "", city: "", state: "", country: "US", customBoundary: null, content: "", photos: [] };
const limits = { name: 80, city: 80, state: 60, country: 2, content: 5000 };
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
  return (a.publicLanguage ?? "en") === (b.publicLanguage ?? "en") && a.name === b.name && a.city === b.city && a.state === b.state && (a.country ?? "US") === (b.country ?? "US") && a.content === b.content &&
    JSON.stringify(a.photos ?? []) === JSON.stringify(b.photos ?? []) &&
    JSON.stringify(a.customBoundary ?? null) === JSON.stringify(b.customBoundary ?? null);
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
      const { name, city, state, country, publicLanguage, customBoundary, content, photos } = draft.values;
      if (customBoundary != null && !readCustomNeighborhoodBoundary(customBoundary)) continue;
      const values = { name, city, state, country: country ?? "US",
        ...(["en", "he", "es"].includes(publicLanguage ?? "") ? { publicLanguage } : {}),
        ...(customBoundary === undefined ? {} : { customBoundary }), content,
        ...(photos === undefined ? {} : { photos }) };
      if ((Object.keys(limits) as Array<keyof typeof limits>).every(
        (field) => typeof values[field] === "string" && values[field].length <= limits[field],
      ) && validPhotos(photos)) entries[id] = { values, baseVersion: draft.baseVersion };
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

/**
 * An unrelated browser tab can write an older snapshot to localStorage.
 * Keep this tab's actively edited draft until its owner saves/discards it.
 * Other neighborhood drafts still synchronize normally.
 */
export function mergeNeighborhoodDraftsPreservingActive(
  incoming: NeighborhoodDrafts, local: NeighborhoodDrafts,
): NeighborhoodDrafts {
  const active = local.active;
  const localDraft = active ? local.entries[active] : undefined;
  return {
    active,
    entries: localDraft && active
      ? { ...incoming.entries, [active]: localDraft }
      : { ...incoming.entries },
  };
}
