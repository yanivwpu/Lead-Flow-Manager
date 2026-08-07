/**
 * Growth Engine CTAs must not send authenticated users to public marketing pages.
 * Run: npx tsx --test tests/growth-engine-prospect-ai-routing.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getGrowthEngineBySlug,
  GROWTH_ENGINE_CARDS,
} from "../client/src/lib/growthEnginesCatalog";
import { PROSPECT_AI_PATH } from "../client/src/lib/prospectAi";
import { PROSPECT_AI_LANDING_PATH } from "../client/src/content/prospectAiLandingContent";

const root = process.cwd();

test("authenticated Growth Engine Prospect AI Open/Activate → internal workspace", () => {
  const card = getGrowthEngineBySlug("prospect-ai");
  assert.ok(card);
  assert.equal(card!.detailHref, PROSPECT_AI_PATH);
  assert.equal(card!.detailHref, "/app/prospect-ai");
  assert.notEqual(card!.detailHref, "/prospect-ai");
  assert.ok(
    String(card!.detailHref || "").startsWith("/app/"),
    "in-app detailHref must be an authenticated /app route",
  );

  const templates = readFileSync(join(root, "client/src/pages/Templates.tsx"), "utf8");
  assert.ok(templates.includes("PROSPECT_AI_PATH"));
  assert.ok(
    templates.includes("isProspectAi") && templates.includes("PROSPECT_AI_PATH"),
    "gallery CTA must route Prospect AI via PROSPECT_AI_PATH",
  );
  // Ensure we do not navigate to the public landing from the gallery card CTA path.
  assert.ok(!templates.includes('detailHref: "/prospect-ai"'));
});

test("public Prospect AI marketing CTA → public /prospect-ai landing", () => {
  const card = getGrowthEngineBySlug("prospect-ai");
  assert.equal(card?.marketingHref, "/prospect-ai");
  assert.equal(PROSPECT_AI_LANDING_PATH, "/prospect-ai");

  const app = readFileSync(join(root, "client/src/App.tsx"), "utf8");
  assert.match(app, /path="\/prospect-ai"/);
  assert.ok(app.includes("ProspectAiLanding"));

  const pricing = readFileSync(
    join(root, "client/src/components/pricing/PricingMarketingSections.tsx"),
    "utf8",
  );
  assert.ok(pricing.includes('loggedIn ? PROSPECT_AI_PATH : "/prospect-ai"'));

  const landing = readFileSync(
    join(root, "client/src/content/prospectAiLandingContent.ts"),
    "utf8",
  );
  assert.ok(landing.includes('"/prospect-ai"') || landing.includes("PROSPECT_AI_LANDING_PATH"));
});

test("Growth Engine catalog does not conflate marketing URLs with in-app CTAs", () => {
  for (const engine of GROWTH_ENGINE_CARDS) {
    if (engine.status !== "available") continue;
    assert.ok(engine.detailHref, `${engine.slug} available engines need detailHref`);
    assert.ok(
      engine.detailHref!.startsWith("/app/"),
      `${engine.slug} detailHref must be /app/... (got ${engine.detailHref})`,
    );
    if (engine.marketingHref) {
      assert.ok(
        !engine.marketingHref.startsWith("/app/"),
        `${engine.slug} marketingHref should stay public`,
      );
      assert.notEqual(engine.marketingHref, engine.detailHref);
    }
  }

  const rge = getGrowthEngineBySlug("realtor-growth-engine");
  assert.equal(rge?.detailHref, "/app/templates/realtor-growth-engine");
});

test("Prospect AI artwork overlay badge remains removed; intro stays full width", () => {
  const templates = readFileSync(join(root, "client/src/pages/Templates.tsx"), "utf8");
  assert.ok(!/isProspectAi \? \(\s*<div className="pointer-events-none absolute left-3 top-3/.test(templates));
  const introStart = templates.indexOf("function GrowthEnginesTab()");
  const introSlice = templates.slice(introStart, introStart + 2200);
  assert.ok(introSlice.includes("w-full max-w-none"));
  assert.ok(!introSlice.includes("max-w-2xl"));
  assert.ok(templates.includes("object-contain p-3 sm:p-3.5"));
});

test("Prospect AI plan allowance box is compact and scannable", async () => {
  const { prospectDiscoveriesCatalogLines } = await import("../client/src/lib/prospectAi");
  const { PROSPECT_AI_MONTHLY_QUOTAS } = await import("../shared/prospectAI");
  const block = prospectDiscoveriesCatalogLines();
  assert.equal(block.title, "Included with your plan");
  assert.deepEqual(
    block.rows.map((r) => r.plan),
    ["Free", "Starter", "Pro"],
  );
  assert.equal(block.rows[0]!.allowance, `${PROSPECT_AI_MONTHLY_QUOTAS.free} discoveries/mo`);
  assert.equal(block.rows[1]!.allowance, `${PROSPECT_AI_MONTHLY_QUOTAS.starter} discoveries/mo`);
  assert.equal(block.rows[2]!.allowance, `${PROSPECT_AI_MONTHLY_QUOTAS.pro} discoveries/mo`);
  assert.ok(!block.lines.some((l) => /Prospect Discoveries/i.test(l)));

  const templates = readFileSync(join(root, "client/src/pages/Templates.tsx"), "utf8");
  assert.ok(templates.includes("catalogQuota.rows.map"));
  assert.ok(templates.includes('min-w-[3.75rem] font-semibold'));
});
