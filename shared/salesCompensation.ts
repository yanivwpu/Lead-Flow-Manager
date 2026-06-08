/** Fixed payout when a demo lead converts to a qualifying paid customer. */
export const SALES_CONVERSION_PAYOUT_DOLLARS = 100;

/** Days after demo scheduled date that a paid signup can be attributed. */
export const SALES_CONVERSION_ATTRIBUTION_DAYS = 30;

/** Hours to accept a demo assignment before auto-reassign. */
export const DEMO_ACCEPTANCE_TIMEOUT_HOURS = 24;

export const DEMO_BOOKING_STATUS = {
  pendingAcceptance: "pending_acceptance",
  accepted: "accepted",
  completed: "completed",
  converted: "converted",
  cancelled: "cancelled",
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

export function demoStatusLabel(status: string): string {
  const s = normalizeDemoBookingStatus(status);
  switch (s) {
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
