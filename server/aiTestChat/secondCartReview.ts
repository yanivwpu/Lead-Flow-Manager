import { createHash } from "node:crypto";
import { eq,sql } from "drizzle-orm";
import { users } from "@shared/schema";
import type { SecondCartReview } from "@shared/aiTestChat";
import { createPrivateCheckoutPreflight,privateCheckoutSnapshot,type PrivateCheckoutDependencies } from "./checkoutPreflight";
import { LIQUID_PRODUCT,LIQUID_VARIANT } from "./cartHandoff";
import { SHOP } from "../shopping/checkout/controlledValidation";
import { verifyCheckoutTestSetup } from "../shopping/checkout/adminTest";
import { privateCartReceiptCodec,secondCartAuthorization } from "./secondCartAuthorization";
import { privateTestShoppingAllowed } from "./shoppingAllowance";
import { TestChatError,type TestOwner } from "./sessions";
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** A review is never a preparation, authorization or approval. No journal writes or receipt decryption. */
export function createSecondCartReview(deps:PrivateCheckoutDependencies){
 const preflight=createPrivateCheckoutPreflight(deps,true),active=new Set<string>();
 return async(auth:TestOwner,id:string,httpSessionId:string):Promise<SecondCartReview>=>{
  if(auth.actorUserId!==auth.workspaceUserId)throw new TestChatError(404,"not_found");
  const [owner]=await deps.db.select({id:users.id,email:users.email}).from(users).where(eq(users.id,auth.workspaceUserId)).limit(1);
  if(!privateTestShoppingAllowed(owner,deps.env??process.env))throw new TestChatError(404,"not_found");
  const key=auth.workspaceUserId;
  if(active.has(key))throw new TestChatError(429,"checkout_review_processing");active.add(key);
  try{
   const snapshot=()=>privateCheckoutSnapshot(deps,auth,id,httpSessionId);
   const before=await snapshot();
   if(before.credential.kind==="tokenless")throw new TestChatError(503,"storefront_test_credential_setup_required");
   if(before.selection.productId!==LIQUID_PRODUCT || before.selection.variantId!==LIQUID_VARIANT || before.selection.quantity!==1)
    throw new TestChatError(409,"exact_liquid_quantity_one_required");
   await verifyCheckoutTestSetup(deps.db);
   const original=()=>deps.db.execute(sql`SELECT request_id,claimed_at FROM public.shopify_checkout_admin_tests
    WHERE shop=${SHOP} AND workspace_id=${auth.workspaceUserId} AND operator_id=${auth.actorUserId} AND claimed_at IS NOT NULL`);
   const originalBefore=await original();
   if(originalBefore.rows.length!==1)throw new TestChatError(409,"original_consumed_attempt_required");
   const checks:SecondCartReview["checks"]=[{id:"originalAttempt",status:"passed"}];
   let receiptReady=true;
   try{privateCartReceiptCodec(deps.env??process.env);}catch{receiptReady=false;}
   checks.push({id:"receiptStorage",status:receiptReady?"passed":"required"});
   let authorizationStatus:"passed"|"required"|"blocked"="required";
   const schema=await deps.db.execute(sql`SELECT to_regclass('public.shopify_private_cart_second_authorization') AS name`);
   checks.push({id:"authorizationSchema",status:schema.rows[0]?.name?"passed":"required"});
   const authorizationState=async()=>{
    let state:"passed"|"required"|"blocked"="required";
    if(schema.rows[0]?.name){
     // Global singleton consumption is a deny-only fence; no foreign binding details are returned.
     const spent=await deps.db.execute(sql`SELECT EXISTS(SELECT 1 FROM public.shopify_private_cart_second_authorization
       WHERE attempt_number=2 AND claimed_at IS NOT NULL) AS spent`);
     if(spent.rows[0]?.spent===true)state="blocked";
     else try{
      await secondCartAuthorization(deps.db,{workspaceId:auth.workspaceUserId,operatorId:auth.actorUserId,shop:SHOP,
       integrationId:before.integrationId,installationDigest:digest([before.integrationId,before.credentialBinding])}).available();
      state="passed";
     }catch{state="required";}
    }
    return state;
   };
   authorizationStatus=await authorizationState();
   checks.push({id:"secondAuthorization",status:authorizationStatus});
   // A spent second slot must not trigger another provider request, even for review.
   if(authorizationStatus==="blocked")return {status:"blocked",checks,cartCreated:false,cartCreationEnabled:false,
    canApprove:false,executionEnabled:false,originalAttemptPreserved:true,reviewOnly:true};
   const proof=await preflight(auth,id,httpSessionId);
   const after=await snapshot();
   if(before.binding!==after.binding || before.credentialBinding!==after.credentialBinding ||
      digest(originalBefore.rows)!==digest((await original()).rows))throw new TestChatError(409,"session_changed");
   if(proof.ready && proof.sessionBinding!==digest([after.binding,after.credentialBinding]))
    throw new TestChatError(409,"review_context_changed");
   await verifyCheckoutTestSetup(deps.db);
   if(await authorizationState()!==authorizationStatus)throw new TestChatError(409,"review_context_changed");
   checks.push({id:"storefront",status:proof.ready?"passed":"blocked"},{id:"executionApproval",status:"required"});
   // Whitelist display facts only. Never expose proof digests, authorization IDs or credentials.
   return {status:proof.ready?"ready_for_owner_review":"blocked",checks,
    ...(proof.ready?{selection:{productId:proof.selection.productId,variantId:proof.selection.variantId,quantity:proof.selection.quantity,
      price:proof.selection.price,currency:proof.selection.currency,options:proof.selection.options},inventory:proof.inventory,quantityRule:proof.quantityRule}:{}),
    cartCreated:false,cartCreationEnabled:false,canApprove:false,executionEnabled:false,originalAttemptPreserved:true,reviewOnly:true};
  }finally{active.delete(key);}
 };
}
