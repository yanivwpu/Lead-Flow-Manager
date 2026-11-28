import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Copy, Eye, ImagePlus, Pencil, Trash2 } from "lucide-react";
import {
  neighborhoodTitle, neighborhoodContentComplete, NEIGHBORHOOD_GUIDE_MAX_PHOTOS, NEIGHBORHOOD_GUIDE_MAX_PHOTO_BYTES,
  type NeighborhoodContent, type NeighborhoodPhoto, type NeighborhoodPageSettings,
} from "@shared/agent/neighborhoodPages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NeighborhoodGuideVisualEditor, type ArticlePhotoPlacement } from "./NeighborhoodGuideVisualEditor";
import { NeighborhoodBoundaryEditor } from "./NeighborhoodBoundaryEditor";
import type { PolygonBoundary } from "@shared/agent/neighborhoodListingGeo";
import { neighborhoodGuidePhotoId, neighborhoodPhotoToken, parseNeighborhoodPhotoMarker, removeNeighborhoodPhotoFromArticle } from "@shared/agent/neighborhoodGuideBlocks";

import { useAuth } from "@/lib/auth-context";
import { toast } from "@/hooks/use-toast";
import { neighborhoodApiErrorKey } from "@/lib/agentPageApi";
import {
  EMPTY_NEIGHBORHOOD, NEW_NEIGHBORHOOD, neighborhoodDraftKey, readNeighborhoodDrafts,
  mergeNeighborhoodDraftsPreservingActive, sameNeighborhoodContent, writeNeighborhoodDrafts, type NeighborhoodDrafts,
} from "@/lib/neighborhoodDrafts";
import { clearNeighborhoodMapSession, neighborhoodMapSessionKey, readNeighborhoodMapSession, writeNeighborhoodMapSession } from "@/lib/neighborhoodMapSession";

const defaultCountryCode = "US";
const endpoint = "/api/agent-page/neighborhoods";
function browserDraftStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}
type Manager = { canPublish: boolean; pages: NeighborhoodPageSettings[] };

function placeArticlePhoto(placement: ArticlePhotoPlacement, photoId: string): string {
  const sections = placement.content.trim() ? placement.content.trim().split(/\n\s*\n/) : [];
  if (sections.some(section => parseNeighborhoodPhotoMarker(section)?.id === photoId)) return placement.content;
  sections.splice(placement.sectionIndex, 0, neighborhoodPhotoToken(photoId));
  return sections.join("\n\n");
}

export function NeighborhoodPageSettings({ publicPageUrl }: { publicPageUrl: string | null }) {
  const { user } = useAuth();
  return user ? <NeighborhoodManager key={user.id} userId={user.id} publicPageUrl={publicPageUrl} /> : null;
}

