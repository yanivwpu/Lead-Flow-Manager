import { createHash } from "node:crypto";
import type { SeoMetricRow } from "./opportunities";

export type ScoredOpportunity = {
  clusterKey: string; queryCluster: string[]; targetPage: string; type: "striking_distance"|"low_ctr"|"decline"|"cannibalization";
  current: {clicks:number;impressions:number;ctr:number;position:number}; previous:{clicks:number;impressions:number;ctr:number;position:number};
  priorityScore:number; confidenceScore:number; estimatedUpside:number; reason:string; evidence:Record<string, unknown>;
};
export type OpportunityScoringConfig = { minImpressions:number; maxPerRun:number; commercialTerms:string[] };
export const DEFAULT_OPPORTUNITY_CONFIG: OpportunityScoringConfig = { minImpressions: 50, maxPerRun: 10, commercialTerms:["crm","software","pricing","automation","platform","tool","business"] };
const tokens=(q:string)=>new Set(q.toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>2));
const similarity=(a:string,b:string)=>{const x=tokens(a),y=tokens(b);const common=[...x].filter(t=>y.has(t)).length;return common/Math.max(1,Math.min(x.size,y.size));};
export function clusterAndScoreOpportunities(current:SeoMetricRow[], previous:SeoMetricRow[], config=DEFAULT_OPPORTUNITY_CONFIG):ScoredOpportunity[] {
 const prior=new Map(previous.map(r=>[`${r.query}\0${r.page}`,r])); const byPage=new Map<string,SeoMetricRow[]>();
 for(const r of current) if(r.impressions>=config.minImpressions) byPage.set(r.page,[...(byPage.get(r.page)??[]),r]);
 const out:ScoredOpportunity[]=[];
 for(const [page,rows] of byPage) {
  const pending=[...rows].sort((a,b)=>b.impressions-a.impressions);
  while(pending.length){const seed=pending.shift()!;const cluster=[seed,...pending.filter(r=>similarity(seed.query,r.query)>=.5)];for(const r of cluster.slice(1)){const i=pending.indexOf(r);if(i>=0)pending.splice(i,1);}
   const agg=(items:SeoMetricRow[])=>{const impressions=items.reduce((n,r)=>n+r.impressions,0),clicks=items.reduce((n,r)=>n+r.clicks,0);return{clicks,impressions,ctr:clicks/Math.max(1,impressions),position:items.reduce((n,r)=>n+r.position*r.impressions,0)/Math.max(1,impressions)}};
   const cur=agg(cluster), old=agg(cluster.map(r=>prior.get(`${r.query}\0${r.page}`)).filter(Boolean) as SeoMetricRow[]);const commercial=cluster.some(r=>config.commercialTerms.some(t=>r.query.toLowerCase().includes(t)));
   const expected=cur.position<=3?.12:cur.position<=10?.04:.015;const loss=Math.max(0,old.clicks-cur.clicks)+Math.max(0,(old.impressions-cur.impressions)*.02);const upside=Math.max(0,(expected-cur.ctr)*cur.impressions);
   const type=cluster.length>1&&new Set(current.filter(r=>cluster.some(c=>c.query===r.query)).map(r=>r.page)).size>1?"cannibalization":loss>upside?"decline":cur.position>=4&&cur.position<=20?"striking_distance":"low_ctr";
   const priority=Math.round(Math.min(100, (Math.log10(cur.impressions+1)*15)+(upside*2)+loss+(commercial?15:0)));
   out.push({clusterKey:createHash("sha256").update(`${page}\0${cluster.map(r=>r.query.toLowerCase()).sort().join("\0")}`).digest("hex"),queryCluster:cluster.map(r=>r.query),targetPage:page,type,current:cur,previous:old,priorityScore:priority,confidenceScore:Number(Math.min(.95,.45+Math.log10(cur.impressions+1)/10+(old.impressions?0.1:0)).toFixed(2)),estimatedUpside:Number(upside.toFixed(1)),reason:`${type.replaceAll("_"," ")} cluster with ${cur.impressions} impressions${commercial?" and commercial intent":""}.`,evidence:{expectedCtr:expected,queryCount:cluster.length,commercialIntent:commercial}});
  }
 }
 return out.sort((a,b)=>b.priorityScore-a.priorityScore||a.clusterKey.localeCompare(b.clusterKey)).slice(0,config.maxPerRun);
}
