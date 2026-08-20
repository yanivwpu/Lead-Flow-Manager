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
import {
  isServiceRoleEmailLocalPart,
  looksLikeSystemOrNotificationEmail,
} from "../shared/aiDomainEligibility";
import { getContactDisplayChannel, getContactDisplayChannelLabel } from "../shared/contactChannelDisplay";
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
  // Conversational follow-up without a genuine ask is uncertain inbound —
  // hidden unless an existing visible Contact already matches.
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "yaniv.client@outlook.com",
      inboundText: HUMAN_FOLLOWUP,
      direction: "inbound",
    }),
    "inbox_identity",
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

const SUPPORT_DESK =
  "Ticket #4821: How can we help you today? Reply to this email to continue the conversation with our support team.";
const STATUS_INCIDENT =
  "Incident update: we are investigating degraded performance on the status page.";
const NEWSLETTER_HELLO = "This month's digest. View this email in a browser. Unsubscribe anytime.";
const RECEIPT_ALERT = "Receipt for your order. Your payment was received. Tracking number 1Z999.";
const UNCERTAIN_INBOUND = "Following up on your account.";
const PROSPECT_REPLY = "Hi, I'm interested in your services. Can someone call me about pricing?";

run("A. automated support/service email → hidden email_inbox identity", () => {
  assert.equal(isServiceRoleEmailLocalPart("support@vendor.example"), true);
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "support@vendor.example",
      inboundText: SUPPORT_DESK,
      direction: "inbound",
    }),
    "inbox_identity",
  );
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "team@broker.example",
      inboundText: "The Team here. Need help accessing your account?",
      direction: "inbound",
    }),
    "inbox_identity",
  );
});

run("B. newsletter → hidden", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "hello@updates.news.example",
      inboundText: NEWSLETTER_HELLO,
      direction: "inbound",
    }),
    "inbox_identity",
  );
});

run("C. receipt/alert/status email → hidden", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "receipts@store.example",
      inboundText: RECEIPT_ALERT,
      direction: "inbound",
    }),
    "inbox_identity",
  );
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "support@getstatus.example",
      inboundText: STATUS_INCIDENT,
      direction: "inbound",
    }),
    "inbox_identity",
  );
  assert.equal(
    looksLikeSystemOrNotificationEmail({
      fromEmail: "alerts@status.vendor.example",
      inboundText: STATUS_INCIDENT,
      channel: "email",
    }),
    true,
  );
});

run("D. noreply sender → hidden", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "noreply@vendor.example",
      inboundText: "Your password reset is ready.",
      direction: "inbound",
    }),
    "inbox_identity",
  );
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "no-reply@mail.example",
      inboundText: "See others in your feed.",
      direction: "inbound",
    }),
    "inbox_identity",
  );
});

run("E. support@ sender with system signals → hidden", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "support@vendor.example",
      inboundText: "This is an automated message. Do not reply to this email.",
      direction: "inbound",
    }),
    "inbox_identity",
  );
});

run("F. uncertain passive inbound email → hidden", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "jane@company.example",
      inboundText: UNCERTAIN_INBOUND,
      direction: "inbound",
    }),
    "inbox_identity",
  );
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "ops@company.example",
      inboundText: "",
      direction: "inbound",
    }),
    "inbox_identity",
  );
});

run("G. real human inquiry → visible Contact", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "alex.buyer@gmail.com",
      inboundText: HUMAN_GMAIL,
      direction: "inbound",
    }),
    "crm",
  );
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "ops@acme.com",
      inboundText: HUMAN_COMPANY,
      direction: "inbound",
    }),
    "crm",
  );
});

run("H. reply from a genuine prospect → visible/promoted", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "sam.prospect@outlook.com",
      inboundText: PROSPECT_REPLY,
      direction: "inbound",
    }),
    "crm",
  );
  assert.equal(
    shouldPromoteInboxIdentityToCrm({
      existingSource: EMAIL_INBOX_IDENTITY_SOURCE,
      kind: "crm",
      direction: "inbound",
    }),
    true,
  );
});

