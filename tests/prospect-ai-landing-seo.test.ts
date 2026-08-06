/**
 * Prospect AI SEO landing — meta, FAQ schema, route wiring.
 * Run: npx tsx tests/prospect-ai-landing-seo.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  PROSPECT_AI_LANDING,
  PROSPECT_AI_LANDING_PATH,
  PROSPECT_AI_LANDING_SEO,
} from "../client/src/content/prospectAiLandingContent";
import { SEO_CLUSTER_LINKS } from "../client/src/content/seo/sharedLinks";
import { PAGE_META } from "../server/seo";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const root = process.cwd();

run("SEO title and description are strong and natural", () => {
  assert.match(PROSPECT_AI_LANDING_SEO.title, /Prospect AI/);
  assert.match(PROSPECT_AI_LANDING_SEO.title, /AI Sales Team/);
  assert.ok(PROSPECT_AI_LANDING_SEO.description.length >= 120);
  assert.ok(PROSPECT_AI_LANDING_SEO.description.length <= 170);
  assert.doesNotMatch(PROSPECT_AI_LANDING_SEO.description, /(AI Sales Assistant.*){3,}/i);
});

run("primary keywords appear naturally in page copy", () => {
  const blob = [
    PROSPECT_AI_LANDING_SEO.title,
    PROSPECT_AI_LANDING_SEO.description,
    PROSPECT_AI_LANDING_SEO.keywords,
    ...PROSPECT_AI_LANDING.pain.paragraphs,
    ...PROSPECT_AI_LANDING.meetTeam.paragraphs,
    ...PROSPECT_AI_LANDING.faqs.map((f) => `${f.question} ${f.answer}`),
  ].join(" ");
  const required = [
    "AI Sales Team",
    "AI prospecting software",
    "local business lead generation",
    "Lead qualification",
    "AI outreach",
    "Unified Inbox",
    "Prospecting CRM",
  ];
  for (const kw of required) {
    assert.match(blob, new RegExp(kw, "i"), `missing ${kw}`);
  }
});

run("page structure covers required sections", () => {
  assert.equal(PROSPECT_AI_LANDING.brand, "Prospect AI");
  assert.equal(PROSPECT_AI_LANDING.h1, "Meet Your AI Sales Team");
  assert.equal(PROSPECT_AI_LANDING.primaryCta, "Start Free Trial");
  assert.equal(PROSPECT_AI_LANDING.secondaryCta, "Watch Demo");
  assert.ok(PROSPECT_AI_LANDING.howItWorks.steps.length === 5);
  assert.ok(PROSPECT_AI_LANDING.featureSections.length >= 4);
  assert.ok(PROSPECT_AI_LANDING.faqs.length >= 10);
  assert.ok(PROSPECT_AI_LANDING.platform.items.includes("WhatsApp"));
  assert.ok(PROSPECT_AI_LANDING.platform.items.includes("Gmail"));
});

run("route, PAGE_META, sitemap, footer, and cluster link are wired", () => {
  assert.equal(PROSPECT_AI_LANDING_PATH, "/prospect-ai");
  assert.ok(PAGE_META["/prospect-ai"]);
  assert.match(PAGE_META["/prospect-ai"].title, /Prospect AI/);
  assert.ok(PAGE_META["/prospect-ai"].ogImage?.includes("og-prospect-ai"));
  assert.equal(SEO_CLUSTER_LINKS.prospectAi.href, "/prospect-ai");

  const app = readFileSync(join(root, "client/src/App.tsx"), "utf8");
  assert.match(app, /path="\/prospect-ai"/);
  assert.match(app, /ProspectAiLanding/);

  const sitemap = readFileSync(join(root, "client/public/sitemap.xml"), "utf8");
  assert.match(sitemap, /whachatcrm\.com\/prospect-ai/);

  const footer = readFileSync(join(root, "client/src/components/SiteFooter.tsx"), "utf8");
  assert.match(footer, /href="\/prospect-ai"/);
});

run("landing page includes FAQ schema + OG/Twitter tags", () => {
  const page = readFileSync(join(root, "client/src/pages/ProspectAiLanding.tsx"), "utf8");
  assert.match(page, /FAQPage/);
  assert.match(page, /SoftwareApplication/);
  assert.match(page, /og:title/);
  assert.match(page, /twitter:card/);
  assert.match(page, /C\.secondaryCta|Watch Demo/);
  assert.match(page, /C\.primaryCta|Start Free Trial/);
  assert.equal(PROSPECT_AI_LANDING.secondaryCta, "Watch Demo");
  assert.equal(PROSPECT_AI_LANDING.primaryCta, "Start Free Trial");
});

run("screenshot assets exist", () => {
  for (const name of [
    "prospect-ai-discover.png",
    "prospect-ai-review.png",
    "prospect-ai-campaign.png",
  ]) {
    assert.ok(
      existsSync(join(root, "client/public/images/screenshots", name)),
      name,
    );
  }
  assert.ok(existsSync(join(root, "client/public/og/og-prospect-ai.png")));
});

console.log("\nAll prospect AI landing SEO tests passed.");
