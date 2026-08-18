import { useState, useEffect, useMemo, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { MARKETING_URL } from "@/lib/marketingUrl";
import {
  ArrowLeft, Check, Loader2, Shield, Brain,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { getCheckoutReturnPaths } from "@/lib/checkoutReturnPaths";
import { SiteFooter } from "@/components/SiteFooter";
import {
  getSubscriptionApiUrl,
  getShopifyShopHint,
  resolveShopifyShopForCheckout,
  useShopifyShopHint,
} from "@/lib/shopifyBillingHint";
import { mustUseShopifyBilling } from "@/lib/shopifyBillingContext";
import { isActiveProAiTrial as checkActiveProAiTrial, proAiTrialDaysRemaining } from "@/lib/proAiTrialState";
import {
  openShopifyManagedPricing,
  shopifyManagedPricingInstructions,
} from "@/lib/shopifyCheckout";
import { trackPricingEvent } from "@/lib/ga4Events";
import {
  buildLocalizedPricingCompareRows,
  getLocalizedAiBrainAddonHighlights,
  getLocalizedPlanPricingHighlights,
  getLocalizedPricingPage,
} from "@shared/localizeMarketingContent";
import { getCanonicalUrl, getHreflangLinks, localizePath } from "@shared/localeRoutes";
import {
  CoreCapabilitiesSection,
  PricingBottomCta,
  PricingFaqSection,
  ProspectAiCallout,
  TransparentPricingStrip,
  WhyChooseSection,
} from "@/components/pricing/PricingMarketingSections";
import { useLocalizedHref, useMarketingUrlLocale } from "@/lib/marketingLocaleRouting";
import { getDirection } from "@/lib/i18n";

// ─── Shared structural components ───────────────────────────────────────────
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
      <Check className={`h-4 w-4 shrink-0 mt-0.5 ${iconClass}`} />
      <span className="flex-1 leading-snug">{text}</span>
    </li>
  );
}

