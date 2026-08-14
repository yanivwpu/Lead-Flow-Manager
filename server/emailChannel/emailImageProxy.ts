/**
 * SSRF-safe remote email image proxy (inbound rendering only).
 * DNS is resolved + validated, then the outbound connection is pinned to that IP
 * (lookup override) while TLS SNI / Host still use the original hostname.
 */
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { decodeEmailProxyUrlPayload, isEmailSafeImageMime } from "@shared/emailImagePolicy";
import { verifyEmailImageProxyRequest } from "./emailImageProxySecret";

export const EMAIL_IMAGE_PROXY_TIMEOUT_MS = Number(
  process.env.EMAIL_IMAGE_PROXY_TIMEOUT_MS || 8_000,
);
export const EMAIL_IMAGE_PROXY_MAX_BYTES = Number(
  process.env.EMAIL_IMAGE_PROXY_MAX_BYTES || 2_000_000,
);
export const EMAIL_IMAGE_PROXY_MAX_REDIRECTS = Number(
  process.env.EMAIL_IMAGE_PROXY_MAX_REDIRECTS || 3,
);

type ProxyCacheEntry = {
  expiresAt: number;
  contentType: string;
  body: Buffer;
};

export type PinnedHttpDestination = {
  url: URL;
  pinnedIp: string;
  family: 4 | 6;
};

const proxyCache = new Map<string, ProxyCacheEntry>();
const PROXY_CACHE_TTL_MS = 30 * 60 * 1000;
const PROXY_CACHE_MAX_ENTRIES = 200;

function logImageProxy(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag: "[EmailImageProxy]", event, ...fields }));
}

function cacheKey(url: string): string {
  return url.slice(0, 500);
}

function getCached(url: string): ProxyCacheEntry | null {
  const key = cacheKey(url);
  const hit = proxyCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    proxyCache.delete(key);
    return null;
  }
  return hit;
}

function setCached(url: string, contentType: string, body: Buffer): void {
  if (proxyCache.size >= PROXY_CACHE_MAX_ENTRIES) {
    const first = proxyCache.keys().next().value;
    if (first) proxyCache.delete(first);
  }
  proxyCache.set(cacheKey(url), {
    expiresAt: Date.now() + PROXY_CACHE_TTL_MS,
    contentType,
    body,
  });
}

export function isBlockedIpAddress(ip: string): boolean {
  const v = String(ip || "").trim().toLowerCase();
  if (!v) return true;

  if (net.isIP(v) === 4) {
    const parts = v.split(".").map((n) => Number(n));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  if (net.isIP(v) === 6) {
    if (v === "::1") return true;
    if (v === "::") return true;
    if (v.startsWith("::ffff:")) {
      const mapped = v.slice("::ffff:".length);
      if (net.isIP(mapped) === 4) return isBlockedIpAddress(mapped);
    }
    // Unique local fc00::/7, link-local fe80::/10, multicast ff00::/8
    if (v.startsWith("fc") || v.startsWith("fd")) return true;
    if (v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) {
      return true;
    }
    if (v.startsWith("ff")) return true;
    return false;
  }

  return true;
}

/** Lookup factory that always returns the pre-validated public IP (anti DNS-rebinding). */
export function createPinnedDnsLookup(pinnedIp: string, family: 4 | 6) {
  return (
    _hostname: string,
    _options: unknown,
    callback: (err: Error | null, address: string, family: number) => void,
  ) => {
    if (isBlockedIpAddress(pinnedIp)) {
      callback(Object.assign(new Error("pinned_ip_blocked"), { code: "pinned_ip_blocked" }), "", 0);
      return;
    }
    callback(null, pinnedIp, family);
  };
}

/**
 * Resolve hostname, require every address public, pin to the first allowed address.
 * Outbound connect must use createPinnedDnsLookup(pinnedIp, family).
 */
export async function resolveAndPinPublicHttpUrl(rawUrl: string): Promise<PinnedHttpDestination> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw Object.assign(new Error("invalid_url"), { code: "invalid_url" });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw Object.assign(new Error("scheme_blocked"), { code: "scheme_blocked" });
  }
  if (parsed.username || parsed.password) {
    throw Object.assign(new Error("userinfo_blocked"), { code: "userinfo_blocked" });
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw Object.assign(new Error("host_blocked"), { code: "host_blocked" });
  }
  if (host === "metadata.google.internal" || host.endsWith(".internal")) {
    throw Object.assign(new Error("host_blocked"), { code: "host_blocked" });
  }

  if (net.isIP(host)) {
    if (isBlockedIpAddress(host)) {
      throw Object.assign(new Error("ip_blocked"), { code: "ip_blocked" });
    }
    const family = net.isIP(host) === 6 ? 6 : 4;
    return { url: parsed, pinnedIp: host, family };
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw Object.assign(new Error("dns_failed"), { code: "dns_failed" });
  }
  if (!records.length) {
    throw Object.assign(new Error("dns_failed"), { code: "dns_failed" });
  }
  for (const r of records) {
    if (isBlockedIpAddress(r.address)) {
      throw Object.assign(new Error("resolved_ip_blocked"), { code: "resolved_ip_blocked" });
    }
  }
  const chosen = records[0];
  const family = chosen.family === 6 ? 6 : 4;
  return { url: parsed, pinnedIp: chosen.address, family };
}

/** @deprecated use resolveAndPinPublicHttpUrl — kept for tests that only need validation. */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  const pinned = await resolveAndPinPublicHttpUrl(rawUrl);
  return pinned.url;
}

type PinnedHttpResponse = {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
};

