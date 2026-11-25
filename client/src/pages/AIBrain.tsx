import { AiTestChat } from "@/components/AiTestChat";
import { useEcommercePilot } from "@/lib/ecommercePilot";
import { useState, useEffect, useMemo, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import debounce from "lodash/debounce";
import {
  Brain,
  Sparkles,
  Loader2,
  X,
  Lock,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { getCheckoutReturnPaths } from "@/lib/checkoutReturnPaths";
import { getSubscriptionApiUrl, useShopifyShopHint } from "@/lib/shopifyBillingHint";
import { useHideGrowthEngineForShopify } from "@/lib/shopifyMerchantExperience";
import { mustUseShopifyBilling } from "@/lib/shopifyBillingContext";
import {
  openShopifyManagedPricing,
  shopifyManagedPricingInstructions,
} from "@/lib/shopifyCheckout";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { InAppProUpgradeButton } from "@/components/InAppProUpgradeButton";
import { BusinessKnowledgeSteps } from "@/components/aibrain/BusinessKnowledgeSteps";
import { MarketingMaterialsSettings } from "@/components/aibrain/MarketingMaterialsSettings";
import {
  CustomerQuestions,
  type CustomerQuestion,
} from "@/components/aibrain/CustomerQuestions";

interface AISettings {
  aiMode: string;
  handoffKeywords: string[];
  aiPersona: string;
  webchatServerAi?: {
    rolloutEnabled?: boolean;
    allowlisted?: boolean;
    unattendedEligible?: boolean;
  };
}

interface BusinessKnowledge {
  businessName: string;
  industry: string;
  servicesProducts: string;
  bookingLink: string;
  /** From GET /api/ai/business-knowledge — Calendly integration with primary scheduling URL. */
  calendlyBookingConnected?: boolean;
  customInstructions: string;
  qualifyingQuestions: CustomerQuestion[];
}

interface SubscriptionData {
  limits: {
    plan: string;
    planName: string;
    isInTrial?: boolean;
    hasAIBrainAddon?: boolean;
    effectiveHasAIBrain?: boolean;
    effectivePlan?: string;
    aiBrainSource?: string;
    trialDaysRemaining?: number;
    trialEndsAt?: string | null;
  };
  subscription?: {
    plan: string;
    isShopify?: boolean;
    trialStatus?: string;
    trialIncludesAIBrain?: boolean;
    trialEndsAt?: string | null;
    trialDaysRemaining?: number;
    canStartInternalTrial?: boolean;
    isPaidSubscriber?: boolean;
  };
}

const AI_MODE_SEGMENTS = [
  { value: "off", labelKey: "brain3d.off", tooltipKey: "brain3d.modeOffHelp" },
  { value: "suggest_only", labelKey: "brain3d.suggest", tooltipKey: "brain3d.modeSuggestHelp" },
  { value: "full_auto", labelKey: "brain3d.auto", tooltipKey: "brain3d.modeAutoHelp" },
] as const;

const INDUSTRY_OPTIONS = [
  { value: "real_estate", labelKey: "brain3d.realEstate" },
  { value: "travel", labelKey: "brain3d.travel" },
  { value: "contractor", labelKey: "brain3d.contractor" },
  { value: "ecommerce", labelKey: "brain3d.ecommerce" },
  { value: "healthcare", labelKey: "brain3d.healthcare" },
  { value: "education", labelKey: "brain3d.education" },
  { value: "finance", labelKey: "brain3d.finance" },
  { value: "hospitality", labelKey: "brain3d.hospitality" },
  { value: "automotive", labelKey: "brain3d.automotive" },
  { value: "other", labelKey: "brain3d.other" },
] as const;

/** Premium intelligence layer — business context, not quota marketing. */
const AI_BRAIN_HIGHLIGHTS = [
  "brain3d.premiumLayer",
  "brain3d.knowledge",
  "brain3d.qualification",
  "brain3d.leadScoring",
  "brain3d.copilot",
  "brain3d.automation",
  "brain3d.handoffRules",
  "brain3d.growth",
] as const;

function assistTierLabel(plan: string, trialProAi: boolean): string {
  if (trialProAi || plan === "pro" || plan === "enterprise") return "brain3d.assistPro";
  if (plan === "starter") return "brain3d.assistBasic";
  return "brain3d.assist";
}

/** No numeric limits — product copy only. */
function assistPlanBullets(plan: string, trialProAi: boolean): string[] {
  if (trialProAi) {
    return [
      "brain3d.trialReplies",
      "brain3d.trialInbox",
      "brain3d.trialModes",
      "brain3d.trialDecisions",
    ];
  }
  if (plan === "starter") {
    return [
      "brain3d.starterReplies",
      "brain3d.starterInbox",
      "brain3d.starterMode",
      "brain3d.starterAutomation",
    ];
  }
  if (plan === "pro" || plan === "enterprise") {
    return [
      "brain3d.proReplies",
      "brain3d.proInbox",
      "brain3d.proModes",
      "brain3d.proAutomation",
    ];
  }
  return [];
}

function LockedFeatureTeaser({
  title,
  description,
  preview,
}: {
  title: string;
  description: string;
  preview?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "group relative flex min-h-[176px] flex-col overflow-hidden rounded-2xl border border-violet-200/55",
        "bg-gradient-to-br from-white via-violet-50/35 to-purple-50/25",
        "p-6 shadow-md shadow-violet-500/[0.07] ring-1 ring-white/80",
        "transition-all duration-200 hover:border-violet-300/60 hover:shadow-lg hover:shadow-violet-500/12",
      )}
    >
      <span
        className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200/80 bg-white/90 text-violet-500 shadow-sm"
        title={t("brain3d.unlock")}
        aria-hidden
      >
        <Lock className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
      <h3 className="pr-12 text-base font-semibold tracking-tight text-violet-950">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-700">{description}</p>
      {preview ? (
        <p className="mt-3 rounded-xl border border-violet-100/90 bg-white/80 px-3.5 py-2.5 text-xs font-medium leading-snug text-violet-900/80">
          {preview}
        </p>
      ) : null}
    </div>
  );
}

