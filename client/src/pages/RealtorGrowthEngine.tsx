import type { TFunction } from "i18next";
import { crmStageLabel } from "@/lib/crmPresentation";
import { formatRegionalDate } from "@/lib/regionalFormatting";
import React, { useState, useEffect, Component } from "react";

// ─── Error Boundary ───────────────────────────────────────────────────────────
interface EBState { hasError: boolean; error?: Error }
class RealtorEngineErrorBoundary extends Component<{ children: React.ReactNode; t: TFunction }, EBState> {
  constructor(props: { children: React.ReactNode; t: TFunction }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[RealtorGrowthEngine] Runtime error:", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4 text-center">
          <div className="rounded-full bg-red-100 p-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">{this.props.t("rgeApp.boundaryTitle")}</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {this.props.t("rgeApp.boundaryBody")}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
              className="px-4 py-2 rounded-md bg-brand-green text-white text-sm font-medium hover:bg-brand-green/90"
              data-testid="button-error-retry"
            >
              {this.props.t("inboxUi.retry")}
            </button>
            <button
              onClick={() => { window.location.href = TEMPLATES_GROWTH_ENGINES_TAB_PATH; }}
              className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-gray-50"
              data-testid="button-error-back"
            >
              {this.props.t("rgeApp.backTemplates")}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

const featuredConciergeZones = new Set([
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Anchorage", "Pacific/Honolulu",
]);
const conciergeZones = ((Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }).supportedValuesOf?.("timeZone") ?? ["Asia/Jerusalem", "Europe/Madrid", "America/Mexico_City"])
  .filter(zone => !featuredConciergeZones.has(zone));

function RealtorMark() {
  return (
    <span className="inline">Realtor<span style={{ fontSize: '0.35em', verticalAlign: 'super', lineHeight: 0, position: 'relative', top: '-0.15em' }}>&reg;</span></span>
  );
}

import { useLocation, Link } from "wouter";
import { useQuery, useMutation, type UseMutationResult } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { withUserQueryScope } from "@/lib/accountQueryScope";
import { settingsChannelsHref } from "@/lib/settingsChannelsNavigation";
import { InventorySourcesSection } from "@/components/inventory/InventorySourcesSection";
import { InventorySidebarSummary } from "@/components/inventory/InventorySidebarSummary";
import { PublicAgentPageSettingsCard } from "@/components/agentPage/PublicAgentPageSettingsCard";
import { AgentPageSidebarSummary } from "@/components/agentPage/AgentPageSidebarSummary";
import type { ActivationStatusPayload } from "@/lib/activationStatus";
import type { WebchatProductionReadiness } from "@shared/webchatWidgetSettings";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { TEMPLATES_GROWTH_ENGINES_TAB_PATH } from "@/lib/growthEnginesCatalog";
import { WorkflowWalkthrough } from "@/components/growthEngines/WorkflowWalkthrough";
import { realtorWorkflowWalkthrough, workflowLocale } from "@/components/growthEngines/workflowWalkthroughConfig";
import { useTranslation } from "react-i18next";
import {
  getRgeDetailCtaLabel,
  isRgeOnboardingComplete,
  isRgePurchased,
  RGE_INVENTORY_SETTINGS_HASH,
  RGE_INVENTORY_SETTINGS_PATH,
  RGE_TEMPLATE_DETAIL_PATH,
  RGE_TEMPLATE_ONBOARDING_PATH,
  RGE_TEMPLATE_ID,
} from "@shared/rgePaths";
import {
  getSubscriptionApiUrl,
  useShopifyShopHint,
} from "@/lib/shopifyBillingHint";
import { mustUseShopifyBilling } from "@/lib/shopifyBillingContext";
import { InAppProUpgradeButton } from "@/components/InAppProUpgradeButton";
import { toast, useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { logRgeSelect } from "@/lib/rgeSelectDebug";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Workflow } from "@shared/schema";
import { 
  CheckCircle2, 
  ChevronRight,
  ChevronLeft,
  ArrowLeft, 
  Rocket, 
  ClipboardCheck, 
  Zap,
  MessageSquare,
  MessageCircle,
  Bot,
  Sparkles,
  Send,
  Users, 
  Clock, 
  Target,
  ShieldCheck,
  Building2,
  Calendar,
  AlertCircle,
  Video,
  Handshake,
  RotateCcw,
  BarChart3,
  PauseCircle,
  LayoutGrid,
  Settings,
  Eye,
  X,
  Loader2,
  Lightbulb,
  TrendingUp,
  PhoneOff,
  ExternalLink,
  Check,
  Home,
  Filter,
  Timer,
  UserCheck,
  ClipboardList,
  Paperclip,
  Smile,
  Phone,
  Bell,
  Search,
  Plus,
  FileText,
  ArrowRight,
  MoreVertical,
} from "lucide-react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

// --- Types & Schemas ---

type EntitlementStatus = 'locked' | 'purchased' | 'submitted' | 'installed';

interface TemplateData {
  template: {
    id: string;
    name: string;
    description: string;
    isPremium: boolean;
    version: string;
  };
  entitlement: {
    status: EntitlementStatus;
    purchasedAt: string | null;
    onboardingSubmittedAt: string | null;
  } | null;
  onboardingProgress?: { step: number; formValues?: Record<string, unknown>; updatedAt?: string } | null;
  onboardingComplete?: boolean;
  install: {
    installStatus: string;
    installedAt: string | null;
  } | null;
  subscription?: {
    hasPro: boolean;
    hasAI: boolean;
    active: boolean;
    growthEngineEligible?: boolean;
    accessOk?: boolean;
    denialReason?: string | null;
    templateAccessGranted?: boolean;
  };
}

const onboardingSchema = (t: TFunction) => z.object({
  legalName: z.string().min(2, t("rgeApp.businessRequired")),
  country: z.string().min(2, t("rgeApp.countryRequired")),
  website: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === undefined ? "" : v))
    .refine((v) => v === "" || /^https?:\/\/.+/i.test(v), {
      message: t("rgeApp.fullUrl"),
    }),
  teamType: z.enum(["solo", "team"]),
  estimatedSeats: z.string(),
  notificationsEnabled: z.boolean().default(true),
  leadSources: z.string().min(3, t("rgeApp.sourcesRequired")),
  primaryGoal: z.string().min(3, t("rgeApp.goalRequired")),
  timezone: z.string().min(2, t("rgeApp.timezoneRequired")),
  conciergeLaunchAvailability: z.string().optional(),
  additionalNotes: z.string().optional(),
});

type OnboardingValues = z.infer<ReturnType<typeof onboardingSchema>>;

type RgeEngineStatusPayload = {
  onboardingComplete?: boolean;
  setupTask?: {
    status: string;
    sessionBookedAt: string | null;
    sessionBooking: { startTime?: string; eventTypeName?: string; inviteeName?: string } | null;
    specialist: { name: string; email: string } | null;
  } | null;
  calendlyConnected?: boolean;
};

