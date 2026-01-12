import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Welcome } from "@/pages/Welcome";
import { AppLayout } from "@/pages/AppLayout";
import { AuthPage } from "@/pages/Auth";
import { ResetPassword } from "@/pages/ResetPassword";
import { PrivacyPolicy } from "@/pages/PrivacyPolicy";
import { TermsOfUse } from "@/pages/TermsOfUse";
import { Pricing } from "@/pages/Pricing";
import { WatiAlternative } from "@/pages/WatiAlternative";
import { PabblyAlternative } from "@/pages/PabblyAlternative";
import { InteraktAlternative } from "@/pages/InteraktAlternative";
import { RespondIoAlternative } from "@/pages/RespondIoAlternative";
import { Waba360Alternative } from "@/pages/Waba360Alternative";
import { WhatsappCrm } from "@/pages/WhatsappCrm";
import { CrmForWhatsappBusiness } from "@/pages/CrmForWhatsappBusiness";
import { Contact } from "@/pages/Contact";
import { Blog } from "@/pages/Blog";
import { BlogPost } from "@/pages/BlogPost";
import { Admin } from "@/pages/Admin";
import { SalesPortal } from "@/pages/SalesPortal";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";

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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Toaster />
        <Router />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
