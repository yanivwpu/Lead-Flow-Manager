/** Canonical keys for Calendly appointment + inbox message dedupe. */

const CANCELED_EVENT_STATUSES = new Set(["canceled", "cancelled", "deleted"]);

export type CalendlyAppointmentIdentity = {
  scheduledEventUri?: string | null;
  inviteeUri?: string | null;
  externalMessageId?: string | null;
  contactId?: string | null;
  startTimeIso?: string | null;
};

export function normalizeCalendlyUri(uri: string | null | undefined): string {
  return (uri || "").trim();
}

export function normalizeCalendlyStatus(status: string | null | undefined): string {
  return String(status || "").trim().toLowerCase();
}

export function isCanceledCalendlyStatus(status: string | null | undefined): boolean {
  return CANCELED_EVENT_STATUSES.has(normalizeCalendlyStatus(status));
}

function readPayloadObject(body: Record<string, unknown>): Record<string, unknown> {
  return (body.payload as Record<string, unknown>) || body;
}

function readInviteeObject(payload: Record<string, unknown>): Record<string, unknown> {
  return ((payload.invitee as Record<string, unknown>) || payload) as Record<string, unknown>;
}

function readScheduledObject(payload: Record<string, unknown>, invitee: Record<string, unknown>): Record<string, unknown> | undefined {
  const raw =
    payload.scheduled_event ||
    invitee.scheduled_event ||
    payload.event;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined;
}

function isRescheduleCancellation(payload: Record<string, unknown>, invitee: Record<string, unknown>): boolean {
  const cancellation = (payload.cancellation || invitee.cancellation) as Record<string, unknown> | undefined;
  return (
    payload.rescheduled === true ||
    invitee.rescheduled === true ||
    cancellation?.rescheduled === true
  );
}

/** True when payload represents a canceled/deleted booking — never treat as new confirmation. */
export function isCalendlyBookingCanceledPayload(body: Record<string, unknown>): boolean {
  const eventName = String(body.event || "").toLowerCase();
  if (eventName === "invitee.canceled") return true;

  const payload = readPayloadObject(body);
  const invitee = readInviteeObject(payload);
  const scheduled = readScheduledObject(payload, invitee);

  if (isCanceledCalendlyStatus(invitee.status as string)) return true;
  if (scheduled && isCanceledCalendlyStatus(scheduled.status as string)) return true;

  const cancellation = payload.cancellation || invitee.cancellation;
  if (cancellation && typeof cancellation === "object" && !isRescheduleCancellation(payload, invitee)) {
    return true;
  }

  return false;
}

/** Primary storage key — always prefer scheduled event URI over invitee URI. */
export function primaryCalendlyDedupeUri(identity: CalendlyAppointmentIdentity): string {
  return (
    normalizeCalendlyUri(identity.scheduledEventUri) ||
    normalizeCalendlyUri(identity.inviteeUri) ||
    normalizeCalendlyUri(identity.externalMessageId)
  );
}

/** Stable messages.external_message_id for calendly_event rows. */
export function buildCalendlyBookingMessageExternalId(identity: {
  scheduledEventUri?: string | null;
  inviteeUri?: string | null;
}): string {
  const key = primaryCalendlyDedupeUri(identity);
  return key ? `calendly-booking:${key}` : "";
}

export function calendlyStartTimesMatch(a?: string | null, b?: Date | null): boolean {
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = b.getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(ta - tb) <= 60_000;
}
