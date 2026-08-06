import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  Inbox,
  Radar,
  Send,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { Helmet } from "react-helmet";
import { useAuth } from "@/lib/auth-context";
import { MARKETING_URL } from "@/lib/marketingUrl";
import { SiteFooter } from "@/components/SiteFooter";
import { BookDemoModal } from "@/components/BookDemoModal";
import { MarketingBreadcrumbs } from "@/components/marketing/MarketingBreadcrumbs";
import { MarketingLandingCta } from "@/components/marketing/MarketingLandingCta";
import { MarketingScreenshot } from "@/components/marketing/MarketingScreenshot";
import {
  PROSPECT_AI_LANDING,
  PROSPECT_AI_LANDING_PATH,
  PROSPECT_AI_LANDING_SEO,
} from "@/content/prospectAiLandingContent";
import { cn } from "@/lib/utils";

const C = PROSPECT_AI_LANDING;
const SEO = PROSPECT_AI_LANDING_SEO;

const FLOW_ICONS = [Radar, Sparkles, Send, Inbox, Users] as const;

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-5 text-start transition-colors hover:bg-gray-50"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-gray-900 md:text-base">{question}</span>
        <ArrowDown
          className={cn(
            "h-4 w-4 shrink-0 text-gray-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="px-5 pb-5 text-sm leading-relaxed text-gray-600 md:text-base">{answer}</div>
      ) : null}
    </div>
  );
}

