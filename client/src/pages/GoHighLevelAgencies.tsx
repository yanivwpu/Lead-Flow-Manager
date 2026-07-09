import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet";
import {
  ArrowRight,
  Check,
  Handshake,
  Layers,
  Quote,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { BookDemoModal } from "@/components/BookDemoModal";
import { MarketingBreadcrumbs, SEO_BREADCRUMBS } from "@/components/marketing/MarketingBreadcrumbs";
import { MarketingScreenshot } from "@/components/marketing/MarketingScreenshot";
import { MARKETING_URL } from "@/lib/marketingUrl";
import { S } from "@shared/marketingScreenshots";
import {
  GHL_AGENCIES_META,
  GHL_AGENCIES_SLUG,
  GHL_FAQ_ITEMS,
  GHL_FUTURE_SECTIONS,
  GHL_HERO,
  GHL_WHY_AGENCIES,
  GHL_WHY_MORE_THAN_CRM,
} from "@/content/goHighLevelAgenciesContent";
import { cn } from "@/lib/utils";

const CANONICAL = `${MARKETING_URL}/${GHL_AGENCIES_SLUG}`;

const CARD_ICONS = [TrendingUp, Users, Wallet, Layers] as const;

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-40px" },
  transition: { duration: 0.45, ease: "easeOut" },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${MARKETING_URL}/#organization`,
  name: "WhachatCRM",
  alternateName: "Whachat CRM",
  url: MARKETING_URL,
  logo: { "@type": "ImageObject", url: `${MARKETING_URL}/logo.png` },
  description:
    "WhachatCRM is a CRM-first WhatsApp sales platform that helps small and medium businesses manage leads, conversations, follow-ups, and deals without per-message fees.",
  foundingDate: "2025",
  sameAs: ["https://www.linkedin.com/company/whachatcrm", "https://twitter.com/whachatcrm"],
};

