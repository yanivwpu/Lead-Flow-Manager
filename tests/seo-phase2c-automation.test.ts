import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
process.env.DATABASE_URL ||= "postgres://unused:unused@localhost/unused";

const { runAnalysisAfterSuccessfulScheduledSync }=await import("../server/seo/scheduledAnalysis");
const { assertApprovedSeoExecution }=await import("../server/seo/githubExecutionService");
const { applySeoProposalToSource,assertAllowedSeoFile,assertSafeSeoBranch,buildSeoPullRequestMetadata,executeSeoGithubPullRequest,safeGithubExecutionError,seoBranchName }=await import("../server/seo/githubExecutor");

const claim={propertyId:"sc-domain:example.com",reportingDay:"2026-09-28",syncRunId:"sync-1",leaseToken:"lease-1"};
let analyzed=0,finished=0;
assert.equal(await runAnalysisAfterSuccessfulScheduledSync({runId:"sync-1",status:"success"},"2026-09-28",{claim:async()=>claim,analyze:async()=>{analyzed++;return{runId:"analysis-1"};},finish:async()=>{finished++;}}),"completed");
assert.equal(analyzed,1,"successful scheduled sync triggers analysis");assert.equal(finished,1);
for(const status of ["partial","failed"] as const)assert.equal(await runAnalysisAfterSuccessfulScheduledSync({runId:"sync-2",status},"2026-09-28",{claim:async()=>{throw new Error("must not claim")}}),"skipped","failed/partial sync does not trigger analysis");
assert.equal(await runAnalysisAfterSuccessfulScheduledSync({runId:"sync-1",status:"success"},"2026-09-28",{claim:async()=>null,analyze:async()=>{analyzed++;return{runId:"duplicate"};}}),"skipped","durable duplicate claim prevents duplicate analysis");

