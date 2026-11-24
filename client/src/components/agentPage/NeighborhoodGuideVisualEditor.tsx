import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Heading2, ImagePlus, Plus, Trash2, Type } from "lucide-react";
import {
  neighborhoodGuidePhotoId, parseNeighborhoodGuideBlocks, serializeNeighborhoodGuideBlocks,
  type NeighborhoodGuideBlock,
} from "@shared/agent/neighborhoodGuideBlocks";
import type { NeighborhoodPhoto } from "@shared/agent/neighborhoodPages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  onUploadPhoto: (file: File, afterIndex: number) => Promise<boolean>;
};

export function NeighborhoodGuideVisualEditor({
  content, photos, disabled, canUpload, uploading, onChange, onPhotoAltChange, onUploadPhoto,
}: EditorProps) {
  const [blocks, setBlocks] = useState<NeighborhoodGuideBlock[]>(() => parseNeighborhoodGuideBlocks(content));
  const [imagePickerAfter, setImagePickerAfter] = useState<number | null>(null);
  const lastAuthored = useRef(content);
  const fileInput = useRef<HTMLInputElement>(null);

  // Another tab, discard-draft, and saved server refresh can all replace the editor contents.
  // Changes originated by this editor preserve its live block selection and empty placeholders.
  useEffect(() => {
    if (content !== lastAuthored.current) {
      setBlocks(parseNeighborhoodGuideBlocks(content));
      lastAuthored.current = content;
      setImagePickerAfter(null);
    }
  }, [content]);

  function commit(next: NeighborhoodGuideBlock[]) {
    const text = serializeNeighborhoodGuideBlocks(next);
    if (text.length > 5000) {
      toast({ title: "Guide limit reached", description: "The article can contain up to 5,000 characters.", variant: "destructive" });
      return false;
    }
    lastAuthored.current = text;
    setBlocks(next);
    onChange(text);
    return true;
  }

  function insertAfter(index: number, block: NeighborhoodGuideBlock) {
    if (disabled) return;
    const next = [...blocks];
    next.splice(index + 1, 0, block);
    commit(next);
  }

  function changeAt(index: number, block: NeighborhoodGuideBlock) {
    if (disabled) return;
    const next = [...blocks];
    next[index] = block;
    commit(next);
  }

  function removeAt(index: number) {
    if (disabled) return;
    commit(blocks.filter((_, i) => i !== index));
    setImagePickerAfter(null);
  }

  function move(index: number, destination: number) {
    if (disabled || destination < 0 || destination >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[destination]] = [next[destination], next[index]];
    commit(next);
    setImagePickerAfter(null);
  }

  function usePhoto(url: string, after: number) {
    const id = neighborhoodGuidePhotoId(url);
    if (!id || blocks.some((block) => block.type === "photo" && block.id === id)) return;
    insertAfter(after, { type: "photo", id });
    setImagePickerAfter(null);
  }

  function picker(after: number) {
    const available = photos.filter((photo) => {
      const id = neighborhoodGuidePhotoId(photo.url);
      return id && !blocks.some((block) => block.type === "photo" && block.id === id);
    });
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-3" role="region" aria-label="Choose neighborhood article image">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">Add an image here</p>
          <Button type="button" size="sm" variant="ghost" onClick={() => setImagePickerAfter(null)}>Cancel</Button>
        </div>
        {available.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {available.map((photo) => (
              <button key={photo.url} type="button" disabled={disabled} className="rounded-lg border border-slate-200 bg-white p-1.5 text-left hover:border-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
                onClick={() => usePhoto(photo.url, after)}>
                <img src={photo.url} alt={photo.alt} loading="lazy" className="h-24 w-full rounded object-cover" />
                <span className="mt-1 block truncate text-xs text-slate-600">{photo.alt || "Use this image"}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-3">
          <Button type="button" size="sm" variant="outline" disabled={disabled || uploading || !canUpload}
            onClick={() => fileInput.current?.click()}>
            <ImagePlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {uploading ? "Uploading…" : "Upload a new image"}
          </Button>
          {!canUpload && (
            <p className="mt-1 text-xs text-slate-600">{photos.length >= 6
              ? "Six images is the current limit. Remove an unused image to add another."
              : "Save this neighborhood as a draft before uploading images."}</p>
          )}
          <p className="mt-1 text-xs text-slate-500">JPG, PNG or WebP, maximum 5 MB. Use images you own or are licensed to share.</p>
          <input ref={fileInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp"
            aria-label="Upload image into article" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const succeeded = await onUploadPhoto(file, after);
              if (succeeded) setImagePickerAfter(null);
              if (fileInput.current) fileInput.current.value = "";
            }} />
        </div>
      </div>
    );
  }

  function addControls(after: number, isLast = false) {
    return (
      <div className={"flex flex-wrap items-center gap-1.5 " + (isLast ? "mt-3" : "mt-2")}>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => insertAfter(after, { type: "paragraph", text: "" })}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Paragraph
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => insertAfter(after, { type: "heading", text: "" })}>
          <Heading2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Heading
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setImagePickerAfter(imagePickerAfter === after ? null : after)}>
          <ImagePlus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Image
        </Button>
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4" aria-label="Visual neighborhood guide editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h5 className="text-sm font-semibold text-slate-900">Your local guide</h5>
          <p className="mt-0.5 text-xs text-slate-600">Write your guide and place photos directly between paragraphs. What you see here is how the article will be arranged.</p>
        </div>
        <span className="text-xs tabular-nums text-slate-500">{content.length.toLocaleString()} / 5,000</span>
      </div>

      {blocks.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          Start with a paragraph, heading or neighborhood image below.
        </div>
      )}

      {blocks.map((block, index) => {
        const photo = block.type === "photo"
          ? photos.find((item) => neighborhoodGuidePhotoId(item.url) === block.id) : null;
        return (
          <div key={index} className="rounded-lg border border-slate-200 bg-white p-3" data-guide-block={block.type}>
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
              {block.type === "photo" ? <ImagePlus className="h-3.5 w-3.5" /> :
                block.type === "heading" ? <Heading2 className="h-3.5 w-3.5" /> : <Type className="h-3.5 w-3.5" />}
              <span>{block.type === "photo" ? "Image" : block.type === "heading" ? "Section heading" : "Paragraph"}</span>
              <div className="ml-auto flex gap-0.5">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                  disabled={disabled || index === 0} onClick={() => move(index, index - 1)} aria-label="Move block up" title="Move up">
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                  disabled={disabled || index === blocks.length - 1} onClick={() => move(index, index + 1)} aria-label="Move block down" title="Move down">
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-600"
                  disabled={disabled} onClick={() => removeAt(index)} aria-label="Remove block" title="Remove block">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {block.type === "heading" ? (
              <Input value={block.text} maxLength={80} disabled={disabled}
                aria-label="Section heading text" placeholder="Write a section heading…"
                className="h-auto border-0 px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
                onChange={(event) => changeAt(index, { type: "heading", text: event.target.value })} />
            ) : block.type === "paragraph" ? (
              <Textarea value={block.text} disabled={disabled} rows={3}
                aria-label="Article paragraph" placeholder="Write about this neighborhood…"
                className="min-h-24 resize-y border-0 px-0 text-base leading-7 shadow-none focus-visible:ring-0"
                onChange={(event) => changeAt(index, { type: "paragraph", text: event.target.value.replace(/\n\s*\n/g, "\n") })} />
            ) : photo ? (
              <figure className="space-y-2">
                <img src={photo.url} alt={photo.alt} loading="lazy" className="max-h-96 w-full rounded-lg bg-slate-100 object-cover" />
                <Label htmlFor={"guide-inline-caption-" + index} className="text-xs">Image description / caption</Label>
                <Input id={"guide-inline-caption-" + index} maxLength={140} value={photo.alt} disabled={disabled}
                  onChange={(event) => onPhotoAltChange(photo.url, event.target.value)} />
              </figure>
            ) : (
              <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                This image is no longer in your photo library. Remove this block or upload a replacement.
              </p>
            )}
            {addControls(index)}
            {imagePickerAfter === index && <div className="mt-2">{picker(index)}</div>}
          </div>
        );
      })}
      {blocks.length === 0 && addControls(-1, true)}
      {imagePickerAfter === -1 && <div className="mt-2">{picker(-1)}</div>}
      <p className="text-xs text-slate-600">Use the arrows to change the order. Images are stored securely in your neighborhood library. Save or update the page to publish edits.</p>
    </section>
  );
}
