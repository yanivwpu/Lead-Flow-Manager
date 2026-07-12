import { desc, eq } from "drizzle-orm";
import type { Contact } from "@shared/schema";
import { prospectImportJobs } from "@shared/schema";
import type {
  ProspectImportContactFilter,
  ProspectImportDashboardStats,
  ProspectImportGhlMetadata,
  ProspectImportHistoryItem,
  ProspectImportInternalTag,
  ProspectImportJobSummary,
  ProspectImportOptions,
  ProspectImportPipelineStage,
  ProspectImportUndoStatus,
} from "@shared/prospectImport";
import { PROSPECT_IMPORT_DASHBOARD_STAGES } from "@shared/prospectImport";
import { getProspectImportDestinationEmail } from "@shared/prospectImportAccess";
import { db } from "../../drizzle/db";
import { storage } from "../storage";
import { normalizeGhlContactName } from "./ghlApiClient";
import {
  buildProspectDedupIndex,
  findProspectDuplicate,
} from "./prospectImportDedup";
import {
  getGhlLocationMetadata,
  listGhlProspectLocations,
  previewGhlProspectImport,
  snapshotsToGhlRawContacts,
} from "./providers/ghlProspectProvider";
import { getIntegrationById, resolveGhlProspectLocationId, type GhlRawContact } from "./ghlApiClient";
import {
  loadPreviewSnapshotsForImport,
  validatePreviewImportRequest,
  getGhlProspectPreviewJob,
} from "./prospectImportPreviewService";
import {
  canUndoImportJob,
  executeProspectImportUndo,
  previewProspectImportUndo,
} from "./prospectImportUndo";
import {
  deleteProspectImportTemplate,
  listProspectImportTemplates,
  saveProspectImportTemplate,
} from "./prospectImportTemplates";

const runningJobs = new Set<string>();
const IMPORT_BATCH_SIZE = 50;
const PREVIEW_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function resolveProspectImportDestinationUserId(): Promise<string> {
  const envId = String(process.env.PROSPECT_IMPORT_DESTINATION_USER_ID || "").trim();
  if (envId) return envId;

  const email = getProspectImportDestinationEmail();
  const users = await storage.getAllUsers();
  const match = users.find((u) => String(u.email || "").trim().toLowerCase() === email);
  if (!match) throw new Error(`Prospect import destination user not found (${email})`);
  return match.id;
}

function mapJobSummary(row: typeof prospectImportJobs.$inferSelect): ProspectImportJobSummary {
  const options = (row.importOptions || {}) as ProspectImportOptions;
  return {
    id: row.id,
    provider: row.provider as ProspectImportJobSummary["provider"],
    batchName: row.batchName || options.batchName || "Untitled batch",
    importReason: row.importReason ?? options.importReason ?? null,
    status: row.status as ProspectImportJobSummary["status"],
    undoStatus: (row.undoStatus || "none") as ProspectImportUndoStatus,
    progressCurrent: row.progressCurrent ?? 0,
    progressTotal: row.progressTotal ?? 0,
    imported: row.resultImported ?? 0,
    skipped: row.resultSkipped ?? 0,
    duplicates: row.resultDuplicates ?? 0,
    errors: row.resultErrors ?? 0,
    internalTag: options.internalTag ?? null,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    undoneAt: row.undoneAt?.toISOString() ?? null,
  };
}

async function mapHistoryItem(row: typeof prospectImportJobs.$inferSelect): Promise<ProspectImportHistoryItem> {
  const summary = mapJobSummary(row);
  const undo = await canUndoImportJob(row);
  return {
    ...summary,
    canUndo: undo.canUndo,
    undoBlockedReason: undo.reason ?? null,
  };
}

