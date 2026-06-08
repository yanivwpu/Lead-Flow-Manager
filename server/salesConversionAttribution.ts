import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { demoBookings, salesConversions, type User } from "@shared/schema";
import {
  DEMO_BOOKING_STATUS,
  SALES_CONVERSION_PAYOUT_DOLLARS,
  isQualifyingPaidPlan,
  isWithinConversionAttributionWindow,
} from "@shared/salesCompensation";
import { hasActivePaidPlan } from "./trialEntitlements";
import { storage } from "./storage";

export async function findAttributableDemoBookingForUser(
  user: Pick<User, "name" | "email" | "phone">,
): Promise<(typeof demoBookings.$inferSelect) | undefined> {
  const normalizedEmail = (user.email || "").toLowerCase().trim();
  if (!normalizedEmail) return undefined;

  const rows = await db
    .select()
    .from(demoBookings)
    .where(
      and(
        sql`LOWER(TRIM(${demoBookings.visitorEmail})) = ${normalizedEmail}`,
        inArray(demoBookings.status, [
          DEMO_BOOKING_STATUS.accepted,
          DEMO_BOOKING_STATUS.completed,
        ]),
      ),
    )
    .orderBy(desc(demoBookings.scheduledDate));

  return rows[0];
}

export type DemoConversionAttributionResult =
  | { created: false; reason: string }
  | { created: true; conversionId: string; payoutEligible: boolean };

export async function tryRecordDemoConversionForUser(
  user: User,
  conversionDate: Date = new Date(),
): Promise<DemoConversionAttributionResult> {
  const existing = await storage.getSalesConversionByUserId(user.id);
  if (existing) {
    return { created: false, reason: "conversion_already_exists" };
  }

  const paid =
    hasActivePaidPlan(user, conversionDate) ||
    isQualifyingPaidPlan(user.billingPlan || user.subscriptionPlan);
  if (!paid) {
    return { created: false, reason: "free_plan_not_eligible" };
  }

  const booking = await findAttributableDemoBookingForUser(user);
  if (!booking) {
    return { created: false, reason: "no_matching_demo_booking" };
  }

  const demoDate = booking.scheduledDate ? new Date(booking.scheduledDate) : undefined;
  if (!demoDate || Number.isNaN(demoDate.getTime())) {
    return { created: false, reason: "invalid_demo_date" };
  }

  const withinWindow = isWithinConversionAttributionWindow(demoDate, conversionDate);
  const payoutEligible = withinWindow;
  const amount = payoutEligible ? String(SALES_CONVERSION_PAYOUT_DOLLARS) : "0";
  const eligibilityNotes = payoutEligible
    ? `Attributed within ${30} days of demo on ${demoDate.toISOString()}`
    : `Outside ${30}-day attribution window from demo date ${demoDate.toISOString()}`;

  const conversion = await storage.createSalesConversion({
    bookingId: booking.id,
    salespersonId: booking.salespersonId,
    userId: user.id,
    amount,
    conversionDate,
    demoDate,
    payoutEligible,
    eligibilityNotes,
  });

  return {
    created: true,
    conversionId: conversion.id,
    payoutEligible,
  };
}
