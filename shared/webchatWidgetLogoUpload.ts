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
      return "Choose a JPEG, PNG, or WebP file.";
    case "too_large":
      return "Logo must be 5 MB or smaller.";
    case "disguised":
      return "That file is not a safe JPEG, PNG, or WebP image.";
    case "unsafe_type":
      return "Logo must be a JPEG, PNG, or WebP file.";
    case "mismatch":
      return "File type does not match the image contents.";
    default:
      return "Logo upload failed.";
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
  if (!name) return { ok: false, error: "Choose a JPEG, PNG, or WebP file." };
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  if (ext === ".svg" || /svg/i.test(type)) {
    return { ok: false, error: "SVG logos are not allowed." };
  }
  if (!ALLOWED_EXT.has(ext)) {
    return { ok: false, error: "Logo must be a JPEG, PNG, or WebP file." };
  }
  if (type && !ALLOWED_MIME.has(type)) {
    return { ok: false, error: "Logo must be a JPEG, PNG, or WebP file." };
  }
  if (size < 0 || size > WIDGET_LOGO_MAX_BYTES) {
    return { ok: false, error: "Logo must be 5 MB or smaller." };
  }
  if (size === 0) {
    return { ok: false, error: "Choose a JPEG, PNG, or WebP file." };
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

export function parseWidgetLogoUploadResponse(
  payload: unknown,
): { ok: true; logoUrl: string } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Upload did not return a first-party JPEG, PNG, or WebP path." };
  }
  const rec = payload as Record<string, unknown>;
  const logoUrl =
    mapUploadedMediaUrlToLogoPath(rec.logoUrl) || mapUploadedMediaUrlToLogoPath(rec.mediaUrl);
  if (!logoUrl) {
    const message =
      typeof rec.error === "string" && rec.error.trim()
        ? rec.error.trim().slice(0, 200)
        : "Upload did not return a first-party JPEG, PNG, or WebP path.";
    return { ok: false, error: message };
  }
  return { ok: true, logoUrl };
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
    body.append("file", input.file as Blob);
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
    const mapped = parseWidgetLogoUploadResponse(payload);
    if (!res.ok || !mapped.ok) {
      return {
        ok: false,
        error: mapped.ok ? "Upload failed." : mapped.error,
        navigated: false,
      };
    }
    return { ok: true, logoUrl: mapped.logoUrl, navigated: false };
  } catch {
    return { ok: false, error: "Upload failed.", navigated: false };
  } finally {
    input.lock.inFlight = false;
    input.onBusyChange?.(false);
  }
}
