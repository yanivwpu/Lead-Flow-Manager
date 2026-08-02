/**
 * Guided Website Knowledge source slots (V1 transition).
 *
 * The saved source list is the source of truth for what gets scanned, so adding one
 * URL never drops the pages that were scanned before. Each entry maps 1:1 onto a row
 * in the forthcoming V2 `website_knowledge_sources` table.
 */

export type WebsiteKnowledgeSlotKey =
  | "homepage"
  | "productServices"
  | "about"
  | "faq"
  | "shippingPolicy"
  | "returnPolicy"
  | "terms"
  | "privacy"
  | "other";

export type WebsiteKnowledgeSlotDef = {
  key: WebsiteKnowledgeSlotKey;
  label: string;
  /** Field name on the scan request body. */
  bodyKey: string;
};

export const WEBSITE_KNOWLEDGE_SLOTS: readonly WebsiteKnowledgeSlotDef[] = [
  { key: "homepage", label: "Homepage", bodyKey: "homepageUrl" },
  { key: "productServices", label: "Product / Services", bodyKey: "productServicesUrl" },
  { key: "about", label: "About", bodyKey: "aboutUrl" },
  { key: "faq", label: "FAQ", bodyKey: "faqUrl" },
  { key: "shippingPolicy", label: "Shipping policy", bodyKey: "shippingPolicyUrl" },
  { key: "returnPolicy", label: "Return policy", bodyKey: "returnPolicyUrl" },
  { key: "terms", label: "Terms", bodyKey: "termsUrl" },
  { key: "privacy", label: "Privacy policy", bodyKey: "privacyPolicyUrl" },
  { key: "other", label: "Other", bodyKey: "otherUrl" },
] as const;

export type WebsiteKnowledgeSourceEntry = {
  key: WebsiteKnowledgeSlotKey;
  label: string;
  /** Exactly what the user typed. */
  url: string;
  addedAt: string;
  lastStatus?: "scanned" | "skipped" | "failed";
  lastScannedAt?: string;
};

const SLOT_BY_KEY = new Map<string, WebsiteKnowledgeSlotDef>(
  WEBSITE_KNOWLEDGE_SLOTS.map((s) => [s.key, s]),
);

function isSlotKey(value: unknown): value is WebsiteKnowledgeSlotKey {
  return typeof value === "string" && SLOT_BY_KEY.has(value);
}

/** Loose comparison key so `HTTPS://Site.com/A#x` and `https://site.com/a` are one source. */
export function normalizeWebsiteKnowledgeUrl(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    u.hash = "";
    return u.href.toLowerCase().replace(/\/$/, "");
  } catch {
    return trimmed.toLowerCase().replace(/\/$/, "");
  }
}

export function parseWebsiteKnowledgeSources(value: unknown): WebsiteKnowledgeSourceEntry[] {
  if (!Array.isArray(value)) return [];
  const out: WebsiteKnowledgeSourceEntry[] = [];
  const seenKeys = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    if (!isSlotKey(o.key)) continue;
    const url = typeof o.url === "string" ? o.url.trim() : "";
    if (!url) continue;
    if (seenKeys.has(o.key)) continue;
    seenKeys.add(o.key);
    out.push({
      key: o.key,
      label: typeof o.label === "string" && o.label ? o.label : SLOT_BY_KEY.get(o.key)!.label,
      url,
      addedAt: typeof o.addedAt === "string" ? o.addedAt : new Date(0).toISOString(),
      lastStatus:
        o.lastStatus === "scanned" || o.lastStatus === "skipped" || o.lastStatus === "failed"
          ? o.lastStatus
          : undefined,
      lastScannedAt: typeof o.lastScannedAt === "string" ? o.lastScannedAt : undefined,
    });
  }
  return out;
}

/**
 * Legacy rows predate the source list and only stored a single homepage URL.
 * Recover it so the first scan after the upgrade is not a silent reset.
 */
