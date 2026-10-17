import { ShopifyCheckoutTest } from "@/components/ShopifyCheckoutTest";
import { AiTestChat } from "@/components/AiTestChat";
import { useAuth } from "@/lib/auth-context";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { shoppingSettings, type ShoppingSettings as Settings } from "@shared/shoppingAssistant";
export function ShoppingSettings() {
 const {t,i18n}=useTranslation();const cache=useQueryClient();
 const {user,sessionAligned}=useAuth();
 const query=useQuery<{settings:Settings;entitled:boolean;checkoutReady:boolean;checkout?:{status:string}}>({queryKey:["/api/ai/shopping-settings",user?.id],queryFn:async()=>{const r=await apiRequest("GET","/api/ai/shopping-settings");return r.json();},enabled:!!user&&sessionAligned,retry:false});
 const [draft,setDraft]=useState<Settings>();
 const value=draft??shoppingSettings(query.data?.settings);
 const save=useMutation({mutationFn:async()=>apiRequest("PATCH","/api/ai/shopping-settings",value),onSuccess:()=>{setDraft(undefined);cache.invalidateQueries({queryKey:["/api/ai/shopping-settings"]});}});
 if(!query.data)return null;
 return <section dir={i18n.dir()} className="rounded-lg border p-4 space-y-3">
  <h3 className="font-semibold">{t("shopping.title")}</h3>
  <AiTestChat/>
  <ShopifyCheckoutTest key={user?.id}/>
  <label className="flex items-center gap-2"><input type="checkbox" checked={value.enabled} disabled={!query.data.entitled} onChange={e=>setDraft({...value,enabled:e.target.checked})}/>{t("shopping.enable")}</label>
  {!query.data.entitled&&<p className="text-sm">{t("shopping.pro")}</p>}
  <label className="flex items-center gap-2">{t("shopping.max")}<input className="border rounded w-16 p-1" type="number" min={1} max={8} value={value.maxRecommendations} onChange={e=>setDraft({...value,maxRecommendations:Number(e.target.value)})}/></label>
  <fieldset className="flex flex-wrap gap-3"><legend className="text-sm mb-1">{t("shopping.channels")}</legend>{["webchat","whatsapp","instagram","facebook","sms","telegram"].map(channel=><label key={channel} className="flex items-center gap-1"><input type="checkbox" checked={value.allowedChannels.includes(channel as any)} onChange={e=>setDraft({...value,allowedChannels:e.target.checked?[...value.allowedChannels,channel as any]:value.allowedChannels.filter(c=>c!==channel)})}/>{channel}</label>)}</fieldset>
  <label className="flex items-center gap-2"><input type="checkbox" checked={value.handoffOnFailure} onChange={e=>setDraft({...value,handoffOnFailure:e.target.checked})}/>{t("shopping.fallback")}</label>
  <label className="flex items-center gap-2"><input type="checkbox" checked={value.checkoutEnabled} disabled={!query.data.checkoutReady||!query.data.entitled} onChange={e=>setDraft({...value,checkoutEnabled:e.target.checked})}/>{t("shopping.checkoutEnable")}</label>
  <p className="text-sm text-muted-foreground" role="status">{t(`shopping.checkoutAuthorization.${query.data.checkout?.status??"awaiting_review"}`)}</p>
  <Button disabled={!draft||save.isPending||!Number.isInteger(value.maxRecommendations)||value.maxRecommendations<1||value.maxRecommendations>8} onClick={()=>save.mutate()}>{t("shopping.save")}</Button>
  {save.isError&&<p role="alert">{t("shopping.saveError")}</p>}
 </section>;
}
