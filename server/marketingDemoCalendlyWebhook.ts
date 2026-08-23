import type { Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { mapDemoBookingRow } from "./demoBookingRows";
import { DEMO_BOOKING_STATUS } from "@shared/salesCompensation";
import {
  isMarketingDemoCalendlyTracking,
  readMarketingDemoBookingIdFromCalendlyBody,
  resolveMarketingDemoBookingIdFromTracking,
} from "@shared/marketingDemoCalendly";
import type { DemoBooking } from "@shared/schema";
import { demoBookings, salespeople } from "@shared/schema";
import { db } from "../drizzle/db";
import { extractCalendlyBookingPayload, verifyCalendlyWebhookSignature } from "./calendlyWebhook";
import { readDemoBookings } from "./demoBookingStorage";
import { maskEmailForLogs, sendDemoConfirmationEmail } from "./email";
import { notifyAssignedSalespersonOfScheduledDemo } from "./demoSalespersonNotifications";
import { storage } from "./storage";

function logMarketingDemoCalendly(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag: "[MarketingDemoCalendly]", event, ...data }));
}

function readTrackingFromBody(body: Record<string, unknown>): unknown {
  const payload = (body.payload as Record<string, unknown>) || body;
  const invitee = (payload.invitee as Record<string, unknown>) || payload;
  const scheduled =
    payload.scheduled_event && typeof payload.scheduled_event === "object"
      ? payload.scheduled_event
      : invitee.scheduled_event;
  return (
    payload.tracking ||
    invitee.tracking ||
    (scheduled && typeof scheduled === "object" ? (scheduled as Record<string, unknown>).tracking : undefined)
  );
}

async function countAwaitingScheduleByEmail(email: string): Promise<number> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return 0;
  try {
    const rows = await db
      .select({ id: demoBookings.id })
      .from(demoBookings)
      .where(
        and(
          eq(demoBookings.status, DEMO_BOOKING_STATUS.awaitingSchedule),
          sql`LOWER(TRIM(${demoBookings.visitorEmail})) = ${normalizedEmail}`,
        ),
      );
    return rows.length;
  } catch {
    return 0;
  }
}

async function findAwaitingMarketingDemoBooking(params: {
  demoBookingId?: string;
  inviteeEmail: string;
}): Promise<{ booking?: DemoBooking; rejectReason?: string }> {
  const normalizedEmail = params.inviteeEmail.trim().toLowerCase();

  if (params.demoBookingId) {
    const byId = await readDemoBookings({ id: params.demoBookingId });
    const match = byId[0];
    if (!match) {
      return { rejectReason: "booking_id_not_found" };
    }
    if (match.status !== DEMO_BOOKING_STATUS.awaitingSchedule) {
      return { booking: undefined, rejectReason: `booking_id_wrong_status:${match.status}` };
    }
    return { booking: match };
  }

  if (!normalizedEmail) {
    return { rejectReason: "missing_invitee_email" };
  }

  try {
    const rows = await db
      .select()
      .from(demoBookings)
      .where(
        and(
          eq(demoBookings.status, DEMO_BOOKING_STATUS.awaitingSchedule),
          sql`LOWER(TRIM(${demoBookings.visitorEmail})) = ${normalizedEmail}`,
        ),
      )
      .orderBy(desc(demoBookings.createdAt))
      .limit(1);
    if (rows[0]) {
      const booking = (await readDemoBookings({ id: rows[0].id }))[0];
      if (booking) return { booking };
    }
  } catch (err) {
    console.warn("[MarketingDemoCalendly] case-insensitive email lookup failed, falling back:", err);
  }

  const byEmail = await readDemoBookings({ email: normalizedEmail });
  const match = byEmail.find((b) => b.status === DEMO_BOOKING_STATUS.awaitingSchedule);
  if (match) return { booking: match };

  return { rejectReason: "no_awaiting_schedule_for_email" };
}

export function shouldSkipDuplicateMarketingDemoConfirm(params: {
  status: string;
  calendlyConfirmedAt?: Date | string | null;
  calendlyScheduledEventUri?: string | null;
  incomingScheduledEventUri?: string | null;
}): { skip: true; reason: string } | { skip: false } {
  const confirmed = params.calendlyConfirmedAt != null && params.calendlyConfirmedAt !== "";
  if (
    params.calendlyScheduledEventUri &&
    params.incomingScheduledEventUri &&
    params.calendlyScheduledEventUri === params.incomingScheduledEventUri &&
    confirmed
  ) {
    return { skip: true, reason: "same_scheduled_event" };
  }
  if (confirmed) return { skip: true, reason: "already_calendly_confirmed" };
  if (params.status !== DEMO_BOOKING_STATUS.awaitingSchedule) {
    return { skip: true, reason: "not_awaiting_schedule" };
  }
  return { skip: false };
}

