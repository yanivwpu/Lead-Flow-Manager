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

import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
  Lock, 
  Rocket, 
  ClipboardCheck, 
  Zap, 
  MessageSquare, 
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
  PhoneOff
} from "lucide-react";
import { useForm } from "react-hook-form";
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
  // Step 1: Business Eligibility
  isRegisteredEntity: z.enum(["yes", "no"]),
  
  // Step 2: Business Details
  legalName: z.string().min(2, "Legal name is required"),
  country: z.string().min(2, "Country is required"),
  website: z.string().url("Valid website URL is required"),
  
  // Step 3: WhatsApp Setup
  desiredNumber: z.string().min(8, "Valid phone number is required"),
  isNumberActive: z.enum(["yes", "no"]),
  willingToMigrate: z.enum(["yes", "no"]),
  hasSmsAccess: z.enum(["yes", "no"]),
  
  // Step 4: Meta Business Manager
  hasMetaBM: z.enum(["yes", "no"]),
  bmEmail: z.string().email("Valid BM admin email is required"),
  bmId: z.string().optional(),
  
  // Step 5: CRM & Team
  teamType: z.enum(["solo", "team"]),
  estimatedSeats: z.string(),
  notificationsEnabled: z.boolean().default(true),
  
  // Step 6: Lead Sources & Goals
  leadSources: z.string().min(5, "Please describe your lead sources"),
  primaryGoal: z.string().min(5, "Please describe your primary goal"),
  
  // Step 7: Scheduling
  timezone: z.string(),
  preferredCallWindows: z.string().min(5, "Preferred call windows required"),
  
  // Step 8: Notes
  additionalNotes: z.string().optional(),
});

type OnboardingValues = z.infer<typeof onboardingSchema>;

// --- Components ---

