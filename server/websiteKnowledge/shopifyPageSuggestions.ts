/** Existing AI Brain source suggestions for a verified connected Shopify storefront.
 * Only public pages with meaningful content may be suggested; never published,
 * imported, or made customer-visible without the merchant's explicit review.
 */
import { assertSafePublicHttpUrl, scrapeGuidedWebsiteKnowledgePages } from "../websiteKnowledgeScraper";

export type ShopifyKnowledgeSuggestion = { url: string; label: string };
const CANDIDATES = [
  { path:"/policies/refund-policy", label:"Returns and refunds" },
  { path:"/policies/shipping-policy", label:"Shipping and delivery" },
  { path:"/pages/faq", label:"Frequently asked questions" },
  { path:"/pages/about-us", label:"About the store" },
  { path:"/", label:"Store information" },
] as const;

export function trustedShopifyKnowledgeOrigin(shopifyPrimaryHost: string): string | null {
  if (typeof shopifyPrimaryHost !== "string" || shopifyPrimaryHost.length>253 ||
      !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(shopifyPrimaryHost) ||
      shopifyPrimaryHost.includes("..")) return null;
  try {
    const url=assertSafePublicHttpUrl("https://"+shopifyPrimaryHost);
    // No user-provided URL, ports, credentials or paths. Domain came from
    // authenticated Shopify shop.primaryDomain only.
    return url.origin;
  } catch { return null; }
}

export async function suggestShopifyKnowledgePages(
  shopifyPrimaryHost: string,
  probe: typeof scrapeGuidedWebsiteKnowledgePages = scrapeGuidedWebsiteKnowledgePages,
): Promise<ShopifyKnowledgeSuggestion[]> {
  const origin=trustedShopifyKnowledgeOrigin(shopifyPrimaryHost);
  if(!origin)return [];
  const expected=new URL(origin).hostname.toLowerCase();
  const slots=CANDIDATES.map((entry,i)=>({
    key:String(i),label:entry.label,urlRaw:origin+entry.path,
  }));
  const {pages,results}=await probe(slots);
  const output:ShopifyKnowledgeSuggestion[]=[];
  const existing=new Set<string>();
  for(const result of results){
    const page=pages.find(p=>p.key===result.key);
    if(result.status!=="scanned"||!page||!result.finalUrl||page.text.length<120)continue;
    let url:URL;
    try{url=assertSafePublicHttpUrl(result.finalUrl)}catch{continue}
    // A Shopify storefront may redirect missing pages to its home or login page.
    // Never mislabel those fallbacks as a detected policy or FAQ.
    const candidate=slots.find(slot=>slot.key===result.key);
    if(!candidate || url.pathname.replace(/\/$/,"") !== new URL(candidate.urlRaw).pathname.replace(/\/$/,""))continue;
    // A Shopify storefront may redirect to a different website.
    // Do not silently claim that third-party or login pages belong to this shop.
    if(url.hostname.toLowerCase()!==expected || url.protocol!=="https:" ||
       /(?:password|login|account|captcha|challenge|checkout)/i.test(url.pathname) ||
       /(?:this shop is currently unavailable|enter using password|404 page not found)/i.test(page.text.slice(0,600)) ||
       existing.has(url.href))continue;
    existing.add(url.href);
    output.push({url:url.href,label:result.label});
  }
  return output.slice(0,CANDIDATES.length);
}
