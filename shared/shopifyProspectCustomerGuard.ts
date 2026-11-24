import { normalizeShopifyShopDomain } from "./shopifyBilling";
/** A synced Shopify shopper is not a cold B2B prospect.
 * Identifies genuine merchant-owned customer records, not a GHL "Shopify Merchants" tag.
 * This guard is deliberately independent of marketing-consent states.
 */
export type ShopifyCustomerContactShape = {
  source?: string | null;
  sourceDetails?: unknown;
  customFields?: unknown;
};
const guardObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function isShopifyCustomerContact(contact: ShopifyCustomerContactShape): boolean {
  const custom = guardObject(contact.customFields);
  const details = guardObject(contact.sourceDetails);
  const provider = String(details.prospectImportProvider || "");
  return contact.source === "shopify" ||
    provider === "shopify" ||
    Boolean(custom.shopifyCustomerId && (custom.shopifyShop || details.shop)) ||
    Boolean(details.shopifyCustomerId && details.shop);
}
/** Prospect AI campaign builder has no purpose-specific merchant customer opt-in.
 * Always use the dedicated Shopify messaging journey eligibility instead.
 */
export const SHOPIFY_CUSTOMER_PROSPECT_OUTREACH_BLOCK = "Shopify customer: use the merchant's consent-gated messaging journeys; Prospect AI campaigns are disabled.";

export type ShopifyProspectCustomerPreviewRow = {
  contactId:string;name:string;email:string|null;phone:string|null;
  emailConsent:"subscribed"|"unsubscribed"|"not_subscribed"|"pending"|"unknown";
  smsConsent:"subscribed"|"unsubscribed"|"not_subscribed"|"pending"|"unknown";
  alreadyInReview:boolean;
};
export type ShopifyProspectCustomerPreview = {
  previewJobId:string;fingerprint:string;shop:string;
  syncedTotal:number;shown:number;alreadyInReview:number;available:number;
  offset:number;nextOffset:number|null;
  rows:ShopifyProspectCustomerPreviewRow[];expiresInMinutes:number;
};
export type ShopifyProspectReviewImportResult = {
  id:string;status:"completed";provider:"shopify";batchName:string;
  imported:number;skipped:number;duplicates:number;errors:number;
  progressCurrent:number;progressTotal:number;
};

export function linkedShopifyCustomerId(contact:ShopifyCustomerContactShape,shop:string):string|null {
  if(!isShopifyCustomerContact(contact))return null;
  const sd=guardObject(contact.sourceDetails),cf=guardObject(contact.customFields);
  const sourceShop=normalizeShopifyShopDomain(String(cf.shopifyShop||sd.shop||""));
  if(sourceShop!==shop)return null;
  const id=String(cf.shopifyCustomerId||sd.shopifyCustomerId||"");
  return /^[1-9][0-9]{0,24}$/.test(id)?id:null;
}
