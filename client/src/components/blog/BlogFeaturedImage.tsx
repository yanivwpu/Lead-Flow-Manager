import { cn } from "@/lib/utils";

type BlogFeaturedImageProps = {
  src: string;
  alt: string;
  /** When true, hints LCP priority for above-the-fold hero usage */
  priority?: boolean;
  className?: string;
  /**
   * `card` — blog index listing (full graphic visible, height-capped).
   * `article` — individual post hero (full graphic, rounded frame).
   */
  variant?: "card" | "article";
};

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

export function BlogFeaturedImage({
  src,
  alt,
  priority = false,
  className,
  variant = "article",
}: BlogFeaturedImageProps) {
  const imgProps = {
    src,
    alt,
    width: OG_WIDTH,
    height: OG_HEIGHT,
    decoding: "async" as const,
    loading: (priority ? "eager" : "lazy") as "eager" | "lazy",
    fetchPriority: (priority ? "high" : "auto") as "high" | "auto",
  };

  if (variant === "card") {
    return (
      <div
        className={cn(
          "flex w-full items-center justify-center overflow-hidden",
          "bg-gradient-to-b from-slate-50 to-slate-100/80",
          "aspect-video max-h-[200px] sm:max-h-[260px]",
          className,
        )}
      >
        <img
          {...imgProps}
          className="h-full w-full object-contain object-center"
        />
      </div>
    );
  }

  return (
    <figure
      className={cn(
        "mb-8 w-full overflow-hidden rounded-2xl border border-gray-100",
        "bg-gradient-to-b from-slate-50 to-slate-100/80 shadow-sm",
        className,
      )}
    >
      <img
        {...imgProps}
        className="mx-auto block w-full max-w-full object-contain object-center"
      />
    </figure>
  );
}
