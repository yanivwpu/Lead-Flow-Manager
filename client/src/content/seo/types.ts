import type { MarketingScreenshotMeta } from "@shared/marketingScreenshots";

export type SeoLandingSection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  featureCards?: { title: string; description: string }[];
  image?: MarketingScreenshotMeta;
};

export type SeoFaqItem = { question: string; answer: string };

export type SeoRelatedLink = { href: string; label: string };

export type SeoBreadcrumbItem = { label: string; href: string };

export type SeoLandingPageConfig = {
  slug: string;
  title: string;
  metaDescription: string;
  keywords?: string;
  heroBadge?: string;
  h1: string;
  heroIntro: string;
  /** Optional arrow-flow steps shown under the hero intro (e.g. message → qualify → match). */
  heroFlow?: string[];
  breadcrumbs: SeoBreadcrumbItem[];
  heroImage?: MarketingScreenshotMeta;
  ctaHeadline?: string;
  sections: SeoLandingSection[];
  faqs: SeoFaqItem[];
  relatedLinks: SeoRelatedLink[];
};
