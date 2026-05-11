/**
 * Normalize template header / carousel media before Meta Cloud API send:
 * - Never rely on ephemeral WhatsApp / Meta CDN URLs (e.g. scontent*.whatsapp.net) — mirror bytes to stable R2.
 * - Template images → JPEG where possible (carousel always; header skips stable R2 + image/jpeg HEAD).
 * - Videos / docs → mirrored to stable R2 when not already on canonical R2 URL.
 */

import sharp from "sharp";
import { uploadOutboundUserMedia } from "./mediaStorageService";
import { getMetaAccessToken } from "./userMeta";
import { waOutboundMediaKindFromMime, waUploadFileSizeCheck, waUploadTooLargeMessage } from "@shared/whatsappMediaLimits";

const WHATSAPP_CDN_HOST_RE = /\.whatsapp\.net$/i;
const FBCDN_HOST_RE = /(^|\.)fbcdn\.net$/i;

/** True when hostname is Meta WhatsApp / FB CDN — not acceptable as lasting template.media link. */
export function hostLooksLikeTransientMetaCdn(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return WHATSAPP_CDN_HOST_RE.test(h) || FBCDN_HOST_RE.test(h);
}

export function isStableR2PublicUrl(urlStr: string): boolean {
  if (!/^https?:\/\//i.test(urlStr.trim())) return false;
  try {
    const host = new URL(urlStr.trim()).hostname.toLowerCase();
    if (host.endsWith(".r2.dev")) return true;
    const base = (process.env.CLOUDFLARE_R2_PUBLIC_URL || "").replace(/\/$/, "");
    return !!(base && urlStr.trim().startsWith(base));
  } catch {
    return false;
  }
}

export function classifyTemplateNormalizeBucket(urlStr: string): string {
  if (isStableR2PublicUrl(urlStr)) return "r2_public";
  try {
    const h = new URL(urlStr.trim()).hostname.toLowerCase();
    if (WHATSAPP_CDN_HOST_RE.test(h)) return "whatsapp_cdn";
    if (FBCDN_HOST_RE.test(h)) return "fbcdn";
    return "remote_https";
  } catch {
    return "invalid";
  }
}

async function fetchBinary(
  url: string,
  metaBearer: string | null
): Promise<{ ok: boolean; buffer: Buffer; contentType: string; status: number }> {
  const run = async (u: string, headers?: HeadersInit) => {
    const res = await fetch(u, {
      method: "GET",
      redirect: "follow",
      headers: headers ?? {},
      signal: AbortSignal.timeout(120_000),
    });
    const ab = await res.arrayBuffer().catch(() => null);
    const ct =
      res.headers.get("content-type")?.split(";")[0]?.trim()?.toLowerCase() || "";
    return {
      ok: res.ok && !!ab && ab.byteLength > 0,
      buffer: Buffer.from(ab || new ArrayBuffer(0)),
      contentType: ct,
      status: res.status,
    };
  };

  let first = await run(url);
  if (first.ok) return first;

  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return first;
  }

  if (metaBearer && hostLooksLikeTransientMetaCdn(host)) {
    const b = await run(url, { Authorization: `Bearer ${metaBearer}` });
    if (b.ok) return b;
    if (!url.includes("access_token=")) {
      const withTok = `${url}${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(metaBearer)}`;
      const t = await run(withTok);
      if (t.ok) return t;
    }
  }

  return first;
}

