/**
 * Resolve a public website URL from prospect metadata — never invent.
 * Kept separate from the enrichment provider so unit tests avoid AI provider imports.
 */

import type { Contact } from "@shared/schema";
import { assertSafePublicHttpUrl } from "../websiteKnowledgeScraper";

export function resolveProspectWebsiteUrl(contact: Contact): string | null {
  const sd = (contact.sourceDetails || {}) as Record<string, unknown>;
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  const pai = (sd.prospectAi || cf.prospectAi || sd.prospectImport || cf.prospectImport) as
    | Record<string, unknown>
    | undefined;
  const candidates = [
    String(pai?.website || "").trim(),
    String(cf.website || "").trim(),
    String(sd.website || "").trim(),
    String(contact.notes || "").match(/https?:\/\/[^\s]+/i)?.[0] || "",
  ].filter(Boolean);

  for (const raw of candidates) {
    try {
      const withProto = raw.startsWith("http") ? raw : `https://${raw}`;
      return assertSafePublicHttpUrl(withProto).href;
    } catch {
      /* try next */
    }
  }
  return null;
}
