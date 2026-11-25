import type { TFunction } from "i18next";
import { builderCatalogText, builderDuration } from "@/lib/builderPresentation";
import { useTranslation } from "react-i18next";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import {
  Zap, Plus, Trash2, Save, MessageSquare, GitBranch,
  Clock, Tag, Loader2, AlertCircle,
  X, CheckCircle2, Image, Video,
  FileText, ListOrdered, Upload, MoreHorizontal,
  Search, Settings2, Copy,
  ChevronUp, ChevronDown, MousePointer2, ArrowDown, Info, ArrowLeft
} from "lucide-react";
import { useUpload } from "@/hooks/use-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/lib/subscription-context";
import { InAppProUpgradeButton } from "@/components/InAppProUpgradeButton";
import { mustUseShopifyBilling } from "@/lib/shopifyBillingContext";
import { useShopifyShopHint } from "@/lib/shopifyBillingHint";
import { ChatbotFormFieldsEditor } from "@/components/chatbot/ChatbotFormFieldsEditor";
import {
  chatbotFormNodesPublishError,
  demoteActiveFlowIfFormIncomplete,
  emptyWebchatFormDraft,
} from "@shared/webchatStructuredForm";
import { chatbotAskQuestionPublishError, WEBCHAT_ASK_QUICK_REPLY_MAX, WHATSAPP_ASK_QUICK_REPLY_MAX } from "@shared/chatbotAskQuestionOptions";
import { builderLocalizedInputProps } from "@shared/webchatWidgetLocale";

/* ─── Types ─────────────────────────────────────────────────────────── */

type MessageType = "text" | "image" | "video" | "file" | "buttons" | "template" | "form";

export interface ButtonOption {
  label: string;
  value: string;
  nextNodeId?: string;
}

function resolveButton(btn: string | ButtonOption): ButtonOption {
  if (typeof btn === "string") return { label: btn, value: btn };
  return { label: btn.label || btn.value, value: btn.value || btn.label, nextNodeId: btn.nextNodeId };
}

