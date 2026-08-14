/**
 * Debug session 34aeaf — development-only logging.
 * NEVER call localhost/Cursor ingest from production builds.
 */
const IS_DEV =
  typeof import.meta !== "undefined" &&
  Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);

export function debug34aeaf(payload: {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
}): void {
  if (!IS_DEV) return;

  const body = {
    sessionId: "34aeaf",
    runId: payload.runId || "pre-fix",
    hypothesisId: payload.hypothesisId,
    location: payload.location,
    message: payload.message,
    data: payload.data || {},
    timestamp: Date.now(),
  };
  try {
    console.warn("[DEBUG-34aeaf]", body.message, body.data);
  } catch {
    /* ignore */
  }
  // Local Cursor ingest — development machine only.
  fetch("http://127.0.0.1:7693/ingest/2f005315-cdf4-402a-a15b-868ee3486ee2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "34aeaf",
    },
    body: JSON.stringify(body),
  }).catch(() => {});
  // Same-origin sink for local `npm run dev` only.
  fetch("/api/_debug/session-log", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}
