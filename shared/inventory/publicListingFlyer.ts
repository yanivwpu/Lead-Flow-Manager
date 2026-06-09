import {
  formatBedsBathsForComposer,
  formatListingPriceForComposer,
} from "./inventoryComposerDraft";
import {
  inventoryListingDetailsSchema,
  type InventoryListingDetails,
} from "./inventoryListingSchema";
import { pickPrimaryPhotoUrl } from "./listingViewUrl";

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
};

export type PublicListingFlyerInput = {
  listing: PublicListingFlyerListing;
  agent: PublicListingFlyerAgent;
  shareUrl: string;
  qrDataUrl: string;
  /** Company/agency logo from Business Profile; W logo fallback when absent. */
  companyLogoUrl?: string | null;
};

const WHACHATCRM_HOME_URL = "https://whachatcrm.com";
const WHACHAT_GREEN = "#22c55e";
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
  if (cents == null || cents <= 0) return null;
  return `$${Math.round(cents / 100).toLocaleString("en-US")}/mo HOA`;
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
  if (year == null || year < 1600) return null;
  return String(year);
}

function formatYesNo(value: boolean | undefined): string | null {
  if (value == null) return null;
  return value ? "Yes" : "No";
}

function parsePhotos(raw: { url: string; order?: number }[]): { url: string; order: number }[] {
  return raw
    .filter((p) => typeof p.url === "string" && /^https?:\/\//i.test(p.url))
    .map((p, idx) => ({ url: p.url.trim(), order: p.order ?? idx }))
    .sort((a, b) => a.order - b.order);
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

/** Build share-preview title, description, and image for social crawlers. */
export function buildListingOpenGraphMeta(input: ListingOpenGraphInput): ListingOpenGraphMeta {
  const { listing, agent, shareUrl } = input;
  const address =
    buildFullAddress(listing) ||
    [listing.city, listing.state].filter(Boolean).join(", ") ||
    "Property listing";
  const price = formatListingPriceForComposer(listing.priceCents);
  const bedsBaths = formatBedsBathsForComposer(listing.beds, listing.baths);
  const descSnippet = truncateMetaText((listing.description || "").trim(), 120);

  const title = truncateMetaText(price ? `${price} · ${address}` : address, 95);

  const descriptionParts: string[] = [];
  if (price) descriptionParts.push(price);
  if (address) descriptionParts.push(address);
  if (bedsBaths) descriptionParts.push(bedsBaths);
  if (descSnippet) descriptionParts.push(descSnippet);
  if (agent.name) descriptionParts.push(`Listed by ${agent.name}`);
  const description = truncateMetaText(
    descriptionParts.length > 0 ? descriptionParts.join(" · ") : address,
    200,
  );

  const keywordParts = [address, listing.city, listing.state, price, bedsBaths, formatLabel(listing.propertyType)]
    .filter(Boolean)
    .map(String);
  const keywords = [...new Set(keywordParts)].join(", ");

  const imageUrl = pickPrimaryPhotoUrl(listing.photos);

  return { title, description, imageUrl, shareUrl, keywords };
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
    tags.push(`<meta property="og:image:alt" content="${escapeHtml(meta.title)}" />`);
    tags.push(`<meta name="twitter:card" content="summary_large_image" />`);
    tags.push(`<meta name="twitter:image" content="${escapeHtml(meta.imageUrl)}" />`);
  } else {
    tags.push(`<meta name="twitter:card" content="summary" />`);
  }

  return tags.join("\n  ");
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

function renderMapQr(qrDataUrl: string): string {
  return `<div class="map-qr" aria-hidden="true">
    <img src="${escapeHtml(qrDataUrl)}" alt="" width="96" height="96" />
  </div>`;
}

function buildMapSection(listing: PublicListingFlyerListing, qrDataUrl: string): string {
  const googleUrl = buildGoogleMapsUrl(listing);
  const mapsBtn = googleUrl
    ? `<a class="btn btn-outline map-btn" href="${escapeHtml(googleUrl)}" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>`
    : "";
  const qr = qrDataUrl ? renderMapQr(qrDataUrl) : "";
  const lat = listing.latitude;
  const lng = listing.longitude;
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    const pad = 0.012;
    const bbox = `${lng - pad},${lat - pad},${lng + pad},${lat + pad}`;
    const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`;
    return `<section class="map-section">
      <h2>Location</h2>
      <div class="map-row">
        <div class="map-main">
          <iframe class="map-embed" title="Property location map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${escapeHtml(embed)}"></iframe>
          ${mapsBtn}
        </div>
        ${qr}
      </div>
    </section>`;
  }
  const address = buildFullAddress(listing);
  if (!address && !mapsBtn && !qr) return "";
  return `<section class="map-section">
    <h2>Location</h2>
    <div class="map-row">
      <div class="map-main">
        ${address ? `<p class="map-address">${escapeHtml(address)}</p>` : ""}
        ${mapsBtn}
      </div>
      ${qr}
    </div>
  </section>`;
}

function renderDetailItem(label: string, value: string | null): string {
  if (!value) return "";
  return `<div class="detail-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function renderFlyerHeader(listingLabel: "FOR SALE" | "FOR RENT"): string {
  return `<header class="flyer-header">
      <div class="header-left"><p class="listing-label">${escapeHtml(listingLabel)}</p></div>
      <div class="header-right no-print">
        <button type="button" class="icon-btn" id="btn-share" aria-label="Share listing">${SHARE_ICON_SVG}</button>
        <button type="button" class="icon-btn" id="btn-print" aria-label="Print flyer">${PRINT_ICON_SVG}</button>
      </div>
    </header>`;
}

function formatBedsBathsSummary(beds: number | null, baths: number | null): string | null {
  const parts: string[] = [];
  if (beds != null) {
    parts.push(`${beds % 1 === 0 ? beds : beds.toFixed(1)} bd`);
  }
  if (baths != null) {
    parts.push(`${baths % 1 === 0 ? baths : baths.toFixed(1)} ba`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function renderKeyStats(
  price: string,
  beds: number | null,
  baths: number | null,
  sqft: string | null,
  hoa: string | null,
): string {
  const items: string[] = [`<span class="key-stat key-price">${escapeHtml(price)}</span>`];
  const bedsBaths = formatBedsBathsSummary(beds, baths);
  if (bedsBaths) items.push(`<span class="key-stat">${escapeHtml(bedsBaths)}</span>`);
  if (sqft) items.push(`<span class="key-stat">${escapeHtml(sqft)}</span>`);
  if (hoa) items.push(`<span class="key-stat">${escapeHtml(hoa)}</span>`);
  return `<div class="key-stats">${items.join("")}</div>`;
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

function renderGallery(photos: { url: string; order: number }[]): string {
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
    <div class="hero-wrap">
      <img id="hero-img" class="hero-img" src="${escapeHtml(hero)}" alt="Property photo" />
      ${nav}
    </div>
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
        `<a class="btn agent-cta-secondary" href="${escapeHtml(contactHref)}">Contact agent</a>`,
      );
    }
  } else if (contactHref) {
    buttons.push(
      `<a class="btn btn-primary agent-cta" href="${escapeHtml(contactHref)}">Contact agent</a>`,
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
  if (agent.brokerageName) lines.push(`<p class="agent-brokerage">${escapeHtml(agent.brokerageName)}</p>`);
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

  return `<aside class="agent-card">
    <div class="agent-brand-row">
      ${avatar}
      ${companyLogo}
    </div>
    <div class="agent-body">
      ${lines.join("")}
      ${renderAgentActions(agent, listing)}
    </div>
  </aside>`;
}

function renderPoweredByFooter(): string {
  return `<footer class="site-footer">
    <a class="powered-by" href="${WHACHATCRM_HOME_URL}" target="_blank" rel="noopener noreferrer">
      <span class="powered-logo">${WHACHAT_W_LOGO_SVG}</span>
      <span>Powered by WhachatCRM</span>
    </a>
  </footer>`;
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
  };
}

export function buildPublicListingFlyerHtml(input: PublicListingFlyerInput): string {
  const { listing, agent, shareUrl, qrDataUrl, companyLogoUrl = null } = input;
  const photos = parsePhotos(listing.photos);
  const address = buildFullAddress(listing);
  const headline = address || [listing.city, listing.state].filter(Boolean).join(", ") || "Property Listing";
  const openGraph = buildListingOpenGraphMeta({ listing, agent, shareUrl });
  const listingLabel = resolveFlyerListingLabel(listing);
  const price = formatListingPriceForComposer(listing.priceCents) || "Price on request";
  const sqft = resolveDisplaySquareFeet(listing);
  const hoa = resolveDisplayHoaFee(listing);
  const yearBuilt = formatYearBuilt(listing.yearBuilt);
  const propertyType = formatLabel(listing.propertyType);
  const propertySubtype = listing.propertySubtype ? formatLabel(listing.propertySubtype) : null;
  const details = listing.listingDetails;
  const description = (listing.description || "").trim();
  const parkingGarage = details.parkingGarage || null;

  const detailGrid = [
    renderDetailItem("Year built", yearBuilt),
    renderDetailItem("Property type", propertyType),
    renderDetailItem("Property subtype", propertySubtype),
    renderDetailItem("MLS / Listing ID", listing.providerListingId || null),
    renderDetailItem("Parking", parkingGarage),
    renderDetailItem("Garage", parkingGarage),
    renderDetailItem("Waterfront", formatYesNo(details.waterfront)),
    renderDetailItem("Pool", formatYesNo(details.pool)),
    renderDetailItem("View", details.view || null),
  ]
    .filter(Boolean)
    .join("");

  const featuresHtml =
    listing.features.length > 0
      ? `<section class="features-section">
      <h2>Features &amp; amenities</h2>
      <ul class="features-list">${listing.features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
    </section>`
      : "";

  const descHtml = description
    ? `<section class="description-section">
      <h2>Description</h2>
      <p class="description">${escapeHtml(description)}</p>
    </section>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${escapeHtml(openGraph.description)}" />
  <meta name="keywords" content="${escapeHtml(openGraph.keywords)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${escapeHtml(shareUrl)}" />
  <title>${escapeHtml(openGraph.title)}</title>
  ${renderListingOpenGraphTags(openGraph)}
  <style>
    :root {
      --accent: #4f46e5;
      --accent-dark: #4338ca;
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
    .flyer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
      background: #fff;
    }
    .header-left { display: flex; align-items: center; min-width: 0; }
    .listing-label {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: var(--ink);
      line-height: 1.1;
    }
    .header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
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
    .btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    .btn-primary:hover { background: var(--accent-dark); border-color: var(--accent-dark); }
    .btn-outline { background: #fff; border-color: var(--border); color: var(--ink); }
    .btn-outline:hover { border-color: #cbd5e1; background: #f8fafc; }
    .flyer-body { padding: 0 20px 20px; }
    .gallery { margin: 0 -20px 12px; }
    .hero-wrap { position: relative; background: #e2e8f0; }
    .hero-img { display: block; width: 100%; max-height: 420px; object-fit: cover; }
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
    .thumb.active { border-color: var(--accent); }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .headline { padding: 6px 0 14px; border-bottom: 1px solid var(--border); margin-bottom: 14px; }
    .headline h1 { margin: 0; font-size: 1.375rem; line-height: 1.3; font-weight: 700; }
    .layout { display: flex; flex-direction: column; gap: 16px; }
    .layout-page1 { display: grid; gap: 16px; align-items: start; }
    @media (min-width: 768px) {
      .layout-page1 { grid-template-columns: minmax(0, 1fr) minmax(220px, 28%); }
      .side-col { position: sticky; top: 12px; }
    }
    .key-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      align-items: baseline;
      margin-bottom: 14px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--border);
    }
    .key-stat { font-size: 0.9375rem; font-weight: 500; color: #334155; }
    .key-stat.key-price { font-size: 1.5rem; font-weight: 700; color: var(--ink); width: 100%; }
    h2 { font-size: 0.8125rem; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 600; }
    .details-section { margin-bottom: 14px; }
    .details-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px 16px; margin-bottom: 14px; }
    .detail-item dt { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin: 0 0 2px; }
    .detail-item dd { margin: 0; font-weight: 500; font-size: 0.9375rem; }
    .description { white-space: pre-wrap; margin: 0; color: #334155; }
    .features-list { margin: 0; padding-left: 1.2rem; columns: 2; column-gap: 24px; }
    .features-list li { margin-bottom: 6px; break-inside: avoid; }
    .map-section { margin-top: 6px; }
    .map-row { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
    .map-main { flex: 1 1 220px; min-width: 0; }
    .map-embed { width: 100%; height: 220px; border: 1px solid var(--border); border-radius: 10px; display: block; margin-bottom: 10px; }
    .map-address { margin: 0 0 10px; color: #334155; }
    .map-btn { margin-top: 2px; }
    .map-qr { flex: 0 0 auto; padding: 6px; border: 1px solid var(--border); border-radius: 8px; background: #fff; }
    .map-qr img { display: block; width: 96px; height: 96px; }
    .agent-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 8px;
      padding: 14px 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 1px 3px rgba(15,23,42,0.06);
    }
    .agent-brand-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
      width: 100%;
    }
    .agent-company-logo {
      max-height: 44px;
      max-width: 120px;
      width: auto;
      object-fit: contain;
    }
    .agent-avatar {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
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
    .agent-name { margin: 0 0 2px; font-weight: 700; font-size: 0.9375rem; }
    .agent-brokerage { margin: 0 0 6px; color: var(--muted); font-size: 0.8125rem; }
    .agent-contact { margin: 0 0 3px; font-size: 0.8125rem; }
    .agent-contact a { color: var(--ink); text-decoration: none; }
    .agent-contact a:hover { text-decoration: underline; }
    .agent-body { width: 100%; }
    .agent-actions { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
    .agent-cta, .agent-cta-secondary { width: 100%; text-align: center; font-size: 0.8125rem; padding: 8px 12px; }
    .description-section, .features-section { margin-bottom: 14px; }
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
    @media print {
      body { background: #fff; font-size: 11pt; }
      .no-print { display: none !important; }
      .flyer { max-width: none; box-shadow: none; }
      .flyer-header { padding: 8px 12px; border-bottom: 1px solid #ddd; }
      .listing-label { font-size: 1.125rem; }
      .flyer-body { padding: 0 12px 10px; }
      .gallery { margin: 0 0 10px; }
      .hero-img { max-height: 220px; }
      .thumbs, .gallery-nav { display: none; }
      .headline { margin-bottom: 8px; padding-bottom: 6px; }
      .headline h1 { font-size: 1.125rem; }
      .layout-page1 {
        display: grid;
        grid-template-columns: 1fr 155px;
        gap: 10px 12px;
        align-items: end;
      }
      .key-stats { margin-bottom: 10px; padding-bottom: 10px; gap: 6px 12px; }
      .key-stat.key-price { font-size: 1.25rem; width: auto; }
      .key-stat { font-size: 0.8125rem; }
      .side-col { align-self: end; }
      .agent-card { break-inside: avoid; page-break-inside: avoid; padding: 8px 6px; box-shadow: none; gap: 6px; }
      .agent-avatar { width: 48px; height: 48px; font-size: 1rem; }
      .agent-company-logo { max-height: 32px; max-width: 90px; }
      .agent-name { font-size: 0.8125rem; }
      .agent-brokerage, .agent-contact { font-size: 0.6875rem; }
      .agent-actions { flex-direction: column; gap: 4px; margin-top: 6px; }
      .agent-cta, .agent-cta-secondary { width: 100%; padding: 5px 6px; font-size: 0.625rem; line-height: 1.2; }
      .details-grid { gap: 6px 10px; margin-bottom: 8px; }
      .map-section { page-break-before: always; break-before: page; margin-top: 0; padding-top: 8px; }
      .map-embed { height: 160px; }
      .map-qr img { width: 80px; height: 80px; }
      .description-section, .features-section { margin-bottom: 8px; }
      .features-list { columns: 2; }
      a { color: inherit; text-decoration: none; }
    }
    @media (max-width: 480px) {
      .features-list { columns: 1; }
      .gallery-nav { width: 34px; height: 34px; }
    }
  </style>
</head>
<body>
  <div class="flyer">
    ${renderFlyerHeader(listingLabel)}
    <div class="flyer-body">
      ${renderGallery(photos)}
      <div class="headline">
        <h1>${escapeHtml(headline)}</h1>
      </div>
      <div class="layout">
        <div class="layout-page1">
          <div class="main-col">
            ${renderKeyStats(price, listing.beds, listing.baths, sqft, hoa)}
            <section class="details-section">
              <h2>Property details</h2>
              <dl class="details-grid">${detailGrid}</dl>
            </section>
            ${descHtml}
            ${featuresHtml}
          </div>
          <div class="side-col">
            ${renderAgentCard(agent, listing, companyLogoUrl)}
          </div>
        </div>
        ${buildMapSection(listing, qrDataUrl)}
      </div>
      ${renderPoweredByFooter()}
    </div>
  </div>
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
  <title>${escapeHtml(title)}</title>
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
