import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Day = {
  runDay: string; status: "needs_review" | "blocked"; actionId: string | null;
  actionVersion: number | null; currentVersion: number | null;
  targetPage: string | null; targetQuery: string | null;
  clicks: number; impressions: number; confidence: number | null; reason: string;
  actionStatus: string | null; staleAt: string | null;
  proposedContent: string | null; publicationStatus: string | null;
  prUrl: string | null; liveAt: string | null;
};
const url = "/api/admin/seo-intelligence/daily-shipping";

async function shippingApi(path: string, init?: RequestInit) {
  const token = localStorage.getItem("whachat_admin_token");
  const response = await fetch(path, {
    ...init, credentials: "include", cache: "no-store",
    headers: { ...(token ? { "x-admin-token": token } : {}), ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "SEO publishing request failed");
  return data;
}

export function SeoDailyShippingPanel() {
  const client = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [message, setMessage] = useState("");
  const history = useQuery<{ days: Day[] }>({
    queryKey: ["seo-daily-shipping"], queryFn: () => shippingApi(url),
    refetchInterval: 60_000, staleTime: 30_000,
  });
  const submit = useMutation({
    mutationFn: (day: string) => shippingApi(url + "/" + day + "/publish", { method: "POST" }),
    onSuccess: () => {
      setMessage("Publication requested. GitHub checks, deployment and live verification must still pass.");
      client.invalidateQueries({ queryKey: ["seo-daily-shipping"] });
      client.invalidateQueries({ queryKey: ["seo-delivery-health"] });
    },
  });
  const days = history.data?.days ?? [];
  const latest = days[0];
  const dayString = latest ? String(latest.runDay).slice(0, 10) : "";
  const canPublish = latest?.status === "needs_review" && !!latest.actionId &&
    Number(latest.actionVersion) === Number(latest.currentVersion) &&
    !latest.staleAt && ["proposed", "approved"].includes(latest.actionStatus || "") &&
    Boolean(latest.proposedContent) && !latest.liveAt &&
    !["pending", "running", "pr_created", "awaiting_checks", "deploying", "live"].includes(latest.publicationStatus || "");

  return <section className="rounded-xl border bg-white p-4" aria-label="Daily SEO publishing review">
    <div className="flex flex-wrap justify-between gap-2">
      <div>
        <h3 className="font-semibold">Daily SEO shipping queue</h3>
        <p className="text-xs text-gray-500">One evidence-backed proposal selected daily · owner review · GitHub CI → deployment → live verification</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => setExpanded(value => !value)}>{expanded ? "Hide queue" : "Show queue"}</Button>
    </div>
    {expanded && <div className="mt-3 space-y-3">
      {history.isLoading && <p className="text-sm">Loading recorded daily selections…</p>}
      {history.isError && <p className="text-sm text-red-600">{(history.error as Error).message}</p>}
      {!history.isLoading && !history.isError && days.length === 0 &&
        <p className="text-sm text-gray-600">No selection recorded yet. The background worker will record today's candidate or an explicit blocker.</p>}
      {message && <p role="status" className="text-sm text-gray-700">{message}</p>}
      {submit.isError && <p role="alert" className="text-sm text-red-600">{submit.error.message}</p>}
      {days.slice(0, 7).map((d, index) => {
        const isCurrent = index === 0;
        const date = String(d.runDay).slice(0, 10);
        return <article key={date} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">{date} · {d.liveAt ? "Verified live" : d.publicationStatus || d.status.replaceAll("_", " ")}</span>
            <span className="text-xs text-gray-500">{d.impressions} impressions · {d.clicks} clicks</span>
          </div>
          {d.targetPage && <a className="mt-1 block break-all text-xs text-blue-700 underline" href={d.targetPage} target="_blank" rel="noreferrer">{d.targetPage}</a>}
          {d.targetQuery && <p className="text-xs text-gray-600">Target query: {d.targetQuery}</p>}
          <p className="mt-1 text-xs text-gray-500">{d.reason}</p>
          {isCurrent && d.proposedContent && <details className="mt-3" open>
            <summary className="cursor-pointer text-sm font-medium">Review exact proposed website copy</summary>
            <div className="mt-2 whitespace-pre-wrap rounded-md border bg-gray-50 p-3 text-sm text-gray-700">{d.proposedContent}</div>
          </details>}
          {d.prUrl && <a className="mt-2 inline-block text-xs text-blue-700 underline" href={d.prUrl} target="_blank" rel="noreferrer">View GitHub PR</a>}
          {isCurrent && canPublish && <div className="mt-3">
            <Button size="sm" disabled={submit.isPending} onClick={() => {
              if (window.confirm("Have you reviewed the exact copy and verified all product and competitor claims? Approval requests automatic merge and production publication once every safety check passes."))
                submit.mutate(day);
            }}>{submit.isPending ? "Submitting…" : "Approve & request publishing"}</Button>
            <p className="mt-1 text-xs text-gray-500">Requires your explicit approval. No auto-publishing of unreviewed content.</p>
          </div>}
          {isCurrent && d.status === "needs_review" && !canPublish && !d.liveAt &&
            <p className="mt-2 text-xs text-gray-600">This selection is already in the publishing process or its saved version is no longer reviewable. Check the SEO Actions panel below.</p>}
        </article>;
      })}
    </div>}
  </section>;
}
