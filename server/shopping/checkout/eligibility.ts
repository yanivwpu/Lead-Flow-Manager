import { and, eq } from "drizzle-orm";
import { conversations } from "@shared/schema";
import type { ShoppingState } from "@shared/shoppingAssistant";
import { compareMoney } from "@shared/shoppingAssistant";
import type { CatalogDb, createCommerceStore } from "../../salesCatalog/commerceStore";
import { resolveCatalogInstallation } from "../../salesCatalog/shopify/installation";
import { CheckoutError, type VerifiedCheckoutItem } from "./contract";
/** Takes only server-authenticated owner/conversation IDs. Never takes client Shopify IDs or prices. */
export async function checkoutEligibility(database: CatalogDb, commerce: ReturnType<typeof createCommerceStore>, userId: string, conversationId: string, now:()=>number=Date.now) {
  const [conversation]=await database.select().from(conversations).where(and(eq(conversations.userId,userId),eq(conversations.id,conversationId))).limit(1);
  const state=conversation?.shoppingState as (ShoppingState & {_lease?:{until:number}}) | undefined;
  const age=now()-Date.parse(state?.updatedAt??"");
  if(!conversation || ["closed","resolved"].includes(conversation.status) || (state?._lease?.until??0)>now() || state?.step!=="confirmed" || state.intent!=="confirm" || !state.selected || !state.consumedEventIds?.includes(state.lastEventId) || !Number.isFinite(age) || age<0 || age>30*60_000) throw new CheckoutError("not_confirmed");
  if(!Number.isInteger(state.quantity)||state.quantity<1||state.quantity>99)throw new CheckoutError("unavailable");
  const install=await resolveCatalogInstallation(database,userId);
  const source=await commerce.source(userId,state.sourceId);
  if(!install || !source || source.shop!==install.shop || source.integrationId!==install.integrationId || source.currency!==state.selected.currency) throw new CheckoutError("setup_required");
  const selected=state.selected;
  const live=(await commerce.verifyForPurchase(userId,state.sourceId,[selected.variantId])).find(v=>v.variant.id===selected.variantId&&v.product.id===selected.productId);
  const verifiedAge=now()-new Date(live?.variant.verifiedAt??0).getTime();
  if(!live || !Number.isFinite(verifiedAge)||verifiedAge<0||verifiedAge>60_000 || !live.product.published || live.product.status!=="ACTIVE" || !["available","not_tracked"].includes(live.availability) || (live.variant.tracked&&live.variant.inventoryPolicy!=="CONTINUE"&&(live.variant.quantity===null||live.variant.quantity<state.quantity)))throw new CheckoutError("unavailable");
  const v=live.variant;
  if(v.price===null || v.currency!==selected.currency || compareMoney(v.price,selected.price)!==0 || JSON.stringify(v.options)!==JSON.stringify(selected.options) || v.title!==selected.variantTitle)throw new CheckoutError("changed");
  const item:VerifiedCheckoutItem={productId:live.product.externalId,variantId:v.externalId,quantity:state.quantity,price:v.price,currency:selected.currency,options:selected.options};
  return {userId,conversationId,sourceId:source.id,shop:install.shop,integrationId:install.integrationId,confirmationId:state.lastEventId,item};
}
