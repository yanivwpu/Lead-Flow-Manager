/**
 * Bounded same-domain page discovery for Prospect email enrichment.
 * Prefers contact / location pages matching the prospect city/address.
 */

import {
  readProspectLocationSignals,
  scoreLocationPageMatch,
  type ProspectLocationSignals,
} from "./prospectWebsiteLocationSignals";
import type { Contact } from "@shared/schema";

/** Hard caps — cost-controlled crawl. */
export const PROSPECT_ENRICH_MAX_PAGES = 10;
export const PROSPECT_ENRICH_MAX_DISCOVERED = 8;
export const PROSPECT_ENRICH_MAX_COMBINED_TEXT = 90_000;

/** Guided paths tried on every official domain (order = default priority). */
export const PROSPECT_ENRICH_GUIDED_PATHS: Array<{ key: string; path: string }> = [
  { key: "home", path: "/" },
  { key: "contact", path: "/contact" },
  { key: "contact-us", path: "/contact-us" },
  { key: "locations", path: "/locations" },
  { key: "location", path: "/location" },
  { key: "about", path: "/about" },
  { key: "about-us", path: "/about-us" },
  { key: "reservations", path: "/reservations" },
  { key: "catering", path: "/catering" },
  { key: "events", path: "/events" },
  { key: "team", path: "/team" },
];

/**
 * Path / link text hints for same-host discovery from nav/footer.
 * Includes location pages and multi-location restaurant slugs.
 */
export const EMAIL_BEARING_PATH_HINT =
  /(?:^|\/)(?:contact(?:-us)?|get-in-touch|reach-us|about(?:-us)?|team|support|locations?|our-locations|find-us|stores?|branches?|offices?|reservations?|catering|events?|book(?:ing)?)(?:\/|$|\?)|(?:location|pompano|miami|beach|gables|kendall|downtown|midtown)/i;

const LINK_TEXT_HINT =
  /\b(contact|location|locations|about|catering|events|reservations?|find us|visit us|our stores)\b/i;

export type EnrichmentPageCandidate = {
  key: string;
  url: string;
  /** Higher = crawl sooner. */
  priority: number;
  locationScore: number;
  locationEvidence: string[];
};

export function buildGuidedEnrichmentUrls(homepage: string): EnrichmentPageCandidate[] {
  const base = new URL(homepage);
  const origin = `${base.protocol}//${base.host}`;
  const urls: EnrichmentPageCandidate[] = [];

  if (base.pathname && base.pathname !== "/") {
    urls.push({
      key: "listed",
      url: homepage,
      priority: 120,
      locationScore: 0,
      locationEvidence: [],
    });
  }

  for (const p of PROSPECT_ENRICH_GUIDED_PATHS) {
    const priority =
      p.key === "home"
        ? 100
        : p.key.startsWith("contact")
          ? 95
          : p.key.startsWith("location")
            ? 90
            : 70;
    urls.push({
      key: p.key,
      url: origin + p.path,
      priority,
      locationScore: 0,
      locationEvidence: [],
    });
  }

  return dedupeCandidates(urls);
}

/**
 * Discover same-origin email-bearing links from HTML (nav/footer).
 * Prefers hrefs whose path or anchor text suggests contact/location pages.
 */
export function discoverEmailBearingUrlsFromHtml(
  html: string,
  pageUrl: string,
  signals?: ProspectLocationSignals | null,
): EnrichmentPageCandidate[] {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }

  const found: EnrichmentPageCandidate[] = [];
  const seen = new Set<string>();

  // href="..." optionally with nearby text
  const hrefRe = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const raw = m[1].trim();
    const linkText = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) {
      continue;
    }
    let abs: URL;
    try {
      abs = new URL(raw, base);
    } catch {
      continue;
    }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
    if (abs.host !== base.host) continue;

    const pathOk = EMAIL_BEARING_PATH_HINT.test(abs.pathname);
    const textOk = LINK_TEXT_HINT.test(linkText);
    if (!pathOk && !textOk) continue;

    const key = abs.origin + abs.pathname.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const url = abs.origin + abs.pathname + abs.search;
    const loc = signals
      ? scoreLocationPageMatch(signals, url, `${abs.pathname} ${linkText}`)
      : { score: 0, evidence: [] as string[] };

    found.push({
      key: loc.score >= 40 ? "discovered_location" : "discovered_contact",
      url,
      priority: 60 + Math.min(loc.score, 80),
      locationScore: loc.score,
      locationEvidence: loc.evidence,
    });
    if (found.length >= PROSPECT_ENRICH_MAX_DISCOVERED) break;
  }

  // Also catch bare hrefs without relying on </a> pairing (footer icons)
  if (found.length < PROSPECT_ENRICH_MAX_DISCOVERED) {
    const bareRe = /href\s*=\s*["']([^"'#]+)["']/gi;
    while ((m = bareRe.exec(html)) !== null && found.length < PROSPECT_ENRICH_MAX_DISCOVERED) {
      const raw = m[1].trim();
      if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:")) continue;
      let abs: URL;
      try {
        abs = new URL(raw, base);
      } catch {
        continue;
      }
      if (abs.host !== base.host) continue;
      if (!EMAIL_BEARING_PATH_HINT.test(abs.pathname)) continue;
      const key = abs.origin + abs.pathname.replace(/\/$/, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const url = abs.origin + abs.pathname + abs.search;
      const loc = signals
        ? scoreLocationPageMatch(signals, url, abs.pathname)
        : { score: 0, evidence: [] as string[] };
      found.push({
        key: loc.score >= 40 ? "discovered_location" : "discovered_contact",
        url,
        priority: 55 + Math.min(loc.score, 80),
        locationScore: loc.score,
        locationEvidence: loc.evidence,
      });
    }
  }

  return found;
}

