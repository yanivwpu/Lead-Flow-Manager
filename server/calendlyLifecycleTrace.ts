export type CalendlyLifecycleAction =
  | "created"
  | "updated"
  | "canceled"
  | "ignored_canceled_event"
  | "skipped_duplicate";

export type CalendlyLifecycleTrace = {
  eventType: string;
  status?: string | null;
  canceled?: boolean;
  scheduledEventUri?: string | null;
  contactId?: string | null;
  existingAppointmentId?: string | null;
  action: CalendlyLifecycleAction;
  outboundMessageSent: boolean;
  source?: string;
  reason?: string;
};

const LOG_TAG = "[CalendlyLifecycleTrace]";

export function logCalendlyLifecycleTrace(trace: CalendlyLifecycleTrace): void {
  console.warn(
    LOG_TAG,
    JSON.stringify({
      ...trace,
      loggedAt: new Date().toISOString(),
    }),
  );
}
