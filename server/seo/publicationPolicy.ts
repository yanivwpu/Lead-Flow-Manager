import { supportsSeoContentRoute } from "../../shared/seoPublishedContent";
import { validateRecommendationOutput } from "./actionPlanner";
import { SeoGithubExecutionError } from "./githubExecutor";
export function assertPublishableDraft(action:{status:unknown;actionType:string;targetPage:string;currentVersion:number;staleAt?:unknown},proposal:unknown){
 if(action.status!=="approved"||action.staleAt)throw new SeoGithubExecutionError("ACTION_NOT_APPROVED","Refresh and approve the current draft before publishing");
 const p=validateRecommendationOutput(proposal);
 if(action.actionType!=="content_expansion"||p.actionType!==action.actionType||!supportsSeoContentRoute(action.targetPage)||p.risk==="high")throw new SeoGithubExecutionError("MANUAL_ACTION_REQUIRED","This change needs a page-specific implementation and review; it cannot be auto-published");
 if(!p.proposedContent||p.factValidationStatus!=="passed"||!p.generatedAt)throw new SeoGithubExecutionError("FINISHED_DRAFT_REQUIRED","This older recommendation is only a brief. Refresh research, review the finished draft, and approve it again");
 return p;
}
export { publicationFailureMessage } from "../../shared/seoPublicationFeedback";
