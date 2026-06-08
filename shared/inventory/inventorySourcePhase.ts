/**
 * Unified inventory source lifecycle phase — single derived status for onboarding UX.
 */

export type InventorySourcePhase =
  | "needs_validation"
  | "ready_for_import"
  | "initial_import_running"
  | "initial_import_complete"
  | "up_to_date"
  | "sync_failed";

export type InventorySourcePhaseInput = {
  connectionStatus: string | null | undefined;
  lastSyncStatus: string | null | undefined;
  lastSyncStats?: Record<string, unknown> | null;
  config?: Record<string, unknown> | null;
  listingCount?: number;
};

export type InventorySourcePhaseDetails = {
  phase: InventorySourcePhase;
  /** Primary user-facing status line. */
  message: string;
  /** Optional secondary line (progress, guidance). */
  detail: string | null;
  listingsImported: number | null;
  pagesProcessed: number | null;
};

function statNumber(stats: Record<string, unknown> | null | undefined, key: string): number | null {
  if (!stats || typeof stats !== "object") return null;
  const v = stats[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isInitialImportComplete(config: Record<string, unknown> | null | undefined): boolean {
  return config?.initialImportComplete === true;
}

function syncMode(stats: Record<string, unknown> | null | undefined): string | null {
  if (!stats || typeof stats !== "object") return null;
  const v = stats.syncMode;
  return typeof v === "string" ? v : null;
}

function importProgressMetrics(
  stats: Record<string, unknown> | null | undefined,
  listingCount: number,
): { listingsImported: number | null; pagesProcessed: number | null; listingsFetched: number | null } {
  const pagesProcessed = statNumber(stats, "pagesFetched");
  const listingsFetched = statNumber(stats, "listingsFetched");
  const fromStats =
    statNumber(stats, "listingsImported") ??
    statNumber(stats, "upserted") ??
    statNumber(stats, "seenCount");
  const listingsImported =
    fromStats != null && fromStats > 0
      ? fromStats
      : listingCount > 0
        ? listingCount
        : null;
  return { listingsImported, pagesProcessed, listingsFetched };
}

function formatProgressDetail(
  listingsImported: number | null,
  pagesProcessed: number | null,
  listingsFetched: number | null,
): string | null {
  const parts: string[] = [];
  if (listingsFetched != null && listingsFetched > 0) {
    parts.push(`${listingsFetched.toLocaleString()} listings fetched`);
  }
  if (listingsImported != null && listingsImported > 0) {
    parts.push(`${listingsImported.toLocaleString()} imported`);
  }
  if (pagesProcessed != null && pagesProcessed > 0) {
    parts.push(`${pagesProcessed.toLocaleString()} pages processed`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Derive a single lifecycle phase from connection, sync, and import cursor state. */
export function deriveInventorySourcePhase(input: InventorySourcePhaseInput): InventorySourcePhaseDetails {
  const connectionStatus = input.connectionStatus ?? "";
  const lastSyncStatus = input.lastSyncStatus ?? "";
  const stats = input.lastSyncStats;
  const listingCount = input.listingCount ?? 0;
  const initialComplete = isInitialImportComplete(input.config);
  const mode = syncMode(stats);
  const progress = importProgressMetrics(stats, listingCount);

  if (lastSyncStatus === "failed") {
    return {
      phase: "sync_failed",
      message: "Sync failed",
      detail: "Check the error below and try Sync Now again.",
      listingsImported: progress.listingsImported,
      pagesProcessed: progress.pagesProcessed,
    };
  }

  if (connectionStatus === "configuring") {
    return {
      phase: "needs_validation",
      message: "Validate your connection",
      detail: "Save your settings, then click Validate connection before syncing.",
      listingsImported: null,
      pagesProcessed: null,
    };
  }

  if (connectionStatus === "error" && lastSyncStatus !== "running") {
    return {
      phase: "needs_validation",
      message: "Connection needs attention",
      detail: "Check your access token and originating system name, then validate again.",
      listingsImported: null,
      pagesProcessed: null,
    };
  }

  if (connectionStatus !== "connected" && lastSyncStatus !== "running") {
    return {
      phase: "needs_validation",
      message: "Validate your connection",
      detail: "Save your settings, then click Validate connection before syncing.",
      listingsImported: null,
      pagesProcessed: null,
    };
  }

  if (lastSyncStatus === "running") {
    if (!initialComplete) {
      const progressDetail = formatProgressDetail(
        progress.listingsImported,
        progress.pagesProcessed,
        progress.listingsFetched,
      );
      return {
        phase: "initial_import_running",
        message: "Importing listings…",
        detail: progressDetail ?? "Fetching listings from your data provider…",
        listingsImported: progress.listingsImported,
        pagesProcessed: progress.pagesProcessed,
      };
    }
    const progressDetail = formatProgressDetail(
      progress.listingsImported,
      progress.pagesProcessed,
      progress.listingsFetched,
    );
    return {
      phase: "up_to_date",
      message: "Syncing listings…",
      detail: progressDetail,
      listingsImported: progress.listingsImported,
      pagesProcessed: progress.pagesProcessed,
    };
  }

  if (!initialComplete) {
    return {
      phase: "ready_for_import",
      message: "Ready to import",
      detail: "Click Sync Now to import your listings.",
      listingsImported: null,
      pagesProcessed: null,
    };
  }

  if (lastSyncStatus === "success" && mode === "initial") {
    const progressDetail = formatProgressDetail(
      progress.listingsImported,
      progress.pagesProcessed,
      progress.listingsFetched,
    );
    return {
      phase: "initial_import_complete",
      message: "Initial import complete",
      detail: progressDetail,
      listingsImported: progress.listingsImported,
      pagesProcessed: progress.pagesProcessed,
    };
  }

  const progressDetail = formatProgressDetail(
    progress.listingsImported,
    progress.pagesProcessed,
    progress.listingsFetched,
  );
  return {
    phase: "up_to_date",
    message: "Up to date",
    detail: progressDetail,
    listingsImported: progress.listingsImported,
    pagesProcessed: progress.pagesProcessed,
  };
}

/** Tailwind classes for the unified status badge. */
export function inventorySourcePhaseBadgeClass(phase: InventorySourcePhase): string {
  switch (phase) {
    case "needs_validation":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "ready_for_import":
      return "bg-blue-50 text-blue-900 border-blue-200";
    case "initial_import_running":
      return "bg-blue-50 text-blue-900 border-blue-200";
    case "initial_import_complete":
      return "bg-emerald-50 text-emerald-900 border-emerald-200";
    case "up_to_date":
      return "bg-emerald-50 text-emerald-900 border-emerald-200";
    case "sync_failed":
      return "bg-red-50 text-red-900 border-red-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}
