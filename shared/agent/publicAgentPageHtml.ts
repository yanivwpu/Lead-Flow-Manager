import type { PublicAgentPageRenderInput, AgentPageListingCard } from "./agentPageTypes";
import { normalizePropertyTypeForFilter } from "./publicAgentPageBrowse";

const BRAND_GREEN = "#059669";
const BRAND_GREEN_DARK = "#047857";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderAvatar(data: PublicAgentPageRenderInput): string {
  if (data.avatarUrl) {
    return `<img class="agent-avatar" src="${escapeHtml(data.avatarUrl)}" alt="" />`;
  }
  const initial = escapeHtml(data.displayName.charAt(0).toUpperCase() || "A");
  return `<div class="agent-avatar placeholder">${initial}</div>`;
}

function renderLogo(data: PublicAgentPageRenderInput): string {
  if (!data.companyLogo) return "";
  return `<img class="agent-logo" src="${escapeHtml(data.companyLogo)}" alt="" />`;
}

const SOCIAL_ICON_SVG = {
  website:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/></svg>',
  facebook:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 22v-8h2.7l.4-3.1h-3.1V9.1c0-.9.2-1.5 1.5-1.5H17V4.8c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H8.2v3.1h2.6v8h2.7z"/></svg>',
  instagram:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  linkedin:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.5 8.5h3v11h-3v-11zm1.5-5a1.75 1.75 0 110 3.5 1.75 1.75 0 010-3.5zM10 8.5h2.9v1.5h.1c.4-.8 1.4-1.7 2.9-1.7 3.1 0 3.7 2 3.7 4.6V19.5h-3v-5.2c0-1.2 0-2.8-1.7-2.8-1.7 0-2 1.3-2 2.7v5.3h-3V8.5z"/></svg>',
  youtube:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 7.2a2.5 2.5 0 00-1.8-1.8C18 5 12 5 12 5s-6 0-7.8.4A2.5 2.5 0 002.4 7.2 26 26 0 002 12a26 26 0 00.4 4.8 2.5 2.5 0 001.8 1.8C6 19 12 19 12 19s6 0 7.8-.4a2.5 2.5 0 001.8-1.8A26 26 0 0022 12a26 26 0 00-.4-4.8zM10 15.5v-7l6 3.5-6 3.5z"/></svg>',
} as const;

function renderBrokerageBlock(data: PublicAgentPageRenderInput): string {
  const logo = renderLogo(data);
  const name = data.brokerageName
    ? `<p class="agent-brokerage-name">${escapeHtml(data.brokerageName)}</p>`
    : "";
  if (!logo && !name) return "";
  return `<div class="agent-brokerage-block">${logo}${name}</div>`;
}

function renderSocialLinks(data: PublicAgentPageRenderInput): string {
  const { socialLinks } = data;
  const items: string[] = [];
  const add = (url: string, label: string, icon: keyof typeof SOCIAL_ICON_SVG) => {
    if (!url) return;
    items.push(
      `<a class="agent-social-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(label)}">${SOCIAL_ICON_SVG[icon]}</a>`,
    );
  };
  add(socialLinks.websiteUrl, "Website", "website");
  add(socialLinks.facebookUrl, "Facebook", "facebook");
  add(socialLinks.instagramUrl, "Instagram", "instagram");
  add(socialLinks.linkedinUrl, "LinkedIn", "linkedin");
  add(socialLinks.youtubeUrl, "YouTube", "youtube");
  if (items.length === 0) return "";
  return `<div class="agent-social">${items.join("")}</div>`;
}

function renderProfileColumn(data: PublicAgentPageRenderInput): string {
  return `<div class="agent-profile-col">${renderAvatar(data)}${renderBrokerageBlock(data)}${renderSocialLinks(data)}</div>`;
}

