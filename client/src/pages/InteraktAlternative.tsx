import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Helmet } from "react-helmet";

export function InteraktAlternative() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Best Interakt Alternative for Small Teams – WhachatCRM</title>
        <meta name="description" content="Looking for an Interakt alternative with simpler pricing? WhachatCRM offers WhatsApp CRM from $19/month with visual chatbot builder and unlimited team members." />
        <meta name="keywords" content="Interakt alternative, WhatsApp CRM, Interakt competitor, WhatsApp business tool, affordable WhatsApp CRM" />
        <link rel="canonical" href="https://whachatcrm.com/interakt-alternative" />
        <meta name="twitter:card" content="summary" />
        <meta property="og:title" content="Best Interakt Alternative for Small Teams – WhachatCRM" />
        <meta property="og:description" content="Looking for an Interakt alternative with simpler pricing? WhachatCRM offers WhatsApp CRM from $19/month." />
        <meta property="og:url" content="https://whachatcrm.com/interakt-alternative" />
        <meta property="og:type" content="website" />
      </Helmet>

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

      <section className="px-4 md:px-6 pt-12 pb-16 max-w-5xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="inline-block bg-emerald-100 text-brand-green text-sm font-medium px-4 py-1 rounded-full mb-6">
            Interakt Alternative
          </span>
          <h1 className="text-3xl md:text-5xl font-display font-bold text-gray-900 leading-tight mb-6">
            The Simple Interakt Alternative for Growing Teams
          </h1>
          <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Interakt's pricing can get complicated fast. WhachatCRM offers straightforward pricing with all the features you need to manage WhatsApp conversations.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
            <Link href="/auth">
              <button className="w-full sm:w-auto h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-all shadow-lg">
                Try WhachatCRM Free
                <ArrowRight className="h-5 w-5" />
              </button>
            </Link>
          </div>
          <p className="text-sm text-gray-500">Free plan available · No credit card required · Cancel anytime</p>
        </motion.div>
      </section>

      <section className="px-4 md:px-6 py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900 text-center mb-10">
            WhachatCRM vs Interakt
          </h2>
          
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-3 bg-gray-100 p-4 font-semibold text-gray-900">
              <div>Feature</div>
              <div className="text-center">WhachatCRM</div>
              <div className="text-center">Interakt</div>
            </div>
            
            {[
              { feature: "Free plan", us: true, them: false },
              { feature: "Zero message markup", us: true, them: false },
              { feature: "Starting price", us: "$19/mo", them: "$49/mo" },
              { feature: "Visual chatbot builder", us: true, them: true },
              { feature: "Unlimited team members", us: "$49/mo", them: "Extra cost" },
              { feature: "Multiple WhatsApp numbers", us: "Up to 5", them: "Extra cost" },
              { feature: "Cancel anytime", us: true, them: true },
              { feature: "No training required", us: true, them: false },
              { feature: "Drip campaigns", us: true, them: true },
              { feature: "Workflow automation", us: true, them: true },
              { feature: "Team inbox", us: true, them: true },
              { feature: "Template messaging", us: true, them: true },
              { feature: "Simple pricing", us: true, them: false },
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

      <section className="px-4 md:px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900 text-center mb-10">
            Why businesses switch from Interakt to WhachatCRM
          </h2>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-xl">
              <h3 className="font-bold text-emerald-900 mb-2">Simpler Pricing</h3>
              <p className="text-emerald-700 text-sm">No complex tiers or add-on fees. $19 or $49/month gets you everything you need.</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-xl">
              <h3 className="font-bold text-emerald-900 mb-2">Zero Message Markup</h3>
              <p className="text-emerald-700 text-sm">Connect your own Twilio account and pay WhatsApp rates directly - no hidden fees on messages.</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-xl">
              <h3 className="font-bold text-emerald-900 mb-2">Unlimited Team Members</h3>
              <p className="text-emerald-700 text-sm">Our Pro plan includes unlimited team members at $49/month. No per-seat pricing.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 md:px-6 py-16 bg-brand-green">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-white mb-4">
            Ready to simplify your WhatsApp CRM?
          </h2>
          <p className="text-emerald-100 mb-8">
            Start with our free plan and upgrade when you're ready.
          </p>
          <Link href="/auth">
            <button className="h-14 px-8 bg-white text-brand-green font-semibold rounded-full inline-flex items-center gap-2 hover:bg-gray-100 transition-colors">
              Start Your Free Account
              <ArrowRight className="h-5 w-5" />
            </button>
          </Link>
        </div>
      </section>

      <section className="px-4 md:px-6 py-12 border-t border-gray-100">
        <div className="max-w-4xl mx-auto">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Related Comparisons</h3>
          <div className="flex flex-wrap gap-4">
            <Link href="/wati-alternative">
              <span className="text-brand-green hover:underline cursor-pointer">WATI Alternative</span>
            </Link>
            <Link href="/pabbly-alternative">
              <span className="text-brand-green hover:underline cursor-pointer">Pabbly Alternative</span>
            </Link>
            <Link href="/respond-io-alternative">
              <span className="text-brand-green hover:underline cursor-pointer">Respond.io Alternative</span>
            </Link>
            <Link href="/pricing">
              <span className="text-brand-green hover:underline cursor-pointer">Pricing</span>
            </Link>
          </div>
        </div>
      </section>

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
            <Link href="/contact"><span className="hover:text-gray-900 cursor-pointer">Contact</span></Link>
            <Link href="/privacy-policy"><span className="hover:text-gray-900 cursor-pointer">Privacy</span></Link>
            <Link href="/terms-of-use"><span className="hover:text-gray-900 cursor-pointer">Terms</span></Link>
          </div>
          <p className="text-sm text-gray-400">© 2025 WhachatCRM</p>
        </div>
      </footer>
    </div>
  );
}
