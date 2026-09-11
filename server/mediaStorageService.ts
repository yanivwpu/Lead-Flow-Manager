/**
 * Unified inbound media persistence: download from provider immediately,
 * store bytes in Cloudflare R2 (S3 API) when configured, else Replit object
 * storage or local /uploads (same behaviour as /api/media/upload).
 */

import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/ogg": ".ogg",
  "audio/opus": ".opus",
  "audio/amr": ".amr",
  "application/pdf": ".pdf",
  "application/octet-stream": ".bin",
};

const TRANSIENT_HOST_RE =
  /fbcdn\.net|facebook\.com|fbsbx\.com|lookaside\.fbsbx\.com|instagram\.com|twilio\.com|graph\.facebook\.com|\.whatsapp\.net$/i;

export function isAlreadyCanonicalPermanentUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== "string") return false;
  const u = url.trim();
  if (u.startsWith("blob:") || u.startsWith("/")) return true;
  if (!/^https?:\/\//i.test(u)) return false;
  try {
    const parsed = new URL(u);
    if (TRANSIENT_HOST_RE.test(parsed.hostname)) return false;
    const r2Base = process.env.CLOUDFLARE_R2_PUBLIC_URL?.replace(/\/$/, "");
    if (r2Base && u.startsWith(r2Base)) return true;
    if (u.includes("/objects/uploads/")) return true;
    const app = (process.env.APP_URL || "").replace(/\/$/, "");
    if (app && u.startsWith(`${app}/uploads/`)) return true;
    if (u.includes("/uploads/") && app && u.startsWith(app)) return true;
    // Treat any other https URL we did not mark transient as "might be permanent" (e.g. CDN you control)
    return !TRANSIENT_HOST_RE.test(parsed.hostname);
  } catch {
    return false;
  }
}

export function looksLikeTransientProviderUrl(url: string | undefined | null): boolean {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    return TRANSIENT_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function normalizeChannelSegment(channel: string): string {
  const c = (channel || "unknown").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return c.slice(0, 32) || "unknown";
}

function extFromMime(mime: string, contentCategory: string): string {
  const base = (mime || "").split(";")[0].trim().toLowerCase();
  if (base && MIME_TO_EXT[base]) return MIME_TO_EXT[base];
  switch (contentCategory) {
    case "image":
      return ".jpg";
    case "video":
      return ".mp4";
    case "audio":
      return ".ogg";
    case "document":
      return ".pdf";
    default:
      return ".bin";
  }
}

async function fetchBytes(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; buffer: Buffer; contentType: string }> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    return { ok: false, buffer: Buffer.alloc(0), contentType: "" };
  }
  const ab = await res.arrayBuffer();
  return {
    ok: true,
    buffer: Buffer.from(ab),
    contentType: res.headers.get("content-type")?.split(";")[0].trim() || "application/octet-stream",
  };
}

async function downloadFacebookStyleUrl(accessToken: string | undefined, url: string) {
  let first = await fetchBytes(url);
  if (first.ok && first.buffer.length > 0) return first;
  if (!accessToken) return first;
  const withTok =
    url.includes("access_token=") ? url : `${url}${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(accessToken)}`;
  const second = await fetchBytes(withTok);
  if (second.ok) return second;
  return await fetchBytes(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

function r2Configured(): boolean {
  return !!(
    process.env.CLOUDFLARE_R2_ACCOUNT_ID &&
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
    process.env.CLOUDFLARE_R2_BUCKET &&
    process.env.CLOUDFLARE_R2_PUBLIC_URL
  );
}

function r2S3Config() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID!;
  return {
    region: "auto" as const,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
    },
    // AWS SDK v3 default CRC32 checksums are rejected by Cloudflare R2.
    requestChecksumCalculation: "WHEN_REQUIRED" as const,
    responseChecksumValidation: "WHEN_REQUIRED" as const,
  };
}

