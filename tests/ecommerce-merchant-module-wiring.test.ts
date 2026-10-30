import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const dashboard=readFileSync("client/src/pages/EcommerceGrowthEngineDashboard.tsx","utf8");
const catalog=readFileSync("client/src/components/ShopifyCatalog.tsx","utf8");
const activation=readFileSync("server/ecommerceMerchantActivationRoutes.ts","utf8");

test("merchant dashboard reuses existing authenticated catalog and shopping components, without new sending",()=>{
 assert.match(dashboard,/import \{ ShopifyCatalog \} from "@\/components\/ShopifyCatalog"/);
 assert.match(dashboard,/import \{ ShoppingSettings \} from "@\/components\/ShoppingSettings"/);
 assert.match(dashboard,/view==="products"[\s\S]*?<ShopifyCatalog showShoppingSettings=\{!privatePilot\}/);
 assert.match(dashboard,/view==="shopping"[\s\S]*?privatePilot && <ShoppingSettings\/>/);
 assert.match(catalog,/showShoppingSettings = true/);
 assert.match(catalog,/showShoppingSettings && <ShoppingSettings\s*\/>/);
 assert.doesNotMatch(dashboard,/fetch\([^\n]*method:\s*["']POST["']/);
 assert.doesNotMatch(dashboard,/ECOMMERCE_RECOVERY_SEND_ENABLED|ECOMMERCE_POST_PURCHASE_SEND_ENABLED|sendRecoveryViaMeta/);
});

test("overview only shows authenticated catalog-source metrics, never fabricated sales or inferred purchase eligibility",()=>{
 assert.match(dashboard,/withUserQueryScope\(\["\/api\/sales-catalog\/commerce\/status"\],user\?\.id\)/);
 assert.match(dashboard,/enabled:privatePilot && !!user\?\.id && sessionAligned && data\?\.connected===true && view==="overview"/);
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

test("recovery readiness reuses the existing strict runtime schema guard without any writes or sending",()=>{
 assert.match(activation,/import \{ recoveryRuntimeSchemaReadyQuery \} from/);
 assert.match(activation,/await db\.execute\(recoveryRuntimeSchemaReadyQuery\(\)\)/);
 assert.match(activation,/recoverySchemaReady = schema\.rows\[0\]\?\.ready === true/);
 assert.match(activation,/catch \{ recoverySchemaReady = null; \}/);
 assert.match(activation,/cartExecutionEnabled: false, outboundMessagingEnabled: false/);
 assert.match(dashboard,/data-testid="ecommerce-recovery-readiness"/);
 assert.match(dashboard,/activation\.data\.recoverySchemaReady === true/);
 for(const label of ["Infrastructure ready. Customer delivery remains off.","Falta completar la configuración.","משלוח הודעות מושבת."])assert.ok(dashboard.includes(label));
 assert.doesNotMatch(activation,/\bstartCheckoutRecoveryRuntime\b|\bsendRecoveryViaMeta\b/);
});

test("private owner pilot has new features; other merchants keep their previous UI",()=>{
 assert.match(dashboard,/useEcommercePilot\(\)/);
 assert.match(dashboard,/\{available:privatePilot\}/);
 assert.match(dashboard,/showShoppingSettings=\{!privatePilot\}/);
 assert.match(dashboard,/\{privatePilot && <ShoppingSettings\/>\}/);
 assert.match(dashboard,/\{privatePilot && <p data-testid="ecommerce-recovery-readiness"/);
 assert.match(dashboard,/\{privatePilot && data\?\.connected===true && commerceStatus\.data/);
});
