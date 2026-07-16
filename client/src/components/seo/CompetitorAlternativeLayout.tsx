/**
 * Shared layout for competitor alternative / comparison pages.
 * Preserves existing URLs; expands depth, schema, and current platform accuracy.
 */

import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, Minus, XCircle } from "lucide-react";
import { Helmet } from "react-helmet";
import { SiteFooter } from "@/components/SiteFooter";
import { MARKETING_URL } from "@/lib/marketingUrl";
import {
  DEFAULT_COMPARISON_SCREENSHOTS,
  PRICING_DISCLAIMER,
  WHACHAT_PLATFORM_ADVANTAGES,
  type CompareCell,
  type CompetitorAlternativeContent,
} from "@/content/seo/comparisonShared";

function CellDisplay({ value }: { value: CompareCell }) {
  if (value === "yes") {
    return <CheckCircle2 className="mx-auto h-5 w-5 text-brand-green" aria-label="Yes" />;
  }
  if (value === "partial") {
    return (
      <span className="inline-flex items-center justify-center gap-1 text-xs font-medium text-amber-700">
        <Minus className="h-4 w-4 shrink-0" aria-hidden />
        Partial
      </span>
    );
  }
  if (value === "no") {
    return <XCircle className="mx-auto h-5 w-5 text-gray-300" aria-label="No" />;
  }
  return <span className="text-sm text-gray-700">{value}</span>;
}

