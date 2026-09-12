/**
 * Anonymous Website Chat visitor → CRM promotion (two of three).
 * Run: npx tsx tests/webchat-identity-promotion.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  acceptExtractedIdentity,
  collectValidatedIdentity,
  identityFieldCount,
  isInboxOnlyWebchatContact,
  isValidIdentityEmail,
  isValidIdentityName,
  isValidIdentityPhone,
  meetsWebchatPromotionThreshold,
  resolveIdentityContactConflict,
  shouldPromoteWebchatVisitor,
} from "../shared/webchatIdentityPromotion";
import { extractIdentityHints } from "../shared/agent/webchatLeadContext";
import { isCrmListedContact, inboxOnlySourceDetails, savedContactSourceDetails } from "../shared/contactCrmVisibility";
import { buildWebchatFormContactPatch } from "../shared/webchatFormContactPatch";
import { identityFromFormValues, toInboxFormSubmission } from "../shared/webchatStructuredForm";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

{
  assert.equal(isValidIdentityName("Hi"), null);
  assert.equal(isValidIdentityName("Features & pricing"), null);
  assert.equal(isValidIdentityName("Book a demo"), null);
  assert.equal(isValidIdentityName("Ada Lovelace"), "Ada Lovelace");
  assert.equal(isValidIdentityEmail("not-an-email"), null);
  assert.equal(isValidIdentityEmail("ada@example.com"), "ada@example.com");
  assert.equal(isValidIdentityPhone("123"), null);
  assert.ok(isValidIdentityPhone("+1 (555) 010-0100"));
}

{
  assert.equal(meetsWebchatPromotionThreshold({ name: "Ada Lovelace" }), false);
  assert.equal(meetsWebchatPromotionThreshold({ email: "ada@example.com" }), false);
  assert.equal(meetsWebchatPromotionThreshold({ name: "Ada Lovelace", email: "ada@example.com" }), true);
  assert.equal(meetsWebchatPromotionThreshold({ name: "Ada Lovelace", phone: "+15550100100" }), true);
  assert.equal(meetsWebchatPromotionThreshold({ email: "ada@example.com", phone: "+15550100100" }), true);
  assert.equal(identityFieldCount({ name: "Ada", email: "a@b.com", phone: "+15550100100" }), 3);
}

{
  const hi = acceptExtractedIdentity(extractIdentityHints("Hi"));
  assert.deepEqual(hi, {});
  const extracted = acceptExtractedIdentity(
    extractIdentityHints("I'm Ada Lovelace — ada@example.com or +1 555 010 0100"),
  );
  assert.equal(extracted.name, "Ada Lovelace");
  assert.equal(extracted.email, "ada@example.com");
}

{
  assert.equal(
    shouldPromoteWebchatVisitor({
      identity: { name: "Ada Lovelace", email: "ada@example.com" },
      alreadyListed: false,
      conflict: null,
    }),
    true,
  );
  const conflict = resolveIdentityContactConflict({
    visitorContactId: "v1",
    emailMatches: [{ id: "a" }],
    phoneMatches: [{ id: "b" }],
  });
  assert.equal(conflict?.reason, "email_phone_mismatch");
  assert.equal(
    shouldPromoteWebchatVisitor({
      identity: { email: "ada@example.com", phone: "+15550100100" },
      alreadyListed: false,
      conflict,
    }),
    false,
  );
}

{
  const hidden = { source: "webchat", sourceDetails: inboxOnlySourceDetails({ webchatVisitorId: "v1" }) };
  assert.equal(isCrmListedContact(hidden), false);
  assert.equal(isInboxOnlyWebchatContact(hidden), true);
  const listed = { source: "webchat", sourceDetails: savedContactSourceDetails(hidden.sourceDetails) };
  assert.equal(isCrmListedContact(listed), true);
}

{
  const form = {
    id: "lead_capture",
    title: "Contact",
    description: "",
    submitLabel: "Submit",
    fields: [
      { id: "full_name", type: "name" as const, label: "Name", required: true },
      { id: "email", type: "email" as const, label: "Email", required: false },
    ],
  };
  const nameOnly = buildWebchatFormContactPatch({
    contact: { name: "Website Visitor", customFields: { webchatVisitorId: "v1" }, sourceDetails: {} },
    form,
    values: { full_name: "Ada Lovelace" },
    submission: toInboxFormSubmission(form, { full_name: "Ada Lovelace" }),
  });
  assert.equal(nameOnly.name, "Ada Lovelace");
  assert.equal((nameOnly.sourceDetails as { contactLifecycle?: string }).contactLifecycle, "inbox_only");
  const both = buildWebchatFormContactPatch({
    contact: { name: "Website Visitor", customFields: { webchatVisitorId: "v1" }, sourceDetails: {} },
    form,
    values: { full_name: "Ada Lovelace", email: "ada@example.com" },
    submission: toInboxFormSubmission(form, { full_name: "Ada Lovelace", email: "ada@example.com" }),
  });
  assert.equal((both.sourceDetails as { contactLifecycle?: string }).contactLifecycle, "saved");
  assert.equal(identityFromFormValues(form, { full_name: "Ada Lovelace", email: "ada@example.com" }).email, "ada@example.com");
}

{
  const channel = read("server/channelService.ts");
  assert.match(channel, /inboxOnlyWebchatSourceDetails/);
  assert.match(channel, /maybePromoteWebchatVisitorIdentity/);
  assert.match(channel, /userId/);
  const engine = read("server/chatbotEngine.ts");
  assert.match(engine, /maybePromoteWebchatVisitorIdentity/);
  const formSvc = read("server/webchatFormService.ts");
  assert.match(formSvc, /maybePromoteWebchatVisitorIdentity/);
  const calendly = read("server/calendlyWebhook.ts");
  assert.match(calendly, /maybePromoteWebchatVisitorIdentity/);
}

{
  const isolation = read("tests/webchat-tenant-isolation.test.ts");
  assert.match(isolation, /ACCOUNT_A/);
  assert.match(isolation, /ACCOUNT_B/);
  const promo = read("server/webchatIdentityPromotionService.ts");
  assert.match(promo, /eq\(contacts\.userId, params\.userId\)/);
  assert.match(promo, /contact\.userId !== params\.userId/);
}

console.log("webchat-identity-promotion.test.ts: all assertions passed");
