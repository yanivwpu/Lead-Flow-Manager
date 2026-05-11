import { useMemo, useState, type ReactNode } from "react";
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
  /** Smaller carousel thumbnail strip (e.g. inbox CRM bubble). Main card media unchanged. */
  carouselStripScale = "default",
  /** When previews use persisted default card images, remind users they can replace before send. */
  savedCarouselDefaultsHint = false,
  /** In-chat outbound bubble: tighter strip/main/body rhythm without changing thumb size or media aspect. */
  carouselInBubbleTight = false,
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
  carouselStripScale?: "default" | "compact";
  savedCarouselDefaultsHint?: boolean;
  carouselInBubbleTight?: boolean;
}) {
  const ht = (template.headerType || "").toLowerCase();
  const hc = (template.headerContent || "").trim();
  const tt = (template.templateType || "").toLowerCase();
  const cards = Array.isArray(template.carouselCards) ? template.carouselCards : [];
  const [carouselIndex, setCarouselIndex] = useState(0);

  const carouselMediaUrls = useMemo(() => {
    const isCarouselLayout = tt === "carousel" || cards.length > 0;
    if (!isCarouselLayout || !cards.length) {
      return [] as (string | null)[];
    }
    return cards.map((raw, idx) => {
      const card = raw as { headerUrl?: string };
      const override = (livePreview?.carouselCardMediaUrls?.[idx] || "").trim();
      if (override && /^https?:\/\//i.test(override)) return override;
      const hu = card.headerUrl ? String(card.headerUrl).trim() : "";
      if (hu && /^https?:\/\//i.test(hu)) return hu;
      return null;
    });
  }, [tt, cards, livePreview?.carouselCardMediaUrls]);
  const pad = density === "compact" ? "p-2.5" : "p-4";
  const mediaRounded = "rounded-xl border border-gray-200/80 bg-gradient-to-b from-gray-50 to-white overflow-hidden";
  const isLibraryCard = variant === "libraryCard";
  const stripCompact = carouselStripScale === "compact";
  const carouselTight =
    carouselInBubbleTight && (tt === "carousel" || cards.length > 0) && cards.length > 0;

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
    const card = cards[carouselIndex] as {
      headerUrl?: string;
      bodyText?: string;
      headerFormat?: string;
      buttons?: unknown[];
      documentDisplayName?: string;
      originalFilename?: string;
    };
    const cardFmt = (card.headerFormat || "image").toLowerCase();
    const cardMediaSrc = carouselMediaUrls[carouselIndex] ?? null;
    const docTitle =
      (card.documentDisplayName || "").trim() ||
      (cardMediaSrc
        ? (() => {
            try {
              const seg = new URL(cardMediaSrc).pathname.split("/").filter(Boolean).pop();
              return seg ? decodeURIComponent(seg) : "Document";
            } catch {
              return "Document";
            }
          })()
        : "Document");
    const cardButtons = Array.isArray(card.buttons) ? card.buttons : [];

    const cardMediaInner =
      cardMediaSrc && (cardFmt === "image" || !["video", "document"].includes(cardFmt)) ? (
        <img
          src={cardMediaSrc}
          alt=""
          className={cn("w-full object-cover", isLibraryCard ? "max-h-24" : "max-h-40")}
          onError={() => onHeaderMediaError?.()}
        />
      ) : cardMediaSrc && cardFmt === "video" ? (
        <video
          src={cardMediaSrc}
          className={cn("w-full bg-black object-contain", isLibraryCard ? "max-h-24" : "max-h-40")}
          controls={!isLibraryCard}
          muted={isLibraryCard}
          playsInline
          preload="metadata"
          onError={() => onHeaderMediaError?.()}
        />
      ) : cardMediaSrc && cardFmt === "document" ? (
        <div
          className={cn(
            "flex items-center gap-2 border-b border-gray-200/80 bg-white/90",
            isLibraryCard ? "px-2 py-2" : pad
          )}
        >
          <FileIcon className="h-5 w-5 shrink-0 text-gray-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-900">{docTitle}</p>
            <a
              href={cardMediaSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-emerald-700 underline-offset-2 hover:underline"
            >
              Open
            </a>
          </div>
        </div>
      ) : isLibraryCard ? (
        <div className="flex items-center gap-2 border-b border-gray-200/80 bg-gray-50/90 px-2.5 py-2">
          <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
          <span className="text-[11px] font-medium leading-tight text-gray-600">
            Media per card at send
          </span>
        </div>
      ) : (
        <div className="flex min-h-[100px] flex-col items-center justify-center gap-1 bg-gray-100 px-3 py-4 text-center">
          <LayoutGrid className="h-8 w-8 text-gray-400" aria-hidden />
          <span className="text-xs font-medium text-gray-600">No card media to preview</span>
          <span className="text-[11px] text-gray-500">
            Upload or link media when sending if this card requires it.
          </span>
        </div>
      );

    const stripGap = carouselTight ? "gap-1" : "gap-1.5";
    const stripPb = carouselTight ? "pb-0" : "pb-0.5";
    const cardBodyPad = carouselTight ? "px-2.5 pt-1.5 pb-2" : pad;
    const cardBodyStack = carouselTight ? "space-y-0.5" : "space-y-1";

    mediaBlock = (
      <div className={carouselTight ? "space-y-1" : "space-y-2"}>
        {cards.length > 1 ? (
          <div className={cn("-mx-0.5 flex overflow-x-auto px-0.5", stripGap, stripPb)}>
            {cards.map((c, idx) => {
              const u = carouselMediaUrls[idx];
              const fmt = (
                String((c as { headerFormat?: string }).headerFormat || "image") || "image"
              ).toLowerCase();
              const isSel = idx === carouselIndex;
              return (
                <button
                  type="button"
                  key={idx}
                  onClick={() => setCarouselIndex(idx)}
                  className={cn(
                    "relative h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-md border-2 bg-gray-100 transition-colors",
                    isSel
                      ? "border-emerald-600 ring-1 ring-emerald-500/30"
                      : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  {u && (fmt === "image" || !["video", "document"].includes(fmt)) ? (
                    <img src={u} alt="" className="h-full w-full object-cover" />
                  ) : u && fmt === "video" ? (
                    <div className="flex h-full w-full items-center justify-center bg-black">
                      <Video className="h-5 w-5 text-white" aria-hidden />
                    </div>
                  ) : u && fmt === "document" ? (
                    <div className="flex h-full w-full items-center justify-center bg-gray-50">
                      <FileIcon className="h-5 w-5 text-gray-600" aria-hidden />
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-1 text-center text-[9px] leading-tight text-gray-500">
                      {idx + 1}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className={mediaRounded}>
          <div className="relative bg-gray-100">
            {cardMediaInner}
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
          <div className={`${cardBodyPad} ${cardBodyStack}`}>
            <p className="text-sm text-gray-800">{card?.bodyText || "—"}</p>
            {cardButtons.length > 0 ? (
              <div className={cn("flex flex-wrap", carouselTight ? "gap-1 pt-0" : "gap-1.5 pt-0.5")}>
                {cardButtons.map((btn: Record<string, unknown>, bi: number) => (
                  <Badge
                    key={bi}
                    variant="outline"
                    className="border-orange-200/90 bg-orange-50/90 text-[10px] font-normal text-orange-950"
                  >
                    {String(btn.text ?? btn.title ?? `Button ${bi + 1}`)}
                  </Badge>
                ))}
              </div>
            ) : null}
            <p className={cn("text-gray-500", carouselTight ? "text-[10px] leading-tight" : "text-[11px]")}>
              Card {carouselIndex + 1} of {cards.length}
            </p>
            {savedCarouselDefaultsHint ? (
              <p className="text-[10px] leading-snug text-amber-900/85">
                Preview uses saved default card images. Replace or remove any slide before sending if you need a
                different asset.
              </p>
            ) : null}
          </div>
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
      <div className={cn("flex flex-wrap gap-2", carouselTight ? "mx-1.5 pt-0.5" : "pt-1")}>
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

  const mainBodyPad =
    carouselTight ? "p-2.5" : density === "compact" ? "p-3" : "p-4";
  const mediaBlockBottom = carouselTight ? "mb-1.5" : isLibraryCard ? "mb-2" : "mb-3";

  return (
    <div className={className}>
      {mediaBlock ? (
        <div className={cn("space-y-2", mediaBlockBottom)}>{mediaBlock}</div>
      ) : null}
      <div
        className={cn(
          "rounded-xl border border-gray-100 bg-gray-50/90",
          mainBodyPad,
          carouselTight && "mx-1.5"
        )}
      >
        <p
          className={cn(
            "whitespace-pre-wrap text-sm text-gray-800",
            carouselTight ? "leading-snug" : "leading-relaxed"
          )}
        >
          {displayBodyText}
        </p>
        {template.footerText ? (
          <p className={cn("text-xs text-gray-500", carouselTight ? "mt-1" : "mt-2")}>
            {template.footerText}
          </p>
        ) : null}
      </div>
      {btnRow}
    </div>
  );
}
