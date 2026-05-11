import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useAuth } from "@/lib/auth-context";

function RealtorMark() {
  return (
    <span className="inline">Realtor<span style={{ fontSize: '0.35em', verticalAlign: 'super', lineHeight: 0, position: 'relative', top: '-0.15em' }}>&reg;</span></span>
  );
}
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@/lib/subscription-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { 
  FileText, RefreshCw, Lock, Zap, Send, Clock, CheckCircle2, XCircle, Eye,
  AlertCircle, Image, LayoutGrid,
  Users, Target, Sparkles, Rocket, Crown, Bot, MessageSquare, CalendarCheck, ArrowRight,
  Search, MessageCircle, Facebook, Instagram,
  Pencil, Pause, Play, Copy, Trash2, MoreVertical,
} from "lucide-react";
import {
  WhatsAppTemplateRichPreview,
  TemplateShapeIndicator,
} from "@/components/WhatsAppTemplateRichPreview";
import { TemplateSendMediaControls } from "@/components/TemplateSendMediaControls";
import { TemplateSendCarouselMediaControls } from "@/components/TemplateSendCarouselMediaControls";
import { SavedPresetCampaignModals } from "@/components/SavedPresetCampaignModals";
import { LocalizedTemplateSelector } from "@/components/LocalizedTemplateSelector";
import {
  collectRequiredLibraryTemplatePlaceholders,
  friendlyDocumentFilenameForTemplateSend,
  getCarouselImageHeaderCardIndices,
  getInboxTemplateSendBlockReason,
  getLibraryTemplateSendStructureBlockReason,
  isLibraryPlainTextOnlyTemplate,
  isLibraryRichTemplateWithNoTextVariables,
  normalizeTemplateVariableMap,
  resolveLibraryHeaderMediaDisplayUrl,
  substituteTemplateVariablesForDisplay,
  carouselDefaultMediaUrlsForLivePreview,
  carouselDefaultMediaToSendDialogState,
  type CarouselCardRuntimeMedia,
  type TemplateCarouselDefaultMediaMap,
} from "@shared/metaTemplateSend";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow, format } from "date-fns";
import { isResendCoolingDown } from "@shared/reEngagement";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MessageTemplate {
  id: string;
  twilioSid: string;
  name: string;
  language: string;
  category: string;
  status: string;
  templateType: string;
  bodyText: string | null;
  headerType: string | null;
  headerContent: string | null;
  /** Meta HEADER format — mirrors headerType for synced templates. */
  headerFormat?: string | null;
  /** Approval sample URL only; runtime sends may use different media. */
  approvedSampleMediaUrl?: string | null;
  approvedSampleMediaType?: string | null;
  mediaRuntimeRequired?: boolean | null;
  footerText: string | null;
  buttons: any[];
  carouselCards: any[];
  variables: string[];
  lastSyncedAt: string;
  createdAt: string;
  /** Persisted last-used carousel card media (https URLs) for previews + send prefill. */
  carouselDefaultMedia?: TemplateCarouselDefaultMediaMap | null;
}

interface RetargetableChat {
  id: string;
  conversationId: string;
  contactId: string;
  name: string;
  avatar: string | null;
  displayHandle: string;
  whatsappPhone: string;
  channel: string;
  windowExpiresAt: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  daysSinceLastMessage: number;
  reEngagementState: string;
  lastTemplateSentAt: string | null;
  lastTemplateName: string | null;
  lastTemplateStatus: string | null;
  replyWindowReopenedAt: string | null;
}

function libraryCarouselDefaultPreviewUrls(template: MessageTemplate): Record<number, string> | undefined {
  return carouselDefaultMediaUrlsForLivePreview(template.carouselDefaultMedia ?? undefined);
}

function templateHasCarouselDefaultPreviews(template: MessageTemplate): boolean {
  const u = libraryCarouselDefaultPreviewUrls(template);
  return !!u && Object.keys(u).length > 0;
}

const RE_ENGAGEMENT_CHANNEL_BADGE: Record<
  string,
  { icon: typeof MessageCircle; label: string; className: string }
> = {
  whatsapp: {
    icon: MessageCircle,
    label: "WhatsApp",
    className: "border-emerald-200/90 bg-emerald-50/80 text-emerald-900",
  },
  facebook: {
    icon: Facebook,
    label: "Messenger",
    className: "border-blue-200/90 bg-blue-50/80 text-blue-900",
  },
  instagram: {
    icon: Instagram,
    label: "Instagram",
    className: "border-pink-200/90 bg-pink-50/80 text-pink-900",
  },
};

function ReEngagementStatusChip({ chat }: { chat: RetargetableChat }) {
  const ch = (chat.channel || "").toLowerCase();
  if (ch === "facebook" || ch === "instagram") {
    return (
      <Badge
        variant="secondary"
        className="text-[10px] font-normal shrink-0 border-gray-200 bg-slate-50 text-slate-700"
      >
        Inbox
      </Badge>
    );
  }
  if (chat.reEngagementState === "failed" || chat.lastTemplateStatus === "failed") {
    return (
      <Badge variant="destructive" className="text-[10px] font-normal shrink-0">
        Template failed
      </Badge>
    );
  }
  if (chat.reEngagementState === "template_sent_awaiting_reply" && chat.lastTemplateStatus === "sent") {
    return (
      <Badge
        variant="secondary"
        className="text-[10px] font-normal shrink-0 border-amber-200/90 bg-amber-50/90 text-amber-950"
      >
        Awaiting reply
      </Badge>
    );
  }
  if (chat.reEngagementState === "blocked") {
    return (
      <Badge variant="secondary" className="text-[10px] font-normal shrink-0">
        Blocked
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] font-normal shrink-0 text-gray-600 border-gray-200">
      Outside window
    </Badge>
  );
}

interface Chat {
  id: string;
  name: string;
  avatar: string;
  whatsappPhone: string | null;
  lastMessage: string;
}

type CampaignExecutionStats = {
  enrollmentCount: number;
  activeEnrollments: number;
  completedEnrollments: number;
  sentStepEvents: number;
  failedStepEvents: number;
};

type PresetCampaignListItem = {
  id: string;
  name: string;
  sourcePresetId: string;
  status: string;
  statusLabel: string;
  channel: string;
  messages: unknown[];
  updatedAt: string;
  createdAt?: string;
  executionStats?: CampaignExecutionStats;
};

type PresetCampaignDetail = PresetCampaignListItem & {
  language?: string | null;
  category?: string | null;
  industry?: string | null;
  delays?: unknown[];
  placeholders?: unknown[];
  placeholderDefaults?: Record<string, unknown> | null;
  aiEnabled?: boolean | null;
  audienceConfig?: Record<string, unknown> | null;
  totalSteps?: number;
  executionStats?: CampaignExecutionStats;
  enrollments?: Array<{
    id: string;
    status: string;
    currentStepIndex: number;
    nextRunAt?: string | null;
    contactId: string;
    contactName?: string;
    createdAt?: string | null;
    totalSteps?: number;
  }>;
  recentStepEvents?: Array<{
    id: string;
    stepIndex: number;
    status: string;
    sentAt?: string | null;
    errorMessage?: string | null;
    createdAt?: string | null;
    contactId: string;
  }>;
};

type VariableAutofillSuggestion = {
  name: string;
  phone: string;
  email: string;
  stage: string;
  tag: string;
  tags: string[];
  customFields: Record<string, string>;
};

type VariableAutofillResponse = {
  contactId: string | null;
  suggestions: VariableAutofillSuggestion | null;
};

/** Tokens still showing as literal `{{n}}` after substitution — preview still unresolved. */
function remainingPlaceholderTokens(text: string): string[] {
  const m = text.match(/\{\{\d+\}\}/g);
  return m ? Array.from(new Set(m)) : [];
}

const CATEGORY_BADGE_CLASS: Record<string, string> = {
  marketing: "bg-gray-50 text-gray-700 border-gray-200",
  utility: "bg-gray-50 text-gray-700 border-gray-200",
  authentication: "bg-amber-50/80 text-amber-900 border-amber-100",
};

