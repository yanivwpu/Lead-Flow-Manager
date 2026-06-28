import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { Helmet } from "react-helmet";
import { MARKETING_URL } from "@/lib/marketingUrl";

export type BreadcrumbItem = {
  label: string;
  /** Path on the marketing site (required for valid BreadcrumbList JSON-LD). */
  href: string;
};

type Props = {
  items: BreadcrumbItem[];
  className?: string;
};

function breadcrumbUrl(href: string): string {
  const path = href.startsWith("/") ? href : `/${href}`;
  return `${MARKETING_URL}${path}`;
}

export function MarketingBreadcrumbs({ items, className = "" }: Props) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: breadcrumbUrl(item.href),
    })),
  };

  return (
    <>
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(schema)}</script>
      </Helmet>
      <nav aria-label="Breadcrumb" className={className}>
        <ol className="flex flex-wrap items-center gap-1 text-sm text-gray-500">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <li key={`${item.label}-${index}`} className="flex items-center gap-1">
                {index > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" aria-hidden /> : null}
                {isLast ? (
                  <span className="font-medium text-gray-700" aria-current="page">
                    {item.label}
                  </span>
                ) : (
                  <Link href={item.href}>
                    <a className="hover:text-brand-green">{item.label}</a>
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}

/** Breadcrumb trails for SEO pages — only links to real, crawlable URLs. */
export const SEO_BREADCRUMBS = {
  helpCenter: [
    { label: "Home", href: "/" },
    { label: "Help Center", href: "/user-guide" },
  ] as BreadcrumbItem[],
  /** Home → landing page (no intermediate Product/Solutions levels). */
  page: (label: string, slug: string): BreadcrumbItem[] => [
    { label: "Home", href: "/" },
    { label, href: `/${slug.replace(/^\/+/, "")}` },
  ],
};
