import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, XCircle, Brain, Zap, Shield, Sparkles, MessageSquare, Layout } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Helmet } from "react-helmet";

export function ManychatAlternative() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Best Manychat Alternative | WhachatCRM</title>
        <meta name="description" content="Looking for a Manychat alternative? WhachatCRM offers a unified inbox for 7+ channels, no message markups, and advanced AI automation for SMBs." />
        <link rel="canonical" href="https://whachatcrm.com/manychat-alternative" />
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
          <span className="inline-block bg-blue-100 text-blue-700 text-sm font-medium px-4 py-1 rounded-full mb-6">
            Manychat Alternative
          </span>
          <h1 className="text-3xl md:text-5xl font-display font-bold text-gray-900 leading-tight mb-6">
            More Than Just a Bot. A Complete Multi-Channel CRM.
          </h1>
          <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Manychat is great for simple bots, but WhachatCRM is built for real business conversations. Unified inbox for 7+ channels, internal team collaboration, and AI that actually understands your business.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
            <Link href="/auth">
              <button className="w-full sm:w-auto h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-all shadow-lg">
                Build Better Flows – Start Free
                <ArrowRight className="h-5 w-5" />
              </button>
            </Link>
          </div>
          <p className="text-sm text-gray-500">Free forever plan · No credit card required</p>
        </motion.div>
      </section>

      {/* The Core Difference */}
      <section className="px-4 md:px-6 py-16 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
             <div className="order-2 md:order-1">
              <div className="grid grid-cols-1 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                      <XCircle className="h-6 w-6 text-red-600" />
                    </div>
                    <h3 className="font-bold text-gray-900">The Manychat Problem</h3>
                  </div>
                  <ul className="space-y-3 text-sm text-gray-600">
                    <li className="flex gap-2">• Primarily focused on rigid "If/Then" bot flows</li>
                    <li className="flex gap-2">• Poor handling of human-to-human handoffs</li>
                    <li className="flex gap-2">• Expensive "success tax" on contact growth</li>
                    <li className="flex gap-2">• Fragmented inbox across different channels</li>
                  </ul>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-brand-green/20">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                      <CheckCircle2 className="h-6 w-6 text-brand-green" />
                    </div>
                    <h3 className="font-bold text-gray-900">The WhachatCRM Edge</h3>
                  </div>
                  <ul className="space-y-3 text-sm text-emerald-800">
                    <li className="flex gap-2">• Unified inbox for WhatsApp, SMS, IG, FB & more</li>
                    <li className="flex gap-2">• Built-in CRM: Notes, Tags, and Team Tasks</li>
                    <li className="flex gap-2">• AI Brain that handles complex customer queries</li>
                    <li className="flex gap-2">• Transparent pricing with zero per-message markup</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="order-1 md:order-2">
              <h2 className="text-3xl font-display font-bold text-gray-900 mb-6">
                Why Manychat users are moving to WhachatCRM
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                Manychat was built for the early days of Facebook Messenger marketing. Modern businesses need a **true CRM** that lives where their customers are: WhatsApp, Instagram, and SMS.
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 rounded-xl hover:bg-white transition-colors">
                  <Layout className="h-6 w-6 text-brand-green shrink-0" />
                  <div>
                    <h4 className="font-bold text-gray-900">Unified Multi-Channel Inbox</h4>
                    <p className="text-sm text-gray-600">Stop switching tabs. Respond to a WhatsApp lead and an Instagram DM from the same screen.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 rounded-xl hover:bg-white transition-colors">
                  <MessageSquare className="h-6 w-6 text-brand-green shrink-0" />
                  <div>
                    <h4 className="font-bold text-gray-900">Real Conversation Management</h4>
                    <p className="text-sm text-gray-600">Add internal notes, assign chats to team members, and set follow-up tasks. Manychat is a bot; WhachatCRM is a workspace.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="px-4 md:px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900 text-center mb-10">
            Feature Comparison
          </h2>
          
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="grid grid-cols-3 bg-gray-100 p-4 font-semibold text-gray-900">
              <div>Feature</div>
              <div className="text-center text-brand-green">WhachatCRM</div>
              <div className="text-center">Manychat</div>
            </div>
            
            {[
              { feature: "Unified Inbox (7+ Channels)", us: true, them: false },
              { feature: "Internal Team Notes & Tasks", us: true, them: "Limited" },
              { feature: "WhatsApp Business API", us: "Official", them: "Partner-based" },
              { feature: "AI Knowledge Base", us: true, them: "Basic" },
              { feature: "Unlimited Automation Flows", us: true, them: "Paid Add-on" },
              { feature: "Zero Message Markup", us: true, them: false },
              { feature: "Starting Price", us: "$0/Free", them: "$15/mo (Scales fast)" },
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

      {/* CTA */}
      <section className="px-4 md:px-6 py-20 bg-brand-green text-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-6">
            Switch to the Modern Multi-Channel CRM
          </h2>
          <p className="text-xl text-emerald-100 mb-10">
            Join thousands of businesses scaling their sales with WhachatCRM.
          </p>
          <Link href="/auth">
            <button className="h-16 px-10 bg-white text-brand-green font-bold rounded-full inline-flex items-center gap-2 hover:bg-gray-100 transition-all shadow-xl">
              Start Your Free Account
              <ArrowRight className="h-6 w-6" />
            </button>
          </Link>
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
          </div>
          <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500 font-medium">
            <Link href="/wati-alternative"><span className="hover:text-brand-green cursor-pointer">Wati Alternative</span></Link>
            <Link href="/zoko-alternative"><span className="hover:text-brand-green cursor-pointer">Zoko Alternative</span></Link>
            <Link href="/pricing"><span className="hover:text-brand-green cursor-pointer">Pricing</span></Link>
          </div>
          <p className="text-sm text-gray-400">© 2025 WhachatCRM</p>
        </div>
      </footer>
    </div>
  );
}
