import {
  formatBedsBathsForComposer,
  formatListingPriceForComposer,
} from "./inventoryComposerDraft";
import {
  inventoryListingDetailsSchema,
  type InventoryListingDetails,
} from "./inventoryListingSchema";
import {
  buildPublicListingAttributionLines,
  canRenderPublicListingAttribution,
  normalizeListingCompliance,
  type InventoryListingCompliance,
} from "./inventoryListingCompliance";
import { canShowPublicStreetAddress } from "./publicListingPublication";
import { pickPrimaryPhotoUrl } from "./listingViewUrl";
import { resolveListingStreetForSlug } from "./listingPublicSlug";

export type PublicListingFlyerAgent = {
  name: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  brokerageName: string | null;
  bookingLink: string | null;
};

export type PublicListingFlyerListing = {
  id: string;
  priceCents: number | null;
  beds: number | null;
  baths: number | null;
  squareFeet: number | null;
  yearBuilt: number | null;
  hoaFeeCents: number | null;
  propertyType: string | null;
  propertySubtype: string | null;
  description: string | null;
  features: string[];
  photos: { url: string; order?: number }[];
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  providerListingId: string;
  listingDetails: InventoryListingDetails;
  listingCompliance?: InventoryListingCompliance;
};

export type PublicListingFlyerInput = {
  listing: PublicListingFlyerListing;
  agent: PublicListingFlyerAgent;
  shareUrl: string;
  qrDataUrl: string;
  /** Company/agency logo from Business Profile; W logo fallback when absent. */
  companyLogoUrl?: string | null;
  /** When false, street address and map are withheld per MLS display rules. */
  allowStreetAddress?: boolean;
  /** When false, page should not be indexed (address display restricted). */
  allowSearchIndexing?: boolean;
};

const WHACHATCRM_HOME_URL = "https://whachatcrm.com";
/** Matches --color-brand-green in client/src/index.css */
const WHACHAT_GREEN = "#059669";
const WHACHAT_W_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect width="24" height="24" rx="5" fill="${WHACHAT_GREEN}"/><text x="12" y="16.5" text-anchor="middle" font-family="Segoe UI,system-ui,sans-serif" font-size="13" font-weight="700" fill="#fff">W</text></svg>`;
const SHARE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
const PRINT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`;
const CHEVRON_LEFT = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>`;
const CHEVRON_RIGHT = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;

const RENTAL_HINT_PATTERN =
  /\b(rent|rental|lease|leased|leasing|for\s+rent|rent\s+only|residential\s+lease|commercial\s+lease)\b/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSquareFeet(sqft: number | null): string | null {
  if (sqft == null || sqft <= 0) return null;
  return `${sqft.toLocaleString("en-US")} Sq Ft`;
}

function formatHoaFee(cents: number | null): string | null {
  if (cents == null || !Number.isFinite(cents) || cents < 0) return null;
  return `HOA $${Math.round(cents / 100).toLocaleString("en-US")}/mo`;
}

function listingHaystack(listing: PublicListingFlyerListing): string {
  return [
    listing.propertyType,
    listing.propertySubtype,
    listing.description,
    ...listing.features,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/_/g, " ");
}

/** FOR RENT when property type/subtype/features indicate a rental listing. */
export function resolveFlyerListingLabel(listing: PublicListingFlyerListing): "FOR SALE" | "FOR RENT" {
  const haystack = listingHaystack(listing).toLowerCase();
  if (RENTAL_HINT_PATTERN.test(haystack)) return "FOR RENT";
  return "FOR SALE";
}

function parseSquareFeetFromText(text: string): number | null {
  const patterns = [
    /(\d{1,3}(?:,\d{3})+|\d+)\s*(?:sq\.?\s*ft|sqft|square\s*feet)/i,
    /(\d{1,3}(?:,\d{3})+|\d+)\s*sf\b/i,
    /living\s*area[:\s]*(\d{1,3}(?:,\d{3})+|\d+)/i,
    /(?:adjusted|total|interior)\s*(?:area|sq\.?\s*ft)[:\s]*(\d{1,3}(?:,\d{3})+|\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const n = parseInt(match[1].replace(/,/g, ""), 10);
    if (Number.isFinite(n) && n > 0 && n < 100_000) return n;
  }
  return null;
}

function parseHoaCentsFromText(text: string): number | null {
  const patterns = [
    /hoa[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /association\s*fee[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /\$([\d,]+(?:\.\d{2})?)\s*(?:\/\s*mo(?:nth)?)?\s*hoa/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const dollars = parseFloat(match[1].replace(/,/g, ""));
    if (Number.isFinite(dollars) && dollars >= 0) return Math.round(dollars * 100);
  }
  return null;
}

/** Sq ft from DB (migration 0038) or parsed from MLS features/description when missing. */
export function resolveDisplaySquareFeet(listing: PublicListingFlyerListing): string | null {
  const fromDb = formatSquareFeet(listing.squareFeet);
  if (fromDb) return fromDb;
  const parsed = parseSquareFeetFromText(listingHaystack(listing));
  return parsed ? formatSquareFeet(parsed) : null;
}

/** HOA from DB or parsed from MLS text when missing. */
export function resolveDisplayHoaFee(listing: PublicListingFlyerListing): string | null {
  const fromDb = formatHoaFee(listing.hoaFeeCents);
  if (fromDb) return fromDb;
  const parsed = parseHoaCentsFromText(listingHaystack(listing));
  return parsed != null ? formatHoaFee(parsed) : null;
}

function formatYearBuilt(year: number | null): string | null {
  if (year == null || !Number.isFinite(year) || year < 1600) return null;
  return String(Math.round(year));
}

export type FlyerSpecFields = {
  sqft: string | null;
  hoa: string | null;
  yearBuilt: string | null;
};

/** DB-first specs for flyer: Sq Ft / HOA / Built when columns exist; MLS text fallback for sqft/hoa only. */
export function resolveFlyerSpecFields(listing: PublicListingFlyerListing): FlyerSpecFields {
  const sqftFromDb = formatSquareFeet(listing.squareFeet);
  const hoaFromDb = formatHoaFee(listing.hoaFeeCents);
  const yearFromDb = formatYearBuilt(listing.yearBuilt);

  return {
    sqft: sqftFromDb ?? resolveDisplaySquareFeet(listing),
    hoa: hoaFromDb ?? resolveDisplayHoaFee(listing),
    yearBuilt: yearFromDb,
  };
}

function parsePhotos(
  raw: { url: string; order?: number; caption?: string }[],
): { url: string; order: number; caption?: string }[] {
  return raw
    .filter((p) => typeof p.url === "string" && /^https?:\/\//i.test(p.url))
    .map((p, idx) => ({
      url: p.url.trim(),
      order: p.order ?? idx,
      caption: typeof p.caption === "string" ? p.caption.trim() : undefined,
    }))
    .sort((a, b) => a.order - b.order);
}

/** Heuristic only — MLS feeds sometimes expose both watermarked and clean variants. */
const MLS_WATERMARK_URL_PATTERN = /watermark|mlswatermark|\/wm[/_-]|[_-]wm[./-]/i;

function isLikelyWatermarkedPhoto(photo: { url: string; caption?: string }): boolean {
  if (photo.caption && /watermark/i.test(photo.caption)) return true;
  return MLS_WATERMARK_URL_PATTERN.test(photo.url);
}

/** Prefer a clean hero when the primary MLS photo is watermarked but a clean variant exists. */
export function pickFlyerHeroPhotos(
  photos: { url: string; order: number; caption?: string }[],
): { url: string; order: number; caption?: string }[] {
  if (photos.length <= 1) return photos;
  const sorted = [...photos].sort((a, b) => a.order - b.order);
  if (!isLikelyWatermarkedPhoto(sorted[0])) return sorted;
  const clean = sorted.find((p) => !isLikelyWatermarkedPhoto(p));
  if (!clean) return sorted;
  return [clean, ...sorted.filter((p) => p.url !== clean.url)];
}

function buildFullAddress(listing: PublicListingFlyerListing): string {
  const street = [listing.addressLine1, listing.addressLine2].filter(Boolean).join(", ");
  const cityStateZip = [listing.city, listing.state, listing.zip].filter(Boolean).join(", ");
  return [street, cityStateZip].filter(Boolean).join(", ");
}

function truncateMetaText(value: string, maxLen: number): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1).trim()}…`;
}

