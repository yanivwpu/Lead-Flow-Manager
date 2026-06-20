import { buildAgentPageUrl } from "./agentPageSlug";

export type AgentPageEmbedListingTypeParam = "for_sale" | "for_rent" | "all";

export type AgentPageInitialListingChip = "all" | "sale" | "rent" | "coming_soon";

/** Map embed URL params to internal browse listingType chips. */
export function normalizeEmbedListingTypeParam(
  raw: string | undefined | null,
): AgentPageInitialListingChip {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (value === "for_sale" || value === "sale") return "sale";
  if (value === "for_rent" || value === "rent") return "rent";
  if (value === "coming_soon") return "coming_soon";
  return "all";
}

export function parseAgentPageEmbedQuery(query: Record<string, unknown>): {
  embedMode: boolean;
  initialListingType: AgentPageInitialListingChip;
} {
  const embedRaw = query.embed;
  const embedMode =
    embedRaw === "1" ||
    embedRaw === 1 ||
    embedRaw === true ||
    embedRaw === "true";
  const initialListingType = embedMode
    ? normalizeEmbedListingTypeParam(String(query.listingType ?? ""))
    : "all";
  return { embedMode, initialListingType };
}

export function buildAgentPageEmbedIframeHtml(input: {
  slug: string;
  appOrigin: string;
  listingType: AgentPageEmbedListingTypeParam;
  title: string;
  heightPx?: number;
}): string {
  const height = input.heightPx ?? 950;
  const base = buildAgentPageUrl(input.slug, input.appOrigin);
  const params = new URLSearchParams({ embed: "1" });
  if (input.listingType === "for_sale") params.set("listingType", "for_sale");
  if (input.listingType === "for_rent") params.set("listingType", "for_rent");
  const src = `${base}?${params.toString()}`;
  return `<iframe
  src="${src}"
  style="width:100%; height:${height}px; border:0; border-radius:16px; background:#fff;"
  loading="lazy"
  title="${input.title.replace(/"/g, "&quot;")}">
</iframe>`;
}

export function listingTypeChipClass(
  chip: AgentPageInitialListingChip,
  active: AgentPageInitialListingChip,
): string {
  return chip === active ? "chip active" : "chip";
}
