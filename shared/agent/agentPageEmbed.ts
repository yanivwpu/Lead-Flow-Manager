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

function parseTruthyQueryFlag(raw: unknown): boolean {
  return raw === "1" || raw === 1 || raw === true || raw === "true";
}

export function parseAgentPageEmbedQuery(query: Record<string, unknown>): {
  embedMode: boolean;
  initialListingType: AgentPageInitialListingChip;
  hideChat: boolean;
} {
  const embedMode = parseTruthyQueryFlag(query.embed);
  const initialListingType = embedMode
    ? normalizeEmbedListingTypeParam(String(query.listingType ?? ""))
    : "all";
  const hideChat = embedMode && parseTruthyQueryFlag(query.hideChat);
  return { embedMode, initialListingType, hideChat };
}

export function buildAgentPageEmbedUrl(input: {
  slug: string;
  appOrigin: string;
  listingType?: AgentPageEmbedListingTypeParam;
  /** Default true — parent site owns the chat CTA when embedding listings. */
  hideChat?: boolean;
}): string {
  const base = buildAgentPageUrl(input.slug, input.appOrigin);
  const params = new URLSearchParams({ embed: "1" });
  const listingType = input.listingType ?? "all";
  if (listingType === "for_sale") params.set("listingType", "for_sale");
  if (listingType === "for_rent") params.set("listingType", "for_rent");
  if (input.hideChat !== false) params.set("hideChat", "1");
  return `${base}?${params.toString()}`;
}

export function buildAgentPageEmbedIframeHtml(input: {
  slug: string;
  appOrigin: string;
  listingType: AgentPageEmbedListingTypeParam;
  title: string;
  heightPx?: number;
  hideChat?: boolean;
}): string {
  const height = input.heightPx ?? 950;
  const src = buildAgentPageEmbedUrl({
    slug: input.slug,
    appOrigin: input.appOrigin,
    listingType: input.listingType,
    hideChat: input.hideChat,
  });
  return `<iframe
  src="${src}"
  style="width:100%; height:${height}px; border:0; border-radius:16px; background:#f6f1ea;"
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
