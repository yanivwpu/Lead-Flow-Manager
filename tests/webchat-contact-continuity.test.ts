/**
 * Web Chat continuity after form identification.
 * Visitor UUID is the identity key; canonical phone is never the lookup key.
 * Run: npx tsx --test tests/webchat-contact-continuity.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createWebchatVisitorId, isPublicWebchatVisitorId } from "../shared/webchatVisitorId";
import { buildWebchatLeadCustomFields, WEBSITE_VISITOR_NAME } from "../shared/agent/webchatLeadContext";
import { identityFromFormValues, toInboxFormSubmission } from "../shared/webchatStructuredForm";
import { buildWebchatFormContactPatch } from "../shared/webchatFormContactPatch";
import {
  classifyCrmContactListTab,
  CRM_LIST_IDENTIFIED,
  CRM_LIST_WEBSITE_VISITORS,
  isAnonymousWebsiteVisitor,
} from "../shared/webchatContactIdentity";
import {
  contactMatchesWebchatVisitor,
  mergeWebchatVisitorSourceDetails,
  resolveWebchatContactFromRows,
  type WebchatLookupContact,
} from "../shared/webchatContactLookup";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const VISITOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

const form = {
  id: "lead_capture",
  title: "Contact details",
  description: "",
  submitLabel: "Submit",
  fields: [
    { id: "full_name", type: "name" as const, label: "Name", required: true },
    { id: "email", type: "email" as const, label: "Email", required: true },
    { id: "phone", type: "phone" as const, label: "Phone", required: true },
    { id: "consent", type: "consent" as const, label: "Consent", required: true, consentText: "I agree." },
  ],
};

const values = {
  full_name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+1 (555) 010-0100",
  consent: true as const,
};

type StoreContact = WebchatLookupContact & {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  webchatId: string | null;
  customFields: Record<string, unknown>;
  sourceDetails: Record<string, unknown>;
};

type StoreConv = { id: string; contactId: string; userId: string; channel: string; status: string };

type Store = { contacts: StoreContact[]; conversations: StoreConv[] };

function inbound(store: Store, userId: string, visitorId: string): { contact: StoreContact; conv: StoreConv } {
  let contact = resolveWebchatContactFromRows(store.contacts, userId, visitorId) as StoreContact | undefined;
  if (!contact) {
    contact = {
      id: `c-${store.contacts.length + 1}`,
      userId,
      name: WEBSITE_VISITOR_NAME,
      email: null,
      phone: null,
      webchatId: visitorId,
      source: "webchat",
      primaryChannel: "webchat",
      customFields: buildWebchatLeadCustomFields(undefined, visitorId),
      sourceDetails: mergeWebchatVisitorSourceDetails({}, visitorId, { webchatIdentityStatus: "anonymous" }),
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, store.contacts.length)).toISOString(),
    };
    store.contacts.push(contact);
  }
  let conv = store.conversations.find(
    (row) => row.userId === userId && row.contactId === contact!.id && row.channel === "webchat" && row.status === "open",
  );
  if (!conv) {
    conv = {
      id: `v-${store.conversations.length + 1}`,
      contactId: contact.id,
      userId,
      channel: "webchat",
      status: "open",
    };
    store.conversations.push(conv);
  }
  return { contact, conv };
}

function submitForm(contact: StoreContact, visitorId: string, nextValues = values) {
  const submission = toInboxFormSubmission(form, nextValues);
  const patch = buildWebchatFormContactPatch({
    contact,
    form,
    values: nextValues,
    submission,
    context: { visitorId, conversationId: "v-1", formId: form.id },
  });
  Object.assign(contact, {
    ...(patch.name ? { name: patch.name } : {}),
    ...(patch.email ? { email: patch.email } : {}),
    ...(patch.phone ? { phone: patch.phone } : {}),
    ...(patch.webchatId ? { webchatId: patch.webchatId } : {}),
    customFields: patch.customFields,
    sourceDetails: patch.sourceDetails,
  });
  return patch;
}

test("public visitor ids are UUID v4 and first inbound creates one anonymous contact", () => {
  const generated = createWebchatVisitorId();
  assert.equal(isPublicWebchatVisitorId(generated), true);
  assert.equal(isPublicWebchatVisitorId(VISITOR), true);
  const store: Store = { contacts: [], conversations: [] };
  const first = inbound(store, TENANT_A, VISITOR);
  assert.equal(store.contacts.length, 1);
  assert.equal(store.conversations.length, 1);
  assert.equal(first.contact.name, WEBSITE_VISITOR_NAME);
  assert.equal(first.contact.phone, null);
  assert.equal(first.contact.webchatId, VISITOR);
  assert.equal(isAnonymousWebsiteVisitor(first.contact), true);
  assert.equal(classifyCrmContactListTab(first.contact), CRM_LIST_WEBSITE_VISITORS);
});

test("form identification keeps one contact; later text, refresh, and image reuse it", () => {
  const store: Store = { contacts: [], conversations: [] };
  const first = inbound(store, TENANT_A, VISITOR);
  const originalContactId = first.contact.id;
  const originalConvId = first.conv.id;

  submitForm(first.contact, VISITOR);
  assert.equal(first.contact.id, originalContactId);
  assert.equal(isAnonymousWebsiteVisitor(first.contact), false);
  assert.equal(classifyCrmContactListTab(first.contact), CRM_LIST_IDENTIFIED);
  assert.equal(first.contact.phone === VISITOR, false);
  assert.equal(String(first.contact.phone).includes("5550100100"), true);
  assert.equal(first.contact.webchatId, VISITOR);
  assert.equal((first.contact.customFields as { webchatVisitorId: string }).webchatVisitorId, VISITOR);
  assert.equal((first.contact.sourceDetails as { webchatVisitorId: string }).webchatVisitorId, VISITOR);

  const sameSession = inbound(store, TENANT_A, VISITOR);
  assert.equal(sameSession.contact.id, originalContactId);
  assert.equal(sameSession.conv.id, originalConvId);

  const refreshed = inbound(store, TENANT_A, VISITOR);
  assert.equal(refreshed.contact.id, originalContactId);
  assert.equal(refreshed.conv.id, originalConvId);

  const image = inbound(store, TENANT_A, VISITOR);
  assert.equal(image.contact.id, originalContactId);
  assert.equal(image.conv.id, originalConvId);

  assert.equal(store.contacts.filter((row) => row.userId === TENANT_A).length, 1);
  assert.equal(store.conversations.filter((row) => row.userId === TENANT_A && row.status === "open").length, 1);
  assert.equal(contactMatchesWebchatVisitor(first.contact, TENANT_A, VISITOR), true);
  assert.equal(first.contact.phone === VISITOR, false);
});

test("form retry is idempotent and a second different form does not overwrite canonical fields", () => {
  const store: Store = { contacts: [], conversations: [] };
  const first = inbound(store, TENANT_A, VISITOR);
  submitForm(first.contact, VISITOR);
  const phoneAfterFirst = first.contact.phone;
  const retry = submitForm(first.contact, VISITOR);
  assert.equal(retry.name, undefined);
  assert.equal(retry.email, undefined);
  assert.equal(retry.phone, undefined);
  assert.equal(first.contact.phone, phoneAfterFirst);
  assert.equal(first.contact.name, "Ada Lovelace");
  const conflict = submitForm(first.contact, VISITOR, { ...values, full_name: "Someone Else" });
  assert.equal(conflict.name, undefined);
  assert.equal(first.contact.name, "Ada Lovelace");
  assert.equal(store.contacts.length, 1);
});

test("same visitor UUID in another tenant is isolated and never matched by email or phone", () => {
  const store: Store = { contacts: [], conversations: [] };
  const a = inbound(store, TENANT_A, VISITOR);
  submitForm(a.contact, VISITOR);
  store.contacts.push({
    id: "whatsapp-other",
    userId: TENANT_A,
    name: "Ada WhatsApp",
    email: "ada@example.com",
    phone: "5550100100",
    webchatId: null,
    source: "whatsapp",
    primaryChannel: "whatsapp",
    customFields: {},
    sourceDetails: {},
    createdAt: "2020-01-01T00:00:00.000Z",
  });
  const stillA = inbound(store, TENANT_A, VISITOR);
  assert.equal(stillA.contact.id, a.contact.id);
  assert.equal(contactMatchesWebchatVisitor(store.contacts[1], TENANT_A, VISITOR), false);

  const b = inbound(store, TENANT_B, VISITOR);
  assert.notEqual(b.contact.id, a.contact.id);
  assert.equal(b.contact.userId, TENANT_B);
  assert.equal(store.contacts.filter((row) => row.userId === TENANT_A && row.source === "webchat").length, 1);
  assert.equal(store.contacts.filter((row) => row.userId === TENANT_B).length, 1);
  assert.equal(contactMatchesWebchatVisitor(a.contact, TENANT_B, VISITOR), false);
});

test("lookup never depends on contacts.phone still holding the visitor UUID", () => {
  const identified: StoreContact = {
    id: "identified-1",
    userId: TENANT_A,
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "5550100100",
    webchatId: VISITOR,
    source: "webchat",
    primaryChannel: "webchat",
    customFields: { webchatVisitorId: VISITOR, webchatIdentity: { status: "identified" } },
    sourceDetails: { webchatVisitorId: VISITOR },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  assert.equal(resolveWebchatContactFromRows([identified], TENANT_A, VISITOR)?.id, "identified-1");
  const withoutColumn = { ...identified, webchatId: null };
  assert.equal(resolveWebchatContactFromRows([withoutColumn], TENANT_A, VISITOR)?.id, "identified-1");
  const jsonOnly = { ...identified, webchatId: null, sourceDetails: {} };
  assert.equal(resolveWebchatContactFromRows([jsonOnly], TENANT_A, VISITOR)?.id, "identified-1");
  const phoneWouldCollide: StoreContact = {
    ...identified,
    id: "wrong-phone-row",
    webchatId: null,
    customFields: {},
    sourceDetails: {},
    phone: VISITOR,
    source: "whatsapp",
    primaryChannel: "whatsapp",
  };
  assert.equal(resolveWebchatContactFromRows([identified, phoneWouldCollide], TENANT_A, VISITOR)?.id, "identified-1");
  assert.equal(contactMatchesWebchatVisitor({ ...identified, phone: "5550100100", webchatId: null, customFields: {}, sourceDetails: {} }, TENANT_A, VISITOR), false);
});

test("shared storage resolver, indexes, and public APIs never expose duplicate candidates", () => {
  const storage = read("server/storage.ts");
  const resolver = storage.slice(storage.indexOf("async getWebchatContactByVisitorId"));
  assert.match(resolver, /eq\(contacts\.webchatId, visitorId\)/);
  assert.match(resolver, /customFields}->>'webchatVisitorId' = \$\{visitorId\}/);
  assert.match(resolver, /sourceDetails}->>'webchatVisitorId' = \$\{visitorId\}/);
  assert.match(resolver, /isWebchatVisitorId\(visitorId\)/);
  assert.match(resolver, /eq\(contacts\.phone, visitorId\)/);
  assert.doesNotMatch(resolver.slice(0, resolver.indexOf("isWebchatVisitorId")), /eq\(contacts\.phone/);
  assert.match(storage, /case 'webchat':\s*return this\.getWebchatContactByVisitorId\(userId, channelId\)/);

  const channel = read("server/channelService.ts");
  assert.match(channel, /case 'webchat': return 'webchatId'/);
  assert.match(channel, /isWebchatVisitorIdentityViolation/);
  assert.match(channel, /if \(!contact\.webchatId\)/);

  const webhooks = read("server/routes/webhooks.ts");
  assert.match(webhooks, /getContactByChannelId\(userId, "webchat", visitorId\)/);
  assert.match(webhooks, /getContactByChannelId\(access\.owner\.userId, "webchat", visitorId\)/);
  const formPost = webhooks.slice(webhooks.indexOf('app.post("/api/webchat/:userId/:visitorId/forms"'), webhooks.indexOf("app.post(\"/api/webhook/inbox/twilio\""));
  assert.match(formPost, /visitorId,/);
  assert.match(formPost, /sendWebchatPublicJson\(res, 200, \{ success: true \}\)/);
  assert.doesNotMatch(formPost, /matchedContactIds|webchatPossibleDuplicates|duplicateCandidates/);

  const migration = read("migrations/0091_contacts_webchat_id.sql");
  assert.match(migration, /contacts_user_id_webchat_id_uidx/);
  assert.match(migration, /ON contacts \(user_id, webchat_id\)/);
  assert.match(migration, /contacts_user_id_webchat_id_idx/);
  assert.match(migration, /contacts_user_id_webchat_visitor_jsonb_idx/);
  assert.match(migration, /contacts_user_id_webchat_visitor_source_idx/);
  assert.match(read("server/startupSchemaPatches.ts"), /0091_contacts_webchat_id/);
  assert.match(read("server/startupSchemaPatches.ts"), /0091b_contacts_webchat_id_unique/);
  assert.match(read("shared/schema.ts"), /webchatId: text\("webchat_id"\)/);

  const identity = identityFromFormValues(form, values);
  assert.equal(identity.phone === VISITOR, false);
});
