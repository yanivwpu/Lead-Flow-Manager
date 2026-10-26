import { z } from "zod";
import type { PrivateCheckoutPreflight, TestChatView } from "@shared/aiTestChat";
import { cartTestPreparationAllowed, preparePrivateCartTest } from "./aiTestCartPreparation";

const receipt = z.object({cartCreated:z.literal(true),paymentStatus:z.literal("unknown"),
  navigation:z.literal("separate_approval_required"),checkoutUrl:z.string().max(4096)});
/** New server-authorized capability gets its own marker; never remove the original marker. */
export function privateCartAttemptKey(userId:string|undefined,proof:PrivateCheckoutPreflight|undefined) {
  const original=`private-cart-ui-attempt:v1:${userId}:whachatcrm.myshopify.com`;
  if(!proof?.ready||!proof.authorizationId)return original;
  const id=z.string().uuid().safeParse(proof.authorizationId);
  return id.success?`${original}:authorization:${id.data}`:original;
}
export function privateCartConfirmationAllowed(chat:TestChatView,proof:PrivateCheckoutPreflight|undefined,now:number) {
  if(!cartTestPreparationAllowed(chat,proof,now)||!proof?.ready)return false;
  const {quantity}=proof.selection,{minimum,maximum,increment}=proof.quantityRule;
  return proof.inventory.tracked && proof.inventory.quantity!==null && proof.inventory.quantity>=quantity &&
    quantity>=minimum && (maximum===null||quantity<=maximum) && (quantity-minimum)%increment===0;
}
function privateCheckoutUrl(raw:string) {
  const u=new URL(raw);
  if(u.protocol!=="https:"||u.hostname!=="whachatcrm.myshopify.com"||u.port||u.username||u.password||u.hash||
    !/^\/(?:cart\/c\/|checkouts\/)[A-Za-z0-9_-]+(?:\/|$)/.test(u.pathname)||
    [...u.searchParams.keys()].some(key=>key!=="key"))throw Error("private_cart_result_unknown");
  return u.href;
}
/** One explicit UI confirmation => one preparation and at most one execution POST.
 * Any failure is terminal for this runner. No renewal, retry, navigation or receipt persistence. */
export function createPrivateCartTestRunner() {
  let attempted=false;
  return async (input:{enabled:boolean;confirmed:boolean;chat:TestChatView;proof:PrivateCheckoutPreflight|undefined;
    current:()=>boolean;now:()=>number;claimLocalAttempt:()=>boolean;
    post:(path:string,body:Record<string,unknown>)=>Promise<{data:unknown;serverDate:string|null}>}) => {
    const unchanged=()=>{if(!input.current()||!privateCartConfirmationAllowed(input.chat,input.proof,input.now()))
      throw Error("private_cart_confirmation_changed");};
    if(!input.enabled||!input.confirmed||attempted)throw Error("private_cart_confirmation_required");
    unchanged();
    attempted=true;
    if(!input.claimLocalAttempt())throw Error("private_cart_already_attempted");
    const request=await preparePrivateCartTest(input.chat,input.proof,input.post,input.now);
    unchanged();
    // Use only the newly returned identity. Existing/expired preparations are never substituted.
    if(Date.parse(request.expiresAt)<=input.now())throw Error("private_cart_request_expired");
    const response=await input.post(`/api/ai/test-chat/${input.chat.id}/checkout-handoff-execute`,{
      requestId:request.requestId,scopeSha256:request.scopeSha256,expiresAt:request.expiresAt,
      confirmation:"CREATE EXACTLY ONE DEVELOPMENT STORE CART",
    });
    if(!input.current())throw Error("private_cart_result_unknown");
    const result=receipt.parse(response.data);
    return {checkoutUrl:privateCheckoutUrl(result.checkoutUrl),cartCreated:true as const};
  };
}
