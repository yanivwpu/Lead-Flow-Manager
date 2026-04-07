import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Check, Loader2, Shield, Brain, Sparkles,
  Zap, MessageSquare, Users
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { supportedLanguages } from "@/lib/i18n";

// ─── Shared structural component ────────────────────────────────────────────
// Used for every checkmark + text row throughout the page.
// RTL: dir="rtl" on the <li> makes the browser place the first flex child
// (Check icon) on the RIGHT and the text span to its LEFT automatically.
// Wrapped text lines stay anchored under the text's right edge.
// LTR: dir="ltr" — icon on left, text right of it, left-aligned.
function FeatureItem({
  text,
  iconClass,
  isRTL,
}: {
  text: string;
  iconClass: string;
  isRTL: boolean;
}) {
  return (
    <li
      dir={isRTL ? "rtl" : "ltr"}
      className="flex items-start gap-2 text-sm text-gray-700"
    >
      {/* With dir="rtl" the browser places the first flex child (Check) on the
          RIGHT and the text span to its LEFT. Wrapped lines stay anchored under
          the text's right edge — no manual flex-row-reverse needed. */}
      <Check className={`h-4 w-4 shrink-0 mt-0.5 ${iconClass}`} />
      <span className="flex-1 leading-snug">
        {text}
      </span>
    </li>
  );
}

