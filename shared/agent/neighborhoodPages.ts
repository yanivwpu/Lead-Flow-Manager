import { buildAgentPageUrl } from "./agentPageSlug";

export type NeighborhoodContent = {
  name: string;
  city: string;
  state: string;
  content: string;
};

export type NeighborhoodPageSettings = NeighborhoodContent & {
  id: string;
  slug: string;
  published: boolean;
  updatedAt: string;
  publicUrl: string | null;
};

export function neighborhoodTitle(page: Pick<NeighborhoodContent, "name" | "city" | "state">): string {
  return `${page.name}, ${page.city}, ${page.state}`;
}

export function buildNeighborhoodUrl(agentSlug: string, neighborhoodSlug: string, origin: string): string {
  return `${buildAgentPageUrl(agentSlug, origin)}/${neighborhoodSlug}`;
}

export function neighborhoodContentComplete(content: string): boolean {
  const paragraphs = new Set(content.trim().split(/\n\s*\n/)
    .map((part) => part.trim().replace(/\s+/g, " ").toLowerCase())
    .filter((part) => part.length >= 60));
  return paragraphs.size >= 2 && [...paragraphs].join(" ").length >= 240;
}
