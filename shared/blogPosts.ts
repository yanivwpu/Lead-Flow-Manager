/**
 * Single source of truth for public blog post metadata.
 * Add `featuredImage` (and optional `ogImage`, `imageAlt`) per cornerstone article — no code changes elsewhere.
 */

export const DEFAULT_BLOG_OG_IMAGE_PATH = "/og/og-whachatcrm.png?v=3";

export interface BlogPostMeta {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  readTime: string;
  date: string;
  /** Path under marketing origin, e.g. `/og/blog/my-post.png` */
  featuredImage?: string;
  /** Defaults to `featuredImage` when omitted */
  ogImage?: string;
  /** Alt text for featured + OG image; defaults to `title` */
  imageAlt?: string;
  featured?: boolean;
  /** Optional document title (≤60 chars recommended). */
  seoTitle?: string;
  keywords?: string;
  /** @deprecated Use `featuredImage` */
  image?: string;
}

export const BLOG_POSTS: BlogPostMeta[] = [
  {
    slug: "realtor-growth-engine-complete-guide",
    title: "What Is the Realtor Growth Engine (RGE)? The Complete Guide for Modern Real Estate Agents",
    excerpt:
      "Learn what the Realtor Growth Engine is, how it helps agents with lead follow-up, AI, messaging, MLS integration, and automation—without replacing your CRM.",
    category: "Real Estate",
    readTime: "18 min read",
    date: "2026-06-21",
    featured: true,
    seoTitle: "Realtor Growth Engine Guide | Real Estate CRM & AI",
    keywords:
      "Realtor CRM, Real Estate CRM, Real Estate Automation, Real Estate AI, Realtor Growth Engine, Real Estate Lead Follow Up, Real Estate Lead Nurturing, IDX CRM, MLS CRM, Real Estate Lead Management, AI CRM for Realtors",
    featuredImage: "/og/blog/realtor-growth-engine-complete-guide.png",
    imageAlt:
      "The Realtor Growth Engine — The Complete Guide for Modern Real Estate Agents",
  },
  {
    slug: "whatsapp-crm-complete-guide-2025",
    title: "WhatsApp CRM: The Complete Guide for Small Businesses in 2025",
    excerpt:
      "Learn how to use WhatsApp as a powerful CRM tool to manage customer relationships, automate responses, and grow your business. Everything you need to know about WhatsApp Business API and CRM integration.",
    category: "Guides",
    readTime: "12 min read",
    date: "2025-12-15",
  },
  {
    slug: "whatsapp-business-api-vs-business-app",
    title: "WhatsApp Business API vs Business App: Which One Do You Need?",
    excerpt:
      "Confused about the difference between WhatsApp Business App and WhatsApp Business API? This guide breaks down features, pricing, and helps you choose the right solution for your team size.",
    category: "Comparison",
    readTime: "8 min read",
    date: "2025-12-10",
  },
  {
    slug: "automate-whatsapp-messages-small-business",
    title: "How to Automate WhatsApp Messages for Your Small Business",
    excerpt:
      "Save hours every day with WhatsApp automation. Learn how to set up auto-replies, away messages, drip campaigns, and workflow triggers to respond faster and convert more leads.",
    category: "Automation",
    readTime: "10 min read",
    date: "2025-12-05",
  },
  {
    slug: "whatsapp-lead-management-tips",
    title: "10 WhatsApp Lead Management Tips That Actually Work",
    excerpt:
      "Stop losing leads in your WhatsApp inbox. These proven strategies help you organize conversations, follow up on time, and close more deals using WhatsApp as your main sales channel.",
    category: "Tips",
    readTime: "7 min read",
    date: "2025-11-28",
  },
  {
    slug: "wati-alternatives-comparison",
    title: "Top 5 WATI Alternatives for WhatsApp Business in 2025",
    excerpt:
      "Looking for a WATI alternative? Compare pricing, features, and ease of use of the best WhatsApp CRM tools including WhachatCRM, Respond.io, and more.",
    category: "Comparison",
    readTime: "9 min read",
    date: "2025-11-20",
  },
  {
    slug: "whatsapp-customer-service-best-practices",
    title: "WhatsApp Customer Service: Best Practices for Teams",
    excerpt:
      "Deliver exceptional customer support via WhatsApp. Learn response time benchmarks, team collaboration tips, and how to handle high message volumes effectively.",
    category: "Customer Service",
    readTime: "8 min read",
    date: "2025-11-15",
  },
  {
    slug: "twilio-whatsapp-setup-guide",
    title: "How to Connect WhatsApp with Meta Embedded Signup",
    excerpt:
      "A simple walkthrough for connecting WhatsApp through Meta, choosing your business account and phone number, and verifying the inbox connection.",
    category: "Tutorials",
    readTime: "15 min read",
    date: "2025-11-10",
  },
  {
    slug: "whatsapp-drip-campaigns-examples",
    title: "WhatsApp Drip Campaign Examples That Convert",
    excerpt:
      "Real examples of successful WhatsApp drip sequences for lead nurturing, customer onboarding, and re-engagement. Copy these templates for your business.",
    category: "Templates",
    readTime: "11 min read",
    date: "2025-11-05",
  },
];

export function absolutizeMarketingAsset(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = baseUrl.replace(/\/+$/, "");
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Resolved featured image path (featuredImage, legacy image, or undefined). */
export function resolveBlogFeaturedImagePath(
  post: Pick<BlogPostMeta, "featuredImage" | "image">,
): string | undefined {
  return post.featuredImage || post.image;
}

/** OG/Twitter image path with default fallback. */
export function resolveBlogOgImagePath(
  post: Pick<BlogPostMeta, "featuredImage" | "ogImage" | "image">,
): string {
  return post.ogImage || post.featuredImage || post.image || DEFAULT_BLOG_OG_IMAGE_PATH;
}

export function resolveBlogOgImage(
  post: Pick<BlogPostMeta, "featuredImage" | "ogImage" | "image">,
  baseUrl: string,
): string {
  return absolutizeMarketingAsset(baseUrl, resolveBlogOgImagePath(post));
}

export function resolveBlogFeaturedImageUrl(
  post: Pick<BlogPostMeta, "featuredImage" | "image">,
  baseUrl: string,
): string | undefined {
  const path = resolveBlogFeaturedImagePath(post);
  return path ? absolutizeMarketingAsset(baseUrl, path) : undefined;
}

export function resolveBlogImageAlt(post: Pick<BlogPostMeta, "imageAlt" | "title">): string {
  return post.imageAlt?.trim() || post.title;
}
