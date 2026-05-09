import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { extractSortedPlaceholders, type TemplateRowForMetaSend } from "@shared/metaTemplateSend";
import { Upload, Image as ImageIcon, Video, FileIcon, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type TemplateSendMediaControlsTemplate = Pick<
  TemplateRowForMetaSend,
  "headerType" | "headerContent"
>;

function headerMediaPlaceholderKeys(headerContent: string | null | undefined): string[] {
  return extractSortedPlaceholders(headerContent);
}

function uploadMediaTypeMatchesHeader(headerType: string, uploadMediaType: string): boolean {
  const h = headerType.toLowerCase();
  const u = (uploadMediaType || "").toLowerCase();
  if (h === "image") return u === "image";
  if (h === "video") return u === "video";
  if (h === "document") return u === "document";
  return false;
}

function inputAcceptForHeader(headerType: string): string {
  const h = headerType.toLowerCase();
  if (h === "image") return "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
  if (h === "video") return "video/mp4,.mp4";
  if (h === "document") return "application/pdf,.pdf";
  return "*/*";
}

function recentItemMatchesHeader(
  headerType: string,
  item: { mediaType?: string | null; contentType?: string | null }
): boolean {
  const h = headerType.toLowerCase();
  const mt = (item.mediaType || "").toLowerCase();
  const ct = (item.contentType || "").toLowerCase();
  if (h === "image") {
    return mt === "image" || ct === "image" || ct.startsWith("image/");
  }
  if (h === "video") {
    return mt === "video" || ct === "video" || ct.startsWith("video/");
  }
  if (h === "document") {
    return (
      mt === "document" ||
      ct === "document" ||
      ct.includes("pdf") ||
      ct.startsWith("application/")
    );
  }
  return false;
}

type RecentMediaItem = {
  url: string;
  mediaType: string | null;
  contentType: string | null;
  mediaFilename: string | null;
};

/**
 * Upload or pick CRM chat media for WhatsApp templates whose header needs an image, video, or PDF link.
 * Shared structure can later feed carousel cards or automation steps.
 */
export function TemplateSendMediaControls(props: {
  template: TemplateSendMediaControlsTemplate;
  chatId: string;
  variableValues: Record<string, string>;
  onVariableValuesChange: Dispatch<SetStateAction<Record<string, string>>>;
  optionalHeaderMediaUrl: string | null;
  onOptionalHeaderMediaUrlChange: (url: string | null) => void;
}) {
  const { template, chatId, variableValues, onVariableValuesChange, optionalHeaderMediaUrl, onOptionalHeaderMediaUrlChange } =
    props;
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const ht = (template.headerType || "").toLowerCase();
  const hc = (template.headerContent || "").trim();

  if (!["image", "video", "document"].includes(ht)) {
    return null;
  }

  const placeholderKeys = headerMediaPlaceholderKeys(template.headerContent);
  const staticHttpsHeader = hc && /^https?:\/\//i.test(hc) && placeholderKeys.length === 0;

  const { data: recentData } = useQuery<{ items: RecentMediaItem[] }>({
    queryKey: ["/api/templates/recent-media", chatId],
    queryFn: async () => {
      const res = await fetch(`/api/templates/recent-media?chatId=${encodeURIComponent(chatId)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load recent media");
      return res.json();
    },
    enabled: !!chatId,
    staleTime: 30_000,
  });

  const recentFiltered =
    recentData?.items?.filter((it) => recentItemMatchesHeader(ht, it)) ?? [];

  const applyMediaUrl = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed || !/^https?:\/\//i.test(trimmed)) return;
    if (placeholderKeys.length > 0) {
      const primary = placeholderKeys[0];
      onVariableValuesChange((prev) => ({ ...prev, [primary]: trimmed }));
      onOptionalHeaderMediaUrlChange(null);
    } else {
      onOptionalHeaderMediaUrlChange(trimmed);
    }
  };

  const clearMedia = () => {
    if (placeholderKeys.length > 0) {
      const primary = placeholderKeys[0];
      onVariableValuesChange((prev) => {
        const next = { ...prev };
        for (const k of placeholderKeys) {
          delete next[k];
        }
        return next;
      });
    } else {
      onOptionalHeaderMediaUrlChange(null);
    }
  };

  const currentDirectUrl = optionalHeaderMediaUrl?.trim() || null;
  const primaryPh = placeholderKeys[0];
  const currentFromVariable =
    primaryPh && String(variableValues[primaryPh] ?? "").trim()
      ? String(variableValues[primaryPh]).trim()
      : null;
  const hasMediaSelected = Boolean(currentDirectUrl || currentFromVariable);

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum size is 16 MB.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
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

      if (!uploadMediaTypeMatchesHeader(ht, json.mediaType)) {
        toast({
          title: "Wrong file type",
          description:
            ht === "image"
              ? "Choose a JPG, PNG, or WebP image."
              : ht === "video"
                ? "Choose an MP4 video."
                : "Choose a PDF file.",
          variant: "destructive",
        });
        return;
      }
      applyMediaUrl(json.mediaUrl);
      toast({ title: "Added", description: "Your file is ready to send." });
    } catch (e: unknown) {
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const headerKindLabel =
    ht === "image" ? "Image" : ht === "video" ? "Video" : "Document";

  const MediaGlyph = ht === "image" ? ImageIcon : ht === "video" ? Video : FileIcon;

  if (staticHttpsHeader) {
    return (
      <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 text-sm text-gray-600">
        <div className="flex items-center gap-2 font-medium text-gray-800">
          <MediaGlyph className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
          {headerKindLabel} is set in WhatsApp Manager
        </div>
        <p className="mt-1 text-xs text-gray-500">
          This template already includes fixed media. No upload is needed before sending.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-0.5">
        <Label className="text-sm font-medium text-gray-900">{headerKindLabel} for this send</Label>
        <p className="text-xs text-gray-500">
          Upload a file or pick something you already shared in this chat. Your customer sees this in the message
          header.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={inputAcceptForHeader(ht)}
          className="hidden"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "Uploading…" : "Upload"}
        </Button>
        {hasMediaSelected ? (
          <Button type="button" variant="ghost" size="sm" className="gap-1 text-gray-600" onClick={clearMedia}>
            <X className="h-3.5 w-3.5" />
            Remove
          </Button>
        ) : null}
      </div>

      {recentFiltered.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">From this chat</p>
          <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto pr-0.5">
            {recentFiltered.map((item) => (
              <button
                key={item.url}
                type="button"
                className="max-w-[200px] truncate rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-left text-[11px] text-gray-700 hover:bg-gray-100"
                title={item.url}
                onClick={() => applyMediaUrl(item.url)}
              >
                {item.mediaFilename?.trim() || item.url.split("/").pop() || "Media"}
              </button>
            ))}
          </div>
        </div>
      ) : recentData && recentFiltered.length === 0 ? (
        <p className="text-[11px] text-gray-400">No matching files in this chat yet. Upload one above.</p>
      ) : null}
    </div>
  );
}
