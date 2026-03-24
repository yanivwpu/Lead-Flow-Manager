import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Brain, 
  Sparkles, 
  Settings2, 
  Building2, 
  MessageSquare, 
  Zap, 
  AlertTriangle,
  Loader2,
  Save,
  Plus,
  X,
  Lightbulb,
  Target,
  Users,
  Clock,
  CheckCircle2,
  HelpCircle,
  Send,
  Bot,
  Hand,
  TrendingUp,
  Crown,
  Lock,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface AISettings {
  aiMode: string;
  businessHoursOnly: boolean;
  confidenceLevel: string;
  leadQualificationEnabled: boolean;
  autoTaggingEnabled: boolean;
  handoffKeywords: string[];
  aiPersona: string;
}

interface BusinessKnowledge {
  businessName: string;
  industry: string;
  servicesProducts: string;
  businessHours: string;
  locations: string;
  bookingLink: string;
  faqs: Array<{ question: string; answer: string }>;
  salesGoals: string;
  customInstructions: string;
  qualifyingQuestions: Array<{ question: string; required: boolean }>;
}

interface AIHealth {
  status: "healthy" | "limited" | "paused";
  message?: string;
}

interface SubscriptionData {
  limits: {
    plan: string;
    planName: string;
  };
}

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
];

const SALES_GOAL_OPTIONS = [
  { value: "book_call", label: "Book a Call/Meeting" },
  { value: "get_phone", label: "Get Phone Number" },
  { value: "collect_deposit", label: "Collect Deposit" },
  { value: "schedule_visit", label: "Schedule a Visit" },
  { value: "get_quote", label: "Provide Quote" },
  { value: "answer_questions", label: "Answer Questions" },
];