/** Atomic confirm: only one invitee.created can move awaiting_schedule → pending_acceptance. */
async function confirmAwaitingScheduleDemoBooking(
  bookingId: string,
  updates: Partial<DemoBooking>,
): Promise<{ booking?: DemoBooking; skippedReason?: string }> {
  try {
    const result = await db
      .update(demoBookings)
      .set(updates)
      .where(
        and(
          eq(demoBookings.id, bookingId),
          eq(demoBookings.status, DEMO_BOOKING_STATUS.awaitingSchedule),
        ),
      )
      .returning();
    if (!result[0]) {
      return { skippedReason: "confirm_race_or_already_confirmed" };
    }
    return { booking: mapDemoBookingRow(result[0] as Record<string, unknown>) };
  } catch (err) {
    logMarketingDemoCalendly("confirm_conditional_update_fallback", {
      bookingId,
      error: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    });
    const updated = await storage.updateDemoBooking(bookingId, updates);
    if (!updated) return { skippedReason: "update_failed" };
    return { booking: updated };
  }
}

export async function handleMarketingDemoCalendlyWebhook(req: Request, res: Response): Promise<void> {
  const rawBody = (req as { rawBody?: Buffer }).rawBody;
  const sigHeader = req.get("calendly-webhook-signature") || undefined;
  const signingKey =
    String(process.env.CALENDLY_MARKETING_DEMO_WEBHOOK_SIGNING_KEY || "").trim() ||
    String(process.env.CALENDLY_WEBHOOK_SIGNING_KEY || "").trim();

  let body: Record<string, unknown> = {};
  try {
    body = (req.body as Record<string, unknown>) || {};
  } catch {
    body = {};
  }

  logMarketingDemoCalendly("http_received", {
    event: body.event ?? null,
    hasSignatureHeader: Boolean(sigHeader),
    hasSigningKey: Boolean(signingKey),
    hasRawBody: Boolean(rawBody?.length),
  });

  if (!signingKey || !rawBody || !sigHeader) {
    if (process.env.CALENDLY_ALLOW_UNSIGNED_WEBHOOKS !== "true") {
      logMarketingDemoCalendly("auth_rejected", {
        reason: !signingKey ? "missing_signing_key" : !sigHeader ? "missing_signature_header" : "missing_raw_body",
      });
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    logMarketingDemoCalendly("auth_unsigned_allowed", { reason: "CALENDLY_ALLOW_UNSIGNED_WEBHOOKS" });
  } else if (!verifyCalendlyWebhookSignature(rawBody, sigHeader, signingKey)) {
    logMarketingDemoCalendly("auth_rejected", { reason: "invalid_signature" });
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.status(200).json({ ok: true });

  setImmediate(() => {
    void processMarketingDemoCalendlyPayload(body).catch((err) => {
      console.error("[MarketingDemoCalendly] Async processing error:", err);
    });
  });
}

export async function processMarketingDemoCalendlyPayload(body: Record<string, unknown>): Promise<void> {
  const event = String(body.event || "");
  if (event !== "invitee.created") {
    logMarketingDemoCalendly("ignored_event", { event: event || null });
    return;
  }

  const tracking = readTrackingFromBody(body);
  logMarketingDemoCalendly("invitee_created_received", {
    hasMarketingUtmMedium: isMarketingDemoCalendlyTracking(tracking),
    tracking: tracking && typeof tracking === "object" ? tracking : null,
  });

  const parsed = extractCalendlyBookingPayload(body);
  if (!parsed?.email) {
    logMarketingDemoCalendly("invitee_created_unparsed", { event });
    return;
  }

  const demoBookingId =
    resolveMarketingDemoBookingIdFromTracking(tracking) ||
    readMarketingDemoBookingIdFromCalendlyBody(body);

  const { booking, rejectReason } = await findAwaitingMarketingDemoBooking({
    demoBookingId,
    inviteeEmail: parsed.email,
  });

  if (!booking) {
    const awaitingCount = await countAwaitingScheduleByEmail(parsed.email);
    logMarketingDemoCalendly("booking_not_found", {
      demoBookingId: demoBookingId || null,
      inviteeEmail: parsed.email,
      rejectReason: rejectReason || "unknown",
      awaitingScheduleRowsForEmail: awaitingCount,
      hasMarketingUtmMedium: isMarketingDemoCalendlyTracking(tracking),
      tracking: tracking && typeof tracking === "object" ? tracking : null,
    });
    return;
  }

  const dup = shouldSkipDuplicateMarketingDemoConfirm({
    status: booking.status,
    calendlyConfirmedAt: booking.calendlyConfirmedAt,
    calendlyScheduledEventUri: booking.calendlyScheduledEventUri,
    incomingScheduledEventUri: parsed.scheduledEventUri,
  });
  if (dup.skip) {
    logMarketingDemoCalendly("duplicate_event_ignored", {
      bookingId: booking.id,
      reason: dup.reason,
    });
    return;
  }

  const startTime = parsed.startTime ? new Date(parsed.startTime) : null;
  if (!startTime || Number.isNaN(startTime.getTime())) {
    logMarketingDemoCalendly("missing_start_time", { bookingId: booking.id });
    return;
  }

  const confirmedAt = new Date();
  const payloadSnapshot = {
    event: body.event,
    inviteeEmail: parsed.email,
    inviteeName: parsed.name,
    eventTypeName: parsed.eventTypeName,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    scheduledEventUri: parsed.scheduledEventUri,
    inviteeUri: parsed.inviteeUri,
    meetingLink: parsed.meetingLink,
    tracking,
    recordedAt: confirmedAt.toISOString(),
  };

  const confirm = await confirmAwaitingScheduleDemoBooking(booking.id, {
    scheduledDate: startTime,
    calendlyScheduledEventUri: parsed.scheduledEventUri ?? null,
    calendlyInviteeUri: parsed.inviteeUri ?? null,
    meetingLink: parsed.meetingLink ?? null,
    calendlyPayload: payloadSnapshot,
    calendlyConfirmedAt: confirmedAt,
    status: DEMO_BOOKING_STATUS.pendingAcceptance,
    assignedAt: booking.assignedAt ?? confirmedAt,
  });

  if (confirm.skippedReason === "confirm_race_or_already_confirmed") {
    logMarketingDemoCalendly("duplicate_event_ignored", {
      bookingId: booking.id,
      reason: confirm.skippedReason,
    });
    return;
  }

  const updated = confirm.booking;
  if (!updated) {
    logMarketingDemoCalendly("update_failed", { bookingId: booking.id });
    return;
  }

  if (updated.status !== DEMO_BOOKING_STATUS.pendingAcceptance) {
    logMarketingDemoCalendly("update_status_unexpected", {
      bookingId: booking.id,
      status: updated.status,
    });
  }

  if (booking.salespersonId) {
    await db
      .update(salespeople)
      .set({ totalBookings: sql`${salespeople.totalBookings} + 1` })
      .where(eq(salespeople.id, booking.salespersonId));
  }

  const salesperson = booking.salespersonId
    ? await storage.getSalesperson(booking.salespersonId)
    : undefined;

  let salespersonNotificationSent = false;
  if (salesperson?.email) {
    const notify = await notifyAssignedSalespersonOfScheduledDemo({
      bookingId: booking.id,
      salespersonId: booking.salespersonId,
      salespersonEmail: salesperson.email,
      salespersonName: salesperson.name,
      visitorName: booking.visitorName,
      visitorEmail: booking.visitorEmail,
      visitorPhone: booking.visitorPhone,
      scheduledDate: startTime,
      meetingLink: parsed.meetingLink,
    });
    salespersonNotificationSent = notify.ok;
  } else {
    logMarketingDemoCalendly("salesperson_notification_skipped", {
      bookingId: booking.id,
      reason: "no_salesperson_email",
    });
  }

  const customerConfirmationSent = await sendDemoConfirmationEmail(
    booking.visitorEmail,
    booking.visitorName,
    startTime,
    salesperson?.name || "WhachatCRM",
    parsed.meetingLink,
  );

  logMarketingDemoCalendly("emails_dispatched", {
    bookingId: booking.id,
    customerEmailMasked: maskEmailForLogs(booking.visitorEmail),
    customerConfirmationSent,
    salespersonEmailMasked: maskEmailForLogs(salesperson?.email || null),
    salespersonNotificationSent,
  });

  logMarketingDemoCalendly("booking_confirmed", {
    bookingId: booking.id,
    salespersonId: booking.salespersonId,
    scheduledEventUri: parsed.scheduledEventUri,
    hasMeetingLink: Boolean(parsed.meetingLink),
    customerConfirmationSent,
    salespersonNotificationSent,
  });
}
