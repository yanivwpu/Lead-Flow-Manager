import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterOwnedShopifyKnowledgeSources, merchantScopedShoppingKnowledgeEnabled } from "../server/shopping/shopifyKnowledgeScope";
import { factBelongsToShopifyStore } from "../shared/shopifyKnowledgeAttribution";

test("merchant-scoped knowledge gate is disabled without both explicit switches",()=>{
  const previousFlag=process.env.ECOMMERCE_SHOPIFY_MERCHANT_KNOWLEDGE_SCOPE_ENABLED;
  const previousId=process.env.ECOMMERCE_SHOPIFY_MERCHANT_KNOWLEDGE_WORKSPACE_ID;
  try {
    delete process.env.ECOMMERCE_SHOPIFY_MERCHANT_KNOWLEDGE_SCOPE_ENABLED;
    delete process.env.ECOMMERCE_SHOPIFY_MERCHANT_KNOWLEDGE_WORKSPACE_ID;
    assert.equal(merchantScopedShoppingKnowledgeEnabled("merchantA"),false);
    process.env.ECOMMERCE_SHOPIFY_MERCHANT_KNOWLEDGE_SCOPE_ENABLED="true";
    assert.equal(merchantScopedShoppingKnowledgeEnabled("merchantA"),false);
    process.env.ECOMMERCE_SHOPIFY_MERCHANT_KNOWLEDGE_WORKSPACE_ID="merchantB";
    assert.equal(merchantScopedShoppingKnowledgeEnabled("merchantA"),false);
    process.env.ECOMMERCE_SHOPIFY_MERCHANT_KNOWLEDGE_WORKSPACE_ID="merchantA";
    assert.equal(merchantScopedShoppingKnowledgeEnabled("merchantA"),true);
    assert.equal(merchantScopedShoppingKnowledgeEnabled("merchantB"),false);
  } finally {
    if(previousFlag===undefined)delete process.env.ECOMMERCE_SHOPIFY_MERCHANT_KNOWLEDGE_SCOPE_ENABLED;
    else process.env.ECOMMERCE_SHOPIFY_MERCHANT_KNOWLEDGE_SCOPE_ENABLED=previousFlag;
    if(previousId===undefined)delete process.env.ECOMMERCE_SHOPIFY_MERCHANT_KNOWLEDGE_WORKSPACE_ID;
    else process.env.ECOMMERCE_SHOPIFY_MERCHANT_KNOWLEDGE_WORKSPACE_ID=previousId;
  }
});
test("only approved same-store URL sources are eligible for Shopify shopping",()=>{
  const candidates=[
    {id:"shop-return",url:"https://shop.example/policies/refund-policy",isEnabled:true},
    {id:"shop-terms",url:"https://shop.example/pages/about-us",isEnabled:true},
    {id:"other-business",url:"https://canvasrealestate.example/about",isEnabled:true},
    {id:"other-shop",url:"https://different.myshopify.com/policies/refund-policy",isEnabled:true},
    {id:"disabled",url:"https://shop.example/policies/shipping-policy",isEnabled:false},
    {id:"http",url:"http://shop.example/policies/privacy-policy",isEnabled:true},
    {id:"private",url:"http://localhost/admin",isEnabled:true},
    {id:"evil-suffix",url:"https://shop.example.evil.test/policies/refund-policy",isEnabled:true},
  ];
  const allowed=filterOwnedShopifyKnowledgeSources(candidates,["shop.example","shop.myshopify.com"]);
  assert.deepEqual([...allowed].sort(),["shop-return","shop-terms"]);
  assert.equal(filterOwnedShopifyKnowledgeSources(candidates,[]).size,0);
});
test("grounding isolates both policy retrieval and policy-conflict calculations before prompts",()=>{
 const factContext=readFileSync("server/websiteKnowledge/factContext.ts","utf8");
 const runtime=readFileSync("server/shopping/intelligenceRuntime.ts","utf8");
 assert.match(factContext,/allowedSourceIds\?: ReadonlySet<string>/);
 assert.match(factContext,/published\.facts\.filter\(f => factBelongsToShopifyStore/);
 assert.ok(factContext.indexOf("params.allowedSourceIds") < factContext.indexOf("const retrieved = retrieveFactsForTurnWithNextAction"));
 assert.ok(runtime.includes("verifiedStore = scoped ? await verifiedShopifyKnowledgeScope(userId) : undefined"));
 assert.ok(runtime.includes("allowedSourceHosts = verifiedStore?.allowedHosts"));
 assert.ok(factContext.includes(": []) // Missing verified final-origin host allowlist fails closed."));
 assert.ok(runtime.includes("scoped ? \"\" : [knowledge.customInstructions"));
 assert.ok(runtime.includes("} else if (!scoped) {"));
});


test("A trusted source ID cannot launder a redirect to another business into Shopify Shopping",()=>{
  const ids=new Set(["shop-return","shop-about"]), hosts=new Set(["store.example","my-shop.myshopify.com"]);
  const own={sourceId:"shop-return",sourceUrl:"https://store.example/policies/refund-policy",provenance:[
    {sourceId:"shop-return",url:"https://store.example/policies/refund-policy"},
  ]};
  assert.equal(factBelongsToShopifyStore(own,ids,hosts),true);
  assert.equal(factBelongsToShopifyStore({...own,sourceUrl:"https://realestate.example/returns"},ids,hosts),false);
  assert.equal(factBelongsToShopifyStore({...own,sourceUrl:"https://store.example.evil.test/returns"},ids,hosts),false);
  assert.equal(factBelongsToShopifyStore({...own,sourceUrl:null},ids,hosts),false);
  assert.equal(factBelongsToShopifyStore({...own,sourceUrl:"http://store.example/returns"},ids,hosts),false);
  assert.equal(factBelongsToShopifyStore({...own,provenance:[{sourceId:"shop-return",url:"https://realestate.example/privacy"}]},ids,hosts),false);
  assert.equal(factBelongsToShopifyStore({...own,provenance:[{sourceId:"other-merchant",url:"https://store.example/privacy"}]},ids,hosts),false);
  assert.equal(factBelongsToShopifyStore({...own,provenance:[{sourceId:"shop-return",url:null}]},ids,hosts),false);
  assert.equal(factBelongsToShopifyStore({...own,provenance:[]},ids,hosts),true);
  assert.equal(factBelongsToShopifyStore(own,ids,new Set()),false);
});
