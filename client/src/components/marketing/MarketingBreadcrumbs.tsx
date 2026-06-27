import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { Helmet } from "react-helmet";
import { MARKETING_URL } from "@/lib/marketingUrl";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type Props = {
  items: BreadcrumbItem[];
  className?: string;
};

export function MarketingBreadcrumbs({ items, className = "" }: Props) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: `${MARKETING_URL}${item.href}` } : {}),
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
                {item.href && !isLast ? (
                  <Link href={item.href}>
                    <a className="hover:text-brand-green">{item.label}</a>
                  </Link>
                ) : (
                  <span className={isLast ? "font-medium text-gray-700" : undefined} aria-current={isLast ? "page" : undefined}>
                    {item.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}

export const SEO_BREADCRUMBS = {
  helpCenter: [
    { label: "Home", href: "/" },
    { label: "Help Center" },
  ] as BreadcrumbItem[],
  product: (page: string) =>
    [{ label: "Home", href: "/" }, { label: "Product" }, { label: page }] as BreadcrumbItem[],
  solutions: (page: string) =>
    [{ label: "Home", href: "/" }, { label: "Solutions" }, { label: page }] as BreadcrumbItem[],
};
