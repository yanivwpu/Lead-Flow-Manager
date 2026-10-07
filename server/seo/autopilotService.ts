import { sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { supportsSeoContentRoute } from "../../shared/seoPublishedContent";
import { validateRecommendationOutput } from "./actionPlanner";
import { refreshSeoAction, transitionSeoAction } from "./actionService";
import { requestSeoPublication } from "./publicationService";
import { wakeSeoGithubExecutionWorker } from "./githubExecutionService";

export const SEO_AUTOPILOT_CONFIDENCE_DEFAULT = 0.85;
export const SEO_AUTOPILOT_MAX_REFRESH_DEFAULT = 3;
export const SEO_AUTOPILOT_MAX_PUBLISH_DEFAULT = 5;
let autopilotActive=false;

function boundedInt(value:string|undefined,fallback:number,max:number){
  const parsed=Number(value);
  return Number.isFinite(parsed)?Math.max(1,Math.min(max,Math.floor(parsed))):fallback;
}
export function seoAutopilotConfig(env:NodeJS.ProcessEnv=process.env){
  const parsed=Number(env.SEO_AUTOPILOT_MIN_CONFIDENCE);
  return{
    minConfidence:Number.isFinite(parsed)?Math.max(.5,Math.min(.99,parsed)):SEO_AUTOPILOT_CONFIDENCE_DEFAULT,
    maxRefresh:boundedInt(env.SEO_AUTOPILOT_MAX_REFRESH,SEO_AUTOPILOT_MAX_REFRESH_DEFAULT,20),
    maxPublish:boundedInt(env.SEO_AUTOPILOT_MAX_PUBLISH,SEO_AUTOPILOT_MAX_PUBLISH_DEFAULT,20),
  };
}
type OpenRow={
  id:string;target_page:string;query_cluster:unknown;action_type:string;status:string;risk:string;confidence:number;
  stale_at:unknown;current_version:number;proposal:unknown;updated_at:unknown;
  execution_status?:string|null;publication_requested_at?:unknown;pr_number?:number|null;
};
const queries=(value:unknown)=>Array.isArray(value)?value.filter((v):v is string=>typeof v==="string").map(v=>v.trim().toLowerCase()).filter(Boolean):[];
const overlaps=(a:unknown,b:unknown)=>{const left=new Set(queries(a));return queries(b).some(q=>left.has(q));};

function isAutopilotDraftEligible(row:OpenRow,minConfidence=SEO_AUTOPILOT_CONFIDENCE_DEFAULT){
  if(row.stale_at||Number(row.confidence)<minConfidence||row.risk==="high")return false;
  if(!["meta_description","content_expansion"].includes(row.action_type))return false;
  let proposal;
  try{proposal=validateRecommendationOutput(row.proposal);}catch{return false;}
  if(proposal.actionType!==row.action_type||proposal.risk==="high"||!proposal.generatedAt)return false;
  if(row.action_type==="meta_description")return Boolean(proposal.proposedMetaDescription);
  return supportsSeoContentRoute(row.target_page)&&Boolean(proposal.proposedContent)&&proposal.factValidationStatus==="passed";
}
export function isSeoAutopilotPublishEligible(row:OpenRow,minConfidence=SEO_AUTOPILOT_CONFIDENCE_DEFAULT){
  return row.status==="proposed"&&isAutopilotDraftEligible(row,minConfidence);
}

async function loadOpenRows():Promise<OpenRow[]>{
  const result=await db.execute(sql`SELECT a.id,a.target_page,a.query_cluster,a.action_type,a.status,a.risk,a.confidence,a.stale_at,a.current_version,a.updated_at,v.proposal,
      g.status execution_status,g.publication_requested_at,g.pr_number
    FROM seo_actions a
    JOIN seo_action_versions v ON v.action_id=a.id AND v.version=a.current_version
    LEFT JOIN LATERAL (
      SELECT status,publication_requested_at,pr_number FROM seo_github_executions g
      WHERE g.action_id=a.id AND g.action_version=a.current_version ORDER BY g.created_at DESC LIMIT 1
    ) g ON true
    WHERE a.status IN ('proposed','approved','revision_required','researching')
    ORDER BY a.updated_at DESC
    LIMIT 250`);
  return result.rows as unknown as OpenRow[];
}

async function retireSuperseded(rows:OpenRow[],actor:string){
  let retired=0;
  const current=rows.filter(row=>["proposed","approved","researching"].includes(row.status));
  for(const stale of rows.filter(row=>row.status==="revision_required")){
    const replacement=current.find(row=>row.id!==stale.id&&row.target_page===stale.target_page&&row.action_type===stale.action_type&&overlaps(row.query_cluster,stale.query_cluster));
    if(!replacement)continue;
    const changed=await db.execute(sql`UPDATE seo_actions SET status='rejected',rejected_by=${actor},rejected_at=NOW(),rejection_reason=${`Superseded by newer SEO proposal ${replacement.id}`},updated_at=NOW()
      WHERE id=${stale.id} AND status='revision_required' RETURNING id`);
    if(!changed.rows.length)continue;
    await db.execute(sql`INSERT INTO seo_action_events(action_id,from_status,to_status,actor_id,reason,safe_metadata)
      VALUES (${stale.id},'revision_required','rejected',${actor},'Superseded by a newer active proposal',${JSON.stringify({replacementActionId:replacement.id,automatic:true})}::jsonb)`);
    retired++;
  }
  return retired;
}

export async function runSeoAutopilot(actor="seo-autopilot"){
  if(autopilotActive)return{skipped:"already_running" as const};
  autopilotActive=true;
  const config=seoAutopilotConfig();
  try{
  let rows=await loadOpenRows();
  const retired=await retireSuperseded(rows,actor);
  rows=await loadOpenRows();

  let refreshed=0,refreshFailed=0;
  for(const row of rows.filter(item=>item.status==="revision_required").slice(0,config.maxRefresh)){
    try{await refreshSeoAction(row.id,actor);refreshed++;}catch{refreshFailed++;}
  }

  rows=await loadOpenRows();
  let approved=0,publicationQueued=0,publishFailed=0;
  for(const row of rows.filter(item=>isSeoAutopilotPublishEligible(item,config.minConfidence)).slice(0,config.maxPublish)){
    try{
      await transitionSeoAction(row.id,"approved",actor,"Approved automatically by SEO Autopilot after quality and confidence gates");
      approved++;
      await requestSeoPublication(row.id,actor);
      publicationQueued++;
    }catch{
      publishFailed++;
    }
  }
  rows=await loadOpenRows();
  const recoveryBudget=Math.max(0,config.maxPublish-publicationQueued);
  for(const row of rows.filter(item=>item.status==="approved"&&isAutopilotDraftEligible(item,config.minConfidence)&&(!item.publication_requested_at||(item.execution_status==="failed"&&!item.pr_number))).slice(0,recoveryBudget)){
    try{await requestSeoPublication(row.id,actor);publicationQueued++;}catch{publishFailed++;}
  }
  if(publicationQueued>0)wakeSeoGithubExecutionWorker();
  const result={retired,refreshed,refreshFailed,approved,publicationQueued,publishFailed,minConfidence:config.minConfidence};
  console.info("[SEO Autopilot] cycle complete",result);
  return result;
  }finally{
    autopilotActive=false;
  }
}
