/**
 * Inbox unread badge = row conversation unread (not contact aggregate).
 * Run: npx tsx tests/inbox-row-unread-semantics.test.ts
 */
import assert from "node:assert/strict";
import {
  applyInboxConversationMarkRead,
  mergeInboxUnreadPreservingLocalRead,
  remainingContactUnreadAfterMarkingConversation,
} from "../client/src/lib/inboxConversationRow";
import {
  inboxRowUnreadBadgeCount,
  nextEmailConversationUnreadCount,
  sumContactUnread,
} from "../shared/emailUnreadState";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("row badge uses primary conversation unread, not contact aggregate", () => {
  assert.equal(
    inboxRowUnreadBadgeCount({
      primaryConversationUnread: 0,
      contactUnreadTotal: 5,
    }),
    0,
    "other unread threads must not show on this row",
  );
  assert.equal(
    inboxRowUnreadBadgeCount({
      primaryConversationUnread: 1,
      contactUnreadTotal: 5,
    }),
    1,
  );
});

run("marking primary email thread clears row badge while siblings stay unread", () => {
  const conversations = [
    { id: "email-primary", unreadCount: 1 },
    { id: "email-other", unreadCount: 4 },
    { id: "wa-1", unreadCount: 2 },
  ];
  assert.equal(sumContactUnread([1, 4, 2]), 7);
  const remaining = remainingContactUnreadAfterMarkingConversation({
    conversations,
    markedConversationId: "email-primary",
  });
  assert.equal(remaining, 6);

  const inbox = [
    {
      contact: { id: "c1" },
      unreadCount: 1, // row = primary conversation unread
      contactUnreadTotal: 7,
      conversation: { id: "email-primary", unreadCount: 1 },
    },
  ];
  const after = applyInboxConversationMarkRead(inbox, "c1", {
    conversationId: "email-primary",
    remainingUnread: remaining,
  })!;
  assert.equal(after[0].unreadCount, 0, "row badge cleared");
  assert.equal(after[0].conversation?.unreadCount, 0);
  assert.equal(after[0].contactUnreadTotal, 6, "siblings remain in contact total");
});

run("stale refetch cannot restore cleared row conversation unread", () => {
  const previous = [
    {
      contact: { id: "c1" },
      unreadCount: 0,
      contactUnreadTotal: 4,
      conversation: { id: "email-primary", unreadCount: 0 },
    },
  ];
  const stale = [
    {
      contact: { id: "c1" },
      unreadCount: 1,
      contactUnreadTotal: 5,
      conversation: { id: "email-primary", unreadCount: 1 },
    },
  ];
  const merged = mergeInboxUnreadPreservingLocalRead(
    previous,
    stale,
    new Set(["email-primary"]),
  );
  assert.equal(merged[0].unreadCount, 0);
  assert.equal(merged[0].conversation?.unreadCount, 0);
});

run("existing message re-sync does not bump unread", () => {
  assert.equal(
    nextEmailConversationUnreadCount({
      messageAlreadyExists: true,
      direction: "inbound",
      currentUnread: 0,
    }),
    0,
  );
});

console.log("\nAll inbox row unread semantics tests passed.");
