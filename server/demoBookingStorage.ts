import { eq, desc, sql } from "drizzle-orm";
import { demoBookings, type DemoBooking } from "@shared/schema";
import { db } from "../drizzle/db";
import {
  isDemoBookingsSchemaMismatchError,
  mapDemoBookingRow,
  mapDemoBookingRows,
} from "./demoBookingRows";

type DemoBookingQuery = {
  salespersonId?: string;
  id?: string;
  email?: string;
};

async function fetchDemoBookingsLegacy(options?: DemoBookingQuery): Promise<DemoBooking[]> {
  let result;
  if (options?.id) {
    result = await db.execute(sql`
      SELECT id, salesperson_id, visitor_name, visitor_email, visitor_phone,
             scheduled_date, consent_given, status, notes, created_at,
             'web' AS source
      FROM demo_bookings WHERE id = ${options.id}
    `);
  } else if (options?.salespersonId) {
    result = await db.execute(sql`
      SELECT id, salesperson_id, visitor_name, visitor_email, visitor_phone,
             scheduled_date, consent_given, status, notes, created_at,
             'web' AS source
      FROM demo_bookings WHERE salesperson_id = ${options.salespersonId}
      ORDER BY created_at DESC
    `);
  } else if (options?.email) {
    result = await db.execute(sql`
      SELECT id, salesperson_id, visitor_name, visitor_email, visitor_phone,
             scheduled_date, consent_given, status, notes, created_at,
             'web' AS source
      FROM demo_bookings WHERE visitor_email = ${options.email}
      ORDER BY created_at DESC
    `);
  } else {
    result = await db.execute(sql`
      SELECT id, salesperson_id, visitor_name, visitor_email, visitor_phone,
             scheduled_date, consent_given, status, notes, created_at,
             'web' AS source
      FROM demo_bookings ORDER BY created_at DESC
    `);
  }
  return mapDemoBookingRows(result.rows as Record<string, unknown>[]);
}

async function tryFetchDemoBookingsExtendedLegacy(
  options?: DemoBookingQuery,
): Promise<DemoBooking[] | null> {
  try {
    let result;
    if (options?.id) {
      result = await db.execute(sql`
        SELECT id, salesperson_id, visitor_name, visitor_email, visitor_phone,
               scheduled_date, consent_given, status, notes, created_at,
               COALESCE(source, 'web') AS source,
               assigned_at, accepted_at, decline_reason,
               declined_by_salesperson_id, declined_at
        FROM demo_bookings WHERE id = ${options.id}
      `);
    } else if (options?.salespersonId) {
      result = await db.execute(sql`
        SELECT id, salesperson_id, visitor_name, visitor_email, visitor_phone,
               scheduled_date, consent_given, status, notes, created_at,
               COALESCE(source, 'web') AS source,
               assigned_at, accepted_at, decline_reason,
               declined_by_salesperson_id, declined_at
        FROM demo_bookings WHERE salesperson_id = ${options.salespersonId}
        ORDER BY created_at DESC
      `);
    } else {
      result = await db.execute(sql`
        SELECT id, salesperson_id, visitor_name, visitor_email, visitor_phone,
               scheduled_date, consent_given, status, notes, created_at,
               COALESCE(source, 'web') AS source,
               assigned_at, accepted_at, decline_reason,
               declined_by_salesperson_id, declined_at
        FROM demo_bookings ORDER BY created_at DESC
      `);
    }
    return mapDemoBookingRows(result.rows as Record<string, unknown>[]);
  } catch {
    return null;
  }
}

export async function readDemoBookings(options?: DemoBookingQuery): Promise<DemoBooking[]> {
  try {
    if (options?.id) {
      const row = await db.select().from(demoBookings).where(eq(demoBookings.id, options.id));
      return row[0] ? [mapDemoBookingRow(row[0] as Record<string, unknown>)] : [];
    }
    if (options?.salespersonId) {
      const rows = await db
        .select()
        .from(demoBookings)
        .where(eq(demoBookings.salespersonId, options.salespersonId))
        .orderBy(desc(demoBookings.createdAt));
      return mapDemoBookingRows(rows as Record<string, unknown>[]);
    }
    if (options?.email) {
      const rows = await db
        .select()
        .from(demoBookings)
        .where(eq(demoBookings.visitorEmail, options.email))
        .orderBy(desc(demoBookings.createdAt));
      return mapDemoBookingRows(rows as Record<string, unknown>[]);
    }
    const rows = await db.select().from(demoBookings).orderBy(desc(demoBookings.createdAt));
    return mapDemoBookingRows(rows as Record<string, unknown>[]);
  } catch (error) {
    if (!isDemoBookingsSchemaMismatchError(error)) throw error;
    console.warn("[Storage] demo_bookings schema mismatch; using legacy column select");
    const extended = await tryFetchDemoBookingsExtendedLegacy(options);
    if (extended) return extended;
    return fetchDemoBookingsLegacy(options);
  }
}

