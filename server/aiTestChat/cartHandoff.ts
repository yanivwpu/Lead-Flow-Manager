import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { createPrivateCheckoutPreflight, privateCheckoutSnapshot, type PrivateCheckoutDependencies } from "./checkoutPreflight";
import { TestChatError, type TestOwner } from "./sessions";
import { verifyCheckoutTestSetup } from "../shopping/checkout/adminTest";
import { runValidation, selectionSchema, selectionDigest, SHOP } from "../shopping/checkout/controlledValidation";
import { resolveCatalogInstallation } from "../salesCatalog/shopify/installation";
import { shopifyCatalogRequest } from "../salesCatalog/shopify/api";
import type { CheckoutReceipt } from "../shopping/checkout/contract";

export const PRIVATE_CART_EXECUTION_ENABLED = false;
export const LIQUID_PRODUCT = "gid://shopify/Product/10108114174234";
export const LIQUID_VARIANT = "gid://shopify/ProductVariant/51638769221914";
export const PRIVATE_CART_CONFIRMATION = "CREATE EXACTLY ONE DEVELOPMENT STORE CART";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const input = z.object({requestId:z.string().uuid(),scopeSha256:z.string().regex(/^[a-f0-9]{64}$/),
  confirmation:z.literal(PRIVATE_CART_CONFIRMATION)}).strict();
const envelope = z.object({kind:z.literal("private_liquid_v1"),selection:selectionSchema}).strict();
const scope = (row: any) => hash([row.request_id,row.workspace_id,row.operator_id,row.session_digest,
  row.shop,row.integration_id,row.installation_digest,row.selection,row.selection_digest,new Date(row.expires_at).toISOString()]);

/** Preparation is wired only to private Test Chat. Execution has no HTTP/UI/model entry point.
 * executionEnabled is an internal dependency for exercising the future bridge in fixtures;
 * production uses the false source gate, independent of public Shopping settings. */
