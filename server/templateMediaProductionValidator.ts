/**
 * Production checks on public HTTPS template media URLs **after** normalization
 * (stable R2 links). Meta's servers fetch these without cookies — we mirror the
 * same constraints to block 131053-class failures before Graph.
 */

import {
  waOutboundMediaKindFromMime,
  waUploadFileSizeCheck,
  waUploadTooLargeMessage,
} from "@shared/whatsappMediaLimits";

/** Keep in sync with `hostLooksLikeTransientMetaCdn` in `templateMediaNormalization.ts` (avoid importing sharp here). */
function hostLooksLikeTransientMetaCdn(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return /\.whatsapp\.net$/i.test(h) || /(^|\.)fbcdn\.net$/i.test(h);
}

export type TemplateMediaLinkContext = {
  url: string;
  inCarousel: boolean;
  paramType: "image" | "video" | "document";
};

function isLocalOrPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0") return true;
  const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  if (h.includes(":")) {
    const lower = h.toLowerCase();
    if (lower.startsWith("fc") || lower.startsWith("fd") || lower === "::1") return true;
  }
  return false;
}

function urlLooksLikeSignedOrAuthProxy(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const p = u.pathname.toLowerCase();
    const q = u.search.toLowerCase();
    if (p.includes("/api/media/proxy")) return true;
    if (q.includes("x-amz-credential=") || q.includes("x-amz-signature=")) return true;
    return false;
  } catch {
    return false;
  }
}

function extensionFromPathname(pathname: string): string {
  try {
    const seg = pathname.split("/").filter(Boolean).pop() || "";
    const q = seg.split("?")[0] || "";
    const dot = q.lastIndexOf(".");
    if (dot <= 0) return "";
    return q.slice(dot + 1).toLowerCase().slice(0, 12);
  } catch {
    return "";
  }
}

function extAllowedForKind(ext: string, kind: "image" | "video" | "document"): boolean {
  if (!ext) return true;
  if (kind === "image") {
    return /^(jpe?g|png|webp|gif|heic|heif|bmp|tiff?)$/i.test(ext);
  }
  if (kind === "video") {
    return /^(mp4|mov|m4v|webm|3gp|mkv)$/i.test(ext);
  }
  return /^pdf$/i.test(ext);
}

function mimeMatchesContext(
  mime: string,
  ctx: TemplateMediaLinkContext
): { ok: true; kind: "image" | "video" | "document" } | { ok: false; reason: string } {
  const base = (mime || "").split(";")[0].trim().toLowerCase();
  const kindFromMime = waOutboundMediaKindFromMime(base);
  if (!kindFromMime) {
    return { ok: false, reason: `Unsupported Content-Type for WhatsApp template media: "${base || "unknown"}"` };
  }
  if (ctx.paramType === "document") {
    if (kindFromMime !== "document") {
      return { ok: false, reason: `Document template header expected PDF (or allowed doc MIME); got "${base}"` };
    }
    return { ok: true, kind: "document" };
  }
  if (ctx.paramType === "video") {
    if (kindFromMime !== "video") {
      return { ok: false, reason: `Video template header expected video/*; got "${base}"` };
    }
    return { ok: true, kind: "video" };
  }
  /** image header or carousel slide */
  if (kindFromMime !== "image") {
    return { ok: false, reason: `Expected image/* for this slot; got "${base}"` };
  }
  return { ok: true, kind: "image" };
}

