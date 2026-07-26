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
  OutreachInstructionsValidationError,
  parseOutreachInstructions,
  PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
  PROSPECT_OUTREACH_LANGUAGES,
  resolveProspectOutreachSubject,
  validateOutreachLinkUrl,
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

run("tone/length/personalize/language/link defaults", () => {
  const d = PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS;
  assert.equal(d.tone, "professional");
  assert.equal(d.length, "short");
  assert.equal(d.personalize, true);
  assert.equal(d.customInstructions, "");
  assert.equal(d.language, "auto");
  assert.equal(d.linkUrl, "");
  assert.equal(d.includeLinkNaturally, true);
  assert.equal(PROSPECT_OUTREACH_DEFAULT_SETTINGS.outreachInstructionsConfigured, false);
});

run("old {} settings parse with language=auto and empty link", () => {
  const parsed = parseOutreachInstructions({});
  assert.equal(parsed.language, "auto");
  assert.equal(parsed.linkUrl, "");
  assert.equal(parsed.includeLinkNaturally, true);
  assert.equal(isOutreachInstructionsConfigured({}), false);
});

run("Outreach Instructions save/load parse including language", () => {
  assert.equal(isOutreachInstructionsConfigured(null), false);
  const saved = normalizeOutreachInstructionsForSave({
    customInstructions: "Keep it short",
    tone: "friendly",
    length: "medium",
    personalize: false,
    language: "spanish",
    linkUrl: "https://example.com/offer",
    includeLinkNaturally: true,
  });
  assert.equal(isOutreachInstructionsConfigured(saved), true);
  const parsed = parseOutreachInstructions(saved);
  assert.equal(parsed.customInstructions, "Keep it short");
  assert.equal(parsed.tone, "friendly");
  assert.equal(parsed.length, "medium");
  assert.equal(parsed.personalize, false);
  assert.equal(parsed.language, "spanish");
  assert.equal(parsed.linkUrl, "https://example.com/offer");
  assert.equal(parsed.includeLinkNaturally, true);
});

run("english/spanish/hebrew/arabic language values accepted", () => {
  for (const language of PROSPECT_OUTREACH_LANGUAGES) {
    const saved = normalizeOutreachInstructionsForSave({ language });
    assert.equal(saved.language, language);
  }
});

run("invalid tone/length/language fall back to defaults", () => {
  const parsed = parseOutreachInstructions({
    tone: "loud",
    length: "essay",
    personalize: "yes",
    language: "klingon",
  });
  assert.equal(parsed.tone, "professional");
  assert.equal(parsed.length, "short");
  assert.equal(parsed.personalize, true);
  assert.equal(parsed.language, "auto");
});

run("valid https URL saved; empty URL allowed; invalid rejected", () => {
  assert.deepEqual(validateOutreachLinkUrl(""), { ok: true, linkUrl: "" });
  assert.deepEqual(validateOutreachLinkUrl("  https://www.whachatcrm.com/realtor-growth-engine  "), {
    ok: true,
    linkUrl: "https://www.whachatcrm.com/realtor-growth-engine",
  });
  assert.equal(validateOutreachLinkUrl("not-a-url").ok, false);
  assert.equal(validateOutreachLinkUrl("ftp://example.com").ok, false);

  const saved = normalizeOutreachInstructionsForSave({
    linkUrl: "https://www.whachatcrm.com/realtor-growth-engine",
    includeLinkNaturally: true,
  });
  assert.equal(saved.linkUrl, "https://www.whachatcrm.com/realtor-growth-engine");

  const emptyOk = normalizeOutreachInstructionsForSave({ linkUrl: "   " });
  assert.equal(emptyOk.linkUrl, "");

  assert.throws(
    () => normalizeOutreachInstructionsForSave({ linkUrl: "javascript:alert(1)" }),
    (err: unknown) => err instanceof OutreachInstructionsValidationError,
  );
});

run("exact URL preserved in save (no rewrite)", () => {
  const url = "https://www.whachatcrm.com/realtor-growth-engine?ref=qa";
  const saved = normalizeOutreachInstructionsForSave({ linkUrl: url });
  assert.equal(saved.linkUrl, url);
});

run("URL passed into AI prompt only when includeLinkNaturally=true", () => {
  const url = "https://www.whachatcrm.com/realtor-growth-engine";
  const withLink = formatOutreachInstructionsForPrompt({
    ...PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
    language: "english",
    linkUrl: url,
    includeLinkNaturally: true,
  });
  assert.ok(withLink.includes(url));
  assert.ok(withLink.includes("naturally in the outreach message body"));
  assert.ok(withLink.includes("Never put the configured campaign URL in the subject"));

  const disabled = formatOutreachInstructionsForPrompt({
    ...PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
    linkUrl: url,
    includeLinkNaturally: false,
  });
  assert.ok(!disabled.includes(url));
  assert.ok(disabled.includes("automatic inclusion is disabled"));

  const empty = formatOutreachInstructionsForPrompt({
    ...PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
    linkUrl: "",
    includeLinkNaturally: true,
  });
  assert.ok(!empty.includes("https://"));
  assert.ok(empty.includes("No campaign link configured"));
});

run("language instruction reaches subject/message prompt", () => {
  const spanish = formatOutreachInstructionsForPrompt({
    ...PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
    language: "spanish",
  });
  assert.ok(spanish.includes("Language: spanish"));
  assert.ok(spanish.includes("Write the customer-facing subject and message in Spanish."));

  const auto = formatOutreachInstructionsForPrompt({
    ...PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
    language: "auto",
  });
  assert.ok(auto.includes("reliably inferred"));
  assert.ok(auto.includes("Do not guess language from a business name alone"));

  const hebrew = formatOutreachInstructionsForPrompt({
    ...PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
    language: "hebrew",
  });
  assert.ok(hebrew.includes("Hebrew"));
});

run("saved custom instructions are passed into subject/message generation prompt", () => {
  const block = formatOutreachInstructionsForPrompt({
    ...PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
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

run("modal exposes language + optional link controls", () => {
  const modal = readFileSync(
    join(process.cwd(), "client/src/components/prospectAi/OutreachInstructionsModal.tsx"),
    "utf8",
  );
  assert.ok(modal.includes("pi-outreach-language"));
  assert.ok(modal.includes("pi-outreach-link-url"));
  assert.ok(modal.includes("pi-outreach-include-link"));
  assert.ok(modal.includes("validateOutreachLinkUrl"));
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

run("migration 0069 is additive (no new migration required for language/link)", () => {
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

run("no campaign worker/timing changes in this feature", () => {
  const worker = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectOutreachQueueWorker.ts"),
    "utf8",
  );
  assert.ok(worker.includes("processDueQueueItems") || worker.includes("queue"));
  // Language/link live only in shared outreach instructions + modal — not worker.
  assert.ok(!worker.includes("includeLinkNaturally"));
  assert.ok(!worker.includes("PROSPECT_OUTREACH_LANGUAGES"));
});

console.log("\nAll prospect-outreach-instructions tests passed.");
