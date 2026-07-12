import type { Contact } from "@shared/schema";
import type {
  ProspectImportPreviewContact,
  ProspectImportPreviewResult,
} from "@shared/prospectImport";

export type ProspectDedupIndex = {
  byGhlId: Map<string, Contact>;
  byEmail: Map<string, Contact>;
  byPhone: Map<string, Contact>;
};

function normEmail(value: string | null | undefined): string | null {
  const v = String(value || "").trim().toLowerCase();
  return v && v.includes("@") ? v : null;
}

function normPhone(value: string | null | undefined): string | null {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

export function buildProspectDedupIndex(contacts: Contact[]): ProspectDedupIndex {
  const byGhlId = new Map<string, Contact>();
  const byEmail = new Map<string, Contact>();
  const byPhone = new Map<string, Contact>();

  for (const c of contacts) {
    if (c.ghlId) byGhlId.set(c.ghlId, c);
    const email = normEmail(c.email);
    if (email && !byEmail.has(email)) byEmail.set(email, c);
    const phone = normPhone(c.phone);
    if (phone && !byPhone.has(phone)) byPhone.set(phone, c);
  }

  return { byGhlId, byEmail, byPhone };
}

export function findProspectDuplicate(
  index: ProspectDedupIndex,
  row: { externalId: string; email?: string; phone?: string },
): { contact: Contact; reason: "ghlContactId" | "email" | "phone" } | null {
  const byId = index.byGhlId.get(row.externalId);
  if (byId) return { contact: byId, reason: "ghlContactId" };

  const email = normEmail(row.email);
  if (email) {
    const match = index.byEmail.get(email);
    if (match) return { contact: match, reason: "email" };
  }

  const phone = normPhone(row.phone);
  if (phone) {
    const match = index.byPhone.get(phone);
    if (match) return { contact: match, reason: "phone" };
  }

  return null;
}

export function markPreviewDuplicates(
  rows: Omit<ProspectImportPreviewContact, "isDuplicate" | "duplicateReason" | "missingEmail" | "missingPhone">[],
  index: ProspectDedupIndex,
): ProspectImportPreviewContact[] {
  return rows.map((row) => {
    const missingEmail = !String(row.email || "").trim();
    const missingPhone = String(row.phone || "").replace(/\D/g, "").length < 7;
    const dup = findProspectDuplicate(index, row);
    if (!dup) return { ...row, isDuplicate: false, missingEmail, missingPhone };
    return { ...row, isDuplicate: true, duplicateReason: dup.reason, missingEmail, missingPhone };
  });
}

export function buildPreviewStats(
  contacts: ProspectImportPreviewContact[],
  params: {
    skippedByFilters: number;
    updateMissingFieldsOnly?: boolean;
    selectionCount?: number;
    totalContactsScanned?: number;
    ghlReportedTotal?: number | null;
    scanStoppedEarly?: boolean;
    scanComplete?: boolean;
  },
): import("@shared/prospectImport").ProspectImportPreviewStats {
  const totalMatching = contacts.length;
  const alreadyExists = contacts.filter((c) => c.isDuplicate).length;
  const willImportNew = contacts.filter((c) => !c.isDuplicate).length;
  const duplicatesByGhlId = contacts.filter((c) => c.duplicateReason === "ghlContactId").length;
  const duplicatesByEmail = contacts.filter((c) => c.duplicateReason === "email").length;
  const duplicatesByPhone = contacts.filter((c) => c.duplicateReason === "phone").length;
  const missingEmail = contacts.filter((c) => c.missingEmail).length;
  const missingPhone = contacts.filter((c) => c.missingPhone).length;

  const poolNew = contacts.filter((c) => !c.isDuplicate).length;
  const poolDup = contacts.filter((c) => c.isDuplicate).length;
  const estimatedFinalImport = params.updateMissingFieldsOnly ? poolNew + poolDup : poolNew;

  return {
    totalMatching,
    willImportNew,
    alreadyExists,
    duplicatesByGhlId,
    duplicatesByEmail,
    duplicatesByPhone,
    missingEmail,
    missingPhone,
    skippedByFilters: params.skippedByFilters,
    estimatedFinalImport,
    dryRun: true,
    totalContactsScanned: params.totalContactsScanned ?? totalMatching,
    ghlReportedTotal: params.ghlReportedTotal ?? null,
    scanStoppedEarly: params.scanStoppedEarly ?? false,
    scanComplete: params.scanComplete ?? true,
  };
}

function buildTagBreakdown(contacts: ProspectImportPreviewContact[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of contacts) {
    for (const tag of c.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

/** Pure preview assembly — no DB writes; used by GHL provider dry-run. */
export function assembleProspectPreviewResult(params: {
  rows: Omit<
    ProspectImportPreviewContact,
    "isDuplicate" | "duplicateReason" | "missingEmail" | "missingPhone"
  >[];
  destinationContacts: Contact[];
  skippedByFilters: number;
  totalFound?: number;
  truncated?: boolean;
  updateMissingFieldsOnly?: boolean;
  diagnostics?: import("@shared/prospectImport").ProspectImportPreviewDiagnostics;
  totalContactsScanned?: number;
  ghlReportedTotal?: number | null;
  scanStoppedEarly?: boolean;
  scanComplete?: boolean;
  previewJobId?: string;
  filterFingerprint?: string;
  scannedAt?: string;
}): ProspectImportPreviewResult {
  const dedupIndex = buildProspectDedupIndex(params.destinationContacts);
  const contacts = markPreviewDuplicates(params.rows, dedupIndex);
  const stats = buildPreviewStats(contacts, {
    skippedByFilters: params.skippedByFilters,
    updateMissingFieldsOnly: params.updateMissingFieldsOnly,
    totalContactsScanned: params.totalContactsScanned,
    ghlReportedTotal: params.ghlReportedTotal,
    scanStoppedEarly: params.scanStoppedEarly,
    scanComplete: params.scanComplete,
  });
  return {
    totalFound: params.totalFound ?? contacts.length,
    tagBreakdown: buildTagBreakdown(contacts),
    contacts,
    truncated: params.truncated ?? false,
    stats,
    diagnostics: params.diagnostics,
    previewJobId: params.previewJobId,
    filterFingerprint: params.filterFingerprint,
    scannedAt: params.scannedAt,
  };
}
