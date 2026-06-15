/**
 * Appointment UI delete — full CRM cleanup + Calendly tombstone + anti-resurrection.
 * Run: ALLOW_DB_TEST_WRITES=1 npx tsx tests/appointment-ui-delete.test.ts
 */
import assert from "node:assert/strict";
import { isActiveFutureAppointment, nextActiveAppointmentByContact } from "../shared/activeAppointment";

function buildCalendlyInviteeCreatedBody(params: {
  email: string;
  contactId: string;
  conversationId: string;
  scheduledEventUri: string;
  inviteeUri: string;
  eventTypeName?: string;
  startTime?: string;
  endTime?: string;
}) {
  const startTime = params.startTime ?? "2026-06-18T13:00:00.000000Z";
  const endTime = params.endTime ?? "2026-06-18T13:30:00.000000Z";
  return {
    event: "invitee.created",
    payload: {
      email: params.email,
      name: "Showing Lead",
      uri: params.inviteeUri,
      scheduled_event: {
        uri: params.scheduledEventUri,
        name: params.eventTypeName ?? "Property Showing",
        start_time: startTime,
        end_time: endTime,
      },
      tracking: {
        utm_content: params.contactId,
        utm_campaign: params.conversationId,
      },
    },
  };
}

async function runDbIntegration() {
  const { prepareDbTestEnvironment, teardownTestUser } = await import("./helpers/dbTestGuard.js");
  prepareDbTestEnvironment("appointment-ui-delete.test.ts");

  const { storage } = await import("../server/storage");
  const { ingestCalendlyEvent } = await import("../server/calendlyWebhook");
  const { deleteAppointmentWithContactCleanup } = await import("../server/contactAppointmentSync");
  const { isCalendlyEventUriTombstoned } = await import("../server/calendlyBookingLifecycleGate");
  const { applyStartupSchemaPatches } = await import("../server/startupSchemaPatches");
  await applyStartupSchemaPatches();

  let userId: string | undefined;
  try {
    const user = await storage.createUser({
      email: `appt-ui-delete-${Date.now()}@test.com`,
      password: "test123",
      name: "Appt Delete Test",
    });
    userId = user.id;

    const contact = await storage.createContact({
      userId: user.id,
      name: "Showing Lead",
      email: "showing-lead@example.com",
      primaryChannel: "whatsapp",
      source: "whatsapp",
      pipelineStage: "Qualified (Hot)",
    });
    const conversation = await storage.createConversation({
      userId: user.id,
      contactId: contact.id,
      channel: "whatsapp",
    });

    const demoBookingsBefore = await storage.getDemoBookings();
    const demoCountBefore = demoBookingsBefore.length;

    const scheduledEventUri = `https://api.calendly.com/scheduled_events/ui-del-${Date.now()}`;
    const inviteeUri = `${scheduledEventUri}/invitees/inv-${Date.now()}`;
    const body = buildCalendlyInviteeCreatedBody({
      email: "showing-lead@example.com",
      contactId: contact.id,
      conversationId: conversation.id,
      scheduledEventUri,
      inviteeUri,
      eventTypeName: "Listing Consultation",
    });

    await ingestCalendlyEvent(user.id, body, { source: "calendly_webhook" });

    const apptsAfterBook = await storage.getAppointmentsByContact(user.id, contact.id);
    const calendlyAppt = apptsAfterBook.find((a) => a.source === "calendly");
    assert.ok(calendlyAppt, "Calendly booking creates appointment row");
    assert.equal(isActiveFutureAppointment(calendlyAppt), true, "appointment is active");

    const bookedContact = await storage.getContact(contact.id);
    assert.equal(bookedContact?.pipelineStage, "Appointment Set", "booking sets Appointment Set");
    assert.ok(bookedContact?.followUpDate, "booking sets followUpDate");
    assert.ok(bookedContact?.followUp, "booking sets followUp title");

    const badgeMap = nextActiveAppointmentByContact(
      (await storage.getAppointmentsByUser(user.id)).filter(isActiveFutureAppointment),
    );
    assert.ok(badgeMap.has(contact.id), "booked badge source: active appointment exists");

    const demoBookingsAfterCalendly = await storage.getDemoBookings();
    assert.equal(
      demoBookingsAfterCalendly.length,
      demoCountBefore,
      "Calendly showing/consultation must not create demo_bookings",
    );

    const deleteResult = await deleteAppointmentWithContactCleanup(user.id, calendlyAppt!.id);
    assert.equal(deleteResult.success, true, "UI delete succeeds");
    assert.equal(deleteResult.tombstoned, true, "linked Calendly URI tombstoned on UI delete");

    assert.equal(
      await isCalendlyEventUriTombstoned(user.id, [scheduledEventUri, inviteeUri]),
      true,
      "tombstone recorded for scheduled event URI",
    );

    const apptsAfterDelete = await storage.getAppointmentsByContact(user.id, contact.id);
    assert.equal(
      apptsAfterDelete.filter((a) => isActiveFutureAppointment(a)).length,
      0,
      "no active appointments after UI delete",
    );

    const clearedContact = await storage.getContact(contact.id);
    assert.equal(clearedContact?.followUpDate, null, "followUpDate cleared after delete");
    assert.equal(clearedContact?.followUp, null, "followUp cleared after delete");
    assert.notEqual(
      clearedContact?.pipelineStage,
      "Appointment Set",
      "Appointment Set reverted after delete",
    );
    assert.equal(
      clearedContact?.pipelineStage,
      "Appointment Requested",
      "pipeline reverts to Appointment Requested",
    );

    const cf = (clearedContact?.customFields ?? {}) as Record<string, unknown>;
    const lastBooking = cf.calendlyLastBooking as Record<string, unknown> | undefined;
    assert.equal(lastBooking?.status, "cancelled", "calendlyLastBooking marked cancelled");

    const badgeMapAfter = nextActiveAppointmentByContact(
      (await storage.getAppointmentsByUser(user.id)).filter(isActiveFutureAppointment),
    );
    assert.equal(badgeMapAfter.has(contact.id), false, "booked badge source cleared");

    const timeline = await storage.getActivityEvents(contact.id, 50);
    assert.ok(
      timeline.some((e) => e.eventType === "calendly_booking_canceled"),
      "timeline records canceled activity",
    );

    await ingestCalendlyEvent(user.id, body, { source: "calendly_poll" });
    await ingestCalendlyEvent(user.id, body, { source: "calendly_webhook" });

    const apptsAfterReplay = await storage.getAppointmentsByContact(user.id, contact.id);
    assert.equal(
      apptsAfterReplay.filter((a) => a.source === "calendly" && isActiveFutureAppointment(a)).length,
      0,
      "manual sync after UI delete must not recreate appointment",
    );

    const replayContact = await storage.getContact(contact.id);
    assert.notEqual(replayContact?.pipelineStage, "Appointment Set", "poll replay must not restore Appointment Set");
    assert.equal(replayContact?.followUpDate, null, "poll replay must not restore followUpDate");

    console.log("  UI delete + tombstone + poll anti-resurrection + no demo_bookings: OK");
  } finally {
    await teardownTestUser(userId, "appointment-ui-delete.test.ts");
  }
}

