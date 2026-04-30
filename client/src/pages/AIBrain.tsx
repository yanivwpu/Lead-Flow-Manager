import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Brain, 
  Sparkles, 
  Settings2, 
  MessageSquare, 
  Zap,
  AlertTriangle,
  Loader2,
  Plus,
  X,
  Bot,
  Hand,
  TrendingUp,
  Crown,
  Lock,
  ChevronDown,
  Target,
  Trash2,
  ListChecks,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { getCheckoutReturnPaths } from "@/lib/checkoutReturnPaths";
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
  const [activeTab, setActiveTab] = useState("settings");
  
  const { data: subscription, isLoading: subscriptionLoading } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscription"],
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
  
  const isShopify = !!(subscription?.subscription?.isShopify);

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
  const { data: aiSettings, isLoading: settingsLoading, error: settingsError } = useQuery({
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
      setKnowledge({
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
      });
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
      toast({ title: "Saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save. Please try again.", variant: "destructive" });
    },
  });
  
  
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
            
            {hasAIAssist ? (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8 max-w-md mx-auto">
                <div className="flex items-center gap-2 justify-center mb-2">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-blue-800">AI Assist Active</span>
                </div>
                <p className="text-sm text-blue-700">
                  Basic reply suggestions & sentiment detection included with your {isStarter ? "Starter" : "Pro"} plan.
                  {isPro && " Higher daily limits included."}
                </p>
              </div>
            ) : (
              <p className="text-lg text-gray-600 mb-8 max-w-md mx-auto">
                Supercharge your customer conversations with AI-powered reply suggestions, lead qualification, and automation.
              </p>
            )}
            
            <div className="grid gap-4 max-w-lg mx-auto text-left mb-8">
              <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-200">
                <Sparkles className="w-5 h-5 text-purple-500 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Smart Reply Suggestions</p>
                  <p className="text-sm text-gray-500">AI suggests responses based on your business context</p>
                  {hasAIAssist && <span className="text-xs text-blue-600 font-medium">Included in AI Assist (limited)</span>}
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-200">
                <Target className="w-5 h-5 text-green-500 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Lead Qualification</p>
                  <p className="text-sm text-gray-500">Automatically score and qualify leads</p>
                  <span className="text-xs text-gray-500">Requires AI Brain</span>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-200">
                <Zap className="w-5 h-5 text-yellow-500 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Plain English Automations</p>
                  <p className="text-sm text-gray-500">Describe workflows in plain language</p>
                  <span className="text-xs text-gray-500">Requires AI Brain</span>
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
                  ? "Unlimited suggestions, lead qualification, summarization, and automation builder." 
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
  
  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-blue-100 rounded-xl flex items-center justify-center">
              <Brain className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI Features</h1>
              <p className="text-sm text-gray-500">Configure AI-powered features for your business</p>
            </div>
          </div>
        </div>
        
        <div className={cn(
          "mb-6 p-4 rounded-xl border flex items-start gap-3",
          hasFullAIBrain ? "bg-purple-50 border-purple-200" : "bg-blue-50 border-blue-200"
        )}>
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
            hasFullAIBrain ? "bg-purple-100" : "bg-blue-100"
          )}>
            {hasFullAIBrain ? (
              <Crown className="w-4 h-4 text-purple-600" />
            ) : (
              <Sparkles className="w-4 h-4 text-blue-600" />
            )}
          </div>
          <div className="flex-1">
            {hasFullAIBrain ? (
              <details className="group">
                <summary className="flex items-center justify-between cursor-pointer list-none">
                  <p className="font-medium text-purple-800">Full AI Brain Active</p>
                  <ChevronDown className="w-4 h-4 text-purple-400 group-open:rotate-180 transition-transform" />
                </summary>
                <p className="text-sm text-purple-600 mt-2">Advanced AI features are enabled for this workspace.</p>
              </details>
            ) : (
              <>
                <p className="font-medium text-blue-800">AI Assist Active</p>
                <p className="text-sm text-blue-600 mb-3">
                  Basic reply suggestions with sentiment detection included in your {isPro ? "Pro" : "Starter"} plan.
                  {isPro ? " Higher daily limits included." : ""}
                </p>
                <Button 
                  size="sm" 
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={handleAddonCheckout}
                  disabled={isCheckingOut}
                  data-testid="button-ai-brain-primary-cta"
                >
                  <Crown className="w-3 h-3 mr-1" />
                  {isCheckingOut ? "Processing..." : "Add AI Brain — $29/month"}
                </Button>
              </>
            )}
          </div>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <TabsList className="bg-gray-100 p-1 rounded-xl inline-flex min-w-max">
              <TabsTrigger value="settings" className="rounded-lg data-[state=active]:bg-white whitespace-nowrap">
                <Settings2 className="w-4 h-4 mr-1 md:mr-2" />
                <span className="hidden sm:inline">Settings</span>
                <span className="sm:hidden">Setup</span>
              </TabsTrigger>
              {hasFullAIBrain && (
                <TabsTrigger value="knowledge" className="rounded-lg data-[state=active]:bg-white whitespace-nowrap">
                  <ListChecks className="w-4 h-4 mr-1 md:mr-2" />
                  <span className="hidden sm:inline">Business Knowledge</span>
                  <span className="sm:hidden">Knowledge</span>
                </TabsTrigger>
              )}
            </TabsList>
          </div>
          
          <TabsContent value="settings" className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                <Bot className="w-5 h-5 text-purple-500" />
                Mode
              </h2>

              <div className="flex flex-wrap gap-2 sm:gap-3" role="radiogroup" aria-label="AI mode">
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
                      className={cn(
                        "px-4 py-2 sm:px-6 sm:py-3 rounded-lg border text-center transition-colors text-sm sm:text-base whitespace-nowrap font-medium",
                        selected
                          ? "bg-violet-50 text-gray-900 border-violet-200/80"
                          : "border-gray-200 text-gray-700 hover:bg-gray-50"
                      )}
                      data-testid={`ai-mode-${mode.value}`}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            </div>
            
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-500" />
                AI Persona
              </h2>
              
              <div className="flex flex-wrap gap-2 sm:gap-3">
                {[
                  { value: "professional", label: "Professional" },
                  { value: "friendly", label: "Friendly" },
                  { value: "casual", label: "Casual" },
                ].map(persona => (
                  <button
                    key={persona.value}
                    onClick={() => {
                      const next = persona.value;
                      if (settings.aiPersona === next) return;
                      setSettings((prev) => ({ ...prev, aiPersona: next }));
                      saveSettingsMutation.mutate({ aiPersona: next });
                    }}
                    disabled={saveSettingsMutation.isPending}
                    className={cn(
                      "px-4 py-2 sm:px-6 sm:py-3 rounded-lg border text-center transition-colors text-sm sm:text-base whitespace-nowrap font-medium",
                      settings.aiPersona === persona.value
                        ? "bg-violet-50 text-gray-900 border-violet-200/80"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50"
                    )}
                    data-testid={`ai-persona-${persona.value}`}
                  >
                    {persona.label}
                  </button>
                ))}
              </div>
            </div>
            
            {hasFullAIBrain ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Hand className="w-5 h-5 text-orange-500" />
                  Human Handoff Keywords
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  When a customer uses these phrases, AI will pause and notify you for a human takeover.
                </p>
                
                <div className="flex flex-wrap gap-2 mb-4">
                  {settings.handoffKeywords.map(keyword => (
                    <span 
                      key={keyword}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-orange-50 text-orange-700 rounded-full text-sm"
                    >
                      {keyword}
                      <button onClick={() => handleRemoveKeyword(keyword)} className="hover:text-orange-900">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                
                <div className="flex gap-2">
                  <Input
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder="Add keyword..."
                    className="flex-1"
                    onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
                    data-testid="input-handoff-keyword"
                  />
                  <Button onClick={handleAddKeyword} variant="outline" data-testid="add-handoff-keyword">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 opacity-60 relative">
                <button
                  type="button"
                  disabled={isCheckingOut}
                  onClick={() => handleAddonCheckout()}
                  data-testid="button-unlock-handoff-settings"
                  className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-xl border-0 bg-white/50 p-4 text-center transition-colors hover:bg-white/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-70"
                >
                  <Lock className="w-6 h-6 text-gray-400" aria-hidden />
                  <span className="text-sm font-medium text-gray-700">Requires AI Brain</span>
                  <span className="text-xs text-purple-700">Upgrade to unlock</span>
                </button>
                <h2 className="text-lg font-bold text-gray-400 mb-4 flex items-center gap-2">
                  <Hand className="w-5 h-5 text-gray-400" />
                  Human Handoff Keywords
                </h2>
                <p className="text-sm text-gray-400 mb-4">
                  When a customer uses these phrases, AI will pause and notify you for a human takeover.
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-400 rounded-full text-sm">
                    speak to human
                  </span>
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-400 rounded-full text-sm">
                    talk to agent
                  </span>
                </div>
              </div>
            )}
          </TabsContent>

          {hasFullAIBrain && (
            <TabsContent value="knowledge" className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <ListChecks className="w-5 h-5 text-purple-500" />
                  Business Knowledge
                </h2>

                <div className="grid gap-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>Business name</Label>
                      <Input
                        value={knowledge.businessName}
                        onChange={(e) => setKnowledge((prev) => ({ ...prev, businessName: e.target.value }))}
                        placeholder="Your business name"
                        data-testid="input-business-name"
                      />
                    </div>
                    <div>
                      <Label>Industry</Label>
                      <Select
                        value={knowledge.industry}
                        onValueChange={(value) => setKnowledge((prev) => ({ ...prev, industry: value }))}
                      >
                        <SelectTrigger data-testid="select-industry">
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

                  <div>
                    <Label>Services / products</Label>
                    <Textarea
                      value={knowledge.servicesProducts}
                      onChange={(e) => setKnowledge((prev) => ({ ...prev, servicesProducts: e.target.value }))}
                      placeholder="What do you sell or provide?"
                      rows={3}
                      data-testid="textarea-services-products"
                    />
                  </div>

                  <div>
                    <Label>Booking link</Label>
                    <Input
                      value={knowledge.bookingLink}
                      onChange={(e) => setKnowledge((prev) => ({ ...prev, bookingLink: e.target.value }))}
                      placeholder="https://calendly.com/..."
                      data-testid="input-booking-link"
                    />
                  </div>

                  {/* Qualification questions */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-1.5">
                        <Target className="w-4 h-4 text-gray-500" />
                        Qualification questions
                      </Label>
                      {knowledge.industry && INDUSTRY_QUALIFY_TEMPLATES[knowledge.industry] && (
                        <button
                          type="button"
                          onClick={() => {
                            const template = INDUSTRY_QUALIFY_TEMPLATES[knowledge.industry];
                            if (template) setKnowledge((prev) => ({ ...prev, qualifyingQuestions: [...template] }));
                          }}
                          className="text-[11px] font-semibold text-purple-600 hover:text-purple-700 border border-purple-200 hover:border-purple-300 px-2 py-1 rounded-lg transition-colors whitespace-nowrap"
                          data-testid="button-apply-industry-template"
                        >
                          Apply {INDUSTRY_OPTIONS.find((o) => o.value === knowledge.industry)?.label} template
                        </button>
                      )}
                    </div>

                    {knowledge.qualifyingQuestions.length > 0 && (
                      <div className="space-y-2">
                        {knowledge.qualifyingQuestions.map((qq, idx) => (
                          <div
                            key={qq.key}
                            className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 group"
                          >
                            <span className="text-[11px] font-bold text-gray-300 w-4 pt-0.5 shrink-0">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[11px] font-semibold text-gray-700">{qq.label}</span>
                                <span
                                  className={cn(
                                    "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide",
                                    qq.required ? "bg-red-50 text-red-500" : "bg-gray-100 text-gray-400",
                                  )}
                                >
                                  {qq.required ? "required" : "optional"}
                                </span>
                              </div>
                              <p className="text-[12px] text-gray-500 leading-relaxed truncate">{qq.question}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setKnowledge((prev) => ({
                                    ...prev,
                                    qualifyingQuestions: prev.qualifyingQuestions.map((q, i) =>
                                      i === idx ? { ...q, required: !q.required } : q,
                                    ),
                                  }))
                                }
                                className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors px-1"
                                title="Toggle required"
                              >
                                {qq.required ? "✓req" : "opt"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setKnowledge((prev) => ({
                                    ...prev,
                                    qualifyingQuestions: prev.qualifyingQuestions.filter((_, i) => i !== idx),
                                  }))
                                }
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400"
                                data-testid={`button-remove-qualifying-question-${idx}`}
                                title="Remove"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="border border-dashed border-gray-200 rounded-lg p-3 space-y-2">
                      <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Add question</p>
                      <div className="grid grid-cols-3 gap-2">
                        <Input
                          value={newQQ.label}
                          onChange={(e) => setNewQQ((prev) => ({ ...prev, label: e.target.value }))}
                          placeholder="Label (e.g. Budget)"
                          className="text-sm col-span-1"
                          data-testid="input-new-qq-label"
                        />
                        <Input
                          value={newQQ.question}
                          onChange={(e) => setNewQQ((prev) => ({ ...prev, question: e.target.value }))}
                          placeholder="Question to ask the lead..."
                          className="text-sm col-span-2"
                          data-testid="input-new-qq-question"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                          <Switch
                            checked={newQQ.required}
                            onCheckedChange={(v) => setNewQQ((prev) => ({ ...prev, required: v }))}
                          />
                          Required
                        </label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
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
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label>Custom instructions</Label>
                    <Textarea
                      value={knowledge.customInstructions}
                      onChange={(e) => setKnowledge((prev) => ({ ...prev, customInstructions: e.target.value }))}
                      placeholder="Anything specific the AI should know or how it should behave…"
                      rows={3}
                      data-testid="textarea-custom-instructions"
                    />
                  </div>
                </div>

                <Button
                  onClick={() => saveKnowledgeMutation.mutate(knowledge)}
                  disabled={saveKnowledgeMutation.isPending}
                  className="mt-4 bg-blue-600 hover:bg-blue-700"
                  data-testid="save-business-knowledge"
                >
                  {saveKnowledgeMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save
                </Button>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}

export function AIBrain() {
  return <AIBrainContent />;
}
