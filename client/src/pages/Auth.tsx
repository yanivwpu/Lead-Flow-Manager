import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { getDirection } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { Loader2, ArrowRight, AlertCircle, CheckCircle2, X, Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AuthPage() {
  const { t } = useTranslation();
  const isRTL = getDirection() === 'rtl';
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
  const [showPassword, setShowPassword] = useState(false);
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
    <div dir={isRTL ? 'rtl' : 'ltr'} className={`min-h-screen flex flex-col md:flex-row bg-white overflow-auto ${isRTL ? 'text-right' : 'text-left'}`}>
      {/* Left Panel - Branding */}
      <div className="md:flex-1 bg-brand-dark relative overflow-hidden flex flex-col justify-between p-6 md:p-12 text-white">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4 md:mb-6">
            <div className="h-10 w-10 bg-brand-green rounded-xl flex items-center justify-center">
               <span className="text-white font-bold text-xl">W</span>
            </div>
            <span className="font-display font-bold text-xl md:hidden">WhachatCRM</span>
          </div>
          <h1 className="text-2xl md:text-5xl font-display font-bold mb-2 md:mb-4 leading-tight">
            <span style={{ whiteSpace: 'nowrap' }}>{t('auth.manageWhatsApp')}</span>
          </h1>
          <p className="text-brand-teal/80 text-sm md:text-lg max-w-md leading-relaxed hidden md:block">
            {t('auth.crmDescription')}
          </p>
        </div>

        <div className="relative z-10 space-y-4 hidden md:block">
           <div className="flex items-center gap-3">
             <CheckCircle2 className="text-brand-green h-5 w-5 shrink-0" />
             <span className="font-medium">{t('auth.syncChats')}</span>
           </div>
           <div className="flex items-center gap-3">
             <CheckCircle2 className="text-brand-green h-5 w-5 shrink-0" />
             <span className="font-medium">{t('auth.trackPipeline')}</span>
           </div>
           <div className="flex items-center gap-3">
             <CheckCircle2 className="text-brand-green h-5 w-5 shrink-0" />
             <span className="font-medium">{t('auth.automatedReminders')}</span>
           </div>
        </div>

        {/* Abstract background */}
        <div className={`absolute top-0 w-[600px] h-[600px] bg-brand-green/10 rounded-full blur-3xl -translate-y-1/2 ${isRTL ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2'}`} />
        <div className={`absolute bottom-0 w-[600px] h-[600px] bg-brand-teal/20 rounded-full blur-3xl translate-y-1/2 ${isRTL ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2'}`} />
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-6 bg-gray-50">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 my-4"
        >
          <div className="mb-6 md:mb-8 text-center">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 font-display">
              {isLogin ? t('auth.welcomeBack') : t('auth.createAccount')}
            </h2>
            <p className="text-gray-500 mt-2 text-sm">
              {isLogin ? t('auth.loginSubtitle') : t('auth.signupSubtitle')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">{t('auth.fullName')}</Label>
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
                  <Label htmlFor="businessName">{t('auth.businessName')}</Label>
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
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="john@company.com" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-gray-50 border-gray-200"
                dir="ltr"
              />
              {isLogin && (
                <p className="text-[10px] text-gray-400 mt-1">Demo: demo@whachat.com / password123</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <div className="relative">
                <Input 
                  id="password" 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`bg-gray-50 border-gray-200 ${isRTL ? 'ps-10' : 'pe-10'}`}
                  data-testid="input-password"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none ${isRTL ? 'left-3' : 'right-3'}`}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {isLogin && (
              <div className="flex items-center gap-2">
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
                  {t('auth.rememberMe')}
                </Label>
              </div>
            )}

            {!isLogin && (
              <div className="flex items-start gap-2">
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
                  {t('auth.agreeTerms')}{" "}
                  <Link href="/privacy-policy">
                    <a className="text-brand-green hover:underline" target="_blank">{t('auth.privacyPolicy')}</a>
                  </Link>
                  {" "}{t('common.and')}{" "}
                  <Link href="/terms-of-use">
                    <a className="text-brand-green hover:underline" target="_blank">{t('auth.termsOfUse')}</a>
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
                  {isLogin ? t('auth.loginButton') : t('auth.signupButton')}
                  <ArrowRight className={`h-4 w-4 ${isRTL ? 'me-2 rotate-180' : 'ms-2'}`} />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            {isLogin ? t('auth.noAccount') + " " : t('auth.haveAccount') + " "}
            <button 
              onClick={() => {
                setIsLogin(!isLogin);
                setError("");
              }}
              className="font-semibold text-brand-green hover:underline"
            >
              {isLogin ? t('common.signup') : t('common.login')}
            </button>
          </div>

          <div className="mt-4 text-center">
            <button 
              type="button"
              onClick={() => setForgotPasswordOpen(true)} 
              className="text-sm text-gray-400 hover:text-brand-green hover:underline"
              data-testid="link-forgot-password"
            >
              {t('auth.forgotPassword')}
            </button>
          </div>
        </motion.div>
      </div>

      <Dialog open={forgotPasswordOpen} onOpenChange={closeForgotPassword}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-display">{t('auth.resetPassword')}</DialogTitle>
          </DialogHeader>
          
          {!resetSubmitted ? (
            <form onSubmit={handleForgotPassword} className="space-y-4 mt-4">
              <p className="text-sm text-gray-500">
                {t('auth.resetInstructions')}
              </p>
              <div className="space-y-2">
                <Label htmlFor="reset-email">{t('auth.email')}</Label>
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
                  {t('common.cancel')}
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
                    t('auth.sendResetLink')
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <div className="py-6 text-center">
              <div className="h-12 w-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-6 w-6 text-brand-green" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{t('auth.checkEmail')}</h3>
              <p className="text-sm text-gray-500 mb-4">
                {t('auth.resetEmailSent')}
              </p>
              <Button
                onClick={closeForgotPassword}
                className="bg-brand-green hover:bg-emerald-700"
                data-testid="button-close-reset"
              >
                {t('common.login')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
