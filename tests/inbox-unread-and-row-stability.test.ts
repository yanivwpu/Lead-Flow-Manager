/**
 * Inbox unread badge stability (separate from row layout).
 * Run: npx tsx tests/inbox-unread-and-row-stability.test.ts
 */
import assert from "node:assert/strict";
import {
  applyInboxConversationMarkRead,
  mergeInboxUnreadPreservingLocalRead,
  remainingContactUnreadAfterMarkingConversation,
} from "../client/src/lib/inboxConversationRow";
import {
  nextEmailConversationUnreadCount,
  shouldBumpUnreadOnEmailPersist,
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

run("opening email does NOT clear WhatsApp unread for same contact", () => {
  const conversations = [
    { id: "wa-1", unreadCount: 3 },
    { id: "email-1", unreadCount: 1 },
  ];
  const remaining = remainingContactUnreadAfterMarkingConversation({
    conversations,
    markedConversationId: "email-1",
  });
  assert.equal(remaining, 3, "WhatsApp unread must remain");

  const inbox = [
    {
      contact: { id: "c1" },
      unreadCount: 4,
      conversation: { id: "email-1", unreadCount: 1 },
    },
  ];
  const after = applyInboxConversationMarkRead(inbox, "c1", {
    conversationId: "email-1",
    remainingUnread: remaining,
  })!;
  assert.equal(after[0].unreadCount, 3, "aggregate badge = remaining WhatsApp unread");
  assert.equal(after[0].conversation?.unreadCount, 0);
});

run("1. mark selected conversation read → badge uses remaining sum after refetch", () => {
  const conversations = [
    { id: "email-1", unreadCount: 1 },
    { id: "wa-1", unreadCount: 2 },
  ];
  const remaining = remainingContactUnreadAfterMarkingConversation({
    conversations,
    markedConversationId: "email-1",
  });
  assert.equal(remaining, 2);

  const inbox = [
    {
      contact: { id: "c1" },
      unreadCount: 3,
      conversation: { id: "email-1", unreadCount: 1 },
    },
  ];
  const afterMark = applyInboxConversationMarkRead(inbox, "c1", {
    conversationId: "email-1",
    remainingUnread: remaining,
  })!;
  assert.equal(afterMark[0].unreadCount, 2);

  const staleServer = [
    {
      contact: { id: "c1" },
      unreadCount: 3,
      conversation: { id: "email-1", unreadCount: 1 },
    },
  ];
  const merged = mergeInboxUnreadPreservingLocalRead(
    afterMark,
    staleServer,
    new Map([["c1", 2]]),
  );
  assert.equal(merged[0].unreadCount, 2, "stale refetch cannot restore cleared conversation unread");
  assert.equal(sumContactUnread([0, 2]), 2);
});

run("2. incremental email sync does not restore stale unread for existing message", () => {
  assert.equal(
    shouldBumpUnreadOnEmailPersist({ messageAlreadyExists: true, direction: "inbound" }),
    false,
  );
  assert.equal(
    nextEmailConversationUnreadCount({
      messageAlreadyExists: true,
      direction: "inbound",
      currentUnread: 0,
    }),
    0,
  );
  assert.equal(
    nextEmailConversationUnreadCount({
      messageAlreadyExists: false,
      direction: "inbound",
      currentUnread: 0,
    }),
    1,
  );
});

run("switching channel marks only that conversation (remaining recalculated)", () => {
  const conversations = [
    { id: "email-1", unreadCount: 0 },
    { id: "wa-1", unreadCount: 2 },
  ];
  const remaining = remainingContactUnreadAfterMarkingConversation({
    conversations,
    markedConversationId: "wa-1",
  });
  assert.equal(remaining, 0);
  const inbox = [
    {
      contact: { id: "c1" },
      unreadCount: 2,
      conversation: { id: "wa-1", unreadCount: 2 },
    },
  ];
  const after = applyInboxConversationMarkRead(inbox, "c1", {
    conversationId: "wa-1",
    remainingUnread: remaining,
  })!;
  assert.equal(after[0].unreadCount, 0);
});

console.log("\nAll inbox unread stability tests passed.");
