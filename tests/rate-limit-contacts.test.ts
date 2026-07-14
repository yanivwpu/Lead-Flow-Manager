/**
 * Rate-limit rule matching for CRM contact enrichment vs public form.
 * Run: npx tsx tests/rate-limit-contacts.test.ts
 */
import assert from "node:assert/strict";
import { findRateLimitRule } from "../server/rateLimitMiddleware";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("public lead form uses strict public-contact limiter", () => {
  const rule = findRateLimitRule("/api/contact", "POST");
  assert.equal(rule?.id, "public-contact");
  assert.ok((rule?.limit ?? 0) <= 60);
});

run("authenticated contact PATCH uses contacts-write (not public/auth/ai)", () => {
  const rule = findRateLimitRule("/api/contacts/abc-123", "PATCH");
  assert.equal(rule?.id, "contacts-write");
  assert.notEqual(rule?.id, "public-contact");
  assert.notEqual(rule?.id, "auth");
  assert.notEqual(rule?.id, "ai");
  assert.ok((rule?.limit ?? 0) >= 120);
});

run("authenticated contact GET uses contacts-read, separate from writes", () => {
  const read = findRateLimitRule("/api/contacts/abc-123", "GET");
  const write = findRateLimitRule("/api/contacts/abc-123", "PATCH");
  assert.equal(read?.id, "contacts-read");
  assert.equal(write?.id, "contacts-write");
  assert.notEqual(read?.id, write?.id);
  assert.ok((read?.limit ?? 0) > (write?.limit ?? 0));
});

run("inbox GET traffic does not share the write limiter bucket id", () => {
  const timeline = findRateLimitRule("/api/contacts/abc-123/timeline", "GET");
  const patch = findRateLimitRule("/api/contacts/abc-123", "PATCH");
  assert.equal(timeline?.id, "contacts-read");
  assert.equal(patch?.id, "contacts-write");
});

run("inventory-matches keeps its dedicated read rule", () => {
  const rule = findRateLimitRule("/api/contacts/abc-123/inventory-matches", "GET");
  assert.equal(rule?.id, "inventory-matches-read");
});

run("send endpoint uses contacts-write", () => {
  const rule = findRateLimitRule("/api/contacts/abc-123/send", "POST");
  assert.equal(rule?.id, "contacts-write");
});

console.log("All rate-limit-contacts tests passed.");