assert.throws(()=>assertApprovedSeoExecution("proposed",1,1),/must remain approved/,"unapproved proposal cannot execute");
assert.doesNotThrow(()=>assertApprovedSeoExecution("approved",1,1),"approved current proposal can enter execution");
assert.throws(()=>assertApprovedSeoExecution("approved",2,1),/no longer current/);
assert.throws(()=>assertSafeSeoBranch("main"),/seo\//,"direct main push is impossible");
const branch=seoBranchName("Action UUID",new Date("2026-09-28T12:34:56Z"));assert.equal(branch,"seo/action-uuid-20260928123456");assert.doesNotThrow(()=>assertSafeSeoBranch(branch));
assert.throws(()=>assertAllowedSeoFile("server/index.ts"),/non-allowlisted/);

const proposal={actionType:"meta_description" as const,proposedMetaDescription:"A useful description for WhatsApp CRM teams that clearly explains the product workflow.",insertionLocation:"Replace the existing meta description in the page head",explanation:"Search Console impressions support a clearer description for this page.",expectedBenefit:"Improve qualified click-through potential.",confidence:.8,risk:"medium" as const,automaticExecutionEligible:false,rollbackConcept:"Restore the previous metadata string from Git history.",evidenceIds:["e1"]};
const source='const BASE_URL="https://example.com"; export const PAGE_META = { "/pricing": { title: "Pricing", description: "Old description long enough for this fixture", canonical: `${BASE_URL}/pricing` } };';
const changed=applySeoProposalToSource("server/seo.ts",source,"https://example.com/pricing",proposal);assert.match(changed.content,/A useful description/);assert.doesNotMatch(changed.content,/Old description/);
assert.throws(()=>applySeoProposalToSource("server/index.ts",source,"https://example.com/pricing",proposal),/non-allowlisted/);

const input={actionId:"action-123",actionVersion:1,targetPage:"https://example.com/pricing",actionType:"meta_description",originalContentFingerprint:"fingerprint-1",opportunityType:"low_ctr",evidence:{clicks:4,impressions:500,position:7},proposal};
const metadata=buildSeoPullRequestMetadata(input,changed);assert.match(metadata.title,/^SEO: Improve /);assert.match(metadata.body,/low_ctr/);assert.match(metadata.body,/action-123 \/ v1/);assert.match(metadata.body,/requires human review/);

const requests:Array<{url:string;method:string;body:any}>=[];
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
const fetchImpl:typeof fetch=async(url,init={})=>{const path=String(url),method=init.method??"GET",body=init.body?JSON.parse(String(init.body)):undefined;requests.push({url:path,method,body});
 if(path.includes("/git/ref/heads/main"))return json({object:{sha:"base-sha"}});
 if(path.includes("/contents/server/seo.ts"))return json({encoding:"base64",content:Buffer.from(source).toString("base64")});
 if(path.endsWith("/git/refs")&&method==="POST")return json({ref:body.ref},201);
 if(path.endsWith("/git/blobs"))return json({sha:"blob-sha"},201);
 if(path.includes("/git/commits/base-sha"))return json({tree:{sha:"tree-base"}});
 if(path.endsWith("/git/trees"))return json({sha:"tree-new"},201);
 if(path.endsWith("/git/commits")&&method==="POST")return json({sha:"commit-sha"},201);
 if(path.includes("/git/refs/heads/seo/"))return json({object:{sha:"commit-sha"}});
 if(path.endsWith("/pulls"))return json({number:42,html_url:"https://github.com/o/r/pull/42"},201);
 return json({message:"unexpected"},500);
};
const config={token:"super-secret-token",owner:"o",repo:"r",apiUrl:"https://api.github.test"};
const executed=await executeSeoGithubPullRequest(input,{config,fetchImpl,capturePage:async()=>({fingerprint:"fingerprint-1",content:{} as any}),now:new Date("2026-09-28T12:34:56Z")});
assert.equal(executed.prNumber,42);assert.equal(executed.commitSha,"commit-sha");assert.deepEqual(executed.changedFiles,["server/seo.ts"]);
assert.equal(requests.find(r=>r.url.endsWith("/git/refs"))?.body.ref,`refs/heads/${executed.branchName}`);assert.ok(!requests.some(r=>r.url.includes("refs/heads/main")&&r.method!=="GET"),"executor never mutates main");
const prRequest=requests.find(r=>r.url.endsWith("/pulls"));assert.equal(prRequest?.body.base,"main");assert.equal(prRequest?.body.head,executed.branchName);assert.match(prRequest?.body.body,/Search Console evidence/);

let staleCalls=0;await assert.rejects(()=>executeSeoGithubPullRequest(input,{config,fetchImpl:async()=>{staleCalls++;return json({object:{sha:"base-sha"}});},capturePage:async()=>({fingerprint:"new-fingerprint",content:{} as any})}),/changed after analysis/);assert.equal(staleCalls,1,"stale fingerprint blocks source fetch and mutation after resolving latest main");
await assert.rejects(()=>executeSeoGithubPullRequest(input,{config,fetchImpl:async()=>json({message:"denied"},403),capturePage:async()=>({fingerprint:"fingerprint-1",content:{} as any})}),/failed \(403\)/,"GitHub API failure is bounded and surfaced");
assert.doesNotMatch(safeGithubExecutionError(new Error(`Bearer ${config.token}: failed`),config),/super-secret-token/,"secrets never leak through persisted/logged errors");
const migration=readFileSync(new URL("../migrations/0102_seo_automation_and_github_execution.sql",import.meta.url),"utf8"),startup=readFileSync(new URL("../server/startupSchemaPatches.ts",import.meta.url),"utf8"),actionService=readFileSync(new URL("../server/seo/actionService.ts",import.meta.url),"utf8");
for(const table of ["seo_scheduled_analysis_claims","seo_github_executions"]){assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));assert.match(startup,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));}
for(const state of ["pending","running","pr_created","failed","stale"])assert.match(`${migration}\n${actionService}\n${readFileSync(new URL("../server/seo/githubExecutionService.ts",import.meta.url),"utf8")}`,new RegExp(`[\"']${state}[\"']`));
assert.match(actionService,/to==="approved"[\s\S]*seoGithubExecutions/,"approval atomically enqueues execution");
console.log("seo-phase2c-automation.test.ts: all assertions passed");