export async function getProspectImportDashboardStats(
  destinationUserId: string,
): Promise<ProspectImportDashboardStats> {
  const contacts = await storage.getContacts(destinationUserId, 50000);
  const imported = contacts.filter((c) => {
    const details = (c.sourceDetails || {}) as Record<string, unknown>;
    return Boolean(details.prospectImportProvider);
  });

  const byStage: Record<string, number> = {};
  for (const stage of PROSPECT_IMPORT_DASHBOARD_STAGES) {
    byStage[stage] = 0;
  }
  for (const c of imported) {
    const stage = c.pipelineStage || "Imported";
    byStage[stage] = (byStage[stage] ?? 0) + 1;
  }

  const aiReviewed = imported.filter((c) => {
    const cf = (c.customFields || {}) as Record<string, unknown>;
    return Boolean(cf.prospectIntelligence) || c.pipelineStage === "AI Reviewed";
  }).length;

  return {
    importedProspects: byStage["Imported"] ?? 0,
    aiReviewed,
    contacted: byStage["Contacted"] ?? 0,
    interested: byStage["Interested"] ?? 0,
    demoScheduled: byStage["Demo Scheduled"] ?? 0,
    trialStarted: byStage["Trial Started"] ?? 0,
    customer: byStage["Customer"] ?? 0,
    partner: byStage["Partner"] ?? 0,
    byPipelineStage: byStage,
  };
}

export async function listProspectImportHistory(limit = 30): Promise<ProspectImportHistoryItem[]> {
  const rows = await db
    .select()
    .from(prospectImportJobs)
    .orderBy(desc(prospectImportJobs.createdAt))
    .limit(limit);
  return Promise.all(rows.map(mapHistoryItem));
}

export async function createProspectImportJob(params: {
  initiatedByUserId: string;
  integrationId: string;
  locationId: string;
  filters: ProspectImportContactFilter;
  importOptions: ProspectImportOptions;
  previewTotal: number;
  previewJobId?: string;
  filterFingerprint?: string;
}): Promise<ProspectImportJobSummary> {
  const batchName = String(params.importOptions.batchName || "").trim();
  if (!batchName) throw new Error("Batch name is required");
  if (!params.previewJobId?.trim()) {
    throw new Error("previewJobId is required — run preview before import");
  }

  const destinationUserId = await resolveProspectImportDestinationUserId();
  const integration = await getIntegrationById(params.integrationId);
  const locationId = integration
    ? resolveGhlProspectLocationId(integration, params.locationId)
    : params.locationId.trim();
  if (!locationId) throw new Error("GHL token or location unavailable");

  const previewData = await loadPreviewSnapshotsForImport(
    params.previewJobId.trim(),
    params.importOptions.selectedExternalIds,
  );

  validatePreviewImportRequest({
    previewJobId: params.previewJobId,
    filterFingerprint: params.filterFingerprint,
    locationId,
    integrationId: params.integrationId,
    expectedFingerprint: previewData.filterFingerprint,
    scannedAt: previewData.scannedAt,
    maxAgeMs: PREVIEW_MAX_AGE_MS,
  });

  if (previewData.locationId !== locationId || previewData.integrationId !== params.integrationId) {
    throw new Error("Preview location/integration mismatch — run preview again");
  }

  const skipDuplicates = params.importOptions.skipDuplicates !== false;
  const importOptions: ProspectImportOptions = {
    ...params.importOptions,
    batchName,
    skipDuplicates,
    updateMissingFieldsOnly: skipDuplicates ? false : Boolean(params.importOptions.updateMissingFieldsOnly),
  };

  const importLimit = Math.min(Math.max(previewData.filters.importLimit ?? 100, 1), 1000);
  let snapshots = previewData.snapshots;
  if (!importOptions.selectedExternalIds?.length) {
    snapshots = snapshots.slice(0, importLimit);
  }

  const [row] = await db
    .insert(prospectImportJobs)
    .values({
      destinationUserId,
      initiatedByUserId: params.initiatedByUserId,
      provider: "gohighlevel",
      batchName,
      importReason: importOptions.importReason ?? null,
      sourceIntegrationId: params.integrationId,
      sourceLocationId: locationId,
      status: "pending",
      filters: params.filters,
      importOptions,
      selectedExternalIds: importOptions.selectedExternalIds ?? snapshots.map((s) => s.externalId),
      previewTotal: params.previewTotal,
      previewJobId: params.previewJobId.trim(),
      progressTotal: snapshots.length,
      resultDetails: { previewSnapshots: snapshots },
    })
    .returning();

  setImmediate(() => {
    void runProspectImportJob(row.id).catch((err) => {
      console.error("[ProspectImport] Job failed:", err);
    });
  });

  return mapJobSummary(row);
}

