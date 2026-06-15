import type { Appointment } from "@shared/schema";
import { storage } from "./storage";
import { APPOINTMENT_SCHEDULED_TAG, isActiveFutureAppointment } from "@shared/activeAppointment";
import { recordCalendlyCanceledEventTombstone } from "./calendlyBookingLifecycleGate";

const APPOINTMENT_SET_STAGE = "Appointment Set";
const APPOINTMENT_REQUESTED_STAGE = "Appointment Requested";

export type AppointmentDeleteCleanupResult = {
  success: boolean;
  contactId?: string;
  tombstoned: boolean;
  followUpCleared: boolean;
  pipelineReverted: boolean;
};

/**
 * Removes legacy "Appointment Scheduled" from contacts.tag (CRM field only).
 * Appointment state lives in the appointments table — never write booking status to tag.
 */
export async function clearStaleAppointmentScheduledTag(
  contactId: string,
  options?: { skipAutomationHooks?: boolean }
): Promise<{ changed: boolean }> {
  const contact = await storage.getContact(contactId);
  if (!contact || contact.tag !== APPOINTMENT_SCHEDULED_TAG) {
    return { changed: false };
  }

  await storage.updateContact(
    contactId,
    { tag: "New" },
    { skipAutomationHooks: options?.skipAutomationHooks ?? true }
  );

  return { changed: true };
}

function followUpMatchesAppointment(
  contact: { followUpDate?: Date | string | null; followUp?: string | null },
  appt: { appointmentDate?: Date | string | null; title?: string | null },
): boolean {
  if (!contact.followUpDate || !appt.appointmentDate) return false;
  const followMs = new Date(contact.followUpDate).getTime();
  const apptMs = new Date(appt.appointmentDate).getTime();
  if (!Number.isFinite(followMs) || !Number.isFinite(apptMs)) return false;
  return Math.abs(followMs - apptMs) < 60_000;
}

type RemovedAppointmentRef = Pick<
  Appointment,
  "id" | "title" | "appointmentDate" | "source" | "conversationId" | "calendlyScheduledEventUri" | "appointmentType"
>;

/**
 * Reconcile contact CRM fields after one or more appointments were removed.
 * Clears follow-up, reverts pipeline, and marks calendlyLastBooking cancelled when appropriate.
 */
export async function syncContactCrmAfterAppointmentRemoved(
  userId: string,
  contactId: string,
  removed?: RemovedAppointmentRef | null,
): Promise<{ followUpCleared: boolean; pipelineReverted: boolean }> {
  const contact = await storage.getContact(contactId);
  if (!contact) return { followUpCleared: false, pipelineReverted: false };

  const activeRows = (await storage.getAppointmentsByContact(userId, contactId)).filter(
    isActiveFutureAppointment,
  );
  const hasActive = activeRows.length > 0;

  const prevCf = ((contact.customFields as Record<string, unknown> | null) || {}) as Record<string, unknown>;
  const lastBooking =
    prevCf.calendlyLastBooking && typeof prevCf.calendlyLastBooking === "object"
      ? (prevCf.calendlyLastBooking as Record<string, unknown>)
      : null;

  const patch: Record<string, unknown> = {};
  let followUpCleared = false;
  let pipelineReverted = false;

  const removedTiedToFollowUp =
    removed &&
    (followUpMatchesAppointment(contact, removed) || lastBooking?.appointmentId === removed.id);

  if (!hasActive) {
    if (contact.followUpDate || contact.followUp) {
      patch.followUp = null;
      patch.followUpDate = null;
      followUpCleared = true;
    }
    if (contact.pipelineStage === APPOINTMENT_SET_STAGE) {
      patch.pipelineStage = APPOINTMENT_REQUESTED_STAGE;
      pipelineReverted = true;
    }
  } else if (removedTiedToFollowUp) {
    const next = [...activeRows].sort(
      (a, b) => new Date(a.appointmentDate!).getTime() - new Date(b.appointmentDate!).getTime(),
    )[0];
    if (next) {
      patch.followUp = next.title || next.appointmentType || "Appointment";
      patch.followUpDate = next.appointmentDate;
    }
  }

  if (removed && lastBooking?.appointmentId === removed.id) {
    patch.customFields = {
      ...prevCf,
      calendlyLastBooking: {
        ...lastBooking,
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
      },
    };
  } else if (!hasActive && lastBooking && lastBooking.status !== "cancelled") {
    patch.customFields = {
      ...prevCf,
      calendlyLastBooking: {
        ...lastBooking,
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
      },
    };
  }

  if (Object.keys(patch).length > 0) {
    await storage.updateContact(contactId, patch as any, { skipAutomationHooks: true });
  }

  await clearStaleAppointmentScheduledTag(contactId);

  return { followUpCleared, pipelineReverted };
}

