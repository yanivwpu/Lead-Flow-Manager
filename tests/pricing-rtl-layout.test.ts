/**
 * Deterministic Hebrew Pricing RTL layout guards (no Playwright required).
 * Run: npx tsx --test tests/pricing-rtl-layout.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "fs";
import path from "path";
import { getLocalizedPricingPage } from "../shared/localizeMarketingContent";
import {
  formatHeadingHtmlWithLeadingLtrIsolate,
  splitHebrewAiBidiText,
} from "../shared/rtlLeadingLtrIsolate";

test("Pricing price rows force LTR currency order in RTL", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "client/src/pages/Pricing.tsx"), "utf8");
  assert.ok(src.includes('dir="ltr"'));
  assert.ok(!src.includes('isRTL ? "flex-row-reverse justify-end"'));
  assert.ok(src.includes("overscroll-x-contain"));
  assert.ok(src.includes("overflow-x-hidden"));
  assert.ok(src.includes("min-w-0 max-w-full overflow-x-auto"));
});

test("Pricing FAQ chevron uses logical margin and hides default marker", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "client/src/components/pricing/PricingMarketingSections.tsx"),
    "utf8",
  );
  assert.ok(src.includes("[&::-webkit-details-marker]:hidden"));
  assert.ok(src.includes("ms-auto"));
  assert.ok(src.includes("group-open:rotate-180"));
  assert.ok(src.includes("text-start"));
});

test("Pricing page has no feature/channel pill section; Hebrew template labels stay RTL-safe", () => {
  const pricing = fs.readFileSync(path.join(process.cwd(), "client/src/pages/Pricing.tsx"), "utf8");
  const sections = fs.readFileSync(
    path.join(process.cwd(), "client/src/components/pricing/PricingMarketingSections.tsx"),
    "utf8",
  );
  assert.ok(!pricing.includes("PricingHeroChips"));
  assert.ok(!pricing.includes("SupportedChannelsSection"));
  assert.ok(!sections.includes("section-hero-chips"));
  assert.ok(!sections.includes("section-supported-channels"));
  assert.ok(pricing.includes("section-pricing-hero"));
  assert.ok(pricing.includes("TransparentPricingStrip"));
  assert.ok(pricing.includes("section-pricing-cards"));
  assert.ok(pricing.includes("renderRtlAwareHeadingText"));
  assert.ok(pricing.includes('dir="auto"'));

  const he = getLocalizedPricingPage("he");
  assert.equal(he.hero.h1, "כלים חזקים לצמיחת העסק. תמחור שגדל יחד איתכם.");
  assert.match(he.hero.subtitle, /[\u0590-\u05FF]/);
  assert.match(he.hero.trustLine, /[\u0590-\u05FF]/);
  assert.notEqual(he.hero.h1, getLocalizedPricingPage("en").hero.h1);
  assert.match(he.highlights.basicWhatsappTemplates, /[\u0590-\u05FF]/);
  assert.match(he.highlights.whatsappTemplatesAutomation, /[\u0590-\u05FF]/);
  assert.match(he.compareCells.templateOneToOne, /[\u0590-\u05FF]/);
  assert.match(he.compareCells.templateAutomation, /[\u0590-\u05FF]/);
  assert.equal(he.highlights.basicWhatsappTemplates, "תבניות WhatsApp בסיסיות");
  assert.equal(he.highlights.whatsappTemplatesAutomation, "תבניות WhatsApp + אוטומציה");
});

test("Hebrew Prospect AI Pricing headline keeps stored order and isolates brand", () => {
  const title = getLocalizedPricingPage("he").prospectAi.title;
  assert.equal(title, "Prospect AI כלול — בחינם בכל תוכנית");
  assert.deepEqual(splitHebrewAiBidiText(title), [
    { kind: "brand", text: "Prospect AI" },
    { kind: "text", text: " כלול — בחינם בכל תוכנית" },
  ]);
  assert.equal(
    formatHeadingHtmlWithLeadingLtrIsolate(title, (s) => s),
    '<bdi dir="ltr">Prospect AI</bdi> כלול — בחינם בכל תוכנית',
  );

  const src = fs.readFileSync(
    path.join(process.cwd(), "client/src/components/pricing/PricingMarketingSections.tsx"),
    "utf8",
  );
  assert.ok(src.includes("renderRtlAwareHeadingText"));
  assert.ok(src.includes("prospectAiTitle"));
});