async function putR2Object(key: string, body: Buffer, contentType: string): Promise<string> {
  const keyKind = key.startsWith("uploads/")
    ? "uploads"
    : key.includes("/widget-logo/")
      ? "tenant-widget-logo"
      : key.includes("/web-upload/")
        ? "tenant-web-upload"
        : "other";
  try {
    const client = new S3Client(r2S3Config());
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET!,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    const base = process.env.CLOUDFLARE_R2_PUBLIC_URL!.replace(/\/$/, "");
    // #region agent log
    fetch('http://127.0.0.1:7388/ingest/30f90c73-9e82-48da-9aa8-296c7e653663',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b3c3c'},body:JSON.stringify({sessionId:'5b3c3c',hypothesisId:'B',location:'mediaStorageService.ts:putR2Object',message:'r2 put ok',data:{keyKind,bytes:body.length,mime:contentType.split(';')[0]},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return `${base}/${key}`;
  } catch (err: unknown) {
    const e = err as { name?: string; Code?: string; code?: string; $metadata?: { httpStatusCode?: number } };
    // #region agent log
    fetch('http://127.0.0.1:7388/ingest/30f90c73-9e82-48da-9aa8-296c7e653663',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b3c3c'},body:JSON.stringify({sessionId:'5b3c3c',hypothesisId:'B',location:'mediaStorageService.ts:putR2Object',message:'r2 put failed',data:{keyKind,errName:e?.name||'Error',errCode:e?.Code||e?.code||null,httpStatus:e?.$metadata?.httpStatusCode||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw err;
  }
}

async function putFallbackObjectOrLocal(
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<{ publicUrl: string; storageKey: string }> {
  const appUrl = (process.env.APP_URL || `https://${(process.env.REPLIT_DOMAINS || "").split(",")[0]}`).replace(/\/$/, "");
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;

  if (privateObjectDir) {
    const dirParts = privateObjectDir.split("/").filter(Boolean);
    const bucketName = dirParts[0];
    const prefix = dirParts.slice(1).join("/");
    const objectName = `${prefix}/uploads/${filename}`;
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    await file.save(buffer, {
      contentType,
      metadata: { "Cache-Control": "public, max-age=31536000" },
    });
    return {
      publicUrl: `${appUrl}/objects/uploads/${filename}`,
      storageKey: objectName,
    };
  }

  const uploadDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, buffer);
  return {
    publicUrl: `${appUrl}/uploads/${filename}`,
    storageKey: `uploads/${filename}`,
  };
}

export type PersistInboundMediaAuth =
  | { kind: "public" }
  | { kind: "meta-page-bearer"; accessToken: string }
  | { kind: "meta-whatsapp-user"; userId: string }
  | { kind: "twilio-basic"; accountSid: string; authToken: string }
  | { kind: "telegram"; botToken: string; fileId: string };

export type PersistInboundMediaInput = {
  channel: string;
  userId: string;
  /** WhatsApp Meta media id, Telegram file_id, etc. */
  providerMediaId?: string | null;
  /** Expiring or signed provider URL (Facebook/Instagram/Twilio media URL) */
  providerMediaUrl?: string | null;
  /** image | video | audio | document | text (treated as attachment) */
  mediaType: string;
  mimeType?: string | null;
  filename?: string | null;
  auth: PersistInboundMediaAuth;
};

export type PersistInboundMediaResult = {
  mediaUrl: string;
  mediaStorageKey: string;
  mediaMimeType: string;
  mediaFilename: string | null;
  mediaSize: number;
  mediaStoredAt: Date;
  providerMediaUrl: string | null;
  providerMediaId: string | null;
};

/**
 * Download inbound media and store to R2 (preferred) or legacy object storage /uploads.
 * Returns null if nothing to store or download fails.
 */
export async function persistInboundMedia(input: PersistInboundMediaInput): Promise<PersistInboundMediaResult | null> {
  const { channel, userId, mediaType: rawCat, mimeType: inputMime, filename, auth } = input;
  const contentCategory =
    rawCat === "image" || rawCat === "video" || rawCat === "audio" || rawCat === "document"
      ? rawCat
      : rawCat === "sticker"
        ? "image"
        : "document";

  let downloadUrl: string | null = input.providerMediaUrl?.trim() || null;
  let buffer: Buffer | null = null;
  let resolvedMime = inputMime?.split(";")[0].trim() || "";
  let providerMediaUrlOut = downloadUrl;
  const providerMediaIdOut = input.providerMediaId?.trim() || null;

  // --- Telegram: resolve file_path from file_id ---
  if (auth.kind === "telegram") {
    const r = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(auth.botToken)}/getFile?file_id=${encodeURIComponent(auth.fileId)}`
    );
    const j = (await r.json()) as { ok?: boolean; result?: { file_path?: string } };
    if (!j.ok || !j.result?.file_path) {
      console.warn("[mediaStorage] telegram getFile failed", { ok: j.ok });
      return null;
    }
    downloadUrl = `https://api.telegram.org/file/bot${auth.botToken}/${j.result.file_path}`;
  }

  // --- WhatsApp Cloud: graph media id → temporary URL → bytes ---
  if (!downloadUrl && providerMediaIdOut && auth.kind === "meta-whatsapp-user") {
    const { getMediaUrl, downloadMedia } = await import("./userMeta");
    const fresh = await getMediaUrl(auth.userId, providerMediaIdOut);
    if (!fresh) {
      console.warn("[mediaStorage] WhatsApp getMediaUrl returned null", { providerMediaId: providerMediaIdOut });
      return null;
    }
    providerMediaUrlOut = fresh;
    const buf = await downloadMedia(auth.userId, fresh);
    if (!buf || buf.length === 0) return null;
    buffer = buf;
    if (!resolvedMime) {
      resolvedMime =
        contentCategory === "image"
          ? "image/jpeg"
          : contentCategory === "video"
            ? "video/mp4"
            : contentCategory === "audio"
              ? "audio/ogg"
              : "application/octet-stream";
    }
  }

  if (!buffer) {
    if (!downloadUrl) {
      return null;
    }

    if (auth.kind === "twilio-basic") {
      const basic = Buffer.from(`${auth.accountSid}:${auth.authToken}`).toString("base64");
      const got = await fetchBytes(downloadUrl, {
        headers: { Authorization: `Basic ${basic}` },
      });
      if (!got.ok || got.buffer.length === 0) return null;
      buffer = got.buffer;
      if (!resolvedMime) resolvedMime = got.contentType;
    } else if (auth.kind === "meta-page-bearer") {
      const got = await downloadFacebookStyleUrl(auth.accessToken, downloadUrl);
      if (!got.ok || got.buffer.length === 0) return null;
      buffer = got.buffer;
      if (!resolvedMime) resolvedMime = got.contentType;
    } else {
      const got = await fetchBytes(downloadUrl);
      if (!got.ok || got.buffer.length === 0) return null;
      buffer = got.buffer;
      if (!resolvedMime) resolvedMime = got.contentType;
    }
  }

  if (!buffer || buffer.length === 0) return null;

  if (!resolvedMime) resolvedMime = "application/octet-stream";

  const ext = extFromMime(resolvedMime, contentCategory);
  const uuid = randomUUID();
  const storageKey = `media/${userId}/${normalizeChannelSegment(channel)}/${uuid}${ext}`;

  const safeFilename = filename?.trim() || `file${ext}`;

  let publicUrl: string;
  let keyOut: string;

  if (r2Configured()) {
    await putR2Object(storageKey, buffer, resolvedMime);
    const base = process.env.CLOUDFLARE_R2_PUBLIC_URL!.replace(/\/$/, "");
    publicUrl = `${base}/${storageKey}`;
    keyOut = storageKey;
  } else {
    const flatName = `${uuid}${ext}`;
    const fb = await putFallbackObjectOrLocal(flatName, buffer, resolvedMime);
    publicUrl = fb.publicUrl;
    keyOut = fb.storageKey;
  }

  const now = new Date();
  return {
    mediaUrl: publicUrl,
    mediaStorageKey: keyOut,
    mediaMimeType: resolvedMime,
    mediaFilename: safeFilename,
    mediaSize: buffer.length,
    mediaStoredAt: now,
    providerMediaUrl: providerMediaUrlOut,
    providerMediaId: providerMediaIdOut,
  };
}

const PUBLIC_UPLOAD_FILENAME_RE = /^[\w][\w-]*\.(jpg|jpeg|png|webp|pdf|mp3|m4a|ogg|mp4)$/i;

export function isPublicUploadObjectFilename(filename: string): boolean {
  return (
    typeof filename === "string" &&
    PUBLIC_UPLOAD_FILENAME_RE.test(filename) &&
    !filename.includes("..") &&
    !filename.includes("/") &&
    !filename.includes("\\")
  );
}

export const WIDGET_LOGO_ORIGIN_CHANNEL = "web-upload";

function outboundObjectBasename(objectBasename: string | undefined, ext: string): string {
  const name = String(objectBasename || "").trim();
  if (name && isPublicUploadObjectFilename(name) && name.toLowerCase().endsWith(ext.toLowerCase())) {
    return name;
  }
  return `${randomUUID()}${ext}`;
}

/** Authenticated composer / widget uploads — R2 when configured, else legacy object storage or /uploads. */
export async function uploadOutboundUserMedia(params: {
  userId: string;
  buffer: Buffer;
  contentType: string;
  originChannel?: string;
  objectBasename?: string;
}): Promise<{ mediaUrl: string; mediaStorageKey: string }> {
  const { userId, buffer, contentType, originChannel = "composer-upload" } = params;
  const baseMime = contentType.split(";")[0]?.trim()?.toLowerCase() || "";
  const category: "image" | "video" | "audio" | "document" = baseMime.startsWith("video/")
    ? "video"
    : baseMime.startsWith("audio/")
      ? "audio"
      : baseMime === "application/pdf" ||
          baseMime.includes("msword") ||
          baseMime.includes("spreadsheet") ||
          baseMime.includes("wordprocessing") ||
          baseMime === "application/vnd.ms-excel"
        ? "document"
        : "image";
  const ext = extFromMime(contentType, category);
  const objectName = outboundObjectBasename(params.objectBasename, ext);
  const storageKey = `media/${userId}/${normalizeChannelSegment(originChannel)}/${objectName}`;
  const keyKind = storageKey.includes("/web-upload/")
    ? "tenant-web-upload"
    : storageKey.startsWith("uploads/")
      ? "uploads"
      : "other";
  // #region agent log
  fetch('http://127.0.0.1:7388/ingest/30f90c73-9e82-48da-9aa8-296c7e653663',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b3c3c'},body:JSON.stringify({sessionId:'5b3c3c',hypothesisId:'A',location:'mediaStorageService.ts:uploadOutboundUserMedia',message:'outbound media key',data:{keyKind,originChannel:normalizeChannelSegment(originChannel),hasObjectBasename:Boolean(params.objectBasename),r2Enabled:r2Configured()},timestamp:Date.now(),runId:'fix'})}).catch(()=>{});
  // #endregion
  if (r2Configured()) {
    await putR2Object(storageKey, buffer, contentType);
    const base = process.env.CLOUDFLARE_R2_PUBLIC_URL!.replace(/\/$/, "");
    return { mediaUrl: `${base}/${storageKey}`, mediaStorageKey: storageKey };
  }
  const fb = await putFallbackObjectOrLocal(objectName, buffer, contentType);
  return { mediaUrl: fb.publicUrl, mediaStorageKey: fb.storageKey };
}

function tenantMediaPrefix(userId: string): string {
  return `media/${userId}/`;
}

function r2Client(): S3Client {
  return new S3Client(r2S3Config());
}

function inferOwnedStorageKey(params: {
  userId: string;
  mediaUrl?: string | null;
}): string | null {
  const url = String(params.mediaUrl || "").trim();
  if (!url) return null;
  const prefix = tenantMediaPrefix(params.userId);
  try {
    if (url.startsWith("/objects/uploads/")) {
      return `uploads/${url.slice("/objects/uploads/".length).split("?")[0]}`;
    }
    if (url.startsWith("/uploads/")) {
      return `uploads/${url.slice("/uploads/".length).split("?")[0]}`;
    }
    const parsed = new URL(url, "https://placeholder.local");
    const pathName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    const r2Base = (process.env.CLOUDFLARE_R2_PUBLIC_URL || "").replace(/\/$/, "");
    if (r2Base && url.startsWith(r2Base)) {
      const key = url.slice(r2Base.length).replace(/^\/+/, "").split("?")[0];
      return key || null;
    }
    const mediaIdx = pathName.indexOf(prefix);
    if (mediaIdx >= 0) return pathName.slice(mediaIdx);
    if (pathName.startsWith("objects/uploads/")) {
      return `uploads/${pathName.slice("objects/uploads/".length)}`;
    }
    if (pathName.startsWith("uploads/")) return pathName;
  } catch {
    return null;
  }
  return null;
}

function isOwnedStorageKey(userId: string, key: string): boolean {
  const normalized = key.replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) return false;
  if (normalized.startsWith("media/")) return normalized.startsWith(tenantMediaPrefix(userId));
  return normalized.startsWith("uploads/");
}

async function readR2Object(key: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const res = await r2Client().send(
      new GetObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET!,
        Key: key,
      }),
    );
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    const mimeType =
      (typeof res.ContentType === "string" && res.ContentType.split(";")[0].trim()) ||
      "application/octet-stream";
    return { buffer: Buffer.from(bytes), mimeType };
  } catch {
    return null;
  }
}

