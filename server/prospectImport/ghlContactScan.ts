import type {
  ProspectImportContactFilter,
  ProspectImportFilterSkipDiagnostic,
  ProspectImportMatchedSnapshot,
  ProspectImportScanScope,
} from "@shared/prospectImport";
import {
  GHL_CONTACT_SEARCH_PAGE_SIZE,
  PROSPECT_IMPORT_MATCHED_SNAPSHOTS_CAP,
  PROSPECT_IMPORT_SKIP_DIAGNOSTICS_CAP,
} from "@shared/prospectImport";
import type { GhlRawContact } from "./ghlApiClient";
import { normalizeGhlContactName } from "./ghlApiClient";
import {
  explainGhlContactFilterRejection,
  sanitizeGhlContactForDiagnostics,
} from "./ghlContactFilters";
import { GhlApiError, resolveScanTargetContacts } from "./ghlApiRetry";

export type GhlContactSearchPageResult = {
  contacts: GhlRawContact[];
  total?: number;
};

export type GhlContactScanProgress = {
  scanned: number;
  target: number;
  matches: number;
  page: number;
  ghlReportedTotal?: number | null;
};

export type GhlContactScanResult = {
  ghlReportedTotal: number | null;
  totalContactsScanned: number;
  matchingSnapshots: ProspectImportMatchedSnapshot[];
  allMatchedExternalIds: string[];
  skippedByFilters: number;
  skippedDiagnostics: ProspectImportFilterSkipDiagnostic[];
  scanStoppedEarly: boolean;
  scanComplete: boolean;
  lastPage: number;
  matchedSnapshotsTruncated: boolean;
};

export type GhlContactScanParams = {
  locationId: string;
  filters: ProspectImportContactFilter;
  scanScope: ProspectImportScanScope;
  getToken: () => Promise<string>;
  searchPage: (params: {
    token: string;
    locationId: string;
    page: number;
    pageLimit: number;
    query?: string;
  }) => Promise<GhlContactSearchPageResult>;
  onProgress?: (progress: GhlContactScanProgress) => void | Promise<void>;
  shouldAbort?: () => boolean;
  resumeFromPage?: number;
};

function mapSnapshot(c: GhlRawContact): ProspectImportMatchedSnapshot {
  return {
    externalId: c.id,
    name: normalizeGhlContactName(c),
    company: c.companyName || undefined,
    email: c.email || undefined,
    phone: c.phone || undefined,
    tags: c.tags ?? [],
    source: c.source || undefined,
    lastActivity: c.lastActivity || c.dateUpdated || c.dateAdded || undefined,
  };
}

export async function scanGhlContactsPaginated(
  params: GhlContactScanParams,
): Promise<GhlContactScanResult> {
  const scanTarget = resolveScanTargetContacts(params.scanScope);
  const pageSize = GHL_CONTACT_SEARCH_PAGE_SIZE;
  const apiQuery = String(params.filters.search || "").trim() || undefined;

  const matchingSnapshots: ProspectImportMatchedSnapshot[] = [];
  const allMatchedExternalIds: string[] = [];
  const skippedDiagnostics: ProspectImportFilterSkipDiagnostic[] = [];

  let scanned = 0;
  let skippedByFilters = 0;
  let ghlReportedTotal: number | null = null;
  let page = Math.max(params.resumeFromPage ?? 1, 1);
  let matchedSnapshotsTruncated = false;

  while (scanned < scanTarget) {
    if (params.shouldAbort?.()) break;

    let token: string;
    try {
      token = await params.getToken();
    } catch (err) {
      if (err instanceof GhlApiError && isGhlAuthErrorStatus(err.status)) throw err;
      throw err;
    }

    let pageResult: GhlContactSearchPageResult;
    try {
      pageResult = await params.searchPage({
        token,
        locationId: params.locationId,
        page,
        pageLimit: pageSize,
        query: apiQuery,
      });
    } catch (err) {
      if (err instanceof GhlApiError && isGhlAuthErrorStatus(err.status)) throw err;
      throw err;
    }

    const { contacts, total } = pageResult;
    if (ghlReportedTotal == null && typeof total === "number") ghlReportedTotal = total;
    if (!contacts.length) {
      return finalize({
        ghlReportedTotal,
        totalContactsScanned: scanned,
        matchingSnapshots,
        allMatchedExternalIds,
        skippedByFilters,
        skippedDiagnostics,
        scanStoppedEarly: false,
        scanComplete: true,
        lastPage: page,
        matchedSnapshotsTruncated,
      });
    }

    for (const contact of contacts) {
      if (scanned >= scanTarget) break;
      scanned += 1;

      const skipReason = explainGhlContactFilterRejection(contact, params.filters);
      if (skipReason) {
        skippedByFilters += 1;
        if (skippedDiagnostics.length < PROSPECT_IMPORT_SKIP_DIAGNOSTICS_CAP) {
          skippedDiagnostics.push({
            externalId: contact.id,
            contact: sanitizeGhlContactForDiagnostics(contact),
            skipReason,
          });
        }
        continue;
      }

      allMatchedExternalIds.push(contact.id);
      if (matchingSnapshots.length < PROSPECT_IMPORT_MATCHED_SNAPSHOTS_CAP) {
        matchingSnapshots.push(mapSnapshot(contact));
      } else {
        matchedSnapshotsTruncated = true;
      }
    }

    await params.onProgress?.({
      scanned,
      target: scanTarget,
      matches: allMatchedExternalIds.length,
      page,
      ghlReportedTotal,
    });

    if (scanned >= scanTarget) {
      return finalize({
        ghlReportedTotal,
        totalContactsScanned: scanned,
        matchingSnapshots,
        allMatchedExternalIds,
        skippedByFilters,
        skippedDiagnostics,
        scanStoppedEarly: true,
        scanComplete: false,
        lastPage: page,
        matchedSnapshotsTruncated,
      });
    }

    if (contacts.length < pageSize) {
      return finalize({
        ghlReportedTotal,
        totalContactsScanned: scanned,
        matchingSnapshots,
        allMatchedExternalIds,
        skippedByFilters,
        skippedDiagnostics,
        scanStoppedEarly: false,
        scanComplete: true,
        lastPage: page,
        matchedSnapshotsTruncated,
      });
    }

    page += 1;
  }

  return finalize({
    ghlReportedTotal,
    totalContactsScanned: scanned,
    matchingSnapshots,
    allMatchedExternalIds,
    skippedByFilters,
    skippedDiagnostics,
    scanStoppedEarly: scanned >= scanTarget,
    scanComplete: false,
    lastPage: page,
    matchedSnapshotsTruncated,
  });
}

function isGhlAuthErrorStatus(status: number): boolean {
  return status === 401 || status === 403;
}

function finalize(result: GhlContactScanResult): GhlContactScanResult {
  return result;
}
