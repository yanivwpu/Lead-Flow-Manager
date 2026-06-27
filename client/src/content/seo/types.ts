export type SeoLandingSection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  image?: { src: string; alt: string; caption?: string };
};

export type SeoFaqItem = { question: string; answer: string };

export type SeoRelatedLink = { href: string; label: string };

export type SeoBreadcrumbItem = { label: string; href?: string };

export type SeoLandingPageConfig = {
  slug: string;
  title: string;
  metaDescription: string;
  keywords?: string;
  heroBadge?: string;
  h1: string;
  heroIntro: string;
  breadcrumbs: SeoBreadcrumbItem[];
  sections: SeoLandingSection[];
  faqs: SeoFaqItem[];
  relatedLinks: SeoRelatedLink[];
};
