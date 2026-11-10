import type {PostPurchasePlans} from "./postPurchase";

/** Reserved state can only be changed by the locked Growth Engine services.
 * Generic integration edits/reconnects must preserve the committed current values.
 */
export const SHOPIFY_GROWTH_MANAGED_CONFIG_KEYS=[
  'ecommerceTemplateSetup','ecommercePostPurchaseTemplates','ecommercePostPurchaseTemplateAutoDisabled',
  'ecommercePostPurchasePlans','ecommercePostPurchaseDeliveryEnabled','ecommercePostPurchaseDeliveryConnection',
  'ecommerceCheckoutRecoveryTemplateId','ecommerceCheckoutRecoveryDeliveryEnabled','ecommerceCheckoutRecoveryDeliveryConnection',
] as const;
export function stripShopifyGrowthManagedConfig(config:unknown):Record<string,unknown>{
  if(!config||typeof config!=='object'||Array.isArray(config))return {};
  const reserved=new Set<string>(SHOPIFY_GROWTH_MANAGED_CONFIG_KEYS);
  return Object.fromEntries(Object.entries(config).filter(([key])=>!reserved.has(key)));
}

/** English package only. Utility bodies copied from the approved pilot library.
 * Approval belongs to a WABA, never to this package. {{1}} is the existing
 * numeric Shopify order ID, or the full freshly verified checkout recovery URL.
 */
export const SHOPIFY_GROWTH_TEMPLATES = [
  { journey: "orderConfirmation", name: "shopify_order_confirmation_v1", category: "UTILITY",
    bodyText: "Your order {{1}} has been confirmed. Thank you for your purchase!", example: "1234567890" },
  { journey: "fulfillmentUpdate", name: "shopify_shipping_update_v1", category: "UTILITY",
    bodyText: "Your order {{1}} has been fulfilled and is being prepared for shipment. Thank you for shopping with us.", example: "1234567890" },
  { journey: "cancellation", name: "shopify_order_cancellation_v1", category: "UTILITY",
    bodyText: "Your order {{1}} has been cancelled. If you have any questions, please contact our support team.", example: "1234567890" },
  { journey: "checkoutRecovery", name: "shopify_checkout_reminder", category: "MARKETING",
    bodyText: "You left items in your checkout. Complete your purchase here: {{1}} Reply STOP to stop checkout reminders.",
    example: "https://example.myshopify.com/checkouts/example/recover" },
] as const;
export type ShopifyGrowthTemplate = typeof SHOPIFY_GROWTH_TEMPLATES[number];
export type ShopifyTemplateJourney = ShopifyGrowthTemplate["journey"];
export type ShopifySetupStatus = "ready" | "awaiting_approval" | "action_required" | "unavailable" | "active" | "paused";
export type ShopifyTemplateProgress = {
  journey: ShopifyTemplateJourney; name: string; status: ShopifySetupStatus;
  reason: string; templateId?: string; checkedAt?: number;
};
export type ShopifyTemplateSetup = {
  available: boolean; connected: boolean; authorized: boolean;
  rows: ShopifyTemplateProgress[];
  postPurchasePlans?:PostPurchasePlans;
  delivery?:Record<"postPurchase"|"checkoutRecovery",{
    canActivate:boolean;merchantEnabled:boolean;deliveryEnabled:boolean;reason:string;
  }>;
};

/** Explicit template-management permission only; no recipient consent or send authorization. */
export function parseShopifyTemplateSetupAuthorization(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).length === 2 && row.action === "authorize_template_setup" && row.packageVersion === 1;
}