function listingCardHtml(card: AgentPageListingCard, index: number): string {
  const addressLine = card.street
    ? `<p class="card-address">${escapeHtml(card.street)}</p>`
    : "";
  const meta = [card.beds, card.baths, card.sqft].filter(Boolean).join(" · ");
  const img = card.imageUrl
    ? `<img src="${escapeHtml(card.imageUrl)}" alt="" loading="lazy" />`
    : `<div class="card-img-placeholder">No photo</div>`;
  const propertyType = normalizePropertyTypeForFilter(card.propertyType);

  return `<article class="listing-card" data-id="${escapeHtml(card.id)}" data-label="${escapeHtml(card.listingLabel)}" data-status="${escapeHtml(card.status)}" data-sort-index="${index}" data-price-cents="${card.priceCents ?? ""}" data-beds="${card.bedsNum ?? ""}" data-baths="${card.bathsNum ?? ""}" data-sqft="${card.sqftNum ?? ""}" data-property-type="${escapeHtml(propertyType)}">
    <a class="card-img-link" href="${escapeHtml(card.shareUrl)}" data-action="listing_view">${img}</a>
    <div class="card-body">
      <div class="card-top">
        <span class="card-price">${escapeHtml(card.price)}</span>
        <span class="card-status">${escapeHtml(card.status)}</span>
      </div>
      ${addressLine}
      <p class="card-city">${escapeHtml(card.cityState)}</p>
      ${meta ? `<p class="card-meta">${escapeHtml(meta)}</p>` : ""}
      <div class="card-actions">
        <a class="btn btn-sm btn-primary" href="${escapeHtml(card.shareUrl)}" data-action="listing_view">View Listing</a>
        <button type="button" class="btn btn-sm btn-outline" data-action="ask_about" data-listing-id="${escapeHtml(card.id)}">Ask About This</button>
        <button type="button" class="btn btn-sm btn-outline" data-action="schedule" data-listing-id="${escapeHtml(card.id)}">Schedule Showing</button>
        <div class="share-wrap">
          <button type="button" class="btn btn-sm btn-ghost" data-action="share-toggle">Share ▾</button>
          <div class="share-menu" hidden>
            <button type="button" data-share="copy" data-url="${escapeHtml(card.shareUrl)}">Copy Link</button>
            <a data-share="whatsapp" href="https://wa.me/?text=${encodeURIComponent(card.shareUrl)}" target="_blank" rel="noopener">WhatsApp</a>
            <a data-share="email" href="mailto:?subject=${encodeURIComponent("Listing")}&body=${encodeURIComponent(card.shareUrl)}">Email</a>
            <a data-share="flyer" href="${escapeHtml(card.shareUrl)}" target="_blank" rel="noopener">QR / Flyer</a>
          </div>
        </div>
      </div>
    </div>
  </article>`;
}

export function buildPublicAgentPageNotFoundHtml(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Agent not found</title></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:4rem"><h1>Page not found</h1><p>This agent page is not available.</p></body></html>`;
}

