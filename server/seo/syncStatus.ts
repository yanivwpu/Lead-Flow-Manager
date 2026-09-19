export type PersistedSeoSyncRun = {
  id: string;
  propertyId: string;
  status: string;
  trigger: string;
  rowsImported: number;
  pagesCompleted: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
};

export function serializeSeoSyncRun(run: PersistedSeoSyncRun | null | undefined) {
  if (!run) return null;
  return {
    id: run.id,
    propertyId: run.propertyId,
    status: run.status,
    trigger: run.trigger,
    rowsImported: run.rowsImported,
    pagesCompleted: run.pagesCompleted,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  };
}

/** Pure equivalent of the dashboard's newest-run and newest-success queries. */
export function summarizeSeoSyncHistory(runs: PersistedSeoSyncRun[], propertyId: string) {
  const newestFirst = runs.filter((run) => run.propertyId === propertyId).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  return {
    latestSync: serializeSeoSyncRun(newestFirst[0]),
    lastSuccessfulSync: newestFirst.find((run) => run.status === "success")?.completedAt ?? null,
  };
}

export function describeSeoSyncFailure(error: unknown, rowsImported: number) {
  const code = typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : "IMPORT_FAILED";
  return {
    status: rowsImported > 0 ? "partial" as const : "failed" as const,
    errorCode: code,
    errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown import failure",
  };
}
