export type ListingComposerListing = {
  listingId: string;
  priceCents: number | null;
  beds: number | null;
  baths: number | null;
  city: string | null;
  state: string | null;
  propertyType: string | null;
  listingUrl: string | null;
  description?: string | null;
};

export function formatListingPriceForComposer(cents: number | null): string | null {
  if (cents == null) return null;
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

export function formatBedsBathsForComposer(beds: number | null, baths: number | null): string | null {
  const parts: string[] = [];
  if (beds != null) {
    parts.push(`${beds % 1 === 0 ? beds : beds.toFixed(1)} bed`);
  }
  if (baths != null) {
    parts.push(`${baths % 1 === 0 ? baths : baths.toFixed(1)} bath`);
  }
  return parts.length > 0 ? parts.join(" / ") : null;
}

function formatPropertyTypeLabel(type: string | null): string {
  if (!type) return "property";
  return type.replace(/_/g, " ").toLowerCase();
}

function truncateText(text: string | null | undefined, maxLen: number): string | null {
  const t = (text || "").trim().replace(/\s+/g, " ");
  if (!t) return null;
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).trim()}…`;
}

const TRAILING_CTA_PATTERN =
  /\s+(Would you like[^?]+\?|Let me know[^?]+\?|Want me to[^?]+\?|I can send[^?]+\?)\s*$/i;

function normalizeIntroAndClosing(introDraft: string): { intro: string; closing: string | null } {
  let text = introDraft.trim().replace(/https?:\/\/\S+/g, "").trim();
  let closing: string | null = null;
  const ctaMatch = text.match(TRAILING_CTA_PATTERN);
  if (ctaMatch) {
    closing = ctaMatch[1].trim();
    text = text.slice(0, ctaMatch.index).trim();
  }
  if (text.endsWith(".")) {
    text = `${text.slice(0, -1)}:`;
  } else if (!text.endsWith(":")) {
    text = `${text}:`;
  }
  return { intro: text, closing };
}

function pickFeatureLine(featureHints: string[], description?: string | null): string | null {
  const hint = featureHints.map((h) => h.trim()).find(Boolean);
  if (hint) return hint;
  return truncateText(description, 120);
}

export type BuildListingComposerMessageInput = {
  listing: ListingComposerListing;
  contactFirstName?: string;
  /** Short AI/template intro without listing details */
  introDraft?: string;
  featureHints?: string[];
};

export function buildListingComposerMessage(input: BuildListingComposerMessageInput): string {
  const { listing, introDraft, featureHints = [] } = input;
  const firstName = (input.contactFirstName || "there").trim() || "there";

  let intro: string;
  let closing: string | null = null;

  if (introDraft?.trim()) {
    const normalized = normalizeIntroAndClosing(introDraft);
    intro = normalized.intro;
    closing = normalized.closing;
  } else {
    const typeLabel = formatPropertyTypeLabel(listing.propertyType);
    const area = listing.city || "your preferred area";
    intro = `Hi ${firstName}, I found a ${typeLabel} in ${area} that matches what you're looking for:`;
  }

  const detailLines: string[] = [];
  const price = formatListingPriceForComposer(listing.priceCents);
  if (price) detailLines.push(price);

  const bedsBaths = formatBedsBathsForComposer(listing.beds, listing.baths);
  if (bedsBaths) detailLines.push(bedsBaths);

  const location = [listing.city, listing.state].filter(Boolean).join(", ");
  if (location) detailLines.push(location);

  const feature = pickFeatureLine(featureHints, listing.description);
  if (feature) detailLines.push(feature);

  const parts: string[] = [intro, "", ...detailLines];

  const url = listing.listingUrl?.trim();
  const hasValidUrl = !!url && /^https?:\/\//i.test(url);
  if (hasValidUrl) {
    parts.push("", `View listing: ${url}`);
  }

  parts.push("", closing ?? "Would you like me to send more details or schedule a showing?");

  return parts.join("\n");
}

/** Test/trace helper — verifies composer text includes core listing facts. */
export function listingComposerDraftIncludesRequiredDetails(
  message: string,
  listing: Pick<
    ListingComposerListing,
    "priceCents" | "beds" | "baths" | "city" | "listingUrl"
  >,
): boolean {
  const price = formatListingPriceForComposer(listing.priceCents);
  const bedsBaths = formatBedsBathsForComposer(listing.beds, listing.baths);
  const hasPrice = !price || message.includes(price);
  const hasBeds =
    listing.beds == null || message.includes(String(listing.beds % 1 === 0 ? listing.beds : listing.beds));
  const hasBaths =
    listing.baths == null ||
    message.includes(String(listing.baths % 1 === 0 ? listing.baths : listing.baths));
  const hasBedsBaths = !bedsBaths || (hasBeds && hasBaths);
  const hasLocation =
    !listing.city || message.toLowerCase().includes(listing.city.toLowerCase());
  const url = listing.listingUrl?.trim();
  const hasUrl = !url || !/^https?:\/\//i.test(url) || message.includes(url);
  return hasPrice && hasBedsBaths && hasLocation && hasUrl;
}
