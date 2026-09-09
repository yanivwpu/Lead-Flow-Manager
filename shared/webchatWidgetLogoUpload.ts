/**
 * Website Chat widget logo upload contract (browser-safe).
 * Do not use Node-only globals — this module is imported by WebsiteWidget.
 */

import {
  inspectWebchatImageBuffer,
  WEBCHAT_IMAGE_MAX_BYTES,
} from "./webchatImagePolicy";
import { sanitizeWidgetLogoUrl } from "./webchatWidgetBranding";

export const WIDGET_LOGO_UPLOAD_PATH = "/api/widget-settings/logo";
export const WIDGET_LOGO_MAX_BYTES = WEBCHAT_IMAGE_MAX_BYTES;
export const WIDGET_LOGO_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

export const WIDGET_LOGO_ERROR_CODE = {
  UNAUTHORIZED: "LOGO_UNAUTHORIZED",
  INVALID_TYPE: "LOGO_INVALID_TYPE",
  TOO_LARGE: "LOGO_TOO_LARGE",
  STORAGE_UNAVAILABLE: "LOGO_STORAGE_UNAVAILABLE",
  NO_FILE: "LOGO_NO_FILE",
} as const;

export type WidgetLogoErrorCode =
  (typeof WIDGET_LOGO_ERROR_CODE)[keyof typeof WIDGET_LOGO_ERROR_CODE];

export function publicWidgetLogoErrorMessage(code: string | undefined, fallback?: string): string {
  switch (code) {
    case WIDGET_LOGO_ERROR_CODE.UNAUTHORIZED:
      return "Please sign in again to upload a logo.";
    case WIDGET_LOGO_ERROR_CODE.INVALID_TYPE:
      return "Please upload a JPG, PNG, or WebP.";
    case WIDGET_LOGO_ERROR_CODE.TOO_LARGE:
      return "Logo must be smaller than 5 MB.";
    case WIDGET_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE:
      return "Logo storage is temporarily unavailable.";
    case WIDGET_LOGO_ERROR_CODE.NO_FILE:
      return "Choose a JPEG, PNG, or WebP file.";
    default:
      return fallback || "Logo storage is temporarily unavailable.";
  }
}

const FIRST_PARTY_LOGO_FILE =
  /^\/(?:objects\/uploads|uploads)\/([\w][\w-]*\.(jpg|jpeg|png|webp))$/i;

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export type WidgetLogoFileLike = {
  name: string;
  type: string;
  size: number;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

export type WidgetLogoUploadLock = { inFlight: boolean };

export type WidgetLogoUploadOutcome =
  | { ok: true; logoUrl: string; navigated: false }
  | { ok: false; error: string; navigated: false; skipped?: boolean };

/** Never return File, Event, blob/data URLs, or other non-strings into React state. */
export function coerceWidgetLogoUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw;
}

export function widgetLogoInspectError(
  reason: "empty" | "too_large" | "disguised" | "unsafe_type" | "mismatch" | string,
): string {
  switch (reason) {
    case "empty":
      return publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.NO_FILE);
    case "too_large":
      return publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.TOO_LARGE);
    case "disguised":
      return publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.INVALID_TYPE);
    case "unsafe_type":
      return publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.INVALID_TYPE);
    case "mismatch":
      return "File type does not match the image contents.";
    default:
      return publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.INVALID_TYPE);
  }
}

