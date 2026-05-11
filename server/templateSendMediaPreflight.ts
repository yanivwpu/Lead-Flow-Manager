/**
 * WhatsApp Cloud API template sends pass **public HTTPS links** in components
 * (`image.link`, `video.link`, `document.link`). Meta’s servers fetch each URL;
 * this module preflights those URLs from our app server to catch unreachable
 * or non-public URLs before we call Graph.
 */

export type TemplateMediaUrlBucket =
  | "r2_dev"
  | "r2_account"
  | "app_proxy"
  | "remote_https"
  | "invalid";

export function classifyTemplateMediaUrlForLog(urlStr: string): TemplateMediaUrlBucket {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    if (host.endsWith(".r2.dev") || host.includes(".r2.dev")) return "r2_dev";
    if (host.includes("r2.cloudflarestorage.com")) return "r2_account";
    const path = u.pathname.toLowerCase();
    if (path.includes("/api/") && (path.includes("media") || path.includes("upload"))) {
      return "app_proxy";
    }
    if (host === "localhost" || host.startsWith("127.")) return "app_proxy";
    return "remote_https";
  } catch {
    return "invalid";
  }
}

export type PreflightFailureReason =
  | "timeout"
  | "unreachable"
  | "forbidden"
  | "non_success_http"
  | "unknown";

export type PreflightResult =
  | { ok: true; httpStatus: number }
  | { ok: false; reason: PreflightFailureReason; httpStatus?: number; friendlyDetail: string };

const DEFAULT_TIMEOUT_MS = 12_000;

export async function preflightHttpsMediaUrl(
  url: string,
  opts?: { timeoutMs?: number }
): Promise<PreflightResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { Range: "bytes=0-0" },
      });
    }
    clearTimeout(timer);
    const st = res.status;
    if (st >= 200 && st < 300) return { ok: true, httpStatus: st };
    if (st === 403 || st === 401) {
      return {
        ok: false,
        reason: "forbidden",
        httpStatus: st,
        friendlyDetail: `HTTP ${st} (not publicly readable)`,
      };
    }
    if (st === 416) {
      return { ok: true, httpStatus: st };
    }
    return {
      ok: false,
      reason: "non_success_http",
      httpStatus: st,
      friendlyDetail: `HTTP ${st}`,
    };
  } catch (e: unknown) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      return {
        ok: false,
        reason: "timeout",
        friendlyDetail: `Timed out after ${timeoutMs}ms`,
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      reason: "unreachable",
      friendlyDetail: msg.slice(0, 240),
    };
  }
}

export function collectHttpsLinksFromMetaTemplateComponents(components: unknown): string[] {
  const found: string[] = [];
  const visit = (obj: unknown): void => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const x of obj) visit(x);
      return;
    }
    const o = obj as Record<string, unknown>;
    const link = o.link;
    if (typeof link === "string" && /^https?:\/\//i.test(link.trim())) {
      found.push(link.trim());
    }
    for (const v of Object.values(o)) {
      if (v && (typeof v === "object" || Array.isArray(v))) visit(v);
    }
  };
  visit(components);
  return [...new Set(found)];
}

export function friendlyMessageForPreflightFailure(
  url: string,
  bucket: TemplateMediaUrlBucket,
  pf: Extract<PreflightResult, { ok: false }>,
  label: string
): { userMessage: string; errorCode: string } {
  const shortUrl = (() => {
    try {
      const u = new URL(url);
      return `${u.hostname}${u.pathname.length > 48 ? u.pathname.slice(0, 48) + "…" : u.pathname}`;
    } catch {
      return "(invalid URL)";
    }
  })();

  if (pf.reason === "timeout") {
    return {
      userMessage: `Media check timed out for ${label} (${shortUrl}). WhatsApp must be able to fetch this file quickly; try a smaller file or a faster host.`,
      errorCode: "MEDIA_PREFLIGHT_TIMEOUT",
    };
  }
  if (pf.reason === "forbidden" || pf.reason === "non_success_http") {
    const r2Hint =
      bucket === "r2_dev" || bucket === "r2_account"
        ? " R2 URLs must allow anonymous GET from the public internet (signed URL or public bucket) so Meta can download them."
        : bucket === "app_proxy"
          ? " App or proxy URLs must be reachable from the public internet without cookies (Meta’s servers fetch them)."
          : "";
    return {
      userMessage: `Media URL for ${label} returned ${pf.friendlyDetail} (${shortUrl}).${r2Hint}`,
      errorCode: "MEDIA_PREFLIGHT_HTTP",
    };
  }
  return {
    userMessage: `Media URL for ${label} is unreachable (${shortUrl}): ${pf.friendlyDetail}`,
    errorCode: "MEDIA_PREFLIGHT_UNREACHABLE",
  };
}
