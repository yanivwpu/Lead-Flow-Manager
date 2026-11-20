import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { neighborhoodTitle, neighborhoodContentComplete, type NeighborhoodContent, type NeighborhoodPageSettings } from "@shared/agent/neighborhoodPages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { toast } from "@/hooks/use-toast";
import { parseAgentPageApiError } from "@/lib/agentPageApi";

const endpoint = "/api/agent-page/neighborhoods";
const empty: NeighborhoodContent = { name: "", city: "", state: "", content: "" };
type Editor = { page?: NeighborhoodPageSettings; values: NeighborhoodContent };
type Manager = { canPublish: boolean; pages: NeighborhoodPageSettings[] };

export function NeighborhoodPageSettings({ publicPageUrl }: { publicPageUrl: string | null }) {
  const { user } = useAuth();
  return user ? <NeighborhoodManager key={user.id} userId={user.id} publicPageUrl={publicPageUrl} /> : null;
}

function NeighborhoodManager({ userId, publicPageUrl }: { userId: string; publicPageUrl: string | null }) {
  const client = useQueryClient();
  const [editor, setEditor] = useState<Editor | null>(null);
  const key = [endpoint, userId, publicPageUrl];
  const { data, isPending, isError } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Manager | null> => {
      const response = await fetch(endpoint, { credentials: "include" });
      if (response.status === 403) return null;
      if (!response.ok) throw new Error("Unable to load neighborhood pages.");
      return response.json();
    },
  });
  const save = useMutation({
    mutationFn: async (request: { page?: NeighborhoodPageSettings; values?: NeighborhoodContent; published?: boolean }) => {
      const url = request.page ? `${endpoint}/${encodeURIComponent(request.page.id)}` : endpoint;
      const method = !request.values ? "DELETE" : request.page ? "PUT" : "POST";
      const response = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: request.values ? JSON.stringify({ ...request.values, published: request.published }) : undefined,
      });
      const result = response.status === 204 ? null : await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(parseAgentPageApiError(result));
      return result as NeighborhoodPageSettings | null;
    },
    onSuccess: (page) => {
      client.setQueryData<Manager | null>(key, (current) => {
        if (!current) return current;
        const id = page?.id ?? editor?.page?.id;
        const pages = current.pages.filter((item) => item.id !== id);
        if (page) pages.push(page);
        return { ...current, pages: pages.sort((a, b) => a.name.localeCompare(b.name)) };
      });
      void client.invalidateQueries({ queryKey: [endpoint, userId] });
      setEditor(page ? { page, values: page } : null);
      toast({ title: page ? "Neighborhood page saved" : "Neighborhood page deleted" });
    },
    onError: (error: Error) => toast({ title: "Save failed", description: error.message, variant: "destructive" }),
  });

  if (data === null) return null;
  const page = editor?.page;
  const dirty = Boolean(editor && (!page || (Object.keys(empty) as Array<keyof NeighborhoodContent>)
    .some((field) => editor.values[field] !== page[field])));
  const canSave = Boolean(editor && editor.values.name.trim() && editor.values.city.trim() && editor.values.state.trim());
  const canPublish = Boolean(data?.canPublish && editor && canSave && neighborhoodContentComplete(editor.values.content));

  return (
    <section className="space-y-4 border-t border-gray-100 px-4 py-4 sm:px-6" aria-labelledby="neighborhood-pages-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="neighborhood-pages-heading" className="text-sm font-semibold">Neighborhood Pages</h3>
        <Button type="button" size="sm" variant="outline" disabled={!data || save.isPending}
          onClick={() => setEditor({ values: empty })}>Add Neighborhood</Button>
      </div>
      {isPending && <p className="text-sm text-muted-foreground">Loading neighborhood pages…</p>}
      {isError && <p role="alert" className="text-sm text-destructive">Unable to load neighborhood pages.</p>}
      {data?.pages.map((item) => (
        <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
          <div className="min-w-0">
            <p className="break-words text-sm font-medium">{neighborhoodTitle(item)}</p>
            <p className="text-xs text-muted-foreground">{item.publicUrl ? "Published" : item.published ? "Published · Agent Page offline" : "Draft"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={save.isPending}
              onClick={() => setEditor({ page: item, values: item })}>Edit</Button>
            {item.publicUrl && <Button type="button" size="sm" variant="outline" onClick={async () => {
              try {
                await navigator.clipboard.writeText(item.publicUrl!);
                toast({ title: "Link copied" });
              } catch {
                toast({ title: "Could not copy the URL", description: item.publicUrl ?? undefined });
              }
            }}>Copy URL</Button>}
          </div>
        </div>
      ))}
      {editor && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {([{ field: "name", label: "Neighborhood", max: 80 }, { field: "city", label: "City", max: 80 },
              { field: "state", label: "State", max: 60 }] as const).map(({ field, label, max }) => (
              <div key={field}>
                <Label htmlFor={`neighborhood-${field}`}>{label}</Label>
                <Input id={`neighborhood-${field}`} value={editor.values[field]} maxLength={max} disabled={save.isPending}
                  onChange={(event) => setEditor({ ...editor, values: { ...editor.values, [field]: event.target.value } })} />
              </div>
            ))}
          </div>
          <Label htmlFor="neighborhood-content">Local information</Label>
          <Textarea id="neighborhood-content" rows={8} maxLength={5000} disabled={save.isPending}
            value={editor.values.content} onChange={(event) => setEditor({ ...editor, values: { ...editor.values, content: event.target.value } })} />
          <p className="text-xs text-muted-foreground">
            Write at least two distinct paragraphs with useful local information, totaling 240 characters or more.
            Changing the neighborhood name can change its URL.
          </p>
          {data && !data.canPublish && <p className="text-xs text-muted-foreground">Enable your public Agent Page before publishing.</p>}
          <div className="flex flex-wrap gap-2">
            {!page?.published && <Button type="button" size="sm" variant="outline" disabled={!dirty || !canSave || save.isPending}
              onClick={() => save.mutate({ page, values: editor.values, published: false })}>Save draft</Button>}
            {page && !dirty && <Button asChild size="sm" variant="outline">
              <a href={`${endpoint}/${encodeURIComponent(page.id)}/preview`} target="_blank" rel="noopener noreferrer">Preview saved page</a>
            </Button>}
            {page && <Button type="button" size="sm" disabled={!canPublish || (page.published && !dirty) || save.isPending}
              onClick={() => save.mutate({ page, values: editor.values, published: true })}>{page.published ? "Update published page" : "Publish"}</Button>}
            {page?.published && <Button type="button" size="sm" variant="outline" disabled={save.isPending}
              onClick={() => save.mutate({ page, values: page, published: false })}>Unpublish</Button>}
            {page && <Button type="button" size="sm" variant="outline" disabled={save.isPending}
              onClick={() => { if (window.confirm(`Delete the neighborhood page for ${page.name}?`)) save.mutate({ page }); }}>Delete</Button>}
            <Button type="button" size="sm" variant="ghost" disabled={save.isPending} onClick={() => setEditor(null)}>Close</Button>
          </div>
        </div>
      )}
    </section>
  );
}