// ─── Comparison table cell helpers ──────────────────────────────────────────
// TableCellValue renders a single value cell (boolean or string).
// String values use dir="auto" so LTR plan labels stay LTR and
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
  const shopHint = useShopifyShopHint();
  const { toast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const { t, i18n } = useTranslation();
  const p = "pricingPage";
  const marketingLocale = useMarketingUrlLocale();
  const homeHref = useLocalizedHref("/");
  const pricingContent = useMemo(
    () => getLocalizedPricingPage(marketingLocale),
    [marketingLocale],
  );

  const isRTL = getDirection() === "rtl";

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const showShopifyInstallBanner = useMemo(() => {
    if (typeof window === "undefined") return false;
    const p = new URLSearchParams(window.location.search);
    return p.get("shopify_installed") === "1";
  }, []);

  const { data: subscriptionData, isLoading: subscriptionLoading } = useQuery<{
    limits: {
      plan: string;
      hasAIBrainAddon?: boolean;
      aiBrainBasePlanEligible?: boolean;
      isInTrial?: boolean;
      trialDaysRemaining?: number;
    } | null;
    subscription: {
      plan: string;
      status?: string;
      currentPeriodEnd?: string | null;
      isShopify?: boolean;
      shopifyBillingTrialDays?: number;
      trialIncludesAIBrain?: boolean;
      isPaidSubscriber?: boolean;
      trialPlan?: string | null;
      trialDaysRemaining?: number;
    } | null;
  }>({
    queryKey: ["/api/subscription", shopHint ?? ""],
    queryFn: async () => {
      const res = await fetch(getSubscriptionApiUrl(), { credentials: "include" });
      if (res.status === 401) throw new Error("401");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!user,
  });

  const limits = subscriptionData?.limits;
  const subscriptionMeta = subscriptionData?.subscription;
  const subscriptionResolved = !user || !subscriptionLoading;
  /** Effective access tier (includes Pro during pro_ai trial). */
  const effectivePlan: "free" | "starter" | "pro" | null = !subscriptionResolved
    ? null
    : limits?.plan && ["free", "starter", "pro"].includes(limits.plan)
      ? (limits.plan as "free" | "starter" | "pro")
      : "free";
  /** Paid billing tier — stays free while on unpaid pro_ai trial. */
  const billingPlan: "free" | "starter" | "pro" = useMemo(() => {
    if (!subscriptionResolved || !user) return "free";
    if (subscriptionMeta?.isPaidSubscriber) {
      return effectivePlan ?? "free";
    }
    const legacy = (subscriptionMeta?.plan || "free").toLowerCase();
    if (legacy === "starter" || legacy === "pro") return legacy;
    return "free";
  }, [subscriptionResolved, user, subscriptionMeta?.isPaidSubscriber, subscriptionMeta?.plan, effectivePlan]);

  const isActiveProAiTrial = useMemo(
    () => (!!user && subscriptionResolved ? checkActiveProAiTrial(subscriptionData) : false),
    [user, subscriptionResolved, subscriptionData],
  );

  const trialDaysRemaining = proAiTrialDaysRemaining(subscriptionData);

  const hasAIBrainAddon = limits?.hasAIBrainAddon ?? false;
  const aiBrainBasePlanEligible = limits?.aiBrainBasePlanEligible ?? false;
  const isShopify = mustUseShopifyBilling(subscriptionData?.subscription, shopHint);
  const planButtonsDisabled = !!user && subscriptionLoading;

  const compareRows = useMemo(
    () =>
      buildLocalizedPricingCompareRows(
        { includeGrowthEngines: !isShopify },
        marketingLocale,
      ),
    [isShopify, marketingLocale],
  );

  const freeHighlights = useMemo(
    () => getLocalizedPlanPricingHighlights("free", marketingLocale),
    [marketingLocale],
  );
  const starterHighlights = useMemo(
    () => getLocalizedPlanPricingHighlights("starter", marketingLocale),
    [marketingLocale],
  );
  const proHighlights = useMemo(
    () => getLocalizedPlanPricingHighlights("pro", marketingLocale),
    [marketingLocale],
  );
  const aiBrainHighlights = useMemo(
    () => getLocalizedAiBrainAddonHighlights(marketingLocale),
    [marketingLocale],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const resolved = resolveShopifyShopForCheckout(shopHint);
    console.log("[ShopifyBilling] Pricing shop context", {
      shopHint: shopHint ?? null,
      getShopifyShopHint: getShopifyShopHint() ?? null,
      resolveShopifyShopForCheckout: resolved ?? null,
      locationSearch: window.location.search,
    });
  }, [shopHint]);

  const shopifyPlanButtonLabel = (
    plan: "starter" | "pro" | "aiBrain",
    isActiveBilling: boolean,
  ): string => {
    if (isActiveBilling) return t(`${p}.shopifyManageInShopify`);
    if (plan === "starter") return t(`${p}.shopifyChooseStarter`);
    if (plan === "pro") return t(`${p}.shopifyChoosePro`);
    return t(`${p}.shopifyChooseAiBrain`);
  };

  const paidPlanButtonLabel = (
    plan: "starter" | "pro",
    isActiveBilling: boolean,
  ): string => {
    if (isActiveProAiTrial) {
      if (plan === "starter") return t(`${p}.trialState.chooseStarterAfterTrial`);
      return isShopify
        ? t(`${p}.trialState.keepProAfterTrialShopify`)
        : t(`${p}.trialState.keepProAfterTrialWeb`);
    }
    if (isActiveBilling) {
      return isShopify
        ? shopifyPlanButtonLabel(plan, true)
        : t(`${p}.plans.currentPlan`);
    }
    if (isShopify) return shopifyPlanButtonLabel(plan, false);
    return plan === "starter" ? t(`${p}.plans.starter.cta`) : t(`${p}.plans.pro.cta`);
  };

  const openShopifyPlans = async () => {
    try {
      const opened = await openShopifyManagedPricing(shopHint);
      if (!opened) {
        toast({
          title: t(`${p}.shopifyToastTitle`),
          description: t(`${p}.shopifyToastHint`),
        });
      }
    } catch (e: any) {
      if (e?.message === "session_expired") {
        setLocation(`/auth?redirect=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);
        return;
      }
      toast({
        title: t(`${p}.shopifyToastTitle`),
        description: shopifyManagedPricingInstructions(
          { error: e?.message },
          t(`${p}.shopifyManagedPricingInstructions`),
        ),
        variant: "destructive",
      });
    }
  };

  const shopifyCheckoutMutation = useMutation({
    mutationFn: async (_planId: string) => {
      await openShopifyPlans();
    },
    onSettled: () => {
      setLoadingPlan(null);
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, ...getCheckoutReturnPaths() }),
        credentials: "include",
      });
      if (res.status === 401) {
        setLocation(`/auth?redirect=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);
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
        window.location.href = data.url;
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
    trackPricingEvent("pricing_plan_cta_click", { plan: planId });
    if (!user) {
      const hint = getShopifyShopHint();
      const pricingBase = localizePath("/pricing", marketingLocale) || "/pricing";
      const pricingPath = hint ? `${pricingBase}?shop=${encodeURIComponent(hint)}` : pricingBase;
      setLocation(`/auth?redirect=${encodeURIComponent(pricingPath)}`);
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

  const [aiBrainAddonLoading, setAiBrainAddonLoading] = useState(false);

  const handleAIBrainAddonCheckout = async () => {
    trackPricingEvent("ai_brain_addon_click");
    if (!user) {
      const pricingBase = localizePath("/pricing", marketingLocale) || "/pricing";
      setLocation(`/auth?redirect=${encodeURIComponent(pricingBase)}`);
      return;
    }
    setAiBrainAddonLoading(true);
    try {
      if (isShopify) {
        await openShopifyPlans();
        return;
      }

      const response = await fetch("/api/subscription/addon/ai-brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(getCheckoutReturnPaths()),
      });
      if (response.status === 401) {
        setLocation(`/auth?redirect=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to start checkout");
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      if (error?.message === "session_expired") return;
      toast({
        title: isShopify ? t(`${p}.shopifyToastTitle`) : "Error",
        description: isShopify
          ? shopifyManagedPricingInstructions(
              { error: error?.message },
              t(`${p}.shopifyManagedPricingInstructions`),
            )
          : error.message || "Failed to start checkout",
        variant: isShopify ? "default" : "destructive",
      });
    } finally {
      setAiBrainAddonLoading(false);
    }
  };

  return (
    // dir on the root div propagates to all children automatically.
    // We do NOT add dir again on the table — inherited is correct and avoids
    // double-application issues with overflow-x-auto scroll direction.
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className={`min-h-screen bg-gray-50 overflow-x-hidden ${isRTL ? "text-right" : "text-left"}`}
    >
      <Helmet>
        <html lang={marketingLocale} dir={isRTL ? "rtl" : "ltr"} />
        <title>{pricingContent.seo.title}</title>
        <meta name="description" content={pricingContent.seo.description} />
        <link
          rel="canonical"
          href={getCanonicalUrl("/pricing", marketingLocale, MARKETING_URL) || `${MARKETING_URL}/pricing`}
        />
        {getHreflangLinks("/pricing", MARKETING_URL).map((alt) => (
          <link key={alt.hreflang} rel="alternate" hrefLang={alt.hreflang} href={alt.href} />
        ))}
        <meta property="og:title" content={pricingContent.seo.ogTitle} />
        <meta property="og:description" content={pricingContent.seo.ogDescription} />
        <meta
          property="og:url"
          content={getCanonicalUrl("/pricing", marketingLocale, MARKETING_URL) || `${MARKETING_URL}/pricing`}
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pricingContent.seo.twitterTitle} />
        <meta name="twitter:description" content={pricingContent.seo.twitterDescription} />
      </Helmet>

      <div className="max-w-6xl 2xl:max-w-7xl mx-auto px-4 py-10">

        <Link href={user ? "/app/settings" : homeHref}>
          <a
            className={`inline-flex items-center text-sm text-gray-500 hover:text-brand-green mb-8 ${
              isRTL ? "flex-row-reverse" : ""
            }`}
            data-testid="pricing-back-home"
          >
            <ArrowLeft
              className={`h-4 w-4 ${isRTL ? "ml-2 rotate-180" : "mr-2"}`}
            />
            {user ? t(`${p}.backSettings`) : t(`${p}.backHome`)}
          </a>
        </Link>

        {showShopifyInstallBanner && (
          <div
            className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"
            role="status"
            data-testid="banner-shopify-install"
          >
            {t(`${p}.shopifyInstallBanner`)}
          </div>
        )}

        {/* ─────────────── ACTIVE PRO+AI TRIAL BANNER ─────────────── */}
        {isActiveProAiTrial ? (
          <div
            className="mb-10 rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 px-6 py-5 shadow-sm"
            role="status"
            data-testid="banner-pro-ai-trial-active"
          >
            <p className="text-base font-semibold text-emerald-950 leading-snug">
              {t(`${p}.trialState.bannerHeadline`)}
            </p>
            <p className="mt-2 text-sm text-emerald-900 leading-relaxed">
              {isShopify
                ? t(`${p}.trialState.bannerBodyShopify`)
                : t(`${p}.trialState.bannerBodyWeb`)}
            </p>
            {trialDaysRemaining > 0 ? (
              <p
                className="mt-3 text-sm font-medium text-emerald-800"
                data-testid="text-trial-days-remaining"
              >
                {t(`${p}.trialState.daysRemaining`, { count: trialDaysRemaining })}
              </p>
            ) : null}
          </div>
        ) : (
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 mb-4 text-sm text-emerald-800" data-testid="banner-free-trial">
          <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
          <span>{pricingContent.trialBanner}</span>
        </div>
        )}

        <h1 className="sr-only">{pricingContent.ssr.h1}</h1>
        <TransparentPricingStrip />

        {/* ─────────────── SECTION 3: PRICING CARDS (plans only) ─────────────── */}
        <div
          className="mb-6 grid grid-cols-1 items-stretch gap-4 md:grid-cols-3"
          data-testid="section-pricing-cards"
        >
          {/* FREE */}
          {(() => {
            const isCurrentBillingPlan = billingPlan === "free" && !isActiveProAiTrial;
            return (
              <div
                className={`bg-white rounded-2xl border-2 p-5 sm:p-6 flex flex-col h-full relative ${
                  isActiveProAiTrial ? "border-gray-300" : "border-gray-200"
                }`}
                data-testid="plan-card-free"
              >
                {isActiveProAiTrial ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gray-600 text-white text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">
                    {t(`${p}.trialState.freePlanBadge`)}
                  </div>
                ) : null}
                <div className={`mb-4 ${isActiveProAiTrial ? "mt-2" : ""}`}>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {t(`${p}.plans.free.name`)}
                  </span>
                  <div
                    className={`flex items-baseline gap-1 mt-1 mb-1 ${
                      isRTL ? "justify-start" : ""
                    }`}
                    dir="ltr"
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
                <ul className="flex-1 space-y-1.5">
                  {freeHighlights.map((f) => (
                    <FeatureItem key={f} text={f} iconClass="text-emerald-500" isRTL={isRTL} />
                  ))}
                </ul>
                <div className="mt-auto pt-4 space-y-3">
                  <p className="text-xs text-gray-400">
                    {pricingContent.freeUpsell}
                  </p>
                  {isActiveProAiTrial ? (
                    <p
                      className="text-xs text-gray-600 leading-relaxed"
                      data-testid="text-free-after-trial-note"
                    >
                      {isShopify
                        ? t(`${p}.trialState.freeAfterTrialHelper`)
                        : t(`${p}.trialState.freeAfterTrialHelperWeb`)}
                    </p>
                  ) : null}
                  <Button
                    className="w-full bg-gray-100 text-gray-700 hover:bg-gray-200"
                    onClick={() => {
                      trackPricingEvent("pricing_plan_cta_click", { plan: "free" });
                      setLocation(user ? "/app/inbox" : "/auth");
                    }}
                    disabled={planButtonsDisabled || isCurrentBillingPlan || isActiveProAiTrial}
                    data-testid="button-upgrade-free"
                  >
                    {isActiveProAiTrial
                      ? t(`${p}.trialState.freePlanBadge`)
                      : isCurrentBillingPlan
                        ? t(`${p}.plans.currentPlan`)
                        : t(`${p}.plans.free.cta`)}
                  </Button>
                </div>
              </div>
            );
          })()}

          {/* STARTER */}
          {(() => {
            const isCurrentBillingPlan = billingPlan === "starter";
            const isLoading = loadingPlan === "starter";
            return (
              <div
                className="bg-white rounded-2xl border-2 border-blue-200 p-5 sm:p-6 flex flex-col h-full"
                data-testid="plan-card-starter"
              >
                <div className="mb-4">
                  <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                    {t(`${p}.plans.starter.name`)}
                  </span>
                  <div
                    className={`flex items-baseline gap-1 mt-1 mb-1 ${
                      isRTL ? "justify-start" : ""
                    }`}
                    dir="ltr"
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
                <ul className="flex-1 space-y-1.5">
                  {starterHighlights.map((f) => (
                    <FeatureItem key={f} text={f} iconClass="text-blue-500" isRTL={isRTL} />
                  ))}
                </ul>
                <div className="mt-auto pt-4 space-y-3">
                  <div
                    className="rounded-md border border-blue-100 bg-blue-50/50 px-2.5 py-2"
                    data-testid="starter-chatbot-callout"
                  >
                    <p className="flex items-start gap-1.5 text-xs font-semibold text-blue-950">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                      <span>{pricingContent.starterCallout.title}</span>
                    </p>
                    <p className="mt-0.5 pl-5 text-[11px] leading-snug text-blue-900/75">
                      {pricingContent.starterCallout.body}
                    </p>
                  </div>
                  <p className="text-xs font-medium text-emerald-700 flex items-start gap-1" data-testid="text-trial-starter">
                    <span className="shrink-0">✓</span>{" "}
                    <span>
                      {isActiveProAiTrial
                        ? t(`${p}.trialState.chooseStarterAfterTrial`)
                        : pricingContent.trialBanner}
                    </span>
                  </p>
                  <Button
                    className={`w-full ${
                      isCurrentBillingPlan && !isShopify
                        ? "bg-gray-100 text-gray-500"
                        : isCurrentBillingPlan && isShopify
                          ? "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                          : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                    disabled={planButtonsDisabled || (isCurrentBillingPlan && !isShopify) || isLoading}
                    onClick={() => handleUpgrade("starter")}
                    data-testid="button-upgrade-starter"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      paidPlanButtonLabel("starter", isCurrentBillingPlan)
                    )}
                  </Button>
                </div>
              </div>
            );
          })()}

          {/* PRO */}
          {(() => {
            const isCurrentBillingPlan = billingPlan === "pro";
            const isLoading = loadingPlan === "pro";
            return (
              <div
                className={`bg-white rounded-2xl border-2 p-5 sm:p-6 flex flex-col h-full relative ${
                  isActiveProAiTrial
                    ? "border-brand-green shadow-lg ring-1 ring-emerald-200"
                    : "border-brand-green shadow-lg ring-1 ring-emerald-100"
                }`}
                data-testid="plan-card-pro"
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-green text-white text-xs font-bold tracking-wide px-3.5 py-1 rounded-full whitespace-nowrap shadow-sm">
                  {isActiveProAiTrial
                    ? t(`${p}.trialState.proTrialPlanBadge`)
                    : pricingContent.proBadge}
                </div>
                <div className="mb-4 mt-2">
                  <span className="text-xs font-semibold text-brand-green uppercase tracking-wider">
                    {t(`${p}.plans.pro.name`)}
                  </span>
                  <div
                    className={`flex items-baseline gap-1 mt-1 mb-1 ${
                      isRTL ? "justify-start" : ""
                    }`}
                    dir="ltr"
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
                {isActiveProAiTrial ? (
                  <p className="mb-3 text-xs font-medium text-brand-green">
                    {t(`${p}.trialState.proTrialHelper`)}
                  </p>
                ) : null}
                <ul className="flex-1 space-y-1.5">
                  {proHighlights.map((f) => (
                    <FeatureItem key={f} text={f} iconClass="text-brand-green" isRTL={isRTL} />
                  ))}
                </ul>
                <div className="mt-auto pt-4 space-y-3">
                  <div
                    className="rounded-md border border-emerald-200/80 bg-emerald-50/40 px-2.5 py-2"
                    data-testid="pro-growth-engines-callout"
                  >
                    <p className="flex items-start gap-1.5 text-xs font-semibold text-emerald-950">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-green" />
                      <span>{pricingContent.proCallout.title}</span>
                    </p>
                    <p className="mt-0.5 pl-5 text-[11px] leading-snug text-emerald-900/80">
                      {pricingContent.proCallout.body}
                    </p>
                  </div>
                  {!isActiveProAiTrial ? (
                    <p className="text-xs font-medium text-emerald-700 flex items-start gap-1" data-testid="text-trial-pro">
                      <span className="shrink-0">✓</span>
                      <span>{pricingContent.trialBanner}</span>
                    </p>
                  ) : null}
                  <Button
                    className={`w-full ${
                      isCurrentBillingPlan && !isShopify && !isActiveProAiTrial
                        ? "bg-gray-100 text-gray-500"
                        : isCurrentBillingPlan && isShopify && !isActiveProAiTrial
                          ? "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                          : "bg-brand-green hover:bg-emerald-700 text-white"
                    }`}
                    disabled={
                      planButtonsDisabled ||
                      (isCurrentBillingPlan && !isShopify && !isActiveProAiTrial) ||
                      isLoading
                    }
                    onClick={() => handleUpgrade("pro")}
                    data-testid="button-upgrade-pro"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      paidPlanButtonLabel("pro", isCurrentBillingPlan)
                    )}
                  </Button>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ─────────────── OPTIONAL ADD-ON: AI BRAIN ─────────────── */}
        <section className="mb-8" data-testid="section-optional-addon">
          <div className="mb-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">
              {pricingContent.aiBrain.badge}
            </p>
            <h2 className="mt-1 font-display text-xl font-bold text-gray-900 sm:text-2xl">
              {pricingContent.aiBrain.title}
            </h2>
            <p className="mx-auto mt-1 max-w-xl text-sm text-gray-600">
              {pricingContent.aiBrain.intro}
            </p>
          </div>
          <div
            className="mx-auto max-w-3xl bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl border-2 border-purple-200 p-6 sm:p-7"
            data-testid="plan-card-ai-brain"
          >
            <div className="flex flex-col gap-6 sm:flex-row sm:items-stretch">
              <div className="sm:w-[42%] sm:shrink-0">
                <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider">
                  {t(`${p}.plans.aiBrain.name`)}
                </span>
                <div
                  className={`flex items-baseline gap-1 mt-1 mb-1 ${
                    isRTL ? "justify-start" : ""
                  }`}
                  dir="ltr"
                >
                  <span className="text-3xl font-bold text-gray-900">
                    {t(`${p}.plans.aiBrain.price`)}
                  </span>
                  <span className="text-sm text-gray-500">
                    {t(`${p}.plans.aiBrain.period`)}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  {pricingContent.aiBrain.cardDesc}
                </p>
                <p className="text-xs font-medium text-purple-700 mt-3 mb-1 flex items-center gap-1" dir={isRTL ? "rtl" : "ltr"}>
                  <Shield className="w-3 h-3 shrink-0" />
                  {isActiveProAiTrial
                    ? t(`${p}.trialState.aiBrainIncludedInTrial`)
                    : t(`${p}.aiBrainNote`)}
                </p>
                {isActiveProAiTrial ? (
                  <p
                    className="text-xs text-purple-800/90 mb-3 leading-relaxed"
                    data-testid="text-ai-brain-trial-helper"
                  >
                    {t(`${p}.trialState.aiBrainTrialHelper`)}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 mb-4">
                    {t(`${p}.plans.aiBrain.upsell`)}
                  </p>
                )}
                {!subscriptionResolved ? (
                  <Button className="w-full bg-gray-200 text-gray-500" disabled data-testid="button-ai-brain-loading">
                    <Loader2 className={`w-4 h-4 animate-spin ${isRTL ? "ml-2" : "mr-2"}`} />
                  </Button>
                ) : hasAIBrainAddon ? (
                  <Link href="/app/ai-brain">
                    <Button
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                      data-testid="button-ai-brain-go"
                    >
                      <Brain className={`w-4 h-4 ${isRTL ? "ml-2" : "mr-2"}`} />
                      {t(`${p}.plans.aiBrain.ctaOpenBrain`)}
                    </Button>
                  </Link>
                ) : isActiveProAiTrial && isShopify ? (
                  <Button
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={handleAIBrainAddonCheckout}
                    disabled={aiBrainAddonLoading || planButtonsDisabled}
                    data-testid="button-ai-brain-addon-checkout"
                  >
                    {aiBrainAddonLoading ? (
                      <Loader2 className={`w-4 h-4 animate-spin ${isRTL ? "ml-2" : "mr-2"}`} />
                    ) : null}
                    {shopifyPlanButtonLabel("aiBrain", false)}
                  </Button>
                ) : aiBrainBasePlanEligible ? (
                  <Button
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={handleAIBrainAddonCheckout}
                    disabled={aiBrainAddonLoading || planButtonsDisabled}
                    data-testid="button-ai-brain-addon-checkout"
                  >
                    {aiBrainAddonLoading ? (
                      <Loader2 className={`w-4 h-4 animate-spin ${isRTL ? "ml-2" : "mr-2"}`} />
                    ) : null}
                    {isShopify ? shopifyPlanButtonLabel("aiBrain", false) : t(`${p}.plans.aiBrain.ctaUnlock`)}
                  </Button>
                ) : (
                  <Button
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={() => handleUpgrade("starter")}
                    disabled={planButtonsDisabled || loadingPlan === "starter"}
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
              <ul className="flex-1 space-y-1.5 sm:border-l sm:border-purple-200/80 sm:pl-8">
                {aiBrainHighlights.map((f) => (
                  <FeatureItem key={f} text={f} iconClass="text-purple-500" isRTL={isRTL} />
                ))}
              </ul>
            </div>
          </div>
        </section>

        {isShopify ? (
          <p
            className="mx-auto mb-8 max-w-2xl px-4 text-center text-sm leading-relaxed text-gray-600"
            data-testid="text-shopify-billing-note"
          >
            {t(`${p}.trialState.shopifyBillingNote`)}
          </p>
        ) : null}

        <ProspectAiCallout loggedIn={!!user} />
        <CoreCapabilitiesSection />
        <WhyChooseSection />

        {/* ─────────────── COMPARISON TABLE ─────────────── */}
        <div className="mb-12" data-testid="section-comparison-table">
          <h2 className="mb-6 text-center font-display text-2xl font-bold text-gray-900">
            {pricingContent.compareTitle}
          </h2>
          <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="w-[40%] px-5 py-4 text-start font-semibold text-gray-700">
                    {pricingContent.featureColumnHeader}
                  </th>
                  <th className="px-3 py-4 text-center font-semibold text-gray-700">Free</th>
                  <th className="px-3 py-4 text-center font-semibold text-blue-700">Starter</th>
                  <th className="px-3 py-4 text-center font-semibold text-brand-green">Pro</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row, idx) => {
                  const prevGroup = idx > 0 ? compareRows[idx - 1]!.group : null;
                  const showGroup = row.group !== prevGroup;
                  return (
                    <Fragment key={row.featureKey}>
                      {showGroup ? (
                        <tr className="bg-gray-100/80">
                          <td
                            colSpan={4}
                            className="px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500"
                          >
                            {pricingContent.compareGroups[row.group] || row.group}
                          </td>
                        </tr>
                      ) : null}
                      <tr className={idx % 2 === 0 ? "bg-gray-50/40" : ""}>
                        <td
                          className="px-5 py-3 text-start font-medium text-gray-800"
                          title={pricingContent.compareHints[row.featureKey]}
                        >
                          <span className="inline-flex flex-col gap-0.5">
                            <span>{pricingContent.compareLabels[row.featureKey] || row.featureKey}</span>
                            {pricingContent.compareHints[row.featureKey] ? (
                              <span className="text-[10px] font-normal leading-snug text-gray-500">
                                {pricingContent.compareHints[row.featureKey]}
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <TableCellValue val={row.free} />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <TableCellValue val={row.starter} />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <TableCellValue val={row.pro} />
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <PricingFaqSection />

        <PricingBottomCta
          onStartFree={() => setLocation(user ? "/app/inbox" : "/auth")}
        />

      </div>
      <SiteFooter />
    </div>
  );
}
