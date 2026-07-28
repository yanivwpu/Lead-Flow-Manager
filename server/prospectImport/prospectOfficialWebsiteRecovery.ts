/**
 * Controlled official-website recovery when only a social URL (or none) is known.
 * Does not call Google Places / discovery quota.
 * May fetch a known social profile once to extract an external website link.
 */

import type { Contact } from "@shared/schema";
import {
  classifyProspectWebsiteUrl,
  normalizeWebsiteCandidate,
  websiteMatchesBusinessSignals,
} from "@shared/prospectWebsiteClassification";
import { fetchPublicHtmlPage } from "../websiteKnowledgeScraper";
import {
  isProspectWebsiteManuallySet,
  resolveProspectOfficialWebsiteUrl,
  resolveProspectSocialProfileUrls,
} from "./prospectWebsiteUrl";

const EXTERNAL_HREF_RE =
  /href=["'](https?:\/\/[^"']+)["']/gi;

function phoneDigits(raw: string | null | undefined): string {
  return String(raw || "").replace(/\D/g, "");
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1]!.replace(/\s+/g, " ").trim().slice(0, 200) : "";
}

function extractExternalWebsiteCandidates(html: string, socialOrigin: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  EXTERNAL_HREF_RE.lastIndex = 0;
  while ((m = EXTERNAL_HREF_RE.exec(html)) !== null) {
    const href = normalizeWebsiteCandidate(m[1]);
    if (!href) continue;
    if (classifyProspectWebsiteUrl(href) !== "official") continue;
    try {
      const host = new URL(href).hostname.toLowerCase();
      const socialHost = new URL(socialOrigin).hostname.toLowerCase();
      if (host === socialHost || host.endsWith(".facebook.com") || host.endsWith(".meta.com")) {
        continue;
      }
    } catch {
      continue;
    }
    const key = href.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(href);
    if (out.length >= 8) break;
  }
  return out;
}

export type OfficialWebsiteRecoveryResult = {
  websiteUrl: string | null;
  socialProfiles: string[];
  recovered: boolean;
  reason:
    | "already_official"
    | "manual_preserved"
    | "recovered_from_social"
    | "social_only"
    | "none";
};

/**
 * Resolve an official crawl target without Places / discovery.
 * Never overwrites a manually edited website.
 */
export async function recoverOfficialWebsiteForEnrichment(
  contact: Contact,
): Promise<OfficialWebsiteRecoveryResult> {
  const socialProfiles = resolveProspectSocialProfileUrls(contact);
  const official = resolveProspectOfficialWebsiteUrl(contact);

  if (isProspectWebsiteManuallySet(contact) && official) {
    return {
      websiteUrl: official,
      socialProfiles,
      recovered: false,
      reason: "manual_preserved",
    };
  }

  if (official) {
    return {
      websiteUrl: official,
      socialProfiles,
      recovered: false,
      reason: "already_official",
    };
  }

  if (!socialProfiles.length) {
    return { websiteUrl: null, socialProfiles: [], recovered: false, reason: "none" };
  }

  const socialUrl = socialProfiles[0]!;
  try {
    const { finalUrl, html } = await fetchPublicHtmlPage(socialUrl);
    const candidates = extractExternalWebsiteCandidates(html, finalUrl || socialUrl);
    const name = contact.name;
    const phone = phoneDigits(contact.phone);

    for (const candidate of candidates) {
      // Cheap validation: fetch candidate homepage title/snippet once.
      try {
        const page = await fetchPublicHtmlPage(candidate);
        const title = extractTitle(page.html || "");
        const match = websiteMatchesBusinessSignals({
          websiteUrl: candidate,
          businessName: name,
          pageTitle: title,
          phoneDigits: phone,
          pageText: (page.html || "").slice(0, 40_000),
        });
        if (match.ok && (match.confidence === "high" || match.confidence === "medium")) {
          return {
            websiteUrl: candidate,
            socialProfiles,
            recovered: true,
            reason: "recovered_from_social",
          };
        }
      } catch {
        // Candidate unreachable — try next
      }
    }
  } catch {
    // Social page unreachable — keep social-only
  }

  return {
    websiteUrl: null,
    socialProfiles,
    recovered: false,
    reason: "social_only",
  };
}
