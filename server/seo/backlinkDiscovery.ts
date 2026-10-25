/** Search-backed backlink research; never claims a backlink is present or sends outreach. */
export const BACKLINK_DISCOVERY_QUERIES = [
  { topic: "shopify", target: "https://www.whachatcrm.com/zoko-alternative", q: "Shopify WhatsApp CRM tools comparison ecommerce agency guide" },
  { topic: "realtor", target: "https://www.whachatcrm.com/realtor-growth-engine", q: "real estate AI lead qualification CRM comparison guide" },
  { topic: "whatsapp-crm", target: "https://www.whachatcrm.com/best-whatsapp-crm-2026", q: "WhatsApp CRM alternative software editorial tools guide" },
  { topic: "automation", target: "https://www.whachatcrm.com/prospect-ai", q: "AI lead follow up WhatsApp automation software comparison" },
] as const;
export type DiscoveryCandidate = { sourceUrl: string; targetUrl: string; sourceHost: string; topic: string; evidence: string; sourceReference: string };
const excluded = new Set(["whachatcrm.com","www.whachatcrm.com","app.whachatcrm.com"]);
export function normalizeDiscoveryResult(sourceUrl: string, title: string, snippet: string, topic: string, targetUrl: string): DiscoveryCandidate | null {
  try {
    const u = new URL(sourceUrl);
    const host=u.hostname.toLowerCase();
    if(u.protocol!=="https:"||!host.includes(".")||excluded.has(host)||host.endsWith(".whachatcrm.com")||u.username||u.password) return null;
    if(!title.trim()||!snippet.trim())return null;
    u.hash="";u.search="";
    return {sourceUrl:u.toString(),sourceHost:host,targetUrl,topic,evidence:(title.trim()+" — "+snippet.trim()).slice(0,700),sourceReference:"Brave Search result: "+u.toString()};
  }catch{return null;}
}
export async function searchBacklinkOpportunities(apiKey: string, maxQueries=4): Promise<DiscoveryCandidate[]> {
  if (!apiKey) throw new Error("BRAVE_SEARCH_API_KEY is not configured");
  const results: DiscoveryCandidate[]=[];
  for(const q of BACKLINK_DISCOVERY_QUERIES.slice(0,maxQueries)){
    const endpoint=new URL("https://api.search.brave.com/res/v1/web/search");
    endpoint.searchParams.set("q",q.q);endpoint.searchParams.set("count","10");
    const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),12000);
    let data:unknown;
    try{
      const res=await fetch(endpoint,{headers:{"X-Subscription-Token":apiKey,"Accept":"application/json"},signal:abort.signal});
      if(!res.ok) throw new Error("Search provider unavailable ("+res.status+")");
      data=await res.json();
    }finally{clearTimeout(timeout);}
    const items=(data as {web?:{results?:Array<{url?:string;title?:string;description?:string}>}})?.web?.results??[];
    for(const item of items){
      const candidate=normalizeDiscoveryResult(item.url??"",item.title??"",item.description??"",q.topic,q.target);
      if(candidate)results.push(candidate);
    }
  }
  return [...new Map(results.map(x=>[x.sourceUrl,x])).values()];
}
