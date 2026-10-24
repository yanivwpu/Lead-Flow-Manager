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
  calendlyGetEventInvitee,
  calendlyGetScheduledEvent,
} from "./calendlyApi";
import { processMarketingDemoCalendlyPayload } from "./marketingDemoCalendlyWebhook";
import { readDemoBookings } from "./demoBookingStorage";
import { DEMO_BOOKING_STATUS } from "@shared/salesCompensation";
import { eligibleMarketingDemoBooking } from "@shared/marketingDemoCalendlyReconciliation";
import { resolveMarketingDemoBookingIdFromTracking } from "@shared/marketingDemoCalendly";
import { db } from "../drizzle/db";
import { demoBookings } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getSalespersonCalendlyConnections } from "./salespersonCalendlyConnections";

const TAG = "[MarketingDemoCalendlyPoll]";
let inFlight = false;

/** Verify the exact invitee URI already recorded for this salesperson and booking.
 * Never infer cancellation from absence in an events list or from matching an email alone. */
async function reconcileScheduledDemo(token: string, booking: {
  id: string; salespersonId: string | null; visitorEmail: string;
  status: string; calendlyInviteeUri: string | null;
  calendlyScheduledEventUri: string | null;
}): Promise<"unchanged" | "canceled" | "rescheduled"> {
  if (!booking.calendlyInviteeUri || !booking.calendlyScheduledEventUri || !booking.salespersonId) return "unchanged";
  const existing = await calendlyGetEventInvitee(token, booking.calendlyInviteeUri);
  if (!existing.ok || !existing.data.resource) return "unchanged";
  const old = existing.data.resource;
  if (!old.email || old.email.trim().toLowerCase() !== booking.visitorEmail.trim().toLowerCase()) return "unchanged";
  if (old.status !== "canceled" && !old.cancellation) return "unchanged";

  // Calendly marks the original invitee canceled during rescheduling.
  // Only migrate a booking after the replacement invitee and event are verified.
  const newInviteeUri = typeof (old as any).new_invitee === "string" ? (old as any).new_invitee : "";
  if (newInviteeUri) {
    const next = await calendlyGetEventInvitee(token, newInviteeUri);
    if (!next.ok || !next.data.resource) return "unchanged";
    const invitee = next.data.resource;
    if (invitee.status !== "active" || invitee.email?.trim().toLowerCase() !== booking.visitorEmail.trim().toLowerCase()) return "unchanged";
    const match = newInviteeUri.match(/^(https:\/\/api\.calendly\.com\/scheduled_events\/[a-zA-Z0-9-]+)\/invitees\/[a-zA-Z0-9-]+$/);
    if (!match) return "unchanged";
    const nextEvent = await calendlyGetScheduledEvent(token, match[1]);
    const event = next.data.resource;
    if (!nextEvent.ok || !event?.start_time || event.status === "canceled" || !event.uri) return "unchanged";
    const start = new Date(event.start_time);
    if (Number.isNaN(start.getTime())) return "unchanged";
    const location = event.location || {};
    const meetingUrl = typeof location.join_url === "string" ? location.join_url : null;
    const result = await db.update(demoBookings).set({
      calendlyInviteeUri: newInviteeUri,
      calendlyScheduledEventUri: event.uri,
      scheduledDate: start,
      ...(meetingUrl ? { meetingLink: meetingUrl } : {}),
      calendlyPayload: { lifecycle: "rescheduled", priorInviteeUri: booking.calendlyInviteeUri, priorScheduledEventUri: booking.calendlyScheduledEventUri, updatedAt: new Date().toISOString() },
    }).where(and(
      eq(demoBookings.id, booking.id),
      eq(demoBookings.salespersonId, booking.salespersonId),
      eq(demoBookings.calendlyInviteeUri, booking.calendlyInviteeUri),
      inArray(demoBookings.status, [DEMO_BOOKING_STATUS.accepted, DEMO_BOOKING_STATUS.pendingAcceptance]),
    )).returning({ id: demoBookings.id });
    return result.length ? "rescheduled" : "unchanged";
  }
  if ((old as any).rescheduled === true) return "unchanged";
  const result = await db.update(demoBookings).set({
    status: DEMO_BOOKING_STATUS.cancelled,
    calendlyPayload: { lifecycle: "canceled", priorInviteeUri: booking.calendlyInviteeUri, updatedAt: new Date().toISOString() },
  }).where(and(
    eq(demoBookings.id, booking.id),
    eq(demoBookings.salespersonId, booking.salespersonId),
    eq(demoBookings.calendlyInviteeUri, booking.calendlyInviteeUri),
    inArray(demoBookings.status, [DEMO_BOOKING_STATUS.accepted, DEMO_BOOKING_STATUS.pendingAcceptance]),
  )).returning({ id: demoBookings.id });
  return result.length ? "canceled" : "unchanged";
}


