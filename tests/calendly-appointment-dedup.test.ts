/**
 * Calendly appointment dedupe — webhook then poll must not double-create.
 * Run: ALLOW_DB_TEST_WRITES=1 npx tsx tests/calendly-appointment-dedup.test.ts
 */
import assert from "node:assert/strict";
import {
  buildCalendlyBookingMessageExternalId,
  calendlyStartTimesMatch,
  isCalendlyBookingCanceledPayload,
  primaryCalendlyDedupeUri,
} from "../shared/calendlyAppointmentDedup";

function assertPureDedupHelpers() {
  const scheduledEventUri = "https://api.calendly.com/scheduled_events/abc123";
  const inviteeUri = "https://api.calendly.com/scheduled_events/abc123/invitees/xyz";
  const primary = primaryCalendlyDedupeUri({ scheduledEventUri, inviteeUri });
  assert.equal(primary, scheduledEventUri, "prefers scheduled event URI");
  assert.equal(
    buildCalendlyBookingMessageExternalId({ scheduledEventUri, inviteeUri }),
    `calendly-booking:${scheduledEventUri}`,
  );
  const start = "2026-06-15T14:00:00.000Z";
  assert.equal(calendlyStartTimesMatch(start, new Date(start)), true);
  assert.equal(calendlyStartTimesMatch(start, new Date("2026-06-15T14:00:30.000Z")), true);
  assert.equal(calendlyStartTimesMatch(start, new Date("2026-06-15T15:00:00.000Z")), false);

  const cancelEventUri = "https://api.calendly.com/scheduled_events/cancel-test";
  assert.equal(
    isCalendlyBookingCanceledPayload({ event: "invitee.canceled", payload: { email: "a@b.com" } }),
    true,
  );
  assert.equal(
    isCalendlyBookingCanceledPayload({
      event: "invitee.created",
      payload: {
        email: "a@b.com",
        uri: `${cancelEventUri}/invitees/x`,
        scheduled_event: { uri: cancelEventUri, status: "canceled", start_time: start },
      },
    }),
    true,
  );
  assert.equal(
    isCalendlyBookingCanceledPayload({
      event: "invitee.created",
      payload: {
        email: "a@b.com",
        uri: `${cancelEventUri}/invitees/x`,
        scheduled_event: { uri: cancelEventUri, status: "active", start_time: start },
        cancellation: { rescheduled: true },
        rescheduled: true,
      },
    }),
    false,
    "reschedule cancellation leg is not treated as deleted booking",
  );

  console.log("  pure dedup helpers: OK");
}

