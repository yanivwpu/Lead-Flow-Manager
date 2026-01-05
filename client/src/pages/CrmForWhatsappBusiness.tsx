import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, Store, Briefcase, Home, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Helmet } from "react-helmet";

export function CrmForWhatsappBusiness() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>CRM for WhatsApp Business – Manage Leads & Chats | WhachatCRM</title>
        <meta name="description" content="The best CRM for WhatsApp Business. Manage leads, add notes, set follow-up reminders, and close more deals. Free plan available. Start in 2 minutes." />
        <meta name="keywords" content="CRM for WhatsApp Business, WhatsApp Business CRM, WhatsApp lead management, WhatsApp business tool, small business CRM" />
        <link rel="canonical" href="https://whachatcrm.com/crm-for-whatsapp-business" />
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
            For WhatsApp Business Users
          </span>
          <h1 className="text-3xl md:text-5xl font-display font-bold text-gray-900 leading-tight mb-6">
            The CRM Built for WhatsApp Business
          </h1>
          <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Turn your WhatsApp Business chats into organized leads. Add notes, set reminders, and never let a customer slip through the cracks.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
            <Link href="/auth">
              <button className="w-full sm:w-auto h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-all shadow-lg">
                Start Free — No Credit Card
                <ArrowRight className="h-5 w-5" />
              </button>
            </Link>
            <Link href="/pricing">
              <button className="w-full sm:w-auto h-12 px-6 bg-white border border-gray-200 text-gray-700 font-medium rounded-full flex items-center justify-center gap-2 hover:bg-gray-50">
                View Pricing
                <ChevronRight className="h-4 w-4" />
              </button>
            </Link>
          </div>
          <p className="text-sm text-gray-500">Free plan available · Paid plans from $19/month</p>
        </motion.div>
      </section>

      {/* Who Uses WhatsApp Business */}
      <section className="px-4 md:px-6 py-16 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900 text-center mb-10">
            Perfect for businesses that use WhatsApp daily
          </h2>
          
          <div className="grid md:grid-cols-3 gap-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-white p-6 rounded-xl border border-gray-200"
            >
              <div className="h-12 w-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                <Store className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Retail & E-commerce</h3>
              <p className="text-gray-600 text-sm">Handle customer inquiries, order updates, and support — all from WhatsApp.</p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-white p-6 rounded-xl border border-gray-200"
            >
              <div className="h-12 w-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                <Briefcase className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Service Businesses</h3>
              <p className="text-gray-600 text-sm">Consultants, agencies, and professionals who manage client relationships via WhatsApp.</p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-white p-6 rounded-xl border border-gray-200"
            >
              <div className="h-12 w-12 bg-amber-100 rounded-xl flex items-center justify-center mb-4">
                <Home className="h-6 w-6 text-amber-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Local Businesses</h3>
              <p className="text-gray-600 text-sm">Restaurants, salons, and shops that take bookings and orders on WhatsApp.</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="px-4 md:px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900 text-center mb-10">
            What WhachatCRM does for your WhatsApp Business
          </h2>
          
          <div className="space-y-6">
            <div className="flex gap-4 items-start">
              <CheckCircle2 className="h-6 w-6 text-brand-green shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-gray-900 mb-1">Organize every conversation</h3>
                <p className="text-gray-600">Add tags like "Hot Lead", "Quoted", or "Paid" to know exactly where each customer stands.</p>
              </div>
            </div>
            
            <div className="flex gap-4 items-start">
              <CheckCircle2 className="h-6 w-6 text-brand-green shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-gray-900 mb-1">Remember everything with notes</h3>
                <p className="text-gray-600">Jot down important details about each customer — preferences, past orders, follow-up notes.</p>
              </div>
            </div>
            
            <div className="flex gap-4 items-start">
              <CheckCircle2 className="h-6 w-6 text-brand-green shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-gray-900 mb-1">Never forget to follow up</h3>
                <p className="text-gray-600">Set reminders for tomorrow, 3 days, or 1 week. Get notified when it's time to reach out.</p>
              </div>
            </div>
            
            <div className="flex gap-4 items-start">
              <CheckCircle2 className="h-6 w-6 text-brand-green shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-gray-900 mb-1">Track your sales pipeline</h3>
                <p className="text-gray-600">Move leads through stages: Lead → Contacted → Proposal → Negotiation → Closed.</p>
              </div>
            </div>
            
            <div className="flex gap-4 items-start">
              <CheckCircle2 className="h-6 w-6 text-brand-green shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-gray-900 mb-1">Multi-channel integrations</h3>
                <p className="text-gray-600">Connect with Shopify, HubSpot, Salesforce, Stripe and more — sync your leads across all your tools.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 md:px-6 py-16 bg-brand-green">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-white mb-4">
            Start managing your WhatsApp Business chats better
          </h2>
          <p className="text-emerald-100 mb-8">
            Join small businesses using WhachatCRM to organize conversations and close more deals.
          </p>
          <Link href="/auth">
            <button className="h-14 px-8 bg-white text-brand-green font-semibold rounded-full inline-flex items-center gap-2 hover:bg-gray-100 transition-colors">
              Get Started Free
              <ArrowRight className="h-5 w-5" />
            </button>
          </Link>
          <p className="mt-4 text-sm text-green-200">Free plan available · No credit card required</p>
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
            <Link href="/wati-alternative">
              <span className="text-brand-green hover:underline cursor-pointer">WATI Alternative</span>
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
