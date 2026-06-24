import { Helmet } from "react-helmet";
import {
  resolveBlogImageAlt,
  resolveBlogFeaturedImageUrl,
  resolveBlogOgImage,
  type BlogPostMeta,
} from "@shared/blogPosts";
import { MARKETING_URL } from "@/lib/marketingUrl";

type BlogPostSocialMetaProps = {
  post: BlogPostMeta;
  shareUrl: string;
  pageTitle: string;
  faqSchema?: Record<string, unknown>;
};

export function BlogPostSocialMeta({ post, shareUrl, pageTitle, faqSchema }: BlogPostSocialMetaProps) {
  const ogImage = resolveBlogOgImage(post, MARKETING_URL);
  const imageAlt = resolveBlogImageAlt(post);
  const featuredImageUrl = resolveBlogFeaturedImageUrl(post, MARKETING_URL);

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={post.excerpt} />
      {post.keywords ? <meta name="keywords" content={post.keywords} /> : null}
      <meta property="og:title" content={post.seoTitle ?? post.title} />
      <meta property="og:description" content={post.excerpt} />
      <meta property="og:type" content="article" />
      <meta property="og:url" content={shareUrl} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:secure_url" content={ogImage} />
      <meta property="og:image:alt" content={imageAlt} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={post.seoTitle ?? post.title} />
      <meta name="twitter:description" content={post.excerpt} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content={imageAlt} />
      <link rel="canonical" href={shareUrl} />
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.excerpt,
          datePublished: post.date,
          image: featuredImageUrl ? [featuredImageUrl] : [ogImage],
          author: {
            "@type": "Organization",
            name: "WhachatCRM",
          },
          publisher: {
            "@type": "Organization",
            name: "WhachatCRM",
            url: MARKETING_URL,
          },
        })}
      </script>
      {faqSchema ? (
        <script type="application/ld+json">
          {JSON.stringify(faqSchema)}
        </script>
      ) : null}
    </Helmet>
  );
}
