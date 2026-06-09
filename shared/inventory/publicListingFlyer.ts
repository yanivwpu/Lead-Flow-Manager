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
  /** Small brand mark, e.g. /favicon.svg — omitted when unavailable. */
  brandLogoUrl?: string | null;
};

const WHACHATCRM_HOME_URL = "https://whachatcrm.com";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  coming_soon: "Coming Soon",
  pending: "Pending",
  sold: "Sold",
  off_market: "Off Market",
  inactive: "Inactive",
};

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
  return `${sqft.toLocaleString("en-US")} sq ft`;
}

function formatHoaFee(cents: number | null): string | null {
  if (cents == null) return null;
  return `$${Math.round(cents / 100).toLocaleString("en-US")}/mo HOA`;
}

function formatYearBuilt(year: number | null): string | null {
  if (year == null || year < 1600) return null;
  return `Built ${year}`;
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

  const title = truncateMetaText(price ? `${price} · ${address}` : address, 95);

  const descriptionParts: string[] = [];
  if (price) descriptionParts.push(price);
  if (address) descriptionParts.push(address);
  if (bedsBaths) descriptionParts.push(bedsBaths);
  if (agent.name) descriptionParts.push(`Listed by ${agent.name}`);
  const description = truncateMetaText(
    descriptionParts.length > 0 ? descriptionParts.join(" · ") : address,
    200,
  );

  const imageUrl = pickPrimaryPhotoUrl(listing.photos);

  return { title, description, imageUrl, shareUrl };
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

function buildMapSection(listing: PublicListingFlyerListing): string {
  const lat = listing.latitude;
  const lng = listing.longitude;
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    const pad = 0.012;
    const bbox = `${lng - pad},${lat - pad},${lng + pad},${lat + pad}`;
    const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`;
    return `<section class="map-section">
      <h2>Location</h2>
      <iframe class="map-embed" title="Property location map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${escapeHtml(embed)}"></iframe>
    </section>`;
  }
  const address = buildFullAddress(listing);
  if (!address) return "";
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return `<section class="map-section">
    <h2>Location</h2>
    <p><a class="map-link" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer">View on map</a></p>
  </section>`;
}

function renderDetailItem(label: string, value: string | null): string {
  if (!value) return "";
  return `<div class="detail-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function renderGallery(photos: { url: string; order: number }[]): string {
  if (photos.length === 0) return "";
  const hero = photos[0].url;
  const thumbs = photos
    .map(
      (p, idx) =>
        `<button type="button" class="thumb${idx === 0 ? " active" : ""}" data-url="${escapeHtml(p.url)}" aria-label="Photo ${idx + 1}">
          <img src="${escapeHtml(p.url)}" alt="" loading="lazy" />
        </button>`,
    )
    .join("");
  return `<section class="gallery">
    <div class="hero-wrap">
      <img id="hero-img" class="hero-img" src="${escapeHtml(hero)}" alt="Property photo" />
    </div>
    ${photos.length > 1 ? `<div class="thumbs" role="list">${thumbs}</div>` : ""}
  </section>`;
}

function renderAgentActions(agent: PublicListingFlyerAgent, listing: PublicListingFlyerListing): string {
  const bookingHref = isValidBookingLink(agent.bookingLink) ? agent.bookingLink.trim() : null;
  const contactHref = buildAgentContactHref(agent, listing);
  const buttons: string[] = [];

  if (bookingHref) {
    buttons.push(
      `<a class="btn btn-primary agent-cta" href="${escapeHtml(bookingHref)}" target="_blank" rel="noopener noreferrer">Book a showing</a>`,
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

function renderAgentCard(agent: PublicListingFlyerAgent, listing: PublicListingFlyerListing): string {
  const contactHref = buildAgentContactHref(agent, listing);
  const bookingHref = isValidBookingLink(agent.bookingLink) ? agent.bookingLink.trim() : null;
  const hasAgent =
    agent.name ||
    agent.brokerageName ||
    agent.phone ||
    agent.email ||
    agent.avatarUrl ||
    contactHref ||
    bookingHref;
  if (!hasAgent) return "";

  const avatar = agent.avatarUrl
    ? `<img class="agent-avatar" src="${escapeHtml(agent.avatarUrl)}" alt="" />`
    : `<div class="agent-avatar placeholder" aria-hidden="true">${escapeHtml((agent.name || agent.brokerageName || "A").charAt(0))}</div>`;

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
    ${avatar}
    <div class="agent-body">
      ${lines.join("")}
      ${renderAgentActions(agent, listing)}
    </div>
  </aside>`;
}

function renderPoweredByFooter(brandLogoUrl?: string | null): string {
  const logo =
    brandLogoUrl && /^\/\S+/.test(brandLogoUrl)
      ? `<img src="${escapeHtml(brandLogoUrl)}" alt="" class="powered-logo" width="16" height="16" />`
      : "";
  return `<footer class="site-footer">
    <a class="powered-by" href="${WHACHATCRM_HOME_URL}" target="_blank" rel="noopener noreferrer">
      ${logo}<span>Powered by WhachatCRM</span>
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
    priceCents: row.priceCents,
    beds: row.beds != null ? Number(row.beds) : null,
    baths: row.baths != null ? Number(row.baths) : null,
    squareFeet: row.squareFeet,
    yearBuilt: row.yearBuilt,
    hoaFeeCents: row.hoaFeeCents,
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
  const { listing, agent, shareUrl, qrDataUrl, brandLogoUrl = "/favicon.svg" } = input;
  const photos = parsePhotos(listing.photos);
  const address = buildFullAddress(listing);
  const title = address || [listing.city, listing.state].filter(Boolean).join(", ") || "Property Listing";
  const openGraph = buildListingOpenGraphMeta({ listing, agent, shareUrl });
  const price = formatListingPriceForComposer(listing.priceCents) || "Price on request";
  const bedsBaths = formatBedsBathsForComposer(listing.beds, listing.baths);
  const sqft = formatSquareFeet(listing.squareFeet);
  const hoa = formatHoaFee(listing.hoaFeeCents);
  const yearBuilt = formatYearBuilt(listing.yearBuilt);
  const propertyType = formatLabel(listing.propertyType);
  const propertySubtype = listing.propertySubtype ? formatLabel(listing.propertySubtype) : null;
  const status = STATUS_LABELS[listing.status] || formatLabel(listing.status);
  const details = listing.listingDetails;
  const description = (listing.description || "").trim();

  const highlights = [bedsBaths, sqft, yearBuilt, propertyType].filter(Boolean) as string[];

  const detailGrid = [
    renderDetailItem("Price", price),
    renderDetailItem("Bedrooms / Baths", bedsBaths),
    renderDetailItem("Square footage", sqft),
    renderDetailItem("Property type", propertyType),
    renderDetailItem("Property subtype", propertySubtype),
    renderDetailItem("Year built", yearBuilt),
    renderDetailItem("HOA fee", hoa),
    renderDetailItem("Address", address || null),
    renderDetailItem("Status", status || null),
    renderDetailItem("MLS / Listing ID", listing.providerListingId || null),
    renderDetailItem("Parking / garage", details.parkingGarage || null),
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
  <title>${escapeHtml(openGraph.title)}</title>
  ${renderListingOpenGraphTags(openGraph)}
  <style>
    :root {
      --brand: #25D366;
      --brand-dark: #1da851;
      --ink: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --surface: #ffffff;
      --bg: #f1f5f9;
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
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      background: linear-gradient(180deg, #fff 0%, #f8fafc 100%);
    }
    .brand { font-weight: 700; font-size: 0.95rem; color: var(--brand-dark); letter-spacing: 0.02em; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      border: 1px solid var(--border);
      background: #fff;
      color: var(--ink);
    }
    .btn:hover { border-color: #cbd5e1; }
    .btn-primary { background: var(--brand); border-color: var(--brand); color: #fff; }
    .btn-primary:hover { background: var(--brand-dark); border-color: var(--brand-dark); }
    .flyer-body { padding: 0 20px 32px; }
    .gallery { margin: 0 -20px 20px; }
    .hero-wrap { background: #e2e8f0; }
    .hero-img { display: block; width: 100%; max-height: 480px; object-fit: cover; }
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
    .thumb.active { border-color: var(--brand); }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .headline { padding-top: 8px; }
    .headline h1 { margin: 0 0 6px; font-size: 1.5rem; line-height: 1.25; }
    .price-line { font-size: 1.35rem; font-weight: 700; color: var(--brand-dark); margin: 0 0 8px; }
    .highlights { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 20px; padding: 0; list-style: none; }
    .highlights li {
      background: #f1f5f9;
      color: var(--muted);
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.8125rem;
      font-weight: 500;
    }
    .layout { display: grid; gap: 24px; }
    @media (min-width: 768px) {
      .layout { grid-template-columns: 1fr 280px; align-items: start; }
    }
    h2 { font-size: 1rem; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    .details-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px 20px; margin-bottom: 24px; }
    .detail-item dt { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin: 0 0 2px; }
    .detail-item dd { margin: 0; font-weight: 500; font-size: 0.9375rem; }
    .description { white-space: pre-wrap; margin: 0; color: #334155; }
    .features-list { margin: 0; padding-left: 1.2rem; columns: 2; column-gap: 24px; }
    .features-list li { margin-bottom: 6px; break-inside: avoid; }
    .map-section { margin-top: 8px; }
    .map-embed { width: 100%; height: 260px; border: 1px solid var(--border); border-radius: 10px; }
    .map-link { color: var(--brand-dark); font-weight: 600; }
    .agent-card {
      display: flex;
      gap: 14px;
      padding: 16px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: #f8fafc;
    }
    .agent-avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }
    .agent-avatar.placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--brand);
      color: #fff;
      font-weight: 700;
      font-size: 1.25rem;
    }
    .agent-name { margin: 0 0 2px; font-weight: 700; font-size: 1rem; }
    .agent-brokerage { margin: 0 0 8px; color: var(--muted); font-size: 0.875rem; }
    .agent-contact { margin: 0 0 4px; font-size: 0.875rem; }
    .agent-contact a { color: var(--ink); text-decoration: none; }
    .agent-contact a:hover { text-decoration: underline; }
    .agent-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
    .agent-cta, .agent-cta-secondary { width: 100%; text-align: center; }
    .agent-cta-secondary { background: #fff; }
    .qr-footer {
      margin-top: 32px;
      padding: 20px;
      border-top: 1px dashed var(--border);
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      justify-content: center;
      text-align: center;
    }
    .qr-footer img { width: 120px; height: 120px; }
    .qr-label { margin: 0; font-size: 0.875rem; color: var(--muted); max-width: 220px; }
    .site-footer {
      padding: 14px 20px 20px;
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
    .powered-logo { display: block; flex-shrink: 0; opacity: 0.9; }
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
      body { background: #fff; }
      .no-print { display: none !important; }
      .flyer { max-width: none; box-shadow: none; }
      .gallery { margin: 0 0 16px; }
      .hero-img { max-height: 320px; }
      .thumbs { display: none; }
      .map-embed { height: 200px; }
      .agent-card { break-inside: avoid; }
      .qr-footer { break-inside: avoid; page-break-inside: avoid; }
      a { color: inherit; text-decoration: none; }
    }
    @media (max-width: 480px) {
      .features-list { columns: 1; }
      .flyer-header { flex-direction: column; align-items: stretch; }
      .actions { justify-content: stretch; }
      .actions .btn { flex: 1; }
    }
  </style>
</head>
<body>
  <div class="flyer">
    <header class="flyer-header no-print">
      <span class="brand">WhaChatCRM Listing</span>
      <div class="actions">
        <button type="button" class="btn" id="btn-print">Print Flyer</button>
        <button type="button" class="btn" id="btn-share">Share Listing</button>
      </div>
    </header>
    <div class="flyer-body">
      ${renderGallery(photos)}
      <div class="headline">
        <h1>${escapeHtml(title)}</h1>
        <p class="price-line">${escapeHtml(price)}</p>
        ${highlights.length > 0 ? `<ul class="highlights">${highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>` : ""}
      </div>
      <div class="layout">
        <div class="main-col">
          <section class="details-section">
            <h2>Property details</h2>
            <dl class="details-grid">${detailGrid}</dl>
          </section>
          ${descHtml}
          ${featuresHtml}
          ${buildMapSection(listing)}
        </div>
        <div class="side-col">
          ${renderAgentCard(agent, listing)}
        </div>
      </div>
      <footer class="qr-footer">
        <img src="${escapeHtml(qrDataUrl)}" alt="QR code for listing URL" width="120" height="120" />
        <p class="qr-label">Scan to view live listing.<br /><span class="no-print">${escapeHtml(shareUrl)}</span></p>
      </footer>
      ${renderPoweredByFooter(brandLogoUrl)}
    </div>
  </div>
  <div id="toast" class="toast no-print" role="status" aria-live="polite">Listing link copied.</div>
  <script>
    (function () {
      var hero = document.getElementById("hero-img");
      document.querySelectorAll(".thumb").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!hero) return;
          hero.src = btn.getAttribute("data-url") || "";
          document.querySelectorAll(".thumb").forEach(function (t) { t.classList.remove("active"); });
          btn.classList.add("active");
        });
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
