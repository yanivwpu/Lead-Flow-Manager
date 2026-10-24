/**
 * Free-plan-compatible reconciliation of marketing demo Calendly bookings.
 *
 * Opt in by configuring CALENDLY_MARKETING_DEMO_API_TOKEN on the server.
 * For multiple Calendly hosts supply comma-separated PATs in
 * CALENDLY_MARKETING_DEMO_API_TOKENS. Never expose these tokens to the browser.
 * Calendly Free supports read APIs but not webhook subscriptions.
 */
import {
  calendlyGetCurrentUser,
  calendlyListScheduledEvents,
  calendlyListEventInvitees,
} from "./calendlyApi";
import { processMarketingDemoCalendlyPayload } from "./marketingDemoCalendlyWebhook";
import { readDemoBookings } from "./demoBookingStorage";
import { DEMO_BOOKING_STATUS } from "@shared/salesCompensation";
import { resolveMarketingDemoBookingIdFromTracking } from "@shared/marketingDemoCalendly";

const TAG = "[MarketingDemoCalendlyPoll]";
let inFlight = false;

export async function pollMarketingDemoCalendlyBookings(): Promise<void> {
  if (inFlight) return;
  const tokens = Array.from(new Set(
    [
      process.env.CALENDLY_MARKETING_DEMO_API_TOKEN || "",
      ...(process.env.CALENDLY_MARKETING_DEMO_API_TOKENS || "").split(","),
    ].map((value) => value.trim()).filter(Boolean),
  ));
  if (!tokens.length) {
    // No credentials means there is no reliable source to reconcile bookings.
    return;
  }
  inFlight = true;
  try {
    const awaiting = (await readDemoBookings({})).filter(
      (booking) => booking.status === DEMO_BOOKING_STATUS.awaitingSchedule,
    );
    if (!awaiting.length) return;
    const minStartTime = new Date(Date.now() - 14 * 86400000).toISOString();
    const maxStartTime = new Date(Date.now() + 365 * 86400000).toISOString();
    for (const token of tokens) {
      try {
        const me = await calendlyGetCurrentUser(token);
        const user = me.data?.resource?.uri;
        if (!me.ok || !user) {
          console.warn(TAG, "Calendly user lookup failed", { status: me.status });
          continue;
        }
        let pageToken: string | undefined;
        for (let page = 0; page < 50; page++) {
          const events = await calendlyListScheduledEvents(token, {
            user,
            minStartTime,
            maxStartTime,
            count: 100,
            pageToken,
          });
          if (!events.ok) {
            console.warn(TAG, "Calendly event list failed", { status: events.status });
            break;
          }
          for (const event of events.data?.collection || []) {
            if (!event.uri || event.status === "canceled" || !event.start_time) continue;
            let inviteePage: string | undefined;
            for (let inviteeIndex = 0; inviteeIndex < 20; inviteeIndex++) {
              const response = await calendlyListEventInvitees(token, event.uri, inviteePage);
              if (!response.ok) {
                console.warn(TAG, "Calendly invitee list failed", { status: response.status });
                break;
              }
              for (const invitee of response.data?.collection || []) {
                if (!invitee.email || invitee.status === "canceled" || invitee.cancellation) continue;
                const email = invitee.email.trim().toLowerCase();
                const tracking = invitee.tracking || {};
                const trackedBookingId = resolveMarketingDemoBookingIdFromTracking(tracking);
                // Import only when we can associate an existing request.
                // The webhook processor independently enforces exact-ID/email checks.
                const eligible = trackedBookingId
                  ? awaiting.some((b) => b.id === trackedBookingId && b.visitorEmail.trim().toLowerCase() === email)
                  : awaiting.filter((b) => b.visitorEmail.trim().toLowerCase() === email).length === 1;
                if (!eligible) continue;
                await processMarketingDemoCalendlyPayload({
                  event: "invitee.created",
                  payload: {
                    email,
                    name: invitee.name,
                    uri: invitee.uri,
                    tracking,
                    scheduled_event: {
                      uri: event.uri,
                      name: event.name,
                      start_time: event.start_time,
                      end_time: event.end_time,
                      location: event.location,
                      event_type: event.event_type,
                    },
                  },
                });
              }
              inviteePage = response.data?.pagination?.next_page_token || undefined;
              if (!inviteePage) break;
            }
          }
          pageToken = events.data?.pagination?.next_page_token || undefined;
          if (!pageToken) break;
        }
      } catch (error) {
        console.error(TAG, "Host reconciliation failed", error);
      }
    }
  } finally {
    inFlight = false;
  }
}
