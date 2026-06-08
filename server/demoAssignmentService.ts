import { and, eq, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { demoBookings } from "@shared/schema";
import {
  DEMO_ACCEPTANCE_TIMEOUT_HOURS,
  DEMO_BOOKING_STATUS,
} from "@shared/salesCompensation";
import { storage } from "./storage";

type DemoEligibleSalesperson = {
  id: string;
  totalBookings: number | null;
  role: string | null;
};

export function filterDemoEligibleSalespeople(
  people: DemoEligibleSalesperson[],
  excludeSalespersonId?: string,
): DemoEligibleSalesperson[] {
  return people.filter((p) => {
    if (excludeSalespersonId && p.id === excludeSalespersonId) return false;
    const r = (p.role || "sales") as string;
    return r === "sales" || r === "both" || r === "demo";
  });
}

export async function pickSalespersonForDemoAssignment(
  excludeSalespersonId?: string,
): Promise<DemoEligibleSalesperson | undefined> {
  const salespeopleRows = await storage.getActiveSalespeople();
  const eligible = filterDemoEligibleSalespeople(salespeopleRows, excludeSalespersonId);
  if (eligible.length === 0) return undefined;
  return eligible.reduce((min, p) =>
    (p.totalBookings || 0) < (min.totalBookings || 0) ? p : min,
  );
}

export async function reassignDemoBookingToPool(
  bookingId: string,
  options?: {
    declineReason?: string;
    excludeSalespersonId?: string;
    declinedBySalespersonId?: string;
  },
): Promise<{ reassigned: boolean; bookingId: string }> {
  const booking = await storage.getDemoBooking(bookingId);
  if (!booking) return { reassigned: false, bookingId };

  const now = new Date();
  const declineReason = options?.declineReason?.trim();
  const declinedBy = options?.declinedBySalespersonId ?? options?.excludeSalespersonId;

  const next = await pickSalespersonForDemoAssignment(
    options?.excludeSalespersonId ?? booking.salespersonId,
  );
  if (!next) {
    await storage.updateDemoBooking(bookingId, {
      status: DEMO_BOOKING_STATUS.pendingAcceptance,
      declineReason: declineReason || booking.declineReason,
      declinedBySalespersonId: declinedBy ?? booking.declinedBySalespersonId,
      declinedAt: declineReason ? now : booking.declinedAt,
      acceptedAt: null,
    } as Partial<typeof booking>);
    return { reassigned: false, bookingId };
  }

  await storage.updateDemoBooking(bookingId, {
    salespersonId: next.id,
    status: DEMO_BOOKING_STATUS.pendingAcceptance,
    assignedAt: now,
    acceptedAt: null,
    declineReason: declineReason || booking.declineReason || null,
    declinedBySalespersonId: declinedBy ?? booking.declinedBySalespersonId ?? null,
    declinedAt: declineReason ? now : booking.declinedAt ?? null,
  } as Partial<typeof booking>);

  return { reassigned: true, bookingId };
}

/** Reassign demos that were not accepted within 24 hours. */
export async function processExpiredDemoAcceptances(): Promise<number> {
  const cutoff = new Date(Date.now() - DEMO_ACCEPTANCE_TIMEOUT_HOURS * 60 * 60 * 1000);
  let reassigned = 0;

  try {
    const stale = await db
      .select()
      .from(demoBookings)
      .where(
        and(
          eq(demoBookings.status, DEMO_BOOKING_STATUS.pendingAcceptance),
          sql`COALESCE(${demoBookings.assignedAt}, ${demoBookings.createdAt}) < ${cutoff}`,
        ),
      );

    for (const row of stale) {
      const result = await reassignDemoBookingToPool(row.id, {
        excludeSalespersonId: row.salespersonId,
        declineReason: "Auto-reassigned: no acceptance within 24 hours",
      });
      if (result.reassigned) reassigned++;
    }
  } catch (err) {
    console.error("[DemoAssignment] processExpiredDemoAcceptances error:", err);
  }

  return reassigned;
}
