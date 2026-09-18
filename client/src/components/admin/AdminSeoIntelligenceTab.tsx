import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { averagePositionImprovementPercent, formatSeoPercent } from "@shared/seoMetrics";

const TOKEN_KEY = "whachat_admin_token";
const request = async (url: string, init?: RequestInit) => {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(url, { ...init, credentials: "include", headers: { ...(token ? { "x-admin-token": token } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
};
type Dashboard = { config: { configured: boolean; missing: string[] }; lastSuccessfulSync: string | null; period: { clicks:number; impressions:number; ctr:number; position:number|null; previous:{clicks:number;impressions:number;ctr:number;position:number|null} }; topQueries:Array<{name:string;clicks:number;impressions:number}>; topPages:Array<{name:string;clicks:number;impressions:number}>; opportunities:Array<{type:string;priority:number;query:string;page?:string;evidence:Record<string,number|string>}> };
const delta = (value:number, old:number) => old ? `${((value-old)/old*100).toFixed(1)}%` : "—";

export function AdminSeoIntelligenceTab({ enabled }: { enabled: boolean }) {
  const client = useQueryClient();
  const query = useQuery<Dashboard>({ queryKey: ["/api/admin/seo-intelligence"], queryFn: () => request("/api/admin/seo-intelligence"), enabled });
  const sync = useMutation({ mutationFn: () => request("/api/admin/seo-intelligence/sync", { method: "POST" }), onSuccess: () => client.invalidateQueries({ queryKey: ["/api/admin/seo-intelligence"] }) });
  if (query.isLoading) return <div className="p-8 flex gap-2"><Loader2 className="animate-spin" /> Loading SEO intelligence…</div>;
  if (query.isError || !query.data) return <div className="p-6 text-red-700"><AlertCircle className="inline mr-2" />{query.error?.message || "Unable to load"}</div>;
  const d = query.data;
  return <div className="space-y-5" data-testid="seo-intelligence">
    <div className="bg-white border rounded-xl p-5 flex flex-col sm:flex-row justify-between gap-4">
      <div><h2 className="text-lg font-semibold flex items-center gap-2"><Search className="h-5 w-5" />SEO Intelligence</h2><p className="text-sm text-gray-500">Read-only Google Search Console monitoring</p><p className="text-sm mt-2">Last successful sync: <strong>{d.lastSuccessfulSync ? new Date(d.lastSuccessfulSync).toLocaleString() : "Never"}</strong></p></div>
      <Button onClick={() => sync.mutate()} disabled={sync.isPending || !d.config.configured}><RefreshCw className={`h-4 w-4 mr-2 ${sync.isPending ? "animate-spin" : ""}`} />{sync.isPending ? "Syncing…" : "Sync now"}</Button>
    </div>
    {!d.config.configured && <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 text-amber-900"><AlertCircle className="inline h-4 w-4 mr-2" />Configuration missing: {d.config.missing.join(", ")}</div>}
    {sync.isSuccess && sync.data.status === "success" && <div className="text-emerald-700"><CheckCircle2 className="inline h-4 w-4 mr-2" />Synchronization completed.</div>}
    {sync.isSuccess && sync.data.status === "partial" && <div className="text-amber-700"><AlertCircle className="inline h-4 w-4 mr-2" />Synchronization was truncated: {sync.data.diagnostic}</div>}
    {sync.isError && <div className="text-red-700"><AlertCircle className="inline h-4 w-4 mr-2" />{sync.error.message}</div>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[["Clicks",d.period.clicks,delta(d.period.clicks,d.period.previous.clicks)],["Impressions",d.period.impressions,delta(d.period.impressions,d.period.previous.impressions)],["CTR",`${(d.period.ctr*100).toFixed(2)}%`,delta(d.period.ctr,d.period.previous.ctr)],["Avg. position",d.period.position === null ? "—" : d.period.position.toFixed(1),formatSeoPercent(averagePositionImprovementPercent(d.period.position,d.period.previous.position))]].map(([label,value,change])=><div className="bg-white border rounded-xl p-4" key={String(label)}><p className="text-xs text-gray-500">{label} · 28 days</p><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-gray-500">vs previous: {change}</p></div>)}</div>
    <div className="grid lg:grid-cols-2 gap-4">{[["Top queries (reported queries)",d.topQueries],["Top pages by reported query",d.topPages]].map(([title, rows])=><div className="bg-white border rounded-xl p-4" key={String(title)}><h3 className="font-semibold mb-1">{title as string}</h3><p className="text-xs text-gray-500 mb-3">Detailed query reports exclude anonymized queries; aggregate cards above include them.</p>{(rows as Dashboard["topQueries"]).map(r=><div className="flex justify-between gap-3 py-2 border-t text-sm" key={r.name}><span className="truncate">{r.name}</span><span className="whitespace-nowrap">{r.clicks} clicks · {r.impressions} imp.</span></div>)}</div>)}</div>
    <div className="bg-white border rounded-xl p-4"><h3 className="font-semibold mb-3">Prioritized opportunities</h3>{d.opportunities.length === 0 && <p className="text-sm text-gray-500">No opportunities detected in the current period.</p>}{d.opportunities.map((o,i)=><div className="py-3 border-t" key={`${o.type}-${o.query}-${i}`}><div className="flex gap-2 items-center"><Badge variant="secondary">{o.type.replaceAll("_"," ")}</Badge><strong className="text-sm">{o.query}</strong><span className="ml-auto text-xs">Priority {o.priority}</span></div>{o.page && <p className="text-xs text-gray-500 truncate mt-1">{o.page}</p>}<p className="text-xs text-gray-600 mt-1">{Object.entries(o.evidence).map(([k,v])=>`${k}: ${typeof v === "number" ? Number(v.toFixed(3)) : v}`).join(" · ")}</p></div>)}</div>
  </div>;
}
