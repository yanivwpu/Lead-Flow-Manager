/**
 * Prospect website visibility display helpers.
 * Run: npx tsx tests/prospect-website-display.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeProspectWebsiteHref,
  prospectWebsiteDomain,
  resolveProspectDisplayWebsiteUrl,
  resolveProspectWebsiteDetailState,
} from "../shared/prospectWebsiteDisplay";

const root = join(import.meta.dirname, "..");

assert.equal(normalizeProspectWebsiteHref("https://www.example.com/path"), "https://www.example.com/path");
assert.equal(normalizeProspectWebsiteHref("example.com"), "https://example.com/");
assert.equal(normalizeProspectWebsiteHref(""), null);
assert.equal(normalizeProspectWebsiteHref(null), null);
assert.equal(normalizeProspectWebsiteHref("ftp://bad.example"), null);

assert.equal(prospectWebsiteDomain("https://www.bright-dental.example/contact"), "bright-dental.example");
assert.equal(prospectWebsiteDomain("example.com"), "example.com");
assert.equal(prospectWebsiteDomain(null), null);

assert.equal(
  resolveProspectDisplayWebsiteUrl({
    websiteUrl: "https://a.example",
    websiteUrlUsed: "https://b.example",
  }),
  "https://a.example/",
);
assert.equal(
  resolveProspectDisplayWebsiteUrl({
    websiteUrl: null,
    websiteUrlUsed: "https://b.example",
  }),
  "https://b.example/",
);
assert.equal(
  resolveProspectDisplayWebsiteUrl({ websiteUrl: null, websiteUrlUsed: null }),
  null,
);

assert.equal(
  resolveProspectWebsiteDetailState({
    websiteUrl: null,
    enrichmentStatus: "none",
  }),
  "no_website",
);
assert.equal(
  resolveProspectWebsiteDetailState({
    websiteUrl: "https://x.example",
    enrichmentStatus: "none",
  }),
  "not_analyzed",
);
assert.equal(
  resolveProspectWebsiteDetailState({
    websiteUrl: "https://x.example",
    enrichmentStatus: "pending",
  }),
  "analyzing",
);
assert.equal(
  resolveProspectWebsiteDetailState({
    websiteUrl: "https://x.example",
    enrichmentStatus: "enriching",
  }),
  "analyzing",
);
assert.equal(
  resolveProspectWebsiteDetailState({
    websiteUrl: "https://x.example",
    enrichmentStatus: "completed",
  }),
  "analyzed",
);
assert.equal(
  resolveProspectWebsiteDetailState({
    websiteUrl: "https://x.example",
    enrichmentStatus: "failed",
  }),
  "failed",
);
assert.equal(
  resolveProspectWebsiteDetailState({
    websiteUrl: null,
    websiteUrlUsed: "https://fallback.example",
    enrichmentStatus: "failed",
  }),
  "failed",
);

const panelSrc = readFileSync(
  join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
  "utf8",
);
assert.ok(panelSrc.includes("ProspectWebsiteGlobeIcon"));
assert.ok(panelSrc.includes('data-testid="pi-row-website-icon"'));
assert.ok(panelSrc.includes('data-testid="pi-website-section"'));
assert.ok(panelSrc.includes("No website available for analysis"));
assert.ok(panelSrc.includes("Website analysis could not be completed"));
assert.ok(panelSrc.includes("Status: Not analyzed yet"));
assert.ok(panelSrc.includes("Retry Website Intelligence"));
assert.ok(!panelSrc.includes("enrichmentErrorMessage"));
assert.ok(panelSrc.includes("target=\"_blank\""));
assert.ok(panelSrc.includes("rel=\"noopener noreferrer\""));
assert.ok(panelSrc.includes("prospectWebsiteDomain"));

const serviceSrc = readFileSync(
  join(root, "server/prospectImport/prospectIntelligenceService.ts"),
  "utf8",
);
assert.ok(serviceSrc.includes("websiteUrl: resolveProspectWebsiteUrl(contact)"));

const typeSrc = readFileSync(join(root, "shared/prospectImport.ts"), "utf8");
assert.ok(typeSrc.includes("websiteUrl?: string | null"));

console.log("prospect-website-display.test.ts: ok");