function formatLaunchSessionWhen(iso: string | null | undefined, language: string): string | null {
  if (!iso) return null;
  try {
    return formatRegionalDate(new Date(iso), language, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

// Native options keep the surrounding scroll context and use the device picker on mobile.
function RgeSelect({ onValueChange, className, ...props }:
  Omit<React.ComponentProps<"select">, "onChange"> & { onValueChange: (value: string) => void }
) {
  return <select
    className={cn("h-9 w-full min-w-0 rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring", className)}
    onChange={event => onValueChange(event.target.value)}
    {...props}
  />;
}

function localizeDetailCta(t: TFunction, label: string) {
  switch (label) {
    case "Activate Engine": return t("rgeApp.activateEngineShort");
    case "Resume onboarding": return t("rgeApp.resumeOnboarding");
    case "Continue setup": return t("rgeApp.continueSetup");
    case "Open Growth Engine": return t("rgeApp.openEngine");
    default: return label;
  }
}

function ChannelStatusRow({
  label,
  ok,
  href,
  actionLabel,
}: {
  label: string;
  ok: boolean;
  href: string;
  actionLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "h-2 w-2 rounded-full shrink-0",
            ok ? "bg-emerald-500" : "bg-amber-400",
          )}
        />
        <span className="text-sm font-medium text-gray-900 truncate">{label}</span>
      </div>
      {ok ? (
        <span className="text-xs font-medium text-emerald-700 shrink-0">{t("rgeApp.connected")}</span>
      ) : (
        <Button variant="outline" size="sm" className="shrink-0 text-xs h-8" asChild>
          <Link href={href}>
            <a>{actionLabel}</a>
          </Link>
        </Button>
      )}
    </div>
  );
}

function RGEOnboardingWizard({
  step,
  setStep,
  totalSteps,
  form,
  onboardingComplete,
  hasPurchased,
  submitOnboardingMutation,
  setLocation,
}: {
  step: number;
  setStep: React.Dispatch<React.SetStateAction<number>>;
  totalSteps: number;
  form: UseFormReturn<OnboardingValues>;
  onboardingComplete: boolean;
  hasPurchased: boolean;
  submitOnboardingMutation: UseMutationResult<any, Error, OnboardingValues, unknown>;
  setLocation: (path: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const bookingReturnHandledRef = React.useRef(false);

  const { data: activationStatus } = useQuery<ActivationStatusPayload>({
    queryKey: withUserQueryScope(["/api/activation-status"], user?.id),
    staleTime: 15_000,
    refetchInterval: 20_000,
    enabled: !!user?.id,
  });

  const { data: widgetSettings } = useQuery<{ webchatReadiness?: WebchatProductionReadiness }>({
    queryKey: withUserQueryScope(["/api/widget-settings"], user?.id),
    staleTime: 15_000,
    refetchInterval: 20_000,
    enabled: !!user?.id,
  });

  const { data: engineStatusData, refetch: refetchEngineStatus } = useQuery<RgeEngineStatusPayload>({
    queryKey: ["/api/templates/realtor-growth-engine/status"],
    staleTime: 5_000,
    refetchInterval: step === 4 && !onboardingComplete ? 4_000 : 30_000,
  });

  const { data: savedProgressData } = useQuery<{
    progress: { step: number; formValues?: Record<string, unknown> } | null;
  }>({
    queryKey: ["/api/templates/realtor-growth-engine/onboarding/progress"],
    enabled: hasPurchased && !onboardingComplete,
    staleTime: 10_000,
  });

  const saveProgressMutation = useMutation({
    mutationFn: async (payload: { step: number; formValues?: OnboardingValues }) => {
      const res = await apiRequest("PUT", "/api/templates/realtor-growth-engine/onboarding/progress", payload);
      if (!res.ok) throw new Error("Failed to save progress");
      return res.json();
    },
  });

  const progressHydratedRef = React.useRef(false);
  React.useEffect(() => {
    if (progressHydratedRef.current || onboardingComplete) return;
    const p = savedProgressData?.progress;
    if (!p?.step) return;
    progressHydratedRef.current = true;
    setStep(Math.min(totalSteps, Math.max(1, p.step)));
    if (p.formValues && typeof p.formValues === "object") {
      form.reset({ ...form.getValues(), ...(p.formValues as Partial<OnboardingValues>) });
    }
  }, [savedProgressData, onboardingComplete, form, setStep, totalSteps]);

  const persistProgress = (nextStep: number) => {
    if (onboardingComplete) return;
    saveProgressMutation.mutate({ step: nextStep, formValues: form.getValues() });
  };

  const { data: conciergeBooking } = useQuery<{ calendarUrl: string | null; source: string }>({
    queryKey: ["/api/templates/realtor-growth-engine/concierge-calendar"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/templates/realtor-growth-engine/concierge-calendar");
      return res.json();
    },
    staleTime: 60_000,
  });

  const conciergeCalendarUrl = conciergeBooking?.calendarUrl?.trim() || null;
  const showCompletion = onboardingComplete;
  const sessionBooking = engineStatusData?.setupTask?.sessionBooking;
  const launchSessionBooked =
    engineStatusData?.setupTask?.status === "session_booked" ||
    !!engineStatusData?.setupTask?.sessionBookedAt ||
    !!sessionBooking?.startTime;
  const sessionWhen =
    formatLaunchSessionWhen(sessionBooking?.startTime, i18n.language) ||
    formatLaunchSessionWhen(engineStatusData?.setupTask?.sessionBookedAt, i18n.language);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stepParam = params.get("step");
    if (stepParam) {
      const n = parseInt(stepParam, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= totalSteps) {
        setStep(n);
      }
    }
    if (params.get("booking") === "success" && !bookingReturnHandledRef.current) {
      bookingReturnHandledRef.current = true;
      setStep(4);
      persistProgress(4);
      void refetchEngineStatus();
      void queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine/status"] });
      toast({
        title: t("rgeApp.bookingSuccess"),
        description: t("rgeApp.bookingToast"),
      });
      const url = new URL(window.location.href);
      url.searchParams.delete("booking");
      url.searchParams.delete("step");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [setStep, totalSteps, refetchEngineStatus, toast]);

  const webchatConnected = widgetSettings?.webchatReadiness?.effectivePublic === true;
  const calendlyConnected = !!engineStatusData?.calendlyConnected;
  const whatsappReady = !!activationStatus?.whatsappConnected;

  const getFieldsForStep = (stepNum: number): (keyof OnboardingValues)[] => {
    const stepFields: Record<number, (keyof OnboardingValues)[]> = {
      1: [],
      2: [],
      3: ["legalName", "country", "website", "teamType", "estimatedSeats", "notificationsEnabled", "leadSources", "primaryGoal"],
      4: conciergeCalendarUrl ? [] : ["timezone", "conciergeLaunchAvailability"],
      5: [],
    };
    return stepFields[stepNum] || [];
  };

  const openLaunchSessionBooking = () => {
    if (!conciergeCalendarUrl) return;
    persistProgress(4);
    window.location.href = conciergeCalendarUrl;
  };

  const nextStep = async () => {
    if (step === 4 && conciergeCalendarUrl && !launchSessionBooked) {
      toast({
        title: t("rgeApp.bookFirst"),
        description: t("rgeApp.chooseTime"),
        variant: "destructive",
      });
      return;
    }
    if (step === 4 && !conciergeCalendarUrl) {
      const availability = form.getValues("conciergeLaunchAvailability")?.trim() ?? "";
      if (availability.length < 5) {
        form.setError("conciergeLaunchAvailability", {
          type: "manual",
          message: t("rgeApp.availabilityError"),
        });
        return;
      }
    }
    const fields = getFieldsForStep(step);
    if (fields.length > 0) {
      const result = await form.trigger(fields);
      if (!result) return;
    }
    const next = Math.min(step + 1, totalSteps);
    setStep(next);
    persistProgress(next);
  };

  const prevStep = () => {
    const prev = Math.max(step - 1, 1);
    setStep(prev);
    persistProgress(prev);
  };

  const onSubmit = (values: OnboardingValues) => {
    const payload = { ...values };
    if (conciergeCalendarUrl && !payload.conciergeLaunchAvailability?.trim()) {
      payload.conciergeLaunchAvailability = "Booked via specialist calendar";
    }
    submitOnboardingMutation.mutate(payload);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" className="text-gray-600" onClick={() => setLocation("/app/templates/realtor-growth-engine")}>
          <ChevronLeft className="w-4 h-4 me-1" /> {t("inboxUi.back")}
        </Button>
      </div>

      {showCompletion ? (
        <Card className="border-emerald-100 bg-emerald-50/30 shadow-sm" data-testid="card-onboarding-complete">
          <CardContent className="py-10 px-6 space-y-5 text-center max-w-lg mx-auto">
            <CheckCircle2 className="w-12 h-12 text-brand-green mx-auto" />
            <h3 className="text-2xl font-bold text-gray-900 tracking-tight">{t("rgeApp.onboardingDone")}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              {t("rgeApp.onboardingSubmitted")}
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              {t("rgeApp.teamReview")}
            </p>
            {sessionWhen ? (
              <div className="rounded-lg border border-emerald-100 bg-white px-4 py-3 text-sm text-gray-700">
                <p className="font-medium text-gray-900">{t("rgeApp.bookingConfirmed")}</p>
                <p className="mt-1">{sessionWhen}</p>
                {engineStatusData?.setupTask?.specialist ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("rgeApp.specialist")} {engineStatusData.setupTask.specialist.name}
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("rgeApp.reschedule")}
            </p>
            <p className="text-xs text-gray-600 leading-relaxed">
              {t("rgeApp.manageAutomation")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("rgeApp.needHelp")}{" "}
              <a href="mailto:support@whachatcrm.com" className="text-brand-green font-medium hover:underline">
                support@whachatcrm.com
              </a>
            </p>
            <p className="text-sm text-gray-700 pt-1">
              {t("rgeApp.includedWish")}
            </p>
            <div className="flex justify-center pt-2">
              <Button className="bg-brand-green hover:bg-brand-green/90" asChild data-testid="button-open-automations">
                <Link href="/app/workflows">{t("rgeApp.openAutomations")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : hasPurchased && !showCompletion ? (
        <div className="mb-8">
          <div className="text-center mb-6">
            <Badge className="mb-4 bg-brand-green/10 text-brand-green border-brand-green/20">
              {t("rgeApp.stepCount", { step, total: totalSteps })}
            </Badge>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{t("rgeApp.guidedLaunch")}</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-lg mx-auto">
              {t("rgeApp.guidedHelp")}
            </p>
          </div>
          <Progress aria-label={t("rgeApp.stepCount", { step, total: totalSteps })} value={(step / totalSteps) * 100} className="mb-8 h-1.5" />

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {step === 1 && (
                <Card className="border-gray-200/80 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{t("rgeApp.welcome")}</CardTitle>
                    <CardDescription className="text-base leading-relaxed">
                      {t("rgeApp.welcomeBody")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-gray-600">
                    <ul className="list-disc ps-5 space-y-2">
                      <li>{t("rgeApp.channelsReady")}</li>
                      <li>{t("rgeApp.aiRouting")}</li>
                      <li>{t("rgeApp.sequences")}</li>
                      <li>{t("rgeApp.optionalCalendar")}</li>
                      <li>{t("rgeApp.conciergeReview")}</li>
                    </ul>
                  </CardContent>
                </Card>
              )}

              {step === 2 && (
                <Card className="border-gray-200/80 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{t("rgeApp.channelReadiness")}</CardTitle>
                    <CardDescription>
                      {t("rgeApp.channelRequirement")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <ChannelStatusRow
                        label="WhatsApp"
                        ok={!!activationStatus?.whatsappConnected}
                        href={settingsChannelsHref({ provider: "whatsapp" })}
                        actionLabel={t("rgeApp.connectWhatsApp")}
                      />
                      <ChannelStatusRow
                        label="Facebook"
                        ok={!!activationStatus?.facebookConnected}
                        href={settingsChannelsHref({ provider: "facebook" })}
                        actionLabel={t("rgeApp.connectFacebook")}
                      />
                      <ChannelStatusRow
                        label="Instagram"
                        ok={!!activationStatus?.instagramConnected}
                        href={settingsChannelsHref({ provider: "instagram" })}
                        actionLabel={t("rgeApp.connectInstagram")}
                      />
                      <ChannelStatusRow
                        label="Calendly"
                        ok={calendlyConnected}
                        href="/app/integrations"
                        actionLabel={t("rgeApp.connectCalendly")}
                      />
                      <ChannelStatusRow
                        label="Website chat widget"
                        ok={webchatConnected}
                        href="/app/settings?section=channels"
                        actionLabel={t("rgeApp.openWebChat")}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t("rgeApp.whatsappSetup")}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">{t("rgeApp.setupExplanation")}
                    </p>
                  </CardContent>
                </Card>
              )}

              {step === 3 && (
                <Card className="border-gray-200/80 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{t("rgeApp.businessProfile")}</CardTitle>
                    <CardDescription>{t("rgeApp.businessProfileHelp")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="legalName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("rgeApp.businessName")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("rgeApp.businessNameHint")} {...field} data-testid="input-legal-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="country"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("rgeApp.country")}</FormLabel>
                            <FormControl>
                              <Input placeholder={t("rgeApp.countryExample")} {...field} data-testid="input-country" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="website"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("rgeApp.websiteOptional")}</FormLabel>
                            <FormControl>
                              <Input dir="ltr" placeholder="https://your-site.com" {...field} data-testid="input-website" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="teamType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("rgeApp.team")}</FormLabel>
                          <FormControl>
                            <RadioGroup value={field.value} onValueChange={field.onChange} className="flex space-x-4 mt-2">
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="solo" id="team-solo" data-testid="radio-team-solo" />
                                <Label htmlFor="team-solo" className="font-normal cursor-pointer">
                                  {t("rgeApp.solo")}
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="team" id="team-team" data-testid="radio-team-team" />
                                <Label htmlFor="team-team" className="font-normal cursor-pointer">
                                  {t("rgeApp.team")}
                                </Label>
                              </div>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="estimatedSeats"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("rgeApp.seats")}</FormLabel>
                          <FormControl>
                            <RgeSelect value={field.value} name={field.name} onBlur={field.onBlur} ref={field.ref} onValueChange={field.onChange} data-testid="select-estimated-seats">
                              <option value="1">1</option>
                              <option value="2-5">2-5</option>
                              <option value="6-10">6-10</option>
                              <option value="10+">10+</option>
                            </RgeSelect>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="notificationsEnabled"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">{t("common.toastNotifications")}</FormLabel>
                            <FormDescription>{t("rgeApp.alerts")}</FormDescription>
                          </div>
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-notifications" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="leadSources"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("rgeApp.leadSources")}</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={t("rgeApp.leadSourcesExample")}
                              className="min-h-[88px]"
                              {...field}
                              data-testid="textarea-lead-sources"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="primaryGoal"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("rgeApp.primaryOutcome")}</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={t("rgeApp.outcomeExample")}
                              className="min-h-[88px]"
                              {...field}
                              data-testid="textarea-primary-goal"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              )}

              {step === 4 && (
                <Card className="border-gray-200/80 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{t("rgeApp.conciergeBook")}</CardTitle>
                    <CardDescription className="text-base leading-relaxed">
                      {t("rgeApp.conciergeBookHelp")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {conciergeCalendarUrl ? (
                      <>
                        {launchSessionBooked ? (
                          <div
                            className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900"
                            data-testid="banner-launch-session-booked"
                          >
                            <p className="font-medium">{t("rgeApp.bookingSuccess")}</p>
                            {sessionWhen ? (
                              <p className="mt-1 text-emerald-800/90">{sessionWhen}</p>
                            ) : (
                              <p className="mt-1 text-emerald-800/90">
                                {t("rgeApp.confirmContinue")}
                              </p>
                            )}
                          </div>
                        ) : (
                          <Button
                            type="button"
                            className="bg-brand-green hover:bg-brand-green/90"
                            onClick={openLaunchSessionBooking}
                            data-testid="button-book-launch-session"
                          >
                            {t("rgeApp.bookSession")}
                            <ExternalLink className="ms-2 h-4 w-4" />
                          </Button>
                        )}
                        <FormField
                          control={form.control}
                          name="additionalNotes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("rgeApp.specialistNotes")}</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder={t("rgeApp.specialtyExample")}
                                  className="min-h-[88px]"
                                  {...field}
                                  data-testid="textarea-additional-notes"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    ) : (
                      <>
                        <p className="rounded-lg border border-gray-100 bg-gray-50/80 px-4 py-3 text-sm leading-relaxed text-gray-600">
                          {t("rgeApp.noSpecialistCalendar")}
                        </p>
                        <FormField
                          control={form.control}
                          name="timezone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("rgeApp.timezone")}</FormLabel>
                              <FormControl>
                                <RgeSelect value={field.value} name={field.name} onBlur={field.onBlur} ref={field.ref} onValueChange={field.onChange} data-testid="select-timezone">
                                  <option value="America/New_York">{t("rgeApp.eastern")}</option>
                                  <option value="America/Chicago">{t("rgeApp.central")}</option>
                                  <option value="America/Denver">{t("rgeApp.mountain")}</option>
                                  <option value="America/Los_Angeles">{t("rgeApp.pacific")}</option>
                                  <option value="America/Anchorage">{t("rgeApp.alaska")}</option>
                                  <option value="Pacific/Honolulu">{t("rgeApp.hawaii")}</option>
                                  <optgroup label={t("rgeNeighborhood.otherTimezones")}>
                                    {field.value && !featuredConciergeZones.has(field.value) && !conciergeZones.includes(field.value) &&
                                      <option value={field.value}>{field.value}</option>}
                                    {conciergeZones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
                                  </optgroup>
                                </RgeSelect>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="conciergeLaunchAvailability"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("rgeApp.availability")}</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder={t("rgeApp.availabilityExample")}
                                  className="min-h-[100px]"
                                  {...field}
                                  data-testid="textarea-concierge-availability"
                                />
                              </FormControl>
                              <FormDescription>{t("rgeApp.availabilityHelp")}</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="additionalNotes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("rgeApp.conciergeNotes")}</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder={t("rgeApp.specialtyExample")}
                                  className="min-h-[88px]"
                                  {...field}
                                  data-testid="textarea-additional-notes-fallback"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {step === 5 && (
                <Card className="border-gray-200/80 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{t("rgeApp.reviewActivate")}</CardTitle>
                    <CardDescription>
                      {t("rgeApp.reviewHelp")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4 space-y-2 text-sm text-gray-700">
                      <p className="font-medium text-gray-900">{t("rgeApp.beforeFinish")}</p>
                      <p>
                        {whatsappReady ? (
                          <span className="text-emerald-700 font-medium">
                            {t("rgeApp.whatsappReady")}
                          </span>
                        ) : (
                          <span>
                            {t("rgeApp.whatsappLater")}{" "}
                            <Link href={settingsChannelsHref({ provider: "whatsapp" })}>
                              <a className="text-brand-green font-medium underline-offset-2 hover:underline">{t("rgeApp.connectWhatsApp")}</a>
                            </Link>{" "}
                            {t("rgeApp.whatsappLaterLink")}
                          </span>
                        )}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-3 justify-between pt-4">
                <Button type="button" variant="outline" onClick={prevStep} disabled={step === 1} data-testid="button-prev-step">
                  <ChevronLeft className="me-1 w-4 h-4" /> {t("common.previousPage")}
                </Button>
                {step < totalSteps ? (
                  <Button
                    type="button"
                    className="bg-brand-green hover:bg-brand-green/90"
                    onClick={nextStep}
                    disabled={step === 4 && !!conciergeCalendarUrl && !launchSessionBooked}
                    data-testid="button-next-step"
                  >
                    {step === 4 && conciergeCalendarUrl && !launchSessionBooked
                      ? t("rgeApp.bookContinue")
                      : t("common.nextPage")}{" "}
                    <ChevronRight className="ms-1 w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    className="bg-brand-green hover:bg-brand-green/90"
                    disabled={submitOnboardingMutation.isPending}
                    data-testid="button-submit-onboarding"
                  >
                    {submitOnboardingMutation.isPending ? (
                      <>
                        <Loader2 className="me-2 w-4 h-4 animate-spin" /> {t("rgeApp.activating")}
                      </>
                    ) : (
                      <>{t("rgeApp.activateEngine")}</>
                    )}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </div>
      ) : null}
    </div>
  );
}

// --- Components ---

export function RealtorGrowthEngine() {
  const { t } = useTranslation();
  const { i18n } = useTranslation();
  const [location, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const totalSteps = 5;
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const shopHint = useShopifyShopHint();
  const { data: billingAccount } = useQuery<{
    subscription?: { isShopify?: boolean; canStartInternalTrial?: boolean };
  }>({
    queryKey: ["/api/subscription", shopHint ?? ""],
    queryFn: async () => {
      const res = await fetch(getSubscriptionApiUrl(), { credentials: "include" });
      if (res.status === 401) throw new Error("401");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 60_000,
  });
  const isShopify = mustUseShopifyBilling(billingAccount?.subscription, shopHint);

  const isOnboardingPath = location.includes("/realtor-growth-engine/onboarding");

  const { data: templateData, isLoading, isError, error: queryError } = useQuery<TemplateData>({
    queryKey: ["/api/templates/realtor-growth-engine", new URLSearchParams(window.location.search).get("bypass")],
    queryFn: async ({ queryKey }) => {
      const url = queryKey[1] ? `/api/templates/realtor-growth-engine?bypass=${queryKey[1]}` : "/api/templates/realtor-growth-engine";
      try {
        const res = await apiRequest("GET", url);
        const json = await res.json();
        return json;
      } catch (err) {
        console.error("[RealtorGrowthEngine] Load error:", err);
        throw err;
      }
    },
    retry: 1,
  });

  const installMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/templates/realtor-growth-engine/install", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.status === 401) {
        window.location.href = `/auth?redirect=${encodeURIComponent(window.location.pathname)}`;
        throw new Error("session_expired");
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(body?.error || "Installation failed") as Error & { code?: string; status?: number };
        err.code = body?.code;
        err.status = res.status;
        throw err;
      }
      return body;
    },
    onSuccess: (data: { alreadyInstalled?: boolean; onboardingComplete?: boolean }) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine"] });
      toast({
        title: data.alreadyInstalled ? t("rgeApp.alreadyInstalled") : t("rgeApp.installed"),
        description: data.onboardingComplete ? t("rgeApp.opening") : t("rgeApp.guidedNext"),
      });
      setLocation(data.onboardingComplete ? RGE_TEMPLATE_DETAIL_PATH : RGE_TEMPLATE_ONBOARDING_PATH);
    },
    onError: (err: Error & { code?: string; status?: number }) => {
      if (err.message === "session_expired") return;
      toast({ title: t("rgeApp.installError"), description: err.message, variant: "destructive" });
    },
  });

  const submitOnboardingMutation = useMutation({
    mutationFn: async (values: OnboardingValues) => {
      const res = await apiRequest("POST", "/api/templates/realtor-growth-engine/onboarding/submit", { payload: values });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof body?.error === "string" ? body.error : "Activation failed";
        throw new Error(msg);
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activation-status"] });
    },
    onError: (err: Error) => {
      toast({
        title: t("rgeApp.activateError"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema(t)),
    defaultValues: {
      website: "",
      teamType: "solo",
      estimatedSeats: "1",
      notificationsEnabled: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      leadSources: "",
      primaryGoal: "",
      conciergeLaunchAvailability: "",
      additionalNotes: "",
    },
  });

  const status = templateData?.entitlement?.status || "locked";
  const entitlement = templateData?.entitlement;
  const onboardingComplete =
    isRgeOnboardingComplete(entitlement) || templateData?.onboardingComplete === true;
  const hasPurchased =
    isRgePurchased(status, entitlement) || templateData?.subscription?.templateAccessGranted === true;
  const onboardingStep = templateData?.onboardingProgress?.step ?? null;

  React.useEffect(() => {
    if (!isOnboardingPath) return;
    if (!hasPurchased) {
      setLocation(RGE_TEMPLATE_DETAIL_PATH);
    }
  }, [
    isOnboardingPath,
    hasPurchased,
    setLocation,
  ]);

  const { data: assetsData, isLoading: assetsLoading, isError: assetsError } = useQuery<{ assets?: Array<{ assetType?: string; definition?: Record<string, unknown> }> }>({
    queryKey: ["/api/templates/realtor-growth-engine/assets"],
    enabled: !!templateData && status === 'installed'
  });

  const { data: installedWorkflows, isError: workflowStatusError } = useQuery<Workflow[]>({
    queryKey: ["/api/workflows"],
    enabled: status === "installed",
  });

  const rawWorkflows =
    assetsData?.assets?.find((a: any) => a.assetType === "workflows")?.definition?.workflows || [];
  /** Template asset rows plus a synthetic W2 row (qualification runs in the message engine, not as a DB workflow). */
  const workflows = React.useMemo(() => {
    const list = [...(rawWorkflows as any[])];
    if (!list.some((w) => w?.key === "W2")) {
      const afterW1 = list.findIndex((w) => w?.key === "W1");
      const synthetic = {
        key: "W2",
        name: "Lead qualification (AI engine — runs on every inbound message)",
        enabledByDefault: true,
        trigger: { type: "inbound_message" },
        actions: [],
        conditions: [],
      };
      if (afterW1 >= 0) list.splice(afterW1 + 1, 0, synthetic);
      else list.unshift(synthetic);
    }
    return list;
  }, [rawWorkflows]);
  const pipeline = assetsData?.assets?.find((a: any) => a.assetType === 'pipeline')?.definition || { stages: [] };
  const subscriptionActive = templateData?.subscription?.accessOk !== false;
  const isPaused = !subscriptionActive && (status === 'purchased' || status === 'submitted' || status === 'installed');

  const detailCta = localizeDetailCta(t, getRgeDetailCtaLabel(status, entitlement, onboardingStep));
  const primaryMarketingCta = React.useMemo(() => {
    if (isPaused) {
      return { label: t("rgeApp.restorePro"), disabled: true as const };
    }
    if (!hasPurchased) {
      return {
        label: templateData?.subscription?.accessOk === false ? t("rgeApp.upgradePro") : t("rgeApp.installEngine"),
        disabled: installMutation.isPending || checkingSubscription,
      };
    }
    if (!onboardingComplete) {
      return {
        label: detailCta,
        disabled: false as const,
      };
    }
    return { label: t("rgeApp.openEngine"), disabled: false as const };
  }, [
    t,
    detailCta,
    isPaused,
    hasPurchased,
    onboardingComplete,
    status,
    entitlement,
    onboardingStep,
    installMutation.isPending,
    checkingSubscription,
    templateData?.subscription?.accessOk,
  ]);

  React.useEffect(() => {
    if (subscriptionActive && sessionStorage.getItem("rge_reactivating")) {
      sessionStorage.removeItem("rge_reactivating");
      toast({
        title: t("rgeApp.subscriptionActive"),
        description: "You can now continue your Realtor® Growth Engine.",
      });
    }
  }, [subscriptionActive]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== `#${RGE_INVENTORY_SETTINGS_HASH}`) return;
    if (!(onboardingComplete && status === "installed")) return;
    const timer = window.setTimeout(() => {
      document.getElementById(RGE_INVENTORY_SETTINGS_HASH)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [location, onboardingComplete, status]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-muted-foreground" data-testid="state-loading">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">{t("rgeApp.loadingTemplate")}</span>
      </div>
    );
  }

  if (isError || !templateData) {
    const msg = (queryError as Error)?.message || t("rgeApp.loadDescription");
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4 text-center" data-testid="state-error">
        <div className="rounded-full bg-red-100 p-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">{t("rgeApp.loadTemplateError")}</h2>
        <p className="text-sm text-muted-foreground max-w-md">{msg}</p>
        <div className="flex gap-3">
          <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine"] })} data-testid="button-error-retry">
            {t("inboxUi.retry")}
          </Button>
          <Button variant="outline" onClick={() => setLocation(TEMPLATES_GROWTH_ENGINES_TAB_PATH)} data-testid="button-error-back">
            {t("rgeApp.backTemplates")}
          </Button>
        </div>
      </div>
    );
  }

  // --- Views ---

  const handleInstallContinue = async () => {
    if (hasPurchased) {
      setLocation(onboardingComplete ? RGE_TEMPLATE_DETAIL_PATH : RGE_TEMPLATE_ONBOARDING_PATH);
      return;
    }
    const templateSub = templateData?.subscription;
    if (templateSub?.accessOk === false) {
      return;
    }
    if (templateSub?.accessOk && templateSub?.templateAccessGranted) {
      installMutation.mutate();
      return;
    }
    setCheckingSubscription(true);
    try {
      const res = await apiRequest("GET", "/api/templates/realtor-growth-engine/check-subscription");
      const data = await res.json();
      if (data.accessOk === false || !data.hasPro || !data.hasAI) {
        setCheckingSubscription(false);
        return;
      }
      if (data.templateAccessGranted) {
        setCheckingSubscription(false);
        installMutation.mutate();
        return;
      }
      setCheckingSubscription(false);
      installMutation.mutate();
    } catch {
      setCheckingSubscription(false);
      toast({ title: t("common.error"), description: t("rgeApp.verifySubscription"), variant: "destructive" });
    }
  };

  const handlePrimaryCta = () => {
    if (!hasPurchased) {
      void handleInstallContinue();
      return;
    }
    if (isPaused) return;
    if (!onboardingComplete) {
      setLocation(RGE_TEMPLATE_ONBOARDING_PATH);
      return;
    }
    if (!isOnboardingPath) {
      setLocation(RGE_TEMPLATE_DETAIL_PATH);
    }
  };

  const renderStepper = () => {
    const s1 = hasPurchased;
    const s2 = hasPurchased;
    const s3 = onboardingComplete;
    const s2Active = hasPurchased && !onboardingComplete;

    const circle = (done: boolean, activeRing: boolean) =>
      cn(
        "flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all",
        done && "border-emerald-600 bg-emerald-600 text-white shadow-lg shadow-emerald-600/30",
        !done && activeRing && "border-emerald-600 bg-white text-emerald-600 shadow-md",
        !done && !activeRing && "border-gray-200 bg-white text-gray-400",
      );

    return (
      <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4">
        <div className="flex flex-col items-center gap-1.5">
          <div className={circle(s1, false)}>{s1 ? <Check className="h-5 w-5" /> : "1"}</div>
          <span className={cn("text-xs font-medium", s1 ? "text-emerald-600" : "text-gray-400")}>{t("rgeApp.activate")}</span>
        </div>
        <div
          className={cn(
            "hidden h-0.5 w-10 shrink-0 -translate-y-3 sm:block md:w-16",
            s1 ? "bg-gradient-to-r from-emerald-600 to-gray-200" : "bg-gray-200",
          )}
        />
        <div className="flex flex-col items-center gap-1.5">
          <div className={circle(s2, s2Active && !s2)}>{s2 ? <Check className="h-5 w-5" /> : "2"}</div>
          <span className={cn("text-xs font-medium", s2 || s2Active ? "text-emerald-600" : "text-gray-400")}>{t("rgeApp.setup")}</span>
        </div>
        <div
          className={cn(
            "hidden h-0.5 w-10 shrink-0 -translate-y-3 sm:block md:w-16",
            s2 ? "bg-gradient-to-r from-emerald-600 to-gray-200" : "bg-gray-200",
          )}
        />
        <div className="flex flex-col items-center gap-1.5">
          <div className={circle(s3, false)}>{s3 ? <Check className="h-5 w-5" /> : "3"}</div>
          <span className={cn("text-xs font-medium", s3 ? "text-emerald-600" : "text-gray-400")}>{t("rgeApp.goLive")}</span>
        </div>
      </div>
    );
  };

  const DetailPage = () => {
    const includedItems: { Icon: typeof Sparkles; t: string; d: string }[] = [
      { Icon: Sparkles, t: t("rgeApp.includedQualification"), d: t("rgeApp.includedQualificationHelp") },
      { Icon: Target, t: t("rgeApp.includedScoring"), d: t("rgeApp.includedScoringHelp") },
      { Icon: Calendar, t: t("rgeApp.includedBooking"), d: t("rgeApp.includedBookingHelp") },
      { Icon: Clock, t: t("rgeApp.includedNurture"), d: t("rgeApp.includedNurtureHelp") },
      { Icon: Send, t: t("rgeApp.includedTemplate"), d: t("rgeApp.includedTemplateHelp") },
      { Icon: LayoutGrid, t: t("rgeApp.includedPipeline"), d: t("rgeApp.includedPipelineHelp") },
      { Icon: ClipboardCheck, t: t("rgeApp.includedTasks"), d: t("rgeApp.includedTasksHelp") },
      { Icon: Handshake, t: t("rgeApp.includedLaunch"), d: t("rgeApp.includedLaunchHelp") },
    ];

    const whatItDoesLines = [
      t("rgeApp.leadCapture"),
      t("rgeApp.smartReply"),
      t("rgeApp.qualifyPeople"),
      t("rgeApp.bookIntent"),
      t("rgeApp.calendarBookings"),
      t("rgeApp.nurtureOverview"),
      t("rgeApp.crmOverview"),
    ];

    return (
      <div className="min-h-full bg-[#f8f9fa] pb-20">
        <header className="mb-2 flex items-center justify-end border-b border-gray-200/80 bg-white/90 px-4 py-3 sm:px-6">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900"
            onClick={() => setLocation(TEMPLATES_GROWTH_ENGINES_TAB_PATH)}
          >
            <ChevronLeft className="h-4 w-4" />
            {t("rgeApp.backEngines")}
          </Button>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-6 sm:px-6">
          <section className="relative mb-6 overflow-hidden rounded-3xl border border-emerald-900/20 bg-gradient-to-br from-[#0a1f17] via-[#0f2920] to-[#143d2e] p-8 text-white shadow-2xl md:p-10">
            <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-teal-500/10 blur-3xl" />
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent" />
            <div
              className="absolute inset-0 opacity-60 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px]"
              aria-hidden
            />

            <div className="relative">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/10 p-3 shadow-lg shadow-black/10 backdrop-blur-md">
                    <Home className="h-5 w-5 text-emerald-300" aria-hidden />
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/10 p-3 shadow-lg shadow-black/10 backdrop-blur-md">
                    <MessageSquare className="h-5 w-5 text-emerald-300" aria-hidden />
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/10 p-3 shadow-lg shadow-black/10 backdrop-blur-md">
                    <Bot className="h-5 w-5 text-emerald-300" aria-hidden />
                  </div>
                </div>
                <Badge className="border border-emerald-400/30 bg-emerald-500/20 px-4 py-1.5 font-medium text-emerald-100 shadow-lg backdrop-blur-md hover:bg-emerald-500/30">
                  {t("rgeApp.premiumEngine")}
                </Badge>
              </div>

              <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
                <RealtorMark /> {t("rgeApp.engine")}
              </h1>
              <p className="mb-2 text-xl font-medium text-emerald-100/90 md:text-2xl">
                {t("rgeApp.engineSubtitle")}
              </p>
              <p className="text-base text-gray-300/80">
                {t("rgeApp.engineOutcome")}
              </p>
            </div>
          </section>

          <div className="mb-6 flex justify-center">{renderStepper()}</div>

          {hasPurchased && !onboardingComplete && (
            <section
              className="mb-8 rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/50 via-white to-white px-6 py-8 shadow-sm md:px-8"
              data-testid="banner-incomplete-onboarding"
            >
              <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center sm:flex-row sm:text-start">
                <div className="flex-1 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">{t("rgeApp.setupInProgress")}</p>
                  <h2 className="text-xl font-semibold tracking-tight text-gray-900 md:text-2xl">
                    {t("rgeApp.resumeTitle")}
                  </h2>
                  <p className="text-sm leading-relaxed text-gray-600">
                    {t("rgeApp.resumeHelp")}
                  </p>
                  {onboardingStep && onboardingStep > 1 ? (
                    <p className="text-xs text-muted-foreground">{t("rgeApp.lastSaved", { step: onboardingStep, total: totalSteps })}</p>
                  ) : null}
                </div>
                <Button
                  size="lg"
                  className="shrink-0 rounded-xl bg-gray-900 px-8 text-white shadow-sm hover:bg-gray-800"
                  onClick={() => setLocation(RGE_TEMPLATE_ONBOARDING_PATH)}
                  data-testid="button-continue-setup-banner"
                >
                  {detailCta}
                  <ChevronRight className="ms-1.5 h-5 w-5 rtl:rotate-180" />
                </Button>
              </div>
            </section>
          )}

        {isPaused && (
          <Card className="mb-10 border-amber-300 bg-amber-50" data-testid="banner-subscription-paused">
            <CardContent className="flex items-start gap-3 px-5 py-4 sm:px-6">
              <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-900">{t("rgeApp.enginePaused")}</p>
                <p className="mt-0.5 text-xs text-amber-800">
                  {t("rgeApp.pausedBody")}
                </p>
                <p className="mt-1 text-[11px] text-amber-700">{t("rgeApp.savedInstallation")}</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {!templateData?.subscription?.hasPro && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs border-amber-400 text-amber-900 hover:bg-amber-100"
                      onClick={() => {
                        sessionStorage.setItem("rge_reactivating", "1");
                        setLocation("/app/settings");
                      }}
                      data-testid="button-reactivate-pro"
                    >
                      {t("rgeApp.reactivatePro")}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <section className="mb-6 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm md:p-8">
          <h2 className="mb-1 text-xl font-bold text-gray-900 md:text-2xl">{t("rgeApp.whatItDoes")}</h2>
          <p className="mb-6 text-sm text-gray-500">
            {t("rgeApp.whatItDoesHelp")}
          </p>

          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-3">
              {whatItDoesLines.map((line) => (
                <div key={line} className="group flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 transition-colors group-hover:bg-emerald-200">
                      <Check className="h-3 w-3 text-emerald-600" aria-hidden />
                    </div>
                  </div>
                  <span className="text-sm leading-relaxed text-gray-600">{line}</span>
                </div>
              ))}
            </div>

            <div className="relative flex justify-center lg:justify-end">
              <div className="relative">
                <div className="w-[280px] rounded-[2.5rem] bg-gradient-to-b from-gray-200 to-gray-100 p-2.5 shadow-2xl">
                  <div className="overflow-hidden rounded-[2rem] bg-white shadow-inner">
                    <div className="bg-[#075e54] px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <ArrowLeft className="h-4 w-4 text-white/80" aria-hidden />
                          <div className="relative">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-md">
                              <span className="text-xs font-bold text-white">SM</span>
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#075e54] bg-green-400" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-white">Sarah Mitchell</p>
                            <p className="flex items-center gap-1 text-[10px] text-emerald-200">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                              online
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Video className="h-4 w-4 text-white/80" aria-hidden />
                          <Phone className="h-4 w-4 text-white/80" aria-hidden />
                          <MoreVertical className="h-4 w-4 text-white/80" aria-hidden />
                        </div>
                      </div>
                    </div>

                    <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500">
                          <Sparkles className="h-2.5 w-2.5 text-white" aria-hidden />
                        </div>
                        <span className="text-[10px] font-medium text-emerald-700">{t("rgeNeighborhood.copilotActive")}</span>
                        <Badge className="ml-auto border-0 bg-emerald-100 px-1.5 py-0 text-[8px] text-emerald-700">{t("rgeNeighborhood.newLead")}</Badge>
                      </div>
                    </div>

                    <div className="min-h-[260px] space-y-2 bg-[#efeae2] p-3">
                      <div className="flex justify-center">
                        <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[9px] text-gray-500 shadow-sm">{t("inboxUi.today")}</span>
                      </div>
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-xl rounded-tl-sm bg-white px-3 py-2 shadow-sm">
                          <p className="text-[11px] leading-relaxed text-gray-800">Hi! I&apos;m looking for a 3 bedroom house in Miami.</p>
                          <span className="float-right ms-2 mt-0.5 text-[9px] text-gray-400">10:24 AM</span>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <div className="relative max-w-[85%] rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 shadow-sm">
                          <div className="absolute -left-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 shadow-md">
                            <Sparkles className="h-2 w-2 text-white" aria-hidden />
                          </div>
                          <p className="text-[11px] leading-relaxed text-gray-800">Great! I can help you find the perfect home. What&apos;s your budget range?</p>
                          <div className="mt-0.5 flex items-center justify-end gap-1">
                            <span className="text-[9px] text-gray-500">10:24 AM</span>
                            <CheckCircle2 className="h-2.5 w-2.5 text-blue-500" aria-hidden />
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-xl rounded-tl-sm bg-white px-3 py-2 shadow-sm">
                          <p className="text-[11px] leading-relaxed text-gray-800">Around $600k - $800k</p>
                          <span className="float-right ms-2 mt-0.5 text-[9px] text-gray-400">10:25 AM</span>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <div className="relative max-w-[85%] rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 shadow-sm">
                          <div className="absolute -left-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 shadow-md">
                            <Sparkles className="h-2 w-2 text-white" aria-hidden />
                          </div>
                          <p className="text-[11px] leading-relaxed text-gray-800">Perfect! I have 3 great options in Coral Gables.</p>
                          <div className="mt-1.5 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[10px] font-medium text-white">
                            <Calendar className="h-3 w-3" aria-hidden />
                            Schedule Showing
                          </div>
                          <div className="mt-1 flex items-center justify-end gap-1">
                            <span className="text-[9px] text-gray-500">10:25 AM</span>
                            <CheckCircle2 className="h-2.5 w-2.5 text-blue-500" aria-hidden />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 bg-[#f0f0f0] px-2 py-1.5">
                      <Smile className="h-5 w-5 text-gray-500" aria-hidden />
                      <div className="flex-1 rounded-full bg-white px-3 py-1.5 text-[11px] text-gray-400 shadow-sm">{t("rgeNeighborhood.typeMessage")}</div>
                      <Paperclip className="h-4 w-4 text-gray-500" aria-hidden />
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 shadow-md">
                        <Send className="ms-0.5 h-3.5 w-3.5 text-white" aria-hidden />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute -right-2 top-16 w-40 rounded-xl border border-gray-100 bg-white p-3 shadow-xl lg:-right-6">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100">
                      <Target className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                    </div>
                    <span className="text-[10px] font-semibold text-gray-700">{t("rgeApp.leadScore")}</span>
                  </div>
                  <div className="flex items-end gap-1.5">
                    <span className="text-2xl font-bold text-emerald-600">87</span>
                    <span className="mb-1 text-[10px] text-gray-400">/100</span>
                  </div>
                  <div className="mt-1.5 h-1 w-full rounded-full bg-gray-100">
                    <div className="h-1 w-[87%] rounded-full bg-emerald-500" />
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" aria-hidden />
                      <span className="text-gray-600">{t("rgeNeighborhood.budgetQualified")}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" aria-hidden />
                      <span className="text-gray-600">Timeline: 2 months</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <AlertCircle className="h-2.5 w-2.5 text-amber-500" aria-hidden />
                      <span className="text-gray-600">{t("rgeNeighborhood.financingPending")}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <WorkflowWalkthrough config={realtorWorkflowWalkthrough} locale={workflowLocale(i18n.resolvedLanguage ?? i18n.language)} />

        <section id="rge-whats-included" className="mb-6 scroll-mt-24 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm md:p-8">
          <h2 className="mb-1 text-xl font-bold text-gray-900 md:text-2xl">{t("rgeApp.included")}</h2>
          <p className="mb-6 text-sm text-gray-500">{t("rgeApp.includedHelp")}</p>

          <div className="grid gap-4 md:grid-cols-3">
            {includedItems.map(({ Icon, t, d }) => (
              <div
                key={t}
                className="group flex cursor-default items-start gap-3 rounded-xl p-3 transition-colors hover:bg-gray-50"
              >
                <div className="flex-shrink-0 rounded-lg bg-gray-100 p-2 text-gray-600 transition-colors group-hover:bg-emerald-50 group-hover:text-emerald-600">
                  <Icon className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <h3 className="mb-0.5 text-sm font-semibold text-gray-900">{t}</h3>
                  <p className="text-xs leading-relaxed text-gray-500">{d}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm md:p-8" id="rge-architecture">
          <h2 className="mb-1 text-xl font-bold text-gray-900 md:text-2xl">{t("rgeApp.architecture")}</h2>
          <p className="mb-6 text-sm text-gray-500">
            {t("rgeApp.architectureHelp")}
          </p>

          <div className="relative rounded-xl border border-gray-200 bg-gray-50 p-4 md:p-6">
            <div className="hidden items-center justify-between gap-2 lg:flex">
              <div className="max-w-[100px] flex-1">
                <div className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm">
                  <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                    <MessageCircle className="h-3.5 w-3.5 text-gray-600" aria-hidden />
                  </div>
                  <p className="text-center text-[10px] font-semibold text-gray-800">{t("rgeApp.newInquiry")}</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
              <div className="max-w-[100px] flex-1">
                <div className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm">
                  <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                  </div>
                  <p className="text-center text-[10px] font-semibold text-gray-800">{t("rgeApp.aiReply")}</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
              <div className="max-w-[100px] flex-1">
                <div className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm">
                  <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                    <Filter className="h-3.5 w-3.5 text-gray-600" aria-hidden />
                  </div>
                  <p className="text-center text-[10px] font-semibold text-gray-800">{t("rgeApp.qualify")}</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
              <div className="max-w-[100px] flex-1">
                <div className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm">
                  <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                    <Target className="h-3.5 w-3.5 text-gray-600" aria-hidden />
                  </div>
                  <p className="text-center text-[10px] font-semibold text-gray-800">{t("rgeApp.intentScore")}</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
              <div className="flex shrink-0 flex-col gap-1">
                <div className="flex items-center gap-1.5 rounded border border-emerald-200/60 bg-emerald-50/70 px-2 py-1">
                  <Calendar className="h-3 w-3 text-emerald-600" aria-hidden />
                  <span className="text-[9px] font-medium text-gray-700">{t("rgeApp.booking")}</span>
                </div>
                <div className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2 py-1">
                  <Timer className="h-3 w-3 text-gray-500" aria-hidden />
                  <span className="text-[9px] font-medium text-gray-600">{t("inboxUi.followUp")}</span>
                </div>
                <div className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2 py-1">
                  <UserCheck className="h-3 w-3 text-gray-500" aria-hidden />
                  <span className="text-[9px] font-medium text-gray-600">{t("rgeApp.handoff")}</span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
              <div className="max-w-[110px] flex-1">
                <div className="rounded-xl border-2 border-emerald-200 bg-white p-2.5 shadow-sm">
                  <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600">
                    <ClipboardList className="h-3.5 w-3.5 text-white" aria-hidden />
                  </div>
                  <p className="text-center text-[10px] font-semibold text-gray-800">{t("rgeApp.crmUpdate")}</p>
                  <div className="mt-1 flex justify-center gap-0.5">
                    <Badge className="border-0 bg-gray-100 px-1 py-0 text-[7px] text-gray-600">stage</Badge>
                    <Badge className="border-0 bg-gray-100 px-1 py-0 text-[7px] text-gray-600">tag</Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-2 hidden flex-wrap items-center justify-center gap-3 md:flex lg:hidden">
              <div className="flex items-center gap-2">
                <div className="w-[80px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                  <div className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-gray-100">
                    <MessageCircle className="h-3 w-3 text-gray-600" aria-hidden />
                  </div>
                  <p className="text-center text-[9px] font-semibold text-gray-800">{t("rgeApp.inquiry")}</p>
                </div>
                <ArrowRight className="h-3 w-3 text-gray-300" aria-hidden />
                <div className="w-[80px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                  <div className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded border border-emerald-200 bg-emerald-50">
                    <Sparkles className="h-3 w-3 text-emerald-600" aria-hidden />
                  </div>
                  <p className="text-center text-[9px] font-semibold text-gray-800">{t("rgeApp.aiReply")}</p>
                </div>
                <ArrowRight className="h-3 w-3 text-gray-300" aria-hidden />
                <div className="w-[80px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                  <div className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-gray-100">
                    <Filter className="h-3 w-3 text-gray-600" aria-hidden />
                  </div>
                  <p className="text-center text-[9px] font-semibold text-gray-800">{t("rgeApp.qualify")}</p>
                </div>
                <ArrowRight className="h-3 w-3 text-gray-300" aria-hidden />
                <div className="w-[80px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                  <div className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-gray-100">
                    <Target className="h-3 w-3 text-gray-600" aria-hidden />
                  </div>
                  <p className="text-center text-[9px] font-semibold text-gray-800">{t("rgeApp.score")}</p>
                </div>
              </div>
              <div className="mt-2 flex w-full items-center justify-center gap-3">
                <div className="flex gap-1.5">
                  <div className="flex items-center gap-1 rounded border border-emerald-200/60 bg-emerald-50/70 px-2 py-1">
                    <Calendar className="h-2.5 w-2.5 text-emerald-600" aria-hidden />
                    <span className="text-[8px] font-medium text-gray-700">{t("inboxUi.book")}</span>
                  </div>
                  <div className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1">
                    <Timer className="h-2.5 w-2.5 text-gray-500" aria-hidden />
                    <span className="text-[8px] text-gray-600">{t("rgeApp.nurture")}</span>
                  </div>
                  <div className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1">
                    <UserCheck className="h-2.5 w-2.5 text-gray-500" aria-hidden />
                    <span className="text-[8px] text-gray-600">{t("rgeApp.human")}</span>
                  </div>
                </div>
                <ArrowRight className="h-3 w-3 text-gray-300" aria-hidden />
                <div className="w-[90px] rounded-lg border-2 border-emerald-200 bg-white p-2 shadow-sm">
                  <div className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded bg-emerald-600">
                    <ClipboardList className="h-3 w-3 text-white" aria-hidden />
                  </div>
                  <p className="text-center text-[9px] font-semibold text-gray-800">CRM</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 md:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                  <MessageCircle className="h-4 w-4 text-gray-600" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800">{t("rgeApp.inquiryReceived")}</p>
                  <p className="text-[10px] text-gray-500">{t("rgeApp.inboundChannels")}</p>
                </div>
              </div>
              <div className="ms-4 h-3 w-px bg-gray-200" />
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50">
                  <Sparkles className="h-4 w-4 text-emerald-600" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800">{t("rgeApp.instantReply")}</p>
                  <p className="text-[10px] text-gray-500">{t("rgeApp.contextReply")}</p>
                </div>
              </div>
              <div className="ms-4 h-3 w-px bg-gray-200" />
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                  <Filter className="h-4 w-4 text-gray-600" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800">{t("rgeApp.qualification")}</p>
                  <p className="text-[10px] text-gray-500">{t("rgeApp.budgetTimeline")}</p>
                </div>
              </div>
              <div className="ms-4 h-3 w-px bg-gray-200" />
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                  <Target className="h-4 w-4 text-gray-600" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800">{t("rgeApp.intentScoring")}</p>
                  <p className="text-[10px] text-gray-500">{t("rgeApp.qualificationScore")}</p>
                </div>
              </div>
              <div className="ms-4 h-3 w-px bg-gray-200" />
              <div className="ms-11 flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5 rounded border border-emerald-200/60 bg-emerald-50/70 px-2.5 py-1.5">
                  <Calendar className="h-3 w-3 text-emerald-600" aria-hidden />
                  <span className="text-[10px] font-medium text-gray-700">{t("rgeApp.booking")}</span>
                </div>
                <div className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2.5 py-1.5">
                  <Timer className="h-3 w-3 text-gray-500" aria-hidden />
                  <span className="text-[10px] text-gray-600">{t("inboxUi.followUp")}</span>
                </div>
                <div className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2.5 py-1.5">
                  <UserCheck className="h-3 w-3 text-gray-500" aria-hidden />
                  <span className="text-[10px] text-gray-600">{t("rgeApp.handoff")}</span>
                </div>
              </div>
              <div className="ms-4 h-3 w-px bg-gray-200" />
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600">
                  <ClipboardList className="h-4 w-4 text-white" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800">{t("rgeApp.crmUpdate")}</p>
                  <div className="mt-0.5 flex gap-1">
                    <Badge className="border-0 bg-gray-100 px-1.5 py-0 text-[8px] text-gray-600">stage</Badge>
                    <Badge className="border-0 bg-gray-100 px-1.5 py-0 text-[8px] text-gray-600">tag</Badge>
                    <Badge className="border-0 bg-gray-100 px-1.5 py-0 text-[8px] text-gray-600">score</Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50/50 px-4 py-2.5 text-sm text-gray-600">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <span className="text-xs">{t("rgeApp.crmAccurate")}</span>
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm md:p-8">
          <h2 className="mb-1 text-xl font-bold text-gray-900 md:text-2xl">{t("rgeApp.workspace")}</h2>
          <p className="mb-6 text-sm text-gray-500">
            {t("rgeApp.workspaceHelp")}
          </p>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="group">
              <div className="mb-3 overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-emerald-200 hover:shadow-md">
                <div className="flex items-center justify-between bg-gray-800 px-3 py-2">
                  <span className="text-[10px] font-semibold text-white">{t("inboxUi.inbox")}</span>
                  <div className="flex items-center gap-1.5">
                    <Search className="h-3 w-3 text-white/60" aria-hidden />
                    <Bell className="h-3 w-3 text-white/60" aria-hidden />
                  </div>
                </div>
                <div className="space-y-1.5 p-2">
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 p-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200">
                      <span className="text-[8px] font-bold text-gray-600">SM</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[9px] font-semibold text-gray-800">Sarah Mitchell</p>
                      <p className="truncate text-[8px] text-gray-500">3BR in Miami...</p>
                    </div>
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[8px] text-white">3</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg p-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200">
                      <span className="text-[8px] font-bold text-gray-600">JD</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[9px] font-semibold text-gray-800">John Davis</p>
                      <p className="truncate text-[8px] text-gray-500">Property viewing?</p>
                    </div>
                  </div>
                </div>
                <div className="border-t border-gray-100 bg-gray-50 p-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-emerald-600" aria-hidden />
                    <span className="text-[9px] font-medium text-gray-600">AI: Reply with times</span>
                  </div>
                </div>
              </div>
              <h3 className="mb-0.5 text-sm font-semibold text-gray-900">{t("rgeApp.inboxCopilot")}</h3>
              <p className="text-xs leading-relaxed text-gray-500">{t("rgeApp.inboxCopilotHelp")}</p>
            </div>

            <div className="group">
              <div className="mb-3 overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-emerald-200 hover:shadow-md">
                <div className="flex items-center justify-between bg-gray-800 px-3 py-2">
                  <span className="text-[10px] font-semibold text-white">{t("nav.automations")}</span>
                  <Plus className="h-3 w-3 text-white/60" aria-hidden />
                </div>
                <div className="bg-gray-50 p-3">
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-[8px] font-medium text-gray-700">
                      <Zap className="h-2.5 w-2.5 text-gray-500" aria-hidden /> New Lead
                    </div>
                    <div className="h-2 w-px bg-gray-300" />
                    <div className="flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[8px] font-medium text-emerald-700">
                      <Sparkles className="h-2.5 w-2.5" aria-hidden /> AI Qualify
                    </div>
                    <div className="h-2 w-px bg-gray-300" />
                    <div className="flex items-center gap-1.5">
                      <div className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[7px] font-medium text-gray-600">{t("rgeNeighborhood.wait")}</div>
                      <div className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[7px] font-medium text-gray-600">{t("rgeNeighborhood.ifReply")}</div>
                    </div>
                    <div className="h-2 w-px bg-gray-300" />
                    <div className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-[8px] font-medium text-gray-700">
                      <Calendar className="h-2.5 w-2.5 text-gray-500" aria-hidden /> {t("inboxUi.book")}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
                  <span className="text-[8px] text-gray-500">{t("rgeNeighborhood.leadNurture")}</span>
                  <Badge className="border-0 bg-emerald-100 px-1.5 py-0 text-[7px] text-emerald-700">{t("inboxUi.active")}</Badge>
                </div>
              </div>
              <h3 className="mb-0.5 text-sm font-semibold text-gray-900">{t("rgeApp.flowAutomation")}</h3>
              <p className="text-xs leading-relaxed text-gray-500">{t("rgeApp.flowAutomationHelp")}</p>
            </div>

            <div className="group">
              <div className="mb-3 overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-emerald-200 hover:shadow-md">
                <div className="flex items-center justify-between bg-gray-800 px-3 py-2">
                  <span className="text-[10px] font-semibold text-white">{t("rgeNeighborhood.pipeline")}</span>
                  <Filter className="h-3 w-3 text-white/60" aria-hidden />
                </div>
                <div className="flex gap-1.5 overflow-hidden p-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 px-0.5 text-[7px] font-medium text-gray-500">{t("rge.preview.lead3Tag")}</div>
                    <div className="space-y-1 rounded bg-gray-50 p-1">
                      <div className="rounded border border-gray-100 bg-white p-1.5 shadow-sm">
                        <p className="text-[8px] font-medium text-gray-800">Sarah M.</p>
                        <span className="text-[7px] text-emerald-600">$600k</span>
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 px-0.5 text-[7px] font-medium text-gray-500">{t("rgeNeighborhood.qualified")}</div>
                    <div className="space-y-1 rounded bg-emerald-50/50 p-1">
                      <div className="rounded border border-gray-100 bg-white p-1.5 shadow-sm">
                        <p className="text-[8px] font-medium text-gray-800">John D.</p>
                        <span className="text-[7px] text-gray-600">$800k</span>
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 px-0.5 text-[7px] font-medium text-gray-500">{t("rgeNeighborhood.showing")}</div>
                    <div className="rounded bg-gray-50 p-1">
                      <div className="rounded border border-gray-100 bg-white p-1.5 shadow-sm">
                        <p className="text-[8px] font-medium text-gray-800">Mike R.</p>
                        <span className="text-[7px] text-gray-500">{t("rgeNeighborhood.tomorrow")}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
                  <span className="text-[8px] text-gray-500">12 leads</span>
                  <span className="text-[8px] font-medium text-emerald-600">$4.2M</span>
                </div>
              </div>
              <h3 className="mb-0.5 text-sm font-semibold text-gray-900">{t("rgeApp.pipelineTasks")}</h3>
              <p className="text-xs leading-relaxed text-gray-500">{t("rgeApp.pipelineTasksHelp")}</p>
            </div>

            <div className="group">
              <div className="mb-3 overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-emerald-200 hover:shadow-md">
                <div className="flex items-center justify-between bg-gray-800 px-3 py-2">
                  <span className="text-[10px] font-semibold text-white">{t("nav.templates")}</span>
                  <Settings className="h-3 w-3 text-white/60" aria-hidden />
                </div>
                <div className="space-y-1.5 p-2">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-2">
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="text-[9px] font-semibold text-gray-800">Re-engagement</span>
                      <Badge className="border-0 bg-emerald-100 px-1 py-0 text-[7px] text-emerald-700">{t("rgeNeighborhood.approved")}</Badge>
                    </div>
                    <p className="text-[8px] text-gray-500">
                      Hi {"{name}"}, following up on...
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-white p-2">
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="text-[9px] font-semibold text-gray-800">{t("rgeNeighborhood.showingReminder")}</span>
                      <Badge className="border-0 bg-emerald-100 px-1 py-0 text-[7px] text-emerald-700">{t("rgeNeighborhood.approved")}</Badge>
                    </div>
                    <p className="text-[8px] text-gray-500">Reminder: Showing on {"{date}"}...</p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-white p-2">
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="text-[9px] font-semibold text-gray-800">Re-engagement</span>
                      <Badge className="border-0 bg-gray-100 px-1 py-0 text-[7px] text-gray-600">{t("inboxUi.conversationPending")}</Badge>
                    </div>
                    <p className="text-[8px] text-gray-500">New listings that match...</p>
                  </div>
                </div>
              </div>
              <h3 className="mb-0.5 text-sm font-semibold text-gray-900">{t("rgeApp.templateFollowup")}</h3>
              <p className="text-xs leading-relaxed text-gray-500">{t("rgeApp.templateFollowupHelp")}</p>
            </div>
          </div>
        </section>

        {status === "locked" && (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <section
            className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm"
            id="rge-requirements"
          >
            <h2 className="mb-1 text-lg font-bold text-gray-900">{t("rgeApp.requirements")}</h2>
            <p className="mb-4 text-xs text-gray-500">{t("rgeApp.requirementsHelp")}</p>
            <div className="space-y-2.5">
              {[
                t("rgeApp.needsPro"),
                t("rgeApp.needsBrain"),
                t("rgeApp.needsWhatsApp"),
                t("rgeApp.needsTemplate"),
                t("rgeApp.conciergePro"),
              ].map((line) => (
                <div key={line} className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <Check className="h-2.5 w-2.5 text-emerald-600" aria-hidden />
                  </div>
                  <span className="text-sm text-gray-600">{line}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[10px] leading-relaxed text-gray-400">
              {t("rgeApp.metaFees")}
            </p>
            <p className="text-sm text-muted-foreground">{t("rgeApp.globalPages")}
            </p>
          </section>

          <section className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-lg font-bold text-gray-900">{t("rgeApp.concierge")}</h2>
            <p className="mb-4 text-xs text-gray-500">{t("rgeApp.conciergeHelp")}</p>
            <div className="space-y-2.5">
              {[
                t("rgeApp.conciergeSetup"),
                t("rgeApp.conciergeChannels"),
                t("rgeApp.conciergeWorkflows"),
                t("rgeApp.conciergeOptimize"),
                t("rgeApp.conciergeChecklist"),
              ].map((line) => (
                <div key={line} className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <Check className="h-2.5 w-2.5 text-emerald-600" aria-hidden />
                  </div>
                  <span className="text-sm text-gray-600">{line}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
        )}

        {status === "locked" ? (
          <section className="rounded-2xl border border-gray-200/80 bg-white px-6 py-10 text-center shadow-sm md:px-10 md:py-12">
            <h2 className="mb-2 text-2xl font-semibold tracking-tight text-gray-900 md:text-3xl">
              {t("rgeApp.readyTitle")}
            </h2>
            <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-gray-600">
              {isPaused
                ? t("rgeApp.activePlanNeeded")
                : t("rgeApp.installWithPro")}
            </p>
            {templateData?.subscription?.accessOk === false ? (
              <InAppProUpgradeButton
                canStartInternalTrial={!!billingAccount?.subscription?.canStartInternalTrial}
                isShopify={isShopify}
                className="min-w-[200px] rounded-xl bg-gray-900 px-8 text-white shadow-sm hover:bg-gray-800"
                testId="button-bottom-cta"
                onStartedTrial={() => window.location.reload()}
              />
            ) : (
              <Button
                size="lg"
                className={cn(
                  "min-w-[200px] rounded-xl bg-gray-900 px-8 text-white shadow-sm hover:bg-gray-800",
                  (primaryMarketingCta.disabled || installMutation.isPending) && "pointer-events-none opacity-50",
                )}
                onClick={handlePrimaryCta}
                disabled={installMutation.isPending || primaryMarketingCta.disabled}
                data-testid="button-bottom-cta"
              >
              {checkingSubscription ? (
                <>
                  <Loader2 className="me-2 h-5 w-5 animate-spin" />
                  {t("rgeApp.checking")}
                </>
              ) : installMutation.isPending ? (
                <>
                  <Loader2 className="me-2 h-5 w-5 animate-spin" />
                  {t("rgeApp.installing")}
                </>
              ) : (
                <>
                  {primaryMarketingCta.label}
                  {!primaryMarketingCta.disabled && <ChevronRight className="ms-1.5 h-5 w-5 rtl:rotate-180" />}
                </>
              )}
              </Button>
            )}
            <p className="mt-4 text-xs text-gray-500">{t("rgeApp.proIncluded")}</p>
          </section>
        ) : hasPurchased && !onboardingComplete ? (
          <section
            className="rounded-2xl border border-gray-200/80 bg-gradient-to-br from-emerald-50/30 via-white to-white px-6 py-10 text-center shadow-sm md:px-10 md:py-12"
            data-testid="section-bottom-onboarding-cta"
          >
            <h2 className="mb-2 text-2xl font-semibold tracking-tight text-gray-900 md:text-3xl">
              {t("rgeApp.finishTitle")}
            </h2>
            <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-gray-600">
              {t("rgeApp.resumeLaunch")}
            </p>
            <Button
              size="lg"
              className="min-w-[200px] rounded-xl bg-gray-900 px-8 text-white shadow-sm hover:bg-gray-800"
              onClick={() => setLocation(RGE_TEMPLATE_ONBOARDING_PATH)}
              data-testid="button-bottom-cta"
            >
              {detailCta}
              <ChevronRight className="ms-1.5 h-5 w-5 rtl:rotate-180" />
            </Button>
          </section>
        ) : null}
      </main>
      </div>
    );
  };
  const workflowTitle = (workflow: { key: string; name: string }) => {
    switch (workflow.key) {
      case "W1": return t("rgeApp.w1Name");
      case "W2": return t("rgeApp.w2Name");
      case "W3": return t("rgeApp.w3Name");
      case "W4": return t("rgeApp.w4Name");
      case "W5": return t("rgeApp.w5Name");
      case "W6": return t("rgeApp.w6Name");
      case "W7": return t("rgeApp.w7Name");
      case "W8": return t("rgeApp.w8Name");
      default: return workflow.name;
    }
  };
  const workflowStatusLabel = (status: string) => {
    switch (status) {
      case "Running": return t("rgeApp.running");
      case "Warning": return t("rgeApp.warning");
      case "Disabled": return t("rgeApp.disabled");
      default: return t("rgeApp.checkingStatus");
    }
  };

  const WORKFLOW_DESCRIPTIONS: Record<string, { summary: string; triggers: string; timing: string }> = {
    W1: { summary: t("rgeApp.w1Summary"), triggers: t("rgeApp.w1Trigger"), timing: t("rgeApp.w1Timing") },
    W2: { summary: t("rgeApp.w2Summary"), triggers: t("rgeApp.w2Trigger"), timing: t("rgeApp.w2Timing") },
    W3: { summary: t("rgeApp.w3Summary"), triggers: t("rgeApp.w3Trigger", { keywords: "call, book, available, tour, showing, visit, schedule" }), timing: t("rgeApp.keywordTiming") },
    W4: { summary: t("rgeApp.w4Summary"), triggers: t("rgeApp.noReplyTrigger"), timing: t("rgeApp.w4Timing") },
    W5: { summary: t("rgeApp.w5Summary"), triggers: t("rgeApp.noReplyTrigger"), timing: t("rgeApp.w5Timing") },
    W6: { summary: t("rgeApp.w6Summary"), triggers: t("rgeApp.noReplyTrigger"), timing: t("rgeApp.w6Timing") },
    W7: { summary: t("rgeApp.w7Summary"), triggers: t("rgeApp.w7Trigger", { keywords: "stop, unsubscribe, spam, not interested, remove" }), timing: t("rgeApp.keywordTiming") },
    W8: { summary: t("rgeApp.w8Summary"), triggers: t("rgeApp.w8Trigger"), timing: t("rgeApp.w8Timing") },
  };

  const WORKFLOW_FIELDS: Record<string, string[]> = {
    W2: [
      "buyerKeywords", "sellerKeywords", "investorKeywords",
      "financialKeywords", "budgetKeywords", "timelineKeywords", "bookingKeywords",
      "askFinancingFollowUp", "askBudgetFollowUp", "askTimelineFollowUp", "limitOneQuestion",
      "financingQuestion", "budgetQuestion", "timelineQuestion", "lenderQuestion",
    ],
    W3: ["appointmentIntentKeywords", "bookingLink"],
  };

  const GLOBAL_PREF_DEFAULTS: Record<string, any> = {
    serviceTerritory: "",
    priceMin: 0,
    priceMax: 0,
    includeKeywords: "",
    excludeKeywords: "",
    preferredLanguage: "en",
  };

  const WORKFLOW_PREF_DEFAULTS: Record<string, Record<string, any>> = {
    W2: {
      buyerKeywords: "buy, purchase, looking for, apartment, house, condo",
      sellerKeywords: "sell, listing, list my, market value",
      investorKeywords: "invest, roi, return, flip, portfolio",
      financialKeywords: "pre approved, preapproved, mortgage, lender, financing, loan, down payment, credit score, cash buyer, cash, fha, va, conventional",
      budgetKeywords: "budget, price range, max price, up to, around, afford, under, over, million",
      timelineKeywords: "asap, immediately, this month, next month, 30 days, 60 days, 90 days, 3 months, soon, just browsing, researching",
      bookingKeywords: "tour, showing, visit, schedule, appointment, call, see property, viewing",
      askFinancingFollowUp: true,
      askBudgetFollowUp: true,
      askTimelineFollowUp: true,
      limitOneQuestion: true,
      financingQuestion: "Are you currently pre-approved, working with a lender, or still exploring financing options?",
      budgetQuestion: "Do you have a budget or price range in mind?",
      timelineQuestion: "Are you planning to move soon, or are you still exploring options?",
      lenderQuestion: "If helpful, I can also connect you with a lender for pre-approval guidance.",
    },
    W3: { appointmentIntentKeywords: "call, book, available, tour, showing, visit, schedule", bookingLink: "https://calendly.com/your-profile/showing" },
  };

  const DashboardView = () => {
    interface ServiceConfig {
      type: string;
      name: string;
      enabled: boolean;
      keywords: string;
      offerMessage: string;
      routingType: "contact_info" | "link" | "task";
      partnerName: string;
      contact: string;
      link: string;
      tags: string[];
    }

    const DEFAULT_ROUTING_SERVICES: ServiceConfig[] = [
      {
        type: "lender", name: "Lender",
        enabled: false,
        keywords: "mortgage, lender, financing, pre approved, loan, credit, down payment",
        offerMessage: "Would you like me to connect you with a lender to get pre-approved?",
        routingType: "task", partnerName: "", contact: "", link: "",
        tags: ["Needs Financing"],
      },
      {
        type: "movers", name: "Moving Service",
        enabled: false,
        keywords: "moving, movers, relocate, relocation, packing, shipping",
        offerMessage: "If helpful, I can connect you with a trusted moving company. Want me to send details?",
        routingType: "task", partnerName: "", contact: "", link: "",
        tags: ["Moving Service Requested"],
      },
    ];

    const [selectedWf, setSelectedWf] = useState<any>(null);
    const [modalTab, setModalTab] = useState<string>("preview");
    const [localPrefs, setLocalPrefs] = useState<Record<string, any>>({});
    const [routingServices, setRoutingServices] = useState<ServiceConfig[]>(DEFAULT_ROUTING_SERVICES);
    const [saving, setSaving] = useState(false);

    const { data: prefsData } = useQuery({
      queryKey: ["/api/templates/realtor-growth-engine/preferences"],
      enabled: status === 'installed',
    });

    const { data: routingData } = useQuery({
      queryKey: ["/api/templates/realtor-growth-engine/routing-config"],
      enabled: status === 'installed',
    });

    const { data: engineStatusData } = useQuery({
      queryKey: ["/api/templates/realtor-growth-engine/status"],
      enabled: status === "installed",
    });
    const calendlyConnected = !!(engineStatusData as { calendlyConnected?: boolean } | undefined)?.calendlyConnected;

    const savedPrefs = (prefsData as any)?.preferences || {};

    const openModal = (wf: any) => {
      const wfKey = wf.key;
      const merged: Record<string, any> = { ...GLOBAL_PREF_DEFAULTS, ...savedPrefs };
      if (WORKFLOW_PREF_DEFAULTS[wfKey]) {
        for (const [k, v] of Object.entries(WORKFLOW_PREF_DEFAULTS[wfKey])) {
          if (merged[`${wfKey}_${k}`] === undefined) merged[`${wfKey}_${k}`] = v;
          else merged[`${wfKey}_${k}`] = merged[`${wfKey}_${k}`];
        }
      }
      setLocalPrefs(merged);
      // Load saved routing services or use defaults
      const savedRouting = (routingData as any)?.services;
      if (savedRouting && Array.isArray(savedRouting) && savedRouting.length > 0) {
        setRoutingServices(savedRouting);
      } else {
        setRoutingServices(DEFAULT_ROUTING_SERVICES);
      }
      setSelectedWf(wf);
      setModalTab("preview");
    };

    const handleSave = async () => {
      setSaving(true);
      try {
        const prefsToSave = { ...localPrefs };
        if (calendlyConnected) {
          delete prefsToSave.W3_bookingLink;
        }
        const savePrefs = apiRequest("PUT", "/api/templates/realtor-growth-engine/preferences", { preferences: prefsToSave });
        const saveRouting = selectedWf?.key === "W2"
          ? apiRequest("PUT", "/api/templates/realtor-growth-engine/routing-config", { services: routingServices })
          : Promise.resolve();
        await Promise.all([savePrefs, saveRouting]);
        queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine/preferences"] });
        queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine/routing-config"] });
        queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine/status"] });
        toast({ title: t("rgeApp.settingsSaved"), description: t("rgeApp.prefsUpdated", { workflow: selectedWf ? workflowTitle(selectedWf) : "" }) });
        setSelectedWf(null);
      } catch {
        toast({ title: t("common.error"), description: t("rgeApp.settingsFailed"), variant: "destructive" });
      } finally {
        setSaving(false);
      }
    };

    const handleRestore = () => {
      if (!selectedWf) return;
      const wfKey = selectedWf.key;
      const restored: Record<string, any> = { ...localPrefs };
      for (const [k, v] of Object.entries(GLOBAL_PREF_DEFAULTS)) {
        restored[k] = v;
      }
      if (WORKFLOW_PREF_DEFAULTS[wfKey]) {
        for (const [k, v] of Object.entries(WORKFLOW_PREF_DEFAULTS[wfKey])) {
          restored[`${wfKey}_${k}`] = v;
        }
      }
      setLocalPrefs(restored);
      toast({ title: t("rgeApp.defaultsRestored"), description: t("rgeApp.defaultsHint") });
    };

    const updatePref = (key: string, value: any) => {
      if (localPrefs[key] === value) return;
      setLocalPrefs(prev => ({ ...prev, [key]: value }));
    };

    const msgTemplates = (assetsData?.assets?.find((a) => a.assetType === "message_templates")?.definition as { templates?: unknown[] } | undefined)?.templates ?? [];

    const getWorkflowTemplates = (wf: any) => {
      if (!wf) return [];
      const templateKeys = (wf.actions || [])
        .filter((a: any) => a.type === 'send_message_template')
        .map((a: any) => a.templateKey);
      return (msgTemplates as Array<{ key?: string }>).filter((t) => templateKeys.includes(t.key));
    };

    const hasWorkflowSpecificFields = (wfKey: string) => !!WORKFLOW_FIELDS[wfKey];

    const renderGlobalFields = () => (
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium">{t("rgeApp.territory")}</Label>
          <Input
            placeholder={t("rgeApp.territoryExample")}
            value={localPrefs.serviceTerritory || ""}
            onChange={e => updatePref("serviceTerritory", e.target.value)}
            className="mt-1"
            data-testid="input-service-territory"
          />
          <p className="text-[11px] text-muted-foreground mt-1">{t("rgeApp.territoryHelp")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-sm font-medium">{t("rgeApp.minPrice")}</Label>
            <Input
              type="number"
              placeholder="0"
              value={localPrefs.priceMin || ""}
              onChange={e => updatePref("priceMin", Number(e.target.value))}
              className="mt-1"
              data-testid="input-price-min"
            />
          </div>
          <div>
            <Label className="text-sm font-medium">{t("rgeApp.maxPrice")}</Label>
            <Input
              type="number"
              placeholder="0"
              value={localPrefs.priceMax || ""}
              onChange={e => updatePref("priceMax", Number(e.target.value))}
              className="mt-1"
              data-testid="input-price-max"
            />
          </div>
        </div>
        <div>
          <Label className="text-sm font-medium">{t("rgeApp.includeKeywords")}</Label>
          <Input
            placeholder={t("rgeApp.includeExample")}
            value={localPrefs.includeKeywords || ""}
            onChange={e => updatePref("includeKeywords", e.target.value)}
            className="mt-1"
            data-testid="input-include-keywords"
          />
          <p className="text-[11px] text-muted-foreground mt-1">{t("rgeApp.includeHelp")}</p>
        </div>
        <div>
          <Label className="text-sm font-medium">{t("rgeApp.excludeKeywords")}</Label>
          <Input
            placeholder={t("rgeApp.excludeExample")}
            value={localPrefs.excludeKeywords || ""}
            onChange={e => updatePref("excludeKeywords", e.target.value)}
            className="mt-1"
            data-testid="input-exclude-keywords"
          />
          <p className="text-[11px] text-muted-foreground mt-1">{t("rgeApp.excludeHelp")}</p>
        </div>
        <div>
          <Label className="text-sm font-medium">{t("rgeApp.preferredLanguage")}</Label>
          <RgeSelect
            value={localPrefs.preferredLanguage || "en"}
            onValueChange={(v) => {
              const server = savedPrefs.preferredLanguage || "en";
              logRgeSelect("RealtorGrowthEngine", "preferredLanguage", server, localPrefs.preferredLanguage, v, "change");
              if (v === (localPrefs.preferredLanguage || "en")) return;
              updatePref("preferredLanguage", v);
            }}
           className="mt-1" data-testid="select-preferred-language">
            <option value="en">{t("rgeApp.english")}</option>
            <option value="es">{t("rgeApp.spanish")}</option>
            <option value="he">{t("rgeApp.hebrew")}</option>
          </RgeSelect>
        </div>
      </div>
    );

    const renderW2Fields = () => {
      const kw = (field: string) => `W2_${field}`;
      const def = WORKFLOW_PREF_DEFAULTS.W2;
      const kwInput = (field: string, label: string, helperText: string) => (
        <div key={field}>
          <Label className="text-sm font-medium">{label}</Label>
          <Input
            placeholder={t("rgeApp.keywordExample")}
            value={localPrefs[kw(field)] ?? def[field] ?? ""}
            onChange={e => updatePref(kw(field), e.target.value)}
            className="mt-1"
            data-testid={`input-${field}`}
          />
          <p className="text-[11px] text-muted-foreground mt-1">{helperText}</p>
        </div>
      );
      const toggle = (field: string, label: string) => {
        const val = localPrefs[kw(field)] !== undefined ? localPrefs[kw(field)] : def[field];
        return (
          <div key={field} className="flex items-center justify-between py-1">
            <Label className="text-sm font-medium cursor-pointer">{label}</Label>
            <button
              type="button"
              role="switch"
              aria-checked={!!val}
              onClick={() => updatePref(kw(field), !val)}
              data-testid={`toggle-${field}`}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                val ? "bg-brand-green" : "bg-gray-300"
              )}
            >
              <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", val ? "translate-x-4" : "translate-x-1")} />
            </button>
          </div>
        );
      };
      const qaInput = (field: string, label: string) => (
        <div key={field}>
          <Label className="text-sm font-medium">{label}</Label>
          <Textarea
            rows={2}
            value={localPrefs[kw(field)] ?? def[field] ?? ""}
            onChange={e => updatePref(kw(field), e.target.value)}
            className="mt-1 text-sm resize-none"
            data-testid={`textarea-${field}`}
          />
        </div>
      );

      return (
        <div className="space-y-5 mt-4">
          <Separator />
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{t("rgeApp.leadType")}</p>
          {kwInput("buyerKeywords", t("rgeApp.buyerKeywords"), t("rgeApp.buyerKeywordsHelp"))}
          {kwInput("sellerKeywords", t("rgeApp.sellerKeywords"), t("rgeApp.sellerKeywordsHelp"))}
          {kwInput("investorKeywords", t("rgeApp.investorKeywords"), t("rgeApp.investorKeywordsHelp"))}

          <Separator />
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{t("rgeApp.financialReadiness")}</p>
          {kwInput("financialKeywords", t("rgeApp.financeKeywords"), t("rgeApp.financeKeywordsHelp"))}
          {kwInput("budgetKeywords", t("rgeApp.budgetKeywords"), t("rgeApp.budgetKeywordsHelp"))}
          {kwInput("timelineKeywords", t("rgeApp.timelineKeywords"), t("rgeApp.timelineKeywordsHelp"))}
          {kwInput("bookingKeywords", t("rgeApp.bookingKeywords"), t("rgeApp.bookingKeywordsHelp"))}

          <Separator />
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{t("rgeApp.qualificationFollowup")}</p>
          <p className="text-[11px] text-muted-foreground -mt-2">{t("rgeApp.nextQuestion")}</p>
          {toggle("askFinancingFollowUp", t("rgeApp.askFinance"))}
          {toggle("askBudgetFollowUp", t("rgeApp.askBudget"))}
          {toggle("askTimelineFollowUp", t("rgeApp.askTimeline"))}
          {toggle("limitOneQuestion", t("rgeApp.limitQuestions"))}

          <Separator />
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{t("rgeApp.followupTemplates")}</p>
          {qaInput("financingQuestion", t("rgeApp.financeQuestion"))}
          {qaInput("budgetQuestion", t("rgeApp.budgetQuestion"))}
          {qaInput("timelineQuestion", t("rgeApp.timelineQuestion"))}
          {qaInput("lenderQuestion", t("rgeApp.lenderQuestion"))}

          <Separator />
          <div>
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{t("rgeApp.serviceRouting")}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{t("rgeApp.routingHelp")}</p>
          </div>

          {routingServices.map((svc, idx) => {
            const update = (field: keyof typeof svc, value: any) => {
              setRoutingServices(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
            };
            return (
              <div key={svc.type} className="border rounded-xl overflow-hidden" data-testid={`service-block-${svc.type}`}>
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                  <p className="text-sm font-semibold text-gray-800">{svc.name}</p>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={svc.enabled}
                    onClick={() => update("enabled", !svc.enabled)}
                    data-testid={`toggle-service-${svc.type}`}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                      svc.enabled ? "bg-brand-green" : "bg-gray-300"
                    )}
                  >
                    <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", svc.enabled ? "translate-x-4" : "translate-x-1")} />
                  </button>
                </div>

                {svc.enabled && (
                  <div className="px-4 py-4 space-y-3 border-t bg-white">
                    <div>
                      <Label className="text-sm font-medium">{t("rgeApp.triggerKeywords")}</Label>
                      <Input
                        placeholder={t("rgeApp.triggerExample")}
                        value={svc.keywords}
                        onChange={e => update("keywords", e.target.value)}
                        className="mt-1"
                        data-testid={`input-routing-keywords-${svc.type}`}
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">{t("rgeApp.triggerHelp")}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">{t("rgeApp.offerMessage")}</Label>
                      <Textarea
                        rows={2}
                        value={svc.offerMessage}
                        onChange={e => update("offerMessage", e.target.value)}
                        className="mt-1 text-sm resize-none"
                        data-testid={`textarea-routing-offer-${svc.type}`}
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">{t("rgeApp.offerHelp")}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">{t("rgeApp.routingType")}</Label>
                      <RgeSelect
                        value={svc.routingType || "task"}
                        onValueChange={(v) => {
                          logRgeSelect(
                            "RealtorGrowthEngine",
                            `routingType-${svc.type}`,
                            svc.routingType,
                            svc.routingType,
                            v,
                            "change",
                          );
                          if (v === (svc.routingType || "task")) return;
                          update("routingType", v);
                        }}
                       className="mt-1" data-testid={`select-routing-type-${svc.type}`}>
                        <option value="task">{t("rgeApp.internalTask")}</option>
                        <option value="contact_info">{t("rgeApp.sendContact")}</option>
                        <option value="link">{t("rgeApp.sendScheduling")}</option>
                      </RgeSelect>
                    </div>
                    <Separator />
                    <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">{t("rgeApp.partnerDetails")}</p>
                    <div>
                      <Label className="text-sm font-medium">{t("rgeApp.partnerName")}</Label>
                      <Input
                        placeholder={t("rgeApp.partnerExample")}
                        value={svc.partnerName}
                        onChange={e => update("partnerName", e.target.value)}
                        className="mt-1"
                        data-testid={`input-partner-name-${svc.type}`}
                      />
                    </div>
                    {(svc.routingType === "contact_info" || svc.routingType === "task") && (
                      <div>
                        <Label className="text-sm font-medium">{t("rgeApp.contactInfo")}</Label>
                        <Input
                          dir="ltr" placeholder="e.g. +1 305 555 0100 or hello@partner.com"
                          value={svc.contact}
                          onChange={e => update("contact", e.target.value)}
                          className="mt-1"
                          data-testid={`input-partner-contact-${svc.type}`}
                        />
                      </div>
                    )}
                    {(svc.routingType === "link" || svc.routingType === "task") && (
                      <div>
                        <Label className="text-sm font-medium">{t("rgeApp.schedulingLink")}</Label>
                        <Input
                          dir="ltr" placeholder="https://calendly.com/..."
                          value={svc.link}
                          onChange={e => update("link", e.target.value)}
                          className="mt-1"
                          data-testid={`input-partner-link-${svc.type}`}
                        />
                      </div>
                    )}
                    <div>
                      <Label className="text-sm font-medium">{t("rgeApp.autoTag")}</Label>
                      <Input
                        value={svc.tags.join(", ")}
                        onChange={e => update("tags", e.target.value.split(",").map((t: string) => t.trim()).filter(Boolean))}
                        className="mt-1"
                        data-testid={`input-routing-tags-${svc.type}`}
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">{t("rgeApp.autoTagHelp")}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    };

    const renderWorkflowFields = (wfKey: string) => {
      const fields = WORKFLOW_FIELDS[wfKey];
      if (!fields) return null;

      if (wfKey === "W2") return renderW2Fields();

      return (
        <div className="space-y-4 mt-4">
          <Separator />
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{t("rgeApp.workflowSettings")}</p>
          {fields.map(field => {
            const prefKey = `${wfKey}_${field}`;
            if (field === "bookingLink") {
              if (calendlyConnected) {
                return (
                  <div key={field} className="rounded-md border border-sky-200 bg-sky-50/90 px-3 py-2.5 text-sm text-sky-950">
                    <p className="font-medium text-sky-950">{t("rgeApp.calendlyReady")}</p>
                    <p className="text-[11px] text-sky-900/85 mt-1.5 leading-snug">
                      {t("rgeApp.calendlyOnly")}
                    </p>
                  </div>
                );
              }
              return (
                <div key={field}>
                  <Label className="text-sm font-medium">{t("rgeApp.bookingLink")}</Label>
                  <Input
                    dir="ltr" placeholder="https://calendly.com/your-name/showing"
                    value={localPrefs[prefKey] || ""}
                    onChange={e => updatePref(prefKey, e.target.value)}
                    className="mt-1"
                    data-testid="input-booking-link"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {t("rgeApp.bookingLinkHelp")}
                  </p>
                </div>
              );
            }
            if (field === "followUpDelayHours") {
              return (
                <div key={field}>
                  <Label className="text-sm font-medium">{t("rgeApp.followupDelay")}</Label>
                  <RgeSelect
                    value={String(localPrefs[prefKey] ?? WORKFLOW_PREF_DEFAULTS[wfKey]?.[field] ?? 24)}
                    onValueChange={(v) => {
                      const current = String(localPrefs[prefKey] ?? WORKFLOW_PREF_DEFAULTS[wfKey]?.[field] ?? 24);
                      logRgeSelect(
                        "RealtorGrowthEngine",
                        `${wfKey}_${field}`,
                        savedPrefs[prefKey] ?? WORKFLOW_PREF_DEFAULTS[wfKey]?.[field] ?? 24,
                        localPrefs[prefKey],
                        v,
                        "change",
                      );
                      if (v === current) return;
                      updatePref(prefKey, Number(v));
                    }}
                   className="mt-1" data-testid={`select-${field}`}>
                    <option value="2">{t("rgeApp.hours2")}</option>
                    <option value="24">{t("rgeApp.hours24")}</option>
                    <option value="48">{t("rgeApp.hours48")}</option>
                    <option value="72">{t("rgeApp.hours72")}</option>
                    <option value="168">{t("rgeApp.days7")}</option>
                  </RgeSelect>
                  <p className="text-[11px] text-muted-foreground mt-1">{t("rgeApp.delayHelp")}</p>
                </div>
              );
            }
            const labelMap: Record<string, string> = {
              buyerKeywords: t("rgeApp.buyerKeywords"),
              sellerKeywords: t("rgeApp.sellerKeywords"),
              investorKeywords: t("rgeApp.investorKeywords"),
              appointmentIntentKeywords: "Appointment Intent Keywords",
            };
            return (
              <div key={field}>
                <Label className="text-sm font-medium">{labelMap[field] || field}</Label>
                <Input
                  placeholder={t("rgeApp.keywordExample")}
                  value={localPrefs[prefKey] || WORKFLOW_PREF_DEFAULTS[wfKey]?.[field] || ""}
                  onChange={e => updatePref(prefKey, e.target.value)}
                  className="mt-1"
                  data-testid={`input-${field}`}
                />
                <p className="text-[11px] text-muted-foreground mt-1">{t("rgeApp.detectionKeywords")}</p>
              </div>
            );
          })}
        </div>
      );
    };

    const workflowRows = workflows.map((workflow) => {
      const installed = installedWorkflows?.find((row) => {
        const conditions = row.triggerConditions as { templateId?: string; templateKey?: string } | null;
        const isRge = conditions?.templateId === RGE_TEMPLATE_ID ||
          (!conditions?.templateId && row.description?.startsWith("Realtor Growth Engine:"));
        return isRge && (conditions?.templateKey === workflow.key || (!conditions?.templateKey && row.name === workflow.name));
      });
      const status = isPaused ? "Warning" : workflow.key === "W2" ? "Running" :
        installed ? (installed.isActive ? "Running" : "Disabled") :
        installedWorkflows || workflowStatusError ? "Warning" : "Checking";
      return { workflow, status, detail: status === "Warning"
        ? (isPaused ? t("rgeApp.pausedAccess") : workflowStatusError ? t("rgeApp.workflowStatusUnavailable") : t("rgeApp.workflowMissing"))
        : undefined };
    });
    const runningCount = workflowRows.filter((row) => row.status === "Running").length;
    const pipelineStages = (pipeline as { stages?: Array<string | { name?: string; displayName?: string }> }).stages
      ?.map((stage) => typeof stage === "string" ? stage : stage.name || stage.displayName || "").filter(Boolean) ?? [];

    return (
      <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-6">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl"><RealtorMark /> {t("rgeApp.engine")}</h1>
        </header>

        <div
          className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(230px,275px)]"
          data-testid="rge-dashboard-top-grid"
        >
          <div className="min-w-0 space-y-4" data-testid="rge-dashboard-main">
            <Card className="min-w-0">
              <CardHeader className="p-4 pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Zap className="h-4 w-4 text-brand-green" />
                  {t("rgeApp.activeAutomations")}
                </CardTitle>
                <CardDescription>{assetsLoading ? t("rgeApp.loadingWorkflows") : assetsError
                  ? t("rgeApp.workflowUnavailable") : t("rgeApp.workflowsRunning", { running: runningCount, total: workflowRows.length })}</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <ul className="divide-y divide-slate-200">
                  {workflowRows.map(({ workflow, status, detail }) => (
                    <li key={workflow.key}>
                      <button type="button"
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-1 py-2 text-start hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
                        onClick={() => openModal(workflow)}
                        data-testid={`workflow-row-${workflow.key}`}
                        aria-label={t("rgeApp.customizeWorkflow", { workflow: workflowTitle(workflow) })}>
                        <span className="min-w-0 text-sm font-medium text-slate-900">
                          {workflowTitle(workflow)}
                          {detail && <span className="block text-xs font-normal text-slate-600">{detail}</span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <Badge variant="outline" className={cn("text-xs",
                            status === "Running" ? "border-emerald-200 text-emerald-800" :
                              status === "Warning" ? "border-amber-200 text-amber-900" : "border-slate-200 text-slate-600")}>
                            {workflowStatusLabel(status)}
                          </Badge>
                          <Settings className="h-4 w-4 text-slate-600" aria-hidden="true" />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <section
              id="agent-page-settings"
              className="w-full scroll-mt-24"
              data-testid="rge-agent-page-section"
            >
              <PublicAgentPageSettingsCard className="w-full" />
            </section>
          </div>

          <aside className="grid min-w-0 gap-3 sm:grid-cols-2 xl:sticky xl:top-6 xl:grid-cols-1" data-testid="rge-dashboard-sidebar">
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4 text-brand-green" /> {t("rgeApp.aiQualification")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4 pb-4 text-sm">
                <span className="text-slate-700">{t("rgeApp.realEstateRules")}</span>
                <Badge variant="outline" className={isPaused ? "border-amber-200 text-amber-900" : "border-emerald-200 text-emerald-800"}>
                  {isPaused ? t("rgeApp.paused") : t("inboxUi.active")}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <LayoutGrid className="h-4 w-4 text-brand-green" /> {t("rgeApp.crmPipeline")}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 text-sm text-slate-700">
                {pipelineStages.length ? (
                  <details>
                    <summary className="cursor-pointer">{t("rgeApp.stagesCount", { count: pipelineStages.length })}</summary>
                    <ol className="mt-2 list-decimal space-y-1 ps-5">
                      {pipelineStages.map((stage, index) => <li key={index}>{crmStageLabel(t, stage)}</li>)}
                    </ol>
                  </details>
                ) : t("rgeApp.pipelineUnavailable")}
              </CardContent>
            </Card>

            <AgentPageSidebarSummary />
            <InventorySidebarSummary />
          </aside>
        </div>

        <section className="mt-4 w-full scroll-mt-24" data-testid="rge-inventory-section">
          <p className="mb-3 text-sm text-muted-foreground">{t("rgeApp.setupExplanation")}</p>
          <InventorySourcesSection variant="compact" className="w-full" />
        </section>

        <Dialog open={!!selectedWf} onOpenChange={(open) => { if (!open) setSelectedWf(null); }}>
          <DialogContent className="max-w-2xl p-0 flex flex-col" style={{ maxHeight: 'calc(100vh - 4rem)' }}>
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b shrink-0">
              <div>
                <DialogTitle className="text-lg font-bold">{selectedWf && workflowTitle(selectedWf)}</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">{t("rgeApp.customizeHint")}</DialogDescription>
              </div>
            </div>

            <Tabs value={modalTab} onValueChange={setModalTab} className="flex flex-col min-h-0 flex-1">
              <div className="px-6 pt-2 shrink-0">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="preview" className="text-sm" data-testid="tab-preview">
                    <Eye className="w-3.5 h-3.5 me-1.5" /> {t("inboxUi.preview")}
                  </TabsTrigger>
                  <TabsTrigger value="customize" className="text-sm" data-testid="tab-customize">
                    <Settings className="w-3.5 h-3.5 me-1.5" /> {t("rgeApp.customize")}
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto">
                <TabsContent value="preview" className="px-6 pb-4 mt-0 space-y-5">
                  <div className="pt-3">
                    <h4 className="text-sm font-semibold text-gray-800 mb-1">{t("rgeApp.workflowPurpose")}</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {selectedWf && WORKFLOW_DESCRIPTIONS[selectedWf.key]?.summary}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-gray-800 mb-1">{t("rgeApp.trigger")}</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedWf && WORKFLOW_DESCRIPTIONS[selectedWf.key]?.triggers}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-gray-800 mb-1">{t("rgeApp.timing")}</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedWf && WORKFLOW_DESCRIPTIONS[selectedWf.key]?.timing}
                    </p>
                  </div>

                  {selectedWf?.key === "W2" && (
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-800 mb-1">{t("rgeApp.qualificationLogic")}</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {t("rgeApp.qualificationHelp")}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-gray-800 mb-2">{t("rgeApp.questionOrder")}</h4>
                        <div className="space-y-1.5">
                          {[
                            { n: 1, label: t("rgeApp.financePriority"), q: localPrefs["W2_financingQuestion"] || WORKFLOW_PREF_DEFAULTS.W2.financingQuestion },
                            { n: 2, label: t("rgeApp.budgetPriority"), q: localPrefs["W2_budgetQuestion"] || WORKFLOW_PREF_DEFAULTS.W2.budgetQuestion },
                            { n: 3, label: t("rgeApp.timelinePriority"), q: localPrefs["W2_timelineQuestion"] || WORKFLOW_PREF_DEFAULTS.W2.timelineQuestion },
                          ].map(item => (
                            <div key={item.n} className="p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">{t("rge.workflow.step")} {item.n} — {item.label}</p>
                              <p className="text-xs text-gray-700 italic">"{item.q}"</p>
                            </div>
                          ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-2">{t("rgeApp.oneQuestion")}</p>
                      </div>
                    </div>
                  )}

                  {getWorkflowTemplates(selectedWf).length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800 mb-2">{t("rgeApp.messageTemplates")}</h4>
                      <div className="space-y-2">
                        {getWorkflowTemplates(selectedWf).map((template: any, idx: number) => (
                          <div key={idx} className="p-2 bg-gray-50 rounded border border-gray-200">
                            <p className="text-xs font-mono text-muted-foreground">{template.key}</p>
                            <p className="text-sm text-gray-700 mt-1">{template.friendlyName || template.name}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="customize" className="px-6 pb-4 mt-0">
                  <div className="space-y-4">
                    {renderGlobalFields()}
                    {hasWorkflowSpecificFields(selectedWf?.key) && renderWorkflowFields(selectedWf?.key)}
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            <div className="border-t px-6 py-3 flex gap-2 justify-end shrink-0">
              <Button variant="outline" onClick={() => setSelectedWf(null)} data-testid="button-modal-cancel">
                {t("inboxUi.close")}
              </Button>
              {modalTab === "customize" && (
                <>
                  <Button variant="outline" onClick={handleRestore} data-testid="button-restore-defaults">
                    <RotateCcw className="w-4 h-4 me-1.5" /> {t("rgeApp.restoreDefaults")}
                  </Button>
                  <Button className="bg-brand-green hover:bg-brand-green/90" onClick={handleSave} disabled={saving} data-testid="button-save-preferences">
                    {saving ? <Loader2 className="w-4 h-4 me-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 me-1.5" />}
                    {t("rgeApp.saveChanges")}
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // --- Main Render ---

  return (
    <RealtorEngineErrorBoundary t={t}>
      <>
        {onboardingComplete && status === "installed" && !isOnboardingPath ? (
          <DashboardView />
        ) : isOnboardingPath ? (
          <RGEOnboardingWizard
            step={step}
            setStep={setStep}
            totalSteps={totalSteps}
            form={form}
            onboardingComplete={onboardingComplete}
            hasPurchased={hasPurchased}
            submitOnboardingMutation={submitOnboardingMutation}
            setLocation={setLocation}
          />
        ) : (
          <DetailPage />
        )}
      </>
    </RealtorEngineErrorBoundary>
  );
}
