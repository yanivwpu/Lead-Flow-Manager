import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Image as ImageIcon, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { waUploadFileSizeCheck, waUploadTooLargeMessage } from "@shared/whatsappMediaLimits";

export type CarouselCardMediaEntry = { url: string; originalFilename?: string | null };

type Props = {
  /** 0-based indices of carousel cards that need an image header at send time. */
  imageCardIndices: number[];
  mediaByIndex: Record<number, CarouselCardMediaEntry>;
  onMediaByIndexChange: (next: Record<number, CarouselCardMediaEntry>) => void;
  /** True when slides were prefilled from last-sent defaults (user can replace/remove). */
  savedDefaultsActive?: boolean;
};

export function TemplateSendCarouselMediaControls({
  imageCardIndices,
  mediaByIndex,
  onMediaByIndexChange,
  savedDefaultsActive = false,
}: Props) {
  const { toast } = useToast();
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  if (imageCardIndices.length === 0) return null;

  const onPickFile = async (cardIndex: number, file: File | null) => {
    if (!file) return;
    const mimeForCap = (file.type && file.type.trim()) || "image/jpeg";
    const cap = waUploadFileSizeCheck(mimeForCap, file.size);
    if (!cap.ok) {
      toast({
        title: "File too large",
        description: waUploadTooLargeMessage(cap.kind),
        variant: "destructive",
      });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Wrong file type",
        description: "Choose a JPG, PNG, or WebP image for this card.",
        variant: "destructive",
      });
      return;
    }
    setUploadingIndex(cardIndex);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/media/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      if (String(json.mediaType || "").toLowerCase() !== "image") {
        toast({
          title: "Wrong file type",
          description: "Choose a JPG, PNG, or WebP image for this card.",
          variant: "destructive",
        });
        return;
      }
      const url = String(json.mediaUrl || "").trim();
      if (!url || !/^https?:\/\//i.test(url)) throw new Error("Invalid upload response");
      const fn =
        typeof json.mediaFilename === "string" && json.mediaFilename.trim()
          ? json.mediaFilename.trim()
          : null;
      onMediaByIndexChange({
        ...mediaByIndex,
        [cardIndex]: { url, originalFilename: fn },
      });
      toast({ title: "Card image added", description: `Slide ${cardIndex + 1} is ready.` });
    } catch (e: unknown) {
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingIndex(null);
      const ref = fileRefs.current[cardIndex];
      if (ref) ref.value = "";
    }
  };

  const clearCard = (cardIndex: number) => {
    const next = { ...mediaByIndex };
    delete next[cardIndex];
    onMediaByIndexChange(next);
  };

  return (
    <div className="space-y-3 rounded-lg border border-amber-200/80 bg-amber-50/40 p-3 shadow-sm">
      <div className="flex flex-col gap-0.5">
        <Label className="text-sm font-medium text-gray-900">Carousel images</Label>
        <p className="text-xs text-gray-600">
          Upload one image per slide that needs a runtime image header. Carousel sending requires media for each
          card.
        </p>
        {savedDefaultsActive ? (
          <p className="text-[11px] leading-snug text-amber-900/90">
            Using your last-sent images as defaults — use Replace or Remove on any slide before sending if you need
            different media.
          </p>
        ) : null}
      </div>
      <div className="space-y-3">
        {imageCardIndices.map((cardIndex) => {
          const entry = mediaByIndex[cardIndex];
          const busy = uploadingIndex === cardIndex;
          return (
            <div
              key={cardIndex}
              className="flex flex-col gap-2 rounded-md border border-gray-200 bg-white p-2.5 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-700">
                  {cardIndex + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-800">Card {cardIndex + 1}</p>
                  {entry?.url ? (
                    <div className="mt-1 flex items-center gap-2">
                      <img
                        src={entry.url}
                        alt=""
                        className="h-12 w-20 rounded border border-gray-200 object-cover"
                      />
                      <p className="truncate text-[10px] text-gray-500" title={entry.url}>
                        Image ready
                      </p>
                    </div>
                  ) : (
                    <p className="text-[10px] text-amber-800/90">Image required</p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <input
                  ref={(el) => {
                    fileRefs.current[cardIndex] = el;
                  }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={(e) => onPickFile(cardIndex, e.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={busy}
                  onClick={() => fileRefs.current[cardIndex]?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {busy ? "Uploading…" : entry?.url ? "Replace" : "Upload"}
                </Button>
                {entry?.url ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-gray-600"
                    onClick={() => clearCard(cardIndex)}
                  >
                    <X className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-gray-600">
        <ImageIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
        <span>Each listed card must have an image before Send Template is enabled.</span>
      </div>
    </div>
  );
}
