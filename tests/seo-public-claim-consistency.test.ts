/** Run: npx tsx --test tests/seo-public-claim-consistency.test.ts */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACTIVE_CONVERSATION_PUBLIC_DESCRIPTION, PUBLIC_PRODUCT_FACTS } from "../shared/publicProductFacts";
import {
  SEO_APPROVED_POSITIONING,
  SEO_CAPABILITY_POLICY,
  SEO_CURRENT_SELF_SERVICE_PRODUCTS,
  findForbiddenPublicClaims,
  mayDescribeAsGenerallyAvailable,
} from "../shared/seoPolicy";
import { PRICING_PAGE_CONTENT_EN } from "../shared/pricingPageContent";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("availability policy excludes non-general lifecycle states", () => {
  assert.equal(mayDescribeAsGenerallyAvailable(PUBLIC_PRODUCT_FACTS.starter), false);
  assert.equal(mayDescribeAsGenerallyAvailable(PUBLIC_PRODUCT_FACTS.legacyAiBrainAddon), false);
  assert.deepEqual(SEO_CURRENT_SELF_SERVICE_PRODUCTS.map((fact) => fact.id).sort(), ["free", "pro"]);
});

test("Web Chat channel and visual Chatbot Builder are distinct capabilities", () => {
  assert.equal(SEO_CAPABILITY_POLICY.webChatInboxChannel.kind, "inbox_channel");
  assert.equal(SEO_CAPABILITY_POLICY.visualChatbotBuilder.kind, "automation_builder");
  assert.equal(SEO_CAPABILITY_POLICY.visualChatbotBuilder.requiredPlan, "pro");
});

test("forbidden public claim policy covers Phase 1 guardrails", () => {
  assert.deepEqual(findForbiddenPublicClaims("Create mass keyword pages"), ["mass-keyword-pages"]);
  assert.deepEqual(findForbiddenPublicClaims("Launch mass location pages"), ["mass-location-pages"]);
  assert.deepEqual(findForbiddenPublicClaims("Guaranteed conversions"), ["conversion-guarantee"]);
  assert.deepEqual(findForbiddenPublicClaims("Guaranteed rankings"), ["conversion-guarantee"]);
  assert.deepEqual(findForbiddenPublicClaims("Conversion guarantees"), ["conversion-guarantee"]);
  assert.deepEqual(findForbiddenPublicClaims("We guarantee 20% more conversions."), ["conversion-guarantee"]);
  assert.deepEqual(findForbiddenPublicClaims("We guarantee your sales."), ["conversion-guarantee"]);
  assert.deepEqual(findForbiddenPublicClaims("Guaranteed higher rankings."), ["conversion-guarantee"]);
  assert.deepEqual(findForbiddenPublicClaims("We guarantee at least 20% more qualified conversions."), [
    "conversion-guarantee",
  ]);
  assert.deepEqual(findForbiddenPublicClaims("No unsupported conversion guarantees"), []);
  assert.deepEqual(findForbiddenPublicClaims("No conversion guarantees."), []);
  assert.deepEqual(findForbiddenPublicClaims("SEO-friendly does not mean guaranteed rankings."), []);
  assert.deepEqual(findForbiddenPublicClaims("This does not mean guaranteed rankings."), []);
  assert.deepEqual(findForbiddenPublicClaims("We do not guarantee rankings."), []);
  assert.deepEqual(findForbiddenPublicClaims("We do not hesitate to guarantee conversions."), ["conversion-guarantee"]);
  assert.deepEqual(findForbiddenPublicClaims("Guaranteed conversions are not optional."), ["conversion-guarantee"]);
  assert.deepEqual(findForbiddenPublicClaims("Buy Starter plan"), ["current-starter-offer"]);
  assert.deepEqual(findForbiddenPublicClaims("Purchase AI Brain separately"), ["current-ai-brain-addon"]);
  assert.deepEqual(findForbiddenPublicClaims("RGE Early Access $99"), ["rge-99"]);
});

test("Help describes Starter as legacy and never sells a Brain add-on", () => {
  const help = read("client/src/content/help/userGuideContent.ts");
  assert.match(help, /Starter is a grandfathered legacy plan and is unavailable to new customers/);
  assert.doesNotMatch(help, /Starter supports up to 3 users/);
  assert.doesNotMatch(help, /(?:buy|purchase|purchasing) (?:the )?AI Brain/i);
});

test("Pricing and Terms share the enforcement-matched conversation definition", () => {
  const faq = PRICING_PAGE_CONTENT_EN.faq.items.find((item) => /active conversation/i.test(item.q));
  assert.equal(faq?.a, ACTIVE_CONVERSATION_PUBLIC_DESCRIPTION);
  const terms = read("client/src/pages/TermsOfUse.tsx");
  assert.match(terms, /ACTIVE_CONVERSATION_PUBLIC_DESCRIPTION/);
  assert.doesNotMatch(terms, /unique WhatsApp contact within a rolling 30-day window/);
});

test("RGE public locale content has no authored canonical price literals or $99 claim", () => {
  for (const path of [
    "client/src/content/realtorGrowthEngineLandingContent.ts",
    "shared/realtorGrowthEngineLandingLocales.ts",
    "client/src/pages/RealtorGrowthEngine.tsx",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /\$199|\$49\/mo|\$99/, path);
  }
});

test("Meta markup positioning stays excluded from the October 2026 article", () => {
  assert.deepEqual(SEO_APPROVED_POSITIONING.metaFeeMarkup.surfaces, ["pricing", "comparison"]);
  const article = read("shared/blog/whatsapp-service-message-pricing-october-2026.ts");
  assert.doesNotMatch(article, /0% markup|zero markup/i);
});