/** Build initial queue + optional city-specific guided slug guesses (bounded). */
export function buildEnrichmentPageQueue(params: {
  homepage: string;
  contact: Contact;
}): EnrichmentPageCandidate[] {
  const signals = readProspectLocationSignals(params.contact);
  const guided = buildGuidedEnrichmentUrls(params.homepage).map((c) => {
    const loc = scoreLocationPageMatch(signals, c.url, null);
    return {
      ...c,
      locationScore: loc.score,
      locationEvidence: loc.evidence,
      priority: c.priority + Math.min(loc.score, 40),
    };
  });

  // City slug guesses under /locations/{city} and concatenated brand+city paths (restaurants).
  const origin = new URL(params.homepage.startsWith("http") ? params.homepage : `https://${params.homepage}`);
  const originBase = `${origin.protocol}//${origin.host}`;
  if (signals.city) {
    const slug = signals.city
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const compact = signals.city.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (slug) {
      for (const path of [`/locations/${slug}`, `/locations/${slug}/`, `/location/${slug}`]) {
        guided.push({
          key: "guided_location_city",
          url: originBase + path,
          priority: 110,
          locationScore: 70,
          locationEvidence: [`guided_city_slug:${slug}`],
        });
      }
    }
    if (compact && compact.length >= 5) {
      // e.g. /aromasdelperupompano — brand slug + city, without duplicating city already in the name.
      let nameCompact = String(signals.businessName || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
      if (nameCompact.endsWith(compact) && nameCompact.length > compact.length) {
        nameCompact = nameCompact.slice(0, -compact.length);
      }
      // Also strip a shorter city stem (e.g. "pompano" inside "pompanobeach").
      const cityStem = compact.length > 6 ? compact.slice(0, Math.min(8, compact.length)) : compact;
      if (cityStem.length >= 5 && nameCompact.includes(cityStem)) {
        nameCompact = nameCompact.replace(new RegExp(`${cityStem}[a-z]*$`), "");
      }
      if (nameCompact.length >= 6) {
        const brandCity = `${nameCompact}${compact}`;
        guided.push({
          key: "guided_brand_city",
          url: `${originBase}/${brandCity}`,
          priority: 115,
          locationScore: 85,
          locationEvidence: [`guided_brand_city:${brandCity}`],
        });
        // Common restaurant pattern without "beach" suffix duplication
        if (compact.endsWith("beach") && compact.length > 5) {
          const shortCity = compact.replace(/beach$/, "");
          if (shortCity.length >= 5) {
            guided.push({
              key: "guided_brand_city_short",
              url: `${originBase}/${nameCompact}${shortCity}`,
              priority: 114,
              locationScore: 80,
              locationEvidence: [`guided_brand_city:${nameCompact}${shortCity}`],
            });
          }
        }
      }
    }
  }

  return sortCandidates(dedupeCandidates(guided));
}

export function mergeDiscoveredIntoQueue(
  queue: EnrichmentPageCandidate[],
  discovered: EnrichmentPageCandidate[],
): EnrichmentPageCandidate[] {
  return sortCandidates(dedupeCandidates([...queue, ...discovered]));
}

function dedupeCandidates(urls: EnrichmentPageCandidate[]): EnrichmentPageCandidate[] {
  const seen = new Set<string>();
  const out: EnrichmentPageCandidate[] = [];
  for (const u of urls) {
    const k = u.url.toLowerCase().replace(/\/$/, "");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(u);
  }
  return out;
}

function sortCandidates(urls: EnrichmentPageCandidate[]): EnrichmentPageCandidate[] {
  return [...urls].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.locationScore - a.locationScore;
  });
}

export function pageLooksJavaScriptHeavy(html: string, textLen: number): boolean {
  if (textLen < 120) return true;
  if (/__NEXT_DATA__|__NUXT__|window\.__INITIAL_STATE__|data-reactroot/i.test(html)) return true;
  if (/id=["']root["'][^>]*>\s*<\/div>/i.test(html) && textLen < 400) return true;
  return false;
}
