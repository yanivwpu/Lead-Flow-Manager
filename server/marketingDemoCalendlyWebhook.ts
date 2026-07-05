import type { Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { DEMO_BOOKING_STATUS } from "@shared/salesCompensation";
import {
  isMarketingDemoCalendlyTracking,
  readMarketingDemoBookingIdFromTracking,
} from "@shared/marketingDemoCalendly";
import type { DemoBooking } from "@shared/schema";
import { salespeople } from "@shared/schema";
import { db } from "../drizzle/db";
import { extractCalendlyBookingPayload, verifyCalendlyWebhookSignature } from "./calendlyWebhook";
import { readDemoBookings } from "./demoBookingStorage";
import { sendDemoBookingNotification, sendDemoConfirmationEmail } from "./email";
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

async function findAwaitingMarketingDemoBooking(params: {
  demoBookingId?: string;
  inviteeEmail: string;
}): Promise<DemoBooking | undefined> {
  const normalizedEmail = params.inviteeEmail.trim().toLowerCase();
  if (params.demoBookingId) {
    const byId = await readDemoBookings({ id: params.demoBookingId });
    const match = byId[0];
    if (match?.status === DEMO_BOOKING_STATUS.awaitingSchedule) {
      return match;
    }
  }
  if (!normalizedEmail) return undefined;
  const byEmail = await readDemoBookings({ email: normalizedEmail });
  return byEmail.find((b) => b.status === DEMO_BOOKING_STATUS.awaitingSchedule);
}

export async function handleMarketingDemoCalendlyWebhook(req: Request, res: Response): Promise<void> {
  const rawBody = (req as { rawBody?: Buffer }).rawBody;
  const sigHeader = req.get("calendly-webhook-signature") || undefined;
  const signingKey =
    String(process.env.CALENDLY_MARKETING_DEMO_WEBHOOK_SIGNING_KEY || "").trim() ||
    String(process.env.CALENDLY_WEBHOOK_SIGNING_KEY || "").trim();

  if (!signingKey || !rawBody || !sigHeader) {
    if (process.env.CALENDLY_ALLOW_UNSIGNED_WEBHOOKS !== "true") {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  } else if (!verifyCalendlyWebhookSignature(rawBody, sigHeader, signingKey)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  res.status(200).json({ ok: true });

  setImmediate(() => {
    void processMarketingDemoCalendlyPayload(body).catch((err) => {
      console.error("[MarketingDemoCalendly] Async processing error:", err);
    });
  });
}

export async function processMarketingDemoCalendlyPayload(body: Record<string, unknown>): Promise<void> {
  const event = String(body.event || "");
  if (event !== "invitee.created") return;

  const tracking = readTrackingFromBody(body);
  if (!isMarketingDemoCalendlyTracking(tracking)) {
    logMarketingDemoCalendly("ignored_non_marketing_tracking", { event });
    return;
  }

  const parsed = extractCalendlyBookingPayload(body);
  if (!parsed?.email) {
    logMarketingDemoCalendly("invitee_created_unparsed", { event });
    return;
  }

  const demoBookingId = readMarketingDemoBookingIdFromTracking(tracking);
  const booking = await findAwaitingMarketingDemoBooking({
    demoBookingId,
    inviteeEmail: parsed.email,
  });

  if (!booking) {
    logMarketingDemoCalendly("booking_not_found", {
      demoBookingId: demoBookingId || null,
      email: parsed.email,
    });
    return;
  }

  if (booking.calendlyScheduledEventUri && parsed.scheduledEventUri) {
    if (booking.calendlyScheduledEventUri === parsed.scheduledEventUri && booking.calendlyConfirmedAt) {
      logMarketingDemoCalendly("duplicate_event_ignored", { bookingId: booking.id });
      return;
    }
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

  const updated = await storage.updateDemoBooking(booking.id, {
    scheduledDate: startTime,
    calendlyScheduledEventUri: parsed.scheduledEventUri ?? null,
    calendlyInviteeUri: parsed.inviteeUri ?? null,
    meetingLink: parsed.meetingLink ?? null,
    calendlyPayload: payloadSnapshot,
    calendlyConfirmedAt: confirmedAt,
    status: DEMO_BOOKING_STATUS.pendingAcceptance,
    assignedAt: booking.assignedAt ?? confirmedAt,
  });

  if (!updated) {
    logMarketingDemoCalendly("update_failed", { bookingId: booking.id });
    return;
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

  if (salesperson?.email) {
    await sendDemoBookingNotification(salesperson.email, salesperson.name, {
      name: booking.visitorName,
      email: booking.visitorEmail,
      phone: booking.visitorPhone,
      scheduledDate: startTime,
    }, parsed.meetingLink);
  }

  await sendDemoConfirmationEmail(
    booking.visitorEmail,
    booking.visitorName,
    startTime,
    salesperson?.name || "WhachatCRM",
    parsed.meetingLink,
  );

  logMarketingDemoCalendly("booking_confirmed", {
    bookingId: booking.id,
    salespersonId: booking.salespersonId,
    scheduledEventUri: parsed.scheduledEventUri,
    hasMeetingLink: Boolean(parsed.meetingLink),
  });
}
