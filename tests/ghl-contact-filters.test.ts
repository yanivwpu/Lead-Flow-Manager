/**
 * GHL Prospect Import contact filter rejection tests.
 * Run: npx tsx tests/ghl-contact-filters.test.ts
 */
import assert from "node:assert/strict";
import type { GhlRawContact } from "../server/prospectImport/ghlApiClient";
import {
  contactPassesFilters,
  explainGhlContactFilterRejection,
  sanitizeGhlContactForDiagnostics,
} from "../server/prospectImport/ghlContactFilters";

const baseContact: GhlRawContact = {
  id: "c-1",
  email: "agent@example.com",
  phone: "+15551234567",
  tags: ["Lead"],
  source: "website",
  dateAdded: "2026-01-01T00:00:00.000Z",
};

assert.equal(
  explainGhlContactFilterRejection(baseContact, { tags: ["Agency"] }),
  'Missing required tag. Need one of [Agency]; contact has [Lead]',
);
assert.equal(contactPassesFilters(baseContact, { tags: ["Agency"] }), false);
assert.equal(contactPassesFilters({ ...baseContact, tags: ["Agency"] }, { tags: ["Agency"] }), true);

const sanitized = sanitizeGhlContactForDiagnostics({
  ...baseContact,
  contactName: "Jane Agent",
});
assert.match(String(sanitized.email), /^\w{2}\*\*\*@/);
assert.equal(sanitized.phone, "***4567");

console.log("ghl-contact-filters.test.ts: OK");
