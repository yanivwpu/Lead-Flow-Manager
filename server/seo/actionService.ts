import { randomUUID, createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { seoActions, seoActionEvents, seoActionVersions, seoAnalysisRuns, seoOpportunities } from "@shared/schema";
import { resolveSearchConsoleConfig, SeoConfigurationError } from "./searchConsole";
import { getSeoDashboard } from "./seoService";
import { contentFingerprint, mayTransitionSeoAction, recommendationIdempotencyKey, validateRecommendationOutput } from "./actionPlanner";

const ANALYSIS_LEASE_MS=15*60_000, MAX_OPPORTUNITIES=10;
export class SeoAnalysisInProgressError extends Error { code="ANALYSIS_IN_PROGRESS"; }
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
export async function analyzeSeoOpportunities(now=new Date()) {
 const config=resolveSearchConsoleConfig(); if(!config.configured||!config.siteUrl) throw new SeoConfigurationError("Search Console is not configured");
 const propertyId=config.siteUrl, leaseToken=randomUUID(), expires=new Date(now.getTime()+ANALYSIS_LEASE_MS);
 await db.execute(sql`UPDATE seo_analysis_runs SET status='failed', failure_category='LEASE_EXPIRED', completed_at=NOW() WHERE property_id=${propertyId} AND status='running' AND lease_expires_at <= NOW()`);
 let run;
 try { [run]=await db.insert(seoAnalysisRuns).values({propertyId,leaseToken,leaseExpiresAt:expires,diagnostics:{}}).returning(); }
 catch { throw new SeoAnalysisInProgressError("An SEO analysis is already running"); }
 const counts={opportunitiesEvaluated:0,opportunitiesSelected:0,competitorPagesAttempted:0,competitorPagesSucceeded:0,competitorPagesFailed:0,firstPartyPagesAnalyzed:0,recommendationsCreated:0,recommendationsUpdated:0,recommendationsSkipped:0,aiCalls:0,promptTokens:0,completionTokens:0};
 try {
  const dashboard=await getSeoDashboard(now); counts.opportunitiesEvaluated=dashboard.opportunities.length;
  for(const item of dashboard.opportunities.slice(0,MAX_OPPORTUNITIES)) {
   if(!item.page){counts.recommendationsSkipped++;continue;} counts.opportunitiesSelected++;
   const cluster=[item.query], clusterKey=hash(`${item.page}\0${item.query.toLowerCase()}`); const current={clicks:item.evidence.clicks??0,impressions:item.evidence.impressions??0,position:item.evidence.position??0}; const previous={clicks:item.evidence.previousClicks??0,impressions:item.evidence.previousImpressions??0,position:item.evidence.previousPosition??0};
   const [opportunity]=await db.insert(seoOpportunities).values({propertyId,clusterKey,targetPage:item.page,queryCluster:cluster,opportunityType:item.type,currentMetrics:current,previousMetrics:previous,priorityScore:item.priority,confidenceScore:.65,estimatedUpside:Math.max(0,Math.round(Number(current.impressions)*.02)),reason:`${item.type.replaceAll("_"," ")} identified from current and previous Search Console periods.`,evidence:item.evidence}).onConflictDoUpdate({target:[seoOpportunities.propertyId,seoOpportunities.clusterKey],set:{currentMetrics:current,previousMetrics:previous,priorityScore:item.priority,evidence:item.evidence,refreshedAt:now}}).returning();
   const fingerprint=contentFingerprint({page:item.page}); const actionType=item.type==="low_ctr"?"meta_description":item.type==="cannibalization"?"cannibalization":"content_expansion";
   const proposal=validateRecommendationOutput({actionType,proposedMetaDescription:actionType==="meta_description"?`Explore WhachatCRM for ${item.query}: organize conversations, follow up consistently, and manage customer relationships from one workspace.`:null,contentBrief:actionType!=="meta_description"?`Expand the existing page with an original section that directly answers the intent behind “${item.query}”. Cover workflow, fit, and next steps using only verified product facts.`:null,insertionLocation:"After the existing primary product overview",explanation:`Search Console evidence identifies this query and page as a ${item.type.replaceAll("_"," ")} opportunity.`,expectedBenefit:"Improve relevance and qualified organic click potential while preserving the existing page intent.",confidence:.65,risk:actionType==="cannibalization"?"high":"medium",automaticExecutionEligible:false,rollbackConcept:"Restore the content version identified by the original SHA-256 fingerprint.",evidenceIds:[opportunity.id]});
   const key=recommendationIdempotencyKey(propertyId,item.page,cluster,actionType);
   const inserted=await db.execute(sql`INSERT INTO seo_actions (property_id,opportunity_id,idempotency_key,target_page,query_cluster,action_type,status,risk,confidence,expected_benefit,original_content_fingerprint) VALUES (${propertyId},${opportunity.id},${key},${item.page},${JSON.stringify(cluster)}::jsonb,${actionType},'proposed',${proposal.risk},${proposal.confidence},${proposal.expectedBenefit},${fingerprint}) ON CONFLICT (property_id,idempotency_key) WHERE status IN ('detected','researching','proposed','approved') DO NOTHING RETURNING id`);
   const actionId=String((inserted.rows[0] as any)?.id??""); if(!actionId){counts.recommendationsSkipped++;continue;}
   await db.insert(seoActionVersions).values({actionId,version:1,proposal,aiProvider:"deterministic",aiModel:"phase-2b-safe-template",promptVersion:"seo-action-v1"});
   await db.insert(seoActionEvents).values({actionId,fromStatus:"researching",toStatus:"proposed",safeMetadata:{runId:run.id}}); counts.recommendationsCreated++;
  }
  await db.update(seoAnalysisRuns).set({status:"success",diagnostics:counts,completedAt:new Date()}).where(and(eq(seoAnalysisRuns.id,run.id),eq(seoAnalysisRuns.leaseToken,leaseToken)));
  console.info("[SEO Action Analysis] completed",{runId:run.id,...counts,durationMs:Date.now()-now.getTime()}); return {runId:run.id,status:"success",counts};
 } catch(error){await db.update(seoAnalysisRuns).set({status:"failed",failureCategory:"ANALYSIS_FAILED",diagnostics:counts,completedAt:new Date()}).where(and(eq(seoAnalysisRuns.id,run.id),eq(seoAnalysisRuns.leaseToken,leaseToken)));console.error("[SEO Action Analysis] failed",{runId:run.id,failureCategory:"ANALYSIS_FAILED"});throw error;}
}
export async function listSeoActions(filters:{status?:string;risk?:string;type?:string;page?:string}={}) {
 const config=resolveSearchConsoleConfig(); const propertyId=config.siteUrl??"__unconfigured__";
 const result=await db.execute(sql`SELECT a.*,v.proposal,o.opportunity_type,o.current_metrics,o.previous_metrics,o.priority_score,o.estimated_upside,(SELECT COUNT(*) FROM seo_competitor_snapshots c WHERE c.property_id=a.property_id AND c.status='success') AS competitors_analyzed FROM seo_actions a JOIN seo_opportunities o ON o.id=a.opportunity_id JOIN seo_action_versions v ON v.action_id=a.id AND v.version=a.current_version WHERE a.property_id=${propertyId} AND (${filters.status??null}::text IS NULL OR a.status=${filters.status??null}) AND (${filters.risk??null}::text IS NULL OR a.risk=${filters.risk??null}) AND (${filters.type??null}::text IS NULL OR a.action_type=${filters.type??null}) AND (${filters.page??null}::text IS NULL OR a.target_page ILIKE ${filters.page?`%${filters.page}%`:null}) ORDER BY o.priority_score DESC,a.updated_at DESC LIMIT 100`);
 return {provider:{competitorDiscoveryConfigured:false,state:"not_configured"},actions:result.rows};
}
export async function transitionSeoAction(id:string,to:"approved"|"rejected"|"researching",actorId:string,reason?:string){
 return db.transaction(async tx=>{const [action]=await tx.select().from(seoActions).where(eq(seoActions.id,id)).limit(1);if(!action)throw Object.assign(new Error("Action not found"),{status:404});if(!mayTransitionSeoAction(action.status,to))throw Object.assign(new Error("Invalid lifecycle transition"),{status:409});const now=new Date();const changed=await tx.update(seoActions).set({status:to,updatedAt:now,...(to==="approved"?{approvedBy:actorId,approvedAt:now}:{}),...(to==="rejected"?{rejectedBy:actorId,rejectedAt:now,rejectionReason:reason?.slice(0,1000)}:{})}).where(and(eq(seoActions.id,id),eq(seoActions.status,action.status))).returning({id:seoActions.id});if(!changed.length)throw Object.assign(new Error("Action status changed"),{status:409});await tx.insert(seoActionEvents).values({actionId:id,fromStatus:action.status,toStatus:to,actorId,reason:reason?.slice(0,1000),safeMetadata:{publishingPerformed:false}});return{status:to,published:false,message:"Approval records intent only; Phase 2B never changes public content."};});
}