export function createPrivateCartHandoff(deps: PrivateCheckoutDependencies & {executionEnabled?:()=>boolean}) {
  const preflight = createPrivateCheckoutPreflight(deps);
  const enabled = deps.executionEnabled ?? (()=>PRIVATE_CART_EXECUTION_ENABLED);
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
    const selection={kind:"private_liquid_v1",selection:after.selection};
    const result=await deps.db.execute(sql`INSERT INTO public.shopify_checkout_admin_tests
      (request_id,workspace_id,operator_id,session_digest,shop,integration_id,installation_digest,selection,selection_digest,expires_at)
      VALUES (${randomUUID()}::uuid,${auth.workspaceUserId},${auth.actorUserId},${after.sessionDigest},${SHOP},
        ${after.integrationId},${after.installationDigest},${JSON.stringify(selection)}::jsonb,${selectionDigest(after.selection)},${expiresAt}::timestamptz)
      RETURNING *`);
    const row=result.rows[0];
    return {requestId:row.request_id,scopeSha256:scope(row),expiresAt,selection:after.selection,inventory:proof.inventory,quantityRule:proof.quantityRule,
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
    if(!row)return {status:"no_request_for_current_binding",cartCreationEnabled:false,canApprove:false,recordCreatedByThisCheck:false};
    const saved=envelope.safeParse(row.selection);
    if(!saved.success || selectionDigest(saved.data.selection)!==row.selection_digest)
      throw new TestChatError(409,"selection_changed");
    const expiresAt=new Date(row.expires_at as string).toISOString();
    return {status:row.claimed_at?"dispatch_claimed_result_unknown":Date.parse(expiresAt)<=Date.now()?"expired":row.approved_at?"approved":"prepared_unapproved",
      testSessionExpired:ctx.sessionExpired,createdAt:new Date(row.created_at as string).toISOString(),requestId:row.request_id,scopeSha256:scope(row),expiresAt,selection:saved.data.selection,
      approved:!!row.approved_at,dispatchClaimed:!!row.claimed_at,originalInventoryProofAvailable:false,
      cartCreationEnabled:false,canApprove:false,recordCreatedByThisCheck:false};
  }
  async function execute(auth:TestOwner,sessionId:string,httpSessionId:string,raw:unknown,signal?:AbortSignal) {
    const available=()=>{if(!enabled())throw new TestChatError(403,"private_cart_execution_disabled");
      if(signal?.aborted)throw new TestChatError(409,"private_cart_aborted");};
    available();
    const parsed=input.safeParse(raw);
    if(!parsed.success)throw new TestChatError(400,"invalid_private_cart_approval");
    const ctx=await context(auth,sessionId,httpSessionId);
    await verifyCheckoutTestSetup(deps.db);
    const {requestId,scopeSha256}=parsed.data;
    const result=await deps.db.execute(sql`SELECT * FROM public.shopify_checkout_admin_tests WHERE request_id=${requestId}::uuid
      AND workspace_id=${auth.workspaceUserId} AND operator_id=${auth.actorUserId} AND session_digest=${ctx.sessionDigest}
      AND shop=${SHOP} AND integration_id=${ctx.integrationId} AND installation_digest=${ctx.installationDigest}
      AND expires_at>now() AND claimed_at IS NULL`);
    const row=result.rows[0];
    if(!row || scope(row)!==scopeSha256)throw new TestChatError(409,"private_cart_expired_changed_or_consumed");
    const saved=envelope.safeParse(row.selection);
    if(!saved.success || selectionDigest(saved.data.selection)!==row.selection_digest ||
      selectionDigest(ctx.selection)!==row.selection_digest)throw new TestChatError(409,"selection_changed");
    const unchanged=async()=>{
      available();
      const current=await context(auth,sessionId,httpSessionId);
      if(current.sessionDigest!==ctx.sessionDigest || Date.parse(String(row.expires_at))<=Date.now())
        throw new TestChatError(409,"private_cart_expired_changed_or_consumed");
      available();
    };
    let receipt:CheckoutReceipt|undefined;
    try {
      await runValidation(saved.data.selection,{
        installation:()=>resolveCatalogInstallation(deps.db,auth.workspaceUserId,SHOP),
        requestFor:deps.requestFor??shopifyCatalogRequest,storefrontCredential:ctx.credential,
        storefrontFetch:async(url,init)=>{
          if(/^mutation /.test(JSON.parse(String(init?.body)).query))await unchanged();
          return (deps.storefrontFetch??fetch)(url,init);
        },
        approval:{action:PRIVATE_CART_CONFIRMATION,selectionSha256:row.selection_digest,
          expiresAt:new Date(row.expires_at as string).toISOString(),approvedBy:auth.actorUserId,
          developmentStoreEvidence:"live_shop_plan_partnerDevelopment"},
        consume:async()=>{
          await unchanged();
          // Standalone autocommitted statement, shared unique shop index with the legacy path.
          // Never put provider IO in a transaction or clear/reset this claim on any failure.
          const claim=await deps.db.execute(sql`UPDATE public.shopify_checkout_admin_tests
            SET approved_at=now(),claimed_at=now() WHERE request_id=${requestId}::uuid
            AND session_digest=${ctx.sessionDigest} AND selection_digest=${row.selection_digest}
            AND claimed_at IS NULL AND expires_at>now() RETURNING request_id`);
          if(!claim.rows.length)throw new TestChatError(409,"development_store_dispatch_already_consumed");
        },
        saveReceipt:async(value)=>{receipt=value as CheckoutReceipt;},
      });
    } catch(error) {
      if(error instanceof TestChatError)throw error;
      // Includes unique-index conflicts, ambiguous mutations and status failures. No raw errors or retries.
      throw new TestChatError(409,"private_cart_failed_closed_do_not_retry");
    }
    if(!receipt)throw new TestChatError(409,"private_cart_failed_closed_do_not_retry");
    return {checkoutUrl:receipt.checkoutUrl,cartCreated:true,paymentStatus:"unknown",navigation:"separate_approval_required"};
  }
  return {prepare,inspect,execute};
}
