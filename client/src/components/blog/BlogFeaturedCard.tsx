import { Link } from "wouter";
import { Calendar, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BlogPostMeta } from "@shared/blogPosts";
import { resolveBlogFeaturedImageUrl } from "@shared/blogPosts";
import { MARKETING_URL } from "@/lib/marketingUrl";

type BlogFeaturedCardProps = {
  post: BlogPostMeta;
  className?: string;
};

/**
 * Compact magazine-style featured article for the blog index.
 * Image scales with card width (full graphic, no crop).
 */
export function BlogFeaturedCard({ post, className }: BlogFeaturedCardProps) {
  const imageUrl = resolveBlogFeaturedImageUrl(post, MARKETING_URL);
  const articleHref = `/blog/${post.slug}`;

  return (
    <section
      className={cn("mx-auto w-full max-w-[600px] sm:max-w-[620px]", className)}
      aria-label="Featured article"
    >
      <article className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ring-1 ring-black/[0.04] transition-shadow hover:shadow-md sm:rounded-2xl">
        {imageUrl ? (
          <Link href={articleHref}>
            <a
              className="group/image block w-full bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
              data-testid="link-featured-post-image"
              aria-label={`Read article: ${post.title}`}
            >
              <img
                src={imageUrl}
                alt={post.imageAlt ?? post.title}
                width={1200}
                height={630}
                className="block h-auto w-full transition-opacity group-hover/image:opacity-95"
                decoding="async"
                loading="eager"
                fetchPriority="high"
              />
            </a>
          </Link>
        ) : null}

        <Link href={articleHref}>
          <a className="group block" data-testid="link-featured-post">
            <div className="px-4 py-4 sm:px-6 sm:py-5">
              <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-gray-500 sm:text-sm">
                <span className="rounded-full bg-brand-green/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-green sm:text-xs">
                  {post.category}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
                  {new Date(post.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <span className="text-gray-300" aria-hidden>
                  ·
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
                  {post.readTime}
                </span>
              </div>

              <h2 className="font-display text-xl font-bold leading-snug tracking-tight text-gray-900 transition-colors group-hover:text-brand-green sm:text-2xl sm:leading-tight">
                {post.title}
              </h2>

              <p className="mt-2 text-sm leading-relaxed text-gray-600 line-clamp-2 sm:text-[15px]">
                {post.excerpt}
              </p>

              <span className="mt-3.5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-green transition-all group-hover:gap-2">
                Read article
                <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
              </span>
            </div>
          </a>
        </Link>
      </article>
    </section>
  );
}
