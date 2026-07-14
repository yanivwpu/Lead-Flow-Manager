/**
 * Email thread rows vs chat contact rows for Unified Inbox.
 * Run: npx tsx tests/inbox-email-thread-rows.test.ts
 */
import assert from "node:assert/strict";
import {
  buildInboxItemsForContact,
  inboxRowKey,
  isEmailConversationChannel,
} from "../shared/inboxRowModel";
import { resolveInboxSelectionState } from "../client/src/lib/inboxSelectionState";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const contact = {
  id: "contact-yaniv",
  primaryChannel: "email",
  primaryChannelOverride: null as string | null,
};

const threadA = {
  id: "conv-test-51",
  channel: "email",
  subject: "Test 51",
  lastMessageAt: "2026-07-13T21:03:00.000Z",
  unreadCount: 0,
  lastMessagePreview: "older body",
};
const threadB = {
  id: "conv-test-52",
  channel: "email",
  subject: "Test 52",
  lastMessageAt: "2026-07-13T22:06:00.000Z",
  unreadCount: 1,
  lastMessagePreview: "newer body",
};
const threadC = {
  id: "conv-test-53",
  channel: "email",
  subject: "Test 53",
  lastMessageAt: "2026-07-13T23:00:00.000Z",
  unreadCount: 1,
  lastMessagePreview: "third",
};
const wa = {
  id: "conv-wa",
  channel: "whatsapp",
  subject: null as string | null,
  lastMessageAt: "2026-07-13T20:00:00.000Z",
  unreadCount: 0,
  lastMessagePreview: "hey",
};

run("/api/inbox shape: same contact → TWO email rows with different conversationIds", () => {
  const rows = buildInboxItemsForContact({
    contact,
    conversations: [threadA, threadB],
  });
  assert.equal(rows.length, 2);
  const ids = new Set(rows.map((r) => r.conversation?.id));
  assert.ok(ids.has("conv-test-51"));
  assert.ok(ids.has("conv-test-52"));
  assert.equal(rows.every((r) => r.contact.id === "contact-yaniv"), true);
  assert.equal(rows.every((r) => r.channel === "email"), true);
});

run("Test 52 row shows subject/time/unread; Test 51 remains visible", () => {
  const rows = buildInboxItemsForContact({
    contact,
    conversations: [threadA, threadB],
  });
  const a = rows.find((r) => r.conversation?.id === "conv-test-51")!;
  const b = rows.find((r) => r.conversation?.id === "conv-test-52")!;
  assert.equal(b.lastMessage, "Test 52");
  assert.equal(b.unreadCount, 1);
  assert.equal(b.lastMessageAt, threadB.lastMessageAt);
  assert.equal(a.lastMessage, "Test 51");
  assert.equal(a.unreadCount, 0);
  assert.notEqual(inboxRowKey(a), inboxRowKey(b));
});

run("third email thread adds a third row (does not replace older)", () => {
  const rows = buildInboxItemsForContact({
    contact,
    conversations: [threadA, threadB, threadC],
  });
  assert.equal(rows.length, 3);
  assert.ok(rows.some((r) => r.conversation?.id === "conv-test-51"));
  assert.ok(rows.some((r) => r.conversation?.id === "conv-test-52"));
  assert.ok(rows.some((r) => r.conversation?.id === "conv-test-53"));
});

run("WhatsApp + email: one WA row + N email rows (no duplicate WA)", () => {
  const rows = buildInboxItemsForContact({
    contact: { ...contact, primaryChannel: "whatsapp" },
    conversations: [threadA, threadB, wa],
  });
  assert.equal(rows.length, 3);
  assert.equal(rows.filter((r) => r.channel === "whatsapp").length, 1);
  assert.equal(rows.filter((r) => r.channel === "email").length, 2);
});

run("selecting Test 51 via selectedConversationId opens Test 51", () => {
  const resolved = resolveInboxSelectionState({
    selectedContactId: "contact-yaniv",
    contactQueryData: {
      contact: { id: "contact-yaniv" },
      conversations: [threadA, threadB],
    },
    preferredChannel: "email",
    messagesQueryData: [{ id: "m51" }],
    inboxRowConversation: threadA,
    selectedConversationId: "conv-test-51",
  });
  assert.equal(resolved.activeConversationId, "conv-test-51");
  assert.equal(resolved.primaryConversation?.subject, "Test 51");
});

run("selecting Test 52 via selectedConversationId opens Test 52", () => {
  const resolved = resolveInboxSelectionState({
    selectedContactId: "contact-yaniv",
    contactQueryData: {
      contact: { id: "contact-yaniv" },
      conversations: [threadA, threadB],
    },
    preferredChannel: "email",
    messagesQueryData: [{ id: "m52" }],
    inboxRowConversation: threadB,
    selectedConversationId: "conv-test-52",
  });
  assert.equal(resolved.activeConversationId, "conv-test-52");
  assert.equal(resolved.primaryConversation?.subject, "Test 52");
});

run("unread is per conversation row", () => {
  const rows = buildInboxItemsForContact({
    contact,
    conversations: [threadA, threadB],
  });
  const unreadRows = rows.filter((r) => r.unreadCount > 0);
  assert.equal(unreadRows.length, 1);
  assert.equal(unreadRows[0].conversation?.id, "conv-test-52");
});

run("isEmailConversationChannel helper", () => {
  assert.equal(isEmailConversationChannel("email"), true);
  assert.equal(isEmailConversationChannel("whatsapp"), false);
});

console.log("\nAll inbox email thread row tests passed.");
