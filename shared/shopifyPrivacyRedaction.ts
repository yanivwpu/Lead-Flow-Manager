import type { User, Contact } from "./schema";
import { isShopifySyntheticMerchantEmail, normalizeShopifyShopDomain } from "./shopifyBilling";

/** No trial dates, global billing plans, or independent account email are changed. */
export function shopifyMerchantRedactionPatch(user: Pick<User, "email">, neutralIdentity: string): Partial<User> {
  return {
    shopifyOwnerEmail: null, shopifyWelcomeEmailSentAt: null,
    shopifyActivationEmailDay5SentAt: null, shopifyActivationEmailDay10SentAt: null,
    shopifyShop: null, shopifyAccessToken: null, shopifyChargeId: null,
    shopifySubscriptionStatus: "redacted", shopifyInstalledAt: null, shopifyAIBrainEnabled: false,
    ...(isShopifySyntheticMerchantEmail(user.email) ? {
      email: neutralIdentity, name: "Shopify account",
    } : {}),
  };
}
function directlyIdentifiesShopify(value: unknown, shop: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (row.source === "shopify" || row.lastCommerceSource === "shopify" ||
      (typeof row.trigger === "string" && row.trigger.startsWith("shopify_")) ||
      (typeof row.triggerType === "string" && row.triggerType.startsWith("shopify_"))) return true;
  return ["shop", "shopUrl", "canonicalShop", "shop_domain"].some(key =>
    typeof row[key] === "string" && normalizeShopifyShopDomain(row[key] as string) === shop);
}
export function recordBelongsToShopify(value: unknown, shop: string, depth = 0): boolean {
  if (!value || typeof value !== "object" || depth > 12) return false;
  if (Array.isArray(value)) return value.some(item => recordBelongsToShopify(item, shop, depth + 1));
  const row = value as Record<string, unknown>;
  if (row.source === "shopify" || row.lastCommerceSource === "shopify" ||
      (typeof row.trigger === "string" && row.trigger.startsWith("shopify_")) ||
      (typeof row.triggerType === "string" && row.triggerType.startsWith("shopify_"))) return true;
  for (const key of ["shop", "shopUrl", "canonicalShop", "shop_domain"])
    if (typeof row[key] === "string" && normalizeShopifyShopDomain(row[key] as string) === shop) return true;
  return Object.values(row).some(item => item && typeof item === "object" && recordBelongsToShopify(item, shop, depth + 1));
}
export function scrubShopifyContactMetadata(value: unknown, shop: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const row = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(row)) {
    if (/^shopify/i.test(key)) continue;
    if (/^commerceThreadKey$/i.test(key) && (row.lastCommerceSource === "shopify" || String(item).startsWith("shopify:"))) continue;
    if (/^lastCommerce(Source|At|Metadata)$/.test(key) &&
        (row.lastCommerceSource === "shopify" || recordBelongsToShopify(row.lastCommerceMetadata, shop))) continue;
    if (directlyIdentifiesShopify(item, shop)) continue;
    out[key] = Array.isArray(item) ? item.filter(entry => !directlyIdentifiesShopify(entry, shop))
      .map(entry => entry && typeof entry === "object" ? scrubShopifyContactMetadata(entry, shop) : entry)
      : item && typeof item === "object" ? scrubShopifyContactMetadata(item, shop) : item;
  }
  return out;
}
export function shopifyContactRedactionPatch(contact: Contact, shop: string): Partial<Contact> {
  const custom = (contact.customFields || {}) as Record<string, unknown>;
  const metadata = (custom.lastCommerceMetadata || {}) as Record<string, unknown>;
  const imported = contact.source === "shopify";
  const patch: Partial<Contact> = {
    customFields: scrubShopifyContactMetadata(custom, shop),
    sourceDetails: scrubShopifyContactMetadata(contact.sourceDetails, shop),
    ...(imported ? { source: "manual", name: "Contact", email: null, phone: null, avatar: null,
      notes: "", buyerPreferenceProfile: {}, sellerPreferenceProfile: {} } : {}),
  };
  // Shopify can fill empty fields on an existing independent contact. Erase matching copies.
  if (custom.lastCommerceSource === "shopify") {
    if (contact.email && contact.email === metadata.email) patch.email = null;
    if (contact.phone && contact.phone.replace(/\D/g, "") === String(metadata.phone || "").replace(/\D/g, "")) patch.phone = null;
  }
  if (contact.primaryChannel === "shopify") {
    patch.primaryChannel = contact.whatsappId ? "whatsapp" : contact.instagramId ? "instagram" :
      contact.facebookId ? "facebook" : contact.telegramId ? "telegram" : contact.webchatId ? "webchat" : "email";
  }
  if (contact.primaryChannelOverride === "shopify") patch.primaryChannelOverride = null;
  if (contact.lastIncomingChannel === "shopify") {
    patch.lastIncomingChannel = null; patch.lastIncomingAt = null;
  }
  return patch;
}

/** Domain provenance only: safe for old-store erasure when the account now has another shop. */
export function recordHasExplicitShop(value: unknown, shop: string, depth = 0): boolean {
  if (!value || typeof value !== "object" || depth > 12) return false;
  if (Array.isArray(value)) return value.some(item => recordHasExplicitShop(item, shop, depth + 1));
  const row = value as Record<string, unknown>;
  for (const key of ["shop", "shopUrl", "canonicalShop", "shop_domain"])
    if (typeof row[key] === "string" && normalizeShopifyShopDomain(row[key] as string) === shop) return true;
  return Object.values(row).some(item => item && typeof item === "object" && recordHasExplicitShop(item, shop, depth + 1));
}
