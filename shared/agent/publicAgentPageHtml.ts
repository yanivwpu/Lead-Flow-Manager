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
    @media (min-width: 640px) { .agent-header { grid-template-columns: auto 1fr; align-items: start; } }
    .agent-avatar { width: 96px; height: 96px; border-radius: 50%; object-fit: cover; border: 3px solid #f1f5f9; }
    .agent-avatar.placeholder { display: flex; align-items: center; justify-content: center; background: #e2e8f0; font-size: 2rem; font-weight: 700; color: #475569; }
    .agent-logo { max-height: 40px; max-width: 140px; object-fit: contain; margin-top: 8px; }
    .agent-name { margin: 0 0 4px; font-size: 1.75rem; font-weight: 800; }
    .agent-brokerage { margin: 0 0 12px; color: var(--muted); font-size: 1rem; }
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
    .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .chip { padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border); background: #fff; font-size: 0.8125rem; font-weight: 600; cursor: pointer; color: #475569; }
    .chip.active { background: var(--brand); border-color: var(--brand); color: #fff; }
    .browse-filters { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); margin-bottom: 16px; padding: 14px; background: #fff; border: 1px solid var(--border); border-radius: 12px; }
    .browse-filters label { display: flex; flex-direction: column; gap: 4px; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
    .browse-filters input, .browse-filters select { padding: 7px 9px; border: 1px solid var(--border); border-radius: 8px; font: inherit; font-size: 0.8125rem; color: var(--ink); background: #fff; min-width: 0; }
    .browse-filters .listing-type-row { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .browse-filters .listing-type-row > span { font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin-right: 4px; }
    .browse-empty { grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--muted); font-size: 0.875rem; display: none; }
    .browse-empty.show { display: block; }
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
    .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--ink); color: #fff; padding: 10px 16px; border-radius: 8px; font-size: 0.875rem; opacity: 0; pointer-events: none; transition: opacity 0.2s; z-index: 200; }
    .toast.show { opacity: 1; }
    .site-footer { margin-top: 32px; text-align: center; font-size: 0.75rem; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="agent-header">
      <div>${renderAvatar(data)}${renderLogo(data)}</div>
      <div>
        <h1 class="agent-name">${escapeHtml(data.displayName)}</h1>
        ${data.brokerageName ? `<p class="agent-brokerage">${escapeHtml(data.brokerageName)}</p>` : ""}
        ${bioHtml}
        ${marketHtml}
        <div class="cta-row">
          <button type="button" class="btn btn-primary" id="btn-message">Message Me</button>
          ${data.schedulingUrl ? `<a class="btn btn-outline" id="btn-schedule-header" href="${escapeHtml(data.schedulingUrl)}" target="_blank" rel="noopener">Schedule Showing</a>` : `<button type="button" class="btn btn-outline" id="btn-schedule-header">Schedule Showing</button>`}
          ${homeWorthBtn}
        </div>
      </div>
    </header>

    <section>
      <h2 class="section-title">Listings</h2>
      <div class="browse-filters" id="browse-filters">
        <div class="listing-type-row">
          <span>Type</span>
          <button type="button" class="chip active" data-filter="all">All</button>
          <button type="button" class="chip" data-filter="sale">For Sale</button>
          <button type="button" class="chip" data-filter="rent">For Rent</button>
          <button type="button" class="chip" data-filter="coming_soon">Coming Soon</button>
        </div>
        <label>Min price
          <input type="number" id="filter-min-price" min="0" step="1000" placeholder="Any" inputmode="numeric" />
        </label>
        <label>Max price
          <input type="number" id="filter-max-price" min="0" step="1000" placeholder="Any" inputmode="numeric" />
        </label>
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
  <div class="toast" id="toast" role="status"></div>

  <script type="application/json" id="page-config">${JSON.stringify({
    slug,
    userId: data.userId,
    schedulingUrl: data.schedulingUrl,
    widgetEnabled: data.widgetEnabled,
    preferredLeadCapture: data.preferredLeadCapture,
    publicEmail: data.publicEmail,
    publicPhone: data.publicPhone,
    chatUrl: `/chat/${data.userId}?prefill=${encodeURIComponent("Hi, I'd like to connect with you about real estate.")}`,
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

      document.getElementById("btn-message").addEventListener("click", function () {
        if (config.widgetEnabled) {
          window.open(config.chatUrl, "_blank", "noopener");
          return;
        }
        if (config.preferredLeadCapture === "email" && config.publicEmail) {
          window.location.href = "mailto:" + encodeURIComponent(config.publicEmail);
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

      ["filter-min-price", "filter-max-price", "filter-beds", "filter-baths", "filter-min-sqft", "filter-property-type", "filter-sort"].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("change", applyBrowseFilters);
        el.addEventListener("input", applyBrowseFilters);
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
