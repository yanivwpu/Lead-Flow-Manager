import { seoPullRequestCanMerge } from "./publicationChecks";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { captureFirstPartyPage } from "./firstPartyPage";
import { reviewContentExpansion } from "./contentExpansionQuality";
import { assertPublishableDraft, publicationFailureMessage } from "./publicationPolicy";
import { aggregateSearchMetrics, measurementDates, type SearchMetric } from "./publicationMetrics";
import { applySeoProposalToSource, githubRequest, resolveSeoGithubConfig, safeGithubExecutionError, SeoGithubExecutionError, type SeoGithubExecutionInput } from "./githubExecutor";

export async function requestSeoPublication(actionId:string,actor:string){
 await db.transaction(async tx=>{
  const result=await tx.execute(sql`SELECT a.*,v.proposal,v.evidence_snapshot FROM seo_actions a JOIN seo_action_versions v ON v.action_id=a.id AND v.version=a.current_version WHERE a.id=${actionId} FOR UPDATE OF a`);
  const a=result.rows[0] as any;if(!a)throw new SeoGithubExecutionError("ACTION_NOT_FOUND","Action not found");
  assertPublishableDraft({status:a.status,actionType:a.action_type,targetPage:a.target_page,currentVersion:a.current_version,staleAt:a.stale_at},a.proposal);
  // Publishing is a separate explicit decision: legacy approvals never silently merge.
  await tx.execute(sql`INSERT INTO seo_github_executions(action_id,action_version,status,publication_requested_at,publication_requested_by) VALUES (${actionId},${a.current_version},'pending',NOW(),${actor}) ON CONFLICT(action_id,action_version) DO UPDATE SET publication_requested_at=COALESCE(seo_github_executions.publication_requested_at,NOW()),publication_requested_by=COALESCE(seo_github_executions.publication_requested_by,${actor}),status=CASE WHEN seo_github_executions.status='failed' AND seo_github_executions.pr_number IS NULL THEN 'pending' ELSE seo_github_executions.status END,branch_name=CASE WHEN seo_github_executions.status='failed' AND seo_github_executions.pr_number IS NULL THEN NULL ELSE seo_github_executions.branch_name END,error_message=NULL,failure_code=NULL,updated_at=NOW()`);
  await tx.execute(sql`INSERT INTO seo_action_events(action_id,from_status,to_status,actor_id,reason,safe_metadata) VALUES (${actionId},'approved','approved',${actor},'Publication requested for the reviewed draft',${JSON.stringify({version:a.current_version,placement:"before_final_cta",publishingPerformed:false})}::jsonb)`);
 });
 return{queued:true,message:"Publishing requested. GitHub checks, deployment, and live content must pass before this is marked live."};
}

type Job={id:string;token:string;status:string;actionId:string;version:number;pr:number;head:string;mergeSha:string|null;input:SeoGithubExecutionInput};
async function claimPublication():Promise<Job|null>{
 const token=randomUUID();const result=await db.execute(sql`WITH candidate AS (SELECT id FROM seo_github_executions WHERE publication_requested_at IS NOT NULL AND status IN ('pr_created','awaiting_checks','deploying','publication_failed') AND (lease_expires_at IS NULL OR lease_expires_at<=NOW()) AND updated_at<NOW()-INTERVAL '20 seconds' ORDER BY updated_at LIMIT 1 FOR UPDATE SKIP LOCKED) UPDATE seo_github_executions g SET lease_token=${token},lease_expires_at=NOW()+INTERVAL '5 minutes',updated_at=NOW() FROM candidate WHERE g.id=candidate.id RETURNING g.*`);
 const g=result.rows[0] as any;if(!g)return null;
 const rows=await db.execute(sql`SELECT a.*,v.proposal,v.evidence_snapshot FROM seo_actions a JOIN seo_action_versions v ON v.action_id=a.id AND v.version=gREATEST(${Number(g.action_version)},1) WHERE a.id=${String(g.action_id)}`);const a=rows.rows[0] as any;
 if(!a||a.status!=="approved"||Number(a.current_version)!==Number(g.action_version)){await db.execute(sql`UPDATE seo_github_executions SET status='stale',failure_code='STALE_FINGERPRINT',error_message=${publicationFailureMessage("STALE_FINGERPRINT")},lease_token=NULL,lease_expires_at=NULL WHERE id=${String(g.id)} AND lease_token=${token}`);return null;}
 return{id:String(g.id),token,status:String(g.status),actionId:String(g.action_id),version:Number(g.action_version),pr:Number(g.pr_number),head:String(g.commit_sha),mergeSha:g.merge_sha,input:{actionId:a.id,actionVersion:Number(g.action_version),targetPage:a.target_page,actionType:a.action_type,originalContentFingerprint:a.original_content_fingerprint,opportunityType:a.evidence_snapshot?.opportunityType??"content",evidence:a.evidence_snapshot?.evidence,proposal:a.proposal}};
}
async function owned(job:Job){const r=await db.execute(sql`SELECT id FROM seo_github_executions WHERE id=${job.id} AND lease_token=${job.token} AND lease_expires_at>NOW()`);if(!r.rows.length)throw new SeoGithubExecutionError("EXECUTION_LEASE_LOST","Publication lease expired");}
async function finish(job:Job,status:string,code:string|null=null,mergeSha:string|null=job.mergeSha){await db.execute(sql`UPDATE seo_github_executions SET status=${status},failure_code=${code},error_message=${code?publicationFailureMessage(code):null},merge_sha=${mergeSha},lease_token=NULL,lease_expires_at=NULL,updated_at=NOW() WHERE id=${job.id} AND lease_token=${job.token} AND lease_expires_at>NOW()`);}

