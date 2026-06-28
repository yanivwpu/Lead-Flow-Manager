import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Helmet } from "react-helmet";
import { SiteFooter } from "@/components/SiteFooter";
import { BookDemoModal } from "@/components/BookDemoModal";
import { MarketingBreadcrumbs } from "@/components/marketing/MarketingBreadcrumbs";
import { MarketingLandingCta } from "@/components/marketing/MarketingLandingCta";
import { MarketingScreenshot } from "@/components/marketing/MarketingScreenshot";
import { MARKETING_URL } from "@/lib/marketingUrl";
import type { SeoLandingPageConfig } from "@/content/seo/types";

type Props = { config: SeoLandingPageConfig };

export function SeoLandingPage({ config }: Props) {
  const [showDemoModal, setShowDemoModal] = useState(false);
  const canonical = `${MARKETING_URL}/${config.slug}`;
  const faqSchema =
    config.faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: config.faqs.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        }
      : null;

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>{config.title}</title>
        <meta name="description" content={config.metaDescription} />
        {config.keywords ? <meta name="keywords" content={config.keywords} /> : null}
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={config.title} />
        <meta property="og:description" content={config.metaDescription} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${MARKETING_URL}/og/og-whachatcrm.png?v=3`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={config.title} />
        <meta name="twitter:description" content={config.metaDescription} />
        <meta name="twitter:image" content={`${MARKETING_URL}/og/og-whachatcrm.png?v=3`} />
        {faqSchema ? (
          <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        ) : null}
      </Helmet>

      <nav className="mx-auto flex max-w-7xl items-center justify-between p-4 md:p-6">
        <Link href="/">
          <a className="flex cursor-pointer items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-green">
              <span className="text-lg font-bold text-white">W</span>
            </div>
            <span className="font-display text-xl font-bold text-gray-900">WhachatCRM</span>
          </a>
        </Link>
        <div className="flex items-center gap-2 md:gap-4">
          <Link href="/pricing">
            <a className="hidden text-sm font-medium text-gray-600 hover:text-gray-900 sm:block">Pricing</a>
          </Link>
          <Link href="/auth">
            <a className="rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              Start Free
            </a>
          </Link>
        </div>
      </nav>

      <header className="border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white px-4 pb-14 pt-10 md:px-6 md:pb-20 md:pt-14">
        <div className="mx-auto max-w-3xl text-center md:text-left">
          <MarketingBreadcrumbs items={config.breadcrumbs} className="mb-6 justify-center md:justify-start" />
          {config.heroBadge ? (
            <span className="mb-4 inline-block rounded-full bg-emerald-100 px-4 py-1 text-sm font-medium text-brand-green">
              {config.heroBadge}
            </span>
          ) : null}
          <h1 className="font-display text-3xl font-bold leading-tight text-gray-900 md:text-5xl">{config.h1}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-600 md:mx-0">{config.heroIntro}</p>
          {config.heroFlow?.length ? (
            <div className="mx-auto mt-6 flex max-w-2xl flex-col items-center gap-2 text-sm font-medium text-gray-700 sm:flex-row sm:flex-wrap sm:justify-center md:mx-0 md:justify-start">
              {config.heroFlow.map((step, i) => (
                <span key={step} className="flex items-center gap-2">
                  {i > 0 ? <span className="hidden text-gray-300 sm:inline" aria-hidden>→</span> : null}
                  <span className="rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-gray-200">{step}</span>
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row md:justify-start">
            <Link href="/auth">
              <a className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-green px-8 font-semibold text-white hover:bg-emerald-700">
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </a>
            </Link>
            <button
              type="button"
              onClick={() => setShowDemoModal(true)}
              className="inline-flex h-12 items-center rounded-full border border-gray-300 bg-white px-8 font-semibold text-gray-900 hover:border-gray-400 hover:bg-gray-50"
            >
              Book a Demo
            </button>
          </div>
        </div>

        {config.heroImage ? (
          <div className="mx-auto mt-12 max-w-6xl px-0 md:mt-14 md:px-2">
            <MarketingScreenshot {...config.heroImage} variant="hero" priority />
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <nav className="mb-14 rounded-xl border border-gray-100 bg-gray-50 p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">On this page</h2>
          <ul className="grid gap-2 text-sm text-brand-green sm:grid-cols-2">
            {config.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
            {config.faqs.length > 0 ? (
              <li>
                <a href="#faq" className="hover:underline">
                  FAQs
                </a>
              </li>
            ) : null}
          </ul>
        </nav>

        {config.sections.map((section) => (
          <section key={section.id} id={section.id} className="mb-16 scroll-mt-24 md:mb-20">
            <h2 className="font-display mb-5 text-2xl font-bold text-gray-900 md:text-3xl">{section.title}</h2>
            {section.paragraphs.map((p, i) => (
              <p key={i} className="mb-4 leading-relaxed text-gray-600">
                {p}
              </p>
            ))}
            {section.bullets?.length ? (
              <ul className="mb-6 list-disc space-y-2 pl-5 text-gray-600">
                {section.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            ) : null}
            {section.featureCards?.length ? (
              <div className="mb-8 grid gap-4 sm:grid-cols-2">
                {section.featureCards.map((card) => (
                  <div
                    key={card.title}
                    className="rounded-xl border border-gray-100 bg-gray-50 p-5 shadow-sm"
                  >
                    <h3 className="font-semibold text-gray-900">{card.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">{card.description}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {section.image ? (
              <div className="-mx-2 md:-mx-4">
                <MarketingScreenshot {...section.image} />
              </div>
            ) : null}
          </section>
        ))}

        {config.faqs.length > 0 ? (
          <section id="faq" className="mb-16 scroll-mt-24 md:mb-20">
            <h2 className="font-display mb-6 text-2xl font-bold text-gray-900 md:text-3xl">
              Frequently asked questions
            </h2>
            <dl className="space-y-4">
              {config.faqs.map((f) => (
                <div key={f.question} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                  <dt className="font-semibold text-gray-900">{f.question}</dt>
                  <dd className="mt-2 leading-relaxed text-gray-600">{f.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {config.relatedLinks.length > 0 ? (
          <section className="rounded-2xl border border-gray-100 bg-gray-50 p-6">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Related resources</h2>
            <div className="flex flex-wrap gap-3">
              {config.relatedLinks.map((l) => (
                <Link key={l.href} href={l.href}>
                  <a className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-brand-green hover:border-brand-green/40">
                    {l.label}
                  </a>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <MarketingLandingCta
        headline={config.ctaHeadline}
        onBookDemo={() => setShowDemoModal(true)}
      />

      <SiteFooter />

      <BookDemoModal isOpen={showDemoModal} onClose={() => setShowDemoModal(false)} />
    </div>
  );
}
