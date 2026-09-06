/**
 * Opaque public identifiers for widgets and public ingress.
 * Prefix + hex — never encodes users.id and is not a UUID.
 */

export const WIDGET_PUBLIC_ID_PREFIX = "wgt_";
export const TELEGRAM_WEBHOOK_PUBLIC_ID_PREFIX = "tgk_";
export const TIKTOK_LEAD_PUBLIC_ID_PREFIX = "ttk_";

const HEX_LEN = 48;
const PREFIXED_HEX = /^[a-z]{3}_[0-9a-f]{48}$/;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidLike(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function isOpaquePublicToken(value: string, prefix: string): boolean {
  const v = value.trim();
  if (!v.startsWith(prefix)) return false;
  return PREFIXED_HEX.test(v) && v.length === prefix.length + HEX_LEN;
}

export function isWidgetPublicId(value: string): boolean {
  return isOpaquePublicToken(value, WIDGET_PUBLIC_ID_PREFIX);
}

export function isTelegramWebhookPublicId(value: string): boolean {
  return isOpaquePublicToken(value, TELEGRAM_WEBHOOK_PUBLIC_ID_PREFIX);
}

export function isTiktokLeadPublicId(value: string): boolean {
  return isOpaquePublicToken(value, TIKTOK_LEAD_PUBLIC_ID_PREFIX);
}

/** True when a public path param looks like a tenant UUID (legacy / forbidden). */
export function looksLikeRawTenantUserId(value: string): boolean {
  return isUuidLike(value);
}