async function readFallbackObject(key: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const filename = key.replace(/^uploads\//, "").replace(/^objects\/uploads\//, "");
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return null;
  }
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (privateObjectDir) {
    try {
      const dirParts = privateObjectDir.split("/").filter(Boolean);
      const bucketName = dirParts[0];
      const prefix = dirParts.slice(1).join("/");
      const objectName = `${prefix}/uploads/${filename}`;
      const [buf] = await objectStorageClient.bucket(bucketName).file(objectName).download();
      return { buffer: Buffer.from(buf), mimeType: "application/octet-stream" };
    } catch {
      /* try local */
    }
  }
  const filePath = path.resolve(path.join(process.cwd(), "uploads", filename));
  const uploadDir = path.resolve(path.join(process.cwd(), "uploads"));
  if (!filePath.startsWith(uploadDir + path.sep) && filePath !== uploadDir) return null;
  if (!fs.existsSync(filePath)) return null;
  return { buffer: fs.readFileSync(filePath), mimeType: "application/octet-stream" };
}

function mimeFromPublicUploadFilename(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".mp4") return "video/mp4";
  return "application/octet-stream";
}

export function sanitizeWidgetLogoOwnerId(userId: string): string {
  return String(userId || "").replace(/[^\w-]/g, "").slice(0, 36) || "user";
}

