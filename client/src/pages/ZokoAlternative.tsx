import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, XCircle, ChevronRight, Brain, Zap, Shield, Sparkles, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Helmet } from "react-helmet";

export function ZokoAlternative() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Best Zoko Alternative for Shopify | Affordable WhatsApp CRM – WhachatCRM</title>
        <meta name="description" content="Switch from Zoko to WhachatCRM: $19/mo vs $35+, zero per-message fees, unlimited flows, and affordable AI. Best for Shopify sellers." />
        <link rel="canonical" href="https://whachatcrm.com/zoko-alternative" />
      </Helmet>

      {/* Navigation */}
      <nav className="p-4 md:p-6 flex justify-between items-center max-w-7xl mx-auto">
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
          <Link href="/auth">
            <button className="text-sm font-medium px-4 py-2 bg-brand-green text-white rounded-full hover:bg-emerald-700">
              Start Free
            </button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-4 md:px-6 pt-12 pb-16 max-w-5xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="inline-block bg-emerald-100 text-brand-green text-sm font-medium px-4 py-1 rounded-full mb-6">
            Zoko Alternative
          </span>
          <h1 className="text-3xl md:text-5xl font-display font-bold text-gray-900 leading-tight mb-6">
            The Shopify-First WhatsApp CRM Without the "Success Tax"
          </h1>
          <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Zoko charges you more as you grow. WhachatCRM gives you unlimited flows, zero per-message fees, and advanced AI for a fraction of the cost.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
            <Link href="/auth">
              <button className="w-full sm:w-auto h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-all shadow-lg">
                Stop Overpaying – Start Free
                <ArrowRight className="h-5 w-5" />
              </button>
            </Link>
          </div>
          <p className="text-sm text-gray-500">Free plan available · AI Brain from $29/month</p>
        </motion.div>
      </section>

      {/* Comparison Table */}
      <section className="px-4 md:px-6 py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900 text-center mb-10">
            WhachatCRM vs Zoko
          </h2>
          
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="grid grid-cols-3 bg-gray-100 p-4 font-semibold text-gray-900">
              <div>Feature</div>
              <div className="text-center text-brand-green">WhachatCRM</div>
              <div className="text-center">Zoko</div>
            </div>
            
            {[
              { feature: "Per-Message Fees", us: "Zero", them: "Variable Markup" },
              { feature: "Automation Flows", us: "Unlimited (Free)", them: "$6/mo per flow" },
              { feature: "Instagram Integration", us: "Native (Free)", them: "$10/mo extra" },
              { feature: "AI Assistant (Add-on)", us: "$29/mo (Unlimited)", them: "$79/mo (Limited)" },
              { feature: "Monthly Subscription", us: "From $19/mo", them: "From $35/mo" },
              { feature: "Shopify Native App", us: true, them: true },
              { feature: "Multi-Channel Inbox", us: true, them: "Primarily WhatsApp" },
              { feature: "Free Forever Plan", us: true, them: false },
            ].map((row, i) => (
              <div key={i} className="grid grid-cols-3 p-4 border-t border-gray-100 items-center text-sm md:text-base">
                <div className="text-gray-700 font-medium">{row.feature}</div>
                <div className="text-center">
                  {typeof row.us === "boolean" ? (
                    row.us ? <CheckCircle2 className="h-5 w-5 text-brand-green mx-auto" /> : <XCircle className="h-5 w-5 text-gray-300 mx-auto" />
                  ) : (
                    <span className="font-bold text-brand-green">{row.us}</span>
                  )}
                </div>
                <div className="text-center">
                  {typeof row.them === "boolean" ? (
                    row.them ? <CheckCircle2 className="h-5 w-5 text-gray-400 mx-auto" /> : <XCircle className="h-5 w-5 text-gray-300 mx-auto" />
                  ) : (
                    <span className="text-gray-600">{row.them}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Brain Section */}
      <section className="px-4 md:px-6 py-20 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-6">
                <Brain className="h-6 w-6 text-purple-600" />
              </div>
              <h2 className="text-3xl font-display font-bold text-gray-900 mb-6">
                Meet the AI Brain: Smarter than Zoko's AI, at 60% less cost.
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                Zoko's AI starts at a staggering $79/month. Our AI Brain is a powerful $29 add-on that doesn't just reply — it thinks.
              </p>
              <ul className="space-y-4">
                {[
                  "Self-learning from your website & Shopify store",
                  "Automated lead scoring & qualification",
                  "Human-like conversation (not a rigid bot)",
                  "Multi-language support (English, Spanish, Hebrew, Arabic)",
                  "Unlimited AI messages (No 'success tax')"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-purple-500 shrink-0 mt-0.5" />
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 p-8 rounded-3xl border border-purple-100 relative shadow-xl">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-purple-50">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-brand-green rounded-full flex items-center justify-center text-white text-xs">AI</div>
                  <div className="text-sm font-medium text-gray-900 italic">"Does this come in Blue?"</div>
                </div>
                <div className="bg-emerald-50 p-4 rounded-xl text-sm text-emerald-800 leading-relaxed border border-emerald-100">
                  "Yes! We have it in Blue. I've also checked your order history and see you liked the Red version last time. Would you like me to add the Blue one to your cart?"
                </div>
              </div>
              <div className="mt-6 p-4 bg-white/80 backdrop-blur rounded-xl border border-purple-100 flex items-center justify-between">
                <span className="text-sm font-bold text-purple-900">Monthly Cost</span>
                <div className="text-right">
                  <div className="text-xs text-gray-500 line-through">Zoko: $79+</div>
                  <div className="text-xl font-bold text-brand-green">WhachatCRM: $29</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Switch for Shopify */}
      <section className="px-4 md:px-6 py-16 bg-emerald-900 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-12">
            Why Shopify Sellers are making the switch
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="space-y-4">
              <div className="bg-emerald-800/50 w-12 h-12 rounded-full flex items-center justify-center mx-auto">
                <Zap className="h-6 w-6 text-emerald-400" />
              </div>
              <h3 className="font-bold text-xl">Unlimited Flows</h3>
              <p className="text-emerald-100 text-sm">Create abandoned cart, shipping, and feedback flows without paying $6/month for each one.</p>
            </div>
            <div className="space-y-4">
              <div className="bg-emerald-800/50 w-12 h-12 rounded-full flex items-center justify-center mx-auto">
                <Shield className="h-6 w-6 text-emerald-400" />
              </div>
              <h3 className="font-bold text-xl">Zero Success Tax</h3>
              <p className="text-emerald-100 text-sm">Zoko marks up your messages. We don't. The more you sell, the more you save with WhachatCRM.</p>
            </div>
            <div className="space-y-4">
              <div className="bg-emerald-800/50 w-12 h-12 rounded-full flex items-center justify-center mx-auto">
                <Users className="h-6 w-6 text-emerald-400" />
              </div>
              <h3 className="font-bold text-xl">Unified Inbox</h3>
              <p className="text-emerald-100 text-sm">Manage WhatsApp, Instagram, and Web Chat in one place without extra per-channel fees.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 md:px-6 py-20 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-gray-900 mb-6">
            Ready to stop the "Success Tax"?
          </h2>
          <p className="text-xl text-gray-600 mb-10">
            Join the Shopify merchants switching to the modern, fair-priced WhatsApp CRM.
          </p>
          <Link href="/auth">
            <button className="h-16 px-10 bg-brand-green text-white font-bold rounded-full inline-flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-xl hover:scale-105">
              Get Started Free
              <ArrowRight className="h-6 w-6" />
            </button>
          </Link>
          <p className="mt-4 text-sm text-gray-500 italic">No credit card required to start.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 md:px-6 py-12 border-t border-gray-100">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col gap-4">
             <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer">
                <div className="h-8 w-8 bg-brand-green rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">W</span>
                </div>
                <span className="font-display font-bold text-xl text-gray-900">WhachatCRM</span>
              </div>
            </Link>
            <p className="text-sm text-gray-500 max-w-xs">The fair-priced WhatsApp CRM for growing Shopify brands.</p>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500 font-medium">
            <Link href="/pricing"><span className="hover:text-brand-green cursor-pointer">Pricing</span></Link>
            <Link href="/wati-alternative"><span className="hover:text-brand-green cursor-pointer">Wati Alternative</span></Link>
            <Link href="/contact"><span className="hover:text-brand-green cursor-pointer">Contact</span></Link>
            <Link href="/privacy-policy"><span className="hover:text-brand-green cursor-pointer">Privacy</span></Link>
          </div>
          <p className="text-sm text-gray-400">© 2025 WhachatCRM</p>
        </div>
      </footer>
    </div>
  );
}
