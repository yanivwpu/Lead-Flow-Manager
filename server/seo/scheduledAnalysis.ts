import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { seoScheduledAnalysisClaims } from "@shared/schema";
import { analyzeSeoOpportunities, safeSeoAnalysisError } from "./actionService";
import { resolveSearchConsoleConfig } from "./searchConsole";

export const SEO_SCHEDULED_ANALYSIS_LEASE_MINUTES = 30;
export type ScheduledAnalysisClaim = { propertyId:string; reportingDay:string; syncRunId:string; leaseToken:string };

export async function claimScheduledSeoAnalysis(reportingDay:string,syncRunId:string):Promise<ScheduledAnalysisClaim|null>{
  const config=resolveSearchConsoleConfig();
  if(!config.configured||!config.siteUrl)return null;
  const leaseToken=randomUUID();
  const result=await db.execute(sql`INSERT INTO seo_scheduled_analysis_claims
    (property_id,reporting_day,sync_run_id,status,lease_token,lease_expires_at,created_at,updated_at)
    VALUES (${config.siteUrl},${reportingDay},${syncRunId},'running',${leaseToken},NOW()+(${SEO_SCHEDULED_ANALYSIS_LEASE_MINUTES}*INTERVAL '1 minute'),NOW(),NOW())
    ON CONFLICT (property_id,reporting_day) DO UPDATE SET
      sync_run_id=EXCLUDED.sync_run_id,status='running',lease_token=EXCLUDED.lease_token,
      lease_expires_at=EXCLUDED.lease_expires_at,last_error=NULL,updated_at=NOW()
    WHERE seo_scheduled_analysis_claims.status='failed'
       OR (seo_scheduled_analysis_claims.status='running' AND seo_scheduled_analysis_claims.lease_expires_at<=NOW())
    RETURNING property_id,reporting_day,sync_run_id,lease_token`);
  const row=result.rows[0] as Record<string,unknown>|undefined;
  return row&&row.lease_token===leaseToken?{propertyId:String(row.property_id),reportingDay:String(row.reporting_day).slice(0,10),syncRunId:String(row.sync_run_id),leaseToken}:null;
}

async function finishScheduledSeoAnalysis(claim:ScheduledAnalysisClaim,status:"success"|"failed",analysisRunId?:string,error?:unknown){
  const safe=error?safeSeoAnalysisError(error).message:null;
  await db.update(seoScheduledAnalysisClaims).set({status,analysisRunId:analysisRunId??null,lastError:safe,leaseExpiresAt:new Date(),updatedAt:new Date()}).where(and(
    eq(seoScheduledAnalysisClaims.propertyId,claim.propertyId),eq(seoScheduledAnalysisClaims.reportingDay,claim.reportingDay),eq(seoScheduledAnalysisClaims.leaseToken,claim.leaseToken),
  ));
}

export async function runAnalysisAfterSuccessfulScheduledSync(
  result:{runId:string;status:"success"|"partial"|"failed"},
  reportingDay:string,
  deps:{claim?:typeof claimScheduledSeoAnalysis;analyze?:(now?:Date,trigger?:"manual"|"scheduled")=>Promise<{runId:string}>;finish?:typeof finishScheduledSeoAnalysis}={},
):Promise<"completed"|"skipped"|"failed">{
  if(result.status!=="success")return "skipped";
  const claim=await (deps.claim??claimScheduledSeoAnalysis)(reportingDay,result.runId);
  if(!claim)return "skipped";
  try{
    const analysis=await (deps.analyze??analyzeSeoOpportunities)(new Date(),"scheduled");
    await (deps.finish??finishScheduledSeoAnalysis)(claim,"success",analysis.runId);
    return "completed";
  }catch(error){
    try{await (deps.finish??finishScheduledSeoAnalysis)(claim,"failed",undefined,error);}catch(persistError){console.error("[SEO Analysis] failed to persist scheduled failure",safeSeoAnalysisError(persistError));}
    console.error("[SEO Analysis] automatic post-sync analysis failed",safeSeoAnalysisError(error));
    return "failed";
  }
}