export async function runSeoPublicationOnce(deps:{config?:ReturnType<typeof resolveSeoGithubConfig>;fetchImpl?:typeof fetch;capturePage?:typeof captureFirstPartyPage}={}){
 const job=await claimPublication();if(!job)return false;
 try{
  const config=deps.config??resolveSeoGithubConfig(),fetchImpl=deps.fetchImpl??fetch,capturePage=deps.capturePage??captureFirstPartyPage,get=<T>(path:string)=>githubRequest<T>(config,path,{signal:AbortSignal.timeout(20_000)},fetchImpl);
  const p=assertPublishableDraft({status:"approved",actionType:job.input.actionType,targetPage:job.input.targetPage,currentVersion:job.version},job.input.proposal);
  const pr=await get<any>(`/pulls/${job.pr}`);
  if(pr.head?.sha!==job.head||pr.base?.ref!=="main")throw new SeoGithubExecutionError("PR_CHANGED","PR head or base changed");
  let mergeSha=job.mergeSha;
  if(!pr.merged){
   if(pr.state!=="open"||pr.draft)throw new SeoGithubExecutionError("PR_CHANGED","PR no longer open and ready");
   const current=await capturePage(job.input.targetPage);
   if(current.fingerprint!==job.input.originalContentFingerprint)throw new SeoGithubExecutionError("STALE_FINGERPRINT","Page changed after approval");
   const reviewed=reviewContentExpansion({proposedContent:p.proposedContent!,insertionLocation:p.insertionLocation,rationale:p.explanation},{pageUrl:job.input.targetPage,title:current.content.title,metaDescription:current.content.metaDescription,headings:current.content.headings,bodyText:current.content.bodyText,pageType:"marketing",queryCluster:[p.targetQuery??""],fingerprint:current.fingerprint,metrics:{clicks:0,impressions:0,position:0}});
   if(!reviewed.accepted)throw new SeoGithubExecutionError("FINISHED_DRAFT_REQUIRED","Draft did not pass current-page fact validation");
   const files=await get<any[]>(`/pulls/${job.pr}/files?per_page=100`);if(files.length!==1||files[0].filename!=="shared/seoPublishedContent.json")throw new SeoGithubExecutionError("PR_CHANGED","Unexpected files in generated PR");
   const path="shared/seoPublishedContent.json",base=await get<any>(`/contents/${path}?ref=${pr.base.sha}`),head=await get<any>(`/contents/${path}?ref=${job.head}`);
   const change=applySeoProposalToSource(path,Buffer.from(base.content,"base64").toString("utf8"),job.input.targetPage,p),expected=JSON.parse(change.content);expected[change.route].actionId=job.actionId;expected[change.route].version=job.version;
   if(JSON.stringify(expected)!==JSON.stringify(JSON.parse(Buffer.from(head.content,"base64").toString("utf8"))))throw new SeoGithubExecutionError("PR_CHANGED","PR differs from approved draft");
   const checks=await get<any>(`/commits/${job.head}/check-runs?per_page=100`),statuses=await get<any>(`/commits/${job.head}/status`);
   // 'clean' is required, in addition to every reported check/status succeeding. No admin override.
   if(!seoPullRequestCanMerge(pr,checks,statuses)){await finish(job,"awaiting_checks","CHECKS_PENDING");return true;}
   const branch=await get<{protected:boolean}>("/branches/main");
   if(branch.protected!==false){await finish(job,"awaiting_checks","MANUAL_MERGE_REQUIRED");return true;}
   await owned(job);
   const stillApproved=await db.execute(sql`SELECT id FROM seo_actions WHERE id=${job.actionId} AND status='approved' AND current_version=${job.version} AND stale_at IS NULL`);
   if(!stillApproved.rows.length)throw new SeoGithubExecutionError("STALE_FINGERPRINT","Approval changed before merge");
   // Normal PR merge only, gated on GitHub's clean mergeability and all checks above.
   // Never push main, force a merge, or use an administrator override.
   const merged=await githubRequest<any>(config,`/pulls/${job.pr}/merge`,{method:"PUT",signal:AbortSignal.timeout(20_000),body:JSON.stringify({sha:job.head,merge_method:"squash"})},fetchImpl);
   if(!merged.merged){await finish(job,"awaiting_checks","CHECKS_PENDING");return true;}mergeSha=merged.sha;
  }else mergeSha=pr.merge_commit_sha;
  if(!mergeSha)throw new SeoGithubExecutionError("PR_CHANGED","Merged revision unavailable");
  await owned(job);
  const probeResponse=await fetchImpl("https://www.whachatcrm.com/api/debug/production-build-probe",{signal:AbortSignal.timeout(15_000),cache:"no-store"});const probe=await probeResponse.json() as any;
  // A newer deployment is acceptable only when GitHub proves the merge is its ancestor.
  let deployed=probe.gitSha===mergeSha;if(!deployed&&/^[a-f0-9]{40}$/.test(probe.gitSha??"")){const compare=await get<any>(`/compare/${mergeSha}...${probe.gitSha}`);deployed=["ahead","identical"].includes(compare.status);}
  if(!deployed){await finish(job,"deploying","LIVE_VERIFICATION_PENDING",mergeSha);return true;}
  const live=await capturePage(job.input.targetPage),draft=p.proposedContent!.replace(/^#{1,3}\s+/gm,"").replace(/\s+/g," ").trim();
  if(!live.content.bodyText.includes(draft)){await finish(job,"deploying","LIVE_VERIFICATION_PENDING",mergeSha);return true;}
  const baseline=await baselineFor(job.input.targetPage,job.actionId,new Date());
  await db.transaction(async tx=>{const r=await tx.execute(sql`UPDATE seo_github_executions SET status='live',merge_sha=${mergeSha},live_at=COALESCE(live_at,NOW()),performance=${JSON.stringify(baseline)}::jsonb,failure_code=NULL,error_message=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=NOW() WHERE id=${job.id} AND lease_token=${job.token} AND lease_expires_at>NOW() RETURNING id`);if(!r.rows.length)throw new SeoGithubExecutionError("EXECUTION_LEASE_LOST","Publication lease expired");await tx.execute(sql`INSERT INTO seo_action_events(action_id,from_status,to_status,reason,safe_metadata) VALUES (${job.actionId},'approved','approved','Live content and deployed revision verified',${JSON.stringify({version:job.version,mergeSha,liveRevision:probe.gitSha,publishingPerformed:true})}::jsonb)`);});
 }catch(error){const code=error instanceof SeoGithubExecutionError?error.code:"PUBLICATION_FAILED";await finish(job,["STALE_FINGERPRINT","PR_CHANGED","FINISHED_DRAFT_REQUIRED"].includes(code)?"publication_blocked":"publication_failed",code);console.error("[SEO publication]",{id:job.id,code,message:safeGithubExecutionError(error)});}
 return true;
}

async function periodMetrics(actionId:string,page:string,start:string,end:string,days:number){const r=await db.execute(sql`SELECT clicks,impressions,position FROM seo_search_snapshots WHERE property_id=(SELECT property_id FROM seo_actions WHERE id=${actionId}) AND page=${page} AND reporting_date BETWEEN ${start}::date AND ${end}::date`),coverage=await db.execute(sql`SELECT COUNT(*) n FROM seo_search_daily_totals t WHERE t.property_id=(SELECT property_id FROM seo_actions WHERE id=${actionId}) AND t.reporting_date BETWEEN ${start}::date AND ${end}::date AND (SELECT status FROM seo_sync_runs r WHERE r.property_id=t.property_id AND r.start_date<=t.reporting_date AND r.end_date>=t.reporting_date ORDER BY r.started_at DESC,r.id DESC LIMIT 1)='success'`);return{start,end,complete:Number((coverage.rows[0] as any)?.n)===days,...aggregateSearchMetrics(r.rows as SearchMetric[])};}
async function baselineFor(page:string,id:string,liveAt:Date){const windows=[];for(const days of [7,14,28]){const d=measurementDates(liveAt,days);windows.push({days,before:await periodMetrics(id,page,d.beforeStart,d.beforeEnd,days),after:null,state:"waiting_for_data"});}return{scope:"Reported queries for the exact page; anonymized queries excluded",interpretation:"Before/after observation, not proof of causation",windows};}
let lastMetrics=0;
export async function updateSeoPublicationMeasurements(){if(Date.now()-lastMetrics<3600_000)return;lastMetrics=Date.now();const jobs=await db.execute(sql`SELECT g.id,g.action_id,g.live_at,g.performance,a.target_page FROM seo_github_executions g JOIN seo_actions a ON a.id=g.action_id WHERE g.status='live' ORDER BY g.live_at DESC LIMIT 100`);for(const job of jobs.rows as any[]){const performance=job.performance,liveAt=new Date(job.live_at);if(!performance.windows)continue;for(const window of performance.windows){const d=measurementDates(liveAt,window.days);if(!window.before.complete)window.before=await periodMetrics(job.action_id,job.target_page,d.beforeStart,d.beforeEnd,window.days);window.after=await periodMetrics(job.action_id,job.target_page,d.afterStart,d.afterEnd,window.days);window.state=window.before.complete&&window.after.complete?window.before.impressions+window.after.impressions<100?"limited_data":"ready":"waiting_for_data";}await db.execute(sql`UPDATE seo_github_executions SET performance=${JSON.stringify(performance)}::jsonb WHERE id=${job.id} AND status='live'`);}}
