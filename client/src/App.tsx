import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShopifyBootstrapScreen } from "@/components/ShopifyBootstrapScreen";
import { ShopifyBootstrapRoutes } from "@/components/ShopifyBootstrapRoutes";
import {
  applyShopifyBootstrapDocumentFlags,
  clearShopifyPlanPickerOpened,
  clearShopifyPostInstallPricingPath,
  SHOPIFY_PLAN_PICKER_OPENED_KEY,
  isShopifyBillingSuccessReturn,
  isShopifyPlanApprovalReturn,
  isShopifyBootstrapDestinationReached,
  readShopifyBootstrapFromWindow,
  resolveShopifyBootstrapDestination,
  shopifyPostApprovalInboxPath,
  shopifyMerchantNeedsPlanSelection,
  shouldSuppressAppRoutes,
} from "@/lib/shopifyBootstrap";

const AuthPage = lazy(() => import("@/pages/Auth").then(m => ({ default: m.AuthPage })));

const AppLayout = lazy(() => import("@/pages/AppLayout").then(m => ({ default: m.AppLayout })));
const ResetPassword = lazy(() => import("@/pages/ResetPassword").then(m => ({ default: m.ResetPassword })));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy").then(m => ({ default: m.PrivacyPolicy })));
const TermsOfUse = lazy(() => import("@/pages/TermsOfUse").then(m => ({ default: m.TermsOfUse })));
const DataDeletion = lazy(() => import("@/pages/DataDeletion").then(m => ({ default: m.DataDeletion })));
const Unsubscribe = lazy(() => import("@/pages/Unsubscribe").then(m => ({ default: m.Unsubscribe })));
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
const UserGuide = lazy(() => import("@/pages/UserGuide").then(m => ({ default: m.UserGuide })));
const NotFound = lazy(() => import("@/pages/not-found"));
import { ReferralCapture } from "@/components/ReferralCapture";
import { CookieConsentRoot } from "@/components/CookieConsentRoot";
import { GoogleAnalyticsRouteTracker } from "@/components/GoogleAnalyticsRouteTracker";
import { Welcome } from "@/pages/Welcome";

// Wrapper for protected routes
function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, isLoading } = useAuth();
  const bootstrap = readShopifyBootstrapFromWindow();

  if (shouldSuppressAppRoutes(bootstrap)) {
    console.log("[ShopifyBootstrap] suppressing_app_routes");
    return <ShopifyBootstrapScreen />;
  }

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