export function sourcesFromLegacyRow(params: {
  websiteKnowledgeUrl?: string | null;
  websiteKnowledgeUpdatedAt?: Date | string | null;
}): WebsiteKnowledgeSourceEntry[] {
  const url = (params.websiteKnowledgeUrl || "").trim();
  if (!url) return [];
  const addedAt =
    params.websiteKnowledgeUpdatedAt instanceof Date
      ? params.websiteKnowledgeUpdatedAt.toISOString()
      : typeof params.websiteKnowledgeUpdatedAt === "string"
        ? params.websiteKnowledgeUpdatedAt
        : new Date(0).toISOString();
  return [{ key: "homepage", label: "Homepage", url, addedAt }];
}

export type MergeSourcesInput = {
  saved: WebsiteKnowledgeSourceEntry[];
  /** Slot values from the scan request. */
  incoming: Partial<Record<WebsiteKnowledgeSlotKey, string>>;
  /**
   * True when the client submitted every slot it knows about, so a blank slot is a
   * deliberate removal. Older clients omit this and blanks are treated as "unchanged".
   */
  incomingIsComplete: boolean;
  now?: Date;
};

/**
 * Saved sources win unless the user changed the slot. Blank slots only remove a source
 * when the client says it sent the complete set.
 */
export function mergeWebsiteKnowledgeSources({
  saved,
  incoming,
  incomingIsComplete,
  now = new Date(),
}: MergeSourcesInput): WebsiteKnowledgeSourceEntry[] {
  const savedByKey = new Map(saved.map((s) => [s.key, s]));
  const merged: WebsiteKnowledgeSourceEntry[] = [];
  const seenUrls = new Set<string>();

  for (const slot of WEBSITE_KNOWLEDGE_SLOTS) {
    const submitted = typeof incoming[slot.key] === "string" ? incoming[slot.key]!.trim() : "";
    const existing = savedByKey.get(slot.key);

    let url = "";
    let addedAt = existing?.addedAt ?? now.toISOString();
    if (submitted) {
      url = submitted;
      if (!existing || normalizeWebsiteKnowledgeUrl(existing.url) !== normalizeWebsiteKnowledgeUrl(submitted)) {
        addedAt = now.toISOString();
      }
    } else if (existing && !incomingIsComplete) {
      url = existing.url;
    }
    if (!url) continue;

    const normalized = normalizeWebsiteKnowledgeUrl(url);
    if (seenUrls.has(normalized)) continue;
    seenUrls.add(normalized);

    merged.push({
      key: slot.key,
      label: slot.label,
      url,
      addedAt,
      lastStatus: existing?.lastStatus,
      lastScannedAt: existing?.lastScannedAt,
    });
  }

  return merged;
}

/**
 * The workspace website URL may only come from a scanned Homepage. Scanning an
 * advertising, pricing, or FAQ page must never rewrite it, so anything else yields
 * null and the caller keeps the stored value.
 */
export function resolveCanonicalWebsiteUrl(
  pageResults: Array<{ key: string; status: string; finalUrl?: string }>,
): string | null {
  const homepage = pageResults.find((r) => r.key === "homepage" && r.status === "scanned");
  return homepage?.finalUrl ?? null;
}

/** Fold scan outcomes back onto the source list without dropping unscanned entries. */
export function applyScanResultsToSources(
  sources: WebsiteKnowledgeSourceEntry[],
  results: Array<{ key: string; status: "scanned" | "skipped" | "failed" }>,
  now = new Date(),
): WebsiteKnowledgeSourceEntry[] {
  const statusByKey = new Map(results.map((r) => [r.key, r.status]));
  return sources.map((s) => {
    const status = statusByKey.get(s.key);
    if (!status) return s;
    return {
      ...s,
      lastStatus: status,
      lastScannedAt: status === "scanned" ? now.toISOString() : s.lastScannedAt,
    };
  });
}
