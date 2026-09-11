/**
 * Business Profile company-logo upload contract (browser-safe).
 * Separate from Website Widget logos — do not import widget logo modules here.
 */

import { inspectWebchatImageBuffer, WEBCHAT_IMAGE_MAX_BYTES } from "./webchatImagePolicy";

/** Express default JSON body limit. Business Profile PATCH must stay under this. */
export const BUSINESS_PROFILE_JSON_BODY_MAX_BYTES = 100 * 1024;
export const BUSINESS_PROFILE_LOGO_MAX_BYTES = WEBCHAT_IMAGE_MAX_BYTES;
export const BUSINESS_PROFILE_LOGO_UPLOAD_PATH = "/api/business-profile/logo";
export const BUSINESS_PROFILE_LOGO_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

export const BUSINESS_PROFILE_LOGO_ERROR_CODE = {
  UNAUTHORIZED: "LOGO_UNAUTHORIZED",
  INVALID_TYPE: "LOGO_INVALID_TYPE",
  TOO_LARGE: "LOGO_TOO_LARGE",
  STORAGE_UNAVAILABLE: "LOGO_STORAGE_UNAVAILABLE",
  NO_FILE: "LOGO_NO_FILE",
} as const;

const FIRST_PARTY_LOGO_FILE =
  /^\/objects\/uploads\/([\w][\w-]*\.(jpg|jpeg|png|webp))$/i;

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export function publicBusinessProfileLogoErrorMessage(code: string | undefined, fallback?: string): string {
  switch (code) {
    case BUSINESS_PROFILE_LOGO_ERROR_CODE.UNAUTHORIZED:
      return "Please sign in again to upload a logo.";
    case BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE:
      return "Please upload a JPG, PNG, or WebP.";
    case BUSINESS_PROFILE_LOGO_ERROR_CODE.TOO_LARGE:
      return "Logo must be smaller than 5 MB.";
    case BUSINESS_PROFILE_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE:
      return "Logo storage is temporarily unavailable.";
    case BUSINESS_PROFILE_LOGO_ERROR_CODE.NO_FILE:
      return "Choose a JPEG, PNG, or WebP file.";
    default:
      return fallback || "Logo upload failed.";
  }
}

export function isFirstPartyBusinessProfileLogoPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!FIRST_PARTY_LOGO_FILE.test(trimmed)) return false;
  if (trimmed.includes("..") || trimmed.includes("\\") || trimmed.includes("//", 1)) return false;
  return true;
}

export function sanitizeBusinessProfileLogoOwnerId(userId: string): string {
  return String(userId || "").replace(/[^\w-]/g, "").slice(0, 36) || "user";
}

export function ownerFromBusinessProfileLogoPath(path: string): string | null {
  const match = String(path || "").trim().match(FIRST_PARTY_LOGO_FILE);
  if (!match) return null;
  const filename = match[1];
  const delim = filename.indexOf("__");
  if (delim <= 0) return null;
  const owner = filename.slice(0, delim);
  return owner === sanitizeBusinessProfileLogoOwnerId(owner) ? owner : null;
}

/**
 * Persist only a tenant-owned first-party object path. Never Base64, blob URLs, or File objects.
 */
export function persistBusinessProfileCompanyLogo(
  value: unknown,
  tenantUserId: string,
): string | null | "invalid" {
  if (value == null) return null;
  if (typeof value !== "string") return "invalid";
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:") || trimmed.startsWith("http")) {
    return "invalid";
  }
  if (!isFirstPartyBusinessProfileLogoPath(trimmed)) return "invalid";
  const owner = ownerFromBusinessProfileLogoPath(trimmed);
  const tenant = sanitizeBusinessProfileLogoOwnerId(tenantUserId);
  if (!owner || owner !== tenant) return "invalid";
  return trimmed;
}

/** Client PATCH helper: omit unsafe/legacy data URLs so JSON stays small. */
export function companyLogoForPatch(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isFirstPartyBusinessProfileLogoPath(trimmed)) return trimmed;
  return undefined;
}

export function businessProfilePatchJsonBytes(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload ?? {})).length;
}