export function enumerateTemplateHttpsMediaLinks(
  components: Record<string, unknown>[] | undefined
): TemplateMediaLinkContext[] {
  const out: TemplateMediaLinkContext[] = [];
  if (!components?.length) return out;

  const visitParams = (params: unknown[], inCarousel: boolean) => {
    if (!Array.isArray(params)) return;
    for (const p of params) {
      if (!p || typeof p !== "object") continue;
      const pt = String((p as { type?: string }).type || "").toLowerCase();
      if (pt === "image") {
        const link = (p as { image?: { link?: string } }).image?.link;
        if (typeof link === "string" && /^https:\/\//i.test(link.trim())) {
          out.push({ url: link.trim(), inCarousel, paramType: "image" });
        }
      } else if (pt === "video") {
        const link = (p as { video?: { link?: string } }).video?.link;
        if (typeof link === "string" && /^https:\/\//i.test(link.trim())) {
          out.push({ url: link.trim(), inCarousel, paramType: "video" });
        }
      } else if (pt === "document") {
        const link = (p as { document?: { link?: string } }).document?.link;
        if (typeof link === "string" && /^https:\/\//i.test(link.trim())) {
          out.push({ url: link.trim(), inCarousel, paramType: "document" });
        }
      }
    }
  };

  for (const comp of components) {
    if (!comp || typeof comp !== "object") continue;
    const type = String((comp as { type?: string }).type || "").toLowerCase();
    if (type === "carousel" && Array.isArray((comp as { cards?: unknown }).cards)) {
      const cards = (comp as { cards: Array<{ components?: Record<string, unknown>[] }> }).cards;
      for (const card of cards) {
        const nested = Array.isArray(card?.components) ? card.components : [];
        for (const inner of nested) {
          if (!inner || typeof inner !== "object") continue;
          if (String((inner as { type?: string }).type || "").toUpperCase() !== "HEADER") continue;
          const params = (inner as { parameters?: unknown }).parameters;
          visitParams(Array.isArray(params) ? params : [], true);
        }
      }
      continue;
    }
    const params = (comp as { parameters?: unknown }).parameters;
    visitParams(Array.isArray(params) ? params : [], false);
  }

  const seen = new Set<string>();
  return out.filter((x) => {
    const k = `${x.url}\n${x.inCarousel}\n${x.paramType}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export type ProductionMediaValidationResult =
  | {
      ok: true;
      httpStatus: number;
      contentType: string;
      contentLength: number;
    }
  | { ok: false; code: string; detail: string };

async function probeUrl(url: string): Promise<{
  ok: boolean;
  status: number;
  contentType: string;
  contentLength: number | null;
  error?: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18_000);
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
    const ct = res.headers.get("content-type")?.split(";")[0]?.trim()?.toLowerCase() ?? "";
    const clRaw = res.headers.get("content-length");
    let len = clRaw != null && Number.isFinite(Number(clRaw)) ? Number(clRaw) : null;
    if (len == null || len <= 0) {
      const cr = res.headers.get("content-range");
      const m = cr && /^bytes\s+\d+-\d+\/(\d+)$/.exec(cr.trim());
      if (m) len = Number(m[1]);
    }
    if ((len == null || len <= 0) && res.ok) {
      const res2 = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
        headers: { Range: "bytes=0-65535" },
      });
      const cl2 = res2.headers.get("content-length");
      if (cl2 != null && Number.isFinite(Number(cl2))) len = Number(cl2);
      const cr2 = res2.headers.get("content-range");
      const m2 = cr2 && /^bytes\s+\d+-\d+\/(\d+)$/.exec(cr2.trim());
      if (m2) len = Number(m2[1]);
    }
    return { ok: res.ok, status: res.status, contentType: ct, contentLength: len, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, contentType: "", contentLength: null, error: msg };
  }
}

export async function validateProductionTemplateMediaUrl(
  ctx: TemplateMediaLinkContext
): Promise<ProductionMediaValidationResult> {
  const url = ctx.url.trim();
  if (!/^https:\/\//i.test(url)) {
    return { ok: false, code: "MEDIA_VALIDATE_NOT_HTTPS", detail: "URL must be public https://" };
  }
  let host = "";
  let pathname = "";
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    pathname = u.pathname || "";
  } catch {
    return { ok: false, code: "MEDIA_VALIDATE_BAD_URL", detail: "Invalid URL" };
  }

  if (hostLooksLikeTransientMetaCdn(host)) {
    return {
      ok: false,
      code: "MEDIA_VALIDATE_TRANSIENT_CDN",
      detail: "WhatsApp/Meta CDN URLs cannot be used for template media.",
    };
  }
  if (isLocalOrPrivateHost(host)) {
    return { ok: false, code: "MEDIA_VALIDATE_LOCALHOST", detail: "URL must be reachable from the public internet." };
  }
  if (urlLooksLikeSignedOrAuthProxy(url)) {
    return {
      ok: false,
      code: "MEDIA_VALIDATE_PROXY",
      detail: "Signed or authenticated proxy URLs are not allowed for template media.",
    };
  }

  const probe = await probeUrl(url);
  if (!probe.ok || probe.status < 200 || probe.status >= 300) {
    return {
      ok: false,
      code: "MEDIA_VALIDATE_UNREACHABLE",
      detail: probe.error || `HTTP ${probe.status || "error"}`,
    };
  }

  let mime = probe.contentType;
  const extEarly = extensionFromPathname(pathname);
  if (
    ctx.paramType === "document" &&
    /^pdf$/i.test(extEarly) &&
    (!mime || mime === "application/octet-stream")
  ) {
    mime = "application/pdf";
  }
  const mimeCheck = mimeMatchesContext(mime, ctx);
  if (!mimeCheck.ok) {
    return { ok: false, code: "MEDIA_VALIDATE_MIME", detail: mimeCheck.reason };
  }

  const ext = extensionFromPathname(pathname);
  if (!extAllowedForKind(ext, mimeCheck.kind)) {
    return {
      ok: false,
      code: "MEDIA_VALIDATE_EXTENSION",
      detail: `Filename extension ".${ext || "none"}" does not match expected type for ${mimeCheck.kind}.`,
    };
  }

  if (ctx.paramType === "document" && ext && !/^pdf$/i.test(ext)) {
    return { ok: false, code: "MEDIA_VALIDATE_EXTENSION", detail: "Document header should use a .pdf file for WhatsApp." };
  }

  const len = probe.contentLength;
  if (len == null || len <= 0) {
    return {
      ok: false,
      code: "MEDIA_VALIDATE_NO_CONTENT_LENGTH",
      detail: "Host must return Content-Length (or Content-Range total) so WhatsApp can fetch the asset.",
    };
  }

  const sizeMime =
    mimeCheck.kind === "document" && mime === "application/octet-stream"
      ? "application/pdf"
      : mime || "application/octet-stream";
  const chk = waUploadFileSizeCheck(sizeMime, len);
  if (!chk.ok) {
    return {
      ok: false,
      code: "MEDIA_VALIDATE_TOO_LARGE",
      detail: waUploadTooLargeMessage(chk.kind),
    };
  }

  return { ok: true, httpStatus: probe.status, contentType: mime, contentLength: len };
}
