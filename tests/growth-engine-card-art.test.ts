/**
 * Growth Engine gallery artwork — storytelling + design-system checks.
 * Run: npx tsx --test tests/growth-engine-card-art.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("Prospect AI uses approved V2B PNG; Included badge stays in card body only", () => {
  const catalog = readFileSync(join(root, "client/src/lib/growthEnginesCatalog.ts"), "utf8");
  const templates = readFileSync(join(root, "client/src/pages/Templates.tsx"), "utf8");
  const art = readFileSync(
    join(root, "client/src/components/growthEngines/ProspectAiCardArt.tsx"),
    "utf8",
  );

  assert.ok(existsSync(join(root, "client/public/og/prospect-ai-growth-engine.png")));
  assert.ok(catalog.includes('image: "/og/prospect-ai-growth-engine.png"'));
  assert.ok(catalog.includes("Included with Every Plan"));
  assert.ok(catalog.includes("Included with your plan"));
  assert.ok(!catalog.includes('"Featured"'));
  // Artwork must stay unobstructed — no overlay badge on Prospect AI image.
  assert.ok(
    !templates.includes("Included with Every Plan\n              <Star") &&
      !/isProspectAi \? \(\s*<div className="pointer-events-none absolute left-3 top-3/.test(templates),
    "Prospect AI artwork must not overlay Included with Every Plan",
  );
  assert.ok(!templates.includes(">Featured<") && !templates.includes("\n              Featured\n"));
  assert.ok(art.includes("DISCOVER • QUALIFY • ENGAGE"));
  assert.ok(art.includes("Your AI Sales Team"));
  assert.ok(art.includes("#0B1F3A") || art.includes("#22D3EE"));
  assert.ok(!art.includes("feGaussianBlur"));
  assert.ok(!art.includes("DISCOVER • QUALIFY • OUTREACH"));
});

test("Growth Engines intro is concise and keeps the grid close to the heading", () => {
  const templates = readFileSync(join(root, "client/src/pages/Templates.tsx"), "utf8");
  const introStart = templates.indexOf("function GrowthEnginesTab()");
  assert.ok(introStart >= 0);
  const introSlice = templates.slice(introStart, introStart + 5000);
  assert.ok(introSlice.includes("Ready-to-run Growth Engines"));
  assert.ok(!introSlice.includes("max-w-2xl"), "intro must not use max-w-2xl");
  assert.ok(!introSlice.includes("max-w-xl"), "intro must not use max-w-xl");
  assert.ok(introSlice.includes("Every current and future Growth Engine is included with Pro"));
  assert.ok(introSlice.includes("overflow-visible"));
});

test("gallery cards use compact icons instead of image banners", () => {
  const templates = readFileSync(join(root, "client/src/pages/Templates.tsx"), "utf8");
  const cardStart = templates.indexOf("function GrowthEngineGalleryCard(");
  assert.ok(cardStart >= 0);
  const cardSlice = templates.slice(cardStart, cardStart + 7000);
  assert.ok(cardSlice.includes("const EngineIcon"));
  assert.ok(cardSlice.includes('<EngineIcon className="h-5 w-5"'));
  assert.ok(!cardSlice.includes("<img"), "compact cards must not render catalog image banners");
  assert.ok(!cardSlice.includes("GrowthEngineStoryArt"), "compact cards must not render decorative art");
});

test("gallery card metadata does not constrain the engine title width", () => {
  const templates = readFileSync(join(root, "client/src/pages/Templates.tsx"), "utf8");
  const cardStart = templates.indexOf("function GrowthEngineGalleryCard(");
  const cardSlice = templates.slice(cardStart, cardStart + 7000);
  const metadataStart = cardSlice.indexOf('<div className="flex items-center justify-between gap-3">');
  const titleStart = cardSlice.indexOf("<h3", metadataStart);

  assert.ok(metadataStart >= 0, "icon/category and status should share a compact metadata row");
  assert.ok(titleStart > metadataStart, "title should follow the metadata row");
  assert.ok(
    cardSlice.lastIndexOf("</div>", titleStart) > metadataStart,
    "metadata row should close before the full-width title",
  );
  assert.ok(!cardSlice.slice(titleStart, titleStart + 250).includes("truncate"));
  assert.ok(!cardSlice.slice(titleStart, titleStart + 250).includes("whitespace-nowrap"));
  assert.ok(!cardSlice.slice(titleStart, titleStart + 250).includes("max-w-"));
});

test("Coming-soon engines use neutral icon treatment and stay non-installable", () => {
  const templates = readFileSync(join(root, "client/src/pages/Templates.tsx"), "utf8");
  assert.ok(templates.includes('isComingSoon ? "border-slate-200 bg-slate-50 text-slate-500"'));
  assert.ok(templates.includes("disabled\n              aria-disabled"));
  assert.ok(templates.includes("Coming soon"));
});

test("Design system color hierarchy is documented in gallery wiring", () => {
  const catalog = readFileSync(join(root, "client/src/lib/growthEnginesCatalog.ts"), "utf8");
  assert.ok(catalog.includes("/og/og-realtor-growth-engine.png"));
  assert.ok(catalog.includes("/og/prospect-ai-growth-engine.png"));
});
