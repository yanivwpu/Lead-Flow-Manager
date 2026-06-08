import {
  DEMO_ACCEPTANCE_TIMEOUT_HOURS,
  DEMO_BOOKING_STATUS,
} from "@shared/salesCompensation";
import type { DemoBooking } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { demoBookings } from "@shared/schema";
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

/** Pure decline/reassign update — used by reassignDemoBookingToPool and regression tests. */
export function buildDemoDeclineReassignmentUpdate(
  booking: Pick<DemoBooking, "salespersonId">,
  options: {
    declineReason: string;
    declinedBySalespersonId: string;
    nextSalespersonId?: string | null;
  },
): Partial<DemoBooking> {
  const now = new Date();
  const reason = options.declineReason.trim();
  const base = {
    declineReason: reason,
    declinedBySalespersonId: options.declinedBySalespersonId,
    declinedAt: now,
    acceptedAt: null as Date | null,
  };

  const nextId = options.nextSalespersonId ?? null;
  const currentId = booking.salespersonId ?? null;

  if (nextId && nextId !== currentId) {
    return {
      ...base,
      salespersonId: nextId,
      status: DEMO_BOOKING_STATUS.pendingAcceptance,
      assignedAt: now,
    };
  }

  return {
    ...base,
    salespersonId: null,
    status: DEMO_BOOKING_STATUS.needsReassignment,
    assignedAt: null,
  };
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

  const declineReason = options?.declineReason?.trim();
  const declinedBy = options?.declinedBySalespersonId ?? options?.excludeSalespersonId;
  if (!declineReason || !declinedBy) {
    throw new Error("Decline reason and declining salesperson are required");
  }

  const excludeId = options?.excludeSalespersonId ?? booking.salespersonId ?? undefined;
  const next = await pickSalespersonForDemoAssignment(excludeId);
  const updates = buildDemoDeclineReassignmentUpdate(booking, {
    declineReason,
    declinedBySalespersonId: declinedBy,
    nextSalespersonId: next?.id ?? null,
  });

  await storage.updateDemoBooking(bookingId, updates);
  return { reassigned: updates.status === DEMO_BOOKING_STATUS.pendingAcceptance, bookingId };
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
        excludeSalespersonId: row.salespersonId ?? undefined,
        declinedBySalespersonId: row.salespersonId ?? undefined,
        declineReason: "Auto-reassigned: no acceptance within 24 hours",
      });
      if (result.reassigned) reassigned++;
    }
  } catch (err) {
    console.error("[DemoAssignment] processExpiredDemoAcceptances error:", err);
  }

  return reassigned;
}