function MarketingRoutes() {
  const [location] = useLocation();

  if (location === "/") {
    return <Welcome />;
  }

  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/privacy">
        <Redirect to="/privacy-policy" />
      </Route>
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms-of-use" component={TermsOfUse} />
      <Route path="/data-deletion" component={DataDeletion} />
      <Route path="/unsubscribe" component={Unsubscribe} />
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
      <Route path="/user-guide" component={UserGuide} />
      <Route path="/WhachatCRM-User-Guide.html">
        <Redirect to="/user-guide" />
      </Route>

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

function Router() {
  const [location, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const [urlTick, setUrlTick] = useState(0);
  const [shopifyPlanGate, setShopifyPlanGate] = useState<boolean | null>(null);

  const bootstrap = useMemo(() => readShopifyBootstrapFromWindow(), [location, urlTick]);

  const shopifyInstallPricingFlow =
    bootstrap.postInstallFlow || bootstrap.shopifyInstalled || bootstrap.persistedPostInstall;

  useLayoutEffect(() => {
    setUrlTick((n) => n + 1);
  }, [location]);

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    if (bootstrap.active) {
      applyShopifyBootstrapDocumentFlags(true);
      return;
    }
    applyShopifyBootstrapDocumentFlags(false);
    if (location !== "/") {
      document.documentElement.classList.add("wcs-hide-static-marketing");
    }
  }, [bootstrap.active, location]);

  useLayoutEffect(() => {
    if (!bootstrap.active || !bootstrap.needsInstallRedirect || !bootstrap.shop) return;
    window.location.replace(
      `/api/shopify/install?shop=${encodeURIComponent(bootstrap.shop)}`,
    );
  }, [bootstrap.active, bootstrap.needsInstallRedirect, bootstrap.shop]);

  useEffect(() => {
    if (!bootstrap.active || !user) {
      setShopifyPlanGate(null);
      return;
    }

    let cancelled = false;
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((me) => {
        if (cancelled) return;
        setShopifyPlanGate(shopifyMerchantNeedsPlanSelection(me));
      })
      .catch(() => {
        if (!cancelled) setShopifyPlanGate(true);
      });

    return () => {
      cancelled = true;
    };
  }, [bootstrap.active, user, urlTick]);

  const destination = useMemo(
    () => resolveShopifyBootstrapDestination(bootstrap, !!user, true, shopifyPlanGate),
    [bootstrap, user, shopifyPlanGate],
  );

  const destinationReached = useMemo(
    () => isShopifyBootstrapDestinationReached(bootstrap, !!user, shopifyPlanGate),
    [bootstrap, urlTick, location, user, shopifyPlanGate],
  );

  const shopifyBootstrapLoading =
    bootstrap.active &&
    !bootstrap.needsInstallRedirect &&
    !!user &&
    shopifyPlanGate === null;

  useLayoutEffect(() => {
    if (authLoading || !user) return;

    const path = window.location.pathname.replace(/\/$/, "") || "/";
    const search = window.location.search;
    const params = new URLSearchParams(search);

    const enterInbox = (dest: string) => {
      clearShopifyPostInstallPricingPath();
      clearShopifyPlanPickerOpened();
      if (!path.startsWith("/app/inbox")) {
        setLocation(dest);
      }
    };

    if (isShopifyPlanApprovalReturn(search)) {
      const planHandle = params.get("plan_handle") || "";
      const syncQs = planHandle
        ? `?plan_handle=${encodeURIComponent(planHandle)}`
        : "";
      void fetch(`/api/shopify/billing/sync-return${syncQs}`, { credentials: "include" })
        .then(async (res) => {
          if (res.ok) {
            const data = (await res.json()) as { redirectTo?: string };
            enterInbox(
              typeof data.redirectTo === "string"
                ? data.redirectTo
                : `/app/inbox?shopify_billing=success&plan=${encodeURIComponent(planHandle || "free")}`,
            );
            return;
          }
          enterInbox(
            `/app/inbox?shopify_billing=success&plan=${encodeURIComponent(planHandle || "free")}`,
          );
        })
        .catch(() => {
          enterInbox(
            `/app/inbox?shopify_billing=success&plan=${encodeURIComponent(planHandle || "free")}`,
          );
        });
      return;
    }

    if (isShopifyBillingSuccessReturn(search)) {
      enterInbox(shopifyPostApprovalInboxPath(search));
      return;
    }

    if (bootstrap.active && bootstrap.postInstallFlow) return;

    try {
      if (sessionStorage.getItem(SHOPIFY_PLAN_PICKER_OPENED_KEY) !== "1") return;
    } catch {
      return;
    }

    if (params.get("shopify_installed") === "1") return;

    if (path === "/" || path === "/pricing" || path.startsWith("/pricing/")) {
      enterInbox("/app/inbox");
    }
  }, [
    authLoading,
    user,
    location,
    urlTick,
    bootstrap.active,
    bootstrap.postInstallFlow,
    setLocation,
  ]);

  useLayoutEffect(() => {
    if (!bootstrap.active || authLoading || bootstrap.needsInstallRedirect) return;

    if (shouldSuppressAppRoutes(bootstrap, shopifyPlanGate)) {
      console.log("[ShopifyBootstrap] suppressing_app_routes");
    }

    if (!destinationReached) {
      console.log("[ShopifyBootstrap] redirecting", {
        from: `${window.location.pathname}${window.location.search}`,
        to: destination,
      });
      setLocation(destination);
    }
  }, [
    authLoading,
    bootstrap,
    bootstrap.needsInstallRedirect,
    destination,
    destinationReached,
    shopifyPlanGate,
    setLocation,
  ]);

  useLayoutEffect(() => {
    if (!bootstrap.active) return;
    if (!authLoading && destinationReached && !bootstrap.needsInstallRedirect) {
      document.documentElement.classList.remove("wcs-shopify-bootstrap", "wcs-shopify-preboot");
    } else {
      document.documentElement.classList.add("wcs-shopify-bootstrap");
    }
  }, [authLoading, bootstrap.active, bootstrap.needsInstallRedirect, destinationReached]);

  if (bootstrap.active) {
    if (
      authLoading ||
      bootstrap.needsInstallRedirect ||
      shopifyBootstrapLoading ||
      !destinationReached
    ) {
      return <ShopifyBootstrapScreen />;
    }

    if (
      user &&
      (destination.startsWith("/app/inbox") || isShopifyPlanApprovalReturn(window.location.search))
    ) {
      return <ProtectedRoute component={AppLayout} />;
    }

    return (
      <ShopifyBootstrapRoutes
        destination={destination}
        postInstallFlow={bootstrap.postInstallFlow}
      />
    );
  }

  return <MarketingRoutes />;
}

const PageLoader = () => (
  <div className="flex h-screen items-center justify-center bg-gray-50">
    <Loader2 className="h-8 w-8 text-brand-green animate-spin" />
  </div>
);

function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.classList.remove("wcs-marketing-navigating");
    document.body.style.minHeight = "";
    document.body.style.paddingRight = "";
    document.documentElement.style.overflow = "";
  }, []);

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
        <CookieConsentRoot>
          <GoogleAnalyticsRouteTracker />
          <ReferralCapture />
          <Toaster />
          <Suspense fallback={<PageLoader />}>
            <Router />
          </Suspense>
        </CookieConsentRoot>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
