/**
 * Seller consultation booking — Calendly fast path.
 * Run: npx tsx tests/seller-consultation-booking.test.ts
 */
import assert from "node:assert/strict";
import {
  detectSellerConsultationBookingIntent,
  classifySellerIntent,
} from "../shared/sellerIntent";
import { detectHighConfidenceBookingIntent } from "../shared/bookingIntent";
import { assessSellerQualification } from "../shared/sellerQualification";
import { emptySellerPreferenceProfile } from "../shared/sellerPreferenceSchema";

const consultMsgs = [
  "Schedule listing consultation",
  "Book CMA appointment",
  "Can we book a valuation appointment?",
];

for (const msg of consultMsgs) {
  assert.equal(
    detectSellerConsultationBookingIntent(msg),
    true,
    `consultation booking: ${msg}`,
  );
}

assert.equal(detectHighConfidenceBookingIntent("Schedule listing consultation"), false);
assert.equal(
  detectHighConfidenceBookingIntent("Schedule listing consultation") ||
    detectSellerConsultationBookingIntent("Schedule listing consultation"),
  true,
  "combined scheduling fast path",
);

const qual = assessSellerQualification({
  profile: emptySellerPreferenceProfile(),
  inboundText: "Schedule listing consultation",
  sellerIntent: classifySellerIntent({ inboundText: "Schedule listing consultation" }),
});
assert.ok(qual.suggestedQuestion.length > 10, "qualification suggests next step");
assert.equal(qual.missing.includes("propertyAddress"), true, "asks for address first when empty");

console.log("seller-consultation-booking.test.ts: OK");
