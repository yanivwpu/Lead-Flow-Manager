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
              <button className="text-sm font-medium px-4 py-2 bg-brand-green text-white rounded-full hover:bg-green-600">
                Dashboard
              </button>
            </Link>
          ) : (
            <>
              <Link href="/auth">
                <button className="text-sm font-medium text-gray-600 hover:text-gray-900 hidden sm:block">Login</button>
              </Link>
              <Link href="/auth">
                <button className="text-sm font-medium px-4 py-2 bg-brand-green text-white rounded-full hover:bg-green-600">
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
                <button className="w-full sm:w-auto h-14 px-8 bg-brand-green hover:bg-green-600 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl">
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
            
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-green" />
                <span>Free plan available</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-green" />
                <span>Setup in 2 minutes</span>
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

      {/* Benefits Section - Benefit-first approach */}
      <section className="px-4 md:px-6 py-16 md:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10 md:mb-14">
            <h2 className="text-2xl md:text-4xl font-display font-bold text-gray-900 mb-3 md:mb-4">
              Close more deals, forget fewer leads
            </h2>
            <p className="text-base md:text-lg text-gray-600 max-w-2xl mx-auto">
              Everything you need to turn WhatsApp conversations into customers.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
            >
              <div className="h-12 w-12 bg-green-100 rounded-xl flex items-center justify-center mb-4">
                <Bell className="h-6 w-6 text-brand-green" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Never miss a follow-up</h3>
              <p className="text-gray-600">Set reminders for any conversation. Get notified when it's time to reach out — so leads don't go cold.</p>
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
              <h3 className="text-lg font-bold text-gray-900 mb-2">Stay organized instantly</h3>
              <p className="text-gray-600">Add notes, tags, and pipeline stages to every chat. Find any conversation in seconds, not minutes.</p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
            >
              <div className="h-12 w-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                <MessageSquare className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Reply from anywhere</h3>
              <p className="text-gray-600">Manage all your WhatsApp conversations in one place. Works on desktop, tablet, and mobile.</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works - Simple 3 steps */}
      <section className="px-4 md:px-6 py-16 md:py-20">
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
      <section className="px-4 md:px-6 py-16 md:py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10 md:mb-12">
            <h2 className="text-2xl md:text-4xl font-display font-bold text-gray-900 mb-3 md:mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-base md:text-lg text-gray-600">
              Start free. Upgrade when you need more.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4 md:gap-6">
            {/* Free Plan */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-white border-2 border-brand-green rounded-2xl p-6 md:p-8 relative"
            >
              <div className="absolute -top-3 left-4 md:left-6 bg-brand-green text-white text-xs font-bold px-3 py-1 rounded-full">
                START HERE
              </div>
              <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">Free</h3>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-3xl md:text-4xl font-bold text-gray-900">$0</span>
                <span className="text-gray-500">/forever</span>
              </div>
              <p className="text-gray-600 mb-5">Perfect for trying WhachatCRM.</p>
              <ul className="space-y-2 mb-6">
                <li className="flex items-center gap-2 text-gray-700 text-sm md:text-base">
                  <CheckCircle2 className="h-4 w-4 text-brand-green shrink-0" />
                  50 conversations (lifetime)
                </li>
                <li className="flex items-center gap-2 text-gray-700 text-sm md:text-base">
                  <CheckCircle2 className="h-4 w-4 text-brand-green shrink-0" />
                  Notes, tags & reminders
                </li>
                <li className="flex items-center gap-2 text-gray-700 text-sm md:text-base">
                  <CheckCircle2 className="h-4 w-4 text-brand-green shrink-0" />
                  1 WhatsApp number
                </li>
              </ul>
              <Link href="/auth" className="block">
                <button className="w-full h-12 bg-brand-green hover:bg-green-600 text-white font-semibold rounded-full transition-colors">
                  Get Started Free
                </button>
              </Link>
            </motion.div>
            
            {/* Paid Plans */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8"
            >
              <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">Paid Plans</h3>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-3xl md:text-4xl font-bold text-gray-900">$19</span>
                <span className="text-gray-500">/month and up</span>
              </div>
              <p className="text-gray-600 mb-5">For growing teams that need more.</p>
              <ul className="space-y-2 mb-6">
                <li className="flex items-center gap-2 text-gray-700 text-sm md:text-base">
                  <CheckCircle2 className="h-4 w-4 text-brand-green shrink-0" />
                  500 – unlimited conversations
                </li>
                <li className="flex items-center gap-2 text-gray-700 text-sm md:text-base">
                  <CheckCircle2 className="h-4 w-4 text-brand-green shrink-0" />
                  Send messages to customers
                </li>
                <li className="flex items-center gap-2 text-gray-700 text-sm md:text-base">
                  <CheckCircle2 className="h-4 w-4 text-brand-green shrink-0" />
                  Team access (Growth+)
                </li>
              </ul>
              <Link href="/pricing" className="block">
                <button className="w-full h-12 bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold rounded-full transition-colors flex items-center justify-center gap-2">
                  Compare Plans
                  <ChevronRight className="h-4 w-4" />
                </button>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="px-4 md:px-6 py-12 md:py-16 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8 md:mb-10">
            <h2 className="text-xl md:text-2xl font-display font-bold mb-2">
              Your data is safe with us
            </h2>
            <p className="text-gray-400 text-sm md:text-base">
              Enterprise-grade security for businesses of all sizes.
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <div className="text-center">
              <div className="h-10 w-10 md:h-12 md:w-12 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-2 md:mb-3">
                <Shield className="h-5 w-5 md:h-6 md:w-6 text-brand-green" />
              </div>
              <p className="text-xs md:text-sm text-gray-300">Encrypted Data</p>
            </div>
            <div className="text-center">
              <div className="h-10 w-10 md:h-12 md:w-12 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-2 md:mb-3">
                <Zap className="h-5 w-5 md:h-6 md:w-6 text-brand-green" />
              </div>
              <p className="text-xs md:text-sm text-gray-300">99.9% Uptime</p>
            </div>
            <div className="text-center">
              <div className="h-10 w-10 md:h-12 md:w-12 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-2 md:mb-3">
                <Users className="h-5 w-5 md:h-6 md:w-6 text-brand-green" />
              </div>
              <p className="text-xs md:text-sm text-gray-300">GDPR Compliant</p>
            </div>
            <div className="text-center">
              <div className="h-10 w-10 md:h-12 md:w-12 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-2 md:mb-3">
                <Clock className="h-5 w-5 md:h-6 md:w-6 text-brand-green" />
              </div>
              <p className="text-xs md:text-sm text-gray-300">24/7 Support</p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 md:px-6 py-16 md:py-20">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl font-display font-bold text-gray-900 mb-3 md:mb-4">
            Ready to organize your WhatsApp leads?
          </h2>
          <p className="text-base md:text-lg text-gray-600 mb-6 md:mb-8">
            Join small teams using WhachatCRM to manage conversations and close more deals.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
            <Link href={user ? "/app/chats" : "/auth"}>
              <button className="w-full sm:w-auto h-14 px-8 bg-brand-green hover:bg-green-600 text-white font-semibold rounded-full inline-flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl">
                Start Free — No Credit Card
                <ArrowRight className="h-5 w-5" />
              </button>
            </Link>
          </div>
          
          <p className="text-sm text-gray-500">
            Free plan available · Paid plans start at $19/month
          </p>
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
