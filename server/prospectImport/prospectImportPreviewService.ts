import { and, eq, inArray } from "drizzle-orm";
import type { Integration } from "@shared/schema";
import { prospectImportPreviewJobs } from "@shared/schema";
import type {
  ProspectImportContactFilter,
  ProspectImportMatchedSnapshot,
  ProspectImportPreviewJobPoll,
  ProspectImportPreviewJobSummary,
  ProspectImportPreviewResult,
  ProspectImportScanScope,
} from "@shared/prospectImport";
import {
  PROSPECT_IMPORT_ASYNC_SCAN_THRESHOLD,
  PROSPECT_IMPORT_PREVIEW_ROWS_CAP,
  PROSPECT_IMPORT_DEFAULT_IMPORT_LIMIT,
  PROSPECT_IMPORT_DEFAULT_SCAN_SCOPE,
} from "@shared/prospectImport";
import { db } from "../../drizzle/db";
import { storage } from "../storage";
import { getIntegrationById, searchGhlContacts } from "./ghlApiClient";
import {
  buildProspectImportFilterFingerprint,
  normalizeProspectImportFilters,
  resolveScanTargetContacts,
} from "./ghlApiRetry";
import { scanGhlContactsPaginated } from "./ghlContactScan";
import { getGhlProspectApiToken } from "./ghlProspectApiToken";
import { assembleProspectPreviewResult } from "./prospectImportDedup";

const runningPreviewJobs = new Set<string>();
const activePreviewFingerprints = new Set<string>();

