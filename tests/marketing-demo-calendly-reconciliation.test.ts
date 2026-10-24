import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eligibleMarketingDemoBooking } from "../shared/marketingDemoCalendlyReconciliation";

const id = "11111111-2222-4333-8444-555555555555";
const booking = { id, visitorEmail: "william@example.com", status: "awaiting_schedule" };

describe("Calendly Free marketing demo reconciliation", () => {
  it("matches tracked booking ID and normalized invitee email", () => {
    assert.equal(eligibleMarketingDemoBooking([booking], "WILLIAM@example.com", { utm_medium: "marketing_demo", utm_content: id }), true);
  });

  it("rejects tracked booking with different email", () => {
    assert.equal(eligibleMarketingDemoBooking([booking], "other@example.com", { utm_medium: "marketing_demo", utm_content: id }), false);
  });

  it("does not import unrelated Calendly meetings", () => {
    assert.equal(eligibleMarketingDemoBooking([booking], "william@example.com", {}), false);
  });

  it("permits marketing-tracked email fallback only when unambiguous", () => {
    const marketing = { utm_medium: "marketing_demo" };
    assert.equal(eligibleMarketingDemoBooking([booking], "william@example.com", marketing), true);
    assert.equal(eligibleMarketingDemoBooking([booking, { ...booking, id: "another-id" }], "william@example.com", marketing), false);
  });

  it("does not match an already accepted or completed booking", () => {
    assert.equal(eligibleMarketingDemoBooking([{ ...booking, status: "accepted" }], "william@example.com", { utm_medium: "marketing_demo" }), false);
  });
});
