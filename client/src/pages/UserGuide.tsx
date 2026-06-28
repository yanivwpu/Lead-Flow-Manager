import { Link } from "wouter";
import { Helmet } from "react-helmet";
import { ArrowLeft } from "lucide-react";
import { MARKETING_URL } from "@/lib/marketingUrl";
import { MarketingBreadcrumbs, SEO_BREADCRUMBS } from "@/components/marketing/MarketingBreadcrumbs";
import { MarketingScreenshot } from "@/components/marketing/MarketingScreenshot";
import {
  USER_GUIDE_FAQS,
  USER_GUIDE_RELATED_LINKS,
  USER_GUIDE_SECTIONS,
  type HelpSection,
} from "@/content/help/userGuideContent";

function renderSection(section: HelpSection) {
  return (
    <section key={section.id} id={section.id} className="scroll-mt-24">
      <h2 className="mt-12 text-2xl font-bold text-gray-900">{section.title}</h2>
      {section.intro ? <p className="mt-3 text-gray-600">{section.intro}</p> : null}
      {section.paragraphs?.map((p, i) => (
        <p key={i} className="mt-3 text-gray-600">
          {p}
        </p>
      ))}
      {section.bullets?.length ? (
        <ul className="mt-3 list-disc space-y-2 pl-5 text-gray-600">
          {section.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : null}
      {section.image ? <MarketingScreenshot {...section.image} className="mt-6" /> : null}
      {section.subsections?.map((sub) => (
        <div key={sub.title} className="mt-8">
          <h3 className="text-lg font-semibold text-gray-900">{sub.title}</h3>
          {sub.paragraphs?.map((p, i) => (
            <p key={i} className="mt-2 text-gray-600">
              {p}
            </p>
          ))}
          {sub.bullets?.length ? (
            <ul className="mt-2 list-disc space-y-2 pl-5 text-gray-600">
              {sub.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : null}
          {sub.image ? <MarketingScreenshot {...sub.image} className="mt-4" /> : null}
        </div>
      ))}
    </section>
  );
}

export function UserGuide() {
  const canonical = `${MARKETING_URL}/user-guide`;
  const title = "Help Center & User Guide | WhachatCRM";
  const description =
    "Complete WhachatCRM Help Center: onboarding, WhatsApp embedded signup, unified inbox, AI Copilot, Growth Engine, MLS, Shopify, agent pages, and 40+ FAQs.";
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: USER_GUIDE_FAQS.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      </Helmet>

      <div className="mx-auto max-w-3xl rounded-2xl border border-gray-100 bg-white p-8 shadow-sm md:p-12">
        <Link href="/">
          <a className="mb-6 inline-flex items-center text-sm text-gray-500 hover:text-brand-green">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </a>
        </Link>

        <MarketingBreadcrumbs items={SEO_BREADCRUMBS.helpCenter} className="mb-6" />

        <h1 className="font-display mb-2 text-3xl font-bold text-gray-900 md:text-4xl">WhachatCRM Help Center</h1>
        <p className="mb-2 text-gray-600">
          Your complete guide from account setup through advanced automations, MLS, and Shopify integrations.
        </p>
        <p className="mb-8 text-sm text-gray-500">
          Last updated: June 21, 2026 ·{" "}
          <Link href="/help">
            <a className="text-brand-green hover:underline">Search help articles</a>
          </Link>
        </p>

        <nav className="mb-10 rounded-xl border border-gray-100 bg-gray-50 p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">On this page</h2>
          <ul className="grid gap-2 text-sm text-brand-green sm:grid-cols-2">
            {USER_GUIDE_SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
            <li>
              <a href="#faq" className="hover:underline">
                FAQs ({USER_GUIDE_FAQS.length})
              </a>
            </li>
          </ul>
        </nav>

        <div className="prose prose-gray max-w-none">
          <p className="text-gray-600">
            WhachatCRM is a messaging-first CRM for WhatsApp, Messenger, Instagram, and ecommerce integrations. Use
            this guide alongside our SEO resource pages for{" "}
            <Link href="/whatsapp-crm">
              <a className="text-brand-green hover:underline">WhatsApp CRM</a>
            </Link>
            ,{" "}
            <Link href="/shopify-crm">
              <a className="text-brand-green hover:underline">Shopify CRM</a>
            </Link>
            , and{" "}
            <Link href="/real-estate-crm">
              <a className="text-brand-green hover:underline">Real Estate CRM</a>
            </Link>
            .
          </p>

          {USER_GUIDE_SECTIONS.map(renderSection)}

          <section id="faq" className="scroll-mt-24">
            <h2 className="mt-12 text-2xl font-bold text-gray-900">Frequently asked questions</h2>
            <dl className="mt-6 space-y-4">
              {USER_GUIDE_FAQS.map((f) => (
                <div key={f.question} className="rounded-xl border border-gray-100 p-4">
                  <dt className="font-semibold text-gray-900">{f.question}</dt>
                  <dd className="mt-2 text-gray-600">{f.answer}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-12 rounded-xl border border-gray-100 bg-gray-50 p-6">
            <h2 className="text-lg font-bold text-gray-900">Related guides</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {USER_GUIDE_RELATED_LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  <a className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-brand-green hover:border-brand-green/40">
                    {l.label}
                  </a>
                </Link>
              ))}
            </div>
          </section>

          <p className="mt-10 text-sm text-gray-500">
            Questions?{" "}
            <Link href="/contact">
              <a className="text-brand-green hover:underline">Contact support</a>
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