export async function getProspectImportJob(jobId: string): Promise<ProspectImportJobSummary | null> {
  const rows = await db.select().from(prospectImportJobs).where(eq(prospectImportJobs.id, jobId)).limit(1);
  return rows[0] ? mapJobSummary(rows[0]) : null;
}

async function updateJob(
  jobId: string,
  patch: Partial<typeof prospectImportJobs.$inferInsert>,
): Promise<void> {
  await db.update(prospectImportJobs).set(patch).where(eq(prospectImportJobs.id, jobId));
}

function mergeProspectImportMetadata(
  existing: Contact,
  incoming: ProspectImportGhlMetadata,
): { sourceDetails: Record<string, unknown>; customFields: Record<string, unknown> } {
  const existingSd = (existing.sourceDetails || {}) as Record<string, unknown>;
  const existingPi = (existingSd.prospectImport || {}) as Record<string, unknown>;
  const existingCf = (existing.customFields || {}) as Record<string, unknown>;
  const existingCfPi = (existingCf.prospectImport || {}) as Record<string, unknown>;

  const mergedMeta = {
    ...existingPi,
    ...incoming,
    originalTags: incoming.originalTags?.length ? incoming.originalTags : (existingPi.originalTags as string[] | undefined) ?? [],
  };

  return {
    sourceDetails: {
      ...existingSd,
      prospectImportProvider: "gohighlevel",
      prospectImport: mergedMeta,
    },
    customFields: {
      ...existingCf,
      prospectImport: mergedMeta,
    },
  };
}

function mergeMissingFields(existing: Contact, incoming: {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
}): Partial<Contact> {
  const patch: Partial<Contact> = {};
  if (!existing.name?.trim() && incoming.name) patch.name = incoming.name;
  if (!existing.email?.trim() && incoming.email) patch.email = incoming.email;
  if (!existing.phone?.trim() && incoming.phone) patch.phone = incoming.phone;
  const notesCompany = incoming.company;
  if (notesCompany && !existing.notes?.includes(notesCompany)) {
    patch.notes = [existing.notes, notesCompany].filter(Boolean).join("\n").trim();
  }
  return patch;
}