function AIBrainContent() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("settings");
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  
  const { data: subscription, isLoading: subscriptionLoading } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscription"],
  });
  
  const plan = subscription?.limits?.plan || "free";
  const isPro = plan === "pro" || plan === "enterprise";
  const isStarter = plan === "starter";
  const hasAIAssist = isStarter || isPro;
  // Get add-on status from subscription data (checked via Stripe)
  const hasAIBrainAddon = (subscription?.limits as any)?.hasAIBrainAddon ?? false;
  const hasFullAIBrain = hasAIBrainAddon && hasAIAssist;
  
  const [settings, setSettings] = useState<AISettings>({
    aiMode: "suggest_only",
    businessHoursOnly: false,
    confidenceLevel: "balanced",
    leadQualificationEnabled: true,
    autoTaggingEnabled: true,
    handoffKeywords: ["call me", "human", "agent", "speak to someone"],
    aiPersona: "professional",
  });
  
  const [knowledge, setKnowledge] = useState<BusinessKnowledge>({
    businessName: "",
    industry: "",
    servicesProducts: "",
    businessHours: "",
    locations: "",
    bookingLink: "",
    faqs: [],
    salesGoals: "",
    customInstructions: "",
    qualifyingQuestions: [],
  });
  
  const [aiHealth, setAiHealth] = useState<AIHealth>({
    status: "healthy",
    message: undefined,
  });
  
  const [newFaq, setNewFaq] = useState({ question: "", answer: "" });
  const [newKeyword, setNewKeyword] = useState("");
  const [automationPrompt, setAutomationPrompt] = useState("");
  const [generatingAutomation, setGeneratingAutomation] = useState(false);
  const [generatedWorkflow, setGeneratedWorkflow] = useState<any>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  
  // AI Brain add-on checkout
  const handleAddonCheckout = async () => {
    setIsCheckingOut(true);
    try {
      const response = await fetch("/api/subscription/addon/ai-brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to start checkout");
      }
      if (data.url) {
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
  
  // Business knowledge - only for Full AI Brain users
  const { data: businessKnowledge, isLoading: knowledgeLoading } = useQuery({
    queryKey: ["/api/ai/business-knowledge"],
    enabled: !subscriptionLoading && hasFullAIBrain,
    retry: false,
  });
  
  // AI health - for all AI users
  const { data: aiHealthData, isLoading: healthLoading } = useQuery({
    queryKey: ["/api/ai/health"],
    enabled: !subscriptionLoading && (hasAIAssist || hasFullAIBrain),
    retry: false,
  });
  
  useEffect(() => {
    if (aiSettings && typeof aiSettings === 'object') {
      const s = aiSettings as AISettings;
      setSettings({
        aiMode: s.aiMode || "suggest_only",
        businessHoursOnly: s.businessHoursOnly || false,
        confidenceLevel: s.confidenceLevel || "balanced",
        leadQualificationEnabled: s.leadQualificationEnabled ?? true,
        autoTaggingEnabled: s.autoTaggingEnabled ?? true,
        handoffKeywords: s.handoffKeywords || ["call me", "human", "agent", "speak to someone"],
        aiPersona: s.aiPersona || "professional",
      });
    }
  }, [aiSettings]);
  
  useEffect(() => {
    if (businessKnowledge && typeof businessKnowledge === 'object') {
      const k = businessKnowledge as BusinessKnowledge;
      setKnowledge({
        businessName: k.businessName || "",
        industry: k.industry || "",
        servicesProducts: k.servicesProducts || "",
        businessHours: k.businessHours || "",
        locations: k.locations || "",
        bookingLink: k.bookingLink || "",
        faqs: k.faqs || [],
        salesGoals: k.salesGoals || "",
        customInstructions: k.customInstructions || "",
        qualifyingQuestions: k.qualifyingQuestions || [],
      });
    }
  }, [businessKnowledge]);
  
  useEffect(() => {
    if (aiHealthData && typeof aiHealthData === 'object') {
      setAiHealth(aiHealthData as AIHealth);
    }
  }, [aiHealthData]);
  
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
      toast({ title: "Settings saved", description: "Your AI settings have been updated." });
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
      toast({ title: "Knowledge saved", description: "Your business knowledge has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save knowledge. Please try again.", variant: "destructive" });
    },
  });
  
  const generateAutomationMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const res = await fetch("/api/ai/generate-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to generate automation");
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedWorkflow(data);
      toast({ title: "Automation generated", description: "Review the workflow below." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate automation. Please try again.", variant: "destructive" });
    },
  });
  
  const handleAddFaq = () => {
    if (newFaq.question && newFaq.answer) {
      setKnowledge(prev => ({
        ...prev,
        faqs: [...prev.faqs, newFaq],
      }));
      setNewFaq({ question: "", answer: "" });
    }
  };
  
  const handleRemoveFaq = (index: number) => {
    setKnowledge(prev => ({
      ...prev,
      faqs: prev.faqs.filter((_, i) => i !== index),
    }));
  };
  
  const handleAddKeyword = () => {
    if (newKeyword && !settings.handoffKeywords.includes(newKeyword)) {
      setSettings(prev => ({
        ...prev,
        handoffKeywords: [...prev.handoffKeywords, newKeyword],
      }));
      setNewKeyword("");
    }
  };
  
  const handleRemoveKeyword = (keyword: string) => {
    setSettings(prev => ({
      ...prev,
      handoffKeywords: prev.handoffKeywords.filter(k => k !== keyword),
    }));
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
                  <span className="text-xs text-purple-600 font-medium">Full AI Brain ($29/mo)</span>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-200">
                <Zap className="w-5 h-5 text-yellow-500 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Plain English Automations</p>
                  <p className="text-sm text-gray-500">Describe workflows in plain language</p>
                  <span className="text-xs text-purple-600 font-medium">Full AI Brain ($29/mo)</span>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl p-6 border border-purple-100 mb-6">
              <div className="flex items-center justify-center gap-2 mb-3">
                <Crown className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-bold text-purple-700 uppercase tracking-wide">
                  {hasAIAssist ? "Unlock Full AI Brain" : "Get Started with AI"}
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900 mb-1">$29/month</p>
              <p className="text-sm text-gray-600 mb-4">
                {hasAIAssist 
                  ? "Unlock unlimited suggestions, lead qualification, summarization, and automation builder" 
                  : "Available for Starter and Pro plan subscribers"}
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
                    "Unlock Full AI Brain – $29/mo"
                  )}
                </Button>
              ) : (
                <Link href="/pricing">
                  <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                    Get Starter Plan First
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (settingsLoading || knowledgeLoading) {
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
                <p className="text-sm text-purple-600 mt-2">Unlimited access to all advanced features - reply suggestions, lead qualification, summarization, automation builder, and more.</p>
              </details>
            ) : (
              <>
                <p className="font-medium text-blue-800">AI Assist Active</p>
                <p className="text-sm text-blue-600">
                  Basic reply suggestions with sentiment detection included in your {isPro ? "Pro" : "Starter"} plan.
                  {isPro ? " Higher daily limits included." : ""}
                </p>
                <Button 
                  size="sm" 
                  className="mt-2 bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={handleAddonCheckout}
                  disabled={isCheckingOut}
                >
                  <Crown className="w-3 h-3 mr-1" />
                  {isCheckingOut ? "Processing..." : "Unlock Full AI Brain – $29/mo"}
                </Button>
              </>
            )}
          </div>
        </div>
        
        {aiHealth.status !== "healthy" && (
          <div className={cn(
            "mb-6 p-4 rounded-xl border flex items-center gap-3",
            aiHealth.status === "paused" ? "bg-red-50 border-red-200" : "bg-yellow-50 border-yellow-200"
          )}>
            <AlertTriangle className={cn("w-5 h-5", aiHealth.status === "paused" ? "text-red-500" : "text-yellow-500")} />
            <div className="flex-1">
              <p className={cn("font-medium", aiHealth.status === "paused" ? "text-red-700" : "text-yellow-700")}>
                {aiHealth.status === "paused" ? "AI is Paused" : "AI is Limited"}
              </p>
              <p className={cn("text-sm", aiHealth.status === "paused" ? "text-red-600" : "text-yellow-600")}>
                {aiHealth.message || "AI assistance is temporarily limited to protect deliverability."}
              </p>
            </div>
          </div>
        )}
        
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
                  <Building2 className="w-4 h-4 mr-1 md:mr-2" />
                  <span className="hidden sm:inline">Business Knowledge</span>
                  <span className="sm:hidden">Knowledge</span>
                </TabsTrigger>
              )}
              {hasFullAIBrain && (
                <TabsTrigger value="automation" className="rounded-lg data-[state=active]:bg-white whitespace-nowrap">
                  <Zap className="w-4 h-4 mr-1 md:mr-2" />
                  <span className="hidden sm:inline">Automation Builder</span>
                  <span className="sm:hidden">Automation</span>
                </TabsTrigger>
              )}
              <TabsTrigger value="health" className="rounded-lg data-[state=active]:bg-white whitespace-nowrap">
                <TrendingUp className="w-4 h-4 mr-1 md:mr-2" />
                <span className="hidden sm:inline">AI Health</span>
                <span className="sm:hidden">Health</span>
              </TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="settings" className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Bot className="w-5 h-5 text-purple-500" />
                Mode
              </h2>
              
              <div className="grid gap-3">
                {[
                  { value: "off", label: "Off", desc: "Copilot and Autopilot are paused", icon: X },
                  { value: "suggest_only", label: "Suggest Only", desc: "Suggests replies, you send them", icon: Lightbulb },
                  { value: "full_auto", label: "Full Auto", desc: "Responds automatically (with guardrails)", icon: Sparkles },
                ].map(mode => (
                  <button
                    key={mode.value}
                    onClick={() => setSettings(prev => ({ ...prev, aiMode: mode.value }))}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all",
                      settings.aiMode === mode.value
                        ? "border-purple-500 bg-purple-50"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                    data-testid={`ai-mode-${mode.value}`}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      settings.aiMode === mode.value ? "bg-purple-100" : "bg-gray-100"
                    )}>
                      <mode.icon className={cn(
                        "w-5 h-5",
                        settings.aiMode === mode.value ? "text-purple-600" : "text-gray-400"
                      )} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{mode.label}</p>
                      <p className="text-sm text-gray-500">{mode.desc}</p>
                    </div>
                    {settings.aiMode === mode.value && (
                      <CheckCircle2 className="w-5 h-5 text-purple-500" />
                    )}
                  </button>
                ))}
              </div>
              
              <Button 
                onClick={() => saveSettingsMutation.mutate(settings)}
                disabled={saveSettingsMutation.isPending}
                className="mt-4 bg-purple-600 hover:bg-purple-700"
                data-testid="save-ai-settings"
              >
                {saveSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Settings
              </Button>
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
                    onClick={() => setSettings(prev => ({ ...prev, aiPersona: persona.value }))}
                    className={cn(
                      "px-4 py-2 sm:px-6 sm:py-3 rounded-lg border-2 text-center transition-all text-sm sm:text-base whitespace-nowrap",
                      settings.aiPersona === persona.value
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 hover:border-gray-300 text-gray-700"
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
                  <Target className="w-5 h-5 text-green-500" />
                  Lead Qualification
                </h2>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-medium">Enable Lead Qualification</Label>
                      <p className="text-sm text-gray-500">Automatically score and qualify incoming leads</p>
                    </div>
                    <Switch
                      checked={settings.leadQualificationEnabled}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, leadQualificationEnabled: checked }))}
                      data-testid="switch-lead-qualification"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-medium">Auto-Tagging</Label>
                      <p className="text-sm text-gray-500">Automatically tag conversations based on content</p>
                    </div>
                    <Switch
                      checked={settings.autoTaggingEnabled}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, autoTaggingEnabled: checked }))}
                      data-testid="switch-auto-tagging"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 opacity-60 relative">
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-xl z-10">
                  <div className="text-center">
                    <Lock className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-600">Requires Full AI Brain</p>
                    <Button 
                      size="sm" 
                      className="mt-2 bg-purple-600 hover:bg-purple-700"
                      onClick={() => handleAddonCheckout()}
                      data-testid="button-unlock-lead-qual-settings"
                    >
                      Upgrade to AI Brain
                    </Button>
                  </div>
                </div>
                <h2 className="text-lg font-bold text-gray-400 mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-gray-400" />
                  Lead Qualification
                </h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-medium text-gray-400">Enable Lead Qualification</Label>
                      <p className="text-sm text-gray-400">Automatically score and qualify incoming leads</p>
                    </div>
                    <Switch disabled checked={false} />
                  </div>
                </div>
              </div>
            )}
            
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
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-xl z-10">
                  <div className="text-center">
                    <Lock className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-600">Requires Full AI Brain</p>
                    <Button 
                      size="sm" 
                      className="mt-2 bg-purple-600 hover:bg-purple-700"
                      onClick={() => handleAddonCheckout()}
                      data-testid="button-unlock-handoff-settings"
                    >
                      Upgrade to AI Brain
                    </Button>
                  </div>
                </div>
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
          
          <TabsContent value="knowledge" className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-500" />
                Business Information
              </h2>
              
              <div className="grid gap-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Business Name</Label>
                    <Input
                      value={knowledge.businessName}
                      onChange={(e) => setKnowledge(prev => ({ ...prev, businessName: e.target.value }))}
                      placeholder="Your Business Name"
                      data-testid="input-business-name"
                    />
                  </div>
                  <div>
                    <Label>Industry</Label>
                    <Select
                      value={knowledge.industry}
                      onValueChange={(value) => setKnowledge(prev => ({ ...prev, industry: value }))}
                    >
                      <SelectTrigger data-testid="select-industry">
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent>
                        {INDUSTRY_OPTIONS.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label>Services/Products</Label>
                  <Textarea
                    value={knowledge.servicesProducts}
                    onChange={(e) => setKnowledge(prev => ({ ...prev, servicesProducts: e.target.value }))}
                    placeholder="Describe your main services or products..."
                    rows={3}
                    data-testid="textarea-services"
                  />
                </div>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Business Hours</Label>
                    <Input
                      value={knowledge.businessHours}
                      onChange={(e) => setKnowledge(prev => ({ ...prev, businessHours: e.target.value }))}
                      placeholder="e.g., Mon-Fri 9am-5pm EST"
                      data-testid="input-business-hours"
                    />
                  </div>
                  <div>
                    <Label>Locations</Label>
                    <Input
                      value={knowledge.locations}
                      onChange={(e) => setKnowledge(prev => ({ ...prev, locations: e.target.value }))}
                      placeholder="e.g., New York, Los Angeles"
                      data-testid="input-locations"
                    />
                  </div>
                </div>
                
                <div>
                  <Label>Booking/Calendar Link</Label>
                  <Input
                    value={knowledge.bookingLink}
                    onChange={(e) => setKnowledge(prev => ({ ...prev, bookingLink: e.target.value }))}
                    placeholder="https://calendly.com/..."
                    data-testid="input-booking-link"
                  />
                </div>
                
                <div>
                  <Label>Sales Goal</Label>
                  <Select
                    value={knowledge.salesGoals}
                    onValueChange={(value) => setKnowledge(prev => ({ ...prev, salesGoals: value }))}
                  >
                    <SelectTrigger data-testid="select-sales-goal">
                      <SelectValue placeholder="What's your primary goal?" />
                    </SelectTrigger>
                    <SelectContent>
                      {SALES_GOAL_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Custom AI Instructions</Label>
                  <Textarea
                    value={knowledge.customInstructions}
                    onChange={(e) => setKnowledge(prev => ({ ...prev, customInstructions: e.target.value }))}
                    placeholder="Any special instructions for how the AI should behave..."
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
                {saveKnowledgeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Knowledge
              </Button>
            </div>
            
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-purple-500" />
                FAQs
              </h2>
              <p className="text-sm text-gray-500 mb-4">Add common questions and answers the AI can use.</p>
              
              {knowledge.faqs.length > 0 && (
                <div className="space-y-3 mb-4">
                  {knowledge.faqs.map((faq, index) => (
                    <div key={index} className="p-3 bg-gray-50 rounded-lg group border border-transparent hover:border-purple-100 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <p className="font-medium text-gray-900 text-sm flex-1">Q: {faq.question}</p>
                        <div className="flex gap-1 ml-2">
                          <button
                            onClick={() => {
                              const q = prompt("Edit Question", faq.question);
                              const a = prompt("Edit Answer", faq.answer);
                              if (q !== null && a !== null) {
                                setKnowledge(prev => ({
                                  ...prev,
                                  faqs: prev.faqs.map((f, i) => i === index ? { question: q, answer: a } : f)
                                }));
                              }
                            }}
                            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                            title="Edit FAQ"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRemoveFaq(index)}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            title="Delete FAQ"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-600 text-sm">A: {faq.answer}</p>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="space-y-3">
                <Input
                  value={newFaq.question}
                  onChange={(e) => setNewFaq(prev => ({ ...prev, question: e.target.value }))}
                  placeholder="Question..."
                  data-testid="input-faq-question"
                />
                <Textarea
                  value={newFaq.answer}
                  onChange={(e) => setNewFaq(prev => ({ ...prev, answer: e.target.value }))}
                  placeholder="Answer..."
                  rows={2}
                  data-testid="textarea-faq-answer"
                />
                <Button onClick={handleAddFaq} variant="outline" className="w-full" data-testid="add-faq">
                  <Plus className="w-4 h-4 mr-2" /> Add FAQ
                </Button>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="automation" className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-500" />
                Plain English Automation Builder
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Describe what you want to happen in plain English, and AI will create the workflow for you.
              </p>
              
              <div className="space-y-4">
                <Textarea
                  value={automationPrompt}
                  onChange={(e) => setAutomationPrompt(e.target.value)}
                  placeholder="Example: When a customer asks about pricing, send them our price list and ask if they'd like to schedule a call..."
                  rows={4}
                  data-testid="textarea-automation-prompt"
                />
                
                <Button
                  onClick={() => generateAutomationMutation.mutate(automationPrompt)}
                  disabled={!automationPrompt || generateAutomationMutation.isPending}
                  className="bg-yellow-500 hover:bg-yellow-600 text-black"
                  data-testid="generate-automation"
                >
                  {generateAutomationMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating...</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" /> Generate Automation</>
                  )}
                </Button>
              </div>
              
              {generatedWorkflow && (
                <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <h3 className="font-medium text-gray-900 mb-3">Generated Workflow</h3>
                  <p className="text-sm text-gray-600 mb-4">{generatedWorkflow.description}</p>
                  
                  <div className="space-y-3">
                    {generatedWorkflow.triggers?.map((trigger: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">WHEN</span>
                        <span className="text-gray-700">{trigger.type}</span>
                      </div>
                    ))}
                    {generatedWorkflow.actions?.map((action: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">THEN</span>
                        <span className="text-gray-700">{action.type}</span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex gap-2 mt-4">
                    <Button className="bg-green-600 hover:bg-green-700" data-testid="save-automation">
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Save Workflow
                    </Button>
                    <Button variant="outline" onClick={() => setGeneratedWorkflow(null)}>
                      Discard
                    </Button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-6 border border-purple-100">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                  <Lightbulb className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Example Automations</h3>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>"When someone asks about pricing, send our rate card and schedule a follow-up"</li>
                    <li>"If a lead mentions they're ready to buy, notify me immediately and mark as hot lead"</li>
                    <li>"When a customer says thank you, ask for a review"</li>
                    <li>"After qualifying a lead, add them to my CRM pipeline"</li>
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="health" className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-500" />
                AI Health
              </h2>
              
              {healthLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className={cn(
                    "p-6 rounded-xl flex items-center gap-4",
                    aiHealth.status === "healthy" && "bg-green-50 border border-green-200",
                    aiHealth.status === "limited" && "bg-yellow-50 border border-yellow-200",
                    aiHealth.status === "paused" && "bg-red-50 border border-red-200"
                  )}>
                    <div className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center",
                      aiHealth.status === "healthy" && "bg-green-100",
                      aiHealth.status === "limited" && "bg-yellow-100",
                      aiHealth.status === "paused" && "bg-red-100"
                    )}>
                      {aiHealth.status === "healthy" && <CheckCircle2 className="w-6 h-6 text-green-600" />}
                      {aiHealth.status === "limited" && <AlertTriangle className="w-6 h-6 text-yellow-600" />}
                      {aiHealth.status === "paused" && <Hand className="w-6 h-6 text-red-600" />}
                    </div>
                    <div>
                      <h3 className={cn(
                        "text-lg font-semibold",
                        aiHealth.status === "healthy" && "text-green-800",
                        aiHealth.status === "limited" && "text-yellow-800",
                        aiHealth.status === "paused" && "text-red-800"
                      )}>
                        {aiHealth.status === "healthy" && "AI is Healthy"}
                        {aiHealth.status === "limited" && "AI is Limited"}
                        {aiHealth.status === "paused" && "AI is Paused"}
                      </h3>
                      <p className={cn(
                        "text-sm",
                        aiHealth.status === "healthy" && "text-green-600",
                        aiHealth.status === "limited" && "text-yellow-600",
                        aiHealth.status === "paused" && "text-red-600"
                      )}>
                        {aiHealth.status === "healthy" && "Copilot and Autopilot are working normally."}
                        {aiHealth.status === "limited" && (aiHealth.message || "AI assistance is temporarily limited to protect deliverability.")}
                        {aiHealth.status === "paused" && (aiHealth.message || "AI assistance is temporarily limited to protect deliverability.")}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-purple-500" />
                        <span className="font-medium text-gray-900">Reply Suggestions</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {settings.aiMode === "full_auto" ? "Auto-sending enabled" : 
                         settings.aiMode === "suggest_only" ? "Suggestions enabled" : "Disabled"}
                      </p>
                    </div>
                    {hasFullAIBrain ? (
                      <div className="p-4 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                          <Target className="w-4 h-4 text-green-500" />
                          <span className="font-medium text-gray-900">Lead Qualification</span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {settings.leadQualificationEnabled ? "Active" : "Disabled"}
                        </p>
                      </div>
                    ) : (
                      <div className="p-4 bg-gray-50 rounded-xl opacity-60">
                        <div className="flex items-center gap-2 mb-2">
                          <Target className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-500">Lead Qualification</span>
                          <Crown className="w-3 h-3 text-purple-500" />
                        </div>
                        <p className="text-sm text-gray-400">Full AI Brain feature</p>
                      </div>
                    )}
                    {hasFullAIBrain ? (
                      <div className="p-4 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                          <Hand className="w-4 h-4 text-orange-500" />
                          <span className="font-medium text-gray-900">Human Handoff</span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {settings.handoffKeywords.length} trigger keywords configured
                        </p>
                      </div>
                    ) : (
                      <div className="p-4 bg-gray-50 rounded-xl opacity-60">
                        <div className="flex items-center gap-2 mb-2">
                          <Hand className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-500">Human Handoff</span>
                          <Crown className="w-3 h-3 text-purple-500" />
                        </div>
                        <p className="text-sm text-gray-400">Full AI Brain feature</p>
                      </div>
                    )}
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-blue-500" />
                        <span className="font-medium text-gray-900">Business Hours</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {settings.businessHoursOnly ? "Active only during business hours" : "Active 24/7"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export function AIBrain() {
  return <AIBrainContent />;
}
