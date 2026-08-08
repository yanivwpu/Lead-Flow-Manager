/**
 * Industry solution pages + Solutions nav destinations.
 * Run: npx tsx tests/solution-pages.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_SOLUTION_PAGES, getSolutionByPath } from "../shared/solutionPages";
import { SOLUTIONS_NAV, OMITTED_SOLUTIONS } from "../shared/marketingNav";
import {
  PAGE_META,
  generateMarketingPageSsrHtml,
  getMarketingSsrBodyRoutes,
} from "../server/seo";
import { shouldServeSpaFallback } from "../server/spaRouting";

const FORBIDDEN_SOLUTION_HREFS = new Set([
  "/prospect-ai",
  "/shopify-crm",
  "/go-high-level-agencies",
]);

const EXPECTED = [
  { label: "Real Estate", href: "/real-estate-crm" },
  { label: "E-commerce", href: "/solutions/ecommerce" },
  { label: "Local & Service Businesses", href: "/solutions/local-service-businesses" },
  { label: "Marketing Agencies", href: "/solutions/marketing-agencies" },
  { label: "Med Spas & Wellness", href: "/solutions/med-spas" },
] as const;

const solutionItems = SOLUTIONS_NAV.groups.flatMap((g) => g.items);
assert.equal(solutionItems.length, EXPECTED.length);

for (const expected of EXPECTED) {
  const item = solutionItems.find((i) => i.label === expected.label);
  assert.ok(item, `Solutions menu includes ${expected.label}`);
  assert.equal(item!.href, expected.href, `${expected.label} destination`);
  assert.ok(!FORBIDDEN_SOLUTION_HREFS.has(item!.href), `${expected.label} must not point at product/integration shortcut`);
}

assert.equal(OMITTED_SOLUTIONS.length, 1);
assert.equal(OMITTED_SOLUTIONS[0].label, "Travel & Hospitality");

const titles = new Set<string>();
const descriptions = new Set<string>();
const h1s = new Set<string>();

for (const page of ALL_SOLUTION_PAGES) {
  assert.ok(PAGE_META[page.path], `PAGE_META registered for ${page.path}`);
  assert.equal(PAGE_META[page.path].canonical, `https://www.whachatcrm.com${page.path}`);
  assert.ok(getSolutionByPath(page.path), `getSolutionByPath ${page.path}`);

  const ssr = generateMarketingPageSsrHtml(page.path);
  assert.ok(ssr, `SSR body for ${page.path}`);
  assert.match(ssr!, /data-ssr-content="true"/);
  assert.equal((ssr!.match(/<h1>/g) || []).length, 1, `one H1 for ${page.path}`);
  assert.match(ssr!, new RegExp(`<h1>${page.h1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h1>`));

  assert.ok(!titles.has(page.title), `unique title: ${page.title}`);
  assert.ok(!descriptions.has(page.metaDescription), `unique description: ${page.path}`);
  assert.ok(!h1s.has(page.h1), `unique H1: ${page.h1}`);
  titles.add(page.title);
  descriptions.add(page.metaDescription);
  h1s.add(page.h1);

  assert.ok(page.useCases.length >= 3, `use cases for ${page.path}`);
  assert.ok(page.workflowSteps.length >= 5, `workflow for ${page.path}`);
  assert.ok(page.challenges.length >= 3, `challenges for ${page.path}`);
}

const ssrRoutes = getMarketingSsrBodyRoutes();
for (const page of ALL_SOLUTION_PAGES) {
  assert.ok(ssrRoutes.includes(page.path), `SSR route list includes ${page.path}`);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sitemap = fs.readFileSync(path.join(root, "client/public/sitemap.xml"), "utf8");
for (const page of ALL_SOLUTION_PAGES) {
  assert.ok(
    sitemap.includes(`https://www.whachatcrm.com${page.path}`),
    `sitemap includes ${page.path}`,
  );
}

const marketing = Object.keys(PAGE_META);
for (const page of ALL_SOLUTION_PAGES) {
  assert.equal(shouldServeSpaFallback(page.path, marketing), true, `spa 200 for ${page.path}`);
}
assert.equal(shouldServeSpaFallback("/solutions/does-not-exist", marketing), false);
assert.equal(shouldServeSpaFallback("/this-page-should-not-exist-xyz", marketing), false);

console.log(`PASS solution-pages.test.ts (${ALL_SOLUTION_PAGES.length} pages)`);
