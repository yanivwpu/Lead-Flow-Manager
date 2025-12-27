import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { Loader2, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, signup } = useAuth();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (isLogin) {
        const success = await login(email, password);
        if (success) {
          setLocation("/app/chats");
        } else {
          setError("Invalid email or password");
        }
      } else {
        const success = await signup(name, email, password);
        if (success) {
          setLocation("/connect");
        } else {
          setError("User already exists with that email");
        }
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white">
      {/* Left Panel - Branding */}
      <div className="flex-1 bg-brand-dark relative overflow-hidden flex flex-col justify-between p-8 md:p-12 text-white">
        <div className="relative z-10">
          <div className="h-10 w-10 bg-brand-green rounded-xl flex items-center justify-center mb-6">
             <span className="text-white font-bold text-xl">C</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4 leading-tight">
            Manage your <br/>
            <span className="text-brand-green">WhatsApp</span> business.
          </h1>
          <p className="text-brand-teal/80 text-lg max-w-md leading-relaxed">
            The all-in-one CRM for WhatsApp-first teams. Organize leads, automate follow-ups, and close more deals.
          </p>
        </div>

        <div className="relative z-10 space-y-4 hidden md:block">
           <div className="flex items-center gap-3">
             <CheckCircle2 className="text-brand-green h-5 w-5" />
             <span className="font-medium">Sync unlimited chats</span>
           </div>
           <div className="flex items-center gap-3">
             <CheckCircle2 className="text-brand-green h-5 w-5" />
             <span className="font-medium">Track deal pipeline</span>
           </div>
           <div className="flex items-center gap-3">
             <CheckCircle2 className="text-brand-green h-5 w-5" />
             <span className="font-medium">Automated reminders</span>
           </div>
        </div>

        {/* Abstract background */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-brand-green/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-brand-teal/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-gray-100"
        >
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 font-display">
              {isLogin ? "Welcome back" : "Create your account"}
            </h2>
            <p className="text-gray-500 mt-2 text-sm">
              {isLogin ? "Enter your details to access your account" : "Start your 14-day free trial, no credit card required"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input 
                  id="name" 
                  placeholder="John Doe" 
                  required 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-gray-50 border-gray-200"
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="john@company.com" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-gray-50 border-gray-200"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="password">Password</Label>
                {isLogin && <a href="#" className="text-xs text-brand-green font-medium hover:underline">Forgot password?</a>}
              </div>
              <Input 
                id="password" 
                type="password" 
                placeholder="••••••••" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-gray-50 border-gray-200"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full bg-brand-green hover:bg-green-600 h-11 text-base shadow-sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {isLogin ? "Sign In" : "Get Started"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button 
              onClick={() => {
                setIsLogin(!isLogin);
                setError("");
              }}
              className="font-semibold text-brand-green hover:underline"
            >
              {isLogin ? "Sign up" : "Log in"}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
