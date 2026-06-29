import { useState } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet";
import {
  ArrowRight,
  Building2,
  Check,
  Handshake,
  Home,
  Loader2,
  Send,
  ShoppingBag,
  Sparkles,
  Users,
} from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { BookDemoModal } from "@/components/BookDemoModal";
import { MarketingBreadcrumbs, SEO_BREADCRUMBS } from "@/components/marketing/MarketingBreadcrumbs";
import { MarketingScreenshot } from "@/components/marketing/MarketingScreenshot";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MARKETING_URL } from "@/lib/marketingUrl";
import { PARTNER_DEFAULT_COMMISSION_RATE } from "@/lib/partnerProgram";
import { S } from "@shared/marketingScreenshots";
import {
  PARTNER_FAQS,
  PARTNER_MODELS,
  PARTNER_PRODUCT_LINES,
  PARTNER_PROGRAM_META,
  PARTNER_RELATED_LINKS,
  PARTNER_STEPS,
  PARTNER_TYPES,
  PARTNER_WHY_BENEFITS,
} from "@/content/partnerProgramContent";

const MODEL_ICONS = {
  referral: Users,
  agency: Building2,
  "real-estate": Home,
  shopify: ShoppingBag,
} as const;

const canonical = `${MARKETING_URL}/${PARTNER_PROGRAM_META.slug}`;

