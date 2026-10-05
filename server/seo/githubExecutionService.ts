import { runSeoPublicationOnce, updateSeoPublicationMeasurements } from "./publicationService";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { seoActionEvents, seoActions, seoGithubExecutions } from "@shared/schema";
import { executeSeoGithubPullRequest, safeGithubExecutionError, seoBranchName, SeoGithubExecutionError, type SeoGithubExecutionInput } from "./githubExecutor";

export const SEO_GITHUB_EXECUTION_LEASE_MINUTES=15;
export const SEO_GITHUB_WORKER_INTERVAL_MS=30_000;
export const SEO_AUTOPILOT_BACKGROUND_INTERVAL_MS=5*60_000;
let workerTimer:NodeJS.Timeout|null=null,autopilotTimer:NodeJS.Timeout|null=null,workerActive=false;

export function assertApprovedSeoExecution(status:unknown,currentVersion:unknown,requestedVersion:number){
  if(status!=="approved")throw new SeoGithubExecutionError("ACTION_NOT_APPROVED","SEO action must remain approved before GitHub execution");
  if(Number(currentVersion)!==requestedVersion)throw new SeoGithubExecutionError("STALE_ACTION_VERSION","Approved proposal version is no longer current");
}

export async function enqueueApprovedSeoExecution(actionId:string,actionVersion:number,tx:typeof db=db){
  const [row]=await tx.insert(seoGithubExecutions).values({actionId,actionVersion,status:"pending"}).onConflictDoNothing({target:[seoGithubExecutions.actionId,seoGithubExecutions.actionVersion]}).returning();
  return row??null;
}

export async function claimPendingSeoExecution(){
  const token=randomUUID();
  const result=await db.execute(sql`WITH candidate AS (
    SELECT id FROM seo_github_executions
    WHERE status='pending' OR (status='running' AND lease_expires_at<=NOW())
    ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED
  ) UPDATE seo_github_executions e SET status='running',lease_token=${token},
    lease_expires_at=NOW()+(${SEO_GITHUB_EXECUTION_LEASE_MINUTES}*INTERVAL '1 minute'),started_at=COALESCE(started_at,NOW()),updated_at=NOW(),error_message=NULL
    FROM candidate WHERE e.id=candidate.id RETURNING e.*`);
  const row=result.rows[0] as Record<string,unknown>|undefined;
  if(!row||row.lease_token!==token)return null;
  const id=String(row.id),actionId=String(row.action_id),branchName=String(row.branch_name??seoBranchName(`${actionId}-${id}`));
  if(!row.branch_name)await db.update(seoGithubExecutions).set({branchName,updatedAt:new Date()}).where(and(eq(seoGithubExecutions.id,id),eq(seoGithubExecutions.leaseToken,token)));
  return{id,actionId,actionVersion:Number(row.action_version),token,branchName};
}

async function loadExecutionInput(actionId:string,actionVersion:number):Promise<SeoGithubExecutionInput>{
  const result=await db.execute(sql`SELECT a.id,a.status,a.current_version,a.target_page,a.action_type,a.original_content_fingerprint,
    o.opportunity_type,o.evidence,v.proposal
    FROM seo_actions a JOIN seo_opportunities o ON o.id=a.opportunity_id
    JOIN seo_action_versions v ON v.action_id=a.id AND v.version=${actionVersion}
    WHERE a.id=${actionId} LIMIT 1`);
  const row=result.rows[0] as Record<string,unknown>|undefined;
  if(!row)throw new SeoGithubExecutionError("ACTION_NOT_FOUND","Approved SEO action or proposal version no longer exists");
  assertApprovedSeoExecution(row.status,row.current_version,actionVersion);
  return{actionId:String(row.id),actionVersion,targetPage:String(row.target_page),actionType:String(row.action_type),originalContentFingerprint:String(row.original_content_fingerprint),opportunityType:String(row.opportunity_type),evidence:row.evidence,proposal:row.proposal as SeoGithubExecutionInput["proposal"]};
}

