/** A synced Shopify shopper is not a cold B2B prospect.
 * Identifies genuine merchant-owned customer records, not a GHL "Shopify Merchants" tag.
 * This guard is deliberately independent of marketing-consent states.
 */
export type ShopifyCustomerContactShape = {
  source?: string | null;
  sourceDetails?: unknown;
  customFields?: unknown;
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function isShopifyCustomerContact(contact: ShopifyCustomerContactShape): boolean {
  const custom = object(contact.customFields);
  const details = object(contact.sourceDetails);
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
