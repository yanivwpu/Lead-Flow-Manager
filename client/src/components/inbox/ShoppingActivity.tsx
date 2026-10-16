import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ShoppingState } from "@shared/shoppingAssistant";
export function ShoppingActivity({conversationId}:{conversationId?:string|null}) {
 const {t,i18n}=useTranslation();
 const query=useQuery<{state:Partial<ShoppingState>}>({queryKey:[`/api/conversations/${conversationId}/shopping`],enabled:!!conversationId,retry:false,refetchInterval:15_000});
 const state=query.data?.state;
 if(!state?.version)return null;
 return <aside dir={i18n.dir()} className="border-b px-4 py-2 text-sm bg-muted/30" aria-label={t("shopping.activity")}>
  <strong>{t("shopping.activity")}</strong> · {t(`shopping.steps.${state.step}`)}
  {state.selected&&<div>{state.selected.productTitle} / {state.selected.variantTitle} · {state.selected.currency} {state.selected.price} × {state.quantity}</div>}
  {!state.selected&&state.choices?.map(c=><span className="block" key={c.variantId}>{c.productTitle} / {c.variantTitle}</span>)}
 </aside>;
}