export async function executeClaimedSeoGithubJob(claim:{id:string;actionId:string;actionVersion:number;token:string;branchName?:string},deps:{execute?:typeof executeSeoGithubPullRequest}={}){
  try{
    const input=await loadExecutionInput(claim.actionId,claim.actionVersion),result=await (deps.execute??executeSeoGithubPullRequest)(input,{branchName:claim.branchName,onProgress:async progress=>{
      await db.update(seoGithubExecutions).set({...(progress.branchName?{branchName:progress.branchName}:{}),...(progress.commitSha?{commitSha:progress.commitSha}:{}),...(progress.prNumber?{prNumber:progress.prNumber}:{}),...(progress.prUrl?{prUrl:progress.prUrl}:{}),updatedAt:new Date()}).where(and(eq(seoGithubExecutions.id,claim.id),eq(seoGithubExecutions.leaseToken,claim.token),eq(seoGithubExecutions.status,"running")));
    }});
    const updated=await db.update(seoGithubExecutions).set({status:"pr_created",branchName:result.branchName,commitSha:result.commitSha,prNumber:result.prNumber,prUrl:result.prUrl,errorMessage:null,leaseToken:null,leaseExpiresAt:null,completedAt:new Date(),updatedAt:new Date()}).where(and(eq(seoGithubExecutions.id,claim.id),eq(seoGithubExecutions.leaseToken,claim.token),eq(seoGithubExecutions.status,"running"))).returning({id:seoGithubExecutions.id});
    if(!updated.length)throw new SeoGithubExecutionError("EXECUTION_LEASE_LOST","SEO GitHub execution lease was lost before completion");
    await db.insert(seoActionEvents).values({actionId:claim.actionId,fromStatus:"approved",toStatus:"approved",reason:"GitHub pull request created",safeMetadata:{executionId:claim.id,branchName:result.branchName,commitSha:result.commitSha,prNumber:result.prNumber,prUrl:result.prUrl,publishingPerformed:false}});
    return result;
  }catch(error){
    const stale=error instanceof SeoGithubExecutionError&&["STALE_FINGERPRINT","STALE_ACTION_VERSION"].includes(error.code),message=safeGithubExecutionError(error);
    await db.transaction(async tx=>{
      const failed=await tx.update(seoGithubExecutions).set({status:stale?"stale":"failed",errorMessage:message,leaseToken:null,leaseExpiresAt:null,completedAt:new Date(),updatedAt:new Date()}).where(and(eq(seoGithubExecutions.id,claim.id),eq(seoGithubExecutions.leaseToken,claim.token))).returning({id:seoGithubExecutions.id});
      if(!failed.length)return;
      await tx.execute(sql`UPDATE seo_github_executions SET failure_code=${error instanceof SeoGithubExecutionError?error.code:"EXECUTION_FAILED"} WHERE id=${claim.id} AND status IN ('failed','stale')`);
      if(stale){
        await tx.update(seoActions).set({status:"revision_required",staleAt:new Date(),updatedAt:new Date()}).where(and(eq(seoActions.id,claim.actionId),eq(seoActions.status,"approved")));
        await tx.insert(seoActionEvents).values({actionId:claim.actionId,fromStatus:"approved",toStatus:"revision_required",reason:"GitHub execution stopped because the approved source version is stale",safeMetadata:{executionId:claim.id,failureCategory:(error as SeoGithubExecutionError).code,publishingPerformed:false}});
      }
    });
    console.error("[SEO GitHub] execution failed",{executionId:claim.id,code:error instanceof SeoGithubExecutionError?error.code:"EXECUTION_FAILED",message});
    return null;
  }
}

export async function runSeoGithubExecutionWorkerOnce(deps:{claim?:typeof claimPendingSeoExecution;executeJob?:typeof executeClaimedSeoGithubJob}={}){
  const claim=await (deps.claim??claimPendingSeoExecution)();
  if(!claim)return false;
  await (deps.executeJob??executeClaimedSeoGithubJob)(claim);
  return true;
}
export function wakeSeoGithubExecutionWorker(){if(workerActive)return;workerActive=true;void (async()=>{await runSeoGithubExecutionWorkerOnce();await runSeoPublicationOnce();await updateSeoPublicationMeasurements();})().catch(error=>console.error("[SEO GitHub] worker error",{message:safeGithubExecutionError(error)})).finally(()=>{workerActive=false;});}
export function startSeoGithubExecutionWorker(){
  if(workerTimer)return;
  wakeSeoGithubExecutionWorker();
  const runAutopilot=()=>{void import("./autopilotService").then(m=>m.runSeoAutopilot()).catch(error=>console.error("[SEO Autopilot] background cycle failed",{message:safeGithubExecutionError(error)}));};
  const startupAutopilot=setTimeout(runAutopilot,45_000);startupAutopilot.unref?.();
  autopilotTimer=setInterval(runAutopilot,SEO_AUTOPILOT_BACKGROUND_INTERVAL_MS);autopilotTimer.unref?.();
  workerTimer=setInterval(wakeSeoGithubExecutionWorker,SEO_GITHUB_WORKER_INTERVAL_MS);workerTimer.unref?.();
  console.log("[SEO GitHub] execution worker started");
}
