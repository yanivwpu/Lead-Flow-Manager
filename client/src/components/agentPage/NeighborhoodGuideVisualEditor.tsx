import { useEffect, useRef, useState } from "react";
import { Bold, Heading2, ImagePlus, Italic, Pilcrow, Trash2, Upload, X } from "lucide-react";
import { neighborhoodGuidePhotoId, parseNeighborhoodGuideBlocks } from "@shared/agent/neighborhoodGuideBlocks";
import type { NeighborhoodPhoto } from "@shared/agent/neighborhoodPages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

type EditorProps = {
  content: string;
  photos: NeighborhoodPhoto[];
  disabled: boolean;
  canUpload: boolean;
  uploading: boolean;
  onChange: (content: string) => void;
  onPhotoAltChange: (url: string, alt: string) => void;
  onUploadPhoto: (file: File) => Promise<NeighborhoodPhoto | null>;
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

function articleToText(editor: HTMLElement): string {
  const sections: string[] = [];
  for (const child of Array.from(editor.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const id = child.dataset.photoId;
    if (child.tagName === "FIGURE") {
      if (id && PHOTO_ID.test(id)) sections.push("[[photo:" + id.toLowerCase() + "]]");
      continue;
    }
    const text = Array.from(child.childNodes).map(inlineMarkdown).join("").trim();
    if (!text) continue;
    sections.push(/^H[1-6]$/.test(child.tagName) ? "## " + text : text);
  }
  return sections.join("\n\n");
}

function createPhotoNode(photo: NeighborhoodPhoto): HTMLElement | null {
  const id = neighborhoodGuidePhotoId(photo.url);
  if (!id) return null;
  const figure = document.createElement("figure");
  figure.contentEditable = "false";
  figure.dataset.photoId = id;
  figure.className = "group relative my-6 cursor-pointer";
  const img = document.createElement("img");
  img.src = photo.url;
  img.alt = photo.alt;
  img.loading = "lazy";
  img.className = "block max-h-[440px] w-full rounded-lg bg-slate-100 object-cover";
  const caption = document.createElement("figcaption");
  caption.className = "mt-2 text-center text-sm text-slate-500";
  caption.textContent = photo.alt;
  figure.append(img, caption);
  return figure;
}

function restoreEditor(editor: HTMLElement, text: string, photos: NeighborhoodPhoto[]) {
  editor.replaceChildren();
  const blocks = parseNeighborhoodGuideBlocks(text);
  for (const block of blocks) {
    if (block.type === "photo") {
      const photo = photos.find((item) => neighborhoodGuidePhotoId(item.url) === block.id);
      if (photo) {
        const node = createPhotoNode(photo);
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
  content, photos, disabled, canUpload, uploading, onChange, onPhotoAltChange, onUploadPhoto,
}: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rangeRef = useRef<Range | null>(null);
  const lastAuthored = useRef<string | null>(null);
  const photosRef = useRef(photos);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  photosRef.current = photos;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || content === lastAuthored.current) return;
    restoreEditor(editor, content, photosRef.current);
    lastAuthored.current = content;
    setSelectedId(null);
  }, [content]);

  // Caption changes should update the visible preview without replacing the
  // editable DOM or moving the user's text cursor.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    for (const figure of Array.from(editor.querySelectorAll<HTMLElement>("figure[data-photo-id]"))) {
      const photo = photos.find((p) => neighborhoodGuidePhotoId(p.url) === figure.dataset.photoId);
      const img = figure.querySelector("img");
      const caption = figure.querySelector("figcaption");
      if (photo && img && caption) {
        img.alt = photo.alt;
        caption.textContent = photo.alt;
      }
    }
  }, [photos]);

  const selectedPhoto = photos.find((photo) => neighborhoodGuidePhotoId(photo.url) === selectedId);

  function syncEditor() {
    const editor = editorRef.current;
    if (!editor || disabled) return;
    const next = articleToText(editor);
    if (next.length > 5000) {
      toast({ title: "Guide is too long", description: "Maximum length is 5,000 characters.", variant: "destructive" });
      restoreEditor(editor, lastAuthored.current ?? content, photosRef.current);
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

  function insertPhoto(photo: NeighborhoodPhoto) {
    const editor = editorRef.current;
    const figure = createPhotoNode(photo);
    if (!editor || !figure || disabled) return;
    const id = neighborhoodGuidePhotoId(photo.url);
    if (!id || editor.querySelector('figure[data-photo-id="' + id + '"]')) {
      setPickerOpen(false);
      return;
    }
    const range = rangeRef.current;
    let node: Node | null = range && editor.contains(range.startContainer) ? range.startContainer : null;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentNode;
    while (node?.parentNode && node.parentNode !== editor) node = node.parentNode;
    if (node && node.parentNode === editor) editor.insertBefore(figure, node.nextSibling);
    else editor.append(figure);
    if (!figure.nextElementSibling) editor.append(document.createElement("p"));
    setSelectedId(id);
    setPickerOpen(false);
    syncEditor();
  }

  function removeImage() {
    const editor = editorRef.current;
    if (!editor || !selectedId || disabled) return;
    editor.querySelector('figure[data-photo-id="' + selectedId + '"]')?.remove();
    setSelectedId(null);
    syncEditor();
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
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Neighborhood article editor">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Article formatting">
          {toolbarButton("Bold", <Bold className="h-4 w-4" />, () => format("bold"))}
          {toolbarButton("Italic", <Italic className="h-4 w-4" />, () => format("italic"))}
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
          {toolbarButton("Heading", <Heading2 className="h-4 w-4" />, () => format("formatBlock", "h3"))}
          {toolbarButton("Normal paragraph", <Pilcrow className="h-4 w-4" />, () => format("formatBlock", "p"))}
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
          {toolbarButton("Insert image", <ImagePlus className="h-4 w-4" />, () => { rememberCursor(); setPickerOpen((open) => !open); })}
        </div>
        <span className="text-xs tabular-nums text-slate-500">{content.length.toLocaleString()} / 5,000</span>
      </div>
      {pickerOpen && (
        <div className="border-b border-slate-200 bg-white p-3" role="region" aria-label="Choose article image">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-900">Insert an image</p>
            <Button type="button" size="icon" variant="ghost" aria-label="Close photo picker" className="h-8 w-8"
              onClick={() => setPickerOpen(false)}><X className="h-4 w-4" /></Button>
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
            <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />{uploading ? "Uploading…" : "Upload new photo"}
          </Button>
          {!canUpload && <p className="mt-1 text-xs text-slate-500">{photos.length >= 6
            ? "Six photos maximum; remove an unused photo to upload another."
            : "Save the neighborhood draft before uploading photos."}</p>}
          <p className="mt-1 text-xs text-slate-500">JPG, PNG or WebP, up to 5 MB. Only use photos you own or are licensed to share.</p>
          <input ref={fileRef} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" aria-label="Upload article image"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const uploaded = await onUploadPhoto(file);
              if (uploaded) insertPhoto(uploaded);
              if (fileRef.current) fileRef.current.value = "";
            }} />
        </div>
      )}
      <div ref={editorRef} contentEditable={!disabled} suppressContentEditableWarning
        role="textbox" aria-label="Your local guide article" aria-multiline="true"
        data-placeholder="Start writing your neighborhood guide…"
        className="min-h-[280px] px-5 py-6 text-[15px] leading-7 text-slate-800 outline-none
          focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500
          [&>p]:mb-4 [&>p]:min-h-7 [&>h3]:mb-3 [&>h3]:mt-5 [&>h3]:text-xl [&>h3]:font-semibold
          [&>figure]:my-6 [&>p:empty]:min-h-7"
        onInput={syncEditor} onKeyUp={rememberCursor} onMouseUp={rememberCursor}
        onFocus={rememberCursor}
        onPaste={(event) => {
          event.preventDefault();
          // Plain-text paste prevents imported HTML, external images and unsafe tags.
          document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
        }}
        onClick={(event) => {
          const figure = (event.target as HTMLElement).closest("figure[data-photo-id]");
          setSelectedId(figure instanceof HTMLElement ? figure.dataset.photoId ?? null : null);
        }} />
      {selectedPhoto && (
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2">
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="inline-guide-image-caption" className="text-xs text-slate-600">Image caption</Label>
            <Input id="inline-guide-image-caption" maxLength={140} disabled={disabled} value={selectedPhoto.alt}
              onChange={(event) => onPhotoAltChange(selectedPhoto.url, event.target.value)} className="mt-1 h-9" />
          </div>
          <Button type="button" variant="ghost" size="sm" className="text-red-600" disabled={disabled} onClick={removeImage}>
            <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" /> Remove from article
          </Button>
        </div>
      )}
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        Click anywhere to type. Press Enter for a new paragraph. Use the image icon in the toolbar to insert photos where you are writing.
      </p>
    </section>
  );
}
