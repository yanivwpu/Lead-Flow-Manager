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
  selection,inventory:z.object({tracked:z.boolean(),quantity:z.number().int().nullable(),verifiedAt:z.string().datetime()}),
  quantityRule:z.object({minimum:z.number().int().positive(),maximum:z.number().int().positive().nullable(),increment:z.number().int().positive()}),
  cartCreated:z.literal(false),cartCreationEnabled:z.literal(false),
});
export type PrivateCartTestRequest = z.infer<typeof request>;
export function cartTestPreparationAllowed(chat:TestChatView,proof:PrivateCheckoutPreflight|undefined,now=Date.now()) {
  if(!proof?.ready || chat.state.step!=="confirming" || !chat.state.selected || chat.state.quantity!==1 ||
    !Number.isFinite(Date.parse(chat.expiresAt)) || Date.parse(chat.expiresAt)<=now || !selection.safeParse(proof.selection).success)return false;
  const selected=chat.state.selected;
  if(Number(selected.price)!==Number(proof.selection.price)||selected.currency!==proof.selection.currency||
    JSON.stringify(selected.options)!==JSON.stringify(proof.selection.options))return false;
  const age=now-Date.parse(proof.inventory.verifiedAt);
  return Number.isFinite(age)&&age>=0&&age<=60_000;
}
/** Only the existing preparation endpoint. Never forward selection/approval fields or create/retry a cart. */
export async function preparePrivateCartTest(chat:TestChatView,proof:PrivateCheckoutPreflight|undefined,
  post:(path:string,body:Record<string,never>)=>Promise<unknown>,now=Date.now) {
  if(!cartTestPreparationAllowed(chat,proof,now()) || !proof?.ready)throw Error("readiness_required");
  const result=request.parse(await post(`/api/ai/test-chat/${chat.id}/checkout-handoff-request`,{}));
  const age=now()-Date.parse(result.inventory.verifiedAt),remaining=Date.parse(result.expiresAt)-now();
  const a=result.selection,b=proof.selection;
  if(remaining<=0||remaining>5*60_000||age<0||age>60_000||a.productId!==b.productId||a.variantId!==b.variantId||
    a.quantity!==b.quantity||Number(a.price)!==Number(b.price)||a.currency!==b.currency||JSON.stringify(a.options)!==JSON.stringify(b.options))
    throw Error("readiness_required");
  return result; // zod strips unknown fields, including server/session/credential additions.
}
export function privateCartPreparationError(error:unknown):"expired"|"unavailable" {
  if(error instanceof Error) {
    try { const body=JSON.parse(error.message.slice(error.message.indexOf("{")));
      if(body?.error==="session_expired")return "expired";
    }catch { /* No provider text is displayed. */ }
  }
  return "unavailable";
}
