import { useCallback, useEffect, useState } from "react";
import { X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarketingScreenshotMeta } from "@shared/marketingScreenshots";

type Props = MarketingScreenshotMeta & {
  className?: string;
  priority?: boolean;
  /** Hero screenshots are larger with premium framing for above-the-fold use. */
  variant?: "default" | "hero";
};

export function MarketingScreenshot({
  src,
  alt,
  caption,
  title,
  figure,
  width = 1400,
  height = 900,
  className,
  priority = false,
  variant = "default",
}: Props) {
  const isHero = variant === "hero";
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
    caption ??
    (figure != null ? `Figure ${figure}. ${alt}` : undefined);

  return (
    <>
      <figure
        className={cn(
          isHero ? "mx-auto my-0 w-full max-w-[1150px]" : "my-10",
          className,
        )}
      >
        {title ? (
          <p
            className={cn(
              "font-semibold text-gray-800",
              isHero ? "mb-3 text-center text-base md:text-lg" : "mb-2 text-sm",
            )}
          >
            {title}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "group relative block w-full overflow-hidden bg-gray-50 text-left transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2",
            isHero
              ? "rounded-2xl border border-gray-200/80 shadow-lg shadow-gray-200/50 hover:shadow-xl"
              : "rounded-xl border border-gray-200 shadow-sm hover:shadow-md",
          )}
          aria-label={`Enlarge: ${alt}`}
        >
          <img
            src={src}
            alt={alt}
            width={width}
            height={height}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className="w-full object-contain"
          />
          <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-gray-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <ZoomIn className="h-3.5 w-3.5" />
            Click to enlarge
          </span>
        </button>
        {figCaption ? (
          <figcaption
            className={cn(
              "leading-relaxed text-gray-600",
              isHero
                ? "mt-4 text-center text-sm md:text-base"
                : "mt-3 text-center text-sm",
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
            className="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
