/**
 * Resilient Meta Graph fetches for channel health — retries, latency logging, timeout vs HTTP distinction.
 */

export type MetaJsonFetchOutcome = "success" | "http_error" | "timeout" | "network";

export type MetaJsonFetchResult = {
  ok: boolean;
  status: number;
  json: unknown | null;
  outcome: MetaJsonFetchOutcome;
  attempts: number;
  totalLatencyMs: number;
  errorText?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function classifyFetchError(err: unknown): MetaJsonFetchOutcome {
  const e = err as { name?: string; message?: string };
  const name = String(e?.name || "");
  const msg = String(e?.message || "").toLowerCase();
  if (name === "TimeoutError" || name === "AbortError" || msg.includes("timeout") || msg.includes("aborted")) {
    return "timeout";
  }
  return "network";
}

/**
 * GET JSON from Meta Graph with bounded timeout and small retry/backoff (transient Meta slowness).
 */
export async function fetchMetaGraphJsonWithRetries(args: {
  url: string;
  timeoutMs?: number;
  maxAttempts?: number;
  baseBackoffMs?: number;
  logTag: string;
  tokenSource: string;
  extraLog?: Record<string, unknown>;
}): Promise<MetaJsonFetchResult> {
  const timeoutMs = args.timeoutMs ?? 8000;
  const maxAttempts = Math.max(1, args.maxAttempts ?? 3);
  const baseBackoffMs = args.baseBackoffMs ?? 350;
  const tAll = Date.now();
  let lastStatus = 0;
  let lastOutcome: MetaJsonFetchOutcome = "network";
  let lastErr = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const t0 = Date.now();
    try {
      const r = await fetch(args.url, { signal: AbortSignal.timeout(timeoutMs) });
      const latencyMs = Date.now() - t0;
      lastStatus = r.status;
      const json = (await r.json().catch(() => null)) as unknown | null;
      if (r.ok) {
        console.log(
          `[META_HEALTHCHECK] ${JSON.stringify({
            tag: args.logTag,
            outcome: "success",
            httpStatus: r.status,
            attempt,
            attempts: attempt,
            latencyMs,
            totalLatencyMs: Date.now() - tAll,
            tokenSource: args.tokenSource,
            ...args.extraLog,
          })}`
        );
        return {
          ok: true,
          status: r.status,
          json,
          outcome: "success",
          attempts: attempt,
          totalLatencyMs: Date.now() - tAll,
        };
      }
      lastOutcome = "http_error";
      lastErr = typeof json === "object" && json && "error" in (json as object)
        ? JSON.stringify((json as { error?: unknown }).error).slice(0, 240)
        : `http_${r.status}`;
      console.warn(
        `[META_TOKEN_VERIFY] ${JSON.stringify({
          tag: args.logTag,
          outcome: "http_error",
          httpStatus: r.status,
          attempt,
          latencyMs,
          tokenSource: args.tokenSource,
          error: lastErr,
          ...args.extraLog,
        })}`
      );
      if (attempt < maxAttempts && r.status >= 500) {
        await sleep(baseBackoffMs * attempt);
        continue;
      }
      break;
    } catch (err: unknown) {
      lastOutcome = classifyFetchError(err);
      lastErr = err instanceof Error ? err.message : String(err);
      console.warn(
        `[META_TOKEN_VERIFY] ${JSON.stringify({
          tag: args.logTag,
          outcome: lastOutcome,
          attempt,
          latencyMs: Date.now() - t0,
          tokenSource: args.tokenSource,
          error: lastErr.slice(0, 240),
          ...args.extraLog,
        })}`
      );
      if (attempt < maxAttempts) {
        await sleep(baseBackoffMs * attempt);
      }
    }
  }

  console.warn(
    `[META_HEALTHCHECK] ${JSON.stringify({
      tag: args.logTag,
      outcome: lastOutcome,
      httpStatus: lastStatus,
      attempts: maxAttempts,
      totalLatencyMs: Date.now() - tAll,
      tokenSource: args.tokenSource,
      error: lastErr.slice(0, 240),
      ...args.extraLog,
    })}`
  );

  return {
    ok: false,
    status: lastStatus,
    json: null,
    outcome: lastOutcome,
    attempts: maxAttempts,
    totalLatencyMs: Date.now() - tAll,
    errorText: lastErr,
  };
}
