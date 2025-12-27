import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { ArrowRight, CheckCircle2, QrCode } from "lucide-react";
import heroImage from "@assets/generated_images/modern_abstract_network_connection_graphic_with_green_accents.png";

export function Welcome() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-white flex flex-col relative overflow-hidden">
      {/* Abstract Background Decoration */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-brand-green/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
      
      <nav className="p-6 flex justify-between items-center relative z-10 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-brand-green rounded-lg flex items-center justify-center">
             <span className="text-white font-bold text-lg">C</span>
          </div>
          <span className="font-display font-bold text-xl text-gray-900">ChatCRM</span>
        </div>
        <button className="text-sm font-medium text-gray-600 hover:text-gray-900">Login</button>
      </nav>

      <main className="flex-1 flex flex-col md:flex-row items-center justify-center max-w-7xl mx-auto w-full px-6 gap-12 relative z-10">
        <div className="flex-1 max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl md:text-6xl font-display font-bold text-gray-900 leading-[1.1] mb-6">
              Never forget a <span className="text-brand-green">WhatsApp</span> lead again.
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              The simplest CRM built directly for your WhatsApp workflow. Organize chats, set reminders, and close more deals.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/connect">
                <button className="h-14 px-8 bg-brand-green hover:bg-green-600 text-white font-semibold rounded-full flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                  Connect WhatsApp
                  <ArrowRight className="h-5 w-5" />
                </button>
              </Link>
              <button className="h-14 px-8 bg-white border border-gray-200 text-gray-700 font-semibold rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors">
                View Demo
              </button>
            </div>
            
            <div className="mt-12 flex items-center gap-6 text-sm text-gray-500 font-medium">
               <div className="flex items-center gap-2">
                 <CheckCircle2 className="h-4 w-4 text-brand-green" />
                 <span>No credit card required</span>
               </div>
               <div className="flex items-center gap-2">
                 <CheckCircle2 className="h-4 w-4 text-brand-green" />
                 <span>Setup in 30 seconds</span>
               </div>
            </div>
          </motion.div>
        </div>
        
        <div className="flex-1 w-full max-w-lg hidden md:block">
           <motion.div 
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             transition={{ duration: 0.8, delay: 0.2 }}
             className="relative"
           >
              <img 
                src={heroImage} 
                alt="CRM Dashboard Preview" 
                className="w-full rounded-2xl shadow-2xl border border-gray-100"
              />
              {/* Floating Element 1 */}
              <motion.div 
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -top-6 -right-6 bg-white p-4 rounded-xl shadow-xl border border-gray-100 flex items-center gap-3"
              >
                 <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                   <QrCode className="h-5 w-5 text-green-700" />
                 </div>
                 <div>
                   <div className="text-sm font-bold text-gray-900">Connected</div>
                   <div className="text-xs text-gray-500">Just now</div>
                 </div>
              </motion.div>
           </motion.div>
        </div>
      </main>
    </div>
  );
}
