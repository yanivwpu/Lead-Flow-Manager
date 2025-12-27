import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, CheckCircle2, QrCode, Smartphone } from "lucide-react";

export function Connect() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<'scan' | 'connecting' | 'success'>('scan');

  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    // Auto-advance for prototype feel after click (simulated below)
    return () => clearTimeout(timer);
  }, []);

  const handleSimulateScan = () => {
    setStep('connecting');
    setTimeout(() => {
      setStep('success');
      setTimeout(() => {
        setLocation('/app/chats');
      }, 1500);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <motion.div 
        layout
        className="bg-white p-8 md:p-12 rounded-3xl shadow-xl max-w-md w-full text-center"
      >
        {step === 'scan' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <h2 className="text-2xl font-display font-bold text-gray-900 mb-2">Connect WhatsApp</h2>
            <p className="text-gray-500 mb-8">Open WhatsApp on your phone and scan the code to sync your chats.</p>
            
            <div 
              onClick={handleSimulateScan}
              className="w-64 h-64 mx-auto bg-gray-900 rounded-2xl flex items-center justify-center mb-8 cursor-pointer relative group overflow-hidden"
            >
               <QrCode className="h-32 w-32 text-white opacity-20" />
               <div className="absolute inset-0 flex items-center justify-center">
                 <div className="bg-white p-4 rounded-xl shadow-lg">
                    <QrCode className="h-24 w-24 text-gray-900" />
                 </div>
               </div>
               
               {/* Scan line animation */}
               <motion.div 
                 className="absolute top-0 left-0 right-0 h-1 bg-brand-green shadow-[0_0_20px_rgba(37,211,102,0.8)]"
                 animate={{ top: ['10%', '90%', '10%'] }}
                 transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
               />
               
               <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                 <span className="text-white font-medium">Click to simulate scan</span>
               </div>
            </div>
            
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <Smartphone className="h-4 w-4" />
              <span>Keep your phone connected</span>
            </div>
          </motion.div>
        )}

        {step === 'connecting' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-12"
          >
            <div className="relative w-24 h-24 mx-auto mb-6">
               <div className="absolute inset-0 border-4 border-gray-100 rounded-full" />
               <div className="absolute inset-0 border-4 border-brand-green border-t-transparent rounded-full animate-spin" />
               <Loader2 className="absolute inset-0 m-auto h-10 w-10 text-brand-green animate-pulse" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Syncing Chats...</h3>
            <p className="text-gray-500">Importing your recent conversations</p>
          </motion.div>
        )}

        {step === 'success' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="py-12"
          >
            <div className="w-24 h-24 bg-green-100 rounded-full mx-auto mb-6 flex items-center justify-center">
               <CheckCircle2 className="h-12 w-12 text-brand-green" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Connected!</h3>
            <p className="text-gray-500">Redirecting to dashboard...</p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
