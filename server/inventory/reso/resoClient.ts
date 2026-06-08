import type { ResoAuthConfig, ResoRateLimitConfig } from "@shared/inventory/reso/resoProviderContract";
import { oDataNextLink, oDataValueRows } from "@shared/inventory/reso/resoOData";

const DEFAULT_MAX_RETRIES = 6;

export type ResoFetchMetrics = {
  requestsMade: number;
  retries: number;
  rateLimitHits: number;
};

type LimiterState = {
  lastRequestAt: number;
  recentSecond: number[];
  recentHour: number[];
  recentDay: number[];
};

const limiters = new Map<string, LimiterState>();

function getLimiterState(sourceKey: string): LimiterState {
  let state = limiters.get(sourceKey);
  if (!state) {
    state = { lastRequestAt: 0, recentSecond: [], recentHour: [], recentDay: [] };
    limiters.set(sourceKey, state);
  }
  return state;
}

function pruneTimestamps(timestamps: number[], windowMs: number, now: number): number[] {
  const cutoff = now - windowMs;
  let i = 0;
  while (i < timestamps.length && timestamps[i] <= cutoff) i += 1;
  return i > 0 ? timestamps.slice(i) : timestamps;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimitSlot(sourceKey: string, limits: ResoRateLimitConfig): Promise<void> {
  const state = getLimiterState(sourceKey);
  for (;;) {
    const now = Date.now();
    state.recentSecond = pruneTimestamps(state.recentSecond, 1000, now);
    state.recentHour = pruneTimestamps(state.recentHour, 60 * 60 * 1000, now);
    state.recentDay = pruneTimestamps(state.recentDay, 24 * 60 * 60 * 1000, now);

    const sinceLast = now - state.lastRequestAt;
    const intervalWait = limits.minIntervalMs - sinceLast;
    const secondWait =
      state.recentSecond.length >= limits.perSecond ? 1000 - (now - state.recentSecond[0]) : 0;
    const hourWait =
      state.recentHour.length >= limits.perHour ? 60 * 60 * 1000 - (now - state.recentHour[0]) : 0;
    const dayWait =
      state.recentDay.length >= limits.perDay ? 24 * 60 * 60 * 1000 - (now - state.recentDay[0]) : 0;

    const waitMs = Math.max(intervalWait, secondWait, hourWait, dayWait, 0);
    if (waitMs <= 0) {
      state.lastRequestAt = now;
      state.recentSecond.push(now);
      state.recentHour.push(now);
      state.recentDay.push(now);
      return;
    }
    await sleep(Math.min(waitMs, 30_000));
  }
}

export class ResoHttpError extends Error {
  constructor(
    readonly providerLabel: string,
    readonly status: number,
    readonly body: string,
    readonly requestUrl?: string,
  ) {
    super(`${providerLabel} HTTP ${status}: ${body.slice(0, 500)}`);
    this.name = "ResoHttpError";
  }
}

export function emptyResoFetchMetrics(): ResoFetchMetrics {
  return { requestsMade: 0, retries: 0, rateLimitHits: 0 };
}

export class ResoClient {
  constructor(
    private readonly sourceKey: string,
    private readonly auth: ResoAuthConfig,
    private readonly rateLimits: ResoRateLimitConfig,
    private readonly providerLabel: string,
    private readonly maxRetries = DEFAULT_MAX_RETRIES,
  ) {}

  async fetchJson(url: string, metrics: ResoFetchMetrics): Promise<Record<string, unknown>> {
    let attempt = 0;
    while (attempt < this.maxRetries) {
      await waitForRateLimitSlot(this.sourceKey, this.rateLimits);
      metrics.requestsMade += 1;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.auth.token}`,
          Accept: "application/json",
          "Accept-Encoding": "gzip",
        },
        signal: AbortSignal.timeout(120_000),
      });

      const text = await res.text();

      if (res.status === 429) {
        metrics.rateLimitHits += 1;
        metrics.retries += 1;
        const retryAfterHeader = res.headers.get("Retry-After");
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0;
        const backoffMs =
          retryAfterSec > 0 ? retryAfterSec * 1000 : Math.min(60_000, 1000 * 2 ** attempt);
        attempt += 1;
        await sleep(backoffMs);
        continue;
      }

      if (res.status >= 500 && res.status <= 504) {
        metrics.retries += 1;
        const backoffMs = Math.min(30_000, 1000 * 2 ** attempt);
        attempt += 1;
        await sleep(backoffMs);
        continue;
      }

      if (!res.ok) {
        throw new ResoHttpError(this.providerLabel, res.status, text, url);
      }

      return JSON.parse(text) as Record<string, unknown>;
    }

    throw new Error(`${this.providerLabel} request failed after retries (rate limit or server error).`);
  }

  /** Paginate an OData collection following @odata.nextLink. */
  async paginateCollection(
    startUrl: string,
    metrics: ResoFetchMetrics,
    onPage?: (progress: { pagesFetched: number; rowsFetched: number }) => void | Promise<void>,
  ): Promise<{ rows: unknown[]; pagesFetched: number }> {
    const rows: unknown[] = [];
    let pagesFetched = 0;
    let url: string | null = startUrl;

    while (url) {
      const body = await this.fetchJson(url, metrics);
      pagesFetched += 1;
      rows.push(...oDataValueRows(body));
      if (onPage) {
        await onPage({ pagesFetched, rowsFetched: rows.length });
      }
      url = oDataNextLink(body);
    }

    return { rows, pagesFetched };
  }
}
