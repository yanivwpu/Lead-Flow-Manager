import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

type SocialDraft = {
  id: string;
  channel: "linkedin" | "facebook" | "instagram";
  topic: string;
  targetKeyword: string;
  destinationUrl: string;
  body: string;
  suggestedDate: string;
  status: "needs_review" | "approved" | "rejected";
  version: number;
  approvedVersion: number | null;
};
type SocialResult = { items: SocialDraft[]; publicationEnabled: false; kind: "curated_starter_drafts" };
const endpoint = "/api/admin/seo-intelligence/social-drafts";

async function adminApi(path: string, init?: RequestInit) {
  const token = localStorage.getItem("whachat_admin_token");
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(token ? { "x-admin-token": token } : {}), ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Social draft request failed");
  return data;
}

export function SeoSocialContentPanel() {
  const client = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [channel, setChannel] = useState<"linkedin" | "facebook" | "instagram">("linkedin");
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [message, setMessage] = useState("");
  const drafts = useQuery<SocialResult>({
    queryKey: ["seo-social-drafts"], queryFn: () => adminApi(endpoint), enabled: expanded, retry: false, staleTime: 0,
  });
  const update = useMutation({
    mutationFn: (change: { id: string; expectedVersion: number; action: "edit" | "approve" | "reject"; body?: string }) =>
      adminApi(endpoint + "/" + change.id, { method: "PATCH", body: JSON.stringify(change) }),
    onSuccess: () => {
      setEditing(null);
      setMessage("Review saved. Nothing was posted to social media.");
      client.invalidateQueries({ queryKey: ["seo-social-drafts"] });
    },
  });
  const rows = drafts.data?.items ?? [];
  const filtered = rows.filter(item => item.channel === channel);
  const reviewed = rows.filter(item => item.status === "approved").length;

  return <section className="rounded-xl border bg-white p-4" aria-label="Social Content Intelligence">
    <div className="flex flex-wrap justify-between gap-3">
      <div>
        <h3 className="font-semibold">Social Content Intelligence</h3>
        <p className="text-xs text-gray-600">Seven-day starter inventory · editorial drafts for review · manual copy only</p>
        <p className="mt-1 text-xs text-gray-500">{rows.length} channel-specific drafts · {reviewed} approved · No automatic publishing or scheduling</p>
      </div>
      <Button type="button" variant="outline" onClick={() => setExpanded(value => !value)}>
        {expanded ? "Hide drafts" : "Review social drafts"}
      </Button>
    </div>
    {expanded && <div className="mt-4 space-y-3">
      <p className="text-xs text-gray-600">These are curated starting drafts, not AI-generated posts or proof that social is connected. Approval saves the exact version for manual use only. Editing cancels approval.</p>
      <div className="flex flex-wrap items-center gap-2">
        {(["linkedin","facebook","instagram"] as const).map(item =>
          <Button key={item} type="button" size="sm" variant={channel === item ? "default" : "outline"} onClick={() => setChannel(item)}>
            {item === "linkedin" ? "LinkedIn" : item === "facebook" ? "Facebook" : "Instagram"} ({rows.filter(row => row.channel === item).length})
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" onClick={() => drafts.refetch()}>Refresh</Button>
      </div>
      {drafts.isLoading && <p className="text-sm">Loading draft queue…</p>}
      {drafts.isError && <p className="text-sm text-red-600">{(drafts.error as Error).message}</p>}
      {update.isError && <p role="alert" className="text-sm text-red-600">{update.error.message}</p>}
      {message && <p role="status" className="text-xs text-gray-600">{message}</p>}
      {!drafts.isLoading && !drafts.isError && !filtered.length && <p className="text-sm text-gray-500">No drafts for this channel.</p>}
      {filtered.map(item => <article key={item.id} className="space-y-2 rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h4 className="font-medium text-sm">{item.topic}</h4><p className="text-xs text-gray-500">Suggested: {String(item.suggestedDate).slice(0,10)} · Keyword: {item.targetKeyword}</p></div>
          <span className="rounded bg-gray-100 px-2 py-1 text-xs">{item.status.replaceAll("_"," ")} · v{item.version}</span>
        </div>
        {editing === item.id
          ? <textarea aria-label={"Edit draft: " + item.topic} className="w-full rounded border p-2 text-sm" rows={8} value={editBody} onChange={event => setEditBody(event.target.value)} />
          : <p className="whitespace-pre-wrap text-sm text-gray-700">{item.body}</p>}
        <a className="text-xs text-blue-700 underline break-all" href={item.destinationUrl} target="_blank" rel="noreferrer">{item.destinationUrl}</a>
        <div className="flex flex-wrap gap-2">
          {editing === item.id ? <>
            <Button size="sm" disabled={update.isPending || editBody.trim().length < 60} onClick={() => update.mutate({id:item.id,expectedVersion:item.version,action:"edit",body:editBody})}>Save revision</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          </> : <>
            <Button size="sm" variant="outline" onClick={() => { setEditing(item.id); setEditBody(item.body); setMessage(""); }}>Edit</Button>
            <Button size="sm" variant="outline" onClick={async () => {
              try { await navigator.clipboard.writeText(item.body); setMessage("Draft copied. No social post was published."); }
              catch { setMessage("Copy failed. Select and copy the text manually."); }
            }}>Copy</Button>
            {item.status === "needs_review" && <>
              <Button size="sm" disabled={update.isPending} onClick={() => update.mutate({id:item.id,expectedVersion:item.version,action:"approve"})}>Approve for manual use</Button>
              <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({id:item.id,expectedVersion:item.version,action:"reject"})}>Reject</Button>
            </>}
          </>}
        </div>
      </article>)}
    </div>}
  </section>;
}
