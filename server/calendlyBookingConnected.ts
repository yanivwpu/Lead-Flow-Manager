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
