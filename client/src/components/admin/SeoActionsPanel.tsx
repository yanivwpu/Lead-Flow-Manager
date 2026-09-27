import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TOKEN_KEY = "whachat_admin_token";
const request = async (url: string, init?: RequestInit) => {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(url, { ...init, credentials: "include", headers: { ...(token ? { "x-admin-token": token } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
};

type SeoAction = { id:string; target_page:string; query_cluster:string[]; action_type:string; status:string; risk:string; confidence:number; expected_benefit:string; priority_score:number; estimated_upside:number; opportunity_type:string; current_metrics:Record<string,number>; previous_metrics:Record<string,number>; competitors_analyzed:number; version_missing:boolean; refresh_active:boolean; refresh_expired:boolean; refresh_failure_category:string|null; evidence?:{competingPages?:Array<{page:string;urls:string[];current:Record<string,number>;previous:Record<string,number>}>;recommendedPrimaryPage?:string|null}; proposal:null|{ proposedTitle?:string; proposedMetaDescription?:string; proposedContent?:string; contentBrief?:string; explanation:string; insertionLocation:string; rollbackConcept:string }; created_at:string; updated_at:string };
type ActionResponse = { provider:{state:string}; actions:SeoAction[] };
type ActionTab = "review" | "approved" | "history";

const REVIEW_STATES = new Set(["detected", "researching", "proposed", "revision_required"]);
const HISTORY_STATES = new Set(["rejected", "executing", "measuring", "kept", "rolled_back", "failed"]);

export function actionTabForStatus(status: string): ActionTab {
  if (status === "approved") return "approved";
  if (HISTORY_STATES.has(status)) return "history";
  return REVIEW_STATES.has(status) ? "review" : "history";
}

export function SeoActionsPanel({ configured }: { configured: boolean }) {
  const client = useQueryClient();
  const [tab, setTab] = useState<ActionTab>("review");
  const [risk, setRisk] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState("");
  const actions = useQuery<ActionResponse>({ queryKey: ["/api/admin/seo-intelligence/actions"], queryFn: () => request("/api/admin/seo-intelligence/actions") });
  const analyze = useMutation({ mutationFn: () => request("/api/admin/seo-intelligence/actions/analyze", {method:"POST"}), onSuccess: () => client.invalidateQueries({queryKey:["/api/admin/seo-intelligence/actions"]}) });
  const decide = useMutation({ mutationFn: ({id,decision,reason}:{id:string;decision:string;reason?:string}) => request(`/api/admin/seo-intelligence/actions/${id}/${decision}`, {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reason})}), onSuccess:()=>client.invalidateQueries({queryKey:["/api/admin/seo-intelligence/actions"]}) });
  const all = actions.data?.actions ?? [];
  const counts = useMemo(() => ({ review: all.filter(a => actionTabForStatus(a.status) === "review").length, approved: all.filter(a => actionTabForStatus(a.status) === "approved").length, history: all.filter(a => actionTabForStatus(a.status) === "history").length }), [all]);
  const types = useMemo(() => [...new Set(all.map(a => a.action_type))].sort(), [all]);
  const visible = all.filter(a => actionTabForStatus(a.status) === tab && (risk === "all" || a.risk === risk) && (type === "all" || a.action_type === type) && (!page.trim() || a.target_page.toLowerCase().includes(page.trim().toLowerCase())));

  return <section className="bg-white border rounded-xl p-4 space-y-3" data-testid="seo-actions">
    <div className="flex flex-col sm:flex-row gap-3 justify-between"><div><h3 className="font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4"/>SEO Actions</h3><p className="text-xs text-gray-500">Approval records a reviewed recommendation for a future execution phase. It never publishes or modifies the website.</p></div><Button onClick={()=>analyze.mutate()} disabled={analyze.isPending||!configured}><Search className="h-4 w-4 mr-2"/>{analyze.isPending?"Analyzing…":"Analyze opportunities"}</Button></div>
    <Tabs value={tab} onValueChange={value => setTab(value as ActionTab)}><TabsList className="grid h-auto w-full grid-cols-3 sm:w-[480px]"><TabsTrigger value="review">Needs review ({counts.review})</TabsTrigger><TabsTrigger value="approved">Approved ({counts.approved})</TabsTrigger><TabsTrigger value="history">History ({counts.history})</TabsTrigger></TabsList></Tabs>
    <div className="grid gap-2 sm:grid-cols-3" aria-label="SEO action filters">
      <Select value={risk} onValueChange={setRisk}><SelectTrigger aria-label="Filter by risk"><SelectValue placeholder="All risks"/></SelectTrigger><SelectContent><SelectItem value="all">All risks</SelectItem><SelectItem value="low">Low risk</SelectItem><SelectItem value="medium">Medium risk</SelectItem><SelectItem value="high">High risk</SelectItem></SelectContent></Select>
      <Select value={type} onValueChange={setType}><SelectTrigger aria-label="Filter by action type"><SelectValue placeholder="All action types"/></SelectTrigger><SelectContent><SelectItem value="all">All action types</SelectItem>{types.map(value=><SelectItem key={value} value={value}>{value.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select>
      <Input value={page} onChange={event=>setPage(event.target.value)} placeholder="Filter by target page" aria-label="Filter by target page"/>
    </div>
    {actions.data?.provider.state === "not_configured" && <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-900">Automatic search-result discovery is not configured. Recommendations use Search Console evidence; configured manual competitor pages can be researched separately.</div>}
    {actions.isLoading && <p className="text-sm text-gray-500"><Loader2 className="inline h-4 w-4 animate-spin mr-2"/>Loading actions…</p>}
    {actions.isError && <p className="text-sm text-red-700">SEO actions are temporarily unavailable.</p>}
    {!actions.isLoading && visible.length === 0 && <p className="text-sm text-gray-500">No actions match this tab and its filters.</p>}
    {visible.map(a=><details key={a.id} className="border rounded-lg p-3"><summary className="cursor-pointer list-none"><div className="flex flex-wrap gap-2 items-center"><Badge>{a.status}</Badge><Badge variant="secondary">{a.action_type.replaceAll("_"," ")}</Badge><span className="text-xs text-gray-500">Search Console query{a.query_cluster.length===1?"":" cluster"}:</span><strong className="text-sm">{a.query_cluster.join(", ")}</strong><span className="ml-auto text-xs">Priority {Number(a.priority_score).toFixed(0)} · {Math.round(Number(a.confidence)*100)}% confidence · {a.risk} risk</span></div><p className="text-xs text-gray-500 truncate mt-1">{a.target_page}</p></summary><div className="mt-3 border-t pt-3 space-y-2 text-sm"><p>{a.proposal?.explanation ?? "Recommendation version unavailable; this action is quarantined and cannot be approved."}</p><div className="grid md:grid-cols-2 gap-3"><div className="bg-gray-50 rounded p-3"><strong>Current evidence</strong><pre className="text-xs whitespace-pre-wrap mt-1">{JSON.stringify(a.current_metrics,null,2)}</pre></div><div className="bg-blue-50 rounded p-3"><strong>Exact proposed change</strong><p className="mt-1">{a.proposal?.proposedTitle||a.proposal?.proposedMetaDescription||a.proposal?.proposedContent||a.proposal?.contentBrief||"No proposal content is available."}</p><p className="text-xs mt-2">Insert: {a.proposal?.insertionLocation ?? "Unavailable"}</p></div></div>{a.opportunity_type==="cannibalization"&&<div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs"><strong>Resolve page ownership first</strong><p>No canonical, redirect, merge, deletion, or indexing change is automatic.</p>{a.evidence?.competingPages?.map(item=><p key={item.page} className="mt-1">{item.page} · current {item.current.clicks} clicks / {item.current.impressions} impressions · previous {item.previous.clicks} clicks / {item.previous.impressions} impressions</p>)}<p className="mt-1">Possible primary: {a.evidence?.recommendedPrimaryPage??"Ambiguous — human decision required"}</p></div>}<p className="text-xs">Expected benefit: {a.expected_benefit} · Estimated upside: {a.estimated_upside} · Competitors analyzed: {a.competitors_analyzed}</p><p className="text-xs">Rollback: {a.proposal?.rollbackConcept ?? "No version available"}</p>{a.refresh_active&&<p className="text-xs text-blue-700">Refresh actively running; retry is available only after the lease expires.</p>}{a.refresh_expired&&<p className="text-xs text-amber-700">Refresh was interrupted and its lease expired. Retry will safely recover it.</p>}{a.refresh_failure_category&&a.status==="proposed"&&<p className="text-xs text-amber-700">Last refresh failed safely; the prior proposal remains usable and retryable.</p>}{(["proposed","revision_required"].includes(a.status)||a.refresh_expired)&&!a.version_missing&&<div className="flex gap-2">{a.status==="proposed"&&<><Button size="sm" onClick={()=>decide.mutate({id:a.id,decision:"approve"})}>Approve for future execution</Button><Button size="sm" variant="outline" onClick={()=>decide.mutate({id:a.id,decision:"reject",reason:"Rejected in admin review"})}>Reject</Button></>}<Button size="sm" variant="ghost" onClick={()=>decide.mutate({id:a.id,decision:"regenerate"})}>Refresh research</Button></div>}<p className="text-[11px] text-gray-500">Generated {new Date(a.created_at).toLocaleString()} · refreshed {new Date(a.updated_at).toLocaleString()}</p></div></details>)}
    {analyze.isError && <p className="text-sm text-red-700"><AlertCircle className="inline h-4 w-4 mr-1"/>{analyze.error.message}</p>}
  </section>;
}
