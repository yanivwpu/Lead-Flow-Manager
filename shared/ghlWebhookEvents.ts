/**
 * Marketplace dashboard recommendation vs implemented CRM sync.
 * Returning HTTP 200 is not the same as advertising an event as supported.
 */

/** Billing / install lifecycle — processed after signature verification. */
export const GHL_MARKETPLACE_LIFECYCLE_EVENTS = [
  "INSTALL",
  "AppInstall",
  "UPDATE",
  "AppUpdate",
  "PLAN_CHANGE",
  "PlanChange",
  "APP_PAYMENT_STATUS",
  "AppPaymentStatus",
  "UNINSTALL",
  "AppUninstall",
] as const;

/**
 * Contact sync currently implemented: update contacts already in the CRM
 * (matched primarily by ghlId). Never creates contacts.
 */
export const GHL_SUPPORTED_CONTACT_EVENTS = [
  "ContactCreate",
  "ContactUpdate",
  "ContactTagUpdate",
] as const;

/**
 * Acknowledged with HTTP 200 after signature verification, but not synced.
 * Do not enable these in the GHL Marketplace webhook dashboard as "supported".
 */
export const GHL_ACK_ONLY_DISABLED_EVENTS = [
  "ContactDndUpdate",
  "ConversationUnreadUpdate",
] as const;

/** Canonical production webhook URL (app host only — never apex/www). */
export const GHL_CANONICAL_WEBHOOK_PATH = "/api/ext/webhook";
export const GHL_WEBHOOK_ALIAS_PATH = "/api/ghl/webhook";
export const GHL_CANONICAL_WEBHOOK_URL = "https://app.whachatcrm.com/api/ext/webhook";
