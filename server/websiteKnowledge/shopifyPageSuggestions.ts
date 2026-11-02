/** Shopify policy/page URL suggestions derived from the authenticated
 * installation's verified shop.primaryDomain. NO network requests or automated
 * crawls: a merchant chooses what to add to existing AI Brain knowledge.
 */
import { assertSafePublicHttpUrl } from "../websiteKnowledgeScraper";

export type ShopifyKnowledgeSuggestion = {
  url: string;
  label: string;
  status: "shopify_confirmed" | "unverified";
};
export const SHOPIFY_POLICIES_QUERY =
  `query ShopifyKnowledgePolicies { shop { shopPolicies { type title url } } }`;
const POLICY_TYPES: Record<string, string> = {
  REFUND_POLICY: "Returns and refunds",
  SHIPPING_POLICY: "Shipping and delivery",
  PRIVACY_POLICY: "Privacy policy",
  TERMS_OF_SERVICE: "Terms of service",
  SUBSCRIPTION_POLICY: "Subscription policy",
  TERMS_OF_SALE: "Terms of sale",
};
/** An authenticated policy record confirms configuration, not HTTP accessibility.
 * Only exact same-origin /policies URLs can be offered as source links.
 */
export function confirmedShopifyPolicies(primaryHost: string, policies: unknown): ShopifyKnowledgeSuggestion[] {
  const origin = trustedShopifyKnowledgeOrigin(primaryHost);
  if (!origin || !Array.isArray(policies)) return [];
  const result: ShopifyKnowledgeSuggestion[] = [];
  const seen = new Set<string>();
  for (const raw of policies.slice(0, 25)) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const label = typeof p.type === "string" ? POLICY_TYPES[p.type] : undefined;
    if (!label || typeof p.url !== "string" || p.url.length > 2048) continue;
    let url: URL;
    try { url = assertSafePublicHttpUrl(p.url); } catch { continue; }
    if (url.origin !== origin || !url.pathname.startsWith("/policies/") ||
        url.username || url.password || url.search || url.hash || seen.has(url.href)) continue;
    result.push({url: url.href, label, status:"shopify_confirmed"});
    seen.add(url.href);
  }
  return result.slice(0, 10);
}

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
  return CANDIDATES.map(c=>({url:origin+c.path,label:c.label,status:"unverified" as const}));
}