export function CompetitorAlternativeLayout({ content }: { content: CompetitorAlternativeContent }) {
  const canonical = `${MARKETING_URL}${content.slug}`;
  const name = content.competitorName;
  const screenshots = content.screenshots?.length
    ? content.screenshots
    : DEFAULT_COMPARISON_SCREENSHOTS;

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: content.faqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "WhachatCRM",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: MARKETING_URL,
    description:
      "Unified inbox and CRM for WhatsApp, Messenger, Instagram, Email, SMS, and more — with AI Assist, chatbot on Starter+, Shopify and GoHighLevel integrations.",
    offers: {
      "@type": "AggregateOffer",
      lowPrice: "0",
      highPrice: "49",
      priceCurrency: "USD",
      offerCount: "3",
    },
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: MARKETING_URL },
      { "@type": "ListItem", position: 2, name: `${name} Alternative`, item: canonical },
    ],
  };

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: content.meta.title,
    description: content.meta.description,
    url: canonical,
  };

  let lastCategory = "";

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>{content.meta.title}</title>
        <meta name="description" content={content.meta.description} />
        <meta name="keywords" content={content.meta.keywords} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={content.meta.title} />
        <meta property="og:description" content={content.meta.description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${MARKETING_URL}/og/og-whachatcrm.png?v=3`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={content.meta.title} />
        <meta name="twitter:description" content={content.meta.description} />
        <meta name="twitter:image" content={`${MARKETING_URL}/og/og-whachatcrm.png?v=3`} />
        <script type="application/ld+json">{JSON.stringify(webPageSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(softwareSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      </Helmet>

      <nav className="mx-auto flex max-w-7xl items-center justify-between p-4 md:p-6" aria-label="Primary">
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

      <nav className="mx-auto max-w-5xl px-4 text-sm text-gray-500 md:px-6" aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/">
              <a className="hover:text-brand-green">Home</a>
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="text-gray-800">{name} Alternative</li>
        </ol>
      </nav>

      <nav
        className="sticky top-0 z-20 border-b border-gray-100 bg-white/95 px-4 py-2 text-xs backdrop-blur md:px-6"
        aria-label="On this page"
      >
        <div className="mx-auto flex max-w-5xl flex-wrap gap-x-4 gap-y-1 text-gray-600">
          <a href="#quick-summary" className="hover:text-brand-green">
            Summary
          </a>
          <a href="#when-to-choose" className="hover:text-brand-green">
            When to choose
          </a>
          <a href="#comparison-matrix" className="hover:text-brand-green">
            Matrix
          </a>
          <a href="#pricing" className="hover:text-brand-green">
            Pricing
          </a>
          <a href="#migration" className="hover:text-brand-green">
            Migration
          </a>
          <a href="#faqs" className="hover:text-brand-green">
            FAQs
          </a>
        </div>
      </nav>

      <section className="mx-auto max-w-5xl px-4 pb-16 pt-8 text-center md:px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="mb-6 inline-block rounded-full bg-emerald-100 px-4 py-1 text-sm font-medium text-brand-green">
            {content.heroEyebrow}
          </span>
          <h1 className="mb-6 font-display text-3xl font-bold leading-tight text-gray-900 md:text-5xl">
            {content.meta.h1}
          </h1>
          <p className="mx-auto mb-8 max-w-3xl text-lg text-gray-600 md:text-xl">{content.heroLead}</p>
          <Link href="/auth">
            <a className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-brand-green px-8 font-semibold text-white shadow-lg hover:bg-emerald-700">
              Try WhachatCRM Free
              <ArrowRight className="h-5 w-5" />
            </a>
          </Link>
          <p className="mt-4 text-sm text-gray-500">
            Free plan · Meta Embedded Signup · Starter chatbot & templates · Unlimited users on Pro
          </p>
        </motion.div>
      </section>

      <section id="quick-summary" className="scroll-mt-14 border-t border-gray-100 px-4 py-12 md:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-4 font-display text-2xl font-bold text-gray-900">Quick summary</h2>
          <p className="text-lg leading-relaxed text-gray-600">{content.quickSummary}</p>
        </div>
      </section>

      <section className="bg-gray-50 px-4 py-14 md:px-6" aria-label="Product screenshots">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-3 text-center font-display text-2xl font-bold text-gray-900 md:text-3xl">
            Current WhachatCRM platform
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-center text-gray-600">
            Meta Embedded Signup, Unified Inbox (including Email), AI Assist on paid plans, chatbot and templates on
            Starter+, and multi-channel CRM — with native WhatsApp Cloud API onboarding (Twilio not required).
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {screenshots.map((shot) => (
              <figure key={shot.src} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <img
                  src={shot.src}
                  alt={shot.alt}
                  className="h-44 w-full object-cover object-top"
                  loading="lazy"
                  width={640}
                  height={360}
                />
                <figcaption className="border-t border-gray-100 px-3 py-2 text-xs text-gray-600">
                  {shot.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 md:px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-4 font-display text-2xl font-bold text-gray-900 md:text-3xl">
            Who this {name} comparison is for
          </h2>
          <ul className="space-y-3">
            {content.whoFor.map((item) => (
              <li key={item} className="flex gap-3 text-gray-700">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-green" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="when-to-choose" className="scroll-mt-14 px-4 py-14 md:px-6">
        <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-2">
          <div>
            <h2 className="mb-4 font-display text-2xl font-bold text-gray-900">When {name} is a good choice</h2>
            <ul className="mb-8 space-y-3">
              {content.competitorGoodWhen.map((item) => (
                <li key={item} className="flex gap-3 text-gray-700">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <h3 className="mb-4 text-lg font-semibold text-gray-900">{name} strengths</h3>
            <div className="space-y-4">
              {content.competitorStrengths.map((item) => (
                <div key={item.title} className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-5">
                  <h4 className="mb-1 font-semibold text-gray-900">{item.title}</h4>
                  <p className="text-sm text-gray-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="mb-4 font-display text-2xl font-bold text-gray-900">
              When WhachatCRM is a better fit
            </h2>
            <ul className="mb-8 space-y-3">
              {content.whachatBetterWhen.map((item) => (
                <li key={item} className="flex gap-3 rounded-lg bg-gray-50 p-3 text-gray-700">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-green" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <h3 className="mb-4 text-lg font-semibold text-gray-900">{name} limitations to weigh</h3>
            <div className="space-y-4">
              {content.competitorLimitations.map((item) => (
                <div key={item.title} className="rounded-xl border border-amber-100 bg-amber-50/40 p-5">
                  <h4 className="mb-1 font-semibold text-gray-900">{item.title}</h4>
                  <p className="text-sm text-gray-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-gray-100 bg-gray-50 px-4 py-14 md:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-3 text-center font-display text-2xl font-bold text-gray-900 md:text-3xl">
            Why WhachatCRM advantages matter
          </h2>
          <p className="mx-auto mb-10 max-w-2xl text-center text-gray-600">
            Feature checklists hide trade-offs. These are the platform differences teams feel every day after switching
            from {name}.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {[...WHACHAT_PLATFORM_ADVANTAGES, ...content.advantages].map((item) => (
              <div key={item.title} className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm">
                <h3 className="mb-2 font-semibold text-gray-900">{item.title}</h3>
                <p className="text-sm leading-relaxed text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="comparison-matrix" className="scroll-mt-14 px-4 py-14 md:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-3 text-center font-display text-2xl font-bold text-gray-900 md:text-3xl">
            WhachatCRM vs {name}: full comparison matrix
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-center text-sm text-gray-500">
            Verify current packaging on each vendor&apos;s site before you buy. WhachatCRM capabilities reflect the live
            product (Meta Embedded Signup, Unified Inbox, Email/Gmail, Shopify CRM, Prospect Engine, and more).
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="p-3 font-semibold text-gray-900">Capability</th>
                  <th className="p-3 text-center font-semibold text-gray-900">WhachatCRM</th>
                  <th className="p-3 text-center font-semibold text-gray-900">{name}</th>
                </tr>
              </thead>
              <tbody>
                {content.matrix.map((row) => {
                  const showCat = row.category !== lastCategory;
                  if (showCat) lastCategory = row.category;
                  return (
                    <tr key={`${row.category}-${row.feature}`} className="border-t border-gray-100">
                      <td className="p-3 text-gray-700">
                        {showCat ? (
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-green">
                            {row.category}
                          </span>
                        ) : null}
                        {row.feature}
                      </td>
                      <td className="p-3 text-center">
                        <CellDisplay value={row.whachat} />
                      </td>
                      <td className="p-3 text-center">
                        <CellDisplay value={row.competitor} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-14 bg-gray-50 px-4 py-14 md:px-6">
        <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-2">
          <div>
            <h2 className="mb-4 font-display text-2xl font-bold text-gray-900">Pricing comparison</h2>
            <p className="mb-3 text-sm text-gray-600">{content.pricingNotes.competitorSummary}</p>
            <p className="text-sm text-gray-600">{content.pricingNotes.whachatSummary}</p>
            <p className="mt-4 text-sm text-gray-500">
              Always separate SaaS subscription cost from Meta WhatsApp conversation fees.
            </p>
            <p className="mt-4 rounded-lg border border-amber-100 bg-amber-50/50 p-3 text-xs leading-relaxed text-gray-600">
              {PRICING_DISCLAIMER}
            </p>
          </div>
          <div>
            <h2 className="mb-4 font-display text-2xl font-bold text-gray-900">Free vs paid capabilities</h2>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-green">Free</h3>
            <ul className="mb-6 space-y-2 text-sm text-gray-700">
              {content.freeVsPaid.freeHighlights.map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-green">Paid (Starter / Pro)</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              {content.freeVsPaid.paidHighlights.map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="migration" className="scroll-mt-14 px-4 py-14 md:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-4 font-display text-2xl font-bold text-gray-900">Migration guide</h2>
          <p className="mb-6 text-gray-600">
            Keep your {name} account live until parallel-run proves your team can work from WhachatCRM&apos;s Unified
            Inbox.
          </p>
          <ol className="list-decimal space-y-3 pl-5 text-sm text-gray-700">
            {content.migrationSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </section>

      <section id="faqs" className="scroll-mt-14 px-4 py-14 md:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-center font-display text-2xl font-bold text-gray-900">
            {name} alternative FAQs
          </h2>
          <div className="space-y-4">
            {content.faqs.map((item) => (
              <div key={item.question} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="mb-2 text-lg font-semibold text-gray-900">{item.question}</h3>
                <p className="leading-relaxed text-gray-600">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-gray-100 px-4 py-14 md:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 font-display text-2xl font-bold text-gray-900">Final recommendation</h2>
          <p className="text-gray-600">{content.recommendation}</p>
        </div>
      </section>

      <section className="bg-brand-green px-4 py-16 md:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 font-display text-2xl font-bold text-white">
            Compare WhachatCRM on your real workflows
          </h2>
          <p className="mb-8 text-emerald-100">
            Start free to validate the Unified Inbox. Upgrade to Starter for chatbot and templates, or Pro for
            unlimited users — Meta conversation fees pass through without WhachatCRM markup.
          </p>
          <Link href="/auth">
            <a className="inline-flex h-14 items-center gap-2 rounded-full bg-white px-8 font-semibold text-brand-green hover:bg-gray-100">
              Start Your Free Account
              <ArrowRight className="h-5 w-5" />
            </a>
          </Link>
        </div>
      </section>

      <section className="border-t border-gray-100 px-4 py-12 md:px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-4 text-lg font-bold text-gray-900">Related comparisons</h2>
          <div className="flex flex-wrap gap-4">
            {content.relatedLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <a className="text-brand-green hover:underline">{link.label}</a>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