function NodeLocaleVariantsEditor({
  nodeId,
  localized,
  optionSlots,
  onChange,
  contentPlaceholder,
}: {
  nodeId: string;
  localized?: {
    en?: { content?: string; options?: { label: string; nextNodeId?: string }[] };
    es?: { content?: string; options?: { label: string; nextNodeId?: string }[] };
    he?: { content?: string; options?: { label: string; nextNodeId?: string }[] };
  };
  optionSlots: { label: string }[];
  onChange: (localized: NonNullable<typeof localized>) => void;
  contentPlaceholder?: { es: string; he: string };
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">{t("automationUi.translations")}</Label>
      <p className="text-[11px] text-gray-400">
        {t("chatbotEditor.variantsHelp")}
      </p>
      {(["es", "he"] as const).map((loc) => {
        const variant = localized?.[loc] || {};
        const locOptions = variant.options || [];
        const fieldProps = builderLocalizedInputProps(loc);
        return (
          <div key={loc} className="rounded-lg border border-gray-100 p-2 space-y-2">
            <p className="text-[11px] font-semibold text-gray-500">{loc === "es" ? t("chatbotUi.spanish") : t("chatbotUi.hebrew")}</p>
            <Textarea
              {...fieldProps}
              value={variant.content || ""}
              onChange={(e) => {
                onChange({
                  ...(localized || {}),
                  [loc]: { ...variant, content: e.target.value, options: locOptions },
                });
              }}
              placeholder={loc === "es" ? contentPlaceholder?.es || "Mensaje en español…" : contentPlaceholder?.he || "הודעה בעברית…"}
              className="min-h-[60px] text-sm resize-none border-gray-200"
              data-testid={`input-question-${loc}-${nodeId}`}
            />
            {optionSlots.map((_opt, oi) => (
              <Input
                key={`${loc}-${oi}`}
                {...fieldProps}
                value={locOptions[oi]?.label || ""}
                onChange={(e) => {
                  const nextOpts = [...locOptions];
                  while (nextOpts.length <= oi) nextOpts.push({ label: "", nextNodeId: "" });
                  nextOpts[oi] = { ...nextOpts[oi], label: e.target.value };
                  onChange({
                    ...(localized || {}),
                    [loc]: { ...variant, options: nextOpts },
                  });
                }}
                placeholder={`${loc === "es" ? "Opción" : "אפשרות"} ${oi + 1}`}
                className="text-sm border-gray-200"
                data-testid={`input-option-${loc}-${nodeId}-${oi}`}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

interface ChatbotNode {
  id: string;
  type: "message" | "question" | "condition" | "action" | "delay";
  position: { x: number; y: number };
  data: {
    label: string;
    content?: string;
    messageType?: MessageType;
    mediaUrl?: string;
    mediaCaption?: string;
    fileName?: string;
    buttons?: ButtonOption[];
    webchatForm?: {
      id: string;
      title: string;
      description?: string;
      submitLabel?: string;
      fields: Array<Record<string, unknown>>;
    };
    options?: { label: string; nextNodeId: string }[];
    condition?: { type: string; value: string };
    /** For assign: value = memberId; memberName is display cache for the builder. */
    action?: { type: string; value: string; memberName?: string };
    delayMinutes?: number;
    delayUnit?: "minutes" | "hours" | "days";
    variableName?: string;
    localized?: {
      en?: { content?: string; options?: { label: string; nextNodeId?: string }[] };
      es?: { content?: string; options?: { label: string; nextNodeId?: string }[] };
      he?: { content?: string; options?: { label: string; nextNodeId?: string }[] };
    };
    templateId?: string;
    templateName?: string;
    templateLanguage?: string;
    templateVariables?: Record<string, string>;
  };
}

interface ChatbotEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface ChatbotFlow {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  triggerKeywords: string[];
  triggerOnNewChat: boolean;
  triggerChannels: string[];
  nodes: ChatbotNode[];
  edges: ChatbotEdge[];
  executionCount: number;
  lastExecutedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TeamMember {
  id: string;
  memberId: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

interface MessageTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  templateType: string;
  bodyText: string;
  variables: string[] | null;
}

/* ─── Constants ──────────────────────────────────────────────────────── */

const STEP_TYPES = [
  {
    type: "message", label: "Send Message", icon: MessageSquare,
    color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100",
    description: "Send text, media, files, buttons, or templates",
  },
  {
    type: "question", label: "Ask Question", icon: GitBranch,
    color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-100",
    description: "Ask, wait for one reply, save it, then continue",
  },
  {
    type: "delay", label: "Wait", icon: Clock,
    color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100",
    description: "Pause before continuing (up to 5 min)",
  },
  {
    type: "action", label: "Action", icon: Tag,
    color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100",
    description: "Tag, assign, update status, or move pipeline",
  },
];

const CHANNEL_OPTIONS: { value: string; label: string; icon: string }[] = [
  { value: "whatsapp",     label: "WhatsApp",           icon: "📱" },
  { value: "instagram",   label: "Instagram",           icon: "📷" },
  { value: "facebook",    label: "Facebook Messenger",  icon: "💬" },
  { value: "sms",         label: "SMS",                 icon: "✉️"  },
  { value: "webchat",     label: "Web Chat",            icon: "🌐" },
  { value: "telegram",    label: "Telegram",            icon: "✈️"  },
  { value: "gohighlevel", label: "CRM",         icon: "🔁" },
];

const MESSAGE_TYPES: { value: MessageType; label: string; icon: any }[] = [
  { value: "text", label: "Text", icon: MessageSquare },
  { value: "image", label: "Image", icon: Image },
  { value: "video", label: "Video", icon: Video },
  { value: "file", label: "File", icon: FileText },
  { value: "buttons", label: "Buttons", icon: ListOrdered },
  { value: "form", label: "Form", icon: FileText },
  { value: "template", label: "Template", icon: FileText },
];

const ACTION_TYPES = [
  { value: "shopping_assistant", label: "AI Shopping Assistant" },
  { value: "set_tag", label: "Add Tag" },
  { value: "set_status", label: "Set Status" },
  { value: "assign", label: "Assign to Team" },
  { value: "set_pipeline", label: "Move Pipeline Stage" },
];

/* ─── Helpers ────────────────────────────────────────────────────────── */

function assignMemberDisplayLabel(
  action: NonNullable<ChatbotNode["data"]["action"]>,
  teamMembers: TeamMember[]
): string {
  if (action.type !== "assign" || !action.value) return "";
  if (action.memberName?.trim()) return action.memberName.trim();
  const m = teamMembers.find((t) => t.memberId === action.value);
  return (m?.name || m?.email || action.value).trim();
}

function stepSummary(t: TFunction, language: string, node: ChatbotNode, teamMembers: TeamMember[]): string {
  switch (node.type) {
    case "message":
      if (node.data.messageType === "image") return node.data.mediaCaption ? `📷 ${node.data.mediaCaption}` : `📷 ${t("builderCatalog.image")}`;
      if (node.data.messageType === "video") return node.data.mediaCaption ? `🎥 ${node.data.mediaCaption}` : `🎥 ${t("builderCatalog.video")}`;
      if (node.data.messageType === "file") return `📎 ${node.data.fileName || t("builderCatalog.file")}`;
      if (node.data.messageType === "buttons") return node.data.content || t("builderFeedback.withButtons");
      if (node.data.messageType === "form") return node.data.webchatForm?.title || t("builderFeedback.structuredForm");
      return node.data.content || t("builderFeedback.emptyMessage");
    case "question":
      return node.data.content || t("builderFeedback.emptyQuestion");
    case "delay": {
      const m = node.data.delayMinutes || 0;
      const duration = m >= 60 && m % 60 === 0
        ? builderDuration(language, m / 60, "hour")
        : builderDuration(language, m, "minute");
      return t("builderFeedback.waitFor", { duration });
    }
    case "action": {
      const at = ACTION_TYPES.find(a => a.value === node.data.action?.type);
      const act = node.data.action;
      if (!at) return t("builderFeedback.configureAction");
      if (act?.type === "assign" && act.value) {
        const label = assignMemberDisplayLabel(act, teamMembers);
        return label ? `${builderCatalogText(t, at.label)}: ${label}` : builderCatalogText(t, at.label);
      }
      const val = act?.value;
      return val ? `${builderCatalogText(t, at.label)}: ${val}` : builderCatalogText(t, at.label);
    }
    default:
      return "";
  }
}

function stepTypeMeta(type: string) {
  return STEP_TYPES.find(s => s.type === type) || STEP_TYPES[0];
}

function DelayStepEditor({
  nodeId,
  delayMinutes,
  delayUnit,
  updateStep,
}: {
  nodeId: string;
  delayMinutes: number | undefined;
  delayUnit: "minutes" | "hours" | "days" | undefined;
  updateStep: (id: string, u: Partial<ChatbotNode["data"]>) => void;
}) {
  const { t } = useTranslation();
  const unit: "minutes" | "hours" | "days" = delayUnit || "minutes";
  const committed = delayMinutes ?? 5;

  const toDisplay = (m: number, u: "minutes" | "hours" | "days") =>
    u === "days"
      ? String(Math.max(0, Math.round(m / 1440)))
      : u === "hours"
        ? String(Math.max(0, Math.round(m / 60)))
        : String(Math.max(0, m));

  const toMinutes = (val: number, u: "minutes" | "hours" | "days") =>
    u === "days" ? val * 1440 : u === "hours" ? val * 60 : val;

  const [text, setText] = useState(() => toDisplay(committed, unit));

  useEffect(() => {
    setText(toDisplay(committed, unit));
  }, [nodeId, committed, unit]);

  const normalizeBlur = () => {
    const trimmed = text.trim();
    if (trimmed === "") {
      const fallback = 1;
      const m = toMinutes(fallback, unit);
      updateStep(nodeId, { delayMinutes: m, delayUnit: unit });
      setText(toDisplay(m, unit));
      return;
    }
    const n = parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 0) {
      setText(toDisplay(committed, unit));
      return;
    }
    const m = toMinutes(n, unit);
    updateStep(nodeId, { delayMinutes: m, delayUnit: unit });
    setText(toDisplay(m, unit));
  };

  return (
    <div>
      <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">{t("automationUi.delay")}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") setText("");
            else if (/^\d+$/.test(v)) setText(v);
          }}
          onBlur={normalizeBlur}
          className="text-sm w-20 border-gray-200"
          data-testid={`input-delay-${nodeId}`}
        />
        <Select
          value={unit}
          onValueChange={(v) => {
            const newUnit = v as "minutes" | "hours" | "days";
            const trimmed = text.trim();
            let qty: number;
            if (trimmed !== "" && /^\d+$/.test(trimmed)) {
              const n = parseInt(trimmed, 10);
              qty = Number.isFinite(n) && n >= 0 ? n : Math.max(1, Math.round(
                newUnit === "days" ? committed / 1440 : newUnit === "hours" ? committed / 60 : committed
              ));
            } else {
              qty = Math.max(1, Math.round(
                newUnit === "days" ? committed / 1440 : newUnit === "hours" ? committed / 60 : committed
              ));
            }
            const m = toMinutes(qty, newUnit);
            updateStep(nodeId, { delayUnit: newUnit, delayMinutes: m });
            setText(toDisplay(m, newUnit));
          }}
        >
          <SelectTrigger className="text-sm border-gray-200 bg-gray-50 w-28" data-testid={`select-delay-unit-${nodeId}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="minutes">{t("automationUi.minutes")}</SelectItem>
            <SelectItem value="hours">{t("automationUi.hours")}</SelectItem>
            <SelectItem value="days">{t("automationUi.days")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
        {t("automationUi.autoResume")}
      </p>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function FileUploadButton({ onUploaded, accept, nodeId, label }: {
  onUploaded: (url: string, fileName: string) => void;
  accept: string; nodeId: string; label?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const { uploadFile, isUploading, progress } = useUpload({
    onSuccess: (response) => {
      const url = `${window.location.origin}${response.objectPath}`;
      onUploaded(url, response.metadata.name);
    },
  });
  return (
    <div className="flex-shrink-0">
      <input ref={fileInputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { uploadFile(f); e.target.value = ""; } }}
        data-testid={`file-input-${nodeId}`} />
      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
          isUploading ? "bg-gray-50 text-gray-400 border-gray-200 cursor-wait"
            : "bg-white text-brand-green border-brand-green/25 hover:bg-brand-green/5 hover:border-brand-green/40"
        )}
        data-testid={`upload-btn-${nodeId}`}>
        {isUploading
          ? <><Loader2 className="h-3 w-3 animate-spin" />{progress > 0 && progress < 100 ? `${progress}%` : t("widgetEditor.uploading")}</>
          : <><Upload className="h-3 w-3" />{label ?? t("common.upload")}</>}
      </button>
    </div>
  );
}

function AddStepPicker({ onAdd, hint }: { onAdd: (type: ChatbotNode["type"]) => void; hint?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="group flex items-center gap-2 px-4 py-2 rounded-full border border-dashed border-gray-300 bg-white text-xs text-gray-400 hover:border-brand-green hover:text-brand-green hover:bg-brand-green/3 transition-all shadow-sm"
          data-testid="button-add-step"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{hint || "Add step"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1.5 shadow-lg border border-gray-100" align="center" sideOffset={6}>
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 pt-1 pb-1.5">{t("automationUi.stepType")}</div>
        {STEP_TYPES.map((st) => {
          const Icon = st.icon;
          return (
            <button key={st.type}
              onClick={() => { onAdd(st.type as ChatbotNode["type"]); setOpen(false); }}
              className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-start group"
              data-testid={`pick-step-${st.type}`}>
              <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors", st.bg)}>
                <Icon className={cn("h-3.5 w-3.5", st.color)} />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-800">{builderCatalogText(t, st.label)}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{builderCatalogText(t, st.description)}</div>
              </div>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/* ─── Main component ─────────────────────────────────────────────────── */

export function ChatbotBuilder() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: subscription } = useSubscription();
  const shopHint = useShopifyShopHint();
  const isShopifyBilling = mustUseShopifyBilling(subscription?.subscription, shopHint);
  const canStartInternalTrial = !!subscription?.subscription?.canStartInternalTrial;

  const [selectedFlow, setSelectedFlow] = useState<ChatbotFlow | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowDesc, setNewFlowDesc] = useState("");

  /* ── Queries ── */
  const { data: flows = [], isLoading, error } = useQuery<ChatbotFlow[]>({
    queryKey: ["/api/chatbot-flows"],
    retry: false,
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
    retry: false,
    select: (members: any[]) =>
      members.filter((m) => m.status === "active" || m.role === "owner"),
  });

  const { data: messageTemplates = [] } = useQuery<MessageTemplate[]>({
    queryKey: ["/api/templates"],
    retry: false,
    select: (tpls: any[]) =>
      Array.isArray(tpls)
        ? tpls.filter((t) => (t?.status || "").toLowerCase().trim() === "approved")
        : [],
  });

  /* ── Mutations ── */
  const createFlowMutation = useMutation({
    mutationFn: async (data: any) => (await apiRequest("POST", "/api/chatbot-flows", data)).json(),
    onSuccess: (flow) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot-flows"] });
      toast({ title: t("chatbotUi.flowCreated"), description: t("builderFeedback.createdFlow", { name: flow.name }) });
      setSelectedFlow(flow);
      setIsCreating(false);
      setNewFlowName("");
      setNewFlowDesc("");
      setUnsavedChanges(false);
    },
    onError: () => toast({ title: t("chatbotUi.createFailed"), description: t("builderFeedback.chatbotError"), variant: "destructive" }),
  });

  const updateFlowMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => (await apiRequest("PATCH", `/api/chatbot-flows/${id}`, data)).json(),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot-flows"] });
      toast({ title: t("chatbotUi.flowSaved") });
      setUnsavedChanges(false);
      setSelectedFlow(updated);
    },
    onError: () => toast({ title: t("chatbotUi.saveFailed"), description: t("builderFeedback.chatbotError"), variant: "destructive" }),
  });

  const deleteFlowMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/chatbot-flows/${id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot-flows"] });
      toast({ title: t("chatbotUi.flowDeleted") });
      setSelectedFlow(null);
      setSelectedStepId(null);
    },
    onError: () => toast({ title: t("chatbotUi.deleteFailed"), description: t("builderFeedback.chatbotError"), variant: "destructive" }),
  });

  const toggleFlowMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      (await apiRequest("PATCH", `/api/chatbot-flows/${id}`, { isActive })).json(),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot-flows"] });
      if (selectedFlow?.id === updated.id) setSelectedFlow(updated);
    },
    onError: () => toast({ title: t("common.error"), description: t("builderFeedback.chatbotError"), variant: "destructive" }),
  });

  const openFlow = (flow: ChatbotFlow) => {
    const next = demoteActiveFlowIfFormIncomplete(flow);
    setSelectedFlow(next);
    setSelectedStepId(null);
    setIsCreating(false);
    setUnsavedChanges(false);
    if (flow.isActive && !next.isActive) {
      const formError = chatbotFormNodesPublishError(flow.nodes);
      toggleFlowMutation.mutate({ id: flow.id, isActive: false });
      toast({
        title: t("builderFeedback.movedDraft"),
        description: t("builderFeedback.formReview"),
        variant: "destructive",
      });
    }
  };

  const duplicateFlowMutation = useMutation({
    mutationFn: async (flow: ChatbotFlow) => {
      const payload = {
        name: `${flow.name} (Copy)`,
        description: flow.description,
        nodes: flow.nodes,
        edges: flow.edges,
        triggerKeywords: flow.triggerKeywords,
        triggerOnNewChat: flow.triggerOnNewChat,
        triggerChannels: flow.triggerChannels || [],
        isActive: false,
      };
      return (await apiRequest("POST", "/api/chatbot-flows", payload)).json();
    },
    onSuccess: (copy) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot-flows"] });
      setSelectedFlow(copy);
      setSelectedStepId(null);
      setUnsavedChanges(false);
      toast({ title: t("chatbotUi.flowCopied"), description: t("builderFeedback.copiedFlow", { name: copy.name }) });
    },
    onError: () => toast({ title: t("chatbotUi.copyFailed"), description: t("builderFeedback.chatbotError"), variant: "destructive" }),
  });

  /* ── Handlers ── */
  const handleSave = () => {
    if (!selectedFlow) return;
    if (selectedFlow.isActive) {
      const formError = chatbotFormNodesPublishError(selectedFlow.nodes);
      if (formError) {
        toast({
          title: t("builderFeedback.formIncomplete"),
          description: t("builderFeedback.formReview"),
          variant: "destructive",
        });
        return;
      }
      const askError = chatbotAskQuestionPublishError(selectedFlow.nodes, {
        channels: selectedFlow.triggerChannels,
      });
      if (askError) {
        toast({
          title: t("builderFeedback.questionReview"),
          description: t("builderFeedback.questionReviewHint"),
          variant: "destructive",
        });
        return;
      }
    }
    updateFlowMutation.mutate({
      id: selectedFlow.id,
      name: selectedFlow.name,
      nodes: selectedFlow.nodes,
      edges: selectedFlow.edges,
      triggerKeywords: selectedFlow.triggerKeywords,
      triggerOnNewChat: selectedFlow.triggerOnNewChat,
      triggerChannels: selectedFlow.triggerChannels || [],
    });
  };

  const handleCreateFlow = () => {
    if (!newFlowName.trim()) return;
    const startNode: ChatbotNode = {
      id: "start",
      type: "message",
      position: { x: 250, y: 50 },
      data: { label: "Welcome Message", content: "Hello! How can I help you today?" },
    };
    createFlowMutation.mutate({
      name: newFlowName.trim(),
      description: newFlowDesc.trim() || null,
      nodes: [startNode],
      edges: [],
      triggerKeywords: [],
      triggerOnNewChat: false,
      triggerChannels: [],
    });
  };

  const addStep = (type: ChatbotNode["type"]) => {
    if (!selectedFlow) return;
    const meta = STEP_TYPES.find(s => s.type === type);
    const newNode: ChatbotNode = {
      id: `node_${Date.now()}`,
      type,
      position: { x: 250, y: (selectedFlow.nodes.length + 1) * 120 },
      data: {
        label: meta?.label || type,
        content: type === "message" ? "" : undefined,
        messageType: type === "message" ? "text" : undefined,
        options: type === "question" ? [{ label: "Option 1", nextNodeId: "" }] : undefined,
        delayMinutes: type === "delay" ? 5 : undefined,
        delayUnit: type === "delay" ? "minutes" : undefined,
        action: type === "action" ? { type: "set_tag", value: "" } : undefined,
      },
    };
    const lastNode = selectedFlow.nodes[selectedFlow.nodes.length - 1];
    const newEdge = lastNode ? { id: `edge_${Date.now()}`, source: lastNode.id, target: newNode.id } : null;
    setSelectedFlow({
      ...selectedFlow,
      nodes: [...selectedFlow.nodes, newNode],
      edges: newEdge ? [...selectedFlow.edges, newEdge] : selectedFlow.edges,
    });
    setSelectedStepId(newNode.id);
    setUnsavedChanges(true);
  };

  const updateStep = (nodeId: string, updates: Partial<ChatbotNode["data"]>) => {
    if (!selectedFlow) return;
    setSelectedFlow({
      ...selectedFlow,
      nodes: selectedFlow.nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n),
    });
    setUnsavedChanges(true);
  };

  const deleteStep = (nodeId: string) => {
    if (!selectedFlow) return;
    setSelectedFlow({
      ...selectedFlow,
      nodes: selectedFlow.nodes.filter(n => n.id !== nodeId),
      edges: selectedFlow.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
    });
    if (selectedStepId === nodeId) setSelectedStepId(null);
    setUnsavedChanges(true);
  };

  const moveStep = (nodeId: string, dir: "up" | "down") => {
    if (!selectedFlow) return;
    const idx = selectedFlow.nodes.findIndex(n => n.id === nodeId);
    if (idx === -1) return;
    const ni = dir === "up" ? idx - 1 : idx + 1;
    if (ni < 0 || ni >= selectedFlow.nodes.length) return;
    const nodes = [...selectedFlow.nodes];
    [nodes[idx], nodes[ni]] = [nodes[ni], nodes[idx]];
    setSelectedFlow({ ...selectedFlow, nodes });
    setUnsavedChanges(true);
  };

  const addKeyword = (kw: string) => {
    if (!selectedFlow || !kw.trim()) return;
    const clean = kw.trim().toLowerCase();
    if (selectedFlow.triggerKeywords.includes(clean)) return;
    setSelectedFlow({ ...selectedFlow, triggerKeywords: [...selectedFlow.triggerKeywords, clean] });
    setUnsavedChanges(true);
  };

  const removeKeyword = (kw: string) => {
    if (!selectedFlow) return;
    setSelectedFlow({ ...selectedFlow, triggerKeywords: selectedFlow.triggerKeywords.filter(k => k !== kw) });
    setUnsavedChanges(true);
  };

  /* ── Derived state ── */
  const selectedStep = selectedFlow?.nodes.find(n => n.id === selectedStepId) || null;
  const filteredFlows = flows.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  /* ── Error states ── */
  if (error) {
    const isPlan = (error as any)?.message?.includes("paid plan") || (error as any)?.status === 403;
    if (isPlan) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <Helmet><title>{[t("automationUi.flowBuilder") + " — " + t("aiBrain.upgradeRequired"), "ChatCRM"].join(" | ")}</title></Helmet>
          <div className="text-center max-w-md">
            <div className="mx-auto h-16 w-16 bg-gradient-to-br from-brand-green to-brand-teal rounded-2xl flex items-center justify-center mb-6">
              <Zap className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">{t("automationUi.flowBuilder")}</h2>
            <p className="text-gray-500 mb-6">{t("builderFeedback.upgradeFlow")}</p>
            <InAppProUpgradeButton
              canStartInternalTrial={canStartInternalTrial}
              isShopify={isShopifyBilling}
              className="bg-brand-green hover:bg-brand-green/90"
              testId="button-upgrade"
            />
          </div>
        </div>
      );
    }
  }

  if (error) return <p role="alert" className="p-6">{t("builderFeedback.loadFailed")}</p>;

  if (isLoading) {
    return (
      <div role="status" aria-label={t("builderFeedback.loading")} className="flex-1 flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand-green" />
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /* Render                                                              */
  /* ─────────────────────────────────────────────────────────────────── */
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#f7f8fa]">
      <Helmet>
        <title>{[t("automationUi.flowBuilder"), "ChatCRM"].join(" | ")}</title>
        <meta name="description" content={t("chatbotUi.flowIntro")} />
      </Helmet>

      {/* ══ Page Header ════════════════════════════════════════════════ */}
      <header className="bg-white border-b border-gray-200/80 px-3 md:px-5 py-3 flex items-center gap-2 md:gap-4 flex-shrink-0 z-10">
        {/* Mobile back button */}
        {(selectedFlow || isCreating) && (
          <button
            className="flex md:hidden items-center justify-center h-8 w-8 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
            onClick={() => { setSelectedFlow(null); setIsCreating(false); setSelectedStepId(null); setUnsavedChanges(false); }}
            aria-label={t("builderFeedback.backToFlows")} data-testid="button-back-to-flows"
          >
            <ArrowLeft className="h-4 w-4 text-gray-600" />
          </button>
        )}
        {/* Left: product identity */}
        <div className="flex items-center gap-2 md:gap-2.5 min-w-0">
          <div className="h-7 w-7 bg-gradient-to-br from-brand-green to-brand-teal rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-gray-400">{t("automationUi.flowBuilder")}</span>
            {selectedFlow && (
              <>
                <span className="text-gray-300 text-sm">/</span>
                <input
                  value={selectedFlow.name}
                  onChange={(e) => { setSelectedFlow({ ...selectedFlow, name: e.target.value }); setUnsavedChanges(true); }}
                  className="text-[13px] font-semibold text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-0 min-w-0 max-w-[100px] md:max-w-[200px]"
                  placeholder={t("chatbotUi.untitled")}
                  data-testid="input-flow-name"
                />
              </>
            )}
          </div>
          {selectedFlow && unsavedChanges && (
            <span className="hidden md:inline text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md tracking-wide">
              {t("automationUi.unsaved")}
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Right: actions */}
        {selectedFlow ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedFlow(null);
                setSelectedStepId(null);
                setUnsavedChanges(false);
                setIsCreating(true);
              }}
              className="h-8 text-xs font-semibold gap-1.5 border-gray-200 text-gray-700 hover:bg-gray-50"
              data-testid="button-new-flow-header"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("automationUi.createFlow")}
            </Button>

            {/* Status toggle — all breakpoints (dropdown no longer carries mobile toggle) */}
            <button
              onClick={() => {
                const currentlyActive = selectedFlow.isActive === true;
                // Switching to Draft is always allowed — skip all validation
                if (currentlyActive) {
                  toggleFlowMutation.mutate({ id: selectedFlow.id, isActive: false });
                  return;
                }
                // Switching to Active requires a trigger to be configured
                const hasKeywords = (selectedFlow.triggerKeywords as string[])?.length > 0;
                const hasNewChat = selectedFlow.triggerOnNewChat === true;
                if (!hasKeywords && !hasNewChat) {
                  toast({
                    title: t("builderFeedback.noTrigger"),
                    description: t("builderFeedback.triggerRequired"),
                    variant: "destructive",
                  });
                  return;
                }
                const formError = chatbotFormNodesPublishError(selectedFlow.nodes);
                if (formError) {
                  toast({
                    title: t("builderFeedback.formIncomplete"),
                    description: t("builderFeedback.formReview"),
                    variant: "destructive",
                  });
                  return;
                }
                const askError = chatbotAskQuestionPublishError(selectedFlow.nodes, {
                  channels: selectedFlow.triggerChannels,
                });
                if (askError) {
                  toast({
                    title: t("builderFeedback.questionReview"),
                    description: t("builderFeedback.questionReviewHint"),
                    variant: "destructive",
                  });
                  return;
                }
                toggleFlowMutation.mutate({ id: selectedFlow.id, isActive: true });
              }}
              className={cn(
                "flex items-center gap-2 px-2.5 md:px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex-shrink-0",
                selectedFlow.isActive
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                  : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
              )}
              data-testid="button-toggle-status"
            >
              <div className={cn("h-1.5 w-1.5 rounded-full", selectedFlow.isActive ? "bg-emerald-500" : "bg-gray-400")} />
              {selectedFlow.isActive ? t("automations.active") : t("automationUi.draft")}
            </button>

            {/* How to Test — hidden on mobile */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="hidden md:flex h-8 text-xs font-medium gap-1.5 text-gray-600" data-testid="button-test-flow">
                  <Info className="h-3 w-3" />
                  {t("automationUi.howToTest")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-4" side="bottom" align="end">
                <div className="flex gap-2.5">
                  <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800 mb-1">{t("chatbotUi.testFlow")}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      {t("builderFeedback.testInstructions")}
                    </p>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Button
              size="sm"
              onClick={handleSave}
              disabled={!unsavedChanges || updateFlowMutation.isPending}
              className="h-8 text-xs font-semibold bg-brand-green hover:bg-brand-green/90 gap-1.5"
              aria-label={t("common.save")} data-testid="button-save-flow"
            >
              {updateFlowMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <><Save className="h-3.5 w-3.5" /><span className="hidden md:inline">{t("common.save")}</span></>
              }
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 border-gray-200" data-testid="button-flow-more">
                  <MoreHorizontal className="h-4 w-4 text-gray-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 shadow-lg border-gray-100">
                <DropdownMenuItem
                  onClick={() => duplicateFlowMutation.mutate(selectedFlow)}
                  disabled={duplicateFlowMutation.isPending}
                  className="text-sm font-medium gap-2"
                  data-testid="menu-duplicate-flow"
                >
                  {duplicateFlowMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                    : <Copy className="h-3.5 w-3.5 text-gray-400" />
                  }
                  {t("chatbotUi.duplicate")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => deleteFlowMutation.mutate(selectedFlow.id)}
                  className="text-sm font-medium gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
                  data-testid="menu-delete-flow"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Button
            size="sm"
            onClick={() => setIsCreating(true)}
            className="h-8 text-xs font-semibold bg-brand-green hover:bg-brand-green/90 gap-1.5"
            data-testid="button-new-flow-header"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("automationUi.createFlow")}
          </Button>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* ══ Left Sidebar ════════════════════════════════════════════ */}
        <aside className={cn(
          "w-full md:w-56 bg-white border-e border-gray-200/80 flex flex-col flex-shrink-0",
          (selectedFlow || isCreating) ? "hidden md:flex" : "flex"
        )}>
          {/* Sidebar header */}
          <div className="px-3.5 pt-4 pb-3 border-b border-gray-100">
            <div className="mb-3">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t("chatbotEditor.yourFlows")}</span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-300 pointer-events-none" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("chatbotUi.search")}
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green/40 placeholder-gray-300 transition-all"
                data-testid="input-search-flows"
              />
            </div>
          </div>

          {/* Flow list */}
          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
            {filteredFlows.length === 0 && !isCreating && (
              <div className="text-center py-10 px-4">
                <Zap className="h-7 w-7 mx-auto text-gray-200 mb-2.5" />
                <p className="text-xs font-medium text-gray-400 mb-0.5">{t("chatbotEditor.noFlows")}</p>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  {t("builderFeedback.emptyFlows")}
                </p>
              </div>
            )}
            {filteredFlows.map((flow) => {
              const isSelected = selectedFlow?.id === flow.id;
              return (
                <button
                  key={flow.id}
                  onClick={() => openFlow(flow)}
                  className={cn(
                    "w-full text-start px-3 py-2.5 rounded-xl transition-all",
                    isSelected
                      ? "bg-brand-green/8 border border-brand-green/20 shadow-sm"
                      : "hover:bg-gray-50 border border-transparent"
                  )}
                  data-testid={`flow-item-${flow.id}`}
                >
                  <div className="flex items-start gap-2">
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full flex-shrink-0 mt-1.5",
                      flow.isActive ? "bg-emerald-400" : "bg-gray-300"
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "text-xs font-semibold truncate leading-tight",
                        isSelected ? "text-brand-green" : "text-gray-800"
                      )}>
                        {flow.name}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] text-gray-400">{t("builderFeedback.stepCount", { count: flow.nodes?.length || 0 })}</span>
                        <span className="text-gray-200">·</span>
                        <span className="text-[10px] text-gray-400">{t("builderFeedback.runs", { count: flow.executionCount || 0 })}</span>
                        {flow.isActive && (
                          <span className="text-[10px] font-semibold text-emerald-600">{t("automations.active")}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ══ Center Canvas ════════════════════════════════════════════ */}
        <main className={cn(
          "flex-1 overflow-y-auto",
          selectedStep ? "border-e border-gray-200/80" : "",
          (!selectedFlow && !isCreating) ? "hidden md:block" : ""
        )}>

          {/* Create flow inline */}
          {isCreating && (
            <div className="max-w-lg mx-auto p-4 md:p-8">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                  <div className="h-10 w-10 bg-gradient-to-br from-brand-green to-brand-teal rounded-xl flex items-center justify-center mb-4">
                    <Zap className="h-5 w-5 text-white" />
                  </div>
                  <h2 className="text-base font-bold text-gray-900">{t("chatbotEditor.createNew")}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{t("chatbotUi.flowNameHint")}</p>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">{t("chatbotEditor.flowName")}</Label>
                    <Input
                      value={newFlowName}
                      onChange={(e) => setNewFlowName(e.target.value)}
                      placeholder={t("builderFeedback.flowExample")}
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleCreateFlow()}
                      className="text-sm"
                      data-testid="input-new-flow-name"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                      {t("builderUi.description")} <span className="text-gray-400 font-normal">{t("builderUi.optional")}</span>
                    </Label>
                    <Textarea
                      value={newFlowDesc}
                      onChange={(e) => setNewFlowDesc(e.target.value)}
                      placeholder={t("chatbotUi.flowPurpose")}
                      className="min-h-[70px] resize-none text-sm"
                      data-testid="input-new-flow-desc"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      onClick={handleCreateFlow}
                      disabled={!newFlowName.trim() || createFlowMutation.isPending}
                      className="bg-brand-green hover:bg-brand-green/90 text-sm font-semibold"
                      data-testid="button-confirm-create-flow"
                    >
                      {createFlowMutation.isPending && <Loader2 className="h-3.5 w-3.5 me-2 animate-spin" />}
                      {t("chatbotEditor.create")}
                    </Button>
                    <Button variant="outline" className="text-sm" onClick={() => setIsCreating(false)} data-testid="button-cancel-create">
                      {t("common.cancel")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Empty: no flow selected */}
          {!isCreating && !selectedFlow && (
            <div className="flex flex-col items-center justify-center min-h-full p-8 text-center">
              <div className="h-14 w-14 bg-white border border-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <Zap className="h-6 w-6 text-gray-300" />
              </div>
              <h3 className="text-sm font-bold text-gray-700 mb-1">{t("chatbotEditor.selectFlow")}</h3>
              <p className="text-xs text-gray-400 mb-2 max-w-xs">
                {t("chatbotUi.flowIntro")}
              </p>
              <p className="text-xs text-gray-500">
                {t("builderFeedback.selectOrCreate")}
              </p>
            </div>
          )}

          {/* Flow editor */}
          {!isCreating && selectedFlow && (
            <div className="max-w-[520px] mx-auto px-4 py-7 space-y-0">

              {/* ── Trigger card ──────────────────────────────────── */}
              <div className="bg-white rounded-2xl border border-violet-100 shadow-sm overflow-hidden">
                {/* Card header */}
                <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-violet-50/60 to-transparent border-b border-violet-100/60">
                  <div className="h-9 w-9 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <Zap className="h-4 w-4 text-violet-600" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-900">{t("chatbotUi.trigger")}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{t("chatbotUi.triggerHint")}</div>
                  </div>
                </div>

                <div className="px-5 py-5 space-y-5">
                  {/* Start on new conversation */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-gray-700">{t("chatbotEditor.startOnNew")}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                        {t("chatbotEditor.startOnNewHint")}
                      </div>
                    </div>
                    <Switch
                      checked={selectedFlow.triggerOnNewChat}
                      onCheckedChange={(checked) => {
                        setSelectedFlow({ ...selectedFlow, triggerOnNewChat: checked });
                        setUnsavedChanges(true);
                      }}
                      data-testid="switch-trigger-new-chat"
                    />
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-gray-100" />

                  {/* Keywords */}
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-2">{t("chatbotEditor.keywordTriggers")}</div>
                    {selectedFlow.triggerKeywords.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {selectedFlow.triggerKeywords.map((kw) => (
                          <span
                            key={kw}
                            className="flex items-center gap-1 px-2.5 py-1 bg-violet-50 border border-violet-100 text-violet-700 rounded-full text-[11px] font-semibold"
                            data-testid={`keyword-chip-${kw}`}
                          >
                            {kw}
                            <button
                              onClick={() => removeKeyword(kw)}
                              className="text-violet-300 hover:text-violet-600 transition-colors ms-0.5"
                              data-testid={`remove-keyword-${kw}`}
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            addKeyword(keywordInput);
                            setKeywordInput("");
                          }
                        }}
                        placeholder={t("chatbotEditor.keywordPlaceholder")}
                        className="flex-1 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green/40 transition-all"
                        data-testid="input-trigger-keywords"
                      />
                      <button
                        onClick={() => { addKeyword(keywordInput); setKeywordInput(""); }}
                        disabled={!keywordInput.trim()}
                        className="px-3 py-2 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                        data-testid="button-add-keyword"
                      >
                        {t("common.add")}
                      </button>
                    </div>
                  </div>

                  {/* Channel filter */}
                  <div className="h-px bg-gray-100" />
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-1.5">{t("chatbotUi.channelFilter")}</div>
                    <p className="text-[11px] text-gray-400 mb-2 leading-relaxed">
                      {t("chatbotUi.channelHint")}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {CHANNEL_OPTIONS.map((ch) => {
                        const selected = (selectedFlow.triggerChannels || []).includes(ch.value);
                        return (
                          <button
                            key={ch.value}
                            onClick={() => {
                              const current = selectedFlow.triggerChannels || [];
                              const next = selected
                                ? current.filter((c) => c !== ch.value)
                                : [...current, ch.value];
                              setSelectedFlow({ ...selectedFlow, triggerChannels: next });
                              setUnsavedChanges(true);
                            }}
                            className={cn(
                              "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all",
                              selected
                                ? "bg-violet-100 border-violet-300 text-violet-700"
                                : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                            )}
                            data-testid={`channel-chip-${ch.value}`}
                          >
                            <span>{ch.icon}</span>
                            {builderCatalogText(t, ch.label)}
                          </button>
                        );
                      })}
                    </div>
                    {(selectedFlow.triggerChannels || []).length === 0 && (
                      <p className="text-[11px] text-gray-400 mt-1.5">{t("chatbotUi.allChannels")}</p>
                    )}
                  </div>

                  {/* Trigger status banner */}
                  {(() => {
                    const hasKw = selectedFlow.triggerKeywords.length > 0;
                    const newChat = selectedFlow.triggerOnNewChat;
                    if (!hasKw && !newChat) return (
                      <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-700" data-testid="trigger-summary-warning">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span>{t("chatbotUi.noTrigger")}</span>
                      </div>
                    );
                    if (hasKw && newChat) return (
                      <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-700" data-testid="trigger-summary-both">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span>{t("builderFeedback.newOrKeyword")}</span>
                      </div>
                    );
                    if (newChat) return (
                      <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700" data-testid="trigger-summary-newchat">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span>{t("builderFeedback.newConversation")}</span>
                      </div>
                    );
                    return (
                      <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700" data-testid="trigger-summary-keywords">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span>{t("chatbotUi.keywordTrigger")}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* ── Flow path ──────────────────────────────────────── */}
              <div className="flex flex-col items-center py-3 gap-0">
                <div className="w-px h-5 bg-gray-200" />
                <ArrowDown className="h-3.5 w-3.5 text-gray-300" />
              </div>

              {/* Empty flow state */}
              {selectedFlow.nodes.length === 0 && (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center shadow-sm">
                  <MousePointer2 className="h-8 w-8 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm font-bold text-gray-500 mb-1">{t("chatbotUi.startBuilding")}</p>
                  <p className="text-xs text-gray-400 mb-5">{t("chatbotUi.firstStep")}</p>
                  <AddStepPicker onAdd={addStep} hint="Add first step" />
                </div>
              )}

              {/* Steps */}
              {selectedFlow.nodes.map((node, index) => {
                const meta = stepTypeMeta(node.type);
                const Icon = meta.icon;
                const isSelected = selectedStepId === node.id;
                const summary = stepSummary(t, i18n.language, node, teamMembers);

                return (
                  <div key={node.id} className="flex flex-col items-center">
                    {/* Step card */}
                    <div
                      onClick={() => setSelectedStepId(isSelected ? null : node.id)}
                      className={cn(
                        "w-full bg-white rounded-2xl border shadow-sm cursor-pointer transition-all group select-none",
                        isSelected
                          ? "border-brand-green ring-2 ring-brand-green/15 shadow-brand-green/10"
                          : "border-gray-200 hover:border-gray-300 hover:shadow-md"
                      )}
                      data-testid={`step-${node.id}`}
                    >
                      <div className="flex items-center gap-3.5 px-4 py-3.5">
                        {/* Icon */}
                        <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0", meta.bg)}>
                          <Icon className={cn("h-4 w-4", meta.color)} />
                        </div>

                        {/* Content hierarchy */}
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide leading-none mb-0.5">
                            {builderCatalogText(t, meta.label)}
                          </div>
                          <div className="text-sm font-semibold text-gray-800 truncate leading-snug">
                            {node.data.label}
                          </div>
                          {summary && (
                            <div className="text-xs text-gray-400 truncate mt-0.5 leading-snug">{summary}</div>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); moveStep(node.id, "up"); }} disabled={index === 0}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-20 transition-colors">
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); moveStep(node.id, "down"); }} disabled={index === selectedFlow.nodes.length - 1}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-20 transition-colors">
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button onClick={(e) => e.stopPropagation()}
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
                                data-testid={`step-more-${node.id}`}>
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40 shadow-lg border-gray-100">
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); deleteStep(node.id); }}
                                className="text-xs font-medium gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
                                data-testid={`delete-step-${node.id}`}>
                                <Trash2 className="h-3 w-3" />{t("chatbotUi.deleteStep")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <Settings2 className={cn(
                          "h-3.5 w-3.5 flex-shrink-0 ms-1 transition-colors",
                          isSelected ? "text-brand-green" : "text-gray-200 group-hover:text-gray-400"
                        )} />
                      </div>
                    </div>

                    {/* Connector + Add Step */}
                    <div className="flex flex-col items-center py-2 gap-0">
                      <div className="w-px h-4 bg-gray-200" />
                      <AddStepPicker
                        onAdd={addStep}
                        hint={index < selectedFlow.nodes.length - 1 ? "Add step" : "Continue the flow"}
                      />
                      {index < selectedFlow.nodes.length - 1 && (
                        <div className="w-px h-4 bg-gray-200" />
                      )}
                    </div>
                  </div>
                );
              })}

              {/* End of flow */}
              {selectedFlow.nodes.length > 0 && (
                <div className="flex justify-center pb-10 pt-2">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-gray-200 shadow-sm text-xs text-gray-400 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5 text-gray-300" />
                    {t("chatbotUi.flowEnds")}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* ══ Right Inspector Panel ════════════════════════════════════ */}
        {selectedStep && selectedFlow && (
          <aside className="fixed inset-0 z-[60] md:relative md:inset-auto md:z-auto md:w-[300px] w-full bg-white border-s border-gray-200/80 flex flex-col flex-shrink-0 overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 bg-gray-50/50">
              {(() => {
                const meta = stepTypeMeta(selectedStep.type);
                const Icon = meta.icon;
                return (
                  <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0", meta.bg)}>
                    <Icon className={cn("h-3.5 w-3.5", meta.color)} />
                  </div>
                );
              })()}
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  {builderCatalogText(t, stepTypeMeta(selectedStep.type).label)}
                </div>
                <input
                  value={selectedStep.data.label}
                  onChange={(e) => updateStep(selectedStep.id, { label: e.target.value })}
                  className="text-xs font-semibold text-gray-800 bg-transparent border-0 focus:outline-none w-full p-0 mt-0.5"
                  aria-label={t("builderFeedback.stepName")} data-testid="input-step-label"
                />
              </div>
              <button
                onClick={() => setSelectedStepId(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors flex-shrink-0"
                aria-label={t("common.close")} data-testid="button-close-panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">

              {/* ── SEND MESSAGE ── */}
              {selectedStep.type === "message" && (
                <>
                  {/* Type switcher */}
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{t("chatbotUi.messageType")}</div>
                    <div className="flex flex-wrap gap-1">
                      {MESSAGE_TYPES.map((mt) => {
                        const Icon = mt.icon;
                        const active = (selectedStep.data.messageType || "text") === mt.value;
                        return (
                          <button key={mt.value}
                            onClick={() => updateStep(selectedStep.id, {
                              messageType: mt.value,
                              ...(mt.value === "text" ? { mediaUrl: undefined, mediaCaption: undefined, fileName: undefined, buttons: undefined } : {}),
                              ...(mt.value === "buttons" && !selectedStep.data.buttons ? { buttons: [{ label: "Option 1", value: "option_1" }] as ButtonOption[] } : {}),
                              ...(mt.value === "form" && !selectedStep.data.webchatForm ? {
                                webchatForm: emptyWebchatFormDraft(),
                              } : {}),
                            })}
                            className={cn(
                              "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all border",
                              active ? "bg-brand-green text-white border-brand-green shadow-sm"
                                : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                            )}
                            data-testid={`msg-type-${mt.value}-${selectedStep.id}`}>
                            <Icon className="h-3 w-3" />{builderCatalogText(t, mt.label)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Text */}
                  {(selectedStep.data.messageType || "text") === "text" && (
                    <div>
                      <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">{t("builderUi.message")}</Label>
                      <Textarea
                        value={selectedStep.data.content || ""}
                        onChange={(e) => updateStep(selectedStep.id, { content: e.target.value })}
                        placeholder={t("chatbotUi.typeMessage")}
                        className="min-h-[110px] text-sm resize-none border-gray-200 focus:ring-brand-green/20"
                        data-testid={`input-message-${selectedStep.id}`}
                      />
                      <div className="mt-3">
                        <NodeLocaleVariantsEditor
                          nodeId={selectedStep.id}
                          localized={selectedStep.data.localized}
                          optionSlots={[]}
                          onChange={(localized) => updateStep(selectedStep.id, { localized })}
                        />
                      </div>
                    </div>
                  )}

                  {/* Image / Video */}
                  {(selectedStep.data.messageType === "image" || selectedStep.data.messageType === "video") && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                          {selectedStep.data.messageType === "image" ? t("chatbotUi.image") : t("chatbotUi.video")}
                        </Label>
                        <div className="flex gap-2 mb-2">
                          <Input value={selectedStep.data.mediaUrl || ""} onChange={(e) => updateStep(selectedStep.id, { mediaUrl: e.target.value })}
                            placeholder={t("chatbotUi.pasteUrl")} className="text-sm flex-1 border-gray-200" data-testid={`input-media-url-${selectedStep.id}`} />
                          <FileUploadButton nodeId={`media-${selectedStep.id}`}
                            accept={selectedStep.data.messageType === "image" ? "image/*" : "video/*"}
                            label={selectedStep.data.mediaUrl ? t("widgetEditor.replace") : t("common.upload")}
                            onUploaded={(url) => updateStep(selectedStep.id, { mediaUrl: url })} />
                        </div>
                        {selectedStep.data.mediaUrl && selectedStep.data.messageType === "image" && (
                          <div className="rounded-xl overflow-hidden border border-gray-100 max-h-28 bg-gray-50">
                            <img src={selectedStep.data.mediaUrl} alt={t("chatbotUi.preview")} className="w-full object-cover max-h-28"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        )}
                      </div>
                      <div>
                        <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                          {t("chatbotUi.caption")} <span className="normal-case font-normal text-gray-300">{t("builderUi.optional")}</span>
                        </Label>
                        <Textarea value={selectedStep.data.mediaCaption || ""} onChange={(e) => updateStep(selectedStep.id, { mediaCaption: e.target.value })}
                          placeholder={t("chatbotUi.addCaption")} className="min-h-[60px] text-sm resize-none border-gray-200" data-testid={`input-media-caption-${selectedStep.id}`} />
                      </div>
                    </div>
                  )}

                  {/* File */}
                  {selectedStep.data.messageType === "file" && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">{t("chatbotUi.file")}</Label>
                        <div className="flex gap-2 mb-2">
                          <Input value={selectedStep.data.mediaUrl || ""} onChange={(e) => updateStep(selectedStep.id, { mediaUrl: e.target.value })}
                            placeholder={t("chatbotUi.pasteUrl")} className="text-sm flex-1 border-gray-200" data-testid={`input-file-url-${selectedStep.id}`} />
                          <FileUploadButton nodeId={`file-${selectedStep.id}`} accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                            label={selectedStep.data.mediaUrl ? t("widgetEditor.replace") : t("common.upload")}
                            onUploaded={(url, fileName) => updateStep(selectedStep.id, { mediaUrl: url, fileName })} />
                        </div>
                        {selectedStep.data.mediaUrl && (
                          <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                            <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="text-xs text-gray-600 truncate">{selectedStep.data.fileName || "Uploaded file"}</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                          {t("chatbotUi.fileName")} <span className="normal-case font-normal text-gray-300">{t("builderUi.optional")}</span>
                        </Label>
                        <Input value={selectedStep.data.fileName || ""} onChange={(e) => updateStep(selectedStep.id, { fileName: e.target.value })}
                          placeholder={t("builderFeedback.fileExample")} className="text-sm border-gray-200" data-testid={`input-file-name-${selectedStep.id}`} />
                      </div>
                      <div>
                        <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                          {t("builderUi.message")} <span className="normal-case font-normal text-gray-300">{t("builderUi.optional")}</span>
                        </Label>
                        <Textarea value={selectedStep.data.content || ""} onChange={(e) => updateStep(selectedStep.id, { content: e.target.value })}
                          placeholder={t("builderFeedback.fileMessageExample")} className="min-h-[60px] text-sm resize-none border-gray-200" data-testid={`input-file-message-${selectedStep.id}`} />
                      </div>
                    </div>
                  )}

                  {/* Buttons */}
                  {selectedStep.data.messageType === "buttons" && (() => {
                    const rawBtns = selectedStep.data.buttons || [];
                    const buttons: ButtonOption[] = rawBtns.map(b => resolveButton(b as any));
                    const otherNodes = selectedFlow.nodes.filter(n => n.id !== selectedStep.id);
                    return (
                      <div className="space-y-4">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-600 space-y-1.5">
                          <p className="font-bold text-slate-700 mb-1">{t("chatbotUi.channelSupport")}</p>
                          <p>{t("chatbotUi.fullSupport")}</p>
                          <p>{t("chatbotUi.partialSupport")}</p>
                          <p>{t("chatbotUi.textOnly")}</p>
                        </div>
                        {buttons.length > 3 && (
                          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-100 text-[11px] text-amber-700">
                            {t("chatbotUi.whatsappButtons")}
                          </div>
                        )}
                        <div>
                          <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">{t("chatbotUi.prompt")}</Label>
                          <Textarea value={selectedStep.data.content || ""} onChange={(e) => updateStep(selectedStep.id, { content: e.target.value })}
                            placeholder={t("chatbotUi.chooseOption")} className="min-h-[60px] text-sm resize-none border-gray-200" data-testid={`input-buttons-message-${selectedStep.id}`} />
                        </div>
                        <div>
                          <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                            {t("chatbotUi.buttons")} <span className="normal-case font-normal text-gray-300">{t("chatbotUi.buttonLimit")}</span>
                          </Label>
                          <div className="space-y-2">
                            {buttons.map((btn, bi) => (
                              <div key={bi} className="p-3 rounded-xl border border-gray-200 bg-gray-50 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t("chatbotUi.button")} {bi + 1}</span>
                                  <button onClick={() => { const nb = buttons.filter((_, i) => i !== bi); updateStep(selectedStep.id, { buttons: nb }); }}
                                    className="text-gray-300 hover:text-red-500 transition-colors" data-testid={`delete-button-${selectedStep.id}-${bi}`}>
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <Input value={btn.label} onChange={(e) => {
                                  const nb = [...buttons]; const label = e.target.value;
                                  const autoVal = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").substring(0, 64);
                                  nb[bi] = { ...nb[bi], label, value: autoVal || label };
                                  updateStep(selectedStep.id, { buttons: nb });
                                }} placeholder={t("builderFeedback.buttonLabel", { number: bi + 1 })} maxLength={20} className="text-sm h-8 border-gray-200" data-testid={`input-button-label-${selectedStep.id}-${bi}`} />
                                {otherNodes.length > 0 && (
                                  <Select value={btn.nextNodeId || "__none__"} onValueChange={(val) => {
                                    const nb = [...buttons]; nb[bi] = { ...nb[bi], nextNodeId: val === "__none__" ? undefined : val };
                                    updateStep(selectedStep.id, { buttons: nb });
                                  }}>
                                    <SelectTrigger className="h-8 text-xs border-gray-200" data-testid={`select-nextstep-${selectedStep.id}-${bi}`}>
                                      <SelectValue placeholder={t("chatbotUi.nextStep")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">{t("chatbotEditor.endFlow")}</SelectItem>
                                      {otherNodes.map(n => <SelectItem key={n.id} value={n.id}>{n.data.label || n.id}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                            ))}
                            {buttons.length < 3 && (
                              <button onClick={() => {
                                const idx = buttons.length + 1;
                                updateStep(selectedStep.id, { buttons: [...buttons, { label: `Option ${idx}`, value: `option_${idx}` }] });
                              }} className="w-full py-2.5 rounded-xl border border-dashed border-gray-200 text-[11px] font-semibold text-gray-400 hover:border-brand-green hover:text-brand-green transition-colors flex items-center justify-center gap-1"
                                data-testid={`add-button-${selectedStep.id}`}>
                                <Plus className="h-3 w-3" />{t("chatbotUi.addButton")}
                              </button>
                            )}
                          </div>
                        </div>
                        <NodeLocaleVariantsEditor
                          nodeId={selectedStep.id}
                          localized={selectedStep.data.localized}
                          optionSlots={buttons}
                          onChange={(localized) => updateStep(selectedStep.id, { localized })}
                        />
                      </div>
                    );
                  })()}

                  {selectedStep.data.messageType === "form" && (
                    <ChatbotFormFieldsEditor
                      stepId={selectedStep.id}
                      prompt={selectedStep.data.content || ""}
                      onPromptChange={(content) => updateStep(selectedStep.id, { content })}
                      form={selectedStep.data.webchatForm}
                      onFormChange={(webchatForm) => updateStep(selectedStep.id, { webchatForm })}
                    />
                  )}
                </>
              )}

              {/* ── TEMPLATE ── */}
              {(selectedStep.type === "message" || selectedStep.type === "question") &&
                selectedStep.data.messageType === "template" && (
                <div className="space-y-4">
                  {/* WhatsApp-only info */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-600 space-y-1">
                    <p className="font-bold text-slate-700 mb-1">{t("chatbotUi.officialTemplate")}</p>
                    <p>{t("chatbotUi.templateApi")}</p>
                    <p>{t("chatbotUi.templateWindow")}</p>
                    <p>{t("chatbotUi.templateProviders")}</p>
                    <p>{t("chatbotUi.templateWhatsappOnly")}</p>
                  </div>
                  {(selectedFlow.triggerChannels || []).length > 0 &&
                    !(selectedFlow.triggerChannels || []).includes("whatsapp") && (
                    <div className="flex gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                      <p className="text-[11px] text-amber-700 leading-relaxed">
                        {t("chatbotUi.noWhatsappFilter")}
                      </p>
                    </div>
                  )}
                  <div>
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">{t("builderUi.template")}</Label>
                    {messageTemplates.length === 0 ? (
                      <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-[11px] text-gray-500">
                        {t("chatbotUi.noApprovedTemplates")}
                      </div>
                    ) : (
                      <Select
                        value={selectedStep.data.templateId || ""}
                        onValueChange={(val) => {
                          const tpl = messageTemplates.find((t) => t.id === val);
                          updateStep(selectedStep.id, {
                            templateId: val,
                            templateName: tpl?.name,
                            templateLanguage: tpl?.language,
                            templateVariables: {},
                          });
                        }}
                      >
                        <SelectTrigger className="text-sm border-gray-200 bg-gray-50" data-testid={`select-template-${selectedStep.id}`}>
                          <SelectValue placeholder={t("chatbotUi.chooseTemplate")} />
                        </SelectTrigger>
                        <SelectContent>
                          {messageTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name} <span className="text-gray-400 text-xs ms-1">({t.language})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  {selectedStep.data.templateId && (() => {
                    const tpl = messageTemplates.find((t) => t.id === selectedStep.data.templateId);
                    if (!tpl) return null;
                    const vars = (tpl.variables as string[] | null) || [];
                    return (
                      <div className="space-y-3">
                        <div className="p-3 rounded-xl bg-violet-50 border border-violet-100 text-[11px] text-violet-700 leading-relaxed whitespace-pre-wrap font-mono">
                          {tpl.bodyText || "(Template body not available)"}
                        </div>
                        {vars.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">{t("chatbotUi.variables")}</Label>
                            {vars.map((varName) => (
                              <div key={varName} className="flex items-center gap-2">
                                <span className="text-[11px] font-mono text-violet-600 w-20 flex-shrink-0">{`{{${varName}}}`}</span>
                                <Input
                                  value={(selectedStep.data.templateVariables || {})[varName] || ""}
                                  onChange={(e) => {
                                    const vars = { ...(selectedStep.data.templateVariables || {}), [varName]: e.target.value };
                                    updateStep(selectedStep.id, { templateVariables: vars });
                                  }}
                                  placeholder={t("builderFeedback.variableValue", { name: varName })}
                                  className="text-sm border-gray-200 h-8 flex-1"
                                  data-testid={`input-template-var-${selectedStep.id}-${varName}`}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── ASK QUESTION ── */}
              {selectedStep.type === "question" && (
                <>
                  <p className="text-[11px] text-gray-500 leading-relaxed rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    {t("builderFeedback.askInstructions")}
                  </p>
                  <div>
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">{t("chatbotUi.question")}</Label>
                    <Textarea value={selectedStep.data.content || ""} onChange={(e) => updateStep(selectedStep.id, { content: e.target.value })}
                      placeholder={t("chatbotUi.typeMessage")} className="min-h-[110px] text-sm resize-none border-gray-200" data-testid={`input-question-${selectedStep.id}`} />
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                      {t("chatbotUi.saveAnswer")} <span className="normal-case font-normal text-gray-300">{t("builderUi.optional")}</span>
                    </Label>
                    <Input value={selectedStep.data.variableName || ""} onChange={(e) => updateStep(selectedStep.id, { variableName: e.target.value })}
                      placeholder={t("builderFeedback.variableExample")} className="text-sm border-gray-200" data-testid={`input-variable-${selectedStep.id}`} />
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">{t("chatbotUi.quickReplies")}</Label>
                    <p className="text-[11px] text-gray-400 mb-2">
                      {t("builderFeedback.quickReplyLimits", { web: WEBCHAT_ASK_QUICK_REPLY_MAX, whatsapp: WHATSAPP_ASK_QUICK_REPLY_MAX })}
                    </p>
                    <div className="space-y-2">
                      {(selectedStep.data.options || []).map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <Input value={opt.label} onChange={(e) => {
                            const opts = [...(selectedStep.data.options || [])];
                            opts[oi] = { ...opts[oi], label: e.target.value };
                            updateStep(selectedStep.id, { options: opts });
                          }} placeholder={t("builderFeedback.optionNumber", { number: oi + 1 })} className="text-sm flex-1 border-gray-200" data-testid={`input-option-${selectedStep.id}-${oi}`} />
                          <button onClick={() => {
                            const opts = (selectedStep.data.options || []).filter((_, i) => i !== oi);
                            updateStep(selectedStep.id, { options: opts });
                          }} className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <button onClick={() => {
                        const opts = [...(selectedStep.data.options || []), { label: "", nextNodeId: "" }];
                        updateStep(selectedStep.id, { options: opts });
                      }} className="w-full py-2.5 rounded-xl border border-dashed border-gray-200 text-[11px] font-semibold text-gray-400 hover:border-brand-green hover:text-brand-green transition-colors flex items-center justify-center gap-1"
                        data-testid={`add-option-${selectedStep.id}`}>
                        <Plus className="h-3 w-3" />{t("chatbotUi.addOption")}
                      </button>
                    </div>
                  </div>
                  <NodeLocaleVariantsEditor
                    nodeId={selectedStep.id}
                    localized={selectedStep.data.localized}
                    optionSlots={selectedStep.data.options || []}
                    contentPlaceholder={{ es: "Pregunta en español…", he: "שאלה בעברית…" }}
                    onChange={(localized) => updateStep(selectedStep.id, { localized })}
                  />
                </>
              )}

              {/* ── WAIT ── */}
              {selectedStep.type === "delay" && (
                <DelayStepEditor
                  nodeId={selectedStep.id}
                  delayMinutes={selectedStep.data.delayMinutes}
                  delayUnit={selectedStep.data.delayUnit}
                  updateStep={updateStep}
                />
              )}

              {/* ── ACTION ── */}
              {selectedStep.type === "action" && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">{t("chatbotUi.actionType")}</Label>
                    <Select value={selectedStep.data.action?.type || "set_tag"}
                      onValueChange={(val) => {
                        const prev = selectedStep.data.action;
                        if (val === "assign") {
                          updateStep(selectedStep.id, {
                            action: {
                              type: "assign",
                              value: prev?.type === "assign" && prev.value ? prev.value : "",
                              memberName: prev?.type === "assign" ? prev.memberName : undefined,
                            },
                          });
                        } else {
                          updateStep(selectedStep.id, {
                            action: { type: val, value: prev?.type === val ? (prev?.value || "") : "" },
                          });
                        }
                      }}>
                      <SelectTrigger className="text-sm border-gray-200 bg-gray-50" data-testid={`select-action-type-${selectedStep.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTION_TYPES.map(a => <SelectItem key={a.value} value={a.value}>{builderCatalogText(t, a.label)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedStep.data.action?.type === "shopping_assistant" && <p className="text-sm text-muted-foreground">{t("builderFeedback.shoppingHelp")}</p>}
                  <div hidden={selectedStep.data.action?.type === "shopping_assistant"}>
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                      {selectedStep.data.action?.type === "assign" ? t("chatbotUi.teamMember") : t("builderUi.value")}
                    </Label>
                    {selectedStep.data.action?.type === "assign" ? (
                      <div>
                        <Select
                          value={selectedStep.data.action?.value || ""}
                          onValueChange={(val) => {
                            const m = teamMembers.find((x) => x.memberId === val);
                            updateStep(selectedStep.id, {
                              action: {
                                type: "assign",
                                value: val,
                                memberName: (m?.name || m?.email || "").trim(),
                              },
                            });
                          }}
                        >
                          <SelectTrigger className="text-sm border-gray-200 bg-gray-50" data-testid={`select-assign-member-${selectedStep.id}`}>
                            <SelectValue placeholder={t("chatbotUi.selectMember")} />
                          </SelectTrigger>
                          <SelectContent>
                            {teamMembers.length === 0 && (
                              <SelectItem value="__none__" disabled>{t("chatbotUi.noMembers")}</SelectItem>
                            )}
                            {selectedStep.data.action?.value &&
                              !teamMembers.some((m) => m.memberId === selectedStep.data.action?.value) && (
                              <SelectItem value={selectedStep.data.action!.value!}>
                                {selectedStep.data.action?.memberName?.trim() ||
                                  `Member (${selectedStep.data.action!.value})`}
                              </SelectItem>
                            )}
                            {teamMembers.map((m) => (
                              <SelectItem key={m.memberId} value={m.memberId}>
                                {m.name || m.email} {m.role === "owner" ? t("chatbotUi.owner") : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedStep.data.action?.value &&
                          !teamMembers.find((m) => m.memberId === selectedStep.data.action?.value) && (
                          <div className="flex gap-1.5 mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                            <p className="text-[11px] text-amber-700">{t("chatbotUi.missingMember")}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Input value={selectedStep.data.action?.value || ""}
                        onChange={(e) => updateStep(selectedStep.id, { action: { type: selectedStep.data.action?.type || "set_tag", value: e.target.value } })}
                        placeholder={
                          selectedStep.data.action?.type === "set_tag" ? t("builderFeedback.tagExample") :
                          selectedStep.data.action?.type === "set_status" ? "open / resolved / pending" :
                          selectedStep.data.action?.type === "set_pipeline" ? t("builderFeedback.stageNameOrId") :
                          t("builderFeedback.enterValue")
                        }
                        className="text-sm border-gray-200" data-testid={`input-action-value-${selectedStep.id}`} />
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