function formatCategoryBadgeLabel(category: string): string {
  const c = (category || "").toLowerCase();
  if (c === "marketing") return "Marketing";
  if (c === "utility") return "Utility";
  if (c === "authentication") return "Authentication";
  return (category || "Unknown").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatLanguageCode(lang: string): string {
  return (lang || "").replace(/-/g, "_").toUpperCase() || "—";
}

function isApprovedTemplateStatus(status: string | null | undefined): boolean {
  return (status || "").toLowerCase().trim() === "approved";
}

function libraryQuickSendMeta(template: MessageTemplate) {
  return getInboxTemplateSendBlockReason({
    name: template.name,
    bodyText: template.bodyText,
    headerType: template.headerType,
    headerContent: template.headerContent,
    buttons: template.buttons,
    templateType: template.templateType,
    carouselCards: template.carouselCards,
    category: template.category,
  });
}

/** WhatsApp media headers (image | video | document) support per-send runtime upload unless explicitly disabled. */
function templateHasDynamicMediaHeader(template: MessageTemplate): boolean {
  if (template.mediaRuntimeRequired === false) return false;
  const ht = (template.headerType || "").toLowerCase();
  return ["image", "video", "document"].includes(ht);
}

const ADVANCED_QUICK_SEND_NOTE =
  "This template includes media, buttons, or a carousel. It can't be sent from Inbox quick-send or campaign shortcuts — use Continue to send and fill any required variables.";

/** Media / rich template chip — calm indigo tint (not warning orange). */
const MEDIA_TEMPLATE_KIND_BADGE_CLASS =
  "text-[9px] leading-tight px-1.5 py-0.5 font-normal border border-indigo-100/90 bg-indigo-50/45 text-indigo-900/65 shadow-none";

const QUICK_SEND_READY_BADGE_CLASS =
  "text-[10px] font-normal border border-emerald-100/35 bg-emerald-50/25 text-emerald-900/65 shadow-none";

const STATUS_ICONS: Record<string, any> = {
  approved: { icon: CheckCircle2, color: "text-green-500" },
  pending: { icon: Clock, color: "text-amber-500" },
  rejected: { icon: XCircle, color: "text-red-500" },
};

function GrowthEnginesTab() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const features = [
    { icon: MessageSquare, text: t("templates.growthEngines.feature1") },
    { icon: Bot, text: t("templates.growthEngines.feature2") },
    { icon: Clock, text: t("templates.growthEngines.feature3") },
    { icon: Target, text: t("templates.growthEngines.feature4") },
    { icon: CalendarCheck, text: t("templates.growthEngines.feature5") },
  ];

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="space-y-0.5">
        <h2 className="text-base md:text-lg font-semibold text-gray-900">Growth Engines</h2>
        <p className="text-sm text-gray-500">
          Install full industry playbooks powered by templates, automations, and AI.
        </p>
      </div>

      <Card className="overflow-hidden border-purple-200/50 shadow-sm" data-testid="card-realtor-growth-engine">
        <div className="flex flex-col lg:flex-row">
          <div className="flex-1 p-5 lg:p-6 min-w-0">
            <div className="flex items-start justify-between mb-3 gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-gradient-to-r from-violet-600 to-purple-600 text-white border-0 text-[10px] px-2 py-0">Premium</Badge>
                </div>
                <h3 className="text-lg font-bold text-gray-900" data-testid="text-engine-title"><RealtorMark /> Growth Engine</h3>
              </div>
              <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-lg bg-purple-50 shrink-0">
                <Rocket className="h-5 w-5 text-purple-600" />
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              Convert more WhatsApp inquiries into qualified buyers & booked showings — automatically.
            </p>

            <div className="space-y-2 mb-2">
              {features.map((f, i) => (
                <div key={i} className="flex items-center gap-2.5 text-sm text-gray-700">
                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-purple-50 shrink-0">
                    <f.icon className="h-3 w-3 text-purple-600" />
                  </div>
                  <span>{f.text}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mb-4">Includes onboarding + live setup call + system configuration</p>

            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white w-full sm:w-auto"
              onClick={() => setLocation("/app/templates/realtor-growth-engine")}
              data-testid="button-view-activate-engine"
            >
              View & Activate
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <div className="lg:w-56 border-t lg:border-t-0 lg:border-l border-gray-100 bg-gray-50/50 p-5 lg:p-6 flex flex-col justify-center">
            <div className="text-center lg:text-left">
              <div className="flex items-baseline gap-1 justify-center lg:justify-start">
                <span className="text-2xl font-bold text-gray-900">$199</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">one-time template license</p>

              <div className="mt-4 pt-3 border-t border-gray-200">
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span>Requires Pro + AI plan</span>
                </div>
              </div>

              <p className="text-[10px] text-gray-400 mt-3 leading-snug">
                WhatsApp conversation fees billed separately by Meta
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function Templates() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedChat, setSelectedChat] = useState<Chat | RetargetableChat | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [libraryModalTemplate, setLibraryModalTemplate] = useState<MessageTemplate | null>(null);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  /** Where the send dialog was opened from — Campaign vs Library contact picker (sync with mutate). */
  const templateSendOriginRef = useRef<"library" | "campaign">("library");
  /** After opening send dialog, apply last-used header media once defaults load. */
  const pendingTemplatePrefillRef = useRef(false);
  /** User changed media in the dialog — do not apply stale defaults over their choice. */
  const suppressTemplatePrefillRef = useRef(false);
  const [sendInlineError, setSendInlineError] = useState<string | null>(null);
  /** When synced header media is empty (no {{n}}), sent as direct https link — upload / chat picker. */
  const [optionalHeaderMediaUrl, setOptionalHeaderMediaUrl] = useState<string | null>(null);
  /** Passed to Meta document header `filename` when user uploads a file. */
  const [optionalHeaderDocumentFilename, setOptionalHeaderDocumentFilename] = useState<string | null>(null);
  const [optionalHeaderMediaMeta, setOptionalHeaderMediaMeta] = useState<{
    mimeType: string | null;
    sizeBytes: number;
  } | null>(null);
  const [carouselCardMediaByIndex, setCarouselCardMediaByIndex] = useState<
    Record<number, { url: string; originalFilename?: string | null }>
  >({});
  /** Send-modal preview: show “saved defaults” hint after prefill from `carouselDefaultMedia`. */
  const [carouselSavedDefaultsHint, setCarouselSavedDefaultsHint] = useState(false);
  const [headerMediaBroken, setHeaderMediaBroken] = useState(false);

  const [savedCampaignModalId, setSavedCampaignModalId] = useState<string | null>(null);
  const [savedCampaignModalOpen, setSavedCampaignModalOpen] = useState(false);
  const [savedCampaignOpenInEditMode, setSavedCampaignOpenInEditMode] = useState(false);
  const [pendingDeleteCampaignId, setPendingDeleteCampaignId] = useState<string | null>(null);

  const templatesEnabled = (subscription?.limits as any)?.templatesEnabled;

  /** Re-render relative “Sent Xm ago” labels in Re-engagement. */
  const [, setReEngagementClock] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setReEngagementClock((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!templatesEnabled || !user) return;
    let ws: WebSocket | null = null;
    let destroyed = false;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/presence`);
    ws.onopen = () => {
      if (!ws || destroyed) return;
      ws.send(JSON.stringify({ type: "auth", userId: user.id, userName: user.name || "Agent" }));
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "new_message" && msg.replyWindowReopened) {
          queryClient.invalidateQueries({ queryKey: ["/api/templates/retargetable-chats"] });
        }
      } catch {
        /* ignore */
      }
    };
    ws.onerror = () => {
      ws?.close();
    };
    return () => {
      destroyed = true;
      ws?.close();
    };
  }, [templatesEnabled, user, queryClient]);

  const { data: templatesApiData, isLoading: templatesLoading } = useQuery<MessageTemplate[]>({
    queryKey: ["/api/templates"],
    enabled: !!templatesEnabled,
  });

  /** Defensive: never treat non-array JSON as iterable (avoids empty UI + runtime errors). */
  const templates = useMemo(
    () => (Array.isArray(templatesApiData) ? templatesApiData : []),
    [templatesApiData]
  );

  /** WhatsApp Library tab: synced rows from GET /api/templates (exclude malformed + hard-rejected only). */
  const whatsappLibraryTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (!t || typeof t !== "object" || typeof t.id !== "string") return false;
      const st = (t.status || "").toLowerCase().trim();
      if (st === "rejected") return false;
      return true;
    });
  }, [templates]);

  useEffect(() => {
    if (!templatesEnabled) return;
    const approved = templates.filter((t) => (t.status || "").toLowerCase().trim() === "approved");
    console.log(
      `[TEMPLATE_LIBRARY_FILTER] ${JSON.stringify({
        queryReturnedArray: Array.isArray(templatesApiData),
        apiRowCount: templates.length,
        libraryTabRowCount: whatsappLibraryTemplates.length,
        approvedNormalizedCount: approved.length,
      })}`
    );
  }, [templates, templatesApiData, templatesEnabled, whatsappLibraryTemplates.length]);

  const { data: savedPresetCampaigns = [], isLoading: savedCampaignsLoading } = useQuery<
    PresetCampaignListItem[]
  >({
    queryKey: ["/api/preset-campaigns"],
    enabled: !!templatesEnabled,
  });

  const { data: savedCampaignDetail, isLoading: savedCampaignDetailLoading } = useQuery<PresetCampaignDetail>({
    queryKey: ["/api/preset-campaigns", savedCampaignModalId],
    queryFn: async () => {
      const res = await fetch(`/api/preset-campaigns/${savedCampaignModalId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load campaign");
      return res.json();
    },
    enabled: !!templatesEnabled && !!savedCampaignModalId && savedCampaignModalOpen,
  });

  const patchPresetCampaignMutation = useMutation({
    mutationFn: async (vars: { id: string; body: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/preset-campaigns/${vars.id}`, vars.body);
      return res.json() as Promise<{ message?: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/preset-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/preset-campaigns", savedCampaignModalId] });
      toast({
        title: "Saved",
        description: data?.message ?? "Campaign updated.",
      });
    },
    onError: (e: Error) => {
      toast({
        title: "Update failed",
        description: e.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  const deletePresetCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/preset-campaigns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preset-campaigns"] });
      setSavedCampaignModalOpen(false);
      setSavedCampaignModalId(null);
      setPendingDeleteCampaignId(null);
      toast({ title: "Campaign deleted" });
    },
    onError: (e: Error) => {
      toast({
        title: "Delete failed",
        description: e.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  const enrollmentActionMutation = useMutation({
    mutationFn: async (vars: {
      enrollmentId: string;
      action: "pause" | "resume" | "cancel" | "retry";
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/campaign-enrollments/${vars.enrollmentId}/${vars.action}`,
        {}
      );
      return res.json() as Promise<{ enrollment?: unknown }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preset-campaigns", savedCampaignModalId] });
      queryClient.invalidateQueries({ queryKey: ["/api/preset-campaigns"] });
      toast({ title: "Enrollment updated" });
    },
    onError: (e: Error) => {
      toast({
        title: "Action failed",
        description: e.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  const duplicatePresetCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/preset-campaigns/${id}/duplicate`);
      return res.json() as Promise<{ message?: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/preset-campaigns"] });
      toast({
        title: "Campaign duplicated",
        description: data?.message ?? "Draft copy created. No sends ran.",
      });
    },
    onError: (e: Error) => {
      toast({
        title: "Duplicate failed",
        description: e.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  const openSavedCampaignModal = (id: string, edit = false) => {
    setSavedCampaignModalId(id);
    setSavedCampaignOpenInEditMode(edit);
    setSavedCampaignModalOpen(true);
  };

  const { data: retargetableChats = [], isLoading: chatsLoading } = useQuery<RetargetableChat[]>({
    queryKey: ["/api/templates/retargetable-chats"],
    enabled: !!templatesEnabled,
  });

  const { data: allChats = [] } = useQuery<Chat[]>({
    queryKey: ["/api/chats"],
    enabled: !!templatesEnabled,
  });

  const templateAuxRecipientKey =
    selectedChat && "contactId" in selectedChat && selectedChat.contactId
      ? `contact:${selectedChat.contactId}`
      : selectedChat?.id
        ? `chat:${selectedChat.id}`
        : undefined;

  const { data: variableAutofill } = useQuery<VariableAutofillResponse>({
    queryKey: ["/api/templates/variable-autofill", templateAuxRecipientKey],
    enabled: !!templatesEnabled && sendDialogOpen && !!templateAuxRecipientKey,
    queryFn: async () => {
      const q =
        selectedChat && "contactId" in selectedChat && selectedChat.contactId
          ? `contactId=${encodeURIComponent(selectedChat.contactId)}`
          : `chatId=${encodeURIComponent(selectedChat!.id)}`;
      const res = await fetch(`/api/templates/variable-autofill?${q}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load suggestions");
      return res.json();
    },
  });

  const { data: templateSendDefaults, isLoading: templateSendDefaultsLoading } = useQuery<{
    optionalHeaderMediaUrl: string | null;
  }>({
    queryKey: [
      "/api/templates/template-send-defaults",
      templateAuxRecipientKey,
      selectedTemplate?.id,
    ],
    enabled:
      !!templatesEnabled &&
      sendDialogOpen &&
      !!templateAuxRecipientKey &&
      !!selectedTemplate?.id,
    queryFn: async () => {
      const base =
        selectedChat && "contactId" in selectedChat && selectedChat.contactId
          ? `contactId=${encodeURIComponent(selectedChat.contactId)}`
          : `chatId=${encodeURIComponent(selectedChat!.id)}`;
      const res = await fetch(
        `/api/templates/template-send-defaults?${base}&templateId=${encodeURIComponent(selectedTemplate!.id)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load template defaults");
      return res.json();
    },
  });

  useEffect(() => {
    if (!sendDialogOpen || !pendingTemplatePrefillRef.current) return;
    if (templateSendDefaultsLoading) return;
    if (suppressTemplatePrefillRef.current) {
      pendingTemplatePrefillRef.current = false;
      return;
    }
    pendingTemplatePrefillRef.current = false;
    const url = templateSendDefaults?.optionalHeaderMediaUrl;
    if (typeof url === "string" && /^https?:\/\//i.test(url.trim())) {
      setOptionalHeaderMediaUrl(url.trim());
    }
  }, [
    sendDialogOpen,
    templateSendDefaultsLoading,
    templateSendDefaults?.optionalHeaderMediaUrl,
  ]);

  const requiredPlaceholders = useMemo(() => {
    if (!selectedTemplate) return [] as string[];
    return collectRequiredLibraryTemplatePlaceholders(selectedTemplate);
  }, [selectedTemplate]);

  const carouselImageCardIndices = useMemo(() => {
    if (!selectedTemplate) return [] as number[];
    return getCarouselImageHeaderCardIndices(selectedTemplate);
  }, [selectedTemplate]);

  const carouselCardMediaForSend = useMemo((): CarouselCardRuntimeMedia[] => {
    return carouselImageCardIndices
      .map((i) => {
        const m = carouselCardMediaByIndex[i];
        const u = m?.url?.trim() ?? "";
        if (!u || !/^https?:\/\//i.test(u)) return null;
        return {
          cardIndex: i,
          mediaUrl: u,
          originalFilename: m?.originalFilename ?? null,
        };
      })
      .filter(Boolean) as CarouselCardRuntimeMedia[];
  }, [carouselImageCardIndices, carouselCardMediaByIndex]);

  const normalizedVariableValues = useMemo(
    () => normalizeTemplateVariableMap(variableValues),
    [variableValues]
  );

  const missingPlaceholders = useMemo(() => {
    return requiredPlaceholders.filter((ph) => !String(normalizedVariableValues[ph] ?? "").trim());
  }, [requiredPlaceholders, normalizedVariableValues]);

  const resolvedBodyPreview = selectedTemplate
    ? substituteTemplateVariablesForDisplay(selectedTemplate.bodyText, variableValues)
    : "";

  const resolvedHeaderPreview =
    selectedTemplate &&
    (selectedTemplate.headerType || "").toLowerCase() === "text" &&
    (selectedTemplate.headerContent || "").trim()
      ? substituteTemplateVariablesForDisplay(selectedTemplate.headerContent, variableValues)
      : "";

  const previewUnresolvedTokens = useMemo(() => {
    if (!selectedTemplate) return [] as string[];
    const out = new Set<string>();
    if ((selectedTemplate.headerType || "").toLowerCase() === "text") {
      remainingPlaceholderTokens(
        substituteTemplateVariablesForDisplay(selectedTemplate.headerContent, variableValues)
      ).forEach((t) => out.add(t));
    }
    remainingPlaceholderTokens(
      substituteTemplateVariablesForDisplay(selectedTemplate.bodyText, variableValues)
    ).forEach((t) => out.add(t));
    return Array.from(out).sort(
      (a, b) =>
        (parseInt(a.replace(/\D/g, ""), 10) || 0) - (parseInt(b.replace(/\D/g, ""), 10) || 0)
    );
  }, [selectedTemplate, variableValues]);

  const sendStructureBlockReason = useMemo(() => {
    if (!selectedTemplate) return null as string | null;
    const ht = (selectedTemplate.headerType || "").toLowerCase();
    return getLibraryTemplateSendStructureBlockReason(
      selectedTemplate,
      variableValues,
      missingPlaceholders,
      optionalHeaderMediaUrl,
      {
        headerDocumentFilename: ht === "document" ? optionalHeaderDocumentFilename : undefined,
        carouselCardMedia: carouselCardMediaForSend,
      }
    );
  }, [
    selectedTemplate,
    variableValues,
    missingPlaceholders,
    optionalHeaderMediaUrl,
    optionalHeaderDocumentFilename,
    carouselCardMediaForSend,
  ]);

  const resolvedHeaderMediaForPreview = useMemo(() => {
    if (!selectedTemplate) return null as string | null;
    return resolveLibraryHeaderMediaDisplayUrl(selectedTemplate, variableValues, optionalHeaderMediaUrl);
  }, [selectedTemplate, variableValues, optionalHeaderMediaUrl]);

  useEffect(() => {
    setHeaderMediaBroken(false);
  }, [resolvedHeaderMediaForPreview]);

  const templateLivePreview = useMemo(() => {
    if (!selectedTemplate) return undefined;
    const ht = (selectedTemplate.headerType || "").toLowerCase();
    const carouselUrls: Record<number, string> = {};
    for (const [k, v] of Object.entries(carouselCardMediaByIndex)) {
      const idx = Number(k);
      const u = v.url.trim();
      if (!Number.isFinite(idx) || idx < 0 || !/^https?:\/\//i.test(u)) continue;
      carouselUrls[idx] = u;
    }
    const headerDocumentDisplayName =
      ht === "document" && resolvedHeaderMediaForPreview
        ? friendlyDocumentFilenameForTemplateSend({
            headerDocumentFilename: optionalHeaderDocumentFilename,
            mediaUrl: resolvedHeaderMediaForPreview,
            templateName: selectedTemplate.name,
          })
        : undefined;
    return {
      bodyText: resolvedBodyPreview || undefined,
      headerTextResolved: ht === "text" ? resolvedHeaderPreview || undefined : undefined,
      headerMediaUrl: resolvedHeaderMediaForPreview ?? undefined,
      headerDocumentDisplayName,
      carouselCardMediaUrls: Object.keys(carouselUrls).length > 0 ? carouselUrls : undefined,
    };
  }, [
    selectedTemplate,
    resolvedBodyPreview,
    resolvedHeaderPreview,
    resolvedHeaderMediaForPreview,
    optionalHeaderDocumentFilename,
    carouselCardMediaByIndex,
  ]);

  const syncTemplatesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/templates/sync");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      const count = (data?.inserted ?? 0) + (data?.updated ?? 0);
      const skipped = Number(data?.skipped ?? 0);
      const skipLog = Array.isArray(data?.skipLog) ? data.skipLog : [];
      const firstSkip =
        skipLog[0] &&
        typeof skipLog[0].templateName === "string" &&
        typeof skipLog[0].skipReason === "string"
          ? `${skipLog[0].templateName}: ${skipLog[0].skipReason}`
          : null;
      const baseDesc = data?.message || `${count} template(s) synced successfully.`;
      toast({
        title: "Templates synced",
        description:
          skipped > 0 && firstSkip
            ? `${baseDesc} First skip — ${firstSkip.slice(0, 220)}${firstSkip.length > 220 ? "…" : ""}`
            : baseDesc,
        ...(skipped > 0 && count === 0 ? { variant: "destructive" as const } : {}),
      });
    },
    onError: (error: any) => {
      const msg = error?.message || "";
      const clean = msg.replace(/^\d+:\s*/, "").replace(/^\{"error":"/, "").replace(/"\}$/, "");
      toast({
        title: "Sync failed",
        description: clean || "Failed to sync templates. Check your WhatsApp connection in Settings.",
        variant: "destructive",
      });
    },
  });

  const sendTemplateMutation = useMutation({
    mutationFn: async (data: {
      templateId: string;
      chatId?: string;
      contactId?: string;
      variables: Record<string, string>;
      sendSource: "templates_library" | "templates_campaign";
      optionalHeaderMediaUrl?: string | null;
      optionalHeaderMediaFilename?: string | null;
      optionalHeaderMediaMimeType?: string | null;
      optionalHeaderMediaSizeBytes?: number | null;
      carouselCardMedia?: CarouselCardRuntimeMedia[];
    }) => {
      const trimmedOpt = data.optionalHeaderMediaUrl?.trim();
      const trimmedFn = data.optionalHeaderMediaFilename?.trim();
      const mime = data.optionalHeaderMediaMimeType?.trim();
      const sizeB = data.optionalHeaderMediaSizeBytes;
      const payload = {
        templateId: data.templateId,
        variables: data.variables,
        sendSource: data.sendSource,
        ...(data.contactId
          ? { contactId: data.contactId }
          : { chatId: data.chatId as string }),
        ...(trimmedOpt ? { optionalHeaderMediaUrl: trimmedOpt } : {}),
        ...(trimmedFn ? { optionalHeaderMediaFilename: trimmedFn } : {}),
        ...(mime ? { optionalHeaderMediaMimeType: mime } : {}),
        ...(typeof sizeB === "number" && Number.isFinite(sizeB) ? { optionalHeaderMediaSizeBytes: sizeB } : {}),
        ...(data.carouselCardMedia && data.carouselCardMedia.length > 0
          ? { carouselCardMedia: data.carouselCardMedia }
          : {}),
      };
      console.log(
        `[TEMPLATE_SEND_REQUEST] ${JSON.stringify({
          endpoint: "POST /api/templates/send",
          source: data.sendSource,
          templateId: data.templateId,
          chatId: data.chatId ?? null,
          contactId: data.contactId ?? null,
          carouselCardCount: data.carouselCardMedia?.length ?? 0,
          carouselCardMediaUrls: (data.carouselCardMedia ?? []).map((c) => c.mediaUrl),
          variables: data.variables,
          optionalHeaderMediaUrl: trimmedOpt ?? null,
        })}`
      );
      const res = await apiRequest("POST", "/api/templates/send", payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates/retargetable-chats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/templates/recent-media"] });
      queryClient.invalidateQueries({ queryKey: ["/api/templates/template-send-defaults"] });
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setSendInlineError(null);
      setSendDialogOpen(false);
      setSelectedTemplate(null);
      setSelectedChat(null);
      setVariableValues({});
      setOptionalHeaderMediaUrl(null);
      setOptionalHeaderDocumentFilename(null);
      setOptionalHeaderMediaMeta(null);
      setCarouselCardMediaByIndex({});
      setCarouselSavedDefaultsHint(false);
      toast({
        title: "Template sent",
        description: data?.message || "Template message sent successfully.",
      });
    },
    onError: (error: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/templates/retargetable-chats"] });
      const msg = String(error?.message || "");
      const afterStatus = msg.replace(/^\d+:\s*/, "");
      let clean = afterStatus;
      try {
        const parsed = JSON.parse(afterStatus) as { error?: string };
        if (typeof parsed?.error === "string" && parsed.error.trim()) {
          clean = parsed.error.trim();
        }
      } catch {
        clean = afterStatus.replace(/^\{"error":"/, "").replace(/"\}$/, "");
      }
      if (/^\s*\{/.test(clean)) {
        try {
          const parsed2 = JSON.parse(clean) as { error?: string };
          if (typeof parsed2?.error === "string" && parsed2.error.trim()) {
            clean = parsed2.error.trim();
          }
        } catch {
          /* keep clean */
        }
      }
      setSendInlineError(clean || "Could not send this template.");
    },
  });

  const handleSendTemplate = (
    template: MessageTemplate,
    chat: Chat | RetargetableChat,
    origin: "library" | "campaign" = "library"
  ) => {
    templateSendOriginRef.current = origin;
    console.log(`[UseTemplate] Template selected: ${template.name} (id=${template.id}, status=${template.status})`);
    console.log(`[UseTemplate] Contact selected: ${chat.name} (id=${chat.id}, phone=${chat.whatsappPhone})`);
    setSelectedTemplate(template);
    setSelectedChat(chat);
    setVariableValues({});
    setOptionalHeaderMediaUrl(null);
    setOptionalHeaderDocumentFilename(null);
    setOptionalHeaderMediaMeta(null);
    const carouselPrefill = carouselDefaultMediaToSendDialogState(template.carouselDefaultMedia ?? undefined);
    setCarouselCardMediaByIndex(carouselPrefill);
    setCarouselSavedDefaultsHint(Object.keys(carouselPrefill).length > 0);
    setHeaderMediaBroken(false);
    suppressTemplatePrefillRef.current = false;
    pendingTemplatePrefillRef.current = true;
    setSendInlineError(null);
    setContactPickerOpen(false);
    setSendDialogOpen(true);
    console.log(`[UseTemplate] Send dialog opened — variables required: ${template.variables?.length ?? 0}`);
  };

  const handleUseTemplate = (template: MessageTemplate) => {
    console.log(`[UseTemplate] Button clicked for template: ${template.name}`);
    setSelectedTemplate(template);
    templateSendOriginRef.current = "library";
    setContactSearch("");
    setContactPickerOpen(true);
  };

  const openPreviewDetails = (template: MessageTemplate) => {
    setLibraryModalTemplate(template);
    setLibraryModalOpen(true);
  };

  const continuePreviewToSend = () => {
    if (!libraryModalTemplate || !isApprovedTemplateStatus(libraryModalTemplate.status)) return;
    templateSendOriginRef.current = "library";
    setLibraryModalOpen(false);
    setSelectedTemplate(libraryModalTemplate);
    setContactSearch("");
    setContactPickerOpen(true);
  };

  const getTemplateIcon = (type: string) => {
    switch (type) {
      case "carousel": return LayoutGrid;
      case "media": return Image;
      default: return FileText;
    }
  };

  if (subLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!templatesEnabled) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <Lock className="h-8 w-8 text-gray-400" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Template Messaging is a Pro Feature</h2>
        <p className="text-gray-500 max-w-md mb-6">
          Send pre-approved WhatsApp templates to re-engage customers after the 24-hour window. 
          Perfect for follow-ups, promotions, and smart retargeting campaigns.
        </p>
        <Link href="/pricing">
          <Button className="bg-brand-green hover:bg-brand-green/90" data-testid="button-upgrade-templates">
            <Zap className="h-4 w-4 mr-2" />
            Upgrade to Pro
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full bg-white flex flex-col overflow-hidden">
      <div className="px-4 md:px-6 py-2 md:py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between gap-3 max-w-5xl mx-auto">
          <div className="min-w-0 space-y-0.5">
            <h1 className="text-lg md:text-2xl font-bold text-gray-900 leading-tight">Message Templates</h1>
            <p className="text-gray-500 text-xs md:text-sm leading-snug">
              Manage WhatsApp-approved templates, campaigns, and automation sequences.
            </p>
          </div>
          <Button 
            variant="outline"
            size="sm"
            onClick={() => syncTemplatesMutation.mutate()}
            disabled={syncTemplatesMutation.isPending}
            data-testid="button-sync-templates"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncTemplatesMutation.isPending ? 'animate-spin' : ''}`} />
            Sync Templates
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-2 md:py-3 pb-24 md:pb-6 overscroll-y-contain">
        <div className="max-w-5xl mx-auto">
          <Tabs defaultValue="presets" className="space-y-2 md:space-y-4">
          <TabsList className="grid w-full grid-cols-4 h-auto gap-0.5 p-0.5 sticky top-0 z-10 bg-muted/95 backdrop-blur-sm rounded-lg border border-gray-100/80 shadow-sm">
            <TabsTrigger value="presets" data-testid="tab-presets" className="text-[11px] sm:text-sm py-1.5 px-1 sm:px-2 md:px-3 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 rounded-md leading-tight">
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 sm:mr-0" />
              <span>Presets</span>
            </TabsTrigger>
            <TabsTrigger value="templates" data-testid="tab-templates" className="text-[11px] sm:text-sm py-1.5 px-1 sm:px-2 md:px-3 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 rounded-md leading-tight">
              <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 sm:mr-0" />
              <span className="text-center whitespace-normal break-words px-0.5">
                <span className="hidden min-[420px]:inline">WhatsApp Library ({whatsappLibraryTemplates.length})</span>
                <span className="min-[420px]:hidden">WA Lib. ({whatsappLibraryTemplates.length})</span>
              </span>
            </TabsTrigger>
            <TabsTrigger value="re-engagement" data-testid="tab-re-engagement" className="text-[11px] sm:text-sm py-1.5 px-1 sm:px-2 md:px-3 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 rounded-md leading-tight">
              <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 sm:mr-0" />
              <span>Re-engagement ({retargetableChats.length})</span>
            </TabsTrigger>
            <TabsTrigger value="growth-engines" data-testid="tab-growth-engines" className="text-[11px] sm:text-sm py-1.5 px-1 sm:px-2 md:px-3 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 rounded-md leading-tight relative">
              <Rocket className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 sm:mr-0" />
              <span className="text-center leading-tight">
                <span className="hidden sm:inline">Growth Engines</span>
                <span className="sm:hidden">Growth</span>
              </span>
              <Badge variant="secondary" className="absolute -top-0.5 -right-0.5 text-[9px] px-1 py-0 h-4 bg-purple-100 text-purple-700 border-0 hidden sm:flex">NEW</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="presets" className="space-y-3 md:space-y-4 mt-0">
            <Card className="overflow-hidden">
              <CardHeader className="pb-2 pt-4 md:pt-6 px-4 md:px-6">
                <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                  <Sparkles className="h-5 w-5 text-purple-500 shrink-0" />
                  Preset Automation Templates
                </CardTitle>
                <CardDescription className="text-sm">
                  Start with ready-made WhatsApp sequences in English, Spanish, and Hebrew.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3 md:px-6">
                <LocalizedTemplateSelector 
                  showPreviewOnly={false}
                  onSelectTemplate={(template, values) => {
                    console.log("Selected template:", template, values);
                  }}
                />
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-gray-200/90">
              <CardHeader className="pb-2 pt-4 px-4 md:px-6">
                <CardTitle className="text-base md:text-lg">Saved Campaigns</CardTitle>
                <CardDescription className="text-sm">
                  Saved presets become campaigns here. Manually enroll contacts from the inbox; the scheduler sends steps on each delay. Audience auto-triggers are not enabled yet.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3 md:px-6 pb-4">
                {savedCampaignsLoading ? (
                  <div className="flex justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : savedPresetCampaigns.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center">
                    No saved campaigns yet. Open a preset, customize placeholders, then click Create Campaign.
                  </p>
                ) : (
                  <div className="overflow-x-auto overflow-y-visible rounded-lg border border-gray-100 touch-pan-y">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Campaign</TableHead>
                          <TableHead className="hidden sm:table-cell">Source preset</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="hidden md:table-cell">Channel</TableHead>
                          <TableHead className="text-right">Steps</TableHead>
                          <TableHead className="text-right hidden sm:table-cell tabular-nums">Enrolled</TableHead>
                          <TableHead className="text-right hidden md:table-cell tabular-nums">Sent</TableHead>
                          <TableHead className="text-right hidden md:table-cell tabular-nums">Failed</TableHead>
                          <TableHead className="hidden lg:table-cell">Updated</TableHead>
                          <TableHead className="text-right w-[100px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {savedPresetCampaigns.map((row) => {
                          const steps = Array.isArray(row.messages) ? row.messages.length : 0;
                          const ex = row.executionStats;
                          const updated =
                            row.updatedAt &&
                            !Number.isNaN(new Date(row.updatedAt).getTime())
                              ? format(new Date(row.updatedAt), "MMM d, yyyy p")
                              : "—";
                          return (
                            <TableRow
                              key={row.id}
                              data-testid={`saved-campaign-${row.id}`}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => openSavedCampaignModal(row.id)}
                            >
                              <TableCell className="font-medium text-gray-900 max-w-[140px] truncate">
                                {row.name}
                              </TableCell>
                              <TableCell className="hidden sm:table-cell font-mono text-xs text-gray-600">
                                {row.sourcePresetId.length > 14
                                  ? `${row.sourcePresetId.slice(0, 14)}…`
                                  : row.sourcePresetId}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[11px] font-normal whitespace-normal max-w-[200px] text-left h-auto py-1">
                                  {row.statusLabel || row.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden md:table-cell capitalize text-gray-700">
                                {row.channel}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{steps}</TableCell>
                              <TableCell className="text-right hidden sm:table-cell tabular-nums text-gray-700">
                                {ex?.enrollmentCount ?? 0}
                              </TableCell>
                              <TableCell className="text-right hidden md:table-cell tabular-nums text-gray-700">
                                {ex?.sentStepEvents ?? 0}
                              </TableCell>
                              <TableCell className="text-right hidden md:table-cell tabular-nums text-gray-700">
                                {ex?.failedStepEvents ?? 0}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell text-gray-500 text-sm whitespace-nowrap">
                                {updated}
                              </TableCell>
                              <TableCell
                                className="text-right p-1"
                                onClick={(e: MouseEvent<HTMLTableCellElement>) => e.stopPropagation()}
                              >
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0"
                                      aria-label="Campaign actions"
                                      data-testid={`saved-campaign-actions-${row.id}`}
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem
                                      onClick={() => openSavedCampaignModal(row.id)}
                                      className="cursor-pointer"
                                    >
                                      <Eye className="h-4 w-4 mr-2 shrink-0" />
                                      View
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => openSavedCampaignModal(row.id, true)}
                                      className="cursor-pointer"
                                    >
                                      <Pencil className="h-4 w-4 mr-2 shrink-0" />
                                      Edit
                                    </DropdownMenuItem>
                                    {(row.status === "active_pending" || row.status === "active") && (
                                      <DropdownMenuItem
                                        className="cursor-pointer"
                                        onClick={() =>
                                          patchPresetCampaignMutation.mutate({
                                            id: row.id,
                                            body: { action: "pause" },
                                          })
                                        }
                                      >
                                        <Pause className="h-4 w-4 mr-2 shrink-0" />
                                        Pause
                                      </DropdownMenuItem>
                                    )}
                                    {row.status === "paused" && (
                                      <DropdownMenuItem
                                        className="cursor-pointer"
                                        onClick={() =>
                                          patchPresetCampaignMutation.mutate({
                                            id: row.id,
                                            body: { action: "resume" },
                                          })
                                        }
                                      >
                                        <Play className="h-4 w-4 mr-2 shrink-0" />
                                        Resume
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="cursor-pointer"
                                      onClick={() => duplicatePresetCampaignMutation.mutate(row.id)}
                                    >
                                      <Copy className="h-4 w-4 mr-2 shrink-0" />
                                      Duplicate
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="cursor-pointer text-red-600 focus:text-red-600"
                                      onClick={() => setPendingDeleteCampaignId(row.id)}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2 shrink-0" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <SavedPresetCampaignModals
              savedCampaignModalOpen={savedCampaignModalOpen}
              setSavedCampaignModalOpen={setSavedCampaignModalOpen}
              savedCampaignModalId={savedCampaignModalId}
              setSavedCampaignModalId={setSavedCampaignModalId}
              savedCampaignOpenInEditMode={savedCampaignOpenInEditMode}
              onConsumedOpenInEditMode={() => setSavedCampaignOpenInEditMode(false)}
              savedCampaignDetail={savedCampaignDetail}
              savedCampaignDetailLoading={savedCampaignDetailLoading}
              pendingDeleteCampaignId={pendingDeleteCampaignId}
              setPendingDeleteCampaignId={setPendingDeleteCampaignId}
              patchPresetCampaignMutation={patchPresetCampaignMutation}
              duplicatePresetCampaignMutation={duplicatePresetCampaignMutation}
              deletePresetCampaignMutation={deletePresetCampaignMutation}
              enrollmentMutation={enrollmentActionMutation}
            />
          </TabsContent>

          <TabsContent value="templates" className="space-y-3 md:space-y-4 mt-0">
            <div className="space-y-0.5 px-0.5">
              <h2 className="text-base md:text-lg font-semibold text-gray-900">WhatsApp Approved Library</h2>
              <p className="text-sm text-gray-500">
                Templates synced from Meta WhatsApp Manager and ready for compliant sending.
              </p>
            </div>

            {templatesLoading ? (
              <div className="flex items-center justify-center py-10 md:py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : whatsappLibraryTemplates.length === 0 ? (
              <Card className="overflow-hidden">
                <CardContent className="py-10 md:py-12 text-center px-4">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <h3 className="font-semibold text-gray-900 mb-2">No Templates Found</h3>
                  <p className="text-gray-500 text-sm mb-4 max-w-md mx-auto">
                    Sync your approved templates from your WhatsApp provider to start sending messages.
                  </p>
                  <Button 
                    onClick={() => syncTemplatesMutation.mutate()}
                    disabled={syncTemplatesMutation.isPending}
                    className="bg-brand-green hover:bg-brand-green/90"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncTemplatesMutation.isPending ? 'animate-spin' : ''}`} />
                    Sync Templates
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 md:gap-4 md:grid-cols-2">
                {whatsappLibraryTemplates.map((template) => {
                  const StatusIcon = STATUS_ICONS[template.status]?.icon || AlertCircle;
                  const statusColor = STATUS_ICONS[template.status]?.color || "text-gray-500";
                  const TypeIcon = getTemplateIcon(template.templateType);
                  const qs = libraryQuickSendMeta(template);
                  const syncMeta = template.twilioSid?.startsWith("meta_");
                  const approved = isApprovedTemplateStatus(template.status);
                  const catClass =
                    CATEGORY_BADGE_CLASS[(template.category || "").toLowerCase()] ||
                    "bg-gray-50 text-gray-700 border-gray-200";

                  return (
                    <Card key={template.id} className="overflow-visible border-gray-200/80 shadow-sm min-w-0" data-testid={`template-card-${template.id}`}>
                      <CardHeader className="pb-2 pt-4 px-4 space-y-3">
                        <div className="flex items-start justify-between gap-3 min-w-0">
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                              <TypeIcon className="h-4 w-4 text-gray-600" />
                            </div>
                            <CardTitle className="text-base leading-snug break-words pt-0.5">{template.name}</CardTitle>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
                            {approved ? (
                              <>
                                <CheckCircle2 className="h-3 w-3 shrink-0 text-slate-500" aria-hidden />
                                <span className="text-[10px] font-normal tracking-tight text-gray-600 whitespace-nowrap">
                                  Approved
                                </span>
                              </>
                            ) : (
                              <>
                                <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${statusColor}`} aria-hidden />
                                <span className={`text-[10px] capitalize whitespace-nowrap ${statusColor}`}>
                                  {template.status}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline" className="text-[10px] font-normal border-gray-200 bg-white text-gray-600">
                            {syncMeta ? "Synced from Meta" : "Synced from Twilio"}
                          </Badge>
                          <Badge variant="outline" className={`text-[10px] font-medium border ${catClass}`}>
                            {formatCategoryBadgeLabel(template.category)}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] font-mono font-normal border-gray-200 bg-gray-50 text-gray-700">
                            {formatLanguageCode(template.language)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={qs.blocked ? MEDIA_TEMPLATE_KIND_BADGE_CLASS : QUICK_SEND_READY_BADGE_CLASS}
                          >
                            {qs.blocked ? "Media template" : "Quick-send ready"}
                          </Badge>
                          {(template.variables?.length ?? 0) > 0 ? (
                            <Badge variant="outline" className="text-[10px] font-normal border-gray-200 bg-white text-gray-700">
                              Variables required
                            </Badge>
                          ) : null}
                          {templateHasDynamicMediaHeader(template) ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-normal border-sky-200/90 bg-sky-50/90 text-sky-950"
                              title="You can upload or pick different media for each send."
                            >
                              Dynamic media
                            </Badge>
                          ) : null}
                          <TemplateShapeIndicator template={template} />
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 pt-0">
                        {qs.blocked ? (
                          <div className="mb-3 min-w-0 overflow-visible pr-0.5">
                            <WhatsAppTemplateRichPreview
                              key={template.id}
                              template={template}
                              density="compact"
                              variant="libraryCard"
                              livePreview={{
                                carouselCardMediaUrls: libraryCarouselDefaultPreviewUrls(template),
                              }}
                              savedCarouselDefaultsHint={templateHasCarouselDefaultPreviews(template)}
                            />
                          </div>
                        ) : (
                          <div className="bg-gray-50 rounded-lg p-3 mb-3">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-6 break-words">
                              {template.bodyText || "No body text"}
                            </p>
                          </div>
                        )}
                        {template.variables && template.variables.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3 min-w-0">
                            {template.variables.map((v: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-[10px] max-w-full truncate">
                                {`{{${v}}}`}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full sm:flex-1 border-gray-200"
                            onClick={() => openPreviewDetails(template)}
                            data-testid={`button-preview-details-${template.id}`}
                          >
                            <Eye className="h-3.5 w-3.5 mr-2 shrink-0" />
                            Preview Details
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="w-full sm:flex-1 bg-brand-green hover:bg-brand-green/90 text-white font-medium shadow-sm"
                            disabled={!isApprovedTemplateStatus(template.status)}
                            onClick={() => handleUseTemplate(template)}
                            data-testid={`button-use-template-${template.id}`}
                          >
                            <Send className="h-3 w-3 mr-2 shrink-0" />
                            Use Template
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            <Card className="border-gray-200 bg-gray-50/80 shadow-none">
              <CardContent className="py-3 md:py-4 px-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-gray-500 shrink-0 mt-0.5" />
                  <div className="text-sm text-gray-700">
                    <p className="font-medium mb-1 text-gray-900">About WhatsApp Templates</p>
                    <p className="leading-relaxed">
                      Templates must be created and approved in your WhatsApp Business (Meta) or Twilio console before they appear here.
                      Use &quot;Sync Templates&quot; to fetch your latest approved templates from your active provider.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="re-engagement" className="space-y-3 md:space-y-4 mt-0">
            <div className="space-y-0.5 px-0.5">
              <h2 className="text-base md:text-lg font-semibold text-gray-900">Re-engagement</h2>
              <p className="text-sm text-gray-500">
                Follow up when Meta&apos;s messaging window has closed — track template outreach and avoid duplicate sends.
              </p>
            </div>
            <Card className="overflow-hidden border-gray-200/80">
              <CardHeader className="pb-2 px-3 pt-3 md:pb-2 md:px-4 md:pt-3.5">
                <CardTitle className="text-base md:text-lg flex items-center gap-2">
                  <Target className="h-5 w-5 text-brand-green shrink-0" />
                  Outside the reply window
                </CardTitle>
                <CardDescription className="text-sm leading-snug">
                  WhatsApp: send an approved template to reopen the thread when allowed. Messenger &amp; Instagram don&apos;t use WhatsApp templates — continue in Inbox. Meta may still block sends outside policy.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3 pb-3 md:px-4 md:pb-4">
                {chatsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : retargetableChats.length === 0 ? (
                  <div className="text-center py-7 text-gray-500">
                    <Users className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium text-gray-800">No conversations outside the reply window</p>
                    <p className="text-sm mt-1 max-w-md mx-auto">
                      Contacts that require approved templates or re-engagement actions will appear here.
                    </p>
                  </div>
                ) : (
                  <TooltipProvider delayDuration={200}>
                  <div className="space-y-2 max-h-[min(420px,55vh)] md:max-h-[480px] overflow-y-auto pr-1 md:pr-2 overscroll-contain" style={{ scrollbarWidth: 'thin' }}>
                    {retargetableChats.map((chat) => {
                      const ch = (chat.channel || "").toLowerCase();
                      const badge = RE_ENGAGEMENT_CHANNEL_BADGE[ch] ?? RE_ENGAGEMENT_CHANNEL_BADGE.whatsapp;
                      const BadgeIcon = badge.icon;
                      const isWhatsApp = ch === "whatsapp";
                      const lastAtLabel = chat.lastMessageAt
                        ? formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: true })
                        : null;

                      const awaitingReply =
                        isWhatsApp &&
                        chat.reEngagementState === "template_sent_awaiting_reply" &&
                        chat.lastTemplateStatus === "sent";

                      const failedWa =
                        isWhatsApp &&
                        (chat.reEngagementState === "failed" || chat.lastTemplateStatus === "failed");

                      const lastMatchedTemplate =
                        chat.lastTemplateName != null && chat.lastTemplateName !== ""
                          ? templates.find((t) => t.name === chat.lastTemplateName)
                          : undefined;

                      const resendCooldown = isResendCoolingDown(chat.lastTemplateSentAt);

                      const approvedQuickTemplates = templates.filter(
                        (t) => isApprovedTemplateStatus(t.status) && !libraryQuickSendMeta(t).blocked
                      );

                      const templateSelect = (
                        triggerClass: string,
                        placeholder: string,
                        testId: string
                      ) => (
                        <Select
                          onValueChange={(templateId) => {
                            const template = templates.find((t) => t.id === templateId);
                            if (template && !libraryQuickSendMeta(template).blocked) {
                              handleSendTemplate(template, chat, "campaign");
                            }
                          }}
                        >
                          <SelectTrigger
                            className={triggerClass}
                            data-testid={testId}
                          >
                            <SelectValue placeholder={placeholder} />
                          </SelectTrigger>
                          <SelectContent
                            position="popper"
                            side="bottom"
                            align="end"
                            className="z-[100] w-[240px] max-h-[300px] overflow-y-auto bg-white border border-gray-200 shadow-lg"
                          >
                            {approvedQuickTemplates.length > 0 ? (
                              approvedQuickTemplates.map((template) => (
                                <SelectItem key={template.id} value={template.id} className="cursor-pointer hover:bg-gray-100">
                                  {template.name}
                                </SelectItem>
                              ))
                            ) : (
                              <div className="p-2 text-xs text-gray-500 text-center">
                                No quick-send templates available.
                                <br />
                                Sync approved body-only templates or use the library tab.
                              </div>
                            )}
                          </SelectContent>
                        </Select>
                      );

                      return (
                        <div
                          key={`${chat.conversationId}-${ch}`}
                          className="flex flex-col gap-2 p-2.5 border border-gray-200 rounded-lg hover:bg-gray-50/80 min-w-0"
                          data-testid={`re-engagement-row-${chat.conversationId}`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:justify-between min-w-0">
                            <div className="flex gap-2.5 min-w-0 flex-1">
                              <div
                                className="h-10 w-10 rounded-full bg-cover bg-center bg-gray-200 shrink-0"
                                style={{ backgroundImage: chat.avatar ? `url(${chat.avatar})` : undefined }}
                              >
                                {!chat.avatar && (
                                  <div className="h-full w-full flex items-center justify-center text-gray-500 font-medium text-sm">
                                    {chat.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <p className="font-semibold text-gray-900 truncate">{chat.name}</p>
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] font-normal shrink-0 gap-1 pl-1 pr-1.5 py-0 ${badge.className}`}
                                  >
                                    <BadgeIcon className="h-3 w-3" aria-hidden />
                                    {badge.label}
                                  </Badge>
                                  <ReEngagementStatusChip chat={chat} />
                                </div>
                                <p className="text-xs text-gray-500 truncate" title={chat.displayHandle}>
                                  {chat.displayHandle}
                                </p>
                                {isWhatsApp && awaitingReply && (
                                  <div className="text-xs text-gray-700 space-y-0.5 pt-0.5 border-l-2 border-amber-200/90 pl-2">
                                    <p className="font-medium text-gray-900">Template sent • awaiting reply</p>
                                    {chat.lastTemplateName ? (
                                      <p className="text-gray-600">
                                        Last template:{" "}
                                        <span className="font-mono text-[11px] text-gray-800">{chat.lastTemplateName}</span>
                                      </p>
                                    ) : null}
                                    {chat.lastTemplateSentAt ? (
                                      <p className="text-gray-500">
                                        Sent{" "}
                                        {formatDistanceToNow(new Date(chat.lastTemplateSentAt), {
                                          addSuffix: true,
                                        })}
                                      </p>
                                    ) : null}
                                  </div>
                                )}
                                {isWhatsApp && failedWa && (
                                  <p className="text-xs text-red-600 pt-0.5">
                                    Template failed — review the error in your provider logs, then retry.
                                  </p>
                                )}
                                {(ch === "facebook" || ch === "instagram") && (
                                  <p className="text-xs text-gray-600 pt-0.5">
                                    Continue conversation in Inbox — this channel doesn&apos;t use WhatsApp templates here.
                                  </p>
                                )}
                                {chat.lastMessagePreview ? (
                                  <p className="text-sm text-gray-600 line-clamp-2 break-words">
                                    {chat.lastMessagePreview}
                                  </p>
                                ) : (
                                  <p className="text-sm text-gray-400 italic">No message preview</p>
                                )}
                                <p className="text-[11px] text-gray-400">
                                  {lastAtLabel
                                    ? `Last activity ${lastAtLabel}`
                                    : `Last activity ~${chat.daysSinceLastMessage} day${chat.daysSinceLastMessage !== 1 ? "s" : ""} ago`}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0 w-full sm:w-auto sm:min-w-[200px] pt-0.5 sm:pt-0">
                              {isWhatsApp && awaitingReply ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="w-full sm:w-auto inline-flex sm:justify-end">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full sm:w-auto min-h-[40px] border-gray-300 text-gray-900 hover:bg-gray-50 disabled:opacity-55 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                        disabled={resendCooldown || !lastMatchedTemplate}
                                        data-testid={`resend-template-${chat.conversationId}`}
                                        onClick={() => {
                                          if (
                                            lastMatchedTemplate &&
                                            !libraryQuickSendMeta(lastMatchedTemplate).blocked
                                          ) {
                                            handleSendTemplate(lastMatchedTemplate, chat, "campaign");
                                          }
                                        }}
                                      >
                                        Resend template
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  {resendCooldown ? (
                                    <TooltipContent side="top">Recently sent</TooltipContent>
                                  ) : null}
                                </Tooltip>
                              ) : null}

                              {isWhatsApp && awaitingReply && !lastMatchedTemplate ? (
                                <p className="text-[11px] text-amber-800 text-right">
                                  Last template name not in library — pick a template below.
                                </p>
                              ) : null}

                              {isWhatsApp && awaitingReply && !lastMatchedTemplate
                                ? templateSelect(
                                    "w-full sm:w-[220px] min-h-[40px] shrink-0 border-gray-300",
                                    "Choose template",
                                    `select-template-fallback-${chat.id}`
                                  )
                                : null}

                              {isWhatsApp && failedWa
                                ? templateSelect(
                                    "w-full sm:w-[220px] min-h-[40px] shrink-0 border-amber-300 bg-amber-50/50",
                                    "Retry with template",
                                    `retry-template-${chat.id}`
                                  )
                                : null}

                              {isWhatsApp && !awaitingReply && !failedWa
                                ? templateSelect(
                                    "w-full sm:w-[220px] min-h-[40px] shrink-0 bg-brand-green hover:bg-brand-green/90 text-white font-medium border-0 shadow-sm data-[placeholder]:text-white/90 [&>svg]:text-white/90",
                                    "Send WhatsApp template",
                                    `select-template-${chat.id}`
                                  )
                                : null}

                              {ch === "facebook" ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full sm:w-auto min-h-[40px] border-blue-200 text-blue-900 hover:bg-blue-50"
                                  data-testid={`open-inbox-messenger-${chat.contactId}`}
                                  onClick={() =>
                                    setLocation(
                                      `/app/inbox/${chat.contactId}?channel=facebook&focusComposer=1`
                                    )
                                  }
                                >
                                  Continue conversation in Inbox
                                </Button>
                              ) : null}
                              {ch === "instagram" ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full sm:w-auto min-h-[40px] border-pink-200 text-pink-950 hover:bg-pink-50"
                                  data-testid={`open-inbox-instagram-${chat.contactId}`}
                                  onClick={() =>
                                    setLocation(
                                      `/app/inbox/${chat.contactId}?channel=instagram&focusComposer=1`
                                    )
                                  }
                                >
                                  Continue conversation in Inbox
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  </TooltipProvider>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="growth-engines" className="mt-0 space-y-2 md:space-y-4">
            <GrowthEnginesTab />
          </TabsContent>
        </Tabs>

        {/* Contact Picker Dialog */}
        <Dialog open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
          <DialogContent className="max-w-md" data-testid="dialog-contact-picker">
            <DialogHeader>
              <DialogTitle>Select a Contact</DialogTitle>
              <DialogDescription>
                Choose who to send <strong>{selectedTemplate?.name}</strong> to
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  className="pl-9"
                  placeholder="Search contacts..."
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  data-testid="input-contact-search"
                />
              </div>
              <div className="max-h-[340px] overflow-y-auto space-y-1 pr-1" style={{ scrollbarWidth: "thin" }}>
                {allChats
                  .filter(c => c.whatsappPhone && (
                    !contactSearch ||
                    c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
                    (c.whatsappPhone || "").includes(contactSearch)
                  ))
                  .map((chat) => (
                    <button
                      key={chat.id}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 text-left border border-transparent hover:border-gray-200 transition-colors"
                      onClick={() => selectedTemplate && handleSendTemplate(selectedTemplate, chat, "library")}
                      data-testid={`contact-picker-chat-${chat.id}`}
                    >
                      <div className="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center shrink-0 text-gray-600 font-medium text-sm">
                        {chat.avatar ? (
                          <img src={chat.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          chat.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{chat.name}</p>
                        <p className="text-xs text-gray-500 truncate">{chat.whatsappPhone}</p>
                      </div>
                    </button>
                  ))}
                {allChats.filter(c => c.whatsappPhone).length === 0 && (
                  <p className="text-center text-sm text-gray-500 py-6">No contacts with WhatsApp numbers found.</p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Send Template Dialog */}
        <Dialog
          open={sendDialogOpen}
          onOpenChange={(open) => {
            setSendDialogOpen(open);
            if (!open) {
              setSendInlineError(null);
              setOptionalHeaderMediaUrl(null);
              setOptionalHeaderDocumentFilename(null);
              setOptionalHeaderMediaMeta(null);
              setCarouselCardMediaByIndex({});
              setCarouselSavedDefaultsHint(false);
              setHeaderMediaBroken(false);
              suppressTemplatePrefillRef.current = false;
              pendingTemplatePrefillRef.current = false;
            }
          }}
        >
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            {selectedTemplate && selectedChat && (
              <>
                <DialogHeader>
                  <DialogTitle>Send Template to {selectedChat.name}</DialogTitle>
                  <DialogDescription>
                    This preview shows what your customer will receive on WhatsApp. Add what&apos;s missing, then send.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="min-w-0 rounded-lg border border-gray-100 bg-gray-50/50 p-3">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      What your customer will see
                    </p>
                    <WhatsAppTemplateRichPreview
                      key={selectedTemplate.id}
                      template={selectedTemplate}
                      density="comfortable"
                      livePreview={templateLivePreview}
                      onHeaderMediaError={() => setHeaderMediaBroken(true)}
                      savedCarouselDefaultsHint={carouselSavedDefaultsHint}
                    />
                    {previewUnresolvedTokens.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5 items-center border-t border-gray-100 pt-3">
                        <span className="text-[11px] text-gray-500">Still needs values:</span>
                        {previewUnresolvedTokens.map((t) => (
                          <Badge
                            key={t}
                            variant="outline"
                            className="text-[10px] font-mono text-amber-900 border-amber-200 bg-amber-50"
                          >
                            {t}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {templateAuxRecipientKey ? (
                    <TemplateSendMediaControls
                      template={selectedTemplate}
                      chatId={
                        selectedChat && !("contactId" in selectedChat && selectedChat.contactId)
                          ? selectedChat.id
                          : undefined
                      }
                      contactId={
                        selectedChat && "contactId" in selectedChat && selectedChat.contactId
                          ? selectedChat.contactId
                          : undefined
                      }
                      variableValues={variableValues}
                      onVariableValuesChange={setVariableValues}
                      optionalHeaderMediaUrl={optionalHeaderMediaUrl}
                      onOptionalHeaderMediaUrlChange={setOptionalHeaderMediaUrl}
                      approvedSampleMediaUrl={
                        selectedTemplate.approvedSampleMediaUrl ??
                        (selectedTemplate.mediaRuntimeRequired !== false &&
                        ["image", "video", "document"].includes(
                          (selectedTemplate.headerType || "").toLowerCase()
                        ) &&
                        /^https?:\/\//i.test(String(selectedTemplate.headerContent || "").trim())
                          ? String(selectedTemplate.headerContent).trim()
                          : null)
                      }
                      mediaRuntimeRequired={selectedTemplate.mediaRuntimeRequired ?? true}
                      onOptionalHeaderDocumentFilenameChange={setOptionalHeaderDocumentFilename}
                      onOptionalHeaderMediaMeta={setOptionalHeaderMediaMeta}
                      onUserAdjustedMedia={() => {
                        suppressTemplatePrefillRef.current = true;
                      }}
                    />
                  ) : null}

                  {selectedTemplate && carouselImageCardIndices.length > 0 ? (
                    <TemplateSendCarouselMediaControls
                      imageCardIndices={carouselImageCardIndices}
                      mediaByIndex={carouselCardMediaByIndex}
                      onMediaByIndexChange={(next) => {
                        setCarouselSavedDefaultsHint(false);
                        setCarouselCardMediaByIndex(next);
                      }}
                      savedDefaultsActive={carouselSavedDefaultsHint}
                    />
                  ) : null}

                  {requiredPlaceholders.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-0.5">
                        <Label>Variables</Label>
                        <p className="text-xs text-gray-500">
                          Required fields from your approved template (body, header, buttons, or carousel cards).
                        </p>
                      </div>
                      {requiredPlaceholders.map((ph) => {
                        const sug = variableAutofill?.suggestions;
                        const idSafe = ph.replace(/\W/g, "");
                        const customEntries = sug?.customFields ? Object.entries(sug.customFields) : [];
                        return (
                          <div key={ph} className="space-y-1.5 rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                            <Label htmlFor={`var-${idSafe}`} className="text-sm font-medium text-gray-800">
                              {ph}
                            </Label>
                            <Input
                              id={`var-${idSafe}`}
                              placeholder={`Value for ${ph}`}
                              value={variableValues[ph] ?? ""}
                              onChange={(e) =>
                                setVariableValues((prev) => ({ ...prev, [ph]: e.target.value }))
                              }
                              data-testid={`input-variable-${idSafe}`}
                            />
                            {sug ? (
                              <div className="flex flex-wrap gap-1 pt-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] text-gray-700"
                                  onClick={() =>
                                    setVariableValues((prev) => ({ ...prev, [ph]: sug.name }))
                                  }
                                >
                                  Name
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] text-gray-700"
                                  onClick={() =>
                                    setVariableValues((prev) => ({ ...prev, [ph]: sug.phone }))
                                  }
                                >
                                  Phone
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] text-gray-700"
                                  onClick={() =>
                                    setVariableValues((prev) => ({ ...prev, [ph]: sug.email }))
                                  }
                                >
                                  Email
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] text-gray-700"
                                  onClick={() =>
                                    setVariableValues((prev) => ({ ...prev, [ph]: sug.stage }))
                                  }
                                >
                                  Stage
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] text-gray-700"
                                  onClick={() =>
                                    setVariableValues((prev) => ({
                                      ...prev,
                                      [ph]: sug.tags?.length ? sug.tags.join(", ") : sug.tag,
                                    }))
                                  }
                                >
                                  Tags
                                </Button>
                                {customEntries.slice(0, 8).map(([key, val]) => (
                                  <Button
                                    key={`${ph}-${key}`}
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 max-w-[140px] truncate px-2 text-[11px] text-gray-700"
                                    title={`${key}: ${val}`}
                                    onClick={() =>
                                      setVariableValues((prev) => ({ ...prev, [ph]: val }))
                                    }
                                  >
                                    {key}
                                  </Button>
                                ))}
                              </div>
                            ) : variableAutofill?.contactId === null ? (
                              <p className="text-[11px] text-gray-400 pt-1">
                                No CRM contact linked to this chat — enter values manually.
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : selectedTemplate && isLibraryPlainTextOnlyTemplate(selectedTemplate) ? (
                    <p className="text-sm text-gray-600">
                      This template has no text variables to fill. You can send it as-is when you’re ready.
                    </p>
                  ) : selectedTemplate && isLibraryRichTemplateWithNoTextVariables(selectedTemplate) ? (
                    <p className="text-sm text-gray-600">
                      This template has no text variables. Review the approved layout and required media or button
                      details before sending.
                    </p>
                  ) : null}

                  {missingPlaceholders.length > 0 ? (
                    <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                      <AlertDescription className="text-sm">
                        Fill every required variable before sending:{" "}
                        <span className="font-mono">{missingPlaceholders.join(", ")}</span>
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {sendStructureBlockReason ? (
                    <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                      <AlertDescription className="text-sm">{sendStructureBlockReason}</AlertDescription>
                    </Alert>
                  ) : null}

                  {headerMediaBroken && resolvedHeaderMediaForPreview ? (
                    <Alert variant="destructive">
                      <AlertDescription className="text-sm">
                        This preview couldn&apos;t load your image or video. Try another file or link.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </div>
                {sendInlineError ? (
                  <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-950 [&>svg]:text-amber-700">
                    <AlertDescription className="text-sm leading-snug">{sendInlineError}</AlertDescription>
                  </Alert>
                ) : null}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
                  <Button 
                    onClick={() => {
                      const isRetarget =
                        "contactId" in selectedChat &&
                        !!selectedChat.contactId &&
                        templateSendOriginRef.current === "campaign";
                      sendTemplateMutation.mutate({
                        templateId: selectedTemplate.id,
                        ...(isRetarget
                          ? { contactId: selectedChat.contactId }
                          : { chatId: selectedChat.id }),
                        variables: variableValues,
                        sendSource:
                          templateSendOriginRef.current === "campaign"
                            ? "templates_campaign"
                            : "templates_library",
                        optionalHeaderMediaUrl,
                        optionalHeaderMediaFilename: optionalHeaderDocumentFilename,
                        optionalHeaderMediaMimeType: optionalHeaderMediaMeta?.mimeType ?? null,
                        optionalHeaderMediaSizeBytes: optionalHeaderMediaMeta?.sizeBytes ?? null,
                        carouselCardMedia: carouselCardMediaForSend,
                      });
                    }}
                    disabled={
                      sendTemplateMutation.isPending ||
                      missingPlaceholders.length > 0 ||
                      !!sendStructureBlockReason ||
                      headerMediaBroken
                    }
                    className="bg-brand-green hover:bg-brand-green/90"
                    data-testid="button-send-template"
                  >
                    {sendTemplateMutation.isPending ? "Sending..." : "Send Template"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Rich preview (all templates) */}
        <Dialog
          open={libraryModalOpen}
          onOpenChange={(open) => {
            setLibraryModalOpen(open);
            if (!open) setLibraryModalTemplate(null);
          }}
        >
          <DialogContent
            className="max-w-lg max-h-[92vh] overflow-y-auto gap-0 sm:max-w-lg"
            data-testid="dialog-library-template-preview"
          >
            {libraryModalTemplate ? (
              <>
                <DialogHeader className="pb-3">
                  <DialogTitle className="pr-8 text-left leading-snug">{libraryModalTemplate.name}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-wrap gap-1.5 pb-3">
                  {isApprovedTemplateStatus(libraryModalTemplate.status) ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-normal text-gray-600">
                      <CheckCircle2 className="h-3 w-3 shrink-0 text-slate-500" aria-hidden />
                      Approved
                    </span>
                  ) : (
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {libraryModalTemplate.status}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] font-normal border-gray-200 bg-white text-gray-600">
                    {libraryModalTemplate.twilioSid?.startsWith("meta_") ? "Synced from Meta" : "Synced from Twilio"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-medium border ${
                      CATEGORY_BADGE_CLASS[(libraryModalTemplate.category || "").toLowerCase()] ||
                      "bg-gray-50 text-gray-700 border-gray-200"
                    }`}
                  >
                    {formatCategoryBadgeLabel(libraryModalTemplate.category)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] font-mono font-normal border-gray-200 bg-gray-50 text-gray-700">
                    {formatLanguageCode(libraryModalTemplate.language)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      libraryQuickSendMeta(libraryModalTemplate).blocked
                        ? MEDIA_TEMPLATE_KIND_BADGE_CLASS
                        : QUICK_SEND_READY_BADGE_CLASS
                    }
                  >
                    {libraryQuickSendMeta(libraryModalTemplate).blocked ? "Media template" : "Quick-send ready"}
                  </Badge>
                  {templateHasDynamicMediaHeader(libraryModalTemplate) ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-normal border-sky-200/90 bg-sky-50/90 text-sky-950"
                    >
                      Dynamic media
                    </Badge>
                  ) : null}
                  <TemplateShapeIndicator template={libraryModalTemplate} />
                </div>
                <div className="min-w-0 pb-4">
                  <WhatsAppTemplateRichPreview
                    key={libraryModalTemplate.id}
                    template={libraryModalTemplate}
                    density="comfortable"
                    livePreview={{
                      carouselCardMediaUrls: libraryCarouselDefaultPreviewUrls(libraryModalTemplate),
                    }}
                    savedCarouselDefaultsHint={templateHasCarouselDefaultPreviews(libraryModalTemplate)}
                  />
                </div>
                {libraryQuickSendMeta(libraryModalTemplate).blocked ? (
                  <p className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs leading-relaxed text-gray-600">
                    {ADVANCED_QUICK_SEND_NOTE}
                  </p>
                ) : null}
                <DialogFooter className="gap-2 sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => setLibraryModalOpen(false)}>
                    Close
                  </Button>
                  {isApprovedTemplateStatus(libraryModalTemplate.status) ? (
                    <Button
                      type="button"
                      className="bg-brand-green hover:bg-brand-green/90 text-white"
                      onClick={continuePreviewToSend}
                      data-testid="button-continue-to-send"
                    >
                      Continue to send
                    </Button>
                  ) : null}
                </DialogFooter>
              </>
            ) : null}
          </DialogContent>
        </Dialog>
        </div>
      </div>
    </div>
  );
}
