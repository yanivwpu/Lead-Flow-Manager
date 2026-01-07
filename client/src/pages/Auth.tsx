import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { Loader2, ArrowRight, AlertCircle, CheckCircle2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AuthPage() {
  const params = new URLSearchParams(window.location.search);
  const defaultToLogin = params.get('mode') === 'login';
  const [isLogin, setIsLogin] = useState(defaultToLogin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSubmitted, setResetSubmitted] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const { login, signup } = useAuth();
  const [, setLocation] = useLocation();

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetSubmitting(true);
    
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      });
    } catch (err) {
      // Silent fail - don't reveal if email exists
    }
    
    setResetSubmitting(false);
    setResetSubmitted(true);
  };

  const closeForgotPassword = () => {
    setForgotPasswordOpen(false);
    setResetEmail("");
    setResetSubmitted(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isLogin && !agreedToTerms) {
      setError("Please agree to the Privacy Policy and Terms of Use");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isLogin) {
        const success = await login(email, password, rememberMe);
        if (success) {
          setLocation("/app/chats");
        } else {
          setError("Invalid email or password");
        }
      } else {
        const result = await signup(name, email, password, "", businessName);
        if (result.success) {
          setLocation("/app/chats");
        } else {
          setError(result.error || "Signup failed");
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
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input 
                    id="name" 
                    placeholder="John Doe" 
                    required 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-gray-50 border-gray-200"
                    data-testid="input-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name</Label>
                  <Input 
                    id="businessName" 
                    placeholder="My Company" 
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="bg-gray-50 border-gray-200"
                    data-testid="input-business-name"
                  />
                </div>
              </>
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
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password" 
                type="password" 
                placeholder="••••••••" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-gray-50 border-gray-200"
                data-testid="input-password"
              />
            </div>

            {isLogin && (
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-green focus:ring-brand-green focus:ring-offset-0"
                  data-testid="checkbox-remember"
                />
                <Label 
                  htmlFor="remember" 
                  className="text-sm font-normal cursor-pointer text-gray-700"
                >
                  Remember me for 30 days
                </Label>
              </div>
            )}

            {!isLogin && (
              <div className="flex items-start space-x-2">
                <input
                  type="checkbox"
                  id="terms"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="h-4 w-4 mt-0.5 rounded border-gray-300 text-brand-green focus:ring-brand-green focus:ring-offset-0"
                  data-testid="checkbox-terms"
                />
                <Label 
                  htmlFor="terms" 
                  className="text-sm font-normal cursor-pointer text-gray-600 leading-tight"
                >
                  I agree to the{" "}
                  <Link href="/privacy-policy">
                    <a className="text-brand-green hover:underline" target="_blank">Privacy Policy</a>
                  </Link>
                  {" "}and{" "}
                  <Link href="/terms-of-use">
                    <a className="text-brand-green hover:underline" target="_blank">Terms of Use</a>
                  </Link>
                </Label>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full bg-brand-green hover:bg-emerald-700 h-11 text-base shadow-sm"
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

          <div className="mt-4 text-center">
            <button 
              type="button"
              onClick={() => setForgotPasswordOpen(true)} 
              className="text-sm text-gray-400 hover:text-brand-green hover:underline"
              data-testid="link-forgot-password"
            >
              Forgot your password?
            </button>
          </div>
        </motion.div>
      </div>

      <Dialog open={forgotPasswordOpen} onOpenChange={closeForgotPassword}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-display">Reset your password</DialogTitle>
          </DialogHeader>
          
          {!resetSubmitted ? (
            <form onSubmit={handleForgotPassword} className="space-y-4 mt-4">
              <p className="text-sm text-gray-500">
                Enter your email address and we'll send you a link to reset your password.
              </p>
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email address</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="john@company.com"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="bg-gray-50 border-gray-200"
                  data-testid="input-reset-email"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeForgotPassword}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-brand-green hover:bg-emerald-700"
                  disabled={resetSubmitting}
                  data-testid="button-send-reset"
                >
                  {resetSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Send Reset Link"
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <div className="py-6 text-center">
              <div className="h-12 w-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-6 w-6 text-brand-green" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Check your email</h3>
              <p className="text-sm text-gray-500 mb-4">
                If an account exists for {resetEmail}, you'll receive a password reset link shortly.
              </p>
              <Button
                onClick={closeForgotPassword}
                className="bg-brand-green hover:bg-emerald-700"
                data-testid="button-close-reset"
              >
                Back to Login
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