async function logAppointmentDeleteActivity(
  userId: string,
  appt: RemovedAppointmentRef & { contactId: string },
): Promise<void> {
  const eventType = appt.source === "calendly" ? "calendly_booking_canceled" : "appointment_deleted";
  await storage.createActivityEvent({
    userId,
    contactId: appt.contactId,
    conversationId: appt.conversationId ?? null,
    eventType,
    eventData: {
      appointmentId: appt.id,
      title: appt.title,
      startTime:
        appt.appointmentDate instanceof Date
          ? appt.appointmentDate.toISOString()
          : appt.appointmentDate ?? null,
      source: appt.source,
      deletedVia: "ui",
    },
    actorType: "user",
  });
}

/**
 * Delete a single appointment from WhachatCRM UI with full CRM + Calendly anti-resurrection cleanup.
 */
export async function deleteAppointmentWithContactCleanup(
  userId: string,
  appointmentId: string,
): Promise<AppointmentDeleteCleanupResult> {
  const appt = await storage.getAppointmentById(appointmentId);
  if (!appt || appt.userId !== userId) {
    return { success: false, tombstoned: false, followUpCleared: false, pipelineReverted: false };
  }

  let tombstoned = false;
  if (appt.source === "calendly" && appt.calendlyScheduledEventUri?.trim()) {
    await recordCalendlyCanceledEventTombstone({
      userId,
      identity: {
        scheduledEventUri: appt.calendlyScheduledEventUri,
        inviteeUri: appt.calendlyInviteeUri,
      },
      contactId: appt.contactId,
      cancelReason: "ui_delete",
      source: "appointment_delete_route",
    });
    tombstoned = true;
  }

  const ok = await storage.deleteAppointment(appointmentId);
  if (!ok) {
    return { success: false, tombstoned, followUpCleared: false, pipelineReverted: false };
  }

  const crm = await syncContactCrmAfterAppointmentRemoved(userId, appt.contactId, appt);
  await logAppointmentDeleteActivity(userId, appt);

  console.info(
    "[AppointmentDeleteTrace]",
    JSON.stringify({
      appointmentId,
      contactId: appt.contactId,
      source: appt.source,
      tombstoned,
      followUpCleared: crm.followUpCleared,
      pipelineReverted: crm.pipelineReverted,
      calendlyScheduledEventUri: appt.calendlyScheduledEventUri ?? null,
      loggedAt: new Date().toISOString(),
    }),
  );

  return {
    success: true,
    contactId: appt.contactId,
    tombstoned,
    followUpCleared: crm.followUpCleared,
    pipelineReverted: crm.pipelineReverted,
  };
}

/** Delete all active upcoming appointment rows for a contact. */
export async function clearActiveAppointmentsForContact(
  userId: string,
  contactId: string
): Promise<string[]> {
  const appts = await storage.getAppointmentsByContact(userId, contactId);
  const clearedIds: string[] = [];
  for (const appt of appts) {
    if (!isActiveFutureAppointment(appt)) continue;
    if (appt.source === "calendly" && appt.calendlyScheduledEventUri?.trim()) {
      await recordCalendlyCanceledEventTombstone({
        userId,
        identity: {
          scheduledEventUri: appt.calendlyScheduledEventUri,
          inviteeUri: appt.calendlyInviteeUri,
        },
        contactId,
        cancelReason: "manual_clear_active_appointments",
        source: "contactAppointmentSync",
      });
    }
    const ok = await storage.deleteAppointment(appt.id);
    if (ok) clearedIds.push(appt.id);
  }
  if (clearedIds.length > 0) {
    await syncContactCrmAfterAppointmentRemoved(userId, contactId, null);
  } else {
    await clearStaleAppointmentScheduledTag(contactId);
  }
  return clearedIds;
}

/**
 * Remove all active booked meetings and appointment-linked followUp fields for a contact.
 * CRM tag is never modified.
 */
export async function clearBookedMeetingsForContact(
  userId: string,
  contactId: string
): Promise<{ clearedAppointmentIds: string[]; followUpCleared: boolean }> {
  const clearedAppointmentIds = await clearActiveAppointmentsForContact(userId, contactId);
  const contact = await storage.getContact(contactId);
  const followUpCleared = Boolean(
    clearedAppointmentIds.length > 0 && contact && !contact.followUpDate && !contact.followUp,
  );
  return { clearedAppointmentIds, followUpCleared };
}

export async function contactHasActiveUpcomingAppointment(
  userId: string,
  contactId: string
): Promise<boolean> {
  const rows = await storage.getAppointmentsByContact(userId, contactId);
  return rows.some(isActiveFutureAppointment);
}

/**
 * When no active upcoming appointments remain, clear appointment-linked followUp fields.
 * CRM tag is never modified.
 */
export async function syncContactFollowUpAfterAppointmentChange(
  userId: string,
  contactId: string
): Promise<{ followUpCleared: boolean }> {
  const result = await syncContactCrmAfterAppointmentRemoved(userId, contactId, null);
  return { followUpCleared: result.followUpCleared };
}
