/**
 * Resolve public website URL from prospect metadata — never invent.
 * Official business sites preferred; social URLs are not crawl targets.
 */

import type { Contact } from "@shared/schema";
import { assertSafePublicHttpUrl } from "../websiteKnowledgeScraper";
import {
  classifyProspectWebsiteUrl,
  collectSocialProfileUrls,
  normalizeWebsiteCandidate,
  pickOfficialWebsiteUrl,
} from "@shared/prospectWebsiteClassification";

function rawWebsiteCandidates(contact: Contact): string[] {
  const sd = (contact.sourceDetails || {}) as Record<string, unknown>;
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  const pai = (sd.prospectAi || cf.prospectAi || sd.prospectImport || cf.prospectImport) as
    | Record<string, unknown>
    | undefined;
  const enrichment = (sd.prospectEnrichment || cf.prospectEnrichment) as
    | Record<string, unknown>
    | undefined;
  const notesMatch = String(contact.notes || "").match(/https?:\/\/[^\s]+/gi) || [];
  return [
    String(pai?.website || "").trim(),
    String(cf.website || "").trim(),
    String(sd.website || "").trim(),
    String(enrichment?.websiteUrl || "").trim(),
    ...notesMatch,
  ].filter(Boolean);
}

function safeHref(raw: string): string | null {
  try {
    const withProto = raw.startsWith("http") ? raw : `https://${raw}`;
    return assertSafePublicHttpUrl(withProto).href;
  } catch {
    const normalized = normalizeWebsiteCandidate(raw);
    return normalized;
  }
}

/** Official business website only — used for enrichment crawling. */
export function resolveProspectOfficialWebsiteUrl(contact: Contact): string | null {
  const candidates = rawWebsiteCandidates(contact)
    .map((c) => safeHref(c))
    .filter(Boolean) as string[];
  return pickOfficialWebsiteUrl(candidates);
}

/** Social profile URLs preserved from prospect metadata. */
export function resolveProspectSocialProfileUrls(contact: Contact): string[] {
  const candidates = rawWebsiteCandidates(contact)
    .map((c) => safeHref(c))
    .filter(Boolean) as string[];
  const sd = (contact.sourceDetails || {}) as Record<string, unknown>;
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  const enrichment = (sd.prospectEnrichment || cf.prospectEnrichment) as
    | { publicContacts?: { socialProfiles?: string[] } }
    | undefined;
  const fromEnrichment = enrichment?.publicContacts?.socialProfiles || [];
  return collectSocialProfileUrls([...candidates, ...fromEnrichment]);
}

/**
 * Best display/crawl candidate.
 * Prefers official website; falls back to social only when no official URL exists
 * (callers that crawl must use resolveProspectOfficialWebsiteUrl instead).
 */
export function resolveProspectWebsiteUrl(contact: Contact): string | null {
  const official = resolveProspectOfficialWebsiteUrl(contact);
  if (official) return official;
  const social = resolveProspectSocialProfileUrls(contact);
  return social[0] || null;
}

export function prospectWebsiteUrlKind(
  contact: Contact,
): "none" | "official" | "social" {
  if (resolveProspectOfficialWebsiteUrl(contact)) return "official";
  if (resolveProspectSocialProfileUrls(contact).length) return "social";
  const display = resolveProspectWebsiteUrl(contact);
  if (!display) return "none";
  return classifyProspectWebsiteUrl(display) === "social" ? "social" : "official";
}

/** True when customFields/sourceDetails mark website as manually edited. */
export function isProspectWebsiteManuallySet(contact: Contact): boolean {
  const sd = (contact.sourceDetails || {}) as Record<string, unknown>;
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  const pai = (sd.prospectAi || cf.prospectAi || {}) as Record<string, unknown>;
  return pai.websiteManual === true || cf.websiteManual === true || sd.websiteManual === true;
}
