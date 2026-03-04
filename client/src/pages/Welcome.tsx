import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { 
  ArrowRight, 
  CheckCircle2, 
  MessageSquare, 
  Clock, 
  Users, 
  Shield, 
  Zap,
  Phone,
  Bell,
  Tag,
  ChevronRight,
  Star,
  ShoppingCart,
  FileSpreadsheet,
  Building2,
  CreditCard,
  Home,
  Calendar,
  Mail,
  Brain
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { BookDemoModal } from "@/components/BookDemoModal";
import { LanguageSelector } from "@/components/LanguageSelector";
import { getDirection } from "@/lib/i18n";
import heroImage from "@assets/generated_images/whatsapp_crm_dashboard_mockup_resized.png";
import heroImageWebp from "@assets/generated_images/whatsapp_crm_dashboard_mockup.webp";

const INTEGRATIONS = [
  { name: "Shopify", icon: ShoppingCart, color: "bg-green-500" },
  { name: "HubSpot", icon: Users, color: "bg-orange-500" },
  { name: "Salesforce", icon: Building2, color: "bg-blue-500" },
  { name: "Stripe", icon: CreditCard, color: "bg-purple-500" },
  { name: "Twilio", icon: Phone, color: "bg-red-600" },
  { name: "Calendly", icon: Calendar, color: "bg-sky-500" },
  { name: "Mailchimp", icon: Mail, color: "bg-yellow-500" },
  { name: "Google Sheets", icon: FileSpreadsheet, color: "bg-emerald-500" },
  { name: "ShowcaseIDX", icon: Home, color: "bg-rose-500" },
];

function IntegrationsHub() {
  const topRow = INTEGRATIONS.slice(0, 4);
  const bottomRow = INTEGRATIONS.slice(4);

  return (
    <div className="w-full max-w-6xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto px-4">
      <div className="flex flex-col items-center gap-6 md:gap-8">
        <div className="flex flex-wrap justify-center gap-4 md:gap-8 w-full">
          {topRow.map((integration, i) => {
            const Icon = integration.icon;
            return (
              <div
                key={integration.name}
                className="flex flex-col items-center animate-fade-in-up"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className={`h-14 w-14 md:h-16 md:w-16 ${integration.color} rounded-xl shadow-lg flex items-center justify-center`}>
                  <Icon className="h-7 w-7 md:h-8 md:w-8 text-white" />
                </div>
                <span className="text-xs md:text-sm font-medium text-gray-600 mt-2">{integration.name}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 md:gap-6 w-full justify-center">
          <div className="h-1 bg-gradient-to-r from-transparent via-gray-300 to-gray-300 flex-1 max-w-[120px] md:max-w-[200px] rounded-full animate-scale-in-right" />
          
          <div className="h-20 w-20 md:h-28 md:w-28 bg-brand-green rounded-2xl shadow-2xl flex items-center justify-center shrink-0 animate-scale-in">
            <span className="text-white font-bold text-3xl md:text-5xl">W</span>
          </div>
          
          <div className="h-1 bg-gradient-to-l from-transparent via-gray-300 to-gray-300 flex-1 max-w-[120px] md:max-w-[200px] rounded-full animate-scale-in-left" />
        </div>

        <div className="flex flex-wrap justify-center gap-4 md:gap-8 w-full">
          {bottomRow.map((integration, i) => {
            const Icon = integration.icon;
            return (
              <div
                key={integration.name}
                className="flex flex-col items-center animate-fade-in-up"
                style={{ animationDelay: `${300 + i * 80}ms` }}
              >
                <div className={`h-14 w-14 md:h-16 md:w-16 ${integration.color} rounded-xl shadow-lg flex items-center justify-center`}>
                  <Icon className="h-7 w-7 md:h-8 md:w-8 text-white" />
                </div>
                <span className="text-xs md:text-sm font-medium text-gray-600 mt-2">{integration.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Welcome() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [showDemoModal, setShowDemoModal] = useState(false);
  const isRTL = getDirection() === 'rtl';

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className={`min-h-screen bg-white overflow-x-hidden ${isRTL ? 'text-right' : 'text-left'}`}>
      <Helmet>
        <title>WhatsApp & Unified Mailbox | WhachatCRM</title>
        <meta name="description" content="Manage WhatsApp, Instagram, and SMS in one unified mailbox. The simple CRM for SMBs and Shopify sellers." />
        <link rel="canonical" href="https://whachatcrm.com/" />
        <meta property="og:title" content="WhatsApp & Unified Mailbox | WhachatCRM" />
        <meta property="og:description" content="Manage WhatsApp, Instagram, and SMS in one unified mailbox. The simple CRM for SMBs and Shopify sellers." />
        <meta property="og:url" content="https://whachatcrm.com/" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://whachatcrm.com/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://whachatcrm.com/og-image.png" />
        <meta name="twitter:title" content="WhatsApp & Unified Mailbox | WhachatCRM" />
        <meta name="twitter:description" content="Manage WhatsApp, Instagram, and SMS in one unified mailbox. The simple CRM for SMBs and Shopify sellers." />
      </Helmet>
      <BookDemoModal isOpen={showDemoModal} onClose={() => setShowDemoModal(false)} />
      {/* Navigation */}
      <nav className="p-4 md:p-6 flex justify-between items-center max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-brand-green rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">W</span>
          </div>
          <span className="font-display font-bold text-xl text-gray-900">WhachatCRM</span>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <Link href="/pricing">
            <button className="text-sm font-medium text-gray-600 hover:text-gray-900 hidden sm:block">{t('landing.pricing')}</button>
          </Link>
          <Link href="/blog">
            <button className="text-sm font-medium text-gray-600 hover:text-gray-900 hidden sm:block">{t('landing.blog')}</button>
          </Link>
          <LanguageSelector variant="compact" className="text-gray-600 hover:text-gray-900 hover:bg-gray-100" />
          {user ? (
            <Link href="/app/chats">
              <button className="text-sm font-medium px-4 py-2 bg-brand-green text-white rounded-full hover:bg-emerald-700">
                {t('landing.dashboard')}
              </button>
            </Link>
          ) : (
            <>
              <Link href="/auth?mode=login">
                <button className="text-sm font-medium text-gray-600 hover:text-gray-900 hidden sm:block">{t('landing.login')}</button>
              </Link>
              <Link href="/auth">
                <button className="text-sm font-medium px-4 py-2 bg-brand-green text-white rounded-full hover:bg-emerald-700">
                  {t('landing.startFree')}
                </button>
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="px-4 md:px-6 pt-4 md:pt-8 pb-12 md:pb-20 max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <div className="grid md:grid-cols-2 gap-8 md:gap-12 xl:gap-16 2xl:gap-20 items-start">
          <div className="animate-hero-text">
            <h1 className="text-3xl md:text-5xl lg:text-6xl xl:text-7xl font-display font-bold text-gray-900 leading-[1.1] mb-4 md:mb-6">
              {t('landing.heroTitle')}
            </h1>
            <p className="text-lg md:text-xl xl:text-2xl text-gray-600 mb-6 md:mb-8 leading-relaxed">
              {t('landing.heroSubtitle')}
            </p>
            
            {/* Stacked CTAs for mobile */}
            <div className="flex flex-col gap-3 mb-4">
              <div className="w-full sm:w-auto">
                <Link href={user ? "/app/chats" : "/auth"}>
                  <button className="w-full sm:w-auto h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl" data-testid="button-hero-cta">
                    {t('landing.startTrial')}
                    <ArrowRight className="h-5 w-5" />
                  </button>
                </Link>
              </div>
              <div className="w-full sm:w-auto">
                <Link href="/pricing">
                  <button className="w-full sm:w-auto h-12 px-6 bg-white border border-gray-200 text-gray-700 font-medium rounded-full flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors" data-testid="button-hero-pricing">
                    {t('landing.pricing')}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </Link>
              </div>
              <div className="flex flex-col items-center sm:items-start">
                <button 
                  onClick={() => setShowDemoModal(true)}
                  className="w-full sm:w-auto h-12 px-6 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-full flex items-center justify-center gap-2 hover:from-amber-600 hover:to-orange-600 transition-colors shadow-md"
                  data-testid="button-book-demo"
                >
                  <Calendar className="h-4 w-4" />
                  {t('landing.bookDemo')}
                </button>
              </div>
            </div>
            
            <div className="flex items-center gap-2 mb-6">
              <span className="text-sm text-gray-500">{t('landing.noCreditCard')}</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-green" />
                <span>{t('home.hero.badge1')}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-green" />
                <span>{t('home.hero.badge2')}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-green" />
                <span>{t('home.hero.badge3')}</span>
              </div>
            </div>
          </div>
          
          <div className="relative animate-hero-image overflow-visible">
            <picture>
              <source srcSet={heroImageWebp} type="image/webp" />
              <img 
                src={heroImage} 
                alt="WhachatCRM Dashboard - WhatsApp CRM Interface" 
                className="w-full rounded-xl md:rounded-2xl shadow-2xl border border-gray-200 md:scale-105 xl:scale-110 origin-top relative z-10"
                width="704"
                height="384"
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
            </picture>
          </div>
        </div>
      </section>

      {/* Problem/Solution Section */}
      <section className="px-4 md:px-6 py-16 md:py-20 bg-gray-900 text-white">
        <div className="max-w-6xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
          <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-center mb-10 md:mb-14">
            {t('home.problem.title')}
          </h2>
          
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 xl:gap-16">
            {/* Problems */}
            <div>
              <h3 className="text-lg xl:text-xl font-semibold text-gray-400 mb-6 uppercase tracking-wide">{t('home.problem.heading')}</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-red-400 text-sm">✕</span>
                  </div>
                  <p className="text-gray-300 xl:text-lg">{t('home.problem.item1')}</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-red-400 text-sm">✕</span>
                  </div>
                  <p className="text-gray-300 xl:text-lg">{t('home.problem.item2')}</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-red-400 text-sm">✕</span>
                  </div>
                  <p className="text-gray-300 xl:text-lg">{t('home.problem.item3')}</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-red-400 text-sm">✕</span>
                  </div>
                  <p className="text-gray-300 xl:text-lg">{t('home.problem.item4')}</p>
                </div>
              </div>
            </div>
            
            {/* Solution */}
            <div>
              <h3 className="text-lg xl:text-xl font-semibold text-brand-green mb-6 uppercase tracking-wide">{t('home.solution.heading')}</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-brand-green shrink-0 mt-0.5" />
                  <p className="text-white xl:text-lg">{t('home.solution.item1')}</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-brand-green shrink-0 mt-0.5" />
                  <p className="text-white xl:text-lg">{t('home.solution.item2')}</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-brand-green shrink-0 mt-0.5" />
                  <p className="text-white xl:text-lg">{t('home.solution.item3')}</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-brand-green shrink-0 mt-0.5" />
                  <p className="text-white xl:text-lg">{t('home.solution.item4')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="px-4 md:px-6 py-16 md:py-20 bg-gray-50">
        <div className="max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-3 md:mb-4">
              {t('home.features.title')}
            </h2>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 md:gap-8">
            {[
              { icon: MessageSquare, color: "bg-emerald-100", iconColor: "text-brand-green", title: t('home.features.item1.title'), desc: t('home.features.item1.desc') },
              { icon: Tag, color: "bg-blue-100", iconColor: "text-blue-600", title: t('home.features.item2.title'), desc: t('home.features.item2.desc') },
              { icon: Bell, color: "bg-amber-100", iconColor: "text-amber-600", title: t('home.features.item3.title'), desc: t('home.features.item3.desc') },
              { icon: Brain, color: "bg-purple-100", iconColor: "text-purple-600", title: t('home.features.item4.title'), desc: t('home.features.item4.desc') },
              { icon: Phone, color: "bg-cyan-100", iconColor: "text-cyan-600", title: t('home.features.item5.title'), desc: t('home.features.item5.desc') },
              { icon: Zap, color: "bg-pink-100", iconColor: "text-pink-600", title: t('home.features.item6.title'), desc: t('home.features.item6.desc') },
            ].map((benefit, i) => {
              const Icon = benefit.icon;
              return (
                <div 
                  key={benefit.title}
                  className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 animate-fade-in-up"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className={`h-12 w-12 ${benefit.color} rounded-xl flex items-center justify-center mb-4`}>
                    <Icon className={`h-6 w-6 ${benefit.iconColor}`} />
                  </div>
                  <h3 className="text-lg xl:text-xl font-bold text-gray-900 mb-2">{benefit.title}</h3>
                  <p className="text-gray-600 xl:text-base">{benefit.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section className="px-4 md:px-6 py-16 md:py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-6xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
          <div className="text-center mb-10 md:mb-12">
            <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-3 md:mb-4">
              {t('home.integrations.title')}
            </h2>
            <p className="text-base md:text-lg xl:text-xl text-gray-600 max-w-2xl xl:max-w-3xl mx-auto">
              {t('home.integrations.subtitle')}
            </p>
          </div>
          
          <IntegrationsHub />
        </div>
      </section>

      {/* How It Works - Simple 3 steps */}
      <section className="px-4 md:px-6 py-16 md:py-20 bg-gray-50">
        <div className="max-w-5xl xl:max-w-6xl mx-auto">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-3 md:mb-4">
              {t('home.howItWorks.title')}
            </h2>
            <p className="text-base md:text-lg xl:text-xl text-gray-600">
              {t('home.howItWorks.subtitle')}
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 md:gap-12 xl:gap-16">
            <div className="text-center">
              <div className="h-14 w-14 xl:h-16 xl:w-16 bg-brand-green text-white rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl xl:text-2xl font-bold">
                1
              </div>
              <h3 className="text-lg xl:text-xl font-bold text-gray-900 mb-2">{t('home.howItWorks.step1.title')}</h3>
              <p className="text-gray-600 xl:text-lg">{t('home.howItWorks.step1.desc')}</p>
            </div>
            
            <div className="text-center">
              <div className="h-14 w-14 xl:h-16 xl:w-16 bg-brand-green text-white rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl xl:text-2xl font-bold">
                2
              </div>
              <h3 className="text-lg xl:text-xl font-bold text-gray-900 mb-2">{t('home.howItWorks.step2.title')}</h3>
              <p className="text-gray-600 xl:text-lg">{t('home.howItWorks.step2.desc')}</p>
            </div>
            
            <div className="text-center">
              <div className="h-14 w-14 xl:h-16 xl:w-16 bg-brand-green text-white rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl xl:text-2xl font-bold">
                3
              </div>
              <h3 className="text-lg xl:text-xl font-bold text-gray-900 mb-2">{t('home.howItWorks.step3.title')}</h3>
              <p className="text-gray-600 xl:text-lg">{t('home.howItWorks.step3.desc')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Teaser */}
      <section className="px-4 md:px-6 py-16 md:py-20">
        <div className="max-w-3xl xl:max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-3 md:mb-4">
            {t('home.pricingTeaser.title')}
          </h2>
          <p className="text-base md:text-lg xl:text-xl text-gray-600 mb-8">
            {t('home.pricingTeaser.subtitle')}
          </p>
          
          <div className="flex flex-wrap justify-center gap-4 md:gap-6 mb-8">
            <div className="flex items-center gap-2 text-gray-700">
              <CheckCircle2 className="h-5 w-5 text-brand-green" />
              <span>{t('home.pricingTeaser.freePlan')}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <CheckCircle2 className="h-5 w-5 text-brand-green" />
              <span>{t('home.pricingTeaser.paidPlans')}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <CheckCircle2 className="h-5 w-5 text-brand-green" />
              <span>{t('home.pricingTeaser.cancelAnytime')}</span>
            </div>
          </div>
          
          <Link href="/pricing">
            <button className="h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full inline-flex items-center gap-2 transition-all shadow-lg">
              {t('home.pricingTeaser.seePlans')}
              <ArrowRight className="h-5 w-5" />
            </button>
          </Link>
        </div>
      </section>

      {/* Built For Section */}
      <section className="px-4 md:px-6 py-16 md:py-20 bg-gray-50">
        <div className="max-w-4xl xl:max-w-5xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-10">
            {t('home.builtFor.title')}
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 xl:gap-8 mb-10">
            <div className="bg-white p-4 md:p-6 rounded-xl border border-gray-200">
              <p className="font-medium text-gray-900 text-sm md:text-base">{t('home.builtFor.salesTeams')}</p>
            </div>
            <div className="bg-white p-4 md:p-6 rounded-xl border border-gray-200">
              <p className="font-medium text-gray-900 text-sm md:text-base">{t('home.builtFor.supportTeams')}</p>
            </div>
            <div className="bg-white p-4 md:p-6 rounded-xl border border-gray-200">
              <p className="font-medium text-gray-900 text-sm md:text-base">{t('home.builtFor.agencies')}</p>
            </div>
            <div className="bg-white p-4 md:p-6 rounded-xl border border-gray-200">
              <p className="font-medium text-gray-900 text-sm md:text-base">{t('home.builtFor.smallBiz')}</p>
            </div>
          </div>
          
          <p className="text-lg xl:text-xl text-gray-600">
            {t('home.builtFor.tagline')}
          </p>
        </div>
      </section>

      {/* Trust Section */}
      <section className="px-4 md:px-6 py-12 md:py-16 bg-gray-900 text-white">
        <div className="max-w-3xl xl:max-w-4xl mx-auto text-center">
          <div className="h-14 w-14 bg-brand-green/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Shield className="h-7 w-7 text-brand-green" />
          </div>
          <h2 className="text-xl md:text-3xl xl:text-4xl font-display font-bold mb-4">
            {t('home.trust.title')}
          </h2>
          <p className="text-gray-300 xl:text-lg mb-2">
            {t('home.trust.line1')}
          </p>
          <p className="text-gray-400 xl:text-lg">
            {t('home.trust.line2')}
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 md:px-6 py-16 md:py-20 bg-gradient-to-br from-brand-green/5 to-brand-teal/5">
        <div className="max-w-3xl xl:max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-green/10 text-brand-green rounded-full text-sm xl:text-base font-medium mb-6">
            <Zap className="h-4 w-4" />
            {t('home.cta.setupTime')}
          </div>
          <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-3 md:mb-4">
            {t('home.cta.title')}
          </h2>
          <p className="text-base md:text-lg xl:text-xl text-gray-600 mb-8">
            {t('home.cta.subtitle')}
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
            <Link href={user ? "/app/chats" : "/auth"}>
              <button className="h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full inline-flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl" data-testid="button-final-cta">
                {t('home.cta.primary')}
                <ArrowRight className="h-5 w-5" />
              </button>
            </Link>
            <Link href="/pricing">
              <button className="h-14 px-8 bg-white border border-gray-200 text-gray-700 font-medium rounded-full inline-flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors" data-testid="button-final-pricing">
                {t('home.cta.secondary')}
              </button>
            </Link>
          </div>
          
          <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-brand-green" />
              {t('home.hero.note')}
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-brand-green" />
              {t('pricing.foreverFree')}
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-brand-green" />
              {t('home.pricingTeaser.cancelAnytime')}
            </span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 md:px-6 py-6 md:py-8 border-t border-gray-100">
        <div className="max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 bg-brand-green rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-sm">W</span>
            </div>
            <span className="font-display font-bold text-gray-900">WhachatCRM</span>
          </div>
          
          <div className="flex flex-wrap justify-center gap-4 md:gap-6 text-sm text-gray-500">
            <Link href="/pricing">
              <span className="hover:text-gray-900 cursor-pointer">Pricing</span>
            </Link>
            <Link href="/whatsapp-crm">
              <span className="hover:text-gray-900 cursor-pointer">WhatsApp CRM</span>
            </Link>
            <Link href="/blog">
              <span className="hover:text-gray-900 cursor-pointer">Blog</span>
            </Link>
            <Link href="/respond-io-alternative">
              <span className="hover:text-gray-900 cursor-pointer">Respond.io Alternative</span>
            </Link>
            <Link href="/wati-alternative">
              <span className="hover:text-gray-900 cursor-pointer">WATI Alternative</span>
            </Link>
            <Link href="/zoko-alternative">
              <span className="hover:text-gray-900 cursor-pointer">Zoko Alternative</span>
            </Link>
            <Link href="/manychat-alternative">
              <span className="hover:text-gray-900 cursor-pointer">Manychat Alternative</span>
            </Link>
            <Link href="/pabbly-alternative">
              <span className="hover:text-gray-900 cursor-pointer">Pabbly Alternative</span>
            </Link>
            <Link href="/privacy-policy">
              <span className="hover:text-gray-900 cursor-pointer">Privacy</span>
            </Link>
            <Link href="/terms-of-use">
              <span className="hover:text-gray-900 cursor-pointer">Terms</span>
            </Link>
          </div>
          
          <p className="text-sm text-gray-400">
            © 2025 WhachatCRM. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
