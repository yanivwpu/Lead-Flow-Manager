import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
type PrivacyStatus = {
  counts: Record<"pending" | "retrying" | "blocked" | "overdue" | "verified_complete", number>;
  outboundAlertsConfigured: boolean;
  alerts: Array<{ id: string; taskId: string; status: string; reason: string; deadlineAt: string; actionRequired: string }>;
};
export function AdminPrivacyOperationsTab({ enabled }: { enabled: boolean }) {
  const query = useQuery({ queryKey: ["admin-privacy-operations"], enabled, refetchInterval: 60000,
    queryFn: async (): Promise<PrivacyStatus> => {
      const token = localStorage.getItem("whachat_admin_token");
      const res = await fetch("/api/admin/privacy-operations", { credentials: "include", headers: token ? { "x-admin-token": token } : {} });
      if (!res.ok) throw new Error("Privacy status unavailable");
      return res.json();
    },
  });
  return <div className="space-y-4" data-testid="admin-privacy-operations">
    <div className="flex justify-between"><h2 className="font-semibold">Privacy operations</h2><Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>Refresh</Button></div>
    {query.isLoading && <p>Loading privacy status…</p>}
    {query.isError && <p role="alert">Privacy status unavailable. Retry or contact the privacy operator.</p>}
    {query.data && <>
      <dl className="flex flex-wrap gap-6">{Object.entries(query.data.counts).map(([key, value]) => <div key={key}><dt>{key === "verified_complete" ? "Verified complete" : key.charAt(0).toUpperCase()+key.slice(1)}</dt><dd className="text-2xl font-semibold">{value}</dd></div>)}</dl>
      {!query.data.outboundAlertsConfigured && <p role="alert">Outbound exception alerts need configuration. Pending alerts remain available here.</p>}
      <p className="text-sm">Access requests require verified support fulfilment. Erasure remains pending until every required check is verified.</p>
      <ul className="space-y-3">{query.data.alerts.map(alert => <li key={alert.id} className="border rounded p-3">
        <p>Request {alert.taskId} · {alert.status} · {alert.reason.replaceAll("_", " ")}</p>
        <p>Deadline: {new Date(alert.deadlineAt).toLocaleString()}</p><p>{alert.actionRequired}</p>
      </li>)}</ul>
    </>}
  </div>;
}
