/**
 * Growth Engine gallery artwork — storytelling + design-system checks.
 * Run: npx tsx --test tests/growth-engine-card-art.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("Prospect AI uses approved V2B PNG and Included badge", () => {
  const catalog = readFileSync(join(root, "client/src/lib/growthEnginesCatalog.ts"), "utf8");
  const templates = readFileSync(join(root, "client/src/pages/Templates.tsx"), "utf8");
  const art = readFileSync(
    join(root, "client/src/components/growthEngines/ProspectAiCardArt.tsx"),
    "utf8",
  );

  assert.ok(existsSync(join(root, "client/public/og/prospect-ai-growth-engine.png")));
  assert.ok(catalog.includes('image: "/og/prospect-ai-growth-engine.png"'));
  assert.ok(catalog.includes("Included with Every Plan"));
  assert.ok(!catalog.includes('"Featured"'));
  assert.ok(templates.includes("Included with Every Plan"));
  assert.ok(!templates.includes(">Featured<") && !templates.includes("\n              Featured\n"));
  assert.ok(art.includes("DISCOVER • QUALIFY • ENGAGE"));
  assert.ok(art.includes("Your AI Sales Team"));
  assert.ok(art.includes("#0B1F3A") || art.includes("#22D3EE"));
  assert.ok(!art.includes("feGaussianBlur"));
  assert.ok(!art.includes("DISCOVER • QUALIFY • OUTREACH"));
});

test("Coming-soon engines use neutral slate placeholder art", () => {
  const story = readFileSync(
    join(root, "client/src/components/growthEngines/GrowthEngineStoryArt.tsx"),
    "utf8",
  );
  const templates = readFileSync(join(root, "client/src/pages/Templates.tsx"), "utf8");
  assert.ok(story.includes("Neutral placeholder") || story.includes("slate"));
  assert.ok(story.includes("#475569") || story.includes("#64748B"));
  assert.ok(!story.includes("#059669"), "placeholders must not use Realtor emerald");
  assert.ok(!story.includes("#064e3b"));
  assert.ok(story.includes("TENANTS • LEASING • FOLLOW-UP"));
  assert.ok(templates.includes("GrowthEngineStoryArt"));
});

test("Design system color hierarchy is documented in gallery wiring", () => {
  const catalog = readFileSync(join(root, "client/src/lib/growthEnginesCatalog.ts"), "utf8");
  assert.ok(catalog.includes("/og/og-realtor-growth-engine.png"));
  assert.ok(catalog.includes("/og/prospect-ai-growth-engine.png"));
});
