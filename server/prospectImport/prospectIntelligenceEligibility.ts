import type { Contact } from "@shared/schema";
import type { ProspectImportGhlMetadata } from "@shared/prospectImport";

export function readProspectImportMetadata(contact: Contact): ProspectImportGhlMetadata | null {
  const sd = (contact.sourceDetails || {}) as Record<string, unknown>;
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  const meta = (sd.prospectImport || cf.prospectImport) as ProspectImportGhlMetadata | undefined;
  return meta && typeof meta === "object" ? meta : null;
}

/** Only contacts imported via Prospect Import (internal growth tool) may be AI-analyzed. */
export function isInternalImportedProspect(contact: Contact): boolean {
  const sd = (contact.sourceDetails || {}) as Record<string, unknown>;
  if (String(sd.prospectImportProvider || "").trim()) return true;

  const meta = readProspectImportMetadata(contact);
  if (!meta) return false;

  if (meta.importJobId || meta.ghlContactId || meta.createdByImportJob) return true;
  return contact.source === "import" && Boolean(meta.importedAt);
}

export function assertInternalImportedProspect(contact: Contact): void {
  if (!isInternalImportedProspect(contact)) {
    throw new Error("Prospect AI Intelligence is only available for internal imported prospects.");
  }
}

export function resolvePipelineStageAfterAnalysis(currentStage: string | null | undefined): string | null {
  const stage = String(currentStage || "").trim() || "Imported";
  if (stage === "Imported") return "AI Reviewed";
  return null;
}
