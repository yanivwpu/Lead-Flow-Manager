import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { MarketingEmailAudiencePreview, MarketingEmailAudienceSource } from "@shared/marketingEmailAudienceEligibility";

const SOURCES: {value:MarketingEmailAudienceSource;label:string}[]=[
  {value:"all",label:"All CRM email lists"},
  {value:"shopify",label:"Shopify customers"},
  {value:"csv",label:"CSV imports"},
  {value:"crm",label:"Other CRM contacts"},
];
const DECISION_LABELS={
  eligible_opt_in:"Subscribed / potential recipient",
  eligible_us_opt_out:"U.S. opt-out basis documented",
  needs_verification:"Needs jurisdiction or permission review",
  suppressed:"Opted out / suppressed",
} as const;
const REASONS={
  subscribed:"Recorded email subscription",
  documented_us_existing_customer:"U.S. existing-customer basis documented",
  invalid_email:"Missing or invalid address",
  explicit_opt_out:"Explicit opt-out or unsubscribe",
  suppressed_identity:"Do-not-email / bounce record",
  pending_consent:"Subscription pending",
  missing_country_or_basis:"Country or legal basis not verified",
  outside_us_without_consent:"Non-U.S. recipient without opt-in",
  conflicting_consent:"Conflicting marketing preference",
} as const;

async function readAudience(source:MarketingEmailAudienceSource,offset:number) {
  const query=new URLSearchParams({source,offset:String(offset),limit:"50"});
  const response=await fetch(`/api/marketing/email-audience?${query}`,{credentials:"include"});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(result.error||"Could not load email audience"));
  return result.preview as MarketingEmailAudiencePreview;
}

/** Preflight only. Prospect AI marketing sends remain separately gated. */
export function MarketingEmailAudienceReview(){
  const [source,setSource]=useState<MarketingEmailAudienceSource>("shopify");
  const [preview,setPreview]=useState<MarketingEmailAudiencePreview|null>(null);
  const [loading,setLoading]=useState(false);
  const [confirmContact,setConfirmContact]=useState<string|null>(null);
  const [optingOut,setOptingOut]=useState(false);
  const [error,setError]=useState("");
  async function load(offset=0){
    setLoading(true);setError("");setConfirmContact(null);
    try{setPreview(await readAudience(source,offset));}
    catch(e){setError(e instanceof Error?e.message:"Audience preview unavailable");}
    finally{setLoading(false);}
  }
  async function optOut(contactId:string){
    setOptingOut(true);setError("");
    try{
      const response=await fetch(`/api/marketing/contacts/${encodeURIComponent(contactId)}/email-opt-out`,{
        method:"POST",credentials:"include",
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(String(body.error||"Could not save email opt-out"));
      setConfirmContact(null);
      setPreview(await readAudience(source,preview?.offset||0));
    }catch(e){setError(e instanceof Error?e.message:"Opt-out failed");}
    finally{setOptingOut(false);}
  }
  return <section className="mt-8 rounded-xl border border-gray-200 bg-white p-4 sm:p-5 space-y-4" aria-label="Email marketing audience readiness">
    <div>
      <h3 className="font-semibold text-gray-900">Email marketing audience</h3>
      <p className="mt-1 text-sm text-gray-600">
        Review CRM, CSV, and Shopify customers before any campaign. A missing subscription is
        not an unsubscribe, but it also doesn't establish eligibility outside the U.S.
      </p>
      <p className="mt-1 text-xs text-amber-800">
        Audience preview and email opt-out management only. Marketing sending is still in
        controlled release; this screen cannot start a campaign.
      </p>
    </div>
    <div className="flex flex-wrap gap-2 items-end">
      <label className="text-sm font-medium text-gray-700">
        Source
        <select value={source} onChange={e=>{
            setSource(e.target.value as MarketingEmailAudienceSource);setPreview(null);setConfirmContact(null);
          }} className="mt-1 block h-10 rounded-md border border-gray-300 bg-white px-3">
          {SOURCES.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <Button type="button" variant="outline" disabled={loading||optingOut} onClick={()=>void load(0)}>
        {loading?"Checking…":"Check email eligibility"}
      </Button>
    </div>
    {preview&&<>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          ["Subscribed",preview.counts.eligible_opt_in],
          ["U.S. basis verified",preview.counts.eligible_us_opt_out],
          ["Needs review",preview.counts.needs_verification],
          ["Blocked / opted out",preview.counts.suppressed],
        ] as const).map(([label,count])=><div key={label} className="rounded-lg border bg-gray-50 p-3 text-center">
          <p className="text-lg font-semibold text-gray-900">{count}</p>
          <p className="text-xs text-gray-600">{label}</p>
        </div>)}
      </div>
      <p className="text-xs text-gray-500">Showing {preview.rows.length} of {preview.total} contacts. Counts apply to this page, not the entire database.</p>
      <div className="max-h-80 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead className="sticky top-0 bg-gray-100"><tr>
            <th className="p-2">Customer</th><th className="p-2">Source</th><th className="p-2">Email readiness</th><th className="p-2">Action</th>
          </tr></thead>
          <tbody>{preview.rows.map(row=><tr key={row.contactId} className="border-t">
            <td className="p-2"><p className="font-medium">{row.name}</p><p className="text-gray-500">{row.email||"No email"}</p></td>
            <td className="p-2">{row.source.toUpperCase()}</td>
            <td className="p-2">
              <p className={row.decision==="suppressed"?"font-medium text-red-700":"font-medium text-gray-800"}>
                {DECISION_LABELS[row.decision]}
              </p>
              <p className="text-gray-500">{REASONS[row.reason]}</p>
            </td>
            <td className="p-2">
              {row.decision==="suppressed"||!row.email
                ? <span className="text-gray-500">—</span>
                : confirmContact===row.contactId
                  ? <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={()=>setConfirmContact(null)}>Cancel</Button>
                    <Button type="button" variant="destructive" size="sm" disabled={optingOut}
                      onClick={()=>void optOut(row.contactId)}>Confirm opt-out</Button>
                    </div>
                  : <Button type="button" variant="outline" size="sm" onClick={()=>setConfirmContact(row.contactId)}>Mark email opted out</Button>}
            </td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button type="button" size="sm" variant="outline" disabled={preview.offset===0||loading} onClick={()=>void load(Math.max(0,preview.offset-preview.limit))}>Previous</Button>
        <Button type="button" size="sm" variant="outline" disabled={preview.offset+preview.limit>=preview.total||loading} onClick={()=>void load(preview.offset+preview.limit)}>Next</Button>
      </div>
    </>}
    {error&&<p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  </section>;
}
