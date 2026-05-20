import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import debounce from "lodash/debounce";
import {
  Brain,
  Sparkles,
  Loader2,
  Plus,
  X,
  Lock,
  ChevronRight,
  Trash2,
  ListChecks,
  Globe,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { mustUseShopifyBilling } from "@/lib/shopifyBillingContext";
import { postShopifyCheckoutWeb } from "@/lib/shopifyCheckout";
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
  /** From GET /api/ai/business-knowledge — Calendly integration with primary scheduling URL. */
  calendlyBookingConnected?: boolean;
  customInstructions: string;
  qualifyingQuestions: Array<{ key: string; label: string; question: string; required: boolean }>;
  websiteKnowledgeUrl?: string | null;
  websiteKnowledgeSummary?: string | null;
  websiteKnowledgeSourceUrls?: string[] | null;
  websiteKnowledgeUpdatedAt?: string | null;
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

/** Scan API or legacy rows may return structured JSON; the preview textarea must always receive plain text. */
function websiteKnowledgePreviewToString(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return "";
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        return websiteKnowledgePreviewToString(JSON.parse(t));
      } catch {
        return t;
      }
    }
    return t;
  }
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) {
    return raw
      .map((item) => websiteKnowledgePreviewToString(item))
      .filter((s) => s.length > 0)
      .join("\n\n")
      .trim();
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const keys = ["previewSummary", "summary", "text", "content", "body", "message", "result", "output"] as const;
    for (const k of keys) {
      if (k in o && o[k] != null) {
        const inner = websiteKnowledgePreviewToString(o[k]);
        if (inner) return inner;
      }
    }
    if ("data" in o && o.data != null) {
      const inner = websiteKnowledgePreviewToString(o.data);
      if (inner) return inner;
    }
  }
  return "";
}

type WkUrlsState = {
  homepage: string;
  productServices: string;
  about: string;
  faq: string;
  shippingPolicy: string;
  returnPolicy: string;
  terms: string;
  privacy: string;
  other: string;
};

const WK_URLS_INITIAL: WkUrlsState = {
  homepage: "",
  productServices: "",
  about: "",
  faq: "",
  shippingPolicy: "",
  returnPolicy: "",
  terms: "",
  privacy: "",
  other: "",
};

const WK_FIELD_ROWS: { key: keyof WkUrlsState; label: string; placeholder: string; testId?: string }[] = [
  { key: "homepage", label: "Homepage URL", placeholder: "https://example.com/", testId: "input-website-knowledge-url" },
  { key: "productServices", label: "Product / Services URL", placeholder: "https://example.com/services" },
  { key: "about", label: "About URL", placeholder: "https://example.com/about" },
  { key: "faq", label: "FAQ URL", placeholder: "https://example.com/faq" },
  { key: "shippingPolicy", label: "Shipping policy URL", placeholder: "https://example.com/shipping" },
  { key: "returnPolicy", label: "Return policy URL", placeholder: "https://example.com/returns" },
  { key: "terms", label: "Terms URL", placeholder: "https://example.com/terms" },
  { key: "privacy", label: "Privacy policy URL", placeholder: "https://example.com/privacy" },
  { key: "other", label: "Other URL (optional)", placeholder: "https://example.com/…" },
];

type WkPageResultRow = {
  key: string;
  label: string;
  url: string;
  status: "scanned" | "skipped" | "failed";
  reason?: string;
  finalUrl?: string;
  truncated?: boolean;
};

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

/** Premium intelligence layer — business context, not quota marketing. */
const AI_BRAIN_HIGHLIGHTS = [
  "premium intelligence layer",
  "business knowledge",
  "qualifying questions",
  "lead scoring",
  "Copilot recommendations",
  "automation intelligence",
  "handoff rules",
  "Growth Engine intelligence",
] as const;

function assistTierLabel(plan: string, trialProAi: boolean): string {
  if (trialProAi || plan === "pro" || plan === "enterprise") return "AI Assist Basic + Pro workflows";
  if (plan === "starter") return "AI Assist Basic";
  return "AI Assist";
}

