import { CheckoutError } from "./contract";
import { CheckoutVerificationError, controlledFailureCode } from "./preflightDiagnostics";
import { storefrontDetails } from "./storefrontDiagnostics";

export type ProviderDiagnostic = {
  operation:"verify"|"create"|"status";
  event:"request_started"|"response_received"|"request_failed"|"provider_rejected"|"response_validation"|"cart_reported"|"receipt_validated"|"status_available"|"status_expired"|"status_unknown";
  reason?:"http_access_denied"|"http_throttled"|"graphql_errors"|"cart_user_errors"|"cart_warnings"|"invalid_payload";
  httpStatus?:number;
  shopifyRequestId?:string;
};
export type ProviderObserver=(event:ProviderDiagnostic)=>void;
/** Observers cannot alter provider/claim semantics. No arbitrary error, body or header data. */
export function observeProvider(observer:ProviderObserver|undefined,event:ProviderDiagnostic) {
  try {observer?.(event);}catch { /* Diagnostics never authorize a dispatch or retry. */ }
}
export function shopifyDiagnosticRequestId(value:string|null) {
  return typeof value==="string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?:-[0-9]{1,13})?$/i.test(value) ? value : undefined;
}
const fixedErrors=new Set([
  "private_cart_execution_disabled","private_cart_aborted","invalid_private_cart_approval","not_found","session_expired",
  "exact_liquid_quantity_one_required","selected_variant_required","turn_processing","checkout_installation_changed",
  "shopping_entitlement_required","private_cart_expired_changed_or_consumed","selection_changed",
  "development_store_dispatch_already_consumed","private_cart_failed_closed_do_not_retry",
]);
function classifyFailureReason(error:unknown):string {
  if(error instanceof CheckoutVerificationError) {
    const allowedStages=["installation","admin_metadata","admin_variant","selection","storefront","journal"];
    const allowedReasons=["failed","unavailable","access_denied","throttled","invalid_response","graphql_selection_mismatch","graphql_error","changed","setup_required","api_version_mismatch","invalid_json",...storefrontDetails];
    if(allowedStages.some(stage=>allowedReasons.some(reason=>error.code===`checkout_test_${stage}_${reason}`)))return error.code;
    return "unclassified_failure";
  }
  const guard=controlledFailureCode(error);if(guard)return guard;
  if(error instanceof CheckoutError) {
    const code=["setup_required","not_confirmed","unavailable","changed","invalid_response","throttled","ambiguous","already_preparing","expired"].includes(error.code)?error.code:"provider_failure";
    const detail=error.detail;
    return detail && ["api_version_mismatch","graphql_error","invalid_json",...storefrontDetails].includes(detail) ? `${code}:${detail}` : code;
  }
  const code=error && typeof error==="object" ? (error as {code?:unknown}).code:undefined;
  if(code==="23505")return "claim_unique_conflict";
  return typeof code==="string" && fixedErrors.has(code)?code:"unclassified_failure";
}
export function executionFailureReason(error:unknown):string {
  try{return classifyFailureReason(error);}catch{return "unclassified_failure";}
}
type ExecutionStage="authorization"|"request_binding"|"pre_dispatch_validation"|"claim_commit"|"post_claim_validation"|
  "provider_dispatch"|"provider_response"|"provider_rejection"|"response_validation"|"status_verification"|"complete";
type ExecutionEvent=ProviderDiagnostic["event"]|"stage_started"|"claim_started"|"claim_committed"|"dispatch_started"|"execution_completed"|"execution_failed";
export type ExecutionDiagnostic = {
  tag:"private_cart_execution"; attemptId:string; requestId?:string;
  stage:ExecutionStage; event:ExecutionEvent; claim:"not_attempted"|"unknown"|"committed";
  dispatchStarted:boolean; cartReported:boolean; receiptValidated:boolean;
  reason?:string; operation?:ProviderDiagnostic["operation"]; httpStatus?:number; shopifyRequestId?:string;
};
/** Only caller-owned identifiers and fixed enums reach this sink; never pass an Error or receipt. */
export function createExecutionDiagnostics(attemptId:string,sink:(event:ExecutionDiagnostic)=>void) {
  let requestId:string|undefined,stage:ExecutionStage="authorization",claim:ExecutionDiagnostic["claim"]="not_attempted";
  let dispatchStarted=false,cartReported=false,receiptValidated=false,failureReported=false;
  function emit(event:ExecutionEvent,extra:Partial<Pick<ExecutionDiagnostic,"reason"|"operation"|"httpStatus"|"shopifyRequestId">>={}) {
    try {sink({tag:"private_cart_execution",attemptId,requestId,stage,event,claim,dispatchStarted,cartReported,receiptValidated,...extra});}catch { /* No retry or mutation on logging failure. */ }
  }
  return {
    bind(id:string){requestId=id;},
    stage(value:ExecutionStage){stage=value;emit("stage_started");},
    claimStarted(){stage="claim_commit";claim="unknown";emit("claim_started");},
    claimed(){claim="committed";stage="post_claim_validation";emit("claim_committed");},
    dispatch(){stage="provider_dispatch";dispatchStarted=true;emit("dispatch_started");},
    provider(event:ProviderDiagnostic){
      if(failureReported)return;
      // performRequest reports a rejection before request() reports the trailing failure.
      // Preserve the stronger evidence instead of downgrading the terminal stage.
      const rejectedFailure=event.operation==="create" && event.event==="request_failed" && stage==="provider_rejection";
      if(!rejectedFailure)stage=event.operation==="verify"?(claim==="committed"?"post_claim_validation":"pre_dispatch_validation"):
        event.operation==="status"?"status_verification":event.event==="provider_rejected"?"provider_rejection":
        ["response_validation","cart_reported","receipt_validated"].includes(event.event)?"response_validation":"provider_response";
      if(event.event==="cart_reported")cartReported=true;
      if(event.operation==="create"&&event.event==="receipt_validated")receiptValidated=true;
      emit(event.event,{operation:event.operation,...(event.reason?{reason:event.reason}:{}),
        ...(Number.isInteger(event.httpStatus)&&event.httpStatus!>=100&&event.httpStatus!<=599?{httpStatus:event.httpStatus}:{}),
        ...(shopifyDiagnosticRequestId(event.shopifyRequestId??null)?{shopifyRequestId:event.shopifyRequestId}:{})});
    },
    complete(){stage="complete";emit("execution_completed");},
    failed(error:unknown){if(!failureReported){failureReported=true;emit("execution_failed",{reason:executionFailureReason(error)});}},
  };
}
