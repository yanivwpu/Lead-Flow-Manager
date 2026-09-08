/**
 * Inbox conversation actions for email inbox-only vs saved Contacts.
 * Run: npx tsx --test tests/inbox-email-participant-actions.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  EMAIL_INBOX_IDENTITY_SOURCE,
  inboxConversationMenuActions,
  inboxOnlySourceDetails,
  isCrmListedContact,
  savedContactSourceDetails,
} from "../shared/contactCrmVisibility";

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const inboxOnly = {
  source: EMAIL_INBOX_IDENTITY_SOURCE,
  sourceDetails: inboxOnlySourceDetails(),
};
const savedEmail = {
  source: "email",
  sourceDetails: savedContactSourceDetails(undefined, { promotedFromInboxIdentity: true }),
};
const savedManual = { source: "manual" };

test("inbox-only has one Save to Contacts action, inside the dropdown only", () => {
  assert.deepEqual(inboxConversationMenuActions(inboxOnly), [
    "save_to_contacts",
    "activity_timeline",
  ]);
  assert.equal(isCrmListedContact(inboxOnly), false);

  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  assert.equal((inbox.match(/data-testid="menu-save-to-contacts"/g) || []).length, 1);
  assert.equal((inbox.match(/data-testid="button-save-to-contacts"/g) || []).length, 0);
  assert.match(inbox, /conversationMenuActions\.includes\("save_to_contacts"\)/);
  const saveIdx = inbox.indexOf('data-testid="menu-save-to-contacts"');
  const triggerIdx = inbox.indexOf('data-testid="button-contact-actions"');
  assert.ok(saveIdx > triggerIdx, "Save to Contacts is inside the three-dot menu");
  assert.match(inbox, /chip-inbox-only-participant/);
});

test("inbox-only does not show Edit Contact", () => {
  assert.equal(inboxConversationMenuActions(inboxOnly).includes("edit_contact"), false);
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  assert.match(inbox, /conversationMenuActions\.includes\("edit_contact"\)/);
  const panel = read("client/src/components/InboxLeadDetailsPanel.tsx");
  assert.match(panel, /isSavedCrmContact \? \(/);
  assert.match(panel, /button-edit-contact-panel/);
});

test("saved Contact shows Edit Contact and not Save to Contacts", () => {
  assert.deepEqual(inboxConversationMenuActions(savedEmail), [
    "edit_contact",
    "pause_automations",
    "activity_timeline",
    "delete_contact",
  ]);
  assert.deepEqual(inboxConversationMenuActions(savedManual), [
    "edit_contact",
    "pause_automations",
    "activity_timeline",
    "delete_contact",
  ]);
  assert.equal(isCrmListedContact(savedEmail), true);
  assert.equal(inboxConversationMenuActions(savedEmail).includes("save_to_contacts"), false);
});

test("promotion swaps the available action immediately on the same participant row", () => {
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  assert.match(inbox, /inboxRecentKey/);
  const saveMut = inbox.slice(inbox.indexOf("const saveToContactsMutation"));
  assert.match(saveMut, /\["\/api\/contacts", contactId\]/);
  assert.match(saveMut, /setQueryData<InboxItem\[\]>\(inboxRecentKey/);
  assert.match(saveMut, /item\.contact\.id === contactId/);
  assert.match(saveMut, /contact: \{ \.\.\.item\.contact, \.\.\.saved \}/);

  const promote = read("server/emailChannel/contactMatch.ts");
  const slice = promote.slice(
    promote.indexOf("export async function promoteInboxIdentityToCrm"),
    promote.indexOf("export async function resolveEmailContact"),
  );
  assert.match(slice, /storage\.updateContact\(contact\.id/);
  assert.doesNotMatch(slice, /createContact/);
  assert.match(slice, /promotedFromInboxIdentity: true/);
});

test("conversation history remains attached after promotion", () => {
  const persist = read("server/emailChannel/persistInbound.ts");
  const send = read("server/emailChannel/sendService.ts");
  assert.match(persist, /contactId: contact\.id/);
  assert.match(persist, /findEmailConversationByThread/);
  assert.match(send, /contactId/);
  const routes = read("server/routes/contacts.ts");
  assert.match(routes, /\/api\/contacts\/:id\/save-to-contacts/);
  assert.match(routes, /promoteInboxIdentityToCrm\(contact, "email"\)/);
});

test("keyboard and mobile menu access remains on the existing three-dot trigger", () => {
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  const triggerIdx = inbox.indexOf('data-testid="button-contact-actions"');
  const triggerSlice = inbox.slice(triggerIdx - 280, triggerIdx + 420);
  assert.match(triggerSlice, /aria-label="Conversation actions"/);
  assert.match(triggerSlice, /title="Conversation actions"/);
  assert.match(triggerSlice, /MoreVertical className="w-4 h-4" aria-hidden="true"/);
  assert.doesNotMatch(triggerSlice, /hidden md:/);
  assert.doesNotMatch(triggerSlice, /className="[^"]*hidden /);
  assert.match(inbox, /DropdownMenuTrigger asChild/);
  assert.match(inbox, /from "@\/components\/ui\/dropdown-menu"/);
  assert.match(inbox, /data-testid="button-mobile-crm-details"/);
});

test("invalid or cross-tenant promotion fails closed", () => {
  const routes = read("server/routes/contacts.ts");
  const saveStart = routes.indexOf('app.post("/api/contacts/:id/save-to-contacts"');
  const saveEnd = routes.indexOf("app.patch(\"/api/contacts/:id\"", saveStart);
  const save = routes.slice(saveStart, saveEnd);
  assert.match(save, /if \(!req\.user\)/);
  assert.match(save, /status\(401\)/);
  assert.match(save, /contact\.userId !== req\.user\.id/);
  assert.match(save, /status\(404\)\.json\(\{ error: "Not found" \}\)/);
  assert.match(save, /Enter a valid email address/);
  assert.match(save, /status\(409\)/);
  assert.doesNotMatch(save, /app\.get\("\/api\/public/);
  const match = read("server/emailChannel/contactMatch.ts");
  assert.match(match, /eq\(contacts\.userId, workspaceUserId\)/);
});

test("Contact deletion behavior is unchanged for saved Contacts and hidden for inbox-only", () => {
  assert.equal(inboxConversationMenuActions(inboxOnly).includes("delete_contact"), false);
  assert.equal(inboxConversationMenuActions(savedEmail).includes("delete_contact"), true);

  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  assert.match(inbox, /conversationMenuActions\.includes\("delete_contact"\)/);
  assert.match(inbox, /deleteContactMutation/);
  assert.match(inbox, /method: "DELETE"/);
  assert.match(inbox, /invalidateQueriesAfterContactDeletion/);
  assert.match(inbox, /showDeleteConfirm/);
  assert.match(inbox, /button-confirm-delete/);

  const svc = read("server/contactDeleteService.ts");
  assert.match(svc, /export async function deleteContactSafely/);
  assert.match(svc, /rows\[0\]\.userId !== workspaceUserId/);
  assert.match(svc, /deleteContactRecords/);
  assert.match(svc, /Conversations\/messages cascade via FK/);

  const contactsPage = read("client/src/pages/Contacts.tsx");
  assert.match(contactsPage, /Delete Contact/);
  assert.match(contactsPage, /\/api\/contacts\/bulk-delete/);
});

test("Pause Automations is hidden for inbox-only; Activity Timeline stays tenant-scoped", () => {
  assert.equal(inboxConversationMenuActions(inboxOnly).includes("pause_automations"), false);
  assert.equal(inboxConversationMenuActions(inboxOnly).includes("activity_timeline"), true);
  assert.equal(inboxConversationMenuActions(savedEmail).includes("pause_automations"), true);

  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  assert.match(inbox, /conversationMenuActions\.includes\("pause_automations"\)/);
  assert.match(inbox, /conversationMenuActions\.includes\("activity_timeline"\)/);
  assert.doesNotMatch(inbox, /archiveConversation|Delete Conversation|menu-archive/);

  const timeline = read("server/routes/contacts.ts");
  const tl = timeline.slice(timeline.indexOf('app.get("/api/contacts/:id/timeline"'));
  assert.match(tl, /contact\.userId !== req\.user\.id/);
  assert.match(tl, /status\(404\)\.json\(\{ error: "Not found" \}\)/);
  assert.match(tl, /storage\.getActivityEvents\(req\.params\.id/);
});
