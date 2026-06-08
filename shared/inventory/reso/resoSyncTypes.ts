import { z } from "zod";

/** RESO replication strategy — initial import, incremental sync, or key reconciliation. */
export type ResoSyncMode = "initial" | "incremental" | "reconciliation";

/** @deprecated Use ResoSyncMode */
export type InventorySyncMode = ResoSyncMode;

export const resoSyncCursorSchema = z.object({
  initialImportComplete: z.boolean().optional(),
  maxModificationTimestamp: z.string().optional(),
  /** OData @odata.nextLink to resume an interrupted initial import. */
  initialImportResumeUrl: z.string().optional(),
  lastReconciliationAt: z.string().optional(),
  lastSuccessfulSyncAt: z.string().optional(),
  lastFailedSyncAt: z.string().optional(),
});

export type ResoSyncCursor = z.infer<typeof resoSyncCursorSchema>;

/** @deprecated Use ResoSyncCursor */
export type MlsGridSyncCursor = ResoSyncCursor;

export type ResoSyncDiagnostics = {
  syncMode: ResoSyncMode;
  pagesFetched: number;
  requestsMade: number;
  retries: number;
  rateLimitHits: number;
  durationMs: number;
  oDataFilter?: string;
  requestUrl?: string;
};

/** @deprecated Use ResoSyncDiagnostics */
export type MlsGridSyncDiagnostics = ResoSyncDiagnostics;

export function readResoSyncCursor(config: Record<string, unknown>): ResoSyncCursor {
  const parsed = resoSyncCursorSchema.safeParse(config);
  if (parsed.success) return parsed.data;
  return {};
}

export function mergeResoSyncCursor(
  config: Record<string, unknown>,
  patch: ResoSyncCursor,
): Record<string, unknown> {
  return { ...config, ...patch };
}

/** Greatest ISO timestamp from RESO rows for incremental cursor advancement. */
export function maxTimestampFromRows(
  rows: unknown[],
  field: string,
  currentMax?: string,
): string | undefined {
  let max = currentMax;
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const ts = (raw as Record<string, unknown>)[field];
    if (typeof ts !== "string" || !ts.trim()) continue;
    if (!max || ts > max) max = ts;
  }
  return max;
}

/** @deprecated Use maxTimestampFromRows */
export function maxModificationTimestampFromRows(
  rows: unknown[],
  currentMax?: string,
): string | undefined {
  return maxTimestampFromRows(rows, "ModificationTimestamp", currentMax);
}
