import { motion } from "framer-motion";
import { Link } from "wouter";
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
  Star
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import heroImage from "@assets/generated_images/whatsapp_crm_dashboard_mockup.png";

export function Welcome() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white">
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
            <button className="text-sm font-medium text-gray-600 hover:text-gray-900 hidden sm:block">Pricing</button>
          </Link>
          {user ? (
            <Link href="/app/chats">
              <button className="text-sm font-medium px-4 py-2 bg-brand-green text-white rounded-full hover:bg-emerald-700">
                Dashboard
              </button>
            </Link>
          ) : (
            <>
              <Link href="/auth?mode=login">
                <button className="text-sm font-medium text-gray-600 hover:text-gray-900 hidden sm:block">Login</button>
              </Link>
              <Link href="/auth">
                <button className="text-sm font-medium px-4 py-2 bg-brand-green text-white rounded-full hover:bg-emerald-700">
                  Start Free
                </button>
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="px-4 md:px-6 pt-8 md:pt-16 pb-12 md:pb-20 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-bold text-gray-900 leading-[1.1] mb-4 md:mb-6">
              WhatsApp CRM for Small Teams & Growing Businesses
            </h1>
            <p className="text-lg md:text-xl text-gray-600 mb-6 md:mb-8 leading-relaxed">
              Organize WhatsApp conversations, add notes & tags, and never miss a follow-up — all in one simple CRM built for WhatsApp Business.
            </p>
            
            {/* Stacked CTAs for mobile */}
            <div className="flex flex-col gap-3 mb-4">
              <Link href={user ? "/app/chats" : "/auth"} className="w-full sm:w-auto">
                <button className="w-full sm:w-auto h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl">
                  Start Free — No Credit Card
                  <ArrowRight className="h-5 w-5" />
                </button>
              </Link>
              <Link href="/pricing" className="w-full sm:w-auto">
                <button className="w-full sm:w-auto h-12 px-6 bg-white border border-gray-200 text-gray-700 font-medium rounded-full flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors">
                  View Pricing
                  <ChevronRight className="h-4 w-4" />
                </button>
              </Link>
            </div>
            
            <p className="text-sm text-gray-500 mb-6">
              Paid plans start at $19/month
            </p>
            
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
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            <img 
              src={heroImage} 
              alt="WhachatCRM Dashboard - WhatsApp CRM Interface" 
              className="w-full rounded-xl md:rounded-2xl shadow-2xl border border-gray-200"
            />
          </motion.div>
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
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 md:gap-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
            >
              <div className="h-12 w-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-4">
                <MessageSquare className="h-6 w-6 text-brand-green" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Organized Conversations</h3>
              <p className="text-gray-600">Every WhatsApp chat becomes a customer record — no more searching or guessing.</p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
            >
              <div className="h-12 w-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                <Tag className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Notes & Tags</h3>
              <p className="text-gray-600">Add internal notes and tags so your team always knows the full context.</p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
            >
              <div className="h-12 w-12 bg-amber-100 rounded-xl flex items-center justify-center mb-4">
                <Bell className="h-6 w-6 text-amber-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Follow-Ups & Tasks</h3>
              <p className="text-gray-600">Set reminders and tasks to make sure every lead is followed up on time.</p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
            >
              <div className="h-12 w-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Built for Teams</h3>
              <p className="text-gray-600">Assign conversations, track progress, and stay aligned.</p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
            >
              <div className="h-12 w-12 bg-pink-100 rounded-xl flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-pink-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Multi-Channel Integrations</h3>
              <p className="text-gray-600">Connect with Shopify, HubSpot, Salesforce, Stripe & more to sync leads across all your tools.</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Product Screenshot Section */}
      <section className="px-4 md:px-6 py-16 md:py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 md:mb-12">
            <h2 className="text-2xl md:text-4xl font-display font-bold text-gray-900 mb-3 md:mb-4">
              See WhachatCRM in Action
            </h2>
            <p className="text-base md:text-lg text-gray-600 max-w-2xl mx-auto">
              Everything happens in one clean dashboard — no switching tools, no chaos.
            </p>
          </div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative"
          >
            <img 
              src={heroImage} 
              alt="WhachatCRM Dashboard showing WhatsApp conversations with notes and tags" 
              className="w-full rounded-xl md:rounded-2xl shadow-2xl border border-gray-200"
            />
          </motion.div>
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
      <section className="px-4 md:px-6 py-16 md:py-20">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl font-display font-bold text-gray-900 mb-3 md:mb-4">
            Ready to Organize Your WhatsApp Conversations?
          </h2>
          <p className="text-base md:text-lg text-gray-600 mb-6 md:mb-8">
            Start free in minutes. No credit card required.
          </p>
          
          <Link href={user ? "/app/chats" : "/auth"}>
            <button className="h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full inline-flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl">
              Start Free
              <ArrowRight className="h-5 w-5" />
            </button>
          </Link>
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
          
          <div className="flex items-center gap-4 md:gap-6 text-sm text-gray-500">
            <Link href="/pricing">
              <span className="hover:text-gray-900 cursor-pointer">Pricing</span>
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
