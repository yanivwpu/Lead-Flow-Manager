import { cn } from "@/lib/utils";

type BlogFeaturedImageProps = {
  src: string;
  alt: string;
  /** When true, hints LCP priority for above-the-fold hero usage */
  priority?: boolean;
  className?: string;
};

export function BlogFeaturedImage({ src, alt, priority = false, className }: BlogFeaturedImageProps) {
  return (
    <figure
      className={cn(
        "mb-8 overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 shadow-sm",
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        width={1200}
        height={630}
        className="aspect-[1200/630] w-full object-cover"
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
    </figure>
  );
}
