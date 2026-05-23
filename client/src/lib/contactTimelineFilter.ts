/** Contact sidebar timeline — hide low-value system noise. */

import {
  sanitizeUserFacingText,
  TECHNICAL_USER_FACING_RE,
} from "@shared/customerBehaviorCopy";

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

const NOISE_NOTE_KINDS = new Set(["language_detected", "workflow_task"]);

type SchedulingBucket = "appointment_booked" | "scheduling_link" | "showing_requested";

const SCHEDULING_RANK: Record<SchedulingBucket, number> = {
  appointment_booked: 3,
  scheduling_link: 2,
  showing_requested: 1,
};

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
  if (kind === "tag_changed" || kind === "stage_changed" || kind === "assignment") return true;
  if (kind === "workflow_task") {
    if (/task:\s|due:|workflow:/i.test(hay)) return false;
    if (TECHNICAL_USER_FACING_RE.test(hay)) {
      return /scheduling link sent|showing requested|appointment booked|appointment requested/i.test(hay);
    }
    return (
      /book|showing|appointment|scheduling link|launch session|concierge/i.test(hay) &&
      !/scheduling link missing/i.test(hay)
    );
  }
  return /showing requested|appointment requested|scheduling link sent|appointment booked|book appointment/i.test(
    hay,
  );
}

function schedulingBucket(event: TimelineEventLike): SchedulingBucket | null {
  const data = event.eventData || {};
  const kind = noteKind(data);
  const title = noteTitle(data).toLowerCase();
  const content = noteContent(data).toLowerCase();
  const hay = `${title} ${content}`;
  const toTag = typeof data.to === "string" ? data.to : "";

  if (
    event.eventType === "calendly_booking" ||
    event.eventType === "appointment_created" ||
    kind === "calendly_booking_confirmed"
  ) {
    return "appointment_booked";
  }
  if (/scheduling link sent/i.test(hay) || (kind === "workflow_task" && /scheduling link/i.test(hay))) {
    return "scheduling_link";
  }
  if (
    /showing requested|appointment requested|customer asked/i.test(hay) ||
    (kind === "tag_changed" && toTag === "Appointment Requested")
  ) {
    return "showing_requested";
  }
  return null;
}

export function isMeaningfulTimelineEvent(event: TimelineEventLike): boolean {
  const type = event.eventType;
  const data = event.eventData || {};

  if (NOISE_EVENT_TYPES.has(type)) return false;

  if (type === "note") {
    const kind = noteKind(data);
    if (NOISE_NOTE_KINDS.has(kind) && !isBookingRelatedNote(data)) return false;
    if (kind === "workflow_task" && !isBookingRelatedNote(data)) return false;
    return (
      isBookingRelatedNote(data) ||
      kind === "lead_score_changed" ||
      kind === "qualification_changed" ||
      kind === "tag_changed" ||
      kind === "stage_changed" ||
      kind === "assignment"
    );
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

export function dedupeTimelineEvents(events: TimelineEventLike[]): TimelineEventLike[] {
  const out: TimelineEventLike[] = [];
  const seenHandoff = new Set<string>();

  for (const event of events) {
    if (event.eventType === "ai_handoff") {
      const conv =
        typeof event.eventData?.conversationId === "string"
          ? event.eventData.conversationId
          : event.id;
      if (seenHandoff.has(conv)) continue;
      seenHandoff.add(conv);
    }
    out.push(event);
  }
  return out;
}

function mergeSchedulingCluster(cluster: TimelineEventLike[]): TimelineEventLike {
  cluster.sort((a, b) => {
    const ra = SCHEDULING_RANK[schedulingBucket(a)!] ?? 0;
    const rb = SCHEDULING_RANK[schedulingBucket(b)!] ?? 0;
    if (rb !== ra) return rb - ra;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const primary = cluster[0];
  const hasShowing = cluster.some((e) => schedulingBucket(e) === "showing_requested");
  const hasLink = cluster.some((e) => schedulingBucket(e) === "scheduling_link");
  const hasBooked = cluster.some((e) => schedulingBucket(e) === "appointment_booked");

  if (hasBooked) return primary;

  if (hasShowing && hasLink) {
    const newest = cluster.reduce((a, b) =>
      new Date(a.createdAt) > new Date(b.createdAt) ? a : b,
    );
    return {
      ...newest,
      eventData: {
        ...newest.eventData,
        kind: "workflow_task",
        title: "Customer requested a showing",
        content: "Booking link sent to customer",
      },
    };
  }

  return primary;
}

function dedupeSchedulingClusters(events: TimelineEventLike[]): TimelineEventLike[] {
  const CLUSTER_MS = 6 * 60 * 60 * 1000;
  const out: TimelineEventLike[] = [];
  let i = 0;

  while (i < events.length) {
    const event = events[i];
    const bucket = schedulingBucket(event);
    if (!bucket) {
      out.push(event);
      i += 1;
      continue;
    }

    const cluster: TimelineEventLike[] = [event];
    const anchorTime = new Date(event.createdAt).getTime();
    i += 1;
    while (i < events.length) {
      const next = events[i];
      const nextBucket = schedulingBucket(next);
      if (!nextBucket) break;
      const nextTime = new Date(next.createdAt).getTime();
      if (Math.abs(anchorTime - nextTime) > CLUSTER_MS) break;
      cluster.push(next);
      i += 1;
    }

    out.push(mergeSchedulingCluster(cluster));
  }
  return out;
}

export function filterMeaningfulTimelineEvents(
  events: TimelineEventLike[],
  max = 4,
): TimelineEventLike[] {
  return suppressRedundantScoreEvents(
    dedupeSchedulingClusters(
      dedupeTimelineEvents(events.filter(isMeaningfulTimelineEvent)),
    ),
  ).slice(0, max);
}

/** Hide score bumps that repeat a scheduling story in the same window. */
function suppressRedundantScoreEvents(events: TimelineEventLike[]): TimelineEventLike[] {
  const WINDOW_MS = 6 * 60 * 60 * 1000;

  return events.filter((event) => {
    const kind = noteKind(event.eventData || {});
    if (kind !== "lead_score_changed" && kind !== "qualification_changed") return true;

    const eventTime = new Date(event.createdAt).getTime();
    const nearScheduling = events.some((other) => {
      if (other.id === event.id) return false;
      if (!schedulingBucket(other)) return false;
      return Math.abs(new Date(other.createdAt).getTime() - eventTime) <= WINDOW_MS;
    });
    if (!nearScheduling) return true;

    const hay = `${noteTitle(event.eventData || {})} ${noteContent(event.eventData || {})}`.toLowerCase();
    return !(
      /strong interest|ready to move forward|engagement (changed|updated)|moved to warm|moved to hot|score updated|showing interest/i.test(
        hay,
      )
    );
  });
}

export function formatActivityDetailText(text: string): string {
  return sanitizeUserFacingText(text);
}

export { bucketLabel, humanizeScoringReasons } from "@shared/customerBehaviorCopy";
