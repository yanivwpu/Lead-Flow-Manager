/**
 * Contacts page filter IA + Gmail inbox-only lifecycle.
 * Run: npx tsx --test tests/contacts-gmail-lifecycle.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  decideNewEmailContactKind,
  pickPreferredEmailContact,
  shouldPromoteInboxIdentityToCrm,
} from "../server/emailChannel/contactMatch";
import {
  CONTACT_LIFECYCLE_INBOX_ONLY,
  CONTACT_LIFECYCLE_SAVED,
  EMAIL_INBOX_IDENTITY_SOURCE,
  filterCrmListedContacts,
  inboxOnlySourceDetails,
  isCrmListedContact,
  savedContactSourceDetails,
} from "../shared/contactCrmVisibility";
import { aggregateEmailContactLifecyclePreflight } from "../shared/emailContactLifecyclePreflight";
import { classifyCrmContactListTab, CRM_LIST_IDENTIFIED } from "../shared/webchatContactIdentity";

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("unknown inbound Gmail stays Inbox-only even with human-looking text", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "newsletter@updates.example",
      inboundText: "Hi, I'm interested in your services. Unsubscribe anytime.",
      direction: "inbound",
    }),
    "inbox_identity",
  );
  assert.equal(isCrmListedContact({ source: EMAIL_INBOX_IDENTITY_SOURCE, sourceDetails: inboxOnlySourceDetails() }), false);
});

test("Gmail poll and Pub/Sub share persist and skip duplicate provider message ids", () => {
  const persist = read("server/emailChannel/persistInbound.ts");
  const trigger = read("server/emailChannel/gmailSyncTrigger.ts");
  assert.match(persist, /getMessageByUserExternalId/);
  assert.match(persist, /created: false/);
  assert.match(trigger, /"push"/);
  assert.match(trigger, /"poll"/);
  assert.match(trigger, /runIncrementalEmailSync/);
});

test("same tenant reuses preferred email participant; other tenant stays isolated", () => {
  const match = read("server/emailChannel/contactMatch.ts");
  assert.match(match, /eq\(contacts\.userId, workspaceUserId\)/);
  assert.match(match, /pickPreferredEmailContact/);
  const saved = { id: "saved", source: "email", sourceDetails: savedContactSourceDetails() };
  const inbox = { id: "inbox", source: EMAIL_INBOX_IDENTITY_SOURCE, sourceDetails: inboxOnlySourceDetails() };
  assert.equal(pickPreferredEmailContact([inbox, saved])?.id, "saved");
  assert.equal(pickPreferredEmailContact([inbox])?.id, "inbox");
});

test("display-name similarity is not a match key", () => {
  const match = read("server/emailChannel/contactMatch.ts");
  assert.match(match, /lower\(trim\(\$\{contacts\.email\}\)\)/);
  assert.doesNotMatch(match.slice(match.indexOf("export async function findContactsByEmail")), /contacts\.name/);
});

test("Save to Contacts promotes once and is idempotent", () => {
  const routes = read("server/routes/contacts.ts");
  assert.match(routes, /\/api\/contacts\/:id\/save-to-contacts/);
  assert.match(routes, /promoteInboxIdentityToCrm/);
  assert.match(routes, /isCrmListedContact\(contact\)/);
  const promote = read("server/emailChannel/contactMatch.ts");
  assert.match(promote, /promotedFromInboxIdentity: true/);
  assert.equal(promote.includes("createContact") && promote.indexOf("export async function promoteInboxIdentityToCrm") < promote.indexOf("const created = await storage.createContact"), true);
  const saved = savedContactSourceDetails({ inboxIdentity: true }, { promotedFromInboxIdentity: true });
  assert.equal(saved.contactLifecycle, CONTACT_LIFECYCLE_SAVED);
  assert.equal(saved.inboxIdentity, false);
  assert.equal(isCrmListedContact({ source: "email", sourceDetails: saved }), true);
});

test("manual, import, and website-form contacts remain CRM-listed", () => {
  assert.equal(isCrmListedContact({ source: "manual" }), true);
  assert.equal(isCrmListedContact({ source: "import" }), true);
  assert.equal(isCrmListedContact({ source: "website_form", sourceDetails: savedContactSourceDetails({ leadSource: "Website Form" }) }), true);
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "forms@site.example",
      inboundText: "New website form submission",
      direction: "inbound",
      isWebsiteForm: true,
    }),
    "crm",
  );
  assert.equal(
    shouldPromoteInboxIdentityToCrm({
      existingSource: EMAIL_INBOX_IDENTITY_SOURCE,
      kind: "inbox_identity",
      direction: "inbound",
      isWebsiteForm: true,
    }),
    true,
  );
});

test("Website Visitors classification stays lifecycle-based", () => {
  const visitor = {
    source: "webchat",
    customFields: { webchatVisitorId: "abc" },
  };
  const identified = {
    source: "webchat",
    customFields: { webchatIdentity: { status: "identified" }, webchatForm: { fields: [{ type: "email", value: "a@b.com" }] } },
  };
  assert.equal(classifyCrmContactListTab(visitor), "website_visitors");
  assert.equal(classifyCrmContactListTab(identified), CRM_LIST_IDENTIFIED);
});

test("Contacts page uses a compact Contact type filter and keeps existing filters", () => {
  const page = read("client/src/pages/Contacts.tsx");
  assert.match(page, /useState<CrmContactListTab>\(CRM_LIST_IDENTIFIED\)/);
  assert.match(page, /select-filter-contact-type/);
  assert.match(page, /select-filter-tag/);
  assert.match(page, /select-filter-stage/);
  assert.match(page, /select-filter-channel/);
  assert.match(page, /button-export-contacts/);
  assert.match(page, /button-add-contact/);
  assert.match(page, /contacts-filter-row/);
  assert.match(page, /contacts-result-count/);
  assert.match(page, /flex flex-wrap items-center gap-2/);
  assert.doesNotMatch(page, /contacts-identity-tabs/);
  assert.doesNotMatch(page, /bg-gray-900 text-white border-gray-900/);
  assert.doesNotMatch(page, /function StatCard/);
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  assert.match(inbox, /Save to Contacts/);
  assert.match(inbox, /save-to-contacts/);
  assert.match(inbox, /input-save-to-contacts-name/);
});

test("replies and attachments still persist against the same contact id after promotion", () => {
  const persist = read("server/emailChannel/persistInbound.ts");
  const send = read("server/emailChannel/sendService.ts");
  assert.match(persist, /contactId: contact\.id/);
  assert.match(persist, /findEmailConversationByThread/);
  assert.match(send, /contactId/);
});

test("preflight is read-only, count-only, and contains no PII", () => {
  const script = read("scripts/preflight-email-contact-lifecycle.ts");
  assert.match(script, /readOnly: true/);
  assert.match(script, /mutated: false/);
  assert.doesNotMatch(script, /\.update\(/);
  assert.doesNotMatch(script, /\.delete\(/);
  assert.doesNotMatch(script, /\.insert\(/);
  const agg = aggregateEmailContactLifecyclePreflight([
    { userId: "t1", source: "whatsapp", email: null, tag: "New", pipelineStage: "Lead" },
    {
      userId: "t1",
      source: EMAIL_INBOX_IDENTITY_SOURCE,
      email: "one@example.com",
      tag: "New",
      pipelineStage: "Lead",
      sourceDetails: inboxOnlySourceDetails(),
      hasConversation: true,
    },
    {
      userId: "t1",
      source: "email",
      email: "two@example.com",
      tag: "New",
      pipelineStage: "Lead",
      sourceDetails: savedContactSourceDetails(),
    },
    {
      userId: "t1",
      source: "email",
      email: "two@example.com",
      tag: "Hot",
      pipelineStage: "Qualified",
      notes: "called",
      sourceDetails: savedContactSourceDetails(),
      hasCampaignEnrollment: true,
    },
    {
      userId: "t2",
      source: "email",
      email: "two@example.com",
      tag: "New",
      pipelineStage: "Lead",
      sourceDetails: savedContactSourceDetails(),
    },
  ]);
  assert.equal(agg.totalContacts, 5);
  assert.equal(agg.emailSourcedContacts, 4);
  assert.equal(agg.inboxOnlyIdentities, 1);
  assert.equal(agg.intraTenantDuplicateEmailGroups, 1);
  assert.equal(agg.crossTenantDuplicateAddresses, 1);
  assert.equal(typeof agg.autoCreatedConnectedAccountNameCandidates, "number");
  const json = JSON.stringify(agg);
  assert.equal(json.includes("@"), false);
  assert.equal(json.toLowerCase().includes("example.com"), false);
});

test("public Website Chat APIs do not look up email inbox participants", () => {
  const webhooks = read("server/routes/webhooks.ts");
  const publicSettings = webhooks.slice(webhooks.indexOf('app.get("/api/webchat/:userId/settings"'));
  assert.doesNotMatch(publicSettings.slice(0, 4000), /EMAIL_INBOX_IDENTITY_SOURCE|email_inbox|findContactsByEmail/);
  const channel = read("server/channelService.ts");
  assert.match(channel, /source: channel === "email" \? EMAIL_INBOX_IDENTITY_SOURCE : channel/);
  assert.match(channel, /inboxOnlySourceDetails\(\)/);
});

test("filterCrmListedContacts hides inbox_only lifecycle", () => {
  const listed = filterCrmListedContacts([
    { source: "manual", email: "a@x.com" },
    { source: EMAIL_INBOX_IDENTITY_SOURCE, email: "b@x.com", sourceDetails: inboxOnlySourceDetails() },
    { source: "email", email: "c@x.com", sourceDetails: { contactLifecycle: CONTACT_LIFECYCLE_INBOX_ONLY, inboxIdentity: true } },
  ]);
  assert.deepEqual(listed.map((c) => c.email), ["a@x.com"]);
});
