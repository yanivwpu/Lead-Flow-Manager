/**
 * Contact hard-delete: ownership, orphan cleanup, bulk fail-closed, Contacts UI.
 * Run: npx tsx tests/contact-deletion.test.ts
 * DB cases: TEST_DATABASE_URL or ALLOW_DB_TEST_WRITES=1
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTACTS_BULK_DELETE_MAX,
  describeContactDeletionExtraWarning,
  parseContactDeleteIds,
} from "../shared/contactDeletion";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const ROOT = join(import.meta.dirname, "..");

run("parseContactDeleteIds dedupes and rejects over 500 unique ids", () => {
  const dupes = parseContactDeleteIds(["a", "a", " b ", "b"]);
  assert.equal(dupes.ok, true);
  if (dupes.ok) assert.deepEqual(dupes.ids, ["a", "b"]);

  assert.equal(parseContactDeleteIds([]).ok, false);
  assert.equal(parseContactDeleteIds("nope").ok, false);
  const over = parseContactDeleteIds(Array.from({ length: 501 }, (_, i) => `id-${i}`));
  assert.equal(over.ok, false);
  if (!over.ok) {
    assert.equal(over.code, "over_limit");
    assert.equal(over.count, 501);
  }
  const exactlyMax = parseContactDeleteIds(
    Array.from({ length: CONTACTS_BULK_DELETE_MAX }, (_, i) => `id-${i}`),
  );
  assert.equal(exactlyMax.ok, true);
});

run("extra deletion warning is concise and mode-specific", () => {
  assert.equal(
    describeContactDeletionExtraWarning(
      { hasAppointments: false, hasActiveCampaignEnrollment: false, hasActiveFollowUp: false },
      "single",
    ),
    null,
  );
  assert.match(
    describeContactDeletionExtraWarning(
      { hasAppointments: true, hasActiveCampaignEnrollment: true, hasActiveFollowUp: true },
      "single",
    ) ?? "",
    /appointments.*campaign.*follow-up/,
  );
  assert.match(
    describeContactDeletionExtraWarning(
      { hasAppointments: true, hasActiveCampaignEnrollment: false, hasActiveFollowUp: false },
      "bulk",
    ) ?? "",
    /Some of the selected contacts also have appointments/,
  );
});

run("shared delete service is used by single and bulk routes", () => {
  const routes = readFileSync(join(ROOT, "server/routes/contacts.ts"), "utf8");
  const bulkIdx = routes.indexOf('app.post("/api/contacts/bulk-delete"');
  const deleteIdx = routes.indexOf('app.delete("/api/contacts/:id"');
  const paramGetIdx = routes.indexOf('app.get("/api/contacts/:id"');
  assert.ok(bulkIdx > 0, "bulk-delete route exists");
  assert.ok(bulkIdx < paramGetIdx, "bulk-delete is registered before /:id");
  assert.ok(routes.includes("deleteContactSafely"));
  assert.ok(routes.includes("deleteContactsSafely"));
  assert.ok(routes.includes("CONTACTS_BULK_DELETE_MAX"));
  const bulkSlice = routes.slice(bulkIdx, bulkIdx + 1800);
  assert.ok(bulkSlice.includes("deleteContactsSafely"));
  assert.ok(bulkSlice.includes("not_owned_or_missing"));
  const singleSlice = routes.slice(deleteIdx, deleteIdx + 900);
  assert.ok(singleSlice.includes("deleteContactSafely"));
  assert.ok(singleSlice.includes('status(403)'));
  assert.ok(singleSlice.includes('status(404)'));
});

run("orphan cleanup lives in the shared delete service", () => {
  const svc = readFileSync(join(ROOT, "server/contactDeleteService.ts"), "utf8");
  assert.ok(svc.includes("purgeContactOwnedOrphans"));
  assert.ok(svc.includes("contactNotes"));
  assert.ok(svc.includes("appointments"));
  assert.ok(svc.includes("flowJobs"));
  assert.ok(svc.includes("calendlyCanceledEventTombstones"));
  assert.ok(svc.includes("contactId: null"));
  assert.ok(svc.includes("db.transaction"));
  const storage = readFileSync(join(ROOT, "server/storage.ts"), "utf8");
  const deleteFn = storage.slice(storage.indexOf("async deleteContact("));
  assert.ok(deleteFn.includes("deleteContactRecords"));
});

run("Contacts UI: row menu, checkboxes, select-all filtered, bulk bar, hard-delete copy", () => {
  const page = readFileSync(join(ROOT, "client/src/pages/Contacts.tsx"), "utf8");
  assert.ok(page.includes("Delete Contact"));
  assert.ok(page.includes("Delete selected"));
  assert.ok(page.includes("checkbox-select-all-contacts"));
  assert.ok(page.includes("checkbox-contact-${contact.id}"));
  assert.ok(page.includes("contacts-bulk-bar"));
  assert.ok(page.includes("contacts-selected-count"));
  assert.ok(page.includes("selectedIds.size"));
  assert.ok(page.includes("toggleSelectAllFiltered"));
  assert.ok(page.includes("allFilteredSelected"));
  assert.ok(page.includes("This permanently deletes the contact and all conversations and messages. This cannot be undone."));
  assert.ok(page.includes("This permanently deletes these contacts and all related conversations and messages. This cannot be undone."));
  assert.ok(page.includes("/api/contacts/bulk-delete"));
  assert.ok(page.includes("method: \"DELETE\""));
  assert.ok(page.includes("invalidateQueriesAfterContactDeletion"));
  assert.ok(page.includes("CONTACTS_BULK_DELETE_MAX"));
  assert.ok(page.includes("contacts-bulk-max-hint"));
  assert.ok(page.includes("setSelectedIds((prev)"));
  assert.ok(page.includes("visible.has(id)"));
  assert.equal(page.includes('source = "email_inbox"'), false);
  assert.equal(page.includes("softDelete"), false);
  assert.equal(page.includes("archiveContact"), false);
});

run("Contacts filters/search/export still present; email_inbox stays excluded", () => {
  const page = readFileSync(join(ROOT, "client/src/pages/Contacts.tsx"), "utf8");
  assert.ok(page.includes("input-contacts-search"));
  assert.ok(page.includes("function handleExport"));
  assert.ok(page.includes("/api/contacts?limit=5000"));
  const routes = readFileSync(join(ROOT, "server/routes/contacts.ts"), "utf8");
  assert.ok(routes.includes("filterCrmListedContacts"));
  const visibility = readFileSync(join(ROOT, "shared/contactCrmVisibility.ts"), "utf8");
  assert.ok(visibility.includes("EMAIL_INBOX_IDENTITY_SOURCE"));
});

run("Inbox Delete Contact still hits DELETE /api/contacts/:id via shared backend", () => {
  const inbox = readFileSync(join(ROOT, "client/src/pages/UnifiedInbox.tsx"), "utf8");
  assert.ok(inbox.includes("deleteContactMutation"));
  assert.ok(inbox.includes("method: \"DELETE\""));
  assert.ok(inbox.includes("`/api/contacts/${contactId}`"));
  assert.ok(inbox.includes("invalidateQueriesAfterContactDeletion"));
  assert.ok(inbox.includes("menu-delete-contact"));
  const panel = readFileSync(join(ROOT, "client/src/components/InboxLeadDetailsPanel.tsx"), "utf8");
  assert.ok(panel.includes("Delete Contact"));
  assert.ok(panel.includes("onDeleteContact"));
});

run("cache invalidation covers contacts, inbox, appointments, enrollments", () => {
  const cache = readFileSync(join(ROOT, "client/src/lib/contactDeletionCache.ts"), "utf8");
  assert.ok(cache.includes("/api/contacts"));
  assert.ok(cache.includes("/api/inbox"));
  assert.ok(cache.includes("/api/appointments"));
  assert.ok(cache.includes("/api/campaign-enrollments"));
});

async function runDbIntegration() {
  const { prepareDbTestEnvironment, teardownTestUser } = await import("./helpers/dbTestGuard.js");
  prepareDbTestEnvironment("contact-deletion.test.ts");
  const { applyStartupSchemaPatches } = await import("../server/startupSchemaPatches");
  await applyStartupSchemaPatches();

  const { storage } = await import("../server/storage");
  const { db } = await import("../drizzle/db");
  const { eq } = await import("drizzle-orm");
  const {
    contactNotes,
    flowJobs,
    calendlyCanceledEventTombstones,
    appointments,
    conversations,
    messages,
  } = await import("@shared/schema");
  const {
    deleteContactSafely,
    deleteContactsSafely,
  } = await import("../server/contactDeleteService");

  const owner = await storage.createUser({
    email: `contact-del-owner-${Date.now()}@test.local`,
    password: "test123",
    name: "Delete Owner",
  });
  const other = await storage.createUser({
    email: `contact-del-other-${Date.now()}@test.local`,
    password: "test123",
    name: "Delete Other",
  });

  const seedContact = async (userId: string, name: string) => {
    const contact = await storage.createContact({
      userId,
      name,
      email: `${name.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}@test.local`,
      primaryChannel: "whatsapp",
      source: "whatsapp",
      pipelineStage: "New",
    });
    const conversation = await storage.createConversation({
      userId,
      contactId: contact.id,
      channel: "whatsapp",
    });
    const message = await storage.createMessage({
      conversationId: conversation.id,
      contactId: contact.id,
      userId,
      direction: "inbound",
      content: "hello",
      contentType: "text",
    });
    return { contact, conversation, message };
  };

  try {
    const own = await seedContact(owner.id, "Own Lead");
    await storage.addContactNote({
      workspaceId: owner.id,
      contactId: own.contact.id,
      content: "team note",
      createdByName: "Owner",
    });
    await storage.createAppointment({
      userId: owner.id,
      contactId: own.contact.id,
      contactName: own.contact.name,
      appointmentDate: new Date(Date.now() + 86_400_000),
      title: "Showing",
      appointmentType: "Appointment",
    });
    await storage.createFlowJob({
      flowId: "flow-test",
      contactId: own.contact.id,
      conversationId: own.conversation.id,
      nodeId: "wait-1",
      runAt: new Date(Date.now() + 3_600_000),
      status: "pending",
    });
    const tombstoneUri = `https://api.calendly.com/scheduled_events/del-${Date.now()}`;
    await storage.recordCalendlyCanceledEventTombstone({
      userId: owner.id,
      scheduledEventUri: tombstoneUri,
      contactId: own.contact.id,
      source: "test",
    });

    const foreign = await seedContact(other.id, "Foreign Lead");

    const forbidden = await deleteContactSafely(owner.id, foreign.contact.id);
    assert.equal(forbidden.ok, false);
    if (!forbidden.ok) assert.equal(forbidden.code, "forbidden");
    assert.ok(await storage.getContact(foreign.contact.id), "foreign contact remains");

    const missing = await deleteContactSafely(owner.id, "00000000-0000-0000-0000-000000000000");
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "not_found");

    const deleted = await deleteContactSafely(owner.id, own.contact.id);
    assert.equal(deleted.ok, true);
    assert.equal(await storage.getContact(own.contact.id), undefined);
    assert.equal(await storage.getConversation(own.conversation.id), undefined);
    const leftoverMessages = await db.select().from(messages).where(eq(messages.contactId, own.contact.id));
    assert.equal(leftoverMessages.length, 0);
    const leftoverNotes = await db.select().from(contactNotes).where(eq(contactNotes.contactId, own.contact.id));
    assert.equal(leftoverNotes.length, 0);
    const leftoverAppts = await db.select().from(appointments).where(eq(appointments.contactId, own.contact.id));
    assert.equal(leftoverAppts.length, 0);
    const leftoverJobs = await db.select().from(flowJobs).where(eq(flowJobs.contactId, own.contact.id));
    assert.equal(leftoverJobs.length, 0);
    const leftoverTombs = await db
      .select()
      .from(calendlyCanceledEventTombstones)
      .where(eq(calendlyCanceledEventTombstones.contactId, own.contact.id));
    assert.equal(leftoverTombs.length, 0);
    const keptTomb = await db
      .select()
      .from(calendlyCanceledEventTombstones)
      .where(eq(calendlyCanceledEventTombstones.scheduledEventUri, tombstoneUri));
    assert.equal(keptTomb.length, 1);
    assert.equal(keptTomb[0].contactId, null);
    const leftoverConvs = await db.select().from(conversations).where(eq(conversations.contactId, own.contact.id));
    assert.equal(leftoverConvs.length, 0);
    console.log("  single own delete + orphan cleanup: OK");

    const a = await seedContact(owner.id, "Bulk A");
    const b = await seedContact(owner.id, "Bulk B");
    const c = await seedContact(owner.id, "Bulk C");

    const three = await deleteContactsSafely(owner.id, [a.contact.id, b.contact.id, c.contact.id]);
    assert.equal(three.ok, true);
    if (three.ok) assert.equal(three.deleted, 3);
    assert.equal(await storage.getContact(a.contact.id), undefined);
    assert.equal(await storage.getContact(b.contact.id), undefined);
    assert.equal(await storage.getContact(c.contact.id), undefined);
    console.log("  bulk 3 own ids: OK");

    const d1 = await seedContact(owner.id, "Dedupe 1");
    const d2 = await seedContact(owner.id, "Dedupe 2");
    const deduped = await deleteContactsSafely(owner.id, [d1.contact.id, d1.contact.id, d2.contact.id]);
    assert.equal(deduped.ok, true);
    if (deduped.ok) assert.equal(deduped.deleted, 2);
    console.log("  bulk duplicate ids deduped: OK");

    const keep1 = await seedContact(owner.id, "Keep 1");
    const keep2 = await seedContact(owner.id, "Keep 2");
    const mixedForeign = await deleteContactsSafely(owner.id, [keep1.contact.id, keep2.contact.id, foreign.contact.id]);
    assert.equal(mixedForeign.ok, false);
    if (!mixedForeign.ok) assert.equal(mixedForeign.code, "not_owned_or_missing");
    assert.ok(await storage.getContact(keep1.contact.id));
    assert.ok(await storage.getContact(keep2.contact.id));
    assert.ok(await storage.getContact(foreign.contact.id));
    console.log("  bulk mixed foreign → zero deleted: OK");

    const mixedMissing = await deleteContactsSafely(owner.id, [
      keep1.contact.id,
      "00000000-0000-0000-0000-000000000000",
    ]);
    assert.equal(mixedMissing.ok, false);
    if (!mixedMissing.ok) assert.equal(mixedMissing.code, "not_owned_or_missing");
    assert.ok(await storage.getContact(keep1.contact.id));
    console.log("  bulk mixed missing → zero deleted: OK");

    const overLimit = await deleteContactsSafely(
      owner.id,
      Array.from({ length: 501 }, (_, i) => `id-${i}`),
    );
    assert.equal(overLimit.ok, false);
    if (!overLimit.ok) assert.equal(overLimit.code, "over_limit");
    assert.ok(await storage.getContact(keep1.contact.id));
    console.log("  bulk >500 rejected: OK");
  } finally {
    await teardownTestUser(owner.id, "contact-deletion owner");
    await teardownTestUser(other.id, "contact-deletion other");
  }
}

async function main() {
  const { isDbTestWriteAllowed } = await import("./helpers/dbTestGuard.js");
  if (isDbTestWriteAllowed()) {
    await runDbIntegration();
  } else {
    console.log("  DB integration: skipped (set TEST_DATABASE_URL or ALLOW_DB_TEST_WRITES=1)");
  }
  console.log("contact-deletion.test.ts: OK");
}

await main();