function mapPreviewJobSummary(
  row: typeof prospectImportPreviewJobs.$inferSelect,
): ProspectImportPreviewJobSummary {
  return {
    id: row.id,
    status: row.status as ProspectImportPreviewJobSummary["status"],
    integrationId: row.integrationId,
    locationId: row.locationId,
    scanScope: row.scanScope as ProspectImportScanScope,
    importLimit: row.importLimit ?? PROSPECT_IMPORT_DEFAULT_IMPORT_LIMIT,
    progressScanned: row.progressScanned ?? 0,
    progressTarget: row.progressTarget ?? 0,
    progressMatches: row.progressMatches ?? 0,
    ghlReportedTotal: row.ghlReportedTotal ?? null,
    filterFingerprint: row.filterFingerprint,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function buildPreviewRowsForDisplay(
  snapshots: ProspectImportMatchedSnapshot[],
  importLimit: number,
): ProspectImportMatchedSnapshot[] {
  const cap = Math.min(importLimit, PROSPECT_IMPORT_PREVIEW_ROWS_CAP);
  return snapshots.slice(0, cap);
}

export function buildPreviewResultFromScan(params: {
  scan: Awaited<ReturnType<typeof scanGhlContactsPaginated>>;
  filters: ProspectImportContactFilter;
  destinationContacts: Awaited<ReturnType<typeof storage.getContacts>>;
  appliedTemplateHint?: string | null;
  previewJobId?: string;
  filterFingerprint?: string;
  scannedAt?: string;
}): ProspectImportPreviewResult {
  const importLimit = Math.min(Math.max(params.filters.importLimit ?? 100, 1), 1000);
  const displayRows = buildPreviewRowsForDisplay(params.scan.matchingSnapshots, importLimit);
  const importPool = params.scan.matchingSnapshots.slice(0, importLimit);

  const result = assembleProspectPreviewResult({
    rows: importPool.map((s) => ({
      externalId: s.externalId,
      name: s.name,
      company: s.company,
      email: s.email,
      phone: s.phone,
      tags: s.tags,
      source: s.source,
      lastActivity: s.lastActivity,
    })),
    destinationContacts: params.destinationContacts,
    skippedByFilters: params.scan.skippedByFilters,
    totalFound: params.scan.allMatchedExternalIds.length,
    truncated:
      params.scan.allMatchedExternalIds.length > displayRows.length ||
      params.scan.matchedSnapshotsTruncated,
    totalContactsScanned: params.scan.totalContactsScanned,
    ghlReportedTotal: params.scan.ghlReportedTotal,
    scanStoppedEarly: params.scan.scanStoppedEarly,
    scanComplete: params.scan.scanComplete,
    previewJobId: params.previewJobId,
    filterFingerprint: params.filterFingerprint,
    scannedAt: params.scannedAt,
    diagnostics: {
      activeFilters: params.filters,
      appliedTemplateHint: params.appliedTemplateHint ?? null,
      skippedContacts: params.scan.skippedDiagnostics,
    },
  });

  result.contacts = displayRows.map((s) => {
    const fromPool = result.contacts.find((c) => c.externalId === s.externalId);
    return (
      fromPool ?? {
        externalId: s.externalId,
        name: s.name,
        company: s.company,
        email: s.email,
        phone: s.phone,
        tags: s.tags,
        source: s.source,
        lastActivity: s.lastActivity,
        isDuplicate: false,
        missingEmail: !String(s.email || "").trim(),
        missingPhone: String(s.phone || "").replace(/\D/g, "").length < 7,
      }
    );
  });

  result.stats.totalMatching = params.scan.allMatchedExternalIds.length;
  return result;
}

async function updatePreviewJob(
  jobId: string,
  patch: Partial<typeof prospectImportPreviewJobs.$inferInsert>,
): Promise<void> {
  await db.update(prospectImportPreviewJobs).set(patch).where(eq(prospectImportPreviewJobs.id, jobId));
}

async function runPreviewScanJob(jobId: string): Promise<void> {
  if (runningPreviewJobs.has(jobId)) return;
  runningPreviewJobs.add(jobId);

  const rows = await db
    .select()
    .from(prospectImportPreviewJobs)
    .where(eq(prospectImportPreviewJobs.id, jobId))
    .limit(1);
  const job = rows[0];
  if (!job) {
    runningPreviewJobs.delete(jobId);
    return;
  }

  const fingerprint = job.filterFingerprint;
  activePreviewFingerprints.add(fingerprint);

  try {
    await updatePreviewJob(jobId, { status: "running", startedAt: new Date() });

    const integration = await getIntegrationById(job.integrationId);
    if (!integration?.isActive) throw new Error("GHL integration not found or inactive");

    const filters = normalizeProspectImportFilters((job.filters || {}) as ProspectImportContactFilter);
    const scanScope = (job.scanScope || PROSPECT_IMPORT_DEFAULT_SCAN_SCOPE) as ProspectImportScanScope;
    const scanTarget = resolveScanTargetContacts(scanScope);

    let integrationRef: Integration | null = integration;

    const scan = await scanGhlContactsPaginated({
      locationId: job.locationId,
      filters,
      scanScope,
      resumeFromPage: job.lastPage ?? 1,
      getToken: async () => {
        const fresh = await getIntegrationById(job.integrationId);
        if (!fresh?.isActive) throw new Error("GHL integration unavailable during scan");
        integrationRef = fresh;
        const resolved = await getGhlProspectApiToken(fresh, job.locationId);
        return resolved.token;
      },
      searchPage: async ({ token, locationId, page, pageLimit, query }) =>
        searchGhlContacts({ token, locationId, page, pageLimit, query }),
      onProgress: async (progress) => {
        await updatePreviewJob(jobId, {
          progressScanned: progress.scanned,
          progressTarget: progress.target,
          progressMatches: progress.matches,
          ghlReportedTotal: progress.ghlReportedTotal ?? null,
          lastPage: progress.page,
        });
      },
    });

    const destinationContacts = await storage.getContacts(job.destinationUserId, 50000);
    const scannedAt = new Date().toISOString();
    const previewResult = buildPreviewResultFromScan({
      scan,
      filters,
      destinationContacts,
      appliedTemplateHint: job.appliedTemplateHint,
      previewJobId: jobId,
      filterFingerprint: fingerprint,
      scannedAt,
    });

    await updatePreviewJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      scannedAt: new Date(),
      progressScanned: scan.totalContactsScanned,
      progressTarget: scanTarget,
      progressMatches: scan.allMatchedExternalIds.length,
      ghlReportedTotal: scan.ghlReportedTotal,
      lastPage: scan.lastPage,
      scanStoppedEarly: scan.scanStoppedEarly,
      scanComplete: scan.scanComplete,
      skippedByFilters: scan.skippedByFilters,
      matchedSnapshots: scan.matchingSnapshots,
      allMatchedExternalIds: scan.allMatchedExternalIds,
      skippedDiagnostics: scan.skippedDiagnostics,
      previewResult,
      errorMessage: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updatePreviewJob(jobId, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: message.substring(0, 500),
    });
  } finally {
    runningPreviewJobs.delete(jobId);
    activePreviewFingerprints.delete(fingerprint);
  }
}

export async function createGhlProspectPreviewJob(params: {
  integrationId: string;
  locationId: string;
  filters: ProspectImportContactFilter;
  destinationUserId: string;
  initiatedByUserId: string;
  appliedTemplateHint?: string | null;
}): Promise<{ async: true; job: ProspectImportPreviewJobSummary } | { async: false; result: ProspectImportPreviewResult }> {
  const filters = normalizeProspectImportFilters(params.filters);
  const scanScope = filters.scanScope ?? PROSPECT_IMPORT_DEFAULT_SCAN_SCOPE;
  const importLimit = filters.importLimit ?? PROSPECT_IMPORT_DEFAULT_IMPORT_LIMIT;
  const fingerprint = buildProspectImportFilterFingerprint({
    integrationId: params.integrationId,
    locationId: params.locationId,
    filters,
  });

  if (activePreviewFingerprints.has(fingerprint)) {
    const existing = await db
      .select()
      .from(prospectImportPreviewJobs)
      .where(
        and(
          eq(prospectImportPreviewJobs.filterFingerprint, fingerprint),
          inArray(prospectImportPreviewJobs.status, ["pending", "running"]),
        ),
      )
      .limit(1);
    if (existing[0]) {
      return { async: true, job: mapPreviewJobSummary(existing[0]) };
    }
  }

  const scanTarget = resolveScanTargetContacts(scanScope);
  const useAsync = scanTarget > PROSPECT_IMPORT_ASYNC_SCAN_THRESHOLD;

  const [row] = await db
    .insert(prospectImportPreviewJobs)
    .values({
      integrationId: params.integrationId,
      locationId: params.locationId,
      destinationUserId: params.destinationUserId,
      initiatedByUserId: params.initiatedByUserId,
      filters,
      filterFingerprint: fingerprint,
      scanScope: String(scanScope),
      importLimit,
      appliedTemplateHint: params.appliedTemplateHint ?? null,
      status: useAsync ? "pending" : "running",
      progressTarget: scanTarget,
      startedAt: useAsync ? undefined : new Date(),
    })
    .returning();

  if (useAsync) {
    setImmediate(() => {
      void runPreviewScanJob(row.id).catch((err) => {
        console.error("[ProspectImportPreview] Job failed:", err);
      });
    });
    return { async: true, job: mapPreviewJobSummary(row) };
  }

  activePreviewFingerprints.add(fingerprint);
  try {
    const integration = await getIntegrationById(params.integrationId);
    if (!integration?.isActive) throw new Error("GHL integration not found or inactive");

    const resolved = await getGhlProspectApiToken(integration, params.locationId);
    const scan = await scanGhlContactsPaginated({
      locationId: resolved.locationId,
      filters,
      scanScope,
      getToken: async () => {
        const fresh = await getIntegrationById(params.integrationId);
        if (!fresh?.isActive) throw new Error("GHL integration unavailable during scan");
        const next = await getGhlProspectApiToken(fresh, params.locationId);
        return next.token;
      },
      searchPage: async ({ token, locationId, page, pageLimit, query }) =>
        searchGhlContacts({ token, locationId, page, pageLimit, query }),
      onProgress: async (progress) => {
        await updatePreviewJob(row.id, {
          progressScanned: progress.scanned,
          progressTarget: progress.target,
          progressMatches: progress.matches,
          ghlReportedTotal: progress.ghlReportedTotal ?? null,
          lastPage: progress.page,
        });
      },
    });

    const destinationContacts = await storage.getContacts(params.destinationUserId, 50000);
    const scannedAt = new Date().toISOString();
    const previewResult = buildPreviewResultFromScan({
      scan,
      filters,
      destinationContacts,
      appliedTemplateHint: params.appliedTemplateHint,
      previewJobId: row.id,
      filterFingerprint: fingerprint,
      scannedAt,
    });

    await updatePreviewJob(row.id, {
      status: "completed",
      completedAt: new Date(),
      scannedAt: new Date(),
      progressScanned: scan.totalContactsScanned,
      progressTarget: scanTarget,
      progressMatches: scan.allMatchedExternalIds.length,
      ghlReportedTotal: scan.ghlReportedTotal,
      lastPage: scan.lastPage,
      scanStoppedEarly: scan.scanStoppedEarly,
      scanComplete: scan.scanComplete,
      skippedByFilters: scan.skippedByFilters,
      matchedSnapshots: scan.matchingSnapshots,
      allMatchedExternalIds: scan.allMatchedExternalIds,
      skippedDiagnostics: scan.skippedDiagnostics,
      previewResult,
      errorMessage: null,
    });

    return { async: false, result: previewResult };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updatePreviewJob(row.id, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: message.substring(0, 500),
    });
    throw err;
  } finally {
    activePreviewFingerprints.delete(fingerprint);
  }
}