export function validateWidgetLogoFileMeta(file: {
  name?: unknown;
  type?: unknown;
  size?: unknown;
}): { ok: true } | { ok: false; error: string } {
  const name = typeof file.name === "string" ? file.name : "";
  const type = typeof file.type === "string" ? file.type.split(";")[0].trim().toLowerCase() : "";
  const size = typeof file.size === "number" && Number.isFinite(file.size) ? file.size : -1;
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  if (ext === ".svg" || /svg/i.test(type)) {
    return { ok: false, error: "SVG logos are not allowed." };
  }
  const nameless = !name || name === "blob" || name === "file";
  if (ext && !ALLOWED_EXT.has(ext)) {
    return { ok: false, error: publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.INVALID_TYPE) };
  }
  if (!ext && !nameless && name.includes(".")) {
    return { ok: false, error: publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.INVALID_TYPE) };
  }
  if (type && !ALLOWED_MIME.has(type) && type !== "application/octet-stream" && type !== "binary/octet-stream") {
    return { ok: false, error: publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.INVALID_TYPE) };
  }
  if (size < 0 || size > WIDGET_LOGO_MAX_BYTES) {
    return { ok: false, error: publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.TOO_LARGE) };
  }
  if (size === 0) {
    return { ok: false, error: publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.NO_FILE) };
  }
  return { ok: true };
}

/** Map an upload URL/path to the only value allowed in widgetSettings.logoUrl. */
export function mapUploadedMediaUrlToLogoPath(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim();
  if (!s || s.length > 500) return "";
  if (
    s.startsWith("blob:") ||
    s.startsWith("data:") ||
    s.startsWith("javascript:") ||
    s.includes("..") ||
    s.includes("\\") ||
    s.includes("<")
  ) {
    return "";
  }
  let pathOnly = s.split("?")[0];
  if (s.includes("://")) {
    try {
      pathOnly = new URL(s).pathname;
    } catch {
      return "";
    }
  }
  const match = pathOnly.match(FIRST_PARTY_LOGO_FILE);
  if (!match) return "";
  return `/objects/uploads/${match[1]}`;
}

function looksLikeStorageFailureMessage(message: string): boolean {
  const m = message.trim().toLowerCase();
  return (
    m === "upload failed" ||
    m === "upload failed." ||
    m === "logo upload failed." ||
    m.includes("storage") ||
    m.includes("accessdenied") ||
    m.includes("nosuchbucket")
  );
}

export function parseWidgetLogoUploadResponse(
  payload: unknown,
  httpStatus?: number,
): { ok: true; logoUrl: string } | { ok: false; error: string; code?: string } {
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      ok: false,
      error: publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.UNAUTHORIZED),
      code: WIDGET_LOGO_ERROR_CODE.UNAUTHORIZED,
    };
  }
  if (httpStatus === 413) {
    return {
      ok: false,
      error: publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.TOO_LARGE),
      code: WIDGET_LOGO_ERROR_CODE.TOO_LARGE,
    };
  }
  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      error: publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE),
      code: WIDGET_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE,
    };
  }
  const rec = payload as Record<string, unknown>;
  const code = typeof rec.code === "string" ? rec.code : "";
  const logoUrl =
    mapUploadedMediaUrlToLogoPath(rec.logoUrl) || mapUploadedMediaUrlToLogoPath(rec.mediaUrl);
  if (logoUrl && (httpStatus === undefined || (httpStatus >= 200 && httpStatus < 300))) {
    return { ok: true, logoUrl };
  }
  if (code) {
    return { ok: false, error: publicWidgetLogoErrorMessage(code, undefined), code };
  }
  const rawError = typeof rec.error === "string" ? rec.error.trim().slice(0, 200) : "";
  if (rawError && looksLikeStorageFailureMessage(rawError)) {
    return {
      ok: false,
      error: publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE),
      code: WIDGET_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE,
    };
  }
  if (rawError) return { ok: false, error: rawError };
  return {
    ok: false,
    error: publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE),
    code: WIDGET_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE,
  };
}

export function widgetSettingsPatchLogoUrl(nextLogo: unknown, priorLogo: unknown): string {
  if (typeof nextLogo !== "string") return coerceWidgetLogoUrl(priorLogo);
  if (!nextLogo.trim()) return "";
  const cleaned = sanitizeWidgetLogoUrl(nextLogo);
  if (cleaned) return cleaned;
  return coerceWidgetLogoUrl(priorLogo);
}

export function markWidgetLogoPreviewFailed(_alreadyFailed: boolean): boolean {
  return true;
}

export function shouldResetWidgetLogoPreview(prevSrc: string, nextSrc: string): boolean {
  return prevSrc !== nextSrc;
}

