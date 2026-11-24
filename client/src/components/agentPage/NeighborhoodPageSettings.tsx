import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Copy, Eye, ImagePlus, Pencil, Trash2 } from "lucide-react";
import {
  neighborhoodTitle, neighborhoodContentComplete, neighborhoodPhotoMarker, NEIGHBORHOOD_GUIDE_MAX_PHOTOS, NEIGHBORHOOD_GUIDE_MAX_PHOTO_BYTES,
  type NeighborhoodContent, type NeighborhoodPhoto, type NeighborhoodPageSettings,
} from "@shared/agent/neighborhoodPages";
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
  const photoInput = useRef<HTMLInputElement>(null);
  const guideTextInput = useRef<HTMLTextAreaElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
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
  function editField(field: "name" | "city" | "state" | "content", value: string) {
    if (!active) return;
    updateDrafts((current) => {
      const prior = current.entries[active];
      const { name, city, state, content, photos } = prior?.values ?? values;
      const next = { name, city, state, content, photos: photos ?? [], [field]: value };
      const entries = { ...current.entries };
      if (sameNeighborhoodContent(next, page ?? EMPTY_NEIGHBORHOOD)) delete entries[active];
      else entries[active] = { values: next, baseVersion: prior?.baseVersion ?? page?.updatedAt ?? null };
      return { active, entries };
    });
  }

  function editPhotos(photos: NeighborhoodPhoto[]) {
    if (!active) return;
    updateDrafts((current) => {
      const previous = current.entries[active];
      const previousValues = previous?.values ?? values;
      const removed = (previousValues.photos ?? []).filter((oldPhoto) =>
        !photos.some((nextPhoto) => nextPhoto.url === oldPhoto.url));
      let content = previousValues.content;
      for (const oldPhoto of removed) {
        const marker = neighborhoodPhotoMarker(oldPhoto.url);
        if (marker) content = content.split(marker).join("");
      }
      if (removed.length) content = content.replace(/\n{3,}/g, "\n\n");
      const next = { ...previousValues, content, photos };
      const entries = { ...current.entries };
      if (sameNeighborhoodContent(next, page ?? EMPTY_NEIGHBORHOOD)) delete entries[active];
      else entries[active] = { values: next, baseVersion: previous?.baseVersion ?? page?.updatedAt ?? null };
      return { active, entries };
    });
  }


  function insertPhotoInArticle(photo: NeighborhoodPhoto) {
    const marker = neighborhoodPhotoMarker(photo.url);
    if (!marker || !active || values.content.includes(marker)) return;
    const cursor = guideTextInput.current;
    const start = cursor?.selectionStart ?? values.content.length;
    const end = cursor?.selectionEnd ?? start;
    const before = values.content.slice(0, start).trimEnd();
    const after = values.content.slice(end).trimStart();
    const updated = `${before}\n\n${marker}\n\n${after}`.trim();
    if (updated.length > 5000) {
      toast({ title: "Article is too long", description: "Shorten the guide before inserting this photo.", variant: "destructive" });
      return;
    }
    editField("content", updated);
    toast({ title: "Photo inserted", description: "Preview the guide to see it between your paragraphs." });
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file || !page || !active) return;
    if (file.size > NEIGHBORHOOD_GUIDE_MAX_PHOTO_BYTES) {
      toast({ title: "Photo must be under 5 MB", variant: "destructive" }); return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({ title: "Choose a JPG, PNG, or WebP photo", variant: "destructive" }); return;
    }
    if ((values.photos?.length ?? 0) >= NEIGHBORHOOD_GUIDE_MAX_PHOTOS) return;
    const editingId = active;
    setPhotoUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`${endpoint}/${encodeURIComponent(page.id)}/photos`, {
        method: "POST", body: form, credentials: "include",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.url !== "string") {
        throw new Error(result.error || "Photo upload failed.");
      }
      if (draftRef.current.active !== editingId) return;
      const current = draftRef.current.entries[editingId]?.values ?? values;
      editPhotos([...(current.photos ?? []), {
        url: result.url, alt: `Photo of ${current.name || "the neighborhood"} in ${current.city || "the local area"}`,
      }]);
      toast({ title: "Photo uploaded", description: "Save or update the page to publish this change." });
    } catch (error) {
      toast({ title: "Photo upload failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setPhotoUploading(false);
      if (photoInput.current) photoInput.current.value = "";
    }
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
  const photosValid = (values.photos ?? []).length <= NEIGHBORHOOD_GUIDE_MAX_PHOTOS &&
    (values.photos ?? []).every((photo) => photo.alt.trim().length >= 3);
  const canSave = Boolean(active && !stale && data && values.name.trim() && values.city.trim() && values.state.trim() && photosValid);
  const canPublish = Boolean(data?.canPublish && canSave && neighborhoodContentComplete(values.content));

  return (
    <section className="space-y-4 border-t border-gray-100 px-4 py-4 sm:px-6" aria-labelledby="neighborhood-pages-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="neighborhood-pages-heading" className="text-sm font-semibold">Neighborhood Pages</h3>
        <Button type="button" size="sm" variant="outline" disabled={!data || save.isPending}
          onClick={() => updateDrafts((current) => ({ ...current, active: NEW_NEIGHBORHOOD }))}>{drafts.entries[NEW_NEIGHBORHOOD] ? "Resume draft" : "+ Add"}</Button>
      </div>
      {isPending && <p className="text-sm text-muted-foreground">Loading neighborhood pages…</p>}
      {isError && <p role="alert" className="text-sm text-destructive">Unable to load neighborhood pages.</p>}
      {data?.pages.map((item) => (
        <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
          <div className="min-w-0">
            <p className="break-words text-sm font-medium">{neighborhoodTitle(item)}</p>
            <p className="text-xs text-muted-foreground">{item.publicUrl ? "Published" : item.published ? "Published · Agent Page offline" : "Draft"}{drafts.entries[item.id] ? " · Unsaved edits" : ""}</p>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label={`${neighborhoodTitle(item)} actions`}>
            <Button asChild type="button" size="icon" variant="ghost" className="h-9 w-9 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              <a href={item.publicUrl ?? `${endpoint}/${encodeURIComponent(item.id)}/preview`}
                 target="_blank" rel="noopener noreferrer"
                 aria-label={item.publicUrl ? "View live neighborhood page" : "Preview neighborhood draft"}
                 title={item.publicUrl ? "View live neighborhood page" : "Preview neighborhood draft"}>
                <Eye className="h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
            {item.publicUrl && <Button type="button" size="icon" variant="ghost"
              className="h-9 w-9 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Copy neighborhood page URL" title="Copy neighborhood page URL"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(item.publicUrl!);
                  toast({ title: "Link copied" });
                } catch {
                  toast({ title: "Could not copy the URL", description: item.publicUrl ?? undefined });
                }
              }}><Copy className="h-4 w-4" aria-hidden="true" /></Button>}
            <Button type="button" size="icon" variant="ghost"
              className="h-9 w-9 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              aria-label={`Edit ${neighborhoodTitle(item)}`} title="Edit neighborhood"
              disabled={save.isPending}
              onClick={() => updateDrafts((current) => ({ ...current, active: item.id }))}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="neighborhood-content">Your local guide</Label>
            <Button type="button" size="sm" variant="ghost" disabled={stale || save.isPending}
              onClick={() => editField("content", `${values.content.trimEnd()}\n\n## New section\n\n`)}>
              + Section heading
            </Button>
          </div>
          <Textarea ref={guideTextInput} id="neighborhood-content" rows={10} maxLength={5000} disabled={save.isPending} readOnly={stale}
            value={values.content} onChange={(event) => editField("content", event.target.value)} />
          <p className="text-xs text-muted-foreground">
            Write at least two distinct paragraphs with useful local information, totaling 240 characters or more.
            Add optional headings on their own lines, such as ## Parks &amp; Recreation, to organize your guide.\n            To place an uploaded photo between paragraphs, click in the article where you want it, then choose Insert in article below. Preview shows the photo in place.\n            Changing the neighborhood name can change its URL.
          </p>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h5 className="text-sm font-semibold text-slate-900">Local guide photos</h5>
                <p className="text-xs text-muted-foreground">The first photo becomes your cover. Add up to six images with useful descriptions.</p>
              </div>
              <Button type="button" size="sm" variant="outline" disabled={!page || stale || photoUploading || save.isPending ||
                (values.photos?.length ?? 0) >= NEIGHBORHOOD_GUIDE_MAX_PHOTOS}
                onClick={() => photoInput.current?.click()}>
                <ImagePlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {photoUploading ? "Uploading…" : "Add photos"}
              </Button>
              <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                aria-label="Upload neighborhood photo" disabled={photoUploading}
                onChange={(event) => void uploadPhoto(event.target.files?.[0])} />
            </div>
            {!page && <p className="text-xs text-slate-600">Save your neighborhood draft first to enable photo uploads.</p>}
            <p className="text-xs text-slate-600">JPG, PNG, or WebP · max 5 MB each. Only upload photos you own or have permission to use.
              Photos are publicly visible only after you save or update a published page.</p>
            {Boolean(values.photos?.length) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {(values.photos ?? []).map((photo, index) => (
                  <div key={photo.url} className="min-w-0 overflow-hidden rounded-lg border border-slate-200">
                    <img src={photo.url} alt={photo.alt} loading="lazy" className="h-36 w-full bg-slate-100 object-cover" />
                    <div className="space-y-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-700">{index === 0 ? "Cover image" : `Gallery photo ${index + 1}`}</span>
                        <div className="flex items-center gap-1">
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8"
                            aria-label={`Move photo ${index + 1} left`} title="Move earlier"
                            disabled={index === 0 || save.isPending || stale}
                            onClick={() => {
                              const photos = [...(values.photos ?? [])];
                              [photos[index - 1], photos[index]] = [photos[index], photos[index - 1]];
                              editPhotos(photos);
                            }}><ArrowLeft className="h-4 w-4" /></Button>
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8"
                            aria-label={`Move photo ${index + 1} right`} title="Move later"
                            disabled={index === (values.photos?.length ?? 0) - 1 || save.isPending || stale}
                            onClick={() => {
                              const photos = [...(values.photos ?? [])];
                              [photos[index + 1], photos[index]] = [photos[index], photos[index + 1]];
                              editPhotos(photos);
                            }}><ArrowRight className="h-4 w-4" /></Button>
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-600"
                            aria-label={`Remove photo ${index + 1}`} title="Remove photo"
                            disabled={save.isPending || stale}
                            onClick={() => editPhotos((values.photos ?? []).filter((_, i) => i !== index))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {index > 0 && (
                        <Button type="button" size="sm" variant="outline" className="w-full"
                          disabled={save.isPending || stale || values.content.includes(neighborhoodPhotoMarker(photo.url) ?? "")}
                          onClick={() => insertPhotoInArticle(photo)}>
                          <ImagePlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          {values.content.includes(neighborhoodPhotoMarker(photo.url) ?? "") ? "Placed in article" : "Insert in article"}
                        </Button>
                      )}
                      <Label htmlFor={`guide-photo-alt-${index}`}>Image description</Label>
                      <Input id={`guide-photo-alt-${index}`} value={photo.alt} maxLength={140}
                        disabled={save.isPending || stale}
                        onChange={(event) => editPhotos((values.photos ?? []).map((current, i) =>
                          i === index ? { ...current, alt: event.target.value } : current))} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {data && !data.canPublish && <p className="text-xs text-muted-foreground">Enable your public Agent Page before publishing.</p>}
          <div className="flex flex-wrap gap-2">
            {!page?.published && <Button type="button" size="sm" variant="outline" disabled={!dirty || !canSave || save.isPending || photoUploading}
              onClick={() => save.mutate({ page, values, published: false })}>Save draft</Button>}
            {page && !dirty && <Button asChild size="sm" variant="outline">
              <a href={`${endpoint}/${encodeURIComponent(page.id)}/preview`} target="_blank" rel="noopener noreferrer">Preview saved page</a>
            </Button>}
            {page && <Button type="button" size="sm" disabled={!canPublish || (page.published && !dirty) || save.isPending || photoUploading}
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
