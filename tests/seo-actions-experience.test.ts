import assert from "node:assert/strict";
import { buildProposal, InsufficientSeoEvidenceError, normalizeActionListInput, seoActionViewStatuses, storedProposalReviewability, seoActionRefreshDisposition } from "../server/seo/actionService";
import { mayTransitionSeoAction, validateRecommendationOutput } from "../server/seo/actionPlanner";
import type { ScoredOpportunity } from "../server/seo/opportunityPlanner";

assert.deepEqual(seoActionViewStatuses("review"),["proposed","revision_required","researching"]);
assert.deepEqual(seoActionViewStatuses("approved"),["approved"]);
assert.ok(seoActionViewStatuses("history").includes("rejected"));
assert.deepEqual(normalizeActionListInput({view:"bogus",search:"  zoko ",page:-4,limit:999}),{view:"review",search:"zoko",type:undefined,page:1,limit:50,offset:0});
assert.equal(normalizeActionListInput({view:"history",page:3,limit:20}).offset,40);
assert.deepEqual(storedProposalReviewability({status:"proposed",proposal:{legacy:true}}),{approvalBlocked:true,invalidReason:"This proposal predates or fails the current recommendation rules"});
assert.deepEqual(storedProposalReviewability({status:"approved",proposal:{legacy:true}}),{approvalBlocked:false,invalidReason:null},"approved history is not silently rewritten");

const item=(overrides:Partial<ScoredOpportunity>={}):ScoredOpportunity=>({clusterKey:"fixture-cluster",queryCluster:["real estate crm follow up"],targetPage:"https://whachatcrm.com/real-estate-crm",recommendedPrimaryPage:"https://whachatcrm.com/real-estate-crm",competingPages:[],type:"low_ctr",current:{clicks:2,impressions:113,ctr:2/113,position:8},previous:{clicks:3,impressions:100,ctr:.03,position:7},priorityScore:80,confidenceScore:.7,estimatedUpside:2.5,reason:"CTR is below the documented threshold at a first-page average position.",evidence:{},...overrides});
const snapshot={fingerprint:"a".repeat(64),title:"Real Estate CRM | WhachatCRM",metaDescription:"Keep property leads organized.",headings:["Real Estate CRM","Follow up with every property lead"],sections:["Capture property inquiries from WhatsApp, assign leads to agents, and track follow-up in one shared inbox."],competitorCount:0};
const proposal=buildProposal(item(),snapshot);
assert.equal(proposal.actionType,"meta_description");assert.equal(proposal.insertionLocation,"Replace meta description");assert.equal(proposal.currentValue,snapshot.metaDescription);assert.match(proposal.proposedMetaDescription!,/Real Estate CRM/);assert.match(proposal.proposedMetaDescription!,/property inquiries/);assert.match(proposal.evidenceLimitations,/No competitor research/);assert.doesNotMatch(proposal.expectedBenefit,/\d+%/);assert.match(proposal.expectedBenefit,/no uplift is estimated/i);assert.equal(proposal.automaticExecutionEligible,false);
assert.throws(()=>buildProposal(item({current:{clicks:0,impressions:100,ctr:0,position:80}}),snapshot),InsufficientSeoEvidenceError,"low rank plus low CTR is not a snippet recommendation");
assert.throws(()=>buildProposal(item(),{...snapshot,title:"",sections:[]}),InsufficientSeoEvidenceError);
assert.throws(()=>validateRecommendationOutput({...proposal,proposedMetaDescription:"Explore WhachatCRM for real estate CRM: manage customer relationships in one workspace."}),/generic boilerplate/);
assert.throws(()=>validateRecommendationOutput({...proposal,proposedMetaDescription:snapshot.metaDescription}),/does not materially change/);
assert.throws(()=>validateRecommendationOutput({...proposal,proposedMetaDescription:"Guaranteed #1 real estate CRM for every agent."}),/unsupported/);
const expansion=buildProposal(item({type:"striking_distance",queryCluster:["how quickly can automation route new property leads"],current:{clicks:4,impressions:90,ctr:4/90,position:9}}),snapshot);assert.equal(expansion.actionType,"content_expansion");assert.match(expansion.proposedContent!,/automation route new property leads/i);assert.match(expansion.insertionLocation,/Follow up with every property lead/);
assert.throws(()=>buildProposal(item({type:"striking_distance",queryCluster:["property inquiries assign leads agents track follow up"]}),snapshot),InsufficientSeoEvidenceError,"covered topics do not get filler");
const serviceSource=(await import("node:fs")).readFileSync(new URL("../server/seo/actionService.ts",import.meta.url),"utf8");
assert.match(serviceSource,/status IN \('detected','researching','proposed','approved','revision_required','rejected'\)/,"unchanged rejected identities remain deduplicated");
assert.match(serviceSource,/\["proposed","revision_required","rejected"\]/,"rejected records can be re-evaluated in place with history preserved");
assert.match(serviceSource,/published:false/,"approval and refresh never publish website content");
assert.match(serviceSource,/a\.property_id=\$\{propertyId\}/,"action reads are workspace scoped");
const staleApproved=seoActionRefreshDisposition({status:"approved",stale_at:"2026-09-24T00:00:00Z"});assert.deepEqual(staleApproved,{allowed:true,expired:false,returnStatus:"revision_required"},"stale approval can be re-evaluated but cannot carry approval forward");
assert.equal(seoActionRefreshDisposition({status:"approved",stale_at:null}).allowed,false,"unchanged approved actions cannot be rewritten");
assert.deepEqual(seoActionRefreshDisposition({status:"researching",refresh_lease_expires_at:"2026-09-23T00:00:00Z",refresh_return_status:"revision_required"},new Date("2026-09-24T00:00:00Z")),{allowed:true,expired:true,returnStatus:"revision_required"});
assert.match(serviceSource,/status:"proposed"[\s\S]+approvedBy:null,approvedAt:null/,"a revised version returns to review and clears current approval fields");
assert.match(serviceSource,/OPPORTUNITY_NO_LONGER_QUALIFIES[\s\S]+status:"revision_required"|status:"revision_required"[\s\S]+OPPORTUNITY_NO_LONGER_QUALIFIES/,"insufficient refreshed evidence remains recoverable");
assert.match(serviceSource,/status:claim\.returnStatus[\s\S]+prior proposal restored/,"refresh failure restores a retryable state and prior version");
assert.match(serviceSource,/INSUFFICIENT_EVIDENCE[\s\S]+versionCreated:false,recoverable:true/,"insufficient evidence returns a non-publishing recoverable result without a duplicate version");

