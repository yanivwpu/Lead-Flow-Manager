import { storage } from "./storage";
import { APPOINTMENT_SCHEDULED_TAG, isActiveFutureAppointment } from "@shared/activeAppointment";

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

/** Delete all active upcoming appointment rows for a contact. */
export async function clearActiveAppointmentsForContact(
  userId: string,
  contactId: string
): Promise<string[]> {
  const appts = await storage.getAppointmentsByContact(userId, contactId);
  const clearedIds: string[] = [];
  for (const appt of appts) {
    if (!isActiveFutureAppointment(appt)) continue;
    const ok = await storage.deleteAppointment(appt.id);
    if (ok) clearedIds.push(appt.id);
  }
  await clearStaleAppointmentScheduledTag(contactId);
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
  let followUpCleared = false;
  if (contact && (contact.followUpDate || contact.followUp)) {
    await storage.updateContact(
      contactId,
      { followUp: null, followUpDate: null },
      { skipAutomationHooks: true }
    );
    followUpCleared = true;
  }
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
  const contact = await storage.getContact(contactId);
  if (!contact) return { followUpCleared: false };

  const hasActive = await contactHasActiveUpcomingAppointment(userId, contactId);
  if (hasActive || (!contact.followUpDate && !contact.followUp)) {
    return { followUpCleared: false };
  }

  await storage.updateContact(
    contactId,
    { followUp: null, followUpDate: null },
    { skipAutomationHooks: true }
  );
  return { followUpCleared: true };
}