/** ~8–12 printed lines at 10pt; truncate instead of shrinking font for print. */
const FLYER_DESCRIPTION_MAX_CHARS = 900;

function truncateFlyerDescription(value: string): string {
  return truncateMetaText(value, FLYER_DESCRIPTION_MAX_CHARS);
}

function buildStreetAddress(listing: PublicListingFlyerListing): string {
  return [listing.addressLine1, listing.addressLine2].filter(Boolean).join(", ");
}

function buildCityStateZip(listing: PublicListingFlyerListing): string {
  return [listing.city, listing.state, listing.zip].filter(Boolean).join(", ");
}

/** Mask street address and coordinates when MLS rules disallow address display. */
export function applyPublicDisplayPermissions(
  listing: PublicListingFlyerListing,
): { listing: PublicListingFlyerListing; allowStreetAddress: boolean; allowSearchIndexing: boolean } {
  const allowStreetAddress = canShowPublicStreetAddress(listing.listingCompliance);
  if (allowStreetAddress) {
    return { listing, allowStreetAddress: true, allowSearchIndexing: true };
  }
  return {
    listing: {
      ...listing,
      addressLine1: null,
      addressLine2: null,
      latitude: null,
      longitude: null,
    },
    allowStreetAddress: false,
    allowSearchIndexing: false,
  };
}

export type ListingOpenGraphInput = {
  listing: PublicListingFlyerListing;
  agent: PublicListingFlyerAgent;
  shareUrl: string;
};

export type ListingOpenGraphMeta = {
  title: string;
  description: string;
  imageUrl: string | null;
  shareUrl: string;
  keywords: string;
};

/** Default OG image dimensions for listing hero photos (social preview cards). */
export const LISTING_OG_IMAGE_WIDTH = 1200;
export const LISTING_OG_IMAGE_HEIGHT = 630;

const LISTING_ERROR_OG_TITLE = "Listing not available | WhachatCRM";
const LISTING_ERROR_OG_DESCRIPTION = "This listing may be unavailable or expired.";

/**
 * Screen ribbon overlap into hero (top-right). ~28px ≈ 65–70% of ribbon height on the photo.
 * Tuned so the badge reads as sitting on the property image, not page chrome.
 */
const LISTING_BANNER_HERO_OVERLAP_PX = 28;

function formatSeoBedBathCount(value: number | null, label: "Bed" | "Bath"): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = value % 1 === 0 ? String(Math.round(value)) : String(value);
  const plural = value === 1 ? label : `${label}s`;
  return `${rounded} ${plural}`;
}

function buildSeoStreetAddress(listing: PublicListingFlyerListing): string {
  const street = resolveListingStreetForSlug({
    id: listing.id,
    addressLine1: listing.addressLine1,
    addressLine2: listing.addressLine2,
    city: listing.city,
    state: listing.state,
    zip: listing.zip,
  });
  if (street) return street;
  return buildStreetAddress(listing);
}

/** SEO page title and meta description for public listing share pages. */
export function buildListingSeoMeta(input: ListingOpenGraphInput): Pick<
  ListingOpenGraphMeta,
  "title" | "description" | "keywords"
> {
  const { listing } = input;
  const street =
    buildSeoStreetAddress(listing) ||
    buildFullAddress(listing) ||
    [listing.city, listing.state].filter(Boolean).join(", ") ||
    "Property listing";
  const price = formatListingPriceForComposer(listing.priceCents);
  const bedsLabel = formatSeoBedBathCount(listing.beds, "Bed");
  const bathsLabel = formatSeoBedBathCount(listing.baths, "Bath");
  const { sqft } = resolveFlyerSpecFields(listing);

  const titleParts: string[] = [street];
  if (bedsLabel && bathsLabel) {
    titleParts.push(`${bedsLabel} ${bathsLabel}`);
  } else if (bedsLabel) {
    titleParts.push(bedsLabel);
  } else if (bathsLabel) {
    titleParts.push(bathsLabel);
  }
  if (listing.city && listing.state) {
    titleParts.push(`${listing.city}, ${listing.state} Real Estate`);
  }
  const title = truncateMetaText(titleParts.join(" | "), 120);

  const descriptionParts: string[] = [`View ${street}.`];
  const detailBits: string[] = [];
  if (listing.beds != null) detailBits.push(`${listing.beds % 1 === 0 ? Math.round(listing.beds) : listing.beds} beds`);
  if (listing.baths != null) {
    detailBits.push(`${listing.baths % 1 === 0 ? Math.round(listing.baths) : listing.baths} baths`);
  }
  if (sqft) detailBits.push(`${sqft.replace(/\s*Sq Ft/i, "")} sq ft`);
  if (price) detailBits.push(price);
  if (detailBits.length > 0) {
    descriptionParts.push(`${detailBits.join(", ")}.`);
  }
  descriptionParts.push("Schedule a showing or contact the agent.");
  const description = truncateMetaText(descriptionParts.join(" "), 320);

  const keywordParts = [street, listing.city, listing.state, price, bedsLabel, bathsLabel, formatLabel(listing.propertyType)]
    .filter(Boolean)
    .map(String);
  const keywords = [...new Set(keywordParts)].join(", ");

  return { title, description, keywords };
}

