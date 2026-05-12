import { storage } from "./storage";

/** Native Calendly integration is active and webhook registration succeeded (`connectionStatus` in config). */
export async function isUserCalendlyBookingConnected(userId: string): Promise<boolean> {
  const row = await storage.getIntegrationByUserAndType(userId, "calendly");
  if (!row?.isActive) return false;
  const cfg = (row.config || {}) as Record<string, unknown>;
  return String(cfg.connectionStatus || "") === "connected";
}

/** Public Calendly scheduling URL saved at connect time (user or first active event type). */
export async function getCalendlyPublicSchedulingUrl(userId: string): Promise<string> {
  const row = await storage.getIntegrationByUserAndType(userId, "calendly");
  if (!row?.isActive) return "";
  const cfg = (row.config || {}) as Record<string, unknown>;
  const raw = cfg.calendlyPrimarySchedulingUrl;
  if (typeof raw !== "string") return "";
  const u = raw.trim();
  return u.startsWith("http://") || u.startsWith("https://") ? u : "";
}

/** Append UTM params so Calendly webhooks can resolve the originating CRM contact. */
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