async function runManualAppointmentDeleteScenario() {
  const { prepareDbTestEnvironment, teardownTestUser } = await import("./helpers/dbTestGuard.js");
  prepareDbTestEnvironment("appointment-ui-delete.test.ts");

  const { storage } = await import("../server/storage");
  const { deleteAppointmentWithContactCleanup } = await import("../server/contactAppointmentSync");
  const { applyStartupSchemaPatches } = await import("../server/startupSchemaPatches");
  await applyStartupSchemaPatches();

  let userId: string | undefined;
  try {
    const user = await storage.createUser({
      email: `manual-appt-del-${Date.now()}@test.com`,
      password: "test123",
      name: "Manual Appt Delete",
    });
    userId = user.id;

    const contact = await storage.createContact({
      userId: user.id,
      name: "Manual Lead",
      email: "manual-lead@example.com",
      primaryChannel: "whatsapp",
      source: "whatsapp",
      pipelineStage: "Appointment Set",
      followUp: "Walkthrough",
      followUpDate: new Date("2026-06-18T13:00:00.000Z"),
    });

    const appt = await storage.createAppointment({
      userId: user.id,
      contactId: contact.id,
      contactName: contact.name,
      appointmentType: "Showing",
      appointmentDate: new Date("2026-06-18T13:00:00.000Z"),
      title: "Walkthrough",
      status: "scheduled",
      source: "manual",
    });

    const result = await deleteAppointmentWithContactCleanup(user.id, appt.id);
    assert.equal(result.success, true);

    const refreshed = await storage.getContact(contact.id);
    assert.equal(refreshed?.followUpDate, null);
    assert.equal(refreshed?.followUp, null);
    assert.equal(refreshed?.pipelineStage, "Appointment Requested");

    const timeline = await storage.getActivityEvents(contact.id, 20);
    assert.ok(timeline.some((e) => e.eventType === "appointment_deleted"));

    console.log("  manual appointment UI delete clears CRM indicators: OK");
  } finally {
    await teardownTestUser(userId, "appointment-ui-delete.test.ts");
  }
}

async function main() {
  const { isDbTestWriteAllowed } = await import("./helpers/dbTestGuard.js");
  if (isDbTestWriteAllowed()) {
    await runDbIntegration();
    await runManualAppointmentDeleteScenario();
  } else {
    console.log("  DB integration: skipped (set TEST_DATABASE_URL or ALLOW_DB_TEST_WRITES=1)");
  }
  console.log("appointment-ui-delete.test.ts: OK");
}

await main();
