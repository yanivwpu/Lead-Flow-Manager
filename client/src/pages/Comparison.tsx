import { Helmet } from "react-helmet";
import {
  ArrowRight,
  Award,
  Check,
  CheckCircle2,
  Minus,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { SiteFooter } from "@/components/SiteFooter";
import { MARKETING_URL } from "@/lib/marketingUrl";
import { DEFAULT_COMPARISON_SCREENSHOTS } from "@/content/seo/comparisonShared";
import {
  BEST_FOR_SEGMENTS,
  BEST_WHATSAPP_CRM_2026_META,
  BUYER_CRITERIA,
  FAQ_ITEMS,
  HERO_CHANNEL_PILLS,
  PLATFORM_COMPARISON,
  RELATED_GUIDE_LINKS,
  WHACHAT_DIFFERENTIATORS,
  WHATSAPP_ONLY_PAIN_POINTS,
  type ComparisonCell,
} from "@/content/seo/bestWhatsappCrm2026Content";

const CANONICAL = `${MARKETING_URL}/best-whatsapp-crm-2026`;

function ComparisonCellDisplay({ value }: { value: ComparisonCell }) {
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

export function Comparison() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: BEST_WHATSAPP_CRM_2026_META.title,
    description: BEST_WHATSAPP_CRM_2026_META.description,
    url: CANONICAL,
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
      { "@type": "ListItem", position: 2, name: "Best WhatsApp CRM 2026", item: CANONICAL },
    ],
  };

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900 selection:bg-green-100 selection:text-green-900">
      <Helmet>
        <title>{BEST_WHATSAPP_CRM_2026_META.title}</title>
        <meta name="description" content={BEST_WHATSAPP_CRM_2026_META.description} />
        <meta name="keywords" content={BEST_WHATSAPP_CRM_2026_META.keywords} />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:title" content={BEST_WHATSAPP_CRM_2026_META.title} />
        <meta property="og:description" content={BEST_WHATSAPP_CRM_2026_META.description} />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${MARKETING_URL}/og/og-whachatcrm.png?v=3`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={BEST_WHATSAPP_CRM_2026_META.title} />
        <meta name="twitter:description" content={BEST_WHATSAPP_CRM_2026_META.description} />
        <meta name="twitter:image" content={`${MARKETING_URL}/og/og-whachatcrm.png?v=3`} />
        <script type="application/ld+json">{JSON.stringify(webPageSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(softwareSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      </Helmet>

      <nav className="mx-auto flex max-w-6xl items-center justify-between p-4 md:p-6">
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
          <li className="text-gray-800">Best WhatsApp CRM 2026</li>
        </ol>
      </nav>

      {/* 1. Hero */}
      <header className="relative overflow-hidden border-b border-gray-100 bg-gradient-to-b from-green-50/50 to-white pb-16 pt-10 md:pb-24 md:pt-14">
        <div className="container relative z-10 mx-auto max-w-5xl px-4">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
            <Award className="h-4 w-4" />
            2026 WhatsApp CRM comparison
          </div>
          <h1 className="mb-6 font-display text-3xl font-extrabold leading-[1.12] tracking-tight text-gray-900 md:text-5xl">
            {BEST_WHATSAPP_CRM_2026_META.h1}
          </h1>
          <p className="mb-8 max-w-3xl text-lg leading-relaxed text-gray-600 md:text-xl">
            WhatsApp CRM is no longer only about managing WhatsApp messages. In 2026, businesses
            evaluate platforms that combine{" "}
            <Link href="/whatsapp-business-api">
              <a className="font-medium text-brand-green hover:underline">official WhatsApp Business API</a>
            </Link>
            {" "}with Embedded Signup, Messenger, Instagram, Email, SMS, website chat, automation, AI assistance, and team
            collaboration in one{" "}
            <Link href="/unified-inbox">
              <a className="font-medium text-brand-green hover:underline">omnichannel inbox</a>
            </Link>
            .
          </p>
          <div className="mb-10 flex flex-wrap gap-2">
            {HERO_CHANNEL_PILLS.map((pill) => (
              <span
                key={pill}
                className="rounded-full bg-white px-3 py-1 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200"
              >
                {pill}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            <Link href="/auth">
              <Button
                size="lg"
                className="h-12 rounded-xl bg-brand-green px-8 text-base text-white shadow-lg hover:bg-emerald-700"
              >
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button
                size="lg"
                variant="outline"
                className="h-12 rounded-xl border-gray-200 px-8 text-base hover:bg-gray-50"
              >
                View Pricing
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-5xl px-4 py-14 md:py-20">
        {/* 2. What is a WhatsApp CRM? */}
        <section id="what-is-whatsapp-crm" className="mb-16 scroll-mt-24 md:mb-20">
          <h2 className="mb-5 font-display text-2xl font-bold text-gray-900 md:text-3xl">
            What is a WhatsApp CRM?
          </h2>
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6 md:p-8">
            <p className="mb-4 text-lg leading-relaxed text-gray-700">
              A <strong>WhatsApp CRM</strong> helps teams manage WhatsApp Business conversations,
              contacts, follow-ups, automation, and sales pipelines in one workspace—instead of
              juggling personal phones and scattered chats.
            </p>
            <p className="leading-relaxed text-gray-600">
              The best CRM for WhatsApp connects through the official API, adds shared inbox and
              assignment rules, and links each conversation to notes, tags, reminders, and pipeline
              stage. That turns messaging into a repeatable revenue channel rather than an ad hoc
              inbox.
            </p>
          </div>
        </section>

        {/* 3. Why WhatsApp-only is not enough */}
        <section id="why-omnichannel" className="mb-16 scroll-mt-24 md:mb-20">
          <h2 className="mb-3 font-display text-2xl font-bold text-gray-900 md:text-3xl">
            Why WhatsApp-only CRM is no longer enough
          </h2>
          <p className="mb-8 max-w-3xl text-gray-600">
            A WhatsApp CRM comparison in 2026 should weigh omnichannel coverage—not just how well a
            tool handles a single green icon.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {WHATSAPP_ONLY_PAIN_POINTS.map((point) => (
              <div
                key={point.title}
                className="rounded-xl border border-amber-100 bg-amber-50/60 p-5"
              >
                <h3 className="mb-2 font-semibold text-gray-900">{point.title}</h3>
                <p className="text-sm leading-relaxed text-gray-600">{point.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 4. What to look for */}
        <section id="what-to-look-for" className="mb-16 scroll-mt-24 md:mb-20">
          <h2 className="mb-3 font-display text-2xl font-bold text-gray-900 md:text-3xl">
            What to look for in the best WhatsApp CRM
          </h2>
          <p className="mb-8 max-w-3xl text-gray-600">
            Use this checklist when you compare WhatsApp CRM platforms—or when you evaluate a
            WhatsApp CRM vs omnichannel CRM positioning.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {BUYER_CRITERIA.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
              >
                <h3 className="mb-2 font-semibold text-gray-900">{item.title}</h3>
                <p className="mb-3 text-sm leading-relaxed text-gray-600">{item.description}</p>
                <Link href={item.link.href}>
                  <a className="text-sm font-medium text-brand-green hover:underline">
                    {item.link.label} →
                  </a>
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* Product screenshots */}
        <section id="platform-screenshots" className="mb-16 scroll-mt-24 md:mb-20">
          <h2 className="mb-3 font-display text-2xl font-bold text-gray-900 md:text-3xl">
            Current WhachatCRM platform
          </h2>
          <p className="mb-8 max-w-3xl text-gray-600">
            Official Meta Embedded Signup, Unified Inbox (including Email), AI Copilot, and free automation
            templates — the current WhachatCRM platform, not an API-only BSP.
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {DEFAULT_COMPARISON_SCREENSHOTS.map((shot) => (
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
        </section>

        {/* 5. Comparison table */}
        <section id="comparison-table" className="mb-16 scroll-mt-24 md:mb-20">
          <h2 className="mb-3 font-display text-2xl font-bold text-gray-900 md:text-3xl">
            WhatsApp CRM comparison: leading platforms in 2026
          </h2>
          <p className="mb-6 max-w-3xl text-sm text-gray-500">
            High-level feature map for education. Competitor pricing and plan limits may change—verify details on each
            vendor&apos;s official website before purchasing. Meta may update WhatsApp pricing independently.
            WhachatCRM does not add its own per-message markup on top of Meta&apos;s official charges.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="p-3 font-semibold text-gray-900">Platform</th>
                  <th className="p-3 font-semibold text-gray-900">WhatsApp Business API</th>
                  <th className="p-3 font-semibold text-gray-900">Omnichannel Inbox</th>
                  <th className="p-3 font-semibold text-gray-900">AI Copilot / Lead Scoring</th>
                  <th className="p-3 font-semibold text-gray-900">Automation Templates</th>
                  <th className="p-3 font-semibold text-gray-900">Team Inbox</th>
                  <th className="p-3 font-semibold text-gray-900">Shopify Support</th>
                  <th className="p-3 font-semibold text-gray-900">Real Estate / MLS</th>
                  <th className="p-3 font-semibold text-gray-900">Meta Fee Transparency</th>
                  <th className="min-w-[200px] p-3 font-semibold text-gray-900">Best Fit</th>
                </tr>
              </thead>
              <tbody>
                {PLATFORM_COMPARISON.map((row) => (
                  <tr
                    key={row.platform}
                    className={
                      row.highlight
                        ? "border-t border-green-200 bg-green-50/40"
                        : "border-t border-gray-100"
                    }
                  >
                    <td className="p-3 font-semibold text-gray-900">
                      {row.platform}
                      {row.highlight ? (
                        <span className="ml-2 rounded-full bg-brand-green px-2 py-0.5 text-xs font-bold text-white">
                          Featured
                        </span>
                      ) : null}
                    </td>
                    <td className="p-3 text-center">
                      <ComparisonCellDisplay value={row.whatsappApi} />
                    </td>
                    <td className="p-3 text-center">
                      <ComparisonCellDisplay value={row.omnichannelInbox} />
                    </td>
                    <td className="p-3 text-center">
                      <ComparisonCellDisplay value={row.aiCopilot} />
                    </td>
                    <td className="p-3 text-center">
                      <ComparisonCellDisplay value={row.automationTemplates} />
                    </td>
                    <td className="p-3 text-center">
                      <ComparisonCellDisplay value={row.teamInbox} />
                    </td>
                    <td className="p-3 text-center">
                      <ComparisonCellDisplay value={row.shopifySupport} />
                    </td>
                    <td className="p-3 text-center">
                      <ComparisonCellDisplay value={row.realEstateMls} />
                    </td>
                    <td className="p-3 text-center">
                      <ComparisonCellDisplay value={row.metaFeeTransparency} />
                    </td>
                    <td className="p-3 text-gray-600">{row.bestFit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 6. Why WhachatCRM is different */}
        <section id="why-whachatcrm" className="mb-16 scroll-mt-24 md:mb-20">
          <h2 className="mb-6 font-display text-2xl font-bold text-gray-900 md:text-3xl">
            Why WhachatCRM is different
          </h2>
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="rounded-2xl border-2 border-brand-green/30 bg-green-50/40 p-6 md:p-8">
              <p className="mb-5 text-gray-700">
                WhachatCRM is an <strong>omnichannel CRM platform</strong> built for teams that
                sell and support on messaging apps—not a single-channel widget bolted onto legacy
                software.
              </p>
              <ul className="space-y-3">
                {WHACHAT_DIFFERENTIATORS.map((item) => (
                  <li key={item} className="flex gap-3 text-gray-700">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand-green" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col justify-center gap-4">
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="mb-2 font-semibold text-gray-900">Channels in one inbox</h3>
                <p className="text-sm text-gray-600">
                  WhatsApp, Messenger, Instagram, SMS, Telegram, and website chat widget—see every
                  thread beside CRM context.
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="mb-2 font-semibold text-gray-900">Industry templates</h3>
                <p className="text-sm text-gray-600">
                  <Link href="/shopify-crm">
                    <a className="text-brand-green hover:underline">Shopify</a>
                  </Link>{" "}
                  retention flows and a{" "}
                  <Link href="/real-estate-crm">
                    <a className="text-brand-green hover:underline">real estate growth engine</a>
                  </Link>{" "}
                  with property matching—without stitching five tools together.
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="mb-2 font-semibold text-gray-900">Transparent Meta pricing</h3>
                <p className="text-sm text-gray-600">
                  0% markup on Meta messaging fees. Compare total cost on{" "}
                  <Link href="/pricing">
                    <a className="text-brand-green hover:underline">pricing</a>
                  </Link>{" "}
                  before you commit.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 7. Who it's best for */}
        <section id="best-for" className="mb-16 scroll-mt-24 md:mb-20">
          <h2 className="mb-8 font-display text-2xl font-bold text-gray-900 md:text-3xl">
            Who WhachatCRM is best for
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BEST_FOR_SEGMENTS.map((segment) => (
              <div
                key={segment.title}
                className="rounded-xl border border-gray-100 bg-gray-50 p-5 text-center"
              >
                <h3 className="mb-2 font-semibold text-gray-900">{segment.title}</h3>
                <p className="text-sm text-gray-600">{segment.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 8. FAQ */}
        <section id="faq" className="mb-16 scroll-mt-24 md:mb-20">
          <h2 className="mb-8 font-display text-2xl font-bold text-gray-900 md:text-3xl">
            Frequently asked questions
          </h2>
          <div className="space-y-6">
            {FAQ_ITEMS.map((item) => (
              <div
                key={item.question}
                className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
              >
                <h3 className="mb-2 text-lg font-semibold text-gray-900">{item.question}</h3>
                <p className="leading-relaxed text-gray-600">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Internal links */}
        <section className="mb-16 border-t border-gray-100 pt-12">
          <h2 className="mb-6 text-center text-sm font-semibold uppercase tracking-widest text-gray-500">
            Explore WhachatCRM guides
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {RELATED_GUIDE_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                <a className="block rounded-xl border border-gray-100 p-4 text-center text-sm font-semibold text-gray-700 transition-colors hover:border-green-200 hover:bg-green-50/40 hover:text-gray-900">
                  {link.label}
                </a>
              </Link>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-3xl bg-brand-green p-8 text-center text-white md:flex md:items-center md:justify-between md:p-10 md:text-left">
          <div className="max-w-xl">
            <h2 className="mb-3 font-display text-2xl font-bold text-white md:text-3xl">
              Compare WhachatCRM on your real workflows
            </h2>
            <p className="text-green-50">
              Start free, connect WhatsApp through Embedded Signup, and test omnichannel inbox, AI
              Copilot, and automation templates with your team.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row md:mt-0 md:shrink-0">
            <Link href="/auth">
              <Button
                size="lg"
                className="h-12 rounded-xl bg-white px-8 font-bold text-brand-green hover:bg-green-50"
              >
                Get Started Free
              </Button>
            </Link>
            <Link href="/contact">
              <Button
                size="lg"
                variant="outline"
                className="h-12 rounded-xl border-white/40 bg-transparent px-8 text-white hover:bg-white/10"
              >
                Talk to Sales
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
