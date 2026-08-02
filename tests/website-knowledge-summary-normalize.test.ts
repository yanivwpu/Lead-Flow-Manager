/**
 * Website Knowledge summary normalization.
 * Guards the empty-preview production failure: the summarizer answered with a
 * nested JSON envelope, the normalizer passed it through untouched, and the UI
 * preview rendered blank.
 *
 * Run: npx tsx tests/website-knowledge-summary-normalize.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import {
  extractWebsiteKnowledgeSummaryText,
  finalizeWebsiteKnowledgeSummaryText,
} from "../server/websiteKnowledgeSummaryNormalize";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

/** The shape production returned on 2026-08-02 (WK-DIAG trace ccyrwsqt). */
const PRODUCTION_ENVELOPE = JSON.stringify(
  {
    summary: {
      about: "Affordable Pompano is a local magazine focused on Pompano Beach, Florida.",
      guides: [{ title: "First-Timer's Guide", description: "Parking tips and pier walks." }],
      advertising: {
        visibility_packages: [
          { type: "Business Listing", price: "$29/mo", features: "Basic local listing." },
          { type: "Featured Business", price: "$59/mo", features: "Enhanced profile." },
          { type: "Homepage Spotlight", price: "$149/mo", features: "Premium homepage exposure." },
          { type: "Category Leader", price: "$299/mo", features: "Top placement in a category." },
        ],
      },
    },
  },
  null,
  2,
);

/** Exercise the shipped client parser rather than a copy of it. */
function loadClientPreviewParser(): (raw: unknown) => string {
  const src = readFileSync(new URL("../client/src/pages/AIBrain.tsx", import.meta.url), "utf8");
  const start = src.indexOf("function websiteKnowledgePreviewToString");
  assert.ok(start >= 0, "websiteKnowledgePreviewToString not found in AIBrain.tsx");
  const end = src.indexOf("\n}", src.indexOf('return "";', start)) + 2;
  const code = transformSync(src.slice(start, end), { loader: "ts" }).code;
  return new Function(`${code}; return websiteKnowledgePreviewToString;`)() as (raw: unknown) => string;
}

run("a nested JSON envelope is flattened instead of stored as raw JSON", () => {
  const out = finalizeWebsiteKnowledgeSummaryText(PRODUCTION_ENVELOPE);
  assert.ok(out.length > 0, "summary must not be empty");
  assert.ok(!out.trimStart().startsWith("{"), "summary must not remain a JSON envelope");
  assert.ok(!out.includes('"visibility_packages"'), "raw JSON keys must not survive");
});

run("every exact price survives normalization", () => {
  const out = finalizeWebsiteKnowledgeSummaryText(PRODUCTION_ENVELOPE);
  for (const price of ["$29", "$59", "$149", "$299"]) {
    assert.ok(out.includes(price), `missing ${price}`);
  }
});

run("plan names stay attached to their prices", () => {
  const out = finalizeWebsiteKnowledgeSummaryText(PRODUCTION_ENVELOPE);
  assert.match(out, /Business Listing — \$29\/mo/);
  assert.match(out, /Category Leader — \$299\/mo/);
});

run("snake_case keys are humanized into readable labels", () => {
  const out = finalizeWebsiteKnowledgeSummaryText(PRODUCTION_ENVELOPE);
  assert.ok(out.includes("Visibility packages:"), "expected humanized key");
  assert.ok(!out.includes("visibility_packages"), "raw key leaked");
});

run("plain prose passes through unchanged", () => {
  const prose = "We charge $29 per month for a basic listing.";
  assert.equal(finalizeWebsiteKnowledgeSummaryText(prose), prose);
});

run("the existing {summary: string} fast path is preserved", () => {
  assert.equal(extractWebsiteKnowledgeSummaryText({ summary: "Plain text summary." }), "Plain text summary.");
  assert.equal(
    extractWebsiteKnowledgeSummaryText(JSON.stringify({ summary: "Plain text summary." })),
    "Plain text summary.",
  );
});

run("arrays of strings still join into paragraphs", () => {
  assert.equal(extractWebsiteKnowledgeSummaryText(["First part.", "Second part."]), "First part.\n\nSecond part.");
});

run("empty and nullish inputs stay empty", () => {
  assert.equal(finalizeWebsiteKnowledgeSummaryText(null), "");
  assert.equal(finalizeWebsiteKnowledgeSummaryText(""), "");
  assert.equal(finalizeWebsiteKnowledgeSummaryText({}), "");
});

run("the client preview parser never blanks a payload it cannot destructure", () => {
  const websiteKnowledgePreviewToString = loadClientPreviewParser();
  // Regression: this returned "" and left the placeholder showing.
  assert.ok(websiteKnowledgePreviewToString(PRODUCTION_ENVELOPE).length > 0);
  // Normal path: the server now sends flattened text straight through.
  const flattened = finalizeWebsiteKnowledgeSummaryText(PRODUCTION_ENVELOPE);
  assert.equal(websiteKnowledgePreviewToString(flattened), flattened);
  assert.equal(websiteKnowledgePreviewToString(""), "");
  assert.equal(websiteKnowledgePreviewToString(null), "");
});

console.log("\nAll website knowledge summary normalization tests passed.");
