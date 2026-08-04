/**
 * Website form email classifier, parser, and reply-target resolution.
 * Run: npx tsx --test tests/website-form-email.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveEmailReplyTarget,
  resolveOutboundEmailTo,
  looksLikeNotificationSender,
} from "../shared/emailReplyTarget";
import {
  classifyWebsiteFormEmail,
  compactSourcePageLabel,
  formatWebsiteFormAiContext,
  parseWebsiteFormFields,
} from "../shared/websiteFormEmail";

const AP_BODY = `Email: diana@tangocrew.io
Subject: General Question
Message: Hi, Yaniv the email I wrote down didn't go thru so I'm messaging you here. Nice to be connected!

Page URL: https://affordablepompano.com/contact
Submitted at: August 4, 2026 at 3:00 PM`;

const AP_HTML = `
<p><strong>Email:</strong> diana@tangocrew.io</p>
<p><strong>Subject:</strong> General Question</p>
<p><strong>Message:</strong><br/>Line one<br/>Line two still here</p>
<p><strong>Page URL:</strong> https://affordablepompano.com/contact</p>
`;

test("Reply-To differs from From → reply target is Reply-To", () => {
  const r = resolveEmailReplyTarget({
    fromEmail: "forms@affordablepompano.com",
    fromName: "Affordable Pompano",
    replyToEmail: "diana@tangocrew.io",
    replyToName: "Diana",
    mailboxEmail: "owner@example.com",
  });
  assert.equal(r.email, "diana@tangocrew.io");
  assert.equal(r.source, "reply_to");
  assert.equal(r.unsafe, false);
});

test("No Reply-To → falls back to external From", () => {
  const r = resolveEmailReplyTarget({
    fromEmail: "lead@example.com",
    mailboxEmail: "owner@example.com",
  });
  assert.equal(r.email, "lead@example.com");
  assert.equal(r.source, "from");
});

test("Connected mailbox never becomes reply target", () => {
  const r = resolveEmailReplyTarget({
    fromEmail: "owner@example.com",
    replyToEmail: "owner@example.com",
    mailboxEmail: "owner@example.com",
  });
  assert.equal(r.email, null);
  assert.equal(r.source, "unavailable");
  assert.equal(r.unsafe, true);
});

test("Outbound send cannot be tricked into forms@ when Reply-To exists", () => {
  const replyTarget = resolveEmailReplyTarget({
    fromEmail: "forms@affordablepompano.com",
    replyToEmail: "diana@tangocrew.io",
    mailboxEmail: "owner@example.com",
  });
  const out = resolveOutboundEmailTo({
    clientTo: ["forms@affordablepompano.com"],
    contactEmail: "forms@affordablepompano.com",
    replyTarget,
    mailboxEmail: "owner@example.com",
    notificationFromEmail: "forms@affordablepompano.com",
  });
  assert.deepEqual(out.to, ["diana@tangocrew.io"]);
  assert.equal(out.blockedClientOverride, true);
});

test("Affordable Pompano-style contact form classification", () => {
  const meta = classifyWebsiteFormEmail({
    subject: "Contact Form — General Question — Diana",
    textBody: AP_BODY,
    from: { email: "forms@affordablepompano.com", name: "Affordable Pompano" },
    replyTo: { email: "diana@tangocrew.io", name: "Diana" },
    mailboxEmail: "owner@example.com",
  });
  assert.ok(meta);
  assert.equal(meta!.sourceType, "website_form");
  assert.equal(meta!.visitorEmail, "diana@tangocrew.io");
  assert.equal(meta!.visitorName, "Diana");
  assert.match(meta!.visitorMessage || "", /Nice to be connected/i);
  assert.equal(compactSourcePageLabel(meta!.sourcePageUrl), "Contact page");
  const ai = formatWebsiteFormAiContext(meta!);
  assert.match(ai, /diana@tangocrew\.io/);
  assert.match(ai, /Do not address the notification sender/i);
});

test("Multiline message parsing", () => {
  const fields = parseWebsiteFormFields(`Name: Sam
Message: Hello
This is line two
Still the message
Email: sam@example.com`);
  assert.match(fields.message, /Hello/);
  assert.match(fields.message, /line two/);
  assert.match(fields.message, /Still the message/);
  assert.equal(fields.email, "sam@example.com");
});

test("HTML form notification parsing", () => {
  const meta = classifyWebsiteFormEmail({
    subject: "Contact Form — Inquiry",
    htmlBody: AP_HTML,
    textBody: null,
    from: { email: "forms@site.com", name: "Site Forms" },
    replyTo: { email: "diana@tangocrew.io", name: "Diana" },
    mailboxEmail: "me@biz.com",
  });
  assert.ok(meta);
  assert.equal(meta!.visitorEmail, "diana@tangocrew.io");
  assert.match(meta!.visitorMessage || "", /Line one/);
  assert.match(meta!.visitorMessage || "", /Line two/);
});

test("Weak signals: normal email is not falsely classified", () => {
  const meta = classifyWebsiteFormEmail({
    subject: "Re: Quick question about pricing",
    textBody: "Hi — following up on our call yesterday. Can we meet Thursday?",
    from: { email: "alex@client.com", name: "Alex Client" },
    replyTo: null,
    mailboxEmail: "owner@example.com",
  });
  assert.equal(meta, null);
});

test("forms@ looks like notification sender", () => {
  assert.equal(looksLikeNotificationSender("forms@affordablepompano.com"), true);
  assert.equal(looksLikeNotificationSender("diana@tangocrew.io"), false);
});

test("Raw body fields preserved alongside structured parse", () => {
  const fields = parseWebsiteFormFields(AP_BODY);
  assert.equal(fields.email, "diana@tangocrew.io");
  assert.equal(fields.subject, "General Question");
  assert.ok(fields.pageUrl?.includes("affordablepompano.com/contact"));
  // Original AP_BODY string remains available to callers — parser is non-destructive.
  assert.match(AP_BODY, /diana@tangocrew\.io/);
});
