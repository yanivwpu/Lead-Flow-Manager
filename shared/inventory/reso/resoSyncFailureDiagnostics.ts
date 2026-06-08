export type ResoSyncFailurePhase = "validation" | "import";

export type ResoSyncFailureDiagnostics = {
  phase: ResoSyncFailurePhase;
  provider: string;
  datasetId?: string | null;
  syncMode?: string;
  httpStatus?: number;
  /** Truncated response body — never includes tokens. */
  httpBody?: string;
  /** Request URL without credentials (Bearer is header-only). */
  requestUrl?: string;
  oDataFilter?: string;
};

const BODY_MAX = 800;

export function truncateResoErrorBody(body: string): string {
  const trimmed = body.replace(/\s+/g, " ").trim();
  if (trimmed.length <= BODY_MAX) return trimmed;
  return `${trimmed.slice(0, BODY_MAX)}…`;
}

export function isResoHttpError(
  err: unknown,
): err is { name: string; status: number; body: string; requestUrl?: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "ResoHttpError" &&
    typeof (err as { status?: unknown }).status === "number" &&
    typeof (err as { body?: unknown }).body === "string"
  );
}

/** User-facing import/validation failure from RESO HTTP error + context. */
export function buildResoFailureUserMessage(
  err: unknown,
  diag: ResoSyncFailureDiagnostics,
): string {
  if (isResoHttpError(err)) {
    const body = truncateResoErrorBody(err.body);
    const phaseLabel = diag.phase === "validation" ? "Connection failed" : "Import failed";

    if (err.status === 401 || err.status === 403) {
      return `${phaseLabel}: Bridge server token was rejected (HTTP ${err.status}). Check your dataset ID and server token.`;
    }
    if (err.status === 429) {
      return `${phaseLabel}: Bridge rate limit reached (HTTP 429). Wait a few minutes and try again.`;
    }
    if (err.status === 400) {
      const orderByHint = body.toLowerCase().includes("orderby")
        ? " Bridge replication does not support $orderby — query was adjusted; retry sync."
        : "";
      const filterHint = diag.oDataFilter
        ? ` Filter: ${diag.oDataFilter.slice(0, 240)}${diag.oDataFilter.length > 240 ? "…" : ""}.`
        : "";
      return `${phaseLabel}: Bridge rejected the listing query (HTTP 400).${filterHint}${orderByHint} ${body}`.trim();
    }

    return `${phaseLabel}: Bridge Interactive HTTP ${err.status}. ${body}`.trim();
  }

  const raw = err instanceof Error ? err.message : String(err);
  const phaseLabel = diag.phase === "validation" ? "Connection failed" : "Import failed";
  return `${phaseLabel}: ${raw.slice(0, 2000)}`;
}

export function resoFailureDiagnosticsFromError(
  err: unknown,
  base: Omit<ResoSyncFailureDiagnostics, "httpStatus" | "httpBody">,
): ResoSyncFailureDiagnostics {
  if (isResoHttpError(err)) {
    return {
      ...base,
      httpStatus: err.status,
      httpBody: truncateResoErrorBody(err.body),
      requestUrl: err.requestUrl,
    };
  }
  return base;
}