const lifecycle={status:"proposed",currentVersion:1,approvedAt:null as string|null,staleAt:null as string|null,history:[] as string[]};assert.equal(mayTransitionSeoAction(lifecycle.status,"approved"),true);lifecycle.status="approved";lifecycle.approvedAt="2026-09-24T09:00:00Z";lifecycle.history.push("approved:v1");lifecycle.staleAt="2026-09-24T10:00:00Z";const approvedRefresh=seoActionRefreshDisposition({status:lifecycle.status,stale_at:lifecycle.staleAt});assert.equal(approvedRefresh.returnStatus,"revision_required");lifecycle.status="researching";lifecycle.history.push("refresh-started:v1");lifecycle.currentVersion++;lifecycle.status="proposed";lifecycle.approvedAt=null;lifecycle.staleAt=null;lifecycle.history.push("proposed:v2");assert.deepEqual(lifecycle.history,["approved:v1","refresh-started:v1","proposed:v2"],"original approval history survives the revised version");assert.equal(lifecycle.approvedAt,null,"the revised proposal does not inherit approval");assert.equal(mayTransitionSeoAction(lifecycle.status,"approved"),true);lifecycle.status="approved";lifecycle.approvedAt="2026-09-24T11:00:00Z";lifecycle.history.push("approved:v2");assert.equal(lifecycle.currentVersion,2);assert.equal(lifecycle.history.at(-1),"approved:v2");
console.log("SEO actions experience tests passed");
