import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ProspectImportPreviewResult, ProspectImportJobSummary } from "@shared/prospectImport";
import { PROSPECT_CSV_MAX_BYTES } from "@shared/prospectCsvImport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

async function request<T>(url:string,body?:unknown):Promise<T> {
  const res=await fetch(url,{
    method:body?"POST":"GET",credentials:"include",
    headers:body?{"Content-Type":"application/json"}:undefined,
    body:body?JSON.stringify(body):undefined,
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(String(data.error||"Request failed"));
  return data as T;
}
const BASE="/api/growth-tools/prospect-import";
export function CsvProspectImport() {
  const queryClient=useQueryClient();
  const [fileName,setFileName]=useState("");
  const [csvText,setCsvText]=useState("");
  const [preview,setPreview]=useState<ProspectImportPreviewResult|null>(null);
  const [step,setStep]=useState<"upload"|"preview"|"options"|"progress">("upload");
  const [search,setSearch]=useState("");
  const [limit,setLimit]=useState(100);
  const [emailOnly,setEmailOnly]=useState(false);
  const [batchName,setBatchName]=useState("");
  const [importReason,setImportReason]=useState("General prospecting");
  const [all,setAll]=useState(true);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [authorized,setAuthorized]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [job,setJob]=useState<ProspectImportJobSummary|null>(null);

  useEffect(()=>{
    if (!job||!["pending","running"].includes(job.status)) return;
    const timer=setInterval(()=>{
      void request<{job:ProspectImportJobSummary}>(`${BASE}/jobs/${job.id}`)
        .then(result=>{
          setJob(result.job);
          if(result.job.status==="completed"){
            void queryClient.invalidateQueries({queryKey:[`${BASE}/dashboard`]});
            void queryClient.invalidateQueries({queryKey:[`${BASE}/history`]});
            void queryClient.invalidateQueries({queryKey:["/api/growth-tools/prospect-intelligence"]});
          }
        }).catch(()=>{ /* polling errors do not retry imports */ });
    },2000);
    return ()=>clearInterval(timer);
  },[job?.id,job?.status,queryClient]);

  async function selectFile(file:File|undefined) {
    setPreview(null);setCsvText("");setError("");setJob(null);setStep("upload");
    if(!file)return;
    if(file.size>PROSPECT_CSV_MAX_BYTES){setError("Choose a CSV smaller than 512 KB (1,000 rows maximum).");return;}
    try {
      const text=await file.text();
      setCsvText(text);setFileName(file.name);
    }catch{setError("Could not read CSV file.");}
  }

  async function doPreview() {
    if(!csvText)return;
    setLoading(true);setError("");
    try {
      const result=await request<{preview:ProspectImportPreviewResult}>(`${BASE}/csv/preview`,{
        csvText,filters:{search,importLimit:limit,hasEmail:emailOnly},
      });
      setPreview(result.preview);setSelected(new Set(result.preview.contacts.map(r=>r.externalId)));
      setAll(true);setStep("preview");
    } catch(e){setError(e instanceof Error?e.message:"Preview failed");}
    finally{setLoading(false);}
  }

  async function doImport() {
    if(!preview?.previewJobId||!preview.filterFingerprint||!authorized)return;
    setLoading(true);setError("");
    try{
      const result=await request<{job:ProspectImportJobSummary}>(`${BASE}/csv/import`,{
        previewJobId:preview.previewJobId,filterFingerprint:preview.filterFingerprint,
        confirmOwnedData:authorized,
        importOptions:{batchName,importReason,selectedExternalIds:all?undefined:[...selected]},
      });
      setJob(result.job);setStep("progress");setCsvText("");
      void queryClient.invalidateQueries({queryKey:[`${BASE}/history`]});
    }catch(e){setError(e instanceof Error?e.message:"Import failed");}
    finally{setLoading(false);}
  }

  return (
    <div className="mt-5 space-y-5 rounded-xl border border-emerald-100 bg-emerald-50/30 p-4 sm:p-5">
      <div>
        <h3 className="font-semibold text-gray-900">Import prospects from CSV</h3>
        <p className="mt-1 text-sm text-gray-600">Upload your own business-prospect list. Review duplicates before importing. No messages or campaigns are sent by this upload.</p>
        <p className="mt-1 text-xs text-gray-500">Supports Name (or First/Last Name), Email, Phone, Company and Tags. Up to 1,000 rows / 512 KB. Only these columns are imported.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {(["upload","preview","options","progress"] as const).map((s,i)=>
          <span key={s} className={`rounded-full px-3 py-1 ${s===step?"bg-emerald-700 text-white":"bg-white text-gray-600 border"}`}>{i+1}. {s==="upload"?"Upload":s==="preview"?"Review":s==="options"?"Options":"Import"}</span>
        )}
      </div>
      {step==="upload"&&<>
        <label className="block text-sm font-medium text-gray-700" htmlFor="prospect-csv-file">Choose CSV file</label>
        <Input id="prospect-csv-file" type="file" accept=".csv,text/csv" onChange={e=>{void selectFile(e.target.files?.[0]);}} />
        {fileName&&<p className="text-xs text-gray-600">Selected: {fileName}</p>}
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex-1 text-sm">Search name/company/email
            <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Optional filter" className="mt-1" />
          </label>
          <label className="text-sm">Maximum to import
            <select className="mt-1 block h-10 w-full rounded-md border bg-white px-3" value={limit} onChange={e=>setLimit(Number(e.target.value))}>
              {[10,50,100,250,500,1000].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={emailOnly} onCheckedChange={v=>setEmailOnly(v===true)} /> Only rows with email</label>
        <div className="flex justify-end"><Button type="button" disabled={!csvText||loading} onClick={()=>void doPreview()}>{loading?"Checking…":"Preview CSV — no import yet"}</Button></div>
      </>}
      {step==="preview"&&preview&&<>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[["Scanned",preview.stats.totalContactsScanned],["Matching",preview.stats.totalMatching],["New",preview.stats.willImportNew],["Already exists",preview.stats.alreadyExists]].map(([label,count])=>
            <div key={label} className="rounded-lg border bg-white p-3 text-center"><p className="text-xl font-bold">{count}</p><p className="text-xs text-gray-600">{label}</p></div>
          )}
        </div>
        <p className="text-xs text-gray-600">Dry run only. Duplicate contacts are always skipped; existing CRM records won't be changed. {preview.truncated?"Showing the first 250 rows.":" "}</p>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={all} onCheckedChange={v=>{setAll(v===true);setSelected(v===true?new Set(preview.contacts.map(r=>r.externalId)):new Set());}} /> Include all matching rows (up to selected limit)</label>
        <div className="max-h-64 overflow-auto rounded-lg border bg-white">
          <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-gray-100"><tr><th className="p-2">Select</th><th className="p-2">Name</th><th className="p-2">Email / phone</th><th className="p-2">CRM</th></tr></thead>
          <tbody>{preview.contacts.map(row=><tr key={row.externalId} className="border-t">
            <td className="p-2"><Checkbox checked={all||selected.has(row.externalId)} onCheckedChange={v=>{setAll(false);setSelected(old=>{const next=new Set(old);if(v===true)next.add(row.externalId);else next.delete(row.externalId);return next;});}}/></td>
            <td className="p-2">{row.name}</td><td className="p-2">{row.email||row.phone||"—"}</td><td className="p-2">{row.isDuplicate?"Duplicate":"New"}</td>
          </tr>)}</tbody></table>
        </div>
        <div className="flex justify-between gap-2"><Button type="button" variant="outline" onClick={()=>setStep("upload")}>Back</Button><Button type="button" disabled={!all&&selected.size===0} onClick={()=>setStep("options")}>Import options</Button></div>
      </>}
      {step==="options"&&preview&&<>
        <label className="block text-sm">Batch name *<Input value={batchName} onChange={e=>setBatchName(e.target.value)} maxLength={120} placeholder="November business prospects" className="mt-1"/></label>
        <label className="block text-sm">Purpose <Input value={importReason} onChange={e=>setImportReason(e.target.value)} maxLength={120} className="mt-1"/></label>
        <p className="text-sm text-gray-600">New contacts will be tagged Imported-CSV and sent to Prospect AI Review. Duplicate CRM contacts are skipped. No outreach will be sent automatically.</p>
        <label className="flex items-start gap-2 text-sm"><Checkbox checked={authorized} onCheckedChange={v=>setAuthorized(v===true)}/> <span>I am authorized to upload these contacts for CRM storage and Prospect AI review. I understand that uploading contacts does not establish marketing consent.</span></label>
        <div className="flex justify-between gap-2"><Button variant="outline" type="button" onClick={()=>setStep("preview")}>Back</Button><Button type="button" disabled={!batchName.trim()||!authorized||loading} onClick={()=>void doImport()}>{loading?"Importing…":"Start CSV import"}</Button></div>
      </>}
      {step==="progress"&&job&&<div className="rounded-lg border bg-white p-4">
        <p className="font-semibold">{job.batchName} — {job.status}</p>
        <p className="mt-1 text-sm text-gray-600">{job.progressCurrent} / {job.progressTotal} processed · {job.imported} imported · {job.duplicates} duplicates · {job.errors} errors</p>
        {job.status==="completed"&&<p className="mt-2 text-sm text-emerald-700">Import finished. New contacts can be reviewed in Prospect AI. Import history and undo remain available below.</p>}
        {job.status==="failed"&&<p className="mt-2 text-sm text-red-700">{job.errorMessage||"Import failed."}</p>}
      </div>}
      {error&&<p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