export function RealtorGrowthEngine() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const totalSteps = 8;
  const [eligibilityOpen, setEligibilityOpen] = useState(false);
  const [eligibilityAnswer, setEligibilityAnswer] = useState<string>("");
  const [eligibilityBlocked, setEligibilityBlocked] = useState(false);
  const [subscriptionGate, setSubscriptionGate] = useState<{ show: boolean; hasPro: boolean; hasAI: boolean }>({ show: false, hasPro: true, hasAI: true });
  const [checkingSubscription, setCheckingSubscription] = useState(false);

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
      toast({ title: "Payment confirmed", description: "Next step: complete your onboarding so we can activate your system." });
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
  }, []);

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/templates/realtor-growth-engine/purchase");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine"] });
        toast({ title: "Template Unlocked", description: "You can now proceed to onboarding." });
        setEligibilityOpen(false);
      }
    }
  });

  const submitOnboardingMutation = useMutation({
    mutationFn: async (values: OnboardingValues) => {
      const res = await apiRequest("POST", "/api/templates/realtor-growth-engine/onboarding/submit", { payload: values });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine"] });
      toast({ title: "Onboarding Submitted", description: "Our team will review your details shortly." });
    }
  });

  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      isRegisteredEntity: "yes",
      isNumberActive: "no",
      willingToMigrate: "yes",
      hasSmsAccess: "yes",
      hasMetaBM: "no",
      teamType: "solo",
      estimatedSeats: "1",
      notificationsEnabled: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
  });

  const status = templateData?.entitlement?.status || 'locked';

  const { data: assetsData } = useQuery({
    queryKey: ["/api/templates/realtor-growth-engine/assets"],
    enabled: !!templateData && status === 'installed'
  });

  const workflows = assetsData?.assets?.find((a: any) => a.assetType === 'workflows')?.definition?.workflows || [];
  const pipeline = assetsData?.assets?.find((a: any) => a.assetType === 'pipeline')?.definition || { stages: [] };
  const subscriptionActive = templateData?.subscription?.active !== false;
  const isPaused = !subscriptionActive && (status === 'purchased' || status === 'submitted' || status === 'installed');

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

  const handlePrimaryCta = () => {
    if (status === 'locked') {
      setEligibilityAnswer("");
      setEligibilityBlocked(false);
      setEligibilityOpen(true);
    } else if (isPaused) {
      return;
    } else if (status === 'purchased') {
      setLocation("/app/templates/realtor-growth-engine/onboarding");
    }
  };

  const handleEligibilityContinue = async () => {
    if (eligibilityAnswer === "no") {
      setEligibilityBlocked(true);
      return;
    }
    if (eligibilityAnswer === "yes") {
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

  const DetailPage = () => (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* HERO SECTION */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 mb-4">
          Turn Real Estate Conversations Into Booked Showings Automatically
        </h1>
        <p className="text-lg text-gray-600 mb-3">
          AI-powered WhatsApp automation that responds instantly, qualifies leads, and schedules showings for you.
        </p>
        <p className="text-base text-gray-500 mb-6">
          A fully pre-built automation system installed inside your CRM — ready to run.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button 
            className={cn("bg-brand-green hover:bg-brand-green/90 text-white", isPaused ? "opacity-50 cursor-not-allowed" : "")}
            onClick={handlePrimaryCta}
            disabled={purchaseMutation.isPending || status === 'submitted' || status === 'installed' || isPaused}
            data-testid="button-hero-cta"
          >
            Install Realtor Growth Engine
            {!isPaused && <ChevronRight className="ml-2 w-4 h-4" />}
          </Button>
          <Button 
            variant="outline"
            onClick={() => {
              const workflowSection = document.getElementById("workflow-section");
              if (workflowSection) workflowSection.scrollIntoView({ behavior: 'smooth' });
            }}
            data-testid="button-see-how"
          >
            See How It Works
          </Button>
        </div>
      </div>

      {renderStepper()}

      {isPaused && (
        <Card className="border-amber-300 bg-amber-50 mb-8" data-testid="banner-subscription-paused">
          <CardContent className="flex items-start gap-3 py-4 px-5">
            <PauseCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-amber-900 text-sm">Growth Engine Paused</p>
              <p className="text-xs text-amber-800 mt-0.5">
                Your <RealtorMark /> Growth Engine requires an active Pro + AI plan to run automations and handle conversations.
                Reactivate your plan to resume your system instantly.
              </p>
              <p className="text-[11px] text-amber-700 mt-1">Your purchase and configuration are saved — nothing is lost.</p>
              <div className="flex gap-2 mt-2.5">
                {!templateData?.subscription?.hasPro && (
                  <Button size="sm" variant="outline" className="text-xs border-amber-400 text-amber-900 hover:bg-amber-100" onClick={() => { sessionStorage.setItem("rge_reactivating", "1"); setLocation("/app/settings"); }} data-testid="button-reactivate-pro">
                    Reactivate Pro
                  </Button>
                )}
                {!templateData?.subscription?.hasAI && (
                  <Button size="sm" variant="outline" className="text-xs border-amber-400 text-amber-900 hover:bg-amber-100" onClick={() => { sessionStorage.setItem("rge_reactivating", "1"); setLocation("/app/ai-brain"); }} data-testid="button-reactivate-ai">
                    Enable AI
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DONE-FOR-YOU SETUP SECTION */}
      <Card className="mb-8 border-green-100 bg-green-50/50">
        <CardHeader className="pb-2 pt-5 px-5">
          <CardTitle className="text-xl font-bold text-gray-900">Fully Done-For-You Setup</CardTitle>
          <CardDescription className="text-sm mt-1">No technical setup required. Live in days.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-5 pb-5">
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-brand-green mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm text-gray-900">WhatsApp Business API setup</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-brand-green mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm text-gray-900">Meta verification assistance</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-brand-green mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm text-gray-900">Automation workflows installed</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-brand-green mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm text-gray-900">CRM pipeline configured</p>
            </div>
          </div>
          <div className="flex items-start space-x-3 sm:col-span-2">
            <CheckCircle2 className="w-5 h-5 text-brand-green mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm text-gray-900">Calendar integration included</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* WHAT IT DOES SECTION */}
      <Card className="mb-8">
        <CardHeader className="pb-2 pt-5 px-5">
          <CardTitle className="text-xl font-bold text-gray-900">What the Growth Engine Does</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-5 pb-5">
          {[
            { icon: Zap, title: "Responds instantly to every inquiry", desc: "Buyers reach you 24/7 — no missed conversations." },
            { icon: Target, title: "Qualifies buyers automatically", desc: "Identifies serious prospects based on budget, financing readiness, and timeline." },
            { icon: Lightbulb, title: "Identifies serious prospects", desc: "Surfaces ready-to-close leads so you focus on who matters most." },
            { icon: Calendar, title: "Sends your calendar when they want to book", desc: "Leads schedule their own showings into your availability." },
            { icon: Clock, title: "Follows up automatically if leads go quiet", desc: "Never lose a warm lead to silence — multi-day sequences keep them engaged." },
            { icon: LayoutGrid, title: "Keeps everything organized in your CRM", desc: "Leads flow through your pipeline with scores and stage tags automatically." },
          ].map((item, idx) => (
            <div key={idx} className="flex space-x-3">
              <div className="mt-0.5 bg-brand-green/10 p-2 rounded-md h-fit">
                <item.icon className="w-4 h-4 text-brand-green" />
              </div>
              <div>
                <h4 className="font-semibold text-sm text-gray-900">{item.title}</h4>
                <p className="text-sm text-gray-600 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* WORKFLOW SECTION */}
      <Card className="mb-8" id="workflow-section">
        <CardHeader className="pb-2 pt-5 px-5">
          <CardTitle className="text-xl font-bold text-gray-900">How Your System Works</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <ol className="relative border-l border-gray-200 ml-3 space-y-6">
            <li className="mb-6 ml-6">
              <span className="absolute flex items-center justify-center w-7 h-7 bg-brand-green rounded-full -left-3.5 ring-4 ring-white">
                <MessageSquare className="w-3.5 h-3.5 text-white" />
              </span>
              <h3 className="font-semibold text-sm text-gray-900">Lead sends a message on WhatsApp</h3>
              <p className="text-sm text-gray-600 mt-1">
                Inquiry arrives from a buyer or seller. Your system immediately springs to life.
              </p>
            </li>
            <li className="mb-6 ml-6">
              <span className="absolute flex items-center justify-center w-7 h-7 bg-brand-green rounded-full -left-3.5 ring-4 ring-white">
                <Zap className="w-3.5 h-3.5 text-white" />
              </span>
              <h3 className="font-semibold text-sm text-gray-900">Instant automated response goes out</h3>
              <p className="text-sm text-gray-600 mt-1">
                Lead gets a personalized greeting within seconds — no waiting.
              </p>
            </li>
            <li className="mb-6 ml-6">
              <span className="absolute flex items-center justify-center w-7 h-7 bg-brand-green rounded-full -left-3.5 ring-4 ring-white">
                <Target className="w-3.5 h-3.5 text-white" />
              </span>
              <h3 className="font-semibold text-sm text-gray-900">AI qualifies the lead in real-time</h3>
              <p className="text-sm text-gray-600 mt-1">
                Conversation is analyzed for budget, intent, and seriousness. Lead gets scored automatically.
              </p>
            </li>
            <li className="mb-6 ml-6">
              <span className="absolute flex items-center justify-center w-7 h-7 bg-brand-green rounded-full -left-3.5 ring-4 ring-white">
                <Calendar className="w-3.5 h-3.5 text-white" />
              </span>
              <h3 className="font-semibold text-sm text-gray-900">Booking link is sent automatically</h3>
              <p className="text-sm text-gray-600 mt-1">
                When they ask to schedule, your calendar opens directly in the chat. They book their own showing.
              </p>
            </li>
            <li className="mb-6 ml-6">
              <span className="absolute flex items-center justify-center w-7 h-7 bg-brand-green rounded-full -left-3.5 ring-4 ring-white">
                <Users className="w-3.5 h-3.5 text-white" />
              </span>
              <h3 className="font-semibold text-sm text-gray-900">You get a handoff with the lead pre-qualified</h3>
              <p className="text-sm text-gray-600 mt-1">
                Serious leads flow into your CRM with full context. Your time is spent on high-probability deals.
              </p>
            </li>
            <li className="ml-6">
              <span className="absolute flex items-center justify-center w-7 h-7 bg-brand-green rounded-full -left-3.5 ring-4 ring-white">
                <TrendingUp className="w-3.5 h-3.5 text-white" />
              </span>
              <h3 className="font-semibold text-sm text-gray-900">Cold leads get nurtured automatically</h3>
              <p className="text-sm text-gray-600 mt-1">
                Leads who go quiet get follow-ups on day 1, 3, and 7. Your CRM keeps track of everything.
              </p>
            </li>
          </ol>
          <div className="mt-8 text-center">
            <p className="text-lg font-semibold text-gray-900">Only serious leads reach you.</p>
          </div>
        </CardContent>
      </Card>

      {/* BUILT FOR SECTION */}
      <Card className="mb-8 bg-gray-50/50 border-gray-200">
        <CardHeader className="pb-2 pt-5 px-5">
          <CardTitle className="text-xl font-bold text-gray-900">Built For</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-5 pb-5">
          <div className="flex flex-col gap-2">
            <div className="bg-brand-green/10 p-3 rounded-lg h-fit w-fit">
              <PhoneOff className="w-5 h-5 text-brand-green" />
            </div>
            <h4 className="font-semibold text-gray-900">Solo agents who want 24/7 lead handling</h4>
            <p className="text-sm text-gray-600">Never miss a lead again. Your system works while you sleep.</p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="bg-brand-green/10 p-3 rounded-lg h-fit w-fit">
              <Users className="w-5 h-5 text-brand-green" />
            </div>
            <h4 className="font-semibold text-gray-900">Real estate teams managing high volumes</h4>
            <p className="text-sm text-gray-600">Scale lead handling without hiring more staff.</p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="bg-brand-green/10 p-3 rounded-lg h-fit w-fit">
              <TrendingUp className="w-5 h-5 text-brand-green" />
            </div>
            <h4 className="font-semibold text-gray-900">Agents running ads and lead generation campaigns</h4>
            <p className="text-sm text-gray-600">Turn ad spend into booked showings faster.</p>
          </div>
        </CardContent>
      </Card>

      {/* WHAT HAPPENS AFTER SECTION */}
      <Card className="mb-8">
        <CardHeader className="pb-2 pt-5 px-5">
          <CardTitle className="text-xl font-bold text-gray-900">What Happens After You Activate</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-brand-green text-white font-semibold text-sm">
                1
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Connect your channels</h4>
                <p className="text-sm text-gray-600 mt-0.5">Authenticate your WhatsApp and calendar integrations.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-brand-green text-white font-semibold text-sm">
                2
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">The system installs automatically</h4>
                <p className="text-sm text-gray-600 mt-0.5">All workflows, automations, and CRM pipelines deploy in your account.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-brand-green text-white font-semibold text-sm">
                3
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Automations go live</h4>
                <p className="text-sm text-gray-600 mt-0.5">Your system is ready to capture and handle incoming messages.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-brand-green text-white font-semibold text-sm">
                4
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Leads start getting qualified and routed</h4>
                <p className="text-sm text-gray-600 mt-0.5">First message arrives and your automation starts working immediately.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* WHAT POWERS IT SECTION */}
      <Card className="mb-8">
        <CardHeader className="pb-2 pt-5 px-5">
          <CardTitle className="text-xl font-bold text-gray-900">What Powers the Realtor Growth Engine</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="border rounded-lg p-4 text-center">
              <p className="text-sm font-semibold text-gray-600 mb-1">Core Platform</p>
              <p className="text-lg font-bold text-gray-900">WhachatCRM Pro</p>
              <p className="text-sm text-gray-600 mt-1">$49/mo</p>
            </div>
            <div className="border rounded-lg p-4 text-center">
              <p className="text-sm font-semibold text-gray-600 mb-1">AI Automation Layer</p>
              <p className="text-lg font-bold text-gray-900">AI Brain</p>
              <p className="text-sm text-gray-600 mt-1">$29/mo</p>
            </div>
            <div className="border rounded-lg p-4 text-center bg-brand-green/5 border-brand-green/30">
              <p className="text-sm font-semibold text-gray-600 mb-1">Realtor Growth Engine</p>
              <p className="text-lg font-bold text-gray-900">Template License</p>
              <p className="text-sm text-brand-green font-semibold mt-1">$199</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 text-center mt-4">
            WhatsApp messaging fees are billed directly by Meta with no markup.
          </p>
        </CardContent>
      </Card>

      {/* FINAL CTA SECTION */}
      <Card className="border-brand-green/30 bg-brand-green/5">
        <CardContent className="px-5 py-8 text-center">
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Ready to turn leads into sales?</h3>
          <p className="text-base text-gray-600 mb-6">Install Realtor Growth Engine and start automatically qualifying buyers today.</p>
          <Button 
            className="bg-brand-green hover:bg-brand-green/90 text-white text-base px-8"
            onClick={handlePrimaryCta}
            disabled={purchaseMutation.isPending || status === 'submitted' || status === 'installed'}
            data-testid="button-bottom-cta"
          >
            Install Realtor Growth Engine
            <ChevronRight className="ml-2 w-5 h-5" />
          </Button>
          <p className="text-xs text-gray-500 mt-4">Ready to run. No technical setup required.</p>
        </CardContent>
      </Card>
    </div>
  );

  const OnboardingForm = () => {
    const isEligibilityBlocked = step === 1 && form.watch("isRegisteredEntity") !== "yes";

    const nextStep = async () => {
      const fields = getFieldsForStep(step);
      const result = await form.trigger(fields as any);
      if (!result) return;
      if (step === 1 && form.getValues("isRegisteredEntity") !== "yes") return;
      setStep(s => Math.min(s + 1, totalSteps));
    };

    const prevStep = () => setStep(s => Math.max(s - 1, 1));

    const getFieldsForStep = (stepNum: number): string[] => {
      const stepFields: Record<number, string[]> = {
        1: ["isRegisteredEntity"],
        2: ["legalName", "country", "website"],
        3: ["desiredNumber", "isNumberActive", "willingToMigrate", "hasSmsAccess"],
        4: ["hasMetaBM", "bmEmail", "bmId"],
        5: ["teamType", "estimatedSeats", "notificationsEnabled"],
        6: ["leadSources", "primaryGoal"],
        7: ["timezone", "preferredCallWindows"],
        8: ["additionalNotes"],
      };
      return stepFields[stepNum] || [];
    };

    const onSubmit = (values: OnboardingValues) => {
      submitOnboardingMutation.mutate(values);
    };

    const closeAndResetModal = () => {
      setEligibilityOpen(false);
      setEligibilityAnswer("");
      setEligibilityBlocked(false);
    };

    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        {status === 'purchased' && (
          <div className="mb-8">
            <div className="text-center mb-6">
              <Badge className="mb-4 bg-brand-green/10 text-brand-green border-brand-green/20">Step {step} of {totalSteps}</Badge>
              <h2 className="text-2xl font-bold text-gray-900">Complete Your Onboarding</h2>
            </div>
            <Progress value={(step / totalSteps) * 100} className="mb-8" />

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {step === 1 && (
                  <Card>
                    <CardHeader><CardTitle>Business Eligibility</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="isRegisteredEntity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Is your real estate business a registered legal entity?</FormLabel>
                            <FormControl>
                              <RadioGroup value={field.value} onValueChange={field.onChange} className="flex flex-col space-y-2 mt-2">
                                <div className="flex items-center space-x-3">
                                  <RadioGroupItem value="yes" id="reg-yes" data-testid="radio-registered-yes" />
                                  <Label htmlFor="reg-yes" className="font-normal cursor-pointer">Yes, registered (LLC / Corp / Ltd)</Label>
                                </div>
                                <div className="flex items-center space-x-3">
                                  <RadioGroupItem value="no" id="reg-no" data-testid="radio-registered-no" />
                                  <Label htmlFor="reg-no" className="font-normal cursor-pointer">No, I operate as an individual</Label>
                                </div>
                              </RadioGroup>
                            </FormControl>
                            <FormDescription>Required for WhatsApp Business API approval with Meta.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                )}

                {step === 2 && (
                  <Card>
                    <CardHeader><CardTitle>Business Details</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="legalName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Legal Business Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Your business legal name" {...field} data-testid="input-legal-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="country"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Country</FormLabel>
                            <FormControl>
                              <Input placeholder="Your country" {...field} data-testid="input-country" />
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
                            <FormLabel>Business Website</FormLabel>
                            <FormControl>
                              <Input placeholder="https://yourwebsite.com" {...field} data-testid="input-website" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                )}

                {step === 3 && (
                  <Card>
                    <CardHeader><CardTitle>WhatsApp Setup</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="desiredNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Desired WhatsApp Number</FormLabel>
                            <FormControl>
                              <Input placeholder="+1 (555) 123-4567" {...field} data-testid="input-desired-number" />
                            </FormControl>
                            <FormDescription>The phone number you want to use for WhatsApp Business</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="isNumberActive"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Is this number currently active on WhatsApp?</FormLabel>
                            <FormControl>
                              <RadioGroup value={field.value} onValueChange={field.onChange} className="flex space-x-4 mt-2">
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="yes" id="num-active-yes" data-testid="radio-num-active-yes" />
                                  <Label htmlFor="num-active-yes" className="font-normal cursor-pointer">Yes</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="no" id="num-active-no" data-testid="radio-num-active-no" />
                                  <Label htmlFor="num-active-no" className="font-normal cursor-pointer">No</Label>
                                </div>
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="willingToMigrate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Are you willing to migrate your WhatsApp business account?</FormLabel>
                            <FormControl>
                              <RadioGroup value={field.value} onValueChange={field.onChange} className="flex space-x-4 mt-2">
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="yes" id="migrate-yes" data-testid="radio-migrate-yes" />
                                  <Label htmlFor="migrate-yes" className="font-normal cursor-pointer">Yes</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="no" id="migrate-no" data-testid="radio-migrate-no" />
                                  <Label htmlFor="migrate-no" className="font-normal cursor-pointer">No</Label>
                                </div>
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="hasSmsAccess"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Do you have access to SMS for this number?</FormLabel>
                            <FormControl>
                              <RadioGroup value={field.value} onValueChange={field.onChange} className="flex space-x-4 mt-2">
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="yes" id="sms-yes" data-testid="radio-sms-yes" />
                                  <Label htmlFor="sms-yes" className="font-normal cursor-pointer">Yes</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="no" id="sms-no" data-testid="radio-sms-no" />
                                  <Label htmlFor="sms-no" className="font-normal cursor-pointer">No</Label>
                                </div>
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                )}

                {step === 4 && (
                  <Card>
                    <CardHeader><CardTitle>Meta Business Manager</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="hasMetaBM"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Do you have a Meta Business Manager account?</FormLabel>
                            <FormControl>
                              <RadioGroup value={field.value} onValueChange={field.onChange} className="flex space-x-4 mt-2">
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="yes" id="bm-yes" data-testid="radio-bm-yes" />
                                  <Label htmlFor="bm-yes" className="font-normal cursor-pointer">Yes</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="no" id="bm-no" data-testid="radio-bm-no" />
                                  <Label htmlFor="bm-no" className="font-normal cursor-pointer">No</Label>
                                </div>
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="bmEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>BM Admin Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="admin@example.com" {...field} data-testid="input-bm-email" />
                            </FormControl>
                            <FormDescription>Primary email with Business Manager admin access</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="bmId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Business Manager ID (optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="Your BM ID if you know it" {...field} data-testid="input-bm-id" />
                            </FormControl>
                            <FormDescription>Found in Business Manager settings, not required</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                )}

                {step === 5 && (
                  <Card>
                    <CardHeader><CardTitle>CRM & Team</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="teamType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Team Structure</FormLabel>
                            <FormControl>
                              <RadioGroup value={field.value} onValueChange={field.onChange} className="flex space-x-4 mt-2">
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="solo" id="team-solo" data-testid="radio-team-solo" />
                                  <Label htmlFor="team-solo" className="font-normal cursor-pointer">Solo agent</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="team" id="team-team" data-testid="radio-team-team" />
                                  <Label htmlFor="team-team" className="font-normal cursor-pointer">Team</Label>
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
                            <FormLabel>Estimated Team Seats</FormLabel>
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
                              <FormLabel className="text-base">Enable notifications</FormLabel>
                              <FormDescription>Receive alerts about important leads and activity</FormDescription>
                            </div>
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-notifications" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                )}

                {step === 6 && (
                  <Card>
                    <CardHeader><CardTitle>Lead Sources & Goals</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="leadSources"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Where do your leads come from?</FormLabel>
                            <FormControl>
                              <Textarea placeholder="e.g., Facebook ads, referrals, website inquiries, directory listings..." {...field} data-testid="textarea-lead-sources" />
                            </FormControl>
                            <FormDescription>Help us understand your lead generation channels</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="primaryGoal"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>What's your primary goal with this system?</FormLabel>
                            <FormControl>
                              <Textarea placeholder="e.g., Sell more listings, qualify leads faster, reduce response time..." {...field} data-testid="textarea-primary-goal" />
                            </FormControl>
                            <FormDescription>What would success look like for you?</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                )}

                {step === 7 && (
                  <Card>
                    <CardHeader><CardTitle>Scheduling & Availability</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="timezone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Your Timezone</FormLabel>
                            <FormControl>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger data-testid="select-timezone">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="America/New_York">Eastern Time</SelectItem>
                                  <SelectItem value="America/Chicago">Central Time</SelectItem>
                                  <SelectItem value="America/Denver">Mountain Time</SelectItem>
                                  <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                                  <SelectItem value="America/Anchorage">Alaska Time</SelectItem>
                                  <SelectItem value="Pacific/Honolulu">Hawaii Time</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="preferredCallWindows"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Preferred Call/Video Windows</FormLabel>
                            <FormControl>
                              <Textarea placeholder="e.g., Mon-Fri 2-4 PM, Saturday 10 AM-1 PM..." {...field} data-testid="textarea-call-windows" />
                            </FormControl>
                            <FormDescription>When can our team reach you for setup?</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                )}

                {step === 8 && (
                  <Card>
                    <CardHeader><CardTitle>Additional Notes</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="additionalNotes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Anything else we should know?</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Special requests, questions, or context..." {...field} data-testid="textarea-additional-notes" />
                            </FormControl>
                            <FormDescription>Optional — anything to help us set you up for success</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                )}

                <div className="flex gap-3 justify-between pt-4">
                  <Button 
                    type="button"
                    variant="outline" 
                    onClick={prevStep}
                    disabled={step === 1}
                    data-testid="button-prev-step"
                  >
                    <ChevronLeft className="mr-1 w-4 h-4" /> Previous
                  </Button>
                  {step < totalSteps ? (
                    <Button 
                      type="button"
                      className="bg-brand-green hover:bg-brand-green/90"
                      onClick={nextStep}
                      data-testid="button-next-step"
                    >
                      Next <ChevronRight className="ml-1 w-4 h-4" />
                    </Button>
                  ) : (
                    <Button 
                      type="submit"
                      className="bg-brand-green hover:bg-brand-green/90"
                      disabled={submitOnboardingMutation.isPending}
                      data-testid="button-submit-onboarding"
                    >
                      {submitOnboardingMutation.isPending ? (
                        <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Submitting...</>
                      ) : (
                        <>Submit Onboarding</>
                      )}
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </div>
        )}

        {status === 'submitted' && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="py-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-brand-green mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">Onboarding Submitted!</h3>
              <p className="text-gray-600 mb-4">Our team will review your details and set up a call within 24 hours.</p>
              <p className="text-sm text-gray-500">Check your email for next steps.</p>
            </CardContent>
          </Card>
        )}
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
            onClick={async () => {
              try {
                const endpoint = !subscriptionGate.hasPro
                  ? "/api/subscription/checkout/pro-ai"
                  : "/api/subscription/addon/ai-brain";
                const res = await fetch(endpoint, {
                  method: "POST",
                  credentials: "include",
                });
                if (res.status === 401) {
                  window.location.href = "/auth?redirect=/app/templates/realtor-growth-engine";
                  return;
                }
                if (!res.ok) throw new Error("Failed to create checkout");
                const data = await res.json();
                if (data.url) {
                  window.open(data.url, '_blank');
                }
              } catch (err) {
                console.error("Checkout error:", err);
              }
            }}
            data-testid="button-upgrade-plan"
          >
            {!subscriptionGate.hasPro ? "Upgrade to Pro + AI" : "Enable AI Add-on"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const EligibilityDialog = () => {
    const closeAndResetModal = () => {
      setEligibilityOpen(false);
      setEligibilityAnswer("");
      setEligibilityBlocked(false);
    };

    return (
      <Dialog open={eligibilityOpen} onOpenChange={(open) => { if (!open) closeAndResetModal(); }} data-testid="dialog-eligibility">
        {subscriptionGate.show ? (
          <SubscriptionGateDialog />
        ) : !eligibilityBlocked ? (
          <DialogContent data-testid="dialog-eligibility-check">
            <DialogHeader>
              <DialogTitle>Quick Eligibility Check</DialogTitle>
              <DialogDescription>
                Is your real estate business a registered legal entity (LLC / Corp / Ltd)?
              </DialogDescription>
              <p className="text-xs text-muted-foreground pt-1">Required for WhatsApp Business API approval with Meta.</p>
            </DialogHeader>
            <RadioGroup value={eligibilityAnswer} onValueChange={setEligibilityAnswer} className="flex flex-col space-y-2 py-2">
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="yes" id="elig-yes" data-testid="radio-eligible-yes" />
                <Label htmlFor="elig-yes" className="font-normal cursor-pointer">Yes, I have a registered business entity</Label>
              </div>
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="no" id="elig-no" data-testid="radio-eligible-no" />
                <Label htmlFor="elig-no" className="font-normal cursor-pointer">No, I operate as an individual</Label>
              </div>
            </RadioGroup>
            <DialogFooter>
              <Button variant="outline" onClick={closeAndResetModal} data-testid="button-eligibility-cancel">Cancel</Button>
              <Button
                className="bg-brand-green hover:bg-brand-green/90"
                onClick={handleEligibilityContinue}
                disabled={!eligibilityAnswer || purchaseMutation.isPending || checkingSubscription}
                data-testid="button-eligibility-continue"
              >
                {checkingSubscription ? "Checking..." : purchaseMutation.isPending ? "Processing..." : "Continue"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : (
          <DialogContent data-testid="dialog-eligibility-blocked">
            <DialogHeader>
              <DialogTitle>Business Eligibility Required</DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-3">
              <p className="text-sm text-muted-foreground">
                To activate WhatsApp Business API, Meta requires a registered business entity (LLC / Corp / Ltd).
              </p>
              <p className="text-sm text-muted-foreground">
                Once your business is registered, come back here and we'll complete your setup.
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={closeAndResetModal}
                data-testid="button-eligibility-dismiss"
              >
                Got it — I'll return after registering
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    );
  };

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
      summary: "Detects the language of incoming messages and updates the lead's language field. Can be used to route leads to language-appropriate agents or templates.",
      triggers: "Every inbound message",
      timing: "Real-time analysis",
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
        const savePrefs = apiRequest("PUT", "/api/templates/realtor-growth-engine/preferences", { preferences: localPrefs });
        const saveRouting = selectedWf?.key === "W2"
          ? apiRequest("PUT", "/api/templates/realtor-growth-engine/routing-config", { services: routingServices })
          : Promise.resolve();
        await Promise.all([savePrefs, saveRouting]);
        queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine/preferences"] });
        queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine/routing-config"] });
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
        {status === 'installed' ? <DashboardView /> : <DetailPage />}
        <EligibilityDialog />
      </>
    </RealtorEngineErrorBoundary>
  );
}
