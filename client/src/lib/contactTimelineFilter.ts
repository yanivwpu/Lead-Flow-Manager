/** Contact sidebar timeline — hide low-value system noise. */

export type TimelineEventLike = {
  id: string;
  eventType: string;
  eventData: Record<string, unknown>;
  createdAt: string;
};

const NOISE_EVENT_TYPES = new Set([
  "message",
  "message_sent",
  "message_received",
  "conversation_updated",
  "channel_switch",
  "lead_created",
  "ai_handoff_resolved",
]);

const NOISE_NOTE_KINDS = new Set([
  "language_detected",
  "workflow_task", // internal ops tasks unless booking-related (handled below)
]);

function noteKind(data: Record<string, unknown>): string {
  return typeof data.kind === "string" ? data.kind : "";
}

function noteTitle(data: Record<string, unknown>): string {
  return typeof data.title === "string" ? data.title : "";
}

function noteContent(data: Record<string, unknown>): string {
  return typeof data.content === "string" ? data.content : "";
}

function isBookingRelatedNote(data: Record<string, unknown>): boolean {
  const kind = noteKind(data);
  const hay = `${noteTitle(data)} ${noteContent(data)}`.toLowerCase();
  if (kind === "calendly_booking_confirmed") return true;
  if (kind === "tag_changed" || kind === "tag_changed") return true;
  if (kind === "tag_changed" || kind === "stage_changed" || kind === "assignment") return true;
  if (kind === "workflow_task") {
    return (
      /book|showing|appointment|scheduling link|launch session|concierge/i.test(hay) &&
      !/scheduling link missing/i.test(hay)
    );
  }
  return /showing requested|scheduling link sent|appointment booked|book appointment/i.test(hay);
}

export function isMeaningfulTimelineEvent(event: TimelineEventLike): boolean {
  const type = event.eventType;
  const data = event.eventData || {};

  if (NOISE_EVENT_TYPES.has(type)) return false;

  if (type === "note") {
    const kind = noteKind(data);
    if (NOISE_NOTE_KINDS.has(kind) && !isBookingRelatedNote(data)) return false;
    if (kind === "workflow_task" && !isBookingRelatedNote(data)) return false;
    return isBookingRelatedNote(data) || kind === "lead_score_changed" || kind === "qualification_changed";
  }

  if (type === "ai_handoff") return true;

  if (
    type === "calendly_booking" ||
    type === "calendly_booking_canceled" ||
    type === "calendly_rescheduled" ||
    type === "calendly_no_show" ||
    type === "appointment_created" ||
    type === "appointment_updated" ||
    type === "appointment_deleted" ||
    type === "tag_change" ||
    type === "stage_change" ||
    type === "assignment"
  ) {
    return true;
  }

  return false;
}

/** Drop duplicate AI handoff/resolution pairs within a short window. */
export function dedupeTimelineEvents(events: TimelineEventLike[]): TimelineEventLike[] {
  const out: TimelineEventLike[] = [];
  const seenHandoff = new Set<string>();

  for (const event of events) {
    if (event.eventType === "ai_handoff") {
      const conv =
        typeof event.eventData?.conversationId === "string" ? event.eventData.conversationId : event.id;
      if (seenHandoff.has(conv)) continue;
      seenHandoff.add(conv);
    }
    out.push(event);
  }
  return out;
}

export function filterMeaningfulTimelineEvents(
  events: TimelineEventLike[],
  max = 4,
): TimelineEventLike[] {
  return dedupeTimelineEvents(events.filter(isMeaningfulTimelineEvent)).slice(0, max);
}
