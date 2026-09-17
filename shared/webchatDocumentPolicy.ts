/**
 * Website Chat PDF policy: application/pdf only, sniffed from bytes.
 * Safe to import from WidgetFrame (no Node Buffer).
 */

export const WEBCHAT_PDF_MAX_BYTES = 16 * 1024 * 1024;
export const WEBCHAT_PDF_MIME = "application/pdf";

const POLY_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
const POLY_MZ = new Uint8Array([0x4d, 0x5a]);
const POLY_ELF = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]);

function startsWithBytes(buf: Uint8Array, prefix: Uint8Array): boolean {
  if (!buf || buf.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (buf[i] !== prefix[i]) return false;
  }
  return true;
}

export function sniffWebchatPdfMime(buf: Uint8Array): typeof WEBCHAT_PDF_MIME | null {
  if (!buf || buf.length < 5) return null;
  if (!startsWithBytes(buf, POLY_PDF)) return null;
  return WEBCHAT_PDF_MIME;
}

export function declaredWebchatPdfMime(value: unknown): typeof WEBCHAT_PDF_MIME | null {
  const raw = String(value || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  return raw === WEBCHAT_PDF_MIME ? WEBCHAT_PDF_MIME : null;
}

export type WebchatPdfInspection =
  | { ok: true; mime: typeof WEBCHAT_PDF_MIME }
  | { ok: false; reason: "empty" | "too_large" | "unsafe_type" | "mismatch" };

export function inspectWebchatPdfBuffer(
  buf: Uint8Array,
  declaredMime?: string | null,
): WebchatPdfInspection {
  if (!buf || buf.length === 0) return { ok: false, reason: "empty" };
  if (buf.length > WEBCHAT_PDF_MAX_BYTES) return { ok: false, reason: "too_large" };
  if (startsWithBytes(buf, POLY_MZ) || startsWithBytes(buf, POLY_ELF)) {
    return { ok: false, reason: "unsafe_type" };
  }
  const sniffed = sniffWebchatPdfMime(buf);
  if (!sniffed) return { ok: false, reason: "unsafe_type" };
  const declared = declaredWebchatPdfMime(declaredMime);
  if (declaredMime && !declared) {
    const raw = String(declaredMime)
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (raw && raw !== "application/octet-stream" && raw !== "binary/octet-stream") {
      return { ok: false, reason: "mismatch" };
    }
  }
  if (declared && declared !== sniffed) return { ok: false, reason: "mismatch" };
  return { ok: true, mime: sniffed };
}

export function isWebchatDocumentContentType(contentType: string | null | undefined): boolean {
  const ct = String(contentType || "")
    .trim()
    .toLowerCase();
  return ct === "document" || ct === "application/pdf" || ct === "file";
}

export function isWebchatDeliverableMediaContentType(
  contentType: string | null | undefined,
): boolean {
  const ct = String(contentType || "")
    .trim()
    .toLowerCase();
  if (
    ct === "image" ||
    ct === "image/jpeg" ||
    ct === "image/png" ||
    ct === "image/webp" ||
    ct === "image/jpg"
  ) {
    return true;
  }
  return isWebchatDocumentContentType(ct);
}
