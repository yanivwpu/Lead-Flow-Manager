import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, Minus, XCircle } from "lucide-react";
import { Helmet } from "react-helmet";
import { SiteFooter } from "@/components/SiteFooter";
import { MARKETING_URL } from "@/lib/marketingUrl";
import {
  FAQ_ITEMS,
  FEATURE_COMPARISON,
  INTERAKT_ALT_META,
  INTERAKT_BEST_FOR,
  INTERAKT_LIMITATIONS,
  INTERAKT_STRENGTHS,
  OMNICHANNEL_FIT_SIGNALS,
  RELATED_LINKS,
  type CompareCell,
} from "@/content/seo/interaktAlternativeContent";

const CANONICAL = `${MARKETING_URL}/interakt-alternative`;

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

export function InteraktAlternative() {
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
    name: INTERAKT_ALT_META.title,
    description: INTERAKT_ALT_META.description,
    url: CANONICAL,
  };

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>{INTERAKT_ALT_META.title}</title>
        <meta name="description" content={INTERAKT_ALT_META.description} />
        <meta name="keywords" content={INTERAKT_ALT_META.keywords} />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:title" content={INTERAKT_ALT_META.title} />
        <meta property="og:description" content={INTERAKT_ALT_META.description} />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${MARKETING_URL}/og/og-whachatcrm.png?v=3`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={INTERAKT_ALT_META.title} />
        <meta name="twitter:description" content={INTERAKT_ALT_META.description} />
        <meta name="twitter:image" content={`${MARKETING_URL}/og/og-whachatcrm.png?v=3`} />
        <script type="application/ld+json">{JSON.stringify(webPageSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
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

      <section className="mx-auto max-w-5xl px-4 pb-16 pt-12 text-center md:px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="mb-6 inline-block rounded-full bg-emerald-100 px-4 py-1 text-sm font-medium text-brand-green">
            Interakt alternative
          </span>
          <h1 className="mb-6 font-display text-3xl font-bold leading-tight text-gray-900 md:text-5xl">
            {INTERAKT_ALT_META.h1}
          </h1>
          <p className="mx-auto mb-8 max-w-3xl text-lg text-gray-600 md:text-xl">
            Interakt is a capable WhatsApp marketing and support platform for many teams. This page offers a balanced
            look at where Interakt fits, where an{" "}
            <Link href="/unified-inbox">
              <a className="font-medium text-brand-green hover:underline">omnichannel CRM</a>
            </Link>{" "}
            may serve you better, and how WhachatCRM compares — without oversimplifying either side.
          </p>
          <Link href="/auth">
            <a className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-brand-green px-8 font-semibold text-white shadow-lg hover:bg-emerald-700">
              Try WhachatCRM Free
              <ArrowRight className="h-5 w-5" />
            </a>
          </Link>
          <p className="mt-4 text-sm text-gray-500">Free plan available · No credit card required</p>
        </motion.div>
      </section>

      <section className="bg-gray-50 px-4 py-16 md:px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 font-display text-2xl font-bold text-gray-900 md:text-3xl">
            Who Interakt is best for
          </h2>
          <p className="mb-6 text-gray-600">
            Interakt built its reputation around WhatsApp-led growth — especially in markets where WhatsApp is the
            default sales and support channel. It can be a sensible choice when:
          </p>
          <ul className="space-y-3">
            {INTERAKT_BEST_FOR.map((item) => (
              <li key={item} className="flex gap-3 text-gray-700">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-4 py-16 md:px-6">
        <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-2">
          <div>
            <h2 className="mb-6 font-display text-2xl font-bold text-gray-900">Interakt strengths</h2>
            <div className="space-y-4">
              {INTERAKT_STRENGTHS.map((item) => (
                <div key={item.title} className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-5">
                  <h3 className="mb-1 font-semibold text-gray-900">{item.title}</h3>
                  <p className="text-sm text-gray-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="mb-6 font-display text-2xl font-bold text-gray-900">Interakt limitations to weigh</h2>
            <div className="space-y-4">
              {INTERAKT_LIMITATIONS.map((item) => (
                <div key={item.title} className="rounded-xl border border-amber-100 bg-amber-50/50 p-5">
                  <h3 className="mb-1 font-semibold text-gray-900">{item.title}</h3>
                  <p className="text-sm text-gray-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-gray-100 bg-gray-50 px-4 py-16 md:px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-4 font-display text-2xl font-bold text-gray-900 md:text-3xl">
            When an omnichannel CRM may be a better fit
          </h2>
          <p className="mb-6 text-gray-600">
            Interakt centers on WhatsApp. If your operations look like the signals below, compare an omnichannel inbox
            platform such as WhachatCRM alongside Interakt in your evaluation.
          </p>
          <ul className="space-y-3">
            {OMNICHANNEL_FIT_SIGNALS.map((item) => (
              <li key={item} className="flex gap-3 rounded-lg bg-white p-4 text-sm text-gray-700 shadow-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-4 py-16 md:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-3 text-center font-display text-2xl font-bold text-gray-900 md:text-3xl">
            WhachatCRM vs Interakt: feature comparison
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-center text-sm text-gray-500">
            High-level comparison for evaluation — verify current plans and packaging on each vendor&apos;s site before
            you buy.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="p-3 font-semibold text-gray-900">Feature</th>
                  <th className="p-3 text-center font-semibold text-gray-900">WhachatCRM</th>
                  <th className="p-3 text-center font-semibold text-gray-900">Interakt</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_COMPARISON.map((row) => (
                  <tr key={row.feature} className="border-t border-gray-100">
                    <td className="p-3 text-gray-700">{row.feature}</td>
                    <td className="p-3 text-center">
                      <CellDisplay value={row.whachat} />
                    </td>
                    <td className="p-3 text-center">
                      <CellDisplay value={row.interakt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 px-4 py-16 md:px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-center font-display text-2xl font-bold text-gray-900 md:text-3xl">
            Why teams evaluate WhachatCRM as an Interakt alternative
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-emerald-100 bg-white p-5">
              <h3 className="mb-2 font-semibold text-gray-900">Predictable SMB pricing</h3>
              <p className="text-sm text-gray-600">
                Free plan plus $19/$49 monthly tiers with unlimited users on Pro — easier to model than layered add-ons.
              </p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white p-5">
              <h3 className="mb-2 font-semibold text-gray-900">Omnichannel by default</h3>
              <p className="text-sm text-gray-600">
                WhatsApp, Messenger, Instagram, SMS, and web chat in one inbox — not a WhatsApp-only silo.
              </p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white p-5">
              <h3 className="mb-2 font-semibold text-gray-900">0% Meta fee markup</h3>
              <p className="text-sm text-gray-600">
                Meta conversation charges pass through at published rates; subscription covers platform features.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 md:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-center font-display text-2xl font-bold text-gray-900">FAQ</h2>
          <div className="space-y-4">
            {FAQ_ITEMS.map((item) => (
              <div key={item.question} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="mb-2 text-lg font-semibold text-gray-900">{item.question}</h3>
                <p className="leading-relaxed text-gray-600">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-gray-100 px-4 py-16 md:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 font-display text-2xl font-bold text-gray-900">Conclusion</h2>
          <p className="mb-4 text-gray-600">
            Interakt remains a credible WhatsApp platform for marketing-heavy teams comfortable with its packaging.
            WhachatCRM is worth a look when you want omnichannel inbox, bundled AI and templates, transparent Meta
            pricing, and a free tier to validate workflows before you commit.
          </p>
          <p className="text-gray-600">
            Run a parallel trial with your real conversations — qualification flows, support handoffs, and campaign
            replies — then choose based on total cost and daily usability, not feature checklists alone.
          </p>
        </div>
      </section>

      <section className="bg-brand-green px-4 py-16 md:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 font-display text-2xl font-bold text-white">Compare WhachatCRM on your workflows</h2>
          <p className="mb-8 text-emerald-100">Start free and test omnichannel inbox, AI Copilot, and templates.</p>
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
          <h3 className="mb-4 text-lg font-bold text-gray-900">Related comparisons</h3>
          <div className="flex flex-wrap gap-4">
            {RELATED_LINKS.map((link) => (
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
