/**
 * Prospect AI Review — discovery/import batch filter keys + labels.
 * Reuses existing discoverySearchId / importJobId linkage (no new storage).
 */

export type ProspectReviewBatchKind = "discovery" | "import";

export type ProspectReviewBatchRef =
  | { kind: "all" }
  | { kind: ProspectReviewBatchKind; id: string };

export type ProspectReviewBatchOption = {
  key: string;
  kind: ProspectReviewBatchKind;
  id: string;
  label: string;
  /** Short subtitle e.g. "50 km · 20 prospects" */
  detail?: string | null;
  prospectCount: number;
  createdAt: string | null;
  isLatestDiscovery?: boolean;
  businessType?: string | null;
  location?: string | null;
  radiusKm?: number | null;
  batchName?: string | null;
};

export function encodeProspectReviewBatchKey(kind: ProspectReviewBatchKind, id: string): string {
  const clean = String(id || "").trim();
  if (!clean) return "all";
  return `${kind}:${clean}`;
}

export function parseProspectReviewBatchKey(raw: string | null | undefined): ProspectReviewBatchRef {
  const s = String(raw || "").trim();
  if (!s || s === "all") return { kind: "all" };
  const discovery = /^discovery:(.+)$/i.exec(s);
  if (discovery?.[1]?.trim()) return { kind: "discovery", id: discovery[1].trim() };
  const imp = /^import:(.+)$/i.exec(s);
  if (imp?.[1]?.trim()) return { kind: "import", id: imp[1].trim() };
  // Bare UUID from send-to-review deep link — treat as discovery.
  if (/^[0-9a-f-]{36}$/i.test(s)) return { kind: "discovery", id: s };
  return { kind: "all" };
}

function formatShortDate(iso: string | Date | null | undefined): string | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Human label: Business Type · Location · Jul 26 */
export function formatDiscoveryBatchLabel(params: {
  businessType?: string | null;
  location?: string | null;
  createdAt?: string | Date | null;
  resultCount?: number | null;
}): string {
  const type = String(params.businessType || "").trim() || "Discovery";
  const loc = String(params.location || "").trim();
  const date = formatShortDate(params.createdAt);
  const parts = [type];
  if (loc) parts.push(loc);
  if (date) parts.push(date);
  return parts.join(" · ");
}

export function formatImportBatchLabel(params: {
  batchName?: string | null;
  createdAt?: string | Date | null;
}): string {
  const name = String(params.batchName || "").trim() || "Imported batch";
  const date = formatShortDate(params.createdAt);
  return date ? `${name} · ${date}` : name;
}

export function formatSelectAllInBatchLabel(count: number, batchActive: boolean): string {
  if (batchActive) {
    return `Select entire batch (${count})`;
  }
  return `Select all matching (${count})`;
}

/** Read Places discovery search id from contact JSON meta. */
export function readContactDiscoverySearchId(contact: {
  sourceDetails?: unknown;
  customFields?: unknown;
}): string | null {
  const sd = (contact.sourceDetails || {}) as Record<string, unknown>;
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  for (const bag of [sd.prospectAi, sd.prospectImport, cf.prospectAi, cf.prospectImport]) {
    if (!bag || typeof bag !== "object" || Array.isArray(bag)) continue;
    const id = String((bag as Record<string, unknown>).discoverySearchId || "").trim();
    if (id) return id;
  }
  return null;
}

export function readContactImportJobIdFromMeta(contact: {
  sourceDetails?: unknown;
  customFields?: unknown;
}): string | null {
  const sd = (contact.sourceDetails || {}) as Record<string, unknown>;
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  for (const bag of [sd.prospectImport, cf.prospectImport, sd.prospectAi, cf.prospectAi]) {
    if (!bag || typeof bag !== "object" || Array.isArray(bag)) continue;
    const id = String((bag as Record<string, unknown>).importJobId || "").trim();
    if (id) return id;
  }
  return null;
}
