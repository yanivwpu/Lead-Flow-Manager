import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, MessageSquare, Bell, Tag, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Helmet } from "react-helmet";

export function WhatsappCrm() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>WhatsApp CRM: Manage Customer Chats with Notes, Tags & Follow-Ups | WhachatCRM</title>
        <meta name="description" content="Turn WhatsApp into a full CRM. Organize conversations, set reminders, collaborate with teams. Free plan available – no credit card needed." />
        <meta name="keywords" content="WhatsApp CRM, what is WhatsApp CRM, WhatsApp business CRM, WhatsApp customer management, WhatsApp lead management" />
        <link rel="canonical" href="https://whachatcrm.com/whatsapp-crm" />
        <meta property="og:title" content="WhatsApp CRM: Manage Customer Chats with Notes, Tags & Follow-Ups | WhachatCRM" />
        <meta property="og:description" content="Turn WhatsApp into a full CRM. Organize conversations, set reminders, collaborate with teams. Free plan available." />
        <meta property="og:url" content="https://whachatcrm.com/whatsapp-crm" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="WhatsApp CRM: Manage Customer Chats with Notes, Tags & Follow-Ups" />
        <meta name="twitter:description" content="Turn WhatsApp into a full CRM. Organize conversations, set reminders, collaborate with teams." />
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
      <section className="px-4 md:px-6 pt-12 pb-16 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-3xl md:text-5xl font-display font-bold text-gray-900 leading-tight mb-6">
            What is WhatsApp CRM?
          </h1>
          <p className="text-lg md:text-xl text-gray-600 mb-8 leading-relaxed">
            WhatsApp CRM is software that helps businesses manage customer conversations on WhatsApp. It adds organization, notes, and follow-up capabilities to your WhatsApp chats — so you never lose track of leads or forget to follow up.
          </p>
        </motion.div>
      </section>

      {/* What is WhatsApp CRM */}
      <section className="px-4 md:px-6 py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900 mb-6">
            Why do businesses need WhatsApp CRM?
          </h2>
          
          <div className="prose prose-lg max-w-none text-gray-600">
            <p>
              WhatsApp is the most popular messaging app in the world, with over 2 billion users. Many businesses use it to communicate with customers — but managing dozens or hundreds of conversations can quickly become overwhelming.
            </p>
            <p>
              Without a WhatsApp CRM, common problems include:
            </p>
            <ul>
              <li>Forgetting to follow up with interested leads</li>
              <li>Losing track of what was discussed with each customer</li>
              <li>No way to organize conversations by status or priority</li>
              <li>Difficulty collaborating with team members</li>
            </ul>
            <p>
              A WhatsApp CRM solves these problems by giving you tools to organize, track, and manage your WhatsApp conversations — all in one place.
            </p>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="px-4 md:px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900 mb-10 text-center">
            Key features of a WhatsApp CRM
          </h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white border border-gray-200 p-6 rounded-xl">
              <div className="h-10 w-10 bg-emerald-100 rounded-lg flex items-center justify-center mb-4">
                <MessageSquare className="h-5 w-5 text-brand-green" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Unified Inbox</h3>
              <p className="text-gray-600 text-sm">See all your WhatsApp conversations in one organized dashboard.</p>
            </div>
            
            <div className="bg-white border border-gray-200 p-6 rounded-xl">
              <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <Tag className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Notes & Tags</h3>
              <p className="text-gray-600 text-sm">Add context to each conversation with notes, tags, and pipeline stages.</p>
            </div>
            
            <div className="bg-white border border-gray-200 p-6 rounded-xl">
              <div className="h-10 w-10 bg-amber-100 rounded-lg flex items-center justify-center mb-4">
                <Bell className="h-5 w-5 text-amber-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Follow-up Reminders</h3>
              <p className="text-gray-600 text-sm">Set reminders to follow up with leads at the right time.</p>
            </div>
            
            <div className="bg-white border border-gray-200 p-6 rounded-xl">
              <div className="h-10 w-10 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Team Collaboration</h3>
              <p className="text-gray-600 text-sm">Multiple team members can access and manage conversations together.</p>
            </div>
          </div>
        </div>
      </section>

      {/* WhachatCRM Intro */}
      <section className="px-4 md:px-6 py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900 mb-4">
            Try WhachatCRM — the simple WhatsApp CRM
          </h2>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
            WhachatCRM is designed for small teams who want to organize their WhatsApp conversations without complexity. Free plan available.
          </p>
          
          <div className="flex flex-wrap justify-center gap-4 mb-8">
            <div className="flex items-center gap-2 text-gray-700">
              <CheckCircle2 className="h-5 w-5 text-brand-green" />
              <span>Free plan available</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <CheckCircle2 className="h-5 w-5 text-brand-green" />
              <span>Setup in 2 minutes</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <CheckCircle2 className="h-5 w-5 text-brand-green" />
              <span>No training required</span>
            </div>
          </div>
          
          <Link href="/auth">
            <button className="h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full inline-flex items-center gap-2 transition-all shadow-lg">
              Start Free Today
              <ArrowRight className="h-5 w-5" />
            </button>
          </Link>
          <p className="mt-4 text-sm text-gray-500">Paid plans from $19/month</p>
        </div>
      </section>

      {/* Related Pages */}
      <section className="px-4 md:px-6 py-12 border-t border-gray-100">
        <div className="max-w-4xl mx-auto">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Related Pages</h3>
          <div className="flex flex-wrap gap-4">
            <Link href="/crm-for-whatsapp-business">
              <span className="text-brand-green hover:underline cursor-pointer">CRM for WhatsApp Business</span>
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