export async function getGhlProspectPreviewJob(
  jobId: string,
  workspaceUserId?: string,
): Promise<ProspectImportPreviewJobPoll | null> {
  const rows = await db
    .select()
    .from(prospectImportPreviewJobs)
    .where(eq(prospectImportPreviewJobs.id, jobId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (workspaceUserId && row.destinationUserId !== workspaceUserId) return null;

  const summary = mapPreviewJobSummary(row);
  if (row.status !== "completed") {
    return { ...summary, result: null };
  }

  return {
    ...summary,
    result: (row.previewResult as ProspectImportPreviewResult | null) ?? null,
  };
}

export async function loadPreviewSnapshotsForImport(
  previewJobId: string,
  selectedExternalIds?: string[],
  workspaceUserId?: string,
): Promise<{
  snapshots: ProspectImportMatchedSnapshot[];
  filterFingerprint: string;
  locationId: string;
  integrationId: string;
  filters: ProspectImportContactFilter;
  scannedAt: string | null;
}> {
  const rows = await db
    .select()
    .from(prospectImportPreviewJobs)
    .where(eq(prospectImportPreviewJobs.id, previewJobId))
    .limit(1);
  const job = rows[0];
  if (!job || job.status !== "completed") {
    throw new Error("Preview job not found or not completed");
  }
  if (workspaceUserId && job.destinationUserId !== workspaceUserId) {
    throw new Error("Preview job not found or not completed");
  }

  const snapshots = (job.matchedSnapshots || []) as ProspectImportMatchedSnapshot[];
  const allIds = (job.allMatchedExternalIds || []) as string[];
  const selected = new Set(selectedExternalIds ?? []);

  let pool = snapshots;
  if (selected.size > 0) {
    const byId = new Map(snapshots.map((s) => [s.externalId, s]));
    pool = [...selected]
      .filter((id) => allIds.includes(id))
      .map((id) => byId.get(id))
      .filter((s): s is ProspectImportMatchedSnapshot => Boolean(s));
    if (pool.length !== selected.size) {
      throw new Error("Selected contacts are not in the approved preview result");
    }
  }

  return {
    snapshots: pool,
    filterFingerprint: job.filterFingerprint,
    locationId: job.locationId,
    integrationId: job.integrationId,
    filters: (job.filters || {}) as ProspectImportContactFilter,
    scannedAt: job.scannedAt?.toISOString() ?? null,
  };
}

export function validatePreviewImportRequest(params: {
  previewJobId?: string | null;
  filterFingerprint?: string | null;
  locationId: string;
  integrationId: string;
  expectedFingerprint?: string;
  scannedAt?: string | null;
  maxAgeMs?: number;
}): void {
  if (!params.previewJobId) return;

  if (params.expectedFingerprint && params.filterFingerprint !== params.expectedFingerprint) {
    throw new Error("Preview filters changed since scan — run preview again");
  }

  if (params.scannedAt && params.maxAgeMs) {
    const age = Date.now() - new Date(params.scannedAt).getTime();
    if (age > params.maxAgeMs) {
      throw new Error("Preview result is stale — run preview again");
    }
  }
}
