/** Fixed payout when a demo lead converts to a qualifying paid customer. */
export const SALES_CONVERSION_PAYOUT_DOLLARS = 100;

/** Days after demo scheduled date that a paid signup can be attributed. */
export const SALES_CONVERSION_ATTRIBUTION_DAYS = 30;

/** Hours to accept a demo assignment before auto-reassign. */
export const DEMO_ACCEPTANCE_TIMEOUT_HOURS = 24;

export const DEMO_BOOKING_STATUS = {
  /** Visitor submitted details; redirected to Calendly to pick a time. */
  awaitingSchedule: "awaiting_schedule",
  pendingAcceptance: "pending_acceptance",
  accepted: "accepted",
  completed: "completed",
  converted: "converted",
  cancelled: "cancelled",
  needsReassignment: "needs_reassignment",
} as const;

export type DemoBookingStatus = (typeof DEMO_BOOKING_STATUS)[keyof typeof DEMO_BOOKING_STATUS];

/** Legacy rows may still use `pending` — treat as pending acceptance in UI. */
export function normalizeDemoBookingStatus(status: string): DemoBookingStatus | string {
  if (status === "pending") return DEMO_BOOKING_STATUS.pendingAcceptance;
  return status;
}

export function isDemoAwaitingAcceptance(status: string): boolean {
  const s = normalizeDemoBookingStatus(status);
  return s === DEMO_BOOKING_STATUS.pendingAcceptance;
}

export function isDemoUpcoming(status: string): boolean {
  return normalizeDemoBookingStatus(status) === DEMO_BOOKING_STATUS.accepted;
}

export function isDemoCompleted(status: string): boolean {
  const s = normalizeDemoBookingStatus(status);
  return s === DEMO_BOOKING_STATUS.completed || s === DEMO_BOOKING_STATUS.converted;
}

export function isDemoAwaitingSchedule(status: string): boolean {
  return normalizeDemoBookingStatus(status) === DEMO_BOOKING_STATUS.awaitingSchedule;
}

/**
 * Sales Admin "Pending demos" KPI: assigned requests that still need scheduling
 * or salesperson acceptance. Does not include accepted/completed/converted.
 */
export function isOpenDemoRequestStatus(status: string): boolean {
  const s = normalizeDemoBookingStatus(status);
  return (
    s === DEMO_BOOKING_STATUS.awaitingSchedule || s === DEMO_BOOKING_STATUS.pendingAcceptance
  );
}

export function countOpenDemoRequests(bookings: Array<{ status: string }>): number {
  return bookings.filter((b) => isOpenDemoRequestStatus(b.status)).length;
}

/**
 * Active assigned lead workload for round-robin (not compensation).
 * Unscheduled assigned requests count; completed/converted/cancelled do not.
 */
export const ACTIVE_DEMO_ASSIGNMENT_WORKLOAD_STATUSES: readonly string[] = [
  DEMO_BOOKING_STATUS.awaitingSchedule,
  DEMO_BOOKING_STATUS.pendingAcceptance,
  DEMO_BOOKING_STATUS.accepted,
];

export function isActiveDemoAssignmentWorkloadStatus(status: string): boolean {
  const s = normalizeDemoBookingStatus(status);
  return ACTIVE_DEMO_ASSIGNMENT_WORKLOAD_STATUSES.includes(s);
}

/** Statuses that imply a Calendly (or other) datetime exists. */
export function demoStatusRequiresScheduledDate(status: string): boolean {
  const s = normalizeDemoBookingStatus(status);
  return (
    s === DEMO_BOOKING_STATUS.pendingAcceptance ||
    s === DEMO_BOOKING_STATUS.accepted ||
    s === DEMO_BOOKING_STATUS.completed ||
    s === DEMO_BOOKING_STATUS.converted
  );
}

export function evaluateAdminDemoStatusChange(params: {
  nextStatus: string;
  scheduledDate: Date | string | null | undefined;
}): { ok: true } | { ok: false; reason: "scheduled_date_required" } {
  if (!demoStatusRequiresScheduledDate(params.nextStatus)) return { ok: true };
  if (params.scheduledDate == null || params.scheduledDate === "") {
    return { ok: false, reason: "scheduled_date_required" };
  }
  const d =
    params.scheduledDate instanceof Date ? params.scheduledDate : new Date(params.scheduledDate);
  if (Number.isNaN(d.getTime())) return { ok: false, reason: "scheduled_date_required" };
  return { ok: true };
}

export function pickLeastLoadedSalesperson<T extends { id: string }>(
  people: T[],
  activeAssignedCountById: Record<string, number>,
): T | undefined {
  if (people.length === 0) return undefined;
  return people.reduce((min, p) => {
    const c = activeAssignedCountById[p.id] ?? 0;
    const m = activeAssignedCountById[min.id] ?? 0;
    return c < m ? p : min;
  });
}

export function demoStatusLabel(status: string): string {
  const s = normalizeDemoBookingStatus(status);
  switch (s) {
    case DEMO_BOOKING_STATUS.awaitingSchedule:
      return "Awaiting schedule";
    case DEMO_BOOKING_STATUS.pendingAcceptance:
      return "Pending Acceptance";
    case DEMO_BOOKING_STATUS.accepted:
      return "Accepted";
    case DEMO_BOOKING_STATUS.completed:
      return "Completed";
    case DEMO_BOOKING_STATUS.converted:
      return "Converted";
    case DEMO_BOOKING_STATUS.cancelled:
      return "Cancelled";
    case DEMO_BOOKING_STATUS.needsReassignment:
      return "Needs Reassignment";
    default:
      return status;
  }
}

export function isQualifyingPaidPlan(plan: string | null | undefined): boolean {
  const p = (plan || "free").toLowerCase();
  return p === "starter" || p === "pro";
}

export function isWithinConversionAttributionWindow(
  demoDate: Date,
  conversionDate: Date,
  windowDays = SALES_CONVERSION_ATTRIBUTION_DAYS,
): boolean {
  if (Number.isNaN(demoDate.getTime()) || Number.isNaN(conversionDate.getTime())) return false;
  const windowEnd = new Date(demoDate);
  windowEnd.setDate(windowEnd.getDate() + windowDays);
  return conversionDate >= demoDate && conversionDate <= windowEnd;
}
