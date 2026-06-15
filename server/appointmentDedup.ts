import { and, desc, eq, inArray, or } from "drizzle-orm";
import { appointments } from "@shared/schema";
import { db } from "../drizzle/db";
import { storage } from "./storage";
import {
  buildCalendlyBookingMessageExternalId,
  calendlyStartTimesMatch,
  isCalendlyBookingCanceledPayload,
  normalizeCalendlyUri,
  primaryCalendlyDedupeUri,
  type CalendlyAppointmentIdentity,
} from "@shared/calendlyAppointmentDedup";
import { ACTIVE_APPOINTMENT_STATUSES } from "@shared/activeAppointment";
import type { Appointment } from "@shared/schema";
import { isCalendlyEventUriTombstoned } from "./calendlyBookingLifecycleGate";

export type AppointmentDedupAction = "created" | "updated" | "skipped_duplicate" | "ignored_canceled_event" | "canceled";

export type AppointmentDedupTrace = {
  source: string;
  calendlyEventUri?: string | null;
  calendlyInviteeUri?: string | null;
  contactId?: string | null;
  startTime?: string | null;
  existingAppointmentId?: string | null;
  existingMessageId?: string | null;
  action: AppointmentDedupAction;
  reason?: string;
};

const LOG_TAG = "[AppointmentDedupTrace]";

export function logAppointmentDedupTrace(trace: AppointmentDedupTrace): void {
  console.warn(
    LOG_TAG,
    JSON.stringify({
      ...trace,
      loggedAt: new Date().toISOString(),
    }),
  );
}

export async function findExistingCalendlyAppointment(
  userId: string,
  identity: CalendlyAppointmentIdentity,
): Promise<Appointment | undefined> {
  const uriCandidates = [
    normalizeCalendlyUri(identity.scheduledEventUri),
    normalizeCalendlyUri(identity.inviteeUri),
    normalizeCalendlyUri(identity.externalMessageId),
  ].filter(Boolean);

  if (uriCandidates.length > 0) {
    const rows = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.userId, userId),
          or(
            inArray(appointments.calendlyScheduledEventUri, uriCandidates),
            inArray(appointments.calendlyInviteeUri, uriCandidates),
          ),
        ),
      )
      .orderBy(desc(appointments.createdAt))
      .limit(1);
    if (rows[0]) return rows[0];
  }

  const contactId = identity.contactId?.trim();
  const startIso = identity.startTimeIso?.trim();
  if (contactId && startIso) {
    const startDate = new Date(startIso);
    if (!Number.isNaN(startDate.getTime())) {
      const rows = await db
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.userId, userId),
            eq(appointments.contactId, contactId),
            eq(appointments.source, "calendly"),
            inArray(appointments.status, [
              ...ACTIVE_APPOINTMENT_STATUSES,
              "scheduled",
              "cancelled",
              "rescheduled",
            ]),
          ),
        )
        .orderBy(desc(appointments.appointmentDate), desc(appointments.createdAt))
        .limit(5);
      for (const row of rows) {
        if (calendlyStartTimesMatch(startIso, row.appointmentDate)) return row;
      }
    }
  }

  return undefined;
}

export async function findExistingCalendlyBookingMessage(
  userId: string,
  identity: CalendlyAppointmentIdentity,
): Promise<{ id: string; conversationId: string; contactId: string } | undefined> {
  const externalIds = [
    buildCalendlyBookingMessageExternalId(identity),
    normalizeCalendlyUri(identity.scheduledEventUri),
    normalizeCalendlyUri(identity.inviteeUri),
    normalizeCalendlyUri(identity.externalMessageId),
  ].filter(Boolean);

  for (const externalMessageId of externalIds) {
    const msg = await storage.getMessageByUserExternalId(userId, externalMessageId);
    if (msg?.conversationId && msg.contactId) {
      return { id: msg.id, conversationId: msg.conversationId, contactId: msg.contactId };
    }
  }
  return undefined;
}

