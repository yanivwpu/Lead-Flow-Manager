/**
 * Sales Admin Activation collapsible sections (UI-only).
 * Run: npx tsx tests/admin-activation-collapsible.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ACTIVATION_SECTION_DEFAULT_OPEN,
  formatActivationSectionCount,
} from "../client/src/components/admin/adminActivationSectionState";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function run(name: string, fn: () => void) {
  fn();
  console.log(`✓ ${name}`);
}

run("default section states: overview always open; unmatched collapsed; others open", () => {
  assert.equal(ACTIVATION_SECTION_DEFAULT_OPEN.channels, true);
  assert.equal(ACTIVATION_SECTION_DEFAULT_OPEN.usage, true);
  assert.equal(ACTIVATION_SECTION_DEFAULT_OPEN.funnel, true);
  assert.equal(ACTIVATION_SECTION_DEFAULT_OPEN.unmatchedGhl, false);
  assert.equal(ACTIVATION_SECTION_DEFAULT_OPEN.accounts, true);
});

run("collapsed header counts: unmatched (20) and accounts (48 accounts)", () => {
  assert.equal(formatActivationSectionCount(20), "(20)");
  assert.equal(formatActivationSectionCount(48, "accounts"), "(48 accounts)");
  assert.equal(formatActivationSectionCount(1, "account"), "(1 account)");
});

run("Activation tab wires defaults, full-header chevron triggers, and keeps data fetching independent of collapse", () => {
  const tab = read("client/src/components/admin/AdminActivationTab.tsx");

  assert.match(tab, /Activation overview/);
  const overviewAt = tab.indexOf("Activation overview");
  const firstCollapsibleAt = tab.indexOf("<ActivationSection");
  assert.ok(overviewAt > 0 && firstCollapsibleAt > overviewAt, "overview stays above collapsible sections");

  assert.match(tab, /useState\(ACTIVATION_SECTION_DEFAULT_OPEN\.channels\)/);
  assert.match(tab, /useState\(ACTIVATION_SECTION_DEFAULT_OPEN\.usage\)/);
  assert.match(tab, /useState\(ACTIVATION_SECTION_DEFAULT_OPEN\.funnel\)/);
  assert.match(tab, /useState\(ACTIVATION_SECTION_DEFAULT_OPEN\.unmatchedGhl\)/);
  assert.match(tab, /useState\(ACTIVATION_SECTION_DEFAULT_OPEN\.accounts\)/);

  for (const testId of [
    "activation-section-channels",
    "activation-section-usage",
    "activation-section-funnel",
    "activation-section-unmatched-ghl",
    "activation-section-accounts",
  ]) {
    assert.match(tab, new RegExp(`testId="${testId}"`));
  }

  assert.match(tab, /CollapsibleTrigger/);
  assert.match(tab, /className="flex w-full items-center gap-2/);
  assert.match(tab, /<ChevronDown/);
  assert.match(tab, /open \? "rotate-0" : "-rotate-90"/);

  assert.match(tab, /title="Channel connections"/);
  assert.match(tab, /title="Usage"/);
  assert.match(tab, /title="Activation funnel"/);
  assert.match(tab, /title="Unmatched GHL installs"/);
  assert.match(tab, /title="Account activation"/);

  assert.match(tab, /formatActivationSectionCount\(summary\.unmatchedGhlInstalls!\.length\)/);
  assert.match(tab, /formatActivationSectionCount\(\s*accountsData\?\.total \?\? accountRows\.length,/);

  assert.doesNotMatch(tab, /enabled:\s*(channelsOpen|usageOpen|funnelOpen|unmatchedOpen|accountsOpen)/);
  assert.match(tab, /queryKey: \["\/api\/admin\/activation\/summary"\]/);
  assert.match(tab, /queryKey: \[accountsQuery\]/);

  assert.match(tab, /placeholder="Search name or email"/);
  assert.match(tab, /label: "Source"/);
  assert.match(tab, /label: "Channel"/);
  assert.match(tab, /data-testid=\{\`unmatched-ghl-\$\{row\.id\}`\}/);
  assert.match(tab, /data-testid=\{\`activation-account-\$\{row\.id\}`\}/);
});
