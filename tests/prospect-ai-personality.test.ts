/**
 * AI Growth Assistant + personality mappings.
 * Run: npx tsx tests/prospect-ai-personality.test.ts
 */
import assert from "node:assert/strict";
import {
  buildAiGrowthAssistantModel,
  resolveAiPersonalityStatus,
  shouldAnimateAiEmoji,
} from "../shared/prospectAiPersonality";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Busy analyzing — no qualified campaign briefing yet
{
  const model = buildAiGrowthAssistantModel([
    { analysisStatus: "processing", reviewStatus: "pending", enrichmentStatus: "none" },
    { analysisStatus: "processing", reviewStatus: "pending", enrichmentStatus: "none" },
  ]);
  assert.equal(model.idle, false);
  assert.ok(model.lines.some((l) => /Reviewing 2/i.test(l.text)));
}

// Contact-found requires flags — enrichment completed alone is not enough
{
  const model = buildAiGrowthAssistantModel([
    {
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "completed",
      enrichmentEmailFound: false,
      enrichmentPhoneFound: false,
      websiteUrl: "https://example.com",
      email: "x@y.com",
      approvedAt: "2026-07-01T00:00:00.000Z",
      suggestedFirstMessage: "Hi",
    },
  ]);
  assert.equal(model.idle, true);
  assert.ok(!model.lines.some((l) => /Found public contact/i.test(l.text)));
  assert.ok(model.lines.some((l) => /Campaign Ready/i.test(l.text)));
  assert.ok(model.nextAction && /Send all 1 to Campaign/i.test(model.nextAction));
}

// Needs human review path
{
  const idle = buildAiGrowthAssistantModel([
    {
      analysisStatus: "completed",
      reviewStatus: "pending",
      enrichmentStatus: "none",
      email: "a@b.com",
      needsReview: true,
    },
  ]);
  assert.equal(idle.idle, true);
  assert.ok(!idle.lines.some((l) => /caught up/i.test(l.text)));
  assert.ok(idle.lines.some((l) => /human review/i.test(l.text)));
  assert.ok(idle.nextAction && /Needs Review|decide fit/i.test(idle.nextAction));
}

// Ready + blocked: CTA reviews blocked; next action prefers Review
{
  const model = buildAiGrowthAssistantModel([
    {
      analysisStatus: "completed",
      reviewStatus: "approved",
      approvedAt: "2026-07-01T00:00:00.000Z",
      email: "a@b.com",
      suggestedFirstMessage: "Hi",
    },
    {
      analysisStatus: "completed",
      reviewStatus: "approved",
      approvedAt: "2026-07-01T00:00:00.000Z",
      email: null,
      suggestedFirstMessage: "Hi",
    },
  ]);
  assert.ok(model.lines.some((l) => /1 prospect is ready for Campaign/i.test(l.text)));
  assert.ok(
    model.lines.some((l) => /1 qualified prospect is missing an email address/i.test(l.text)),
  );
  assert.ok(!model.lines.some((l) => /need attention/i.test(l.text)));
  assert.equal(model.cta?.kind, "review_campaign_blocked");
  assert.equal(model.cta?.label, "Review 1 prospect");
  assert.deepEqual(model.blockerLines, []);
  assert.ok(model.nextAction && /Review 1 prospect/i.test(model.nextAction));
}

{
  const caughtUp = buildAiGrowthAssistantModel([
    {
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "completed",
      email: "a@b.com",
      websiteUrl: "https://x.com",
      queueStatus: "queued",
    },
  ]);
  assert.equal(caughtUp.idle, true);
  assert.ok(caughtUp.lines.some((l) => /caught up/i.test(l.text)));
  assert.ok(caughtUp.lines.some((l) => /No prospects require attention/i.test(l.text)));
  assert.ok(!caughtUp.lines.some((l) => /need review|human review/i.test(l.text)));
}

// Qualification emoji/message
{
  const p = resolveAiPersonalityStatus({
    ux: { analysisStatus: "processing", reviewStatus: "pending" },
    seed: "c1",
    tick: 0,
  });
  assert.equal(p.active, true);
  assert.ok(["🤔", "🧐", "💡"].includes(p.emoji));
  assert.ok(/AI is reviewing|Matching it with AI Brain|Preparing an outreach/i.test(p.message));
}

// Enrichment emoji/message (broad truthful)
{
  const p = resolveAiPersonalityStatus({
    ux: {
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "enriching",
    },
    seed: "c2",
    tick: 0,
  });
  assert.equal(p.active, true);
  assert.ok(["🔍", "📖", "📧", "💡"].includes(p.emoji));
  assert.ok(/website|contact details|campaign recommendations/i.test(p.message));
}

// Reduced motion disables animation helper
assert.equal(shouldAnimateAiEmoji(true, true), false);
assert.equal(shouldAnimateAiEmoji(true, false), true);
assert.equal(shouldAnimateAiEmoji(false, false), false);

// GHL Import: no manual Analyze dialog / CTA
{
  const ghl = readFileSync(
    join(process.cwd(), "client/src/components/settings/GhlProspectImport.tsx"),
    "utf8",
  );
  assert.ok(!/AnalyzeConfirmDialog/.test(ghl));
  assert.ok(!/Analyze with AI/.test(ghl));
  assert.ok(/AI qualification started automatically/.test(ghl));
}

// Auto-qualify connected for GHL import
{
  const importSvc = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectImportService.ts"),
    "utf8",
  );
  assert.ok(/enqueueProspectAutoQualification/.test(importSvc));
}

// Assistant model is pure — same inputs → same outputs (no table state mutation)
{
  const items = [
    { analysisStatus: "processing" as const, reviewStatus: "pending" as const },
  ];
  const a = buildAiGrowthAssistantModel(items);
  const b = buildAiGrowthAssistantModel(items);
  assert.deepEqual(a, b);
}

// Panel wires Review CTA to campaign-blocked focus (not a new tab)
{
  const panel = readFileSync(
    join(process.cwd(), "client/src/components/settings/ProspectIntelligencePanel.tsx"),
    "utf8",
  );
  assert.ok(panel.includes("onReviewCampaignBlocked"));
  assert.ok(panel.includes("campaignBlockedFocus"));
  assert.ok(panel.includes("isProspectQualifiedCampaignBlocked"));
  assert.ok(!/PROSPECT_REVIEW_WORK_FILTER_CHIPS[\s\S]*campaign_blocked/.test(panel));
}

console.log("prospect-ai-personality.test.ts: all assertions passed");