export const WIDGET_LOGO_PUBLIC_DELIM = "__";

export function ownerFromWidgetLogoFilename(filename: string): string | null {
  const parsed = widgetLogoObjectFromPublicFilename(filename);
  return parsed?.owner ?? null;
}

export function widgetLogoObjectFromPublicFilename(
  filename: string,
): { owner: string; objectName: string } | null {
  if (!isPublicUploadObjectFilename(filename) || !/\.(jpg|jpeg|png|webp)$/i.test(filename)) return null;
  const delim = filename.indexOf(WIDGET_LOGO_PUBLIC_DELIM);
  if (delim <= 0) return null;
  const owner = filename.slice(0, delim);
  const objectName = filename.slice(delim + WIDGET_LOGO_PUBLIC_DELIM.length);
  if (owner !== sanitizeWidgetLogoOwnerId(owner)) return null;
  if (!isPublicUploadObjectFilename(objectName) || objectName.includes("/") || objectName.includes("\\")) {
    return null;
  }
  if (!/\.(jpg|jpeg|png|webp)$/i.test(objectName)) return null;
  return { owner, objectName };
}

export function publicWidgetLogoFilename(userId: string, objectName: string): string {
  const owner = sanitizeWidgetLogoOwnerId(userId);
  const name = String(objectName || "").replace(/^\/+/, "").split("/").pop() || "";
  return `${owner}${WIDGET_LOGO_PUBLIC_DELIM}${name}`;
}

