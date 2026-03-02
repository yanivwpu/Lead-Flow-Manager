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
  PauseCircle
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
    queryKey: ["/api/templates/realtor-growth-engine"],
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
          status !== 'locked' ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-300 text-gray-400"
        )}>
          {status !== 'locked' ? <CheckCircle2 className="w-5 h-5" /> : "1"}
        </div>
        <span className="text-xs mt-1.5 font-medium">Activate</span>
      </div>
      <div className="w-10 h-0.5 bg-gray-200" />
      <div className="flex flex-col items-center">
        <div className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center border-2 text-sm",
          status === 'submitted' || status === 'installed' ? "bg-indigo-600 border-indigo-600 text-white" : 
          status === 'purchased' ? "border-indigo-600 text-indigo-600" : "border-gray-300 text-gray-400"
        )}>
          {status === 'submitted' || status === 'installed' ? <CheckCircle2 className="w-5 h-5" /> : "2"}
        </div>
        <span className="text-xs mt-1.5 font-medium">Setup</span>
      </div>
      <div className="w-10 h-0.5 bg-gray-200" />
      <div className="flex flex-col items-center">
        <div className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center border-2 text-sm",
          status === 'installed' ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-300 text-gray-400"
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
            className={cn("mt-3", isPaused ? "bg-amber-600 hover:bg-amber-700" : "bg-indigo-600 hover:bg-indigo-700")}
            onClick={isPaused ? undefined : handlePrimaryCta}
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
                  <div className="mt-0.5 bg-indigo-50 p-1.5 rounded-md">
                    <item.icon className="w-4 h-4 text-indigo-600" />
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
                  <span className="absolute flex items-center justify-center w-7 h-7 bg-indigo-600 rounded-full -left-3.5 ring-4 ring-white">
                    <Zap className="w-3.5 h-3.5 text-white" />
                  </span>
                  <h3 className="font-semibold text-sm leading-tight">Step 1 — Activate your system</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Purchase and unlock your Realtor Growth Engine.
                  </p>
                </li>
                <li className="mb-6 ml-6">
                  <span className="absolute flex items-center justify-center w-7 h-7 bg-indigo-600 rounded-full -left-3.5 ring-4 ring-white">
                    <ClipboardCheck className="w-3.5 h-3.5 text-white" />
                  </span>
                  <h3 className="font-semibold text-sm leading-tight">Step 2 — Complete onboarding form</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Provide your business, WhatsApp, and CRM details so we can configure everything properly.
                  </p>
                </li>
                <li className="mb-6 ml-6">
                  <span className="absolute flex items-center justify-center w-7 h-7 bg-indigo-600 rounded-full -left-3.5 ring-4 ring-white">
                    <Video className="w-3.5 h-3.5 text-white" />
                  </span>
                  <h3 className="font-semibold text-sm leading-tight">Step 3 — Live setup session</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    We connect with you on Zoom and complete your WhatsApp + CRM setup together.
                  </p>
                </li>
                <li className="ml-6">
                  <span className="absolute flex items-center justify-center w-7 h-7 bg-indigo-600 rounded-full -left-3.5 ring-4 ring-white">
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
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 mt-0.5" />
                <span className="text-xs">Registered business entity (LLC / Corp / Ltd)</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 mt-0.5" />
                <span className="text-xs">Access to your Meta (Facebook) Business Manager</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 mt-0.5" />
                <span className="text-xs">WhatsApp Business API eligibility (we guide you through this)</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 mt-0.5" />
                <span className="text-xs">Active WhachatCRM Pro + AI plan</span>
              </div>
              <p className="text-[11px] text-muted-foreground pt-1">Our team will guide you through each step during onboarding.</p>
            </CardContent>
          </Card>

          <Card className="bg-indigo-50 border-indigo-200">
            <CardHeader className="pb-1 pt-3 px-5">
              <CardTitle className="text-sm flex items-center">
                <Clock className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                Limited Availability
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-3">
              <p className="text-xs text-muted-foreground">
                To ensure high-quality onboarding and personalized setup support, we onboard a limited number of real estate agents each month.
              </p>
              <p className="text-xs font-medium text-indigo-600 mt-1.5">
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
            className="bg-indigo-600 hover:bg-indigo-700"
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
                  className="bg-indigo-600 hover:bg-indigo-700" 
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
        <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center">
          <ClipboardCheck className="w-10 h-10 text-indigo-600" />
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
              <Calendar className="w-4 h-4 mr-2 text-indigo-600" />
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
              <ShieldCheck className="w-4 h-4 mr-2 text-indigo-600" />
              Support
            </h4>
            <p className="text-xs text-muted-foreground">
              Have questions? Reach out to us at <span className="font-medium text-indigo-600">support@whachatcrm.com</span> or via the help center.
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
                    className="mt-2 bg-indigo-600 hover:bg-indigo-700"
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
                    className="mt-2 bg-indigo-600 hover:bg-indigo-700"
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
                className="bg-indigo-600 hover:bg-indigo-700"
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

  // --- Router Logic ---

  if (location === "/app/templates/realtor-growth-engine/onboarding") {
    if (status === 'locked' || isPaused) return <Redirect to="/app/templates/realtor-growth-engine" />;
    if (status === 'submitted' || status === 'installed') return <Redirect to="/app/templates/realtor-growth-engine/status" />;
    return <OnboardingForm />;
  }

  if (location === "/app/templates/realtor-growth-engine/status") {
    if (status === 'locked' || status === 'purchased') return <Redirect to="/app/templates/realtor-growth-engine" />;
    return <StatusPage />;
  }

  return (
    <>
      <EligibilityModal />
      <DetailPage />
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
