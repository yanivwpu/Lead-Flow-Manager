import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findRateLimitRule } from "../server/rateLimitMiddleware";
import {
  suggestShopifyKnowledgePages, trustedShopifyKnowledgeOrigin,
} from "../server/websiteKnowledge/shopifyPageSuggestions";
import type { GuidedKnowledgeSlot, ScrapedPage, GuidedPageResult } from "../server/websiteKnowledgeScraper";

test("trusted Shopify domain cannot be turned into private host or arbitrary port",()=>{
  assert.equal(trustedShopifyKnowledgeOrigin("my-store.myshopify.com"),"https://my-store.myshopify.com");
  for(const host of ["localhost","127.0.0.1","192.168.1.5","example.com:4444","foo..example.com","foo.com/evil","foo.com@localhost"])
    assert.equal(trustedShopifyKnowledgeOrigin(host),null,host);
});

test("Shopify suggestions require an accessible same-store public page and never publish knowledge",async()=>{
  let seen:GuidedKnowledgeSlot[]=[];
  const check=async(slots:GuidedKnowledgeSlot[])=>{
    seen=slots;
    const pages:ScrapedPage[]=slots.map((p,i)=>({
      key:p.key,url:p.urlRaw,text:"Confirmed public policy text. ".repeat(10),
    }));
    const results:GuidedPageResult[]=slots.map((p,i)=>({
      key:p.key,label:p.label,url:p.urlRaw,status:"scanned",finalUrl:
        i===1?"https://unrelated.example/policies/shipping-policy" :
        i===2?"https://store.example/":p.urlRaw,
    }));
    return {pages,results};
  };
  const suggestions=await suggestShopifyKnowledgePages("store.example",check);
  assert.equal(seen.length,5);
  assert.ok(suggestions.some(s=>s.url==="https://store.example/policies/refund-policy"));
  assert.ok(!suggestions.some(s=>s.label==="Shipping and delivery"));
  assert.ok(!suggestions.some(s=>s.label==="Frequently asked questions"));
  assert.ok(suggestions.every(s=>s.url.startsWith("https://store.example/")));
});

test("Shopify source discovery reuses AI Brain's existing read, add, analyze and review/publish routes",()=>{
  const route=readFileSync("server/websiteKnowledge/knowledgeRoutes.ts","utf8");
  const ui=readFileSync("client/src/components/aibrain/BusinessKnowledgeSteps.tsx","utf8");
  assert.match(route,/app.get\("\/api\/ai\/knowledge\/shopify-page-suggestions"/);
  assert.match(route,/await guard\(req, res\)/);
  assert.match(route,/resolveCatalogInstallation\(db, userId\)/);
  assert.match(route,/normalizeShopifyShopDomain\(metadata\?\.shop\?\.myshopifyDomain\)/);
  assert.match(ui,/button-find-shopify-knowledge-pages/);
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
