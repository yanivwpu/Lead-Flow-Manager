/**
 * Inbox selection isolation — contact-only imports must never show another contact's messages.
 * Run: npx tsx tests/inbox-selection-isolation.test.ts
 */
import assert from "node:assert/strict";
import {
  resolveInboxSelectionState,
  shouldFetchInboxMessages,
} from "../client/src/lib/inboxSelectionState";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("A → B (no conversation): clears messages and conversation", () => {
  const prevMessages = [
    { id: "m1", content: "Susu property listing" },
    { id: "m2", content: "Can we talk tomorrow?" },
  ];
  // While B is selected but query still holds A's placeholder contact:
  const stale = resolveInboxSelectionState({
    selectedContactId: "contact-b",
    contactQueryData: {
      contact: { id: "contact-a" },
      conversations: [{ id: "conv-a", channel: "whatsapp" }],
    },
    preferredChannel: "whatsapp",
    messagesQueryData: prevMessages,
    inboxListContact: { id: "contact-b" },
  });
  assert.equal(stale.contactMatchesSelection, false);
  assert.equal(stale.contact, null);
  assert.equal(stale.displayContact?.id, "contact-b");
  assert.equal(stale.primaryConversation, null);
  assert.equal(stale.activeConversationId, null);
  assert.deepEqual(stale.messages, []);
  assert.equal(stale.hasConversation, false);
  assert.equal(
    shouldFetchInboxMessages({
      selectedContactId: "contact-b",
      contactMatchesSelection: false,
      conversationId: null,
    }),
    false,
  );

  // After B's detail loads with no conversations:
  const loaded = resolveInboxSelectionState({
    selectedContactId: "contact-b",
    contactQueryData: {
      contact: { id: "contact-b" },
      conversations: [],
    },
    preferredChannel: "whatsapp",
    messagesQueryData: prevMessages, // stale cache must still be ignored
    inboxListContact: { id: "contact-b" },
  });
  assert.equal(loaded.contactMatchesSelection, true);
  assert.equal(loaded.contact?.id, "contact-b");
  assert.equal(loaded.hasConversation, false);
  assert.deepEqual(loaded.messages, []);
  assert.equal(
    shouldFetchInboxMessages({
      selectedContactId: "contact-b",
      contactMatchesSelection: true,
      conversationId: null,
    }),
    false,
  );
});

run("Contact-only B → contact-only C: displayContact tracks selection", () => {
  const b = resolveInboxSelectionState({
    selectedContactId: "b",
    contactQueryData: { contact: { id: "b" }, conversations: [] },
    messagesQueryData: [],
  });
  assert.equal(b.displayContact?.id, "b");

  const c = resolveInboxSelectionState({
    selectedContactId: "c",
    contactQueryData: { contact: { id: "b" }, conversations: [] }, // previous placeholder
    messagesQueryData: [{ id: "x" }],
    inboxListContact: { id: "c" },
  });
  assert.equal(c.displayContact?.id, "c");
  assert.deepEqual(c.messages, []);
  assert.equal(c.contactMatchesSelection, false);
});

run("Contact-only B → Contact A with conversation: messages allowed only when matched", () => {
  const msgs = [{ id: "m1", content: "hello" }];
  const resolved = resolveInboxSelectionState({
    selectedContactId: "contact-a",
    contactQueryData: {
      contact: { id: "contact-a" },
      conversations: [{ id: "conv-a", channel: "whatsapp" }],
    },
    preferredChannel: "whatsapp",
    messagesQueryData: msgs,
  });
  assert.equal(resolved.hasConversation, true);
  assert.equal(resolved.activeConversationId, "conv-a");
  assert.deepEqual(resolved.messages, msgs);
  assert.equal(
    shouldFetchInboxMessages({
      selectedContactId: "contact-a",
      contactMatchesSelection: true,
      conversationId: "conv-a",
    }),
    true,
  );
});

run("Rapid A→B→C: stale A messages never apply to C", () => {
  const aMessages = [{ id: "a1", content: "from A" }];
  const forC = resolveInboxSelectionState({
    selectedContactId: "c",
    contactQueryData: {
      contact: { id: "a" },
      conversations: [{ id: "conv-a", channel: "sms" }],
    },
    messagesQueryData: aMessages,
    inboxListContact: { id: "c" },
  });
  assert.equal(forC.displayContact?.id, "c");
  assert.deepEqual(forC.messages, []);
  assert.equal(forC.activeConversationId, null);
});

run("conversationId null: shouldFetchInboxMessages is false", () => {
  assert.equal(
    shouldFetchInboxMessages({
      selectedContactId: "x",
      contactMatchesSelection: true,
      conversationId: null,
    }),
    false,
  );
  assert.equal(
    shouldFetchInboxMessages({
      selectedContactId: "x",
      contactMatchesSelection: true,
      conversationId: undefined,
    }),
    false,
  );
});

run("no selected contact: empty safe state", () => {
  const empty = resolveInboxSelectionState({
    selectedContactId: null,
    contactQueryData: {
      contact: { id: "a" },
      conversations: [{ id: "conv-a" }],
    },
    messagesQueryData: [{ id: "m" }],
  });
  assert.equal(empty.displayContact, null);
  assert.deepEqual(empty.messages, []);
  assert.equal(empty.hasConversation, false);
});

run("preferred channel picks matching conversation", () => {
  const resolved = resolveInboxSelectionState({
    selectedContactId: "c1",
    contactQueryData: {
      contact: { id: "c1" },
      conversations: [
        { id: "wa", channel: "whatsapp" },
        { id: "sms", channel: "sms" },
      ],
    },
    preferredChannel: "sms",
    messagesQueryData: [{ id: "1" }],
  });
  assert.equal(resolved.activeConversationId, "sms");
  assert.deepEqual(resolved.messages, [{ id: "1" }]);
});

console.log("\nAll inbox selection isolation tests passed.");