run("I. intentional outbound email → promotes hidden identity", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "prospect@client.com",
      inboundText: "Hello",
      direction: "outbound",
    }),
    "crm",
  );
  assert.equal(
    shouldPromoteInboxIdentityToCrm({
      existingSource: EMAIL_INBOX_IDENTITY_SOURCE,
      kind: "crm",
      direction: "outbound",
    }),
    true,
  );
});

run("J. existing visible Contact match still precedes create", () => {
  const src = readFileSync(
    join(import.meta.dirname, "..", "server/emailChannel/contactMatch.ts"),
    "utf8",
  );
  const matchIdx = src.indexOf("const existing = await findContactsByEmail");
  const kindIdx = src.indexOf("const kind = decideNewEmailContactKind");
  const createIdx = src.indexOf("const created = await storage.createContact");
  assert.ok(matchIdx > 0 && kindIdx > matchIdx && createIdx > kindIdx);
});

run("K. /api/contacts never returns email_inbox rows", () => {
  const routes = readFileSync(
    join(import.meta.dirname, "..", "server/routes/contacts.ts"),
    "utf8",
  );
  const getHandler = routes.slice(routes.indexOf('app.get("/api/contacts"'));
  const searchStart = getHandler.indexOf('app.get("/api/contacts/search"');
  const listHandler = searchStart > 0 ? getHandler.slice(0, searchStart) : getHandler;
  assert.ok(listHandler.includes("filterCrmListedContacts"));
  assert.equal(isCrmListedContact({ source: EMAIL_INBOX_IDENTITY_SOURCE }), false);
});

run("L. Contacts search never returns email_inbox rows", () => {
  const routes = readFileSync(
    join(import.meta.dirname, "..", "server/routes/contacts.ts"),
    "utf8",
  );
  const searchHandler = routes.slice(routes.indexOf('app.get("/api/contacts/search"'));
  assert.ok(searchHandler.includes("filterCrmListedContacts"));
  const storageSrc = readFileSync(join(import.meta.dirname, "..", "server/storage.ts"), "utf8");
  const searchFn = storageSrc.slice(storageSrc.indexOf("async searchContacts("));
  assert.ok(searchFn.includes("EMAIL_INBOX_IDENTITY_SOURCE"));
});

run("M. Gmail polling and Pub/Sub push use the same persist + contact policy", () => {
  const trigger = readFileSync(
    join(import.meta.dirname, "..", "server/emailChannel/gmailSyncTrigger.ts"),
    "utf8",
  );
  const sync = readFileSync(
    join(import.meta.dirname, "..", "server/emailChannel/syncService.ts"),
    "utf8",
  );
  const persist = readFileSync(
    join(import.meta.dirname, "..", "server/emailChannel/persistInbound.ts"),
    "utf8",
  );
  assert.ok(trigger.includes("GmailSyncTriggerSource"));
  assert.ok(trigger.includes('"push"'));
  assert.ok(trigger.includes('"poll"'));
  assert.ok(trigger.includes("runIncrementalEmailSync"));
  assert.ok(sync.includes("runEmailPollingCron"));
  assert.ok(sync.includes('source: "poll"'));
  assert.ok(sync.includes("persistNormalizedEmailMessage"));
  assert.ok(persist.includes("resolveEmailContact"));
  const persistCalls = sync.split("persistNormalizedEmailMessage").length - 1;
  assert.ok(persistCalls >= 4, "bootstrap + poll/push incremental share persistNormalizedEmailMessage");
});

run("visible Email contacts display Email, not No channel", () => {
  assert.equal(
    getContactDisplayChannel({
      primaryChannel: "email",
      source: "email",
      email: "alex.buyer@gmail.com",
    }),
    "email",
  );
  assert.equal(getContactDisplayChannelLabel("email"), "Email");
  assert.equal(
    getContactDisplayChannel({
      primaryChannel: "whatsapp",
      whatsappId: "15551234567",
      source: "email",
    }),
    "whatsapp",
  );
});

run("human-looking display name / support local-part is not enough", () => {
  assert.equal(
    decideNewEmailContactKind({
      fromEmail: "support@vendor.example",
      inboundText: "How can we help? Interested in getting started?",
      direction: "inbound",
    }),
    "inbox_identity",
  );
});

console.log("email-contact-creation-policy.test.ts: all assertions passed");
