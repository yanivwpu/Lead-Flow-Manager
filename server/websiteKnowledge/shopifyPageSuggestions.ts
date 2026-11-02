/** Shopify policy/page URL suggestions derived from the authenticated
 * installation's verified shop.primaryDomain. NO network requests or automated
 * crawls: a merchant chooses what to add to existing AI Brain knowledge.
 */
import { assertSafePublicHttpUrl } from "../websiteKnowledgeScraper";

export type ShopifyKnowledgeSuggestion = { url: string; label: string };
const CANDIDATES = [
  { path:"/policies/refund-policy", label:"Returns and refunds" },
  { path:"/policies/shipping-policy", label:"Shipping and delivery" },
  { path:"/pages/faq", label:"Frequently asked questions" },
  { path:"/pages/about-us", label:"About the store" },
  { path:"/", label:"Store homepage" },
] as const;

export function trustedShopifyKnowledgeOrigin(primaryHost: string): string | null {
  if(typeof primaryHost !== "string" || primaryHost.length > 253 ||
     !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(primaryHost) ||
     primaryHost.includes(".."))return null;
  try {
    const origin=assertSafePublicHttpUrl("https://"+primaryHost).origin;
    return origin;
  } catch {return null;}
}

/** URLs are CANDIDATES, not an assertion a page exists or has approved facts.
 * This pure function does no fetching, follows no redirects, and never changes
 * tenant knowledge. AI Brain scans only merchant-added URLs later.
 */
export function suggestShopifyKnowledgePages(primaryHost: string): ShopifyKnowledgeSuggestion[] {
  const origin=trustedShopifyKnowledgeOrigin(primaryHost);
  if(!origin)return [];
  return CANDIDATES.map(c=>({url:origin+c.path,label:c.label}));
}
