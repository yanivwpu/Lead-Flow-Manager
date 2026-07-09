/**
 * Marketing demo Calendly URL tracking params.
 * Run: npx tsx tests/marketing-demo-calendly.test.ts
 */
import assert from "node:assert/strict";
import {
  appendMarketingDemoCalendlyParams,
  MARKETING_DEMO_CALENDLY_UTM_MEDIUM,
  readMarketingDemoBookingIdFromTracking,
  resolveMarketingDemoBookingIdFromTracking,
  isMarketingDemoCalendlyTracking,
} from "../shared/marketingDemoCalendly";

const url = appendMarketingDemoCalendlyParams("https://calendly.com/jane/demo", {
  demoBookingId: "booking-123",
  visitorEmail: "visitor@example.com",
  visitorName: "Jane Visitor",
  source: "web",
});

assert.ok(url.includes("utm_content=booking-123"), "utm_content is demoBookingId");
assert.ok(url.includes(`utm_medium=${MARKETING_DEMO_CALENDLY_UTM_MEDIUM}`), "utm_medium");
assert.ok(url.includes("email=visitor%40example.com"), "prefill email");
assert.ok(url.includes("name=Jane"), "prefill name");

const tracking = {
  utm_medium: MARKETING_DEMO_CALENDLY_UTM_MEDIUM,
  utm_content: "booking-123",
};
assert.equal(readMarketingDemoBookingIdFromTracking(tracking), "booking-123");
assert.equal(isMarketingDemoCalendlyTracking(tracking), true);
assert.equal(isMarketingDemoCalendlyTracking({ utm_medium: "rge_setup" }), false);

const sampleBookingId = "11111111-2222-4333-8444-555555555555";

assert.equal(
  resolveMarketingDemoBookingIdFromTracking({ utm_content: sampleBookingId }),
  sampleBookingId,
  "utm_content alone when medium omitted (UUID)",
);
assert.equal(
  resolveMarketingDemoBookingIdFromTracking({ utm_medium: "rge_setup", utm_content: "user-1" }),
  undefined,
  "reject other flow medium with content",
);

console.log("marketing-demo-calendly.test.ts: OK");