export function buildPublicAgentPageHtml(data: PublicAgentPageRenderInput): string {
  const listingsJson = JSON.stringify(data.listings).replace(/</g, "\\u003c");
  const slug = data.agentPageSlug || "";
  const bioHtml = data.bio
    ? `<p class="agent-bio">${escapeHtml(data.bio)}</p>`
    : "";
  const marketHtml = data.marketArea
    ? `<p class="agent-market"><strong>Market area:</strong> ${escapeHtml(data.marketArea)}</p>`
    : "";
  const homeWorthBtn = data.showHomeValueCta
    ? `<button type="button" class="btn btn-outline" id="btn-home-worth">What's My Home Worth?</button>`
    : "";

  const primaryContactLabel =
    data.preferredLeadCapture === "email"
      ? "Email agent"
      : data.preferredLeadCapture === "phone"
        ? "Call agent"
        : data.widgetEnabled
          ? "Open chat"
          : "Send a message";

  const cards = data.listings.map((listing, index) => listingCardHtml(listing, index)).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(data.displayName)} | Real Estate Agent</title>
  <style>
    :root { --brand: ${BRAND_GREEN}; --brand-dark: ${BRAND_GREEN_DARK}; --ink: #0f172a; --muted: #64748b; --border: #e2e8f0; --bg: #f8fafc; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: var(--bg); color: var(--ink); line-height: 1.5; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 20px 16px 48px; }
    .agent-header { display: grid; gap: 20px; background: #fff; border: 1px solid var(--border); border-radius: 16px; padding: 24px; margin-bottom: 24px; }
    @media (min-width: 640px) { .agent-header { grid-template-columns: auto 1fr; align-items: start; gap: 24px; } }
    .agent-profile-col { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
    @media (min-width: 640px) { .agent-profile-col { align-items: flex-start; text-align: left; } }
    .agent-avatar { width: 96px; height: 96px; border-radius: 50%; object-fit: cover; border: 3px solid #f1f5f9; flex-shrink: 0; }
    @media (min-width: 640px) { .agent-avatar { width: 120px; height: 120px; } }
    .agent-avatar.placeholder { display: flex; align-items: center; justify-content: center; background: #e2e8f0; font-size: 2rem; font-weight: 700; color: #475569; }
    @media (min-width: 640px) { .agent-avatar.placeholder { font-size: 2.25rem; } }
    .agent-brokerage-block { display: flex; flex-direction: column; align-items: center; gap: 6px; max-width: 140px; }
    @media (min-width: 640px) { .agent-brokerage-block { align-items: flex-start; } }
    .agent-logo { max-height: 36px; max-width: 120px; object-fit: contain; }
    .agent-brokerage-name { margin: 0; color: var(--muted); font-size: 0.8125rem; font-weight: 600; line-height: 1.3; }
    .agent-social { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 2px; }
    @media (min-width: 640px) { .agent-social { justify-content: flex-start; } }
    .agent-social-link { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); background: #fff; text-decoration: none; transition: border-color 0.15s, color 0.15s; }
    .agent-social-link:hover { border-color: #cbd5e1; color: var(--brand); }
    .agent-social-link svg { width: 16px; height: 16px; display: block; }
    .agent-name { margin: 0 0 4px; font-size: 1.75rem; font-weight: 800; }
    .agent-bio, .agent-market { margin: 0 0 10px; color: #334155; font-size: 0.9375rem; }
    .cta-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 10px 16px; border-radius: 8px; font-size: 0.875rem; font-weight: 600; text-decoration: none; cursor: pointer; border: 1px solid transparent; background: #fff; color: var(--ink); }
    .btn-primary { background: var(--brand); border-color: var(--brand); color: #fff; }
    .btn-primary:hover { background: var(--brand-dark); }
    .btn-outline { border-color: var(--border); }
    .btn-outline:hover { border-color: #cbd5e1; background: #f8fafc; }
    .btn-ghost { background: transparent; border-color: transparent; color: var(--muted); padding: 6px 10px; }
    .btn-sm { padding: 7px 12px; font-size: 0.8125rem; }
    .section-title { margin: 0 0 12px; font-size: 1.25rem; font-weight: 700; }
    .chip { padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border); background: #fff; font-size: 0.8125rem; font-weight: 600; cursor: pointer; color: #475569; }
    .chip.active { background: var(--brand); border-color: var(--brand); color: #fff; }
    .browse-wrap { margin-bottom: 12px; }
    .browse-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 10px; }
    .listing-type-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; flex: 1; min-width: 0; }
    .listing-type-row > span { font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin-right: 2px; }
    .browse-toggle-btn { flex-shrink: 0; }
    .browse-toggle-btn .toggle-label-mobile { display: none; }
    .browse-basic-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; margin-bottom: 0; }
    .browse-basic-row label { display: flex; flex-direction: column; gap: 4px; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); min-width: 120px; flex: 1; max-width: 180px; }
    .browse-basic-row input { padding: 7px 9px; border: 1px solid var(--border); border-radius: 8px; font: inherit; font-size: 0.8125rem; color: var(--ink); background: #fff; min-width: 0; width: 100%; }
    .browse-panel-backdrop { display: none; position: fixed; inset: 0; background: rgba(15,23,42,0.4); z-index: 85; }
    .browse-panel-backdrop.open { display: block; }
    .browse-panel { margin-bottom: 12px; padding: 12px; background: #fff; border: 1px solid var(--border); border-radius: 12px; }
    .browse-panel[hidden] { display: none !important; }
    .browse-panel-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
    .browse-panel-grid label { display: flex; flex-direction: column; gap: 4px; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
    .browse-panel-grid input, .browse-panel-grid select { padding: 7px 9px; border: 1px solid var(--border); border-radius: 8px; font: inherit; font-size: 0.8125rem; color: var(--ink); background: #fff; min-width: 0; width: 100%; }
    .browse-panel-mobile-prices { display: none; }
    .browse-panel-actions { display: none; margin-top: 12px; justify-content: flex-end; gap: 8px; }
    .browse-empty { padding: 24px; text-align: center; color: var(--muted); font-size: 0.875rem; display: none; margin-bottom: 12px; }
    .browse-empty.show { display: block; }
    @media (max-width: 639px) {
      .browse-basic-row { display: none; }
      .browse-toggle-btn .toggle-label-desktop { display: none; }
      .browse-toggle-btn .toggle-label-mobile { display: inline; }
      .browse-panel-mobile-prices { display: contents; }
      .browse-panel { position: fixed; left: 0; right: 0; bottom: 0; z-index: 90; max-height: min(85vh, 520px); overflow-y: auto; margin: 0; border-radius: 16px 16px 0 0; box-shadow: 0 -8px 32px rgba(15,23,42,0.12); padding: 16px 16px 20px; }
      .browse-panel-actions { display: flex; }
      .browse-panel-title { display: block; font-size: 1rem; font-weight: 700; margin: 0 0 12px; }
    }
    @media (min-width: 640px) {
      .browse-panel-title { display: none; }
      .browse-panel-backdrop { display: none !important; }
    }
    .listings-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
    .listing-card { background: #fff; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
    .listing-card[hidden] { display: none !important; }
    .card-img-link { display: block; aspect-ratio: 4/3; background: #e2e8f0; overflow: hidden; }
    .card-img-link img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .card-img-placeholder { height: 100%; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 0.875rem; }
    .card-body { padding: 14px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
    .card-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .card-price { font-size: 1.125rem; font-weight: 700; color: var(--brand); }
    .card-status { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; }
    .card-address { margin: 0; font-weight: 600; font-size: 0.9375rem; }
    .card-city, .card-meta { margin: 0; font-size: 0.8125rem; color: var(--muted); }
    .card-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; padding-top: 10px; }
    .share-wrap { position: relative; }
    .share-menu { position: absolute; right: 0; top: 100%; z-index: 10; background: #fff; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 4px 16px rgba(15,23,42,0.1); min-width: 140px; padding: 4px; display: flex; flex-direction: column; }
    .share-menu button, .share-menu a { display: block; padding: 8px 12px; text-align: left; font-size: 0.8125rem; color: var(--ink); text-decoration: none; border: none; background: none; cursor: pointer; border-radius: 6px; }
    .share-menu button:hover, .share-menu a:hover { background: #f1f5f9; }
    .empty-listings { padding: 32px; text-align: center; color: var(--muted); background: #fff; border: 1px dashed var(--border); border-radius: 12px; }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.45); display: none; align-items: center; justify-content: center; z-index: 100; padding: 16px; }
    .modal-backdrop.open { display: flex; }
    .modal { background: #fff; border-radius: 12px; width: 100%; max-width: 420px; padding: 20px; box-shadow: 0 8px 32px rgba(15,23,42,0.15); }
    .modal h2 { margin: 0 0 12px; font-size: 1.125rem; }
    .modal label { display: block; font-size: 0.8125rem; font-weight: 600; margin: 10px 0 4px; }
    .modal input, .modal textarea, .modal select { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font: inherit; }
    .modal textarea { min-height: 80px; resize: vertical; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    .chat-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.45); display: none; align-items: center; justify-content: center; z-index: 110; padding: 16px; }
    .chat-backdrop.open { display: flex; }
    .chat-panel { background: #fff; border-radius: 12px; width: 100%; max-width: 420px; height: min(620px, calc(100vh - 32px)); box-shadow: 0 8px 32px rgba(15,23,42,0.15); display: flex; flex-direction: column; overflow: hidden; }
    .chat-panel-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 0.9375rem; }
    .chat-panel-close { border: none; background: transparent; font-size: 1.25rem; line-height: 1; cursor: pointer; color: var(--muted); padding: 4px 8px; border-radius: 6px; }
    .chat-panel-close:hover { background: #f1f5f9; color: var(--ink); }
    .chat-panel iframe { flex: 1; width: 100%; border: none; min-height: 0; }
    .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--ink); color: #fff; padding: 10px 16px; border-radius: 8px; font-size: 0.875rem; opacity: 0; pointer-events: none; transition: opacity 0.2s; z-index: 200; }
    .toast.show { opacity: 1; }
    .site-footer { margin-top: 32px; text-align: center; font-size: 0.75rem; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="agent-header">
      ${renderProfileColumn(data)}
      <div class="agent-info-col">
        <h1 class="agent-name">${escapeHtml(data.displayName)}</h1>
        ${bioHtml}
        ${marketHtml}
        <div class="cta-row">
          <button type="button" class="btn btn-primary" id="btn-message">${escapeHtml(primaryContactLabel)}</button>
          ${data.schedulingUrl ? `<a class="btn btn-outline" id="btn-schedule-header" href="${escapeHtml(data.schedulingUrl)}" target="_blank" rel="noopener">Schedule Showing</a>` : `<button type="button" class="btn btn-outline" id="btn-schedule-header">Schedule Showing</button>`}
          ${homeWorthBtn}
        </div>
      </div>
    </header>

    <section>
      <h2 class="section-title">Listings</h2>
      <div class="browse-wrap" id="browse-wrap">
        <div class="browse-head">
          <div class="listing-type-row">
            <span>Type</span>
            <button type="button" class="chip active" data-filter="all">All</button>
            <button type="button" class="chip" data-filter="sale">For Sale</button>
            <button type="button" class="chip" data-filter="rent">For Rent</button>
            <button type="button" class="chip" data-filter="coming_soon">Coming Soon</button>
          </div>
          <button type="button" class="btn btn-sm btn-outline browse-toggle-btn" id="btn-toggle-filters" aria-expanded="false" aria-controls="browse-panel">
            <span class="toggle-label-desktop">More Filters</span>
            <span class="toggle-label-mobile">Filters</span>
          </button>
        </div>
        <div class="browse-basic-row">
          <label>Min price
            <input type="number" id="filter-min-price" min="0" step="1000" placeholder="Any" inputmode="numeric" data-sync="filter-min-price-m" />
          </label>
          <label>Max price
            <input type="number" id="filter-max-price" min="0" step="1000" placeholder="Any" inputmode="numeric" data-sync="filter-max-price-m" />
          </label>
        </div>
      </div>
      <div class="browse-panel-backdrop" id="browse-panel-backdrop" aria-hidden="true"></div>
      <div class="browse-panel" id="browse-panel" hidden>
        <p class="browse-panel-title">Filters</p>
        <div class="browse-panel-grid">
          <div class="browse-panel-mobile-prices">
            <label>Min price
              <input type="number" id="filter-min-price-m" min="0" step="1000" placeholder="Any" inputmode="numeric" data-sync="filter-min-price" />
            </label>
            <label>Max price
              <input type="number" id="filter-max-price-m" min="0" step="1000" placeholder="Any" inputmode="numeric" data-sync="filter-max-price" />
            </label>
          </div>
          <label>Beds
            <select id="filter-beds">
              <option value="">Any</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
              <option value="5">5+</option>
            </select>
          </label>
          <label>Baths
            <select id="filter-baths">
              <option value="">Any</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
            </select>
          </label>
          <label>Property type
            <select id="filter-property-type">
              <option value="">All types</option>
              <option value="house">House</option>
              <option value="condo">Condo</option>
              <option value="townhouse">Townhouse</option>
              <option value="multi_family">Multi-family</option>
              <option value="land">Land</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>Min sq ft
            <input type="number" id="filter-min-sqft" min="0" step="100" placeholder="Any" inputmode="numeric" />
          </label>
          <label>Sort
            <select id="filter-sort">
              <option value="newest">Newest</option>
              <option value="price_desc">Price: high to low</option>
              <option value="price_asc">Price: low to high</option>
            </select>
          </label>
        </div>
        <div class="browse-panel-actions">
          <button type="button" class="btn btn-sm btn-outline" id="btn-filters-clear">Clear</button>
          <button type="button" class="btn btn-sm btn-primary" id="btn-filters-apply">Apply</button>
        </div>
      </div>
      <div class="browse-empty" id="browse-empty">No listings match your filters.</div>
      <div class="listings-grid" id="listings-grid">
        ${cards || '<div class="empty-listings">No published listings yet.</div>'}
      </div>
    </section>
    <footer class="site-footer">Powered by WhachatCRM</footer>
  </div>

  <div class="modal-backdrop" id="modal-backdrop" aria-hidden="true">
    <div class="modal" role="dialog" aria-modal="true">
      <h2 id="modal-title">Contact</h2>
      <form id="lead-form">
        <input type="hidden" name="intent" id="form-intent" value="message" />
        <input type="hidden" name="listingId" id="form-listing-id" value="" />
        <label>Name<input name="name" required /></label>
        <label>Email<input name="email" type="email" /></label>
        <label>Phone<input name="phone" type="tel" /></label>
        <div id="message-field"><label>Message<textarea name="message"></textarea></label></div>
        <div id="home-worth-fields" hidden>
          <label>Property address<input name="propertyAddress" /></label>
          <label>Timeline<input name="timeline" placeholder="e.g. 30–60 days" /></label>
          <label>Reason for selling<textarea name="reasonForSelling"></textarea></label>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Submit</button>
        </div>
      </form>
    </div>
  </div>
  <div class="chat-backdrop" id="chat-backdrop" aria-hidden="true">
    <div class="chat-panel" role="dialog" aria-modal="true" aria-label="Web chat">
      <div class="chat-panel-header">
        <span>Chat</span>
        <button type="button" class="chat-panel-close" id="chat-close" aria-label="Close chat">×</button>
      </div>
      <iframe id="chat-iframe" title="Web chat"></iframe>
    </div>
  </div>
  <div class="toast" id="toast" role="status"></div>

  <script type="application/json" id="page-config">${JSON.stringify({
    slug,
    userId: data.userId,
    schedulingUrl: data.schedulingUrl,
    widgetEnabled: data.widgetEnabled,
    preferredLeadCapture: data.preferredLeadCapture,
    publicEmail: data.publicEmail,
    publicPhone: data.publicPhone,
    chatPrefill: "Hi, I'd like to connect with you about real estate.",
  }).replace(/</g, "\\u003c")}</script>
  <script>
    (function () {
      var config = JSON.parse(document.getElementById("page-config").textContent || "{}");
      var backdrop = document.getElementById("modal-backdrop");
      var form = document.getElementById("lead-form");
      var toast = document.getElementById("toast");
      function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add("show");
        setTimeout(function () { toast.classList.remove("show"); }, 2600);
      }
      function track(event, listingId) {
        fetch("/api/public/agents/" + encodeURIComponent(config.slug) + "/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: event, listingId: listingId || undefined }),
        }).catch(function () {});
      }
      function openModal(intent, listingId) {
        document.getElementById("form-intent").value = intent;
        document.getElementById("form-listing-id").value = listingId || "";
        var title = { message: "Message Me", ask_about: "Ask About This Listing", schedule_showing: "Schedule Showing", home_worth: "What's My Home Worth?" };
        document.getElementById("modal-title").textContent = title[intent] || "Contact";
        document.getElementById("message-field").hidden = intent === "home_worth";
        document.getElementById("home-worth-fields").hidden = intent !== "home_worth";
        backdrop.classList.add("open");
      }
      function closeModal() { backdrop.classList.remove("open"); form.reset(); }
      document.getElementById("modal-cancel").addEventListener("click", closeModal);
      backdrop.addEventListener("click", function (e) { if (e.target === backdrop) closeModal(); });

      var chatBackdrop = document.getElementById("chat-backdrop");
      var chatIframe = document.getElementById("chat-iframe");
      function openChatModal() {
        if (!chatBackdrop || !chatIframe || !config.userId) {
          openModal("message");
          return;
        }
        var prefill = encodeURIComponent(config.chatPrefill || "");
        var parentUrl = encodeURIComponent(window.location.href);
        chatIframe.src = "/widget-frame/" + encodeURIComponent(config.userId)
          + "?prefill=" + prefill + "&parentUrl=" + parentUrl;
        chatBackdrop.classList.add("open");
      }
      function closeChatModal() {
        if (!chatBackdrop || !chatIframe) return;
        chatBackdrop.classList.remove("open");
        chatIframe.src = "about:blank";
      }
      var chatClose = document.getElementById("chat-close");
      if (chatClose) chatClose.addEventListener("click", closeChatModal);
      if (chatBackdrop) {
        chatBackdrop.addEventListener("click", function (e) {
          if (e.target === chatBackdrop) closeChatModal();
        });
      }

      document.getElementById("btn-message").addEventListener("click", function () {
        if (config.preferredLeadCapture === "webchat") {
          if (config.widgetEnabled) {
            openChatModal();
            return;
          }
          openModal("message");
          return;
        }
        if (config.preferredLeadCapture === "email" && config.publicEmail) {
          window.location.href = "mailto:" + config.publicEmail;
          return;
        }
        if (config.preferredLeadCapture === "phone" && config.publicPhone) {
          window.location.href = "tel:" + config.publicPhone.replace(/\\D/g, "");
          return;
        }
        openModal("message");
      });

      var scheduleHeader = document.getElementById("btn-schedule-header");
      if (scheduleHeader && scheduleHeader.tagName === "BUTTON") {
        scheduleHeader.addEventListener("click", function () {
          track("schedule_showing");
          if (config.schedulingUrl) window.open(config.schedulingUrl, "_blank", "noopener");
          else openModal("schedule_showing");
        });
      } else if (scheduleHeader) {
        scheduleHeader.addEventListener("click", function () { track("schedule_showing"); });
      }

      var homeWorth = document.getElementById("btn-home-worth");
      if (homeWorth) homeWorth.addEventListener("click", function () { track("home_value"); openModal("home_worth"); });

      var listingType = "all";
      var grid = document.getElementById("listings-grid");
      var emptyMsg = document.getElementById("browse-empty");
      var filterPanel = document.getElementById("browse-panel");
      var filterBackdrop = document.getElementById("browse-panel-backdrop");
      var toggleFiltersBtn = document.getElementById("btn-toggle-filters");

      function isMobileFilters() {
        return window.matchMedia("(max-width: 639px)").matches;
      }

      function syncPricePair(fromId, toId) {
        var from = document.getElementById(fromId);
        var to = document.getElementById(toId);
        if (from && to) to.value = from.value;
      }

      function syncAllPriceFields() {
        syncPricePair("filter-min-price", "filter-min-price-m");
        syncPricePair("filter-max-price", "filter-max-price-m");
      }

      function openFilterPanel() {
        syncAllPriceFields();
        if (filterPanel) filterPanel.hidden = false;
        if (toggleFiltersBtn) toggleFiltersBtn.setAttribute("aria-expanded", "true");
        if (filterBackdrop && isMobileFilters()) filterBackdrop.classList.add("open");
      }

      function closeFilterPanel() {
        if (filterPanel) filterPanel.hidden = true;
        if (toggleFiltersBtn) toggleFiltersBtn.setAttribute("aria-expanded", "false");
        if (filterBackdrop) filterBackdrop.classList.remove("open");
      }

      function toggleFilterPanel() {
        if (!filterPanel) return;
        if (filterPanel.hidden) openFilterPanel();
        else closeFilterPanel();
      }

      if (toggleFiltersBtn) toggleFiltersBtn.addEventListener("click", toggleFilterPanel);
      if (filterBackdrop) filterBackdrop.addEventListener("click", closeFilterPanel);

      document.querySelectorAll("[data-sync]").forEach(function (el) {
        function syncPartner() {
          var partnerId = el.getAttribute("data-sync");
          var partner = partnerId ? document.getElementById(partnerId) : null;
          if (partner) partner.value = el.value;
        }
        el.addEventListener("input", syncPartner);
        el.addEventListener("change", syncPartner);
      });

      var applyFiltersBtn = document.getElementById("btn-filters-apply");
      if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener("click", function () {
          syncAllPriceFields();
          applyBrowseFilters();
          closeFilterPanel();
        });
      }

      var clearFiltersBtn = document.getElementById("btn-filters-clear");
      if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener("click", function () {
          ["filter-min-price", "filter-min-price-m", "filter-max-price", "filter-max-price-m", "filter-min-sqft"].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.value = "";
          });
          ["filter-beds", "filter-baths", "filter-property-type", "filter-sort"].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.value = id === "filter-sort" ? "newest" : "";
          });
          applyBrowseFilters();
        });
      }

      function numVal(id) {
        var el = document.getElementById(id);
        if (!el || !el.value) return null;
        var n = Number(el.value);
        return isFinite(n) ? n : null;
      }

      function cardMatches(card) {
        var label = card.getAttribute("data-label");
        var status = card.getAttribute("data-status");
        var showType = listingType === "all"
          || (listingType === "coming_soon" && status === "Coming Soon")
          || (listingType === "rent" && label === "FOR RENT" && status !== "Coming Soon")
          || (listingType === "sale" && label === "FOR SALE" && status !== "Coming Soon");
        if (!showType) return false;

        var price = card.getAttribute("data-price-cents");
        var priceNum = price ? Number(price) : null;
        var minPrice = numVal("filter-min-price");
        var maxPrice = numVal("filter-max-price");
        if (minPrice != null && (priceNum == null || priceNum < minPrice)) return false;
        if (maxPrice != null && (priceNum == null || priceNum > maxPrice)) return false;

        var beds = card.getAttribute("data-beds");
        var bedsNum = beds ? Number(beds) : null;
        var minBeds = numVal("filter-beds");
        if (minBeds != null && (bedsNum == null || bedsNum < minBeds)) return false;

        var baths = card.getAttribute("data-baths");
        var bathsNum = baths ? Number(baths) : null;
        var minBaths = numVal("filter-baths");
        if (minBaths != null && (bathsNum == null || bathsNum < minBaths)) return false;

        var sqft = card.getAttribute("data-sqft");
        var sqftNum = sqft ? Number(sqft) : null;
        var minSqft = numVal("filter-min-sqft");
        if (minSqft != null && (sqftNum == null || sqftNum < minSqft)) return false;

        var propType = document.getElementById("filter-property-type");
        var wantedType = propType && propType.value ? propType.value : "";
        if (wantedType && card.getAttribute("data-property-type") !== wantedType) return false;

        return true;
      }

      function sortCards(cards) {
        var sortEl = document.getElementById("filter-sort");
        var sort = sortEl ? sortEl.value : "newest";
        return cards.sort(function (a, b) {
          if (sort === "newest") {
            return Number(a.getAttribute("data-sort-index")) - Number(b.getAttribute("data-sort-index"));
          }
          var pa = Number(a.getAttribute("data-price-cents")) || -1;
          var pb = Number(b.getAttribute("data-price-cents")) || -1;
          return sort === "price_desc" ? pb - pa : pa - pb;
        });
      }

      function applyBrowseFilters() {
        if (!grid) return;
        var cards = Array.prototype.slice.call(grid.querySelectorAll(".listing-card"));
        var visible = 0;
        cards.forEach(function (card) {
          var show = cardMatches(card);
          card.hidden = !show;
          if (show) visible += 1;
        });
        sortCards(cards.filter(function (c) { return !c.hidden; })).forEach(function (card) {
          grid.appendChild(card);
        });
        if (emptyMsg) emptyMsg.classList.toggle("show", cards.length > 0 && visible === 0);
      }

      document.querySelectorAll(".chip[data-filter]").forEach(function (chip) {
        chip.addEventListener("click", function () {
          document.querySelectorAll(".chip[data-filter]").forEach(function (c) { c.classList.remove("active"); });
          chip.classList.add("active");
          listingType = chip.getAttribute("data-filter") || "all";
          applyBrowseFilters();
        });
      });

      ["filter-min-price", "filter-max-price", "filter-min-price-m", "filter-max-price-m", "filter-beds", "filter-baths", "filter-min-sqft", "filter-property-type", "filter-sort"].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("change", function () {
          syncAllPriceFields();
          if (!isMobileFilters() || !filterPanel || filterPanel.hidden) applyBrowseFilters();
        });
        el.addEventListener("input", function () {
          syncAllPriceFields();
          if (!isMobileFilters()) applyBrowseFilters();
        });
      });

      document.getElementById("listings-grid").addEventListener("click", function (e) {
        var t = e.target.closest("[data-action]");
        if (!t) return;
        var action = t.getAttribute("data-action");
        var listingId = t.getAttribute("data-listing-id");
        if (action === "listing_view") track("listing_view", listingId);
        if (action === "ask_about") { track("ask_about", listingId); openModal("ask_about", listingId); e.preventDefault(); }
        if (action === "schedule") {
          track("schedule_showing", listingId);
          if (config.schedulingUrl) window.open(config.schedulingUrl, "_blank", "noopener");
          else openModal("schedule_showing", listingId);
          e.preventDefault();
        }
        if (action === "share-toggle") {
          var menu = t.parentElement.querySelector(".share-menu");
          if (menu) menu.hidden = !menu.hidden;
          e.preventDefault();
        }
        if (t.getAttribute("data-share") === "copy") {
          var url = t.getAttribute("data-url");
          navigator.clipboard.writeText(url).then(function () { showToast("Link copied"); });
          e.preventDefault();
        }
      });

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var fd = new FormData(form);
        var body = {
          intent: fd.get("intent"),
          name: fd.get("name"),
          email: fd.get("email") || undefined,
          phone: fd.get("phone") || undefined,
          message: fd.get("message") || undefined,
          listingId: fd.get("listingId") || undefined,
          propertyAddress: fd.get("propertyAddress") || undefined,
          timeline: fd.get("timeline") || undefined,
          reasonForSelling: fd.get("reasonForSelling") || undefined,
        };
        fetch("/api/public/agents/" + encodeURIComponent(config.slug) + "/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (res) {
            if (!res.ok) throw new Error(res.j.error || "Submit failed");
            closeModal();
            showToast("Thanks — we'll be in touch soon.");
          })
          .catch(function (err) { showToast(err.message || "Submit failed"); });
      });
    })();
  </script>
</body>
</html>`;
}