function AIBrainContent() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Keep internal test conversations out of merchant-facing AI Brain.
  const { available: privatePilot } = useEcommercePilot();
  const shopHint = useShopifyShopHint();
  const hideGrowthEngine = useHideGrowthEngineForShopify();
  const aiBrainHighlights = useMemo(
    () =>
      hideGrowthEngine
        ? AI_BRAIN_HIGHLIGHTS.filter((h) => h !== "brain3d.growth")
        : [...AI_BRAIN_HIGHLIGHTS],
    [hideGrowthEngine],
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const lastKnowledgeSentRef = useRef<string | null>(null);
  const knowledgeHydratedRef = useRef(false);
  
  const { data: subscription, isLoading: subscriptionLoading } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscription", shopHint ?? ""],
    queryFn: async () => {
      const res = await fetch(getSubscriptionApiUrl(), { credentials: "include" });
      if (res.status === 401) throw new Error("401");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const limits = subscription?.limits;
  const plan = (limits?.plan || limits?.effectivePlan || "free") as string;
  const isPro = plan === "pro" || plan === "enterprise";
  const isStarter = plan === "starter";
  /** Starter / Pro (effective), including unpaid Pro + AI trial window. */
  const hasAIAssist = isStarter || isPro;
  /** Paid add-on OR trial / manual / demo — same field the API names `effectiveHasAIBrain`. */
  const effectiveHasAIBrain = !!(limits?.effectiveHasAIBrain ?? limits?.hasAIBrainAddon);
  const subMeta = subscription?.subscription;
  const trialStatus = subMeta?.trialStatus;
  const trialIncludesAIBrain = !!subMeta?.trialIncludesAIBrain;
  const isInTrial = !!limits?.isInTrial && trialStatus !== "expired";
  const showTrialFullSuite = isInTrial && trialIncludesAIBrain && effectiveHasAIBrain;

  const [settings, setSettings] = useState<AISettings>({
    aiMode: "suggest_only",
    handoffKeywords: ["call me", "human", "agent", "speak to someone"],
    aiPersona: "professional",
  });
  const [knowledge, setKnowledge] = useState<BusinessKnowledge>({
    businessName: "",
    industry: "",
    servicesProducts: "",
    bookingLink: "",
    calendlyBookingConnected: false,
    customInstructions: "",
    qualifyingQuestions: [],
  });
  const [newKeyword, setNewKeyword] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const isShopify = mustUseShopifyBilling(subscription?.subscription, shopHint);

  const handleProCheckout = async () => {
    setIsCheckingOut(true);
    try {
      if (isShopify) {
        const opened = await openShopifyManagedPricing(shopHint);
        if (!opened) {
          toast({
            title: t("brain3d.chooseShopify"),
            description:
              t("brain3d.checkoutInstructions"),
          });
        }
        return;
      }

      const response = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planId: "pro", billingInterval: "monthly", ...getCheckoutReturnPaths() }),
      });
      if (response.status === 401) {
        window.location.href = `/auth?redirect=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
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
      if (error.message === "session_expired") return;
      toast({
        title: isShopify ? t("brain3d.chooseShopify") : t("brain3d.checkoutError"),
        description: isShopify
          ? shopifyManagedPricingInstructions(
              { error: error?.message },
              t("brain3d.checkoutInstructions"),
            )
          : error.message || t("brain3d.checkoutRetry"),
        variant: isShopify ? "default" : "destructive",
      });
    } finally {
      setIsCheckingOut(false);
    }
  };
  
  // AI settings query - enabled for anyone with AI access (AI Assist or Full AI Brain)
  const { data: aiSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ["/api/ai/settings"],
    enabled: !subscriptionLoading && (hasAIAssist || effectiveHasAIBrain),
    retry: false,
  });

  const { data: businessKnowledge, isLoading: knowledgeLoading } = useQuery({
    queryKey: ["/api/ai/business-knowledge"],
    enabled: !subscriptionLoading && effectiveHasAIBrain,
    retry: false,
  });
  
  useEffect(() => {
    if (aiSettings && typeof aiSettings === 'object') {
      const s = aiSettings as AISettings;
      setSettings({
        aiMode: s.aiMode || "suggest_only",
        handoffKeywords: s.handoffKeywords || ["call me", "human", "agent", "speak to someone"],
        aiPersona: s.aiPersona || "professional",
      });
    }
  }, [aiSettings]);

  useEffect(() => {
    if (businessKnowledge && typeof businessKnowledge === "object") {
      const k = businessKnowledge as BusinessKnowledge;
      const next: BusinessKnowledge = {
        businessName: k.businessName || "",
        industry: k.industry || "",
        servicesProducts: k.servicesProducts || "",
        bookingLink: "",
        calendlyBookingConnected: typeof k.calendlyBookingConnected === "boolean" ? k.calendlyBookingConnected : false,
        customInstructions: k.customInstructions || "",
        qualifyingQuestions: (k.qualifyingQuestions || []).map((q: any, i: number) => ({
          key: q.key || `q_${i}`,
          label: q.label || `Question ${i + 1}`,
          question: q.question || "",
          required: q.required ?? true,
          // Only an explicit false turns a question off, so rows saved before this existed
          // stay in use.
          enabled: q.enabled !== false,
        })),
      };
      setKnowledge(next);
      lastKnowledgeSentRef.current = JSON.stringify(next);
      knowledgeHydratedRef.current = true;
    }
  }, [businessKnowledge]);

  const saveSettingsMutation = useMutation({
    mutationFn: async (data: Partial<AISettings>) => {
      const res = await fetch("/api/ai/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/workspace-intelligence"] });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("brain3d.settingsError"), variant: "destructive" });
    },
  });

  const saveKnowledgeMutation = useMutation({
    mutationFn: async (data: Partial<BusinessKnowledge>) => {
      const res = await fetch("/api/ai/business-knowledge", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save knowledge");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/business-knowledge"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/workspace-intelligence"] });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("brain3d.saveError"), variant: "destructive" });
    },
  });

  const debouncedPersistKnowledge = useMemo(
    () =>
      debounce((payload: BusinessKnowledge) => {
        const { bookingLink: _b, calendlyBookingConnected: _c, ...persistable } = payload;
        saveKnowledgeMutation.mutate(
          { ...persistable, bookingLink: "" },
          {
            onSuccess: () => {
              lastKnowledgeSentRef.current = JSON.stringify({
                ...payload,
                bookingLink: "",
              });
            },
          }
        );
      }, 750),
    [saveKnowledgeMutation],
  );

  useEffect(() => () => debouncedPersistKnowledge.cancel(), [debouncedPersistKnowledge]);

  useEffect(() => {
    if (!effectiveHasAIBrain || knowledgeLoading || !knowledgeHydratedRef.current) return;
    const snapshot = JSON.stringify(knowledge);
    if (snapshot === lastKnowledgeSentRef.current) return;
    debouncedPersistKnowledge(knowledge);
  }, [knowledge, effectiveHasAIBrain, knowledgeLoading, debouncedPersistKnowledge]);

  const handleAddKeyword = () => {
    if (newKeyword && !settings.handoffKeywords.includes(newKeyword)) {
      const handoffKeywords = [...settings.handoffKeywords, newKeyword];
      setSettings((prev) => ({ ...prev, handoffKeywords }));
      setNewKeyword("");
      saveSettingsMutation.mutate({ handoffKeywords });
    }
  };
  
  const handleRemoveKeyword = (keyword: string) => {
    const handoffKeywords = settings.handoffKeywords.filter((k) => k !== keyword);
    setSettings((prev) => ({ ...prev, handoffKeywords }));
    saveSettingsMutation.mutate({ handoffKeywords });
  };
  
  
  if (subscriptionLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-b from-violet-50/40 to-white">
        <Loader2 className="h-9 w-9 animate-spin text-violet-500" />
      </div>
    );
  }

  // No paid (or trial) tier — AI Assist is not available on Free; AI Brain requires Starter/Pro first.
  if (!hasAIAssist && !effectiveHasAIBrain) {
    const ltrBrand = (className?: string) => (
      <bdi dir="ltr" className={className} />
    );
    return (
      <div
        className="h-full overflow-y-auto bg-gradient-to-b from-violet-50/50 via-slate-50/90 to-white p-6 sm:p-10"
        data-testid="ai-workspace-locked"
      >
        <div className="mx-auto max-w-lg space-y-10 py-10">
          <div className="space-y-5 text-center">
            <div className="relative mx-auto w-fit">
              <div className="absolute -inset-2 rounded-3xl bg-gradient-to-br from-violet-400/20 to-emerald-400/15 blur-lg" aria-hidden />
              <div className="relative flex h-16 w-16 items-center justify-center gap-0.5 rounded-2xl border border-violet-100/90 bg-white shadow-md shadow-violet-500/10">
                <Sparkles className="h-7 w-7 text-violet-600" aria-hidden />
                <Brain className="h-6 w-6 text-purple-600" aria-hidden />
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-600">
                <bdi dir="ltr">WhachatCRM</bdi>
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                {t("aiBrain.workspace.title")}
              </h1>
            </div>
            <div className="mx-auto max-w-md space-y-3 text-start text-sm leading-relaxed text-slate-600">
              <p className="font-medium text-slate-900">{t("aiBrain.workspace.valueLead")}</p>
              <p>
                <Trans
                  i18nKey="aiBrain.workspace.assistLine"
                  components={{ assist: ltrBrand("font-medium text-slate-900") }}
                />
              </p>
              <p>
                <Trans
                  i18nKey="aiBrain.workspace.brainGoesFurther"
                  components={{ brain: ltrBrand("font-medium text-violet-900") }}
                />
              </p>
              <p>
                <Trans
                  i18nKey="aiBrain.workspace.brainSalesTeam"
                  components={{
                    brain: ltrBrand("font-medium text-violet-900"),
                    team: ltrBrand(),
                  }}
                />
              </p>
              <p>
                <Trans
                  i18nKey="aiBrain.workspace.brainContext"
                  components={{ brand: ltrBrand() }}
                />
              </p>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-violet-100/80 bg-white/95 p-7 shadow-lg shadow-violet-500/[0.06] ring-1 ring-slate-200/40">
            <h2 className="text-base font-semibold tracking-tight text-slate-900">
              {t("aiBrain.workspace.readyHeadline")}
            </h2>
            <p className="text-start text-sm leading-relaxed text-slate-600">
              <Trans
                i18nKey="aiBrain.workspace.readyBody"
                components={{
                  starter: ltrBrand("font-medium text-slate-900"),
                  pro: ltrBrand("font-medium text-slate-900"),
                  assist: ltrBrand("font-medium text-slate-900"),
                  brain: ltrBrand("font-medium text-violet-900"),
                }}
              />
            </p>
            <InAppProUpgradeButton
              canStartInternalTrial={!!subMeta?.canStartInternalTrial}
              isShopify={isShopify}
              className="h-11 w-full rounded-full border-0 bg-gradient-to-r from-violet-600 to-purple-600 text-[15px] font-semibold text-white shadow-md shadow-violet-500/25 hover:from-violet-500 hover:to-purple-500 focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:ring-offset-2"
              testId="button-ai-workspace-choose-plan"
            />
          </div>
        </div>
      </div>
    );
  }

  if (settingsLoading || (effectiveHasAIBrain && knowledgeLoading)) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-b from-violet-50/40 to-white">
        <Loader2 className="h-9 w-9 animate-spin text-violet-500" />
      </div>
    );
  }
  
  const segmentTabClass = (selected: boolean) =>
    cn(
      "box-border h-9 min-h-[2.25rem] shrink-0 px-3.5 rounded-lg border border-solid text-sm font-medium transition-colors duration-150 ease-out",
      selected
        ? "bg-brand-green/10 text-emerald-900 border-brand-green/45"
        : "border-slate-200/90 bg-white text-slate-700 hover:border-violet-200/70 hover:bg-violet-50/40 hover:text-violet-950",
      saveSettingsMutation.isPending && "pointer-events-none cursor-wait",
    );

  /**
   * Step 1 opens with these. They persist as you type, unlike the pages below them, so the
   * label says so rather than adding a second save button next to the one publish action.
   */
  const businessProfileFields = (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("workspaceUi.aboutBusiness")}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="biz-name" className="text-xs font-medium text-muted-foreground">
            {t("workspaceUi.businessName")}
          </Label>
          <Input
            id="biz-name"
            className="h-9 text-sm"
            value={knowledge.businessName}
            onChange={(e) => setKnowledge((prev) => ({ ...prev, businessName: e.target.value }))}
            placeholder="Acme Co."
            data-testid="input-business-name"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">{t("aiBrain.industry")}</Label>
          <Select
            value={knowledge.industry || undefined}
            onValueChange={(value) => setKnowledge((prev) => ({ ...prev, industry: value }))}
          >
            <SelectTrigger className="h-9 text-sm" data-testid="select-industry">
              <SelectValue placeholder={t("workspaceUi.selectIndustry")} />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="services" className="text-xs font-medium text-muted-foreground">
          {t("workspaceUi.services")}
        </Label>
        <Textarea
          id="services"
          className="text-sm min-h-[72px] max-h-28 resize-y"
          rows={2}
          value={knowledge.servicesProducts}
          onChange={(e) => setKnowledge((prev) => ({ ...prev, servicesProducts: e.target.value }))}
          placeholder={t("workspaceUi.offerSummary")}
          data-testid="textarea-services-products"
        />
        <p className="text-xs text-slate-500">{t("workspaceUi.autoSave")}</p>
      </div>
    </div>
  );

  const assistBullets = assistPlanBullets(plan, showTrialFullSuite);
  const assistTier = assistTierLabel(plan, showTrialFullSuite);
  const showBrainUpgradeSection = hasAIAssist && !effectiveHasAIBrain;
  const hidePaidBrainCta = isInTrial && trialIncludesAIBrain && effectiveHasAIBrain;
  const starterOnly = isStarter && !isPro;
  const autoModeLocked = !effectiveHasAIBrain;

  return (
    <div
      className="h-full overflow-y-auto overflow-x-hidden bg-gradient-to-b from-violet-50/50 via-slate-50/95 to-white"
      data-testid="ai-workspace-active"
    >
      <div className="p-6 sm:p-10 max-w-[800px] mx-auto w-full space-y-9 pb-28">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <div className="relative shrink-0">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-violet-400/25 via-purple-400/15 to-emerald-400/20 blur-md" aria-hidden />
              <div className="relative flex h-14 w-14 items-center justify-center gap-0.5 rounded-2xl border border-violet-100/90 bg-gradient-to-br from-white to-violet-50/70 shadow-sm shadow-violet-500/10">
                <Sparkles className="h-6 w-6 text-violet-600" aria-hidden />
                <Brain className="h-5 w-5 text-purple-600" aria-hidden />
              </div>
            </div>
            <div className="min-w-0 space-y-2 pt-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-600/90">WhachatCRM</p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.65rem]">{t("workspaceUi.workspace")}</h1>
              {effectiveHasAIBrain && privatePilot && <AiTestChat/>}
              <div className="max-w-lg text-sm leading-relaxed text-slate-600">
                <p>
                  <span className="font-medium text-slate-900">AI Assist</span> {t("brain3d.assistIncluded")}
                </p>
                <p className="mt-1.5">
                  <span className="font-medium text-violet-900">{t("aiBrain.title")}</span> {t("brain3d.premium")}
                </p>
              </div>
              {showTrialFullSuite && (
                <p className="text-sm text-violet-700/90">
                  {t("brain3d.trial")}
                </p>
              )}
              {effectiveHasAIBrain && !showTrialFullSuite && (
                <p className="text-sm text-emerald-800/90">{t("brain3d.active")}</p>
              )}
            </div>
          </div>
          {effectiveHasAIBrain && saveKnowledgeMutation.isPending && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-100/90 bg-white/90 px-3 py-1 text-xs font-medium text-violet-800 shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" aria-hidden />
              {t("workspaceUi.saving")}
            </span>
          )}
        </header>

        <Card className="overflow-hidden rounded-2xl border-0 bg-white/95 shadow-md shadow-slate-900/[0.04] ring-1 ring-violet-100/40 ring-offset-0">
          <div className="h-0.5 bg-gradient-to-r from-violet-400/50 via-brand-green/40 to-emerald-400/40" aria-hidden />
          <CardHeader className="pb-2 pt-5 space-y-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <CardTitle className="text-lg font-semibold text-slate-900 tracking-tight">AI Assist</CardTitle>
              <span className="rounded-full border border-violet-100 bg-violet-50/90 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-800">
                {t(assistTier)}
              </span>
            </div>
            <CardDescription className="text-slate-500 text-sm">
              {limits?.planName ?? t("brain3d.yourPlan")} {t("brain3d.included")}
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-6 pt-0">
            <ul className="text-sm text-slate-600 space-y-2">
              {assistBullets.map((line) => (
                <li key={t(line)} className="flex gap-2.5">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400/80" aria-hidden />
                  <span>{t(line)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {showBrainUpgradeSection && (
          <Card className="overflow-hidden rounded-2xl border-0 bg-gradient-to-br from-white via-violet-50/35 to-purple-50/30 shadow-lg shadow-violet-500/[0.08] ring-1 ring-violet-200/45">
            <div className="h-1 bg-gradient-to-r from-violet-500/70 via-purple-500/50 to-fuchsia-400/40" aria-hidden />
            <CardHeader className="space-y-2 pb-2 pt-6">
              <div className="flex items-center gap-2">
                <Brain className="h-6 w-6 text-violet-600 drop-shadow-sm" aria-hidden />
                <CardTitle className="text-lg font-semibold tracking-tight text-violet-950">{t("aiBrain.title")}</CardTitle>
              </div>
              <CardDescription className="text-base leading-relaxed text-slate-600">
                {t("brain3d.premiumDetails")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 pb-6">
              <ul className="grid gap-x-6 gap-y-2.5 text-sm text-slate-700 sm:grid-cols-2">
                {aiBrainHighlights.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <span className="mt-0.5 font-medium text-violet-500 select-none" aria-hidden>
                      ✦
                    </span>
                    <span>{t(f)}</span>
                  </li>
                ))}
              </ul>
              {hidePaidBrainCta ? (
                <p className="text-sm font-medium text-violet-800">{t("brain3d.trialIncluded")}</p>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div className="space-y-2">
                    <Button
                      type="button"
                      className={cn(
                        "h-11 rounded-full px-8 text-[15px] font-semibold shadow-md shadow-violet-500/20",
                        "bg-gradient-to-r from-violet-600 to-purple-600 text-white",
                        "hover:from-violet-500 hover:to-purple-500 hover:shadow-lg hover:shadow-violet-500/25",
                        "border-0 focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:ring-offset-2",
                      )}
                      onClick={handleProCheckout}
                      disabled={isCheckingOut}
                      data-testid="button-ai-brain-primary-cta"
                    >
                      {isCheckingOut ? t("testChat.processing") : isShopify ? t("brain3d.chooseShopify") : t("brain3d.upgrade")}
                    </Button>
                    <p className="text-xs text-slate-500">
                      {isShopify
                        ? t("brain3d.shopifyPro")
                        : t("brain3d.proIncluded")}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* How the assistant acts — applies to AI Assist too, so it sits outside the Brain gate */}
        <Card
          data-testid="ai-behavior-card"
          className="overflow-hidden rounded-2xl border-0 bg-white/95 shadow-md shadow-slate-900/[0.04] ring-1 ring-violet-100/35"
        >
          <div className="h-0.5 bg-gradient-to-r from-violet-300/40 via-brand-green/35 to-emerald-400/35" aria-hidden />
          <CardHeader className="pb-4 space-y-1 pt-5">
            <CardTitle className="text-lg font-semibold text-slate-900 tracking-tight">{t("brain3d.behavior")}</CardTitle>
            <CardDescription className="text-slate-500">{t("brain3d.modeTone")}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col gap-8 sm:flex-row sm:gap-0">
              <div className="flex-1 space-y-2.5 min-w-0">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t("brain3d.mode")}</Label>
                {(settings.aiMode === "full_auto" || settings.aiMode === "auto") &&
                  (aiSettings as AISettings | undefined)?.webchatServerAi &&
                  (aiSettings as AISettings).webchatServerAi?.unattendedEligible !== true && (
                    <p className="text-xs text-amber-800" data-testid="text-unattended-auto-paused">
                      {t("brain3d.autoPaused")}
                    </p>
                  )}
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("brain3d.aiMode")}>
                  {AI_MODE_SEGMENTS.map((mode) => {
                    const selected = settings.aiMode === mode.value;
                    const autoLocked = mode.value === "full_auto" && autoModeLocked;
                    return (
                      <button
                        key={mode.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        title={
                          autoLocked
                            ? t("brain3d.autoLocked")
                            : t(mode.tooltipKey)
                        }
                        onClick={() => {
                          if (settings.aiMode === mode.value) return;
                          if (autoLocked) return;
                          const next = mode.value;
                          setSettings((prev) => ({ ...prev, aiMode: next }));
                          saveSettingsMutation.mutate({ aiMode: next });
                        }}
                        disabled={saveSettingsMutation.isPending || autoLocked}
                        className={cn(segmentTabClass(selected), autoLocked && "opacity-45 cursor-not-allowed")}
                        data-testid={`ai-mode-${mode.value}`}
                      >
                        {t(mode.labelKey)}
                      </button>
                    );
                  })}
                </div>
                {starterOnly && (
                  <p className="text-xs text-slate-500">
                    {t("brain3d.autoPlan")}
                  </p>
                )}
              </div>

              <div className="hidden sm:block w-px bg-gradient-to-b from-transparent via-slate-200/90 to-transparent shrink-0 mx-7 self-stretch" aria-hidden />

              <div className="flex-1 space-y-2.5 min-w-0 sm:pt-0 pt-4 border-t border-slate-100 sm:border-t-0">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t("brain3d.persona")}</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "professional", labelKey: "brain3d.professional" },
                    { value: "friendly", labelKey: "brain3d.friendly" },
                    { value: "casual", labelKey: "brain3d.casual" },
                  ].map((persona) => (
                    <button
                      key={persona.value}
                      type="button"
                      onClick={() => {
                        const next = persona.value;
                        if (settings.aiPersona === next) return;
                        setSettings((prev) => ({ ...prev, aiPersona: next }));
                        saveSettingsMutation.mutate({ aiPersona: next });
                      }}
                      disabled={saveSettingsMutation.isPending}
                      className={segmentTabClass(settings.aiPersona === persona.value)}
                      data-testid={`ai-persona-${persona.value}`}
                    >
                      {t(persona.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {effectiveHasAIBrain && (
          <>
            <BusinessKnowledgeSteps
              aboutFields={businessProfileFields}
              questionsStep={
                <CustomerQuestions
                  questions={knowledge.qualifyingQuestions}
                  industry={knowledge.industry}
                  onChange={(next) =>
                    setKnowledge((prev) => ({ ...prev, qualifyingQuestions: next }))
                  }
                />
              }
            />

            <MarketingMaterialsSettings />


            {/* Booking — Calendly via Integrations only */}
            <Card className="rounded-2xl border-0 bg-white/95 shadow-md shadow-slate-900/[0.03] ring-1 ring-violet-100/50">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="text-base font-semibold text-slate-900">{t("brain3d.booking")}</CardTitle>
                    <CardDescription className="text-slate-600">
                      {t("brain3d.bookingHelp")}
                    </CardDescription>
                  </div>
                  <div className="shrink-0 sm:pt-0.5">
                    {knowledge.calendlyBookingConnected ? (
                      <Badge className="border border-emerald-200/90 bg-emerald-50 text-emerald-900 text-xs font-medium gap-1 pr-2">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        {t("brain3d.connected")}
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="border border-amber-200/90 bg-amber-50/90 text-amber-950 text-xs font-medium"
                      >
                        {t("brain3d.notConnected")}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed text-slate-700">
                  {t("brain3d.calendlyHelp")}
                </p>
                <Link href="/app/integrations" className="inline-flex w-full sm:w-auto">
                  <Button
                    type="button"
                    variant={knowledge.calendlyBookingConnected ? "outline" : "default"}
                    className={
                      knowledge.calendlyBookingConnected
                        ? "w-full border-violet-200 text-violet-900 hover:bg-violet-50"
                        : "w-full bg-brand-green hover:bg-brand-green/90 text-white"
                    }
                  >
                    {knowledge.calendlyBookingConnected ? t("brain3d.manageIntegration") : t("brain3d.connectCalendly")}
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </>
        )}

        {/* AI Brain configuration — handoff is one control among several */}
        {effectiveHasAIBrain ? (
          <Card className="rounded-2xl border-0 bg-white/95 shadow-md shadow-slate-900/[0.03] ring-1 ring-violet-100/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900">{t("brain3d.handoff")}</CardTitle>
              <CardDescription className="text-slate-600">
                {t("brain3d.handoffHelp")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {settings.handoffKeywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-md border border-slate-200/90 bg-slate-100/80 text-xs text-slate-800 font-medium"
                  >
                    {keyword}
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(keyword)}
                      className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      aria-label={t("brain3d.removeKeyword", { keyword })}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 max-w-md">
                <Input
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder={t("brain3d.addKeyword")}
                  className="h-9 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
                  data-testid="input-handoff-keyword"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 shrink-0 border-violet-200/80 text-violet-900 hover:bg-violet-50"
                  onClick={handleAddKeyword}
                  data-testid="add-handoff-keyword"
                >
                  {t("common.add")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-600">{t("aiBrain.title")}</p>
              <h2 className="text-lg font-semibold tracking-tight text-violet-950">{t("brain3d.unlockLayer")}</h2>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-700">
                {t("brain3d.unlockHelp")}
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <LockedFeatureTeaser
                title={t("brain3d.knowledge")}
                description={t("brain3d.knowledgeTeaser")}
                preview={t("brain3d.knowledgePreview")}
              />
              <LockedFeatureTeaser
                title={t("brain3d.qualification")}
                description={t("brain3d.questionTeaser")}
                preview={t("brain3d.questionPreview")}
              />
              <LockedFeatureTeaser
                title={t("brain3d.leadScoring")}
                description={t("brain3d.scoringTeaser")}
                preview={t("brain3d.scoringPreview")}
              />
              <LockedFeatureTeaser
                title={t("brain3d.copilot")}
                description={t("brain3d.copilotTeaser")}
                preview={t("brain3d.copilotPreview")}
              />
              <LockedFeatureTeaser
                title={t("brain3d.automation")}
                description={t("brain3d.automationTeaser")}
                preview={t("brain3d.automationPreview")}
              />
              <LockedFeatureTeaser
                title={t("brain3d.handoffRules")}
                description={t("brain3d.handoffTeaser")}
                preview={t("brain3d.handoffPreview")}
              />
              {!hideGrowthEngine && (
              <LockedFeatureTeaser
                title={t("brain3d.growth")}
                description={t("brain3d.growthTeaser")}
                preview={t("brain3d.growthPreview")}
              />
              )}
            </div>
          </div>
        )}

        {effectiveHasAIBrain && (
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <Card className="rounded-2xl border border-dashed border-violet-200/50 bg-violet-50/20 shadow-none">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-left p-5 hover:bg-violet-50/40 transition-colors rounded-2xl"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{t("automationUi.advanced")}</p>
                    <p className="text-sm text-slate-600 mt-1">{t("brain3d.extraGuidance")}</p>
                  </div>
                  <ChevronRight
                    className={cn("w-4 h-4 text-slate-400 transition-transform shrink-0", advancedOpen && "rotate-90")}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 pb-5 px-5 space-y-1.5">
                  <Label htmlFor="custom-instr" className="text-xs font-medium text-slate-500">
                    {t("brain3d.instructions")}
                  </Label>
                  <Textarea
                    id="custom-instr"
                    className="text-sm min-h-[88px] max-h-40 resize-y border-slate-200/80 bg-white"
                    rows={3}
                    value={knowledge.customInstructions}
                    onChange={(e) => setKnowledge((prev) => ({ ...prev, customInstructions: e.target.value }))}
                    placeholder={t("brain3d.instructionsPlaceholder")}
                    data-testid="textarea-custom-instructions"
                  />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}
      </div>
    </div>
  );
}

export function AIBrain() {
  return <AIBrainContent />;
}
