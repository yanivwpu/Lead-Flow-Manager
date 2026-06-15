/**
 * Central gate for Calendly booking lifecycle — blocks resurrecting canceled/deleted events.
 */
import { and, eq, inArray, or } from "drizzle-orm";
import { appointments, calendlyCanceledEventTombstones } from "@shared/schema";
import type { Appointment } from "@shared/schema";
import {
  isCalendlyBookingCanceledPayload,
  normalizeCalendlyUri,
  primaryCalendlyDedupeUri,
  type CalendlyAppointmentIdentity,
} from "@shared/calendlyAppointmentDedup";
import { db } from "../drizzle/db";
import { storage } from "./storage";
import { logBookingResurrectionTrace } from "./calendlyBookingResurrectionTrace";

export type CalendlyBookingGateResult = {
  blocked: boolean;
  reason?: string;
  tombstoned?: boolean;
};

function uriCandidatesFromIdentity(identity: CalendlyAppointmentIdentity): string[] {
  return [
    normalizeCalendlyUri(identity.scheduledEventUri),
    normalizeCalendlyUri(identity.inviteeUri),
    normalizeCalendlyUri(identity.externalMessageId),
  ].filter(Boolean);
}

export async function isCalendlyEventUriTombstoned(
  userId: string,
  uris: Array<string | null | undefined>,
): Promise<boolean> {
  const candidates = [...new Set(uris.map((u) => normalizeCalendlyUri(u)).filter(Boolean))];
  if (candidates.length === 0) return false;

  const rows = await db
    .select({ id: calendlyCanceledEventTombstones.id })
    .from(calendlyCanceledEventTombstones)
    .where(
      and(
        eq(calendlyCanceledEventTombstones.userId, userId),
        or(
          inArray(calendlyCanceledEventTombstones.scheduledEventUri, candidates),
          inArray(calendlyCanceledEventTombstones.inviteeUri, candidates),
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function recordCalendlyCanceledEventTombstone(params: {
  userId: string;
  identity: CalendlyAppointmentIdentity;
  contactId?: string | null;
  cancelReason?: string | null;
  source: string;
}): Promise<void> {
  const scheduledEventUri =
    normalizeCalendlyUri(params.identity.scheduledEventUri) ||
    primaryCalendlyDedupeUri(params.identity);
  if (!scheduledEventUri) return;

  await storage.recordCalendlyCanceledEventTombstone({
    userId: params.userId,
    scheduledEventUri,
    inviteeUri: normalizeCalendlyUri(params.identity.inviteeUri) || null,
    contactId: params.contactId || null,
    cancelReason: params.cancelReason || null,
    source: params.source,
  });

  logBookingResurrectionTrace({
    source: params.source,
    functionName: "recordCalendlyCanceledEventTombstone",
    scheduledEventUri,
    inviteeUri: params.identity.inviteeUri,
    action: "recorded_cancel_tombstone",
    outboundMessageSent: false,
    reason: params.cancelReason || undefined,
  });
}

export async function backfillCalendlyCanceledTombstonesFromAppointments(userId?: string): Promise<number> {
  const rows = await db
    .select({
      userId: appointments.userId,
      scheduledEventUri: appointments.calendlyScheduledEventUri,
      inviteeUri: appointments.calendlyInviteeUri,
      contactId: appointments.contactId,
      status: appointments.status,
    })
    .from(appointments)
    .where(
      userId
        ? and(
            eq(appointments.userId, userId),
            inArray(appointments.status, ["cancelled", "rescheduled"]),
          )
        : inArray(appointments.status, ["cancelled", "rescheduled"]),
    );

  let inserted = 0;
  for (const row of rows) {
    const uri = normalizeCalendlyUri(row.scheduledEventUri);
    if (!uri) continue;
    const ok = await storage.recordCalendlyCanceledEventTombstone({
      userId: row.userId,
      scheduledEventUri: uri,
      inviteeUri: normalizeCalendlyUri(row.inviteeUri) || null,
      contactId: row.contactId,
      cancelReason: `backfill_${row.status}`,
      source: "startup_backfill",
    });
    if (ok) inserted++;
  }
  return inserted;
}

/** Hard gate before any schedule confirmation, CRM effects, or appointment reactivation. */
export async function assertCalendlyBookingMayProceed(params: {
  source: string;
  functionName: string;
  userId: string;
  eventType: string;
  identity: CalendlyAppointmentIdentity;
  existingAppointment?: Appointment | null;
  body?: Record<string, unknown>;
}): Promise<CalendlyBookingGateResult> {
  const scheduledEventUri =
    params.identity.scheduledEventUri || primaryCalendlyDedupeUri(params.identity) || null;
  const existingStatus = params.existingAppointment?.status ?? null;

  if (params.body && isCalendlyBookingCanceledPayload(params.body)) {
    logBookingResurrectionTrace({
      source: params.source,
      functionName: params.functionName,
      scheduledEventUri,
      inviteeUri: params.identity.inviteeUri,
      status: params.eventType,
      existingAppointmentStatus: existingStatus,
      action: "blocked_canceled_payload",
      outboundMessageSent: false,
      reason: "canceled_payload",
      eventType: params.eventType,
    });
    return { blocked: true, reason: "canceled_payload" };
  }

  const tombstoned = await isCalendlyEventUriTombstoned(
    params.userId,
    uriCandidatesFromIdentity(params.identity),
  );
  if (tombstoned) {
    logBookingResurrectionTrace({
      source: params.source,
      functionName: params.functionName,
      scheduledEventUri,
      inviteeUri: params.identity.inviteeUri,
      status: params.eventType,
      existingAppointmentStatus: existingStatus,
      action: "blocked_tombstone",
      outboundMessageSent: false,
      reason: "tombstoned_event_uri",
      eventType: params.eventType,
    });
    return { blocked: true, reason: "tombstoned_event_uri", tombstoned: true };
  }

  if (
    params.existingAppointment &&
    (params.existingAppointment.status === "cancelled" ||
      params.existingAppointment.status === "rescheduled")
  ) {
    logBookingResurrectionTrace({
      source: params.source,
      functionName: params.functionName,
      scheduledEventUri,
      inviteeUri: params.identity.inviteeUri,
      status: params.eventType,
      existingAppointmentStatus: existingStatus,
      action: "blocked_cancelled_appointment",
      outboundMessageSent: false,
      reason: "appointment_already_cancelled",
      eventType: params.eventType,
    });
    return { blocked: true, reason: "appointment_already_cancelled" };
  }

  return { blocked: false };
}

export function isTerminalCalendlyAppointmentStatus(status: string | null | undefined): boolean {
  return status === "cancelled" || status === "rescheduled";
}