export function PartnerProgram() {
  const { toast } = useToast();
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [partnerType, setPartnerType] = useState<string>(PARTNER_TYPES[0]);
  const [clientCount, setClientCount] = useState("");
  const [services, setServices] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: PARTNER_FAQS.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: PARTNER_PROGRAM_META.title,
    description: PARTNER_PROGRAM_META.description,
    url: canonical,
  };

  const scrollToApply = () => {
    document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !company || !partnerType) {
      toast({
        title: "Missing fields",
        description: "Please fill in name, email, company, and partner type.",
        variant: "destructive",
      });
      return;
    }

    const body = [
      "WhachatCRM Partner Program Application",
      "",
      `Partner type: ${partnerType}`,
      `Company: ${company}`,
      website ? `Website: ${website}` : null,
      clientCount ? `Number of clients: ${clientCount}` : null,
      services ? `Services: ${services}` : null,
      "",
      message || "(No additional message)",
    ]
      .filter(Boolean)
      .join("\n");

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message: body }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Application sent",
          description: "We will review your application and reply within a few business days.",
        });
        setName("");
        setEmail("");
        setCompany("");
        setWebsite("");
        setPartnerType(PARTNER_TYPES[0]);
        setClientCount("");
        setServices("");
        setMessage("");
      } else {
        toast({
          title: "Could not send",
          description: data.error || "Please try again or email hello@whachatcrm.com",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Please email hello@whachatcrm.com with your partner application.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>{PARTNER_PROGRAM_META.title}</title>
        <meta name="description" content={PARTNER_PROGRAM_META.description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={PARTNER_PROGRAM_META.title} />
        <meta property="og:description" content={PARTNER_PROGRAM_META.description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${MARKETING_URL}/og/og-whachatcrm.png?v=3`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={PARTNER_PROGRAM_META.title} />
        <meta name="twitter:description" content={PARTNER_PROGRAM_META.description} />
        <meta name="twitter:image" content={`${MARKETING_URL}/og/og-whachatcrm.png?v=3`} />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(webPageSchema)}</script>
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
          <Link href="/partner-portal">
            <a className="hidden text-sm font-medium text-gray-600 hover:text-gray-900 sm:block">
              Partner Portal
            </a>
          </Link>
          <Link href="/pricing">
            <a className="hidden text-sm font-medium text-gray-600 hover:text-gray-900 sm:block">Pricing</a>
          </Link>
          <button
            type="button"
            onClick={scrollToApply}
            className="rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Apply
          </button>
        </div>
      </nav>

      <header className="border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white px-4 pb-14 pt-8 md:px-6 md:pb-16">
        <div className="mx-auto max-w-6xl">
          <MarketingBreadcrumbs
            items={SEO_BREADCRUMBS.page("Partner Program", PARTNER_PROGRAM_META.slug)}
            className="mb-6"
          />
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-14">
            <div className="max-w-xl">
              <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-4 py-1 text-sm font-medium text-brand-green">
                <Handshake className="h-4 w-4" />
                Partner Program
              </span>
              <h1 className="font-display text-3xl font-bold leading-tight text-gray-900 md:text-4xl lg:text-5xl">
                Partner with WhachatCRM and grow recurring revenue
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-gray-600">
                Help businesses turn WhatsApp, Messenger, Instagram, Shopify, and real estate leads into
                AI-powered conversations, automations, and sales.
              </p>
              <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-gray-200">
                <Sparkles className="h-4 w-4 text-brand-green" />
                {PARTNER_DEFAULT_COMMISSION_RATE.replace(".00", "")}% lifetime recurring commission for approved
                affiliate partners
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={scrollToApply}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-green px-7 font-semibold text-white hover:bg-emerald-700"
                >
                  Apply to Become a Partner
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowDemoModal(true)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-gray-300 bg-white px-7 font-semibold text-gray-900 hover:border-gray-400 hover:bg-gray-50"
                >
                  Book a Partner Call
                </button>
              </div>
            </div>
            <div className="flex justify-center lg:justify-end">
              <MarketingScreenshot
                {...S.unifiedInbox}
                size="hero"
                priority
                title="What partners help clients activate"
                caption="Unified inbox with AI Copilot, lead scoring, and property matching — a high-converting product your audience already needs."
                captionAlign="left"
                className="my-0"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-16">
        <section className="mb-16 md:mb-20">
          <h2 className="font-display mb-3 text-2xl font-bold text-gray-900 md:text-3xl">Partner models</h2>
          <p className="mb-8 max-w-2xl text-gray-600">
            Choose the path that matches how you work with clients. We assign the best fit during approval.
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            {PARTNER_MODELS.map((model) => {
              const Icon = MODEL_ICONS[model.id];
              return (
                <div
                  key={model.id}
                  className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-brand-green">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{model.title}</h3>
                  <p className="mt-2 text-sm text-gray-600">{model.audience}</p>
                  <ul className="mt-4 space-y-2">
                    {model.benefits.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm text-gray-700">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mb-16 md:mb-20">
          <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-12">
            <div>
              <h2 className="font-display mb-3 text-2xl font-bold text-gray-900 md:text-3xl">
                Why partner with WhachatCRM
              </h2>
              <p className="mb-6 text-gray-600">
                WhachatCRM sits at the intersection of messaging, AI, and revenue workflows — a category your
                clients are already asking about.
              </p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {PARTNER_WHY_BENEFITS.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm text-gray-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <MarketingScreenshot
              {...S.aiCopilot}
              title="AI Copilot partners can demo on day one"
              captionAlign="left"
              className="my-0 lg:ml-auto"
            />
          </div>
        </section>

        <section className="mb-16 md:mb-20">
          <h2 className="font-display mb-3 text-2xl font-bold text-gray-900 md:text-3xl">What partners can sell</h2>
          <p className="mb-8 max-w-2xl text-gray-600">
            Position complete product lines — from omnichannel inbox to vertical workflows for ecommerce and real
            estate.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PARTNER_PRODUCT_LINES.map((item) => (
              <Link key={item.href + item.label} href={item.href}>
                <a className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-800 transition-colors hover:border-brand-green/30 hover:bg-white hover:text-brand-green">
                  {item.label}
                  <ArrowRight className="h-4 w-4 shrink-0 opacity-50" />
                </a>
              </Link>
            ))}
          </div>
        </section>

        <section className="mb-16 md:mb-20">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
            <MarketingScreenshot
              {...S.automationWorkflows}
              title="Preset automations accelerate client wins"
              captionAlign="left"
              className="my-0"
            />
            <div>
              <h2 className="font-display mb-3 text-2xl font-bold text-gray-900 md:text-3xl">How it works</h2>
              <p className="mb-8 text-gray-600">A straightforward path from application to recurring commissions.</p>
              <ol className="space-y-6">
                {PARTNER_STEPS.map((s) => (
                  <li key={s.step} className="flex gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-green text-sm font-bold text-white">
                      {s.step}
                    </span>
                    <div>
                      <h3 className="font-semibold text-gray-900">{s.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-gray-600">{s.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="apply" className="mb-16 scroll-mt-24 md:mb-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6 md:p-8">
              <h2 className="font-display mb-2 text-2xl font-bold text-gray-900">Apply to the partner program</h2>
              <p className="mb-6 text-sm text-gray-600">
                Tell us about your business and clients. Already approved?{" "}
                <Link href="/partner-portal">
                  <a className="font-medium text-brand-green hover:underline">Sign in to the Partner Portal</a>
                </Link>
                .
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Name *</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Email *</label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Company *</label>
                    <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Website</label>
                    <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Partner type *</label>
                    <select
                      value={partnerType}
                      onChange={(e) => setPartnerType(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {PARTNER_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Number of clients</label>
                    <Input
                      value={clientCount}
                      onChange={(e) => setClientCount(e.target.value)}
                      placeholder="e.g. 25"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    What services do you provide?
                  </label>
                  <Input
                    value={services}
                    onChange={(e) => setServices(e.target.value)}
                    placeholder="Marketing, CRM setup, Shopify, real estate coaching…"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Message</label>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us about your audience and how you would promote WhachatCRM."
                    rows={4}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-green px-7 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit application
                </button>
              </form>
            </div>
            <MarketingScreenshot
              {...S.propertyMatchDetails}
              title="Real estate partners lead with outcomes"
              captionAlign="left"
              className="my-0 hidden lg:block"
            />
          </div>
        </section>

        <section id="faq" className="mb-16 md:mb-20">
          <h2 className="font-display mb-6 text-2xl font-bold text-gray-900 md:text-3xl">Partner program FAQs</h2>
          <dl className="space-y-4">
            {PARTNER_FAQS.map((f) => (
              <div key={f.question} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <dt className="font-semibold text-gray-900">{f.question}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-gray-600">{f.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-gray-50 p-6">
          <h2 className="mb-4 text-lg font-bold text-gray-900">Explore WhachatCRM product pages</h2>
          <div className="flex flex-wrap gap-3">
            {PARTNER_RELATED_LINKS.map((l) => (
              <Link key={l.href} href={l.href}>
                <a className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-brand-green hover:border-brand-green/40">
                  {l.label}
                </a>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <section className="border-t border-gray-100 bg-gradient-to-b from-gray-50 to-white px-4 py-16 md:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-2xl font-bold text-gray-900 md:text-3xl">
            Ready to grow with WhachatCRM?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-gray-600">
            Join consultants, agencies, and vertical experts earning recurring revenue from AI messaging CRM.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={scrollToApply}
              className="inline-flex h-11 min-w-[180px] items-center justify-center gap-2 rounded-full bg-brand-green px-8 font-semibold text-white hover:bg-emerald-700"
            >
              Apply to Become a Partner
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowDemoModal(true)}
              className="inline-flex h-11 min-w-[180px] items-center justify-center rounded-full border border-gray-300 bg-white px-8 font-semibold text-gray-900 hover:border-gray-400"
            >
              Book a Partner Call
            </button>
          </div>
        </div>
      </section>

      <SiteFooter />
      <BookDemoModal isOpen={showDemoModal} onClose={() => setShowDemoModal(false)} />
    </div>
  );
}