export function buildListingStructuredDataJson(input: ListingOpenGraphInput): string | null {
  const { listing, agent, shareUrl } = input;
  const street = buildSeoStreetAddress(listing) || buildStreetAddress(listing);
  const imageUrl = pickPrimaryPhotoUrl(listing.photos);
  const price = listing.priceCents != null ? listing.priceCents / 100 : null;

  const payload: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": ["RealEstateListing", "Residence"],
    name: street || buildFullAddress(listing) || "Property listing",
    url: shareUrl,
  };

  if (imageUrl) payload.image = [imageUrl];

  if (price != null && Number.isFinite(price)) {
    payload.offers = {
      "@type": "Offer",
      price: String(price),
      priceCurrency: "USD",
    };
  }

  const address: Record<string, unknown> = { "@type": "PostalAddress" };
  if (listing.addressLine1) address.streetAddress = listing.addressLine1;
  if (listing.addressLine2) address.streetAddress = street || listing.addressLine1;
  if (listing.city) address.addressLocality = listing.city;
  if (listing.state) address.addressRegion = listing.state;
  if (listing.zip) address.postalCode = listing.zip;
  if (listing.country) address.addressCountry = listing.country;
  if (Object.keys(address).length > 1) payload.address = address;

  if (listing.beds != null) payload.numberOfRooms = listing.beds;
  if (listing.baths != null) payload.numberOfBathroomsTotal = listing.baths;
  if (listing.squareFeet != null && listing.squareFeet > 0) {
    payload.floorSize = {
      "@type": "QuantitativeValue",
      value: listing.squareFeet,
      unitCode: "FTK",
    };
  }
  if (listing.yearBuilt != null && listing.yearBuilt >= 1600) {
    payload.yearBuilt = listing.yearBuilt;
  }

  if (agent.name || agent.brokerageName || agent.phone || agent.email) {
    const seller: Record<string, unknown> = { "@type": "RealEstateAgent" };
    if (agent.name) seller.name = agent.name;
    if (agent.brokerageName) seller.parentOrganization = { "@type": "Organization", name: agent.brokerageName };
    if (agent.phone) seller.telephone = agent.phone;
    if (agent.email) seller.email = agent.email;
    payload.seller = seller;
  }

  return JSON.stringify(payload);
}

/** Build share-preview title, description, and image for social crawlers. */
export function buildListingOpenGraphMeta(input: ListingOpenGraphInput): ListingOpenGraphMeta {
  const { listing, shareUrl } = input;
  const seo = buildListingSeoMeta(input);
  const imageUrl = pickPrimaryPhotoUrl(listing.photos);

  return {
    title: seo.title,
    description: seo.description,
    imageUrl,
    shareUrl,
    keywords: seo.keywords,
  };
}

export function renderListingOpenGraphTags(meta: ListingOpenGraphMeta): string {
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeHtml(meta.shareUrl)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:site_name" content="WhachatCRM" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
  ];

  if (meta.imageUrl) {
    tags.push(`<meta property="og:image" content="${escapeHtml(meta.imageUrl)}" />`);
    tags.push(`<meta property="og:image:secure_url" content="${escapeHtml(meta.imageUrl)}" />`);
    tags.push(`<meta property="og:image:width" content="${LISTING_OG_IMAGE_WIDTH}" />`);
    tags.push(`<meta property="og:image:height" content="${LISTING_OG_IMAGE_HEIGHT}" />`);
    tags.push(`<meta property="og:image:alt" content="${escapeHtml(meta.title)}" />`);
    tags.push(`<meta name="twitter:card" content="summary_large_image" />`);
    tags.push(`<meta name="twitter:image" content="${escapeHtml(meta.imageUrl)}" />`);
  } else {
    tags.push(`<meta name="twitter:card" content="summary" />`);
  }

  return tags.join("\n  ");
}

export function renderListingErrorOpenGraphTags(): string {
  const title = LISTING_ERROR_OG_TITLE;
  const description = LISTING_ERROR_OG_DESCRIPTION;
  return [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:site_name" content="WhachatCRM" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
  ].join("\n  ");
}

function isValidBookingLink(link: string | null | undefined): link is string {
  return typeof link === "string" && /^https?:\/\//i.test(link.trim());
}

function buildAgentContactHref(
  agent: PublicListingFlyerAgent,
  listing: PublicListingFlyerListing,
): string | null {
  const address = buildFullAddress(listing);
  const subject = encodeURIComponent(
    address ? `Inquiry about ${address}` : "Property inquiry",
  );
  if (agent.email) {
    return `mailto:${encodeURIComponent(agent.email)}?subject=${subject}`;
  }
  if (agent.phone) {
    const digits = agent.phone.replace(/\D/g, "");
    return digits ? `tel:${digits}` : null;
  }
  return null;
}

function buildGoogleMapsUrl(listing: PublicListingFlyerListing): string | null {
  const lat = listing.latitude;
  const lng = listing.longitude;
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  const address = buildFullAddress(listing);
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function lonToTileX(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom,
  );
}

/** Print-safe static map URLs — tries providers in order; OSM tile is the final reliable fallback. */
export function buildStaticMapImageUrls(listing: PublicListingFlyerListing): string[] {
  const lat = listing.latitude;
  const lng = listing.longitude;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return [];
  }
  const zoom = 14;
  const tileX = lonToTileX(lng, zoom);
  const tileY = latToTileY(lat, zoom);
  const osmStaticParams = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: String(zoom),
    size: "450x450",
    maptype: "mapnik",
    markers: `${lat},${lng},red`,
  });

  return [
    `https://staticmap.openstreetmap.de/staticmap.php?${osmStaticParams.toString()}`,
    `https://static-maps.yandex.ru/1.x/?lang=en_US&ll=${lng},${lat}&z=${zoom}&l=map&size=450,450&pt=${lng},${lat},pm2rdm`,
    `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`,
  ];
}

/** Primary static map URL for print (first candidate). */
export function buildStaticMapImageUrl(listing: PublicListingFlyerListing): string | null {
  return buildStaticMapImageUrls(listing)[0] ?? null;
}

