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
 * Magazine-style featured article — narrow centered column, image spans full card width.
 */
export function BlogFeaturedCard({ post, className }: BlogFeaturedCardProps) {
  const imageUrl = resolveBlogFeaturedImageUrl(post, MARKETING_URL);

  return (
    <section
      className={cn("mx-auto w-full max-w-[800px]", className)}
      aria-label="Featured article"
    >
      <Link href={`/blog/${post.slug}`}>
        <a className="group block" data-testid="link-featured-post">
          <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm ring-1 ring-black/[0.04] transition-shadow hover:shadow-md">
            {imageUrl ? (
              <div className="w-full overflow-hidden bg-slate-50">
                <img
                  src={imageUrl}
                  alt={post.imageAlt ?? post.title}
                  width={1200}
                  height={630}
                  className="block h-auto w-full"
                  decoding="async"
                  loading="eager"
                  fetchPriority="high"
                />
              </div>
            ) : null}

            <div className="px-5 py-6 sm:px-8 sm:py-8">
              <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-gray-500">
                <span className="rounded-full bg-brand-green/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-brand-green">
                  {post.category}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {new Date(post.date).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <span className="text-gray-300" aria-hidden>
                  ·
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {post.readTime}
                </span>
              </div>

              <h2 className="font-display text-[1.625rem] font-bold leading-snug tracking-tight text-gray-900 transition-colors group-hover:text-brand-green sm:text-[1.875rem] sm:leading-tight">
                {post.title}
              </h2>

              <p className="mt-3 text-base leading-relaxed text-gray-600 line-clamp-3">
                {post.excerpt}
              </p>

              <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-green transition-all group-hover:gap-2.5">
                Read article
                <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
            </div>
          </article>
        </a>
      </Link>
    </section>
  );
}
