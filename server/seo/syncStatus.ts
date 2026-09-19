export type PersistedSeoSyncRun = {
  id: string;
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
export function summarizeSeoSyncHistory(runs: PersistedSeoSyncRun[]) {
  const newestFirst = [...runs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  return {
    latestSync: serializeSeoSyncRun(newestFirst[0]),
    lastSuccessfulSync: newestFirst.find((run) => run.status === "success")?.completedAt ?? null,
  };
}
