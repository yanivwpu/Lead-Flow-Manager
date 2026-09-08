/**
 * Web Chat visitor → identified contact lifecycle.
 * Run: npx tsx --test tests/webchat-contact-lifecycle.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AGENT_PAGE_VISITOR_NAME,
  extractIdentityHints,
  WEBSITE_VISITOR_NAME,
} from "../shared/agent/webchatLeadContext";
import {
  aggregateWebchatContactPreflight,
  classifyCrmContactListTab,
  contactMatchesCrmSearch,
  CRM_LIST_IDENTIFIED,
  CRM_LIST_WEBSITE_VISITORS,
  isAnonymousWebsiteVisitor,
  isIdentifiedFromWebsiteChat,
  looksLikeMessageDerivedWebchatName,
  webchatPublicPhone,
  webchatSafeDisplayName,
} from "../shared/webchatContactIdentity";
import { identityFromFormValues, toInboxFormSubmission } from "../shared/webchatStructuredForm";
import { buildWebchatFormContactPatch } from "../shared/webchatFormContactPatch";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const form = {
  id: "lead_capture",
  title: "Contact details",
  description: "",
  submitLabel: "Submit",
  fields: [
    { id: "full_name", type: "name" as const, label: "Name", required: true },
    { id: "email", type: "email" as const, label: "Email", required: true },
    { id: "phone", type: "phone" as const, label: "Phone", required: true },
    {
      id: "need",
      type: "select" as const,
      label: "Need",
      required: false,
      options: ["Buy"],
    },
    {
      id: "consent",
      type: "consent" as const,
      label: "Consent",
      required: true,
      consentText: "I agree to be contacted about this inquiry.",
    },
  ],
};

const values = {
  full_name: "Ada Lovelace",
  email: "Ada@Example.COM",
  phone: "+1 (555) 010-0100",
  need: "Buy",
  consent: true as const,
};

test("widget open creates no records", () => {
  const webhooks = read("server/routes/webhooks.ts");
  const settings = webhooks.slice(webhooks.indexOf('app.get("/api/webchat/:userId/settings"'));
  const settingsFn = settings.slice(0, settings.indexOf("app.get(\"/api/webchat/:userId/:visitorId/messages\""));
  assert.doesNotMatch(settingsFn, /createContact/);
  assert.doesNotMatch(settingsFn, /processIncomingMessage/);
  const messages = webhooks.slice(webhooks.indexOf('app.get("/api/webchat/:userId/:visitorId/messages"'));
  const messagesFn = messages.slice(0, messages.indexOf("app.get(\"/api/webchat/:userId/:visitorId/media/"));
  assert.doesNotMatch(messagesFn, /createContact/);
  assert.match(messagesFn, /getContactByChannelId/);
});

test("first message uses Website Visitor and never chat text as the name", () => {
  const channel = read("server/channelService.ts");
  assert.match(channel, /resolveWebchatVisitorDisplayName/);
  assert.match(channel, /name: webchatDisplayName/);
  assert.match(channel, /channel === "webchat"/);
  const webhooks = read("server/routes/webhooks.ts");
  assert.match(webhooks, /const contactName = resolveWebchatVisitorDisplayName\(webchatLeadSource\)/);
  assert.doesNotMatch(webhooks, /name \|\| resolveWebchatVisitorDisplayName/);
  assert.equal(looksLikeMessageDerivedWebchatName("Hi"), true);
  assert.equal(looksLikeMessageDerivedWebchatName("Got it"), true);
  assert.equal(looksLikeMessageDerivedWebchatName("photo.jpg"), true);
  assert.equal(extractIdentityHints("Hi").name, "Hi");
  const lead = read("server/webchatLeadService.ts");
  assert.doesNotMatch(lead, /updates\.name/);
  assert.doesNotMatch(lead, /mergeContacts/);
  assert.doesNotMatch(lead, /extractIdentityHints/);
});

test("form submission updates the same contact and stores consent", () => {
  const contact = {
    name: "Hi",
    email: null as string | null,
    phone: "visitor_placeholder",
    customFields: { webchatVisitorId: "visitor_placeholder", webchatIdentity: { status: "anonymous" } },
    sourceDetails: {},
  };
  const submission = toInboxFormSubmission(form, values);
  const patch = buildWebchatFormContactPatch({
    contact,
    form,
    values,
    submission,
    context: { conversationId: "conv-1", widgetPublicId: "wgt_example", formId: form.id },
  });
  assert.equal(patch.name, "Ada Lovelace");
  assert.equal(patch.email, "ada@example.com");
  assert.equal(String(patch.phone).includes("5550100100"), true);
  assert.equal(patch.webchatId, "visitor_placeholder");
  const cf = patch.customFields as Record<string, unknown>;
  assert.equal(cf.webchatVisitorId, "visitor_placeholder");
  assert.equal((cf.webchatIdentity as { status: string }).status, "identified");
  const consent = cf.webchatConsent as {
    text: string;
    accepted: boolean;
    source: string;
    conversationId: string;
  };
  assert.equal(consent.accepted, true);
  assert.equal(consent.text, "I agree to be contacted about this inquiry.");
  assert.equal(consent.source, "webchat");
  assert.equal(consent.conversationId, "conv-1");
  assert.equal((cf.webchatFormExtras as { need: { value: string } }).need.value, "Buy");
  const retry = buildWebchatFormContactPatch({
    contact: { ...contact, ...patch, customFields: cf },
    form,
    values,
    submission,
  });
  assert.equal(retry.name, undefined);
  assert.equal(retry.email, undefined);
  assert.equal(retry.phone, undefined);
  assert.equal((retry.customFields as { webchatVisitorId: string }).webchatVisitorId, "visitor_placeholder");
  assert.equal((retry.customFields as { webchatIdentity: { status: string } }).webchatIdentity.status, "identified");

  const conflict = buildWebchatFormContactPatch({
    contact: { ...contact, ...patch, customFields: cf, name: "Ada Lovelace" },
    form,
    values: { ...values, full_name: "Someone Else" },
    submission: toInboxFormSubmission(form, { ...values, full_name: "Someone Else" }),
  });
  assert.equal(conflict.name, undefined);
  assert.equal((conflict.customFields as { webchatVisitorId: string }).webchatVisitorId, "visitor_placeholder");
});

test("identified webchat contacts leave the visitor list without a second record", () => {
  const anonymous = {
    name: "Hi",
    source: "webchat",
    primaryChannel: "webchat",
    customFields: { webchatVisitorId: "v1", webchatIdentity: { status: "anonymous" } },
  };
  const identified = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    source: "webchat",
    primaryChannel: "webchat",
    customFields: {
      webchatVisitorId: "v1",
      webchatIdentity: { status: "identified" },
      webchatForm: {
        fields: [{ type: "name", value: "Ada Lovelace" }],
      },
    },
  };
  assert.equal(isAnonymousWebsiteVisitor(anonymous), true);
  assert.equal(classifyCrmContactListTab(anonymous), CRM_LIST_WEBSITE_VISITORS);
  assert.equal(webchatSafeDisplayName(anonymous), WEBSITE_VISITOR_NAME);
  assert.equal(webchatPublicPhone({ phone: "visitor_abc" }), null);
  assert.equal(isAnonymousWebsiteVisitor(identified), false);
  assert.equal(classifyCrmContactListTab(identified), CRM_LIST_IDENTIFIED);
  assert.equal(isIdentifiedFromWebsiteChat(identified), true);
  assert.equal(webchatSafeDisplayName(identified), "Ada Lovelace");
  assert.equal(contactMatchesCrmSearch(identified, "ada"), true);
});

test("Contacts tabs use lifecycle status, not merely the Website Visitor name", () => {
  const leftoverName = {
    name: WEBSITE_VISITOR_NAME,
    source: "webchat",
    customFields: {
      webchatVisitorId: "v-id",
      webchatIdentity: { status: "identified" },
      webchatForm: { fields: [{ type: "name", value: "Ada Lovelace" }] },
    },
  };
  const realNameStillAnonymous = {
    name: "Jordan Lee",
    source: "webchat",
    customFields: { webchatVisitorId: "v-anon", webchatIdentity: { status: "anonymous" } },
  };
  assert.equal(classifyCrmContactListTab(leftoverName), CRM_LIST_IDENTIFIED);
  assert.equal(isAnonymousWebsiteVisitor(leftoverName), false);
  assert.equal(classifyCrmContactListTab(realNameStillAnonymous), CRM_LIST_WEBSITE_VISITORS);
  assert.equal(isAnonymousWebsiteVisitor(realNameStillAnonymous), true);
  const page = read("client/src/pages/Contacts.tsx");
  assert.match(page, /classifyCrmContactListTab/);
  assert.doesNotMatch(page, /name === ["']Website Visitor["']/);
});

test("other channels stay on Identified Contacts and are unchanged by webchat naming", () => {
  const whatsapp = { name: "Jordan", source: "whatsapp", primaryChannel: "whatsapp", phone: "5551112222" };
  const instagram = { name: "Sam", source: "instagram", primaryChannel: "instagram" };
  const facebook = { name: "Riley", source: "facebook", primaryChannel: "facebook" };
  const sms = { name: "Quinn", source: "sms", primaryChannel: "sms", phone: "5553334444" };
  const email = { name: "Morgan", source: "email", primaryChannel: "email", email: "m@example.com" };
  const shopify = { name: "Shopify Buyer", source: "shopify", primaryChannel: "whatsapp" };
  for (const row of [whatsapp, instagram, facebook, sms, email, shopify]) {
    assert.equal(classifyCrmContactListTab(row), CRM_LIST_IDENTIFIED);
    assert.equal(isAnonymousWebsiteVisitor(row), false);
    assert.equal(webchatSafeDisplayName(row), row.name);
  }
  assert.equal(webchatSafeDisplayName({ name: AGENT_PAGE_VISITOR_NAME, source: "webchat", customFields: { sourcePage: "agent_page" } }), AGENT_PAGE_VISITOR_NAME);
});

test("duplicate email is flagged and never merged from visitor claims", () => {
  const service = read("server/webchatFormService.ts");
  assert.match(service, /webchatPossibleDuplicates/);
  assert.match(service, /findContactsByEmail/);
  assert.doesNotMatch(service, /mergeContacts/);
  const lead = read("server/webchatLeadService.ts");
  assert.doesNotMatch(lead, /getContactByChannelId\(userId, "calendly"/);
  const formPost = read("server/routes/webhooks.ts");
  assert.match(formPost, /contact\.userId !== access\.owner\.userId/);
  assert.match(formPost, /WEBCHAT_FORM_PUBLIC_SUBMITTED_CONTENT/);
  assert.match(formPost, /webchat_form_\$\{visitorId\}_\$\{form\.id\}/);
});

test("preflight aggregates never include row payloads", () => {
  const rows = [
    { userId: "t1", name: "Hi", source: "webchat", customFields: { webchatVisitorId: "a" } },
    { userId: "t1", name: WEBSITE_VISITOR_NAME, source: "webchat", customFields: { webchatVisitorId: "b" } },
    {
      userId: "t1",
      name: "Hi",
      email: null,
      source: "webchat",
      customFields: {
        webchatVisitorId: "c",
        webchatForm: { fields: [{ type: "name", value: "Pat" }, { type: "email", value: "pat@example.com" }] },
      },
    },
    { userId: "t1", name: "WhatsApp Lead", source: "whatsapp", email: "shared@example.com" },
    { userId: "t1", name: "Web Identified", source: "webchat", email: "shared@example.com", customFields: { webchatIdentity: { status: "identified" } } },
  ];
  const agg = aggregateWebchatContactPreflight(rows);
  assert.equal(agg.message_derived_webchat_names >= 1, true);
  assert.equal(agg.anonymous_website_visitors >= 1, true);
  assert.equal(agg.form_submitted_canonical_stale, 1);
  assert.equal(agg.non_webchat_unchanged, 1);
  assert.equal(agg.possibleDuplicateEmailPairs, 1);
  assert.equal(typeof agg.duplicateWebchatVisitorPairs, "number");
  assert.equal(JSON.stringify(agg).includes("@"), false);
  assert.equal(JSON.stringify(agg).toLowerCase().includes("pat"), false);
});

test("Contacts UI defaults to identified contacts and exposes Website Visitors", () => {
  const page = read("client/src/pages/Contacts.tsx");
  assert.match(page, /CRM_LIST_IDENTIFIED/);
  assert.match(page, /select-filter-contact-type/);
  assert.doesNotMatch(page, /contacts-identity-tabs/);
  assert.doesNotMatch(page, /tab-contacts-\$\{tab\.id\}/);
  assert.doesNotMatch(page, /function StatCard/);
  assert.match(page, /CRM_LIST_WEBSITE_VISITORS/);
  assert.match(page, /CRM_LIST_ALL/);
  assert.match(page, /Identified from Website Chat/);
  assert.match(page, /webchatSafeDisplayName/);
  assert.match(page, /webchatPublicPhone/);
  assert.match(page, /select-filter-channel/);
  assert.match(page, /Web Chat/);
  const script = read("scripts/preflight-webchat-contact-identity.ts");
  assert.match(script, /readOnly: true/);
  assert.match(script, /aggregateWebchatContactPreflight/);
  assert.doesNotMatch(script, /update\(/);
  assert.doesNotMatch(script, /delete\(/);
  const repair = read("scripts/repair-webchat-form-canonical-identity.ts");
  assert.match(repair, /shouldWriteWebchatCanonicalName/);
  assert.match(repair, /identityFromWebchatFormSnapshot/);
  assert.match(repair, /ALLOW_WEBCHAT_IDENTITY_REPAIR/);
  assert.match(repair, /stampIdentifiedWebchatIdentity/);
});
