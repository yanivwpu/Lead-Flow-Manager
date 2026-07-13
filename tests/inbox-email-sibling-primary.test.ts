/**
 * Sibling email thread primary selection — row/center must not mix Thread A id with Thread B time/unread.
 * Run: npx tsx tests/inbox-email-sibling-primary.test.ts
 */
import assert from "node:assert/strict";
import {
  resolveContactCenterConversation,
  selectPrimaryConversation,
} from "../shared/inboxPrimaryConversation";
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

const threadA = {
  id: "conv-test-51",
  channel: "email",
  subject: "Test 51",
  lastMessageAt: "2026-07-13T21:03:00.000Z",
  unreadCount: 0,
  lastMessagePreview: "old thread",
};
const threadB = {
  id: "conv-test-52",
  channel: "email",
  subject: "Test 52",
  lastMessageAt: "2026-07-13T22:06:00.000Z",
  unreadCount: 1,
  lastMessagePreview: "new thread",
};

run("selectPrimaryConversation picks Thread B by lastMessageAt among email siblings", () => {
  // Intentionally older-first order (Array.find(channel) would wrongly pick A).
  const primary = selectPrimaryConversation([threadA, threadB], "email");
  assert.equal(primary?.id, "conv-test-52");
  assert.equal(primary?.unreadCount, 1);
  assert.equal(primary?.subject, "Test 52");
});

run("inbox row payload fields all come from Thread B (no mixed sibling metadata)", () => {
  const primary = selectPrimaryConversation([threadA, threadB], "email")!;
  const row = {
    conversationId: primary.id,
    lastMessageAt: primary.lastMessageAt,
    unreadCount: primary.unreadCount,
    preview: primary.lastMessagePreview,
    subject: primary.subject,
  };
  assert.equal(row.conversationId, "conv-test-52");
  assert.equal(row.lastMessageAt, threadB.lastMessageAt);
  assert.equal(row.unreadCount, 1);
  assert.equal(row.preview, "new thread");
  assert.equal(row.subject, "Test 52");
  assert.notEqual(row.conversationId, threadA.id);
});

run("resolveInboxSelectionState: preferred email + stale find order still opens Thread B", () => {
  const resolved = resolveInboxSelectionState({
    selectedContactId: "yaniv",
    contactQueryData: {
      contact: { id: "yaniv" },
      conversations: [threadA, threadB],
    },
    preferredChannel: "email",
    messagesQueryData: [{ id: "m-b" }],
    inboxRowConversation: threadB,
  });
  assert.equal(resolved.activeConversationId, "conv-test-52");
  assert.equal(resolved.primaryConversation?.id, "conv-test-52");
  assert.equal(resolved.newestPrimaryConversation?.id, "conv-test-52");
  assert.equal(resolved.primaryConversation?.subject, "Test 52");
  assert.equal(resolved.usedStickyConversation, false);
});

run("sticky older Thread A stays open while row newest remains Thread B", () => {
  const resolved = resolveInboxSelectionState({
    selectedContactId: "yaniv",
    contactQueryData: {
      contact: { id: "yaniv" },
      conversations: [threadA, threadB],
    },
    preferredChannel: "email",
    messagesQueryData: [{ id: "m-a" }],
    inboxRowConversation: threadB,
    stickyConversationId: "conv-test-51",
  });
  assert.equal(resolved.newestPrimaryConversation?.id, "conv-test-52");
  assert.equal(resolved.primaryConversation?.id, "conv-test-51");
  assert.equal(resolved.usedStickyConversation, true);
});

run("reselect / no sticky opens Thread B after leaving A", () => {
  const afterReselect = resolveInboxSelectionState({
    selectedContactId: "yaniv",
    contactQueryData: {
      contact: { id: "yaniv" },
      conversations: [threadA, threadB],
    },
    preferredChannel: "email",
    messagesQueryData: [],
    inboxRowConversation: threadB,
    stickyConversationId: null,
  });
  assert.equal(afterReselect.primaryConversation?.id, "conv-test-52");
});

run("inbox row conversation wins over stale contact detail that only lists Thread A", () => {
  const resolved = resolveInboxSelectionState({
    selectedContactId: "yaniv",
    contactQueryData: {
      contact: { id: "yaniv" },
      conversations: [threadA],
    },
    preferredChannel: "email",
    messagesQueryData: [],
    inboxListContact: { id: "yaniv" },
    inboxRowConversation: threadB,
  });
  assert.equal(resolved.primaryConversation?.id, "conv-test-52");
  assert.equal(resolved.newestPrimaryConversation?.id, "conv-test-52");
});

run("resolveContactCenterConversation reports inbox alignment", () => {
  const r = resolveContactCenterConversation({
    conversations: [threadA, threadB],
    preferredChannel: "email",
    inboxRowConversation: threadB,
  });
  assert.equal(r.newestPrimary?.id, "conv-test-52");
  assert.equal(r.centerConversation?.id, "conv-test-52");
  assert.equal(r.usedInboxRow, true);
});

console.log("\nAll inbox email sibling primary tests passed.");
