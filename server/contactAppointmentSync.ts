import { storage } from "./storage";
import {
  APPOINTMENT_SCHEDULED_TAG,
  isActiveFutureAppointment,
} from "@shared/activeAppointment";

export async function contactHasActiveUpcomingAppointment(
  userId: string,
  contactId: string
): Promise<boolean> {
  const rows = await storage.getAppointmentsByContact(userId, contactId);
  return rows.some(isActiveFutureAppointment);
}

/**
 * Keeps contact.tag aligned with the appointments table (source of truth).
 * Clears stale "Appointment Scheduled" when no active upcoming appointment exists.
 */
export async function syncContactAppointmentFlags(
  contactId: string,
  options?: { skipAutomationHooks?: boolean }
): Promise<{ changed: boolean; clearedTag: boolean; setTag: boolean }> {
  const contact = await storage.getContact(contactId);
  if (!contact) {
    return { changed: false, clearedTag: false, setTag: false };
  }

  const hasActive = await contactHasActiveUpcomingAppointment(contact.userId, contactId);
  const patch: Record<string, unknown> = {};

  if (hasActive) {
    if (contact.tag !== APPOINTMENT_SCHEDULED_TAG) {
      patch.tag = APPOINTMENT_SCHEDULED_TAG;
    }
  } else if (contact.tag === APPOINTMENT_SCHEDULED_TAG) {
    patch.tag = "New";
  }

  if (Object.keys(patch).length === 0) {
    return { changed: false, clearedTag: false, setTag: false };
  }

  await storage.updateContact(contactId, patch as any, {
    skipAutomationHooks: options?.skipAutomationHooks ?? true,
  });

  return {
    changed: true,
    clearedTag: patch.tag === "New",
    setTag: patch.tag === APPOINTMENT_SCHEDULED_TAG,
  };
}
