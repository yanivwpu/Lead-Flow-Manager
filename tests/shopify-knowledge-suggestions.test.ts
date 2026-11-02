import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findRateLimitRule } from "../server/rateLimitMiddleware";
import {
  confirmedShopifyPolicies, suggestShopifyKnowledgePages, trustedShopifyKnowledgeOrigin,
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

test("Shopify policy records are confirmed only with safe same-store URLs",()=>{
  const configured = confirmedShopifyPolicies("shop.example", [
    {type:"REFUND_POLICY",url:"https://shop.example/policies/refund-policy"},
    {type:"SHIPPING_POLICY",url:"https://evil.example/policies/shipping-policy"},
    {type:"PRIVACY_POLICY",url:"http://shop.example/policies/privacy-policy"},
    {type:"TERMS_OF_SERVICE",url:"https://shop.example/policies/terms-of-service?tracking=1"},
    {type:"SUBSCRIPTION_POLICY",url:"https://shop.example/policies/subscription-policy"},
    {type:"SHIPPING_POLICY",url:"https://shop.example/pages/about-us"},
    {type:"NOT_AN_ACTUAL_POLICY",url:"https://shop.example/policies/unknown"},
  ]);
  assert.deepEqual(configured.map(x=>x.label),["Returns and refunds","Subscription policy"]);
  assert.ok(configured.every(x=>x.status==="shopify_confirmed"));
  assert.equal(confirmedShopifyPolicies("localhost",[]).length,0);
});

test("Merchant chooses individual sources; unverified suggestions aren't added by default",()=>{
  const ui=readFileSync("client/src/components/aibrain/BusinessKnowledgeSteps.tsx","utf8");
  const route=readFileSync("server/websiteKnowledge/knowledgeRoutes.ts","utf8");
  assert.match(ui,/shopify-suggested-page-checkbox/);
  assert.match(ui,/setSelectedShopifyUrls\(\[\]\)/);
  assert.match(ui,/selectedShopifySuggestions\.slice\(0, 12\)/);
  assert.match(ui,/selectedShopifySuggestions\.length === 0/);
  assert.match(ui,/Unverified URL/);
  assert.match(ui,/Configured in Shopify/);
  assert.match(route,/scopeHandles\.includes\("read_legal_policies"\)/);
  assert.match(route,/SHOPIFY_POLICIES_QUERY/);
  assert.match(route,/normalizeShopifyShopDomain\(metadata\?\.shop\?\.myshopifyDomain\)/);
  assert.doesNotMatch(route,/shopify-page-suggestions[\s\S]{0,400}publishKnowledgeFacts\(/);
});

test("Shopify source discovery reuses AI Brain's existing read, add, analyze and review/publish routes",()=>{
  const route=readFileSync("server/websiteKnowledge/knowledgeRoutes.ts","utf8");
  const ui=readFileSync("client/src/components/aibrain/BusinessKnowledgeSteps.tsx","utf8");
  assert.match(route,/app.get\("\/api\/ai\/knowledge\/shopify-page-suggestions"/);
  assert.match(route,/await guard\(req, res\)/);
  assert.match(route,/resolveCatalogInstallation\(db, userId\)/);
  assert.match(route,/normalizeShopifyShopDomain\(metadata\?\.shop\?\.myshopifyDomain\)/);
  assert.match(ui,/button-find-shopify-knowledge-pages/);
  assert.ok(ui.includes("shopifyConnectionQuery.data?.connected === true"));
  assert.match(ui,/button-add-shopify-knowledge-pages/);
  assert.match(ui,/addSourceMutation\.mutateAsync\(item\.url\)/);
  assert.match(ui,/review the facts/i);
  assert.ok(!route.includes("publishKnowledgeFacts(req.user!.id);\n      const metadata"));
});


test("Shopify knowledge suggestions enforce an explicit user-scoped limit before provider access",()=>{
  const route=readFileSync("server/websiteKnowledge/knowledgeRoutes.ts","utf8");
  const start=route.indexOf('app.get("/api/ai/knowledge/shopify-page-suggestions"');
  assert.ok(start>=0);
  const handler=route.slice(start, start+1900);
  assert.ok(handler.includes('consumeRateLimit(`shopify:knowledge-page-suggestions:user:${userId}`, 4, windowMs)'));
  assert.ok(route.includes('const shopifyKnowledgeIpLimiter = rateLimit('));
  assert.ok(route.includes('app.get("/api/ai/knowledge/shopify-page-suggestions", shopifyKnowledgeIpLimiter, async'));
  assert.ok(handler.includes('res.status(429)'));
  assert.ok(handler.indexOf("consumeRateLimit(")<handler.indexOf("resolveCatalogInstallation(db, userId)"));
  assert.equal(findRateLimitRule("/api/ai/knowledge/shopify-page-suggestions","GET")?.id,"ai");
  assert.equal(findRateLimitRule("/api/ai/knowledge/sources","GET")?.id,"ai");
});