function buildCalendlyInviteeCreatedBody(params: {
  email: string;
  contactId: string;
  conversationId: string;
  scheduledEventUri: string;
  inviteeUri: string;
  startTime?: string;
  endTime?: string;
}) {
  const startTime = params.startTime ?? "2026-06-15T14:00:00.000000Z";
  const endTime = params.endTime ?? "2026-06-15T14:30:00.000000Z";
  return {
    event: "invitee.created",
    payload: {
      email: params.email,
      name: "Dedup Test Lead",
      uri: params.inviteeUri,
      scheduled_event: {
        uri: params.scheduledEventUri,
        name: "Property Showing",
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

function buildCalendlyInviteeCanceledBody(params: {
  email: string;
  contactId: string;
  conversationId: string;
  scheduledEventUri: string;
  inviteeUri: string;
  startTime?: string;
  endTime?: string;
}) {
  const startTime = params.startTime ?? "2026-06-15T14:00:00.000000Z";
  const endTime = params.endTime ?? "2026-06-15T14:30:00.000000Z";
  return {
    event: "invitee.canceled",
    payload: {
      email: params.email,
      name: "Dedup Test Lead",
      uri: params.inviteeUri,
      status: "canceled",
      scheduled_event: {
        uri: params.scheduledEventUri,
        name: "Property Showing",
        status: "canceled",
        start_time: startTime,
        end_time: endTime,
      },
      cancellation: { canceled_by: "host", reason: "Deleted by host" },
      tracking: {
        utm_content: params.contactId,
        utm_campaign: params.conversationId,
      },
    },
  };
}

async function runDbIntegration() {
  const { prepareDbTestEnvironment, teardownTestUser } = await import("./helpers/dbTestGuard.js");
  prepareDbTestEnvironment("calendly-appointment-dedup.test.ts");

  const { storage } = await import("../server/storage");
  const { ingestCalendlyEvent } = await import("../server/calendlyWebhook");
  const { shouldSkipCalendlyPollIngest } = await import("../server/appointmentDedup");
  const { applyStartupSchemaPatches } = await import("../server/startupSchemaPatches");
  await applyStartupSchemaPatches();

  let userId: string | undefined;
  try {
    const user = await storage.createUser({
      email: `calendly-dedup-${Date.now()}@test.com`,
      password: "test123",
      name: "Calendly Dedup Test",
    });
    userId = user.id;

    const contact = await storage.createContact({
      userId: user.id,
      name: "Dedup Test Lead",
      email: "dedup-lead@example.com",
      primaryChannel: "whatsapp",
      source: "whatsapp",
    });
    const conversation = await storage.createConversation({
      userId: user.id,
      contactId: contact.id,
      channel: "whatsapp",
    });

    const scheduledEventUri = `https://api.calendly.com/scheduled_events/dedup-${Date.now()}`;
    const inviteeUri = `${scheduledEventUri}/invitees/inv-${Date.now()}`;
    const body = buildCalendlyInviteeCreatedBody({
      email: "dedup-lead@example.com",
      contactId: contact.id,
      conversationId: conversation.id,
      scheduledEventUri,
      inviteeUri,
    });

    await ingestCalendlyEvent(user.id, body, { source: "calendly_webhook" });

    const apptsAfterFirst = await storage.getAppointmentsByContact(user.id, contact.id);
    const calendlyApptsAfterFirst = apptsAfterFirst.filter((a) => a.source === "calendly");
    assert.equal(calendlyApptsAfterFirst.length, 1, "first ingest creates one appointment");

    const msgsAfterFirst = await storage.getMessages(conversation.id, 200);
    const bookingMsgsAfterFirst = msgsAfterFirst.filter((m) => m.contentType === "calendly_event");
    assert.equal(bookingMsgsAfterFirst.length, 1, "first ingest creates one timeline booking card");

    const expectedExternalId = buildCalendlyBookingMessageExternalId({ scheduledEventUri, inviteeUri });
    assert.equal(bookingMsgsAfterFirst[0]?.externalMessageId, expectedExternalId, "canonical message external id");

    const outboundAfterFirst = msgsAfterFirst.filter(
      (m) => m.direction === "outbound" && /great|booked|scheduled/i.test(m.content || ""),
    );
    assert.equal(outboundAfterFirst.length, 0, "no duplicate outbound confirmation on tracked conversation path");

    const pollSkip = await shouldSkipCalendlyPollIngest({
      userId: user.id,
      eventType: "invitee.created",
      scheduledEventUri,
      inviteeUri,
      contactId: contact.id,
      startTimeIso: "2026-06-15T14:00:00.000000Z",
    });
    assert.equal(pollSkip, true, "manual sync should skip fully ingested booking");

    await ingestCalendlyEvent(user.id, body, { source: "calendly_poll" });

    const apptsAfterSecond = await storage.getAppointmentsByContact(user.id, contact.id);
    const calendlyApptsAfterSecond = apptsAfterSecond.filter((a) => a.source === "calendly");
    assert.equal(calendlyApptsAfterSecond.length, 1, "second ingest must not create another appointment");
    assert.equal(calendlyApptsAfterSecond[0]?.id, calendlyApptsAfterFirst[0]?.id, "same appointment row");

    const msgsAfterSecond = await storage.getMessages(conversation.id, 200);
    const bookingMsgsAfterSecond = msgsAfterSecond.filter((m) => m.contentType === "calendly_event");
    assert.equal(bookingMsgsAfterSecond.length, 1, "second ingest must not create another timeline card");

    const outboundAfterSecond = msgsAfterSecond.filter(
      (m) => m.direction === "outbound" && /great|booked|scheduled/i.test(m.content || ""),
    );
    assert.equal(outboundAfterSecond.length, 0, "no duplicate outbound confirmation after poll re-ingest");

    assert.equal(outboundAfterSecond.length, 0, "no duplicate outbound confirmation after poll re-ingest");

    const cancelBody = buildCalendlyInviteeCanceledBody({
      email: "dedup-lead@example.com",
      contactId: contact.id,
      conversationId: conversation.id,
      scheduledEventUri,
      inviteeUri,
    });
    await ingestCalendlyEvent(user.id, cancelBody, { source: "calendly_webhook" });

    const apptsAfterCancel = await storage.getAppointmentsByContact(user.id, contact.id);
    const calendlyApptsAfterCancel = apptsAfterCancel.filter((a) => a.source === "calendly");
    assert.equal(calendlyApptsAfterCancel.length, 1, "cancel must not create a new appointment row");
    assert.equal(calendlyApptsAfterCancel[0]?.status, "cancelled", "appointment marked cancelled");
    assert.equal(calendlyApptsAfterCancel[0]?.id, calendlyApptsAfterFirst[0]?.id, "same appointment row after cancel");

    const msgsAfterCancel = await storage.getMessages(conversation.id, 200);
    const bookingMsgsAfterCancel = msgsAfterCancel.filter((m) => m.contentType === "calendly_event");
    assert.equal(bookingMsgsAfterCancel.length, 2, "booked + canceled timeline cards");
    const outboundAfterCancel = msgsAfterCancel.filter(
      (m) => m.direction === "outbound" && /great|scheduled|booked/i.test(m.content || ""),
    );
    assert.equal(outboundAfterCancel.length, 0, "cancel must not send scheduled confirmation");

    const refreshedContact = await storage.getContact(contact.id);
    assert.notEqual(refreshedContact?.pipelineStage, "Appointment Set", "pipeline reverts when no active appointment");

    await ingestCalendlyEvent(user.id, body, { source: "calendly_poll" });
    await ingestCalendlyEvent(user.id, cancelBody, { source: "calendly_poll" });

    const apptsAfterCancelPoll = await storage.getAppointmentsByContact(user.id, contact.id);
    assert.equal(
      apptsAfterCancelPoll.filter((a) => a.source === "calendly").length,
      1,
      "post-cancel poll must not recreate appointment",
    );
    assert.equal(
      apptsAfterCancelPoll.filter((a) => a.source === "calendly")[0]?.status,
      "cancelled",
      "appointment remains cancelled after post-cancel poll",
    );
    const msgsAfterCancelPoll = await storage.getMessages(conversation.id, 200);
    assert.equal(
      msgsAfterCancelPoll.filter((m) => m.contentType === "calendly_event").length,
      2,
      "post-cancel poll must not add duplicate booking card",
    );
    const outboundAfterCancelPoll = msgsAfterCancelPoll.filter(
      (m) => m.direction === "outbound" && /great|scheduled|booked/i.test(m.content || ""),
    );
    assert.equal(outboundAfterCancelPoll.length, 0, "post-cancel poll must not send confirmation");

    const { isCalendlyEventUriTombstoned } = await import("../server/calendlyBookingLifecycleGate");
    assert.equal(
      await isCalendlyEventUriTombstoned(user.id, [scheduledEventUri, inviteeUri]),
      true,
      "cancel must record tombstone for event URI",
    );

    await storage.deleteAppointment(calendlyApptsAfterCancel[0]!.id);
    const apptsAfterRowDelete = await storage.getAppointmentsByContact(user.id, contact.id);
    assert.equal(
      apptsAfterRowDelete.filter((a) => a.source === "calendly").length,
      0,
      "appointment row deleted (manual/repair simulation)",
    );

    await ingestCalendlyEvent(user.id, body, { source: "calendly_webhook" });
    await ingestCalendlyEvent(user.id, body, { source: "calendly_poll" });

    const apptsAfterTombstoneReplay = await storage.getAppointmentsByContact(user.id, contact.id);
    assert.equal(
      apptsAfterTombstoneReplay.filter((a) => a.source === "calendly").length,
      0,
      "tombstone must block resurrection after appointment row deleted",
    );
    const msgsAfterTombstoneReplay = await storage.getMessages(conversation.id, 200);
    assert.equal(
      msgsAfterTombstoneReplay.filter((m) => m.contentType === "calendly_event").length,
      2,
      "tombstone replay must not add booking card",
    );
    const outboundAfterTombstoneReplay = msgsAfterTombstoneReplay.filter(
      (m) => m.direction === "outbound" && /great|scheduled|booked/i.test(m.content || ""),
    );
    assert.equal(outboundAfterTombstoneReplay.length, 0, "tombstone replay must not send confirmation");

    const refreshedAfterTombstone = await storage.getContact(contact.id);
    assert.notEqual(
      refreshedAfterTombstone?.pipelineStage,
      "Appointment Set",
      "tombstone replay must not set Appointment Set",
    );

    const { backfillCalendlyCanceledTombstonesFromAppointments } = await import(
      "../server/calendlyBookingLifecycleGate"
    );
    await backfillCalendlyCanceledTombstonesFromAppointments(user.id);
    assert.equal(
      await isCalendlyEventUriTombstoned(user.id, [scheduledEventUri]),
      true,
      "startup backfill preserves tombstone",
    );

    console.log("  DB integration (webhook → poll → cancel → poll → tombstone replay): OK");
  } finally {
    await teardownTestUser(userId, "calendly-appointment-dedup.test.ts");
  }
}

async function main() {
  assertPureDedupHelpers();

  const { isDbTestWriteAllowed } = await import("./helpers/dbTestGuard.js");
  if (isDbTestWriteAllowed()) {
    await runDbIntegration();
  } else {
    console.log("  DB integration: skipped (set TEST_DATABASE_URL or ALLOW_DB_TEST_WRITES=1)");
  }

  console.log("calendly-appointment-dedup.test.ts: OK");
}

await main();
