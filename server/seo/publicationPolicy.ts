import { supportsSeoContentRoute } from "../../shared/seoPublishedContent";
import { validateRecommendationOutput } from "./actionPlanner";
import { SeoGithubExecutionError } from "./githubExecutor";

export function assertPublishableDraft(action:{status:unknown;actionType:string;targetPage:string;currentVersion:number;staleAt?:unknown},proposal:unknown){
 if(action.status!=="approved"||action.staleAt)throw new SeoGithubExecutionError("ACTION_NOT_APPROVED","Refresh and approve the current draft before publishing");
 const p=validateRecommendationOutput(proposal);
 if(p.actionType!==action.actionType||p.risk==="high")throw new SeoGithubExecutionError("MANUAL_ACTION_REQUIRED","This change requires manual review and cannot be auto-published");
 if(action.actionType==="meta_description"){
  if(!p.proposedMetaDescription||!p.generatedAt)throw new SeoGithubExecutionError("FINISHED_DRAFT_REQUIRED","A finished metadata draft is required before publishing");
  return p;
 }
 if(action.actionType==="content_expansion"){
  if(!supportsSeoContentRoute(action.targetPage))throw new SeoGithubExecutionError("MANUAL_ACTION_REQUIRED","This page does not yet have an allowlisted automatic content-publishing adapter");
  if(!p.proposedContent||p.factValidationStatus!=="passed"||!p.generatedAt)throw new SeoGithubExecutionError("FINISHED_DRAFT_REQUIRED","This older recommendation is only a brief. Refresh research before publishing");
  return p;
 }
 throw new SeoGithubExecutionError("MANUAL_ACTION_REQUIRED","This action type is not eligible for automatic publishing");
}
export { publicationFailureMessage } from "../../shared/seoPublicationFeedback";