export function widgetLogoStorageKey(userId: string, objectName: string): string {
  return `media/${userId}/${WIDGET_LOGO_ORIGIN_CHANNEL}/${objectName}`;
}

export function inboxWebUploadObjectName(userId: string, mediaStorageKey: string): string | null {
  const key = String(mediaStorageKey || "").replace(/^\/+/, "");
  const prefix = `media/${userId}/${WIDGET_LOGO_ORIGIN_CHANNEL}/`;
  if (!key.startsWith(prefix) || key.includes("..") || key.includes("\\") || key.includes("//")) return null;
  const objectName = key.slice(prefix.length);
  if (!objectName || objectName.includes("/") || !isPublicUploadObjectFilename(objectName)) return null;
  if (!/\.(jpg|jpeg|png|webp)$/i.test(objectName)) return null;
  if (!isAllowedWidgetLogoStorageKey(key)) return null;
  return objectName;
}

export function isAllowedWidgetLogoStorageKey(key: string): boolean {
  if (!key || key.includes("..") || key.includes("\\") || key.includes("//")) return false;
  return /^media\/[\w][\w-]*\/web-upload\/[\w][\w-]*\.(jpg|jpeg|png|webp)$/i.test(key);
}

export function widgetLogoReadKeys(filename: string): string[] {
  const parsed = widgetLogoObjectFromPublicFilename(filename);
  if (!parsed) return [];
  const key = `media/${parsed.owner}/${WIDGET_LOGO_ORIGIN_CHANNEL}/${parsed.objectName}`;
  return isAllowedWidgetLogoStorageKey(key) ? [key] : [];
}

