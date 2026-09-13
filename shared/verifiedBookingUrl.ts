/**
 * Workspace-selected Calendly scheduling URLs for Book a demo.
 * Website-scanned /contact booking_link facts must not override this URL.
 */

import type { KnowledgeFact } from "./businessKnowledgeFacts";
import { factFreshness, factPrecedence } from "./businessKnowledgeFacts";
import type { RetrievedFact } from "./knowledgeRetrieval";

const CALENDLY_HOSTS = new Set(["calendly.com", "www.calendly.com"]);

export function isTrustedCalendlySchedulingUrl(raw: string | null | undefined): boolean {
  const value = (raw || "").trim();
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (!CALENDLY_HOSTS.has(host)) return false;
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.length >= 2 && parts.every((p) => /^[a-z0-9][a-z0-9_-]{0,80}$/i.test(p));
  } catch {
    return false;
  }
}

export function normalizeSchedulingUrlForCompare(raw: string | null | undefined): string {
  const value = (raw || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.protocol = "https:";
    return url.href.replace(/\/+$/, "").toLowerCase();
  } catch {
    return value.toLowerCase().replace(/\/+$/, "");
  }
}

export function extractHttpUrls(text: string): string[] {
  return (text.match(/https?:\/\/[^\s<>"'）)]+/gi) || []).map((u) => u.replace(/[.,;:]+$/, ""));
}

export function draftContainsVerifiedBookingUrl(draft: string, url: string): boolean {
  if (!isTrustedCalendlySchedulingUrl(url)) return false;
  const raw = (draft || "").toLowerCase();
  if (raw.includes(url.toLowerCase())) return true;
  const expected = normalizeSchedulingUrlForCompare(url);
  return extractHttpUrls(draft).some((found) => normalizeSchedulingUrlForCompare(found) === expected);
}

/** Append the verified URL when the model omitted it. Never invents or rewrites the URL. */
export function ensureVerifiedBookingUrlInDraft(draft: string, url: string): string {
  const text = (draft || "").trim();
  if (!isTrustedCalendlySchedulingUrl(url)) return text;
  if (draftContainsVerifiedBookingUrl(text, url)) {
    return replaceUntrustedBookingUrls(text, url);
  }
  return text ? `${text}\n${url}` : url;
}

export function replaceUntrustedBookingUrls(draft: string, verifiedUrl: string): string {
  if (!isTrustedCalendlySchedulingUrl(verifiedUrl)) return draft;
  const expected = normalizeSchedulingUrlForCompare(verifiedUrl);
  let next = draft;
  for (const found of extractHttpUrls(draft)) {
    if (!/calendly\.com/i.test(found)) continue;
    if (normalizeSchedulingUrlForCompare(found) === expected) continue;
    next = next.split(found).join(verifiedUrl);
  }
  return next;
}

export function verifiedBookingLinkRetrievedFact(url: string, now = new Date()): RetrievedFact {
  const fact = {
    id: "verified-workspace-calendly",
    userId: "",
    sourceId: null,
    factKey: "booking_link:workspace_selected",
    state: "published" as const,
    proposedAction: null,
    origin: "user" as const,
    confidence: 1,
    isPinned: true,
    userEdited: true,
    conflictGroup: null,
    conflictResolution: null,
    supersededByFactId: null,
    sourceUrl: url,
    sourceTitle: "Workspace-selected Calendly",
    excerpt: null,
    provenance: [],
    firstSeenAt: now.toISOString(),
    lastVerifiedAt: now.toISOString(),
    publishedAt: now.toISOString(),
    retiredAt: null,
    factType: "booking_link" as const,
    data: { url, label: "Book a demo" },
  } as KnowledgeFact;
  return {
    fact,
    freshness: factFreshness(fact, now),
    precedence: factPrecedence(fact),
    relevanceRank: 0,
    lexicalOverlap: 0,
  };
}

/**
 * For Book a demo, the only required next-step fact is the workspace Calendly URL.
 * Scanned /contact booking links must not remain required.
 */
export function replaceRetrievedBookingWithVerifiedUrl(
  retrieved: RetrievedFact[],
  verifiedUrl: string,
): RetrievedFact[] {
  const withoutBookingNext = retrieved.filter(
    (entry) => entry.fact.factType !== "booking_link" && entry.fact.factType !== "call_to_action",
  );
  if (!isTrustedCalendlySchedulingUrl(verifiedUrl)) return withoutBookingNext;
  return [...withoutBookingNext, verifiedBookingLinkRetrievedFact(verifiedUrl)];
}
