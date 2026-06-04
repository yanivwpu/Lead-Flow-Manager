import type { Express } from "express";
import { storage } from "../storage";
import { resolveRgeCustomerSchedulingUrl } from "../rgeCustomerSchedulingUrl";
import { getCalendlyBookingSyncWarning } from "../calendlyBookingConnected";

export const SCHEDULING_URL_LOG = "[SchedulingURL]";
export const CALENDLY_SYNC_WARNING_LOG = "[CalendlySyncWarning]";

export function registerSchedulingRoutes(app: Express): void {
  /**
   * Public customer-facing scheduling URL for inbox Copilot and manual sends.
   * Reuses the same resolver as W3 workflow automation (Calendly integration → RGE prefs → env).
   */
  app.get("/api/scheduling/customer-url", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const userId = req.user.id;
      const contactIdRaw = typeof req.query.contactId === "string" ? req.query.contactId.trim() : "";
      let contactId: string | undefined;

      if (contactIdRaw) {
        const contact = await storage.getContact(contactIdRaw);
        if (!contact || contact.userId !== userId) {
          return res.status(404).json({ error: "Contact not found" });
        }
        contactId = contact.id;
      }

      const resolved = await resolveRgeCustomerSchedulingUrl(userId, contactId);
      const syncWarning = await getCalendlyBookingSyncWarning(userId);

      console.info(
        SCHEDULING_URL_LOG,
        JSON.stringify({
          userId,
          contactId: contactId ?? null,
          source: resolved.source,
          hasUrl: !!resolved.url,
          calendlyConnected: resolved.calendlyConnected,
          syncWarning: syncWarning ?? null,
        }),
      );

      if (syncWarning) {
        console.warn(
          CALENDLY_SYNC_WARNING_LOG,
          JSON.stringify({ userId, contactId: contactId ?? null, message: syncWarning }),
        );
      }

      res.json({
        url: resolved.url || "",
        source: resolved.source,
        syncWarning,
      });
    } catch (error) {
      console.error(SCHEDULING_URL_LOG, "fetch_failed", error);
      res.status(500).json({ error: "Failed to resolve scheduling URL" });
    }
  });
}
