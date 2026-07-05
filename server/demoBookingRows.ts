import type { DemoBooking } from "@shared/schema";

function parseOptionalDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Normalize Drizzle or raw SQL rows to camelCase DemoBooking fields. */
export function mapDemoBookingRow(row: Record<string, unknown>): DemoBooking {
  const scheduledRaw = row.scheduled_date ?? row.scheduledDate;
  let scheduledDate: Date | null = null;
  if (scheduledRaw != null && scheduledRaw !== "") {
    const d =
      scheduledRaw instanceof Date ? scheduledRaw : new Date(String(scheduledRaw));
    scheduledDate = Number.isNaN(d.getTime()) ? null : d;
  }

  const createdRaw = row.created_at ?? row.createdAt;
  const createdAt =
    createdRaw instanceof Date
      ? createdRaw
      : createdRaw
        ? new Date(String(createdRaw))
        : new Date();

  const rawSalespersonId = row.salesperson_id ?? row.salespersonId;
  const salespersonId =
    rawSalespersonId == null || rawSalespersonId === ""
      ? null
      : String(rawSalespersonId);

  return {
    id: String(row.id ?? ""),
    salespersonId,
    visitorName: String(row.visitor_name ?? row.visitorName ?? ""),
    visitorEmail: String(row.visitor_email ?? row.visitorEmail ?? ""),
    visitorPhone: String(row.visitor_phone ?? row.visitorPhone ?? ""),
    scheduledDate,
    consentGiven: Boolean(row.consent_given ?? row.consentGiven ?? true),
    status: String(row.status ?? "pending_acceptance"),
    notes: (row.notes as string | null | undefined) ?? null,
    source: String(row.source ?? "web"),
    assignedAt: parseOptionalDate(row.assigned_at ?? row.assignedAt),
    acceptedAt: parseOptionalDate(row.accepted_at ?? row.acceptedAt),
    declineReason: (row.decline_reason ?? row.declineReason) as string | null | undefined ?? null,
    declinedBySalespersonId:
      (row.declined_by_salesperson_id ?? row.declinedBySalespersonId) as string | null | undefined ??
      null,
    declinedAt: parseOptionalDate(row.declined_at ?? row.declinedAt),
    calendlyScheduledEventUri:
      (row.calendly_scheduled_event_uri ?? row.calendlyScheduledEventUri) as string | null | undefined ??
      null,
    calendlyInviteeUri:
      (row.calendly_invitee_uri ?? row.calendlyInviteeUri) as string | null | undefined ?? null,
    meetingLink: (row.meeting_link ?? row.meetingLink) as string | null | undefined ?? null,
    calendlyPayload: (row.calendly_payload ?? row.calendlyPayload) as Record<string, unknown> | null ?? null,
    calendlyConfirmedAt: parseOptionalDate(row.calendly_confirmed_at ?? row.calendlyConfirmedAt),
    createdAt,
  };
}

export function isDemoBookingsSchemaMismatchError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message ?? error ?? "").toLowerCase();
  return (
    (msg.includes("demo_bookings") ||
      msg.includes("assigned_at") ||
      msg.includes("accepted_at") ||
      msg.includes("decline_reason") ||
      msg.includes("declined_by") ||
      msg.includes("declined_at") ||
      msg.includes("source") ||
      msg.includes("calendly_") ||
      msg.includes("meeting_link")) &&
    (msg.includes("does not exist") || msg.includes("failed query"))
  );
}

export function mapDemoBookingRows(rows: Record<string, unknown>[]): DemoBooking[] {
  return rows.map(mapDemoBookingRow);
}