function renderMapEmbed(listing: PublicListingFlyerListing): string {
  const lat = listing.latitude;
  const lng = listing.longitude;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "";
  }
  const pad = 0.012;
  const bbox = `${lng - pad},${lat - pad},${lng + pad},${lat + pad}`;
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`;
  const staticMapUrls = buildStaticMapImageUrls(listing);
  const staticMap = staticMapUrls.length
    ? `<img class="map-print-static print-only" src="${escapeHtml(staticMapUrls[0])}" data-map-fallbacks="${escapeHtml(JSON.stringify(staticMapUrls.slice(1)))}" alt="Property location map" />
      <div class="map-print-placeholder print-only" aria-hidden="true">Map preview</div>`
    : "";
  return `<div class="map-embed-wrap">
      <iframe class="map-embed map-embed-interactive" title="Property location map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${escapeHtml(embed)}"></iframe>
      ${staticMap}
    </div>`;
}

function renderPrintPhotoStrip(photos: { url: string; order: number }[]): string {
  const secondary = photos.slice(1, 4);
  if (secondary.length === 0) return "";
  const items = secondary
    .map(
      (p) =>
        `<img class="print-photo-strip-img" src="${escapeHtml(p.url)}" alt="" />`,
    )
    .join("");
  return `<div class="print-photo-strip print-only" aria-hidden="true">${items}</div>`;
}

function renderMapColumn(listing: PublicListingFlyerListing): string {
  const mapEmbed = renderMapEmbed(listing);
  const googleUrl = buildGoogleMapsUrl(listing);
  const mapsBtn = googleUrl
    ? `<a class="btn btn-outline map-btn no-print" href="${escapeHtml(googleUrl)}" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>`
    : "";
  if (!mapEmbed) {
    return `<div class="bottom-col bottom-col-map bottom-col-empty" aria-hidden="true"></div>`;
  }
  return `<div class="bottom-col bottom-col-map">
    <h3 class="bottom-col-heading">Location</h3>
    ${mapEmbed}
    ${mapsBtn}
  </div>`;
}

function renderQrColumn(qrDataUrl: string): string {
  if (!qrDataUrl) {
    return `<div class="bottom-col bottom-col-qr bottom-col-empty" aria-hidden="true"></div>`;
  }
  return `<div class="bottom-col bottom-col-qr">
    <h3 class="bottom-col-heading">Scan To View Listing</h3>
    <div class="qr-block">
      <img src="${escapeHtml(qrDataUrl)}" alt="QR code to view listing" width="160" height="160" />
    </div>
    <p class="qr-helper">Open listing on your phone</p>
  </div>`;
}

function buildFlyerBottomRow(
  listing: PublicListingFlyerListing,
  qrDataUrl: string,
  agent: PublicListingFlyerAgent,
  companyLogoUrl: string | null,
  allowStreetAddress: boolean,
): string {
  const mapCol = allowStreetAddress ? renderMapColumn(listing) : `<div class="bottom-col bottom-col-map bottom-col-empty" aria-hidden="true"></div>`;
  const qrCol = renderQrColumn(qrDataUrl);
  const agentCard = renderAgentCard(agent, listing, companyLogoUrl);
  const agentCol = agentCard
    ? `<div class="bottom-col bottom-col-agent">${agentCard}</div>`
    : `<div class="bottom-col bottom-col-agent bottom-col-empty" aria-hidden="true"></div>`;

  const hasMap = allowStreetAddress && listing.latitude != null && listing.longitude != null;
  const hasQr = Boolean(qrDataUrl);
  const hasAgent = Boolean(agentCard);
  if (!hasMap && !hasQr && !hasAgent) return "";

  return `<section class="flyer-bottom-row">${mapCol}${qrCol}${agentCol}</section>`;
}

const PRINT_FLYER_HINT =
  "For best print results, turn off browser Headers and footers.";

function renderListingBanner(listingLabel: "FOR SALE" | "FOR RENT"): string {
  return `<div class="listing-banner" aria-label="${escapeHtml(listingLabel)}">${escapeHtml(listingLabel)}</div>`;
}

function renderListingBannerHeroOverlap(listingLabel: "FOR SALE" | "FOR RENT"): string {
  return `<div class="gallery-banner-anchor">${renderListingBanner(listingLabel)}</div>`;
}

/** Screen-only share/print — hidden from print layout via .no-print. */
function renderFlyerFloatingActions(): string {
  return `<div class="flyer-floating-actions no-print" aria-label="Page actions">
      <button type="button" class="icon-btn" id="btn-share" aria-label="Share listing">${SHARE_ICON_SVG}</button>
      <button type="button" class="icon-btn" id="btn-print" aria-label="Print flyer" title="${escapeHtml(PRINT_FLYER_HINT)}">${PRINT_ICON_SVG}</button>
    </div>`;
}

function formatBedStat(beds: number | null): string | null {
  if (beds == null) return null;
  const n = beds % 1 === 0 ? String(beds) : beds.toFixed(1);
  return `${n} Beds`;
}

function formatBathStat(baths: number | null): string | null {
  if (baths == null) return null;
  const n = baths % 1 === 0 ? String(baths) : baths.toFixed(1);
  return `${n} Baths`;
}

function renderKeyStats(
  price: string,
  beds: number | null,
  baths: number | null,
  sqft: string | null,
  hoa: string | null,
  yearBuilt: string | null,
): string {
  const items: string[] = [];
  items.push(`<span class="key-stat key-price">${escapeHtml(price)}</span>`);
  const bedStat = formatBedStat(beds);
  if (bedStat) items.push(`<span class="key-stat">${escapeHtml(bedStat)}</span>`);
  const bathStat = formatBathStat(baths);
  if (bathStat) items.push(`<span class="key-stat">${escapeHtml(bathStat)}</span>`);
  if (sqft) items.push(`<span class="key-stat">${escapeHtml(sqft)}</span>`);
  if (hoa) items.push(`<span class="key-stat">${escapeHtml(hoa)}</span>`);
  if (yearBuilt) items.push(`<span class="key-stat">Built ${escapeHtml(yearBuilt)}</span>`);
  const body = items.join('<span class="key-stat-sep" aria-hidden="true">|</span>');
  return `<div class="key-stats">${body}</div>`;
}

function renderCompanyLogo(companyLogoUrl: string | null): string {
  if (
    !companyLogoUrl ||
    (!companyLogoUrl.startsWith("data:image/") &&
      !/^https?:\/\//i.test(companyLogoUrl) &&
      !companyLogoUrl.startsWith("/"))
  ) {
    return "";
  }
  return `<img class="agent-company-logo" src="${escapeHtml(companyLogoUrl)}" alt="" />`;
}

function renderGallery(
  photos: { url: string; order: number }[],
  listingLabel: "FOR SALE" | "FOR RENT",
): string {
  if (photos.length === 0) return "";
  const hero = photos[0].url;
  const urlsJson = JSON.stringify(photos.map((p) => p.url));
  const thumbs = photos
    .map(
      (p, idx) =>
        `<button type="button" class="thumb${idx === 0 ? " active" : ""}" data-index="${idx}" data-url="${escapeHtml(p.url)}" aria-label="Photo ${idx + 1}">
          <img src="${escapeHtml(p.url)}" alt="" loading="lazy" />
        </button>`,
    )
    .join("");
  const nav =
    photos.length > 1
      ? `<button type="button" class="gallery-nav gallery-prev" id="gallery-prev" aria-label="Previous photo">${CHEVRON_LEFT}</button>
         <button type="button" class="gallery-nav gallery-next" id="gallery-next" aria-label="Next photo">${CHEVRON_RIGHT}</button>`
      : "";
  return `<section class="gallery">
    ${renderListingBannerHeroOverlap(listingLabel)}
    <div class="hero-wrap">
      <img id="hero-img" class="hero-img" src="${escapeHtml(hero)}" alt="Property photo" />
      ${nav}
    </div>
    ${renderPrintPhotoStrip(photos)}
    ${photos.length > 1 ? `<div class="thumbs" role="list">${thumbs}</div>` : ""}
    <script type="application/json" id="gallery-urls">${urlsJson.replace(/</g, "\\u003c")}</script>
  </section>`;
}

function renderAgentActions(agent: PublicListingFlyerAgent, listing: PublicListingFlyerListing): string {
  const bookingHref = isValidBookingLink(agent.bookingLink) ? agent.bookingLink.trim() : null;
  const contactHref = buildAgentContactHref(agent, listing);
  const buttons: string[] = [];

  if (bookingHref) {
    buttons.push(
      `<a class="btn btn-primary agent-cta" href="${escapeHtml(bookingHref)}" target="_blank" rel="noopener noreferrer">Schedule Showing</a>`,
    );
    if (contactHref) {
      buttons.push(
        `<a class="btn agent-cta-secondary" href="${escapeHtml(contactHref)}">Contact Agent</a>`,
      );
    }
  } else if (contactHref) {
    buttons.push(
      `<a class="btn btn-primary agent-cta" href="${escapeHtml(contactHref)}">Contact Agent</a>`,
    );
  }

  if (buttons.length === 0) return "";
  return `<div class="agent-actions">${buttons.join("")}</div>`;
}

function agentInitials(agent: PublicListingFlyerAgent): string {
  const source = agent.name || agent.brokerageName || "W";
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  return source.charAt(0).toUpperCase();
}

function renderAgentCard(
  agent: PublicListingFlyerAgent,
  listing: PublicListingFlyerListing,
  companyLogoUrl: string | null,
): string {
  const contactHref = buildAgentContactHref(agent, listing);
  const bookingHref = isValidBookingLink(agent.bookingLink) ? agent.bookingLink.trim() : null;
  const companyLogo = renderCompanyLogo(companyLogoUrl);
  const hasAgent =
    agent.name ||
    agent.brokerageName ||
    agent.phone ||
    agent.email ||
    agent.avatarUrl ||
    companyLogo ||
    contactHref ||
    bookingHref;
  if (!hasAgent) return "";

  const avatar = agent.avatarUrl
    ? `<img class="agent-avatar" src="${escapeHtml(agent.avatarUrl)}" alt="" />`
    : `<div class="agent-avatar placeholder" aria-hidden="true">${escapeHtml(agentInitials(agent))}</div>`;

  const lines: string[] = [];
  if (agent.name) lines.push(`<p class="agent-name">${escapeHtml(agent.name)}</p>`);
  if (!companyLogo && agent.brokerageName) {
    lines.push(`<p class="agent-brokerage">${escapeHtml(agent.brokerageName)}</p>`);
  }
  if (agent.phone) {
    const tel = agent.phone.replace(/\D/g, "");
    lines.push(
      tel
        ? `<p class="agent-contact"><a href="tel:${escapeHtml(tel)}">${escapeHtml(agent.phone)}</a></p>`
        : `<p class="agent-contact">${escapeHtml(agent.phone)}</p>`,
    );
  }
  if (agent.email) {
    lines.push(
      `<p class="agent-contact"><a href="mailto:${escapeHtml(agent.email)}">${escapeHtml(agent.email)}</a></p>`,
    );
  }

  return `<div class="agent-card">
    ${avatar}
    <div class="agent-body">
      ${lines.join("")}
      ${renderAgentActions(agent, listing)}
    </div>
    ${companyLogo ? `<div class="agent-logo-footer">${companyLogo}</div>` : ""}
  </div>`;
}

function renderPropertyHeader(
  listing: PublicListingFlyerListing,
  price: string,
  sqft: string | null,
  hoa: string | null,
  yearBuilt: string | null,
): string {
  const street = buildStreetAddress(listing);
  const cityStateZip = buildCityStateZip(listing);
  const fallback =
    buildFullAddress(listing) ||
    [listing.city, listing.state].filter(Boolean).join(", ") ||
    "Property Listing";

  const streetHtml = street
    ? `<p class="property-street">${escapeHtml(street)}</p>`
    : `<p class="property-street">${escapeHtml(fallback)}</p>`;
  const locationHtml = street && cityStateZip
    ? `<p class="property-location">${escapeHtml(cityStateZip)}</p>`
    : "";

  return `<section class="property-header">
    ${streetHtml}
    ${locationHtml}
    ${renderKeyStats(price, listing.beds, listing.baths, sqft, hoa, yearBuilt)}
  </section>`;
}

function renderPoweredByFooter(): string {
  return `<footer class="site-footer">
    <a class="powered-by" href="${WHACHATCRM_HOME_URL}" target="_blank" rel="noopener noreferrer">
      <span class="powered-logo">${WHACHAT_W_LOGO_SVG}</span>
      <span>Powered by WhachatCRM</span>
    </a>
  </footer>`;
}

function renderListingComplianceAttribution(
  compliance: InventoryListingCompliance | null | undefined,
  presentingBrokerageName: string | null | undefined,
): string {
  const normalized = normalizeListingCompliance(compliance);
  if (!canRenderPublicListingAttribution(normalized)) return "";
  const lines = buildPublicListingAttributionLines({
    compliance: normalized,
    presentingBrokerageName,
  });
  if (lines.length === 0) return "";
  return `<section class="listing-compliance-attribution" data-testid="listing-compliance-attribution">
    ${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
  </section>`;
}

export function inventoryRowToFlyerListing(row: {
  id: string;
  priceCents: number | null;
  beds: string | number | null;
  baths: string | number | null;
  squareFeet: number | null;
  yearBuilt: number | null;
  hoaFeeCents: number | null;
  propertyType: string | null;
  propertySubtype: string | null;
  description: string | null;
  features: unknown;
  photos: unknown;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  providerListingId: string;
  listingDetails: unknown;
  listingCompliance?: unknown;
}): PublicListingFlyerListing {
  const features = Array.isArray(row.features)
    ? row.features.map((f) => String(f).trim()).filter(Boolean)
    : [];
  const photos = Array.isArray(row.photos)
    ? (row.photos as { url: string; order?: number }[])
    : [];
  const detailsParsed = inventoryListingDetailsSchema.safeParse(row.listingDetails ?? {});
  return {
    id: row.id,
    priceCents: row.priceCents != null ? Number(row.priceCents) : null,
    beds: row.beds != null ? Number(row.beds) : null,
    baths: row.baths != null ? Number(row.baths) : null,
    squareFeet: row.squareFeet != null ? Number(row.squareFeet) : null,
    yearBuilt: row.yearBuilt != null ? Number(row.yearBuilt) : null,
    hoaFeeCents: row.hoaFeeCents != null ? Number(row.hoaFeeCents) : null,
    propertyType: row.propertyType,
    propertySubtype: row.propertySubtype,
    description: row.description,
    features,
    photos,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    zip: row.zip,
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status,
    providerListingId: row.providerListingId,
    listingDetails: detailsParsed.success ? detailsParsed.data : {},
    listingCompliance: normalizeListingCompliance(row.listingCompliance),
  };
}

export function buildPublicListingFlyerHtml(input: PublicListingFlyerInput): string {
  const {
    listing: rawListing,
    agent,
    shareUrl,
    qrDataUrl,
    companyLogoUrl = null,
    allowStreetAddress: allowStreetOverride,
    allowSearchIndexing: allowIndexOverride,
  } = input;
  const display = applyPublicDisplayPermissions(rawListing);
  const listing = display.listing;
  const allowStreetAddress = allowStreetOverride ?? display.allowStreetAddress;
  const allowSearchIndexing = allowIndexOverride ?? display.allowSearchIndexing;
  const photos = pickFlyerHeroPhotos(parsePhotos(listing.photos));
  const openGraph = buildListingOpenGraphMeta({ listing, agent, shareUrl });
  const structuredDataJson = buildListingStructuredDataJson({ listing, agent, shareUrl });
  const listingLabel = resolveFlyerListingLabel(listing);
  const price = formatListingPriceForComposer(listing.priceCents) || "Price on request";
  const { sqft, hoa, yearBuilt } = resolveFlyerSpecFields(listing);
  const description = truncateFlyerDescription((listing.description || "").trim());
  const robotsMeta = allowSearchIndexing ? "index, follow" : "noindex, nofollow";

  const descHtml = description
    ? `<section class="description-section">
      <h2>Description</h2>
      <p class="description">${escapeHtml(description)}</p>
    </section>`
    : "";

  const propertyHeaderHtml = renderPropertyHeader(listing, price, sqft, hoa, yearBuilt);
  const bottomRowHtml = buildFlyerBottomRow(listing, qrDataUrl, agent, companyLogoUrl, allowStreetAddress);
  const complianceAttributionHtml = renderListingComplianceAttribution(
    listing.listingCompliance,
    agent.brokerageName,
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${escapeHtml(openGraph.description)}" />
  <meta name="keywords" content="${escapeHtml(openGraph.keywords)}" />
  <meta name="robots" content="${robotsMeta}" />
  <link rel="canonical" href="${escapeHtml(shareUrl)}" />
  <title>${escapeHtml(openGraph.title)}</title>
  ${renderListingOpenGraphTags(openGraph)}
  ${structuredDataJson ? `<script type="application/ld+json">${structuredDataJson.replace(/<\//g, "<\\/")}</script>` : ""}
  <style>
    :root {
      --brand-green: ${WHACHAT_GREEN};
      --brand-green-dark: #047857;
      --ink: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --surface: #ffffff;
      --bg: #f8fafc;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--ink);
      line-height: 1.5;
    }
    .flyer { max-width: 920px; margin: 0 auto; background: var(--surface); }
    .gallery-banner-anchor {
      display: flex;
      justify-content: flex-end;
      margin: 0 0 -${LISTING_BANNER_HERO_OVERLAP_PX}px;
      padding: 0;
      position: relative;
      z-index: 2;
      pointer-events: none;
      background: transparent;
    }
    .gallery-banner-anchor .listing-banner { pointer-events: auto; }
    .listing-banner-fallback {
      display: flex;
      justify-content: flex-end;
      margin: 0 0 12px;
      padding: 0 20px;
    }
    .listing-banner {
      margin: 0;
      padding: 10px 28px 10px 20px;
      font-size: 1.125rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #fff;
      background: var(--brand-green);
      transform: skewX(-12deg);
      transform-origin: top right;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.12);
    }
    .flyer-floating-actions {
      position: fixed;
      right: max(12px, env(safe-area-inset-right, 0px));
      bottom: max(12px, env(safe-area-inset-bottom, 0px));
      z-index: 50;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid var(--border);
      box-shadow: 0 4px 16px rgba(15, 23, 42, 0.1);
      backdrop-filter: blur(8px);
    }
    .flyer-floating-actions .icon-btn {
      width: 34px;
      height: 34px;
      border-color: transparent;
      background: transparent;
    }
    .flyer-floating-actions .icon-btn:hover {
      background: #f1f5f9;
      border-color: var(--border);
    }
    .icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #fff;
      color: var(--muted);
      cursor: pointer;
    }
    .icon-btn:hover { color: var(--ink); border-color: #cbd5e1; background: #f8fafc; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .btn-primary { background: var(--brand-green); border-color: var(--brand-green); color: #fff; }
    .btn-primary:hover { background: var(--brand-green-dark); border-color: var(--brand-green-dark); }
    .btn-outline { background: #fff; border-color: var(--border); color: var(--ink); }
    .btn-outline:hover { border-color: #cbd5e1; background: #f8fafc; }
    .flyer-body { padding: 0 20px 20px; }
    .gallery { margin: 0 -20px 16px; }
    .hero-wrap {
      position: relative;
      background: #e2e8f0;
      height: min(42vw, 380px);
      min-height: 220px;
      overflow: hidden;
    }
    .hero-img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .gallery-nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 999px;
      background: rgba(255,255,255,0.92);
      color: var(--ink);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(15,23,42,0.12);
    }
    .gallery-nav:hover { background: #fff; }
    .gallery-prev { left: 12px; }
    .gallery-next { right: 12px; }
    .thumbs {
      display: flex;
      gap: 8px;
      padding: 12px 20px;
      overflow-x: auto;
      background: #f8fafc;
      border-top: 1px solid var(--border);
    }
    .thumb {
      flex: 0 0 auto;
      width: 72px;
      height: 54px;
      padding: 0;
      border: 2px solid transparent;
      border-radius: 6px;
      overflow: hidden;
      cursor: pointer;
      background: #e2e8f0;
    }
    .thumb.active { border-color: var(--brand-green); }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .print-only { display: none !important; }
    .property-header { padding: 4px 0 14px; border-bottom: 1px solid var(--border); }
    .property-street {
      margin: 0 0 4px;
      font-size: 1.375rem;
      line-height: 1.25;
      font-weight: 700;
    }
    .property-location {
      margin: 0 0 12px;
      font-size: 0.9375rem;
      line-height: 1.35;
      color: var(--muted);
    }
    .key-stats {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 2px 0;
      row-gap: 4px;
      margin: 0;
      padding: 0;
      border-bottom: none;
      overflow: visible;
      width: 100%;
    }
    .key-stat {
      font-size: 0.875rem;
      font-weight: 500;
      color: #334155;
      white-space: nowrap;
      flex: 0 0 auto;
    }
    .key-stat.key-price { font-size: 1.25rem; font-weight: 700; color: var(--brand-green); }
    .key-stat-sep { color: #cbd5e1; margin: 0 10px; font-weight: 300; user-select: none; }
    @media (min-width: 768px) {
      .property-street { font-size: 1.5rem; }
      .key-stat { font-size: 0.9375rem; }
      .key-stat.key-price { font-size: 1.375rem; }
    }
    h2, .bottom-col-heading {
      font-size: 0.6875rem;
      margin: 0 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--brand-green);
      font-weight: 700;
    }
    .description-section { margin: 16px 0; padding: 0; }
    .description {
      white-space: pre-wrap;
      margin: 0;
      color: #334155;
      font-size: 0.9375rem;
      line-height: 1.55;
    }
    .flyer-bottom-row {
      display: grid;
      gap: 16px;
      margin-top: 16px;
      align-items: stretch;
    }
    @media (min-width: 640px) {
      .flyer-bottom-row {
        grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.05fr) minmax(0, 1.15fr);
        gap: 14px;
      }
    }
    .bottom-col { display: flex; flex-direction: column; min-width: 0; }
    .bottom-col-empty { display: none; }
    .map-embed-wrap {
      position: relative;
      width: 100%;
      aspect-ratio: 1;
      background: #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--border);
    }
    .map-embed {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
    }
    .map-print-placeholder {
      display: none;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      min-height: 120px;
      background: linear-gradient(145deg, #e8f0ea 0%, #dce7e0 100%);
      color: #475569;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .map-btn { margin-top: 8px; align-self: flex-start; }
    .qr-block {
      padding: 8px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #fff;
      align-self: center;
      width: 100%;
      max-width: 180px;
    }
    .qr-block img { display: block; width: 100%; height: auto; aspect-ratio: 1; }
    .qr-helper {
      margin: 8px 0 0;
      font-size: 0.75rem;
      color: var(--muted);
      text-align: center;
    }
    .bottom-col-qr { align-items: center; }
    .bottom-col-qr .bottom-col-heading { text-align: center; width: 100%; }
    .agent-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 8px;
      height: 100%;
      padding: 16px 14px;
      border: 1.5px solid #cbd5e1;
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
    }
    .agent-logo-footer {
      margin-top: auto;
      padding-top: 10px;
      border-top: 1px solid var(--border);
      width: 100%;
      display: flex;
      justify-content: center;
    }
    .agent-company-logo {
      max-height: 44px;
      max-width: 120px;
      width: auto;
      object-fit: contain;
    }
    .agent-avatar {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      border: 2px solid #f1f5f9;
    }
    .agent-avatar.placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e2e8f0;
      color: #475569;
      font-weight: 700;
      font-size: 1.375rem;
    }
    .agent-name { margin: 0 0 2px; font-weight: 700; font-size: 1rem; }
    .agent-brokerage { margin: 0 0 6px; color: var(--muted); font-size: 0.8125rem; }
    .agent-contact { margin: 0 0 3px; font-size: 0.8125rem; }
    .agent-contact a { color: var(--ink); text-decoration: none; }
    .agent-contact a:hover { text-decoration: underline; }
    .agent-body { width: 100%; }
    .agent-actions { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; width: 100%; }
    .agent-cta, .agent-cta-secondary { width: 100%; text-align: center; font-size: 0.8125rem; padding: 8px 12px; }
    .agent-cta-secondary {
      background: #fff;
      border-color: var(--border);
      color: var(--ink);
      font-weight: 600;
    }
    .agent-cta-secondary:hover { border-color: #cbd5e1; background: #f8fafc; }
    .listing-compliance-attribution {
      margin: 0 20px 8px;
      padding: 10px 12px;
      border-top: 1px solid var(--border);
      font-size: 0.6875rem;
      line-height: 1.45;
      color: var(--muted);
    }
    .listing-compliance-attribution p { margin: 0 0 4px; }
    .listing-compliance-attribution p:last-child { margin-bottom: 0; }
    .site-footer {
      padding: 12px 20px 16px;
      border-top: 1px solid var(--border);
      text-align: center;
      background: #fafbfc;
    }
    .powered-by {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      color: #94a3b8;
      text-decoration: none;
    }
    .powered-by:hover { color: var(--muted); }
    .powered-logo { display: flex; align-items: center; line-height: 0; }
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(80px);
      background: var(--ink);
      color: #fff;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 0.875rem;
      opacity: 0;
      transition: transform 0.25s ease, opacity 0.25s ease;
      pointer-events: none;
      z-index: 100;
    }
    .toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
    @page { size: letter; margin: 0.35in; }
    @media print {
      html, body {
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .no-print { display: none !important; }
      .flyer { max-width: none; box-shadow: none; }
      .gallery-banner-anchor {
        justify-content: flex-end !important;
        margin-bottom: 4px;
      }
      .listing-banner {
        font-size: 11pt;
        padding: 5px 20px 5px 14px;
        margin-right: 0;
        transform-origin: top right !important;
      }
      .flyer-body { padding: 0; }
      .gallery { margin: 0 0 6px; }
      .hero-wrap {
        height: 4.1in;
        min-height: 0;
      }
      .hero-img { max-height: none; }
      .gallery:has(.print-photo-strip) .hero-wrap { height: 3.85in; }
      .print-only.print-photo-strip {
        display: flex !important;
        gap: 4px;
        margin-top: 4px;
        overflow: hidden;
      }
      .print-photo-strip-img {
        flex: 1 1 0;
        min-width: 0;
        height: 0.65in;
        object-fit: cover;
        border-radius: 2px;
        display: block;
      }
      .thumbs, .gallery-nav { display: none !important; }
      .property-header { padding: 0 0 6px; }
      .property-street { font-size: 14pt; margin-bottom: 2px; }
      .property-location { font-size: 10pt; margin-bottom: 4px; }
      .key-stats { flex-wrap: wrap; overflow: visible; row-gap: 3px; }
      .key-stat.key-price { font-size: 12pt; }
      .key-stat { font-size: 9pt; flex: 0 0 auto; }
      .key-stat-sep { margin: 0 5px; }
      .description-section { margin: 6px 0; page-break-inside: avoid; break-inside: avoid; }
      .description-section h2 { font-size: 8pt; margin-bottom: 3px; }
      .description { font-size: 10pt; line-height: 1.42; }
      .flyer-bottom-row {
        display: grid;
        grid-template-columns: minmax(0, 3fr) minmax(0, 3fr) minmax(0, 4fr);
        gap: 10px;
        margin-top: 8px;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .bottom-col-empty { display: none !important; }
      .bottom-col-heading { font-size: 7pt; margin-bottom: 4px; }
      .map-embed-interactive { display: none !important; }
      .map-print-static.print-only {
        display: block !important;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center;
      }
      .map-embed-wrap.map-failed .map-print-static { display: none !important; }
      .map-embed-wrap.map-failed .map-print-placeholder {
        display: flex !important;
        position: absolute;
        inset: 0;
      }
      .map-embed-wrap {
        aspect-ratio: auto;
        height: 1.65in;
        min-height: 1.55in;
        max-height: 1.75in;
        border-radius: 4px;
        overflow: hidden;
        position: relative;
      }
      .qr-block {
        padding: 4px;
        border-radius: 4px;
        max-width: none;
        width: 100%;
      }
      .qr-block img {
        width: 100%;
        max-width: 1.7in;
        margin: 0 auto;
      }
      .qr-helper { font-size: 7pt; margin-top: 4px; }
      .agent-card {
        break-inside: avoid;
        page-break-inside: avoid;
        padding: 10px 8px;
        box-shadow: none;
        gap: 5px;
        border-radius: 8px;
        border-width: 1.5pt;
        border-color: #94a3b8;
      }
      .agent-avatar { width: 54px; height: 54px; font-size: 1.05rem; border-width: 1.5pt; }
      .agent-company-logo { max-height: 28px; max-width: 90px; }
      .agent-name { font-size: 10pt; }
      .agent-brokerage, .agent-contact { font-size: 8pt; }
      .agent-actions { gap: 4px; margin-top: 6px; }
      .agent-cta, .agent-cta-secondary { padding: 5px 8px; font-size: 7.5pt; line-height: 1.2; }
      .agent-logo-footer { margin-top: auto; padding-top: 6px; }
      .site-footer { padding: 4px 0 0; border-top: 1px solid #e2e8f0; margin-top: 6px; background: #fff; }
      .powered-by { font-size: 7pt; }
      a { color: inherit; text-decoration: none; }
    }
    @media (max-width: 480px) {
      .listing-banner { font-size: 0.9375rem; padding: 8px 20px 8px 14px; }
      .gallery-nav { width: 34px; height: 34px; }
      .key-stat-sep { margin: 0 6px; }
      .flyer-floating-actions { right: 10px; bottom: 10px; }
    }
  </style>
</head>
<body>
  <div class="flyer">
    <div class="flyer-body">
      ${photos.length === 0 ? `<div class="listing-banner-fallback">${renderListingBanner(listingLabel)}</div>` : renderGallery(photos, listingLabel)}
      ${propertyHeaderHtml}
      ${descHtml}
      ${bottomRowHtml}
      ${complianceAttributionHtml}
      ${renderPoweredByFooter()}
    </div>
  </div>
  ${renderFlyerFloatingActions()}
  <div id="toast" class="toast no-print" role="status" aria-live="polite">Listing link copied.</div>
  <script>
    (function () {
      var hero = document.getElementById("hero-img");
      var urlsEl = document.getElementById("gallery-urls");
      var urls = [];
      try { urls = urlsEl ? JSON.parse(urlsEl.textContent || "[]") : []; } catch (e) {}
      var index = 0;
      function setPhoto(i) {
        if (!hero || !urls.length) return;
        index = (i + urls.length) % urls.length;
        hero.src = urls[index];
        document.querySelectorAll(".thumb").forEach(function (t, ti) {
          t.classList.toggle("active", ti === index);
        });
      }
      document.getElementById("gallery-prev")?.addEventListener("click", function () { setPhoto(index - 1); });
      document.getElementById("gallery-next")?.addEventListener("click", function () { setPhoto(index + 1); });
      document.querySelectorAll(".thumb").forEach(function (btn, i) {
        btn.addEventListener("click", function () { setPhoto(i); });
      });
      document.addEventListener("keydown", function (e) {
        if (!urls.length || urls.length < 2) return;
        if (e.key === "ArrowLeft") setPhoto(index - 1);
        if (e.key === "ArrowRight") setPhoto(index + 1);
      });
      var toast = document.getElementById("toast");
      function showToast() {
        if (!toast) return;
        toast.classList.add("show");
        setTimeout(function () { toast.classList.remove("show"); }, 2600);
      }
      document.querySelectorAll(".map-print-static").forEach(function (img) {
        var fallbacks = [];
        try { fallbacks = JSON.parse(img.getAttribute("data-map-fallbacks") || "[]"); } catch (e) {}
        var fallbackIndex = 0;
        img.addEventListener("error", function () {
          if (fallbackIndex < fallbacks.length) {
            img.src = fallbacks[fallbackIndex++];
            return;
          }
          img.closest(".map-embed-wrap")?.classList.add("map-failed");
        });
      });
      document.getElementById("btn-print")?.addEventListener("click", function () { window.print(); });
      document.getElementById("btn-share")?.addEventListener("click", async function () {
        var url = ${JSON.stringify(shareUrl)};
        var title = document.title;
        if (navigator.share) {
          try { await navigator.share({ title: title, url: url }); return; } catch (e) {}
        }
        try {
          await navigator.clipboard.writeText(url);
          showToast();
        } catch (e) {
          prompt("Copy this listing link:", url);
        }
      });
    })();
  </script>
</body>
</html>`;
}

function publicListingErrorPageShell(title: string, message: string, hint?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${escapeHtml(LISTING_ERROR_OG_DESCRIPTION)}" />
  <title>${escapeHtml(title)}</title>
  ${renderListingErrorOpenGraphTags()}
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
    .wrap { max-width: 28rem; margin: 4rem auto; padding: 2rem; text-align: center; }
    h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
    p { font-size: 0.9375rem; line-height: 1.5; color: #475569; margin: 0 0 0.5rem; }
    .hint { font-size: 0.8125rem; color: #64748b; margin-top: 1rem; }
    a { color: #6d28d9; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    ${hint ? `<p class="hint">${escapeHtml(hint)}</p>` : ""}
    <p class="hint"><a href="${WHACHATCRM_HOME_URL}">WhachatCRM</a></p>
  </div>
</body>
</html>`;
}

/** Friendly 404 when listing is inactive, missing, or not shareable. */
export function buildPublicListingNotFoundHtml(): string {
  return publicListingErrorPageShell(
    "Listing not available",
    "This listing may have been sold, taken off market, or the link is no longer valid.",
  );
}

/** Generic load failure — distinct from not-found (e.g. unexpected server error). */
export function buildPublicListingLoadErrorHtml(): string {
  return publicListingErrorPageShell(
    "Could not load listing",
    "Something went wrong while loading this page. Please try again in a moment.",
    "If the problem continues, ask your agent for an updated link.",
  );
}
