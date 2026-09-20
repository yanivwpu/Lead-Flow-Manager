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

export type SanitizedDatabaseError = {
  code: string;
  category: string;
  message: string;
  detail?: string;
  table?: string;
  column?: string;
  constraint?: string;
};

const DATABASE_MESSAGES: Record<string, [string, string]> = {
  "21000": ["DATABASE_DUPLICATE_BATCH_KEY", "The import contained a duplicate snapshot key."],
  "23502": ["DATABASE_SCHEMA_MISMATCH", "The SEO database schema rejected a required value."],
  "23503": ["DATABASE_REFERENCE_ERROR", "The SEO database rejected a related record."],
  "23505": ["DATABASE_CONFLICT", "The SEO database rejected a conflicting snapshot."],
  "42703": ["DATABASE_SCHEMA_MISMATCH", "The SEO database schema is missing an expected column."],
  "42P10": ["DATABASE_SCHEMA_MISMATCH", "The SEO database is missing the expected unique key."],
};

const safeIdentifier = (value: unknown) => typeof value === "string" && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value) ? value : undefined;

/** Walk Drizzle's nested `cause` chain without retaining query text or params. */
export function extractSanitizedDatabaseError(error: unknown): SanitizedDatabaseError | null {
  let cursor: unknown = error;
  const visited = new Set<unknown>();
  for (let depth = 0; depth < 8 && cursor && typeof cursor === "object" && !visited.has(cursor); depth += 1) {
    visited.add(cursor);
    const candidate = cursor as Record<string, unknown>;
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      const [category, message] = DATABASE_MESSAGES[candidate.code] ?? ["DATABASE_ERROR", "The SEO database rejected the synchronization."];
      return {
        code: candidate.code,
        category,
        message,
        detail: typeof candidate.detail === "string" ? "Database detail available (values redacted)." : undefined,
        table: safeIdentifier(candidate.table),
        column: safeIdentifier(candidate.column),
        constraint: safeIdentifier(candidate.constraint),
      };
    }
    cursor = candidate.cause;
  }
  return null;
}

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
  const databaseError = extractSanitizedDatabaseError(error);
  if (databaseError) {
    return {
      status: rowsImported > 0 ? "partial" as const : "failed" as const,
      errorCode: databaseError.category,
      errorMessage: databaseError.message,
    };
  }
  const code = typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : "IMPORT_FAILED";
  return {
    status: rowsImported > 0 ? "partial" as const : "failed" as const,
    errorCode: code,
    errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown import failure",
  };
}

export function safeSeoSyncHttpFailure(error: unknown) {
  const databaseError = extractSanitizedDatabaseError(error);
  if (databaseError) return { status: 502, body: { error: databaseError.message, code: databaseError.category } };
  const code = typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code : "SYNC_FAILED";
  const status = code === "SYNC_IN_PROGRESS" ? 409 : code === "MISSING_CONFIGURATION" ? 503 : code === "QUOTA_EXCEEDED" ? 429 : 502;
  const safeMessages: Record<string, string> = {
    SYNC_IN_PROGRESS: "SEO synchronization is already in progress.",
    MISSING_CONFIGURATION: "Search Console is not configured.",
    QUOTA_EXCEEDED: "Search Console quota was exceeded. Try again later.",
    AUTHENTICATION_FAILED: "Search Console authentication failed.",
    PERMISSION_DENIED: "Search Console access was denied.",
  };
  return { status, body: { error: safeMessages[code] ?? "SEO synchronization failed. Check the latest run for details.", code } };
}