export function GoHighLevelAgencies() {
  const [showDemoModal, setShowDemoModal] = useState(false);

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: GHL_AGENCIES_META.title,
    description: GHL_AGENCIES_META.description,
    url: CANONICAL,
    isPartOf: { "@id": `${MARKETING_URL}/#website` },
    about: { "@type": "Thing", name: "GoHighLevel agency partnerships" },
  };

  const faqSchema =
    GHL_FAQ_ITEMS.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: GHL_FAQ_ITEMS.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }
      : null;

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>{GHL_AGENCIES_META.title}</title>
        <meta name="description" content={GHL_AGENCIES_META.description} />
        <meta name="keywords" content={GHL_AGENCIES_META.keywords} />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:title" content={GHL_AGENCIES_META.title} />
        <meta property="og:description" content={GHL_AGENCIES_META.description} />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${MARKETING_URL}/og/og-whachatcrm.png?v=3`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={GHL_AGENCIES_META.title} />
        <meta name="twitter:description" content={GHL_AGENCIES_META.description} />
        <meta name="twitter:image" content={`${MARKETING_URL}/og/og-whachatcrm.png?v=3`} />
        <script type="application/ld+json">{JSON.stringify(organizationSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(webPageSchema)}</script>
        {faqSchema ? (
          <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        ) : null}
      </Helmet>

      <nav className="mx-auto flex max-w-6xl items-center justify-between p-4 md:px-6 md:py-5">
        <Link href="/">
          <a className="flex cursor-pointer items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-green">
              <span className="text-lg font-bold text-white">W</span>
            </div>
            <span className="font-display text-xl font-bold text-gray-900">WhachatCRM</span>
          </a>
        </Link>
        <div className="flex items-center gap-2 md:gap-4">
          <Link href="/partner-program">
            <a className="hidden text-sm font-medium text-gray-600 hover:text-gray-900 sm:block">
              Partner Program
            </a>
          </Link>
          <Link href="/pricing">
            <a className="hidden text-sm font-medium text-gray-600 hover:text-gray-900 sm:block">Pricing</a>
          </Link>
          <button
            type="button"
            onClick={() => setShowDemoModal(true)}
            className="rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Book a Demo
          </button>
        </div>
      </nav>

      {/* Section 1 — Hero */}
      <header className="border-b border-gray-100 bg-gradient-to-b from-emerald-50/60 via-gray-50 to-white px-4 pb-14 pt-6 md:px-6 md:pb-16 md:pt-8">
        <div className="mx-auto max-w-6xl">
          <MarketingBreadcrumbs
            items={SEO_BREADCRUMBS.page("GoHighLevel Agencies", GHL_AGENCIES_SLUG)}
            className="mb-5"
          />
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.5fr)_minmax(0,0.5fr)] lg:gap-12 xl:gap-14">
            <motion.div
              className="max-w-xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
            >
              <span className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-brand-green">
                <Handshake className="h-4 w-4" />
                GoHighLevel Agencies
              </span>
              <h1 className="font-display text-balance text-3xl font-bold leading-[1.12] tracking-tight text-gray-900 md:text-4xl lg:text-[2.65rem]">
                {GHL_HERO.h1}
              </h1>
              <p className="mt-5 text-base leading-relaxed text-gray-700 md:text-lg">{GHL_HERO.subheading}</p>
              <p className="mt-4 text-base leading-relaxed text-gray-600">{GHL_HERO.body}</p>
              <ul className="mt-6 space-y-2">
                {GHL_HERO.trustStatements.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm font-medium text-gray-800 md:text-base">
                    <Check className="h-4 w-4 shrink-0 text-brand-green" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setShowDemoModal(true)}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-green px-7 font-semibold text-white shadow-md shadow-emerald-900/10 hover:bg-emerald-700"
                >
                  Book a Demo
                  <ArrowRight className="h-4 w-4" />
                </button>
                <Link href="/partner-program">
                  <a className="inline-flex h-12 items-center justify-center rounded-full border border-gray-300 bg-white px-7 font-semibold text-gray-900 hover:border-gray-400 hover:bg-gray-50">
                    Become a Partner
                  </a>
                </Link>
              </div>
            </motion.div>
            <motion.div
              className="flex justify-center lg:justify-end"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <MarketingScreenshot
                {...S.unifiedInbox}
                size="content"
                priority
                caption="Omnichannel inbox with AI Copilot — extend GoHighLevel with messaging your clients already use every day."
                captionAlign="left"
                className="my-0 w-full max-w-[min(100%,680px)]"
              />
            </motion.div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-16">
        {/* Section 2 — Why more than a CRM */}
        <motion.section className="mb-16 md:mb-20" {...fadeUp}>
          <h2 className="font-display mb-6 max-w-3xl text-2xl font-bold text-gray-900 md:text-3xl lg:text-4xl">
            {GHL_WHY_MORE_THAN_CRM.heading}
          </h2>
          <div className="max-w-3xl space-y-4 text-base leading-relaxed text-gray-600 md:text-[1.05rem]">
            {GHL_WHY_MORE_THAN_CRM.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <blockquote className="relative mt-10 overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 via-white to-gray-50 p-8 shadow-sm md:p-10">
            <div
              className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full bg-brand-green/5 blur-2xl"
              aria-hidden
            />
            <Quote className="mb-4 h-8 w-8 text-brand-green/70" aria-hidden />
            <p className="font-display text-xl font-semibold leading-snug text-gray-900 md:text-2xl">
              {GHL_WHY_MORE_THAN_CRM.quote.line1}
              <br />
              <span className="text-brand-green">{GHL_WHY_MORE_THAN_CRM.quote.line2}</span>
            </p>
          </blockquote>
        </motion.section>

        {/* Section 3 — Why agencies choose */}
        <motion.section className="mb-16 md:mb-20" {...fadeUp}>
          <div className="mb-10 text-center md:text-left">
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
              <Sparkles className="h-3.5 w-3.5 text-brand-green" />
              Agency advantages
            </span>
            <h2 className="font-display text-2xl font-bold text-gray-900 md:text-3xl lg:text-4xl">
              {GHL_WHY_AGENCIES.heading}
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {GHL_WHY_AGENCIES.cards.map((card, index) => {
              const Icon = CARD_ICONS[index] ?? Layers;
              return (
                <motion.article
                  key={card.title}
                  className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md md:p-7"
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.06 }}
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-brand-green transition-colors group-hover:bg-brand-green group-hover:text-white">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <h3 className="font-display text-lg font-bold text-gray-900">{card.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600 md:text-base">{card.description}</p>
                </motion.article>
              );
            })}
          </div>
        </motion.section>

        {/* Future section placeholders */}
        <section aria-label="Upcoming sections" className="space-y-4 border-t border-gray-100 pt-12">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400">
            More coming soon
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {GHL_FUTURE_SECTIONS.map((section) => (
              <div
                key={section.id}
                id={section.id}
                className={cn(
                  "scroll-mt-24 rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-5 py-6 text-center",
                  "text-sm font-medium text-gray-400",
                )}
              >
                {section.title}
              </div>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
      <BookDemoModal isOpen={showDemoModal} onClose={() => setShowDemoModal(false)} bookingSource="ghl_agencies" />
    </div>
  );
}
