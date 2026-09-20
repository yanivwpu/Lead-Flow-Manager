import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export type SearchResult = { url: string; position?: number };
export interface OrganicSearchProvider { readonly name: string; readonly configured: boolean; search(query: string, signal?: AbortSignal): Promise<SearchResult[]>; }
export class DisabledSearchProvider implements OrganicSearchProvider {
  readonly name = "disabled"; readonly configured = false;
  async search(): Promise<SearchResult[]> { return []; }
}
export const COMPETITOR_FETCH_LIMITS = { redirects: 3, timeoutMs: 8_000, responseBytes: 1_500_000, concurrency: 3, perRun: 15 } as const;
export class HostRateLimiter {
  private readonly next = new Map<string, number>();
  constructor(private readonly intervalMs = 1_000) {}
  async wait(url: URL, now = () => Date.now(), sleep = (ms:number) => new Promise(resolve => setTimeout(resolve, ms))) {
    const due=this.next.get(url.hostname)??0, delay=Math.max(0,due-now()); if(delay) await sleep(delay); this.next.set(url.hostname,now()+this.intervalMs);
  }
}
const blockedV4 = /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|224\.|255\.)/;
function isPublicIp(ip: string) {
  if (isIP(ip) === 4) return !blockedV4.test(ip);
  if (isIP(ip) === 6) return !/^(::|::1|fc|fd|fe[89ab]|ff)/i.test(ip);
  return false;
}
export async function assertSafePublicUrl(raw: string, resolver = lookup): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("UNSAFE_URL_SCHEME");
  if (url.username || url.password || url.port) throw new Error("UNSAFE_URL_AUTH_OR_PORT");
  const records = await resolver(url.hostname, { all: true, verbatim: true });
  if (!records.length || records.some(record => !isPublicIp(record.address))) throw new Error("UNSAFE_URL_ADDRESS");
  return url;
}
export function filterCompetitorResults(results: SearchResult[], ownedDomains: string[], manualDomains: string[] = []) {
  const owned = ownedDomains.map(d => d.toLowerCase().replace(/^www\./, ""));
  const manual = new Set(manualDomains.map(d => d.toLowerCase().replace(/^www\./, "")));
  return results.filter(({ url }) => { try { const host = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); return !owned.some(d => host === d || host.endsWith(`.${d}`)) && (!manual.size || manual.has(host) || [...manual].some(d => host.endsWith(`.${d}`))); } catch { return false; } });
}
export async function safeFetchHtml(raw: string, options: { fetchImpl?: typeof fetch; resolver?: typeof lookup; signal?: AbortSignal; robotsAllowed?: (url:URL)=>Promise<boolean>; rateLimiter?:HostRateLimiter } = {}) {
  let url = await assertSafePublicUrl(raw, options.resolver); const fetchImpl = options.fetchImpl ?? fetch;
  if (options.robotsAllowed && !await options.robotsAllowed(url)) throw new Error("ROBOTS_DISALLOWED");
  await options.rateLimiter?.wait(url);
  for (let redirects = 0; redirects <= COMPETITOR_FETCH_LIMITS.redirects; redirects += 1) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), COMPETITOR_FETCH_LIMITS.timeoutMs);
    const onAbort = () => controller.abort(); options.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await fetchImpl(url, { redirect: "manual", signal: controller.signal, headers: { accept: "text/html", "user-agent": "WhachatCRM-SEOResearch/1.0" } });
      if ([301,302,303,307,308].includes(response.status)) { const location = response.headers.get("location"); if (!location || redirects === COMPETITOR_FETCH_LIMITS.redirects) throw new Error("REDIRECT_LIMIT"); url = await assertSafePublicUrl(new URL(location, url).toString(), options.resolver); continue; }
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) throw new Error("INVALID_CONTENT_TYPE");
      const declared = Number(response.headers.get("content-length") ?? 0); if (declared > COMPETITOR_FETCH_LIMITS.responseBytes) throw new Error("RESPONSE_TOO_LARGE");
      const reader = response.body?.getReader(); if (!reader) return { url: url.toString(), html: "" };
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > COMPETITOR_FETCH_LIMITS.responseBytes) { await reader.cancel(); throw new Error("RESPONSE_TOO_LARGE"); } chunks.push(part.value); }
      return { url: url.toString(), html: new TextDecoder().decode(Buffer.concat(chunks)) };
    } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", onAbort); }
  }
  throw new Error("REDIRECT_LIMIT");
}
