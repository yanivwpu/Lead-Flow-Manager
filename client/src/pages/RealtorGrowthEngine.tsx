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
              onClick={() => { window.location.href = "/app/templates"; }}
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
import { getCheckoutReturnPaths } from "@/lib/checkoutReturnPaths";
import { getSubscriptionApiUrl, useShopifyShopHint } from "@/lib/shopifyBillingHint";
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
  ChevronDown,
  ChevronLeft, 
  Lock, 
  Rocket, 
  ClipboardCheck, 
  Zap, 
  MessageSquare,
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
  ExternalLink
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
  conciergeLaunchAvailability: z.string().min(5, "Share a few times that work for your launch session"),
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
    enabled: status === "submitted",
    staleTime: 60_000,
  });

  const webchatConnected = !!channelSettings?.some((s) => s.channel === "webchat" && !!s.isConnected);
  const calendlyConnected = !!(engineStatusData as { calendlyConnected?: boolean } | undefined)?.calendlyConnected;
  const whatsappReady = !!activationStatus?.whatsappConnected;

  const refreshReadiness = () => {
    void refetchActivation();
    void refetchChannels();
    void refetchEngineStatus();
  };

  const getFieldsForStep = (stepNum: number): string[] => {
    const stepFields: Record<number, string[]> = {
      1: [],
      2: [],
      3: ["legalName", "country", "website", "teamType", "estimatedSeats", "notificationsEnabled", "leadSources", "primaryGoal"],
      4: ["timezone", "conciergeLaunchAvailability"],
      5: [],
    };
    return stepFields[stepNum] || [];
  };

  const nextStep = async () => {
    const fields = getFieldsForStep(step);
    if (fields.length > 0) {
      const result = await form.trigger(fields as any);
      if (!result) return;
    }
    setStep((s) => Math.min(s + 1, totalSteps));
  };

  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  const onSubmit = (values: OnboardingValues) => {
    submitOnboardingMutation.mutate(values);
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
                    <CardDescription>Helps us tailor defaults and your concierge session.</CardDescription>
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
                    <CardTitle className="text-lg">Concierge launch session</CardTitle>
                    <CardDescription className="text-base leading-relaxed">
                      A focused working session (not generic tech support) to validate channels, confirm automation behavior,
                      review qualification priorities, tighten booking flows, and make sure everything is live the way you work.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                          <FormLabel>Availability for your session</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="e.g. Tue-Thu 2-5pm ET; avoid Friday mornings"
                              className="min-h-[100px]"
                              {...field}
                              data-testid="textarea-concierge-availability"
                            />
                          </FormControl>
                          <FormDescription>We&apos;ll reach out to schedule.</FormDescription>
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
                              data-testid="textarea-additional-notes"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
                  Book your concierge launch session
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
  const isShopify = !!(billingAccount?.subscription?.isShopify) || !!shopHint;

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
    if (paid === "true" && sessionId) {
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
        body: JSON.stringify(getCheckoutReturnPaths()),
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
      return { label: "Continue setup", disabled: purchaseMutation.isPending };
    }
    if (status === "submitted") {
      return { label: "Launch in progress", disabled: true as const };
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
          <Button variant="outline" onClick={() => setLocation("/app/templates")} data-testid="button-error-back">
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
    } else if (status === "purchased") {
      setLocation("/app/templates/realtor-growth-engine/onboarding");
    }
  };

  const renderStepper = () => (
    <div className="flex items-center justify-center space-x-4 mb-5">
      <div className="flex flex-col items-center">
        <div className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center border-2 text-sm",
          status !== 'locked' ? "bg-brand-green border-brand-green text-white" : "border-gray-300 text-gray-400"
        )}>
          {status !== 'locked' ? <CheckCircle2 className="w-5 h-5" /> : "1"}
        </div>
        <span className="text-xs mt-1.5 font-medium">Activate</span>
      </div>
      <div className="w-10 h-0.5 bg-gray-200" />
      <div className="flex flex-col items-center">
        <div className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center border-2 text-sm",
          status === 'submitted' || status === 'installed' ? "bg-brand-green border-brand-green text-white" : 
          status === 'purchased' ? "border-brand-green text-brand-green" : "border-gray-300 text-gray-400"
        )}>
          {status === 'submitted' || status === 'installed' ? <CheckCircle2 className="w-5 h-5" /> : "2"}
        </div>
        <span className="text-xs mt-1.5 font-medium">Setup</span>
      </div>
      <div className="w-10 h-0.5 bg-gray-200" />
      <div className="flex flex-col items-center">
        <div className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center border-2 text-sm",
          status === 'installed' ? "bg-brand-green border-brand-green text-white" : "border-gray-300 text-gray-400"
        )}>
          {status === 'installed' ? <CheckCircle2 className="w-5 h-5" /> : "3"}
        </div>
        <span className="text-xs mt-1.5 font-medium">Go Live</span>
      </div>
    </div>
  );

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

    const trunkNodes = [
      { key: "inquiry", label: "New inquiry received", box: "border-gray-200/90 bg-white text-gray-900 shadow-sm" },
      { key: "ai", label: "Instant AI response", box: "border-emerald-200/80 bg-emerald-50/90 text-emerald-950 shadow-sm" },
      { key: "qual", label: "Qualification questions", box: "border-gray-200/90 bg-white text-gray-900 shadow-sm" },
      { key: "score", label: "Hot lead scoring", box: "border-violet-200/80 bg-violet-50/80 text-violet-950 shadow-sm" },
    ];

    const whatItDoesLines = [
      "Captures new real estate leads the moment they message you.",
      "Replies instantly on WhatsApp with context-aware conversation.",
      "Qualifies buyers and sellers using structured signals (financing, budget, timeline).",
      "Detects booking intent and moves the thread toward a showing or call.",
      "Schedules showings or calls when your calendar is connected.",
      "Follows up automatically when leads go cold on a 24h / 72h / 7d cadence.",
      "Updates CRM stage, score, tags, and next step so your pipeline stays honest.",
    ];

    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-20 sm:px-6 lg:max-w-7xl">
        <div className="mb-6 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-gray-600 hover:text-gray-900"
            onClick={() => setLocation("/app/templates")}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back to Growth Engines
          </Button>
        </div>

        <section className="relative mb-12 overflow-hidden rounded-2xl border border-gray-900/10 shadow-lg ring-1 ring-black/5">
          <div className="relative min-h-[240px] sm:min-h-[300px] md:min-h-[340px]">
            <img
              src="/og/og-realtor-growth-engine.png"
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-[center_22%]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/45 to-black/30" />
            <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
              <Badge className="border border-white/25 bg-black/45 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur-md">
                Premium Growth Engine
              </Badge>
            </div>
            <div className="relative z-[1] flex min-h-[240px] flex-col items-center justify-center px-6 py-14 text-center sm:min-h-[300px] md:min-h-[340px] md:px-12">
              <h1 className="max-w-4xl text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
                <RealtorMark /> Growth Engine
              </h1>
              <p className="mt-3 max-w-2xl text-base font-medium text-white/95 sm:text-lg md:text-xl">
                AI-powered WhatsApp automation for real estate
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/80 sm:text-base">
                Convert inquiries into qualified buyers and booked showings — automatically.
              </p>
            </div>
          </div>
        </section>

        <div className="mb-12 flex justify-center">{renderStepper()}</div>

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

        <Card className="mb-10 border-gray-200/80 shadow-sm">
          <CardContent className="grid gap-10 p-6 sm:p-8 lg:grid-cols-2 lg:gap-12 lg:p-10">
            <div className="min-w-0 space-y-5">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">What it does</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 sm:text-base">
                  A coordinated automation layer that runs alongside your inbox and CRM — built for real estate speed-to-lead.
                </p>
              </div>
              <ul className="space-y-3 text-sm leading-relaxed text-gray-800 sm:text-[15px]">
                {whatItDoesLines.map((line) => (
                  <li key={line} className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0">
              <div className="rounded-2xl border border-gray-200/90 bg-gradient-to-b from-gray-50 to-white p-4 shadow-inner sm:p-5">
                <div className="flex items-center gap-2 border-b border-gray-200/80 pb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/25">
                    <MessageSquare className="h-4 w-4 text-emerald-700" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Preview</p>
                    <p className="text-sm font-medium text-gray-900">New lead · WhatsApp</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl rounded-tl-sm border border-gray-200 bg-white px-3 py-2.5 text-left text-xs leading-relaxed text-gray-800 shadow-sm">
                    Hi — we&apos;re looking for a 3bd under $800k near the lake. Is this still available?
                  </div>
                  <div className="ml-4 flex gap-2 rounded-xl rounded-tr-sm border border-emerald-600/25 bg-emerald-600 px-3 py-2.5 text-left text-xs leading-relaxed text-white shadow-sm">
                    <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                    <span>
                      Thanks for reaching out. Are you pre-approved or still exploring financing? That helps me route you to the right listings.
                    </span>
                  </div>
                  <div className="rounded-xl rounded-tl-sm border border-gray-200 bg-white px-3 py-2.5 text-left text-xs leading-relaxed text-gray-800 shadow-sm">
                    Pre-approved with our lender — can we tour this weekend?
                  </div>
                  <div className="ml-4 flex gap-2 rounded-xl rounded-tr-sm border border-emerald-600/25 bg-emerald-600 px-3 py-2.5 text-left text-xs leading-relaxed text-white shadow-sm">
                    <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                    <span>Perfect. I flagged you as a hot buyer and sent a booking link — pick a time that works.</span>
                  </div>
                  <p className="pt-1 text-center text-[11px] text-gray-500">Illustrative conversation — your copy and rules are configured at install.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <section id="rge-whats-included" className="mb-10 scroll-mt-24">
          <div className="mb-5">
            <h2 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">What&apos;s included</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600 sm:text-base">
              Everything installed as a system — not a loose pile of message templates.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {includedItems.map(({ Icon, t, d }) => (
              <Card key={t} className="border-gray-200/80 bg-white shadow-sm transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-start gap-3 space-y-0 p-5 pb-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 ring-1 ring-violet-100">
                    <Icon className="h-4 w-4 text-violet-700" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-sm font-semibold leading-snug text-gray-900">{t}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5 pt-0 text-xs leading-relaxed text-gray-600 sm:text-sm">{d}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Card className="mb-10 border-gray-200/80 shadow-sm" id="rge-architecture">
          <CardHeader className="px-6 pt-6 pb-2 sm:px-8">
            <CardTitle className="text-xl font-semibold text-gray-900 sm:text-2xl">Automation architecture</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              How inbound messages, timers, and CRM updates connect — a real system, not a single static template.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-6 sm:px-8 sm:pb-8">
            <div className="rounded-2xl border border-gray-200/90 bg-gradient-to-br from-gray-50/90 via-white to-gray-50/50 p-5 sm:p-8">
              <div className="flex flex-col items-stretch gap-2 md:flex-row md:flex-wrap md:items-center md:justify-center md:gap-0">
                {trunkNodes.map((node, i) => (
                  <React.Fragment key={node.key}>
                    {i > 0 && (
                      <ChevronRight className="mx-1 hidden h-5 w-5 shrink-0 self-center text-gray-300 md:block" aria-hidden />
                    )}
                    {i > 0 && <ChevronDown className="my-1 h-4 w-4 shrink-0 self-center text-gray-300 md:hidden" aria-hidden />}
                    <div
                      className={cn(
                        "min-h-[3.25rem] flex-1 rounded-xl border px-3 py-3 text-center text-xs font-semibold leading-snug sm:min-w-0 sm:flex-none sm:px-4 sm:text-sm md:max-w-[200px]",
                        node.box,
                      )}
                    >
                      {node.label}
                    </div>
                  </React.Fragment>
                ))}
              </div>

              <div className="mt-8 grid gap-4 lg:grid-cols-3">
                <div className="rounded-xl border border-gray-200/90 bg-white p-5 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Branch</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">Booking / showing intent</p>
                  <p className="mt-2 text-xs leading-relaxed text-gray-600">
                    Calendar or handoff path when the lead signals tours, calls, or availability checks.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200/90 bg-white p-5 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Branch</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">No-reply follow-up</p>
                  <p className="mt-2 text-xs leading-relaxed text-gray-600">
                    24h → 72h → 7d nurture ladder until the lead re-engages or is marked cold.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200/90 bg-white p-5 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Branch</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">Human handoff</p>
                  <p className="mt-2 text-xs leading-relaxed text-gray-600">
                    High-intent or sensitive threads surface as tasks with full transcript context.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col items-center gap-2">
                <ChevronDown className="h-4 w-4 text-gray-300" aria-hidden />
                <div className="w-full max-w-xl rounded-xl border border-gray-900/15 bg-gray-900 px-4 py-3.5 text-center text-sm font-semibold text-white shadow-md">
                  CRM update: stage · tag · score · next action
                </div>
              </div>

              <div className="mt-5 flex items-start justify-center gap-2 text-center text-xs text-gray-600 sm:text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" aria-hidden />
                <span>Every path keeps your pipeline accurate — stages and scores update as the conversation evolves.</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mb-12 grid gap-6 lg:grid-cols-2">
          <Card className="border-gray-200/80 shadow-sm" id="rge-requirements">
            <CardHeader className="px-6 pt-6 pb-2">
              <CardTitle className="text-lg font-semibold text-gray-900 sm:text-xl">Requirements</CardTitle>
              <CardDescription className="text-sm">Before this engine can run end-to-end in your account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-6 pb-6">
              {[
                "Requires Pro plan",
                "Requires AI Brain",
                "WhatsApp Business connected for live automations",
                "Approved templates may be needed for re-engagement outside the customer service window",
                "Concierge onboarding included with purchase",
              ].map((line) => (
                <div key={line} className="flex gap-3 text-sm text-gray-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
                  <span className="leading-snug">{line}</span>
                </div>
              ))}
              <p className="border-t border-gray-100 pt-4 text-xs leading-relaxed text-gray-500">
                WhatsApp messaging fees are billed by Meta. Premium add-ons follow your billing provider&apos;s checkout rules (including Shopify confirmation flows where applicable).
              </p>
            </CardContent>
          </Card>

          <Card className="border-emerald-100/90 bg-emerald-50/30 shadow-sm">
            <CardHeader className="px-6 pt-6 pb-2">
              <CardTitle className="text-lg font-semibold text-gray-900 sm:text-xl">Premium onboarding &amp; concierge</CardTitle>
              <CardDescription className="text-sm">We stay with you until the system is live — not a generic help article.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 px-6 pb-6">
              {[
                "White-glove setup with a launch specialist",
                "Channel validation (WhatsApp, Meta surfaces, web chat where used)",
                "Workflow review against your market and offer",
                "Launch optimization session to tune qualification and booking paths",
                "Go-live checklist so automations match how you actually work",
              ].map((line) => (
                <div key={line} className="flex gap-3 text-sm text-gray-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="leading-snug">{line}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <section className="rounded-2xl border border-emerald-200/60 bg-emerald-50/50 px-6 py-10 text-center shadow-sm sm:px-10 sm:py-12">
          <h3 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">Ready to run this in your workspace?</h3>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-gray-600 sm:text-base">
            {status === "locked" && "Activate the Realtor Growth Engine to unlock checkout and guided concierge onboarding."}
            {status === "purchased" && "Finish channel alignment and your launch profile so we can install and validate everything."}
            {status === "submitted" && "Your concierge team is aligning on install and session scheduling — watch your inbox for next steps."}
          </p>
          <Button
            size="lg"
            className={cn(
              "mt-8 min-w-[200px] bg-brand-green px-8 text-base font-semibold text-white shadow-sm hover:bg-brand-green/90",
              (primaryMarketingCta.disabled || purchaseMutation.isPending) && "pointer-events-none opacity-50",
            )}
            onClick={handlePrimaryCta}
            disabled={purchaseMutation.isPending || primaryMarketingCta.disabled}
            data-testid="button-bottom-cta"
          >
            {checkingSubscription && status === "locked" ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Checking…
              </>
            ) : purchaseMutation.isPending && status === "locked" ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Redirecting…
              </>
            ) : (
              <>
                {primaryMarketingCta.label}
                {!primaryMarketingCta.disabled && <ChevronRight className="ml-2 h-5 w-5" />}
              </>
            )}
          </Button>
          <p className="mx-auto mt-4 flex max-w-xl flex-wrap items-center justify-center gap-x-1 gap-y-1 text-xs text-gray-500">
            <Lock className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
            <span>One-time template license · Requires Pro + AI Brain · WhatsApp connects before activation</span>
          </p>
        </section>
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
                  window.open(data.url, '_blank');
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
      summary: "Instantly replies to every new WhatsApp inquiry with a personalized greeting. Creates a lead record, tags as 'New', sets pipeline to 'New Lead', and creates a review task.",
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
                <Button variant="outline" size="sm" className="w-full mt-4 text-xs" onClick={() => setLocation("/app/inbox")}>
                  Open CRM
                </Button>
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
