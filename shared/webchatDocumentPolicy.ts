/**
 * Website Chat PDF policy: application/pdf only, sniffed from bytes.
 * Safe to import from WidgetFrame (no Node Buffer).
 */

export const WEBCHAT_PDF_MAX_BYTES = 16 * 1024 * 1024;
export const WEBCHAT_PDF_MIME = "application/pdf";

const POLY_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
const POLY_MZ = new Uint8Array([0x4d, 0x5a]);
const POLY_ELF = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]);
const HTML_OR_SVG_RE = /<\s*(?:html|script|svg|iframe|embed|object|link|meta|form|body|head)\b/i;
const PDF_ACTIVE_RE =
  /\/(?:JavaScript|JS|OpenAction|Launch|RichMedia|EmbeddedFile|EmbeddedFiles)\b/;

function startsWithBytes(buf: Uint8Array, prefix: Uint8Array): boolean {
  if (!buf || buf.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (buf[i] !== prefix[i]) return false;
  }
  return true;
}

function decodeLatin1(buf: Uint8Array, start: number, end: number): string {
  let s = "";
  const to = Math.min(buf.length, end);
  for (let i = Math.max(0, start); i < to; i++) s += String.fromCharCode(buf[i]!);
  return s;
}

/** Reject HTML/SVG polyglots and PDFs that declare active/launch actions. */
export function pdfBufferLooksActiveOrPolyglot(buf: Uint8Array): boolean {
  if (!buf || buf.length < 5) return true;
  const head = decodeLatin1(buf, 0, Math.min(buf.length, 2048));
  if (HTML_OR_SVG_RE.test(head)) return true;
  const sample = decodeLatin1(buf, 0, Math.min(buf.length, 128 * 1024));
  if (PDF_ACTIVE_RE.test(sample)) return true;
  return false;
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
  if (pdfBufferLooksActiveOrPolyglot(buf)) return { ok: false, reason: "unsafe_type" };
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

/** RFC 5987 Content-Disposition that cannot inject headers or paths. */
export function safeContentDisposition(
  originalFilename: string,
  disposition: "inline" | "attachment",
): string {
  const base = String(originalFilename || "file")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\\/g, "/")
    .split("/")
    .pop() || "file";
  const unicodeSafe = base.replace(/["\\;=]/g, "_").trim().slice(0, 120) || "file";
  const ascii = unicodeSafe
    .replace(/[^\w\u0020\u0028\u0029.\-]/g, "_")
    .trim()
    .slice(0, 120) || "file";
  const encoded = encodeURIComponent(unicodeSafe)
    .replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
    .slice(0, 240);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded || "file"}`;
}

export function webchatMediaDeliveryHeaders(params: {
  mime: string;
  filename: string;
  isDocument: boolean;
  download?: boolean;
}): Record<string, string> {
  const asAttachment = params.isDocument || Boolean(params.download);
  const headers: Record<string, string> = {
    "Content-Type": params.mime,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store, no-cache, must-revalidate",
    "Content-Disposition": safeContentDisposition(
      params.filename,
      asAttachment ? "attachment" : "inline",
    ),
  };
  if (params.isDocument) {
    headers["X-Frame-Options"] = "DENY";
    headers["Content-Security-Policy"] = "sandbox";
  }
  return headers;
}
