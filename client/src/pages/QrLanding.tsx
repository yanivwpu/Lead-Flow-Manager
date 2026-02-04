import { useEffect, useState } from "react";
import { BookDemoModal } from "@/components/BookDemoModal";
import { Button } from "@/components/ui/button";
import { Calendar, CheckCircle2, MessageSquare, Shield, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getDirection } from "@/lib/i18n";
import { Helmet } from "react-helmet";

export function QrLanding() {
  const [showDemoModal, setShowDemoModal] = useState(false);
  const { t } = useTranslation();
  const isRTL = getDirection() === 'rtl';

  useEffect(() => {
    // Automatically show modal after a short delay for QR scans
    const timer = setTimeout(() => {
      setShowDemoModal(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className={`min-h-screen bg-white ${isRTL ? 'text-right' : 'text-left'}`}>
      <Helmet>
        <title>Book your WhachatCRM Demo | Scan & Schedule</title>
      </Helmet>

      <BookDemoModal isOpen={showDemoModal} onClose={() => setShowDemoModal(false)} />

      <nav className="p-4 md:p-6 flex justify-between items-center max-w-7xl mx-auto border-b">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-brand-green rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">W</span>
          </div>
          <span className="font-display font-bold text-xl text-gray-900">WhachatCRM</span>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-16 md:py-24 text-center">
        <div className="mb-8 flex justify-center">
          <div className="h-20 w-20 bg-green-100 rounded-2xl flex items-center justify-center">
            <Calendar className="h-10 w-10 text-brand-green" />
          </div>
        </div>

        <h1 className="text-3xl md:text-5xl font-display font-bold text-gray-900 mb-6">
          Ready to see WhachatCRM in action?
        </h1>
        
        <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          Thanks for scanning! Schedule your personalized demo below to discover how we can transform your WhatsApp customer management.
        </p>

        <div className="flex justify-center mb-16">
          <Button 
            onClick={() => setShowDemoModal(true)}
            className="h-16 px-10 text-lg bg-brand-green hover:bg-emerald-700 text-white font-bold rounded-full shadow-xl hover:shadow-2xl transition-all flex items-center gap-3"
          >
            <Calendar className="h-6 w-6" />
            Schedule My Demo Now
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-8 text-left">
          <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
            <div className="h-10 w-10 bg-emerald-100 rounded-lg flex items-center justify-center mb-4">
              <Zap className="h-5 w-5 text-emerald-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">15-Minute Intro</h3>
            <p className="text-sm text-gray-600">Quick, high-impact tour of our most powerful features.</p>
          </div>
          
          <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
            <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <MessageSquare className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">Custom Strategy</h3>
            <p className="text-sm text-gray-600">We'll show you exactly how to apply CRM to your business.</p>
          </div>
          
          <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
            <div className="h-10 w-10 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <Shield className="h-5 w-5 text-purple-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">Live Q&A</h3>
            <p className="text-sm text-gray-600">Get answers to your specific technical or billing questions.</p>
          </div>
        </div>
      </main>

      <footer className="py-12 bg-gray-50 border-t">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
          &copy; 2026 WhachatCRM. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
