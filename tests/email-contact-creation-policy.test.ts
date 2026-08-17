/**
 * Email → CRM Contact creation policy.
 * Run: npx tsx tests/email-contact-creation-policy.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decideNewEmailContactKind,
  shouldPromoteInboxIdentityToCrm,
  shouldSuppressEmailContactCreation,
} from "../server/emailChannel/contactMatch";
import { looksLikeSystemOrNotificationEmail } from "../shared/aiDomainEligibility";
import {
  EMAIL_INBOX_IDENTITY_SOURCE,
  filterCrmListedContacts,
  isCrmListedContact,
} from "../shared/contactCrmVisibility";
import { evaluatePresetCampaignEnrollability } from "../shared/campaignEnrollment";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const CREDIT = `
Your credit usage went down this month.
Visit examplebank.com to see available credit.
No action is required.
`;
const LINKEDIN = "Chinwendu just messaged you. View the conversation in your inbox.";
const INSTAGRAM = "See Maya and others in your feed.";
const ZILLOW = "New listing for rent near you. This is a listing alert.";
const NEWSLETTER = "This month's digest. View this email in a browser. Unsubscribe anytime.";
const RECEIPT = "Receipt for your order. Your payment was received.";
const SECURITY = "New sign-in detected on your account.";
const HUMAN_GMAIL = "Hi, I'm interested in your services.";
const HUMAN_COMPANY = "Can someone call me about pricing?";
const HUMAN_FOLLOWUP = "Hi Yaniv, following up on our conversation from last week.";
const HUMAN_CONDO = "I'm looking for a condo in Pompano.";
const HUMAN_DEMO = "Can we schedule a demo?";

run("A. Credit-style notification → inbox identity, not CRM", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "alerts@notification.examplebank.com",
      inboundText: CREDIT,
      direction: "inbound",
    }),
    "inbox_identity",
  );
});

run("B. Platform 'just messaged you' → inbox identity", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "notifications@mail.example-network.com",
      inboundText: LINKEDIN,
      direction: "inbound",
    }),
    "inbox_identity",
  );
});

run("C. Listing alert → inbox identity", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "alerts@updates.example-listings.com",
      inboundText: ZILLOW,
      direction: "inbound",
    }),
    "inbox_identity",
  );
});

run("D. Newsletter → inbox identity", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "hello@updates.example-news.com",
      inboundText: NEWSLETTER,
      direction: "inbound",
    }),
    "inbox_identity",
  );
});

run("E. Receipt → inbox identity", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "receipts@store.example.com",
      inboundText: RECEIPT,
      direction: "inbound",
    }),
    "inbox_identity",
  );
});

run("security alert → inbox identity", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "noreply@accounts.example.com",
      inboundText: SECURITY,
      direction: "inbound",
    }),
    "inbox_identity",
  );
});

run("Instagram-style feed notification → inbox identity", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "no-reply@mail.example-social.com",
      inboundText: INSTAGRAM,
      direction: "inbound",
    }),
    "inbox_identity",
  );
});

run("F. Human Gmail inquiry → CRM Contact", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "alex.buyer@gmail.com",
      inboundText: HUMAN_GMAIL,
      direction: "inbound",
    }),
    "crm",
  );
});

run("G. Human company-domain inquiry → CRM Contact", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "ops@acme.com",
      inboundText: HUMAN_COMPANY,
      direction: "inbound",
    }),
    "crm",
  );
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "jordan@brokerage.com",
      inboundText: HUMAN_CONDO,
      direction: "inbound",
    }),
    "crm",
  );
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "sam@startup.io",
      inboundText: HUMAN_DEMO,
      direction: "inbound",
    }),
    "crm",
  );
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "yaniv.client@outlook.com",
      inboundText: HUMAN_FOLLOWUP,
      direction: "inbound",
    }),
    "crm",
  );
});

run("H. Existing-contact match is independent of system content", () => {
  const src = readFileSync(
    join(import.meta.dirname, "..", "server/emailChannel/contactMatch.ts"),
    "utf8",
  );
  const matchIdx = src.indexOf("const existing = await findContactsByEmail");
  const createIdx = src.indexOf("const created = await storage.createContact");
  assert.ok(matchIdx > 0 && createIdx > matchIdx, "existing match must run before create");
});

run("I. User-initiated outbound → CRM Contact", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "me@workspace.com",
      inboundText: CREDIT,
      direction: "outbound",
    }),
    "crm",
  );
});

run("J. Website form / CTA capture → CRM Contact", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "forms@notifications.example.com",
      inboundText: "New website form submission",
      direction: "inbound",
      isWebsiteForm: true,
    }),
    "crm",
  );
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "noreply@forms.example.com",
      inboundText: NEWSLETTER,
      direction: "inbound",
      isLeadCapture: true,
    }),
    "crm",
  );
});

run("K–M. Chat-channel inbound does not use Email suppression", () => {
  const channel = readFileSync(
    join(import.meta.dirname, "..", "server/channelService.ts"),
    "utf8",
  );
  assert.equal(channel.includes("decideNewEmailContactKind"), false);
  assert.equal(channel.includes("looksLikeSystemOrNotificationEmail"), false);
  assert.ok(channel.includes("storage.createContact"));
  assert.match(channel, /primaryChannel: channel/);
});

run("inbox identity is hidden from CRM Contacts list", () => {
  const hidden = { source: EMAIL_INBOX_IDENTITY_SOURCE, email: "alerts@n.example" };
  const listed = { source: "email", email: "alex@gmail.com" };
  const form = { source: "website_form", email: "visitor@client.com" };
  assert.equal(isCrmListedContact(hidden), false);
  assert.equal(isCrmListedContact(listed), true);
  assert.equal(isCrmListedContact(form), true);
  assert.deepEqual(
    filterCrmListedContacts([hidden, listed, form]).map((c) => c.email),
    ["alex@gmail.com", "visitor@client.com"],
  );
});

run("legacy noreply local-part helper still works", () => {
  assert.equal(shouldSuppressEmailContactCreation("noreply@vendor.com"), "noreply_or_system");
  assert.equal(shouldSuppressEmailContactCreation("ada@example.com"), null);
});

run("system classifier agrees with contact policy fixtures", () => {
  assert.equal(
    looksLikeSystemOrNotificationEmail({
      fromEmail: "alerts@notification.examplebank.com",
      inboundText: CREDIT,
      channel: "email",
    }),
    true,
  );
  assert.equal(
    looksLikeSystemOrNotificationEmail({
      fromEmail: "alex.buyer@gmail.com",
      inboundText: HUMAN_GMAIL,
      channel: "email",
    }),
    false,
  );
});

run("persistInbound passes current message into contact resolution", () => {
  const persist = readFileSync(
    join(import.meta.dirname, "..", "server/emailChannel/persistInbound.ts"),
    "utf8",
  );
  assert.ok(persist.includes("inboundText"));
  assert.ok(persist.includes("isWebsiteForm"));
  assert.ok(persist.includes("decideNewEmailContactKind") === false);
});

run("Contacts API filters inbox identities", () => {
  const routes = readFileSync(
    join(import.meta.dirname, "..", "server/routes/contacts.ts"),
    "utf8",
  );
  assert.ok(routes.includes("filterCrmListedContacts"));
});

run("1. passive Email creates email_inbox identity, not a CRM Contact", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "alerts@notification.examplebank.com",
      inboundText: CREDIT,
      direction: "inbound",
    }),
    "inbox_identity",
  );
  const match = readFileSync(
    join(import.meta.dirname, "..", "server/emailChannel/contactMatch.ts"),
    "utf8",
  );
  assert.ok(match.includes("EMAIL_INBOX_IDENTITY_SOURCE"));
  assert.ok(match.includes("inboxIdentity: true"));
  assert.ok(match.includes('? "email"'));
  assert.ok(match.includes(": EMAIL_INBOX_IDENTITY_SOURCE"));
});

run("2. visible Contact count does not increase for inbox identities", () => {
  const listed = [
    { source: "email", email: "a@x.com" },
    { source: "whatsapp", email: null },
  ];
  const afterPassive = [
    ...listed,
    { source: EMAIL_INBOX_IDENTITY_SOURCE, email: "alerts@n.example" },
  ];
  assert.equal(filterCrmListedContacts(listed).length, 2);
  assert.equal(filterCrmListedContacts(afterPassive).length, 2);
  const storageSrc = readFileSync(join(import.meta.dirname, "..", "server/storage.ts"), "utf8");
  const getContactsFn = storageSrc.slice(storageSrc.indexOf("async getContacts("));
  const searchFn = storageSrc.slice(storageSrc.indexOf("async searchContacts("));
  assert.ok(getContactsFn.includes("includeInboxIdentities"));
  assert.ok(getContactsFn.includes("EMAIL_INBOX_IDENTITY_SOURCE"));
  assert.ok(searchFn.includes("EMAIL_INBOX_IDENTITY_SOURCE"));
  assert.equal(storageSrc.includes("estimate-email-junk"), false);
});

run("3. Contact export excludes inbox identities", () => {
  const contactsPage = readFileSync(
    join(import.meta.dirname, "..", "client/src/pages/Contacts.tsx"),
    "utf8",
  );
  const exportFn = contactsPage.slice(contactsPage.indexOf("function handleExport"));
  assert.ok(exportFn.includes("filtered.map"));
  assert.ok(contactsPage.includes("/api/contacts?limit=5000"));
  const routes = readFileSync(
    join(import.meta.dirname, "..", "server/routes/contacts.ts"),
    "utf8",
  );
  assert.ok(routes.includes("filterCrmListedContacts"));
});

run("4. campaign / contact selectors exclude inbox identities", () => {
  const r = evaluatePresetCampaignEnrollability({
    contact: {
      source: EMAIL_INBOX_IDENTITY_SOURCE,
      email: "alerts@n.example",
      whatsappId: "15551234567",
    },
    campaign: { channel: "whatsapp", status: "active", messages: [{ content: "hi" }] },
    conversationChannel: "whatsapp",
    channelConnected: true,
  });
  assert.equal(r.eligible, false);
  assert.equal(r.code, "inbox_identity");
  const enroll = readFileSync(
    join(import.meta.dirname, "..", "server/routes/campaignEnrollments.ts"),
    "utf8",
  );
  assert.ok(enroll.includes("evaluatePresetCampaignEnrollability"));
  const exec = readFileSync(
    join(import.meta.dirname, "..", "server/campaignExecution.ts"),
    "utf8",
  );
  assert.ok(exec.includes("isCrmListedContact"));
});

run("5. later human inquiry promotes the same row, no duplicate", () => {
  assert.equal(
    shouldPromoteInboxIdentityToCrm({
      existingSource: EMAIL_INBOX_IDENTITY_SOURCE,
      kind: "crm",
      direction: "inbound",
    }),
    true,
  );
  assert.equal(
    shouldPromoteInboxIdentityToCrm({
      existingSource: EMAIL_INBOX_IDENTITY_SOURCE,
      kind: "inbox_identity",
      direction: "inbound",
    }),
    false,
  );
  assert.equal(
    shouldPromoteInboxIdentityToCrm({
      existingSource: "email",
      kind: "crm",
      direction: "inbound",
    }),
    false,
  );
  const match = readFileSync(
    join(import.meta.dirname, "..", "server/emailChannel/contactMatch.ts"),
    "utf8",
  );
  const promoteStart = match.indexOf("export async function promoteInboxIdentityToCrm");
  const resolveStart = match.indexOf("export async function resolveEmailContact");
  const promoteFn = match.slice(promoteStart, resolveStart);
  const createIdx = match.indexOf("const created = await storage.createContact");
  const promoteIdx = match.indexOf("contact = await promoteInboxIdentityToCrm");
  assert.ok(promoteIdx > 0 && createIdx > promoteIdx, "promote existing row before create");
  assert.ok(promoteFn.includes("updateContact"));
  assert.equal(promoteFn.includes("createContact"), false);
  assert.ok(promoteFn.includes("promotedFromInboxIdentity: true"));
});

run("6. later user outbound promotes the same row, no duplicate", () => {
  assert.equal(
    shouldPromoteInboxIdentityToCrm({
      existingSource: EMAIL_INBOX_IDENTITY_SOURCE,
      kind: "crm",
      direction: "outbound",
    }),
    true,
  );
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "me@workspace.com",
      inboundText: CREDIT,
      direction: "outbound",
    }),
    "crm",
  );
  const routes = readFileSync(
    join(import.meta.dirname, "..", "server/routes/contacts.ts"),
    "utf8",
  );
  assert.ok(routes.includes("findContactsByEmail"));
  assert.ok(routes.includes("promoteInboxIdentityToCrm"));
  const index = readFileSync(join(import.meta.dirname, "..", "server/index.ts"), "utf8");
  assert.equal(index.includes("estimate-email-junk-contacts"), false);
  assert.equal(index.includes("EMAIL_INBOX_IDENTITY_SOURCE"), false);
});

console.log("email-contact-creation-policy.test.ts: all assertions passed");
