/**
 * Public widget visitor IDs are unguessable capability tokens (UUID v4 only).
 * Legacy timestamp-based visitor tokens are never accepted for public reads.
 */

export const WEBCHAT_VISITOR_ID_MAX = 80;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_PREDICTABLE_PATTERN = /^visitor_\d+_[a-z0-9]+$/i;

export function isCryptographicWebchatVisitorId(value: string): boolean {
  return value.length <= WEBCHAT_VISITOR_ID_MAX && UUID_V4_PATTERN.test(value);
}

/** Public poll/POST identity: UUID v4 only. No weak or sequential fallback. */
export function isPublicWebchatVisitorId(value: string): boolean {
  return isCryptographicWebchatVisitorId(value);
}

export function isLegacyWebchatVisitorId(value: string): boolean {
  if (!value) return false;
  if (isCryptographicWebchatVisitorId(value)) return false;
  return LEGACY_PREDICTABLE_PATTERN.test(value);
}

function bytesToUuidV4(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Cryptographically strong visitor id (UUID v4). Never timestamp or PRNG fallbacks. */
export function createWebchatVisitorId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return bytesToUuidV4(bytes);
  }
  throw new Error("webchat_visitor_id_entropy_unavailable");
}

/**
 * WidgetFrame localStorage migration: drop weak IDs and start a new session.
 * Losing legacy chat history is intentional.
 */
export function loadOrRotateWebchatVisitorId(stored: string | null | undefined): {
  visitorId: string;
  replaced: boolean;
} {
  const existing = typeof stored === "string" ? stored.trim() : "";
  if (existing && isCryptographicWebchatVisitorId(existing)) {
    return { visitorId: existing, replaced: false };
  }
  return { visitorId: createWebchatVisitorId(), replaced: true };
}
