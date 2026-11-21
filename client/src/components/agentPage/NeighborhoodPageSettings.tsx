import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { neighborhoodTitle, neighborhoodContentComplete, type NeighborhoodContent, type NeighborhoodPageSettings } from "@shared/agent/neighborhoodPages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { toast } from "@/hooks/use-toast";
import { parseAgentPageApiError } from "@/lib/agentPageApi";
import {
  EMPTY_NEIGHBORHOOD, NEW_NEIGHBORHOOD, neighborhoodDraftKey, readNeighborhoodDrafts,
  sameNeighborhoodContent, writeNeighborhoodDrafts, type NeighborhoodDrafts,
} from "@/lib/neighborhoodDrafts";

const endpoint = "/api/agent-page/neighborhoods";
function browserDraftStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}
type Manager = { canPublish: boolean; pages: NeighborhoodPageSettings[] };

export function NeighborhoodPageSettings({ publicPageUrl }: { publicPageUrl: string | null }) {
  const { user } = useAuth();
  return user ? <NeighborhoodManager key={user.id} userId={user.id} publicPageUrl={publicPageUrl} /> : null;
}

function NeighborhoodManager({ userId, publicPageUrl }: { userId: string; publicPageUrl: string | null }) {
  const client = useQueryClient();
  const storageKey = neighborhoodDraftKey(userId);
  const [drafts, setDrafts] = useState<NeighborhoodDrafts>(() => {
    const storage = browserDraftStorage();
    return storage ? readNeighborhoodDrafts(storage, storageKey) : { active: null, entries: {} };
  });
  const draftRef = useRef(drafts);
  const storageAvailable = useRef(Boolean(browserDraftStorage()));
  function updateDrafts(update: (state: NeighborhoodDrafts) => NeighborhoodDrafts) {
    const storage = browserDraftStorage();
    const latest = storage && storageAvailable.current ? readNeighborhoodDrafts(storage, storageKey) : draftRef.current;
    const next = update({ ...latest, active: draftRef.current.active });
    storageAvailable.current = Boolean(storage && writeNeighborhoodDrafts(storage, storageKey, next));
    draftRef.current = next;
    setDrafts(next);
  }
  useEffect(() => {
    function syncDrafts(event: StorageEvent) {
      const storage = browserDraftStorage();
      if (!storage || !storageAvailable.current || (event.key !== storageKey && event.key !== null)) return;
      const next = { ...readNeighborhoodDrafts(storage, storageKey), active: draftRef.current.active };
      draftRef.current = next;
      setDrafts(next);
    }
    window.addEventListener("storage", syncDrafts);
    return () => window.removeEventListener("storage", syncDrafts);
  }, [storageKey]);
  const key = [endpoint, userId, publicPageUrl];
  const { data, isPending, isError } = useQuery({
    queryKey: key,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Manager | null> => {
      const response = await fetch(endpoint, { credentials: "include" });
      if (response.status === 403) return null;
      if (!response.ok) throw new Error("Unable to load neighborhood pages.");
      return response.json();
    },
  });
  const active = drafts.active;
  const page = data?.pages.find((item) => item.id === active);
  const draft = active ? drafts.entries[active] : undefined;
  const stale = Boolean(active && active !== NEW_NEIGHBORHOOD && (!page || (draft && draft.baseVersion !== page.updatedAt)));
  const values = draft?.values ?? page ?? EMPTY_NEIGHBORHOOD;
  const dirty = Boolean(draft);
  function editField(field: keyof NeighborhoodContent, value: string) {
    if (!active) return;
    updateDrafts((current) => {
      const prior = current.entries[active];
      const { name, city, state, content } = prior?.values ?? values;
      const next = { name, city, state, content, [field]: value };
      const entries = { ...current.entries };
      if (sameNeighborhoodContent(next, page ?? EMPTY_NEIGHBORHOOD)) delete entries[active];
      else entries[active] = { values: next, baseVersion: prior?.baseVersion ?? page?.updatedAt ?? null };
      return { active, entries };
    });
  }

  const save = useMutation({
    mutationFn: async (request: { page?: NeighborhoodPageSettings; values?: NeighborhoodContent; published?: boolean; preserveDraft?: boolean }) => {
      const url = request.page ? `${endpoint}/${encodeURIComponent(request.page.id)}` : endpoint;
      const method = !request.values ? "DELETE" : request.page ? "PUT" : "POST";
      const destination = method === "DELETE" && request.page
        ? `${url}?expectedUpdatedAt=${encodeURIComponent(request.page.updatedAt)}` : url;
      const response = await fetch(destination, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: request.values ? JSON.stringify({ ...request.values, published: request.published, expectedUpdatedAt: request.page?.updatedAt }) : undefined,
      });
      const result = response.status === 204 ? null : await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(parseAgentPageApiError(result));
      return result as NeighborhoodPageSettings | null;
    },
    onSuccess: (page, request) => {
      client.setQueryData<Manager | null>(key, (current) => {
        if (!current) return current;
        const id = page?.id ?? request.page?.id;
        const pages = current.pages.filter((item) => item.id !== id);
        if (page) pages.push(page);
        return { ...current, pages: pages.sort((a, b) => a.name.localeCompare(b.name)) };
      });
      void client.invalidateQueries({ queryKey: [endpoint, userId] });
      updateDrafts((current) => {
        const identity = request.page?.id ?? NEW_NEIGHBORHOOD;
        const entries = { ...current.entries };
        const pending = entries[identity];
        if (!page || (pending && request.values && sameNeighborhoodContent(request.values, pending.values))) {
          delete entries[identity];
        } else if (request.preserveDraft && pending?.baseVersion === request.page?.updatedAt && pending) {
          entries[identity] = { ...pending, baseVersion: page.updatedAt };
        }
        return { active: page?.id ?? null, entries };
      });
      toast({ title: page ? "Neighborhood page saved" : "Neighborhood page deleted" });
    },
    onError: (error: Error) => {
      void client.invalidateQueries({ queryKey: [endpoint, userId] });
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    },
  });

  if (data === null) return null;
  const canSave = Boolean(active && !stale && data && values.name.trim() && values.city.trim() && values.state.trim());
  const canPublish = Boolean(data?.canPublish && canSave && neighborhoodContentComplete(values.content));

  return (
    <section className="space-y-4 border-t border-gray-100 px-4 py-4 sm:px-6" aria-labelledby="neighborhood-pages-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="neighborhood-pages-heading" className="text-sm font-semibold">Neighborhood Pages</h3>
        <Button type="button" size="sm" variant="outline" disabled={!data || save.isPending}
          onClick={() => updateDrafts((current) => ({ ...current, active: NEW_NEIGHBORHOOD }))}>{drafts.entries[NEW_NEIGHBORHOOD] ? "Resume new neighborhood" : "Add Neighborhood"}</Button>
      </div>
      {isPending && <p className="text-sm text-muted-foreground">Loading neighborhood pages…</p>}
      {isError && <p role="alert" className="text-sm text-destructive">Unable to load neighborhood pages.</p>}
      {data?.pages.map((item) => (
        <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
          <div className="min-w-0">
            <p className="break-words text-sm font-medium">{neighborhoodTitle(item)}</p>
            <p className="text-xs text-muted-foreground">{item.publicUrl ? "Published" : item.published ? "Published · Agent Page offline" : "Draft"}{drafts.entries[item.id] ? " · Unsaved edits" : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {item.publicUrl ? (
              <Button asChild type="button" size="sm" variant="outline">
                <a href={item.publicUrl} target="_blank" rel="noopener noreferrer">View live</a>
              </Button>
            ) : (
              <Button asChild type="button" size="sm" variant="outline">
                <a href={`${endpoint}/${encodeURIComponent(item.id)}/preview`} target="_blank" rel="noopener noreferrer">Preview</a>
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" disabled={save.isPending}
              onClick={() => updateDrafts((current) => ({ ...current, active: item.id }))}>Edit</Button>
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
      {active && data && (
        <div className="space-y-4 rounded-lg bg-slate-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{active === NEW_NEIGHBORHOOD ? "New neighborhood" : "Edit neighborhood"}</h4>
            {dirty && <span role="status" className="text-sm text-slate-700">
              {storageAvailable.current ? "Draft preserved on this browser" : "Unsaved changes"}
            </span>}
          </div>
          {stale && <p role="alert" className="text-sm text-amber-900">
            This page changed or was deleted elsewhere. Copy any text you want to keep, then discard these edits to return to the latest saved version.
          </p>}
          <div className="grid gap-3 sm:grid-cols-3">
            {([{ field: "name", label: "Neighborhood", max: 80 }, { field: "city", label: "City", max: 80 },
              { field: "state", label: "State", max: 60 }] as const).map(({ field, label, max }) => (
              <div key={field}>
                <Label htmlFor={`neighborhood-${field}`}>{label}</Label>
                <Input id={`neighborhood-${field}`} value={values[field]} maxLength={max} disabled={save.isPending} readOnly={stale}
                  onChange={(event) => editField(field, event.target.value)} />
              </div>
            ))}
          </div>
          <Label htmlFor="neighborhood-content">Local information</Label>
          <Textarea id="neighborhood-content" rows={10} maxLength={5000} disabled={save.isPending} readOnly={stale}
            value={values.content} onChange={(event) => editField("content", event.target.value)} />
          <p className="text-xs text-muted-foreground">
            Write at least two distinct paragraphs with useful local information, totaling 240 characters or more.
            Changing the neighborhood name can change its URL.
          </p>
          {data && !data.canPublish && <p className="text-xs text-muted-foreground">Enable your public Agent Page before publishing.</p>}
          <div className="flex flex-wrap gap-2">
            {!page?.published && <Button type="button" size="sm" variant="outline" disabled={!dirty || !canSave || save.isPending}
              onClick={() => save.mutate({ page, values, published: false })}>Save draft</Button>}
            {page && !dirty && <Button asChild size="sm" variant="outline">
              <a href={`${endpoint}/${encodeURIComponent(page.id)}/preview`} target="_blank" rel="noopener noreferrer">Preview saved page</a>
            </Button>}
            {page && <Button type="button" size="sm" disabled={!canPublish || (page.published && !dirty) || save.isPending}
              onClick={() => save.mutate({ page, values, published: true })}>{page.published ? "Update published page" : "Publish"}</Button>}
            {page?.published && <Button type="button" size="sm" variant="outline" disabled={save.isPending || stale}
              onClick={() => save.mutate({ page, values: page, published: false, preserveDraft: true })}>Unpublish</Button>}
            {page && <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={save.isPending || stale}
              onClick={() => { if (window.confirm(`Delete the neighborhood page for ${page.name}?`)) save.mutate({ page }); }}>Delete</Button>}
            <Button type="button" size="sm" variant="ghost" disabled={save.isPending} onClick={() => updateDrafts((current) => ({ ...current, active: null }))}>Close</Button>
            {dirty && <Button type="button" size="sm" variant="ghost" disabled={save.isPending} onClick={() => {
              if (!window.confirm("Discard your unsaved changes?")) return;
              updateDrafts((current) => {
                const entries = { ...current.entries };
                delete entries[active];
                return { active: page ? active : null, entries };
              });
            }}>Discard changes</Button>}
          </div>
        </div>
      )}
    </section>
  );
}
