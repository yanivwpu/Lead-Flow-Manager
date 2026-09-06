/**
 * Time-limited visitor media delivery for Website Chat.
 * Tokens bind widget + visitor + message; bytes are tenant-owned storage only.
 */

import crypto from "crypto";
import sharp from "sharp";
import {
  inspectWebchatImageBuffer,
  isWebchatImageContentType,
  WEBCHAT_IMAGE_MAX_PIXELS,
  webchatVisitorMediaPath,
  type WebchatSafeImageMime,
} from "@shared/webchatImagePolicy";
import { readOwnedStoredMedia, uploadOutboundUserMedia } from "./mediaStorageService";

const WEAK_PLACEHOLDER = "webchat-media-dev-only";
const MIN_PROD_SECRET_LEN = 32;
export const WEBCHAT_VISITOR_MEDIA_TTL_SEC = 10 * 60;
export const WEBCHAT_INBOUND_MEDIA_ERROR_EVENT = "inbound_media_error";

export type WebchatMediaErrorCategory = "timeout" | "network" | "storage" | "payload" | "unknown";

const SAFE_TOKEN_RE = /^[A-Za-z0-9._-]{1,64}$/;
const SAFE_REQUEST_ID_RE = /^[A-Za-z0-9._-]{1,120}$/;
const TIMEOUT_TOKENS = new Set(["TimeoutError", "AbortError", "Timeout", "ETIMEDOUT", "ESOCKETTIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"]);
const NETWORK_TOKENS = new Set(["FetchError", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "EPIPE", "UND_ERR_SOCKET"]);
const STORAGE_TOKENS = new Set([
  "NoSuchKey",
  "NotFound",
  "AccessDenied",
  "NoSuchBucket",
  "InvalidObjectState",
  "SlowDown",
  "InternalError",
  "PermanentRedirect",
  "InvalidAccessKeyId",
  "SignatureDoesNotMatch",
  "NetworkingError",
]);
const PAYLOAD_TOKENS = new Set(["MulterError", "LIMIT_FILE_SIZE", "LIMIT_UNEXPECTED_FILE", "LIMIT_FILE_COUNT"]);

function safeErrorToken(value: unknown): string {
  if (typeof value !== "string") return "";
  const token = value.trim();
  return SAFE_TOKEN_RE.test(token) ? token : "";
}

function tokensFromUnknownError(error: unknown): string[] {
  if (!error || typeof error !== "object") return [];
  const record = error as { name?: unknown; code?: unknown; Code?: unknown };
  return [safeErrorToken(record.name), safeErrorToken(record.code), safeErrorToken(record.Code)].filter(Boolean);
}

export function classifyWebchatMediaError(error: unknown): WebchatMediaErrorCategory {
  const tokens = tokensFromUnknownError(error);
  if (tokens.some((token) => TIMEOUT_TOKENS.has(token))) return "timeout";
  if (tokens.some((token) => NETWORK_TOKENS.has(token))) return "network";
  if (tokens.some((token) => STORAGE_TOKENS.has(token))) return "storage";
  if (tokens.some((token) => PAYLOAD_TOKENS.has(token))) return "payload";
  return "unknown";
}

export function webchatInboundMediaErrorLog(params: {
  error: unknown;
  requestId?: string | null;
}): { event: string; requestId: string | null; category: WebchatMediaErrorCategory } {
  const requestId = typeof params.requestId === "string" && SAFE_REQUEST_ID_RE.test(params.requestId)
    ? params.requestId
    : null;
  return {
    event: WEBCHAT_INBOUND_MEDIA_ERROR_EVENT,
    requestId,
    category: classifyWebchatMediaError(params.error),
  };
}

export function logWebchatInboundMediaError(params: {
  error: unknown;
  requestId?: string | null;
}): void {
  console.error("[WebchatInboundMedia]", webchatInboundMediaErrorLog(params));
}

function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production";
}

export function resolveWebchatMediaSecretMaterial(
  env: NodeJS.ProcessEnv = process.env,
): { secret: string; source: string } | { secret: null; reason: string } {
  const dedicated = String(env.WEBCHAT_MEDIA_SECRET || "").trim();
  if (dedicated && dedicated !== WEAK_PLACEHOLDER) {
    if (isProductionRuntime(env) && dedicated.length < MIN_PROD_SECRET_LEN) {
      return { secret: null, reason: "secret_too_short" };
    }
    return { secret: dedicated, source: "WEBCHAT_MEDIA_SECRET" };
  }
  const session = String(env.SESSION_SECRET || "").trim();
  if (session && session !== WEAK_PLACEHOLDER) {
    if (isProductionRuntime(env) && session.length < MIN_PROD_SECRET_LEN) {
      return { secret: null, reason: "session_secret_too_short" };
    }
    return { secret: session, source: "SESSION_SECRET" };
  }
  if (isProductionRuntime(env)) {
    return { secret: null, reason: "missing_WEBCHAT_MEDIA_SECRET" };
  }
  return { secret: null, reason: "no_dev_secret_configured" };
}

function signingSecret(): string | null {
  const resolved = resolveWebchatMediaSecretMaterial();
  return resolved.secret;
}

