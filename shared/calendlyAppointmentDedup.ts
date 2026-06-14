/** Canonical keys for Calendly appointment + inbox message dedupe. */

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
