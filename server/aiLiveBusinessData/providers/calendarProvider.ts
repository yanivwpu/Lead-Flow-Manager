/**
 * Calendar — wraps existing Calendly booking connection.
 * Availability query for AI turns uses booking URL context already on the reply path.
 */

import { isUserCalendlyBookingConnected } from "../../calendlyBookingConnected";
import { storage } from "../../storage";
import type {
  LiveBusinessDataProvider,
  LiveBusinessDataProviderStatusResult,
  LiveBusinessDataQueryContext,
} from "../types";

export const calendarProvider: LiveBusinessDataProvider = {
  id: "calendar",

  async getStatus(userId: string): Promise<LiveBusinessDataProviderStatusResult> {
    try {
      const connected = await isUserCalendlyBookingConnected(userId);
      if (!connected) {
        return { status: "disconnected", detail: "Not connected" };
      }
      const knowledge = await storage.getAiBusinessKnowledge(userId);
      const url = String(knowledge?.bookingLink || "").trim();
      return {
        status: "connected",
        detail: url ? "Connected" : "Connected",
      };
    } catch {
      return { status: "error", detail: "Unable to load calendar status" };
    }
  },

  async query(ctx: LiveBusinessDataQueryContext) {
    // Surface booking link as a single structured row when calendar is requested — not a full availability dump.
    try {
      const connected = await isUserCalendlyBookingConnected(ctx.userId);
      if (!connected) return [];
      const knowledge = await storage.getAiBusinessKnowledge(ctx.userId);
      const bookingUrl = String(knowledge?.bookingLink || "").trim();
      if (!bookingUrl) return [];
      return [
        {
          providerId: "calendar" as const,
          recordType: "booking_link",
          summary: `Self-scheduling available: ${bookingUrl}`,
          data: {
            bookingUrl,
            availability: "Use the booking link for live availability",
          },
        },
      ];
    } catch {
      return [];
    }
  },
};
