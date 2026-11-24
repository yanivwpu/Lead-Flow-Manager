/**
 * An editable block representation of the existing neighborhood guide format.
 * Keep the persisted format as plain text for existing pages, drafts and public SEO.
 * Inline photos reference an ID from the page's tenant-validated photo collection,
 * not HTML or user supplied image URLs.
 */
export type NeighborhoodGuideBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "photo"; id: string; width?: number };

const PHOTO_MARKER = /^\[\[photo:([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})(?:\|(\d{2,3}))?\]\]$/i;
export const NEIGHBORHOOD_PHOTO_MIN_WIDTH = 40;
export const NEIGHBORHOOD_PHOTO_MAX_WIDTH = 100;

export function normalizeNeighborhoodPhotoWidth(width: number | undefined): number {
  return typeof width === "number" && Number.isInteger(width) &&
    width >= NEIGHBORHOOD_PHOTO_MIN_WIDTH && width <= NEIGHBORHOOD_PHOTO_MAX_WIDTH &&
    width % 5 === 0 ? width : NEIGHBORHOOD_PHOTO_MAX_WIDTH;
}

/** Legacy photo tokens (no size) continue to mean full width. */
export function parseNeighborhoodPhotoMarker(value: string): { id: string; width: number } | null {
  const match = PHOTO_MARKER.exec(value.trim());
  if (!match) return null;
  const width = match[2] === undefined ? 100 : Number(match[2]);
  if (normalizeNeighborhoodPhotoWidth(width) !== width) return null;
  return { id: match[1].toLowerCase(), width };
}

export function neighborhoodPhotoToken(id: string, width = 100): string {
  const normalized = normalizeNeighborhoodPhotoWidth(width);
  return `[[photo:${id.toLowerCase()}${normalized === 100 ? "" : "|" + normalized}]]`;
}

export function parseNeighborhoodGuideBlocks(content: string): NeighborhoodGuideBlock[] {
  if (!content.trim()) return [];
  return content.trim().split(/\n\s*\n/).map((section): NeighborhoodGuideBlock => {
    const text = section.trim();
    const marker = parseNeighborhoodPhotoMarker(text);
    if (marker) return { type: "photo", id: marker.id, width: marker.width };
    if (text.startsWith("## ")) return { type: "heading", text: text.slice(3) };
    return { type: "paragraph", text };
  });
}

export function serializeNeighborhoodGuideBlocks(blocks: NeighborhoodGuideBlock[]): string {
  return blocks.map((block) => {
    if (block.type === "photo") return neighborhoodPhotoToken(block.id, block.width);
    if (block.type === "heading") return `## ${block.text}`;
    return block.text;
  }).join("\n\n");
}

export function neighborhoodGuidePhotoId(photoUrl: string): string | null {
  try {
    const pathname = new URL(photoUrl).pathname;
    const match = pathname.match(/\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\.(?:jpg|png|webp)$/i);
    return match?.[1].toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/** Remove every sized/unsized reference when its source photo is deleted. */
export function removeNeighborhoodPhotoFromArticle(content: string, photoUrl: string): string {
  const id = neighborhoodGuidePhotoId(photoUrl);
  if (!id) return content;
  return content.split(/\n\s*\n/).filter((section) => parseNeighborhoodPhotoMarker(section)?.id !== id).join("\n\n");
}
