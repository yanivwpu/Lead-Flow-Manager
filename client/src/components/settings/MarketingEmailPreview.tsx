import { useQuery } from "@tanstack/react-query";
export function MarketingEmailPreview({ itemId, revision }: { itemId: string; revision: string }) {
  const preview = useQuery({ staleTime: 0, refetchOnMount: "always", queryKey: ["marketing-preview", itemId, revision], queryFn: async () => {
    const response = await fetch(`/api/marketing/queue/${encodeURIComponent(itemId)}/preview`, { credentials: "include" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Preview unavailable");
    return data as { text: string; html: string; subject: string };
  }});
  if (preview.isPending || preview.isFetching) return <p role="status">Loading recipient preview…</p>;
  if (!preview.data || preview.isError) return <p role="alert">{preview.error?.message || "Recipient preview unavailable. Marketing remains blocked."}</p>;
  return <section className="space-y-3"><h3 className="font-semibold">Recipient email preview</h3><p>{preview.data.subject}</p><iframe title="HTML email including required footer" sandbox="" referrerPolicy="no-referrer" srcDoc={preview.data.html} className="w-full min-h-80 border rounded" /><details><summary>Plain text including required footer</summary><pre className="whitespace-pre-wrap break-words text-sm">{preview.data.text}</pre></details><p>Preview only. Marketing sending remains disabled.</p></section>;
}
