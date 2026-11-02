import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findRateLimitRule } from "../server/rateLimitMiddleware";
import {
  suggestShopifyKnowledgePages, trustedShopifyKnowledgeOrigin,
} from "../server/websiteKnowledge/shopifyPageSuggestions";

test("trusted Shopify domain cannot be turned into private host or arbitrary port",()=>{
  assert.equal(trustedShopifyKnowledgeOrigin("my-store.myshopify.com"),"https://my-store.myshopify.com");
  for(const host of ["localhost","127.0.0.1","192.168.1.5","example.com:4444","foo..example.com","foo.com/evil","foo.com@localhost"])
    assert.equal(trustedShopifyKnowledgeOrigin(host),null,host);
});

test("Shopify suggestions are pure, finite candidates on exactly the verified primary domain",()=>{
  const suggestions=suggestShopifyKnowledgePages("store.example");
  assert.equal(suggestions.length,5);
  assert.ok(suggestions.some(s=>s.url==="https://store.example/policies/refund-policy"));
  assert.ok(suggestions.some(s=>s.url==="https://store.example/policies/shipping-policy"));
  assert.ok(suggestions.every(s=>s.url.startsWith("https://store.example/")));
  assert.deepEqual(suggestShopifyKnowledgePages("localhost"),[]);
  const code=readFileSync("server/websiteKnowledge/shopifyPageSuggestions.ts","utf8");
  assert.ok(!code.includes("fetchSingleKnowledgePage"));
  assert.ok(!code.includes("scrapeGuidedWebsiteKnowledgePages"));
  assert.ok(!code.includes("fetch("));
});

test("Shopify source discovery reuses AI Brain's existing read, add, analyze and review/publish routes",()=>{
  const route=readFileSync("server/websiteKnowledge/knowledgeRoutes.ts","utf8");
  const ui=readFileSync("client/src/components/aibrain/BusinessKnowledgeSteps.tsx","utf8");
  assert.match(route,/app.get\("\/api\/ai\/knowledge\/shopify-page-suggestions"/);
  assert.match(route,/await guard\(req, res\)/);
  assert.match(route,/resolveCatalogInstallation\(db, userId\)/);
  assert.match(route,/normalizeShopifyShopDomain\(metadata\?\.shop\?\.myshopifyDomain\)/);
  assert.match(ui,/button-find-shopify-knowledge-pages/);
  assert.match(ui,/shopifyConnectionQuery.data\\?\\.connected === true/);
  assert.match(ui,/button-add-shopify-knowledge-pages/);
  assert.match(ui,/addSourceMutation\.mutateAsync\(item\.url\)/);
  assert.match(ui,/review the facts/i);
  assert.ok(!route.includes("publishKnowledgeFacts(req.user!.id);\n      const metadata"));
});


test("Store-page discovery has a dedicated rate bucket before the broad AI route",()=>{
  const rule=findRateLimitRule("/api/ai/knowledge/shopify-page-suggestions","GET");
  assert.equal(rule?.id,"shopify-knowledge-discovery");
  assert.equal(rule?.limit,4);
  assert.equal(findRateLimitRule("/api/ai/knowledge/sources","GET")?.id,"ai");
});
