/** Pure, conservative reconciliation guard for website demo bookings. */
import { isMarketingDemoCalendlyTracking, resolveMarketingDemoBookingIdFromTracking } from "./marketingDemoCalendly";

type AwaitingBooking = { id: string; visitorEmail: string; status: string };

export function eligibleMarketingDemoBooking(
  awaiting: AwaitingBooking[],
  inviteeEmail: string,
  tracking: unknown,
): boolean {
  const email = inviteeEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) return false;
  const id = resolveMarketingDemoBookingIdFromTracking(tracking);
  if (id) {
    return awaiting.some((row) =>
      row.id === id &&
      row.status === "awaiting_schedule" &&
      row.visitorEmail.trim().toLowerCase() === email
    );
  }
  if (!isMarketingDemoCalendlyTracking(tracking)) return false;
  return awaiting.filter((row) =>
    row.status === "awaiting_schedule" &&
    row.visitorEmail.trim().toLowerCase() === email
  ).length === 1;
}
