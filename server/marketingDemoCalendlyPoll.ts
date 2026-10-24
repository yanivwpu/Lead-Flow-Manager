/**
 * Free-plan-compatible reconciliation of marketing demo Calendly bookings.
 *
 * Each salesperson authorizes an encrypted Calendly connection in the database.
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
import { eligibleMarketingDemoBooking } from "@shared/marketingDemoCalendlyReconciliation";
import { resolveMarketingDemoBookingIdFromTracking } from "@shared/marketingDemoCalendly";
import { getSalespersonCalendlyConnections } from "./salespersonCalendlyConnections";

const TAG = "[MarketingDemoCalendlyPoll]";
let inFlight = false;

export async function pollMarketingDemoCalendlyBookings(): Promise<void> {
  if (inFlight) return;
  const connections = await getSalespersonCalendlyConnections();
  if (!connections.length) return;
  inFlight = true;
  try {
    const awaiting = (await readDemoBookings({})).filter(
      (booking) => booking.status === DEMO_BOOKING_STATUS.awaitingSchedule,
    );
    if (!awaiting.length) return;
    const minStartTime = new Date(Date.now() - 14 * 86400000).toISOString();
    const maxStartTime = new Date(Date.now() + 365 * 86400000).toISOString();
    for (const connection of connections) {
      const token = connection.token;
      const assigned = awaiting.filter((b) => b.salespersonId === connection.salespersonId);
      if (!assigned.length) continue;
      try {
        const me = await calendlyGetCurrentUser(token);
        const user = me.data?.resource?.uri;
        if (connection.calendlyUserUri && user !== connection.calendlyUserUri) {
          console.warn(TAG, "Calendly account mismatch", { salespersonId: connection.salespersonId });
          continue;
        }
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
                // Cross-salesperson safety: require the exact request ID when reconciling automatically.
                // Email-only matches are reserved for manual review.
                if (!resolveMarketingDemoBookingIdFromTracking(tracking)) continue;
                if (!eligibleMarketingDemoBooking(assigned, email, tracking)) continue;
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
