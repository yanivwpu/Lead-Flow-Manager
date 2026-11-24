/**
 * An editable block representation of the existing neighborhood guide format.
 * Keep the persisted format as plain text for existing pages, drafts and public SEO.
 * Inline photos reference an ID from the page's tenant-validated photo collection,
 * not HTML or user supplied image URLs.
 */
export type NeighborhoodGuideBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "photo"; id: string };

const PHOTO_MARKER = /^\[\[photo:([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\]\]$/i;

export function parseNeighborhoodGuideBlocks(content: string): NeighborhoodGuideBlock[] {
  if (!content.trim()) return [];
  return content.trim().split(/\n\s*\n/).map((section): NeighborhoodGuideBlock => {
    const text = section.trim();
    const marker = PHOTO_MARKER.exec(text);
    if (marker) return { type: "photo", id: marker[1].toLowerCase() };
    if (text.startsWith("## ")) return { type: "heading", text: text.slice(3) };
    return { type: "paragraph", text };
  });
}

export function serializeNeighborhoodGuideBlocks(blocks: NeighborhoodGuideBlock[]): string {
  return blocks.map((block) => {
    if (block.type === "photo") return `[[photo:${block.id.toLowerCase()}]]`;
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