async function headContentType(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return res.headers.get("content-type")?.split(";")[0]?.trim()?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

type MediaKindInPayload = "image" | "video" | "document";
type LinkHolder = { link: string } & Record<string, unknown>;

function assertSize(buffer: Buffer, mime: string): string | null {
  const chk = waUploadFileSizeCheck(mime, buffer.length);
  return chk.ok ? null : waUploadTooLargeMessage(chk.kind);
}

async function jpegNormalizeWithLogging(
  input: Buffer,
  opts: { templateName: string; role: string; sourceBucket: string }
): Promise<{ ok: true; buffer: Buffer; conversionOccurred: boolean } | { ok: false; errorMessage: string }> {
  const meta = await sharp(input).metadata();
  const fmt = meta.format ?? "unknown";
  const hadAlpha = !!meta.hasAlpha;
  const flattenNeeded = !!(hadAlpha || ["png", "webp", "gif", "tif", "tiff"].includes(String(fmt)));

  console.log(
    `[TEMPLATE_MEDIA_IMAGE_PROBE] ${JSON.stringify({
      templateName: opts.templateName,
      role: opts.role,
      sourceBucket: opts.sourceBucket,
      width: meta.width ?? null,
      height: meta.height ?? null,
      formatIn: fmt,
      hasAlpha: hadAlpha,
      channels: meta.channels ?? null,
    })}`
  );

  const maxDimension = 2000;
  let pipe = sharp(input).rotate();

  pipe = pipe.resize({
    width: meta.width && meta.width > maxDimension ? maxDimension : undefined,
    height: meta.height && meta.height > maxDimension ? maxDimension : undefined,
    fit: sharp.fit.inside,
    withoutEnlargement: true,
  });

  if (flattenNeeded) pipe = pipe.flatten({ background: { r: 255, g: 255, b: 255 } }) as sharp.Sharp;

  let out: Buffer;
  try {
    out = await pipe.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[TEMPLATE_MEDIA_JPEG_ENCODE_FAILED] ${JSON.stringify({ templateName: opts.templateName, role: opts.role })}`,
      err
    );
    return { ok: false, errorMessage: msg };
  }

  const conversionOccurred =
    flattenNeeded ||
    !(String(fmt).toLowerCase() === "jpeg" || String(fmt).toLowerCase() === "jpg");

  console.log(
    `[TEMPLATE_MEDIA_IMAGE_NORMALIZED] ${JSON.stringify({
      templateName: opts.templateName,
      role: opts.role,
      mimeOut: "image/jpeg",
      byteLengthOut: out.length,
      dimensionsIn: [meta.width ?? null, meta.height ?? null],
      formatIn: fmt,
      conversionOccurred,
    })}`
  );

  return { ok: true, buffer: out, conversionOccurred };
}

async function normalizeOneMediaUrl(opts: {
  url: string;
  userId: string;
  metaBearer: string | null;
  mediaKind: MediaKindInPayload;
  inCarousel: boolean;
  templateName: string;
}): Promise<{ ok: true; newUrl: string } | { ok: false; errorMessage: string }> {
  const { url, userId, metaBearer, mediaKind, inCarousel, templateName } = opts;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false, errorMessage: "Invalid HTTPS media URL for template send." };
  }

  let host = "";
  try {
    host = new URL(trimmed).hostname.toLowerCase();
  } catch {
    return { ok: false, errorMessage: "Invalid media URL." };
  }

  const sourceBucket = classifyTemplateNormalizeBucket(trimmed);
  const onStableR2 = isStableR2PublicUrl(trimmed);
  const onEphemeralWhatsAppFamily = hostLooksLikeTransientMetaCdn(host);

  console.log(
    `[TEMPLATE_MEDIA_NORMALIZE_START] ${JSON.stringify({
      templateName,
      mediaKind,
      inCarousel,
      bucket: sourceBucket,
      host,
      onStableR2,
      ephemeralCdn: onEphemeralWhatsAppFamily,
    })}`
  );

  /** Document: mirror ephemeral / non‑R2 URLs */
  if (mediaKind === "document") {
    if (onStableR2 && !onEphemeralWhatsAppFamily) {
      console.log(
        `[TEMPLATE_MEDIA_MIRROR_SKIP] ${JSON.stringify({ templateName, role: "document", reason: "stable_r2" })}`
      );
      return { ok: true, newUrl: trimmed };
    }
    const fetched = await fetchBinary(trimmed, metaBearer);
    if (!fetched.ok || fetched.buffer.length === 0) {
      return { ok: false, errorMessage: `Could not fetch PDF/document (${fetched.status}).` };
    }
    const mime =
      fetched.contentType && fetched.contentType !== "application/octet-stream"
        ? fetched.contentType
        : "application/pdf";
    const too = assertSize(fetched.buffer, mime);
    if (too) return { ok: false, errorMessage: too };
    const uploaded = await uploadOutboundUserMedia({
      userId,
      buffer: fetched.buffer,
      contentType: mime,
      originChannel: "meta-template-send-document",
    });
    console.log(
      `[TEMPLATE_MEDIA_MIRROR_OK] ${JSON.stringify({
        templateName,
        role: "document",
        mime,
        sourceBucket,
      })}`
    );
    return { ok: true, newUrl: uploaded.mediaUrl };
  }

  /** Video: never send WhatsApp CDN links; mirror to stable R2 */
  if (mediaKind === "video") {
    if (onStableR2 && !onEphemeralWhatsAppFamily) {
      console.log(
        `[TEMPLATE_MEDIA_MIRROR_SKIP] ${JSON.stringify({ templateName, role: "video", reason: "stable_r2" })}`
      );
      return { ok: true, newUrl: trimmed };
    }

    console.log(
      `[TEMPLATE_MEDIA_VIDEO_REMIRROR_START] ${JSON.stringify({ templateName, sourceBucket })}`
    );
    const fetched = await fetchBinary(trimmed, metaBearer);
    if (!fetched.ok || fetched.buffer.length === 0) {
      return {
        ok: false,
        errorMessage: `Could not download video (${fetched.status}). Upload MP4/H.264 to Cloudflare R2 (pub-*.r2.dev) and use that URL.`,
      };
    }

    let mime =
      fetched.contentType && fetched.contentType.startsWith("video/")
        ? fetched.contentType
        : "video/mp4";
    mime = mime.split(";")[0].trim().toLowerCase();

    const too = assertSize(fetched.buffer, mime.startsWith("video/") ? mime : "video/mp4");
    if (too) return { ok: false, errorMessage: too };

    const uploaded = await uploadOutboundUserMedia({
      userId,
      buffer: fetched.buffer,
      contentType: mime,
      originChannel: "meta-template-send-video",
    });
    console.log(
      `[TEMPLATE_MEDIA_MIRROR_OK] ${JSON.stringify({ templateName, role: "video", mime, sourceBucket })}`
    );
    return { ok: true, newUrl: uploaded.mediaUrl };
  }

  /** Image */
  /** Carousel slides: always re-encode to JPEG (fixes PNG/transparency/format strictness issues). */
  if (inCarousel) {
    const fetched = await fetchBinary(trimmed, metaBearer);
    if (!fetched.ok || fetched.buffer.length === 0) {
      return { ok: false, errorMessage: `Could not fetch carousel image (${fetched.status}).` };
    }

    /** Log response content-type seen from CDN/R2 GET */
    console.log(
      `[TEMPLATE_MEDIA_CAROUSEL_IMAGE_FETCH_HEADERS] ${JSON.stringify({
        templateName,
        contentTypeFetch: fetched.contentType || null,
        byteLength: fetched.buffer.length,
        sourceBucket,
      })}`
    );

    const inferred = waOutboundMediaKindFromMime(fetched.contentType || "application/octet-stream");
    if (inferred !== "image") {
      return {
        ok: false,
        errorMessage: `Carousel card media must be an image (got "${fetched.contentType || "?"}").`,
      };
    }

    const normal = await jpegNormalizeWithLogging(fetched.buffer, {
      templateName,
      role: "carousel_image_jpeg",
      sourceBucket,
    });
    if (!normal.ok) {
      return { ok: false, errorMessage: `Carousel image normalization failed: ${normal.errorMessage}` };
    }

    const too = assertSize(normal.buffer, "image/jpeg");
    if (too) return { ok: false, errorMessage: too };

    const uploaded = await uploadOutboundUserMedia({
      userId,
      buffer: normal.buffer,
      contentType: "image/jpeg",
      originChannel: "meta-template-send-carousel-img",
    });
    console.log(
      `[TEMPLATE_MEDIA_MIRROR_OK] ${JSON.stringify({
        templateName,
        role: "carousel_jpeg_uploaded",
        sourceBucket,
        contentTypeUploaded: "image/jpeg",
      })}`
    );
    return { ok: true, newUrl: uploaded.mediaUrl };
  }

  /** Non-carousel header images: stable R2 + confirmed JPEG HEAD can skip rewrite */
  if (onStableR2 && !onEphemeralWhatsAppFamily) {
    const ct = await headContentType(trimmed);
    console.log(
      `[TEMPLATE_MEDIA_HEADER_IMAGE_HEAD] ${JSON.stringify({
        templateName,
        bucket: sourceBucket,
        contentTypeHead: ct,
      })}`
    );
    if (ct === "image/jpeg" || ct === "image/jpg") {
      console.log(
        `[TEMPLATE_MEDIA_MIRROR_SKIP] ${JSON.stringify({
          templateName,
          role: "header_image",
          reason: "stable_r2_jpeg_confirmed_head",
        })}`
      );
      return { ok: true, newUrl: trimmed };
    }
  }

  const fetched = await fetchBinary(trimmed, metaBearer);
  if (!fetched.ok || fetched.buffer.length === 0) {
    return { ok: false, errorMessage: `Could not fetch header image (${fetched.status}).` };
  }

  console.log(
    `[TEMPLATE_MEDIA_HEADER_IMAGE_FETCH_HEADERS] ${JSON.stringify({
      templateName,
      contentTypeFetch: fetched.contentType || null,
      byteLength: fetched.buffer.length,
      sourceBucket,
    })}`
  );

  const inferred = waOutboundMediaKindFromMime(fetched.contentType || "application/octet-stream");
  if (inferred !== "image") {
    return {
      ok: false,
      errorMessage: `Template header image expected (got "${fetched.contentType || "?"}").`,
    };
  }

  const normal = await jpegNormalizeWithLogging(fetched.buffer, {
    templateName,
    role: "header_image_jpeg",
    sourceBucket,
  });
  if (!normal.ok) {
    return { ok: false, errorMessage: normal.errorMessage };
  }

  const too = assertSize(normal.buffer, "image/jpeg");
  if (too) return { ok: false, errorMessage: too };

  const uploaded = await uploadOutboundUserMedia({
    userId,
    buffer: normal.buffer,
    contentType: "image/jpeg",
    originChannel: "meta-template-send-header-img",
  });
  console.log(
    `[TEMPLATE_MEDIA_MIRROR_OK] ${JSON.stringify({
      templateName,
      role: "header_jpeg_uploaded",
      sourceBucket,
    })}`
  );
  return { ok: true, newUrl: uploaded.mediaUrl };
}

async function mutateLinkReplacing(
  holder: LinkHolder,
  mediaKind: MediaKindInPayload,
  ctx: {
    userId: string;
    metaBearer: string | null;
    templateName: string;
    urlMap: Record<string, string>;
    inCarousel: boolean;
  }
): Promise<{ ok: true } | { ok: false; errorMessage: string }> {
  const link = typeof holder.link === "string" ? holder.link.trim() : "";
  if (!/^https?:\/\//i.test(link)) return { ok: true };

  const normalized = await normalizeOneMediaUrl({
    url: link,
    userId: ctx.userId,
    metaBearer: ctx.metaBearer,
    mediaKind,
    inCarousel: ctx.inCarousel,
    templateName: ctx.templateName,
  });
  if (!normalized.ok) return normalized;
  holder.link = normalized.newUrl;
  if (normalized.newUrl !== link) ctx.urlMap[link] = normalized.newUrl;
  console.log(`[TEMPLATE_MEDIA_NORMALIZE_SUCCESS] ${JSON.stringify({ templateName: ctx.templateName, mediaKind, inCarousel: ctx.inCarousel })}`);
  return { ok: true };
}

async function walkComponents(
  components: Record<string, unknown>[] | undefined,
  outerInCarousel: boolean,
  carouselMode: boolean,
  ctxBase: Omit<Parameters<typeof mutateLinkReplacing>[2], "inCarousel">
): Promise<{ ok: true } | { ok: false; errorMessage: string }> {
  if (!components || components.length === 0) return { ok: true };

  for (const comp of components) {
    if (!comp || typeof comp !== "object") continue;

    const type = String((comp as { type?: string }).type || "").toLowerCase();

    if (type === "carousel" && Array.isArray((comp as { cards?: unknown }).cards)) {
      const cards = (comp as { cards: Array<{ components?: Record<string, unknown>[] }> }).cards;
      for (const card of cards) {
        const nested = Array.isArray(card?.components) ? card.components : [];
        const inner = await walkComponents(
          nested as Record<string, unknown>[],
          true,
          carouselMode,
          ctxBase
        );
        if (!inner.ok) return inner;
      }
      continue;
    }

    const params = (comp as { parameters?: unknown }).parameters;
    if (!Array.isArray(params)) continue;

    const ctx: Parameters<typeof mutateLinkReplacing>[2] = {
      ...ctxBase,
      inCarousel: carouselMode || outerInCarousel,
    };

    for (const p of params) {
      if (!p || typeof p !== "object") continue;
      const pt = String((p as { type?: string }).type || "").toLowerCase();

      if (pt === "image") {
        const img = (p as { image?: LinkHolder }).image;
        if (img && typeof img.link === "string") {
          const r = await mutateLinkReplacing(img, "image", ctx);
          if (!r.ok) return r;
        }
      } else if (pt === "video") {
        const vid = (p as { video?: LinkHolder }).video;
        if (vid && typeof vid.link === "string") {
          const r = await mutateLinkReplacing(vid, "video", { ...ctx, inCarousel: false });
          if (!r.ok) return r;
        }
      } else if (pt === "document") {
        const doc = (p as { document?: LinkHolder }).document;
        if (doc && typeof doc.link === "string") {
          const r = await mutateLinkReplacing(doc, "document", { ...ctx, inCarousel: false });
          if (!r.ok) return r;
        }
      }
    }
  }

  return { ok: true };
}

export type NormalizeTemplatePayloadInput = {
  userId: string;
  components: Record<string, unknown>[] | undefined;
  /** Carousel templates — every card HEADER image normalized to JPEG. */
  carouselMode: boolean;
  templateName: string;
};

export type NormalizeTemplatePayloadResult =
  | { ok: true; urlMap: Record<string, string> }
  | { ok: false; errorMessage: string; errorCode: string };

/**
 * Rewrite `image|video|document.link` URLs inside WhatsApp Cloud API template `components`
 * enforcing stable public R2 + JPEG for carousel / header images.
 */
export async function normalizeTemplatePayloadMediaUrls(
  input: NormalizeTemplatePayloadInput
): Promise<NormalizeTemplatePayloadResult> {
  const { userId, components, carouselMode, templateName } = input;

  console.log(`[TEMPLATE_MEDIA_NORMALIZE_PIPELINE] ${JSON.stringify({ templateName, carouselMode })}`);

  if (!components || components.length === 0) {
    return { ok: true, urlMap: {} };
  }

  const metaBearer = await getMetaAccessToken(userId);
  const urlMap: Record<string, string> = {};

  const walked = await walkComponents(
    components,
    false,
    carouselMode,
    { userId, metaBearer, templateName, urlMap }
  );
  if (!walked.ok) {
    return {
      ok: false,
      errorMessage: walked.errorMessage,
      errorCode: "MEDIA_TEMPLATE_NORMALIZE_FAILED",
    };
  }

  return { ok: true, urlMap };
}
