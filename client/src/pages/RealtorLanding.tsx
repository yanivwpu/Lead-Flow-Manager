import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import {
  ArrowRight, CheckCircle2, Zap, MessageSquare, Brain, Calendar,
  Users, Target, Shield, ChevronDown, Globe, Smartphone, Search,
  Bot, Inbox, BarChart3, Layers, Send, Database, Sparkles, Mail, Share2, Check,
  TrendingUp, PhoneOff, Lightbulb, Clock, LayoutGrid
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Helmet } from "react-helmet";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getDirection } from "@/lib/i18n";
import { SiteFooter } from "@/components/SiteFooter";

function RealtorMark() {
  return (
    <span className="inline">Realtor<span style={{ fontSize: '0.35em', verticalAlign: 'super', lineHeight: 0, position: 'relative', top: '-0.15em' }}>&reg;</span></span>
  );
}

function FaqItem({ question, answer, isRTL }: { question: string; answer: string; isRTL: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-5 text-start hover:bg-gray-50 transition-colors"
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
    : "/signup?redirect=/app/templates/realtor-growth-engine";

  const handleCta = () => {
    setLocation(ctaHref);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scrollToWorkflow = () => {
    document.getElementById("workflow-section")?.scrollIntoView({ behavior: "smooth" });
  };

  const arrowClass = isRTL ? "h-5 w-5 rotate-180" : "h-5 w-5";
  const arrowClassSm = isRTL ? "h-4 w-4 rotate-180" : "h-4 w-4";

  const faqs = [
    { q: t("rge.faq.q1"), a: t("rge.faq.a1") },
    { q: t("rge.faq.q2"), a: t("rge.faq.a2") },
    { q: t("rge.faq.q3"), a: t("rge.faq.a3") },
    { q: t("rge.faq.q4"), a: t("rge.faq.a4") },
    { q: t("rge.faq.q5"), a: t("rge.faq.a5") },
    { q: t("rge.faq.q6"), a: t("rge.faq.a6") },
  ];

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

      {/* NAV */}
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

      {/* ─────────────────────────────────────────────────── */}
      {/* SECTION 1: HERO */}
      {/* ─────────────────────────────────────────────────── */}
      <section className="px-4 md:px-6 pt-6 md:pt-12 pb-16 md:pb-24 max-w-7xl xl:max-w-[1440px] mx-auto">
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 xl:gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1
              className="text-3xl md:text-5xl lg:text-[3.25rem] xl:text-6xl font-display font-bold text-gray-900 leading-[1.1] mb-4 md:mb-5"
              data-testid="text-hero-headline"
            >
              {t("rge.hero.mainTitle")}
            </h1>
            <p className="text-lg md:text-xl xl:text-2xl text-gray-600 mb-3 leading-relaxed">
              {t("rge.hero.mainSubtitle")}
            </p>
            <p className="text-base text-gray-500 mb-8">
              {t("rge.hero.mainDesc")}
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleCta}
                className="w-full sm:w-auto h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl cursor-pointer"
                data-testid="button-hero-install"
              >
                {t("rge.hero.installCta")}
                <ArrowRight className={arrowClass} />
              </button>
              <button
                onClick={scrollToWorkflow}
                className="w-full sm:w-auto h-14 px-8 bg-white border border-gray-200 text-gray-700 font-medium rounded-full flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
                data-testid="button-hero-how-it-works"
              >
                {t("rge.hero.seeHowItWorks")}
              </button>
            </div>
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
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium shrink-0 hidden sm:inline">{t("rge.preview.lead1Tag")}</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                  <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <BarChart3 className="h-5 w-5 text-amber-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 text-sm">{t("rge.preview.lead2Name")}</p>
                    <p className="text-xs text-gray-500 truncate">{t("rge.preview.lead2Quote")}</p>
                  </div>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium shrink-0 hidden sm:inline">{t("rge.preview.lead2Tag")}</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <Sparkles className="h-5 w-5 text-blue-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 text-sm">{t("rge.preview.lead3Name")}</p>
                    <p className="text-xs text-gray-500 truncate">{t("rge.preview.lead3Quote")}</p>
                  </div>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium shrink-0 hidden sm:inline">{t("rge.preview.lead3Tag")}</span>
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

      {/* ─────────────────────────────────────────────────── */}
      {/* SECTION 2: DONE-FOR-YOU SETUP */}
      {/* ─────────────────────────────────────────────────── */}
      <section className="px-4 md:px-6 py-16 md:py-20 bg-emerald-50" data-testid="section-done-for-you">
        <div className="max-w-5xl xl:max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            <div>
              <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-3" data-testid="text-setup-title">
                {t("rge.setup.title")}
              </h2>
              <p className="text-base md:text-lg text-gray-600 mb-8 leading-relaxed">
                {t("rge.setup.noTech")}
              </p>
              <div className="space-y-4">
                {[
                  { icon: Smartphone, key: "rge.setup.setupItem1" },
                  { icon: Shield, key: "rge.setup.setupItem2" },
                  { icon: Bot, key: "rge.setup.setupItem3" },
                  { icon: LayoutGrid, key: "rge.setup.setupItem4" },
                  { icon: Calendar, key: "rge.setup.setupItem5" },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.key} className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-emerald-600" />
                      </div>
                      <span className="text-base md:text-lg text-gray-800 font-medium">{t(item.key)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-gray-900 rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-white">
              <div className="flex items-center gap-3 mb-6">
                <Shield className="h-8 w-8 text-brand-green shrink-0" />
                <h3 className="text-xl font-bold">{t("rge.setup.teamTitle")}</h3>
              </div>
              <div className="space-y-4 text-sm text-gray-300">
                {["rge.setup.teamItem1","rge.setup.teamItem2","rge.setup.teamItem3","rge.setup.teamItem4","rge.setup.teamItem5"].map((key) => (
                  <div key={key} className="flex items-start gap-3">
                    <CheckCircle2 className="h-4 w-4 text-brand-green shrink-0 mt-0.5" />
                    <span>{t(key)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────── */}
      {/* SECTION 3: WHAT THE GROWTH ENGINE DOES */}
      {/* ─────────────────────────────────────────────────── */}
      <section className="px-4 md:px-6 py-16 md:py-24 bg-white" data-testid="section-what-it-does">
        <div className="max-w-6xl xl:max-w-[1440px] mx-auto">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-4" data-testid="text-features-title">
              {t("rge.features.title")}
            </h2>
            <p className="text-base md:text-lg xl:text-xl text-gray-600 max-w-3xl mx-auto">
              {t("rge.features.subtitle")}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Zap, titleKey: "rge.features.f1.title", descKey: "rge.features.f1.desc" },
              { icon: Target, titleKey: "rge.features.f2.title", descKey: "rge.features.f2.desc" },
              { icon: Lightbulb, titleKey: "rge.features.f3.title", descKey: "rge.features.f3.desc" },
              { icon: Calendar, titleKey: "rge.features.f4.title", descKey: "rge.features.f4.desc" },
              { icon: Clock, titleKey: "rge.features.f5.title", descKey: "rge.features.f5.desc" },
              { icon: LayoutGrid, titleKey: "rge.features.f6.title", descKey: "rge.features.f6.desc" },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.06 }}
                  className="bg-gray-50 rounded-2xl border border-gray-100 p-6 hover:shadow-md transition-shadow"
                >
                  <div className="h-12 w-12 bg-brand-green/10 rounded-xl flex items-center justify-center mb-4">
                    <Icon className="h-6 w-6 text-brand-green" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-2">{t(item.titleKey)}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{t(item.descKey)}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────── */}
      {/* SECTION 4: VISUAL WORKFLOW */}
      {/* ─────────────────────────────────────────────────── */}
      <section id="workflow-section" className="px-4 md:px-6 py-16 md:py-24 bg-gray-50" data-testid="section-workflow">
        <div className="max-w-6xl xl:max-w-[1440px] mx-auto">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-4" data-testid="text-workflow-title">
              {t("rge.howItWorks.title")}
            </h2>
            <p className="text-base md:text-lg xl:text-xl text-gray-600 max-w-3xl mx-auto">
              {t("rge.howItWorks.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 xl:gap-8">
            {[
              { num: 1, icon: MessageSquare, titleKey: "rge.howItWorks.s1.title", descKey: "rge.howItWorks.s1.desc" },
              { num: 2, icon: Zap, titleKey: "rge.howItWorks.s2.title", descKey: "rge.howItWorks.s2.desc" },
              { num: 3, icon: Brain, titleKey: "rge.howItWorks.s3.title", descKey: "rge.howItWorks.s3.desc" },
              { num: 4, icon: Calendar, titleKey: "rge.howItWorks.s4.title", descKey: "rge.howItWorks.s4.desc" },
              { num: 5, icon: Users, titleKey: "rge.howItWorks.s5.title", descKey: "rge.howItWorks.s5.desc" },
              { num: 6, icon: TrendingUp, titleKey: "rge.howItWorks.s6.title", descKey: "rge.howItWorks.s6.desc" },
            ].map((step) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: step.num * 0.08 }}
                  className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
                    <div className="h-11 w-11 sm:h-12 sm:w-12 bg-brand-green text-white rounded-xl flex items-center justify-center shrink-0 shadow-md">
                      <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                    <div className="w-full">
                      <span className="text-xs font-bold text-brand-green uppercase tracking-wider">{t("rge.howItWorks.step")} {step.num}</span>
                      <h3 className="text-base sm:text-lg font-bold text-gray-900 mt-1 mb-1">{t(step.titleKey)}</h3>
                      <p className="text-sm text-gray-600">{t(step.descKey)}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <p className="text-center text-lg md:text-xl font-semibold text-gray-900 mt-12" data-testid="text-workflow-tagline">
            {t("rge.howItWorks.tagline")}
          </p>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────── */}
      {/* SECTION 5: BUILT FOR */}
      {/* ─────────────────────────────────────────────────── */}
      <section className="px-4 md:px-6 py-16 md:py-24 bg-white" data-testid="section-built-for">
        <div className="max-w-5xl xl:max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-4" data-testid="text-built-for-title">
              {t("rge.builtFor.title")}
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.05 }}
              className="bg-gray-50 rounded-2xl border border-gray-100 p-8"
            >
              <div className="h-14 w-14 bg-brand-green/10 rounded-2xl flex items-center justify-center mb-5">
                <PhoneOff className="h-7 w-7 text-brand-green" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{t("rge.builtFor.solo.title")}</h3>
              <p className="text-sm text-gray-600">{t("rge.builtFor.solo.desc")}</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-gray-50 rounded-2xl border border-gray-100 p-8"
            >
              <div className="h-14 w-14 bg-brand-green/10 rounded-2xl flex items-center justify-center mb-5">
                <Users className="h-7 w-7 text-brand-green" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{t("rge.builtFor.teams.title")}</h3>
              <p className="text-sm text-gray-600">{t("rge.builtFor.teams.desc")}</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.15 }}
              className="bg-gray-50 rounded-2xl border border-gray-100 p-8"
            >
              <div className="h-14 w-14 bg-brand-green/10 rounded-2xl flex items-center justify-center mb-5">
                <TrendingUp className="h-7 w-7 text-brand-green" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{t("rge.builtFor.ads.title")}</h3>
              <p className="text-sm text-gray-600">{t("rge.builtFor.ads.desc")}</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────── */}
      {/* SECTION 6: WHAT HAPPENS AFTER YOU ACTIVATE */}
      {/* ─────────────────────────────────────────────────── */}
      <section className="px-4 md:px-6 py-16 md:py-24 bg-gray-50" data-testid="section-after-activate">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-4" data-testid="text-activate-title">
              {t("rge.activate.title")}
            </h2>
            <p className="text-base md:text-lg text-gray-600">
              {t("rge.activate.subtitle")}
            </p>
          </div>
          <div className="space-y-6">
            {[
              { num: 1, titleKey: "rge.activate.s1.title", descKey: "rge.activate.s1.desc" },
              { num: 2, titleKey: "rge.activate.s2.title", descKey: "rge.activate.s2.desc" },
              { num: 3, titleKey: "rge.activate.s3.title", descKey: "rge.activate.s3.desc" },
              { num: 4, titleKey: "rge.activate.s4.title", descKey: "rge.activate.s4.desc" },
            ].map((step) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: step.num * 0.08 }}
                className="flex gap-5 bg-white rounded-2xl border border-gray-100 p-6 shadow-sm"
              >
                <div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-brand-green text-white font-bold text-base">
                  {step.num}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base mb-1">{t(step.titleKey)}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{t(step.descKey)}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────── */}
      {/* SECTION 7: PRICING */}
      {/* ─────────────────────────────────────────────────── */}
      <section className="px-4 md:px-6 py-16 md:py-24 bg-white" data-testid="section-pricing">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl sm:rounded-3xl border border-emerald-100 p-6 sm:p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-4" data-testid="text-pricing-title">
              {t("rge.pricingSection.title")}
            </h2>
            <p className="text-base md:text-lg text-gray-600 mb-10 max-w-2xl mx-auto">
              {t("rge.pricingSection.subtitle")}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm text-left">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t("rge.pricingSection.corePlatform")}</p>
                <p className="text-lg font-bold text-gray-900">WhachatCRM Pro</p>
                <p className="text-base text-gray-600 mt-1">$49/mo</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm text-left">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t("rge.pricingSection.aiLayer")}</p>
                <p className="text-lg font-bold text-gray-900">AI Brain</p>
                <p className="text-base text-gray-600 mt-1">$29/mo</p>
              </div>
              <div className="bg-white rounded-xl border border-emerald-200 p-5 shadow-sm ring-2 ring-emerald-100 text-left">
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-2">{t("rge.pricingSection.templateLicense")}</p>
                <p className="text-lg font-bold text-gray-900">{t("rge.pricingSection.oneTime")}</p>
                <p className="text-base font-semibold text-emerald-600 mt-1">$199</p>
              </div>
            </div>

            <p className="text-sm text-gray-500 mb-8" data-testid="text-meta-note">
              {t("rge.pricingSection.metaNote")}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
              <button
                onClick={handleCta}
                className="w-full sm:w-auto h-14 px-10 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl text-base sm:text-lg cursor-pointer"
                data-testid="button-pricing-install"
              >
                {t("rge.pricingSection.installCta")}
                <ArrowRight className={arrowClass} />
              </button>
              <Link href="/pricing" className="w-full sm:w-auto">
                <button className="w-full sm:w-auto h-14 px-10 bg-white border border-gray-200 text-gray-700 font-medium rounded-full flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors text-base sm:text-lg" data-testid="button-pricing-plans">
                  <BarChart3 className="h-5 w-5" />
                  {t("rge.pricingSection.viewPlans")}
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
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

      {/* ─────────────────────────────────────────────────── */}
      {/* SECTION 8: FINAL CTA */}
      {/* ─────────────────────────────────────────────────── */}
      <section className="px-4 md:px-6 py-12 md:py-16 bg-gray-900 text-white" data-testid="section-final-cta">
        <div className="max-w-3xl xl:max-w-4xl mx-auto text-center">
          <h2 className="text-xl md:text-3xl xl:text-4xl font-display font-bold mb-4">
            {t("rge.finalCta.title")}
          </h2>
          <p className="text-gray-400 xl:text-lg mb-8">
            {t("rge.finalCta.subtitle")}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <button
              onClick={handleCta}
              className="w-full sm:w-auto h-12 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-all cursor-pointer"
              data-testid="button-footer-cta"
            >
              {t("rge.finalCta.installCta")}
              <ArrowRight className={arrowClassSm} />
            </button>
            <Link href="/pricing" className="w-full sm:w-auto">
              <button className="w-full sm:w-auto h-12 px-8 bg-gray-800 border border-gray-700 text-gray-300 font-medium rounded-full flex items-center justify-center gap-2 hover:bg-gray-700 transition-colors" data-testid="button-footer-plans">
                <BarChart3 className={arrowClassSm} />
                {t("rge.finalCta.viewPlans")}
              </button>
            </Link>
          </div>
          <p className="text-gray-500 text-sm mt-5">{t("rge.finalCta.note")}</p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
