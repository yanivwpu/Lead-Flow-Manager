/**
 * Validate marketing header destinations against known public routes.
 * Run: npx tsx tests/marketing-nav.test.ts
 */
import assert from "node:assert/strict";
import {
  getAllMarketingNavLinks,
  OMITTED_SOLUTIONS,
  PRODUCT_NAV,
  RESOURCES_NAV,
  SOLUTIONS_NAV,
} from "../shared/marketingNav";
import { PAGE_META, generateHomepageHtml, injectHomepageSeoMeta } from "../server/seo";
import { shouldServeSpaFallback } from "../server/spaRouting";

const KNOWN_PUBLIC_PATHS = new Set([
  "/",
  "/auth",
  "/pricing",
  "/blog",
  "/help",
  "/user-guide",
  "/partner-program",
  "/prospect-ai",
  "/realtor-growth-engine",
  "/real-estate-crm",
  "/shopify-crm",
  "/go-high-level-agencies",
  "/unified-inbox",
  "/shared-team-inbox",
  "/automation-templates",
  "/whatsapp-business-api",
  "/ai-lead-scoring",
  "/best-whatsapp-crm-2026",
  "/wati-alternative",
  "/manychat-alternative",
  "/respond-io-alternative",
  "/zoko-alternative",
  "/pabbly-alternative",
  "/interakt-alternative",
  "/waba360-alternative",
  "/crm-for-whatsapp-business",
  "/contact",
  "/whatsapp-crm",
  "/crm-with-mls-integration",
]);

const HOMEPAGE_HASHES = new Set(["/#ai-brain", "/#ai-copilot", "/#integrations", "/#ai-platform", "/#built-for"]);

function normalizeHref(href: string): { path: string; isHomepageHash: boolean } {
  if (href.startsWith("/#")) {
    return { path: href, isHomepageHash: true };
  }
  const path = href.split("#")[0] || "/";
  return { path, isHomepageHash: false };
}

const links = getAllMarketingNavLinks();
assert.ok(links.length >= 15, "expected a full marketing nav");

for (const link of links) {
  assert.ok(link.href.startsWith("/"), `href must be absolute path: ${link.label}`);
  assert.doesNotMatch(link.href, /coming.?soon/i);
  assert.doesNotMatch(link.label, /coming.?soon/i);
  const { path, isHomepageHash } = normalizeHref(link.href);
  if (isHomepageHash) {
    assert.ok(HOMEPAGE_HASHES.has(path) || path.startsWith("/#"), `homepage hash ok: ${path}`);
  } else {
    assert.ok(
      KNOWN_PUBLIC_PATHS.has(path) || PAGE_META[path] != null,
      `unknown nav destination for ${link.label}: ${path}`,
    );
  }
}

assert.equal(PRODUCT_NAV.label, "Product");
assert.equal(SOLUTIONS_NAV.label, "Solutions");
assert.equal(RESOURCES_NAV.label, "Resources");
assert.ok(
  PRODUCT_NAV.groups.some((g) => g.items.some((i) => i.href === "/prospect-ai")),
  "Prospect AI dedicated page",
);
assert.ok(
  PRODUCT_NAV.groups.some((g) => g.items.some((i) => i.href === "/realtor-growth-engine")),
  "RGE dedicated page",
);
assert.equal(OMITTED_SOLUTIONS.length, 2);

const shell = `<!DOCTYPE html><html><head><title>Home</title></head><body><div id="root"></div></body></html>`;
const ssr = generateHomepageHtml();
assert.match(ssr, /<h1>Meet Your AI Sales Team<\/h1>/);
assert.match(ssr, /data-ssr-content="true"/);
assert.match(ssr, /href="\/prospect-ai"/);
assert.match(ssr, /href="\/realtor-growth-engine"/);
assert.match(ssr, /href="\/unified-inbox"/);
assert.match(ssr, /href="\/auth"/);
assert.equal((ssr.match(/<h1>/g) || []).length, 1);

const withMeta = injectHomepageSeoMeta(shell);
assert.match(withMeta, /application\/ld\+json/);
assert.match(withMeta, /Meet Your AI Sales Team/);

const marketing = Object.keys(PAGE_META);
assert.equal(shouldServeSpaFallback("/this-page-should-not-exist-xyz", marketing), false);
assert.equal(shouldServeSpaFallback("/prospect-ai", marketing), true);

console.log(`PASS marketing-nav.test.ts (${links.length} links)`);