async function pinnedHttpGet(
  dest: PinnedHttpDestination,
  signal: AbortSignal,
): Promise<PinnedHttpResponse> {
  const url = dest.url;
  const isHttps = url.protocol === "https:";
  const lib = isHttps ? https : http;
  const port = url.port ? Number(url.port) : isHttps ? 443 : 80;
  const path = `${url.pathname}${url.search}`;

  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      return;
    }

    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port,
        path,
        method: "GET",
        headers: {
          Host: url.host,
          Accept: "image/*,*/*;q=0.8",
          "User-Agent": "WhachatCRM-EmailImageProxy/1.0",
          Connection: "close",
        },
        // Pin TCP connect to the validated public IP (blocks DNS rebinding TOCTOU).
        lookup: createPinnedDnsLookup(dest.pinnedIp, dest.family) as any,
        // Preserve TLS certificate hostname verification + SNI for the original host.
        servername: isHttps ? url.hostname.replace(/^\[|\]$/g, "") : undefined,
        timeout: EMAIL_IMAGE_PROXY_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > EMAIL_IMAGE_PROXY_MAX_BYTES) {
            req.destroy();
            reject(Object.assign(new Error("oversized"), { code: "oversized" }));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
        res.on("error", reject);
      },
    );

    const onAbort = () => {
      req.destroy(Object.assign(new Error("aborted"), { name: "AbortError" }));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    req.on("timeout", () => {
      req.destroy(Object.assign(new Error("timeout"), { name: "AbortError", code: "timeout" }));
    });
    req.on("error", (err) => {
      signal.removeEventListener("abort", onAbort);
      reject(err);
    });
    req.end();
  });
}

export type EmailImageProxyResult =
  | { ok: true; contentType: string; body: Buffer; cached: boolean }
  | { ok: false; code: string; status: number };

export async function fetchEmailImageViaProxy(params: {
  encodedUrl: string;
  signature: string;
  expiresUnixSec: number;
}): Promise<EmailImageProxyResult> {
  const remoteUrl = decodeEmailProxyUrlPayload(params.encodedUrl);
  if (!remoteUrl) {
    logImageProxy("rejected", { reason: "decode_failed" });
    return { ok: false, code: "invalid_url", status: 400 };
  }
  if (
    !verifyEmailImageProxyRequest({
      remoteUrl,
      expiresUnixSec: params.expiresUnixSec,
      signature: params.signature,
    })
  ) {
    logImageProxy("rejected", { reason: "bad_or_expired_signature" });
    return { ok: false, code: "bad_signature", status: 403 };
  }

  const cached = getCached(remoteUrl);
  if (cached) {
    logImageProxy("cache_hit", { urlLen: remoteUrl.length });
    return { ok: true, contentType: cached.contentType, body: cached.body, cached: true };
  }

  let current = remoteUrl;
  try {
    for (let hop = 0; hop <= EMAIL_IMAGE_PROXY_MAX_REDIRECTS; hop++) {
      const pinned = await resolveAndPinPublicHttpUrl(current);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), EMAIL_IMAGE_PROXY_TIMEOUT_MS);
      let res: PinnedHttpResponse;
      try {
        res = await pinnedHttpGet(pinned, controller.signal);
      } finally {
        clearTimeout(timer);
      }

      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const loc = res.headers.location;
        if (!loc || Array.isArray(loc)) {
          logImageProxy("redirect_missing_location", { hop });
          return { ok: false, code: "redirect_invalid", status: 502 };
        }
        if (hop >= EMAIL_IMAGE_PROXY_MAX_REDIRECTS) {
          logImageProxy("redirect_limit", { hop });
          return { ok: false, code: "redirect_limit", status: 502 };
        }
        current = new URL(String(loc), current).toString();
        // Next hop: resolve + validate + pin again (never reuse prior pin).
        continue;
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        logImageProxy("upstream_error", { status: res.statusCode });
        return { ok: false, code: "upstream_error", status: 502 };
      }

      const contentType = String(res.headers["content-type"] || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      if (!isEmailSafeImageMime(contentType)) {
        logImageProxy("rejected_content_type", { contentType: contentType.slice(0, 60) });
        return { ok: false, code: "content_type", status: 415 };
      }

      const body = res.body;
      if (body.length > EMAIL_IMAGE_PROXY_MAX_BYTES) {
        return { ok: false, code: "oversized", status: 413 };
      }
      const head = body.subarray(0, 64).toString("utf8").toLowerCase();
      if (head.includes("<html") || head.includes("<!doctype") || head.includes("<script")) {
        logImageProxy("rejected_html_masquerade", {});
        return { ok: false, code: "content_type", status: 415 };
      }

      setCached(remoteUrl, contentType, body);
      logImageProxy("ok", {
        bytes: body.length,
        contentType,
        hops: hop,
        pinnedFamily: pinned.family,
      });
      return { ok: true, contentType, body, cached: false };
    }
  } catch (err: any) {
    const code = String(err?.code || err?.message || "fetch_failed");
    if (
      code === "resolved_ip_blocked" ||
      code === "ip_blocked" ||
      code === "host_blocked" ||
      code === "pinned_ip_blocked"
    ) {
      logImageProxy("ssrf_blocked", { code });
      return { ok: false, code, status: 403 };
    }
    if (code === "oversized") {
      logImageProxy("oversized", {});
      return { ok: false, code: "oversized", status: 413 };
    }
    if (err?.name === "AbortError" || code === "timeout") {
      logImageProxy("timeout", {});
      return { ok: false, code: "timeout", status: 504 };
    }
    logImageProxy("failed", { code: code.slice(0, 80) });
    return { ok: false, code: "fetch_failed", status: 502 };
  }

  return { ok: false, code: "redirect_limit", status: 502 };
}

/** Test helper — clear in-memory cache. */
export function clearEmailImageProxyCacheForTests(): void {
  proxyCache.clear();
}