export async function evaluateCalendlyBookingIngest(params: {
  source: string;
  userId: string;
  identity: CalendlyAppointmentIdentity;
  eventType: "invitee.created" | "invitee.canceled" | "invitee.rescheduled" | "other";
}): Promise<{
  action: AppointmentDedupAction;
  existingAppointment?: Appointment;
  existingMessage?: { id: string; conversationId: string; contactId: string };
  primaryUri: string;
  messageExternalId: string;
  skipEntireIngest: boolean;
}> {
  const primaryUri = primaryCalendlyDedupeUri(params.identity);
  const messageExternalId =
    buildCalendlyBookingMessageExternalId(params.identity) ||
    normalizeCalendlyUri(params.identity.externalMessageId);

  const existingAppointment = await findExistingCalendlyAppointment(params.userId, params.identity);
  const existingMessage = await findExistingCalendlyBookingMessage(params.userId, {
    ...params.identity,
    externalMessageId: messageExternalId || params.identity.externalMessageId,
  });

  let action: AppointmentDedupAction = "created";
  let skipEntireIngest = false;
  let reason: string | undefined;

  if (params.eventType === "invitee.created") {
    const tombstoned = await isCalendlyEventUriTombstoned(params.userId, [
      params.identity.scheduledEventUri,
      params.identity.inviteeUri,
      params.identity.externalMessageId,
      primaryUri,
      messageExternalId,
    ]);
    if (tombstoned) {
      action = "ignored_canceled_event";
      skipEntireIngest = true;
      reason = "tombstoned_canceled_event_uri";
    } else if (
      existingAppointment &&
      (existingAppointment.status === "cancelled" || existingAppointment.status === "rescheduled")
    ) {
      action = "ignored_canceled_event";
      skipEntireIngest = true;
      reason = "appointment_already_cancelled_for_event";
    } else if (existingAppointment?.status === "scheduled" && existingMessage) {
      action = "skipped_duplicate";
      skipEntireIngest = true;
      reason = "appointment_and_message_exist";
    } else if (existingAppointment?.status === "scheduled") {
      action = "updated";
      reason = "appointment_exists_missing_message";
    }
  } else if (params.eventType === "invitee.canceled") {
    if (
      existingAppointment &&
      (existingAppointment.status === "cancelled" || existingAppointment.status === "rescheduled")
    ) {
      action = "skipped_duplicate";
      skipEntireIngest = true;
      reason = "already_cancelled";
    } else if (existingAppointment) {
      action = "canceled";
      reason = "cancel_existing_appointment";
    } else {
      action = "ignored_canceled_event";
      skipEntireIngest = true;
      reason = "no_appointment_to_cancel";
    }
  }

  logAppointmentDedupTrace({
    source: params.source,
    calendlyEventUri: params.identity.scheduledEventUri,
    calendlyInviteeUri: params.identity.inviteeUri,
    contactId: params.identity.contactId,
    startTime: params.identity.startTimeIso,
    existingAppointmentId: existingAppointment?.id ?? null,
    existingMessageId: existingMessage?.id ?? null,
    action,
    reason,
  });

  return {
    action,
    existingAppointment,
    existingMessage,
    primaryUri,
    messageExternalId,
    skipEntireIngest,
  };
}

/** Poll / manual sync — skip re-ingest when booking already fully recorded. */
export async function shouldSkipCalendlyPollIngest(params: {
  userId: string;
  eventType: "invitee.created" | "invitee.canceled";
  scheduledEventUri?: string;
  inviteeUri?: string;
  contactId?: string;
  startTimeIso?: string;
  body?: Record<string, unknown>;
}): Promise<boolean> {
  if (params.body && params.eventType === "invitee.created" && isCalendlyBookingCanceledPayload(params.body)) {
    return false;
  }
  const evaluation = await evaluateCalendlyBookingIngest({
    source: "calendly_poll",
    userId: params.userId,
    identity: {
      scheduledEventUri: params.scheduledEventUri,
      inviteeUri: params.inviteeUri,
      contactId: params.contactId,
      startTimeIso: params.startTimeIso,
    },
    eventType: params.eventType === "invitee.canceled" ? "invitee.canceled" : "invitee.created",
  });
  return evaluation.skipEntireIngest;
}
