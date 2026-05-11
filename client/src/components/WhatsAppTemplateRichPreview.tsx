import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Image, Video, FileIcon, LayoutGrid } from "lucide-react";
import { extractSortedPlaceholders, looksLikeOpaqueStorageFilename } from "@shared/metaTemplateSend";

/** Minimal shape for UI preview only — mirrors template rows from `/api/templates`. */
export type WhatsAppRichPreviewTemplate = {
  name: string;
  templateType?: string | null;
  bodyText?: string | null;
  headerType?: string | null;
  headerContent?: string | null;
  footerText?: string | null;
  buttons?: unknown[] | null;
  carouselCards?: unknown[] | null;
};

/** Resolved copy + media for send-review — mirrors what Meta will deliver when variables and assets are set. */
export type WhatsAppTemplateLivePreview = {
  bodyText?: string | null;
  headerTextResolved?: string | null;
  headerMediaUrl?: string | null;
  /** Customer-facing document title (not storage URL tail). */
  headerDocumentDisplayName?: string | null;
  /** Runtime carousel card image URLs keyed by 0-based card index. */
  carouselCardMediaUrls?: Record<number, string> | null;
};

export function templateCarouselCardCount(template: WhatsAppRichPreviewTemplate): number {
  return Array.isArray(template.carouselCards) ? template.carouselCards.length : 0;
}

/** Compact pill for cards / modal headers: carousel vs media vs plain. */
export function TemplateShapeIndicator({ template }: { template: WhatsAppRichPreviewTemplate }) {
  const tt = (template.templateType || "").toLowerCase();
  const n = templateCarouselCardCount(template);
  if (tt === "carousel" || n > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-900">
        <LayoutGrid className="h-3 w-3 shrink-0" aria-hidden />
        Carousel{n > 0 ? ` · ${n} cards` : ""}
      </span>
    );
  }
  if (tt === "media") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-700">
        <Image className="h-3 w-3 shrink-0" aria-hidden />
        Media header
      </span>
    );
  }
  return null;
}

/** Compact library-grid hint — send-time media is chosen per contact in the send modal. */
function LibraryCardMediaHintRow({
  kind,
  className,
}: {
  kind: "image" | "video" | "document";
  className?: string;
}) {
  const Icon = kind === "image" ? Image : kind === "video" ? Video : FileIcon;
  const label =
    kind === "image"
      ? "Image required at send"
      : kind === "video"
        ? "Video required at send"
        : "Document required at send";
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-gray-200/90 bg-gray-50/90 px-2.5 py-1.5 text-left",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
      <span className="text-[11px] font-medium leading-tight text-gray-600">{label}</span>
    </div>
  );
}

/**
 * Soft header/media strip + body + CTA chips — used in template library cards and modals.
 */
