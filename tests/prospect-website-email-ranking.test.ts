/**
 * Website email extraction + ranking for Prospect enrichment.
 * Includes HomeMiami-style mailto fixture.
 * Run: npx tsx tests/prospect-website-email-ranking.test.ts
 */
import assert from "node:assert/strict";
import {
  extractPublicContactsFromHtml,
  normalizeExtractedEmail,
  scoreProspectEmailCandidate,
  selectBestProspectEmail,
  shouldApplyScrapedProspectEmail,
} from "../server/prospectImport/prospectWebsiteContactExtract";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (err) {
    console.error(`fail ${name}`);
    throw err;
  }
}

run("HomeMiami mailto fixture extracts info@homemiamire.com", () => {
  const html = `
    <html><body>
      <header><a href="mailto:info@homemiamire.com">info@homemiamire.com</a></header>
      <footer>Contact info@homemiamire.com</footer>
    </body></html>
  `;
  const contacts = extractPublicContactsFromHtml(html, "https://www.homemiamire.com/");
  assert.ok(contacts.emails.includes("info@homemiamire.com"));
  assert.equal(
    selectBestProspectEmail(contacts.emails, {
      websiteUrl: "https://www.homemiamire.com/",
      extractions: contacts.emailExtractions,
    }),
    "info@homemiamire.com",
  );
});

run("plain-text email without mailto is extracted", () => {
  const contacts = extractPublicContactsFromHtml(
    `<p>Email us at hello@acme-realty.example for showings</p>`,
    "https://acme-realty.example/",
  );
  assert.ok(contacts.emails.includes("hello@acme-realty.example"));
});

run("contact-page email is extracted", () => {
  const contacts = extractPublicContactsFromHtml(
    `<main><a href="mailto:team@acme-realty.example">Contact</a></main>`,
    "https://acme-realty.example/contact",
  );
  assert.ok(contacts.emails.includes("team@acme-realty.example"));
  assert.ok(contacts.contactPageUrls.some((u) => u.includes("/contact")));
});

run("same-domain info@ ranks above third-party vendor email", () => {
  const emails = [
    "pixel@facebookmail.com",
    "noreply@mailchimp.com",
    "info@homemiamire.com",
    "support@wix.com",
  ];
  const best = selectBestProspectEmail(emails, {
    websiteUrl: "https://homemiamire.com",
    extractions: [
      { email: "info@homemiamire.com", method: "mailto" },
      { email: "support@wix.com", method: "standard_text" },
    ],
  });
  assert.equal(best, "info@homemiamire.com");
  assert.ok(
    scoreProspectEmailCandidate("info@homemiamire.com", {
      websiteUrl: "https://homemiamire.com",
      method: "mailto",
    }) >
      scoreProspectEmailCandidate("support@wix.com", {
        websiteUrl: "https://homemiamire.com",
        method: "standard_text",
      }),
  );
});

run("noise mailboxes are rejected", () => {
  assert.equal(normalizeExtractedEmail("noreply@homemiamire.com"), null);
  assert.equal(normalizeExtractedEmail("privacy@homemiamire.com"), null);
  assert.equal(normalizeExtractedEmail("abuse@homemiamire.com"), null);
  assert.equal(normalizeExtractedEmail("webmaster@homemiamire.com"), null);
  assert.equal(
    selectBestProspectEmail(["noreply@homemiamire.com", "privacy@homemiamire.com"], {
      websiteUrl: "https://homemiamire.com",
    }),
    null,
  );
});

run("manually entered email is preserved (scrape does not overwrite)", () => {
  assert.equal(shouldApplyScrapedProspectEmail("owner@manual.example", "info@homemiamire.com"), false);
  assert.equal(shouldApplyScrapedProspectEmail(null, "info@homemiamire.com"), true);
  assert.equal(shouldApplyScrapedProspectEmail("", "info@homemiamire.com"), true);
});

run("no-email site yields empty list", () => {
  const contacts = extractPublicContactsFromHtml(
    `<html><body><h1>Welcome</h1><p>Call us soon</p></body></html>`,
    "https://no-email.example/",
  );
  assert.equal(contacts.emails.length, 0);
  assert.equal(
    selectBestProspectEmail(contacts.emails, { websiteUrl: "https://no-email.example/" }),
    null,
  );
});

console.log("prospect-website-email-ranking.test.ts: all assertions passed");
