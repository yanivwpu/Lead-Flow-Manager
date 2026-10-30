import { useQuery } from "@tanstack/react-query";

type DeliveryHealth = {
  latestAnalysis: null | { startedAt: string; status: string; evaluated: number; created: number; aiCalls: number; existingExcluded: number };
  published: { lastLiveAt: string | null; liveExecutions: number; failedExecutions: number; blockedExecutions: number };
};
async function loadDeliveryHealth(): Promise<DeliveryHealth> {
  const token = localStorage.getItem("whachat_admin_token");
  const response = await fetch("/api/admin/seo-intelligence/delivery-health", {
    credentials: "include",
    headers: token ? { "x-admin-token": token } : {},
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not load publishing status");
  return response.json();
}
export function SeoDeliveryHealthPanel() {
  const query = useQuery({queryKey:["seo-delivery-health"],queryFn:loadDeliveryHealth,staleTime:60_000});
  if (query.isLoading) return <div className="rounded-lg border bg-white p-3 text-xs text-gray-500">Checking SEO delivery…</div>;
  if (query.isError || !query.data) return <div className="rounded-lg border bg-white p-3 text-xs text-gray-600">SEO delivery status unavailable. The existing Search Console data remains separate.</div>;
  const d = query.data;
  const latest = d.latestAnalysis;
  const pending = (latest?.created ?? 0) === 0;
  return <section className="rounded-lg border bg-white p-3" aria-label="SEO delivery status">
    <div className="flex flex-wrap justify-between gap-2">
      <h3 className="text-sm font-semibold">SEO delivery · what actually shipped</h3>
      <span className="text-xs text-gray-500">Production publication history</span>
    </div>
    <div className="mt-2 grid gap-3 sm:grid-cols-3">
      <div><p className="text-xs text-gray-500">Last verified SEO publication</p><p className="text-sm font-medium">{d.published.lastLiveAt ? new Date(d.published.lastLiveAt).toLocaleDateString() : "None recorded"}</p></div>
      <div><p className="text-xs text-gray-500">Latest analysis · new actions</p><p className="text-sm font-medium">{latest ? latest.created : "No runs"}</p></div>
      <div><p className="text-xs text-gray-500">Latest analysis · AI generation calls</p><p className="text-sm font-medium">{latest ? latest.aiCalls : "No runs"}</p></div>
    </div>
    {latest && <p className="mt-2 text-xs text-gray-600">{latest.evaluated} opportunities evaluated · {latest.existingExcluded} existing open actions excluded · latest run {new Date(latest.startedAt).toLocaleString()}.</p>}
    {pending && <p className="mt-1 text-xs font-medium text-gray-700">No new work entered publication from the latest analysis. A successful sync or analysis does not mean content was published.</p>}
    <p className="mt-1 text-xs text-gray-500">Execution history: {d.published.liveExecutions} verified live, {d.published.blockedExecutions} blocked, {d.published.failedExecutions} failed. Historical failures are not necessarily active incidents.</p>
  </section>;
}
