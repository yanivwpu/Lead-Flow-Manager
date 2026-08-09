import { Link } from "wouter";
import { ArrowRight, Inbox, Search } from "lucide-react";
import { getLocalizedHomepage } from "@shared/localizeMarketingContent";
import { useLocalizedHref, useMarketingUrlLocale } from "@/lib/marketingLocaleRouting";

/** Two clear discovery paths below the hero — only when it fits the homepage narrative. */
export default function WelcomeDiscoveryPaths() {
  const locale = useMarketingUrlLocale();
  const content = getLocalizedHomepage(locale).discovery;
  const findHref = useLocalizedHref(content.findProspects.href);
  const convertHref = useLocalizedHref(content.convertConversations.href);

  return (
    <section
      className="px-4 md:px-6 pb-10 md:pb-14"
      aria-label={content.sectionAria}
    >
      <div className="mx-auto grid max-w-7xl gap-3 md:grid-cols-2 md:gap-4 xl:max-w-[1440px] 2xl:max-w-[1536px]">
        <Link
          href={findHref}
          className="group flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-green/40 hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-brand-green">
            <Search className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-brand-green mb-1">
              {content.findProspects.eyebrow}
            </p>
            <h2 className="text-lg font-bold text-gray-950 mb-1">{content.findProspects.title}</h2>
            <p className="text-sm text-gray-600 mb-3">{content.findProspects.body}</p>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-green group-hover:gap-1.5 transition-all">
              {content.findProspects.cta}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </div>
        </Link>

        <Link
          href={convertHref}
          className="group flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-green/40 hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <Inbox className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-brand-green mb-1">
              {content.convertConversations.eyebrow}
            </p>
            <h2 className="text-lg font-bold text-gray-950 mb-1">
              {content.convertConversations.title}
            </h2>
            <p className="text-sm text-gray-600 mb-3">{content.convertConversations.body}</p>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-green group-hover:gap-1.5 transition-all">
              {content.convertConversations.cta}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </div>
        </Link>
      </div>
    </section>
  );
}
