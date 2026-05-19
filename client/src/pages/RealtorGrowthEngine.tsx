import React, { useState, useEffect, Component } from "react";

// ─── Error Boundary ───────────────────────────────────────────────────────────
interface EBState { hasError: boolean; error?: Error }
class RealtorEngineErrorBoundary extends Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
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
          <h2 className="text-xl font-semibold text-gray-900">Something went wrong loading this template</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {this.state.error?.message || "An unexpected error occurred. Try refreshing the page."}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
              className="px-4 py-2 rounded-md bg-brand-green text-white text-sm font-medium hover:bg-brand-green/90"
              data-testid="button-error-retry"
            >
              Retry
            </button>
            <button
              onClick={() => { window.location.href = TEMPLATES_GROWTH_ENGINES_TAB_PATH; }}
              className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-gray-50"
              data-testid="button-error-back"
            >
              Back to Templates
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

function RealtorMark() {
  return (
    <span className="inline">Realtor<span style={{ fontSize: '0.35em', verticalAlign: 'super', lineHeight: 0, position: 'relative', top: '-0.15em' }}>&reg;</span></span>
  );
}

import { useLocation, Link } from "wouter";
import { useQuery, useMutation, type UseMutationResult } from "@tanstack/react-query";
import { settingsChannelsHref } from "@/lib/settingsChannelsNavigation";
import type { ActivationStatusPayload } from "@/lib/activationStatus";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { TEMPLATES_GROWTH_ENGINES_TAB_PATH } from "@/lib/growthEnginesCatalog";
import {
  getRgeCheckoutReturnPaths,
  RGE_TEMPLATE_ONBOARDING_PATH,
} from "@shared/rgePaths";
import { getCheckoutReturnPaths } from "@/lib/checkoutReturnPaths";
import { getSubscriptionApiUrl, useShopifyShopHint } from "@/lib/shopifyBillingHint";
import { mustUseShopifyBilling } from "@/lib/shopifyBillingContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  install: {
    installStatus: string;
    installedAt: string | null;
  } | null;
  subscription?: {
    hasPro: boolean;
    hasAI: boolean;
    active: boolean;
  };
}

const onboardingSchema = z.object({
  legalName: z.string().min(2, "Business name is required"),
  country: z.string().min(2, "Country is required"),
  website: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === undefined ? "" : v))
    .refine((v) => v === "" || /^https?:\/\/.+/i.test(v), {
      message: "Use a full link starting with https://",
    }),
  teamType: z.enum(["solo", "team"]),
  estimatedSeats: z.string(),
  notificationsEnabled: z.boolean().default(true),
  leadSources: z.string().min(3, "Add a short note about where leads come from"),
  primaryGoal: z.string().min(3, "Tell us what you want this system to do for you"),
  timezone: z.string().min(2, "Select your timezone"),
  conciergeLaunchAvailability: z.string().optional(),
  additionalNotes: z.string().optional(),
});

type OnboardingValues = z.infer<typeof onboardingSchema>;

