/**
 * Inbox unread badge + conversation row stability.
 * Run: npx tsx tests/inbox-unread-and-row-stability.test.ts
 */
import assert from "node:assert/strict";
import {
  applyInboxContactMarkRead,
  inboxConversationRowChromeClassName,
  INBOX_ROW_HEADER_CLASS,
  INBOX_ROW_STATUS_BAND_CLASS,
  mergeInboxUnreadPreservingLocalRead,
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

run("1. mark email conversation read → badge stays gone after refetch", () => {
  const inbox = [
    {
      contact: { id: "c1" },
      unreadCount: 1,
      conversation: { unreadCount: 1 },
    },
    {
      contact: { id: "c2" },
      unreadCount: 2,
      conversation: { unreadCount: 2 },
    },
  ];
  const afterMark = applyInboxContactMarkRead(inbox, "c1")!;
  assert.equal(afterMark[0].unreadCount, 0);
  assert.equal(afterMark[0].conversation?.unreadCount, 0);
  assert.equal(afterMark[1].unreadCount, 2);

  // Stale refetch still reports unread for c1 — preserve local read.
  const staleServer = [
    {
      contact: { id: "c1" },
      unreadCount: 1,
      conversation: { unreadCount: 1 },
    },
    {
      contact: { id: "c2" },
      unreadCount: 2,
      conversation: { unreadCount: 2 },
    },
  ];
  const merged = mergeInboxUnreadPreservingLocalRead(
    afterMark,
    staleServer,
    new Set(["c1"]),
  );
  assert.equal(merged[0].unreadCount, 0, "badge must stay gone after stale refetch");
  assert.equal(merged[1].unreadCount, 2);

  // After contact-level mark-all, server sum is 0.
  assert.equal(sumContactUnread([0, 0]), 0);
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
    "re-sync of existing message must not re-apply unread after CRM mark-read",
  );
  assert.equal(
    nextEmailConversationUnreadCount({
      messageAlreadyExists: false,
      direction: "inbound",
      currentUnread: 0,
    }),
    1,
    "new inbound still bumps unread",
  );
  assert.equal(
    nextEmailConversationUnreadCount({
      messageAlreadyExists: false,
      direction: "outbound",
      currentUnread: 2,
    }),
    2,
  );
});

run("3. selected/unselected conversation row dimensions use identical spacing classes", () => {
  const selected = inboxConversationRowChromeClassName({ selected: true });
  const unselected = inboxConversationRowChromeClassName({ selected: false });
  const selectedOverdue = inboxConversationRowChromeClassName({ selected: true, overdue: true });
  const unselectedOverdue = inboxConversationRowChromeClassName({
    selected: false,
    overdue: true,
  });

  for (const cls of [selected, unselected, selectedOverdue, unselectedOverdue]) {
    assert.match(cls, /\bp-3\b/, "same padding");
    assert.match(cls, /\bborder-l-2\b/, "left border width always reserved");
    assert.doesNotMatch(cls, /\bring-1\b/, "no ring that expands layout box");
    assert.doesNotMatch(cls, /\bshadow-sm\b/, "no outer shadow that changes perceived thickness");
  }

  assert.match(selected, /border-l-gray-300|border-l-red-400/);
  assert.match(unselected, /border-l-transparent/);
  assert.match(INBOX_ROW_HEADER_CLASS, /min-h-\[20px\]/);
  assert.match(INBOX_ROW_STATUS_BAND_CLASS, /min-h-\[22px\]/);
});

console.log("\nAll inbox unread / row stability tests passed.");
