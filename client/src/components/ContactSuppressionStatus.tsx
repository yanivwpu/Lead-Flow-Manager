import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
export function ContactSuppressionStatus({ contactId, identityRevision }: { contactId: string; identityRevision?: string }) {
  const queryClient = useQueryClient();
  const path = `/api/marketing/contacts/${encodeURIComponent(contactId)}`;
  const history = useQuery({ queryKey: [path, "suppression", identityRevision], queryFn: async () => {
    const response = await fetch(`${path}/suppression`, { credentials: "include" });
    if (!response.ok) throw new Error("Unable to load opt-out history");
    return response.json() as Promise<{ canSuppress?: boolean; history: Array<{ scope: string; reason: string; source: string; suppressed_at: string }> }>;
  }});
  const suppress = useMutation({ mutationFn: async () => {
    const response = await fetch(`${path}/dnc`, { method: "POST", credentials: "include" });
    if (!response.ok) throw new Error("Unable to save do-not-contact");
  }, onSuccess: () => queryClient.invalidateQueries() });
  return <section className="rounded-lg border p-4 space-y-2" aria-label="Marketing preferences">
    <h2 className="font-semibold">Marketing preferences</h2>
    {history.data?.history?.map((entry, i) => <div key={i}><strong className="text-red-700">{entry.scope === "all" ? "Do not contact" : "Email marketing suppressed"}</strong><p>{entry.reason} · {entry.source} · {new Date(entry.suppressed_at).toLocaleString()}</p></div>)}
    {history.data?.history?.some(entry => entry.scope === "all") ? <p>Promotional outreach is stopped. Reimporting does not re-enable contact.</p> : <Button variant="outline" disabled={!history.data?.canSuppress || suppress.isPending || history.isPending || history.isError} onClick={() => { if (window.confirm("Set permanent do not contact across channels? This cancels queued outreach, workflows and campaign enrollments and cannot be undone here.")) suppress.mutate(); }}>Set do not contact across channels</Button>}
    {history.data && !history.data.canSuppress && <p>Add a valid email or international phone number before setting do not contact.</p>}
    {(history.isError || suppress.isError) && <p role="alert">{suppress.error?.message || history.error?.message}</p>}
  </section>;
}
