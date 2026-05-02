import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";

const AuthPage = lazy(() => import("@/pages/Auth").then(m => ({ default: m.AuthPage })));

const AppLayout = lazy(() => import("@/pages/AppLayout").then(m => ({ default: m.AppLayout })));
const ResetPassword = lazy(() => import("@/pages/ResetPassword").then(m => ({ default: m.ResetPassword })));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy").then(m => ({ default: m.PrivacyPolicy })));
const TermsOfUse = lazy(() => import("@/pages/TermsOfUse").then(m => ({ default: m.TermsOfUse })));
const Pricing = lazy(() => import("@/pages/Pricing").then(m => ({ default: m.Pricing })));
const WatiAlternative = lazy(() => import("@/pages/WatiAlternative").then(m => ({ default: m.WatiAlternative })));
const ZokoAlternative = lazy(() => import("@/pages/ZokoAlternative").then(m => ({ default: m.ZokoAlternative })));
const ManychatAlternative = lazy(() => import("@/pages/ManychatAlternative").then(m => ({ default: m.ManychatAlternative })));
const PabblyAlternative = lazy(() => import("@/pages/PabblyAlternative").then(m => ({ default: m.PabblyAlternative })));
const InteraktAlternative = lazy(() => import("@/pages/InteraktAlternative").then(m => ({ default: m.InteraktAlternative })));
const RespondIoAlternative = lazy(() => import("@/pages/RespondIoAlternative").then(m => ({ default: m.RespondIoAlternative })));
const Waba360Alternative = lazy(() => import("@/pages/Waba360Alternative").then(m => ({ default: m.Waba360Alternative })));
const WhatsappCrm = lazy(() => import("@/pages/WhatsappCrm").then(m => ({ default: m.WhatsappCrm })));
const Comparison = lazy(() => import("@/pages/Comparison").then(m => ({ default: m.Comparison })));
const CrmForWhatsappBusiness = lazy(() => import("@/pages/CrmForWhatsappBusiness").then(m => ({ default: m.CrmForWhatsappBusiness })));
const Contact = lazy(() => import("@/pages/Contact").then(m => ({ default: m.Contact })));
const Blog = lazy(() => import("@/pages/Blog").then(m => ({ default: m.Blog })));
const BlogPost = lazy(() => import("@/pages/BlogPost").then(m => ({ default: m.BlogPost })));
const Admin = lazy(() => import("@/pages/Admin").then(m => ({ default: m.Admin })));
const QrLanding = lazy(() => import("@/pages/QrLanding").then(m => ({ default: m.QrLanding })));
const SalesPortal = lazy(() => import("@/pages/SalesPortal").then(m => ({ default: m.SalesPortal })));
const PartnerPortal = lazy(() => import("@/pages/PartnerPortal").then(m => ({ default: m.PartnerPortal })));
const RealtorGrowthEngine = lazy(() => import("@/pages/RealtorGrowthEngine").then(m => ({ default: m.RealtorGrowthEngine })));
const PostCheckout = lazy(() => import("@/pages/PostCheckout").then(m => ({ default: m.PostCheckout })));
const RealtorLanding = lazy(() => import("@/pages/RealtorLanding").then(m => ({ default: m.RealtorLanding })));
const WidgetFrame = lazy(() => import("@/pages/WidgetFrame").then(m => ({ default: m.WidgetFrame })));
const WidgetChat = lazy(() => import("@/pages/WidgetChat").then(m => ({ default: m.WidgetChat })));
const HelpCenter = lazy(() => import("@/pages/HelpCenter").then(m => ({ default: m.HelpCenter })));
const NotFound = lazy(() => import("@/pages/not-found"));
/** Homepage is its own chunk so "/" does not pull the full marketing tree into the bootstrap bundle. */
const WelcomePage = lazy(() =>
  import("@/pages/Welcome").then((m) => ({ default: m.Welcome })),
);
import { ReferralCapture } from "@/components/ReferralCapture";

/** Inner Suspense so route "/" does not fall back to the full-app PageLoader while Welcome chunk loads. */
function MarketingHomeRoute() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" aria-busy="true" />}>
      <WelcomePage />
    </Suspense>
  );
}

// Wrapper for protected routes
function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 text-brand-green animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/auth" />;
  }

  return <Component {...rest} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={MarketingHomeRoute} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms-of-use" component={TermsOfUse} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/wati-alternative" component={WatiAlternative} />
      <Route path="/zoko-alternative" component={ZokoAlternative} />
      <Route path="/manychat-alternative" component={ManychatAlternative} />
      <Route path="/pabbly-alternative" component={PabblyAlternative} />
      <Route path="/interakt-alternative" component={InteraktAlternative} />
      <Route path="/respond-io-alternative" component={RespondIoAlternative} />
      <Route path="/waba360-alternative" component={Waba360Alternative} />
      <Route path="/whatsapp-crm" component={WhatsappCrm} />
      <Route path="/best-whatsapp-crm-2026" component={Comparison} />
      <Route path="/crm-for-whatsapp-business" component={CrmForWhatsappBusiness} />
      <Route path="/contact" component={Contact} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/blog" component={Blog} />
      <Route path="/demo-scan" component={QrLanding} />
      <Route path="/sales-admin" component={Admin} />
      <Route path="/sales-portal" component={SalesPortal} />
      <Route path="/partner-portal" component={PartnerPortal} />
      <Route path="/realtor-growth-engine" component={RealtorLanding} />
      <Route path="/widget-frame/:widgetId" component={WidgetFrame} />
      <Route path="/chat/:widgetId" component={WidgetChat} />
      <Route path="/help" component={HelpCenter} />

      <Route path="/post-checkout">
        <ProtectedRoute component={PostCheckout} />
      </Route>
      
      {/* Protected Routes */}
      <Route path="/app/*?">
        <ProtectedRoute component={AppLayout} />
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

const PageLoader = () => (
  <div className="flex h-screen items-center justify-center bg-gray-50">
    <Loader2 className="h-8 w-8 text-brand-green animate-spin" />
  </div>
);

function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const rtlLanguages = ['he', 'ar', 'fa', 'ur'];
    const isRtl = rtlLanguages.includes(i18n.language);

    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = i18n.language;

    if (isRtl) {
      document.body.classList.add('rtl');
    } else {
      document.body.classList.remove('rtl');
    }
  }, [i18n.language]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ReferralCapture />
        <Toaster />
        <Suspense fallback={<PageLoader />}>
          <Router />
        </Suspense>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