export function WhatsAppTemplateRichPreview({
  template,
  className,
  density = "comfortable",
  variant = "default",
  livePreview,
  onHeaderMediaError,
}: {
  template: WhatsAppRichPreviewTemplate;
  className?: string;
  /** Cards use tighter vertical rhythm; modals use more padding. */
  density?: "compact" | "comfortable";
  /**
   * `libraryCard`: compact media-shape hints on WhatsApp Library grid cards (no large empty placeholders).
   * Send modal should use default `variant`.
   */
  variant?: "default" | "libraryCard";
  livePreview?: WhatsAppTemplateLivePreview | null;
  /** Fires when image/video/document URL fails to load (broken link or blocked asset). */
  onHeaderMediaError?: () => void;
}) {
  const ht = (template.headerType || "").toLowerCase();
  const hc = (template.headerContent || "").trim();
  const tt = (template.templateType || "").toLowerCase();
  const cards = Array.isArray(template.carouselCards) ? template.carouselCards : [];
  const [carouselIndex, setCarouselIndex] = useState(0);
  const pad = density === "compact" ? "p-2.5" : "p-4";
  const mediaRounded = "rounded-xl border border-gray-200/80 bg-gradient-to-b from-gray-50 to-white overflow-hidden";
  const isLibraryCard = variant === "libraryCard";

  const liveMedia = (livePreview?.headerMediaUrl || "").trim();
  const displayMediaUrl =
    liveMedia && /^https?:\/\//i.test(liveMedia)
      ? liveMedia
      : ["image", "video", "document"].includes(ht) &&
          hc &&
          /^https?:\/\//i.test(hc) &&
          extractSortedPlaceholders(hc).length === 0
        ? hc
        : null;

  const displayBodyText = (livePreview?.bodyText ?? template.bodyText) || "—";

  let mediaBlock: ReactNode = null;

  if (tt === "carousel" && cards.length > 0) {
    const card = cards[carouselIndex] as { headerUrl?: string; bodyText?: string };
    const overrideUrl = (livePreview?.carouselCardMediaUrls?.[carouselIndex] || "").trim();
    const cardImgSrc =
      overrideUrl && /^https?:\/\//i.test(overrideUrl)
        ? overrideUrl
        : card?.headerUrl && /^https?:\/\//i.test(String(card.headerUrl).trim())
          ? String(card.headerUrl).trim()
          : null;
    mediaBlock = (
      <div className={mediaRounded}>
        <div className="relative bg-gray-100">
          {cardImgSrc ? (
            <img
              src={cardImgSrc}
              alt=""
              className={cn("w-full object-cover", isLibraryCard ? "max-h-24" : "max-h-40")}
            />
          ) : isLibraryCard ? (
            <div className="flex items-center gap-2 border-b border-gray-200/80 bg-gray-50/90 px-2.5 py-2">
              <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
              <span className="text-[11px] font-medium leading-tight text-gray-600">
                Media per card at send
              </span>
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center bg-gray-100">
              <Image className="h-10 w-10 text-gray-400" aria-hidden />
            </div>
          )}
          {cards.length > 1 ? (
            <div className="absolute bottom-2 right-2 flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-7 w-7 bg-white/90 shadow-sm"
                disabled={carouselIndex === 0}
                onClick={() => setCarouselIndex((i) => Math.max(0, i - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-7 w-7 bg-white/90 shadow-sm"
                disabled={carouselIndex === cards.length - 1}
                onClick={() => setCarouselIndex((i) => Math.min(cards.length - 1, i + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
        <div className={`${pad} space-y-1`}>
          <p className="text-sm text-gray-800">{card?.bodyText || "—"}</p>
          <p className="text-[11px] text-gray-500">
            Card {carouselIndex + 1} of {cards.length}
          </p>
        </div>
      </div>
    );
  } else if (ht === "image") {
    if (displayMediaUrl) {
      mediaBlock = (
        <div className={mediaRounded}>
          <img
            src={displayMediaUrl}
            alt=""
            className={cn(
              "w-full object-cover",
              isLibraryCard ? "max-h-20" : "max-h-44"
            )}
            onError={() => onHeaderMediaError?.()}
          />
        </div>
      );
    } else if (isLibraryCard) {
      mediaBlock = <LibraryCardMediaHintRow kind="image" />;
    } else {
      mediaBlock = (
        <div
          className={`${mediaRounded} flex min-h-[88px] items-center justify-center gap-2 ${pad} text-sm text-gray-500`}
        >
          <Image className="h-8 w-8 shrink-0 text-gray-400" aria-hidden />
          <span>Image header</span>
        </div>
      );
    }
  } else if (ht === "video") {
    if (displayMediaUrl) {
      mediaBlock = (
        <div className={mediaRounded}>
          <video
            src={displayMediaUrl}
            className={cn(
              "w-full bg-black object-contain",
              isLibraryCard ? "max-h-20" : "max-h-44"
            )}
            controls={!isLibraryCard}
            muted={isLibraryCard}
            playsInline
            preload="metadata"
            onError={() => onHeaderMediaError?.()}
          />
        </div>
      );
    } else if (isLibraryCard) {
      mediaBlock = <LibraryCardMediaHintRow kind="video" />;
    } else {
      mediaBlock = (
        <div
          className={`${mediaRounded} flex min-h-[88px] items-center justify-center gap-2 ${pad} text-sm text-gray-500`}
        >
          <Video className="h-6 w-6 shrink-0 text-gray-400" aria-hidden />
          <span>Video header</span>
        </div>
      );
    }
  } else if (ht === "document") {
    if (displayMediaUrl) {
      const tail = (() => {
        try {
          const u = new URL(displayMediaUrl);
          const seg = u.pathname.split("/").filter(Boolean).pop();
          return seg ? decodeURIComponent(seg) : "Document";
        } catch {
          return "Document";
        }
      })();
      const docTitle =
        (livePreview?.headerDocumentDisplayName || "").trim() ||
        (!looksLikeOpaqueStorageFilename(tail) ? tail : "Document");
      mediaBlock = isLibraryCard ? (
        <div
          className={cn(
            mediaRounded,
            "flex items-center gap-2 py-2 pl-2 pr-2.5"
          )}
        >
          <FileIcon className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium text-gray-800">{docTitle}</p>
            <p className="text-[10px] text-gray-500">Approved file in WhatsApp Manager</p>
          </div>
        </div>
      ) : (
        <div className={`${mediaRounded} flex items-center gap-3 ${pad}`}>
          <FileIcon className="h-8 w-8 shrink-0 text-gray-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">{docTitle}</p>
            <a
              href={displayMediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-700 underline-offset-2 hover:underline"
            >
              Open link
            </a>
          </div>
        </div>
      );
    } else if (isLibraryCard) {
      mediaBlock = <LibraryCardMediaHintRow kind="document" />;
    } else {
      mediaBlock = (
        <div
          className={`${mediaRounded} flex items-center gap-2 border-dashed ${pad} text-sm text-gray-500`}
        >
          <FileIcon className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
          <span>Document attachment</span>
        </div>
      );
    }
  } else if (ht === "text" && tt !== "carousel") {
    const headerShow = (livePreview?.headerTextResolved ?? hc).trim();
    if (headerShow) {
      mediaBlock = (
        <div className={`rounded-xl border border-gray-200 bg-white ${pad} text-sm font-semibold text-gray-900`}>
          {headerShow}
        </div>
      );
    }
  }

  const buttons = Array.isArray(template.buttons) ? template.buttons : [];
  const btnRow =
    buttons.length > 0 ? (
      <div className="flex flex-wrap gap-2 pt-1">
        {buttons.map((btn: Record<string, unknown>, i: number) => (
          <Badge
            key={i}
            variant="outline"
            className="border-orange-200/90 bg-orange-50/90 text-[11px] font-normal text-orange-950"
          >
            {String(btn.text ?? btn.title ?? `Button ${i + 1}`)}
          </Badge>
        ))}
      </div>
    ) : null;

  return (
    <div className={className}>
      {mediaBlock ? (
        <div className={cn("space-y-2", isLibraryCard ? "mb-2" : "mb-3")}>{mediaBlock}</div>
      ) : null}
      <div className={`rounded-xl border border-gray-100 bg-gray-50/90 ${density === "compact" ? "p-3" : "p-4"}`}>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
          {displayBodyText}
        </p>
        {template.footerText ? (
          <p className="mt-2 text-xs text-gray-500">{template.footerText}</p>
        ) : null}
      </div>
      {btnRow}
    </div>
  );
}
