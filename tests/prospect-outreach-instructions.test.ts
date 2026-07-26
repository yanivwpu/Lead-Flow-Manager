/**
 * Prospect AI Outreach Instructions + subject generation.
 * Run: npx tsx tests/prospect-outreach-instructions.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildProspectOutreachSubject,
  formatOutreachInstructionsForPrompt,
  isOutreachInstructionsConfigured,
  normalizeOutreachInstructionsForSave,
  parseOutreachInstructions,
  PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
  resolveProspectOutreachSubject,
} from "../shared/prospectOutreachInstructions";
import { PROSPECT_OUTREACH_DEFAULT_SETTINGS } from "../shared/prospectBulkOutreach";
import { resolveProspectApproveOutreachUi } from "../shared/prospectContactEnrichment";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("tone/length/personalize defaults", () => {
  const d = PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS;
  assert.equal(d.tone, "professional");
  assert.equal(d.length, "short");
  assert.equal(d.personalize, true);
  assert.equal(d.customInstructions, "");
  assert.equal(PROSPECT_OUTREACH_DEFAULT_SETTINGS.outreachInstructionsConfigured, false);
});

run("Outreach Instructions save/load parse", () => {
  assert.equal(isOutreachInstructionsConfigured({}), false);
  assert.equal(isOutreachInstructionsConfigured(null), false);
  const saved = normalizeOutreachInstructionsForSave({
    customInstructions: "Keep it short",
    tone: "friendly",
    length: "medium",
    personalize: false,
  });
  assert.equal(isOutreachInstructionsConfigured(saved), true);
  const parsed = parseOutreachInstructions(saved);
  assert.equal(parsed.customInstructions, "Keep it short");
  assert.equal(parsed.tone, "friendly");
  assert.equal(parsed.length, "medium");
  assert.equal(parsed.personalize, false);
});

run("invalid tone/length fall back to defaults", () => {
  const parsed = parseOutreachInstructions({ tone: "loud", length: "essay", personalize: "yes" });
  assert.equal(parsed.tone, "professional");
  assert.equal(parsed.length, "short");
  assert.equal(parsed.personalize, true);
});

run("saved custom instructions are passed into subject/message generation prompt", () => {
  const block = formatOutreachInstructionsForPrompt({
    customInstructions: "Avoid Idea for subjects. Focus on lead response speed.",
    tone: "direct",
    length: "short",
    personalize: true,
  });
  assert.ok(block.includes("PROSPECT AI OUTREACH INSTRUCTIONS"));
  assert.ok(block.includes("Avoid Idea for subjects"));
  assert.ok(block.includes("Tone: direct"));
  assert.ok(block.includes("suggestedOutreachSubject"));
  assert.ok(!block.includes("AI BRAIN"));
});

run("default subject generation no longer relies on rigid Idea for {Business}", () => {
  const a = buildProspectOutreachSubject("Catalyst Marketing");
  const b = buildProspectOutreachSubject("Blank Box Digital Marketing");
  assert.ok(!/^Idea for /i.test(a), `unexpected rigid subject: ${a}`);
  assert.ok(!/^Idea for /i.test(b), `unexpected rigid subject: ${b}`);
  assert.ok(a.length > 0);
  assert.notEqual(a, "Idea for Catalyst Marketing");
});

run("resolve prefers saved subject over fallback", () => {
  assert.equal(
    resolveProspectOutreachSubject({
      savedSubject: "Custom subject for Acme",
      prospectName: "Acme",
    }),
    "Custom subject for Acme",
  );
  const fallback = resolveProspectOutreachSubject({
    savedSubject: null,
    prospectName: "Acme Agency",
  });
  assert.ok(fallback.length > 0);
  assert.ok(!/^Idea for /i.test(fallback));
});

run("Campaign AI Assistant Configure vs Edit wiring", () => {
  const panel = readFileSync(
    join(process.cwd(), "client/src/components/settings/ProspectOutreachQueuePanel.tsx"),
    "utf8",
  );
  assert.ok(panel.includes("pi-outreach-instructions-configure"));
  assert.ok(panel.includes("pi-outreach-instructions-edit"));
  assert.ok(panel.includes("Outreach Instructions Set"));
  assert.ok(panel.includes("OutreachInstructionsModal"));
  assert.ok(!panel.includes("Discover"));
});

run("Review detail exposes editable Email Subject", () => {
  const panel = readFileSync(
    join(process.cwd(), "client/src/components/settings/ProspectIntelligencePanel.tsx"),
    "utf8",
  );
  assert.ok(panel.includes("Email Subject"));
  assert.ok(panel.includes('data-testid="pi-email-subject"'));
  assert.ok(panel.includes("suggestedOutreachSubject: editSubject"));
});

run("edited subject persists into queue/send snapshot path", () => {
  const queue = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectOutreachQueueService.ts"),
    "utf8",
  );
  assert.ok(queue.includes("resolveProspectOutreachSubject"));
  assert.ok(queue.includes("savedSubject: pi?.suggestedOutreachSubject"));
  assert.ok(queue.includes("outreachInstructions"));
});

run("changing global instructions does not overwrite existing prospect content (no auto rewrite)", () => {
  const queue = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectOutreachQueueService.ts"),
    "utf8",
  );
  // Settings update only persists instructions — no bulk rewrite of PI rows.
  assert.ok(queue.includes("normalizeOutreachInstructionsForSave"));
  assert.ok(!/update\(prospectIntelligence\).*outreachInstructions/s.test(queue));
});

run("missing-email prospect remains non-sendable", () => {
  const ui = resolveProspectApproveOutreachUi({
    reviewStatus: "approved",
    analysisStatus: "completed",
    email: null,
  });
  assert.equal(ui.showSendOutreach, false);
  assert.ok(ui.emailGateLabel);
});

run("migration 0069 is additive", () => {
  const sql = readFileSync(
    join(process.cwd(), "migrations/0069_prospect_outreach_instructions.sql"),
    "utf8",
  );
  assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS outreach_instructions jsonb"));
  assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS suggested_outreach_subject text"));
  assert.ok(!/DROP |DELETE FROM|TRUNCATE/i.test(sql));
});

run("prompt includes outreach instructions helper", () => {
  const ai = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectIntelligenceAi.ts"),
    "utf8",
  );
  assert.ok(ai.includes("formatOutreachInstructionsForPrompt"));
  assert.ok(ai.includes("suggestedOutreachSubject"));
});

console.log("\nAll prospect-outreach-instructions tests passed.");
