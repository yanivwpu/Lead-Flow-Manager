/** Read-only email marketing audience preview. This does not queue or send mail.
 * Reuses exact workspace ownership, existing durable suppression and Shopify
 * source data. A merchant location or email domain never proves customer country.
 */
import { storage } from "../storage";
import { INCLUDE_INBOX_IDENTITIES } from "@shared/contactCrmVisibility";
import { isShopifyCustomerContact } from "@shared/shopifyProspectCustomerGuard";
import {
  evaluateMarketingEmailAudience, hasLegacyEmailMarketingOptOut,
  type MarketingEmailAudiencePreview, type MarketingEmailAudienceSource,
  type MarketingEmailAudienceDecision,
} from "@shared/marketingEmailAudienceEligibility";
import { batchSuppressedContactIds } from "./store";
import { contactSuppressionState } from "../prospectImport/prospectOutreachEligibilityService";

const obj=(value:unknown):Record<string,unknown>=>
  value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const txt=(value:unknown):string=>typeof value==="string"?value:"";

export async function previewMarketingEmailAudience(input:{
  workspaceUserId:string;source:MarketingEmailAudienceSource;offset:number;limit:number;
}):Promise<MarketingEmailAudiencePreview>{
  if(!Number.isSafeInteger(input.offset)||input.offset<0||input.offset>50000 ||
    !Number.isSafeInteger(input.limit)||input.limit<1||input.limit>100)
    throw new Error("Invalid audience page.");
  const contacts=await storage.getContacts(input.workspaceUserId,50000,INCLUDE_INBOX_IDENTITIES);
  const sourceFor=(contact:typeof contacts[number]):Exclude<MarketingEmailAudienceSource,"all">=>{
    if(isShopifyCustomerContact(contact))return "shopify";
    const sd=obj(contact.sourceDetails);
    return txt(sd.prospectImportProvider)==="csv"?"csv":"crm";
  };
  const eligibleContacts=contacts.filter(c=>input.source==="all"||sourceFor(c)===input.source);
  const page=eligibleContacts.slice(input.offset,input.offset+input.limit);
  // Email-only (and linked all-channel DNC) ledger. No user-facing opt-out
  // controls may override this durable store.
  const suppressed=await batchSuppressedContactIds(input.workspaceUserId,page,"email");
  const rows=page.map(contact=>{
    const cf=obj(contact.customFields);
    const snap=obj(cf.shopifyCustomerSync);
    const consent=obj(snap.consent);
    const emailConsent=obj(consent.email_marketing_consent);
    const source=sourceFor(contact);
    const legacySuppressed=contactSuppressionState(contact,"email").suppressed ||
      hasLegacyEmailMarketingOptOut(cf);
    // Strict default: there is currently no recipient-level authoritative
    // country record in the Shopify sync. Do not infer US from store location.
    // Owner attestations and verified country evidence require a separate
    // reviewed, durable authorization flow before opt-out-only US marketing.
    const result=evaluateMarketingEmailAudience({
      email:contact.email,
      shopifyConsentState:source==="shopify"?emailConsent.state:"unknown",
      shopifyAcceptsMarketing:source==="shopify"?consent.acceptsMarketing:undefined,
      suppressed:suppressed.has(contact.id)||legacySuppressed,
      verifiedRecipientCountry:null,
      documentedExistingCustomerRelationship:false,
      ownerConfirmedUsOptOutBasis:false,
    });
    return {
      contactId:contact.id,name:contact.name,email:contact.email,source,
      decision:result.decision,reason:result.reason,
    };
  });
  const counts:Record<MarketingEmailAudienceDecision,number>={
    eligible_opt_in:0,eligible_us_opt_out:0,needs_verification:0,suppressed:0,
  };
  for(const row of rows)counts[row.decision]++;
  return {source:input.source,total:eligibleContacts.length,offset:input.offset,
    limit:input.limit,rows,counts,sendingEnabled:false};
}
