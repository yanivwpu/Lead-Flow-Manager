/**
 * Facebook Page picker authorization copy + Publish listings placement.
 * Run: npx tsx tests/facebook-page-picker-copy.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const wizard = readFileSync(
  join(process.cwd(), "client/src/components/ConnectMetaFbIgWizard.tsx"),
  "utf8",
);
const bp = readFileSync(
  join(process.cwd(), "client/src/components/settings/BusinessProfileSettings.tsx"),
  "utf8",
);
const agent = readFileSync(
  join(process.cwd(), "client/src/components/agentPage/PublicAgentPageSettingsCard.tsx"),
  "utf8",
);

run("explains authorized-only Page list and missing-Page recovery", () => {
  assert.ok(wizard.includes("Only Facebook Pages authorized for WhachatCRM appear here."));
  assert.ok(wizard.includes("Missing a Page?"));
  assert.ok(wizard.includes("Authorize additional Facebook Pages"));
  assert.ok(wizard.includes("No authorized Facebook Pages were returned."));
  assert.ok(wizard.includes("All current and future Pages"));
  assert.ok(wizard.includes("Granting access to multiple Pages does not connect all of them"));
  assert.ok(wizard.includes("Showing {pages.length} authorized Page"));
});

run("does not claim WhachatCRM detects all managed Pages", () => {
  assert.equal(wizard.toLowerCase().includes("all pages you manage"), false);
  assert.equal(wizard.toLowerCase().includes("every page you manage"), false);
});

run("Publish listings publicly is removed from generic Business Profile", () => {
  assert.equal(bp.includes("Publish listings publicly"), false);
  assert.equal(bp.includes("publish-listings-publicly-toggle"), false);
});

run("Publish listings publicly lives on RGE Public Agent Page settings", () => {
  assert.match(agent, /Publish listings publicly/);
  assert.match(agent, /publish-listings-publicly-toggle/);
  assert.match(agent, /publishListingsPublicly/);
});

console.log("\nAll facebook-page-picker-copy tests passed.");
