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
    <div className="w-full max-w-6xl mx-auto px-4">
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

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <Helmet>
        <title>Official WhatsApp API CRM: Unified Inbox for WhatsApp, Instagram & SMS | WhachatCRM</title>
        <meta name="description" content="Manage WhatsApp customer chats like a CRM. Unified inbox, notes, tags, follow-ups, AI replies & chatbot builder. Free plan forever – start in minutes." />
        <link rel="canonical" href="https://whachatcrm.com/" />
        <meta property="og:title" content="Official WhatsApp API CRM: Unified Inbox for WhatsApp, Instagram & SMS | WhachatCRM" />
        <meta property="og:description" content="Manage WhatsApp customer chats like a CRM. Unified inbox, notes, tags, follow-ups, AI replies & chatbot builder. Free plan forever – start in minutes." />
        <meta property="og:url" content="https://whachatcrm.com/" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://whachatcrm.com/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://whachatcrm.com/og-image.png" />
        <meta name="twitter:title" content="Official WhatsApp API CRM: Unified Inbox for WhatsApp, Instagram & SMS | WhachatCRM" />
        <meta name="twitter:description" content="Manage WhatsApp customer chats like a CRM. Unified inbox, notes, tags, follow-ups, AI replies & chatbot builder. Free plan forever." />
      </Helmet>
      <BookDemoModal isOpen={showDemoModal} onClose={() => setShowDemoModal(false)} />
      {/* Navigation */}
      <nav className="p-4 md:p-6 flex justify-between items-center max-w-7xl mx-auto">
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
      <section className="px-4 md:px-6 pt-4 md:pt-8 pb-12 md:pb-20 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-start">
          <div className="animate-hero-text">
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-bold text-gray-900 leading-[1.1] mb-4 md:mb-6">
              {t('landing.heroTitle')}
            </h1>
            <p className="text-lg md:text-xl text-gray-600 mb-6 md:mb-8 leading-relaxed">
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
                <span>Built on the official WhatsApp Business API</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-green" />
                <span>Secure & compliant — no scraping</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-green" />
                <span>Designed for founders, sales teams & support teams</span>
              </div>
            </div>
          </div>
          
          <div className="relative animate-hero-image overflow-visible">
            <picture>
              <source srcSet={heroImageWebp} type="image/webp" />
              <img 
                src={heroImage} 
                alt="WhachatCRM Dashboard - WhatsApp CRM Interface" 
                className="w-full rounded-xl md:rounded-2xl shadow-2xl border border-gray-200 md:scale-105 origin-top relative z-10"
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
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-display font-bold text-center mb-10 md:mb-14">
            WhatsApp Wasn't Built for Managing Customers — Until Now
          </h2>
          
          <div className="grid md:grid-cols-2 gap-8 md:gap-12">
            {/* Problems */}
            <div>
              <h3 className="text-lg font-semibold text-gray-400 mb-6 uppercase tracking-wide">The Problem</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-red-400 text-sm">✕</span>
                  </div>
                  <p className="text-gray-300">Important chats get buried</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-red-400 text-sm">✕</span>
                  </div>
                  <p className="text-gray-300">No context about customers</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-red-400 text-sm">✕</span>
                  </div>
                  <p className="text-gray-300">Follow-ups are forgotten</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-red-400 text-sm">✕</span>
                  </div>
                  <p className="text-gray-300">Teams lose visibility</p>
                </div>
              </div>
            </div>
            
            {/* Solution */}
            <div>
              <h3 className="text-lg font-semibold text-brand-green mb-6 uppercase tracking-wide">WhachatCRM Solution</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-brand-green shrink-0 mt-0.5" />
                  <p className="text-white">One conversation per customer</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-brand-green shrink-0 mt-0.5" />
                  <p className="text-white">Notes, tags & tasks inside each chat</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-brand-green shrink-0 mt-0.5" />
                  <p className="text-white">Clear follow-ups so nothing slips through</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-brand-green shrink-0 mt-0.5" />
                  <p className="text-white">Multi-channel integrations with your favorite tools</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="px-4 md:px-6 py-16 md:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <h2 className="text-2xl md:text-4xl font-display font-bold text-gray-900 mb-3 md:mb-4">
              Everything You Need to Manage WhatsApp Like a CRM
            </h2>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 md:gap-8">
            {[
              { icon: MessageSquare, color: "bg-emerald-100", iconColor: "text-brand-green", title: "Organized Conversations", desc: "Every WhatsApp chat becomes a customer record — no more searching or guessing." },
              { icon: Tag, color: "bg-blue-100", iconColor: "text-blue-600", title: "Notes & Tags", desc: "Add internal notes and tags so your team always knows the full context." },
              { icon: Bell, color: "bg-amber-100", iconColor: "text-amber-600", title: "Follow-Ups & Tasks", desc: "Set reminders and tasks to make sure every lead is followed up on time." },
              { icon: Brain, color: "bg-purple-100", iconColor: "text-purple-600", title: "AI Brain", desc: "Smart reply suggestions, lead capture & tone control. Your AI-powered business assistant." },
              { icon: Phone, color: "bg-cyan-100", iconColor: "text-cyan-600", title: "Visual Chatbot Builder", desc: "Build automated flows with our drag-and-drop chatbot builder. No coding required." },
              { icon: Zap, color: "bg-pink-100", iconColor: "text-pink-600", title: "Multi-Channel Integrations", desc: "Connect with Shopify, HubSpot, Salesforce, Stripe & more to sync leads across all your tools." },
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
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{benefit.title}</h3>
                  <p className="text-gray-600">{benefit.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section className="px-4 md:px-6 py-16 md:py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 md:mb-12">
            <h2 className="text-2xl md:text-4xl font-display font-bold text-gray-900 mb-3 md:mb-4">
              Connect Your Favorite Tools
            </h2>
            <p className="text-base md:text-lg text-gray-600 max-w-2xl mx-auto">
              WhachatCRM integrates seamlessly with the apps you already use — sync leads, automate workflows, and keep everything in one place.
            </p>
          </div>
          
          <IntegrationsHub />
        </div>
      </section>

      {/* How It Works - Simple 3 steps */}
      <section className="px-4 md:px-6 py-16 md:py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl md:text-4xl font-display font-bold text-gray-900 mb-3 md:mb-4">
              Up and running in minutes
            </h2>
            <p className="text-base md:text-lg text-gray-600">
              No complex setup. No training required.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 md:gap-12">
            <div className="text-center">
              <div className="h-14 w-14 bg-brand-green text-white rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                1
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Connect your number</h3>
              <p className="text-gray-600">Link your WhatsApp Business number in just a few clicks.</p>
            </div>
            
            <div className="text-center">
              <div className="h-14 w-14 bg-brand-green text-white rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                2
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Organize your chats</h3>
              <p className="text-gray-600">Add notes, tags, and set follow-up reminders for each conversation.</p>
            </div>
            
            <div className="text-center">
              <div className="h-14 w-14 bg-brand-green text-white rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                3
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Close more deals</h3>
              <p className="text-gray-600">Get reminders, follow up on time, and convert more leads into customers.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Teaser */}
      <section className="px-4 md:px-6 py-16 md:py-20">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl font-display font-bold text-gray-900 mb-3 md:mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-base md:text-lg text-gray-600 mb-8">
            Start for free. Upgrade only when you need more.
          </p>
          
          <div className="flex flex-wrap justify-center gap-4 md:gap-6 mb-8">
            <div className="flex items-center gap-2 text-gray-700">
              <CheckCircle2 className="h-5 w-5 text-brand-green" />
              <span>Free plan for individuals</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <CheckCircle2 className="h-5 w-5 text-brand-green" />
              <span>Paid plans start at $19/month</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <CheckCircle2 className="h-5 w-5 text-brand-green" />
              <span>Cancel anytime</span>
            </div>
          </div>
          
          <Link href="/pricing">
            <button className="h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full inline-flex items-center gap-2 transition-all shadow-lg">
              See Plans
              <ArrowRight className="h-5 w-5" />
            </button>
          </Link>
        </div>
      </section>

      {/* Built For Section */}
      <section className="px-4 md:px-6 py-16 md:py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl font-display font-bold text-gray-900 mb-10">
            Built for Businesses That Live on WhatsApp
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-10">
            <div className="bg-white p-4 md:p-6 rounded-xl border border-gray-200">
              <p className="font-medium text-gray-900 text-sm md:text-base">Sales teams managing inbound leads</p>
            </div>
            <div className="bg-white p-4 md:p-6 rounded-xl border border-gray-200">
              <p className="font-medium text-gray-900 text-sm md:text-base">Customer support teams</p>
            </div>
            <div className="bg-white p-4 md:p-6 rounded-xl border border-gray-200">
              <p className="font-medium text-gray-900 text-sm md:text-base">Agencies & consultants</p>
            </div>
            <div className="bg-white p-4 md:p-6 rounded-xl border border-gray-200">
              <p className="font-medium text-gray-900 text-sm md:text-base">Small businesses & founders</p>
            </div>
          </div>
          
          <p className="text-lg text-gray-600">
            If WhatsApp is how you talk to customers — this is your CRM.
          </p>
        </div>
      </section>

      {/* Trust Section */}
      <section className="px-4 md:px-6 py-12 md:py-16 bg-gray-900 text-white">
        <div className="max-w-3xl mx-auto text-center">
          <div className="h-14 w-14 bg-brand-green/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Shield className="h-7 w-7 text-brand-green" />
          </div>
          <h2 className="text-xl md:text-3xl font-display font-bold mb-4">
            Official. Secure. Reliable.
          </h2>
          <p className="text-gray-300 mb-2">
            WhachatCRM uses the official WhatsApp Business API and does not scrape personal accounts.
          </p>
          <p className="text-gray-400">
            Your data stays secure and compliant with Meta's policies.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 md:px-6 py-16 md:py-20 bg-gradient-to-br from-brand-green/5 to-brand-teal/5">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-green/10 text-brand-green rounded-full text-sm font-medium mb-6">
            <Zap className="h-4 w-4" />
            Set up in under 5 minutes
          </div>
          <h2 className="text-2xl md:text-4xl font-display font-bold text-gray-900 mb-3 md:mb-4">
            Stop Losing Leads in Your WhatsApp Inbox
          </h2>
          <p className="text-base md:text-lg text-gray-600 mb-8">
            Join growing businesses using WhachatCRM to close more deals via WhatsApp.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
            <Link href={user ? "/app/chats" : "/auth"}>
              <button className="h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full inline-flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl" data-testid="button-final-cta">
                Start Your 14-Day Pro Trial
                <ArrowRight className="h-5 w-5" />
              </button>
            </Link>
            <Link href="/pricing">
              <button className="h-14 px-8 bg-white border border-gray-200 text-gray-700 font-medium rounded-full inline-flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors" data-testid="button-final-pricing">
                See Pricing
              </button>
            </Link>
          </div>
          
          <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-brand-green" />
              No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-brand-green" />
              Free plan forever
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-brand-green" />
              Cancel anytime
            </span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 md:px-6 py-6 md:py-8 border-t border-gray-100">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
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
            <Link href="/contact">
              <span className="hover:text-gray-900 cursor-pointer">Contact</span>
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
