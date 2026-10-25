import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

type LinkItem = {id:string;sourceUrl:string;targetUrl:string;sourceHost:string;topic:string;sourceKind:string;intent:string;score:number;status:string;notes:string};
const url = "/api/admin/seo-intelligence/backlinks";
async function api(path:string,init?:RequestInit) {
 const token = localStorage.getItem("whachat_admin_token");
 const res=await fetch(path,{...init,credentials:"include",headers:{"Content-Type":"application/json",...(token?{"x-admin-token":token}:{}),...init?.headers}});
 const data=await res.json().catch(()=>({}));
 if(!res.ok) throw new Error(data.error || "Backlink request failed");
 return data;
}
export function SeoBacklinksPanel(){
 const client=useQueryClient();
 const [expanded,setExpanded]=useState(false);
 const [raw,setRaw]=useState("");
 const [message,setMessage]=useState("");
 const query=useQuery<{items:LinkItem[]}>({queryKey:["seo-backlinks"],queryFn:()=>api(url),enabled:expanded,retry:false});
 const importer=useMutation({mutationFn:(records:unknown[])=>api(url+"/import",{method:"POST",body:JSON.stringify({records})}),onSuccess:(data)=>{setMessage(`Imported ${data.inserted} of ${data.evaluated} assessed records; ${data.rejected} need evidence corrections.`);client.invalidateQueries({queryKey:["seo-backlinks"]})}});
 const updater=useMutation({mutationFn:(p:{id:string;status:string;notes:string})=>api(url+"/"+p.id,{method:"PATCH",body:JSON.stringify({status:p.status,notes:p.notes})}),onSuccess:()=>client.invalidateQueries({queryKey:["seo-backlinks"]})});
 const items=query.data?.items??[];
 return <section className="rounded-xl border bg-white p-4" aria-label="Backlink Intelligence">
  <div className="flex flex-wrap justify-between gap-2 items-center">
   <div><h3 className="font-semibold">Backlink Intelligence</h3><p className="text-xs text-gray-500">Verified sources · human-reviewed outreach · no automatic sending</p></div>
   <Button type="button" variant="outline" onClick={()=>setExpanded(v=>!v)}>{expanded?"Hide":"Review backlinks"}</Button>
  </div>
  {expanded&&<div className="mt-4 space-y-3">
   <p className="text-sm text-gray-600">Import verified research records in JSON format (maximum 100). Google Search Console Links exports require evidence enrichment first; no backlink counts are inferred from performance data.</p>
   <details className="text-xs text-gray-600"><summary className="cursor-pointer">Import format example</summary><pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2">{JSON.stringify([{sourceUrl:"https://example.com/guides/shopify",targetUrl:"https://www.whachatcrm.com/zoko-alternative",topic:"shopify",evidence:"A verified article relevant to Shopify WhatsApp messaging tools.",sourceKind:"manual_research",sourceReference:"Editorial source reviewed on 2026-10-25",intent:"editorial_opportunity",placement:"editorial",contactPermission:"unknown",verifiedAt:"2026-10-25T12:00:00Z",sourceRelevant:true,targetLive:true,independentEditorialFit:true}],null,2)}</pre></details>
   <textarea value={raw} onChange={e=>setRaw(e.target.value)} rows={3} placeholder="Paste a JSON array of verified backlink candidates" className="w-full rounded-md border p-2 text-sm"/>
   <div className="flex gap-2"><Button disabled={importer.isPending||!raw.trim()} onClick={()=>{try{const parsed=JSON.parse(raw);if(!Array.isArray(parsed))throw new Error("Import must be a JSON array");setMessage("");importer.mutate(parsed);}catch(e){setMessage(e instanceof Error?e.message:"Invalid JSON");}}}>Import candidates</Button><Button variant="outline" onClick={()=>query.refetch()}>Refresh</Button></div>
   {(message||importer.error)&&<p role="status" className="text-xs text-gray-600">{message||importer.error?.message}</p>}
   {query.isLoading&&<p className="text-sm">Loading backlink records…</p>}
   {query.error&&<p className="text-sm text-red-600">{(query.error as Error).message}</p>}
   {!query.isLoading&&!query.error&&items.length===0&&<p className="text-sm text-gray-500">No verified backlink records imported yet.</p>}
   {items.map(item=><div key={item.id} className="border-t pt-3 space-y-1 text-sm">
    <div className="flex flex-wrap justify-between gap-2"><span className="font-medium break-all">{item.sourceHost}</span><span className="text-xs text-gray-500">Score {item.score} · {item.status.replaceAll("_"," ")}</span></div>
    <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-700 underline break-all">{item.sourceUrl}</a>
    <p className="text-xs text-gray-500">Target: {item.targetUrl} · {item.intent}</p>
    <div className="flex gap-2 items-center">
      <select aria-label={"Backlink status "+item.sourceHost} className="border rounded p-1 text-xs" value={item.status} disabled={updater.isPending} onChange={e=>updater.mutate({id:item.id,status:e.target.value,notes:item.notes||""})}>
       {["needs_review","approved_for_draft","contacted","link_verified","rejected","closed"].map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}
      </select>
      <span className="text-xs text-gray-500">Status records decisions only; never sends email.</span>
    </div>
   </div>)}
  </div>}
 </section>;
}
