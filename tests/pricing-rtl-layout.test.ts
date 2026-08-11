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
