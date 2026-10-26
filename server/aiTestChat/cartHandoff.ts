import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { createPrivateCheckoutPreflight, privateCheckoutSnapshot, type PrivateCheckoutDependencies } from "./checkoutPreflight";
import { TestChatError, type TestOwner } from "./sessions";
import { verifyCheckoutTestSetup } from "../shopping/checkout/adminTest";
import { runValidation, selectionSchema, selectionDigest, SHOP } from "../shopping/checkout/controlledValidation";
import { resolveCatalogInstallation } from "../salesCatalog/shopify/installation";
import { shopifyCatalogRequest } from "../salesCatalog/shopify/api";
import { createExecutionDiagnostics, type ExecutionDiagnostic } from "../shopping/checkout/executionDiagnostics";
import type { CheckoutReceipt } from "../shopping/checkout/contract";
import { PRIVATE_CART_SECOND_EXECUTION_ENABLED, privateCartReceiptCodec, secondCartAuthorization } from "./secondCartAuthorization";

// Further execution is disabled pending reconciliation and a separate safety review.
export const PRIVATE_CART_EXECUTION_ENABLED = false;
export const LIQUID_PRODUCT = "gid://shopify/Product/10108114174234";
export const LIQUID_VARIANT = "gid://shopify/ProductVariant/51638769221914";
export const PRIVATE_CART_CONFIRMATION = "CREATE EXACTLY ONE DEVELOPMENT STORE CART";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const privateCartExecutionInput = z.object({requestId:z.string().uuid(),scopeSha256:z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt:z.string().datetime(),confirmation:z.literal(PRIVATE_CART_CONFIRMATION)}).strict();
const envelope = z.object({kind:z.literal("private_liquid_v1"),selection:selectionSchema,authorizationId:z.string().uuid().optional()}).strict();
const scope = (row: any) => hash([row.request_id,row.workspace_id,row.operator_id,row.session_digest,
  row.shop,row.integration_id,row.installation_digest,row.selection,row.selection_digest,new Date(row.expires_at).toISOString()]);

/** Private Test Chat transport only. Production uses the reviewed source gate;
 * executionEnabled is an internal fixture/rollback dependency, never a browser input.
 * Every execution still requires exact explicit approval and all independent pilot guards. */