export class WidgetLogoStorageUnavailableError extends Error {
  readonly code = "LOGO_STORAGE_UNAVAILABLE";
  readonly awsCode: string | null;
  readonly awsHttpStatus: number | null;
  constructor(cause?: unknown) {
    super("Logo storage is temporarily unavailable.");
    this.name = "WidgetLogoStorageUnavailableError";
    const e = cause as {
      name?: string;
      Code?: string;
      code?: string;
      $metadata?: { httpStatusCode?: number };
    } | undefined;
    const wrapped = e?.name === "WidgetLogoStorageUnavailableError";
    this.awsCode = wrapped ? null : e?.Code || e?.code || e?.name || null;
    this.awsHttpStatus = wrapped ? null : e?.$metadata?.httpStatusCode ?? null;
  }
}

export type WidgetLogoUploadFn = (params: {
  userId: string;
  buffer: Buffer;
  contentType: string;
  originChannel?: string;
  objectBasename?: string;
}) => Promise<{ mediaUrl: string; mediaStorageKey: string }>;

/** Widget logos call Inbox uploadOutboundUserMedia with the same args, then advertise /objects/uploads/... */
export async function storeWidgetLogoRaster(params: {
  buffer: Buffer | Uint8Array;
  mimeType: string;
  userId: string;
  upload?: WidgetLogoUploadFn;
  r2Enabled?: boolean;
}): Promise<{ logoUrl: string }> {
  const userId = String(params.userId || "").trim();
  const mimeType = (params.mimeType || "").split(";")[0].trim().toLowerCase();
  const body = Buffer.isBuffer(params.buffer) ? params.buffer : Buffer.from(params.buffer);
  const r2Enabled = params.r2Enabled ?? r2Configured();
  const mimeOk = mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp";
  // #region agent log
  fetch('http://127.0.0.1:7388/ingest/30f90c73-9e82-48da-9aa8-296c7e653663',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b3c3c'},body:JSON.stringify({sessionId:'5b3c3c',hypothesisId:'A',location:'mediaStorageService.ts:storeWidgetLogoRaster',message:'logo store start',data:{mimeOk,r2Enabled,originChannel:WIDGET_LOGO_ORIGIN_CHANNEL,hasObjectBasename:false,contentLength:body.length,userIdLen:userId.length},timestamp:Date.now(),runId:'post-fix'})}).catch(()=>{});
  // #endregion
  if (!userId || !mimeOk || body.length === 0) {
    throw new WidgetLogoStorageUnavailableError();
  }
  if (!r2Enabled) {
    // #region agent log
    fetch('http://127.0.0.1:7388/ingest/30f90c73-9e82-48da-9aa8-296c7e653663',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b3c3c'},body:JSON.stringify({sessionId:'5b3c3c',hypothesisId:'E',location:'mediaStorageService.ts:storeWidgetLogoRaster',message:'logo store skipped non-r2 fallback',data:{r2Enabled:false},timestamp:Date.now(),runId:'post-fix'})}).catch(()=>{});
    // #endregion
    throw new WidgetLogoStorageUnavailableError();
  }
  try {
    const upload = params.upload ?? uploadOutboundUserMedia;
    const stored = await upload({
      userId,
      buffer: body,
      contentType: mimeType,
      originChannel: WIDGET_LOGO_ORIGIN_CHANNEL,
    });
    const storedKey = String(stored.mediaStorageKey || "").replace(/^\/+/, "");
    const objectName = inboxWebUploadObjectName(userId, storedKey);
    const inboxShape = Boolean(objectName);
    // #region agent log
    fetch('http://127.0.0.1:7388/ingest/30f90c73-9e82-48da-9aa8-296c7e653663',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b3c3c'},body:JSON.stringify({sessionId:'5b3c3c',hypothesisId:'A',location:'mediaStorageService.ts:storeWidgetLogoRaster',message:'logo outbound upload returned',data:{keyKind:storedKey.includes('/web-upload/')?'tenant-web-upload':storedKey.startsWith('uploads/')?'uploads':'other',inboxShape,hasMediaUrl:Boolean(stored.mediaUrl),hasMediaStorageKey:Boolean(stored.mediaStorageKey)},timestamp:Date.now(),runId:'post-fix'})}).catch(()=>{});
    // #endregion
    if (!objectName) {
      throw new WidgetLogoStorageUnavailableError();
    }
    const publicName = publicWidgetLogoFilename(userId, objectName);
    if (!isPublicUploadObjectFilename(publicName)) {
      throw new WidgetLogoStorageUnavailableError();
    }
    return { logoUrl: `/objects/uploads/${publicName}` };
  } catch (err: unknown) {
    const e = err as { name?: string; Code?: string; code?: string; $metadata?: { httpStatusCode?: number } };
    // #region agent log
    fetch('http://127.0.0.1:7388/ingest/30f90c73-9e82-48da-9aa8-296c7e653663',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b3c3c'},body:JSON.stringify({sessionId:'5b3c3c',hypothesisId:'B',location:'mediaStorageService.ts:storeWidgetLogoRaster',message:'logo outbound upload failed',data:{errName:e?.name||'Error',errCode:e?.Code||e?.code||null,httpStatus:e?.$metadata?.httpStatusCode||null},timestamp:Date.now(),runId:'post-fix'})}).catch(()=>{});
    // #endregion
    if (err instanceof WidgetLogoStorageUnavailableError) throw err;
    throw new WidgetLogoStorageUnavailableError(err);
  }
}

export function ownedPublicUploadStorageKey(userId: string, publicUrl: string): string | null {
  const raw = String(publicUrl || "").trim();
  const filename = raw.startsWith("/objects/uploads/")
    ? raw.slice("/objects/uploads/".length).split("?")[0]
    : "";
  const parsed = widgetLogoObjectFromPublicFilename(filename);
  if (!parsed) return null;
  if (parsed.owner !== sanitizeWidgetLogoOwnerId(userId)) return null;
  const key = widgetLogoStorageKey(userId, parsed.objectName);
  return isAllowedWidgetLogoStorageKey(key) ? key : null;
}

/** Delete a tenant-owned first-party upload. Never deletes another workspace's object. */
export async function deleteOwnedPublicUploadObject(userId: string, publicUrl: string): Promise<boolean> {
  const key = ownedPublicUploadStorageKey(userId, publicUrl);
  if (!key || !r2Configured()) return false;
  try {
    await r2Client().send(
      new DeleteObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET!,
        Key: key,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function readPublicUploadObject(
  filename: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (!isPublicUploadObjectFilename(filename)) return null;
  const keys = widgetLogoReadKeys(filename);
  if (!r2Configured() || keys.length === 0) return null;
  for (const key of keys) {
    const fromR2 = await readR2Object(key);
    if (fromR2) {
      const mime =
        fromR2.mimeType && fromR2.mimeType !== "application/octet-stream"
          ? fromR2.mimeType
          : mimeFromPublicUploadFilename(filename);
      return { buffer: fromR2.buffer, mimeType: mime };
    }
  }
  return null;
}

/** Tenant-owned stored bytes only. Never follows another workspace's media/{userId}/ prefix. */
export async function readOwnedStoredMedia(params: {
  userId: string;
  mediaUrl?: string | null;
  mediaStorageKey?: string | null;
}): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const userId = String(params.userId || "").trim();
  if (!userId) return null;
  let key = String(params.mediaStorageKey || "").trim().replace(/^\/+/, "");
  if (key && !isOwnedStorageKey(userId, key)) return null;
  if (!key) {
    const inferred = inferOwnedStorageKey({ userId, mediaUrl: params.mediaUrl });
    if (!inferred || !isOwnedStorageKey(userId, inferred)) return null;
    key = inferred;
  }
  if (r2Configured() && key.startsWith(tenantMediaPrefix(userId))) {
    const fromR2 = await readR2Object(key);
    if (fromR2) return fromR2;
  }
  if (key.startsWith(tenantMediaPrefix(userId)) && r2Configured()) return null;
  return readFallbackObject(key);
}
