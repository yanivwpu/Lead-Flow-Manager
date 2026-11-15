import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Brain, RefreshCw, PackageCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { withUserQueryScope } from "@/lib/accountQueryScope";
import { useEcommerceMerchantActivationStatus } from "@/lib/ecommerceMerchantActivation";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { finishCommerceWelcome, hasPendingCommerceWelcome, hasSeenCommerceWelcome, shouldShowCommerceWelcome } from "@/lib/commerceWelcome";
import { COMMERCE_GUIDE_PATH, CommerceText } from "./CommerceGuide";

export function CommerceWelcome() {
  const {user,sessionAligned}=useAuth();
  let pending=false;
  try { pending=!!user?.id && hasPendingCommerceWelcome(user.id,window.sessionStorage); } catch { /* browser storage optional */ }
  // Wait until the authenticated app has rendered; never interrupt OAuth or plan selection.
  if(!user?.id || !sessionAligned || !pending) return null;
  return <PendingCommerceWelcome key={user.id} userId={user.id}/>;
}
function PendingCommerceWelcome({userId}:{userId:string}) {
  const {t,i18n}=useTranslation();
  const [,navigate]=useLocation();
  const [dismissed,setDismissed]=useState(false);
  const activation=useEcommerceMerchantActivationStatus();
  const connection=useQuery<{connected:boolean;shop:string|null}>({
    queryKey:withUserQueryScope(["/api/shopify/connection-status"],userId),retry:false,
    queryFn:async()=>{const r=await fetch("/api/shopify/connection-status",{credentials:"include",cache:"no-store"});if(!r.ok)throw Error("connection_unavailable");return r.json();}
  });
  const shop=connection.data?.shop;
  let seen=true;
  try { if(shop)seen=hasSeenCommerceWelcome(userId,shop,window.localStorage); } catch { /* skip if browser state inaccessible */ }
  const open=!dismissed && !activation.isError && !activation.isLoading && !connection.isError && !connection.isFetching && !!shop &&
    shouldShowCommerceWelcome({pending:true,connected:connection.data?.connected===true,activated:activation.data?.activated!==false,seen});
  function finish(destination?:string) {
    if(shop) { try { finishCommerceWelcome(userId,shop,window.localStorage,window.sessionStorage); } catch { /* state remains local to this render */ } }
    setDismissed(true);
    if(destination)navigate(destination);
  }
  const benefits=t("commerceEducation.benefits",{returnObjects:true}) as [string,string][];
  const icons=[Brain,RefreshCw,PackageCheck];
  return <Dialog open={open} onOpenChange={next=>{if(!next)finish();}}>
    <DialogContent dir={i18n.dir()} lang={i18n.resolvedLanguage} closeLabel={t("commerceEducation.close")} className="max-w-xl border-blue-100 bg-white text-start" data-testid="commerce-welcome">
      <span className="text-xs font-semibold text-blue-700"><bdi>Shopify · WhachatCRM</bdi></span>
      <DialogTitle className="pe-5 text-2xl leading-tight"><CommerceText text={t("commerceEducation.welcomeTitle")}/></DialogTitle>
      <DialogDescription className="text-sm leading-relaxed" style={{unicodeBidi:"plaintext"}}><CommerceText text={t("commerceEducation.welcomeBody")}/></DialogDescription>
      <div className="space-y-3">{benefits.map(([title,body],index)=>{const Icon=icons[index];return <div key={title} className="flex gap-3 rounded-xl border border-slate-100 p-3">
        <Icon aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-blue-600"/>
        <div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-sm text-slate-600" style={{unicodeBidi:"plaintext"}}><CommerceText text={body}/></p></div>
      </div>;})}</div>
      <p className="text-xs text-slate-500">{t("commerceEducation.welcomeSafe")}</p>
      <div className="flex flex-wrap gap-3">
        <button autoFocus className="min-h-10 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={()=>finish("/app/ecommerce-growth-engine?view=setup")}>{t("commerceEducation.explore")}</button>
        <button className="min-h-10 rounded-lg border px-4 py-2 text-sm" onClick={()=>finish()}>{t("commerceEducation.later")}</button>
      </div>
      <button className="min-h-10 w-fit rounded text-start text-sm font-medium text-blue-700 hover:underline" onClick={()=>finish(COMMERCE_GUIDE_PATH)}>{t("commerceEducation.learn")}</button>
    </DialogContent>
  </Dialog>;
}
