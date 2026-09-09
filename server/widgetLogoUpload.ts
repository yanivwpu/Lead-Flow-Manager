/**
 * Authenticated Website Chat widget logo inspection (JPEG/PNG/WebP only).
 */

import {
  inspectWebchatImageBuffer,
  type WebchatSafeImageMime,
} from "@shared/webchatImagePolicy";
import { widgetLogoInspectError } from "@shared/webchatWidgetLogoUpload";

const MIME_TO_EXT: Record<WebchatSafeImageMime, ".jpg" | ".png" | ".webp"> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export function widgetLogoUploadAuth(
  user: { id?: unknown } | null | undefined,
): { ok: true; userId: string } | { ok: false; status: 401; error: string } {
  const id = typeof user?.id === "string" ? user.id.trim() : "";
  if (!id) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true, userId: id };
}

export function inspectWidgetLogoUpload(file: {
  originalname?: unknown;
  mimetype?: unknown;
  size?: unknown;
  buffer?: Buffer | Uint8Array | null;
}):
  | { ok: true; mime: WebchatSafeImageMime; ext: ".jpg" | ".png" | ".webp" }
  | { ok: false; status: number; error: string } {
  if (!file?.buffer || file.buffer.length === 0) {
    return { ok: false, status: 400, error: "No file provided" };
  }
  const name = typeof file.originalname === "string" ? file.originalname : "";
  const extName = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  if (extName === ".svg" || /svg/i.test(String(file.mimetype || ""))) {
    return { ok: false, status: 400, error: "SVG logos are not allowed." };
  }
  if (!ALLOWED_EXT.has(extName)) {
    return { ok: false, status: 400, error: "Logo must be a JPEG, PNG, or WebP file." };
  }
  const bytes = file.buffer instanceof Uint8Array ? file.buffer : new Uint8Array(file.buffer);
  const inspected = inspectWebchatImageBuffer(bytes, typeof file.mimetype === "string" ? file.mimetype : "");
  if (!inspected.ok) {
    return {
      ok: false,
      status: inspected.reason === "too_large" ? 413 : 400,
      error: widgetLogoInspectError(inspected.reason),
    };
  }
  const sniffedExt = MIME_TO_EXT[inspected.mime];
  const okExts = inspected.mime === "image/jpeg" ? [".jpg", ".jpeg"] : [sniffedExt];
  if (!okExts.includes(extName)) {
    return { ok: false, status: 400, error: "File extension does not match the image contents." };
  }
  return { ok: true, mime: inspected.mime, ext: sniffedExt };
}

export function buildWidgetLogoFilename(userId: string, ext: ".jpg" | ".png" | ".webp"): string {
  const owner = String(userId || "").replace(/[^\w-]/g, "").slice(0, 36) || "user";
  return `${owner}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
}
