/**
 * Obfuscated public email extraction regression tests.
 * Run: npx tsx tests/prospect-email-obfuscation.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decodeCloudflareCfEmail,
  decodeHtmlEntitiesForEmailExtract,
  discoverContactUrlsFromHtml,
  extractEmailsFromHtml,
  extractPublicContactsFromHtml,
  normalizeObfuscatedEmailCandidate,
  normalizeExtractedEmail,
  shouldApplyScrapedProspectEmail,
} from "../server/prospectImport/prospectWebsiteContactExtract";

const root = join(import.meta.dirname, "..");

assert.equal(
  normalizeObfuscatedEmailCandidate("cs", "Marketing1on1.com"),
  "cs@marketing1on1.com",
);
assert.equal(
  normalizeObfuscatedEmailCandidate("cs", "Marketing 1on1.com", "marketing1on1.com"),
  "cs@marketing1on1.com",
);
assert.equal(
  normalizeObfuscatedEmailCandidate("sales", "example [dot] com"),
  "sales@example.com",
);
assert.equal(
  normalizeObfuscatedEmailCandidate("hello", "example(dot)co(dot)uk"),
  "hello@example.co.uk",
);

assert.equal(normalizeExtractedEmail("User+Tag@Example.COM"), "user+tag@example.com");
assert.equal(normalizeExtractedEmail("bad@@example.com"), null);

const spaced = extractPublicContactsFromHtml(
  `<html><body><p>Email: cs @ Marketing1on1.com</p></body></html>`,
  "https://marketing1on1.com/contact",
);
assert.ok(spaced.emails.includes("cs@marketing1on1.com"));

const spacedBrand = extractPublicContactsFromHtml(
  `<html><body><p>Email: cs @ Marketing 1on1.com</p></body></html>`,
  "https://www.marketing1on1.com/",
);
assert.ok(spacedBrand.emails.includes("cs@marketing1on1.com"));

const bracket = extractPublicContactsFromHtml(
  `<p>Write sales [at] example [dot] com for quotes</p>`,
);
assert.ok(bracket.emails.includes("sales@example.com"));

const paren = extractPublicContactsFromHtml(
  `<p>hello(at)example(dot)co(dot)uk</p>`,
);
assert.ok(paren.emails.includes("hello@example.co.uk"));

const entityHtml = decodeHtmlEntitiesForEmailExtract("reach us at info&#64;bright-dental.example today");
assert.ok(entityHtml.includes("info@bright-dental.example"));
const entityContacts = extractPublicContactsFromHtml(
  `<p>reach us at info&#64;bright-dental.example today</p>`,
);
assert.ok(entityContacts.emails.includes("info@bright-dental.example"));

const standard = extractPublicContactsFromHtml(
  `<p>Also reach sales@bright-dental.example for quotes</p>`,
);
assert.ok(standard.emails.includes("sales@bright-dental.example"));

const mailtoPriority = extractEmailsFromHtml(
  `<a href="mailto:hello@bright-dental.example">Email</a>
   <p>hello [at] bright-dental [dot] example</p>`,
  "https://bright-dental.example/contact",
);
assert.equal(mailtoPriority[0]?.method, "mailto");
assert.equal(mailtoPriority[0]?.email, "hello@bright-dental.example");
assert.equal(mailtoPriority.filter((e) => e.email === "hello@bright-dental.example").length, 1);

const prose = extractPublicContactsFromHtml(`
  <p>Meet us at the office. Visit dot com businesses. Available at 5 PM.
  Contact the marketing team for help.</p>
`);
assert.equal(prose.emails.length, 0);

const dups = extractPublicContactsFromHtml(`
  <a href="mailto:Sales@Example.com">m</a>
  <p>sales @ example.com</p>
  <p>sales[at]example[dot]com</p>
`);
assert.deepEqual(dups.emails, ["sales@example.com"]);

assert.equal(shouldApplyScrapedProspectEmail("owner@company.com", "scraped@example.com"), false);
assert.equal(shouldApplyScrapedProspectEmail(null, "scraped@example.com"), true);
assert.equal(shouldApplyScrapedProspectEmail("", "scraped@example.com"), true);
assert.equal(shouldApplyScrapedProspectEmail("owner@company.com", null), false);

// Retry / re-enrichment: HTML that old standard regex alone would miss
const missedBefore = extractPublicContactsFromHtml(
  `<footer>Contact cs @ Marketing 1on1.com</footer>`,
  "https://marketing1on1.com",
);
assert.ok(missedBefore.emails.includes("cs@marketing1on1.com"));
assert.ok(missedBefore.emailExtractions?.some((e) => e.method === "obfuscated_text"));

// Cloudflare Email Address Obfuscation (common on footers — e.g. Insight Goat-style sites)
{
  // Encode hello@example.com with key 0x2a for a deterministic fixture
  const key = 0x2a;
  const plain = "hello@example.com";
  let hex = key.toString(16).padStart(2, "0");
  for (const ch of plain) {
    hex += (ch.charCodeAt(0) ^ key).toString(16).padStart(2, "0");
  }
  assert.equal(decodeCloudflareCfEmail(hex), plain);

  const cfHtml = `
    <footer>
      <a href="/cdn-cgi/l/email-protection#${hex}">
        <span class="__cf_email__" data-cfemail="${hex}">[email&#160;protected]</span>
      </a>
      <a href="/contact-us">Contact</a>
    </footer>
  `;
  const cfContacts = extractPublicContactsFromHtml(cfHtml, "https://example.com/");
  assert.ok(cfContacts.emails.includes("hello@example.com"));
  assert.ok(cfContacts.emailExtractions?.some((e) => e.method === "cloudflare_cfemail"));

  const discovered = discoverContactUrlsFromHtml(cfHtml, "https://example.com/");
  assert.ok(discovered.some((u) => /contact-us/i.test(u)));
}

const panelSrc = readFileSync(
  join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
  "utf8",
);
assert.ok(!panelSrc.includes("Approve to enrich"));

console.log("prospect-email-obfuscation.test.ts: ok");
