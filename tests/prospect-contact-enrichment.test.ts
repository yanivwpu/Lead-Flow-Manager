/**
 * Prospect Intelligence contact enrichment (email/phone) helpers.
 * Run: npx tsx --test tests/prospect-contact-enrichment.test.ts
 *   or: npx tsx tests/prospect-contact-enrichment.test.ts
 */
import assert from "node:assert/strict";
import {
  isValidProspectEmail,
  isValidProspectPhone,
  normalizeProspectEmailForSave,
  normalizeProspectPhoneForSave,
  resolveProspectOutreachChannelState,
} from "../shared/prospectContactEnrichment";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("normalizes and validates emails", () => {
  assert.equal(normalizeProspectEmailForSave("  Owner@Biz.COM "), "owner@biz.com");
  assert.equal(isValidProspectEmail("owner@biz.com"), true);
  assert.equal(normalizeProspectEmailForSave("not-an-email"), null);
  assert.equal(isValidProspectEmail(""), false);
  assert.equal(isValidProspectEmail(null), false);
});

run("normalizes phones with digit rules and preserves +", () => {
  assert.equal(normalizeProspectPhoneForSave("+1 (786) 981-4758"), "+17869814758");
  assert.equal(normalizeProspectPhoneForSave("7869814758"), "7869814758");
  assert.equal(normalizeProspectPhoneForSave("123"), null);
  assert.equal(isValidProspectPhone("+17869814758"), true);
  assert.equal(isValidProspectPhone("—"), false);
});

run("marks outreach email as missing until a valid email exists", () => {
  const before = resolveProspectOutreachChannelState({
    email: null,
    phone: "+17869814758",
  });
  assert.equal(before.hasEmail, false);
  assert.equal(before.emailStatus, "missing");
  assert.equal(before.emailLabel, "Missing email");
  assert.equal(before.hasPhone, true);

  const after = resolveProspectOutreachChannelState({
    email: "hello@shop.com",
    phone: "+17869814758",
  });
  assert.equal(after.hasEmail, true);
  assert.equal(after.emailStatus, "ready");
  assert.equal(after.emailLabel, "hello@shop.com");
});

console.log("All prospect-contact-enrichment tests passed.");
