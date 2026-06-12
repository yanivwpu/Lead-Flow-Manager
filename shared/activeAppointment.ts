/** Contact tag set when a real upcoming appointment exists (Calendly booking). */
export const APPOINTMENT_SCHEDULED_TAG = "Appointment Scheduled";

export const ACTIVE_APPOINTMENT_STATUSES = ["scheduled"] as const;

export type ActiveAppointmentLike = {
  status?: string | null;
  appointmentDate?: Date | string | null;
};

/** True when appointment is scheduled and not in the past (1 min grace). */
export function isActiveFutureAppointment(appt: ActiveAppointmentLike): boolean {
  if (!ACTIVE_APPOINTMENT_STATUSES.includes((appt.status || "") as (typeof ACTIVE_APPOINTMENT_STATUSES)[number])) {
    return false;
  }
  const when = appt.appointmentDate ? new Date(appt.appointmentDate).getTime() : 0;
  return Number.isFinite(when) && when >= Date.now() - 60 * 1000;
}

/** CRM tag for display — excludes legacy appointment label stored on contacts.tag. */
export function isCrmDisplayTag(tag: string | null | undefined): tag is string {
  return Boolean(tag && tag !== APPOINTMENT_SCHEDULED_TAG);
}

export type ContactAppointmentLike = ActiveAppointmentLike & { contactId: string };

/** Earliest active upcoming appointment per contact (input should be pre-filtered or raw rows). */
export function nextActiveAppointmentByContact<T extends ContactAppointmentLike>(
  appointments: T[]
): Map<string, T> {
  const map = new Map<string, T>();
  for (const appt of appointments) {
    if (!isActiveFutureAppointment(appt)) continue;
    const when = new Date(appt.appointmentDate!).getTime();
    const existing = map.get(appt.contactId);
    if (!existing || when < new Date(existing.appointmentDate!).getTime()) {
      map.set(appt.contactId, appt);
    }
  }
  return map;
}
