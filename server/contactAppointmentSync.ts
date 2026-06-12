import { storage } from "./storage";
import { APPOINTMENT_SCHEDULED_TAG } from "@shared/activeAppointment";

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
