import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isShopifyCustomerContact, linkedShopifyCustomerId, SHOPIFY_CUSTOMER_PROSPECT_OUTREACH_BLOCK } from "../shared/shopifyProspectCustomerGuard";
import { buildProspectOutreachEligibilityInput } from "../server/prospectImport/prospectCampaignReadinessEvaluation";

const shopper = {source:"shopify", sourceDetails:{shop:"store-a.myshopify.com",shopifyCustomerId:"123"},
  customFields:{shopifyShop:"store-a.myshopify.com",shopifyCustomerId:"123"}};
const ghlBusiness = {source:"import",tag:"Imported-Shopify",
  sourceDetails:{prospectImportProvider:"gohighlevel"},
  customFields:{}};
test("Shopify identity requires source record tied to one exact store",()=>{
  assert.equal(isShopifyCustomerContact(shopper),true);
  assert.equal(linkedShopifyCustomerId(shopper,"store-a.myshopify.com"),"123");
  assert.equal(linkedShopifyCustomerId(shopper,"store-b.myshopify.com"),null);
  assert.equal(linkedShopifyCustomerId({...shopper,sourceDetails:{},customFields:{shopifyCustomerId:"123"}},"store-a.myshopify.com"),null);
  assert.equal(isShopifyCustomerContact(ghlBusiness),false);
  assert.equal(linkedShopifyCustomerId(ghlBusiness,"store-a.myshopify.com"),null);
});
test("Shopify customer is blocked from cold Prospect AI campaigns regardless of opt-in label",()=>{
  const result=buildProspectOutreachEligibilityInput({
    contact:{...shopper,email:"buyer@example.com",phone:"15551234567",name:"Buyer",id:"b",userId:"a"} as any,
    intelligence:{analysisStatus:"completed",reviewStatus:"approved",approvedAt:new Date()},
    priorOutreach:{alreadyContacted:false,reason:"ok"} as any,
    connections:{emailConnected:true,smsConnected:true,whatsappConnected:true} as any,
    suppression:{suppressed:false,optedOut:false,reason:null,detail:null},
    alreadyQueued:false,websiteUrl:null,
  });
  assert.equal(result.suppressed,true);
  assert.equal(result.suppressionDetail,SHOPIFY_CUSTOMER_PROSPECT_OUTREACH_BLOCK);
});
test("Merchant scope, privacy locks, preview TTL and no-send behavior are hard server rules",()=>{
  const src=readFileSync("server/prospectImport/shopifyCustomerImportService.ts","utf8");
  const routes=readFileSync("server/routes/prospectImport.ts","utf8");
  const analysis=readFileSync("server/prospectImport/prospectBulkAnalysisService.ts","utf8");
  const eligibility=readFileSync("server/prospectImport/prospectIntelligenceEligibility.ts","utf8");
  const ui=readFileSync("client/src/components/settings/GhlProspectImport.tsx","utf8");
  assert.match(src,/isShopifyContactInstallationActive/);
  assert.match(src,/integration\.userId,userId/);
  assert.match(src,/customerPrivacyLocked/);
  assert.match(src,/pg_advisory_xact_lock/);
  assert.match(src,/preview\.filterFingerprint!==input\.fingerprint/);
  assert.match(src,/existingIds\.has\(id\)/);
  assert.match(src,/createdContactIds:\[\]/);
  assert.match(src,/analysisStatus:"needs_review"/);
  assert.match(src,/reviewStatus:"needs_review"/);
  assert.match(src,/shopifyCustomerReviewOnly:true/);
  assert.match(src,/sourceDetails:\{\.\.\.sd,prospectImportProvider:"shopify"/);
  assert.doesNotMatch(src,/sendMessage|sendTemplate|enqueueProspectAutoQualification|storage\.createContact|offlineGraphqlClient/);
  assert.match(routes,/prospect-import\/shopify\/preview/);
  assert.match(routes,/prospect-import\/shopify\/import/);
  assert.match(routes,/requireProspectImportAccess/);
  assert.match(analysis,/selectedCustomers\.some\(isShopifyCustomerContact\)/);
  assert.match(eligibility,/isShopifyCustomerContact/);
  assert.match(ui,/disabled=\{p !== "gohighlevel" && p !== "csv" && p !== "shopify"\}/);
});