export function webchatMediaSignPayload(
  widgetPublicId: string,
  visitorId: string,
  messageId: string,
  expiresUnixSec: number,
): string {
  return `${widgetPublicId}|${visitorId}|${messageId}|${expiresUnixSec}`;
}

export function signWebchatVisitorMedia(params: {
  widgetPublicId: string;
  visitorId: string;
  messageId: string;
  expiresUnixSec: number;
}): string | null {
  const secret = signingSecret();
  if (!secret) return null;
  const payload = webchatMediaSignPayload(
    params.widgetPublicId,
    params.visitorId,
    params.messageId,
    params.expiresUnixSec,
  );
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function verifyWebchatVisitorMedia(params: {
  widgetPublicId: string;
  visitorId: string;
  messageId: string;
  expiresUnixSec: number;
  signature: string;
  nowUnixSec?: number;
}): boolean {
  const now = params.nowUnixSec ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(params.expiresUnixSec) || params.expiresUnixSec < now) return false;
  const expected = signWebchatVisitorMedia(params);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(params.signature || ""));
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function buildSignedWebchatVisitorMediaUrl(params: {
  widgetPublicId: string;
  visitorId: string;
  messageId: string;
}): string | null {
  const expiresUnixSec = Math.floor(Date.now() / 1000) + WEBCHAT_VISITOR_MEDIA_TTL_SEC;
  const signature = signWebchatVisitorMedia({ ...params, expiresUnixSec });
  if (!signature) return null;
  const path = webchatVisitorMediaPath(params.widgetPublicId, params.visitorId, params.messageId);
  return `${path}?exp=${expiresUnixSec}&sig=${encodeURIComponent(signature)}`;
}

export async function sanitizeWebchatImageBuffer(
  buf: Buffer,
  mime: WebchatSafeImageMime,
): Promise<{ buffer: Buffer; mime: WebchatSafeImageMime } | null> {
  try {
    const pipeline = sharp(buf, {
      failOn: "error",
      limitInputPixels: WEBCHAT_IMAGE_MAX_PIXELS,
    }).rotate();
    if (mime === "image/jpeg") {
      return { buffer: await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer(), mime };
    }
    if (mime === "image/png") {
      return { buffer: await pipeline.png({ compressionLevel: 9 }).toBuffer(), mime };
    }
    return { buffer: await pipeline.webp({ quality: 88 }).toBuffer(), mime };
  } catch {
    return null;
  }
}

export async function prepareWebchatVisitorImage(params: {
  buffer: Buffer;
  declaredMime?: string | null;
}): Promise<
  | { ok: true; buffer: Buffer; mime: WebchatSafeImageMime }
  | { ok: false; reason: string }
> {
  const inspected = inspectWebchatImageBuffer(params.buffer, params.declaredMime);
  if (!inspected.ok) return { ok: false, reason: inspected.reason };
  const sanitized = await sanitizeWebchatImageBuffer(params.buffer, inspected.mime);
  if (!sanitized) return { ok: false, reason: "unsafe_type" };
  const again = inspectWebchatImageBuffer(sanitized.buffer, sanitized.mime);
  if (!again.ok) return { ok: false, reason: again.reason };
  return { ok: true, buffer: sanitized.buffer, mime: sanitized.mime };
}

export async function webchatVisitorMediaIsAvailable(params: {
  userId: string;
  mediaUrl?: string | null;
  mediaStorageKey?: string | null;
  contentType?: string | null;
}): Promise<boolean> {
  if (!isWebchatImageContentType(params.contentType || "image") && params.contentType) {
    if (params.contentType !== "image") return false;
  }
  if (!signingSecret()) return false;
  const stored = await readOwnedStoredMedia({
    userId: params.userId,
    mediaUrl: params.mediaUrl,
    mediaStorageKey: params.mediaStorageKey,
  });
  if (!stored) return false;
  const inspected = inspectWebchatImageBuffer(stored.buffer, stored.mimeType);
  return inspected.ok;
}

export async function loadWebchatVisitorImageBytes(params: {
  userId: string;
  mediaUrl?: string | null;
  mediaStorageKey?: string | null;
}): Promise<{ buffer: Buffer; mime: WebchatSafeImageMime } | null> {
  const stored = await readOwnedStoredMedia({
    userId: params.userId,
    mediaUrl: params.mediaUrl,
    mediaStorageKey: params.mediaStorageKey,
  });
  if (!stored) return null;
  const prepared = await prepareWebchatVisitorImage({
    buffer: stored.buffer,
    declaredMime: stored.mimeType,
  });
  if (!prepared.ok) {
    const inspected = inspectWebchatImageBuffer(stored.buffer);
    if (!inspected.ok) return null;
    return { buffer: stored.buffer, mime: inspected.mime };
  }
  return { buffer: prepared.buffer, mime: prepared.mime };
}

export async function storeWebchatVisitorImage(params: {
  userId: string;
  buffer: Buffer;
  mime: WebchatSafeImageMime;
}): Promise<{ mediaUrl: string; mediaStorageKey: string }> {
  return uploadOutboundUserMedia({
    userId: params.userId,
    buffer: params.buffer,
    contentType: params.mime,
    originChannel: "webchat",
  });
}
