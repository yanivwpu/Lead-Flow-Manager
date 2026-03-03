import React, { useState, useEffect } from "react";
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
  Loader2
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

  const { data: templateData, isLoading } = useQuery<TemplateData>({
    queryKey: ["/api/templates/realtor-growth-engine", new URLSearchParams(window.location.search).get("bypass")],
    queryFn: async ({ queryKey }) => {
      const url = queryKey[1] ? `/api/templates/realtor-growth-engine?bypass=${queryKey[1]}` : "/api/templates/realtor-growth-engine";
      const res = await apiRequest("GET", url);
      return res.json();
    }
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
        description: "You can now continue your Realtor Growth Engine.",
      });
    }
  }, [subscriptionActive]);

  if (isLoading) {
    return <div className="flex h-full items-center justify-center">Loading...</div>;
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
    <div className="max-w-5xl mx-auto px-4 py-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <Badge variant="secondary" className="mb-1.5 bg-amber-100 text-amber-800 border-amber-200">
            <ShieldCheck className="w-3 h-3 mr-1" />
            Premium Template
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Convert your WhatsApp inquiries into qualified buyers & booked showings — automatically.</h1>
          <p className="text-base text-muted-foreground mt-1">
            A done-for-you WhatsApp automation system built specifically for real estate agents. Capture, qualify, and follow up with every lead — without missing opportunities.
          </p>
          <Button 
            className={cn("mt-3", isPaused ? "bg-amber-600 hover:bg-amber-700" : "bg-brand-green hover:bg-brand-green/90")}
            onClick={handlePrimaryCta}
            disabled={purchaseMutation.isPending || status === 'submitted' || status === 'installed' || isPaused}
            data-testid="button-hero-cta"
          >
            {isPaused ? (
              <><PauseCircle className="mr-2 w-4 h-4" /> Paused — Subscription Required</>
            ) : status === 'locked' ? 'Start Onboarding' : status === 'purchased' ? 'Start Onboarding' : 'Onboarding Submitted'}
            {!isPaused && <ChevronRight className="ml-2 w-4 h-4" />}
          </Button>
          <p className="text-[11px] text-muted-foreground mt-1.5">One-time onboarding $199 · Requires Pro + AI plan</p>
        </div>
      </div>

      {renderStepper()}

      {isPaused && (
        <Card className="border-amber-300 bg-amber-50 mb-4" data-testid="banner-subscription-paused">
          <CardContent className="flex items-start gap-3 py-4 px-5">
            <PauseCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-amber-900 text-sm">Growth Engine Paused</p>
              <p className="text-xs text-amber-800 mt-0.5">
                Your Realtor Growth Engine requires an active Pro + AI plan to run automations and handle conversations.
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="md:col-span-2 space-y-5">
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-base">What you get</CardTitle>
              <CardDescription className="text-xs">Everything you need to capture, qualify, and convert real estate leads on WhatsApp — fully set up for you.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 px-5 pb-3">
              {[
                { icon: Rocket, title: "High-Converting Lead Workflows", desc: "From first inquiry to booked showing and follow-up." },
                { icon: Zap, title: "AI Lead Qualification & Routing", desc: "Automatically identify serious buyers and sellers so you focus only on real opportunities." },
                { icon: Clock, title: "Smart Follow-Up Sequences", desc: "Never lose a lead again — automated follow-ups keep conversations active." },
                { icon: MessageSquare, title: "Optimized WhatsApp Message Templates", desc: "Professionally written scripts designed specifically for real estate conversations." },
                { icon: RotateCcw, title: "Retargeting & Re-engagement Flows", desc: "Automatically follow up with cold or unresponsive leads." },
                { icon: BarChart3, title: "Built-In Real Estate CRM Pipeline", desc: "Track every lead from first message to closing inside a structured deal pipeline." },
                { icon: Users, title: "Team Collaboration & Assignment", desc: "Assign conversations, add notes, and manage deals with your team." },
                { icon: Handshake, title: "Done-for-You Setup + Live Onboarding Sessions", desc: "We configure everything with you and ensure your system is fully operational." },
              ].map((item, idx) => (
                <div key={idx} className="flex space-x-2.5">
                  <div className="mt-0.5 bg-brand-green/10 p-1.5 rounded-md">
                    <item.icon className="w-4 h-4 text-brand-green" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm leading-tight">{item.title}</h4>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-base">How it works</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <ol className="relative border-l border-gray-200 ml-3 space-y-4">
                <li className="mb-6 ml-6">
                  <span className="absolute flex items-center justify-center w-7 h-7 bg-brand-green rounded-full -left-3.5 ring-4 ring-white">
                    <Zap className="w-3.5 h-3.5 text-white" />
                  </span>
                  <h3 className="font-semibold text-sm leading-tight">Step 1 — Activate your system</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Purchase and unlock your Realtor Growth Engine.
                  </p>
                </li>
                <li className="mb-6 ml-6">
                  <span className="absolute flex items-center justify-center w-7 h-7 bg-brand-green rounded-full -left-3.5 ring-4 ring-white">
                    <ClipboardCheck className="w-3.5 h-3.5 text-white" />
                  </span>
                  <h3 className="font-semibold text-sm leading-tight">Step 2 — Complete onboarding form</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Provide your business, WhatsApp, and CRM details so we can configure everything properly.
                  </p>
                </li>
                <li className="mb-6 ml-6">
                  <span className="absolute flex items-center justify-center w-7 h-7 bg-brand-green rounded-full -left-3.5 ring-4 ring-white">
                    <Video className="w-3.5 h-3.5 text-white" />
                  </span>
                  <h3 className="font-semibold text-sm leading-tight">Step 3 — Live setup session</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    We connect with you on Zoom and complete your WhatsApp + CRM setup together.
                  </p>
                </li>
                <li className="ml-6">
                  <span className="absolute flex items-center justify-center w-7 h-7 bg-brand-green rounded-full -left-3.5 ring-4 ring-white">
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  </span>
                  <h3 className="font-semibold text-sm leading-tight">Step 4 — Go live</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your automation system is fully active and ready to capture and convert leads automatically.
                  </p>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm">Requirements</CardTitle>
              <CardDescription className="text-xs">To activate your WhatsApp automation system, you'll need:</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 px-5 pb-4">
              <div className="flex items-start space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-green mt-0.5" />
                <span className="text-xs">Registered business entity (LLC / Corp / Ltd)</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-green mt-0.5" />
                <span className="text-xs">Access to your Meta (Facebook) Business Manager</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-green mt-0.5" />
                <span className="text-xs">WhatsApp Business API eligibility (we guide you through this)</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-green mt-0.5" />
                <span className="text-xs">Active WhachatCRM Pro + AI plan</span>
              </div>
              <p className="text-[11px] text-muted-foreground pt-1">Our team will guide you through each step during onboarding.</p>
            </CardContent>
          </Card>

          <Card className="bg-brand-green/5 border-brand-green/20">
            <CardHeader className="pb-1 pt-3 px-5">
              <CardTitle className="text-sm flex items-center">
                <Clock className="w-3.5 h-3.5 mr-1.5 text-brand-green" />
                Limited Availability
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-3">
              <p className="text-xs text-muted-foreground">
                To ensure high-quality onboarding and personalized setup support, we onboard a limited number of real estate agents each month.
              </p>
              <p className="text-xs font-medium text-brand-green mt-1.5">
                Secure your activation slot today.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-5">
        <CardContent className="px-5 py-6 text-center">
          <h3 className="text-lg font-bold text-gray-900 mb-1">Turn your WhatsApp into a lead-conversion machine.</h3>
          <p className="text-sm text-muted-foreground mb-4">Launch your Realtor Growth Engine with our team and start capturing and converting leads automatically.</p>
          <Button 
            className="bg-brand-green hover:bg-brand-green/90"
            onClick={handlePrimaryCta}
            disabled={purchaseMutation.isPending || status === 'submitted' || status === 'installed'}
            data-testid="button-bottom-cta"
          >
            {status === 'locked' ? 'Start Onboarding' : status === 'purchased' ? 'Start Onboarding' : 'Onboarding Submitted'}
            <ChevronRight className="ml-2 w-4 h-4" />
          </Button>
          <p className="text-[11px] text-muted-foreground mt-2">One-time onboarding $199 · Requires Pro + AI plan</p>
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

    const getFieldsForStep = (s: number) => {
      switch(s) {
        case 1: return ["isRegisteredEntity"];
        case 2: return ["legalName", "country", "website"];
        case 3: return ["desiredNumber", "isNumberActive", "willingToMigrate", "hasSmsAccess"];
        case 4: return ["hasMetaBM", "bmEmail", "bmId"];
        case 5: return ["teamType", "estimatedSeats", "notificationsEnabled"];
        case 6: return ["leadSources", "primaryGoal"];
        case 7: return ["timezone", "preferredCallWindows"];
        case 8: return ["additionalNotes"];
        default: return [];
      }
    };

    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-bold">Onboarding Form</h2>
            <span className="text-sm font-medium text-muted-foreground">Step {step} of {totalSteps}</span>
          </div>
          <Progress value={(step / totalSteps) * 100} className="h-2" />
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => submitOnboardingMutation.mutate(v))} className="space-y-6">
            {step === 1 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="isRegisteredEntity"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Is your real estate business a registered legal entity?</FormLabel>
                      <FormDescription>Necessary for Meta Business verification.</FormDescription>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex flex-col space-y-1"
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="yes" />
                            </FormControl>
                            <FormLabel className="font-normal">Yes, we are registered</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="no" />
                            </FormControl>
                            <FormLabel className="font-normal">No, I operate as an individual</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {isEligibilityBlocked && (
                  <div className="mt-4 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3" data-testid="eligibility-block">
                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-red-800 text-sm">Cannot proceed</p>
                      <p className="text-red-700 text-sm mt-1">
                        A registered business entity is required for WhatsApp Business API access. Meta requires business verification before provisioning an official WhatsApp number.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="legalName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Legal Business Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. Skyline Realty LLC" data-testid="input-legal-name" />
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
                      <FormLabel>Business Country</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. USA" />
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
                        <Input {...field} placeholder="https://example.com" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="desiredNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Desired WhatsApp Number</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="+1234567890" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isNumberActive"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Is this number currently used for WhatsApp?</FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl><RadioGroupItem value="yes" /></FormControl>
                            <FormLabel className="font-normal">Yes</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl><RadioGroupItem value="no" /></FormControl>
                            <FormLabel className="font-normal">No</FormLabel>
                          </FormItem>
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
                    <FormItem className="space-y-3">
                      <FormLabel>Are you willing to migrate this number to the Official API?</FormLabel>
                      <FormDescription>Existing chat history in standard WhatsApp will be lost.</FormDescription>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl><RadioGroupItem value="yes" /></FormControl>
                            <FormLabel className="font-normal">Yes, I understand</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl><RadioGroupItem value="no" /></FormControl>
                            <FormLabel className="font-normal">No, I'll use a new number</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="hasMetaBM"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Do you have a Meta Business Manager?</FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl><RadioGroupItem value="yes" /></FormControl>
                            <FormLabel className="font-normal">Yes</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl><RadioGroupItem value="no" /></FormControl>
                            <FormLabel className="font-normal">No</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
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
                        <Input {...field} placeholder="admin@example.com" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bmId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>BM ID (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="1234567890" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="teamType"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Are you a solo agent or a team?</FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl><RadioGroupItem value="solo" /></FormControl>
                            <FormLabel className="font-normal">Solo Agent</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl><RadioGroupItem value="team" /></FormControl>
                            <FormLabel className="font-normal">Real Estate Team / Agency</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="estimatedSeats"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estimated number of seats needed</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            )}

            {step === 6 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="leadSources"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lead Sources</FormLabel>
                      <FormDescription>Where do your leads come from? (e.g. Zillow, Facebook Ads, Referrals)</FormDescription>
                      <FormControl>
                        <Textarea {...field} />
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
                      <FormLabel>Primary Goal with WhatsApp Automation</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {step === 7 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Timezone</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="preferredCallWindows"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred Windows for Onboarding Call</FormLabel>
                      <FormDescription>We'll schedule a 30-min strategy call.</FormDescription>
                      <FormControl>
                        <Textarea {...field} placeholder="e.g. Mon-Fri 10am-12pm EST" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {step === 8 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="additionalNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Notes</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Any specific requirements or questions?" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="pt-4 flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      By submitting this form, you authorize WhachatCRM to initiate the WhatsApp Business API setup on your behalf.
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="flex justify-between pt-4 border-t">
              <Button type="button" variant="outline" onClick={prevStep} disabled={step === 1}>
                <ChevronLeft className="mr-2 w-4 h-4" />
                Back
              </Button>
              {step < totalSteps ? (
                <Button type="button" onClick={nextStep} disabled={isEligibilityBlocked} data-testid="button-next-step">
                  Next
                  <ChevronRight className="ml-2 w-4 h-4" />
                </Button>
              ) : (
                <Button 
                  type="submit" 
                  className="bg-brand-green hover:bg-brand-green/90" 
                  disabled={submitOnboardingMutation.isPending}
                  data-testid="button-submit-onboarding"
                >
                  Submit Onboarding
                  <Rocket className="ml-2 w-4 h-4" />
                </Button>
              )}
            </div>
          </form>
        </Form>
      </div>
    );
  };

  const StatusPage = () => (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      <div className="mb-8 flex justify-center">
        <div className="w-20 h-20 bg-brand-green/10 rounded-full flex items-center justify-center">
          <ClipboardCheck className="w-10 h-10 text-brand-green" />
        </div>
      </div>
      <h2 className="text-3xl font-bold mb-4">Onboarding in Review</h2>
      <p className="text-lg text-muted-foreground mb-8">
        Thank you for submitting your onboarding details. Our team is currently reviewing your application and preparing your workspace.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left mb-8">
        <Card>
          <CardContent className="pt-6">
            <h4 className="font-semibold text-sm flex items-center mb-2">
              <Calendar className="w-4 h-4 mr-2 text-brand-green" />
              Next Steps
            </h4>
            <ul className="text-xs space-y-2 text-muted-foreground">
              <li>• Technical review of Meta BM (24h)</li>
              <li>• WhatsApp Number provisioning</li>
              <li>• Onboarding call scheduling</li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <h4 className="font-semibold text-sm flex items-center mb-2">
              <ShieldCheck className="w-4 h-4 mr-2 text-brand-green" />
              Support
            </h4>
            <p className="text-xs text-muted-foreground">
              Have questions? Reach out to us at <span className="font-medium text-brand-green">support@whachatcrm.com</span> or via the help center.
            </p>
          </CardContent>
        </Card>
      </div>

      <Button variant="outline" onClick={() => setLocation("/app/templates")}>
        Back to Templates
      </Button>
    </div>
  );

  // --- Eligibility Modal ---

  const closeAndResetModal = () => {
    setEligibilityOpen(false);
    setEligibilityBlocked(false);
    setSubscriptionGate({ show: false, hasPro: true, hasAI: true });
  };

  const EligibilityModal = () => (
    <Dialog open={eligibilityOpen} onOpenChange={(open) => { if (!open) closeAndResetModal(); }}>
      <DialogContent className="max-w-[520px]" data-testid="eligibility-modal">
        {subscriptionGate.show ? (
          <>
            <DialogHeader>
              <DialogTitle>Subscription Upgrade Required</DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-3">
              {!subscriptionGate.hasPro && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-sm font-medium text-amber-800">Pro plan required</p>
                  <p className="text-xs text-amber-700 mt-1">
                    The Realtor Growth Engine requires an active Pro subscription. Upgrade your plan to continue.
                  </p>
                  <Button
                    size="sm"
                    className="mt-2 bg-brand-green hover:bg-brand-green/90"
                    onClick={() => { closeAndResetModal(); setLocation("/app/settings"); }}
                    data-testid="button-upgrade-pro"
                  >
                    Upgrade to Pro
                  </Button>
                </div>
              )}
              {subscriptionGate.hasPro && !subscriptionGate.hasAI && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <p className="text-sm font-medium text-blue-800">AI add-on required</p>
                  <p className="text-xs text-blue-700 mt-1">
                    The Realtor Growth Engine requires the AI Brain add-on for automated lead qualification and routing.
                  </p>
                  <Button
                    size="sm"
                    className="mt-2 bg-brand-green hover:bg-brand-green/90"
                    onClick={() => { closeAndResetModal(); setLocation("/app/ai-brain"); }}
                    data-testid="button-enable-ai"
                  >
                    Enable AI Add-on
                  </Button>
                </div>
              )}
              {!subscriptionGate.hasPro && !subscriptionGate.hasAI && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <p className="text-sm font-medium text-blue-800">AI add-on also required</p>
                  <p className="text-xs text-blue-700 mt-1">
                    After upgrading to Pro, you'll also need to enable the AI Brain add-on ($29/mo).
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeAndResetModal} data-testid="button-subscription-dismiss">
                Close
              </Button>
            </DialogFooter>
          </>
        ) : !eligibilityBlocked ? (
          <>
            <DialogHeader>
              <DialogTitle>Quick Eligibility Check (30 seconds)</DialogTitle>
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
          </>
        ) : (
          <>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );

  const WORKFLOW_DESCRIPTIONS: Record<string, { summary: string; triggers: string; timing: string }> = {
    W1: {
      summary: "Instantly replies to every new WhatsApp inquiry with a personalized greeting. Creates a lead record, tags as 'New', sets pipeline to 'New Lead', and creates a review task.",
      triggers: "New chat / first message from an unknown number",
      timing: "Immediate (within seconds of first message)",
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
    W2: ["buyerKeywords", "sellerKeywords", "investorKeywords"],
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
    W2: { buyerKeywords: "buy, purchase, looking for, apartment, house, condo", sellerKeywords: "sell, listing, list my, market value", investorKeywords: "invest, roi, return, flip, portfolio" },
    W3: { appointmentIntentKeywords: "call, book, available, tour, showing, visit, schedule", bookingLink: "https://calendly.com/your-profile/showing" },
    W4: { followUpDelayHours: 24 },
    W5: { followUpDelayHours: 72 },
  };

  const DashboardView = () => {
    const [selectedWf, setSelectedWf] = useState<any>(null);
    const [modalTab, setModalTab] = useState<string>("preview");
    const [localPrefs, setLocalPrefs] = useState<Record<string, any>>({});
    const [saving, setSaving] = useState(false);

    const { data: prefsData } = useQuery({
      queryKey: ["/api/templates/realtor-growth-engine/preferences"],
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
      setSelectedWf(wf);
      setModalTab("preview");
    };

    const handleSave = async () => {
      setSaving(true);
      try {
        await apiRequest("PUT", "/api/templates/realtor-growth-engine/preferences", { preferences: localPrefs });
        queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine/preferences"] });
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

    const renderWorkflowFields = (wfKey: string) => {
      const fields = WORKFLOW_FIELDS[wfKey];
      if (!fields) return null;

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
            <h1 className="text-3xl font-bold text-gray-900">Realtor Growth Engine</h1>
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
                <Button variant="outline" size="sm" className="w-full mt-4 text-xs" onClick={() => setLocation("/app/chats")}>
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

                  {selectedWf && getWorkflowTemplates(selectedWf).length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800 mb-2">Message Templates Used</h4>
                      <div className="space-y-2">
                        {getWorkflowTemplates(selectedWf).map((tpl: any) => (
                          <div key={tpl.key} className="border rounded-lg p-3 bg-gray-50/50">
                            <p className="text-xs font-medium text-gray-700 mb-1">{tpl.title}</p>
                            <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">{tpl.body}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="text-sm font-semibold text-gray-800 mb-1">Actions</h4>
                    <div className="space-y-1.5">
                      {selectedWf?.actions?.map((action: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="w-1 h-1 rounded-full bg-brand-green" />
                          <span>{action.type.replace(/_/g, ' ')}{action.tag ? `: ${action.tag}` : ''}{action.stage ? `: ${action.stage}` : ''}{action.templateKey ? `: ${action.templateKey}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="customize" className="px-6 pb-4 mt-0">
                  <div className="pt-3">
                    <p className="text-xs text-muted-foreground mb-4">
                      Adjust preferences below. Core workflow logic cannot be changed — only safe customization fields are shown.
                    </p>
                    {renderGlobalFields()}
                    {selectedWf && renderWorkflowFields(selectedWf.key)}
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50/50 shrink-0">
              {modalTab === "customize" && (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={handleRestore} data-testid="button-restore-defaults">
                  <RotateCcw className="w-3 h-3 mr-1" /> Restore Defaults
                </Button>
              )}
              {modalTab !== "customize" && <div />}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedWf(null)} data-testid="button-modal-close">
                  Close
                </Button>
                {modalTab === "customize" && (
                  <Button size="sm" className="bg-brand-green hover:bg-brand-green/90" onClick={handleSave} disabled={saving} data-testid="button-save-settings">
                    {saving ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving...</> : "Save Settings"}
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // --- Router Logic ---

  if (location === "/app/templates/realtor-growth-engine/onboarding") {
    if (status === 'locked' || isPaused) return <Redirect to="/app/templates/realtor-growth-engine" />;
    if (status === 'submitted' || status === 'installed') return <Redirect to="/app/templates/realtor-growth-engine/status" />;
    return <OnboardingForm />;
  }

  if (location === "/app/templates/realtor-growth-engine/status") {
    if (status === 'locked' || status === 'purchased') return <Redirect to="/app/templates/realtor-growth-engine" />;
    if (status === 'installed') return <DashboardView />;
    return <StatusPage />;
  }

  return (
    <>
      <EligibilityModal />
      {status === 'installed' ? <DashboardView /> : <DetailPage />}
    </>
  );
}

function Redirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  React.useEffect(() => {
    setLocation(to);
  }, [to]);
  return null;
}