async function runProspectImportJob(jobId: string): Promise<void> {
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);

  try {
    const rows = await db.select().from(prospectImportJobs).where(eq(prospectImportJobs.id, jobId)).limit(1);
    const job = rows[0];
    if (!job) return;

    await updateJob(jobId, { status: "running", startedAt: new Date() });

    const destinationUserId = job.destinationUserId;
    const filters = (job.filters || {}) as ProspectImportContactFilter;
    const options = (job.importOptions || {}) as ProspectImportOptions;
    const resultDetails = (job.resultDetails || {}) as {
      previewSnapshots?: Array<{
        externalId: string;
        name: string;
        company?: string;
        email?: string;
        phone?: string;
        tags: string[];
        source?: string;
        lastActivity?: string;
      }>;
      createdContactIds?: string[];
      updatedContactIds?: string[];
    };

    let rawContacts: GhlRawContact[];
    if (resultDetails.previewSnapshots?.length) {
      rawContacts = snapshotsToGhlRawContacts(resultDetails.previewSnapshots);
    } else if (job.previewJobId) {
      const loaded = await loadPreviewSnapshotsForImport(
        job.previewJobId,
        (job.selectedExternalIds as string[] | null) ?? options.selectedExternalIds,
      );
      rawContacts = snapshotsToGhlRawContacts(loaded.snapshots);
    } else {
      throw new Error("Import job missing preview snapshots — cannot import safely");
    }

    const total = rawContacts.length;
    await updateJob(jobId, { progressTotal: total });

    const destinationContacts = await storage.getContacts(destinationUserId, 50000);
    const dedupIndex = buildProspectDedupIndex(destinationContacts);

    let imported = 0;
    let skipped = 0;
    let duplicates = 0;
    let updated = 0;
    let errors = 0;

    const internalTag = (options.internalTag || "Imported-GHL") as ProspectImportInternalTag;
    const pipelineStage: ProspectImportPipelineStage = "Imported";
    const batchName = options.batchName || job.batchName || "Untitled batch";
    const importReason = options.importReason || job.importReason || undefined;
    const skipDuplicates = options.skipDuplicates !== false;
    const updateMissingOnly = Boolean(options.updateMissingFieldsOnly);
    const createdContactIds: string[] = [];
    const updatedContactIds: string[] = [];

    for (let i = 0; i < rawContacts.length; i++) {
      const raw = rawContacts[i];
      const name = normalizeGhlContactName(raw);
      const email = raw.email?.trim() || undefined;
      const phone = raw.phone?.trim() || undefined;

      try {
        const dup = findProspectDuplicate(dedupIndex, {
          externalId: raw.id,
          email,
          phone,
        });

        const prospectMeta: ProspectImportGhlMetadata = {
          ghlLocationId: job.sourceLocationId,
          ghlContactId: raw.id,
          originalTags: raw.tags ?? [],
          source: raw.source,
          batchName,
          importReason,
          importedAt: new Date().toISOString(),
          importJobId: jobId,
        };

        if (dup) {
          duplicates += 1;
          if (updateMissingOnly && !skipDuplicates) {
            const patch = mergeMissingFields(dup.contact, {
              name,
              email,
              phone,
              company: raw.companyName,
            });
            const metaPatch = mergeProspectImportMetadata(dup.contact, {
              ...prospectMeta,
              createdByImportJob: false,
            });
            const updatedContact = await storage.updateContact(dup.contact.id, {
              ...patch,
              sourceDetails: metaPatch.sourceDetails,
              customFields: metaPatch.customFields,
            });
            if (updatedContact) {
              updated += 1;
              updatedContactIds.push(updatedContact.id);
              if (updatedContact.ghlId) dedupIndex.byGhlId.set(updatedContact.ghlId, updatedContact);
            }
          } else {
            skipped += 1;
          }
        } else {
          const prospectMetaCreate: ProspectImportGhlMetadata = {
            ...prospectMeta,
            createdByImportJob: true,
          };

          const created = await storage.createContact({
            userId: destinationUserId,
            name,
            email: email ?? null,
            phone: phone ?? null,
            ghlId: raw.id,
            primaryChannel: "whatsapp",
            source: "import",
            tag: internalTag,
            pipelineStage,
            notes: raw.companyName ? `Company: ${raw.companyName}` : "",
            sourceDetails: {
              prospectImportProvider: "gohighlevel",
              prospectImport: prospectMetaCreate,
            },
            customFields: {
              prospectImport: prospectMetaCreate,
            },
          });

          createdContactIds.push(created.id);
          if (created.ghlId) dedupIndex.byGhlId.set(created.ghlId, created);
          const normEmail = email?.toLowerCase();
          if (normEmail) dedupIndex.byEmail.set(normEmail, created);
          const phoneDigits = phone?.replace(/\D/g, "");
          if (phoneDigits && phoneDigits.length >= 7) dedupIndex.byPhone.set(phoneDigits, created);
          imported += 1;
        }
      } catch (err) {
        errors += 1;
        console.error("[ProspectImport] Row error:", raw.id, err);
      }

      if ((i + 1) % IMPORT_BATCH_SIZE === 0 || i === rawContacts.length - 1) {
        await updateJob(jobId, { progressCurrent: i + 1 });
      }
    }

    await updateJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      progressCurrent: total,
      resultImported: imported,
      resultSkipped: skipped,
      resultDuplicates: duplicates,
      resultErrors: errors,
      resultDetails: { createdContactIds, updatedContactIds, updated },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: message.substring(0, 500),
    });
  } finally {
    runningJobs.delete(jobId);
  }
}

export const prospectImportService = {
  listGhlProspectLocations,
  getGhlLocationMetadata,
  previewGhlProspectImport,
  createProspectImportJob,
  getProspectImportJob,
  listProspectImportHistory,
  getProspectImportDashboardStats,
  resolveProspectImportDestinationUserId,
  previewProspectImportUndo,
  executeProspectImportUndo,
  listProspectImportTemplates,
  saveProspectImportTemplate,
  deleteProspectImportTemplate,
  getGhlProspectPreviewJob,
};
