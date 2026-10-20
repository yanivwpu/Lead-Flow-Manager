import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("dedicated E-commerce Growth Engine preview is responsive, noindexed and reachable",()=>{
  const app=readFileSync("client/src/App.tsx","utf8");
  const page=readFileSync("client/src/pages/EcommerceGrowthEnginePreview.tsx","utf8");
  assert.match(app,/path="\/ecommerce-growth-engine" component=\{EcommerceGrowthEnginePreview\}/);
  assert.match(page,/name="robots" content="noindex,nofollow"/);
  assert.match(page,/data-testid="ecommerce-growth-engine-preview"/);
  assert.match(page,/sm:px-6/);
  assert.match(page,/sm:text-5xl/);
  assert.match(page,/grid gap-4 md:grid-cols-3/);
  assert.match(page,/ecommerce-preview-primary-cta/);
  assert.match(page,/\/app\/integrations\?setup=shopify/);
  assert.match(page,/auth\?redirect=/);
  assert.match(page,/Shopify first · Staging preview/);
  assert.match(page,/No automatic customer messages are sent/);
  assert.match(page,/fulfillment and cancellation journeys, and abandoned-cart recovery are not active/);
  assert.doesNotMatch(page,/auto.?send (whatsapp|email)|automated cart recovery is live|fully launched/i);
});

test("preview must not be promoted in catalog or navigation before launch acceptance",()=>{
  const nav=readFileSync("shared/marketingNav.ts","utf8");
  const catalog=readFileSync("client/src/lib/growthEnginesCatalog.ts","utf8");
  assert.doesNotMatch(nav,/href:\s*"\/ecommerce-growth-engine"/);
  const engine=catalog.slice(catalog.indexOf('slug: "ecommerce-growth-engine"'));
  assert.match(engine.slice(0,950),/status: "coming_soon"/);
});
