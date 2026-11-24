import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { ShopifyProspectCustomerPreview, ShopifyProspectReviewImportResult } from "../../../../server/prospectImport/shopifyCustomerImportService";

const BASE="/api/growth-tools/prospect-import";
async function request<T>(url:string,body?:unknown):Promise<T>{
  const response=await fetch(url,{
    method:body?"POST":"GET",credentials:"include",
    headers:body?{"Content-Type":"application/json"}:undefined,
    body:body?JSON.stringify(body):undefined,
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(data.error||"Request failed"));
  return data as T;
}
function consentLabel(state:string) {
  return state==="subscribed"?"Subscribed":state==="unsubscribed"?"Unsubscribed":
    state==="not_subscribed"?"Not subscribed":state==="pending"?"Pending":"Not recorded";
}
export function ShopifyCustomerProspectImport(){
  const queryClient=useQueryClient();
  const [preview,setPreview]=useState<ShopifyProspectCustomerPreview|null>(null);
  const [result,setResult]=useState<ShopifyProspectReviewImportResult|null>(null);
  const [step,setStep]=useState<"source"|"review"|"confirm"|"complete">("source");
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [batchName,setBatchName]=useState("Shopify customer review");
  const [merchantConfirm,setMerchantConfirm]=useState(false);
  const [reviewConfirm,setReviewConfirm]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{setStep("source");},[]);
  async function load(){
    setBusy(true);setError("");setResult(null);setMerchantConfirm(false);setReviewConfirm(false);
    try{
      const {preview:p}=await request<{preview:ShopifyProspectCustomerPreview}>(`${BASE}/shopify/preview`);
      setPreview(p);setSelected(new Set(p.rows.filter(r=>!r.alreadyInReview).map(r=>r.contactId)));
      setStep("review");
    }catch(e){setError(e instanceof Error?e.message:"Could not load customers");}
    finally{setBusy(false);}
  }
  async function submit(){
    if(!preview)return;
    setBusy(true);setError("");
    try{
      const {job}=await request<{job:ShopifyProspectReviewImportResult}>(`${BASE}/shopify/import`,{
        previewJobId:preview.previewJobId,fingerprint:preview.fingerprint,
        selectedContactIds:[...selected],batchName:batchName.trim(),
        confirmReviewOnly:reviewConfirm,confirmMerchantAuthority:merchantConfirm,
      });
      setResult(job);setStep("complete");
      void queryClient.invalidateQueries({queryKey:[`${BASE}/history`]});
      void queryClient.invalidateQueries({queryKey:[`${BASE}/dashboard`]});
      void queryClient.invalidateQueries({queryKey:["/api/growth-tools/prospect-intelligence"]});
    }catch(e){setError(e instanceof Error?e.message:"Could not import selected customers");}
    finally{setBusy(false);}
  }
  const toggle=(id:string,on:boolean)=>setSelected(previous=>{
    const next=new Set(previous);if(on)next.add(id);else next.delete(id);return next;
  });
  return <div className="mt-5 space-y-4 rounded-xl border border-emerald-100 bg-emerald-50/30 p-4 sm:p-5">
    <div>
      <h3 className="font-semibold text-gray-900">Import from your connected Shopify store</h3>
      <p className="mt-1 text-sm text-gray-600">
        Select Shopify customers already synced to your own CRM. They will be linked to Prospect AI for <strong>internal review only</strong>.
        Your existing customer records, conversations, tags and pipelines stay unchanged.
      </p>
      <p className="mt-2 text-xs text-amber-800">
        This preview shows currently synced customers only; it is not a complete Shopify history import.
        Importing does not establish marketing consent or allow AI analysis, Prospect AI campaigns, WhatsApp, SMS or email sends.
        Use the dedicated Shopify Growth Engine customer-messaging journeys for consent-gated communications.
      </p>
    </div>
    <div className="flex flex-wrap gap-2 text-xs">
      {["Connected store","Preview","Confirm","Complete"].map((label,i)=>
        <span key={label} className={`rounded-full px-3 py-1 ${["source","review","confirm","complete"][i]===step?"bg-emerald-700 text-white":"border bg-white text-gray-600"}`}>
          {i+1}. {label}
        </span>
      )}
    </div>
    {step==="source"&&<div className="flex flex-col gap-3">
      <p className="text-sm text-gray-700">Your connected store is resolved from the signed-in workspace. You cannot select another merchant's store.</p>
      <Button type="button" disabled={busy} onClick={()=>void load()} className="self-start">{busy?"Checking connected store…":"Preview synced Shopify customers"}</Button>
    </div>}
    {step==="review"&&preview&&<>
      <p className="text-sm text-gray-700">Store: <strong>{preview.shop}</strong></p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          ["Synced",preview.syncedTotal],["Shown",preview.shown],
          ["Already in Review",preview.alreadyInReview],["Available",preview.available],
        ] as const).map(([label,n])=><div key={label} className="rounded-lg border bg-white p-3 text-center"><p className="text-lg font-semibold">{n}</p><p className="text-xs text-gray-600">{label}</p></div>)}
      </div>
      {preview.syncedTotal>preview.shown&&<p className="text-sm text-amber-700">The first 250 synced customer records are shown. Additional customers require a separate preview batch.</p>}
      <p className="text-xs text-gray-600">Consent statuses are informational. “Subscribed” to email or SMS is not WhatsApp consent and does not authorize Prospect AI campaigns.</p>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={selected.size>0&&selected.size===preview.rows.filter(r=>!r.alreadyInReview).length}
          onCheckedChange={on=>setSelected(on===true?new Set(preview.rows.filter(r=>!r.alreadyInReview).map(r=>r.contactId)):new Set())}/>
        Select all available
      </label>
      <div className="max-h-80 overflow-auto rounded-lg border bg-white">
        <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-gray-100">
          <tr><th className="p-2">Select</th><th className="p-2">Customer</th><th className="p-2">Email consent</th><th className="p-2">SMS consent</th><th className="p-2">Status</th></tr>
        </thead><tbody>{preview.rows.map(row=><tr className="border-t" key={row.contactId}>
          <td className="p-2"><Checkbox disabled={row.alreadyInReview} checked={selected.has(row.contactId)} onCheckedChange={on=>toggle(row.contactId,on===true)}/></td>
          <td className="p-2"><span className="font-medium">{row.name}</span><div className="text-gray-500">{row.email||row.phone||"No contact details"}</div></td>
          <td className="p-2">{consentLabel(row.emailConsent)}</td><td className="p-2">{consentLabel(row.smsConsent)}</td>
          <td className="p-2">{row.alreadyInReview?"Already linked":"Available"}</td>
        </tr>)}</tbody></table>
      </div>
      <div className="flex justify-between gap-2">
        <Button variant="outline" type="button" onClick={()=>setStep("source")}>Back</Button>
        <Button type="button" disabled={!selected.size} onClick={()=>setStep("confirm")}>Review import options</Button>
      </div>
    </>}
    {step==="confirm"&&preview&&<>
      <p className="text-sm font-medium">{selected.size} customers selected from {preview.shop}</p>
      <label className="block text-sm">Batch name<Input className="mt-1" value={batchName} maxLength={120} onChange={e=>setBatchName(e.target.value)}/></label>
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <strong>Review-only import.</strong> No new Shopify customers will be created in CRM; existing customer details remain with the merchant. No AI analysis, marketing campaigns or messages will be initiated.
      </div>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={merchantConfirm} onCheckedChange={v=>setMerchantConfirm(v===true)}/>
        <span>I manage this connected store and authorize linking its existing customer records for internal CRM review in this workspace.</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={reviewConfirm} onCheckedChange={v=>setReviewConfirm(v===true)}/>
        <span>I understand this import does not grant marketing consent or authorize AI profiling, campaigns or customer outreach.</span>
      </label>
      <div className="flex justify-between gap-2">
        <Button variant="outline" type="button" onClick={()=>setStep("review")}>Back</Button>
        <Button type="button" disabled={busy||!merchantConfirm||!reviewConfirm||!batchName.trim()} onClick={()=>void submit()}>
          {busy?"Linking…":"Import for internal review"}
        </Button>
      </div>
    </>}
    {step==="complete"&&result&&<div className="rounded-lg border bg-white p-4">
      <p className="font-semibold text-emerald-800">Shopify customer review import completed</p>
      <p className="mt-1 text-sm">Linked: {result.imported} · Skipped / already linked: {result.skipped} · Errors: {result.errors}</p>
      <p className="mt-2 text-sm text-gray-600">Review these records in Prospect AI. CRM customer records and messaging permissions are unchanged.</p>
      <Button type="button" variant="outline" className="mt-3" onClick={()=>void load()}>Preview another batch</Button>
    </div>}
    {error&&<p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  </div>;
}
