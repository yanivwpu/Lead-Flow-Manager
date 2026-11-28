import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { Bold, Heading2, ImagePlus, Italic, Pilcrow, Trash2, Upload, X } from "lucide-react";
import { neighborhoodGuidePhotoId, normalizeNeighborhoodPhotoWidth, parseNeighborhoodGuideBlocks } from "@shared/agent/neighborhoodGuideBlocks";
import type { NeighborhoodPhoto } from "@shared/agent/neighborhoodPages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

export type ArticlePhotoPlacement = { content: string; sectionIndex: number };

type EditorProps = {
  content: string;
  photos: NeighborhoodPhoto[];
  disabled: boolean;
  canUpload: boolean;
  uploading: boolean;
  uploadDraftRequired?: boolean;
  uploadedInlinePhotoId?: string;
  onChange: (content: string) => void;
  onPhotoAltChange: (url: string, alt: string) => void;
  onUploadPhoto: (file: File, placement: ArticlePhotoPlacement) => Promise<void>;
};

const PHOTO_ID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

// Build DOM nodes with textContent, never user-authored HTML. Persist the same
// plain-text/heading/photo-marker format as the existing Neighborhood Pages.
function appendFormattedText(parent: HTMLElement, text: string) {
  const parts = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const element = document.createElement("strong");
      element.textContent = part.slice(2, -2);
      parent.append(element);
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      const element = document.createElement("em");
      element.textContent = part.slice(1, -1);
      parent.append(element);
    } else {
      parent.append(document.createTextNode(part));
    }
  }
}

function inlineMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  if (node.tagName === "BR") return "\n";
  const text = Array.from(node.childNodes).map(inlineMarkdown).join("");
  if (node.matches("strong,b")) return text ? "**" + text + "**" : "";
  if (node.matches("em,i")) return text ? "*" + text + "*" : "";
  return text;
}

function articleToText(editor: HTMLElement, before?: HTMLElement): string {
  const sections: string[] = [];
  for (const child of Array.from(editor.children)) {
    if (child === before) break;
    if (!(child instanceof HTMLElement)) continue;
    const id = child.dataset.photoId;
    if (child.dataset.inlinePhotoPicker === "true") continue;
    if (child.tagName === "FIGURE") {
      if (id && PHOTO_ID.test(id)) {
        const width = normalizeNeighborhoodPhotoWidth(Number(child.dataset.photoWidth || "100"));
        sections.push("[[photo:" + id.toLowerCase() + (width === 100 ? "" : "|" + width) + "]]");
      }
      continue;
    }
    const text = Array.from(child.childNodes).map(inlineMarkdown).join("").trim();
    if (!text) continue;
    sections.push(/^H[1-6]$/.test(child.tagName) ? "## " + text : text);
  }
  return sections.join("\n\n");
}

function createPhotoNode(photo: NeighborhoodPhoto, width: number, resizeLabel: string): HTMLElement | null {
  const id = neighborhoodGuidePhotoId(photo.url);
  if (!id) return null;
  const figure = document.createElement("figure");
  figure.contentEditable = "false";
  figure.dataset.photoId = id;
  figure.dataset.photoWidth = String(normalizeNeighborhoodPhotoWidth(width));
  figure.style.width = figure.dataset.photoWidth + "%";
  figure.style.maxWidth = "100%";
  figure.className = "group relative my-6 mx-auto cursor-pointer";
  const img = document.createElement("img");
  img.src = photo.url;
  img.alt = photo.alt;
  img.loading = "lazy";
  img.className = "block max-h-[440px] w-full rounded-lg bg-slate-100 object-cover";
  const caption = document.createElement("figcaption");
  caption.className = "mt-2 text-center text-sm text-slate-500";
  caption.textContent = photo.alt;
  const grip = document.createElement("button");
  grip.type = "button";
  grip.dataset.photoResizeHandle = "true";
  grip.setAttribute("aria-label", resizeLabel);
  grip.title = resizeLabel;
  grip.textContent = "↘";
  grip.className = "absolute bottom-8 right-2 flex h-9 w-9 touch-none items-center justify-center rounded-lg border border-slate-300 bg-white/95 text-xl font-semibold text-slate-700 shadow-sm cursor-nwse-resize hover:bg-white";
  figure.append(img, caption, grip);
  return figure;
}

