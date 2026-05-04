import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import debounce from "lodash/debounce";
import {
  Brain,
  Sparkles,
  Settings2,
  Loader2,
  Plus,
  X,
  Hand,
  Crown,
  Lock,
  ChevronRight,
  Trash2,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { getCheckoutReturnPaths } from "@/lib/checkoutReturnPaths";
import { getSubscriptionApiUrl, useShopifyShopHint } from "@/lib/shopifyBillingHint";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface AISettings {
  aiMode: string;
  handoffKeywords: string[];
  aiPersona: string;
}

interface BusinessKnowledge {
  businessName: string;
  industry: string;
  servicesProducts: string;
  bookingLink: string;
  customInstructions: string;
  qualifyingQuestions: Array<{ key: string; label: string; question: string; required: boolean }>;
}

interface SubscriptionData {
  limits: {
    plan: string;
    planName: string;
    isInTrial?: boolean;
    hasAIBrainAddon?: boolean;
  };
  subscription?: {
    plan: string;
    isShopify?: boolean;
  };
}

const AI_MODE_SEGMENTS = [
  { value: "off", label: "Off", tooltip: "AI is disabled" },
  { value: "suggest_only", label: "Suggest", tooltip: "AI suggests replies, you send" },
  { value: "full_auto", label: "Auto", tooltip: "AI replies automatically with safeguards" },
] as const;

const INDUSTRY_OPTIONS = [
  { value: "real_estate", label: "Real Estate" },
  { value: "travel", label: "Travel & Tourism" },
  { value: "contractor", label: "Contractor / Home Services" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "healthcare", label: "Healthcare" },
  { value: "education", label: "Education" },
  { value: "finance", label: "Finance & Insurance" },
  { value: "hospitality", label: "Hospitality" },
  { value: "automotive", label: "Automotive" },
  { value: "other", label: "Other" },
] as const;

type QualifyingQuestion = { key: string; label: string; question: string; required: boolean };

const INDUSTRY_QUALIFY_TEMPLATES: Record<string, QualifyingQuestion[]> = {
  real_estate: [
    { key: "intent",    label: "Intent",     question: "Are you looking to buy, rent, or invest?",                                  required: true  },
    { key: "budget",    label: "Budget",     question: "Do you have a target price range or budget in mind?",                       required: true  },
    { key: "timeline",  label: "Timeline",   question: "What's your ideal timeline for making a move?",                             required: true  },
    { key: "financing", label: "Financing",  question: "Have you been pre-approved for financing, or are you paying cash?",         required: false },
    { key: "location",  label: "Location",   question: "Do you have a preferred area or neighbourhood in mind?",                    required: false },
  ],
  healthcare: [
    { key: "service",   label: "Service",     question: "What type of care or treatment are you looking for?",                       required: true  },
    { key: "insurance", label: "Insurance",   question: "Do you have health insurance, and if so which provider?",                   required: true  },
    { key: "urgency",   label: "Urgency",     question: "Is this urgent or are you looking to schedule a routine appointment?",      required: true  },
    { key: "location",  label: "Location",    question: "Which of our locations is most convenient for you?",                        required: false },
  ],
  travel: [
    { key: "destination", label: "Destination", question: "Where are you looking to travel?",                                       required: true  },
    { key: "dates",       label: "Dates",       question: "When are you planning to travel, and for how long?",                     required: true  },
    { key: "group_size",  label: "Group Size",  question: "How many people will be travelling?",                                    required: true  },
    { key: "budget",      label: "Budget",      question: "Do you have a rough budget per person in mind?",                         required: false },
    { key: "preferences", label: "Preferences", question: "Any special preferences — accommodation type, activities, diet, etc.?",   required: false },
  ],
  contractor: [
    { key: "project",   label: "Project",   question: "What type of project are you looking to get done?",                          required: true  },
    { key: "timeline",  label: "Timeline",  question: "When would you like the work to start?",                                     required: true  },
    { key: "budget",    label: "Budget",    question: "Do you have a budget in mind for this project?",                             required: false },
    { key: "location",  label: "Location",  question: "What's the property address or general area?",                               required: true  },
  ],
  ecommerce: [
    { key: "product",   label: "Product",   question: "Which product or category are you interested in?",                           required: true  },
    { key: "quantity",  label: "Quantity",  question: "How many units are you looking to order?",                                   required: false },
    { key: "shipping",  label: "Shipping",  question: "Do you need standard or expedited shipping?",                                required: false },
    { key: "budget",    label: "Budget",    question: "Do you have a budget range in mind?",                                        required: false },
  ],
  finance: [
    { key: "service",   label: "Service",   question: "What financial service are you looking for — insurance, investments, loans?", required: true  },
    { key: "amount",    label: "Amount",    question: "What amount or coverage level are you considering?",                          required: true  },
    { key: "timeline",  label: "Timeline",  question: "When do you need this in place?",                                            required: false },
    { key: "situation", label: "Situation", question: "Can you briefly describe your current financial situation?",                  required: false },
  ],
  education: [
    { key: "course",    label: "Course",    question: "Which course or program are you interested in?",                             required: true  },
    { key: "level",     label: "Level",     question: "What's your current level — beginner, intermediate, or advanced?",           required: true  },
    { key: "schedule",  label: "Schedule",  question: "Are you looking for full-time, part-time, or self-paced learning?",          required: false },
    { key: "budget",    label: "Budget",    question: "Do you have a budget or are you looking for financing options?",             required: false },
  ],
  automotive: [
    { key: "vehicle",   label: "Vehicle",   question: "Are you looking to buy, lease, or service a vehicle?",                       required: true  },
    { key: "type",      label: "Type",      question: "What type of vehicle are you interested in — new or used?",                  required: true  },
    { key: "budget",    label: "Budget",    question: "Do you have a budget range in mind?",                                        required: false },
    { key: "timeline",  label: "Timeline",  question: "When are you looking to make a decision?",                                   required: false },
  ],
  hospitality: [
    { key: "dates",     label: "Dates",     question: "What dates are you looking to book?",                                        required: true  },
    { key: "guests",    label: "Guests",    question: "How many guests will be staying?",                                           required: true  },
    { key: "room_type", label: "Room Type", question: "Do you have a preference for room type or amenities?",                       required: false },
    { key: "budget",    label: "Budget",    question: "Do you have a nightly budget in mind?",                                      required: false },
  ],
};

function AIBrainContent() {
  const queryClient = useQueryClient();
  const shopHint = useShopifyShopHint();
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
  
  const plan = subscription?.limits?.plan || "free";
  const isFree = plan === "free";
  const isPro = plan === "pro" || plan === "enterprise";
  const isStarter = plan === "starter";
  const hasAIAssist = isStarter || isPro;
  // Get add-on status from subscription data (checked via Stripe)
  const hasAIBrainAddon = (subscription?.limits as any)?.hasAIBrainAddon ?? false;
  const hasFullAIBrain = hasAIBrainAddon && hasAIAssist;
  
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
    customInstructions: "",
    qualifyingQuestions: [],
  });
  const [newQQ, setNewQQ] = useState({ label: "", question: "", required: true });
  const [newKeyword, setNewKeyword] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  
  const isShopify = !!(subscription?.subscription?.isShopify) || !!shopHint;
  const isInTrial = !!(subscription?.limits as { isInTrial?: boolean })?.isInTrial;

  // AI Brain add-on checkout
  const handleAddonCheckout = async () => {
    setIsCheckingOut(true);
    try {
      if (isShopify) {
        const response = await fetch("/api/shopify/billing/checkout-web", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ plan: 'AI Brain Add-on' }),
        });
        if (!response.ok) throw new Error("Failed to start billing");
        const data = await response.json();
        if (data.confirmationUrl) window.location.href = data.confirmationUrl;
        return;
      }

      const response = await fetch("/api/subscription/addon/ai-brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(getCheckoutReturnPaths()),
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
        title: "Checkout Error",
        description: error.message || "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handlePlanAIBundleCheckout = async (bundlePlan: "starter" | "pro") => {
    setIsCheckingOut(true);
    try {
      const response = await fetch("/api/subscription/checkout/plan-ai-bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan: bundlePlan, ...getCheckoutReturnPaths() }),
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
        setBundleModalOpen(false);
        window.location.href = data.url;
      }
    } catch (error: any) {
      toast({
        title: "Checkout Error",
        description: error.message || "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCheckingOut(false);
    }
  };
  
  // AI settings query - enabled for anyone with AI access (AI Assist or Full AI Brain)
  const { data: aiSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ["/api/ai/settings"],
    enabled: !subscriptionLoading && (hasAIAssist || hasFullAIBrain),
    retry: false,
  });

  const { data: businessKnowledge, isLoading: knowledgeLoading } = useQuery({
    queryKey: ["/api/ai/business-knowledge"],
    enabled: !subscriptionLoading && hasFullAIBrain,
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
        bookingLink: k.bookingLink || "",
        customInstructions: k.customInstructions || "",
        qualifyingQuestions: (k.qualifyingQuestions || []).map((q: any, i: number) => ({
          key: q.key || `q_${i}`,
          label: q.label || `Question ${i + 1}`,
          question: q.question || "",
          required: q.required ?? true,
        })),
      };
      setKnowledge(next);
      lastKnowledgeSentRef.current = JSON.stringify(next);
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/settings"] });
      const keys = Object.keys(variables as Record<string, unknown>);
      if (keys.length === 1 && keys[0] === "aiMode") {
        toast({ title: "AI mode updated." });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings. Please try again.", variant: "destructive" });
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
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save. Please try again.", variant: "destructive" });
    },
  });

  const debouncedPersistKnowledge = useMemo(
    () =>
      debounce((payload: BusinessKnowledge) => {
        saveKnowledgeMutation.mutate(payload, {
          onSuccess: () => {
            lastKnowledgeSentRef.current = JSON.stringify(payload);
          },
        });
      }, 750),
    [saveKnowledgeMutation],
  );

  useEffect(() => () => debouncedPersistKnowledge.cancel(), [debouncedPersistKnowledge]);

  useEffect(() => {
    if (!hasFullAIBrain || knowledgeLoading || !knowledgeHydratedRef.current) return;
    const snapshot = JSON.stringify(knowledge);
    if (snapshot === lastKnowledgeSentRef.current) return;
    debouncedPersistKnowledge(knowledge);
  }, [knowledge, hasFullAIBrain, knowledgeLoading, debouncedPersistKnowledge]);
  
  
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
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Show upgrade screen for users without any AI access (Free plan)
  if (!hasAIAssist && !hasFullAIBrain) {
    return (
      <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Brain className="w-10 h-10 text-purple-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">AI Features</h1>
            
            <p className="text-lg text-gray-600 mb-8 max-w-md mx-auto">
              Reply faster with AI that understands your business—suggestions on Starter and Pro, plus a deeper control panel when you add AI Brain.
            </p>
            
            <div className="grid gap-4 max-w-lg mx-auto text-left mb-8">
              <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-200">
                <Sparkles className="w-5 h-5 text-purple-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-gray-900">Smart reply suggestions</p>
                  <p className="text-sm text-gray-500">Draft-ready replies tuned to the conversation</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-200">
                <ListChecks className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-gray-900">Business profile & booking</p>
                  <p className="text-sm text-gray-500">Keep services, scheduling links, and context in one place</p>
                  <span className="text-xs text-gray-500">With AI Brain</span>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-200">
                <Settings2 className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-gray-900">Tone, handoff, and custom guidance</p>
                  <p className="text-sm text-gray-500">Fine-tune how the AI writes and when to loop you in</p>
                  <span className="text-xs text-gray-500">With AI Brain</span>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl p-6 border border-purple-100 mb-6">
              <div className="flex items-center justify-center gap-2 mb-3">
                <Crown className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-bold text-purple-700 uppercase tracking-wide">
                  AI Brain add-on
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                {hasAIAssist
                  ? "Higher limits on suggestions plus the full business profile, lead questions, booking link, handoff keywords, and custom instructions."
                  : "Available for Starter and Pro plan subscribers."}
              </p>
              {hasAIAssist ? (
                <Button 
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={handleAddonCheckout}
                  disabled={isCheckingOut}
                >
                  {isCheckingOut ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Add AI Brain — $29/month"
                  )}
                </Button>
              ) : isFree && !isShopify ? (
                <>
                  <p className="text-sm text-gray-600 mb-4 max-w-md mx-auto">
                    AI Brain is available as an add-on for Starter and Pro users. Choose a bundle to activate your plan and AI Brain together.
                  </p>
                  <Button
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={() => setBundleModalOpen(true)}
                    disabled={isCheckingOut}
                  >
                    Choose Starter + AI Brain or Pro + AI Brain
                  </Button>
                  <Dialog open={bundleModalOpen} onOpenChange={setBundleModalOpen}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Choose your bundle</DialogTitle>
                        <DialogDescription>
                          Monthly billing includes your selected plan and the AI Brain add-on in one subscription.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-3 py-2">
                        <Button
                          variant="outline"
                          className="h-auto py-4 flex flex-col items-stretch gap-1 border-2 hover:border-purple-400"
                          onClick={() => handlePlanAIBundleCheckout("starter")}
                          disabled={isCheckingOut}
                        >
                          <span className="font-semibold text-gray-900">Starter + AI Brain</span>
                          <span className="text-xs text-gray-500 font-normal">
                            Starter plan + AI Brain add-on (monthly)
                          </span>
                        </Button>
                        <Button
                          variant="outline"
                          className="h-auto py-4 flex flex-col items-stretch gap-1 border-2 hover:border-purple-400"
                          onClick={() => handlePlanAIBundleCheckout("pro")}
                          disabled={isCheckingOut}
                        >
                          <span className="font-semibold text-gray-900">Pro + AI Brain</span>
                          <span className="text-xs text-gray-500 font-normal">
                            Pro plan + AI Brain add-on (monthly)
                          </span>
                        </Button>
                      </div>
                      {isCheckingOut && (
                        <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Redirecting to checkout…
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </>
              ) : (
                <Link href="/pricing">
                  <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                    View plans to get Starter or Pro
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (settingsLoading || (hasFullAIBrain && knowledgeLoading)) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }
  
  const segmentTabClass = (selected: boolean) =>
    cn(
      "h-9 px-3.5 rounded-lg border text-sm font-medium transition-colors duration-200",
      selected
        ? "bg-brand-green/10 text-emerald-900 border-brand-green/45 shadow-sm shadow-brand-green/10"
        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-white hover:border-slate-300 hover:text-slate-900",
      saveSettingsMutation.isPending && "opacity-60 pointer-events-none",
    );

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-gradient-to-b from-slate-50 via-slate-50/95 to-slate-100/80">
      <div className="p-6 sm:p-8 max-w-[900px] mx-auto w-full space-y-8 pb-24">
        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
              <Brain className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">AI Brain</h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Control how AI assists in your inbox{hasFullAIBrain ? "" : " — add AI Brain for business profile and handoff controls"}.
              </p>
            </div>
          </div>
          {hasFullAIBrain && saveKnowledgeMutation.isPending && (
            <span className="text-xs text-slate-600 flex items-center gap-1.5 shrink-0 rounded-full border border-slate-200/90 bg-white px-2.5 py-1 font-medium shadow-sm shadow-slate-900/[0.03]">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" aria-hidden />
              Saving…
            </span>
          )}
        </header>

        {isInTrial && hasFullAIBrain && (
          <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-4 py-2.5 text-sm text-emerald-950">
            AI Brain is included in your Pro + AI trial. Upgrade before the trial ends to keep full AI Brain access without
            interruption.
          </div>
        )}

        {hasFullAIBrain ? (
          <div className="rounded-xl border border-purple-100/90 bg-gradient-to-br from-purple-50/50 via-white to-blue-50/35 px-5 py-5 shadow-sm shadow-slate-900/[0.04]">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
                <Brain className="h-5 w-5 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-lg font-semibold tracking-tight text-slate-900">AI Brain (Active)</p>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                  Advanced AI automation, lead qualification, and Copilot are enabled
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200/80 bg-white/90 px-5 py-4 shadow-sm shadow-slate-900/[0.04] flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-sky-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">AI Assist</p>
              <p className="text-sm text-slate-600 mt-1">
                Suggestions included on your {isPro ? "Pro" : "Starter"} plan{isPro ? " with higher daily limits." : "."}
              </p>
              <Button
                size="sm"
                className="mt-3 bg-purple-600 text-white hover:bg-purple-700 shadow-sm shadow-purple-900/10"
                onClick={handleAddonCheckout}
                disabled={isCheckingOut}
                data-testid="button-ai-brain-primary-cta"
              >
                <Brain className="w-3.5 h-3.5 mr-1.5" />
                {isCheckingOut ? "Processing…" : "Add AI Brain — $29/mo"}
              </Button>
            </div>
          </div>
        )}

        {/* Section 1: AI behavior — primary control surface */}
        <Card className="rounded-xl border border-slate-200/80 bg-white shadow-md shadow-slate-900/[0.06]">
          <CardHeader className="pb-4 space-y-1">
            <CardTitle className="text-lg font-semibold text-slate-900 tracking-tight">AI behavior</CardTitle>
            <CardDescription className="text-slate-600">Mode and tone for replies</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col gap-8 sm:flex-row sm:gap-0">
              <div className="flex-1 space-y-2.5 min-w-0">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Mode</Label>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="AI mode">
                  {AI_MODE_SEGMENTS.map((mode) => {
                    const selected = settings.aiMode === mode.value;
                    return (
                      <button
                        key={mode.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        title={mode.tooltip}
                        onClick={() => {
                          if (settings.aiMode === mode.value) return;
                          const next = mode.value;
                          setSettings((prev) => ({ ...prev, aiMode: next }));
                          saveSettingsMutation.mutate({ aiMode: next });
                        }}
                        disabled={saveSettingsMutation.isPending}
                        className={segmentTabClass(selected)}
                        data-testid={`ai-mode-${mode.value}`}
                      >
                        {mode.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="hidden sm:block w-px bg-gradient-to-b from-transparent via-slate-200/90 to-transparent shrink-0 mx-7 self-stretch" aria-hidden />

              <div className="flex-1 space-y-2.5 min-w-0 sm:pt-0 pt-4 border-t border-slate-100 sm:border-t-0">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Persona</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "professional", label: "Professional" },
                    { value: "friendly", label: "Friendly" },
                    { value: "casual", label: "Casual" },
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
                      {persona.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {hasFullAIBrain && (
          <>
            {/* Section 2: Business profile */}
            <Card className="rounded-xl border border-slate-200/70 bg-white shadow-sm shadow-slate-900/[0.03]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-900">Business profile</CardTitle>
                <CardDescription className="text-slate-600">Helps the model stay aligned with what you offer</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="biz-name" className="text-xs font-medium text-muted-foreground">
                      Business name
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
                    <Label className="text-xs font-medium text-muted-foreground">Industry</Label>
                    <Select
                      value={knowledge.industry || undefined}
                      onValueChange={(value) => setKnowledge((prev) => ({ ...prev, industry: value }))}
                    >
                      <SelectTrigger className="h-9 text-sm" data-testid="select-industry">
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent>
                        {INDUSTRY_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5 sm:max-w-xl">
                  <Label htmlFor="services" className="text-xs font-medium text-muted-foreground">
                    Services or products
                  </Label>
                  <Textarea
                    id="services"
                    className="text-sm min-h-[72px] max-h-28 resize-y"
                    rows={2}
                    value={knowledge.servicesProducts}
                    onChange={(e) => setKnowledge((prev) => ({ ...prev, servicesProducts: e.target.value }))}
                    placeholder="Short summary of what you sell or deliver"
                    data-testid="textarea-services-products"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Section 3: Lead understanding */}
            <Card className="rounded-xl border border-slate-200/70 bg-white shadow-sm shadow-slate-900/[0.03]">
              <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">What AI should learn from leads</CardTitle>
                  <CardDescription className="text-slate-600">Optional prompts the assistant can use to gather context</CardDescription>
                </div>
                {knowledge.industry && INDUSTRY_QUALIFY_TEMPLATES[knowledge.industry] && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 text-xs border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                    onClick={() => {
                      const template = INDUSTRY_QUALIFY_TEMPLATES[knowledge.industry];
                      if (template) setKnowledge((prev) => ({ ...prev, qualifyingQuestions: [...template] }));
                    }}
                    data-testid="button-apply-industry-template"
                  >
                    Use {INDUSTRY_OPTIONS.find((o) => o.value === knowledge.industry)?.label} starter set
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {knowledge.qualifyingQuestions.map((qq, idx) => (
                    <div
                      key={qq.key}
                      className="rounded-lg border border-slate-200/60 bg-slate-50/50 p-3 space-y-3 sm:space-y-0 sm:grid sm:grid-cols-[minmax(0,7rem)_1fr_auto_auto] sm:gap-3 sm:items-center"
                    >
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground sr-only sm:not-sr-only sm:mb-0">
                          Label
                        </Label>
                        <Input
                          className="h-8 text-sm"
                          value={qq.label}
                          onChange={(e) => {
                            const v = e.target.value;
                            setKnowledge((prev) => ({
                              ...prev,
                              qualifyingQuestions: prev.qualifyingQuestions.map((q, i) =>
                                i === idx ? { ...q, label: v } : q,
                              ),
                            }));
                          }}
                          placeholder="Label"
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-1 min-w-0">
                        <Label className="text-[10px] uppercase text-muted-foreground sr-only sm:not-sr-only sm:mb-0">
                          Question
                        </Label>
                        <Input
                          className="h-8 text-sm"
                          value={qq.question}
                          onChange={(e) => {
                            const v = e.target.value;
                            setKnowledge((prev) => ({
                              ...prev,
                              qualifyingQuestions: prev.qualifyingQuestions.map((q, i) =>
                                i === idx ? { ...q, question: v } : q,
                              ),
                            }));
                          }}
                          placeholder="Question to ask"
                        />
                      </div>
                      <div className="flex items-center gap-2 justify-between sm:justify-center">
                        <span className="text-xs text-muted-foreground sm:hidden">Required</span>
                        <Switch
                          checked={qq.required}
                          onCheckedChange={(checked) =>
                            setKnowledge((prev) => ({
                              ...prev,
                              qualifyingQuestions: prev.qualifyingQuestions.map((q, i) =>
                                i === idx ? { ...q, required: checked } : q,
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="flex justify-end sm:justify-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            setKnowledge((prev) => ({
                              ...prev,
                              qualifyingQuestions: prev.qualifyingQuestions.filter((_, i) => i !== idx),
                            }))
                          }
                          data-testid={`button-remove-qualifying-question-${idx}`}
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-dashed border-slate-200/80 p-3 space-y-3 bg-slate-50/50">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={newQQ.label}
                      onChange={(e) => setNewQQ((prev) => ({ ...prev, label: e.target.value }))}
                      placeholder="Label"
                      className="h-8 text-sm"
                      data-testid="input-new-qq-label"
                    />
                    <Input
                      value={newQQ.question}
                      onChange={(e) => setNewQQ((prev) => ({ ...prev, question: e.target.value }))}
                      placeholder="Question"
                      className="h-8 text-sm"
                      data-testid="input-new-qq-question"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <Switch
                        checked={newQQ.required}
                        onCheckedChange={(v) => setNewQQ((prev) => ({ ...prev, required: v }))}
                      />
                      Required by default
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 border-slate-200 bg-white font-medium text-slate-800 shadow-sm shadow-slate-900/[0.04] hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50"
                      disabled={!newQQ.label.trim() || !newQQ.question.trim()}
                      onClick={() => {
                        if (!newQQ.label.trim() || !newQQ.question.trim()) return;
                        const key = newQQ.label
                          .toLowerCase()
                          .replace(/\s+/g, "_")
                          .replace(/[^a-z0-9_]/g, "");
                        setKnowledge((prev) => ({
                          ...prev,
                          qualifyingQuestions: [
                            ...prev.qualifyingQuestions,
                            {
                              key: `${key}_${Date.now()}`,
                              label: newQQ.label.trim(),
                              question: newQQ.question.trim(),
                              required: newQQ.required,
                            },
                          ],
                        }));
                        setNewQQ({ label: "", question: "", required: true });
                      }}
                      data-testid="button-add-qualifying-question"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      Add question
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Section 4: Booking */}
            <Card className="rounded-xl border border-slate-200/70 bg-white shadow-sm shadow-slate-900/[0.03]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-900">Booking &amp; next steps</CardTitle>
                <CardDescription className="text-slate-600">Used when AI suggests scheduling or follow-ups</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 sm:max-w-xl">
                  <Label htmlFor="booking" className="text-xs font-medium text-muted-foreground">
                    Booking link
                  </Label>
                  <Input
                    id="booking"
                    className="h-9 text-sm"
                    value={knowledge.bookingLink}
                    onChange={(e) => setKnowledge((prev) => ({ ...prev, bookingLink: e.target.value }))}
                    placeholder="https://…"
                    data-testid="input-booking-link"
                  />
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Section 5: Human handoff */}
        {hasFullAIBrain ? (
          <Card className="rounded-xl border border-slate-200/70 bg-white shadow-sm shadow-slate-900/[0.03]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900">Human handoff</CardTitle>
              <CardDescription className="text-slate-600">When a message matches these phrases, pause for your team</CardDescription>
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
                      aria-label={`Remove ${keyword}`}
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
                  placeholder="Add keyword"
                  className="h-9 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
                  data-testid="input-handoff-keyword"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 shrink-0 border-slate-200 text-slate-700 hover:bg-slate-50"
                  onClick={handleAddKeyword}
                  data-testid="add-handoff-keyword"
                >
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-xl border border-slate-200/70 bg-white shadow-sm shadow-slate-900/[0.03] relative overflow-hidden">
            <button
              type="button"
              disabled={isCheckingOut}
              onClick={() => handleAddonCheckout()}
              data-testid="button-unlock-handoff-settings"
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-background/75 backdrop-blur-[1px] p-4 text-center transition-colors hover:bg-background/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-70"
            >
              <Lock className="w-5 h-5 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium text-foreground">Human handoff</span>
              <span className="text-xs text-muted-foreground">Included with AI Brain</span>
            </button>
            <CardHeader className="pb-3 opacity-40 pointer-events-none">
              <CardTitle className="text-base font-semibold">Human handoff</CardTitle>
              <CardDescription>Keyword phrases that route to your team</CardDescription>
            </CardHeader>
            <CardContent className="opacity-40 pointer-events-none space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs rounded-md border px-2 py-0.5">speak to human</span>
                <span className="text-xs rounded-md border px-2 py-0.5">talk to agent</span>
              </div>
            </CardContent>
          </Card>
        )}

        {hasFullAIBrain && (
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <Card className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50/40 shadow-none">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-left p-5 hover:bg-slate-100/50 transition-colors rounded-xl"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Advanced</p>
                    <p className="text-sm text-slate-600 mt-1">Optional extra guidance for the model</p>
                  </div>
                  <ChevronRight
                    className={cn("w-4 h-4 text-slate-400 transition-transform shrink-0", advancedOpen && "rotate-90")}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 pb-5 px-5 space-y-1.5">
                  <Label htmlFor="custom-instr" className="text-xs font-medium text-slate-500">
                    Custom instructions
                  </Label>
                  <Textarea
                    id="custom-instr"
                    className="text-sm min-h-[88px] max-h-40 resize-y border-slate-200/80 bg-white"
                    rows={3}
                    value={knowledge.customInstructions}
                    onChange={(e) => setKnowledge((prev) => ({ ...prev, customInstructions: e.target.value }))}
                    placeholder="Anything specific the AI should know or how it should behave"
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
