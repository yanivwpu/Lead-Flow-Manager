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
  ChevronRight
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export function Welcome() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="p-6 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-brand-green rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">C</span>
          </div>
          <span className="font-display font-bold text-xl text-gray-900">ChatCRM</span>
        </div>
        <div className="flex items-center gap-4">
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
            <Link href="/auth">
              <button className="text-sm font-medium px-4 py-2 bg-brand-green text-white rounded-full hover:bg-green-600">
                Get Started Free
              </button>
            </Link>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="px-6 pt-12 pb-20 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto"
        >
          <h1 className="text-4xl md:text-6xl font-display font-bold text-gray-900 leading-[1.1] mb-6">
            Never forget a <span className="text-brand-green">WhatsApp</span> lead again.
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed max-w-2xl mx-auto">
            The simplest way to manage your WhatsApp conversations. Add notes, set reminders, and close more deals — all in one place.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href={user ? "/app/chats" : "/auth"}>
              <button className="h-14 px-8 bg-brand-green hover:bg-green-600 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                Start Free — No Credit Card
                <ArrowRight className="h-5 w-5" />
              </button>
            </Link>
          </div>
          
          <p className="mt-6 text-sm text-gray-500">
            Free forever for small teams · Paid plans from $19/month
          </p>
        </motion.div>
      </section>

      {/* Who Is This For Section */}
      <section className="px-6 py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-gray-900 mb-4">
              Built for busy business owners
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              If you use WhatsApp to talk to customers, ChatCRM helps you stay organized without the complexity.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
            >
              <div className="h-12 w-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Small Businesses</h3>
              <p className="text-gray-600">Shops, restaurants, and service providers who chat with customers on WhatsApp daily.</p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
            >
              <div className="h-12 w-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                <MessageSquare className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Sales Teams</h3>
              <p className="text-gray-600">Track leads, set follow-up reminders, and never let a hot prospect go cold.</p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
            >
              <div className="h-12 w-12 bg-amber-100 rounded-xl flex items-center justify-center mb-4">
                <Phone className="h-6 w-6 text-amber-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Freelancers</h3>
              <p className="text-gray-600">Consultants and professionals who manage client conversations via WhatsApp.</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Value Proposition Section */}
      <section className="px-6 py-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-gray-900 mb-4">
              Simple by design
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Other tools are complicated. ChatCRM does one thing really well: helps you remember to follow up.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="h-10 w-10 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                  <span className="text-red-600 font-bold">✕</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Complex CRM software</h4>
                  <p className="text-gray-600">Expensive, hard to learn, requires training and IT support.</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="h-10 w-10 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                  <span className="text-red-600 font-bold">✕</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Scattered notes</h4>
                  <p className="text-gray-600">Sticky notes, spreadsheets, and forgetting who you need to call back.</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="h-10 w-10 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                  <span className="text-red-600 font-bold">✕</span>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Expensive enterprise tools</h4>
                  <p className="text-gray-600">Built for big companies with big budgets and dedicated teams.</p>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-green-50 to-green-100 p-8 rounded-2xl border border-green-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-12 w-12 bg-brand-green rounded-xl flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">ChatCRM</h3>
              </div>
              
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-brand-green shrink-0 mt-0.5" />
                  <span className="text-gray-700">Works in 30 seconds — no setup needed</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-brand-green shrink-0 mt-0.5" />
                  <span className="text-gray-700">Add notes and tags to any conversation</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-brand-green shrink-0 mt-0.5" />
                  <span className="text-gray-700">Set follow-up reminders with one click</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-brand-green shrink-0 mt-0.5" />
                  <span className="text-gray-700">Free plan for individuals and small teams</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="px-6 py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-gray-900 mb-4">
              Three steps to organized conversations
            </h2>
            <p className="text-lg text-gray-600">
              Get started in minutes, not hours.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="h-16 w-16 bg-brand-green text-white rounded-2xl flex items-center justify-center mx-auto mb-6 text-2xl font-bold">
                1
              </div>
              <div className="h-14 w-14 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Phone className="h-7 w-7 text-brand-green" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Connect</h3>
              <p className="text-gray-600">Sign up and connect your WhatsApp Business number in minutes.</p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-center"
            >
              <div className="h-16 w-16 bg-brand-green text-white rounded-2xl flex items-center justify-center mx-auto mb-6 text-2xl font-bold">
                2
              </div>
              <div className="h-14 w-14 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Tag className="h-7 w-7 text-brand-green" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Organize</h3>
              <p className="text-gray-600">Add notes, tags, and pipeline stages to every conversation.</p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-center"
            >
              <div className="h-16 w-16 bg-brand-green text-white rounded-2xl flex items-center justify-center mx-auto mb-6 text-2xl font-bold">
                3
              </div>
              <div className="h-14 w-14 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Bell className="h-7 w-7 text-brand-green" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Follow Up</h3>
              <p className="text-gray-600">Set reminders and never miss a lead or important conversation.</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Pricing Teaser Section */}
      <section className="px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-gray-900 mb-4">
              Simple, honest pricing
            </h2>
            <p className="text-lg text-gray-600">
              Start free. Upgrade when you need more.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* Free Plan */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-white border-2 border-brand-green rounded-2xl p-8 relative"
            >
              <div className="absolute -top-3 left-6 bg-brand-green text-white text-xs font-bold px-3 py-1 rounded-full">
                MOST POPULAR
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Free</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-4xl font-bold text-gray-900">$0</span>
                <span className="text-gray-500">/forever</span>
              </div>
              <p className="text-gray-600 mb-6">Perfect for getting started and trying ChatCRM.</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle2 className="h-5 w-5 text-brand-green" />
                  50 conversations (lifetime)
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle2 className="h-5 w-5 text-brand-green" />
                  Notes, tags & pipeline
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle2 className="h-5 w-5 text-brand-green" />
                  Follow-up reminders
                </li>
              </ul>
              <Link href="/auth">
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
              className="bg-gray-50 border border-gray-200 rounded-2xl p-8"
            >
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Paid Plans</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-4xl font-bold text-gray-900">$19</span>
                <span className="text-gray-500">/month and up</span>
              </div>
              <p className="text-gray-600 mb-6">For growing businesses that need more power.</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle2 className="h-5 w-5 text-brand-green" />
                  500 - unlimited conversations
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle2 className="h-5 w-5 text-brand-green" />
                  Send messages to customers
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle2 className="h-5 w-5 text-brand-green" />
                  Email & push notifications
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <CheckCircle2 className="h-5 w-5 text-brand-green" />
                  Team collaboration (Growth+)
                </li>
              </ul>
              <Link href="/pricing">
                <button className="w-full h-12 bg-white border border-gray-300 hover:bg-gray-100 text-gray-900 font-semibold rounded-full transition-colors flex items-center justify-center gap-2">
                  View All Plans
                  <ChevronRight className="h-4 w-4" />
                </button>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Trust & Compliance Section */}
      <section className="px-6 py-16 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-4">
              Your data is safe with us
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              We take security and privacy seriously. Your conversations stay private.
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="h-12 w-12 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Shield className="h-6 w-6 text-brand-green" />
              </div>
              <p className="text-sm text-gray-300">Encrypted Data</p>
            </div>
            <div className="text-center">
              <div className="h-12 w-12 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Zap className="h-6 w-6 text-brand-green" />
              </div>
              <p className="text-sm text-gray-300">99.9% Uptime</p>
            </div>
            <div className="text-center">
              <div className="h-12 w-12 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Users className="h-6 w-6 text-brand-green" />
              </div>
              <p className="text-sm text-gray-300">GDPR Ready</p>
            </div>
            <div className="text-center">
              <div className="h-12 w-12 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Clock className="h-6 w-6 text-brand-green" />
              </div>
              <p className="text-sm text-gray-300">24/7 Support</p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="px-6 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-gray-900 mb-4">
            Ready to stop losing leads?
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Join thousands of businesses using ChatCRM to manage their WhatsApp conversations. Start free today.
          </p>
          
          <Link href={user ? "/app/chats" : "/auth"}>
            <button className="h-14 px-10 bg-brand-green hover:bg-green-600 text-white font-semibold rounded-full inline-flex items-center gap-2 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
              Start Free — No Credit Card Required
              <ArrowRight className="h-5 w-5" />
            </button>
          </Link>
          
          <p className="mt-6 text-sm text-gray-500">
            Free forever for up to 50 conversations · No credit card required
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-gray-100">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 bg-brand-green rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-display font-bold text-gray-900">ChatCRM</span>
          </div>
          
          <div className="flex items-center gap-6 text-sm text-gray-500">
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
            © 2025 ChatCRM. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
