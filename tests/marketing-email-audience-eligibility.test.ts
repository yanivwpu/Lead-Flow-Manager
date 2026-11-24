import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { evaluateMarketingEmailAudience as decide, hasLegacyEmailMarketingOptOut } from "../shared/marketingEmailAudienceEligibility";

test("Explicit opt-out and suppression always win, including when Shopify says subscribed", () => {
  for (const input of [
    {shopifyConsentState:"UNSUBSCRIBED"},
    {shopifyConsentState:"SUBSCRIBED",suppressed:true},
    {shopifyConsentState:"SUBSCRIBED",explicitOptOut:true},
    {shopifyConsentState:"SUBSCRIBED",shopifyAcceptsMarketing:false},
    {shopifyConsentState:"REDACTED"},
  ]) {
    assert.equal(decide({email:"buyer@example.com",...input}).potentialEmailRecipient,false);
  }
});
test("Subscribed recipients may be reviewed; still not authorized for sending", () => {
  const result=decide({email:"buyer@example.com",shopifyConsentState:"SUBSCRIBED"});
  assert.deepEqual(result,{decision:"eligible_opt_in",reason:"subscribed",potentialEmailRecipient:true});
});
test("U.S. non-opt-in requires actual country evidence, merchant relationship and explicit owner assertion",()=>{
  const basis={email:"buyer@example.com",shopifyConsentState:"NOT_SUBSCRIBED",
    documentedExistingCustomerRelationship:true,ownerConfirmedUsOptOutBasis:true};
  assert.equal(decide(basis).decision,"needs_verification");
  assert.equal(decide({...basis,verifiedRecipientCountry:"CA"}).decision,"needs_verification");
  assert.equal(decide({...basis,verifiedRecipientCountry:"US",ownerConfirmedUsOptOutBasis:false}).decision,"needs_verification");
  assert.equal(decide({...basis,verifiedRecipientCountry:"US",documentedExistingCustomerRelationship:false}).decision,"needs_verification");
  assert.deepEqual(decide({...basis,verifiedRecipientCountry:"US"}),
    {decision:"eligible_us_opt_out",reason:"documented_us_existing_customer",potentialEmailRecipient:true});
});
test("No consent recorded is not an opt-out; pending consent is held",()=>{
  assert.deepEqual(decide({email:"buyer@example.com",shopifyConsentState:"unknown"}).decision,"needs_verification");
  assert.equal(decide({email:"buyer@example.com",shopifyConsentState:"PENDING"}).reason,"pending_consent");
  assert.equal(decide({email:"invalid",shopifyConsentState:"SUBSCRIBED"}).reason,"invalid_email");
});
test("Legacy bounce, unsubscribe, DNC, and opt-out flags cannot be bypassed",()=>{
  for(const flag of ["unsubscribed","emailUnsubscribed","optOut","campaignOptOut","doNotContact","emailBounced","bounced","suppressed"])
    assert.equal(hasLegacyEmailMarketingOptOut({[flag]:true}),true);
  assert.equal(hasLegacyEmailMarketingOptOut({marketingOptIn:false}),true);
  assert.equal(hasLegacyEmailMarketingOptOut({marketingOptIn:true}),false);
});

test("The new audience route is read-only and scopes opt-out writes to owner identity",()=>{
  const routes=readFileSync("server/marketingCompliance/routes.ts","utf8");
  const preview=readFileSync("server/marketingCompliance/audiencePreview.ts","utf8");
  const widget=readFileSync("client/src/components/settings/MarketingEmailAudienceReview.tsx","utf8");
  const source=routes.slice(routes.indexOf("// Read-only source-specific audience classification."),routes.indexOf('app.get("/api/marketing/sender-profiles"'));
  assert.match(source,/requireProspectImportAccess/);
  assert.match(source,/workspaceUserId:req\.user\.id/);
  assert.match(source,/contact\.userId !== req\.user\.id/);
  assert.match(source,/scope:"email"/);
  assert.match(source,/suppressMarketingIdentity/);
  assert.doesNotMatch(source,/sendEmail\(|withCompliantMarketingEmail\(|enqueueCampaign\(/);
  assert.match(preview,/batchSuppressedContactIds\(input\.workspaceUserId,page,"email"\)/);
  assert.match(preview,/contactSuppressionState\(contact,"email"\)/);
  assert.match(preview,/shopifyConsentState:source==="shopify"/);
  assert.match(preview,/ownerConfirmedUsOptOutBasis:false/);
  assert.match(preview,/sendingEnabled:false/);
  assert.match(widget,/Mark email opted out/);
  assert.match(widget,/Confirm opt-out/);
  assert.match(widget,/this screen cannot start a campaign/);
});
