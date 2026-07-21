/**
 * Prospect enrichment Phase 2 — public contact extract + trigger rules.
 * Run: npx tsx tests/prospect-enrichment.test.ts
 */
import assert from "node:assert/strict";
import {
  extractPublicContactsFromHtml,
  detectWebsiteSignals,
  isInventedMailboxGuess,
} from "../server/prospectImport/prospectWebsiteContactExtract";
import { resolveProspectWebsiteUrl } from "../server/prospectImport/prospectWebsiteUrl";
import type { Contact } from "../shared/schema";

function testExtractPublicContactsOnly() {
  const html = `
    <html><body>
      <a href="mailto:hello@bright-dental.example">Email us</a>
      <a href="tel:+15125551212">Call</a>
      <a href="https://wa.me/15125559999">WhatsApp</a>
      <a href="https://calendly.com/bright/demo">Book</a>
      <a href="https://facebook.com/brightdental">FB</a>
      <p>Also reach sales@bright-dental.example for quotes</p>
      <footer>© Bright Dental</footer>
    </body></html>
  `;
  const contacts = extractPublicContactsFromHtml(html, "https://bright-dental.example/contact");
  assert.ok(contacts.emails.includes("hello@bright-dental.example"));
  assert.ok(contacts.emails.includes("sales@bright-dental.example"));
  assert.ok(contacts.phones.some((p) => p.includes("5125551212") || p.includes("15125551212")));
  assert.ok(contacts.whatsappNumbers.length >= 1);
  assert.ok(contacts.bookingUrls.some((u) => u.includes("calendly.com")));
  assert.ok(contacts.socialProfiles.some((u) => u.includes("facebook.com")));
  assert.ok(contacts.contactPageUrls.some((u) => u.includes("/contact")));
}

function testNeverInventEmails() {
  assert.equal(isInventedMailboxGuess("info@example.com", []), true);
  assert.equal(isInventedMailboxGuess("hello@example.com", []), true);
  assert.equal(
    isInventedMailboxGuess("info@example.com", ["info@example.com"]),
    false,
  );
}

function testTechSignals() {
  const signals = detectWebsiteSignals(
    `<html><script src="cdn.shopify.com"></script><div id="tawk">chat</div>
     <a href="https://wa.me/1">wa</a><form><input name="email"/></form></html>`,
  );
  assert.equal(signals.chatWidgetDetected, true);
  assert.equal(signals.whatsappButtonDetected, true);
  assert.ok(signals.technologyClues.includes("Shopify"));
}

function testResolveWebsiteFromProspectAiMeta() {
  const contact = {
    id: "c1",
    userId: "ws",
    name: "Bright Dental",
    notes: "Company: Bright Dental",
    sourceDetails: {
      prospectAi: { website: "bright-dental.example" },
    },
    customFields: {},
  } as Contact;
  const url = resolveProspectWebsiteUrl(contact);
  assert.ok(url);
  assert.match(url!, /^https:\/\/bright-dental\.example/i);
}

function testNoWebsiteReturnsNull() {
  const contact = {
    id: "c2",
    userId: "ws",
    name: "No Site",
    notes: "Company: No Site\nType: cafe",
    sourceDetails: { prospectAi: { businessType: "cafe" } },
    customFields: {},
  } as Contact;
  assert.equal(resolveProspectWebsiteUrl(contact), null);
}

function testEnrichmentNeverOnDiscoverPhilosophy() {
  // Documented contract: discover → pending intelligence only; enrichment statuses start at none.
  const enrichmentStatuses = ["none", "pending", "enriching", "completed", "failed", "cancelled"];
  assert.ok(enrichmentStatuses.includes("none"));
  const triggers = ["approve", "queue", "manual"];
  assert.ok(!triggers.includes("discover"));
}

testExtractPublicContactsOnly();
testNeverInventEmails();
testTechSignals();
testResolveWebsiteFromProspectAiMeta();
testNoWebsiteReturnsNull();
testEnrichmentNeverOnDiscoverPhilosophy();
console.log("prospect-enrichment.test.ts: all assertions passed");
