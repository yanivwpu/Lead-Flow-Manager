import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shopifyPublicEvidencePilotEnabled } from "../server/salesCatalog/shopify/publicEvidenceGate";

test("Shopify public metadata requires both flag and exact existing workspace allowlist",()=>{
  const savedOn=process.env.ECOMMERCE_SHOPIFY_PUBLIC_EVIDENCE_ENABLED;
  const savedId=process.env.ECOMMERCE_SHOPIFY_PUBLIC_EVIDENCE_WORKSPACE_ID;
  const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  try {
    delete process.env.ECOMMERCE_SHOPIFY_PUBLIC_EVIDENCE_ENABLED;
    delete process.env.ECOMMERCE_SHOPIFY_PUBLIC_EVIDENCE_WORKSPACE_ID;
    assert.equal(shopifyPublicEvidencePilotEnabled(id),false);
    process.env.ECOMMERCE_SHOPIFY_PUBLIC_EVIDENCE_ENABLED="true";
    assert.equal(shopifyPublicEvidencePilotEnabled(id),false);
    process.env.ECOMMERCE_SHOPIFY_PUBLIC_EVIDENCE_WORKSPACE_ID="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    assert.equal(shopifyPublicEvidencePilotEnabled(id),false);
    process.env.ECOMMERCE_SHOPIFY_PUBLIC_EVIDENCE_WORKSPACE_ID=id;
    assert.equal(shopifyPublicEvidencePilotEnabled(id),true);
    assert.equal(shopifyPublicEvidencePilotEnabled(""),false);
    process.env.ECOMMERCE_SHOPIFY_PUBLIC_EVIDENCE_ENABLED="false";
    assert.equal(shopifyPublicEvidencePilotEnabled(id),false);
  } finally {
    if(savedOn===undefined) delete process.env.ECOMMERCE_SHOPIFY_PUBLIC_EVIDENCE_ENABLED;
    else process.env.ECOMMERCE_SHOPIFY_PUBLIC_EVIDENCE_ENABLED=savedOn;
    if(savedId===undefined) delete process.env.ECOMMERCE_SHOPIFY_PUBLIC_EVIDENCE_WORKSPACE_ID;
    else process.env.ECOMMERCE_SHOPIFY_PUBLIC_EVIDENCE_WORKSPACE_ID=savedId;
  }
});
test("Both authoritative catalog ingestion and Shopping AI are scoped to verified pilot",()=>{
  const sync=readFileSync("server/salesCatalog/shopify/sync.ts","utf8");
  const ai=readFileSync("server/shopping/intelligence.ts","utf8");
  assert.match(sync,/if \(shopifyPublicEvidencePilotEnabled\(install\.userId\)\)/);
  assert.match(ai,/shopifyPublicEvidencePilotEnabled\(product\.userId\)/);
  assert.match(sync,/shopifyEvidence = \[\]/);
  assert.match(sync,/\[ShopifyEvidencePilot\] read_failed/);
  assert.ok(!sync.includes('console.warn("[ShopifyEvidencePilot] read_failed", error'));
});
