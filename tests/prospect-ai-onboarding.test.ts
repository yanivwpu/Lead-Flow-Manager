/**
 * Prospect AI first-time onboarding — storage, UI wiring, user guide.
 * Run: npx tsx --test tests/prospect-ai-onboarding.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("onboarding storage helpers exist and key by user", () => {
  const src = readFileSync(join(root, "client/src/lib/prospectAiOnboarding.ts"), "utf8");
  assert.ok(src.includes("prospect-ai-onboarding-complete"));
  assert.ok(src.includes("isProspectAiOnboardingComplete"));
  assert.ok(src.includes("markProspectAiOnboardingComplete"));
  assert.ok(src.includes("focusProspectAiDiscoverForm"));
  assert.ok(src.includes("pai-business-type"));
  for (const ev of [
    "prospect_ai_guide_viewed",
    "prospect_ai_guide_skipped",
    "prospect_ai_guide_completed",
    "prospect_ai_guide_reopened",
    "prospect_ai_discover_dialog_auto_opened",
    "prospect_ai_first_discovery_started",
  ]) {
    assert.ok(src.includes(ev), ev);
  }
});

test("Prospect AI page gates first-time guide and exposes reopen link", () => {
  const page = readFileSync(join(root, "client/src/pages/ProspectAI.tsx"), "utf8");
  assert.ok(page.includes("ProspectAiOnboarding"));
  assert.ok(page.includes("isProspectAiOnboardingComplete"));
  assert.ok(page.includes("prospect-ai-guide-link"));
  assert.ok(page.includes("autoFocusDiscover"));
  assert.ok(page.includes("focusProspectAiDiscoverForm"));
  assert.ok(page.includes("Finish & Discover") || page.includes("finishDiscover"));
});

test("onboarding page is a single scrollable experience (not a wizard)", () => {
  const ui = readFileSync(
    join(root, "client/src/components/prospectAi/ProspectAiOnboarding.tsx"),
    "utf8",
  );
  assert.ok(ui.includes("Meet Your AI Sales Team"));
  assert.ok(ui.includes("See How It Works"));
  assert.ok(ui.includes("Skip Guide"));
  assert.ok(ui.includes("What is Normal?"));
  assert.ok(ui.includes("Your Prospect AI Workflow"));
  assert.ok(ui.includes("prospect-ai-workflow-illustration"));
  assert.ok(ui.includes("Finish & Discover Businesses"));
  assert.ok(ui.includes("View Full User Guide"));
  assert.ok(ui.includes("AI sales employee"));
  assert.ok(!ui.includes("Next step") && !ui.includes("stepIndex"));
});

test("onboarding includes optional AI Brain education before You're Ready", async () => {
  const ui = readFileSync(
    join(root, "client/src/components/prospectAi/ProspectAiOnboarding.tsx"),
    "utf8",
  );
  const page = readFileSync(join(root, "client/src/pages/ProspectAI.tsx"), "utf8");
  const edu = readFileSync(join(root, "client/src/content/prospectAiBrainEducation.ts"), "utf8");
  const { PROSPECT_AI_BRAIN_ONBOARDING, PROSPECT_AI_BRAIN_RELATIONSHIP_LINES } = await import(
    "../client/src/content/prospectAiBrainEducation"
  );

  const brainIdx = ui.indexOf("prospect-ai-guide-ai-brain");
  const readyIdx = ui.indexOf("You're Ready");
  assert.ok(brainIdx >= 0 && readyIdx > brainIdx, "AI Brain section must precede You're Ready");
  assert.ok(ui.includes("PROSPECT_AI_BRAIN_ONBOARDING"));
  assert.ok(ui.includes("PROSPECT_AI_BRAIN_RELATIONSHIP_LINES"));
  assert.ok(ui.includes("prospect-ai-guide-learn-ai-brain"));
  assert.ok(ui.includes("aiBrainActive"));
  assert.ok(edu.includes(PROSPECT_AI_BRAIN_ONBOARDING.heading));
  assert.ok(edu.includes(PROSPECT_AI_BRAIN_ONBOARDING.ctaLabel));
  assert.ok(edu.includes("Optional"));
  assert.ok(edu.includes(PROSPECT_AI_BRAIN_ONBOARDING.activeConfirmation));
  assert.ok(edu.includes(PROSPECT_AI_BRAIN_RELATIONSHIP_LINES[0]));
  assert.ok(edu.includes(PROSPECT_AI_BRAIN_RELATIONSHIP_LINES[1]));
  assert.ok(edu.includes("optional intelligence layer"));
  assert.ok(!edu.includes("Upgrade Now"));
  assert.ok(!edu.includes("Unlock Prospect AI"));
  assert.ok(!edu.includes("Get Better Discovery"));
  assert.ok(!/\bRequired\b/.test(PROSPECT_AI_BRAIN_ONBOARDING.heading));
  assert.ok(page.includes("aiBrainActive={aiBrainActive}"));
  assert.ok(page.includes("effectiveHasAIBrain"));
});

test("User Guide includes Prospect AI chapter and FAQ", async () => {
  const guide = readFileSync(join(root, "client/src/content/help/userGuideContent.ts"), "utf8");
  const { PROSPECT_AI_BRAIN_FAQ } = await import("../client/src/content/prospectAiBrainEducation");
  assert.ok(guide.includes('id: "prospect-ai"'));
  assert.ok(guide.includes("Discover Businesses"));
  assert.ok(guide.includes("Understanding AI Decisions"));
  assert.ok(guide.includes("AI Brain (Optional)"));
  assert.ok(guide.includes("Why is a business Not Qualified?"));
  assert.ok(guide.includes("Why is email missing?"));
  assert.ok(guide.includes("Why does Enrichment Unavailable happen?"));
  assert.ok(guide.includes("Can I edit prospect information manually?"));
  assert.ok(guide.includes("How does Prospect AI qualify businesses?"));
  assert.ok(guide.includes("PROSPECT_AI_BRAIN_FAQ"));
  assert.ok(guide.includes("PROSPECT_AI_BRAIN_OPTIONAL_SUMMARY"));
  assert.ok(guide.includes("AI Brain is optional"));
  assert.equal(PROSPECT_AI_BRAIN_FAQ.question, "Do I need AI Brain to use Prospect AI?");
  assert.match(PROSPECT_AI_BRAIN_FAQ.answer, /works without AI Brain/i);
  assert.match(PROSPECT_AI_BRAIN_FAQ.answer, /Prospect AI finds and qualifies opportunities/);
  assert.match(PROSPECT_AI_BRAIN_FAQ.answer, /AI Brain adds your business intelligence/);
});