// ─── Comparison table cell helpers ──────────────────────────────────────────
// TableCellValue renders a single value cell (boolean or string).
// String values use dir="auto" so LTR strings ("50/month") stay LTR and
// Hebrew strings stay RTL regardless of the table's inherited direction.
function TableCellValue({ val }: { val: boolean | string }) {
  if (val === true)  return <Check className="w-4 h-4 text-emerald-500 mx-auto" />;
  if (val === false) return <span className="text-gray-300">—</span>;
  return <span className="text-gray-700" dir="auto">{val}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────

export function Pricing() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const { t, i18n } = useTranslation();

  const isRTL =
    (supportedLanguages[i18n.language as keyof typeof supportedLanguages]?.dir ??
      "ltr") === "rtl";

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: subscription } = useQuery<{
    subscription: { plan: string; isShopify?: boolean } | null;
  }>({
    queryKey: ["/api/subscription"],
    enabled: !!user,
  });

  const currentPlan = subscription?.subscription?.plan || "free";
  const isShopify = !!(subscription?.subscription?.isShopify);

  // Shopify plan name mapping
  const SHOPIFY_PLAN_MAP: Record<string, string> = {
    starter: 'Starter',
    pro: 'Pro',
  };

  const shopifyCheckoutMutation = useMutation({
    mutationFn: async (planId: string) => {
      const shopifyPlan = SHOPIFY_PLAN_MAP[planId];
      if (!shopifyPlan) throw new Error("Invalid plan");
      const res = await fetch("/api/shopify/billing/checkout-web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: shopifyPlan }),
        credentials: "include",
      });
      if (res.status === 401) {
        setLocation("/auth?redirect=/pricing");
        throw new Error("session_expired");
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to start billing");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.confirmationUrl) {
        window.location.href = data.confirmationUrl;
      }
      setLoadingPlan(null);
    },
    onError: (error: any) => {
      if (error.message !== "session_expired") {
        toast({
          title: "Error",
          description: error.message || "Failed to start billing",
          variant: "destructive",
        });
      }
      setLoadingPlan(null);
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
        credentials: "include",
      });
      if (res.status === 401) {
        setLocation("/auth?redirect=/pricing");
        throw new Error("session_expired");
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create checkout");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, "_blank");
        setLoadingPlan(null);
      }
    },
    onError: (error: any) => {
      if (error.message !== "session_expired") {
        toast({
          title: "Error",
          description: error.message || "Failed to start checkout",
          variant: "destructive",
        });
      }
      setLoadingPlan(null);
    },
  });

  const handleUpgrade = (planId: string) => {
    if (!user) {
      setLocation("/auth?redirect=/pricing");
      return;
    }
    if (planId === "free") return;
    setLoadingPlan(planId);
    if (isShopify) {
      shopifyCheckoutMutation.mutate(planId);
    } else {
      checkoutMutation.mutate(planId);
    }
  };

  const getPlanIndex = (planId: string) =>
    ["free", "starter", "pro"].indexOf(planId);
  const currentPlanIndex = getPlanIndex(currentPlan);
  const canAccessAIBrain =
    currentPlan === "starter" || currentPlan === "pro";

  const p = "pricingPage";

  // Comparison table rows – feature labels are already translated strings
  const compareRows: {
    feature: string;
    free: boolean | string;
    starter: boolean | string;
    pro: boolean | string;
  }[] = [
    { feature: t(`${p}.compare.activeConversations`), free: "50", starter: "500", pro: "2,000" },
    { feature: t(`${p}.compare.users`), free: "1", starter: t(`${p}.compare.upTo3`), pro: t(`${p}.compare.multiple`) },
    { feature: t(`${p}.compare.whatsappNumbers`), free: "1", starter: "1", pro: "5" },
    { feature: t(`${p}.compare.unifiedInbox`), free: true, starter: true, pro: true },
    { feature: t(`${p}.compare.crm`), free: t(`${p}.compare.basic`), starter: t(`${p}.compare.full`), pro: t(`${p}.compare.full`) },
    { feature: t(`${p}.compare.pipelineTasks`), free: true, starter: true, pro: true },
    { feature: t(`${p}.compare.aiAssistIncluded`), free: false, starter: "50/month", pro: "200/month" },
    { feature: t(`${p}.compare.aiAssistType`), free: false, starter: t(`${p}.compare.replyAndSentiment`), pro: t(`${p}.compare.enhancedAI`) },
    { feature: t(`${p}.compare.automations`), free: false, starter: t(`${p}.compare.basic`), pro: t(`${p}.compare.advanced`) },
    { feature: t(`${p}.compare.leadScoring`), free: false, starter: false, pro: true },
    { feature: t(`${p}.compare.smartRetargeting`), free: false, starter: true, pro: true },
    { feature: t(`${p}.compare.integrationsWebhooks`), free: false, starter: true, pro: true },
    { feature: t(`${p}.compare.aiBrainAddon`), free: false, starter: true, pro: true },
  ];

  return (
    // dir on the root div propagates to all children automatically.
    // We do NOT add dir again on the table — inherited is correct and avoids
    // double-application issues with overflow-x-auto scroll direction.
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className={`min-h-screen bg-gray-50 ${isRTL ? "text-right" : "text-left"}`}
    >
      <Helmet>
        <title>Pricing – Free Forever | WhachatCRM</title>
        <meta name="description" content="Simple, transparent pricing for WhatsApp CRM. Free plan forever, Starter at $19/mo, Pro at $49/mo. No hidden fees, no message markup. Start free today." />
        <link rel="canonical" href="https://whachatcrm.com/pricing" />
        <meta property="og:title" content="WhachatCRM Pricing: Free Plan Forever, Starter from $19/mo" />
        <meta property="og:description" content="Simple, transparent pricing for WhatsApp CRM. Free plan forever, Starter at $19/mo. No hidden fees." />
        <meta property="og:url" content="https://whachatcrm.com/pricing" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="WhachatCRM Pricing: Free Plan Forever" />
        <meta name="twitter:description" content="Simple pricing for WhatsApp CRM. Free plan forever, Starter at $19/mo." />
      </Helmet>

      <div className="max-w-6xl 2xl:max-w-7xl mx-auto px-4 py-10">

        <Link href={user ? "/app/settings" : "/"}>
          <a
            className={`inline-flex items-center text-sm text-gray-500 hover:text-brand-green mb-8 ${
              isRTL ? "flex-row-reverse" : ""
            }`}
          >
            <ArrowLeft
              className={`h-4 w-4 ${isRTL ? "ml-2 rotate-180" : "mr-2"}`}
            />
            {user ? t(`${p}.backSettings`) : t(`${p}.backHome`)}
          </a>
        </Link>

        {/* ─────────────── FREE TRIAL BANNER ─────────────── */}
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 mb-10 text-sm text-emerald-800" data-testid="banner-free-trial">
          <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
          <span>{t(`${p}.trialBanner`)}</span>
        </div>

        {/* ─────────────── SECTION 1: HERO ─────────────── */}
        <div className="text-center mb-14">
          <h1
            className="text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-4"
            data-testid="text-pricing-hero-title"
          >
            {t(`${p}.hero.title`)}
          </h1>
          <p className="text-lg xl:text-xl text-gray-600 max-w-2xl xl:max-w-3xl mx-auto mb-2">
            {t(`${p}.hero.subtitle`)}
          </p>
          <p className="text-sm text-gray-500 max-w-2xl mx-auto">
            {t(`${p}.hero.desc`)}
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            <span className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2 rounded-full text-sm font-medium">
              <Shield className="h-4 w-4 shrink-0" />
              {t(`${p}.hero.badge1`)}
            </span>
            <span className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-2 rounded-full text-sm font-medium">
              <Check className="h-4 w-4 shrink-0" />
              {t(`${p}.hero.badge2`)}
            </span>
            <span className="inline-flex items-center gap-2 bg-purple-50 border border-purple-200 text-purple-800 px-4 py-2 rounded-full text-sm font-medium">
              <Sparkles className="h-4 w-4 shrink-0" />
              {t(`${p}.hero.badge3`)}
            </span>
          </div>
        </div>

        {/* ─────────────── SECTION 2: COPILOT EXPLANATION ─────────────── */}
        <div className="mb-14" data-testid="section-copilot">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900 mb-3">
              {t(`${p}.copilot.title`)}
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              {t(`${p}.copilot.subtitle`)}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Starter card */}
            <div
              className="bg-white rounded-2xl border border-blue-100 p-6"
              data-testid="copilot-card-starter"
            >
              <div className="h-10 w-10 bg-blue-100 rounded-xl flex items-center justify-center mb-3">
                <MessageSquare className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1">
                {t(`${p}.copilot.starterTitle`)}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                {t(`${p}.copilot.starterDesc`)}
              </p>
              <ul className="space-y-2">
                {[
                  t(`${p}.copilot.starterF1`),
                  t(`${p}.copilot.starterF2`),
                  t(`${p}.copilot.starterF3`),
                ].map((item) => (
                  <FeatureItem
                    key={item}
                    text={item}
                    iconClass="text-blue-500"
                    isRTL={isRTL}
                  />
                ))}
              </ul>
            </div>

            {/* Pro card */}
            <div
              className="bg-white rounded-2xl border border-emerald-100 p-6"
              data-testid="copilot-card-pro"
            >
              <div className="h-10 w-10 bg-emerald-100 rounded-xl flex items-center justify-center mb-3">
                <Zap className="h-5 w-5 text-emerald-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1">
                {t(`${p}.copilot.proTitle`)}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                {t(`${p}.copilot.proDesc`)}
              </p>
              <ul className="space-y-2">
                {[
                  t(`${p}.copilot.proF1`),
                  t(`${p}.copilot.proF2`),
                  t(`${p}.copilot.proF3`),
                  t(`${p}.copilot.proF4`),
                ].map((item) => (
                  <FeatureItem
                    key={item}
                    text={item}
                    iconClass="text-emerald-500"
                    isRTL={isRTL}
                  />
                ))}
              </ul>
            </div>

            {/* AI Brain card */}
            <div
              className="bg-white rounded-2xl border border-purple-100 p-6"
              data-testid="copilot-card-ai-brain"
            >
              <div className="h-10 w-10 bg-purple-100 rounded-xl flex items-center justify-center mb-3">
                <Brain className="h-5 w-5 text-purple-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1">
                {t(`${p}.copilot.brainTitle`)}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                {t(`${p}.copilot.brainDesc`)}
              </p>
              <ul className="space-y-2">
                {[
                  t(`${p}.copilot.brainF1`),
                  t(`${p}.copilot.brainF2`),
                  t(`${p}.copilot.brainF3`),
                ].map((item) => (
                  <FeatureItem
                    key={item}
                    text={item}
                    iconClass="text-purple-500"
                    isRTL={isRTL}
                  />
                ))}
              </ul>
            </div>
          </div>

          <p className="text-xs text-gray-500 text-center mt-4">
            {t(`${p}.copilot.note`)}
          </p>
        </div>

        {/* ─────────────── SECTION 2b: USE-CASE STRIP ─────────────── */}
        <div className="mb-14" data-testid="section-use-cases">
          <h2 className="text-xl font-display font-bold text-gray-900 text-center mb-6">
            {t(`${p}.useCases.title`)}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: <Users className="h-5 w-5 text-blue-600" />,
                bg: "bg-blue-50",
                text: t(`${p}.useCases.case1`),
              },
              {
                icon: <MessageSquare className="h-5 w-5 text-emerald-600" />,
                bg: "bg-emerald-50",
                text: t(`${p}.useCases.case2`),
              },
              {
                icon: <Zap className="h-5 w-5 text-purple-600" />,
                bg: "bg-purple-50",
                text: t(`${p}.useCases.case3`),
              },
            ].map((item, i) => (
              <div
                key={i}
                className={`${item.bg} rounded-2xl p-5 flex items-start gap-4 ${
                  isRTL ? "flex-row-reverse" : ""
                }`}
              >
                <div className="shrink-0 mt-0.5">{item.icon}</div>
                <p className="text-sm font-medium text-gray-800 leading-snug" dir="auto">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ─────────────── SECTION 3: PRICING CARDS ─────────────── */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-14"
          data-testid="section-pricing-cards"
        >
          {/* FREE */}
          {(() => {
            const isCurrentPlan = currentPlan === "free";
            return (
              <div
                className="bg-white rounded-2xl border-2 border-gray-200 p-6 flex flex-col"
                data-testid="plan-card-free"
              >
                <div className="mb-5">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {t(`${p}.plans.free.name`)}
                  </span>
                  <div
                    className={`flex items-baseline gap-1 mt-1 mb-1 ${
                      isRTL ? "flex-row-reverse justify-end" : ""
                    }`}
                  >
                    <span className="text-3xl font-bold text-gray-900">
                      {t(`${p}.plans.free.price`)}
                    </span>
                    <span className="text-sm text-gray-500">
                      {t(`${p}.plans.free.period`)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {t(`${p}.plans.free.desc`)}
                  </p>
                </div>
                <ul className="space-y-3 flex-1">
                  {[
                    t(`${p}.plans.free.f1`),
                    t(`${p}.plans.free.f2`),
                    t(`${p}.plans.free.f3`),
                    t(`${p}.plans.free.f4`),
                    t(`${p}.plans.free.f5`),
                    t(`${p}.plans.free.f6`),
                    t(`${p}.plans.free.f7`),
                  ].map((f) => (
                    <FeatureItem
                      key={f}
                      text={f}
                      iconClass="text-emerald-500"
                      isRTL={isRTL}
                    />
                  ))}
                </ul>
                <p className="text-xs text-gray-400 mt-4 mb-4">
                  {t(`${p}.plans.free.upsell`)}
                </p>
                <Button
                  className="w-full bg-gray-100 text-gray-700 hover:bg-gray-200"
                  onClick={() => setLocation(user ? "/app/chats" : "/auth")}
                  disabled={isCurrentPlan}
                  data-testid="button-upgrade-free"
                >
                  {isCurrentPlan
                    ? t(`${p}.plans.currentPlan`)
                    : t(`${p}.plans.free.cta`)}
                </Button>
              </div>
            );
          })()}

          {/* STARTER */}
          {(() => {
            const isCurrentPlan = currentPlan === "starter";
            const isLoading = loadingPlan === "starter";
            return (
              <div
                className="bg-white rounded-2xl border-2 border-blue-200 p-6 flex flex-col"
                data-testid="plan-card-starter"
              >
                <div className="mb-5">
                  <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                    {t(`${p}.plans.starter.name`)}
                  </span>
                  <div
                    className={`flex items-baseline gap-1 mt-1 mb-1 ${
                      isRTL ? "flex-row-reverse justify-end" : ""
                    }`}
                  >
                    <span className="text-3xl font-bold text-gray-900">
                      {t(`${p}.plans.starter.price`)}
                    </span>
                    <span className="text-sm text-gray-500">
                      {t(`${p}.plans.starter.period`)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {t(`${p}.plans.starter.desc`)}
                  </p>
                </div>
                <ul className="space-y-3 flex-1">
                  {[
                    t(`${p}.plans.starter.f1`),
                    t(`${p}.plans.starter.f2`),
                    t(`${p}.plans.starter.f3`),
                    t(`${p}.plans.starter.f4`),
                    t(`${p}.plans.starter.f5`),
                    t(`${p}.plans.starter.f6`),
                    t(`${p}.plans.starter.f7`),
                    t(`${p}.plans.starter.f8`),
                    t(`${p}.plans.starter.f9`),
                    t(`${p}.plans.starter.f10`),
                    t(`${p}.plans.starter.f11`),
                    t(`${p}.plans.starter.f12`),
                  ].map((f) => (
                    <FeatureItem
                      key={f}
                      text={f}
                      iconClass="text-blue-500"
                      isRTL={isRTL}
                    />
                  ))}
                </ul>
                <p className="text-xs text-gray-400 mt-4 mb-2">
                  {t(`${p}.plans.starter.upsell`)}
                </p>
                <p className="text-xs font-medium text-emerald-600 mb-4 flex items-center gap-1" data-testid="text-trial-starter">
                  <span>✓</span> {t(`${p}.trialNote`)}
                </p>
                <Button
                  className={`w-full ${
                    isCurrentPlan
                      ? "bg-gray-100 text-gray-500"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                  disabled={isCurrentPlan || isLoading}
                  onClick={() => handleUpgrade("starter")}
                  data-testid="button-upgrade-starter"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isCurrentPlan ? (
                    t(`${p}.plans.currentPlan`)
                  ) : (
                    t(`${p}.plans.starter.cta`)
                  )}
                </Button>
              </div>
            );
          })()}

          {/* PRO */}
          {(() => {
            const isCurrentPlan = currentPlan === "pro";
            const isLoading = loadingPlan === "pro";
            return (
              <div
                className="bg-white rounded-2xl border-2 border-brand-green shadow-lg p-6 flex flex-col relative"
                data-testid="plan-card-pro"
              >
                {/* Badge: centred regardless of LTR/RTL */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-green text-white text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">
                  {t(`${p}.plans.pro.badge`)}
                </div>
                <div className="mb-5 mt-2">
                  <span className="text-xs font-semibold text-brand-green uppercase tracking-wider">
                    {t(`${p}.plans.pro.name`)}
                  </span>
                  <div
                    className={`flex items-baseline gap-1 mt-1 mb-1 ${
                      isRTL ? "flex-row-reverse justify-end" : ""
                    }`}
                  >
                    <span className="text-3xl font-bold text-gray-900">
                      {t(`${p}.plans.pro.price`)}
                    </span>
                    <span className="text-sm text-gray-500">
                      {t(`${p}.plans.pro.period`)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {t(`${p}.plans.pro.desc`)}
                  </p>
                </div>
                <ul className="space-y-3 flex-1">
                  {[
                    t(`${p}.plans.pro.f1`),
                    t(`${p}.plans.pro.f2`),
                    t(`${p}.plans.pro.f3`),
                    t(`${p}.plans.pro.f4`),
                    t(`${p}.plans.pro.f5`),
                    t(`${p}.plans.pro.f6`),
                    t(`${p}.plans.pro.f7`),
                    t(`${p}.plans.pro.f8`),
                    t(`${p}.plans.pro.f9`),
                    t(`${p}.plans.pro.f10`),
                    t(`${p}.plans.pro.f11`),
                    t(`${p}.plans.pro.f12`),
                  ].map((f) => (
                    <FeatureItem
                      key={f}
                      text={f}
                      iconClass="text-brand-green"
                      isRTL={isRTL}
                    />
                  ))}
                </ul>
                <p className="text-xs text-gray-400 mt-4 mb-2">
                  {t(`${p}.plans.pro.upsell`)}
                </p>
                <p className="text-xs font-medium text-emerald-600 mb-4 flex items-center gap-1" data-testid="text-trial-pro">
                  <span>✓</span> {t(`${p}.trialNote`)}
                </p>
                <Button
                  className={`w-full ${
                    isCurrentPlan
                      ? "bg-gray-100 text-gray-500"
                      : "bg-brand-green hover:bg-emerald-700 text-white"
                  }`}
                  disabled={isCurrentPlan || isLoading}
                  onClick={() => handleUpgrade("pro")}
                  data-testid="button-upgrade-pro"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isCurrentPlan ? (
                    t(`${p}.plans.currentPlan`)
                  ) : (
                    t(`${p}.plans.pro.cta`)
                  )}
                </Button>
              </div>
            );
          })()}

          {/* AI BRAIN ADD-ON */}
          <div
            className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl border-2 border-purple-200 p-6 flex flex-col"
            data-testid="plan-card-ai-brain"
          >
            <div className="mb-5">
              <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider">
                {t(`${p}.plans.aiBrain.name`)}
              </span>
              <div
                className={`flex items-baseline gap-1 mt-1 mb-1 ${
                  isRTL ? "flex-row-reverse justify-end" : ""
                }`}
              >
                <span className="text-3xl font-bold text-gray-900">
                  {t(`${p}.plans.aiBrain.price`)}
                </span>
                <span className="text-sm text-gray-500">
                  {t(`${p}.plans.aiBrain.period`)}
                </span>
              </div>
              <p className="text-sm text-gray-500">
                {t(`${p}.plans.aiBrain.desc`)}
              </p>
            </div>
            <ul className="space-y-3 flex-1">
              {[
                t(`${p}.plans.aiBrain.f1`),
                t(`${p}.plans.aiBrain.f2`),
                t(`${p}.plans.aiBrain.f3`),
                t(`${p}.plans.aiBrain.f4`),
                t(`${p}.plans.aiBrain.f5`),
              ].map((f) => (
                <FeatureItem
                  key={f}
                  text={f}
                  iconClass="text-purple-500"
                  isRTL={isRTL}
                />
              ))}
            </ul>
            <p className="text-xs text-gray-400 mt-4 mb-4">
              {t(`${p}.plans.aiBrain.upsell`)}
            </p>
            {canAccessAIBrain ? (
              <Link href="/app/ai-brain">
                <Button
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                  data-testid="button-ai-brain-go"
                >
                  <Brain className={`w-4 h-4 ${isRTL ? "ml-2" : "mr-2"}`} />
                  {t(`${p}.plans.aiBrain.ctaUnlock`)}
                </Button>
              </Link>
            ) : (
              <Button
                className="w-full bg-gray-900 hover:bg-gray-800 text-white"
                onClick={() => handleUpgrade("starter")}
                disabled={loadingPlan === "starter"}
                data-testid="button-upgrade-for-ai-brain"
              >
                {loadingPlan === "starter" && (
                  <Loader2
                    className={`w-4 h-4 animate-spin ${isRTL ? "ml-2" : "mr-2"}`}
                  />
                )}
                {t(`${p}.plans.aiBrain.ctaUpgrade`)}
              </Button>
            )}
          </div>
        </div>

        {/* ─────────────── SECTION 4: COMPARISON TABLE ─────────────── */}
        <div className="mb-14" data-testid="section-comparison-table">
          <h2 className="text-2xl font-display font-bold text-gray-900 text-center mb-8">
            {t(`${p}.compare.title`)}
          </h2>

          <div
            className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm"
            dir={isRTL ? "rtl" : "ltr"}
          >
            <table className="w-full text-sm min-w-[600px]" dir={isRTL ? "rtl" : "ltr"}>
              <thead>
                <tr className="border-b border-gray-100">
                  {/* Feature header — explicit dir so mixed labels anchor correctly */}
                  <th
                    dir={isRTL ? "rtl" : "ltr"}
                    className="py-4 px-5 font-semibold text-gray-700 w-[40%] text-start"
                  >
                    {t(`${p}.compare.feature`)}
                  </th>
                  <th className="text-center py-4 px-3 font-semibold text-gray-700">
                    {t(`${p}.plans.free.name`)}
                  </th>
                  <th className="text-center py-4 px-3 font-semibold text-blue-700">
                    {t(`${p}.plans.starter.name`)}
                  </th>
                  <th className="text-center py-4 px-3 font-semibold text-brand-green">
                    {t(`${p}.plans.pro.name`)}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {compareRows.map((row, idx) => (
                  <tr
                    key={row.feature}
                    className={idx % 2 === 0 ? "bg-gray-50/40" : ""}
                  >
                    {/* Feature cell — explicit dir="rtl" forces the correct anchor
                        even for labels that start with English ("CRM", "AI Assist…").
                        text-start resolves to right in RTL, left in LTR. */}
                    <td
                      dir={isRTL ? "rtl" : "ltr"}
                      className="py-3 px-5 font-medium text-gray-800 text-start"
                    >
                      {row.feature}
                    </td>

                    {/* Value cells: always centered.
                        dir="auto" on string values so "50/month" stays LTR
                        and Hebrew strings stay RTL. */}
                    <td className="py-3 px-3 text-center">
                      <TableCellValue val={row.free} />
                    </td>
                    <td className="py-3 px-3 text-center">
                      <TableCellValue val={row.starter} />
                    </td>
                    <td className="py-3 px-3 text-center">
                      <TableCellValue val={row.pro} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─────────────── SECTION 5: FAQ ─────────────── */}
        <div className="mb-14 max-w-3xl mx-auto" data-testid="section-faq">
          <h2 className="text-2xl font-display font-bold text-gray-900 text-center mb-8">
            {t(`${p}.faq.title`)}
          </h2>
          <div className="space-y-4">
            {[
              { q: t(`${p}.faq.q1`), a: t(`${p}.faq.a1`) },
              { q: t(`${p}.faq.q2`), a: t(`${p}.faq.a2`) },
              { q: t(`${p}.faq.q3`), a: t(`${p}.faq.a3`) },
              { q: t(`${p}.faq.q4`), a: t(`${p}.faq.a4`) },
            ].map((item, idx) => (
              <div
                key={idx}
                className="bg-white rounded-xl border border-gray-200 p-5"
              >
                {/* dir="auto": question/answer text direction auto-detected per language */}
                <p className="font-semibold text-gray-900 mb-2" dir="auto">
                  {item.q}
                </p>
                <p className="text-sm text-gray-600 leading-relaxed" dir="auto">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ─────────────── SECTION 6: FINAL CTA ─────────────── */}
        <div
          className="bg-gray-900 rounded-2xl p-8 md:p-12 text-center text-white"
          data-testid="section-final-cta"
        >
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-4">
            {t(`${p}.cta.title`)}
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto mb-8">
            {t(`${p}.cta.subtitle`)}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              className="h-12 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full"
              onClick={() => setLocation(user ? "/app/chats" : "/auth")}
              data-testid="button-cta-start-free"
            >
              {t(`${p}.cta.startFree`)}
            </Button>
            <Link href="/contact">
              <Button
                variant="outline"
                className="h-12 px-8 border-gray-700 text-gray-300 hover:bg-gray-800 rounded-full"
                data-testid="button-cta-talk-to-sales"
              >
                {t(`${p}.cta.talkSales`)}
              </Button>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
