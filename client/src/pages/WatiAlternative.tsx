import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, XCircle, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Helmet } from "react-helmet";

export function WatiAlternative() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Best WATI Alternative for Small Teams – WhachatCRM</title>
        <meta name="description" content="Looking for a simpler, more affordable WATI alternative? WhachatCRM offers WhatsApp CRM features without the complexity. Free plan available." />
        <meta name="keywords" content="WATI alternative, WhatsApp CRM, WATI competitor, simple WhatsApp CRM, affordable WhatsApp business tool" />
        <link rel="canonical" href="https://whachatcrm.com/wati-alternative" />
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
            WATI Alternative
          </span>
          <h1 className="text-3xl md:text-5xl font-display font-bold text-gray-900 leading-tight mb-6">
            The Simple WATI Alternative for Small Teams
          </h1>
          <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            WATI is powerful but complex. WhachatCRM gives you the WhatsApp CRM features you need — without the steep learning curve or enterprise pricing.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
            <Link href="/auth">
              <button className="w-full sm:w-auto h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-all shadow-lg">
                Try WhachatCRM Free
                <ArrowRight className="h-5 w-5" />
              </button>
            </Link>
          </div>
          <p className="text-sm text-gray-500">Free plan available · Paid plans from $19/month</p>
        </motion.div>
      </section>

      {/* Comparison Table */}
      <section className="px-4 md:px-6 py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900 text-center mb-10">
            WhachatCRM vs WATI
          </h2>
          
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-3 bg-gray-100 p-4 font-semibold text-gray-900">
              <div>Feature</div>
              <div className="text-center">WhachatCRM</div>
              <div className="text-center">WATI</div>
            </div>
            
            {[
              { feature: "Free plan", us: true, them: false },
              { feature: "Simple setup", us: true, them: false },
              { feature: "No training required", us: true, them: false },
              { feature: "WhatsApp messaging", us: true, them: true },
              { feature: "Notes & tags", us: true, them: true },
              { feature: "Follow-up reminders", us: true, them: true },
              { feature: "Starting price", us: "$0/free", them: "$49/month" },
            ].map((row, i) => (
              <div key={i} className="grid grid-cols-3 p-4 border-t border-gray-100 items-center">
                <div className="text-gray-700">{row.feature}</div>
                <div className="text-center">
                  {typeof row.us === "boolean" ? (
                    row.us ? <CheckCircle2 className="h-5 w-5 text-brand-green mx-auto" /> : <XCircle className="h-5 w-5 text-gray-300 mx-auto" />
                  ) : (
                    <span className="font-semibold text-brand-green">{row.us}</span>
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

      {/* Why Switch */}
      <section className="px-4 md:px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900 text-center mb-10">
            Why teams switch from WATI to WhachatCRM
          </h2>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-gray-50 p-6 rounded-xl">
              <h3 className="font-bold text-gray-900 mb-2">Simpler to Use</h3>
              <p className="text-gray-600 text-sm">No complex workflows or training needed. Start managing chats in minutes.</p>
            </div>
            <div className="bg-gray-50 p-6 rounded-xl">
              <h3 className="font-bold text-gray-900 mb-2">More Affordable</h3>
              <p className="text-gray-600 text-sm">Free plan available. Paid plans start at just $19/month vs WATI's $49+.</p>
            </div>
            <div className="bg-gray-50 p-6 rounded-xl">
              <h3 className="font-bold text-gray-900 mb-2">Built for Small Teams</h3>
              <p className="text-gray-600 text-sm">We focus on what small businesses actually need, not enterprise features.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 md:px-6 py-16 bg-brand-green">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-white mb-4">
            Ready to switch from WATI?
          </h2>
          <p className="text-emerald-100 mb-8">
            Try WhachatCRM free and see the difference simplicity makes.
          </p>
          <Link href="/auth">
            <button className="h-14 px-8 bg-white text-brand-green font-semibold rounded-full inline-flex items-center gap-2 hover:bg-gray-100 transition-colors">
              Start Your Free Account
              <ArrowRight className="h-5 w-5" />
            </button>
          </Link>
        </div>
      </section>

      {/* Related Pages */}
      <section className="px-4 md:px-6 py-12 border-t border-gray-100">
        <div className="max-w-4xl mx-auto">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Related Pages</h3>
          <div className="flex flex-wrap gap-4">
            <Link href="/whatsapp-crm">
              <span className="text-brand-green hover:underline cursor-pointer">What is WhatsApp CRM?</span>
            </Link>
            <Link href="/crm-for-whatsapp-business">
              <span className="text-brand-green hover:underline cursor-pointer">CRM for WhatsApp Business</span>
            </Link>
            <Link href="/pricing">
              <span className="text-brand-green hover:underline cursor-pointer">Pricing</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 md:px-6 py-8 border-t border-gray-100">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="h-6 w-6 bg-brand-green rounded-md flex items-center justify-center">
                <span className="text-white font-bold text-sm">W</span>
              </div>
              <span className="font-display font-bold text-gray-900">WhachatCRM</span>
            </div>
          </Link>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <Link href="/pricing"><span className="hover:text-gray-900 cursor-pointer">Pricing</span></Link>
            <Link href="/privacy-policy"><span className="hover:text-gray-900 cursor-pointer">Privacy</span></Link>
            <Link href="/terms-of-use"><span className="hover:text-gray-900 cursor-pointer">Terms</span></Link>
          </div>
          <p className="text-sm text-gray-400">© 2025 WhachatCRM</p>
        </div>
      </footer>
    </div>
  );
}
