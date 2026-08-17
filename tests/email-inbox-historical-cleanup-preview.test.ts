/**
 * Preview-only historical Email cleanup classifier.
 * Run: npx tsx tests/email-inbox-historical-cleanup-preview.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyHistoricalEmailContact,
  historicalEmailCleanupKeepReason,
  maskEmailForCleanupPreview,
  type HistoricalEmailCleanupContact,
} from "../shared/emailInboxHistoricalCleanup";

const CREDIT = `
Your credit usage went down this month.
Visit examplebank.com to see available credit.
No action is required.
`;
const NEWSLETTER = "This month's digest. View this email in a browser. Unsubscribe anytime.";
const HUMAN = "Hi, I'm interested in your services. Can someone call me about pricing?";
const RECEIPT = "Receipt for your order. Your payment was received.";

function base(over: Partial<HistoricalEmailCleanupContact> = {}): HistoricalEmailCleanupContact {
  return {
    source: "email",
    tag: "New",
    pipelineStage: "Lead",
    inboundCount: 1,
    outboundCount: 0,
    otherChannelCount: 0,
    latestInbounds: [
      {
        fromEmail: "alerts@notification.examplebank.com",
        subject: "Credit usage update",
        body: CREDIT,
      },
    ],
    ...over,
  };
}

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("credit-style notification → HIGH_CONFIDENCE_SYSTEM", () => {
  const r = classifyHistoricalEmailContact(base());
  assert.equal(r.bucket, "HIGH_CONFIDENCE_SYSTEM");
  assert.equal(r.reason, "system_notification_content");
});

run("newsletter / listing-style content → HIGH_CONFIDENCE_SYSTEM", () => {
  const r = classifyHistoricalEmailContact(
    base({
      latestInbounds: [
        {
          fromEmail: "hello@updates.example-news.com",
          subject: "Monthly digest",
          body: NEWSLETTER,
        },
      ],
    }),
  );
  assert.equal(r.bucket, "HIGH_CONFIDENCE_SYSTEM");
});

run("receipt → HIGH_CONFIDENCE_SYSTEM", () => {
  const r = classifyHistoricalEmailContact(
    base({
      latestInbounds: [
        { fromEmail: "receipts@store.example.com", subject: "Your receipt", body: RECEIPT },
      ],
    }),
  );
  assert.equal(r.bucket, "HIGH_CONFIDENCE_SYSTEM");
});

run("marketing 'tour' + unsubscribe is system, not a showing", () => {
  const r = classifyHistoricalEmailContact(
    base({
      latestInbounds: [
        {
          fromEmail: "hello@updates.example-news.com",
          subject: "Product tour",
          body: "Tour our new dashboard. Unsubscribe anytime. View in browser.",
        },
      ],
    }),
  );
  assert.equal(r.bucket, "HIGH_CONFIDENCE_SYSTEM");
});

run("noreply address alone is UNCERTAIN, not high-confidence", () => {
  const r = classifyHistoricalEmailContact(
    base({
      latestInbounds: [
        { fromEmail: "noreply@vendor.com", subject: "Hello", body: "Hello from our team." },
      ],
    }),
  );
  assert.notEqual(r.bucket, "HIGH_CONFIDENCE_SYSTEM");
  assert.equal(r.bucket, "UNCERTAIN");
});

run("empty inbound body → UNCERTAIN", () => {
  const r = classifyHistoricalEmailContact(
    base({
      latestInbounds: [{ fromEmail: "noreply@vendor.com", subject: null, body: "" }],
    }),
  );
  assert.equal(r.bucket, "UNCERTAIN");
});

run("human inquiry → HUMAN_OR_LEAD", () => {
  const r = classifyHistoricalEmailContact(
    base({
      latestInbounds: [{ fromEmail: "alex.buyer@gmail.com", subject: "Question", body: HUMAN }],
    }),
  );
  assert.equal(r.bucket, "HUMAN_OR_LEAD");
  assert.equal(r.reason, "explicit_human_inquiry");
});

run("user outbound excludes high-confidence", () => {
  assert.equal(historicalEmailCleanupKeepReason(base({ outboundCount: 1 })), "user_outbound");
  const r = classifyHistoricalEmailContact(base({ outboundCount: 1 }));
  assert.equal(r.bucket, "HUMAN_OR_LEAD");
});

run("other channel / WhatsApp excludes high-confidence", () => {
  assert.equal(
    historicalEmailCleanupKeepReason(base({ otherChannelCount: 1 })),
    "other_channel_history",
  );
  assert.equal(
    historicalEmailCleanupKeepReason(base({ whatsappId: "15551234567" })),
    "other_channel_identity",
  );
});

run("appointment / notes / tag / form never high-confidence", () => {
  assert.equal(historicalEmailCleanupKeepReason(base({ hasAppointment: true })), "appointment");
  assert.equal(historicalEmailCleanupKeepReason(base({ notes: "Called back" })), "crm_notes");
  assert.equal(
    historicalEmailCleanupKeepReason(base({ tag: "Hot", pipelineStage: "Lead" })),
    "meaningful_tag_or_stage",
  );
  assert.equal(
    historicalEmailCleanupKeepReason(
      base({ sourceDetails: { leadSource: "Website Form" } }),
    ),
    "form_import_or_prospect_source",
  );
  assert.equal(
    historicalEmailCleanupKeepReason(base({ sourceDetails: { prospectAi: { placeId: "x" } } })),
    "form_import_or_prospect_source",
  );
});

run("later human inbound among system mail → HUMAN_OR_LEAD", () => {
  const r = classifyHistoricalEmailContact(
    base({
      inboundCount: 2,
      latestInbounds: [
        { fromEmail: "alex.buyer@gmail.com", subject: "Following up", body: HUMAN },
        {
          fromEmail: "alerts@notification.examplebank.com",
          subject: "Credit usage update",
          body: CREDIT,
        },
      ],
    }),
  );
  assert.equal(r.bucket, "HUMAN_OR_LEAD");
});

run("masks email for preview", () => {
  assert.equal(maskEmailForCleanupPreview("capitalone@notification.example.com"), "ca***@notification.example.com");
});

run("preview script is read-only", () => {
  const src = readFileSync(
    join(import.meta.dirname, "..", "scripts/preview-email-inbox-cleanup.ts"),
    "utf8",
  );
  assert.ok(src.includes("SET TRANSACTION READ ONLY"));
  assert.ok(src.includes("refuseWriteFlags"));
  assert.ok(src.includes("db.transaction"));
  assert.equal(src.includes("storage.updateContact"), false);
  assert.equal(src.includes(".update("), false);
  assert.equal(src.includes(".delete("), false);
  assert.equal(src.includes(".insert("), false);
});

console.log("email-inbox-historical-cleanup-preview.test.ts: all assertions passed");
