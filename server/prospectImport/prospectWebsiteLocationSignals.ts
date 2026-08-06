/**
 * Location signals from a prospect contact — used to prioritize matching location pages.
 * Never invents city/address; only reads stored metadata.
 */

import type { Contact } from "@shared/schema";

export type ProspectLocationSignals = {
  city: string | null;
  address: string | null;
  postalCode: string | null;
  phoneDigits: string | null;
  businessName: string | null;
  /** Lowercased tokens useful for path/HTML matching (city words, street tokens). */
  matchTokens: string[];
};

function digitsOnly(raw: string | null | undefined): string | null {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length < 7) return null;
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

function tokenize(raw: string): string[] {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !["the", "and", "for", "llc", "inc", "street", "avenue", "blvd"].includes(t));
}

/** Read city / address / phone from contact + prospectAi metadata. */
export function readProspectLocationSignals(contact: Contact): ProspectLocationSignals {
  const sd = (contact.sourceDetails || {}) as Record<string, unknown>;
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  const pai = (sd.prospectAi || cf.prospectAi || sd.prospectImport || cf.prospectImport || {}) as Record<
    string,
    unknown
  >;

  const city =
    String(cf.city || sd.city || pai.city || pai.location || "").trim() || null;
  const address =
    String(
      cf.address ||
        sd.address ||
        pai.address ||
        pai.formattedAddress ||
        pai.vicinity ||
        "",
    ).trim() || null;
  const postalCode =
    String(cf.postalCode || cf.zip || sd.postalCode || pai.postalCode || pai.zip || "").trim() ||
    null;
  const phoneDigits = digitsOnly(contact.phone || String(pai.phone || ""));
  const businessName = String(contact.name || pai.companyName || "").trim() || null;

  const matchTokens = unique([
    ...tokenize(city || ""),
    ...tokenize(address || ""),
    ...tokenize(postalCode || ""),
    ...tokenize(businessName || ""),
  ]);

  return { city, address, postalCode, phoneDigits, businessName, matchTokens };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * Score how well a URL + page HTML matches the prospect's location.
 * Higher = better candidate for the email beside that location's address/phone.
 */
export function scoreLocationPageMatch(
  signals: ProspectLocationSignals,
  pageUrl: string,
  html?: string | null,
): { score: number; evidence: string[] } {
  const evidence: string[] = [];
  let score = 0;
  const path = (() => {
    try {
      return new URL(pageUrl).pathname.toLowerCase();
    } catch {
      return pageUrl.toLowerCase();
    }
  })();
  const blob = `${path}\n${String(html || "").toLowerCase()}`;

  if (signals.city) {
    const citySlug = signals.city.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const cityLoose = signals.city.toLowerCase();
    if (citySlug && path.replace(/[^a-z0-9]+/g, "").includes(citySlug)) {
      score += 80;
      evidence.push(`path_matches_city:${signals.city}`);
    } else if (blob.includes(cityLoose)) {
      score += 45;
      evidence.push(`page_mentions_city:${signals.city}`);
    }
  }

  if (signals.postalCode && blob.includes(signals.postalCode.toLowerCase())) {
    score += 35;
    evidence.push(`postal:${signals.postalCode}`);
  }

  if (signals.phoneDigits) {
    const compactHtml = blob.replace(/\D/g, "");
    if (compactHtml.includes(signals.phoneDigits)) {
      score += 50;
      evidence.push("phone_match");
    }
  }

  if (signals.address) {
    const streetToken = tokenize(signals.address)[0];
    if (streetToken && blob.includes(streetToken)) {
      score += 25;
      evidence.push(`street_token:${streetToken}`);
    }
  }

  for (const token of signals.matchTokens.slice(0, 6)) {
    if (path.includes(token)) {
      score += 8;
      evidence.push(`path_token:${token}`);
    }
  }

  return { score, evidence: unique(evidence) };
}