/** No numeric limits — product copy only. */
function assistPlanBullets(plan: string, trialProAi: boolean): string[] {
  if (trialProAi) {
    return [
      "Smart reply suggestions tuned to each thread",
      "Inbox assistance and Copilot-style help",
      "Suggest and Auto modes on your trial",
      "Automation-aware context for faster decisions",
    ];
  }
  if (plan === "starter") {
    return [
      "Smart reply suggestions you can send in one tap",
      "Inbox assistance to move conversations forward",
      "Suggest mode — you stay in control of every send",
      "Light automation-aware help in context",
    ];
  }
  if (plan === "pro" || plan === "enterprise") {
    return [
      "Smart reply suggestions with deeper thread context",
      "Inbox assistance across your team workflow",
      "Suggest and Auto modes when your plan allows",
      "Automation-aware help for workflows and follow-ups",
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
        title="Unlock with AI Brain"
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

  const limits = subscription?.limits;
  const plan = (limits?.plan || limits?.effectivePlan || "free") as string;
  const isFree = plan === "free";
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
  const [newQQ, setNewQQ] = useState({ label: "", question: "", required: true });
  const [newKeyword, setNewKeyword] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const [wkUrls, setWkUrls] = useState<WkUrlsState>(WK_URLS_INITIAL);
  const [wkPreview, setWkPreview] = useState("");
  const [wkPhase, setWkPhase] = useState<"idle" | "scanning" | "scanned" | "failed">("idle");
  const [wkErr, setWkErr] = useState("");
  const [wkScanId, setWkScanId] = useState<string | null>(null);
  const [wkSources, setWkSources] = useState<string[]>([]);
  const [wkPageResults, setWkPageResults] = useState<WkPageResultRow[] | null>(null);

  const hasAnyWkUrl = useMemo(
    () => Object.values(wkUrls).some((v) => typeof v === "string" && v.trim().length > 0),
    [wkUrls],
  );

  const isShopify = mustUseShopifyBilling(subscription?.subscription, shopHint);

  // AI Brain add-on checkout
  const handleAddonCheckout = async () => {
    setIsCheckingOut(true);
    try {
      if (isShopify) {
        const data = await postShopifyCheckoutWeb("AI Brain Add-on", shopHint);
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
    if (isShopify) {
      toast({
        title: "Use Shopify to subscribe",
        description: "Open Pricing in this app and approve Starter or Pro in Shopify, then add AI Brain there.",
      });
      return;
    }
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
        })),
      };
      setKnowledge(next);
      lastKnowledgeSentRef.current = JSON.stringify(next);
      knowledgeHydratedRef.current = true;
    }
  }, [businessKnowledge]);

  useEffect(() => {
    if (!businessKnowledge || typeof businessKnowledge !== "object") return;
    if (wkPhase === "scanning" || wkPhase === "scanned" || wkPhase === "failed") return;
    const k = businessKnowledge as BusinessKnowledge;
    setWkUrls({
      ...WK_URLS_INITIAL,
      homepage: k.websiteKnowledgeUrl || "",
    });
    setWkPreview(websiteKnowledgePreviewToString(k.websiteKnowledgeSummary));
    setWkSources(
      Array.isArray(k.websiteKnowledgeSourceUrls)
        ? k.websiteKnowledgeSourceUrls.filter((x): x is string => typeof x === "string")
        : [],
    );
  }, [businessKnowledge, wkPhase]);

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

  const websiteScanMutation = useMutation({
    mutationFn: async (urls: WkUrlsState) => {
      const res = await fetch("/api/ai/website-knowledge/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          homepageUrl: urls.homepage.trim(),
          productServicesUrl: urls.productServices.trim(),
          aboutUrl: urls.about.trim(),
          faqUrl: urls.faq.trim(),
          shippingPolicyUrl: urls.shippingPolicy.trim(),
          returnPolicyUrl: urls.returnPolicy.trim(),
          termsUrl: urls.terms.trim(),
          privacyPolicyUrl: urls.privacy.trim(),
          otherUrl: urls.other.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : "Scan failed";
        const err = new Error(msg) as Error & { pageResults?: WkPageResultRow[] };
        err.pageResults = Array.isArray(data.pageResults) ? data.pageResults : undefined;
        throw err;
      }
      return data as {
        scanId: string;
        previewSummary: unknown;
        sourceUrls: string[];
        pageResults?: WkPageResultRow[];
      };
    },
    onMutate: () => {
      setWkErr("");
      setWkPageResults(null);
      setWkPhase("scanning");
    },
    onSuccess: (data) => {
      setWkScanId(data.scanId);
      setWkPreview(websiteKnowledgePreviewToString(data.previewSummary));
      setWkSources(Array.isArray(data.sourceUrls) ? data.sourceUrls : []);
      setWkPageResults(Array.isArray(data.pageResults) ? data.pageResults : []);
      setWkPhase("scanned");
    },
    onError: (e: Error) => {
      setWkPhase("failed");
      setWkErr(e.message || "Scan failed");
      setWkScanId(null);
      const pe = (e as Error & { pageResults?: WkPageResultRow[] }).pageResults;
      setWkPageResults(Array.isArray(pe) ? pe : null);
    },
  });

  const websiteSaveMutation = useMutation({
    mutationFn: async (payload: { scanId: string; summary: string }) => {
      if (!payload.scanId) throw new Error("Nothing to save — run a scan first.");
      const res = await fetch("/api/ai/website-knowledge/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scanId: payload.scanId, summaryOverride: payload.summary }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to save");
      return data;
    },
    onSuccess: () => {
      setWkPhase("idle");
      setWkScanId(null);
      setWkPageResults(null);
      queryClient.invalidateQueries({ queryKey: ["/api/ai/business-knowledge"] });
      toast({
        title: "Saved to AI Brain",
        description: "This summary is now included in Copilot suggestions and auto replies.",
      });
    },
    onError: (e: Error) => {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    },
  });

  const websiteEditMutation = useMutation({
    mutationFn: async (summary: string) => {
      const res = await fetch("/api/ai/website-knowledge", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ summary }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to update");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/business-knowledge"] });
      toast({ title: "Knowledge updated", description: "Your edited summary has been saved." });
    },
    onError: (e: Error) => {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    },
  });

  const websiteDeleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ai/website-knowledge", { method: "DELETE", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to delete");
      return data;
    },
    onSuccess: () => {
      setWkUrls(WK_URLS_INITIAL);
      setWkPreview("");
      setWkSources([]);
      setWkScanId(null);
      setWkErr("");
      setWkPageResults(null);
      setWkPhase("idle");
      queryClient.invalidateQueries({ queryKey: ["/api/ai/business-knowledge"] });
      toast({ title: "Website knowledge removed", description: "AI will no longer use this imported context." });
    },
    onError: (e: Error) => {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
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

  /** Must run before any conditional return — same hook order on every render (React #310). */
  const websiteKnowledgeSaved = useMemo(() => {
    if (!businessKnowledge || typeof businessKnowledge !== "object") return null;
    const k = businessKnowledge as BusinessKnowledge;
    const summary = typeof k.websiteKnowledgeSummary === "string" ? k.websiteKnowledgeSummary.trim() : "";
    const url = typeof k.websiteKnowledgeUrl === "string" ? k.websiteKnowledgeUrl.trim() : "";
    const sourceUrlsRaw = k.websiteKnowledgeSourceUrls;
    const sourceUrls = Array.isArray(sourceUrlsRaw)
      ? sourceUrlsRaw.filter((x): x is string => typeof x === "string")
      : [];
    if (!summary && !url) return null;
    return { summary, url, sourceUrls, updatedAt: k.websiteKnowledgeUpdatedAt ?? null };
  }, [businessKnowledge]);

  const websiteKnowledgeLastScannedLabel = useMemo(() => {
    const t = websiteKnowledgeSaved?.updatedAt;
    if (t == null || t === "") return null;
    const d = new Date(t as string | number | Date);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }, [websiteKnowledgeSaved]);

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
    return (
      <div className="h-full overflow-y-auto bg-gradient-to-b from-violet-50/50 via-slate-50/90 to-white p-6 sm:p-10">
        <div className="mx-auto max-w-lg space-y-10 py-10">
          <div className="text-center space-y-5">
            <div className="relative mx-auto w-fit">
              <div className="absolute -inset-2 rounded-3xl bg-gradient-to-br from-violet-400/20 to-emerald-400/15 blur-lg" aria-hidden />
              <div className="relative flex h-16 w-16 items-center justify-center gap-0.5 rounded-2xl border border-violet-100/90 bg-white shadow-md shadow-violet-500/10">
                <Sparkles className="h-7 w-7 text-violet-600" aria-hidden />
                <Brain className="h-6 w-6 text-purple-600" aria-hidden />
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-600">WhachatCRM</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">AI workspace</h1>
            </div>
            <div className="mx-auto max-w-sm space-y-2 text-left text-sm leading-relaxed text-slate-600">
              <p>
                <span className="font-medium text-slate-900">Starter</span> is{" "}
                <span className="text-violet-900/90">AI Assist Basic</span>.{" "}
                <span className="font-medium text-slate-900">Pro</span> adds unlimited users and enhanced AI-assisted workflows where enabled.
              </p>
              <p>
                <span className="font-medium text-violet-900">AI Brain</span> — the serious upgrade for business memory,
                scoring, and automation intelligence.
              </p>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-violet-100/80 bg-white/95 p-7 shadow-lg shadow-violet-500/[0.06] ring-1 ring-slate-200/40">
            <p className="text-sm leading-relaxed text-slate-600">
              Choose a plan to turn on AI Assist. Add AI Brain on Starter or Pro for the full intelligence layer.
            </p>
            {isFree && !isShopify ? (
              <>
                <Button
                  type="button"
                  className="h-11 w-full rounded-full border-0 bg-gradient-to-r from-violet-600 to-purple-600 text-[15px] font-semibold text-white shadow-md shadow-violet-500/25 hover:from-violet-500 hover:to-purple-500 focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:ring-offset-2"
                  onClick={() => setBundleModalOpen(true)}
                  disabled={isCheckingOut}
                >
                  Choose plan &amp; bundles
                </Button>
                <Dialog open={bundleModalOpen} onOpenChange={setBundleModalOpen}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Choose your bundle</DialogTitle>
                      <DialogDescription>Monthly billing — plan plus intelligence add-on in one subscription.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3 py-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-auto flex-col items-stretch gap-1 rounded-xl border-violet-100/90 py-4 hover:bg-violet-50/50"
                        onClick={() => handlePlanAIBundleCheckout("starter")}
                        disabled={isCheckingOut}
                      >
                        <span className="font-semibold text-violet-950">Starter + AI Brain</span>
                        <span className="text-xs font-normal text-violet-800/80">AI Assist Basic + intelligence layer</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-auto flex-col items-stretch gap-1 rounded-xl border-violet-100/90 py-4 hover:bg-violet-50/50"
                        onClick={() => handlePlanAIBundleCheckout("pro")}
                        disabled={isCheckingOut}
                      >
                        <span className="font-semibold text-violet-950">Pro + AI Brain</span>
                        <span className="text-xs font-normal text-violet-800/80">AI Assist Basic, Pro workflows + intelligence layer</span>
                      </Button>
                    </div>
                    {isCheckingOut && (
                      <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
                        <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                        Redirecting to checkout…
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </>
            ) : (
              <Link href="/pricing">
                <Button
                  type="button"
                  className="h-11 w-full rounded-full border-0 bg-gradient-to-r from-violet-600 to-purple-600 text-[15px] font-semibold text-white shadow-md shadow-violet-500/25 hover:from-violet-500 hover:to-purple-500 focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:ring-offset-2"
                >
                  View plans
                </Button>
              </Link>
            )}
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

  const assistBullets = assistPlanBullets(plan, showTrialFullSuite);
  const assistTier = assistTierLabel(plan, showTrialFullSuite);
  const showBrainUpgradeSection = hasAIAssist && !effectiveHasAIBrain;
  const hidePaidBrainCta = isInTrial && trialIncludesAIBrain && effectiveHasAIBrain;
  const starterOnly = isStarter && !isPro;
  const autoModeLocked = starterOnly;

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-gradient-to-b from-violet-50/50 via-slate-50/95 to-white">
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
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.65rem]">AI workspace</h1>
              <div className="max-w-lg text-sm leading-relaxed text-slate-600">
                <p>
                  <span className="font-medium text-slate-900">AI Assist</span> is included with your plan — smart
                  suggestions, inbox help, and modes your tier allows.
                </p>
                <p className="mt-1.5">
                  <span className="font-medium text-violet-900">AI Brain</span> is the premium intelligence layer — full
                  business context for your inbox and automations.
                </p>
              </div>
              {showTrialFullSuite && (
                <p className="text-sm text-violet-700/90">
                  Trial includes AI Assist Basic, Pro workflow access, and AI Brain. Subscribe before it ends to keep them.
                </p>
              )}
              {effectiveHasAIBrain && !showTrialFullSuite && (
                <p className="text-sm text-emerald-800/90">AI Brain is active — your intelligence layer is unlocked below.</p>
              )}
            </div>
          </div>
          {effectiveHasAIBrain && saveKnowledgeMutation.isPending && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-100/90 bg-white/90 px-3 py-1 text-xs font-medium text-violet-800 shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" aria-hidden />
              Saving…
            </span>
          )}
        </header>

        <Card className="overflow-hidden rounded-2xl border-0 bg-white/95 shadow-md shadow-slate-900/[0.04] ring-1 ring-violet-100/40 ring-offset-0">
          <div className="h-0.5 bg-gradient-to-r from-violet-400/50 via-brand-green/40 to-emerald-400/40" aria-hidden />
          <CardHeader className="pb-2 pt-5 space-y-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <CardTitle className="text-lg font-semibold text-slate-900 tracking-tight">AI Assist</CardTitle>
              <span className="rounded-full border border-violet-100 bg-violet-50/90 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-800">
                {assistTier}
              </span>
            </div>
            <CardDescription className="text-slate-500 text-sm">
              {limits?.planName ?? "Your plan"} · included with your subscription
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-6 pt-0">
            <ul className="text-sm text-slate-600 space-y-2">
              {assistBullets.map((line) => (
                <li key={line} className="flex gap-2.5">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400/80" aria-hidden />
                  <span>{line}</span>
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
                <CardTitle className="text-lg font-semibold tracking-tight text-violet-950">AI Brain</CardTitle>
              </div>
              <CardDescription className="text-base leading-relaxed text-slate-600">
                The premium intelligence layer for your inbox and automations — memory, scoring, Copilot depth, and
                workflow context built around your business.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 pb-6">
              <ul className="grid gap-x-6 gap-y-2.5 text-sm text-slate-700 sm:grid-cols-2">
                {AI_BRAIN_HIGHLIGHTS.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <span className="mt-0.5 font-medium text-violet-500 select-none" aria-hidden>
                      ✦
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {hidePaidBrainCta ? (
                <p className="text-sm font-medium text-violet-800">Included in your trial — no separate checkout.</p>
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
                      onClick={handleAddonCheckout}
                      disabled={isCheckingOut}
                      data-testid="button-ai-brain-primary-cta"
                    >
                      {isCheckingOut ? "Processing…" : isShopify ? "Approve in Shopify" : "Unlock AI Brain"}
                    </Button>
                    <p className="text-xs text-slate-500">
                      {isShopify
                        ? "You will approve the AI Brain add-on in your Shopify admin."
                        : "From $29/mo · cancel anytime from billing"}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Section 1: AI behavior — primary control surface */}
        <Card className="overflow-hidden rounded-2xl border-0 bg-white/95 shadow-md shadow-slate-900/[0.04] ring-1 ring-violet-100/35">
          <div className="h-0.5 bg-gradient-to-r from-violet-300/40 via-brand-green/35 to-emerald-400/35" aria-hidden />
          <CardHeader className="pb-4 space-y-1 pt-5">
            <CardTitle className="text-lg font-semibold text-slate-900 tracking-tight">AI behavior</CardTitle>
            <CardDescription className="text-slate-500">Mode and tone for replies</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col gap-8 sm:flex-row sm:gap-0">
              <div className="flex-1 space-y-2.5 min-w-0">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Mode</Label>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="AI mode">
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
                            ? "Auto mode requires Pro workflow access. Upgrade or complete your trial on Pro."
                            : mode.tooltip
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
                        {mode.label}
                      </button>
                    );
                  })}
                </div>
                {starterOnly && (
                  <p className="text-xs text-slate-500">
                    <span className="font-medium text-slate-700">Auto</span> is part of Pro workflow access. On AI Assist
                    Basic, use <span className="font-medium text-slate-700">Suggest</span> to review every send.
                  </p>
                )}
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

        {effectiveHasAIBrain && (
          <>
            {/* Section 2: Business profile */}
            <Card className="rounded-2xl border-0 bg-white/95 shadow-md shadow-slate-900/[0.03] ring-1 ring-violet-100/50">
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

            <Card className="rounded-2xl border-0 bg-white/95 shadow-md shadow-slate-900/[0.03] ring-1 ring-violet-100/50">
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-100/90 bg-violet-50/80 text-violet-700">
                    <Globe className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="text-base font-semibold text-slate-900">Website Knowledge</CardTitle>
                    <CardDescription className="text-slate-600">
                      Add the most important pages from your website so AI can learn your products, services, FAQs, and policies.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {WK_FIELD_ROWS.map((row) => (
                    <div key={row.key} className="space-y-1.5">
                      <Label htmlFor={`wk-${row.key}`} className="text-xs font-medium text-muted-foreground">
                        {row.label}
                      </Label>
                      <Input
                        id={`wk-${row.key}`}
                        className="h-9 text-sm"
                        value={wkUrls[row.key]}
                        onChange={(e) =>
                          setWkUrls((prev) => ({ ...prev, [row.key]: e.target.value }))
                        }
                        placeholder={row.placeholder}
                        disabled={wkPhase === "scanning"}
                        data-testid={row.testId ?? `input-website-knowledge-${row.key}`}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="h-9 border-violet-200/80 bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-500 hover:to-purple-500"
                    disabled={wkPhase === "scanning" || !hasAnyWkUrl || websiteScanMutation.isPending}
                    onClick={() => websiteScanMutation.mutate(wkUrls)}
                    data-testid="button-website-knowledge-scan"
                  >
                    {wkPhase === "scanning" || websiteScanMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Scanning…
                      </>
                    ) : (
                      "Scan knowledge pages"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 border-violet-200/80 text-violet-900 hover:bg-violet-50"
                    disabled={wkPhase === "scanning" || !hasAnyWkUrl || websiteScanMutation.isPending}
                    onClick={() => {
                      setWkErr("");
                      websiteScanMutation.mutate(wkUrls);
                    }}
                    data-testid="button-website-knowledge-rescan"
                  >
                    Rescan knowledge pages
                  </Button>
                </div>

                <div className="rounded-lg border border-slate-200/70 bg-slate-50/40 px-3 py-2 text-sm" role="status">
                  {wkPhase === "scanning" && (
                    <p className="flex items-center gap-2 text-slate-700">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-500" aria-hidden />
                      Fetching your pages and building a combined preview…
                    </p>
                  )}
                  {wkPhase === "scanned" && (
                    <p className="font-medium text-emerald-800">Success — review the summary below, then save to AI Brain.</p>
                  )}
                  {wkPhase === "failed" && (
                    <p className="text-destructive">
                      <span className="font-medium">Failed.</span> {wkErr || "Scan could not complete."}
                    </p>
                  )}
                  {wkPhase === "idle" && websiteKnowledgeSaved && (
                    <p className="text-emerald-800/95">
                      <span className="font-medium">Saved</span> — this knowledge is used in Copilot and auto replies.
                    </p>
                  )}
                  {wkPhase === "idle" && !websiteKnowledgeSaved && (
                    <p className="text-slate-600">
                      Paste the public https URLs you want to include, then scan. Empty rows are skipped.
                    </p>
                  )}
                </div>

                {wkPageResults && wkPageResults.length > 0 && (wkPhase === "scanned" || wkPhase === "failed") && (
                  <div className="overflow-hidden rounded-lg border border-slate-200/80 bg-white">
                    <p className="border-b border-slate-100 bg-slate-50/80 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Page status
                    </p>
                    <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto text-xs">
                      {wkPageResults.map((row) => (
                        <li key={row.key} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                          <div className="min-w-0 shrink-0 font-medium text-slate-800">{row.label}</div>
                          <div className="min-w-0 flex-1 font-mono text-[11px] text-slate-600">
                            {row.url ? <span className="break-all">{row.url}</span> : <span className="text-slate-400">—</span>}
                          </div>
                          <div className="flex shrink-0 flex-col items-start gap-0.5 sm:items-end sm:text-right">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                row.status === "scanned" && "bg-emerald-100 text-emerald-900",
                                row.status === "skipped" && "bg-slate-100 text-slate-700",
                                row.status === "failed" && "bg-red-100 text-red-900",
                              )}
                            >
                              {row.status}
                              {row.status === "scanned" && row.truncated ? " · truncated" : ""}
                            </span>
                            {row.reason ? (
                              <span className="max-w-[220px] text-[10px] leading-snug text-slate-500">{row.reason}</span>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="wk-preview" className="text-xs font-medium text-muted-foreground">
                    Preview (edit before saving)
                  </Label>
                  <Textarea
                    id="wk-preview"
                    className="min-h-[140px] max-h-[320px] resize-y text-sm"
                    value={wkPreview}
                    onChange={(e) => setWkPreview(e.target.value)}
                    disabled={wkPhase === "scanning"}
                    placeholder="After a successful scan, a concise summary built from your pages appears here."
                    data-testid="textarea-website-knowledge-preview"
                  />
                </div>

                {wkSources.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Sources scanned</p>
                    <ul className="max-h-24 space-y-0.5 overflow-y-auto text-xs text-violet-900/80">
                      {wkSources.map((u) => (
                        <li key={u} className="truncate font-mono">
                          {u}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {websiteKnowledgeLastScannedLabel && wkPhase === "idle" && websiteKnowledgeSaved && (
                  <p className="text-xs text-muted-foreground">
                    Last updated: <span className="font-medium text-slate-700">{websiteKnowledgeLastScannedLabel}</span>
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="h-9 border-violet-200/80 bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-500 hover:to-purple-500 disabled:opacity-50"
                    disabled={
                      !wkScanId ||
                      wkPhase !== "scanned" ||
                      websiteSaveMutation.isPending ||
                      !wkPreview.trim()
                    }
                    onClick={() => {
                      if (!wkScanId) return;
                      websiteSaveMutation.mutate({ scanId: wkScanId, summary: wkPreview });
                    }}
                    data-testid="button-website-knowledge-save"
                  >
                    {websiteSaveMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      "Save to AI Brain"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 border-violet-200/80 text-violet-900 hover:bg-violet-50"
                    disabled={
                      !websiteKnowledgeSaved ||
                      !wkPreview.trim() ||
                      !!wkScanId ||
                      wkPhase !== "idle" ||
                      websiteEditMutation.isPending
                    }
                    onClick={() => websiteEditMutation.mutate(wkPreview.trim())}
                    data-testid="button-website-knowledge-save-edits"
                  >
                    {websiteEditMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      "Save text changes"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 border-slate-200 text-slate-700 hover:bg-slate-50"
                    disabled={
                      !websiteKnowledgeSaved ||
                      websiteDeleteMutation.isPending ||
                      !!wkScanId ||
                      wkPhase !== "idle"
                    }
                    onClick={() => websiteDeleteMutation.mutate()}
                    data-testid="button-website-knowledge-delete"
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Section 3: Lead understanding */}
            <Card className="rounded-2xl border-0 bg-white/95 shadow-md shadow-slate-900/[0.03] ring-1 ring-violet-100/50">
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
                    className="h-8 shrink-0 border-violet-200/80 bg-white/90 text-xs text-violet-900 hover:bg-violet-50 hover:text-violet-950"
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
                      className="h-8 gap-1.5 border-violet-200/80 bg-gradient-to-r from-white to-violet-50/40 font-medium text-violet-900 shadow-sm hover:border-violet-300/80 hover:from-violet-50/50 hover:to-violet-50/70 disabled:opacity-50"
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

            {/* Section 4: Booking — Calendly via Integrations only */}
            <Card className="rounded-2xl border-0 bg-white/95 shadow-md shadow-slate-900/[0.03] ring-1 ring-violet-100/50">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="text-base font-semibold text-slate-900">Booking &amp; next steps</CardTitle>
                    <CardDescription className="text-slate-600">
                      Used when AI suggests scheduling or follow-ups.
                    </CardDescription>
                  </div>
                  <div className="shrink-0 sm:pt-0.5">
                    {knowledge.calendlyBookingConnected ? (
                      <Badge className="border border-emerald-200/90 bg-emerald-50 text-emerald-900 text-xs font-medium gap-1 pr-2">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        Connected
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="border border-amber-200/90 bg-amber-50/90 text-amber-950 text-xs font-medium"
                      >
                        Not connected
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed text-slate-700">
                  Connect Calendly in Integrations so AI can send your booking link and sync confirmed meetings
                  automatically.
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
                    {knowledge.calendlyBookingConnected ? "Manage integration" : "Connect Calendly"}
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
              <CardTitle className="text-base font-semibold text-slate-900">Human handoff phrases</CardTitle>
              <CardDescription className="text-slate-600">
                Part of AI Brain—when a message matches these phrases, AI pauses so your team can take over.
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
                  className="h-9 shrink-0 border-violet-200/80 text-violet-900 hover:bg-violet-50"
                  onClick={handleAddKeyword}
                  data-testid="add-handoff-keyword"
                >
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-600">AI Brain</p>
              <h2 className="text-lg font-semibold tracking-tight text-violet-950">Unlock the intelligence layer</h2>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-700">
                Premium context on top of AI Assist — scoring, Copilot, automations, and handoffs. Your drafts stay saved
                when you upgrade.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <LockedFeatureTeaser
                title="Business knowledge"
                description="A living profile of what you sell, how you sound, and what customers should always hear — so replies stay unmistakably yours."
                preview="Services · tone · FAQs · policies"
              />
              <LockedFeatureTeaser
                title="Qualifying questions"
                description="Structured discovery that captures intent, urgency, and fit before your team invests time."
                preview="Budget · timeline · use case"
              />
              <LockedFeatureTeaser
                title="Lead scoring"
                description="Signals from the conversation roll up into clearer priority so you focus on the right leads first."
                preview="Hot / warm / nurture signals"
              />
              <LockedFeatureTeaser
                title="Copilot recommendations"
                description="Richer next-reply and next-step ideas grounded in your business profile, not generic templates."
                preview="Thread-aware suggestions"
              />
              <LockedFeatureTeaser
                title="Automation intelligence"
                description="Connects chat context to workflows — smarter nudges when a sequence or playbook should kick in."
                preview="Workflow-aware hints"
              />
              <LockedFeatureTeaser
                title="Handoff rules"
                description="Phrase-based guardrails that pause AI when a human should take over — calm, explicit control."
                preview="“Agent” · “call me” · custom phrases"
              />
              <LockedFeatureTeaser
                title="Growth Engine intelligence"
                description="Where your plan supports it, unlocks deeper industry playbooks and accelerators built on the same memory layer."
                preview="Industry-ready depth (plan-dependent)"
              />
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
