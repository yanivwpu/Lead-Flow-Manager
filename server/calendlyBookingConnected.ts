import { storage } from "./storage";
import { resolveCalendlyCustomerSchedulingUrlFromConfig } from "@shared/calendlyEventSelection";

/** Native Calendly integration is active and webhook registration succeeded (`connectionStatus` in config). */
export async function isUserCalendlyBookingConnected(userId: string): Promise<boolean> {
  const row = await storage.getIntegrationByUserAndType(userId, "calendly");
  if (!row?.isActive) return false;
  const cfg = (row.config || {}) as Record<string, unknown>;
  return String(cfg.connectionStatus || "") === "connected";
}

/** Public Calendly scheduling URL for agent → customer showings (Integrations). Not concierge onboarding. */
export async function getCalendlyPublicSchedulingUrl(userId: string): Promise<string> {
  const row = await storage.getIntegrationByUserAndType(userId, "calendly");
  if (!row?.isActive) return "";
  const cfg = (row.config || {}) as Record<string, unknown>;
  return resolveCalendlyCustomerSchedulingUrlFromConfig(cfg);
}

/**
 * Knowledge passed into AI prompts: scheduling URL comes **only** from the connected Calendly
 * integration's workspace-selected event URL (`calendlySelectedEventSchedulingUrl` /
 * `calendlyPrimarySchedulingUrl` after selection). Stale `ai_business_knowledge.booking_link`
 * is never used for AI output.
 */
export async function applyCalendlyBookingLinkForAi<T extends { bookingLink?: string | null }>(
  userId: string,
  knowledge: T | undefined
): Promise<T | undefined> {
  if (!knowledge) return undefined;
  const calUrl = await getCalendlyPublicSchedulingUrl(userId);
  return { ...knowledge, bookingLink: calUrl || "" } as T;
}

/** Soft warning when the booking link works but confirmation sync is not available (neither webhooks nor polling). */
export async function getCalendlyBookingSyncWarning(userId: string): Promise<string | null> {
  const row = await storage.getIntegrationByUserAndType(userId, "calendly");
  if (!row?.isActive) return null;
  const cfg = (row.config || {}) as Record<string, unknown>;
  if (String(cfg.connectionStatus || "") !== "connected") return null;
  if (String(cfg.calendlyWebhookStatus || "") === "connected") return null;
  if (resolveCalendlySyncModeFromConfig(cfg) === "polling") return null;
  return "Booking link will send. Confirmations may not sync until Calendly sync is fixed.";
}

export type CalendlySyncMode = "webhook" | "polling";

/** Webhook when connected; polling when webhook registration failed (Calendly Free). */
export function resolveCalendlySyncModeFromConfig(cfg: Record<string, unknown>): CalendlySyncMode {
  if (String(cfg.calendlyWebhookStatus || "") === "connected") return "webhook";
  if (String(cfg.calendlyWebhookStatus || "") === "failed") return "polling";
  return String(cfg.calendlySyncMode || "") === "polling" ? "polling" : "webhook";
}

export function calendlySyncModeConfigPatch(webhookConnected: boolean, webhookFailed: boolean): Record<string, unknown> {
  if (webhookConnected) return { calendlySyncMode: "webhook" as const };
  if (webhookFailed) return { calendlySyncMode: "polling" as const };
  return {};
}

/** Primary Calendly event type label saved at connect time. */
export async function getCalendlyPrimaryEventTypeName(userId: string): Promise<string> {
  const row = await storage.getIntegrationByUserAndType(userId, "calendly");
  if (!row?.isActive) return "";
  const cfg = (row.config || {}) as Record<string, unknown>;
  const selected = cfg.calendlySelectedEventTypeName;
  if (typeof selected === "string" && selected.trim()) return selected.trim();
  const name = cfg.calendlyPrimaryEventTypeName;
  return typeof name === "string" ? name.trim() : "";
}

export function appendCalendlyW3TrackingParams(schedulingUrl: string, contactId: string): string {
  const raw = (schedulingUrl || "").trim();
  if (!raw || !contactId) return raw;
  try {
    const url = raw.startsWith("http://") || raw.startsWith("https://") ? new URL(raw) : new URL(`https://${raw}`);
    url.searchParams.set("utm_source", "whachatcrm");
    url.searchParams.set("utm_medium", "rge_w3");
    url.searchParams.set("utm_content", contactId);
    return url.toString();
  } catch {
    const join = raw.includes("?") ? "&" : "?";
    return `${raw}${join}utm_source=whachatcrm&utm_medium=rge_w3&utm_content=${encodeURIComponent(contactId)}`;
  }
}
