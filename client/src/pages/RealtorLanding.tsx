import { motion } from "framer-motion";
import { Link } from "wouter";
import { 
  ArrowRight, CheckCircle2, Zap, MessageSquare, Brain, Calendar, 
  Users, Target, Shield, Rocket, Clock, Star, ChevronDown, Headphones,
  BarChart3, Bot
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

  const steps = [
    { num: 1, icon: Rocket, title: "Activate Your Engine", desc: "Purchase the one-time setup and our concierge team takes over." },
    { num: 2, icon: Headphones, title: "White-Glove Setup", desc: "We configure your WABA, connect your channels (WhatsApp, Instagram, FB, SMS), and verify your Meta Business Manager." },
    { num: 3, icon: Brain, title: "AI Calibration", desc: "We configure 14+ intent signals, scoring thresholds, and 8 automation workflows tailored to your market." },
    { num: 4, icon: Calendar, title: "Calendar & Go Live", desc: "We sync your Calendly/TidyCal, test the full system end-to-end, and flip the switch. You're live." },
  ];

  const included = [
    { icon: Bot, title: "8 Pre-Built Automations", desc: "Auto-reply, AI scoring, appointment booking, multi-day nurturing, language detection, and more." },
    { icon: Brain, title: "AI Lead Scoring (Tiered)", desc: "14+ intent signals across 4 categories. Leads auto-classified: Hot, Warm, New, Low Intent, or Unqualified." },
    { icon: Calendar, title: "Automated Showing Bookings", desc: "Leads who mention tours get your personal calendar link automatically. Showings book themselves." },
    { icon: MessageSquare, title: "Smart Reply Suggestions", desc: "AI-powered reply suggestions based on each lead's unique score and conversation context." },
    { icon: Target, title: "Daily Hot List Email", desc: "Top 5 ready-to-close leads delivered to your inbox every morning at 8 AM with one-click WhatsApp links." },
    { icon: Users, title: "Full Channel Integration", desc: "We connect your WhatsApp, Instagram, Facebook Messenger, and SMS into one unified inbox." },
    { icon: BarChart3, title: "9-Stage CRM Pipeline", desc: "From New Lead → Responded → Qualified → Nurture → Showing Booked → Closed Won. Fully customizable." },
    { icon: Shield, title: "Concierge Onboarding", desc: "Live Zoom setup session. We handle WABA registration, Meta verification, and system configuration for you." },
  ];

  const faqs = [
    { q: "Do I need technical skills to use this?", a: "Not at all. Our concierge team handles the entire technical setup — WABA registration, Meta Business Manager verification, channel connections, and workflow configuration. You just need to show up on the onboarding Zoom call." },
    { q: "What if I don't have a WhatsApp Business API account yet?", a: "That's completely fine — most of our clients don't. We walk you through the entire WABA setup process and handle the Meta verification on your behalf. It's included in the one-time fee." },
    { q: "Is the $199 a monthly fee?", a: "No. The $199 is a one-time concierge setup fee. It covers everything: WABA setup, channel integration, AI calibration, workflow configuration, and a live onboarding session. After setup, you only pay your regular WhachatCRM subscription (Pro + AI add-on) and Meta's standard WhatsApp conversation fees." },
    { q: "What subscription do I need?", a: "The Realtor Growth Engine requires a WhachatCRM Pro plan ($49/mo) with the AI Brain add-on ($29/mo). This gives you access to AI lead scoring, automated workflows, and unlimited team members." },
    { q: "How long does the setup take?", a: "Most agents are fully live within 3–5 business days after purchasing. The onboarding Zoom call typically takes 45–60 minutes, and we handle the rest behind the scenes." },
    { q: "Can I customize the automations?", a: "Yes. Once installed, every workflow, scoring rule, and message template is fully editable from your dashboard. We set it up with proven defaults, but you can adjust anything to match your style." },
    { q: "What makes this different from Follow Up Boss or other CRMs?", a: "Traditional CRMs like Follow Up Boss are built around cold calling and static lead capture. The Realtor Growth Engine is built for conversations — it qualifies leads through messaging, books showings automatically, and nurtures cold leads with multi-day sequences. It's proactive, not reactive." },
  ];

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Realtor Growth Engine – Automated Lead Qualification for Real Estate | WhachatCRM</title>
        <meta name="description" content="Turn conversations into showings with the Realtor Growth Engine. AI-powered lead scoring, automated bookings, and white-glove setup for real estate agents. $199 one-time." />
        <meta name="keywords" content="realtor CRM, real estate lead qualification, WhatsApp automation for realtors, automated showing booking, real estate AI CRM, lead scoring for agents" />
        <link rel="canonical" href="https://whachatcrm.com/realtor-growth-engine" />
        <meta property="og:title" content="Realtor Growth Engine – Automated Lead Qualification for Real Estate" />
        <meta property="og:description" content="Turn conversations into showings. AI-powered lead scoring, automated bookings, and white-glove concierge setup for real estate agents." />
        <meta property="og:url" content="https://whachatcrm.com/realtor-growth-engine" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Realtor Growth Engine – Automated Lead Qualification for Real Estate" />
        <meta name="twitter:description" content="Turn conversations into showings. AI-powered lead scoring, automated bookings, and white-glove setup for real estate agents." />
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
          <Link href={user ? "/app/chats" : "/auth"}>
            <button className="text-sm font-medium px-4 py-2 bg-brand-green text-white rounded-full hover:bg-emerald-700">
              {user ? "Dashboard" : "Start Free"}
            </button>
          </Link>
        </div>
      </nav>

      <section className="px-4 md:px-6 pt-8 md:pt-16 pb-16 md:pb-24 max-w-7xl xl:max-w-[1440px] mx-auto">
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 xl:gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-xs font-semibold mb-5">
              <Rocket className="h-3.5 w-3.5" />
              Premium Growth Engine
            </div>
            <h1 className="text-3xl md:text-5xl lg:text-[3.25rem] xl:text-6xl font-display font-bold text-gray-900 leading-[1.1] mb-5 md:mb-6" data-testid="text-hero-headline">
              Turn Conversations Into Showings — Automated Lead Qualification for Realtors
            </h1>
            <p className="text-lg md:text-xl xl:text-2xl text-gray-600 mb-4 leading-relaxed">
              Stop losing leads to slow response times. The Realtor Growth Engine qualifies every inquiry, suggests smart replies, and books showings for you — while you're out in the field closing deals.
            </p>
            <p className="text-base md:text-lg text-gray-500 mb-8 leading-relaxed">
              Powered by AI, configured by our concierge team, and built for agents who value real conversations over cold calls.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <Link href={user ? "/app/templates/realtor-growth-engine" : "/auth"}>
                <button className="w-full sm:w-auto h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl" data-testid="button-hero-activate">
                  Activate Your Engine
                  <ArrowRight className="h-5 w-5" />
                </button>
              </Link>
              <a href="https://calendly.com/whachatcrm/demo" target="_blank" rel="noopener noreferrer">
                <button className="w-full sm:w-auto h-14 px-8 bg-white border border-gray-200 text-gray-700 font-medium rounded-full flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors" data-testid="button-hero-demo">
                  <Calendar className="h-4 w-4" />
                  Book a Demo
                </button>
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-500">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-brand-green" />
                $199 one-time setup
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-brand-green" />
                Live in 3–5 days
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-brand-green" />
                Done-for-you config
              </span>
            </div>
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
                    <span className="text-lg">🔥</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">Sarah M. — Score: 92 (Hot)</p>
                    <p className="text-xs text-gray-500 truncate">"I'd love to see the 3BR on Oak St this weekend"</p>
                  </div>
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium shrink-0">HOT</span>
                </div>

                <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                  <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <span className="text-lg">🟡</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">James R. — Score: 58 (Warm)</p>
                    <p className="text-xs text-gray-500 truncate">"What's the price range for condos downtown?"</p>
                  </div>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium shrink-0">WARM</span>
                </div>

                <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-lg">🆕</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">Maria L. — Score: 25 (New)</p>
                    <p className="text-xs text-gray-500 truncate">"Hi, I saw your listing on Zillow"</p>
                  </div>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium shrink-0">NEW</span>
                </div>

                <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-semibold text-emerald-800">AI Action Triggered</span>
                  </div>
                  <p className="text-xs text-emerald-700">Booking link sent to Sarah M. → Calendly showing scheduled for Saturday 2:00 PM</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="px-4 md:px-6 py-16 md:py-24 bg-gray-50">
        <div className="max-w-6xl xl:max-w-[1440px] mx-auto">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-4" data-testid="text-why-title">
              Why Realtors Are Switching to Proactive CRM
            </h2>
            <p className="text-base md:text-lg xl:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Traditional CRMs wait for you to log in and make calls. The Realtor Growth Engine works while you're at showings, closings, or dinner — engaging every lead the moment they reach out.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 xl:gap-12">
            <div className="text-center p-6 md:p-8">
              <div className="h-16 w-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Clock className="h-8 w-8 text-red-500" />
              </div>
              <h3 className="text-lg xl:text-xl font-bold text-gray-900 mb-3">Speed Wins Deals</h3>
              <p className="text-gray-600 xl:text-lg">The average agent takes 5+ hours to respond to a lead. Your engine responds in seconds — before competitors even see the notification.</p>
            </div>
            <div className="text-center p-6 md:p-8">
              <div className="h-16 w-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Brain className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="text-lg xl:text-xl font-bold text-gray-900 mb-3">AI Does the Qualifying</h3>
              <p className="text-gray-600 xl:text-lg">14+ intent signals analyze every message. Serious buyers rise to the top. Tire-kickers get nurtured. You only talk to people ready to act.</p>
            </div>
            <div className="text-center p-6 md:p-8">
              <div className="h-16 w-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Calendar className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-lg xl:text-xl font-bold text-gray-900 mb-3">Showings Book Themselves</h3>
              <p className="text-gray-600 xl:text-lg">When a lead mentions a tour, your engine sends your personal calendar link. No back-and-forth. The showing's on the calendar before you check your phone.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 md:px-6 py-16 md:py-24 bg-white">
        <div className="max-w-5xl xl:max-w-6xl mx-auto">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-4" data-testid="text-how-title">
              How It Works
            </h2>
            <p className="text-base md:text-lg xl:text-xl text-gray-600">
              From purchase to fully automated in 3–5 business days.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: step.num * 0.1 }}
                  className="relative"
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="h-16 w-16 xl:h-18 xl:w-18 bg-brand-green text-white rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                      <Icon className="h-7 w-7" />
                    </div>
                    <span className="text-xs font-bold text-brand-green uppercase tracking-wider mb-2">Step {step.num}</span>
                    <h3 className="text-lg xl:text-xl font-bold text-gray-900 mb-2">{step.title}</h3>
                    <p className="text-sm md:text-base text-gray-600">{step.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 md:px-6 py-16 md:py-24 bg-gray-900 text-white">
        <div className="max-w-7xl xl:max-w-[1440px] mx-auto">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold mb-4" data-testid="text-included-title">
              Everything Included in Your Setup
            </h2>
            <p className="text-base md:text-lg xl:text-xl text-gray-400 max-w-2xl mx-auto">
              One fee. Complete configuration. No DIY required.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 xl:gap-8">
            {included.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-6">
                  <div className="h-12 w-12 bg-brand-green/20 rounded-xl flex items-center justify-center mb-4">
                    <Icon className="h-6 w-6 text-brand-green" />
                  </div>
                  <h3 className="text-base xl:text-lg font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 md:px-6 py-16 md:py-24 bg-gradient-to-br from-emerald-50 to-teal-50">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-emerald-200 text-emerald-700 rounded-full text-sm font-medium mb-6 shadow-sm">
              <Star className="h-4 w-4 fill-emerald-500 text-emerald-500" />
              Limited-Time Offer
            </div>

            <h2 className="text-3xl md:text-5xl xl:text-6xl font-display font-bold text-gray-900 mb-4" data-testid="text-pricing-title">
              $199
            </h2>
            <p className="text-xl md:text-2xl text-gray-700 font-medium mb-2">One-Time Concierge Setup</p>
            <p className="text-base md:text-lg text-gray-500 mb-8 max-w-2xl mx-auto">
              Includes live onboarding session, full WABA + channel setup, AI calibration, 8 pre-built workflows, and 9-stage CRM pipeline — all configured for you.
            </p>

            <div className="flex flex-wrap justify-center gap-4 mb-8">
              <div className="flex items-center gap-2 text-gray-700">
                <CheckCircle2 className="h-5 w-5 text-brand-green" />
                <span>Pro plan required ($49/mo)</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <CheckCircle2 className="h-5 w-5 text-brand-green" />
                <span>AI add-on required ($29/mo)</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <CheckCircle2 className="h-5 w-5 text-brand-green" />
                <span>Meta conversation fees separate</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
              <Link href={user ? "/app/templates/realtor-growth-engine" : "/auth"}>
                <button className="h-14 px-10 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full inline-flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl text-lg" data-testid="button-pricing-activate">
                  Get Started Now
                  <ArrowRight className="h-5 w-5" />
                </button>
              </Link>
              <a href="https://calendly.com/whachatcrm/demo" target="_blank" rel="noopener noreferrer">
                <button className="h-14 px-10 bg-white border border-gray-200 text-gray-700 font-medium rounded-full inline-flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors text-lg" data-testid="button-pricing-demo">
                  <Calendar className="h-5 w-5" />
                  Book a Demo
                </button>
              </a>
            </div>

            <p className="text-sm text-gray-400">
              Questions? Email us at <a href="mailto:support@whachatcrm.com" className="text-brand-green hover:underline">support@whachatcrm.com</a>
            </p>
          </motion.div>
        </div>
      </section>

      <section className="px-4 md:px-6 py-16 md:py-24 bg-white">
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
            Ready to Stop Losing Leads?
          </h2>
          <p className="text-gray-400 xl:text-lg mb-6">
            Join agents who close more deals by responding faster and smarter.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href={user ? "/app/templates/realtor-growth-engine" : "/auth"}>
              <button className="h-12 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full inline-flex items-center justify-center gap-2 transition-all" data-testid="button-footer-cta">
                Activate Your Engine
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
            <a href="https://calendly.com/whachatcrm/demo" target="_blank" rel="noopener noreferrer">
              <button className="h-12 px-8 bg-gray-800 border border-gray-700 text-gray-300 font-medium rounded-full inline-flex items-center justify-center gap-2 hover:bg-gray-700 transition-colors" data-testid="button-footer-demo">
                Book a Demo
              </button>
            </a>
          </div>
        </div>
      </section>

      <footer className="px-4 md:px-6 py-6 md:py-8 border-t border-gray-100">
        <div className="max-w-7xl xl:max-w-[1440px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 bg-brand-green rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-sm">W</span>
            </div>
            <span className="font-display font-bold text-gray-900">WhachatCRM</span>
          </div>
          <div className="flex flex-wrap justify-center gap-4 md:gap-6 text-sm text-gray-500">
            <Link href="/pricing"><span className="hover:text-gray-900 cursor-pointer">Pricing</span></Link>
            <Link href="/whatsapp-crm"><span className="hover:text-gray-900 cursor-pointer">WhatsApp CRM</span></Link>
            <Link href="/blog"><span className="hover:text-gray-900 cursor-pointer">Blog</span></Link>
            <Link href="/privacy-policy"><span className="hover:text-gray-900 cursor-pointer">Privacy</span></Link>
            <Link href="/terms-of-use"><span className="hover:text-gray-900 cursor-pointer">Terms</span></Link>
          </div>
          <p className="text-sm text-gray-400">© 2025 WhachatCRM. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
