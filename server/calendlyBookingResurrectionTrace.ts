export type BookingResurrectionAction =
  | "blocked_tombstone"
  | "blocked_canceled_payload"
  | "blocked_cancelled_appointment"
  | "blocked_skip_entire_ingest"
  | "allowed_schedule_confirmation"
  | "recorded_cancel_tombstone"
  | "canceled_appointment";

export type BookingResurrectionTrace = {
  source: string;
  functionName: string;
  scheduledEventUri?: string | null;
  inviteeUri?: string | null;
  status?: string | null;
  existingAppointmentStatus?: string | null;
  action: BookingResurrectionAction;
  outboundMessageSent: boolean;
  reason?: string;
  eventType?: string;
};

const LOG_TAG = "[BookingResurrectionTrace]";

export function logBookingResurrectionTrace(trace: BookingResurrectionTrace): void {
  console.warn(
    LOG_TAG,
    JSON.stringify({
      ...trace,
      loggedAt: new Date().toISOString(),
    }),
  );
}
