/**
 * Outbound WhatsApp template / CRM upload size limits.
 * Keep multer max, client checks, and server post-parse validation aligned.
 *
 * Note: Meta’s published Cloud API limit for MP4/3GP *video messages* is often 16 MB.
 * Product requirement: allow larger videos through our upload path (storage + link-based send);
 * Meta may still reject oversize assets at send time.
 */

export const WA_OUTBOUND_UPLOAD_MAX_BYTES = {
  /** Template header images — smaller to match typical WA image guidance. */
  image: 5 * 1024 * 1024,
  /** PDF / Office headers — reasonable for template sends. */
  document: 16 * 1024 * 1024,
  /** Video headers — larger than legacy 16 MB single cap (see module note). */
  video: 32 * 1024 * 1024,
} as const;

export type WaOutboundMediaKind = keyof typeof WA_OUTBOUND_UPLOAD_MAX_BYTES;

/** Multer `limits.fileSize` must be >= max of all per-type caps. */
export const WA_OUTBOUND_UPLOAD_MULTER_MAX_BYTES = Math.max(
  WA_OUTBOUND_UPLOAD_MAX_BYTES.image,
  WA_OUTBOUND_UPLOAD_MAX_BYTES.document,
  WA_OUTBOUND_UPLOAD_MAX_BYTES.video
);

export function waOutboundMediaKindFromMime(mime: string): WaOutboundMediaKind | null {
  const base = (mime || "").split(";")[0].trim().toLowerCase();
  if (!base) return null;
  if (base.startsWith("image/")) return "image";
  if (base.startsWith("video/")) return "video";
  if (
    base === "application/pdf" ||
    base === "application/msword" ||
    base === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    base === "application/vnd.ms-excel" ||
    base === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "document";
  }
  return null;
}

export function waMaxBytesForOutboundMime(mime: string): number | null {
  const kind = waOutboundMediaKindFromMime(mime);
  if (!kind) return null;
  return WA_OUTBOUND_UPLOAD_MAX_BYTES[kind];
}

/** Human label for errors, e.g. "32" or "5". */
export function waMaxSizeLabelMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (Number.isInteger(mb)) return String(mb);
  return mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1).replace(/\.0$/, "");
}

export function waUploadTooLargeMessage(kind: WaOutboundMediaKind): string {
  const max = WA_OUTBOUND_UPLOAD_MAX_BYTES[kind];
  const x = waMaxSizeLabelMb(max);
  if (kind === "image") return `Image is too large. Maximum size is ${x} MB.`;
  if (kind === "video") return `Video is too large. Maximum size is ${x} MB.`;
  return `Document is too large. Maximum size is ${x} MB.`;
}

export function waUploadFileSizeCheck(
  mime: string,
  sizeBytes: number
): { ok: true; kind: WaOutboundMediaKind } | { ok: false; kind: WaOutboundMediaKind; maxBytes: number } {
  const kind = waOutboundMediaKindFromMime(mime);
  if (!kind) {
    return { ok: false, kind: "document", maxBytes: WA_OUTBOUND_UPLOAD_MAX_BYTES.document };
  }
  const max = WA_OUTBOUND_UPLOAD_MAX_BYTES[kind];
  if (sizeBytes > max) return { ok: false, kind, maxBytes: max };
  return { ok: true, kind };
}
