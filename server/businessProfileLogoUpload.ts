/**
 * Authenticated Business Profile logo inspection (JPEG/PNG/WebP only).
 */

import {
  inspectWebchatImageBuffer,
  type WebchatSafeImageMime,
} from "@shared/webchatImagePolicy";
import {
  BUSINESS_PROFILE_LOGO_ERROR_CODE,
  publicBusinessProfileLogoErrorMessage,
} from "@shared/businessProfileLogo";

const MIME_TO_EXT: Record<WebchatSafeImageMime, ".jpg" | ".png" | ".webp"> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export function businessProfileLogoUploadAuth(
  user: { id?: unknown } | null | undefined,
): { ok: true; userId: string } | { ok: false; status: 401; error: string } {
  const id = typeof user?.id === "string" ? user.id.trim() : "";
  if (!id) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true, userId: id };
}

export function inspectBusinessProfileLogoUpload(file: {
  originalname?: unknown;
  mimetype?: unknown;
  size?: unknown;
  buffer?: Buffer | Uint8Array | null;
}):
  | { ok: true; mime: WebchatSafeImageMime; ext: ".jpg" | ".png" | ".webp" }
  | { ok: false; status: number; error: string; code?: string } {
  if (!file?.buffer || file.buffer.length === 0) {
    return {
      ok: false,
      status: 400,
      error: publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.NO_FILE),
      code: BUSINESS_PROFILE_LOGO_ERROR_CODE.NO_FILE,
    };
  }
  const name = typeof file.originalname === "string" ? file.originalname : "";
  const extName = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  if (extName === ".svg" || /svg/i.test(String(file.mimetype || ""))) {
    return {
      ok: false,
      status: 400,
      error: publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE),
      code: BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE,
    };
  }
  if (extName && !ALLOWED_EXT.has(extName)) {
    return {
      ok: false,
      status: 400,
      error: publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE),
      code: BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE,
    };
  }
  const bytes = file.buffer instanceof Uint8Array ? file.buffer : new Uint8Array(file.buffer);
  const inspected = inspectWebchatImageBuffer(bytes, typeof file.mimetype === "string" ? file.mimetype : "");
  if (!inspected.ok) {
    const tooLarge = inspected.reason === "too_large";
    return {
      ok: false,
      status: tooLarge ? 413 : 400,
      error: publicBusinessProfileLogoErrorMessage(
        tooLarge ? BUSINESS_PROFILE_LOGO_ERROR_CODE.TOO_LARGE : BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE,
      ),
      code: tooLarge ? BUSINESS_PROFILE_LOGO_ERROR_CODE.TOO_LARGE : BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE,
    };
  }
  const sniffedExt = MIME_TO_EXT[inspected.mime];
  const okExts = inspected.mime === "image/jpeg" ? [".jpg", ".jpeg"] : [sniffedExt];
  if (extName && !okExts.includes(extName)) {
    return {
      ok: false,
      status: 400,
      error: "File type does not match the image contents.",
      code: BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE,
    };
  }
  return { ok: true, mime: inspected.mime, ext: sniffedExt };
}
