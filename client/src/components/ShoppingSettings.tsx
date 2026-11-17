import { ShopifyCheckoutTest } from "@/components/ShopifyCheckoutTest";
import { useAuth } from "@/lib/auth-context";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { shoppingSettings, type ShoppingSettings as Settings } from "@shared/shoppingAssistant";
export function ShoppingSettings({showDiagnostics=true}:{showDiagnostics?:boolean}={}) {
 const {t,i18n}=useTranslation();const cache=useQueryClient();
 const {user,sessionAligned}=useAuth();
 const query=useQuery<{settings:Settings;entitled:boolean;checkoutReady:boolean;checkout?:{status:string}}>({queryKey:["/api/ai/shopping-settings",user?.id],queryFn:async()=>{const r=await apiRequest("GET","/api/ai/shopping-settings");return r.json();},enabled:!!user&&sessionAligned,retry:false});
 const [draft,setDraft]=useState<Settings>();
 const value=draft??shoppingSettings(query.data?.settings);
 const save=useMutation({mutationFn:async()=>{const response=await apiRequest("PATCH","/api/ai/shopping-settings",value);return response.json();},onSuccess:async(result)=>{cache.setQueryData(["/api/ai/shopping-settings",user?.id],(previous:typeof query.data)=>previous?{...previous,settings:result.settings}:previous);setDraft(undefined);await cache.invalidateQueries({queryKey:["/api/ai/shopping-settings",user?.id]});}});
 if(!query.data)return <p role="status" className="text-sm">{t(query.isError?"shopping.loadError":"shopping.loading")}{query.isError&&<button className="ms-2 underline" onClick={()=>void query.refetch()}>{t("shopping.retry")}</button>}</p>;
 return <section dir={i18n.dir()} className="rounded-lg border p-4 space-y-3">
  <h3 className="font-semibold">{t("shopping.title")}</h3>
  <p className="text-sm text-muted-foreground">{t("shopping.benefit")}</p>
  {showDiagnostics&&<ShopifyCheckoutTest key={user?.id}/>}
  <fieldset disabled={save.isPending} className="space-y-3">
  <label className="flex items-center gap-2"><input type="checkbox" checked={value.enabled} disabled={!query.data.entitled} onChange={e=>{save.reset();setDraft({...value,enabled:e.target.checked});}}/>{t("shopping.enable")}</label>
  {!query.data.entitled&&<p className="text-sm">{t("shopping.pro")}</p>}
  <label className="flex items-center gap-2">{t("shopping.max")}<input className="border rounded w-16 p-1" type="number" min={1} max={8} value={value.maxRecommendations} onChange={e=>{save.reset();setDraft({...value,maxRecommendations:Number(e.target.value)});}}/></label>
  <fieldset className="flex flex-wrap gap-3"><legend className="text-sm mb-1">{t("shopping.channels")}</legend>{["webchat","whatsapp","instagram","facebook","sms","telegram"].map(channel=><label key={channel} className="flex items-center gap-1"><input type="checkbox" checked={value.allowedChannels.includes(channel as any)} onChange={e=>{save.reset();setDraft({...value,allowedChannels:e.target.checked?[...value.allowedChannels,channel as any]:value.allowedChannels.filter(c=>c!==channel)});}}/>{t(`shopping.channelsLabels.${channel}`)}</label>)}</fieldset>
  <label className="flex items-center gap-2"><input type="checkbox" checked={value.handoffOnFailure} onChange={e=>{save.reset();setDraft({...value,handoffOnFailure:e.target.checked});}}/>{t("shopping.fallback")}</label>
  {query.data.checkoutReady && query.data.entitled ? <label className="flex items-center gap-2"><input type="checkbox" checked={value.checkoutEnabled} onChange={e=>{save.reset();setDraft({...value,checkoutEnabled:e.target.checked});}}/>{t("shopping.checkoutEnable")}</label> :
    <div className="rounded-lg bg-slate-50 p-3" role="status">
      <p className="text-sm font-medium">{t(query.data.checkout?.status==="awaiting_review"?"shopping.checkoutSoon":"shopping.checkoutUnavailable")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t(`shopping.checkoutAuthorization.${query.data.checkout?.status??"awaiting_review"}`)}</p>
    </div>}
  <Button disabled={!draft||save.isPending||!Number.isInteger(value.maxRecommendations)||value.maxRecommendations<1||value.maxRecommendations>8} onClick={()=>save.mutate()}>{t(save.isPending?"shopping.saving":"shopping.save")}</Button>
  {save.isSuccess&&!draft&&<p role="status" className="text-sm text-emerald-700">{t("shopping.saved")}</p>}
  {save.isError&&<p role="alert">{t("shopping.saveError")}</p>}
  </fieldset>
 </section>;
}