export type BusinessProfileLogoFileLike = {
  name: string;
  type: string;
  size: number;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

export type BusinessProfileLogoUploadLock = { inFlight: boolean };

export type BusinessProfileLogoUploadOutcome =
  | { ok: true; logoUrl: string }
  | { ok: false; error: string; skipped?: boolean };

export function validateBusinessProfileLogoFileMeta(file: {
  name?: unknown;
  type?: unknown;
  size?: unknown;
}): { ok: true } | { ok: false; error: string; code: string } {
  const size = typeof file.size === "number" ? file.size : 0;
  if (!size) {
    return {
      ok: false,
      error: publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.NO_FILE),
      code: BUSINESS_PROFILE_LOGO_ERROR_CODE.NO_FILE,
    };
  }
  if (size > BUSINESS_PROFILE_LOGO_MAX_BYTES) {
    return {
      ok: false,
      error: publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.TOO_LARGE),
      code: BUSINESS_PROFILE_LOGO_ERROR_CODE.TOO_LARGE,
    };
  }
  const name = typeof file.name === "string" ? file.name : "";
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  const type = String(file.type || "").split(";")[0].trim().toLowerCase();
  if (ext === ".svg" || type === "image/svg+xml" || /svg/i.test(type)) {
    return {
      ok: false,
      error: publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE),
      code: BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE,
    };
  }
  if (ext && !ALLOWED_EXT.has(ext)) {
    return {
      ok: false,
      error: publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE),
      code: BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE,
    };
  }
  if (type && !ALLOWED_MIME.has(type) && type !== "application/octet-stream" && type !== "binary/octet-stream") {
    return {
      ok: false,
      error: publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE),
      code: BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE,
    };
  }
  return { ok: true };
}

export function parseBusinessProfileLogoUploadResponse(
  payload: unknown,
  status = 200,
): { ok: true; logoUrl: string } | { ok: false; error: string } {
  if (status < 200 || status >= 300 || !payload || typeof payload !== "object") {
    const rec = payload && typeof payload === "object" ? (payload as { error?: unknown; code?: unknown }) : {};
    const code = typeof rec.code === "string" ? rec.code : undefined;
    const fallback = typeof rec.error === "string" ? rec.error : undefined;
    return { ok: false, error: publicBusinessProfileLogoErrorMessage(code, fallback) };
  }
  const logoUrl = (payload as { logoUrl?: unknown }).logoUrl;
  if (!isFirstPartyBusinessProfileLogoPath(logoUrl)) {
    return { ok: false, error: publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE) };
  }
  return { ok: true, logoUrl };
}

type UploadFn = (
  file: BusinessProfileLogoFileLike | File,
  onProgress?: (percent: number) => void,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

function inspectError(reason: string): string {
  if (reason === "too_large") {
    return publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.TOO_LARGE);
  }
  if (reason === "empty") {
    return publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.NO_FILE);
  }
  return publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE);
}

export async function runBusinessProfileLogoUpload(input: {
  file: BusinessProfileLogoFileLike | File | null | undefined;
  priorLogoUrl: unknown;
  lock: BusinessProfileLogoUploadLock;
  onProgress?: (percent: number) => void;
  uploadFn: UploadFn;
}): Promise<BusinessProfileLogoUploadOutcome> {
  if (input.lock.inFlight) {
    return { ok: false, error: "Upload already in progress.", skipped: true };
  }
  if (!input.file) {
    return { ok: false, error: publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.NO_FILE) };
  }
  const meta = validateBusinessProfileLogoFileMeta(input.file);
  if (!meta.ok) return { ok: false, error: meta.error };

  if (typeof input.file.arrayBuffer === "function") {
    try {
      const bytes = new Uint8Array(await input.file.arrayBuffer());
      const inspected = inspectWebchatImageBuffer(bytes, input.file.type);
      if (!inspected.ok) return { ok: false, error: inspectError(inspected.reason) };
    } catch {
      return { ok: false, error: publicBusinessProfileLogoErrorMessage(undefined, "Logo upload failed.") };
    }
  }

  input.lock.inFlight = true;
  try {
    input.onProgress?.(0);
    const res = await input.uploadFn(input.file, input.onProgress);
    const payload = await res.json().catch(() => ({}));
    const parsed = parseBusinessProfileLogoUploadResponse(payload, res.status);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    input.onProgress?.(100);
    return { ok: true, logoUrl: parsed.logoUrl };
  } catch {
    return { ok: false, error: publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE) };
  } finally {
    input.lock.inFlight = false;
  }
}

export function xhrUploadBusinessProfileLogo(
  file: Blob,
  onProgress?: (percent: number) => void,
): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", BUSINESS_PROFILE_LOGO_UPLOAD_PATH);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable || event.total <= 0) return;
      onProgress(Math.max(0, Math.min(99, Math.round((event.loaded / event.total) * 100))));
    };
    xhr.onload = () => {
      const text = xhr.responseText || "{}";
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: async () => {
          try {
            return JSON.parse(text) as unknown;
          } catch {
            return {};
          }
        },
      });
    };
    xhr.onerror = () => reject(new Error("Network error"));
    const body = new FormData();
    const filename = file instanceof File && file.name ? file.name : "logo.jpg";
    body.append("file", file, filename);
    xhr.send(body);
  });
}
