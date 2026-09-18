import { GoogleAuth } from "google-auth-library";

export class SeoConfigurationError extends Error { code = "MISSING_CONFIGURATION"; }
export class SearchConsoleError extends Error {
  constructor(public code: string, message: string, public status?: number) { super(message); }
}

export function resolveSearchConsoleConfig(env: NodeJS.ProcessEnv = process.env) {
  const siteUrl = env.GSC_SITE_URL?.trim();
  const clientEmail = env.GSC_CLIENT_EMAIL?.trim();
  const privateKey = env.GSC_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const missing = [!siteUrl && "GSC_SITE_URL", !clientEmail && "GSC_CLIENT_EMAIL", !privateKey && "GSC_PRIVATE_KEY"].filter(Boolean) as string[];
  return { configured: missing.length === 0, missing, siteUrl, clientEmail, privateKey };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchSearchPerformance(params: {
  startDate: string; endDate: string; startRow: number; rowLimit: number;
  fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv;
}) {
  const config = resolveSearchConsoleConfig(params.env);
  if (!config.configured) throw new SeoConfigurationError(`Search Console is not configured; missing ${config.missing.join(", ")}`);
  const auth = new GoogleAuth({
    credentials: { client_email: config.clientEmail, private_key: config.privateKey },
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  const token = await auth.getAccessToken();
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(config.siteUrl!)}/searchAnalytics/query`;
  const fetcher = params.fetchImpl ?? fetch;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetcher(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ startDate: params.startDate, endDate: params.endDate, dimensions: ["date", "query", "page"], rowLimit: Math.min(params.rowLimit, 25_000), startRow: params.startRow, dataState: "final" }),
    });
    if (response.ok) return (await response.json()) as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> };
    const body = await response.text();
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < 3) { await sleep(500 * (2 ** attempt)); continue; }
    const code = response.status === 429 ? "QUOTA_EXCEEDED" : "API_ERROR";
    throw new SearchConsoleError(code, `Search Console request failed (${response.status}): ${body.slice(0, 300)}`, response.status);
  }
  throw new SearchConsoleError("API_ERROR", "Search Console retry limit exhausted");
}