function NeighborhoodManager({ userId, publicPageUrl }: { userId: string; publicPageUrl: string | null }) {
  const client = useQueryClient();
  const { t } = useTranslation();
  const storageKey = neighborhoodDraftKey(userId);
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [offerUploadDraft, setOfferUploadDraft] = useState(false);
  const [uploadedInlinePhoto, setUploadedInlinePhoto] = useState<{ pageId: string; photoId: string }>();
  const photoUploadInProgress = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [mapEditorRevision, setMapEditorRevision] = useState(0);
  const [drafts, setDrafts] = useState<NeighborhoodDrafts>(() => {
    const storage = browserDraftStorage();
    return storage ? readNeighborhoodDrafts(storage, storageKey) : { active: null, entries: {} };
  });
  const draftRef = useRef(drafts);
  const storageAvailable = useRef(Boolean(browserDraftStorage()));
  function updateDrafts(update: (state: NeighborhoodDrafts) => NeighborhoodDrafts) {
    const storage = browserDraftStorage();
    const latest = storage && storageAvailable.current ? readNeighborhoodDrafts(storage, storageKey) : draftRef.current;
    const next = update(mounted.current ? mergeNeighborhoodDraftsPreservingActive(latest, draftRef.current) : latest);
    storageAvailable.current = Boolean(storage && writeNeighborhoodDrafts(storage, storageKey, next));
    draftRef.current = next;
    if (mounted.current) setDrafts(next);
  }
  useEffect(() => {
    function syncDrafts(event: StorageEvent) {
      const storage = browserDraftStorage();
      if (!storage || !storageAvailable.current || (event.key !== storageKey && event.key !== null)) return;
      const next = mergeNeighborhoodDraftsPreservingActive(
        readNeighborhoodDrafts(storage, storageKey), draftRef.current);
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
      if (!response.ok) throw new Error(t("rgeNeighborhood.loadFailed"));
      return response.json();
    },
  });
  const active = drafts.active;
  const page = data?.pages.find((item) => item.id === active);
  const draft = active ? drafts.entries[active] : undefined;
  const stale = Boolean(active && active !== NEW_NEIGHBORHOOD && (!page || (draft && draft.baseVersion !== page.updatedAt)));
  const values = draft?.values ?? page ?? EMPTY_NEIGHBORHOOD;
  const dirty = Boolean(draft);
  function editField(field: "name" | "city" | "state" | "country" | "content" | "publicLanguage", value: string) {
    if (!active) return;
    updateDrafts((current) => {
      const prior = current.entries[active];
      const { name, city, state, country, publicLanguage, customBoundary, content, photos } = prior?.values ?? values;
      const next = { name, city, state, publicLanguage, country: country ?? "US", customBoundary: customBoundary ?? null,
        content, photos: photos ?? [], [field]: value };
      const entries = { ...current.entries };
      if (sameNeighborhoodContent(next, page ?? EMPTY_NEIGHBORHOOD)) delete entries[active];
      else entries[active] = { values: next, baseVersion: prior?.baseVersion ?? page?.updatedAt ?? null };
      return { active, entries };
    });
  }

  function editBoundary(customBoundary: PolygonBoundary | null) {
    if (!active) return;
    updateDrafts((current) => {
      const previous = current.entries[active];
      const next = { ...(previous?.values ?? values), customBoundary };
      const entries = { ...current.entries };
      if (sameNeighborhoodContent(next, page ?? EMPTY_NEIGHBORHOOD)) delete entries[active];
      else entries[active] = { values: next, baseVersion: previous?.baseVersion ?? page?.updatedAt ?? null };
      return { active, entries };
    });
  }

  function editPhotos(
    change: NeighborhoodPhoto[] | ((photos: NeighborhoodPhoto[]) => NeighborhoodPhoto[]),
    targetPage = page,
    updateArticle?: (content: string) => string,
  ) {
    const editingId = targetPage?.id ?? active;
    if (!editingId) return;
    updateDrafts((current) => {
      const previous = current.entries[editingId];
      const previousValues = previous?.values ?? targetPage ?? values;
      const photos = typeof change === "function" ? change(previousValues.photos ?? []) : change;
      const removed = (previousValues.photos ?? []).filter((oldPhoto) =>
        !photos.some((nextPhoto) => nextPhoto.url === oldPhoto.url));
      let content = updateArticle ? updateArticle(previousValues.content) : previousValues.content;
      for (const oldPhoto of removed) content = removeNeighborhoodPhotoFromArticle(content, oldPhoto.url);
      const next = { ...previousValues, content, photos };
      const entries = { ...current.entries };
      if (sameNeighborhoodContent(next, targetPage ?? EMPTY_NEIGHBORHOOD)) delete entries[editingId];
      else entries[editingId] = { values: next, baseVersion: previous?.baseVersion ?? targetPage?.updatedAt ?? null };
      return { ...current, entries };
    });
  }

  async function uploadPhoto(
    file: File | undefined,
    { createDraft, placement }: { createDraft?: boolean; placement?: ArticlePhotoPlacement } = {},
  ): Promise<void> {
    if (!file || !active || stale || save.isPending || photoUploadInProgress.current) return;
    if (!page && (!(createDraft || placement) || !canCreateUploadDraft)) return;
    if (placement && placeArticlePhoto(placement, "00000000-0000-0000-0000-000000000000").length > 5000) {
      toast({ title: t("rgeNeighborhoodUpload.inlineTooLong"), variant: "destructive" });
      return;
    }
    if (file.size > NEIGHBORHOOD_GUIDE_MAX_PHOTO_BYTES) {
      toast({ title: t("rgeNeighborhood.photoSize"), variant: "destructive" }); return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({ title: t("rgeNeighborhood.photoFormat"), variant: "destructive" }); return;
    }
    if ((values.photos?.length ?? 0) >= NEIGHBORHOOD_GUIDE_MAX_PHOTOS) return;
    photoUploadInProgress.current = true;
    setPhotoUploading(true);
    try {
      let target = page;
      if (!target) {
        try {
          target = await save.mutateAsync({ values, published: false, preserveMapSession: true }) ?? undefined;
        } catch {
          // The existing save mutation shows the error and retains the local draft.
          return;
        }
        if (!target || !mounted.current) return;
        setOfferUploadDraft(false);
      }
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`${endpoint}/${encodeURIComponent(target.id)}/photos`, {
        method: "POST", body: form, credentials: "include",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.url !== "string") {
        throw new Error(neighborhoodApiErrorKey(result) ?? "rgeNeighborhood.photoFailed");
      }
      const current = draftRef.current.entries[target.id]?.values ?? target;
      const photo: NeighborhoodPhoto = {
        url: result.url, alt: `Photo of ${current.name} in ${current.city}`.slice(0, 140),
      };
      const photoId = placement ? neighborhoodGuidePhotoId(photo.url) : null;
      let inserted = false;
      editPhotos((photos) => photos.some(item => item.url === photo.url) ? photos : [...photos, photo],
        target, placement && photoId ? (content) => {
          if (content.trim() !== placement.content.trim()) return content;
          inserted = true;
          return placeArticlePhoto(placement, photoId);
        } : undefined);
      if (inserted && photoId && mounted.current) {
        setUploadedInlinePhoto({ pageId: target.id, photoId });
      } else if (placement) {
        toast({ title: t("rgeNeighborhoodUpload.inlineLibraryOnly"), variant: "destructive" });
      }
      if (!page && mounted.current) {
        // Link the first upload to the newly created draft. Keep the browser
        // draft (including the photo) available for Save if that write fails.
        const draftWithPhoto = draftRef.current.entries[target.id]?.values;
        if (draftWithPhoto) {
          try {
            await save.mutateAsync({ page: target, values: draftWithPhoto, published: false });
          } catch {
            // The save mutation reports the failure and keeps the local edit.
          }
          return;
        }
      }
      if (!placement || inserted) {
        toast({ title: placement ? t("rgeNeighborhoodUpload.inlineInserted") : t("rgeNeighborhood.photoUploaded"),
          description: t("rgeNeighborhoodUpload.keepPhoto") });
      }
    } catch (error) {
      toast({ title: t("rgeNeighborhood.photoFailed"), description: error instanceof Error ? t(error.message, { defaultValue: "" }) : undefined, variant: "destructive" });
      return;
    } finally {
      photoUploadInProgress.current = false;
      setPhotoUploading(false);
    }
  }

  const save = useMutation({
    mutationFn: async (request: { page?: NeighborhoodPageSettings; values?: NeighborhoodContent; published?: boolean; preserveDraft?: boolean; preserveMapSession?: boolean }) => {
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
      if (!response.ok) throw new Error(neighborhoodApiErrorKey(result) ?? "rgeNeighborhood.saveFailed");
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
      if (!request.page || !page) {
        try {
          const previousKey = neighborhoodMapSessionKey(userId, request.page?.id ?? NEW_NEIGHBORHOOD);
          if (page && request.preserveMapSession) {
            const view = readNeighborhoodMapSession(window.sessionStorage, previousKey);
            if (view) {
              writeNeighborhoodMapSession(window.sessionStorage, neighborhoodMapSessionKey(userId, page.id), {
                ...view, removal: view.removal ? { ...view.removal, version: page.updatedAt } : undefined,
              });
            }
          }
          clearNeighborhoodMapSession(window.sessionStorage, previousKey);
        } catch { /* blocked storage does not prevent saving */ }
      }
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
      toast({ title: page ? t("rgeNeighborhood.saved") : t("rgeNeighborhood.deleted") });
    },
    onError: (error: Error) => {
      void client.invalidateQueries({ queryKey: [endpoint, userId] });
      toast({ title: t("rgeNeighborhood.saveFailed"), description: t(error.message, { defaultValue: "" }), variant: "destructive" });
    },
  });

  if (data === null) return null;
  const photosValid = (values.photos ?? []).length <= NEIGHBORHOOD_GUIDE_MAX_PHOTOS &&
    (values.photos ?? []).every((photo) => photo.alt.trim().length >= 3);
  const canSave = Boolean(active && !stale && data && values.name.trim() && values.city.trim() && values.state.trim() && /^[A-Z]{2}$/.test((values.country ?? "US").toUpperCase()) && photosValid);
  const canPublish = Boolean(data?.canPublish && canSave && neighborhoodContentComplete(values.content));
  const locationValid = [values.name, values.city, values.state].every((value) => /[\p{L}\p{N}]/u.test(value))
    && /^[A-Z]{2}$/.test((values.country ?? "US").toUpperCase());
  const canCreateUploadDraft = canSave && locationValid && values.content.trim().length <= 5000;
  const editingBusy = save.isPending || photoUploading;

  return (
    <section className="space-y-4 border-t border-gray-100 px-4 py-4 sm:px-6" aria-labelledby="neighborhood-pages-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="neighborhood-pages-heading" className="text-sm font-semibold">{t("rgeNeighborhood.title")}</h3>
        <Button type="button" size="sm" variant="outline" disabled={!data || editingBusy}
          onClick={() => {
            setOfferUploadDraft(false);
            if (!drafts.entries[NEW_NEIGHBORHOOD]) {
              try {
                clearNeighborhoodMapSession(window.sessionStorage,
                  neighborhoodMapSessionKey(userId, NEW_NEIGHBORHOOD));
              } catch { /* browser storage may be unavailable */ }
              setMapEditorRevision((revision) => revision + 1);
            }
            updateDrafts((current) => ({ ...current, active: NEW_NEIGHBORHOOD }));
          }}>{drafts.entries[NEW_NEIGHBORHOOD] ? t("rgeNeighborhood.resume") : t("rgeNeighborhood.add")}</Button>
      </div>
      {isPending && <p className="text-sm text-muted-foreground">{t("rgeNeighborhood.loading")}</p>}
      {isError && <p role="alert" className="text-sm text-destructive">{t("rgeNeighborhood.loadFailed")}</p>}
      {data === null && <p className="text-sm text-muted-foreground">{t("rgeNeighborhood.unavailable")}</p>}
      {data?.pages.length === 0 && !active &&
        <p className="text-sm text-muted-foreground">{t("rgeNeighborhood.empty")}</p>}
      {data?.pages.map((item) => (
        <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
          <div className="min-w-0">
            <p className="break-words text-sm font-medium">{neighborhoodTitle(item)}</p>
            <p className="text-xs text-muted-foreground">{item.publicUrl ? t("rgeNeighborhood.published") : item.published ? t("rgeNeighborhood.offline") : t("rgeNeighborhood.draft")}{drafts.entries[item.id] ? ` · ${t("rgeNeighborhood.unsaved")}` : ""}</p>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label={t("rgeNeighborhood.actions", { name: neighborhoodTitle(item) })}>
            <Button asChild type="button" size="icon" variant="ghost" className="h-9 w-9 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              <a href={item.publicUrl ?? `${endpoint}/${encodeURIComponent(item.id)}/preview`}
                 target="_blank" rel="noopener noreferrer"
                 aria-label={item.publicUrl ? t("rgeNeighborhood.live") : t("rgeNeighborhood.previewDraft")}
                 title={item.publicUrl ? t("rgeNeighborhood.live") : t("rgeNeighborhood.previewDraft")}>
                <Eye className="h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
            {item.publicUrl && <Button type="button" size="icon" variant="ghost"
              className="h-9 w-9 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              aria-label={t("rgeNeighborhood.copyUrl")} title={t("rgeNeighborhood.copyUrl")}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(item.publicUrl!);
                  toast({ title: t("rgeNeighborhood.copied") });
                } catch {
                  toast({ title: t("rgeNeighborhood.copyFailed"), description: item.publicUrl ?? undefined });
                }
              }}><Copy className="h-4 w-4" aria-hidden="true" /></Button>}
            <Button type="button" size="icon" variant="ghost"
              className="h-9 w-9 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              aria-label={t("rgeNeighborhood.editNamed", { name: neighborhoodTitle(item) })} title={t("rgeNeighborhood.edit")}
              disabled={editingBusy}
              onClick={() => {
                setOfferUploadDraft(false);
                updateDrafts((current) => ({ ...current, active: item.id }));
              }}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ))}
      {active && data && (
        <div data-rge-neighborhood-editor="true" className="space-y-4 rounded-lg bg-slate-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{active === NEW_NEIGHBORHOOD ? t("rgeNeighborhood.create") : t("rgeNeighborhood.edit")}</h4>
            {dirty && <span role="status" className="text-sm text-slate-700">
              {storageAvailable.current ? t("rgeNeighborhood.localDraft") : t("rgeNeighborhood.unsavedChanges")}
            </span>}
          </div>
          {stale && <p role="alert" className="text-sm text-amber-900">
            {t("rgeNeighborhood.stale")}
          </p>}
          <div className="grid gap-3 sm:grid-cols-4">
            {([{ field: "name", label: t("rgeNeighborhood.name"), max: 80 }, { field: "city", label: t("rgeNeighborhood.city"), max: 80 },
              { field: "state", label: t("rgeNeighborhood.state"), max: 60 }] as const).map(({ field, label, max }) => (
              <div key={field}>
                <Label htmlFor={`neighborhood-${field}`}>{label}</Label>
                <Input id={`neighborhood-${field}`} value={values[field]} maxLength={max} disabled={editingBusy} readOnly={stale}
                  onChange={(event) => editField(field, event.target.value)} />
              </div>
            ))}
          </div>
          <div className="max-w-xs">
            <Label htmlFor="neighborhood-country">{t("inboxUi.neighborhoodCountryCode")}</Label>
            <Input id="neighborhood-country" value={values.country ?? "US"} maxLength={2}
              disabled={editingBusy} readOnly={stale} placeholder={defaultCountryCode} dir="ltr"
              onChange={(event) => editField("country", event.target.value.toUpperCase())} />
            <p className="mt-1 text-xs text-slate-500">{t("inboxUi.neighborhoodCountryExamples")}</p>
          </div>
          <div className="max-w-xs">
            <Label htmlFor="neighborhood-public-language">{t("rgeNeighborhood.publicLanguage")}</Label>
            <select id="neighborhood-public-language" className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              disabled={editingBusy || stale} value={values.publicLanguage ?? "en"}
              onChange={(event) => editField("publicLanguage", event.target.value)}>
              <option value="en" lang="en">{t("language.english")}</option>
              <option value="he" lang="he">{t("language.hebrew")}</option>
              <option value="es" lang="es">{t("language.spanish")}</option>
            </select>
          </div>
          <NeighborhoodBoundaryEditor key={active + ":" + mapEditorRevision} boundary={values.customBoundary} persistedBoundary={page?.customBoundary ?? null}
            persistedVersion={page?.updatedAt ?? null} stale={stale}
            name={values.name} city={values.city} state={values.state} country={values.country ?? "US"}
            sessionKey={neighborhoodMapSessionKey(userId, active)}
            disabled={stale || editingBusy} onChange={editBoundary} />
          <NeighborhoodGuideVisualEditor key={active} content={values.content} photos={values.photos ?? []}
            disabled={stale || editingBusy} uploading={photoUploading}
            canUpload={Boolean((page || canCreateUploadDraft) &&
              (values.photos?.length ?? 0) < NEIGHBORHOOD_GUIDE_MAX_PHOTOS)}
            uploadDraftRequired={!page}
            uploadedInlinePhotoId={uploadedInlinePhoto?.pageId === active ? uploadedInlinePhoto?.photoId : undefined}
            onChange={(content) => editField("content", content)}
            onPhotoAltChange={(url, alt) => editPhotos((values.photos ?? []).map((photo) =>
              photo.url === url ? { ...photo, alt } : photo))}
            onUploadPhoto={(file, placement) => uploadPhoto(file, { placement })} />
          <p className="text-xs text-slate-600">{t("rgeNeighborhood.guideHelp")}</p>


          <details className="rounded-lg border border-slate-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              {t("rgeNeighborhood.library", { count: (values.photos ?? []).length, max: NEIGHBORHOOD_GUIDE_MAX_PHOTOS })}
              <span className="ms-2 text-xs font-normal text-slate-500">{t("rgeNeighborhood.managePhotos")}</span>
            </summary>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" variant="outline" disabled={stale || editingBusy ||
                (values.photos?.length ?? 0) >= NEIGHBORHOOD_GUIDE_MAX_PHOTOS}
                aria-expanded={page ? undefined : offerUploadDraft}
                aria-controls={!page && offerUploadDraft ? "neighborhood-upload-draft-offer" : undefined}
                onClick={() => page ? photoInput.current?.click() : setOfferUploadDraft(!offerUploadDraft)}>
                <ImagePlus className="me-1.5 h-4 w-4" aria-hidden="true" />{photoUploading ? t("rgeNeighborhood.uploading") : t("rgeNeighborhood.uploadLibrary")}
              </Button>
              <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                aria-label={t("rgeNeighborhood.uploadPhoto")} disabled={editingBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void uploadPhoto(file, { createDraft: offerUploadDraft });
                }} />
              <span className="text-xs text-slate-500">{t("rgeNeighborhood.fileTypes")}</span>
            </div>
            {!page && offerUploadDraft && (
              <div id="neighborhood-upload-draft-offer" className="mt-3 space-y-2 rounded-md border bg-slate-50 p-3">
                <p className="text-sm text-slate-700">
                  {t("rgeNeighborhoodUpload.offer")}
                </p>
                {!locationValid && <p role="status" className="text-sm text-amber-900">
                  {t("rgeNeighborhoodUpload.requiredLocation")}
                </p>}
                {values.content.trim().length > 5000 && <p role="status" className="text-sm text-amber-900">
                  {t("rgeNeighborhoodUpload.articleTooLong")}
                </p>}
                <Button type="button" size="sm" disabled={!canCreateUploadDraft || editingBusy}
                  onClick={() => photoInput.current?.click()}>{t("rgeNeighborhoodUpload.choosePhoto")}</Button>
                <Button type="button" size="sm" variant="ghost" disabled={editingBusy}
                  onClick={() => setOfferUploadDraft(false)}>{t("common.cancel")}</Button>
              </div>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(values.photos ?? []).map((photo, index) => (
                <div key={photo.url} className="min-w-0 rounded-lg border border-slate-200 p-2">
                  <img src={photo.url} alt={photo.alt} loading="lazy" className="h-32 w-full rounded object-cover" />
                  <div className="mt-2 flex items-center justify-between gap-1">
                    <span className="text-xs font-medium text-slate-600">{index === 0 ? t("rgeNeighborhood.cover") : t("rgeNeighborhood.libraryPhoto")}</span>
                    <div className="flex gap-1">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        disabled={index === 0 || stale || editingBusy} aria-label={t("rgeNeighborhood.earlier")}
                        onClick={() => {
                          const next = [...(values.photos ?? [])];
                          [next[index - 1], next[index]] = [next[index], next[index - 1]];
                          editPhotos(next);
                        }}><ArrowLeft className="h-4 w-4 rtl:-scale-x-100" /></Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        disabled={index === (values.photos?.length ?? 0) - 1 || stale || editingBusy}
                        aria-label={t("rgeNeighborhood.later")} onClick={() => {
                          const next = [...(values.photos ?? [])];
                          [next[index + 1], next[index]] = [next[index], next[index + 1]];
                          editPhotos(next);
                        }}><ArrowRight className="h-4 w-4 rtl:-scale-x-100" /></Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-600"
                        disabled={stale || editingBusy} aria-label={t("rgeNeighborhood.removePhoto")}
                        onClick={() => editPhotos((values.photos ?? []).filter((_, i) => i !== index))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Label htmlFor={`guide-photo-alt-${index}`} className="text-xs">{t("rgeNeighborhood.description")}</Label>
                  <Input id={`guide-photo-alt-${index}`} value={photo.alt} maxLength={140}
                    disabled={stale || editingBusy}
                    onChange={(event) => editPhotos((values.photos ?? []).map((item, i) => i === index ? { ...item, alt: event.target.value } : item))} />
                </div>
              ))}
            </div>
          </details>
          {data && !data.canPublish && <p className="text-xs text-muted-foreground">{t("rgeNeighborhood.enablePage")}</p>}
          {dirty && !canPublish && data?.canPublish && canSave && !neighborhoodContentComplete(values.content) && (
            <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t("rgeNeighborhood.guideIncomplete")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {!page?.published && <Button type="button" size="sm" variant="outline" disabled={!dirty || !canSave || editingBusy}
              onClick={() => save.mutate({ page, values, published: false })}>{t("rgeNeighborhood.saveDraft")}</Button>}
            {page && !dirty && <Button asChild size="sm" variant="outline">
              <a href={`${endpoint}/${encodeURIComponent(page.id)}/preview`} target="_blank" rel="noopener noreferrer">{t("rgeNeighborhood.previewSaved")}</a>
            </Button>}
            {page && <Button type="button" size="sm" disabled={!canPublish || (page.published && !dirty) || editingBusy}
              onClick={() => save.mutate({ page, values, published: true })}>{page.published ? t("rgeNeighborhood.update") : t("rgeNeighborhood.publish")}</Button>}
            {page?.published && <Button type="button" size="sm" variant="outline" disabled={editingBusy || stale}
              onClick={() => save.mutate({ page, values: page, published: false, preserveDraft: true })}>{t("rgeNeighborhood.unpublish")}</Button>}
            {page && <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={editingBusy || stale}
              onClick={() => { if (window.confirm(t("rgeNeighborhood.deleteConfirm", { name: page.name }))) save.mutate({ page }); }}>{t("rgeNeighborhood.delete")}</Button>}
            <Button type="button" size="sm" variant="ghost" disabled={editingBusy} onClick={() => updateDrafts((current) => ({ ...current, active: null }))}>{t("rgeNeighborhood.close")}</Button>
            {dirty && <Button type="button" size="sm" variant="ghost" disabled={editingBusy} onClick={() => {
              if (!window.confirm(t("rgeNeighborhood.discardConfirm"))) return;
              try {
                clearNeighborhoodMapSession(window.sessionStorage,
                  neighborhoodMapSessionKey(userId, active));
              } catch { /* browser storage may be unavailable */ }
              setMapEditorRevision((revision) => revision + 1);
              updateDrafts((current) => {
                const entries = { ...current.entries };
                delete entries[active];
                return { active: page ? active : null, entries };
              });
            }}>{t("rgeNeighborhood.discard")}</Button>}
          </div>
        </div>
      )}
    </section>
  );
}
