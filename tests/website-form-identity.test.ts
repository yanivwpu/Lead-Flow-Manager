/**
 * Website-form display identity (inbox row / panel / compose / Copilot).
 * Run: npx tsx --test tests/website-form-identity.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyWebsiteFormEmail,
} from "../shared/websiteFormEmail";
import {
  formCardSubjectLine,
  inboxRowDisplayName,
  inboxRowMatchesSearch,
  isSafeHttpUrl,
  resolveWebsiteFormDisplayIdentity,
  toInboxWebsiteFormIdentity,
} from "../shared/websiteFormIdentity";
import { resolveEmailReplyTarget } from "../shared/emailReplyTarget";

const AP_BODY = `Email: diana@tangocrew.io
Subject: General Question
Message: Hi, Yaniv the email I wrote down didn't go thru so I'm messaging you here. Nice to be connected!

Page URL: https://affordablepompano.com/contact
Submitted at: August 4, 2026 at 3:00 PM`;

test("Inbox row displays visitor name for website forms", () => {
  const formMeta = classifyWebsiteFormEmail({
    subject: "Contact Form — General Question — Diana",
    textBody: AP_BODY,
    from: { email: "forms@affordablepompano.com", name: "Affordable Pompano" },
    replyTo: { email: "diana@tangocrew.io", name: "Diana" },
    mailboxEmail: "owner@example.com",
  });
  assert.ok(formMeta);

  const identity = resolveWebsiteFormDisplayIdentity({
    formMeta,
    fromEmail: "forms@affordablepompano.com",
    fromName: "Affordable Pompano",
    replyToEmail: "diana@tangocrew.io",
    replyToName: "Diana",
    emailSubject: "Contact Form — General Question — Diana",
    contactName: "Affordable Pompano",
    contactEmail: "forms@affordablepompano.com",
  });

  const compact = toInboxWebsiteFormIdentity(identity);
  assert.ok(compact);
  assert.equal(inboxRowDisplayName(compact, "Affordable Pompano"), "Diana");
  assert.match(compact!.subjectLine || "", /General Question/);
  assert.equal(compact!.leadSource, "Website Form");
  assert.equal(compact!.notificationFromEmail, "forms@affordablepompano.com");
});

test("Right contact panel identity prefers visitor over notification sender", () => {
  const formMeta = classifyWebsiteFormEmail({
    subject: "Contact Form — General Question — Diana",
    textBody: AP_BODY,
    from: { email: "forms@affordablepompano.com", name: "Affordable Pompano" },
    replyTo: { email: "diana@tangocrew.io", name: "Diana" },
    mailboxEmail: "owner@example.com",
  });
  const identity = resolveWebsiteFormDisplayIdentity({
    formMeta,
    fromEmail: "forms@affordablepompano.com",
    fromName: "Affordable Pompano",
    replyToEmail: "diana@tangocrew.io",
    replyToName: "Diana",
    contactName: "Affordable Pompano",
    contactEmail: "forms@affordablepompano.com",
  });
  assert.equal(identity.displayName, "Diana");
  assert.equal(identity.displayEmail, "diana@tangocrew.io");
  assert.equal(identity.leadSource, "Website Form");
  assert.notEqual(identity.displayEmail, "forms@affordablepompano.com");
});

test("Notification sender remains preserved in metadata", () => {
  const formMeta = classifyWebsiteFormEmail({
    subject: "Contact Form — General Question — Diana",
    textBody: AP_BODY,
    from: { email: "forms@affordablepompano.com", name: "Affordable Pompano" },
    replyTo: { email: "diana@tangocrew.io", name: "Diana" },
    mailboxEmail: "owner@example.com",
  });
  const identity = resolveWebsiteFormDisplayIdentity({
    formMeta,
    fromEmail: "forms@affordablepompano.com",
    fromName: "Affordable Pompano",
    replyToEmail: "diana@tangocrew.io",
    replyToName: "Diana",
  });
  assert.equal(identity.notificationFromEmail, "forms@affordablepompano.com");
  assert.equal(identity.notificationFromName, "Affordable Pompano");
  assert.equal(formMeta!.notificationFromEmail, "forms@affordablepompano.com");
});

test("Standard email rows remain unchanged (no form identity)", () => {
  const identity = resolveWebsiteFormDisplayIdentity({
    formMeta: null,
    sourceType: null,
    fromEmail: "alex@client.com",
    fromName: "Alex Client",
    contactName: "Alex Client",
    contactEmail: "alex@client.com",
    emailSubject: "Re: Pricing",
  });
  assert.equal(identity.isWebsiteForm, false);
  assert.equal(identity.leadSource, null);
  assert.equal(toInboxWebsiteFormIdentity(identity), null);
  assert.equal(inboxRowDisplayName(null, "Alex Client"), "Alex Client");
});

test("Historical on-read form classification displays visitor via Reply-To", () => {
  // Simulate persisted metadata missing; only Reply-To + sourceType hint.
  const identity = resolveWebsiteFormDisplayIdentity({
    formMeta: null,
    sourceType: "website_form",
    replyToEmail: "diana@tangocrew.io",
    replyToName: "Diana",
    fromEmail: "forms@affordablepompano.com",
    fromName: "Affordable Pompano",
    emailSubject: "Contact Form — General Question — Diana",
    contactName: "Affordable Pompano",
    contactEmail: "forms@affordablepompano.com",
  });
  assert.equal(identity.isWebsiteForm, true);
  assert.equal(identity.displayName, "Diana");
  assert.equal(identity.displayEmail, "diana@tangocrew.io");
});

test("Source-page quick action appears only for a valid URL", () => {
  assert.equal(isSafeHttpUrl("https://affordablepompano.com/contact"), true);
  assert.equal(isSafeHttpUrl("http://example.com/x"), true);
  assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpUrl("not-a-url"), false);
  assert.equal(isSafeHttpUrl(""), false);
  assert.equal(isSafeHttpUrl(null), false);
});

test("Form card subject omits Subject: prefix and boilerplate", () => {
  assert.equal(
    formCardSubjectLine({
      formSubject: "General Question",
      formName: "Contact Form",
      emailSubject: "Contact Form — General Question — Diana",
    }),
    "General Question",
  );
  assert.equal(
    formCardSubjectLine({
      formSubject: "Contact Form",
      formName: "Contact Form",
    }),
    null,
  );
});

test("Search matches visitor name/email", () => {
  const formMeta = classifyWebsiteFormEmail({
    subject: "Contact Form — General Question — Diana",
    textBody: AP_BODY,
    from: { email: "forms@affordablepompano.com", name: "Affordable Pompano" },
    replyTo: { email: "diana@tangocrew.io", name: "Diana" },
    mailboxEmail: "owner@example.com",
  });
  const identity = toInboxWebsiteFormIdentity(
    resolveWebsiteFormDisplayIdentity({
      formMeta,
      replyToEmail: "diana@tangocrew.io",
      replyToName: "Diana",
      fromEmail: "forms@affordablepompano.com",
    }),
  );
  assert.equal(
    inboxRowMatchesSearch("diana", {
      contactName: "Affordable Pompano",
      contactEmail: "forms@affordablepompano.com",
      formIdentity: identity,
    }),
    true,
  );
  assert.equal(
    inboxRowMatchesSearch("tangocrew", {
      contactName: "Affordable Pompano",
      contactEmail: "forms@affordablepompano.com",
      formIdentity: identity,
    }),
    true,
  );
  assert.equal(
    inboxRowMatchesSearch("zzzz-no-match", {
      contactName: "Affordable Pompano",
      contactEmail: "forms@affordablepompano.com",
      formIdentity: identity,
    }),
    false,
  );
});

test("Compose recipient remains Reply-To for form threads", () => {
  const replyTarget = resolveEmailReplyTarget({
    fromEmail: "forms@affordablepompano.com",
    replyToEmail: "diana@tangocrew.io",
    replyToName: "Diana",
    mailboxEmail: "owner@example.com",
  });
  assert.equal(replyTarget.email, "diana@tangocrew.io");
  assert.equal(replyTarget.source, "reply_to");
});

test("Lead Source Website Form is exposed on identity", () => {
  const formMeta = classifyWebsiteFormEmail({
    subject: "Contact Form — General Question — Diana",
    textBody: AP_BODY,
    from: { email: "forms@affordablepompano.com", name: "Affordable Pompano" },
    replyTo: { email: "diana@tangocrew.io", name: "Diana" },
    mailboxEmail: "owner@example.com",
  });
  const identity = resolveWebsiteFormDisplayIdentity({ formMeta });
  assert.equal(identity.leadSource, "Website Form");
});
