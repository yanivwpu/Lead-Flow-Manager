import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  ArrowRight, CheckCircle2, Zap, MessageSquare, Brain, Calendar,
  Users, Target, Shield, ChevronDown, Globe, Smartphone, Search,
  Bot, Inbox, BarChart3, Layers, Send, Database, Sparkles, Mail, Share2, Check
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Helmet } from "react-helmet";
import { useState } from "react";

function FaqItem({ question, answer }: { question: string; answer: string }) {
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

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const workflowSteps = [
    { num: 1, icon: Globe, title: "Lead Arrives", desc: "From your website, ShowcaseIDX, Facebook ad, landing page, or any lead source." },
    { num: 2, icon: Zap, title: "Instant WhatsApp Reply", desc: "System responds automatically via WhatsApp within seconds." },
    { num: 3, icon: Brain, title: "AI Qualifies Intent", desc: "AI analyzes the message to detect buyer or seller intent." },
    { num: 4, icon: Target, title: "Hot Leads Routed", desc: "High-intent leads are flagged and routed directly to you." },
    { num: 5, icon: Calendar, title: "Showing Scheduled", desc: "Calendar link sent automatically. Showings book themselves." },
    { num: 6, icon: Database, title: "Saved in CRM", desc: "Lead details, score, and conversation history stored in your pipeline." },
  ];

  const setupItems = [
    { icon: Smartphone, text: "WhatsApp Business API setup" },
    { icon: Shield, text: "Meta business verification assistance" },
    { icon: Bot, text: "Automation workflows configured" },
    { icon: Calendar, text: "Calendar booking integration" },
    { icon: Layers, text: "CRM pipeline setup" },
  ];

  const platformFeatures = [
    { icon: Inbox, title: "Unified Messaging Inbox", desc: "All conversations in one place." },
    { icon: Brain, title: "AI Lead Scoring", desc: "14+ intent signals score every lead automatically." },
    { icon: Search, title: "Lead Data Extraction", desc: "AI pulls key details from conversations." },
    { icon: Users, title: "Team Collaboration Tools", desc: "Assign leads, share notes, track activity." },
    { icon: Send, title: "Multi-Channel Messaging", desc: "WhatsApp, Instagram, Facebook, SMS — all connected." },
  ];

  const faqs = [
    { q: "Do I need WhatsApp Business API?", a: "Yes, but you don't need to set it up yourself. Our concierge team handles the entire WABA registration and Meta Business Manager verification as part of the one-time setup fee." },
    { q: "Can I use my existing phone number?", a: "In most cases, yes. If your number isn't currently on WhatsApp Business API, we can migrate it. If it's on a personal WhatsApp account, we'll walk you through the migration process during onboarding." },
    { q: "How long does setup take?", a: "Most agents are fully live within 3–5 business days. The onboarding session takes about 45–60 minutes, and we handle the rest behind the scenes." },
    { q: "Does it work with leads from ShowcaseIDX or my website?", a: "Yes. Leads from ShowcaseIDX, your website, landing pages, or any source that triggers a WhatsApp message or web form submission will feed into the system. We configure the connections during setup." },
    { q: "Do you charge per message?", a: "No. WhachatCRM does not add any markup to messages. WhatsApp messaging fees are billed directly by Meta at their standard rates." },
    { q: "Can teams use this system?", a: "Absolutely. The Pro plan includes unlimited team members. You can assign leads, share notes, and collaborate from a single unified inbox." },
  ];

  const scrollToWorkflow = () => {
    document.getElementById("workflow-section")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-white">
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
            <button className="text-sm font-medium text-gray-600 hover:text-gray-900 hidden sm:block">Pricing</button>
          </Link>
          <Link href="/blog">
            <button className="text-sm font-medium text-gray-600 hover:text-gray-900 hidden sm:block">Blog</button>
          </Link>
          <Link href={user ? "/app/chats" : "/auth"}>
            <button className="text-sm font-medium px-4 py-2 bg-brand-green text-white rounded-full hover:bg-emerald-700">
              {user ? "Dashboard" : "Start Free"}
            </button>
          </Link>
        </div>
      </nav>

      <div className="px-4 md:px-6 max-w-7xl xl:max-w-[1440px] mx-auto pt-2 pb-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="text-sm text-emerald-800">Curious how this works for your market?</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/contact">
              <span className="text-sm font-medium text-emerald-700 hover:text-emerald-900 underline underline-offset-2 cursor-pointer">Message us</span>
            </Link>
            <span className="text-emerald-300">|</span>
            <button 
              onClick={handleShare}
              className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-900 underline underline-offset-2 cursor-pointer transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
              {copied ? "Link copied!" : "Share this automation with your network"}
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
              Realtor Growth Engine
            </h1>
            <p className="text-lg md:text-xl xl:text-2xl text-gray-600 mb-6 leading-relaxed">
              Turn real estate leads into showings automatically with AI-powered WhatsApp automation.
            </p>

            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-brand-green shrink-0" />
                <span className="text-base md:text-lg text-gray-700">Instantly respond to every new lead</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-brand-green shrink-0" />
                <span className="text-base md:text-lg text-gray-700">AI qualifies buyers and sellers automatically</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-brand-green shrink-0" />
                <span className="text-base md:text-lg text-gray-700">Book showings directly through WhatsApp</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <Link href="/contact">
                <button className="w-full sm:w-auto h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl" data-testid="button-hero-early-access">
                  Get Early Access
                  <ArrowRight className="h-5 w-5" />
                </button>
              </Link>
              <button
                onClick={scrollToWorkflow}
                className="w-full sm:w-auto h-14 px-8 bg-white border border-gray-200 text-gray-700 font-medium rounded-full flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
                data-testid="button-hero-how-it-works"
              >
                See How It Works
              </button>
            </div>

            <p className="text-sm text-emerald-600 font-medium">
              Launch offer: 50% off Concierge Setup for the first 5 real estate agents.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative"
          >
            <div className="bg-gradient-to-br from-emerald-50 via-white to-teal-50 rounded-3xl border border-emerald-100 p-6 md:p-8 shadow-xl">
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                  <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                    <Target className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">Sarah M. — Score: 92 (Hot)</p>
                    <p className="text-xs text-gray-500 truncate">"I'd love to see the 3BR on Oak St this weekend"</p>
                  </div>
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium shrink-0">HOT</span>
                </div>

                <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                  <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <BarChart3 className="h-5 w-5 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">James R. — Score: 58 (Warm)</p>
                    <p className="text-xs text-gray-500 truncate">"What's the price range for condos downtown?"</p>
                  </div>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium shrink-0">WARM</span>
                </div>

                <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <Sparkles className="h-5 w-5 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">Maria L. — Score: 25 (New)</p>
                    <p className="text-xs text-gray-500 truncate">"Hi, I saw your listing online"</p>
                  </div>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium shrink-0">NEW</span>
                </div>

                <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-semibold text-emerald-800">AI Action Triggered</span>
                  </div>
                  <p className="text-xs text-emerald-700">Booking link sent to Sarah M. — Calendly showing scheduled for Saturday 2:00 PM</p>
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
              How the Realtor Growth Engine Works
            </h2>
            <p className="text-base md:text-lg xl:text-xl text-gray-600 max-w-3xl mx-auto">
              From lead capture to showing booked — fully automated.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 xl:gap-8">
            {workflowSteps.map((step) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: step.num * 0.08 }}
                  className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 bg-brand-green text-white rounded-xl flex items-center justify-center shrink-0 shadow-md">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-brand-green uppercase tracking-wider">Step {step.num}</span>
                      <h3 className="text-lg font-bold text-gray-900 mt-1 mb-1">{step.title}</h3>
                      <p className="text-sm text-gray-600">{step.desc}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 md:px-6 py-16 md:py-24 bg-white">
        <div className="max-w-5xl xl:max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            <div>
              <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-4" data-testid="text-setup-title">
                Fully Done-For-You Setup
              </h2>
              <p className="text-base md:text-lg text-gray-600 mb-8 leading-relaxed">
                You don't need any technical knowledge. Our concierge team handles the full configuration — from API registration to workflow testing. Just show up to the onboarding call.
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
              <p className="text-sm text-gray-500 mt-6">Most agents are live within a few days.</p>
            </div>
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-8 text-white">
              <div className="flex items-center gap-3 mb-6">
                <Shield className="h-8 w-8 text-brand-green" />
                <h3 className="text-xl font-bold">White-Glove Onboarding</h3>
              </div>
              <div className="space-y-4 text-sm text-gray-300">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-brand-green shrink-0 mt-0.5" />
                  <span>Live Zoom session with our setup specialist</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-brand-green shrink-0 mt-0.5" />
                  <span>WABA registration + Meta verification handled for you</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-brand-green shrink-0 mt-0.5" />
                  <span>8 automation workflows pre-configured and tested</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-brand-green shrink-0 mt-0.5" />
                  <span>9-stage CRM pipeline ready from day one</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-brand-green shrink-0 mt-0.5" />
                  <span>End-to-end system test before going live</span>
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
              Built on WhachatCRM
            </h2>
            <p className="text-base md:text-lg xl:text-xl text-gray-600 max-w-3xl mx-auto">
              The Realtor Growth Engine runs on top of a production-ready messaging and automation platform.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {platformFeatures.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="bg-white rounded-2xl border border-gray-100 p-6 text-center hover:shadow-md transition-shadow">
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
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-3xl border border-emerald-100 p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-4" data-testid="text-pricing-title">
              What You Need to Get Started
            </h2>
            <p className="text-base md:text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              The Realtor Growth Engine is a done-for-you setup on top of WhachatCRM.
            </p>

            <div className="grid sm:grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                <div className="text-sm font-medium text-gray-500 mb-1">Platform</div>
                <div className="text-lg font-bold text-gray-900">WhachatCRM Pro</div>
                <div className="text-sm text-gray-500">$49/mo</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                <div className="text-sm font-medium text-gray-500 mb-1">Add-On</div>
                <div className="text-lg font-bold text-gray-900">AI Brain</div>
                <div className="text-sm text-gray-500">$29/mo</div>
              </div>
              <div className="bg-white rounded-xl border border-emerald-200 p-5 shadow-sm ring-2 ring-emerald-100">
                <div className="text-sm font-medium text-emerald-600 mb-1">One-Time Setup</div>
                <div className="text-lg font-bold text-gray-900">Concierge Setup</div>
                <div className="text-sm text-emerald-600 font-medium">Launch discount available</div>
              </div>
            </div>

            <p className="text-sm text-gray-500 mb-8">
              WhatsApp messaging fees are billed directly by Meta with no markup.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-4">
              <Link href="/contact">
                <button className="h-14 px-10 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full inline-flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl text-lg" data-testid="button-pricing-early-access">
                  Get Early Access
                  <ArrowRight className="h-5 w-5" />
                </button>
              </Link>
              <Link href="/contact">
                <button className="h-14 px-10 bg-white border border-gray-200 text-gray-700 font-medium rounded-full inline-flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors text-lg" data-testid="button-pricing-contact">
                  <Mail className="h-5 w-5" />
                  Contact Us
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 md:px-6 py-16 md:py-24 bg-gray-50">
        <div className="max-w-3xl xl:max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 text-center mb-10 md:mb-14" data-testid="text-faq-title">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {faqs.map((faq) => (
              <FaqItem key={faq.q} question={faq.q} answer={faq.a} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 md:px-6 py-12 md:py-16 bg-gray-900 text-white">
        <div className="max-w-3xl xl:max-w-4xl mx-auto text-center">
          <h2 className="text-xl md:text-3xl xl:text-4xl font-display font-bold mb-4">
            Ready to Automate Your Lead Flow?
          </h2>
          <p className="text-gray-400 xl:text-lg mb-6">
            Join the first agents to use AI-powered WhatsApp automation for real estate.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/contact">
              <button className="h-12 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full inline-flex items-center justify-center gap-2 transition-all" data-testid="button-footer-cta">
                Get Early Access
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
            <Link href="/contact">
              <button className="h-12 px-8 bg-gray-800 border border-gray-700 text-gray-300 font-medium rounded-full inline-flex items-center justify-center gap-2 hover:bg-gray-700 transition-colors" data-testid="button-footer-contact">
                <Mail className="h-4 w-4" />
                Contact Us
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

            <div className="flex flex-wrap gap-x-8 gap-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Product</p>
                <div className="flex flex-col gap-1.5 text-sm text-gray-500">
                  <Link href="/pricing"><span className="hover:text-gray-900 cursor-pointer">Pricing</span></Link>
                  <Link href="/whatsapp-crm"><span className="hover:text-gray-900 cursor-pointer">WhatsApp CRM</span></Link>
                  <Link href="/blog"><span className="hover:text-gray-900 cursor-pointer">Blog</span></Link>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Solutions</p>
                <div className="flex flex-col gap-1.5 text-sm text-gray-500">
                  <Link href="/realtor-growth-engine"><span className="hover:text-gray-900 cursor-pointer">Realtor Growth Engine</span></Link>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Legal</p>
                <div className="flex flex-col gap-1.5 text-sm text-gray-500">
                  <Link href="/privacy-policy"><span className="hover:text-gray-900 cursor-pointer">Privacy</span></Link>
                  <Link href="/terms-of-use"><span className="hover:text-gray-900 cursor-pointer">Terms</span></Link>
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
