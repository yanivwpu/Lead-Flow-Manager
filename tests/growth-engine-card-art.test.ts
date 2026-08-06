/**
 * Growth Engine gallery artwork — storytelling pattern checks.
 * Run: npx tsx --test tests/growth-engine-card-art.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("Prospect AI art tells Discover → Qualify → Outreach story", () => {
  const src = readFileSync(
    join(root, "client/src/components/growthEngines/ProspectAiCardArt.tsx"),
    "utf8",
  );
  assert.ok(src.includes("DISCOVER • QUALIFY • OUTREACH"));
  assert.ok(src.includes("local businesses"));
  assert.ok(!src.includes("feGaussianBlur"), "no soft-glow cyber sphere filter");
  assert.ok(!src.includes("DISCOVER · ANALYZE · OUTREACH"));
  assert.ok(src.includes("#059669") || src.includes("#34d399"));
});

test("Coming-soon engines use shared dark-green story art", () => {
  const story = readFileSync(
    join(root, "client/src/components/growthEngines/GrowthEngineStoryArt.tsx"),
    "utf8",
  );
  const templates = readFileSync(join(root, "client/src/pages/Templates.tsx"), "utf8");
  assert.ok(story.includes("Industry → AI → Business Outcome") || story.includes("Industry → AI"));
  assert.ok(story.includes("TENANTS • LEASING • FOLLOW-UP"));
  assert.ok(story.includes("CAPTURE • BOOK • RETAIN"));
  assert.ok(story.includes("QUALIFY • NURTURE • CLOSE"));
  assert.ok(story.includes("INTAKE • BOOK • FOLLOW-UP"));
  assert.ok(templates.includes("GrowthEngineStoryArt"));
  assert.ok(!templates.includes("GROWTH_ENGINE_PLACEHOLDER"));
});