type ChannelSettingRow = { channel: string; isConnected?: boolean | null };

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
        <span className="text-xs font-medium text-emerald-700 shrink-0">Connected</span>
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
  status,
  submitOnboardingMutation,
  setLocation,
}: {
  step: number;
  setStep: React.Dispatch<React.SetStateAction<number>>;
  totalSteps: number;
  form: UseFormReturn<OnboardingValues>;
  status: EntitlementStatus;
  submitOnboardingMutation: UseMutationResult<any, Error, OnboardingValues, unknown>;
  setLocation: (path: string) => void;
}) {
  const { data: activationStatus, refetch: refetchActivation } = useQuery<ActivationStatusPayload>({
    queryKey: ["/api/activation-status"],
    enabled: status === "purchased" || status === "submitted",
    staleTime: 15_000,
  });

  const { data: channelSettings, refetch: refetchChannels } = useQuery<ChannelSettingRow[]>({
    queryKey: ["/api/channels"],
    enabled: status === "purchased" || status === "submitted",
    staleTime: 15_000,
  });

  const { data: engineStatusData, refetch: refetchEngineStatus } = useQuery({
    queryKey: ["/api/templates/realtor-growth-engine/status"],
    enabled: status === "purchased" || status === "submitted",
    staleTime: 15_000,
  });

  const { data: conciergeBooking } = useQuery<{ calendarUrl: string | null; source: string }>({
    queryKey: ["/api/templates/realtor-growth-engine/concierge-calendar"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/templates/realtor-growth-engine/concierge-calendar");
      return res.json();
    },
    enabled: status === "purchased" || status === "submitted",
    staleTime: 60_000,
  });

  const conciergeCalendarUrl = conciergeBooking?.calendarUrl?.trim() || null;

  const webchatConnected = !!channelSettings?.some((s) => s.channel === "webchat" && !!s.isConnected);
  const calendlyConnected = !!(engineStatusData as { calendlyConnected?: boolean } | undefined)?.calendlyConnected;
  const whatsappReady = !!activationStatus?.whatsappConnected;

  const refreshReadiness = () => {
    void refetchActivation();
    void refetchChannels();
    void refetchEngineStatus();
  };

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

  const nextStep = async () => {
    if (step === 4 && !conciergeCalendarUrl) {
      const availability = form.getValues("conciergeLaunchAvailability")?.trim() ?? "";
      if (availability.length < 5) {
        form.setError("conciergeLaunchAvailability", {
          type: "manual",
          message: "Share a few times that work for your launch session",
        });
        return;
      }
    }
    const fields = getFieldsForStep(step);
    if (fields.length > 0) {
      const result = await form.trigger(fields);
      if (!result) return;
    }
    setStep((s) => Math.min(s + 1, totalSteps));
  };

  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

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
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>

      {status === "purchased" && (
        <div className="mb-8">
          <div className="text-center mb-6">
            <Badge className="mb-4 bg-brand-green/10 text-brand-green border-brand-green/20">
              Step {step} of {totalSteps}
            </Badge>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Guided launch</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-lg mx-auto">
              A concise setup so we can install your Growth Engine, align channels, and book your concierge launch session.
            </p>
          </div>
          <Progress value={(step / totalSteps) * 100} className="mb-8 h-1.5" />

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {step === 1 && (
                <Card className="border-gray-200/80 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Welcome</CardTitle>
                    <CardDescription className="text-base leading-relaxed">
                      The <RealtorMark /> Growth Engine configures your workspace for multi-channel conversations, AI qualification,
                      automated follow-ups, and booking-ready flows, with a concierge-led launch to validate everything is live.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-gray-600">
                    <ul className="list-disc pl-5 space-y-2">
                      <li>Channels wired for inbound leads (WhatsApp is required before activation)</li>
                      <li>AI qualification and routing tuned for real estate conversations</li>
                      <li>Automation sequences for speed-to-lead and nurture</li>
                      <li>Optional calendar connection so prospects can self-book showings</li>
                      <li>Concierge launch session to review setup and optimize performance</li>
                    </ul>
                  </CardContent>
                </Card>
              )}

              {step === 2 && (
                <Card className="border-gray-200/80 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Channel readiness</CardTitle>
                    <CardDescription>
                      Connect what you use today. Only WhatsApp is required before we activate the template; everything else
                      improves coverage and can be added anytime.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-end">
                      <Button type="button" variant="outline" size="sm" className="text-xs" onClick={refreshReadiness}>
                        Refresh status
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <ChannelStatusRow
                        label="WhatsApp"
                        ok={!!activationStatus?.whatsappConnected}
                        href={settingsChannelsHref({ provider: "whatsapp" })}
                        actionLabel="Connect WhatsApp"
                      />
                      <ChannelStatusRow
                        label="Facebook"
                        ok={!!activationStatus?.facebookConnected}
                        href={settingsChannelsHref({ provider: "facebook" })}
                        actionLabel="Connect Facebook"
                      />
                      <ChannelStatusRow
                        label="Instagram"
                        ok={!!activationStatus?.instagramConnected}
                        href={settingsChannelsHref({ provider: "instagram" })}
                        actionLabel="Connect Instagram"
                      />
                      <ChannelStatusRow
                        label="Calendly"
                        ok={calendlyConnected}
                        href="/app/integrations"
                        actionLabel="Connect Calendly"
                      />
                      <ChannelStatusRow
                        label="Website chat widget"
                        ok={webchatConnected}
                        href="/app/settings?section=channels"
                        actionLabel="Open web chat"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      WhatsApp uses Meta&apos;s embedded signup from Settings (no manual API keys). Connect your booking calendar so
                      leads can automatically schedule appointments and showings.
                    </p>
                  </CardContent>
                </Card>
              )}

              {step === 3 && (
                <Card className="border-gray-200/80 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Business profile</CardTitle>
                    <CardDescription>Helps us tailor your setup and concierge launch session.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="legalName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Business name</FormLabel>
                          <FormControl>
                            <Input placeholder="As you present it to clients" {...field} data-testid="input-legal-name" />
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
                            <FormLabel>Country</FormLabel>
                            <FormControl>
                              <Input placeholder="United States" {...field} data-testid="input-country" />
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
                            <FormLabel>Website (optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="https://your-site.com" {...field} data-testid="input-website" />
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
                          <FormLabel>Team</FormLabel>
                          <FormControl>
                            <RadioGroup value={field.value} onValueChange={field.onChange} className="flex space-x-4 mt-2">
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="solo" id="team-solo" data-testid="radio-team-solo" />
                                <Label htmlFor="team-solo" className="font-normal cursor-pointer">
                                  Solo
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="team" id="team-team" data-testid="radio-team-team" />
                                <Label htmlFor="team-team" className="font-normal cursor-pointer">
                                  Team
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
                          <FormLabel>Seats</FormLabel>
                          <FormControl>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger data-testid="select-estimated-seats">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1</SelectItem>
                                <SelectItem value="2-5">2-5</SelectItem>
                                <SelectItem value="6-10">6-10</SelectItem>
                                <SelectItem value="10+">10+</SelectItem>
                              </SelectContent>
                            </Select>
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
                            <FormLabel className="text-base">Notifications</FormLabel>
                            <FormDescription>Alerts for high-intent leads and handoffs</FormDescription>
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
                          <FormLabel>Lead sources</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Ads, referrals, Zillow, open houses..."
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
                          <FormLabel>Primary outcome</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="e.g. faster showings booked, cleaner handoffs to my ISA"
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
                    <CardTitle className="text-lg">Book your concierge launch session</CardTitle>
                    <CardDescription className="text-base leading-relaxed">
                      Choose a time with your assigned launch specialist so we can review your setup, confirm channels, and
                      prepare your Growth Engine for activation.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {conciergeCalendarUrl ? (
                      <>
                        <Button className="bg-brand-green hover:bg-brand-green/90" asChild data-testid="button-book-launch-session">
                          <a href={conciergeCalendarUrl} target="_blank" rel="noopener noreferrer">
                            Book launch session
                            <ExternalLink className="ml-2 h-4 w-4" />
                          </a>
                        </Button>
                        <FormField
                          control={form.control}
                          name="additionalNotes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Notes for your specialist (optional)</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Markets, specialties, or anything you want emphasized in the session"
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
                          Your launch specialist calendar is not connected yet. We&apos;ll contact you to schedule your session.
                        </p>
                        <FormField
                          control={form.control}
                          name="timezone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Timezone</FormLabel>
                              <FormControl>
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <SelectTrigger data-testid="select-timezone">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="America/New_York">Eastern</SelectItem>
                                    <SelectItem value="America/Chicago">Central</SelectItem>
                                    <SelectItem value="America/Denver">Mountain</SelectItem>
                                    <SelectItem value="America/Los_Angeles">Pacific</SelectItem>
                                    <SelectItem value="America/Anchorage">Alaska</SelectItem>
                                    <SelectItem value="Pacific/Honolulu">Hawaii</SelectItem>
                                  </SelectContent>
                                </Select>
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
                              <FormLabel>When are you usually available?</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="e.g. Tue-Thu 2-5pm ET; avoid Friday mornings"
                                  className="min-h-[100px]"
                                  {...field}
                                  data-testid="textarea-concierge-availability"
                                />
                              </FormControl>
                              <FormDescription>Share a few windows that work for your launch session.</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="additionalNotes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Notes for your concierge (optional)</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Markets, specialties, or anything you want emphasized in the session"
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
                    <CardTitle className="text-lg">Review and activate</CardTitle>
                    <CardDescription>
                      When you continue, we save your launch details and install the Growth Engine into your workspace.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4 space-y-2 text-sm text-gray-700">
                      <p className="font-medium text-gray-900">Before you finish</p>
                      <p>
                        WhatsApp must be connected so automations have a live channel.{" "}
                        {whatsappReady ? (
                          <span className="text-emerald-700 font-medium">You&apos;re connected. You can activate.</span>
                        ) : (
                          <span>
                            <Link href={settingsChannelsHref({ provider: "whatsapp" })}>
                              <a className="text-brand-green font-medium underline-offset-2 hover:underline">Connect WhatsApp</a>
                            </Link>{" "}
                            in Settings, then refresh status here.
                          </span>
                        )}
                      </p>
                      <Button type="button" variant="outline" size="sm" className="text-xs" onClick={refreshReadiness}>
                        Refresh connection status
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-3 justify-between pt-4">
                <Button type="button" variant="outline" onClick={prevStep} disabled={step === 1} data-testid="button-prev-step">
                  <ChevronLeft className="mr-1 w-4 h-4" /> Previous
                </Button>
                {step < totalSteps ? (
                  <Button type="button" className="bg-brand-green hover:bg-brand-green/90" onClick={nextStep} data-testid="button-next-step">
                    Next <ChevronRight className="ml-1 w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    className="bg-brand-green hover:bg-brand-green/90"
                    disabled={submitOnboardingMutation.isPending || !whatsappReady}
                    data-testid="button-submit-onboarding"
                  >
                    {submitOnboardingMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 w-4 h-4 animate-spin" /> Activating...
                      </>
                    ) : (
                      <>Activate Growth Engine</>
                    )}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </div>
      )}

      {status === "submitted" && (
        <Card className="border-emerald-100 bg-emerald-50/40 shadow-sm">
          <CardContent className="py-10 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-brand-green mx-auto" />
            <h3 className="text-xl font-bold text-gray-900">You&apos;re scheduled for optimization</h3>
            <p className="text-gray-600 max-w-md mx-auto text-sm leading-relaxed">
              Your concierge team has your launch profile. Expect outreach to align on your session, validate automations, and
              fine-tune booking so everything is live with confidence.
            </p>
            <p className="text-xs text-muted-foreground">Watch your inbox for scheduling details.</p>
            {conciergeBooking?.calendarUrl ? (
              <Button className="bg-brand-green hover:bg-brand-green/90 mt-2" asChild>
                <a href={conciergeBooking.calendarUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2 inline" />
                  Book launch session
                </a>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground max-w-md mx-auto mt-2">
                A self-serve scheduling link will appear here when your specialist or company default calendar is configured. Your team may
                still reach out by email to coordinate.
              </p>
            )}
            <Button variant="outline" className="mt-2" onClick={() => setLocation("/app/templates/realtor-growth-engine")}>
              Return to overview
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// --- Components ---

export function RealtorGrowthEngine() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const totalSteps = 5;
  const [subscriptionGate, setSubscriptionGate] = useState<{ show: boolean; hasPro: boolean; hasAI: boolean }>({ show: false, hasPro: true, hasAI: true });
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [shopifyGateLoading, setShopifyGateLoading] = useState(false);

  const shopHint = useShopifyShopHint();
  const { data: billingAccount } = useQuery<{
    subscription?: { isShopify?: boolean };
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
        console.log("[RealtorGrowthEngine] Template data loaded:", { status: json?.entitlement?.status, hasInstall: !!json?.install });
        return json;
      } catch (err) {
        console.error("[RealtorGrowthEngine] Load error:", err);
        throw err;
      }
    },
    retry: 1,
  });

  const verifyPaymentMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await apiRequest("POST", "/api/templates/realtor-growth-engine/verify-payment", { sessionId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine"] });
      toast({
        title: "Payment confirmed",
        description: "Continue guided setup: align channels and book your concierge launch session.",
      });
      const url = new URL(window.location.href);
      url.searchParams.delete("paid");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.pathname);
    }
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paid = params.get("paid");
    const sessionId = params.get("session_id");
    if (paid === "true" && sessionId && !isShopify) {
      verifyPaymentMutation.mutate(sessionId);
    }
    if (params.get("shopify_rge") === "success") {
      queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine"] });
      toast({
        title: "Shopify purchase approved",
        description: "Continue with your guided Realtor Growth Engine setup.",
      });
      const url = new URL(window.location.href);
      url.searchParams.delete("shopify_rge");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, []);

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/templates/realtor-growth-engine/purchase", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getRgeCheckoutReturnPaths()),
      });
      if (res.status === 401) {
        window.location.href = `/auth?redirect=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
        throw new Error("session_expired");
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Purchase failed");
      }
      return res.json();
    },
    onSuccess: (data: { url?: string; shopifyConfirmationUrl?: string }) => {
      if (data.shopifyConfirmationUrl) {
        window.location.href = data.shopifyConfirmationUrl;
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine"] });
        toast({ title: "Template Unlocked", description: "Continue with your guided launch setup." });
      }
    }
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
      queryClient.invalidateQueries({ queryKey: ["/api/activation-status"] });
      toast({
        title: "Growth Engine activated",
        description: "Your concierge team will reach out to schedule your launch and optimization session.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not activate",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
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

  React.useEffect(() => {
    if (!isOnboardingPath) return;
    if (status === "locked" || status === "installed") {
      setLocation("/app/templates/realtor-growth-engine");
    }
  }, [isOnboardingPath, status, setLocation]);

  const { data: assetsData } = useQuery({
    queryKey: ["/api/templates/realtor-growth-engine/assets"],
    enabled: !!templateData && status === 'installed'
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
  const subscriptionActive = templateData?.subscription?.active !== false;
  const isPaused = !subscriptionActive && (status === 'purchased' || status === 'submitted' || status === 'installed');

  const primaryMarketingCta = React.useMemo(() => {
    if (isPaused) {
      return { label: "Resume when your plan is active", disabled: true as const };
    }
    if (status === "locked") {
      return {
        label: "Activate Engine",
        disabled: purchaseMutation.isPending || checkingSubscription,
      };
    }
    if (status === "purchased") {
      return { label: "Start onboarding", disabled: purchaseMutation.isPending };
    }
    if (status === "submitted") {
      return { label: "Continue setup", disabled: false };
    }
    return { label: "Activate Engine", disabled: true as const };
  }, [isPaused, status, purchaseMutation.isPending, checkingSubscription]);

  React.useEffect(() => {
    if (subscriptionActive && sessionStorage.getItem("rge_reactivating")) {
      sessionStorage.removeItem("rge_reactivating");
      toast({
        title: "Subscription active",
        description: "You can now continue your Realtor® Growth Engine.",
      });
    }
  }, [subscriptionActive]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-muted-foreground" data-testid="state-loading">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading template…</span>
      </div>
    );
  }

  if (isError || !templateData) {
    const msg = (queryError as Error)?.message || "Could not load template data.";
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4 text-center" data-testid="state-error">
        <div className="rounded-full bg-red-100 p-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Failed to load template</h2>
        <p className="text-sm text-muted-foreground max-w-md">{msg}</p>
        <div className="flex gap-3">
          <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine"] })} data-testid="button-error-retry">
            Retry
          </Button>
          <Button variant="outline" onClick={() => setLocation(TEMPLATES_GROWTH_ENGINES_TAB_PATH)} data-testid="button-error-back">
            Back to Templates
          </Button>
        </div>
      </div>
    );
  }

  // --- Views ---

  const handlePurchaseContinue = async () => {
    setCheckingSubscription(true);
    try {
      const res = await apiRequest("GET", "/api/templates/realtor-growth-engine/check-subscription");
      const data = await res.json();
      if (!data.hasPro || !data.hasAI) {
        setSubscriptionGate({ show: true, hasPro: data.hasPro, hasAI: data.hasAI });
        setCheckingSubscription(false);
        return;
      }
      setCheckingSubscription(false);
      purchaseMutation.mutate();
    } catch {
      setCheckingSubscription(false);
      toast({ title: "Error", description: "Could not verify your subscription. Please try again.", variant: "destructive" });
    }
  };

  const handlePrimaryCta = () => {
    if (status === "locked") {
      void handlePurchaseContinue();
    } else if (isPaused) {
      return;
    } else if (status === "purchased" || status === "submitted") {
      setLocation(RGE_TEMPLATE_ONBOARDING_PATH);
    }
  };

  const renderStepper = () => {
    const s1 = status !== "locked";
    const s2 = status === "submitted" || status === "installed";
    const s3 = status === "installed";
    const s2Active = status === "purchased";

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
          <span className={cn("text-xs font-medium", s1 ? "text-emerald-600" : "text-gray-400")}>Activate</span>
        </div>
        <div
          className={cn(
            "hidden h-0.5 w-10 shrink-0 -translate-y-3 sm:block md:w-16",
            s1 ? "bg-gradient-to-r from-emerald-600 to-gray-200" : "bg-gray-200",
          )}
        />
        <div className="flex flex-col items-center gap-1.5">
          <div className={circle(s2, s2Active && !s2)}>{s2 ? <Check className="h-5 w-5" /> : "2"}</div>
          <span className={cn("text-xs font-medium", s2 || s2Active ? "text-emerald-600" : "text-gray-400")}>Setup</span>
        </div>
        <div
          className={cn(
            "hidden h-0.5 w-10 shrink-0 -translate-y-3 sm:block md:w-16",
            s2 ? "bg-gradient-to-r from-emerald-600 to-gray-200" : "bg-gray-200",
          )}
        />
        <div className="flex flex-col items-center gap-1.5">
          <div className={circle(s3, false)}>{s3 ? <Check className="h-5 w-5" /> : "3"}</div>
          <span className={cn("text-xs font-medium", s3 ? "text-emerald-600" : "text-gray-400")}>Go Live</span>
        </div>
      </div>
    );
  };

  const DetailPage = () => {
    const includedItems: { Icon: typeof Sparkles; t: string; d: string }[] = [
      { Icon: Sparkles, t: "AI lead qualification", d: "Inbound messages are interpreted, scored, and routed with guardrails." },
      { Icon: Target, t: "Buyer / seller scoring", d: "Intent and readiness signals update automatically as the thread evolves." },
      { Icon: Calendar, t: "Booking intent detection", d: "Tour and call language triggers the right next action and handoff." },
      { Icon: Clock, t: "No-reply nurture sequence", d: "Timed follow-ups re-engage quiet leads without manual chasing." },
      { Icon: Send, t: "WhatsApp template follow-up", d: "Structured sends when the channel requires templates outside the reply window." },
      { Icon: LayoutGrid, t: "Pipeline stages + tags", d: "Stages, tags, and context stay aligned with automation outcomes." },
      { Icon: ClipboardCheck, t: "Tasks + follow-up creation", d: "Hot handoffs and exceptions become actionable work for your team." },
      { Icon: Handshake, t: "Concierge launch session", d: "White-glove validation session before you go live on real traffic." },
    ];

    const whatItDoesLines = [
      "Captures new real estate leads the moment they message you.",
      "Replies instantly across connected messaging channels with context-aware conversation.",
      "Qualifies buyers and sellers using structured signals (financing, budget, timeline).",
      "Detects booking intent and moves the thread toward a showing or call.",
      "Schedules showings or calls when your calendar is connected.",
      "Follows up automatically when leads go cold on a 24h / 72h / 7d cadence.",
      "Updates CRM stage, score, tags, and next step so your pipeline stays honest.",
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
            Back to Growth Engines
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
                  Premium Growth Engine
                </Badge>
              </div>

              <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
                <RealtorMark /> Growth Engine
              </h1>
              <p className="mb-2 text-xl font-medium text-emerald-100/90 md:text-2xl">
                AI-powered messaging automation across connected channels for real estate
              </p>
              <p className="text-base text-gray-300/80">
                Convert inquiries into qualified buyers &amp; booked showings — automatically.
              </p>
            </div>
          </section>

          <div className="mb-6 flex justify-center">{renderStepper()}</div>

          {(status === "purchased" || status === "submitted") && (
            <section
              className="mb-8 rounded-2xl border border-emerald-100/90 bg-gradient-to-br from-emerald-50/40 via-white to-white px-6 py-8 shadow-sm md:px-8"
              data-testid="section-launch-onboarding-cta"
            >
              <div className="mx-auto max-w-xl text-center">
                <h2 className="mb-2 text-xl font-semibold tracking-tight text-gray-900 md:text-2xl">
                  Ready to launch your <RealtorMark /> Growth Engine?
                </h2>
                <p className="mb-6 text-sm leading-relaxed text-gray-600">
                  Start the guided onboarding to connect channels, review your launch profile, and activate your automation.
                </p>
                <Button
                  size="lg"
                  className="rounded-xl bg-gray-900 px-8 text-white shadow-sm hover:bg-gray-800"
                  onClick={() => setLocation(RGE_TEMPLATE_ONBOARDING_PATH)}
                  data-testid="button-start-onboarding-top"
                >
                  Start onboarding
                  <ChevronRight className="ml-1.5 h-5 w-5" />
                </Button>
              </div>
            </section>
          )}

        {isPaused && (
          <Card className="mb-10 border-amber-300 bg-amber-50" data-testid="banner-subscription-paused">
            <CardContent className="flex items-start gap-3 px-5 py-4 sm:px-6">
              <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-900">Growth Engine Paused</p>
                <p className="mt-0.5 text-xs text-amber-800">
                  Your <RealtorMark /> Growth Engine requires an active Pro + AI plan to run automations and handle conversations.
                  Reactivate your plan to resume your system instantly.
                </p>
                <p className="mt-1 text-[11px] text-amber-700">Your purchase and configuration are saved — nothing is lost.</p>
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
                      Reactivate Pro
                    </Button>
                  )}
                  {!templateData?.subscription?.hasAI && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs border-amber-400 text-amber-900 hover:bg-amber-100"
                      onClick={() => {
                        sessionStorage.setItem("rge_reactivating", "1");
                        setLocation("/app/ai-brain");
                      }}
                      data-testid="button-reactivate-ai"
                    >
                      Enable AI
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <section className="mb-6 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm md:p-8">
          <h2 className="mb-1 text-xl font-bold text-gray-900 md:text-2xl">What it does</h2>
          <p className="mb-6 text-sm text-gray-500">
            A coordinated automation engine that runs alongside your inbox and CRM — built for real estate speed-to-lead.
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
                        <span className="text-[10px] font-medium text-emerald-700">AI Copilot Active</span>
                        <Badge className="ml-auto border-0 bg-emerald-100 px-1.5 py-0 text-[8px] text-emerald-700">New Lead</Badge>
                      </div>
                    </div>

                    <div className="min-h-[260px] space-y-2 bg-[#efeae2] p-3">
                      <div className="flex justify-center">
                        <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[9px] text-gray-500 shadow-sm">Today</span>
                      </div>
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-xl rounded-tl-sm bg-white px-3 py-2 shadow-sm">
                          <p className="text-[11px] leading-relaxed text-gray-800">Hi! I&apos;m looking for a 3 bedroom house in Miami.</p>
                          <span className="float-right ml-2 mt-0.5 text-[9px] text-gray-400">10:24 AM</span>
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
                          <span className="float-right ml-2 mt-0.5 text-[9px] text-gray-400">10:25 AM</span>
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
                      <div className="flex-1 rounded-full bg-white px-3 py-1.5 text-[11px] text-gray-400 shadow-sm">Type a message</div>
                      <Paperclip className="h-4 w-4 text-gray-500" aria-hidden />
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 shadow-md">
                        <Send className="ml-0.5 h-3.5 w-3.5 text-white" aria-hidden />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute -right-2 top-16 w-40 rounded-xl border border-gray-100 bg-white p-3 shadow-xl lg:-right-6">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100">
                      <Target className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                    </div>
                    <span className="text-[10px] font-semibold text-gray-700">Lead Score</span>
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
                      <span className="text-gray-600">Budget qualified</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" aria-hidden />
                      <span className="text-gray-600">Timeline: 2 months</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <AlertCircle className="h-2.5 w-2.5 text-amber-500" aria-hidden />
                      <span className="text-gray-600">Financing TBD</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="rge-whats-included" className="mb-6 scroll-mt-24 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm md:p-8">
          <h2 className="mb-1 text-xl font-bold text-gray-900 md:text-2xl">What&apos;s included</h2>
          <p className="mb-6 text-sm text-gray-500">Everything installed as a system — not a loose pile of message templates.</p>

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
          <h2 className="mb-1 text-xl font-bold text-gray-900 md:text-2xl">Automation architecture</h2>
          <p className="mb-6 text-sm text-gray-500">
            How inbound messages, timers, and CRM updates connect — a real system, not a single static template.
          </p>

          <div className="relative rounded-xl border border-gray-200 bg-gray-50 p-4 md:p-6">
            <div className="hidden items-center justify-between gap-2 lg:flex">
              <div className="max-w-[100px] flex-1">
                <div className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm">
                  <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                    <MessageCircle className="h-3.5 w-3.5 text-gray-600" aria-hidden />
                  </div>
                  <p className="text-center text-[10px] font-semibold text-gray-800">New inquiry</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
              <div className="max-w-[100px] flex-1">
                <div className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm">
                  <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                  </div>
                  <p className="text-center text-[10px] font-semibold text-gray-800">AI reply</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
              <div className="max-w-[100px] flex-1">
                <div className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm">
                  <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                    <Filter className="h-3.5 w-3.5 text-gray-600" aria-hidden />
                  </div>
                  <p className="text-center text-[10px] font-semibold text-gray-800">Qualify</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
              <div className="max-w-[100px] flex-1">
                <div className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm">
                  <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                    <Target className="h-3.5 w-3.5 text-gray-600" aria-hidden />
                  </div>
                  <p className="text-center text-[10px] font-semibold text-gray-800">Intent score</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
              <div className="flex shrink-0 flex-col gap-1">
                <div className="flex items-center gap-1.5 rounded border border-emerald-200/60 bg-emerald-50/70 px-2 py-1">
                  <Calendar className="h-3 w-3 text-emerald-600" aria-hidden />
                  <span className="text-[9px] font-medium text-gray-700">Booking</span>
                </div>
                <div className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2 py-1">
                  <Timer className="h-3 w-3 text-gray-500" aria-hidden />
                  <span className="text-[9px] font-medium text-gray-600">Follow-up</span>
                </div>
                <div className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2 py-1">
                  <UserCheck className="h-3 w-3 text-gray-500" aria-hidden />
                  <span className="text-[9px] font-medium text-gray-600">Handoff</span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
              <div className="max-w-[110px] flex-1">
                <div className="rounded-xl border-2 border-emerald-200 bg-white p-2.5 shadow-sm">
                  <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600">
                    <ClipboardList className="h-3.5 w-3.5 text-white" aria-hidden />
                  </div>
                  <p className="text-center text-[10px] font-semibold text-gray-800">CRM update</p>
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
                  <p className="text-center text-[9px] font-semibold text-gray-800">Inquiry</p>
                </div>
                <ArrowRight className="h-3 w-3 text-gray-300" aria-hidden />
                <div className="w-[80px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                  <div className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded border border-emerald-200 bg-emerald-50">
                    <Sparkles className="h-3 w-3 text-emerald-600" aria-hidden />
                  </div>
                  <p className="text-center text-[9px] font-semibold text-gray-800">AI reply</p>
                </div>
                <ArrowRight className="h-3 w-3 text-gray-300" aria-hidden />
                <div className="w-[80px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                  <div className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-gray-100">
                    <Filter className="h-3 w-3 text-gray-600" aria-hidden />
                  </div>
                  <p className="text-center text-[9px] font-semibold text-gray-800">Qualify</p>
                </div>
                <ArrowRight className="h-3 w-3 text-gray-300" aria-hidden />
                <div className="w-[80px] rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                  <div className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-gray-100">
                    <Target className="h-3 w-3 text-gray-600" aria-hidden />
                  </div>
                  <p className="text-center text-[9px] font-semibold text-gray-800">Score</p>
                </div>
              </div>
              <div className="mt-2 flex w-full items-center justify-center gap-3">
                <div className="flex gap-1.5">
                  <div className="flex items-center gap-1 rounded border border-emerald-200/60 bg-emerald-50/70 px-2 py-1">
                    <Calendar className="h-2.5 w-2.5 text-emerald-600" aria-hidden />
                    <span className="text-[8px] font-medium text-gray-700">Book</span>
                  </div>
                  <div className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1">
                    <Timer className="h-2.5 w-2.5 text-gray-500" aria-hidden />
                    <span className="text-[8px] text-gray-600">Nurture</span>
                  </div>
                  <div className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1">
                    <UserCheck className="h-2.5 w-2.5 text-gray-500" aria-hidden />
                    <span className="text-[8px] text-gray-600">Human</span>
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
                  <p className="text-xs font-semibold text-gray-800">New inquiry received</p>
                  <p className="text-[10px] text-gray-500">Inbound messages from connected channels</p>
                </div>
              </div>
              <div className="ml-4 h-3 w-px bg-gray-200" />
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50">
                  <Sparkles className="h-4 w-4 text-emerald-600" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800">Instant AI reply</p>
                  <p className="text-[10px] text-gray-500">Context-aware response</p>
                </div>
              </div>
              <div className="ml-4 h-3 w-px bg-gray-200" />
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                  <Filter className="h-4 w-4 text-gray-600" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800">Qualification</p>
                  <p className="text-[10px] text-gray-500">Budget, timeline, readiness</p>
                </div>
              </div>
              <div className="ml-4 h-3 w-px bg-gray-200" />
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                  <Target className="h-4 w-4 text-gray-600" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800">Intent scoring</p>
                  <p className="text-[10px] text-gray-500">Lead qualification score</p>
                </div>
              </div>
              <div className="ml-4 h-3 w-px bg-gray-200" />
              <div className="ml-11 flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5 rounded border border-emerald-200/60 bg-emerald-50/70 px-2.5 py-1.5">
                  <Calendar className="h-3 w-3 text-emerald-600" aria-hidden />
                  <span className="text-[10px] font-medium text-gray-700">Booking</span>
                </div>
                <div className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2.5 py-1.5">
                  <Timer className="h-3 w-3 text-gray-500" aria-hidden />
                  <span className="text-[10px] text-gray-600">Follow-up</span>
                </div>
                <div className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2.5 py-1.5">
                  <UserCheck className="h-3 w-3 text-gray-500" aria-hidden />
                  <span className="text-[10px] text-gray-600">Handoff</span>
                </div>
              </div>
              <div className="ml-4 h-3 w-px bg-gray-200" />
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600">
                  <ClipboardList className="h-4 w-4 text-white" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800">CRM update</p>
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
            <span className="text-xs">All paths update your CRM so your pipeline stays accurate in real time.</span>
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm md:p-8">
          <h2 className="mb-1 text-xl font-bold text-gray-900 md:text-2xl">Inside your workspace</h2>
          <p className="mb-6 text-sm text-gray-500">
            Representative surfaces this engine uses — from inbox to automations and pipeline.
          </p>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="group">
              <div className="mb-3 overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-emerald-200 hover:shadow-md">
                <div className="flex items-center justify-between bg-gray-800 px-3 py-2">
                  <span className="text-[10px] font-semibold text-white">Inbox</span>
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
              <h3 className="mb-0.5 text-sm font-semibold text-gray-900">Inbox + Copilot</h3>
              <p className="text-xs leading-relaxed text-gray-500">AI drafts and smart replies inside your unified inbox.</p>
            </div>

            <div className="group">
              <div className="mb-3 overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-emerald-200 hover:shadow-md">
                <div className="flex items-center justify-between bg-gray-800 px-3 py-2">
                  <span className="text-[10px] font-semibold text-white">Automations</span>
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
                      <div className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[7px] font-medium text-gray-600">Wait</div>
                      <div className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[7px] font-medium text-gray-600">If reply</div>
                    </div>
                    <div className="h-2 w-px bg-gray-300" />
                    <div className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-[8px] font-medium text-gray-700">
                      <Calendar className="h-2.5 w-2.5 text-gray-500" aria-hidden /> Book
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
                  <span className="text-[8px] text-gray-500">Lead Nurture</span>
                  <Badge className="border-0 bg-emerald-100 px-1.5 py-0 text-[7px] text-emerald-700">Active</Badge>
                </div>
              </div>
              <h3 className="mb-0.5 text-sm font-semibold text-gray-900">Flow automation</h3>
              <p className="text-xs leading-relaxed text-gray-500">Visual flows that run so you never miss a lead.</p>
            </div>

            <div className="group">
              <div className="mb-3 overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-emerald-200 hover:shadow-md">
                <div className="flex items-center justify-between bg-gray-800 px-3 py-2">
                  <span className="text-[10px] font-semibold text-white">Pipeline</span>
                  <Filter className="h-3 w-3 text-white/60" aria-hidden />
                </div>
                <div className="flex gap-1.5 overflow-hidden p-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 px-0.5 text-[7px] font-medium text-gray-500">NEW</div>
                    <div className="space-y-1 rounded bg-gray-50 p-1">
                      <div className="rounded border border-gray-100 bg-white p-1.5 shadow-sm">
                        <p className="text-[8px] font-medium text-gray-800">Sarah M.</p>
                        <span className="text-[7px] text-emerald-600">$600k</span>
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 px-0.5 text-[7px] font-medium text-gray-500">QUAL</div>
                    <div className="space-y-1 rounded bg-emerald-50/50 p-1">
                      <div className="rounded border border-gray-100 bg-white p-1.5 shadow-sm">
                        <p className="text-[8px] font-medium text-gray-800">John D.</p>
                        <span className="text-[7px] text-gray-600">$800k</span>
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 px-0.5 text-[7px] font-medium text-gray-500">SHOW</div>
                    <div className="rounded bg-gray-50 p-1">
                      <div className="rounded border border-gray-100 bg-white p-1.5 shadow-sm">
                        <p className="text-[8px] font-medium text-gray-800">Mike R.</p>
                        <span className="text-[7px] text-gray-500">Tmrw</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
                  <span className="text-[8px] text-gray-500">12 leads</span>
                  <span className="text-[8px] font-medium text-emerald-600">$4.2M</span>
                </div>
              </div>
              <h3 className="mb-0.5 text-sm font-semibold text-gray-900">Pipeline / Tasks</h3>
              <p className="text-xs leading-relaxed text-gray-500">Leads move stages automatically.</p>
            </div>

            <div className="group">
              <div className="mb-3 overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-emerald-200 hover:shadow-md">
                <div className="flex items-center justify-between bg-gray-800 px-3 py-2">
                  <span className="text-[10px] font-semibold text-white">Templates</span>
                  <Settings className="h-3 w-3 text-white/60" aria-hidden />
                </div>
                <div className="space-y-1.5 p-2">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-2">
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="text-[9px] font-semibold text-gray-800">24h Follow-up</span>
                      <Badge className="border-0 bg-emerald-100 px-1 py-0 text-[7px] text-emerald-700">Approved</Badge>
                    </div>
                    <p className="text-[8px] text-gray-500">
                      Hi {"{name}"}, following up on...
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-white p-2">
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="text-[9px] font-semibold text-gray-800">Showing Reminder</span>
                      <Badge className="border-0 bg-emerald-100 px-1 py-0 text-[7px] text-emerald-700">Approved</Badge>
                    </div>
                    <p className="text-[8px] text-gray-500">Reminder: Showing on {"{date}"}...</p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-white p-2">
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="text-[9px] font-semibold text-gray-800">Re-engagement</span>
                      <Badge className="border-0 bg-gray-100 px-1 py-0 text-[7px] text-gray-600">Pending</Badge>
                    </div>
                    <p className="text-[8px] text-gray-500">New listings that match...</p>
                  </div>
                </div>
              </div>
              <h3 className="mb-0.5 text-sm font-semibold text-gray-900">Template follow-up</h3>
              <p className="text-xs leading-relaxed text-gray-500">Approved templates with rule-based timing.</p>
            </div>
          </div>
        </section>

        {status === "locked" && (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <section
            className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm"
            id="rge-requirements"
          >
            <h2 className="mb-1 text-lg font-bold text-gray-900">Requirements</h2>
            <p className="mb-4 text-xs text-gray-500">Before this engine can run end-to-end in your account.</p>
            <div className="space-y-2.5">
              {[
                "Requires Pro plan",
                "Requires AI Brain",
                "WhatsApp Business connected for live automations",
                "Approved templates may be needed for re-engagement outside the customer service window",
                "Concierge onboarding included with purchase",
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
              WhatsApp messaging fees are billed by Meta. Premium add-ons follow your billing provider&apos;s checkout rules (including Shopify confirmation flows where applicable).
            </p>
          </section>

          <section className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-lg font-bold text-gray-900">Premium onboarding &amp; concierge</h2>
            <p className="mb-4 text-xs text-gray-500">We stay with you until the system is live — not a generic help article.</p>
            <div className="space-y-2.5">
              {[
                "White-glove setup with a launch specialist",
                "Channel validation (WhatsApp, Meta surfaces, web chat where used)",
                "Workflow review against your market and offer",
                "Launch optimization session to tune qualification and booking paths",
                "Go-live checklist so automations match how you actually work",
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
              Ready to run this in your workspace?
            </h2>
            <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-gray-600">
              {isPaused
                ? "Your plan must be active for this engine to run. Reactivate Pro and AI above, then continue."
                : "Activate the Realtor Growth Engine to unlock checkout and guided concierge onboarding."}
            </p>
            <Button
              size="lg"
              className={cn(
                "min-w-[200px] rounded-xl bg-gray-900 px-8 text-white shadow-sm hover:bg-gray-800",
                (primaryMarketingCta.disabled || purchaseMutation.isPending) && "pointer-events-none opacity-50",
              )}
              onClick={handlePrimaryCta}
              disabled={purchaseMutation.isPending || primaryMarketingCta.disabled}
              data-testid="button-bottom-cta"
            >
              {checkingSubscription ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Checking…
                </>
              ) : purchaseMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Redirecting…
                </>
              ) : (
                <>
                  {primaryMarketingCta.label}
                  {!primaryMarketingCta.disabled && <ChevronRight className="ml-1.5 h-5 w-5" />}
                </>
              )}
            </Button>
            <p className="mt-4 text-xs text-gray-500">One-time template license · Pro + AI Brain required</p>
          </section>
        ) : status === "purchased" || status === "submitted" ? (
          <section
            className="rounded-2xl border border-gray-200/80 bg-gradient-to-br from-emerald-50/30 via-white to-white px-6 py-10 text-center shadow-sm md:px-10 md:py-12"
            data-testid="section-bottom-onboarding-cta"
          >
            <h2 className="mb-2 text-2xl font-semibold tracking-tight text-gray-900 md:text-3xl">
              Ready to launch your <RealtorMark /> Growth Engine?
            </h2>
            <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-gray-600">
              Start the guided onboarding to connect channels, review your launch profile, and activate your automation.
            </p>
            <Button
              size="lg"
              className="min-w-[200px] rounded-xl bg-gray-900 px-8 text-white shadow-sm hover:bg-gray-800"
              onClick={() => setLocation(RGE_TEMPLATE_ONBOARDING_PATH)}
              data-testid="button-bottom-cta"
            >
              Start onboarding
              <ChevronRight className="ml-1.5 h-5 w-5" />
            </Button>
          </section>
        ) : null}
      </main>
      </div>
    );
  };
  const SubscriptionGateDialog = () => (
    <Dialog open={subscriptionGate.show} onOpenChange={(open) => { if (!open) setSubscriptionGate({ ...subscriptionGate, show: false }); }}>
      <DialogContent className="max-w-sm" data-testid="dialog-subscription-gate">
        <DialogHeader>
          <DialogTitle>Pro + AI Plan Required</DialogTitle>
          <DialogDescription>
            The <RealtorMark /> Growth Engine requires both our Pro plan and AI Brain add-on to run.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-sm font-semibold text-gray-900">What you'll get:</p>
            <ul className="text-xs text-gray-600 mt-2 space-y-1">
              <li>✓ WhachatCRM Pro platform ($49/mo)</li>
              <li>✓ AI Brain automation layer ($29/mo)</li>
              <li>✓ All workflows + templates included</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => setSubscriptionGate({ ...subscriptionGate, show: false })}
            data-testid="button-subscription-cancel"
          >
            Cancel
          </Button>
          <Button
            className="bg-brand-green hover:bg-brand-green/90"
            disabled={shopifyGateLoading}
            onClick={async () => {
              try {
                if (isShopify) {
                  setShopifyGateLoading(true);
                  const plan = !subscriptionGate.hasPro ? "Pro" : "AI Brain Add-on";
                  const res = await fetch("/api/shopify/billing/checkout-web", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ plan }),
                  });
                  if (res.status === 401) {
                    window.location.href = `/auth?redirect=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
                    return;
                  }
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || "Failed to start Shopify billing");
                  }
                  const data = await res.json();
                  if (data.confirmationUrl) {
                    window.location.href = data.confirmationUrl;
                  }
                  return;
                }

                const endpoint = !subscriptionGate.hasPro
                  ? "/api/subscription/checkout/pro-ai"
                  : "/api/subscription/addon/ai-brain";
                const res = await fetch(endpoint, {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(getCheckoutReturnPaths()),
                });
                if (res.status === 401) {
                  window.location.href = `/auth?redirect=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
                  return;
                }
                if (!res.ok) throw new Error("Failed to create checkout");
                const data = await res.json();
                if (data.url) {
                  window.location.href = data.url;
                }
              } catch (err) {
                console.error("Checkout error:", err);
                toast({
                  title: "Could not start checkout",
                  description: err instanceof Error ? err.message : "Please try again.",
                  variant: "destructive",
                });
              } finally {
                setShopifyGateLoading(false);
              }
            }}
            data-testid="button-upgrade-plan"
          >
            {shopifyGateLoading
              ? "Opening Shopify…"
              : isShopify
                ? !subscriptionGate.hasPro
                  ? "Approve Pro in Shopify"
                  : "Approve AI Brain in Shopify"
                : !subscriptionGate.hasPro
                  ? "Upgrade to Pro + AI"
                  : "Enable AI Add-on"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const WORKFLOW_DESCRIPTIONS: Record<string, { summary: string; triggers: string; timing: string; qualificationLogic?: string }> = {
    W1: {
      summary: "Instantly replies to every new inquiry with a personalized greeting. Creates a lead record, tags as 'New', sets pipeline to 'New Lead', and creates a review task.",
      triggers: "New chat / first message from an unknown number",
      timing: "Immediate (within seconds of first message)",
    },
    W2: {
      summary: "Detects buyer, seller, and investor intent, scores each inbound message, extracts budget / financing / timeline signals, and asks lightweight follow-up questions when critical information is missing.",
      triggers: "Every inbound message",
      timing: "Real-time analysis on each incoming message",
      qualificationLogic: "Financing → Budget → Timeline",
    },
    W3: {
      summary: "Detects when a lead mentions scheduling intent (tour, showing, call, visit) and automatically sends your customized Booking Link (e.g., Calendly/TidyCal). This allows the lead to book directly into your calendar. Also tags the lead as 'Appointment Requested' and creates a high-priority task in your CRM.",
      triggers: "Keywords: call, book, available, tour, showing, visit, schedule",
      timing: "Immediate on keyword detection",
    },
    W4: {
      summary: "Sends a friendly follow-up if a lead hasn't replied within 24 hours. Only targets active pipeline stages (New Lead, Responded, Qualified). Tags as 'Follow-Up Needed'.",
      triggers: "No reply detected",
      timing: "24 hours after last message",
    },
    W5: {
      summary: "Second follow-up attempt for leads who still haven't responded after 3 days. Suggests new listings matching their criteria to re-engage interest.",
      triggers: "No reply detected (3 days)",
      timing: "72 hours after last message",
    },
    W6: {
      summary: "Final follow-up after 7 days of silence. Moves the lead to 'Nurture / Follow-Up' pipeline stage for long-term re-engagement. Sends a low-pressure message about market updates.",
      triggers: "No reply detected (7 days)",
      timing: "168 hours (7 days) after last message",
    },
    W7: {
      summary: "Safety workflow that detects opt-out or disinterest signals. Tags as 'Do Not Contact', moves to 'Unqualified' stage, and sends a polite close message. Prevents further automated outreach.",
      triggers: "Keywords: stop, unsubscribe, spam, not interested, remove",
      timing: "Immediate on keyword detection",
    },
    W8: {
      summary:
        "On the first message of a new chat, detects English, Spanish, or Hebrew from the inbound text and stores it on the lead (custom field languageDetected).",
      triggers: "New chat / first message",
      timing: "Immediate on first inbound message",
    },
  };

  const WORKFLOW_FIELDS: Record<string, string[]> = {
    W2: [
      "buyerKeywords", "sellerKeywords", "investorKeywords",
      "financialKeywords", "budgetKeywords", "timelineKeywords", "bookingKeywords",
      "askFinancingFollowUp", "askBudgetFollowUp", "askTimelineFollowUp", "limitOneQuestion",
      "financingQuestion", "budgetQuestion", "timelineQuestion", "lenderQuestion",
    ],
    W3: ["appointmentIntentKeywords", "bookingLink"],
    W4: ["followUpDelayHours"],
    W5: ["followUpDelayHours"],
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
    W4: { followUpDelayHours: 24 },
    W5: { followUpDelayHours: 72 },
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
        toast({ title: "Settings saved", description: `Preferences for "${selectedWf?.name}" updated.` });
        setSelectedWf(null);
      } catch {
        toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
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
      toast({ title: "Defaults restored", description: "Fields reset to template defaults. Click Save to apply." });
    };

    const updatePref = (key: string, value: any) => {
      setLocalPrefs(prev => ({ ...prev, [key]: value }));
    };

    const msgTemplates = assetsData?.assets?.find((a: any) => a.assetType === 'message_templates')?.definition?.templates || [];

    const getWorkflowTemplates = (wf: any) => {
      if (!wf) return [];
      const templateKeys = (wf.actions || [])
        .filter((a: any) => a.type === 'send_message_template')
        .map((a: any) => a.templateKey);
      return msgTemplates.filter((t: any) => templateKeys.includes(t.key));
    };

    const hasWorkflowSpecificFields = (wfKey: string) => !!WORKFLOW_FIELDS[wfKey];

    const renderGlobalFields = () => (
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium">Service Territory</Label>
          <Input
            placeholder="e.g. Miami-Dade, Broward County"
            value={localPrefs.serviceTerritory || ""}
            onChange={e => updatePref("serviceTerritory", e.target.value)}
            className="mt-1"
            data-testid="input-service-territory"
          />
          <p className="text-[11px] text-muted-foreground mt-1">Areas you serve — used in message personalization</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-sm font-medium">Min Price ($)</Label>
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
            <Label className="text-sm font-medium">Max Price ($)</Label>
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
          <Label className="text-sm font-medium">Include Keywords</Label>
          <Input
            placeholder="luxury, waterfront, penthouse"
            value={localPrefs.includeKeywords || ""}
            onChange={e => updatePref("includeKeywords", e.target.value)}
            className="mt-1"
            data-testid="input-include-keywords"
          />
          <p className="text-[11px] text-muted-foreground mt-1">Comma-separated — boost scoring when detected</p>
        </div>
        <div>
          <Label className="text-sm font-medium">Exclude Keywords</Label>
          <Input
            placeholder="spam, lottery, scam"
            value={localPrefs.excludeKeywords || ""}
            onChange={e => updatePref("excludeKeywords", e.target.value)}
            className="mt-1"
            data-testid="input-exclude-keywords"
          />
          <p className="text-[11px] text-muted-foreground mt-1">Comma-separated — penalize or filter when detected</p>
        </div>
        <div>
          <Label className="text-sm font-medium">Preferred Language</Label>
          <Select value={localPrefs.preferredLanguage || "en"} onValueChange={v => updatePref("preferredLanguage", v)}>
            <SelectTrigger className="mt-1" data-testid="select-preferred-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Spanish</SelectItem>
              <SelectItem value="he">Hebrew</SelectItem>
            </SelectContent>
          </Select>
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
            placeholder="keyword1, keyword2, keyword3"
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
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Lead Type Detection</p>
          {kwInput("buyerKeywords", "Buyer Detection Keywords", "Comma-separated keywords used to detect buyer intent")}
          {kwInput("sellerKeywords", "Seller Detection Keywords", "Comma-separated keywords used to detect seller intent")}
          {kwInput("investorKeywords", "Investor Detection Keywords", "Comma-separated keywords used to detect investor intent")}

          <Separator />
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Financial Readiness Detection</p>
          {kwInput("financialKeywords", "Financial Readiness Keywords", "Comma-separated keywords used to detect financing readiness")}
          {kwInput("budgetKeywords", "Budget Keywords", "Keywords used to detect budget or price range discussions")}
          {kwInput("timelineKeywords", "Timeline Keywords", "Keywords used to detect how soon the lead plans to move or buy")}
          {kwInput("bookingKeywords", "Booking / High Intent Keywords", "Keywords used to detect immediate appointment intent")}

          <Separator />
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Qualification Follow-Up Behavior</p>
          <p className="text-[11px] text-muted-foreground -mt-2">The engine will ask only the next most important question if information is missing.</p>
          {toggle("askFinancingFollowUp", "Ask financing follow-up when missing")}
          {toggle("askBudgetFollowUp", "Ask budget follow-up when missing")}
          {toggle("askTimelineFollowUp", "Ask timeline follow-up when missing")}
          {toggle("limitOneQuestion", "Limit qualification follow-ups to one unanswered question at a time")}

          <Separator />
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Follow-Up Question Templates</p>
          {qaInput("financingQuestion", "Financing question")}
          {qaInput("budgetQuestion", "Budget question")}
          {qaInput("timelineQuestion", "Timeline question")}
          {qaInput("lenderQuestion", "Lender assistance question")}

          <Separator />
          <div>
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Service Routing (Optional)</p>
            <p className="text-[11px] text-muted-foreground mt-1">Automatically offer to connect leads with your trusted partners based on intent.</p>
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
                      <Label className="text-sm font-medium">Trigger Keywords</Label>
                      <Input
                        placeholder="keyword1, keyword2"
                        value={svc.keywords}
                        onChange={e => update("keywords", e.target.value)}
                        className="mt-1"
                        data-testid={`input-routing-keywords-${svc.type}`}
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">Comma-separated — used to detect service intent</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Offer Message</Label>
                      <Textarea
                        rows={2}
                        value={svc.offerMessage}
                        onChange={e => update("offerMessage", e.target.value)}
                        className="mt-1 text-sm resize-none"
                        data-testid={`textarea-routing-offer-${svc.type}`}
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">Sent to ask permission before routing — not the routing itself</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Routing Type</Label>
                      <Select value={svc.routingType} onValueChange={v => update("routingType", v)}>
                        <SelectTrigger className="mt-1" data-testid={`select-routing-type-${svc.type}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="task">Create internal task</SelectItem>
                          <SelectItem value="contact_info">Send contact info</SelectItem>
                          <SelectItem value="link">Send scheduling link</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Separator />
                    <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Partner Details</p>
                    <div>
                      <Label className="text-sm font-medium">Partner Name</Label>
                      <Input
                        placeholder="e.g. First National Lending"
                        value={svc.partnerName}
                        onChange={e => update("partnerName", e.target.value)}
                        className="mt-1"
                        data-testid={`input-partner-name-${svc.type}`}
                      />
                    </div>
                    {(svc.routingType === "contact_info" || svc.routingType === "task") && (
                      <div>
                        <Label className="text-sm font-medium">Contact Info (phone / email)</Label>
                        <Input
                          placeholder="e.g. +1 305 555 0100 or hello@partner.com"
                          value={svc.contact}
                          onChange={e => update("contact", e.target.value)}
                          className="mt-1"
                          data-testid={`input-partner-contact-${svc.type}`}
                        />
                      </div>
                    )}
                    {(svc.routingType === "link" || svc.routingType === "task") && (
                      <div>
                        <Label className="text-sm font-medium">Scheduling Link</Label>
                        <Input
                          placeholder="https://calendly.com/..."
                          value={svc.link}
                          onChange={e => update("link", e.target.value)}
                          className="mt-1"
                          data-testid={`input-partner-link-${svc.type}`}
                        />
                      </div>
                    )}
                    <div>
                      <Label className="text-sm font-medium">Auto-Applied Tag</Label>
                      <Input
                        value={svc.tags.join(", ")}
                        onChange={e => update("tags", e.target.value.split(",").map((t: string) => t.trim()).filter(Boolean))}
                        className="mt-1"
                        data-testid={`input-routing-tags-${svc.type}`}
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">Applied to the lead when routing is confirmed</p>
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
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Workflow-Specific Settings</p>
          {fields.map(field => {
            const prefKey = `${wfKey}_${field}`;
            if (field === "bookingLink") {
              if (calendlyConnected) {
                return (
                  <div key={field} className="rounded-md border border-sky-200 bg-sky-50/90 px-3 py-2.5 text-sm text-sky-950">
                    <p className="font-medium text-sky-950">Calendly is connected. Booking links are managed automatically.</p>
                    <p className="text-[11px] text-sky-900/85 mt-1.5 leading-snug">
                      The manual booking link is disabled so scheduling only flows from your Calendly integration (no duplicate prompts).
                    </p>
                  </div>
                );
              }
              return (
                <div key={field}>
                  <Label className="text-sm font-medium">Booking Link (Calendly / TidyCal)</Label>
                  <Input
                    placeholder="https://calendly.com/your-name/showing"
                    value={localPrefs[prefKey] || ""}
                    onChange={e => updatePref(prefKey, e.target.value)}
                    className="mt-1"
                    data-testid="input-booking-link"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    This link will be sent automatically when a lead asks to book a tour or call.
                  </p>
                </div>
              );
            }
            if (field === "followUpDelayHours") {
              return (
                <div key={field}>
                  <Label className="text-sm font-medium">Follow-Up Delay</Label>
                  <Select value={String(localPrefs[prefKey] || WORKFLOW_PREF_DEFAULTS[wfKey]?.[field] || 24)} onValueChange={v => updatePref(prefKey, Number(v))}>
                    <SelectTrigger className="mt-1" data-testid={`select-${field}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 hours</SelectItem>
                      <SelectItem value="24">24 hours</SelectItem>
                      <SelectItem value="48">48 hours</SelectItem>
                      <SelectItem value="72">72 hours</SelectItem>
                      <SelectItem value="168">7 days</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">How long to wait before sending this follow-up</p>
                </div>
              );
            }
            const labelMap: Record<string, string> = {
              buyerKeywords: "Buyer Detection Keywords",
              sellerKeywords: "Seller Detection Keywords",
              investorKeywords: "Investor Detection Keywords",
              appointmentIntentKeywords: "Appointment Intent Keywords",
            };
            return (
              <div key={field}>
                <Label className="text-sm font-medium">{labelMap[field] || field}</Label>
                <Input
                  placeholder="keyword1, keyword2, keyword3"
                  value={localPrefs[prefKey] || WORKFLOW_PREF_DEFAULTS[wfKey]?.[field] || ""}
                  onChange={e => updatePref(prefKey, e.target.value)}
                  className="mt-1"
                  data-testid={`input-${field}`}
                />
                <p className="text-[11px] text-muted-foreground mt-1">Comma-separated keywords used for detection</p>
              </div>
            );
          })}
        </div>
      );
    };

    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Badge className="mb-2 bg-brand-green/10 text-brand-green border-brand-green/20">Active Engine</Badge>
            <h1 className="text-3xl font-bold text-gray-900"><RealtorMark /> Growth Engine</h1>
            <p className="text-muted-foreground">Your real estate automation system is active and running.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="w-5 h-5 text-brand-green" />
                Active Automations
              </CardTitle>
              <CardDescription>Click any workflow to preview or customize its settings.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[520px]">
                <div className="space-y-2 pr-2">
                  {workflows.length > 0 ? workflows.map((wf: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 border rounded-lg bg-gray-50/50 cursor-pointer hover:bg-gray-100/80 hover:border-brand-green/30 transition-colors group"
                      onClick={() => openModal(wf)}
                      data-testid={`workflow-row-${wf.key}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-muted-foreground bg-gray-200 px-1.5 py-0.5 rounded">{wf.key}</span>
                          <p className="font-medium text-sm text-gray-900 truncate">{wf.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-3 shrink-0">
                        <Badge variant="outline" className={cn("text-[10px]", wf.enabledByDefault !== false ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200")}>
                          {wf.enabledByDefault !== false ? "Running" : "Disabled"}
                        </Badge>
                        <Settings className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                      Loading automation details...
                    </div>
                  )}
                </div>
              </ScrollArea>
              <p className="text-[11px] text-center text-muted-foreground mt-3">
                {workflows.length} workflows active — click to customize
              </p>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="w-4 h-4 text-brand-green" />
                  AI Qualification
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-medium text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Active
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Rules</span>
                    <span className="font-medium">Real Estate Pro</span>
                  </div>
                  <Separator />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    AI is currently scoring leads based on property interest, budget, and purchasing timeline.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-brand-green" />
                  CRM Pipeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(pipeline.stages?.length > 0 ? pipeline.stages : ['New Lead', 'Discovery', 'Tour Scheduled', 'Offer', 'Closed']).map((stage: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-green" />
                      <span className="text-gray-700">{typeof stage === 'string' ? stage : stage.name || stage.displayName}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={!!selectedWf} onOpenChange={(open) => { if (!open) setSelectedWf(null); }}>
          <DialogContent className="max-w-2xl p-0 flex flex-col" style={{ maxHeight: 'calc(100vh - 4rem)' }}>
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b shrink-0">
              <div>
                <DialogTitle className="text-lg font-bold">{selectedWf?.name}</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">Customize preferences safely — core logic is locked.</DialogDescription>
              </div>
            </div>

            <Tabs value={modalTab} onValueChange={setModalTab} className="flex flex-col min-h-0 flex-1">
              <div className="px-6 pt-2 shrink-0">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="preview" className="text-sm" data-testid="tab-preview">
                    <Eye className="w-3.5 h-3.5 mr-1.5" /> Preview
                  </TabsTrigger>
                  <TabsTrigger value="customize" className="text-sm" data-testid="tab-customize">
                    <Settings className="w-3.5 h-3.5 mr-1.5" /> Customize
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto">
                <TabsContent value="preview" className="px-6 pb-4 mt-0 space-y-5">
                  <div className="pt-3">
                    <h4 className="text-sm font-semibold text-gray-800 mb-1">What this workflow does</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {selectedWf && WORKFLOW_DESCRIPTIONS[selectedWf.key]?.summary}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-gray-800 mb-1">Trigger</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedWf && WORKFLOW_DESCRIPTIONS[selectedWf.key]?.triggers}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-gray-800 mb-1">Timing</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedWf && WORKFLOW_DESCRIPTIONS[selectedWf.key]?.timing}
                    </p>
                  </div>

                  {selectedWf?.key === "W2" && (
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-800 mb-1">Qualification logic</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          This workflow detects buyer, seller, and investor intent, scores each inbound message, extracts budget / financing / timeline signals, and asks lightweight follow-up questions when critical information is missing.
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-gray-800 mb-2">Follow-up question priority order</h4>
                        <div className="space-y-1.5">
                          {[
                            { n: 1, label: "Financing / pre-approval", q: localPrefs["W2_financingQuestion"] || WORKFLOW_PREF_DEFAULTS.W2.financingQuestion },
                            { n: 2, label: "Budget / price range", q: localPrefs["W2_budgetQuestion"] || WORKFLOW_PREF_DEFAULTS.W2.budgetQuestion },
                            { n: 3, label: "Timeline / move date", q: localPrefs["W2_timelineQuestion"] || WORKFLOW_PREF_DEFAULTS.W2.timelineQuestion },
                          ].map(item => (
                            <div key={item.n} className="p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Step {item.n} — {item.label}</p>
                              <p className="text-xs text-gray-700 italic">"{item.q}"</p>
                            </div>
                          ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-2">Only the next missing question is asked — one at a time.</p>
                      </div>
                    </div>
                  )}

                  {getWorkflowTemplates(selectedWf).length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800 mb-2">Message Templates Used</h4>
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
                Close
              </Button>
              {modalTab === "customize" && (
                <>
                  <Button variant="outline" onClick={handleRestore} data-testid="button-restore-defaults">
                    <RotateCcw className="w-4 h-4 mr-1.5" /> Restore Defaults
                  </Button>
                  <Button className="bg-brand-green hover:bg-brand-green/90" onClick={handleSave} disabled={saving} data-testid="button-save-preferences">
                    {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                    Save Changes
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
    <RealtorEngineErrorBoundary>
      <>
        {status === "installed" ? (
          <DashboardView />
        ) : isOnboardingPath ? (
          <RGEOnboardingWizard
            step={step}
            setStep={setStep}
            totalSteps={totalSteps}
            form={form}
            status={status}
            submitOnboardingMutation={submitOnboardingMutation}
            setLocation={setLocation}
          />
        ) : (
          <DetailPage />
        )}
        <SubscriptionGateDialog />
      </>
    </RealtorEngineErrorBoundary>
  );
}
