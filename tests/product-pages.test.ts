/**
 * Dedicated Product pages + Product nav destinations.
 * Run: npx tsx tests/product-pages.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_PRODUCT_PAGES, getProductByPath } from "../shared/productPages";
import { PRODUCT_NAV } from "../shared/marketingNav";
import {
  PAGE_META,
  generateMarketingPageSsrHtml,
  getMarketingSsrBodyRoutes,
} from "../server/seo";
import { shouldServeSpaFallback } from "../server/spaRouting";

const FORBIDDEN_PRODUCT_HREFS = new Set([
  "/#ai-brain",
  "/#ai-copilot",
  "/#integrations",
  "/automation-templates",
  "/automation-templates#support-nurture",
  "/whatsapp-business-api#inbox-automation",
]);

const EXPECTED = [
  { label: "Prospect AI", href: "/prospect-ai" },
  { label: "AI Brain", href: "/ai-brain" },
  { label: "AI Copilot", href: "/ai-copilot" },
  { label: "Unified Inbox", href: "/unified-inbox" },
  { label: "Workflows & Automations", href: "/automations" },
  { label: "Chatbot Builder", href: "/chatbot-builder" },
  { label: "Campaigns", href: "/campaigns" },
  { label: "Realtor Growth Engine", href: "/realtor-growth-engine" },
  { label: "Integrations", href: "/integrations" },
  { label: "Team Collaboration", href: "/shared-team-inbox" },
] as const;

const productItems = PRODUCT_NAV.groups.flatMap((g) => g.items);
assert.equal(productItems.length, EXPECTED.length);

for (const expected of EXPECTED) {
  const item = productItems.find((i) => i.label === expected.label);
  assert.ok(item, `Product menu includes ${expected.label}`);
  assert.equal(item!.href, expected.href, `${expected.label} destination`);
  assert.ok(!FORBIDDEN_PRODUCT_HREFS.has(item!.href), `${expected.label} must not use hash or shortcut`);
  assert.doesNotMatch(item!.href, /#/);
}

const titles = new Set<string>();
const descriptions = new Set<string>();
const canonicals = new Set<string>();
const h1s = new Set<string>();

for (const product of ALL_PRODUCT_PAGES) {
  assert.ok(getProductByPath(product.path), `getProductByPath ${product.path}`);
  const meta = PAGE_META[product.path];
  assert.ok(meta, `PAGE_META for ${product.path}`);
  assert.equal(meta.title, product.title);
  assert.equal(meta.description, product.metaDescription);
  assert.equal(meta.canonical, `https://www.whachatcrm.com${product.path}`);

  assert.ok(!titles.has(meta.title), `unique title ${product.path}`);
  assert.ok(!descriptions.has(meta.description), `unique description ${product.path}`);
  assert.ok(!canonicals.has(meta.canonical), `unique canonical ${product.path}`);
  assert.ok(!h1s.has(product.h1), `unique h1 ${product.path}`);
  titles.add(meta.title);
  descriptions.add(meta.description);
  canonicals.add(meta.canonical);
  h1s.add(product.h1);

  assert.ok(getMarketingSsrBodyRoutes().includes(product.path), `SSR route ${product.path}`);
  const html = generateMarketingPageSsrHtml(product.path);
  assert.ok(html, `SSR body ${product.path}`);
  assert.equal((html!.match(/<h1>/g) || []).length, 1);
  assert.match(html!, new RegExp(`<h1>${product.h1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h1>`));
  assert.match(html!, /data-ssr-content="true"/);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const sitemap = fs.readFileSync(path.join(here, "../client/public/sitemap.xml"), "utf8");
for (const product of ALL_PRODUCT_PAGES) {
  assert.ok(sitemap.includes(product.path), `sitemap includes ${product.path}`);
}

const marketing = Object.keys(PAGE_META);
assert.equal(shouldServeSpaFallback("/products/does-not-exist", marketing), false);
assert.equal(shouldServeSpaFallback("/ai-brain", marketing), true);

console.log(`PASS product-pages.test.ts (${ALL_PRODUCT_PAGES.length} pages)`);
