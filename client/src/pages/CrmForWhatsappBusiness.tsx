import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { Helmet } from "react-helmet";
import { SiteFooter } from "@/components/SiteFooter";
import { MarketingScreenshot } from "@/components/marketing/MarketingScreenshot";
import { MARKETING_URL } from "@/lib/marketingUrl";
import { S } from "@shared/marketingScreenshots";
import {
  APP_VS_API_VS_CRM,
  BUYER_GUIDE_STEPS,
  CRM_FOR_WHATSAPP_META,
  FAQ_ITEMS,
  KEY_FEATURES,
  RELATED_LINKS,
  WHACHAT_BENEFITS,
  WHO_NEEDS_CRM,
} from "@/content/seo/crmForWhatsappBusinessContent";

const CANONICAL = `${MARKETING_URL}/crm-for-whatsapp-business`;

export function CrmForWhatsappBusiness() {
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
    name: CRM_FOR_WHATSAPP_META.title,
    description: CRM_FOR_WHATSAPP_META.description,
    url: CANONICAL,
  };

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>{CRM_FOR_WHATSAPP_META.title}</title>
        <meta name="description" content={CRM_FOR_WHATSAPP_META.description} />
        <meta name="keywords" content={CRM_FOR_WHATSAPP_META.keywords} />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:title" content={CRM_FOR_WHATSAPP_META.title} />
        <meta property="og:description" content={CRM_FOR_WHATSAPP_META.description} />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${MARKETING_URL}/og/og-whachatcrm.png?v=3`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={CRM_FOR_WHATSAPP_META.title} />
        <meta name="twitter:description" content={CRM_FOR_WHATSAPP_META.description} />
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
            WhatsApp Business CRM guide
          </span>
          <h1 className="mb-6 font-display text-3xl font-bold leading-tight text-gray-900 md:text-5xl">
            {CRM_FOR_WHATSAPP_META.h1}
          </h1>
          <p className="mx-auto mb-8 max-w-3xl text-lg text-gray-600 md:text-xl">
            WhatsApp is where your customers already are — but the Business app alone was not built for teams,
            automations, or multi-channel support. This guide explains what a{" "}
            <strong>CRM for WhatsApp Business</strong> does, how it differs from the free app and the API, and
            how to choose software that scales with you.
          </p>
          <div className="mb-4 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/auth">
              <a className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-brand-green px-8 font-semibold text-white shadow-lg hover:bg-emerald-700">
                Start Free — No Credit Card
                <ArrowRight className="h-5 w-5" />
              </a>
            </Link>
            <Link href="/pricing">
              <a className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-gray-200 px-6 font-medium text-gray-700 hover:bg-gray-50">
                View Pricing
                <ChevronRight className="h-4 w-4" />
              </a>
            </Link>
          </div>
          <p className="text-sm text-gray-500">Free plan available · Paid plans from $19/month</p>
        </motion.div>
      </section>

      <section className="border-y border-gray-100 bg-gray-50 px-4 py-16 md:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-6 font-display text-2xl font-bold text-gray-900 md:text-3xl">
            What is a CRM for WhatsApp Business?
          </h2>
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            <div className="space-y-4 text-gray-600">
              <p>
                A <strong>CRM for WhatsApp Business</strong> connects your official WhatsApp number to a shared
                workspace where sales and support teams manage conversations, contacts, and follow-ups — not just
                messages in isolation.
              </p>
              <p>
                Instead of one employee holding the business phone, everyone sees the same inbox. You add tags like
                &quot;Hot lead&quot; or &quot;Awaiting payment,&quot; set reminders, and move deals through pipeline
                stages while WhatsApp remains the customer&apos;s preferred channel.
              </p>
              <p>
                The best platforms also unify{" "}
                <Link href="/unified-inbox">
                  <a className="font-medium text-brand-green hover:underline">Messenger, Instagram, SMS, and web chat</a>
                </Link>{" "}
                so a customer who starts on WhatsApp and follows up on Instagram still has one history your team can
                trust.
              </p>
            </div>
            <MarketingScreenshot
              {...S.dashboard}
              size="content"
              title="WhatsApp conversations in a team CRM"
              caption="Figure 1. A shared inbox keeps WhatsApp chats organized for sales and support — not scattered across personal devices."
              captionAlign="left"
            />
          </div>
        </div>
      </section>

      <section className="px-4 py-16 md:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-3 font-display text-2xl font-bold text-gray-900 md:text-3xl">
            WhatsApp Business app vs API vs CRM
          </h2>
          <p className="mb-8 max-w-3xl text-gray-600">
            Teams often confuse three layers. Use this table when you evaluate whether you have outgrown the mobile
            app.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="p-3 font-semibold text-gray-900">Aspect</th>
                  <th className="p-3 font-semibold text-gray-900">Business app</th>
                  <th className="p-3 font-semibold text-gray-900">Business API</th>
                  <th className="p-3 font-semibold text-gray-900">CRM platform</th>
                </tr>
              </thead>
              <tbody>
                {APP_VS_API_VS_CRM.map((row) => (
                  <tr key={row.aspect} className="border-t border-gray-100">
                    <td className="p-3 font-medium text-gray-900">{row.aspect}</td>
                    <td className="p-3 text-gray-600">{row.app}</td>
                    <td className="p-3 text-gray-600">{row.api}</td>
                    <td className="p-3 text-gray-600">{row.crm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-6 text-sm text-gray-500">
            Learn more in our{" "}
            <Link href="/whatsapp-business-api">
              <a className="text-brand-green hover:underline">WhatsApp Business API guide</a>
            </Link>{" "}
            and{" "}
            <Link href="/blog/whatsapp-business-api-vs-business-app">
              <a className="text-brand-green hover:underline">API vs Business app comparison</a>
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="bg-gray-50 px-4 py-16 md:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-8 text-center font-display text-2xl font-bold text-gray-900 md:text-3xl">
            Who needs a CRM for WhatsApp Business?
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WHO_NEEDS_CRM.map((item) => (
              <div key={item.title} className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="mb-2 font-semibold text-gray-900">{item.title}</h3>
                <p className="text-sm leading-relaxed text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 md:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-8 font-display text-2xl font-bold text-gray-900 md:text-3xl">
            What to look for in WhatsApp Business CRM software
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {KEY_FEATURES.map((item) => (
              <div key={item.title} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="mb-2 font-semibold text-gray-900">{item.title}</h3>
                <p className="mb-3 text-sm text-gray-600">{item.description}</p>
                <Link href={item.link.href}>
                  <a className="text-sm font-medium text-brand-green hover:underline">{item.link.label} →</a>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-gray-100 bg-gray-50 px-4 py-16 md:px-6">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="mb-4 font-display text-2xl font-bold text-gray-900 md:text-3xl">
              Connect every channel customers use
            </h2>
            <p className="mb-4 text-gray-600">
              A CRM for WhatsApp Business should not force your team to ignore Instagram DMs or website chat. Connect
              channels once, then route and assign from the same inbox.
            </p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
                WhatsApp via Meta embedded signup
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
                Messenger and Instagram messaging
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
                SMS and website chat widget
              </li>
            </ul>
          </div>
          <MarketingScreenshot
            {...S.channels}
            title="Omnichannel channel settings"
            figure={2}
            caption="Figure 2. Connect WhatsApp, Instagram, Messenger, and SMS from one settings panel."
            captionAlign="left"
          />
        </div>
      </section>

      <section className="px-4 py-16 md:px-6">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2 lg:items-start">
          <MarketingScreenshot
            {...S.automationTemplateCards}
            size="hero"
            title="Preset automation templates"
            figure={3}
            caption="Figure 3. Launch abandoned cart recovery, nurture, and offer templates without building flows from scratch."
            captionAlign="left"
          />
          <div>
            <h2 className="mb-4 font-display text-2xl font-bold text-gray-900 md:text-3xl">
              Automate follow-up without losing the human touch
            </h2>
            <p className="mb-4 text-gray-600">
              The right CRM combines templates for high-volume moments — cart recovery, booking reminders, FAQ routing
              — with a shared inbox so replies stay personal when customers write back.
            </p>
            <p className="text-gray-600">
              Explore{" "}
              <Link href="/automation-templates">
                <a className="font-medium text-brand-green hover:underline">automation templates</a>
              </Link>{" "}
              and{" "}
              <Link href="/shopify-crm">
                <a className="font-medium text-brand-green hover:underline">Shopify CRM workflows</a>
              </Link>{" "}
              if ecommerce is part of your WhatsApp strategy.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 px-4 py-16 md:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-center font-display text-2xl font-bold text-gray-900 md:text-3xl">
            Buyer guide: how to choose a WhatsApp Business CRM
          </h2>
          <div className="space-y-6">
            {BUYER_GUIDE_STEPS.map((item) => (
              <div key={item.step} className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="mb-2 font-semibold text-gray-900">{item.step}</h3>
                <p className="text-sm leading-relaxed text-gray-600">{item.detail}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-gray-500">
            For a broader market comparison, read{" "}
            <Link href="/best-whatsapp-crm-2026">
              <a className="text-brand-green hover:underline">Best WhatsApp CRM in 2026</a>
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="px-4 py-16 md:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-6 font-display text-2xl font-bold text-gray-900 md:text-3xl">
            Why teams choose WhachatCRM
          </h2>
          <div className="grid gap-8 lg:grid-cols-2">
            <ul className="space-y-3">
              {WHACHAT_BENEFITS.map((item) => (
                <li key={item} className="flex gap-3 text-gray-700">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand-green" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <MarketingScreenshot
              {...S.embeddedSignup}
              title="Guided WhatsApp onboarding"
              caption="Figure 4. Meta embedded signup connects your business number without manual developer setup."
              captionAlign="left"
            />
          </div>
        </div>
      </section>

      <section className="bg-gray-50 px-4 py-16 md:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-center font-display text-2xl font-bold text-gray-900 md:text-3xl">
            Frequently asked questions
          </h2>
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

      <section className="bg-brand-green px-4 py-16 md:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 font-display text-2xl font-bold text-white md:text-3xl">
            Ready to turn WhatsApp into a real CRM channel?
          </h2>
          <p className="mb-8 text-emerald-100">
            Start free, connect WhatsApp through embedded signup, and invite your team when you are ready.
          </p>
          <Link href="/auth">
            <a className="inline-flex h-14 items-center gap-2 rounded-full bg-white px-8 font-semibold text-brand-green hover:bg-gray-100">
              Get Started Free
              <ArrowRight className="h-5 w-5" />
            </a>
          </Link>
        </div>
      </section>

      <section className="border-t border-gray-100 px-4 py-12 md:px-6">
        <div className="mx-auto max-w-5xl">
          <h3 className="mb-6 text-center text-sm font-semibold uppercase tracking-widest text-gray-500">
            Related guides
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {RELATED_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                <a className="block rounded-xl border border-gray-100 p-4 text-center text-sm font-semibold text-gray-700 hover:border-green-200 hover:bg-green-50/40">
                  {link.label}
                </a>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
