import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Helmet } from "react-helmet";
import { SiteFooter } from "@/components/SiteFooter";
import { MARKETING_URL } from "@/lib/marketingUrl";

export function PabblyAlternative() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Best Pabbly Alternative | WhachatCRM</title>
        <meta name="description" content="Switch from Pabbly Chatflow to WhachatCRM: $19/mo, no credit limits, free plan available. Visual chatbot builder & unified inbox for small teams." />
        <meta name="keywords" content="Pabbly alternative, Pabbly Chatflow alternative, WhatsApp CRM, WhatsApp automation, Pabbly competitor" />
        <link rel="canonical" href={`${MARKETING_URL}/pabbly-alternative`} />
        <meta property="og:title" content="Best Pabbly Alternative | WhachatCRM" />
        <meta property="og:description" content="Switch from Pabbly Chatflow to WhachatCRM: $19/mo, no credit limits, free plan available." />
        <meta property="og:url" content={`${MARKETING_URL}/pabbly-alternative`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Best Pabbly Chatflow Alternative for SMBs" />
        <meta name="twitter:description" content="Switch from Pabbly Chatflow: $19/mo, no credit limits, free plan available." />
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
            Pabbly Alternative
          </span>
          <h1 className="text-3xl md:text-5xl font-display font-bold text-gray-900 leading-tight mb-6">
            The Affordable Pabbly Chatflow Alternative
          </h1>
          <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Pabbly requires $249+ upfront and limits your messages with credits. WhachatCRM starts at $19/month with no message limits and no commitment.
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
            WhachatCRM vs Pabbly Chatflow
          </h2>
          
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-3 bg-gray-100 p-4 font-semibold text-gray-900">
              <div>Feature</div>
              <div className="text-center">WhachatCRM</div>
              <div className="text-center">Pabbly Chatflow</div>
            </div>
            
            {[
              { feature: "Free plan", us: true, them: false },
              { feature: "Monthly pricing", us: "$19/mo", them: "$249+ one-time" },
              { feature: "No message credits", us: true, them: false },
              { feature: "Cancel anytime", us: true, them: "30-day refund only" },
              { feature: "Unlimited team members", us: "$49/mo", them: true },
              { feature: "Visual chatbot builder", us: true, them: true },
              { feature: "Multiple WhatsApp numbers", us: "Up to 5", them: "Unlimited" },
              { feature: "No upfront investment", us: true, them: false },
              { feature: "Try before you commit", us: "14-day Pro trial", them: "30-day refund" },
              { feature: "Drip campaigns", us: true, them: true },
              { feature: "Workflow automation", us: true, them: true },
              { feature: "Team inbox", us: true, them: true },
              { feature: "Risk level", us: "Low ($19)", them: "High ($249+)" },
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
            Why businesses choose WhachatCRM over Pabbly
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-red-50 border border-red-100 p-5 rounded-xl">
              <h3 className="font-bold text-red-900 mb-2">Pabbly's Upfront Cost</h3>
              <p className="text-red-700 text-sm">$249-$699 upfront before you even know if it works for your business. We let you start at $19/month.</p>
            </div>
            <div className="bg-red-50 border border-red-100 p-5 rounded-xl">
              <h3 className="font-bold text-red-900 mb-2">Credit Limits</h3>
              <p className="text-red-700 text-sm">Pabbly limits messages with monthly credits. Run out mid-campaign and you're stuck. We have no message limits.</p>
            </div>
            <div className="bg-red-50 border border-red-100 p-5 rounded-xl">
              <h3 className="font-bold text-red-900 mb-2">30-Day Decision</h3>
              <p className="text-red-700 text-sm">With Pabbly, you must decide within 30 days or lose your money. With us, cancel anytime - no pressure.</p>
            </div>
            <div className="bg-red-50 border border-red-100 p-5 rounded-xl">
              <h3 className="font-bold text-red-900 mb-2">Complex Setup</h3>
              <p className="text-red-700 text-sm">Pabbly requires technical setup and understanding credits. WhachatCRM is simple - connect and go.</p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-xl">
              <h3 className="font-bold text-emerald-900 mb-2">Start Small, Scale Up</h3>
              <p className="text-emerald-700 text-sm">Begin with $19/month. Upgrade to Pro at $49/month when ready. No big upfront investment needed.</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-xl">
              <h3 className="font-bold text-emerald-900 mb-2">No Credit Counting</h3>
              <p className="text-emerald-700 text-sm">Send as many messages as you need. You pay your WhatsApp provider directly - we never limit or mark up messages.</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-xl">
              <h3 className="font-bold text-emerald-900 mb-2">Cancel Anytime Freedom</h3>
              <p className="text-emerald-700 text-sm">Monthly plans with one-click cancellation. No contracts, no commitments, no risk.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 md:px-6 py-16 bg-brand-green">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-white mb-4">
            Ready to try without the $249 risk?
          </h2>
          <p className="text-emerald-100 mb-8">
            Start with our free plan or 14-day Pro trial. No credit card required.
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
            <Link href="/interakt-alternative">
              <span className="text-brand-green hover:underline cursor-pointer">Interakt Alternative</span>
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
      <SiteFooter />
    </div>
  );
}
