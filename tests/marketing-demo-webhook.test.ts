/**
 * Marketing demo Calendly webhook payload processing.
 * Run: npx tsx tests/marketing-demo-webhook.test.ts
 */
import assert from "node:assert/strict";
import {
  readMarketingDemoBookingIdFromCalendlyBody,
  resolveMarketingDemoBookingIdFromTracking,
} from "../shared/marketingDemoCalendly";
import { processMarketingDemoCalendlyPayload } from "../server/marketingDemoCalendlyWebhook";

const bookingId = "11111111-2222-4333-8444-555555555555";

assert.equal(
  resolveMarketingDemoBookingIdFromTracking({ utm_content: bookingId }),
  bookingId,
  "utm_content without medium",
);

const bodyWithCustomAnswer = {
  event: "invitee.created",
  payload: {
    invitee: {
      email: "visitor@example.com",
      name: "Visitor",
      questions_and_answers: [{ question: "Reference", answer: bookingId }],
      scheduled_event: {
        uri: "https://api.calendly.com/scheduled_events/abc",
        start_time: "2026-07-10T15:00:00.000000Z",
        name: "Product Demo",
      },
    },
    tracking: { utm_source: "whachatcrm" },
  },
};

assert.equal(readMarketingDemoBookingIdFromCalendlyBody(bodyWithCustomAnswer), bookingId);

// Non-invitee events are ignored without throwing
await processMarketingDemoCalendlyPayload({ event: "invitee.canceled" });

console.log("marketing-demo-webhook.test.ts: OK");
