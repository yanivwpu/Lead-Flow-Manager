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

// 1–5. Assistant counts from shared work-state resolver
{
  const model = buildAiGrowthAssistantModel([
    { analysisStatus: "processing", reviewStatus: "pending", enrichmentStatus: "none" },
    { analysisStatus: "processing", reviewStatus: "pending", enrichmentStatus: "none" },
    {
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "enriching",
      websiteUrl: "https://example.com",
      email: "a@b.com",
    },
    {
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "completed",
      enrichmentEmailFound: true,
      websiteUrl: "https://example.com",
      email: "b@c.com",
    },
    {
      analysisStatus: "completed",
      reviewStatus: "pending",
      enrichmentStatus: "none",
      email: "d@e.com",
    },
  ]);
  assert.equal(model.idle, false);
  assert.ok(model.lines.some((l) => /Reviewing 2/i.test(l.text) || /being enriched/i.test(l.text)));
  assert.ok(model.lines.some((l) => /enriched successfully|being enriched|need review/i.test(l.text)));
  assert.ok(model.nextAction);
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
    },
  ]);
  assert.equal(model.idle, true);
  assert.ok(!model.lines.some((l) => /Found public contact/i.test(l.text)));
}

// Idle only when no background work — never claim “caught up” while reviews wait
{
  const idle = buildAiGrowthAssistantModel([
    {
      analysisStatus: "completed",
      reviewStatus: "pending",
      enrichmentStatus: "none",
      email: "a@b.com",
    },
  ]);
  assert.equal(idle.idle, true);
  assert.ok(!idle.lines.some((l) => /caught up/i.test(l.text)));
  assert.ok(idle.lines.some((l) => /need(s)? review/i.test(l.text)));
  assert.ok(idle.nextAction && /Select prospects to enrich/i.test(idle.nextAction));
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
  assert.ok(!caughtUp.lines.some((l) => /need review/i.test(l.text)));
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

console.log("prospect-ai-personality.test.ts: all assertions passed");
