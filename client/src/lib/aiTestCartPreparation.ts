import { z } from "zod";
import type { PrivateCheckoutPreflight, TestChatView } from "@shared/aiTestChat";

const selection = z.object({
  shop:z.literal("whachatcrm.myshopify.com"),
  productId:z.literal("gid://shopify/Product/10108114174234"),
  variantId:z.literal("gid://shopify/ProductVariant/51638769221914"),
  quantity:z.literal(1),price:z.string().regex(/^\d+(?:\.\d{1,6})?$/),currency:z.string().regex(/^[A-Z]{3}$/),
  options:z.array(z.object({name:z.string(),value:z.string()})),
});
const request = z.object({
  requestId:z.string().uuid(),scopeSha256:z.string().regex(/^[a-f0-9]{64}$/),expiresAt:z.string().datetime(),
  authorizationId:z.string().uuid().optional(),
  selection,inventory:z.object({tracked:z.boolean(),quantity:z.number().int().nullable(),verifiedAt:z.string().datetime()}),
  quantityRule:z.object({minimum:z.number().int().positive(),maximum:z.number().int().positive().nullable(),increment:z.number().int().positive()}),
  cartCreated:z.literal(false),cartCreationEnabled:z.literal(false),
});
export type PrivateCartTestRequest = z.infer<typeof request>;
const summary = request.pick({requestId:true,scopeSha256:true,expiresAt:true});
export type PrivateCartTestSummary = z.infer<typeof summary>;
export class PrivateCartResponseError extends Error {
  readonly summary?: PrivateCartTestSummary;
  constructor(raw:unknown, readonly reason:"response_contract"|"response_timing"|"selection_changed"="response_contract") {
    super("preparation_response_needs_review");
    const parsed=summary.safeParse(raw);
    if(parsed.success)this.summary=parsed.data;
  }
}
/** HTTP Date is supplied by the authenticated same-origin server, at second precision. */
export function privateCartServerTime(date:string|null, fallback=Date.now()) {
  const value=date===null?NaN:Date.parse(date);
  return Number.isFinite(value)?value:fallback;
}
export function cartTestPreparationAllowed(chat:TestChatView,proof:PrivateCheckoutPreflight|undefined,now=Date.now()) {
  if(proof?.ready&&proof.authorizationId!==undefined&&!z.string().uuid().safeParse(proof.authorizationId).success)return false;
  if(!proof?.ready || chat.state.step!=="confirming" || !chat.state.selected || chat.state.quantity!==1 ||
    !Number.isFinite(Date.parse(chat.expiresAt)) || Date.parse(chat.expiresAt)<=now || !selection.safeParse(proof.selection).success)return false;
  const selected=chat.state.selected;
  if(Number(selected.price)!==Number(proof.selection.price)||selected.currency!==proof.selection.currency||
    JSON.stringify(selected.options)!==JSON.stringify(proof.selection.options))return false;
  const age=now-Date.parse(proof.inventory.verifiedAt);
  return Number.isFinite(age)&&age>=-1000&&age<=60_000;
}
/** Only the existing preparation endpoint. Never forward selection/approval fields or create/retry a cart. */
export async function preparePrivateCartTest(chat:TestChatView,proof:PrivateCheckoutPreflight|undefined,
  post:(path:string,body:Record<string,never>)=>Promise<{data:unknown;serverDate:string|null}>,now=Date.now) {
  if(!cartTestPreparationAllowed(chat,proof,now()) || !proof?.ready)throw Error("readiness_required");
  const response=await post(`/api/ai/test-chat/${chat.id}/checkout-handoff-request`,{});
  const parsed=request.safeParse(response.data);
  if(!parsed.success)throw new PrivateCartResponseError(response.data);
  const result=parsed.data,serverNow=privateCartServerTime(response.serverDate,now());
  const age=serverNow-Date.parse(result.inventory.verifiedAt),remaining=Date.parse(result.expiresAt)-serverNow;
  const a=result.selection,b=proof.selection;
  if(remaining<=0||remaining>5*60_000+1000||age< -1000||age>60_000)
    throw new PrivateCartResponseError(response.data,"response_timing");
  if(result.authorizationId!==proof.authorizationId||a.productId!==b.productId||a.variantId!==b.variantId||a.quantity!==b.quantity||Number(a.price)!==Number(b.price)||
    a.currency!==b.currency||JSON.stringify(a.options)!==JSON.stringify(b.options))
    throw new PrivateCartResponseError(response.data,"selection_changed");
  return result; // zod strips unknown fields, including server/session/credential additions.
}
export function privateCartPreparationError(error:unknown):"expired"|"unavailable"|"review" {
  if(error instanceof PrivateCartResponseError)return "review";
  if(error instanceof Error) {
    if(error.message === "404: session_expired")return "expired";
    try { const body=JSON.parse(error.message.slice(error.message.indexOf("{")));
      if(body?.error==="session_expired")return "expired";
    }catch { /* No provider text is displayed. */ }
  }
  return "unavailable";
}