export function createPrivateCartHandoff(deps: PrivateCheckoutDependencies & {executionEnabled?:()=>boolean;executionDiagnostic?:(event:ExecutionDiagnostic)=>void}) {
  const preflight = createPrivateCheckoutPreflight(deps);
  const secondEnabled = deps.secondExecutionEnabled ?? (()=>PRIVATE_CART_SECOND_EXECUTION_ENABLED);
  const enabled = deps.executionEnabled ?? (()=>PRIVATE_CART_EXECUTION_ENABLED || secondEnabled());
  const secondStore=(ctx:{integrationId:string;installationDigest:string},auth:TestOwner)=>secondCartAuthorization(deps.db,
    {workspaceId:auth.workspaceUserId,operatorId:auth.actorUserId,shop:SHOP,integrationId:ctx.integrationId,installationDigest:ctx.installationDigest});
  async function context(auth:TestOwner,sessionId:string,httpSessionId:string,inspection=false) {
    // Deliberately owner-only; do not retarget the unrelated legacy Hydrogen allowlist.
    if (auth.workspaceUserId !== auth.actorUserId) throw new TestChatError(404,"not_found");
    const ctx = await privateCheckoutSnapshot(deps,auth,sessionId,httpSessionId,{allowExpiredForInspection:inspection});
    if (ctx.credential.kind === "tokenless") throw new TestChatError(503,"storefront_test_credential_setup_required");
    if (ctx.selection.productId!==LIQUID_PRODUCT || ctx.selection.variantId!==LIQUID_VARIANT || ctx.selection.quantity!==1)
      throw new TestChatError(409,"exact_liquid_quantity_one_required");
    return {...ctx,sessionDigest:hash([httpSessionId,sessionId,ctx.binding,ctx.credentialBinding]),
      installationDigest:hash([ctx.integrationId,ctx.credentialBinding])};
  }
  async function prepare(auth:TestOwner,sessionId:string,httpSessionId:string) {
    const before=await context(auth,sessionId,httpSessionId);
    const proof=await preflight(auth,sessionId,httpSessionId);
    if (!proof.ready) throw new TestChatError(409,proof.error);
    const after=await context(auth,sessionId,httpSessionId);
    if (before.sessionDigest!==after.sessionDigest || proof.sessionBinding!==hash([after.binding,after.credentialBinding]))
      throw new TestChatError(409,"session_changed");
    const expiresAt=new Date(Date.now()+5*60_000).toISOString();
    // The private envelope cannot be parsed as the legacy fixed-product selection.
    const authorizationId=secondEnabled()?await secondStore(after,auth).available():undefined;
    const selection={kind:"private_liquid_v1",selection:after.selection,...(authorizationId?{authorizationId}:{})};
    const result=await deps.db.execute(sql`INSERT INTO public.shopify_checkout_admin_tests
      (request_id,workspace_id,operator_id,session_digest,shop,integration_id,installation_digest,selection,selection_digest,expires_at)
      VALUES (${randomUUID()}::uuid,${auth.workspaceUserId},${auth.actorUserId},${after.sessionDigest},${SHOP},
        ${after.integrationId},${after.installationDigest},${JSON.stringify(selection)}::jsonb,${selectionDigest(after.selection)},${expiresAt}::timestamptz)
      RETURNING *`);
    const row=result.rows[0];
    return {requestId:row.request_id,scopeSha256:scope(row),expiresAt,selection:after.selection,inventory:proof.inventory,quantityRule:proof.quantityRule,...(authorizationId?{authorizationId}:{}),
      cartCreated:false,cartCreationEnabled:false,nextAction:"separate_cart_approval_required"};
  }
  /** Read only: inspect the existing request for this exact current session/credential binding.
   * Expired approval rows stay expired. No Shopify request or journal write occurs here. */
  async function inspect(auth:TestOwner,sessionId:string,httpSessionId:string) {
    const ctx=await context(auth,sessionId,httpSessionId,true);
    await verifyCheckoutTestSetup(deps.db);
    const found=await deps.db.execute(sql`SELECT * FROM public.shopify_checkout_admin_tests
      WHERE workspace_id=${auth.workspaceUserId} AND operator_id=${auth.actorUserId}
      AND session_digest=${ctx.sessionDigest} AND shop=${SHOP} AND integration_id=${ctx.integrationId}
      AND installation_digest=${ctx.installationDigest} AND selection_digest=${selectionDigest(ctx.selection)}
      AND selection->>'kind'='private_liquid_v1' ORDER BY created_at DESC,request_id DESC LIMIT 1`);
    const after=await context(auth,sessionId,httpSessionId,true);
    if(ctx.sessionDigest!==after.sessionDigest)throw new TestChatError(409,"session_changed");
    const row=found.rows[0];
    if(!row)return {status:"no_request_for_current_binding",executionEnabled:enabled(),cartCreationEnabled:false,canApprove:false,recordCreatedByThisCheck:false};
    const saved=envelope.safeParse(row.selection);
    if(!saved.success || selectionDigest(saved.data.selection)!==row.selection_digest)
      throw new TestChatError(409,"selection_changed");
    let secondOutcome:Record<string,unknown>={};
    if(saved.data.authorizationId){
      const outcome=await deps.db.execute(sql`SELECT claimed_at,receipt_at,verified_at,encrypted_receipt IS NOT NULL AS has_receipt FROM public.shopify_private_cart_second_authorization
        WHERE authorization_id=${saved.data.authorizationId}::uuid AND request_id=${row.request_id}::uuid
        AND workspace_id=${auth.workspaceUserId} AND operator_id=${auth.actorUserId}`);
      const attempt=outcome.rows[0];
      secondOutcome={secondAttemptClaimed:!!attempt?.claimed_at,receiptAvailable:attempt?.has_receipt===true,
        secondAttemptStatus:attempt?.verified_at?"verified":attempt?.receipt_at?"receipt_received_status_unverified":attempt?.claimed_at?"consumed_outcome_unknown":"not_claimed"};
    }
    const expiresAt=new Date(row.expires_at as string).toISOString();
    const consumed=!!row.claimed_at||secondOutcome.secondAttemptClaimed===true;
    return {status:secondOutcome.secondAttemptStatus==="verified"?"cart_verified":consumed?"dispatch_claimed_result_unknown":Date.parse(expiresAt)<=Date.now()?"expired":row.approved_at?"approved":"prepared_unapproved",
      testSessionExpired:ctx.sessionExpired,createdAt:new Date(row.created_at as string).toISOString(),requestId:row.request_id,scopeSha256:scope(row),expiresAt,selection:saved.data.selection,
      approved:!!row.approved_at||consumed,dispatchClaimed:consumed,originalInventoryProofAvailable:false,
      executionEnabled:enabled(),cartCreationEnabled:false,canApprove:false,recordCreatedByThisCheck:false,...secondOutcome};
  }
  async function execute(auth:TestOwner,sessionId:string,httpSessionId:string,raw:unknown,signal?:AbortSignal) {
    let lastDiagnostic:ExecutionDiagnostic|undefined;
    let secondClaimed=false,secondAuthorizationId:string|undefined,secondRequestId:string|undefined;
    let secondJournal:ReturnType<typeof secondCartAuthorization>|undefined;
    const diagnostic=createExecutionDiagnostics(randomUUID(),event=>{
      lastDiagnostic={...event};
      (deps.executionDiagnostic??(value=>console.info("[PrivateCartExecution]",JSON.stringify(value))))(event);
    });
    const persist=async(receipt?:CheckoutReceipt,verified=false)=>{
      if(secondClaimed&&secondJournal&&secondAuthorizationId&&secondRequestId&&lastDiagnostic)
        await secondJournal.persist(secondAuthorizationId,secondRequestId,lastDiagnostic,receipt?{value:receipt,env:deps.env??process.env}:undefined,verified);
    };
    try {
    const available=()=>{if(!enabled())throw new TestChatError(403,"private_cart_execution_disabled");
      if(signal?.aborted)throw new TestChatError(409,"private_cart_aborted");};
    // Authorize the real pilot owner/session before disclosing the disabled execution route.
    const ctx=await context(auth,sessionId,httpSessionId);
    available();
    const parsed=privateCartExecutionInput.safeParse(raw);
    if(!parsed.success)throw new TestChatError(400,"invalid_private_cart_approval");
    await verifyCheckoutTestSetup(deps.db);
    const {requestId,scopeSha256,expiresAt}=parsed.data;
    diagnostic.bind(requestId);diagnostic.stage("request_binding");
    const result=await deps.db.execute(sql`SELECT * FROM public.shopify_checkout_admin_tests WHERE request_id=${requestId}::uuid
      AND workspace_id=${auth.workspaceUserId} AND operator_id=${auth.actorUserId} AND session_digest=${ctx.sessionDigest}
      AND shop=${SHOP} AND integration_id=${ctx.integrationId} AND installation_digest=${ctx.installationDigest}
      AND expires_at>now() AND claimed_at IS NULL`);
    const row=result.rows[0];
    if(!row || scope(row)!==scopeSha256 || Date.parse(expiresAt)!==new Date(row.expires_at as string).getTime())throw new TestChatError(409,"private_cart_expired_changed_or_consumed");
    const saved=envelope.safeParse(row.selection);
    if(!saved.success || selectionDigest(saved.data.selection)!==row.selection_digest ||
      selectionDigest(ctx.selection)!==row.selection_digest)throw new TestChatError(409,"selection_changed");
    secondAuthorizationId=saved.data.authorizationId;secondRequestId=requestId;
    if(secondAuthorizationId){
      if(!secondEnabled())throw new TestChatError(403,"private_cart_execution_disabled");
      privateCartReceiptCodec(deps.env??process.env);
      secondJournal=secondStore(ctx,auth);await secondJournal.available(secondAuthorizationId);
    }else if(secondEnabled())throw new TestChatError(409,"private_cart_second_authorization_required");
    const unchanged=async()=>{
      available();
      if(secondJournal&&secondAuthorizationId)await secondJournal.available(secondAuthorizationId,secondClaimed?requestId:undefined);
      const current=await context(auth,sessionId,httpSessionId);
      if(current.sessionDigest!==ctx.sessionDigest || Date.parse(String(row.expires_at))<=Date.now())
        throw new TestChatError(409,"private_cart_expired_changed_or_consumed");
      available();
    };
    let receipt:CheckoutReceipt|undefined;
    diagnostic.stage("pre_dispatch_validation");
    try {
      await runValidation(saved.data.selection,{
        installation:()=>resolveCatalogInstallation(deps.db,auth.workspaceUserId,SHOP),
        requestFor:deps.requestFor??shopifyCatalogRequest,storefrontCredential:ctx.credential,
        diagnostic:diagnostic.provider,
        captureReceipt:secondJournal?async(candidate)=>{await persist(candidate);}:undefined,
        storefrontFetch:async(url,init)=>{
          const mutation=/^mutation /.test(JSON.parse(String(init?.body)).query);
          if(mutation){
            diagnostic.stage("post_claim_validation");
            try{await unchanged();}catch(error){diagnostic.failed(error);throw error;}
          }
          const requestSignal=signal ? AbortSignal.any([...(init?.signal?[init.signal]:[]),signal]) : init?.signal;
          // Mark only after the final binding/abort checks, immediately before fetch invocation.
          if(mutation){diagnostic.dispatch();await persist();if(secondJournal)await unchanged();}
          return (deps.storefrontFetch??fetch)(url,{...init,signal:requestSignal});
        },
        approval:{action:PRIVATE_CART_CONFIRMATION,selectionSha256:row.selection_digest,
          expiresAt:new Date(row.expires_at as string).toISOString(),approvedBy:auth.actorUserId,
          developmentStoreEvidence:"live_shop_plan_partnerDevelopment"},
        consume:async()=>{
          await unchanged();
          // Standalone autocommitted statement, shared unique shop index with the legacy path.
          // Never put provider IO in a transaction or clear/reset this claim on any failure.
          diagnostic.claimStarted();
          if(secondJournal&&secondAuthorizationId){
            await secondJournal.claim(secondAuthorizationId,requestId,scopeSha256);
            secondClaimed=true;diagnostic.claimed();await persist();return;
          }
          const claim=await deps.db.execute(sql`UPDATE public.shopify_checkout_admin_tests
            SET approved_at=now(),claimed_at=now() WHERE request_id=${requestId}::uuid
            AND session_digest=${ctx.sessionDigest} AND selection_digest=${row.selection_digest}
            AND claimed_at IS NULL AND expires_at>now() RETURNING request_id`);
          if(!claim.rows.length)throw new TestChatError(409,"development_store_dispatch_already_consumed");
          diagnostic.claimed();
        },
        saveReceipt:async(value)=>{receipt=value as CheckoutReceipt;await persist(receipt);},
      });
    } catch(error) {
      diagnostic.failed(error);
      if(error instanceof TestChatError)throw error;
      // Includes unique-index conflicts, ambiguous mutations and status failures. No raw errors or retries.
      throw new TestChatError(409,"private_cart_failed_closed_do_not_retry");
    }
    if(!receipt)throw new TestChatError(409,"private_cart_failed_closed_do_not_retry");
    diagnostic.complete();
    await persist(undefined,true);
    return {checkoutUrl:receipt.checkoutUrl,cartCreated:true,paymentStatus:"unknown",navigation:"separate_approval_required"};
    }catch(error){diagnostic.failed(error);try{await persist();}catch{/* Keep any committed claim consumed; never retry provider work. */}throw error;}
  }
  return {prepare,inspect,execute};
}