const INTERNAL_PATH_RE =
  /\/objects\/uploads\/|\/uploads\/|web-upload|mediastoragekey|\.r2\.|r2\.dev|cloudflarestorage/i;

/** True when visible UI text would leak a storage URL, key, or tenant path. */
export function isWidgetLogoInternalPathText(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return INTERNAL_PATH_RE.test(value);
}

/**
 * Visitor-facing editor label. Never the `/objects/uploads/...` path or tenant id.
 * Uses the original file name when it is a simple basename; otherwise "Logo uploaded".
 */
export function widgetLogoEditorDisplayName(fileName?: unknown): string {
  if (typeof fileName !== "string") return "Logo uploaded";
  if (isWidgetLogoInternalPathText(fileName)) return "Logo uploaded";
  const base = fileName.replace(/\\/g, "/").split("/").pop()?.trim() || "";
  if (!base || isWidgetLogoInternalPathText(base)) return "Logo uploaded";
  if (/__[\w.-]+\.(jpg|jpeg|png|webp)$/i.test(base)) return "Logo uploaded";
  if (base.length > 42) return `${base.slice(0, 38)}…`;
  return base;
}

export function widgetLogoEditorHasImage(logoUrl: unknown): boolean {
  const path = coerceWidgetLogoUrl(logoUrl);
  return Boolean(path && sanitizeWidgetLogoUrl(path));
}

type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/**
 * Real Website Widget file-selection handler contract.
 * Always preventDefault/stopPropagation. Never assigns File/Event/blob URLs to logoUrl.
 */
export async function runWidgetLogoUpload(input: {
  event?: { preventDefault?: () => void; stopPropagation?: () => void };
  file: WidgetLogoFileLike | File | null | undefined;
  priorLogoUrl: unknown;
  lock: WidgetLogoUploadLock;
  fetchFn: FetchLike;
  onBusyChange?: (busy: boolean) => void;
}): Promise<WidgetLogoUploadOutcome> {
  input.event?.preventDefault?.();
  input.event?.stopPropagation?.();

  if (input.lock.inFlight) {
    return { ok: false, error: "Upload already in progress.", navigated: false, skipped: true };
  }

  if (!input.file) {
    return { ok: false, error: "Choose a JPEG, PNG, or WebP file.", navigated: false };
  }

  const meta = validateWidgetLogoFileMeta(input.file);
  if (!meta.ok) return { ok: false, error: meta.error, navigated: false };

  if (typeof input.file.arrayBuffer === "function") {
    try {
      const bytes = new Uint8Array(await input.file.arrayBuffer());
      const inspected = inspectWebchatImageBuffer(bytes, input.file.type);
      if (!inspected.ok) {
        return { ok: false, error: widgetLogoInspectError(inspected.reason), navigated: false };
      }
    } catch {
      return { ok: false, error: "Logo upload failed.", navigated: false };
    }
  }

  input.lock.inFlight = true;
  input.onBusyChange?.(true);
  try {
    const body = new FormData();
    const filename =
      typeof input.file.name === "string" && input.file.name && input.file.name !== "blob"
        ? input.file.name
        : "logo.jpg";
    body.append("file", input.file as Blob, filename);
    const res = await input.fetchFn(WIDGET_LOGO_UPLOAD_PATH, {
      method: "POST",
      body,
      credentials: "include",
    });
    let payload: unknown = {};
    try {
      payload = await res.json();
    } catch {
      payload = {};
    }
    const mapped = parseWidgetLogoUploadResponse(payload, res.status);
    if (!res.ok || !mapped.ok) {
      return {
        ok: false,
        error: mapped.ok
          ? publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE)
          : mapped.error,
        navigated: false,
      };
    }
    return { ok: true, logoUrl: mapped.logoUrl, navigated: false };
  } catch {
    return {
      ok: false,
      error: publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE),
      navigated: false,
    };
  } finally {
    input.lock.inFlight = false;
    input.onBusyChange?.(false);
  }
}
