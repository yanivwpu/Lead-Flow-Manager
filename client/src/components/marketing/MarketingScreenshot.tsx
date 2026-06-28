import { useCallback, useEffect, useState } from "react";
import { X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarketingScreenshotMeta, MarketingScreenshotSize } from "@shared/marketingScreenshots";
import { screenshotDisplayWidth } from "@shared/marketingScreenshots";

type Props = MarketingScreenshotMeta & {
  className?: string;
  priority?: boolean;
  /** @deprecated Use `size` on meta instead. */
  variant?: "default" | "hero";
  captionAlign?: "center" | "left";
};

const FRAME =
  "overflow-hidden rounded-xl border border-gray-200/80 bg-gray-50 shadow-md shadow-gray-200/40 transition-shadow hover:shadow-lg";

export function MarketingScreenshot({
  src,
  alt,
  caption,
  title,
  figure,
  width,
  height,
  size: sizeProp,
  className,
  priority = false,
  variant,
  captionAlign = "center",
}: Props) {
  const size: MarketingScreenshotSize =
    sizeProp ?? (variant === "hero" ? "hero" : "content");
  const nativeWidth = width ?? 640;
  const nativeHeight = height ?? Math.round(nativeWidth * 0.62);
  const displayWidth = screenshotDisplayWidth(nativeWidth, size);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  const figCaption =
    caption ?? (figure != null ? `Figure ${figure}. ${alt}` : undefined);

  return (
    <>
      <figure
        className={cn("mx-auto w-full", className)}
        style={{ maxWidth: displayWidth }}
      >
        {title ? (
          <p
            className={cn(
              "mb-2 text-sm font-semibold text-gray-800",
              captionAlign === "center" && "text-center",
            )}
          >
            {title}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "group relative block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2",
            FRAME,
          )}
          aria-label={`Enlarge: ${alt}`}
        >
          <img
            src={src}
            alt={alt}
            width={nativeWidth}
            height={nativeHeight}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className="mx-auto block h-auto w-full max-w-full object-contain"
            style={{ maxWidth: displayWidth }}
          />
          <span className="pointer-events-none absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-gray-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <ZoomIn className="h-3 w-3" />
            Enlarge
          </span>
        </button>
        {figCaption ? (
          <figcaption
            className={cn(
              "mt-2.5 text-xs leading-relaxed text-gray-500",
              captionAlign === "center" ? "text-center" : "text-left",
            )}
          >
            {figCaption}
          </figcaption>
        ) : null}
      </figure>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 md:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close enlarged image"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={src}
            alt={alt}
            width={nativeWidth}
            height={nativeHeight}
            className="max-h-[90vh] rounded-lg object-contain shadow-2xl"
            style={{ maxWidth: nativeWidth }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
