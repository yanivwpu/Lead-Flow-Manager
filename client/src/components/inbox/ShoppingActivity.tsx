import { isExplicitRealEstateShoppingOverride } from "@shared/aiDomainEligibility";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ShoppingState } from "@shared/shoppingAssistant";
export function ShoppingActivity({conversationId, latestInboundText}:{conversationId?:string|null;latestInboundText?:string|null}) {
 const query=useQuery<{state:Partial<ShoppingState>}>({queryKey:[`/api/conversations/${conversationId}/shopping`],enabled:!!conversationId,retry:false,refetchInterval:15_000});
 return <ShoppingActivityView state={query.data?.state} latestInboundText={latestInboundText}/>;
}
export function ShoppingActivityView({state,latestInboundText}:{state?:Partial<ShoppingState>;latestInboundText?:string|null}) {
 const {t,i18n}=useTranslation();
 // Do not show a stale Shopify product-discovery banner on a clearly
 // unrelated new property inquiry; keep persisted Shopping state unchanged.
 if (!state?.version || isExplicitRealEstateShoppingOverride(latestInboundText)) return null;
 return <aside dir={i18n.dir()} className="border-b px-4 py-2 text-sm bg-muted/30" aria-label={t("shopping.activity")}>
  <strong>{t("shopping.activity")}</strong> · {t(`shopping.steps.${state.step}`)}
  {state.checkout&&<div>{t(`shopping.checkoutStatus.${state.checkout.status}`)}</div>}
  {state.selected&&<div>{state.selected.productTitle} / {state.selected.variantTitle} × {state.quantity}{state.step!=="pending"&&<> · {state.selected.currency} {state.selected.price} · {t("shopping.priceChecked")} {new Date(state.selected.verifiedAt).toLocaleTimeString()}</>}</div>}
  {!state.selected&&state.choices?.map(c=><span className="block" key={c.variantId}>{c.productTitle} / {c.variantTitle}</span>)}
 </aside>;
}
