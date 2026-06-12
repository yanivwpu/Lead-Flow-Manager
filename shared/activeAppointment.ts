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
