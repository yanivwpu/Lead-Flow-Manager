import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Welcome } from "@/pages/Welcome";
import { AuthPage } from "@/pages/Auth";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";

const AppLayout = lazy(() => import("@/pages/AppLayout").then(m => ({ default: m.AppLayout })));
const ResetPassword = lazy(() => import("@/pages/ResetPassword").then(m => ({ default: m.ResetPassword })));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy").then(m => ({ default: m.PrivacyPolicy })));
const TermsOfUse = lazy(() => import("@/pages/TermsOfUse").then(m => ({ default: m.TermsOfUse })));
const Pricing = lazy(() => import("@/pages/Pricing").then(m => ({ default: m.Pricing })));
const WatiAlternative = lazy(() => import("@/pages/WatiAlternative").then(m => ({ default: m.WatiAlternative })));
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
const SalesPortal = lazy(() => import("@/pages/SalesPortal").then(m => ({ default: m.SalesPortal })));
const NotFound = lazy(() => import("@/pages/not-found"));

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
      <Route path="/" component={Welcome} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms-of-use" component={TermsOfUse} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/wati-alternative" component={WatiAlternative} />
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
      <Route path="/sales-admin" component={Admin} />
      <Route path="/sales-portal" component={SalesPortal} />
      
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
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Toaster />
        <Suspense fallback={<PageLoader />}>
          <Router />
        </Suspense>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