export function ProspectAiLanding() {
  const { user } = useAuth();
  const [showDemoModal, setShowDemoModal] = useState(false);

  const canonical = `${MARKETING_URL}${PROSPECT_AI_LANDING_PATH}`;
  const ogImage = `${MARKETING_URL}${SEO.ogImagePath}`;
  const ctaHref = user
    ? C.authRedirect
    : `/auth?redirect=${encodeURIComponent(C.authRedirect)}`;

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: C.faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Prospect AI",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: canonical,
    description: SEO.description,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Included with every WhachatCRM plan. Free trial available.",
    },
    provider: {
      "@type": "Organization",
      name: "WhachatCRM",
      url: MARKETING_URL,
    },
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-white" data-testid="prospect-ai-landing">
      <Helmet>
        <title>{SEO.title}</title>
        <meta name="description" content={SEO.description} />
        <meta name="keywords" content={SEO.keywords} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={SEO.ogTitle} />
        <meta property="og:description" content={SEO.ogDescription} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={SEO.ogTitle} />
        <meta name="twitter:description" content={SEO.ogDescription} />
        <meta name="twitter:image" content={ogImage} />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(softwareSchema)}</script>
      </Helmet>

      <nav className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6 md:py-6 xl:max-w-[1440px]">
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
            <a className="hidden text-sm font-medium text-gray-600 hover:text-gray-900 sm:block">
              Pricing
            </a>
          </Link>
          <Link href={user ? "/app/inbox" : "/auth"}>
            <a className="rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green/90">
              {user ? "Dashboard" : "Start Free"}
            </a>
          </Link>
        </div>
      </nav>

      {/* Hero — brand first, full-bleed visual plane */}
      <header className="relative overflow-hidden border-b border-emerald-100/80">
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(5,150,105,0.14),_transparent_55%),linear-gradient(180deg,#f8fafc_0%,#ffffff_70%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-[url('/og/prospect-ai-growth-engine.png')] bg-cover bg-center opacity-[0.12]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-6 md:px-6 md:pb-24 md:pt-10 xl:max-w-[1440px]">
          <MarketingBreadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Prospect AI", href: PROSPECT_AI_LANDING_PATH },
            ]}
            className="mb-8"
          />
          <div className="max-w-3xl">
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="font-display text-4xl font-bold tracking-tight text-brand-green sm:text-5xl md:text-6xl"
              data-testid="prospect-ai-landing-brand"
            >
              {C.brand}
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08 }}
              className="mt-3 font-display text-2xl font-bold leading-tight text-gray-900 sm:text-3xl md:text-4xl"
            >
              {C.h1}
            </motion.h1>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.16 }}
              className="mt-5 space-y-1 text-lg leading-relaxed text-gray-600 md:text-xl"
            >
              {C.subheadlineLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </motion.div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={ctaHref}>
                <a
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-green px-8 font-semibold text-white hover:bg-brand-green/90"
                  data-testid="prospect-ai-landing-cta-primary"
                >
                  {C.primaryCta}
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Link>
              <button
                type="button"
                onClick={() => setShowDemoModal(true)}
                className="inline-flex h-12 items-center justify-center rounded-full border border-gray-300 bg-white px-8 font-semibold text-gray-900 hover:border-gray-400 hover:bg-gray-50"
                data-testid="prospect-ai-landing-cta-demo"
              >
                {C.secondaryCta}
              </button>
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.22 }}
            className="mt-12 md:mt-16"
          >
            <img
              src="/og/prospect-ai-growth-engine.png"
              alt="Prospect AI growth engine — discover businesses, qualify with AI, and launch outreach"
              className="mx-auto h-auto w-full max-w-4xl rounded-none object-cover shadow-none"
              width={1200}
              height={630}
            />
          </motion.div>
        </div>
      </header>

      <main>
        {/* Stop Cold Prospecting */}
        <section
          id={C.pain.id}
          className="scroll-mt-24 border-b border-gray-100 px-4 py-16 md:px-6 md:py-20"
        >
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-2xl font-bold text-gray-900 md:text-4xl">
              {C.pain.title}
            </h2>
            <div className="mt-6 space-y-4 text-base leading-relaxed text-gray-600 md:text-lg">
              {C.pain.paragraphs.map((p) => (
                <p key={p.slice(0, 40)}>{p}</p>
              ))}
            </div>
          </div>
        </section>

        {/* Meet Your AI Sales Team */}
        <section
          id={C.meetTeam.id}
          className="scroll-mt-24 bg-slate-50 px-4 py-16 md:px-6 md:py-20"
        >
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <h2 className="font-display text-2xl font-bold text-gray-900 md:text-4xl">
                {C.meetTeam.title}
              </h2>
              <div className="mt-6 space-y-4 text-base leading-relaxed text-gray-600 md:text-lg">
                {C.meetTeam.paragraphs.map((p) => (
                  <p key={p.slice(0, 40)}>{p}</p>
                ))}
              </div>
            </div>
            <MarketingScreenshot
              {...C.featureSections[0]!.image}
              className="my-0"
              captionAlign="left"
            />
          </div>
        </section>

        {/* How it works */}
        <section
          id={C.howItWorks.id}
          className="scroll-mt-24 px-4 py-16 md:px-6 md:py-20"
        >
          <div className="mx-auto max-w-5xl text-center">
            <h2 className="font-display text-2xl font-bold text-gray-900 md:text-4xl">
              {C.howItWorks.title}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base text-gray-600 md:text-lg">
              {C.howItWorks.subtitle}
            </p>
            <ol
              className="mt-12 flex flex-col items-center gap-2 sm:flex-row sm:items-stretch sm:justify-center sm:gap-1"
              data-testid="prospect-ai-landing-flow"
            >
              {C.howItWorks.steps.map((step, index) => {
                const Icon = FLOW_ICONS[index] ?? Target;
                return (
                  <li
                    key={step.label}
                    className="flex w-full max-w-xs flex-col items-center sm:max-w-none sm:flex-1 sm:flex-row sm:items-center"
                  >
                    <div className="flex w-full flex-col items-center rounded-2xl border border-emerald-100 bg-white px-3 py-5 shadow-sm">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-green text-white">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <p className="mt-3 text-sm font-bold text-gray-900">{step.label}</p>
                      <p className="mt-1 text-xs leading-snug text-gray-600">{step.detail}</p>
                    </div>
                    {index < C.howItWorks.steps.length - 1 ? (
                      <>
                        <ArrowDown className="my-1 h-4 w-4 text-brand-green sm:hidden" aria-hidden />
                        <span className="mx-1 hidden shrink-0 text-lg font-semibold text-brand-green sm:inline" aria-hidden>
                          →
                        </span>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* Feature sections with screenshots */}
        {C.featureSections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            className={cn(
              "scroll-mt-24 px-4 py-16 md:px-6 md:py-20",
              index % 2 === 1 ? "bg-slate-50" : "bg-white",
            )}
          >
            <div className="mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-2 lg:gap-14">
              <div className={cn(index % 2 === 1 && "lg:order-2")}>
                <h2 className="font-display text-2xl font-bold text-gray-900 md:text-4xl">
                  {section.title}
                </h2>
                <div className="mt-5 space-y-4 text-base leading-relaxed text-gray-600">
                  {section.paragraphs.map((p) => (
                    <p key={p.slice(0, 48)}>{p}</p>
                  ))}
                </div>
                <ul className="mt-6 space-y-2.5">
                  {section.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-sm text-gray-700 md:text-base">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={cn(index % 2 === 1 && "lg:order-1")}>
                <MarketingScreenshot {...section.image} className="my-0" captionAlign="left" />
              </div>
            </div>
          </section>
        ))}

        {/* Platform */}
        <section
          id={C.platform.id}
          className="scroll-mt-24 border-y border-gray-100 bg-gray-950 px-4 py-16 text-white md:px-6 md:py-20"
        >
          <div className="mx-auto max-w-5xl text-center">
            <h2 className="font-display text-2xl font-bold md:text-4xl">{C.platform.title}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-base text-gray-300 md:text-lg">
              {C.platform.subtitle}
            </p>
            <ul className="mt-10 flex flex-wrap justify-center gap-2.5 md:gap-3">
              {C.platform.items.map((item) => (
                <li
                  key={item}
                  className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-gray-100"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Why choose */}
        <section
          id={C.whyChoose.id}
          className="scroll-mt-24 px-4 py-16 md:px-6 md:py-20"
        >
          <div className="mx-auto max-w-5xl">
            <h2 className="font-display text-center text-2xl font-bold text-gray-900 md:text-4xl">
              {C.whyChoose.title}
            </h2>
            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {C.whyChoose.items.map((item) => (
                <li key={item.title} className="border-t border-emerald-200 pt-4">
                  <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24 bg-slate-50 px-4 py-16 md:px-6 md:py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-2xl font-bold text-gray-900 md:text-4xl">
              Frequently Asked Questions
            </h2>
            <div className="mt-8 space-y-3">
              {C.faqs.map((f) => (
                <FaqItem key={f.question} question={f.question} answer={f.answer} />
              ))}
            </div>
          </div>
        </section>

        {/* Related */}
        <section className="px-4 py-12 md:px-6">
          <div className="mx-auto max-w-5xl rounded-2xl border border-gray-100 bg-gray-50 p-6">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Related resources</h2>
            <div className="flex flex-wrap gap-3">
              {C.relatedLinks.map((l) => (
                <Link key={l.href} href={l.href}>
                  <a className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-brand-green hover:border-brand-green/40">
                    {l.label}
                  </a>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <MarketingLandingCta
        headline={C.finalCta.headline}
        onBookDemo={() => setShowDemoModal(true)}
      />

      <SiteFooter />
      <BookDemoModal isOpen={showDemoModal} onClose={() => setShowDemoModal(false)} />
    </div>
  );
}
