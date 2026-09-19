import { GoogleAuth } from "google-auth-library";

export class SeoConfigurationError extends Error { code = "MISSING_CONFIGURATION"; }
export class SearchConsoleError extends Error {
  cause?: unknown;
  constructor(public code: string, message: string, public status?: number, cause?: unknown) {
    super(message);
    this.name = "SearchConsoleError";
    this.cause = cause;
  }
}

export function resolveSearchConsoleConfig(env: NodeJS.ProcessEnv = process.env) {
  const siteUrl = normalizeSearchConsoleProperty(env.GSC_SITE_URL);
  const clientEmail = env.GSC_CLIENT_EMAIL?.trim();
  const privateKey = env.GSC_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const missing = [!siteUrl && "GSC_SITE_URL", !clientEmail && "GSC_CLIENT_EMAIL", !privateKey && "GSC_PRIVATE_KEY"].filter(Boolean) as string[];
  return { configured: missing.length === 0, missing, siteUrl, clientEmail, privateKey };
}

export function normalizeSearchConsoleProperty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase().startsWith("sc-domain:")) return `sc-domain:${trimmed.slice(10).trim().toLowerCase()}`;
  try { return new URL(trimmed).href; } catch { return trimmed; }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const TRANSIENT_NETWORK_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENETUNREACH", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_SOCKET"]);
export function isTransientSearchConsoleTransportError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError" || error.name === "TimeoutError") return true;
  const directCode = (error as Error & { code?: string }).code;
  const causeCode = (error as Error & { cause?: { code?: string } }).cause?.code;
  return TRANSIENT_NETWORK_CODES.has(directCode ?? "") || TRANSIENT_NETWORK_CODES.has(causeCode ?? "");
}

export async function fetchSearchPerformance(params: {
  startDate: string; endDate: string; startRow: number; rowLimit: number;
  fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv; dimensions?: readonly ("date" | "query" | "page")[];
  getAccessToken?: () => Promise<string | null>; sleepImpl?: (ms: number) => Promise<unknown>;
  signal?: AbortSignal;
}) {
  const config = resolveSearchConsoleConfig(params.env);
  if (!config.configured) throw new SeoConfigurationError(`Search Console is not configured; missing ${config.missing.join(", ")}`);
  const auth = new GoogleAuth({
    credentials: { client_email: config.clientEmail, private_key: config.privateKey },
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  const token = params.getAccessToken ? await params.getAccessToken() : await auth.getAccessToken();
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(config.siteUrl!)}/searchAnalytics/query`;
  const fetcher = params.fetchImpl ?? fetch;
  const wait = params.sleepImpl ?? sleep;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      if (params.signal?.aborted) throw new SearchConsoleError("LEASE_LOST", "SEO synchronization lease was lost", undefined, params.signal.reason);
      const response = await fetcher(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ startDate: params.startDate, endDate: params.endDate, dimensions: params.dimensions ?? ["date", "query", "page"], rowLimit: Math.min(params.rowLimit, 25_000), startRow: params.startRow, dataState: "final" }),
        signal: params.signal,
      });
      if (response.ok) return (await response.json()) as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> };
      const body = await response.text();
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < 3) { await wait(500 * (2 ** attempt)); continue; }
      const code = response.status === 429 ? "QUOTA_EXCEEDED"
        : response.status === 401 ? "AUTHENTICATION_FAILED"
        : response.status === 403 ? "PERMISSION_DENIED"
        : response.status >= 400 && response.status < 500 ? "VALIDATION_ERROR"
        : "API_ERROR";
      throw new SearchConsoleError(code, `Search Console request failed (${response.status}): ${body.slice(0, 300)}`, response.status);
    } catch (error) {
      if (params.signal?.aborted) throw new SearchConsoleError("LEASE_LOST", "SEO synchronization lease was lost", undefined, error);
      if (error instanceof SearchConsoleError || !isTransientSearchConsoleTransportError(error)) throw error;
      if (attempt < 3) { await wait(500 * (2 ** attempt)); continue; }
      throw new SearchConsoleError("TRANSPORT_ERROR", `Search Console transport or response body failed after ${attempt + 1} attempts`, undefined, error);
    }
  }
  throw new SearchConsoleError("API_ERROR", "Search Console retry limit exhausted");
}

/** Daily property totals deliberately omit query/page, so anonymized-query traffic
 * remains represented in aggregate dashboard metrics. */
export function fetchSearchDailyTotals(startDate: string, endDate: string, signal?: AbortSignal) {
  return fetchSearchPerformance({ startDate, endDate, startRow: 0, rowLimit: 1_000, dimensions: ["date"], signal });
}
