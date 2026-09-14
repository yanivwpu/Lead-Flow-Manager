/**
 * Unknown Inbox overflow: two-of-three Save to Contacts + Delete conversation.
 * Run: npx tsx --test tests/inbox-anonymous-conversation-actions.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMAIL_INBOX_IDENTITY_SOURCE,
  canSaveInboxIdentityToContacts,
  inboxConversationMenuActions,
  inboxOnlySourceDetails,
  isCrmListedContact,
  savedContactSourceDetails,
} from "../shared/contactCrmVisibility";
import {
  collectValidatedIdentity,
  identityFieldCount,
  isValidIdentityEmail,
  isValidIdentityName,
  isValidIdentityPhone,
  meetsWebchatPromotionThreshold,
} from "../shared/webchatIdentityFields";
import {
  nextInboxHrefAfterConversationDelete,
  remainingInboxItemsAfterConversationDelete,
} from "../shared/inboxRowModel";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const unknownVisitor = {
  source: "webchat",
  name: "Unknown",
  email: null,
  phone: null,
  sourceDetails: inboxOnlySourceDetails({ webchatIdentityStatus: "anonymous" }),
  customFields: { budget: "$10k", timeline: "Q1", webchatVisitorId: "visitor_abc" },
};

test("zero identity factors hides Save to Contacts", () => {
  assert.equal(isCrmListedContact(unknownVisitor), false);
  assert.equal(canSaveInboxIdentityToContacts(unknownVisitor), false);
  assert.equal(inboxConversationMenuActions(unknownVisitor).includes("save_to_contacts"), false);
  assert.deepEqual(collectValidatedIdentity(unknownVisitor), {});
});

test("one valid factor hides Save to Contacts", () => {
  const emailOnly = { ...unknownVisitor, name: "Website Visitor", email: "ada@example.com" };
  const nameOnly = { ...unknownVisitor, name: "Ada Lovelace" };
  const phoneOnly = { ...unknownVisitor, name: "Anonymous", phone: "+1 (555) 010-0100" };
  assert.equal(identityFieldCount(collectValidatedIdentity(emailOnly)), 1);
  assert.equal(canSaveInboxIdentityToContacts(emailOnly), false);
  assert.equal(canSaveInboxIdentityToContacts(nameOnly), false);
  assert.equal(canSaveInboxIdentityToContacts(phoneOnly), false);
  assert.equal(inboxConversationMenuActions(emailOnly).includes("save_to_contacts"), false);
});

test("two valid factors shows Save to Contacts", () => {
  const nameEmail = { ...unknownVisitor, name: "Ada Lovelace", email: "ada@example.com" };
  const namePhone = { ...unknownVisitor, name: "Ada Lovelace", phone: "+1 (555) 010-0100" };
  const emailPhone = { ...unknownVisitor, name: "Guest", email: "ada@example.com", phone: "+1 (555) 010-0100" };
  assert.equal(meetsWebchatPromotionThreshold(collectValidatedIdentity(nameEmail)), true);
  assert.equal(canSaveInboxIdentityToContacts(nameEmail), true);
  assert.equal(canSaveInboxIdentityToContacts(namePhone), true);
  assert.equal(canSaveInboxIdentityToContacts(emailPhone), true);
  assert.deepEqual(inboxConversationMenuActions(nameEmail), [
    "save_to_contacts",
    "activity_timeline",
    "delete_conversation",
  ]);
});

test("placeholder name does not count", () => {
  for (const name of ["Unknown", "Anonymous", "Guest", "Website Visitor"]) {
    assert.equal(isValidIdentityName(name), null);
    assert.equal(
      canSaveInboxIdentityToContacts({ ...unknownVisitor, name, email: "ada@example.com" }),
      false,
    );
  }
});

test("malformed email and phone do not count", () => {
  assert.equal(isValidIdentityEmail("not-an-email"), null);
  assert.equal(isValidIdentityPhone("123"), null);
  assert.equal(
    canSaveInboxIdentityToContacts({
      ...unknownVisitor,
      name: "Ada Lovelace",
      email: "not-an-email",
      phone: "123",
    }),
    false,
  );
});

test("qualification fields and visitor IDs are not identity factors", () => {
  assert.deepEqual(collectValidatedIdentity(unknownVisitor), {});
  assert.equal(isValidIdentityPhone("visitor_abc"), null);
  assert.equal(canSaveInboxIdentityToContacts(unknownVisitor), false);
});

test("API rejects insufficient identity even when called directly", () => {
  const routes = read("server/routes/contacts.ts");
  const save = routes.slice(
    routes.indexOf('app.post("/api/contacts/:id/save-to-contacts"'),
    routes.indexOf("app.patch(\"/api/contacts/:id\""),
  );
  assert.match(save, /insufficient_identity/);
  assert.match(save, /meetsWebchatPromotionThreshold/);
  assert.match(save, /collectValidatedIdentity/);
  const create = routes.slice(routes.indexOf('app.post("/api/contacts"'), routes.indexOf('app.post("/api/contacts/:id/save-to-contacts"'));
  assert.match(create, /insufficient_identity/);
});

test("Unknown conversation shows Delete conversation; identified contact does not", () => {
  assert.equal(inboxConversationMenuActions(unknownVisitor).includes("delete_conversation"), true);
  assert.equal(
    inboxConversationMenuActions({
      source: "manual",
      name: "Pat Manual",
      email: "pat@example.com",
      sourceDetails: savedContactSourceDetails(),
    }).includes("delete_conversation"),
    false,
  );
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  assert.match(inbox, /menu-delete-conversation/);
  assert.match(inbox, /className="text-red-600"/);
  assert.match(inbox, /Trash2 className="w-4 h-4 mr-2"/);
  assert.match(inbox, /Delete conversation\?/);
  assert.match(inbox, /This will permanently remove this conversation and its messages\. This action cannot be undone\./);
  assert.match(inbox, /button-cancel-delete-conversation/);
  assert.match(inbox, /button-confirm-delete-conversation/);
  assert.match(inbox, /deleteConversationMutation\.isPending/);
});

test("confirmation cancel changes nothing", () => {
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  const cancel = inbox.slice(
    inbox.indexOf("button-cancel-delete-conversation") - 220,
    inbox.indexOf("button-cancel-delete-conversation") + 80,
  );
  assert.match(cancel, /setShowDeleteConversationConfirm\(false\)/);
  assert.doesNotMatch(cancel, /deleteConversationMutation\.mutate/);
});

test("confirmed deletion removes only the selected conversation", () => {
  const keep = {
    contact: { id: "c-keep" },
    conversation: { id: "conv-keep" },
  };
  const gone = {
    contact: { id: "c-anon" },
    conversation: { id: "conv-anon" },
  };
  const sibling = {
    contact: { id: "c-anon" },
    conversation: { id: "conv-sibling" },
  };
  assert.deepEqual(
    remainingInboxItemsAfterConversationDelete([keep, gone, sibling], {
      conversationId: "conv-anon",
      contactId: "c-anon",
      contactDeleted: false,
    }),
    [keep, sibling],
  );
  assert.deepEqual(
    remainingInboxItemsAfterConversationDelete([keep, gone, sibling], {
      conversationId: "conv-anon",
      contactId: "c-anon",
      contactDeleted: true,
    }),
    [keep],
  );
});

test("Inbox updates without refresh and empty state is reachable", () => {
  const remaining = remainingInboxItemsAfterConversationDelete(
    [{ contact: { id: "c1" }, conversation: { id: "v1" } }],
    { conversationId: "v1", contactId: "c1", contactDeleted: true },
  );
  assert.deepEqual(remaining, []);
  assert.equal(nextInboxHrefAfterConversationDelete(remaining), "/app/inbox");
  assert.equal(
    nextInboxHrefAfterConversationDelete([{ contact: { id: "c2" }, conversation: { id: "v2" } }]),
    "/app/inbox/c2?conversation=v2",
  );
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  assert.match(inbox, /remainingInboxItemsAfterConversationDelete/);
  assert.match(inbox, /nextInboxHrefAfterConversationDelete/);
  assert.match(inbox, /setQueryData<InboxItem\[\]>\(inboxRecentKey, remaining\)/);
  assert.match(inbox, /setLocation\(nextInboxHrefAfterConversationDelete\(remaining\)\)/);
});

test("failure preserves the conversation and displays an error", () => {
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  const mut = inbox.slice(inbox.indexOf("const deleteConversationMutation"));
  assert.match(mut, /Could not delete conversation/);
  assert.match(mut, /variant: "destructive"/);
  assert.doesNotMatch(mut.slice(mut.indexOf("onError"), mut.indexOf("onError") + 400), /setLocation/);
});

test("tenant A cannot delete tenant B’s conversation", () => {
  const svc = read("server/conversationDeleteService.ts");
  assert.match(svc, /conversation\.userId !== workspaceUserId/);
  assert.match(svc, /contact\.userId !== workspaceUserId/);
  assert.match(svc, /code: "forbidden"/);
  const routes = read("server/routes/conversations.ts");
  const del = routes.slice(routes.indexOf('app.delete("/api/conversations/:id"'), routes.indexOf("app.patch(\"/api/conversations/:id\""));
  assert.match(del, /if \(!req\.user\)/);
  assert.match(del, /status\(401\)/);
  assert.match(del, /status\(404\)\.json\(\{ error: "Not found" \}\)/);
  assert.match(del, /identified_contact/);
  assert.doesNotMatch(del, /req\.user\.role === "admin"/);
});

test("dependent draft and chatbot state cannot restore the deleted thread", () => {
  const svc = read("server/conversationDeleteService.ts");
  assert.match(svc, /abortWebchatGeneration/);
  assert.match(svc, /clearChatbotPendingAsk/);
  assert.match(svc, /conversation_deleted/);
  assert.match(svc, /flowJobs/);
  assert.match(svc, /noReplyJobs/);
  assert.match(svc, /isCrmListedContact\(contact\)/);
  assert.match(svc, /deleteContactRecords/);
  assert.match(svc, /alreadyDeleted/);
});

test("duplicate delete request is safe", () => {
  const svc = read("server/conversationDeleteService.ts");
  assert.match(svc, /alreadyDeleted: true/);
  assert.match(svc, /if \(!conversation\) return/);
});

test("mobile and desktop share the same menu and dialog", () => {
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  const triggerIdx = inbox.indexOf('data-testid="button-contact-actions"');
  const triggerSlice = inbox.slice(triggerIdx - 280, triggerIdx + 420);
  assert.match(triggerSlice, /aria-label="Conversation actions"/);
  assert.doesNotMatch(triggerSlice, /hidden md:/);
  assert.equal((inbox.match(/data-testid="menu-delete-conversation"/g) || []).length, 1);
  assert.equal((inbox.match(/data-testid="button-confirm-delete-conversation"/g) || []).length, 1);
});

test("email inbox-only still uses the existing identity helpers", () => {
  const emailInbox = {
    source: EMAIL_INBOX_IDENTITY_SOURCE,
    sourceDetails: inboxOnlySourceDetails(),
    name: "",
    email: "ada@example.com",
  };
  assert.equal(canSaveInboxIdentityToContacts(emailInbox), false);
  assert.equal(
    canSaveInboxIdentityToContacts({ ...emailInbox, name: "Ada Lovelace" }),
    true,
  );
});