export async function pollMarketingDemoCalendlyBookings(): Promise<void> {
  if (inFlight) return;
  const connections = await getSalespersonCalendlyConnections();
  if (!connections.length) return;
  inFlight = true;
  try {
    const allDemos = await readDemoBookings({});
    const awaiting = allDemos.filter((booking) => booking.status === DEMO_BOOKING_STATUS.awaitingSchedule);
    const active = allDemos.filter((booking) => (
      [DEMO_BOOKING_STATUS.accepted, DEMO_BOOKING_STATUS.pendingAcceptance].includes(booking.status as any)
      && Boolean(booking.calendlyInviteeUri)
    ));
    if (!awaiting.length && !active.length) {
      console.info(TAG, "No awaiting-schedule demo requests", { connectedSalespeople: connections.length });
      return;
    }
    const minStartTime = new Date(Date.now() - 14 * 86400000).toISOString();
    const maxStartTime = new Date(Date.now() + 365 * 86400000).toISOString();
    for (const connection of connections) {
      const token = connection.token;
      const assigned = awaiting.filter((b) => b.salespersonId === connection.salespersonId);
      const scheduled = active.filter(b => b.salespersonId === connection.salespersonId);
      if (!assigned.length && !scheduled.length) continue;
      let eventsScanned = 0;
      let inviteesScanned = 0;
      let missingTrackingId = 0;
      let matched = 0;
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
        for (const booking of scheduled) {
          const result = await reconcileScheduledDemo(token, booking);
          if (result !== "unchanged") console.info(TAG, "Lifecycle changed", { salespersonId: connection.salespersonId, bookingId: booking.id, result });
        }
        if (!assigned.length) continue;
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
            eventsScanned++;
            if (!event.uri || event.status === "canceled" || !event.start_time) continue;
            let inviteePage: string | undefined;
            for (let inviteeIndex = 0; inviteeIndex < 20; inviteeIndex++) {
              const response = await calendlyListEventInvitees(token, event.uri, inviteePage);
              if (!response.ok) {
                console.warn(TAG, "Calendly invitee list failed", { status: response.status });
                break;
              }
              for (const invitee of response.data?.collection || []) {
                inviteesScanned++;
                if (!invitee.email || invitee.status === "canceled" || invitee.cancellation) continue;
                const email = invitee.email.trim().toLowerCase();
                const tracking = invitee.tracking || {};
                // Cross-salesperson safety: require the exact request ID when reconciling automatically.
                // Email-only matches are reserved for manual review.
                if (!resolveMarketingDemoBookingIdFromTracking(tracking)) {
                  if (assigned.some(b => b.visitorEmail.trim().toLowerCase() === email)) missingTrackingId++;
                  continue;
                }
                if (!eligibleMarketingDemoBooking(assigned, email, tracking)) continue;
                matched++;
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
        console.info(TAG, "Poll summary", { salespersonId: connection.salespersonId, awaitingAssigned: assigned.length, eventsScanned, inviteesScanned, missingTrackingId, matched });
      } catch (error) {
        console.error(TAG, "Host reconciliation failed", { salespersonId: connection.salespersonId, message: error instanceof Error ? error.message : "unknown" });
      }
    }
  } finally {
    inFlight = false;
  }
}
