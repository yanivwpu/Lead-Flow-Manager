/**
 * Unified inbound media persistence: download from provider immediately,
 * store bytes in Cloudflare R2 (S3 API) when configured, else Replit object
 * storage or local /uploads (same behaviour as /api/media/upload).
 */

import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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
  /fbcdn\.net|facebook\.com|fbsbx\.com|lookaside\.fbsbx\.com|instagram\.com|twilio\.com|graph\.facebook\.com/i;

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

async function putR2Object(key: string, body: Buffer, contentType: string): Promise<string> {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID!;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  const base = process.env.CLOUDFLARE_R2_PUBLIC_URL!.replace(/\/$/, "");
  return `${base}/${key}`;
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
  const providerMediaUrlOut = downloadUrl;
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

/** Authenticated composer / widget uploads — R2 when configured, else legacy object storage or /uploads. */
export async function uploadOutboundUserMedia(params: {
  userId: string;
  buffer: Buffer;
  contentType: string;
  originChannel?: string;
}): Promise<{ mediaUrl: string; mediaStorageKey: string }> {
  const { userId, buffer, contentType, originChannel = "composer-upload" } = params;
  const ext = extFromMime(contentType, "image");
  const uuid = randomUUID();
  const storageKey = `media/${userId}/${normalizeChannelSegment(originChannel)}/${uuid}${ext}`;
  if (r2Configured()) {
    await putR2Object(storageKey, buffer, contentType);
    const base = process.env.CLOUDFLARE_R2_PUBLIC_URL!.replace(/\/$/, "");
    return { mediaUrl: `${base}/${storageKey}`, mediaStorageKey: storageKey };
  }
  const flatName = `${uuid}${ext}`;
  const fb = await putFallbackObjectOrLocal(flatName, buffer, contentType);
  return { mediaUrl: fb.publicUrl, mediaStorageKey: fb.storageKey };
}
