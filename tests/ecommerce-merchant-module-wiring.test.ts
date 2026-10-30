import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const dashboard=readFileSync("client/src/pages/EcommerceGrowthEngineDashboard.tsx","utf8");
const catalog=readFileSync("client/src/components/ShopifyCatalog.tsx","utf8");

test("merchant dashboard reuses existing authenticated catalog and shopping components, without new sending",()=>{
 assert.match(dashboard,/import \{ ShopifyCatalog \} from "@\/components\/ShopifyCatalog"/);
 assert.match(dashboard,/import \{ ShoppingSettings \} from "@\/components\/ShoppingSettings"/);
 assert.match(dashboard,/view==="products"[\s\S]*?<ShopifyCatalog showShoppingSettings=\{false\}/);
 assert.match(dashboard,/view==="shopping"[\s\S]*?<ShoppingSettings\/>/);
 assert.match(catalog,/showShoppingSettings = true/);
 assert.match(catalog,/showShoppingSettings && <ShoppingSettings\/>/);
 assert.doesNotMatch(dashboard,/fetch\([^\n]*method:\s*["']POST["']/);
 assert.doesNotMatch(dashboard,/ECOMMERCE_RECOVERY_SEND_ENABLED|ECOMMERCE_POST_PURCHASE_SEND_ENABLED|sendRecoveryViaMeta/);
});

test("overview only shows authenticated catalog-source metrics, never fabricated sales or inferred purchase eligibility",()=>{
 assert.match(dashboard,/withUserQueryScope\(\["\/api\/sales-catalog\/commerce\/status"\],user\?\.id\)/);
 assert.match(dashboard,/enabled:!!user\?\.id && sessionAligned && data\?\.connected===true && view==="overview"/);
 assert.match(dashboard,/data-testid="ecommerce-catalog-summary"/);
 assert.match(dashboard,/publishedProductCount/);
 assert.match(dashboard,/eligibleProductCount/);
 assert.doesNotMatch(dashboard,/recoveredRevenue|conversionRate|totalOrders/);
});

test("automation status distinguishes actual API readiness from merchant workspace access, localized EN ES HE",()=>{
 assert.match(dashboard,/useEcommerceMerchantActivationStatus\(\)/);
 assert.match(dashboard,/outboundMessagingEnabled\?:boolean/);
 assert.match(dashboard,/const journeyLabel=hasJourneyStatus/);
 assert.match(dashboard,/data-testid="ecommerce-journey-status"/);
 for(const language of ['en:', 'es:', 'he:'])assert.ok(dashboard.includes(language));
 assert.ok(dashboard.includes('status:"Customer journeys off"'));
 assert.ok(dashboard.includes('status:"Recorridos de clientes desactivados"'));
 assert.ok(dashboard.includes('status:"מסעות לקוח מושבתים"'));
 assert.ok(dashboard.includes('unknownStatus:"Status unavailable"'));
 assert.ok(!dashboard.includes('status:"Workspace active"'));
});
