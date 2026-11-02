/** Private pilot: Shopify Shopping may retrieve policy facts only from
 * approved sources on the verified connected Shopify storefront, never from
 * unrelated AI Brain documents in a shared real-estate/business workspace.
 *
 * This is read-time isolation, not a second AI Brain or an auto-publishing path.
 */
import { db } from "../../drizzle/db";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
import { assertSafePublicHttpUrl } from "../websiteKnowledgeScraper";
import { listKnowledgeSources } from "../websiteKnowledge/sourceStore";
import { resolveCatalogInstallation } from "../salesCatalog/shopify/installation";
import { shopifyCatalogRequest, SHOPIFY_CATALOG_META_QUERY } from "../salesCatalog/shopify/api";

export function merchantScopedShoppingKnowledgeEnabled(userId: string): boolean {
  const allow = process.env.ECOMMERCE_SHOPIFY_MERCHANT_KNOWLEDGE_WORKSPACE_ID?.trim();
  return process.env.ECOMMERCE_SHOPIFY_MERCHANT_KNOWLEDGE_SCOPE_ENABLED === "true" &&
    !!allow && userId === allow;
}

/** Fail-closed: returns no source IDs if merchant auth, Shopify identity,
 * primary storefront origin, or source ownership cannot be confirmed.
 */
export function filterOwnedShopifyKnowledgeSources(
  sources: ReadonlyArray<{ id: string; url: string; isEnabled: boolean }>,
  hostnames: readonly string[],
): Set<string> {
  const hosts = new Set(hostnames.filter(x => typeof x === "string" &&
    /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(x) && !x.includes(".."))
    .map(x => x.toLowerCase()));
  const ids = new Set<string>();
  for (const source of sources) {
    if (!source.isEnabled || !source.id) continue;
    try {
      const url = assertSafePublicHttpUrl(source.url);
      if (url.protocol === "https:" && !url.username && !url.password &&
          (!url.port || url.port === "443") && hosts.has(url.hostname.toLowerCase())) {
        ids.add(source.id);
      }
    } catch { /* no public or private origin grants */ }
  }
  return ids;
}

export async function verifiedShopifyKnowledgeSourceIds(userId: string): Promise<Set<string>> {
  try {
    const install = await resolveCatalogInstallation(db, userId);
    if (!install) return new Set();
    const meta = await shopifyCatalogRequest(install.shop, install.token)(SHOPIFY_CATALOG_META_QUERY);
    if (normalizeShopifyShopDomain(meta?.shop?.myshopifyDomain) !== install.shop) return new Set();
    const primary = meta?.shop?.primaryDomain?.host;
    if (typeof primary !== "string" || !primary.trim()) return new Set();
    const sources = await listKnowledgeSources(userId, { enabledOnly: true });
    return filterOwnedShopifyKnowledgeSources(sources, [primary, install.shop]);
  } catch {
    return new Set(); // No policies is safer than cross-business policy leakage.
  }
}
