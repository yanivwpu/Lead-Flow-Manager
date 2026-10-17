import type { CatalogDb, createCommerceStore } from "../../salesCatalog/commerceStore";
import type { ShoppingSettings } from "@shared/shoppingAssistant";
import type { ShoppingCheckout } from "../service";
import { CheckoutError, type CommerceCheckoutProvider } from "./contract";
import { checkoutEligibility } from "./eligibility";
import { type ReceiptCodec, createCheckoutAttempts, checkoutRequestKey } from "./attempts";
import { createShopifyCheckoutProvider, validateCheckoutUrl } from "./shopify";
import { sql } from "drizzle-orm";
import { resolveCatalogInstallation } from "../../salesCatalog/shopify/installation";
import { createHash } from "node:crypto";
import { checkoutDomain } from "./domain";
/** Called only inside the owned Shopping Assistant turn lease. Returns text to existing reply policy; never sends. */
export function createCheckoutHandoff(deps: {
 database: CatalogDb; commerce: ReturnType<typeof createCommerceStore>; codec: () => ReceiptCodec;
 approved: () => boolean; settings: (id:string)=>Promise<ShoppingSettings>; entitled: (id:string)=>Promise<boolean>;
 provider?: (shop:string)=>CommerceCheckoutProvider;
}): ShoppingCheckout {
 const handoff:ShoppingCheckout = async (turn,state,guard,inventory) => {
  async function authorize() {
   if(!deps.approved() || !guard || !await deps.entitled(turn.userId)) throw new CheckoutError("setup_required");
   const settings=await deps.settings(turn.userId);
   if(!settings.enabled || !settings.checkoutEnabled || !settings.allowedChannels.includes(turn.channel as any)) throw new CheckoutError("setup_required");
   await guard.check();
  }
  try {
   await authorize();
   const context=await checkoutEligibility(deps.database,deps.commerce,turn.userId,turn.conversationId,Date.now,{state,token:guard!.token,inventory});
   const codec=deps.codec();
   // Bound all Storefront operations, including status checks on reused receipts, across workers.
   const permit=await deps.database.execute(sql`INSERT INTO checkout_provider_gates(user_id,shop,next_request_at) VALUES (${turn.userId},${context.shop},NOW()+interval '2 seconds') ON CONFLICT(user_id,shop) DO UPDATE SET next_request_at=EXCLUDED.next_request_at WHERE checkout_provider_gates.next_request_at<=NOW() RETURNING user_id`);
   if(!permit.rows.length)throw new CheckoutError("throttled",2_000);
   const provider=deps.provider?.(context.shop)??createShopifyCheckoutProvider({shop:context.shop,credential:{kind:"tokenless"},attestedCheckoutHost:await checkoutDomain(deps.database,turn.userId,context.shop)});
   const receipt=await createCheckoutAttempts(deps.database,codec).run(context,async()=>{
    await authorize();
    const install=await resolveCatalogInstallation(deps.database,turn.userId,context.shop);
    if(!install || install.integrationId+":"+createHash("sha256").update(install.token).digest("hex")!==context.integrationId)throw new CheckoutError("setup_required");
    return provider.prepare(context.item);
   });
   // Reverify on both first response and reuse: carts can expire or change outside this application.
   await provider.verify(context.item);
   const status=await provider.status?.(receipt,context.item);
   if(status!=="available") throw new CheckoutError(status==="expired"?"expired":"unavailable");
   await authorize();
   // Reinstallation during provider IO must suppress the old receipt.
   const current=await checkoutEligibility(deps.database,deps.commerce,turn.userId,turn.conversationId,Date.now,{state,token:guard!.token,inventory});
   if(current.integrationId!==context.integrationId)throw new CheckoutError("setup_required");
   return {status:"ready",url:receipt.checkoutUrl,requestKey:checkoutRequestKey(context),installationId:context.integrationId};
  } catch(error) {
   // Only sanitized categories escape; selection and durable confirmation identity are retained.
   if(!(error instanceof CheckoutError)) throw error;
   if(error.code==="throttled") await deps.database.execute(sql`UPDATE checkout_provider_gates SET next_request_at=GREATEST(next_request_at,NOW()+(${error.retryMs} * interval '1 millisecond')) WHERE user_id=${turn.userId}`);
   const status=error.code==="changed"?"changed":error.code==="expired"?"expired":error.code==="setup_required"?"setup_required":["ambiguous","already_preparing","throttled","unavailable"].includes(error.code)?"pending":"unavailable";
   return {status};
  }
 };
 // Same event, same prepared response: Builder/Brain readers share the short response lifetime.
 // This path never dispatches or performs a provider retry, and cannot serve a newer customer event.
 handoff.replay=async(turn,state,guard)=>{
  const checkout=state.checkout;
  if(!deps.approved() || !guard || state.lastEventId!==turn.eventId || checkout?.status!=="ready" || !checkout.requestKey || Date.now()-Date.parse(state.updatedAt)<0 || Date.now()-Date.parse(state.updatedAt)>=60_000 || !await deps.entitled(turn.userId))return;
  const settings=await deps.settings(turn.userId);
  if(!settings.enabled || !settings.checkoutEnabled || !settings.allowedChannels.includes(turn.channel as any))return;
  await guard.check();
  const install=await resolveCatalogInstallation(deps.database,turn.userId);
  if(!install || install.integrationId+":"+createHash("sha256").update(install.token).digest("hex")!==checkout.installationId)return;
  const source=await deps.commerce.source(turn.userId,state.sourceId);
  if(!source || source.integrationId!==install.integrationId || source.shop!==install.shop || !["ready","syncing"].includes(source.status))return;
  const receipt=await createCheckoutAttempts(deps.database,deps.codec()).readReady(checkout.requestKey,turn.userId,turn.conversationId);
  if(!receipt)return;
  // The original receipt's exact hostname was attested before committing this response. No browser input.
  const host=new URL(receipt.checkoutUrl).hostname;
  validateCheckoutUrl(receipt.checkoutUrl,install.shop,host);
  await guard.check();
  return receipt.checkoutUrl;
 };
 return handoff;
}
