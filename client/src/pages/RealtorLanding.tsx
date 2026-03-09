import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import {
  ArrowRight, CheckCircle2, Zap, MessageSquare, Brain, Calendar,
  Users, Target, Shield, ChevronDown, Globe, Smartphone, Search,
  Bot, Inbox, BarChart3, Layers, Send, Database, Sparkles, Mail, Share2, Check
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Helmet } from "react-helmet";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getDirection } from "@/lib/i18n";

function FaqItem({ question, answer, isRTL }: { question: string; answer: string; isRTL: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        className={`w-full flex items-center justify-between p-5 text-start hover:bg-gray-50 transition-colors`}
        onClick={() => setOpen(!open)}
        data-testid={`faq-toggle-${question.slice(0, 20).replace(/\s/g, '-')}`}
      >
        <span className="font-semibold text-gray-900 text-sm md:text-base">{question}</span>
        <ChevronDown className={`h-5 w-5 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 text-sm md:text-base text-gray-600 leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
}

export function RealtorLanding() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const isRTL = getDirection() === 'rtl';

  const ctaHref = user
    ? "/app/templates/realtor-growth-engine"
    : "/auth?redirect=/app/templates/realtor-growth-engine";

  const handleCta = () => {
    setLocation(ctaHref);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const workflowSteps = [
    { num: 1, icon: Globe, title: t("rge.workflow.s1.title"), desc: t("rge.workflow.s1.desc") },
    { num: 2, icon: Zap, title: t("rge.workflow.s2.title"), desc: t("rge.workflow.s2.desc") },
    { num: 3, icon: Brain, title: t("rge.workflow.s3.title"), desc: t("rge.workflow.s3.desc") },
    { num: 4, icon: Target, title: t("rge.workflow.s4.title"), desc: t("rge.workflow.s4.desc") },
    { num: 5, icon: Calendar, title: t("rge.workflow.s5.title"), desc: t("rge.workflow.s5.desc") },
    { num: 6, icon: Database, title: t("rge.workflow.s6.title"), desc: t("rge.workflow.s6.desc") },
  ];

  const setupItems = [
    { icon: Smartphone, text: t("rge.setup.item1") },
    { icon: Shield, text: t("rge.setup.item2") },
    { icon: Bot, text: t("rge.setup.item3") },
    { icon: Calendar, text: t("rge.setup.item4") },
    { icon: Layers, text: t("rge.setup.item5") },
  ];

  const platformFeatures = [
    { icon: Inbox, title: t("rge.platform.f1.title"), desc: t("rge.platform.f1.desc") },
    { icon: Brain, title: t("rge.platform.f2.title"), desc: t("rge.platform.f2.desc") },
    { icon: Search, title: t("rge.platform.f3.title"), desc: t("rge.platform.f3.desc") },
    { icon: Users, title: t("rge.platform.f4.title"), desc: t("rge.platform.f4.desc") },
    { icon: Send, title: t("rge.platform.f5.title"), desc: t("rge.platform.f5.desc") },
  ];

  const faqs = [
    { q: t("rge.faq.q1"), a: t("rge.faq.a1") },
    { q: t("rge.faq.q2"), a: t("rge.faq.a2") },
    { q: t("rge.faq.q3"), a: t("rge.faq.a3") },
    { q: t("rge.faq.q4"), a: t("rge.faq.a4") },
    { q: t("rge.faq.q5"), a: t("rge.faq.a5") },
    { q: t("rge.faq.q6"), a: t("rge.faq.a6") },
  ];

  const scrollToWorkflow = () => {
    document.getElementById("workflow-section")?.scrollIntoView({ behavior: "smooth" });
  };

  const arrowClass = isRTL ? "h-5 w-5 rotate-180" : "h-5 w-5";
  const arrowClassSm = isRTL ? "h-4 w-4 rotate-180" : "h-4 w-4";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="min-h-screen bg-white overflow-x-hidden">
      <Helmet>
        <title>Realtor Growth Engine – Turn Real Estate Leads Into Showings | WhachatCRM</title>
        <meta name="description" content="AI-powered WhatsApp automation that qualifies leads and schedules showings automatically. Fully done-for-you setup for real estate agents." />
        <meta name="keywords" content="realtor CRM, real estate lead qualification, WhatsApp automation for realtors, automated showing booking, real estate AI CRM, lead scoring for agents" />
        <link rel="canonical" href="https://whachatcrm.com/realtor-growth-engine" />
        <meta property="og:title" content="Realtor Growth Engine – Turn Real Estate Leads Into Showings" />
        <meta property="og:description" content="AI-powered WhatsApp automation that qualifies leads and schedules showings automatically." />
        <meta property="og:url" content="https://whachatcrm.com/realtor-growth-engine" />
        <meta property="og:image" content="https://whachatcrm.com/og/og-realtor-growth-engine.png" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Realtor Growth Engine – Turn Real Estate Leads Into Showings" />
        <meta name="twitter:description" content="AI-powered WhatsApp automation that qualifies leads and schedules showings automatically." />
        <meta name="twitter:image" content="https://whachatcrm.com/og/og-realtor-growth-engine.png" />
      </Helmet>

      <nav className="p-4 md:p-6 flex justify-between items-center max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="h-8 w-8 bg-brand-green rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">W</span>
            </div>
            <span className="font-display font-bold text-xl text-gray-900">WhachatCRM</span>
          </div>
        </Link>
        <div className="flex items-center gap-2 md:gap-4">
          <Link href="/pricing">
            <button className="text-sm font-medium text-gray-600 hover:text-gray-900 hidden sm:block">{t("rge.nav.pricing")}</button>
          </Link>
          <Link href="/blog">
            <button className="text-sm font-medium text-gray-600 hover:text-gray-900 hidden sm:block">{t("rge.nav.blog")}</button>
          </Link>
          <Link href={user ? "/app/chats" : "/auth"}>
            <button className="text-sm font-medium px-4 py-2 bg-brand-green text-white rounded-full hover:bg-emerald-700">
              {user ? t("rge.nav.dashboard") : t("rge.nav.startFree")}
            </button>
          </Link>
        </div>
      </nav>

      <div className="px-4 md:px-6 max-w-7xl xl:max-w-[1440px] mx-auto pt-2 pb-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="text-sm text-emerald-800">{t("rge.banner.curious")}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/contact">
              <span className="text-sm font-medium text-emerald-700 hover:text-emerald-900 underline underline-offset-2 cursor-pointer">{t("rge.banner.messageUs")}</span>
            </Link>
            <span className="text-emerald-300">|</span>
            <button 
              onClick={handleShare}
              className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-900 underline underline-offset-2 cursor-pointer transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
              {copied ? t("rge.banner.linkCopied") : t("rge.banner.share")}
            </button>
          </div>
        </div>
      </div>

      <section className="px-4 md:px-6 pt-6 md:pt-12 pb-16 md:pb-24 max-w-7xl xl:max-w-[1440px] mx-auto">
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 xl:gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-3xl md:text-5xl lg:text-[3.25rem] xl:text-6xl font-display font-bold text-gray-900 leading-[1.1] mb-4 md:mb-5" data-testid="text-hero-headline">
              Realtor<sup className="text-[0.35em]">®</sup> Growth Engine
            </h1>
            <p className="text-lg md:text-xl xl:text-2xl text-gray-600 mb-6 leading-relaxed">
              {t("rge.hero.subtitle")}
            </p>

            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-brand-green shrink-0" />
                <span className="text-base md:text-lg text-gray-700">{t("rge.hero.check1")}</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-brand-green shrink-0" />
                <span className="text-base md:text-lg text-gray-700">{t("rge.hero.check2")}</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-brand-green shrink-0" />
                <span className="text-base md:text-lg text-gray-700">{t("rge.hero.check3")}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <button
                onClick={handleCta}
                className="w-full sm:w-auto h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl cursor-pointer"
                data-testid="button-hero-early-access"
              >
                {t("rge.hero.earlyAccess")}
                <ArrowRight className={arrowClass} />
              </button>
              <button
                onClick={scrollToWorkflow}
                className="w-full sm:w-auto h-14 px-8 bg-white border border-gray-200 text-gray-700 font-medium rounded-full flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
                data-testid="button-hero-how-it-works"
              >
                {t("rge.hero.howItWorks")}
              </button>
            </div>

            <p className="text-sm text-emerald-600 font-medium">
              {t("rge.hero.launchOffer")}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative"
          >
            <div className="bg-gradient-to-br from-emerald-50 via-white to-teal-50 rounded-2xl sm:rounded-3xl border border-emerald-100 p-4 sm:p-6 md:p-8 shadow-xl">
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                  <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                    <Target className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 text-sm">{t("rge.preview.lead1Name")}</p>
                    <p className="text-xs text-gray-500 truncate">{t("rge.preview.lead1Quote")}</p>
                  </div>
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium shrink-0 hidden sm:inline md:inline">{t("rge.preview.lead1Tag")}</span>
                </div>

                <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                  <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <BarChart3 className="h-5 w-5 text-amber-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 text-sm">{t("rge.preview.lead2Name")}</p>
                    <p className="text-xs text-gray-500 truncate">{t("rge.preview.lead2Quote")}</p>
                  </div>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium shrink-0 hidden sm:inline md:inline">{t("rge.preview.lead2Tag")}</span>
                </div>

                <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <Sparkles className="h-5 w-5 text-blue-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 text-sm">{t("rge.preview.lead3Name")}</p>
                    <p className="text-xs text-gray-500 truncate">{t("rge.preview.lead3Quote")}</p>
                  </div>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium shrink-0 hidden sm:inline md:inline">{t("rge.preview.lead3Tag")}</span>
                </div>

                <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-semibold text-emerald-800">{t("rge.preview.aiAction")}</span>
                  </div>
                  <p className="text-xs text-emerald-700">{t("rge.preview.aiDetail")}</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section id="workflow-section" className="px-4 md:px-6 py-16 md:py-24 bg-gray-50">
        <div className="max-w-6xl xl:max-w-[1440px] mx-auto">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-4" data-testid="text-workflow-title">
              {t("rge.workflow.title")}
            </h2>
            <p className="text-base md:text-lg xl:text-xl text-gray-600 max-w-3xl mx-auto">
              {t("rge.workflow.subtitle")}
            </p>
          </div>

          <div className="relative">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 xl:gap-8 relative">
              {workflowSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <motion.div
                    key={step.num}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: step.num * 0.08 }}
                    className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow relative z-10"
                  >
                    <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
                      <div className="h-11 w-11 sm:h-12 sm:w-12 bg-brand-green text-white rounded-xl flex items-center justify-center shrink-0 shadow-md">
                        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                      </div>
                      <div className="w-full">
                        <span className="text-xs font-bold text-brand-green uppercase tracking-wider">{t("rge.workflow.step")} {step.num}</span>
                        <h3 className="text-base sm:text-lg font-bold text-gray-900 mt-1 mb-1">{step.title}</h3>
                        <p className="text-sm text-gray-600">{step.desc}</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <p className="text-center text-sm md:text-base text-gray-500 mt-8 max-w-2xl mx-auto">
            {t("rge.workflow.tagline")}
          </p>
        </div>
      </section>

      <section className="px-4 md:px-6 py-16 md:py-24 bg-white">
        <div className="max-w-5xl xl:max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            <div>
              <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-4" data-testid="text-setup-title">
                {t("rge.setup.title")}
              </h2>
              <p className="text-base md:text-lg text-gray-600 mb-8 leading-relaxed">
                {t("rge.setup.desc")}
              </p>
              <div className="space-y-4">
                {setupItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.text} className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-emerald-600" />
                      </div>
                      <span className="text-base md:text-lg text-gray-700">{item.text}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-sm text-gray-500 mt-6">{t("rge.setup.liveNote")}</p>
            </div>
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-white">
              <div className="flex items-center gap-3 mb-6">
                <Shield className="h-8 w-8 text-brand-green" />
                <h3 className="text-xl font-bold">{t("rge.onboarding.title")}</h3>
              </div>
              <div className="space-y-4 text-sm text-gray-300">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-brand-green shrink-0 mt-0.5" />
                  <span>{t("rge.onboarding.b1")}</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-brand-green shrink-0 mt-0.5" />
                  <span>{t("rge.onboarding.b2")}</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-brand-green shrink-0 mt-0.5" />
                  <span>{t("rge.onboarding.b3")}</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-brand-green shrink-0 mt-0.5" />
                  <span>{t("rge.onboarding.b4")}</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-brand-green shrink-0 mt-0.5" />
                  <span>{t("rge.onboarding.b5")}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 md:px-6 py-16 md:py-24 bg-gray-50">
        <div className="max-w-6xl xl:max-w-[1440px] mx-auto">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-4" data-testid="text-platform-title">
              {t("rge.platform.title")}
            </h2>
            <p className="text-base md:text-lg xl:text-xl text-gray-600 max-w-3xl mx-auto">
              {t("rge.platform.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-6">
            {platformFeatures.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 p-4 sm:p-6 text-center hover:shadow-md transition-shadow">
                  <div className="h-12 w-12 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Icon className="h-6 w-6 text-emerald-600" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-sm text-gray-500">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 md:px-6 py-16 md:py-24 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl sm:rounded-3xl border border-emerald-100 p-5 sm:p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-4" data-testid="text-pricing-title">
              {t("rge.pricing.title")}
            </h2>
            <p className="text-base md:text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              {t("rge.pricing.subtitle")}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-8">
              <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5 shadow-sm">
                <div className="text-sm font-medium text-gray-500 mb-1">{t("rge.pricing.platform")}</div>
                <div className="text-lg font-bold text-gray-900">{t("rge.pricing.platformName")}</div>
                <div className="text-sm text-gray-500">{t("rge.pricing.platformPrice")}</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5 shadow-sm">
                <div className="text-sm font-medium text-gray-500 mb-1">{t("rge.pricing.addon")}</div>
                <div className="text-lg font-bold text-gray-900">{t("rge.pricing.addonName")}</div>
                <div className="text-sm text-gray-500">{t("rge.pricing.addonPrice")}</div>
              </div>
              <div className="bg-white rounded-xl border border-emerald-200 p-4 sm:p-5 shadow-sm ring-2 ring-emerald-100">
                <div className="text-lg font-bold text-gray-900">{t("rge.pricing.setupName")}</div>
                <div className="text-base font-bold text-gray-900 mt-1">
                  <span className="line-through text-gray-400 font-normal">{t("rge.pricing.setupOriginalPrice")}</span>{" "}
                  <span className="text-emerald-600">{t("rge.pricing.setupSalePrice")}</span>
                </div>
                <div className="text-sm text-emerald-600 font-medium mt-1">{t("rge.pricing.setupDiscount")}</div>
              </div>
            </div>

            <p className="text-sm text-gray-500 mb-8">
              {t("rge.pricing.metaNote")}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mb-4">
              <button
                onClick={handleCta}
                className="w-full sm:w-auto h-14 px-10 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl text-base sm:text-lg cursor-pointer"
                data-testid="button-pricing-early-access"
              >
                {t("rge.hero.earlyAccess")}
                <ArrowRight className={arrowClass} />
              </button>
              <Link href="/pricing" className="w-full sm:w-auto">
                <button className="w-full sm:w-auto h-14 px-10 bg-white border border-gray-200 text-gray-700 font-medium rounded-full flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors text-base sm:text-lg" data-testid="button-pricing-plans">
                  <BarChart3 className="h-5 w-5" />
                  {t("rge.pricing.viewPlans")}
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 md:px-6 py-16 md:py-24 bg-gray-50">
        <div className="max-w-3xl xl:max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 text-center mb-10 md:mb-14" data-testid="text-faq-title">
            {t("rge.faq.title")}
          </h2>
          <div className="space-y-3">
            {faqs.map((faq) => (
              <FaqItem key={faq.q} question={faq.q} answer={faq.a} isRTL={isRTL} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 md:px-6 py-12 md:py-16 bg-gray-900 text-white">
        <div className="max-w-3xl xl:max-w-4xl mx-auto text-center">
          <h2 className="text-xl md:text-3xl xl:text-4xl font-display font-bold mb-4">
            {t("rge.cta.title")}
          </h2>
          <p className="text-gray-400 xl:text-lg mb-6">
            {t("rge.cta.subtitle")}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <button
              onClick={handleCta}
              className="w-full sm:w-auto h-12 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-all cursor-pointer"
              data-testid="button-footer-cta"
            >
              {t("rge.hero.earlyAccess")}
              <ArrowRight className={arrowClassSm} />
            </button>
            <Link href="/pricing" className="w-full sm:w-auto">
              <button className="w-full sm:w-auto h-12 px-8 bg-gray-800 border border-gray-700 text-gray-300 font-medium rounded-full flex items-center justify-center gap-2 hover:bg-gray-700 transition-colors" data-testid="button-footer-plans">
                <BarChart3 className={arrowClassSm} />
                {t("rge.pricing.viewPlans")}
              </button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="px-4 md:px-6 py-6 md:py-8 border-t border-gray-100">
        <div className="max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 bg-brand-green rounded-md flex items-center justify-center">
                <span className="text-white font-bold text-sm">W</span>
              </div>
              <span className="font-display font-bold text-gray-900">WhachatCRM</span>
            </div>

            <div className="grid grid-cols-3 gap-x-6 sm:gap-x-8 gap-y-4 w-full md:w-auto">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t("rge.footer.product")}</p>
                <div className="flex flex-col gap-1.5 text-sm text-gray-500">
                  <Link href="/pricing"><span className="hover:text-gray-900 cursor-pointer">{t("rge.footer.pricing")}</span></Link>
                  <Link href="/whatsapp-crm"><span className="hover:text-gray-900 cursor-pointer">{t("rge.footer.whatsappCrm")}</span></Link>
                  <Link href="/blog"><span className="hover:text-gray-900 cursor-pointer">{t("rge.footer.blog")}</span></Link>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t("rge.footer.solutions")}</p>
                <div className="flex flex-col gap-1.5 text-sm text-gray-500">
                  <Link href="/realtor-growth-engine"><span className="hover:text-gray-900 cursor-pointer">{t("rge.footer.rge")}</span></Link>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t("rge.footer.legal")}</p>
                <div className="flex flex-col gap-1.5 text-sm text-gray-500">
                  <Link href="/privacy-policy"><span className="hover:text-gray-900 cursor-pointer">{t("rge.footer.privacy")}</span></Link>
                  <Link href="/terms-of-use"><span className="hover:text-gray-900 cursor-pointer">{t("rge.footer.terms")}</span></Link>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-400">© 2025 WhachatCRM</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