function appendDeclineNote(
  existingNotes: string | null | undefined,
  reason: string,
  declinedBy?: string,
): string {
  const stamp = new Date().toISOString();
  const by = declinedBy ? ` by ${declinedBy}` : "";
  const line = `[Declined ${stamp}${by}] ${reason.trim()}`;
  return existingNotes?.trim() ? `${existingNotes.trim()}\n${line}` : line;
}

async function tryPersistDeclineFields(
  id: string,
  updates: Partial<DemoBooking>,
): Promise<void> {
  if (
    updates.declineReason == null &&
    updates.declinedBySalespersonId == null &&
    updates.declinedAt == null
  ) {
    return;
  }
  try {
    await db.execute(sql`
      UPDATE demo_bookings
      SET
        decline_reason = ${updates.declineReason ?? null},
        declined_by_salesperson_id = ${updates.declinedBySalespersonId ?? null},
        declined_at = ${updates.declinedAt ?? null}
      WHERE id = ${id}
    `);
  } catch {
    /* decline columns may not exist yet */
  }
}

async function updateDemoBookingLegacy(
  id: string,
  updates: Partial<DemoBooking>,
  existing?: DemoBooking,
): Promise<DemoBooking | undefined> {
  const booking = existing ?? (await fetchDemoBookingsLegacy({ id }))[0];
  if (!booking) return undefined;

  const status = updates.status ?? booking.status;
  const salespersonId =
    updates.salespersonId !== undefined ? updates.salespersonId : booking.salespersonId;
  let notes = updates.notes ?? booking.notes;

  if (updates.declineReason?.trim()) {
    notes = appendDeclineNote(notes, updates.declineReason, updates.declinedBySalespersonId ?? undefined);
  }

  await db.execute(sql`
    UPDATE demo_bookings
    SET status = ${status},
        salesperson_id = ${salespersonId},
        notes = ${notes ?? null}
    WHERE id = ${id}
  `);

  await tryPersistDeclineFields(id, updates);

  const extended = await tryFetchDemoBookingsExtendedLegacy({ id });
  if (extended?.[0]) return extended[0];
  return (await fetchDemoBookingsLegacy({ id }))[0];
}

async function updateDemoBookingExtendedLegacy(
  id: string,
  updates: Partial<DemoBooking>,
): Promise<DemoBooking | undefined> {
  const existing = (await tryFetchDemoBookingsExtendedLegacy({ id }))?.[0];
  if (!existing) return undefined;

  const merged: DemoBooking = { ...existing, ...updates };

  await db.execute(sql`
    UPDATE demo_bookings
    SET
      status = ${merged.status},
      salesperson_id = ${merged.salespersonId},
      notes = ${merged.notes ?? null},
      assigned_at = ${merged.assignedAt ?? null},
      accepted_at = ${merged.acceptedAt ?? null},
      decline_reason = ${merged.declineReason ?? null},
      declined_by_salesperson_id = ${merged.declinedBySalespersonId ?? null},
      declined_at = ${merged.declinedAt ?? null}
    WHERE id = ${id}
  `);
  return (await tryFetchDemoBookingsExtendedLegacy({ id }))?.[0];
}

export async function writeDemoBookingUpdate(
  id: string,
  updates: Partial<DemoBooking>,
): Promise<DemoBooking | undefined> {
  try {
    const result = await db.update(demoBookings).set(updates).where(eq(demoBookings.id, id)).returning();
    return result[0] ? mapDemoBookingRow(result[0] as Record<string, unknown>) : undefined;
  } catch (error) {
    if (!isDemoBookingsSchemaMismatchError(error)) throw error;
    console.warn("[Storage] demo_bookings update schema mismatch; using legacy update");
    try {
      const extended = await updateDemoBookingExtendedLegacy(id, updates);
      if (extended) return extended;
    } catch (extendedError) {
      console.warn("[Storage] extended demo_bookings update failed:", extendedError);
    }
    const legacy = await updateDemoBookingLegacy(id, updates);
    if (legacy) return legacy;
    await tryPersistDeclineFields(id, updates);
    const reread = await tryFetchDemoBookingsExtendedLegacy({ id });
    if (reread?.[0]) return reread[0];
    return (await fetchDemoBookingsLegacy({ id }))[0];
  }
}

export function mapCreatedDemoBookingRow(row: Record<string, unknown>): DemoBooking {
  return mapDemoBookingRow(row);
}
