import assert from "node:assert/strict";
import {
  containsInternalCalendlyTracking,
  formatBookingMessage,
  sanitizeCalendlyBookingLinks,
} from "../shared/calendlyBookingMessage";

const contactId = "contact_123";
const conversationId = "conversation_456";
const trackedUrl =
  `https://calendly.com/yaniv-whachatcrm?utm_source=whachatcrm&utm_medium=whatsapp` +
  `&utm_content=${contactId}&utm_campaign=${conversationId}&utm_term=secret-token`;

const formatted = formatBookingMessage(trackedUrl);
assert.equal(
  formatted,
  "Sure — you can pick a time here:\nhttps://calendly.com/yaniv-whachatcrm\n\nI'll make sure we have the right details ready."
);
assert.equal(containsInternalCalendlyTracking(formatted), false);
assert.equal(formatted.includes(contactId), false);
assert.equal(formatted.includes(conversationId), false);

const sanitized = sanitizeCalendlyBookingLinks(
  `Sure — you can pick a time here:\n${trackedUrl} I'll make sure we have the right details ready.`
);
assert.equal(sanitized.content.includes("utm_content"), false);
assert.equal(sanitized.content.includes("utm_campaign"), false);
assert.equal(sanitized.content.includes("utm_term"), false);
assert.equal(sanitized.content.includes(contactId), false);
assert.equal(sanitized.content.includes(conversationId), false);
assert.equal(
  sanitized.content,
  "Sure — you can pick a time here:\nhttps://calendly.com/yaniv-whachatcrm\n\nI'll make sure we have the right details ready."
);
assert.deepEqual(sanitized.calendlyUrls, ["https://calendly.com/yaniv-whachatcrm"]);

console.log("calendly-booking-message.test.ts passed");