function restoreEditor(editor: HTMLElement, text: string, photos: NeighborhoodPhoto[], resizeLabel: string) {
  editor.replaceChildren();
  const blocks = parseNeighborhoodGuideBlocks(text);
  for (const block of blocks) {
    if (block.type === "photo") {
      const photo = photos.find((item) => neighborhoodGuidePhotoId(item.url) === block.id);
      if (photo) {
        const node = createPhotoNode(photo, block.width ?? 100, resizeLabel);
        if (node) editor.append(node);
      }
      continue;
    }
    const element = document.createElement(block.type === "heading" ? "h3" : "p");
    appendFormattedText(element, block.text);
    editor.append(element);
  }
  if (!editor.children.length) editor.append(document.createElement("p"));
}

export function NeighborhoodGuideVisualEditor({
  content, photos, disabled, canUpload, uploading, uploadDraftRequired, uploadedInlinePhotoId,
  onChange, onPhotoAltChange, onUploadPhoto,
}: EditorProps) {
  const { t, i18n } = useTranslation();
  const resizeLabel = t("rgeNeighborhood.resizeHandle");
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickerAnchorRef = useRef<HTMLDivElement | null>(null);
  const rangeRef = useRef<Range | null>(null);
  const lastAuthored = useRef<string | null>(null);
  const photosRef = useRef(photos);
  const [pickerHost, setPickerHost] = useState<HTMLDivElement | null>(null);
  const [selectedWidth, setSelectedWidth] = useState(100);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  photosRef.current = photos;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || content === lastAuthored.current) return;
    restoreEditor(editor, content, photosRef.current, resizeLabel);
    lastAuthored.current = content;
    pickerAnchorRef.current = null;
    setPickerHost(null);
    setSelectedId(null);
  }, [content]);

  // Caption changes should update the visible preview without replacing the
  // editable DOM or moving the user's text cursor.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    for (const figure of Array.from(editor.querySelectorAll<HTMLElement>("figure[data-photo-id]"))) {
      const photo = photos.find((p) => neighborhoodGuidePhotoId(p.url) === figure.dataset.photoId);
      const grip = figure.querySelector<HTMLButtonElement>("[data-photo-resize-handle]");
      if (grip) {
        grip.setAttribute("aria-label", resizeLabel);
        grip.title = resizeLabel;
      }
      const img = figure.querySelector("img");
      const caption = figure.querySelector("figcaption");
      if (photo && img && caption) {
        img.alt = photo.alt;
        caption.textContent = photo.alt;
      }
    }
  }, [photos, resizeLabel]);

  // Inline uploads commit the placement in the parent draft, so the picker
  // and editable DOM can be replaced without losing the image or selection.
  useEffect(() => {
    if (!uploadedInlinePhotoId) return;
    const figure = Array.from(editorRef.current?.querySelectorAll<HTMLElement>("figure[data-photo-id]") ?? [])
      .find((node) => node.dataset.photoId === uploadedInlinePhotoId);
    if (!figure) return;
    setSelectedId(uploadedInlinePhotoId);
    setSelectedWidth(normalizeNeighborhoodPhotoWidth(Number(figure.dataset.photoWidth || "100")));
    figure.scrollIntoView({ block: "nearest" });
  }, [uploadedInlinePhotoId]);

  const selectedPhoto = photos.find((photo) => neighborhoodGuidePhotoId(photo.url) === selectedId);

  // Some browsers discard an inactive contentEditable DOM when a dashboard tab
  // is hidden or its parent subtree is temporarily detached. The React content
  // prop remains the source of truth; restore it only if the DOM is actually
  // empty, never while the agent is actively typing or inserting a photo.
  function recoverEmptyEditor() {
    const editor = editorRef.current;
    if (!editor) return;
    if (!editor.children.length ||
        (content && !articleToText(editor).trim() &&
          !editor.querySelector('[data-inline-photo-picker="true"]'))) {
      restoreEditor(editor, content, photosRef.current, resizeLabel);
      lastAuthored.current = content;
    }
  }

  useEffect(() => {
    const onRestore = () => {
      if (document.visibilityState !== "hidden") recoverEmptyEditor();
    };
    document.addEventListener("visibilitychange", onRestore);
    window.addEventListener("pageshow", onRestore);
    return () => {
      document.removeEventListener("visibilitychange", onRestore);
      window.removeEventListener("pageshow", onRestore);
    };
  }, [content]);

  function syncEditor() {
    const editor = editorRef.current;
    if (!editor || disabled) return;
    const next = articleToText(editor);
    if (next.length > 5000) {
      toast({ title: t("rgeNeighborhood.tooLong"), description: t("rgeNeighborhood.maxLength"), variant: "destructive" });
      restoreEditor(editor, lastAuthored.current ?? content, photosRef.current, resizeLabel);
      return;
    }
    if (next === lastAuthored.current) return;
    lastAuthored.current = next;
    onChange(next);
  }

  function rememberCursor() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.startContainer)) rangeRef.current = range.cloneRange();
  }

  function format(command: "bold" | "italic" | "formatBlock", value?: string) {
    const editor = editorRef.current;
    if (!editor || disabled) return;
    editor.focus();
    const range = rangeRef.current;
    if (range && editor.contains(range.startContainer)) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    document.execCommand(command, false, value);
    syncEditor();
    rememberCursor();
  }


  function closePicker() {
    pickerAnchorRef.current?.remove();
    pickerAnchorRef.current = null;
    setPickerHost(null);
  }

  function openPickerAtCursor() {
    const editor = editorRef.current;
    if (!editor || disabled) return;
    rememberCursor();
    if (pickerAnchorRef.current) {
      closePicker();
      return;
    }
    const range = rangeRef.current;
    let node: Node | null = range && editor.contains(range.startContainer) ? range.startContainer : null;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentNode;
    while (node?.parentNode && node.parentNode !== editor) node = node.parentNode;
    const anchor = document.createElement("div");
    anchor.contentEditable = "false";
    anchor.dataset.inlinePhotoPicker = "true";
    anchor.className = "my-4 rounded-lg border-2 border-dashed border-emerald-400 bg-emerald-50/60";
    if (node && node.parentNode === editor) editor.insertBefore(anchor, node.nextSibling);
    else editor.append(anchor);
    pickerAnchorRef.current = anchor;
    setPickerHost(anchor);
    anchor.scrollIntoView({ block: "nearest" });
  }

  function uploadAtPicker(file: File) {
    const editor = editorRef.current;
    const anchor = pickerAnchorRef.current;
    if (disabled || !canUpload || uploading || !editor || !anchor || !editor.contains(anchor)) return;
    const before = articleToText(editor, anchor);
    const sectionIndex = before ? before.split(/\n\s*\n/).length : 0;
    const source = lastAuthored.current ?? content;
    const sections = source.trim() ? source.trim().split(/\n\s*\n/) : [];
    if (sections.slice(0, sectionIndex).map(section => section.trim()).join("\n\n") !== before) {
      toast({ title: t("rgeNeighborhoodUpload.reopenPicker"), variant: "destructive" });
      return;
    }
    void onUploadPhoto(file, { content: source, sectionIndex });
  }

  function insertPhoto(photo: NeighborhoodPhoto) {
    const editor = editorRef.current;
    const anchor = pickerAnchorRef.current;
    const figure = createPhotoNode(photo, 100, resizeLabel);
    if (!editor || !figure || disabled || !anchor || !editor.contains(anchor)) return;
    const id = neighborhoodGuidePhotoId(photo.url);
    if (!id) return;
    if (editor.querySelector('figure[data-photo-id="' + id + '"]')) {
      toast({ title: t("rgeNeighborhood.alreadyInserted"), description: t("rgeNeighborhood.adjustExisting") });
      closePicker();
      return;
    }
    anchor.replaceWith(figure);
    pickerAnchorRef.current = null;
    setPickerHost(null);
    setSelectedId(id);
    setSelectedWidth(100);
    if (!figure.nextElementSibling) editor.append(document.createElement("p"));
    syncEditor();
    figure.scrollIntoView({ block: "nearest" });
    toast({ title: t("rgeNeighborhood.inserted"), description: t("rgeNeighborhood.insertedHelp") });
  }

  function resizePhoto(width: number) {
    const editor = editorRef.current;
    if (!editor || !selectedId || disabled) return;
    const figure = Array.from(editor.querySelectorAll<HTMLElement>("figure[data-photo-id]"))
      .find((node) => node.dataset.photoId === selectedId);
    if (!figure) return;
    const normalized = normalizeNeighborhoodPhotoWidth(width);
    figure.dataset.photoWidth = String(normalized);
    figure.style.width = normalized + "%";
    setSelectedWidth(normalized);
    syncEditor();
  }

  function removeImage() {
    const editor = editorRef.current;
    if (!editor || !selectedId || disabled) return;
    editor.querySelector('figure[data-photo-id="' + selectedId + '"]')?.remove();
    setSelectedId(null);
    setSelectedWidth(100);
    syncEditor();
  }


  function startResizeFromHandle(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || disabled) return;
    const handle = target.closest<HTMLElement>("[data-photo-resize-handle]");
    const editor = editorRef.current;
    const figure = handle?.closest<HTMLElement>("figure[data-photo-id]");
    if (!figure || !editor) return;
    event.preventDefault();
    event.stopPropagation();
    const id = figure.dataset.photoId;
    if (!id) return;
    const initialX = event.clientX;
    const initialWidth = normalizeNeighborhoodPhotoWidth(Number(figure.dataset.photoWidth || "100"));
    const editorWidth = Math.max(editor.clientWidth - 40, 200);
    setSelectedId(id);
    setSelectedWidth(initialWidth);
    const move = (e: PointerEvent) => {
      const delta = ((e.clientX - initialX) / editorWidth) * 100;
      const next = Math.max(40, Math.min(100, Math.round((initialWidth + delta) / 5) * 5));
      figure.dataset.photoWidth = String(next);
      figure.style.width = next + "%";
      setSelectedWidth(next);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      syncEditor();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function toolbarButton(label: string, icon: React.ReactNode, action: () => void) {
    return (
      <Button type="button" size="icon" variant="ghost" disabled={disabled}
        aria-label={label} title={label} className="h-9 w-9 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
        onMouseDown={(event) => { event.preventDefault(); rememberCursor(); }}
        onClick={action}>{icon}</Button>
    );
  }

  const available = photos.filter((photo) => {
    const id = neighborhoodGuidePhotoId(photo.url);
    return id && !editorRef.current?.querySelector('figure[data-photo-id="' + id + '"]');
  });

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label={t("rgeNeighborhood.editor")}>
      <div className="border-b border-slate-100 px-4 py-3">
        <h5 className="text-sm font-semibold text-slate-900">{t("rgeNeighborhood.guide")}</h5>
        <p className="text-xs text-slate-500">{t("rgeNeighborhood.guideIntro")}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label={t("rgeNeighborhood.formatting")}>
          {toolbarButton(t("rgeNeighborhood.bold"), <Bold className="h-4 w-4" />, () => format("bold"))}
          {toolbarButton(t("rgeNeighborhood.italic"), <Italic className="h-4 w-4" />, () => format("italic"))}
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
          {toolbarButton(t("rgeNeighborhood.heading"), <Heading2 className="h-4 w-4" />, () => format("formatBlock", "h3"))}
          {toolbarButton(t("rgeNeighborhood.paragraph"), <Pilcrow className="h-4 w-4" />, () => format("formatBlock", "p"))}
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
          {toolbarButton(t("rgeNeighborhood.insert"), <ImagePlus className="h-4 w-4" />, openPickerAtCursor)}
        </div>
        <span className="text-xs tabular-nums text-slate-500">{content.length.toLocaleString(i18n.resolvedLanguage)} / {(5000).toLocaleString(i18n.resolvedLanguage)}</span>
      </div>
      {pickerHost && createPortal(
        <div className="rounded-lg bg-white p-3" role="region" aria-label={t("rgeNeighborhood.picker")} onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-900">{t("rgeNeighborhood.pickerSpot")}</p>
            <Button type="button" size="icon" variant="ghost" aria-label={t("rgeNeighborhood.closePicker")} className="h-8 w-8"
              disabled={uploading} onClick={closePicker}><X className="h-4 w-4" /></Button>
          </div>
          {available.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {available.map((photo) => (
                <button key={photo.url} type="button" disabled={disabled}
                  onClick={() => insertPhoto(photo)} title={photo.alt}
                  className="overflow-hidden rounded-md border border-slate-200 p-1 hover:border-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
                  <img src={photo.url} alt={photo.alt} loading="lazy" className="h-20 w-28 rounded object-cover" />
                </button>
              ))}
            </div>
          )}
          <Button type="button" variant="outline" size="sm" className="mt-2" disabled={disabled || !canUpload || uploading}
            onClick={() => fileRef.current?.click()}>
            <Upload className="me-1.5 h-4 w-4" aria-hidden="true" />{uploading ? t("rgeNeighborhood.uploading") : t("rgeNeighborhood.uploadNew")}
          </Button>
          {!canUpload && <p className="mt-1 text-xs text-slate-500">{photos.length >= 6
            ? t("rgeNeighborhood.photoLimit")
            : t("rgeNeighborhoodUpload.requiredLocation")}</p>}
          {uploadDraftRequired && canUpload &&
            <p className="mt-1 text-xs text-slate-500">{t("rgeNeighborhoodUpload.inlineDraft")}</p>}
          <p className="mt-1 text-xs text-slate-500">{t("rgeNeighborhood.license")}</p>
          <input ref={fileRef} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" aria-label={t("rgeNeighborhood.uploadArticle")}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) uploadAtPicker(file);
            }} />
        </div>, pickerHost)}
      <div ref={editorRef} contentEditable={!disabled} suppressContentEditableWarning
        dir={content.trim() ? "auto" : undefined} role="textbox" aria-label={t("rgeNeighborhood.article")} aria-multiline="true"
        data-placeholder={t("rgeNeighborhood.placeholder")}
        className="min-h-[280px] px-5 py-6 text-[15px] leading-7 text-slate-800 outline-none
          focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500
          [&>p]:mb-4 [&>p]:min-h-7 [&>h3]:mb-3 [&>h3]:mt-5 [&>h3]:text-xl [&>h3]:font-semibold
          [&>figure]:my-6 [&>p:empty]:min-h-7"
        onInput={syncEditor} onKeyUp={rememberCursor} onMouseUp={rememberCursor}
        onPointerDown={startResizeFromHandle}
        onFocus={() => { recoverEmptyEditor(); rememberCursor(); }}
        onPaste={(event) => {
          event.preventDefault();
          // Plain-text paste prevents imported HTML, external images and unsafe tags.
          document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
        }}
        onClick={(event) => {
          const figure = (event.target as HTMLElement).closest("figure[data-photo-id]");
          setSelectedId(figure instanceof HTMLElement ? figure.dataset.photoId ?? null : null);
          setSelectedWidth(figure instanceof HTMLElement ? normalizeNeighborhoodPhotoWidth(Number(figure.dataset.photoWidth || "100")) : 100);
        }} />

      {selectedPhoto && (
        <div className="space-y-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Label htmlFor="neighborhood-inline-image-width" className="text-sm font-medium text-slate-700">
              {t("rgeNeighborhood.width")}
            </Label>
            <input id="neighborhood-inline-image-width" type="range" min={40} max={100} step={5}
              disabled={disabled} value={selectedWidth} onChange={(event) => resizePhoto(Number(event.target.value))}
              className="h-2 min-w-[140px] flex-1 cursor-pointer accent-emerald-600"
              aria-label={t("rgeNeighborhood.resize")} />
            <span className="w-12 text-right text-sm tabular-nums text-slate-700">{selectedWidth}%</span>
            <Button type="button" size="sm" variant="outline" disabled={disabled || selectedWidth === 100}
              onClick={() => resizePhoto(100)}>{t("rgeNeighborhood.fullWidth")}</Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <Label htmlFor="inline-guide-image-caption" className="text-xs text-slate-600">{t("rgeNeighborhood.caption")}</Label>
              <Input id="inline-guide-image-caption" maxLength={140} disabled={disabled} value={selectedPhoto.alt}
                onChange={(event) => onPhotoAltChange(selectedPhoto.url, event.target.value)} className="mt-1 h-9" />
            </div>
            <Button type="button" variant="ghost" size="sm" className="text-red-600" disabled={disabled} onClick={removeImage}>
              <Trash2 className="me-1 h-4 w-4" aria-hidden="true" /> {t("rgeNeighborhood.removeArticle")}
            </Button>
          </div>
          <p className="text-xs text-slate-500">{t("rgeNeighborhood.resizeHelp")}</p>
        </div>
      )}
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        {t("rgeNeighborhood.insertHelp")}
      </p>
    </section>
  );
}
