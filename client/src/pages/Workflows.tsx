import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import { 
  Zap, Plus, Trash2, Edit2, ToggleLeft, ToggleRight, 
  ArrowRight, User, Tag, Clock, FileText, ChevronDown,
  Loader2, Crown, Mail, Users, X, 
  MessageSquare, GitBranch, Webhook, ChevronRight,
  Sparkles, LayoutTemplate, MoveUp, MoveDown,
  CheckCircle2, ArrowDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const TRIGGER_TYPES = [
  { value: "new_chat", label: "New Chat Created", icon: MessageSquare, description: "Triggers when a new conversation starts", color: "bg-blue-50 text-blue-600 border-blue-200" },
  { value: "keyword", label: "Keyword Detected", icon: Tag, description: "Triggers when a message contains specific keywords", color: "bg-purple-50 text-purple-600 border-purple-200" },
  { value: "tag_change", label: "Tag Changed", icon: GitBranch, description: "Triggers when a chat's tag is changed", color: "bg-orange-50 text-orange-600 border-orange-200" },
];

const ACTION_CATEGORIES = [
  {
    label: "CRM",
    color: "bg-blue-50 text-blue-700",
    actions: [
      { value: "assign", label: "Assign to Team Member", icon: User, description: "Route to a specific agent or round robin" },
      { value: "tag", label: "Set Tag", icon: Tag, description: "Apply a label to the contact" },
      { value: "set_status", label: "Set Status", icon: CheckCircle2, description: "Change conversation status" },
      { value: "set_pipeline", label: "Set Pipeline Stage", icon: ArrowRight, description: "Move contact to a pipeline stage" },
    ],
  },
  {
    label: "Tasks",
    color: "bg-green-50 text-green-700",
    actions: [
      { value: "add_note", label: "Add Note", icon: FileText, description: "Attach a note to the conversation" },
      { value: "set_followup", label: "Set Follow-up", icon: Clock, description: "Schedule a future follow-up reminder" },
    ],
  },
];

const ALL_ACTIONS = ACTION_CATEGORIES.flatMap(c => c.actions);

const TAGS = ["New", "Hot", "Quoted", "Paid", "Waiting", "Lost"];
const STATUSES = ["open", "pending", "resolved", "closed"];
const PIPELINE_STAGES = ["Lead", "Contacted", "Proposal", "Negotiation", "Closed"];
const FOLLOWUP_DAYS = ["1", "3", "7", "14", "30"];

// ─── Templates ────────────────────────────────────────────────────────────────

const WORKFLOW_TEMPLATES = [
  {
    id: "assign-leads",
    name: "Assign New Leads",
    description: "Automatically assign every new chat using round robin",
    icon: User,
    color: "bg-blue-50 border-blue-200",
    iconColor: "text-blue-600",
    triggerType: "new_chat",
    triggerConditions: {},
    actions: [{ type: "assign", value: "round_robin" }, { type: "tag", value: "New" }],
  },
  {
    id: "tag-route",
    name: "Tag and Route Leads",
    description: "Tag new chats and move them to the first pipeline stage",
    icon: Tag,
    color: "bg-purple-50 border-purple-200",
    iconColor: "text-purple-600",
    triggerType: "new_chat",
    triggerConditions: {},
    actions: [{ type: "tag", value: "New" }, { type: "set_pipeline", value: "Lead" }],
  },
  {
    id: "keyword-followup",
    name: "Keyword Follow-up",
    description: "Set a follow-up when a contact mentions a keyword",
    icon: MessageSquare,
    color: "bg-orange-50 border-orange-200",
    iconColor: "text-orange-600",
    triggerType: "keyword",
    triggerConditions: { keywords: ["price", "quote"] },
    actions: [{ type: "set_followup", value: "3" }, { type: "set_pipeline", value: "Proposal" }],
  },
  {
    id: "closed-won",
    name: "Close Won",
    description: "Mark paid leads and resolve the conversation",
    icon: CheckCircle2,
    color: "bg-green-50 border-green-200",
    iconColor: "text-green-600",
    triggerType: "tag_change",
    triggerConditions: {},
    actions: [{ type: "tag", value: "Paid" }, { type: "set_status", value: "resolved" }, { type: "set_pipeline", value: "Closed" }],
  },
];

const SEQUENCE_TEMPLATES = [
  {
    id: "lead-nurture",
    name: "Basic Lead Nurture",
    description: "3-step follow-up over 5 days",
    icon: Zap,
    color: "bg-blue-50 border-blue-200",
    iconColor: "text-blue-600",
    steps: [
      { delayMinutes: 0, messageContent: "Hi! Thanks for reaching out. I wanted to follow up and see if you have any questions I can help with." },
      { delayMinutes: 2880, messageContent: "Just checking in! Let me know if you'd like to learn more or schedule a call." },
      { delayMinutes: 7200, messageContent: "One last follow-up — happy to chat whenever you're ready. Looking forward to connecting!" },
    ],
  },
  {
    id: "re-engagement",
    name: "Re-engagement Follow-up",
    description: "Win back silent contacts over 2 weeks",
    icon: MessageSquare,
    color: "bg-purple-50 border-purple-200",
    iconColor: "text-purple-600",
    steps: [
      { delayMinutes: 0, messageContent: "Hey! We haven't heard from you in a while. Still interested? We'd love to help." },
      { delayMinutes: 4320, messageContent: "Just a quick nudge — our offer still stands. Let me know if you want to chat!" },
      { delayMinutes: 10080, messageContent: "Final check-in! If now isn't the right time, no worries — we're here whenever you're ready." },
    ],
  },
  {
    id: "appointment-reminder",
    name: "Appointment Reminder",
    description: "Confirm upcoming appointments automatically",
    icon: Clock,
    color: "bg-green-50 border-green-200",
    iconColor: "text-green-600",
    steps: [
      { delayMinutes: 0, messageContent: "Hi! This is a friendly reminder about your upcoming appointment. Reply to confirm or let me know if you need to reschedule." },
      { delayMinutes: 1440, messageContent: "Just confirming your appointment is tomorrow. We look forward to seeing you!" },
    ],
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  triggerType: string;
  triggerConditions: any;
  actions: any[];
  executionCount: number;
  lastExecutedAt: string | null;
  createdAt: string;
}

interface WorkflowAction {
  type: string;
  value: string;
}

interface DripCampaign {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  triggerType: string;
  triggerConfig: any;
  createdAt: string;
  updatedAt: string;
  steps?: DripStep[];
  enrollments?: DripEnrollment[];
}

interface DripStep {
  id: string;
  campaignId: string;
  stepOrder: number;
  delayMinutes: number;
  messageContent: string;
  messageType: string;
  templateId: string | null;
  createdAt: string;
}

interface DripEnrollment {
  id: string;
  campaignId: string;
  chatId: string;
  currentStepOrder: number;
  status: string;
  enrolledAt: string;
  nextSendAt: string | null;
  completedAt: string | null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActionPickerPanel({ onSelect, onClose }: { onSelect: (type: string) => void; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-10 bg-white rounded-lg flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b">
        <h3 className="font-semibold text-gray-900">Choose an action</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-md">
          <X className="h-4 w-4 text-gray-500" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {ACTION_CATEGORIES.map((cat) => (
          <div key={cat.label}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{cat.label}</p>
            <div className="space-y-1">
              {cat.actions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.value}
                    onClick={() => { onSelect(action.value); onClose(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left transition-colors group"
                  >
                    <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-gray-200 transition-colors">
                      <Icon className="h-4 w-4 text-gray-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{action.label}</p>
                      <p className="text-xs text-gray-500 truncate">{action.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-400 ml-auto shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionBlock({
  action,
  index,
  total,
  teamMembers,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  action: WorkflowAction;
  index: number;
  total: number;
  teamMembers: any[];
  onUpdate: (field: "type" | "value", value: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const actionDef = ALL_ACTIONS.find(a => a.value === action.type);
  const Icon = actionDef?.icon || FileText;

  const renderValueInput = () => {
    switch (action.type) {
      case "assign":
        return (
          <Select value={action.value} onValueChange={(v) => onUpdate("value", v)}>
            <SelectTrigger className="h-8 text-sm flex-1" data-testid={`select-action-assign-${index}`}>
              <SelectValue placeholder="Select method..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="round_robin">Round Robin</SelectItem>
              {teamMembers.filter((m: any) => m.status === "active").map((m: any) => (
                <SelectItem key={m.id} value={m.memberId || m.id}>{m.name || m.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "tag":
        return (
          <Select value={action.value} onValueChange={(v) => onUpdate("value", v)}>
            <SelectTrigger className="h-8 text-sm flex-1" data-testid={`select-action-tag-${index}`}>
              <SelectValue placeholder="Select tag..." />
            </SelectTrigger>
            <SelectContent>
              {TAGS.map(tag => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case "set_status":
        return (
          <Select value={action.value} onValueChange={(v) => onUpdate("value", v)}>
            <SelectTrigger className="h-8 text-sm flex-1" data-testid={`select-action-status-${index}`}>
              <SelectValue placeholder="Select status..." />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case "set_pipeline":
        return (
          <Select value={action.value} onValueChange={(v) => onUpdate("value", v)}>
            <SelectTrigger className="h-8 text-sm flex-1" data-testid={`select-action-pipeline-${index}`}>
              <SelectValue placeholder="Select stage..." />
            </SelectTrigger>
            <SelectContent>
              {PIPELINE_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case "add_note":
        return (
          <Input
            value={action.value}
            onChange={(e) => onUpdate("value", e.target.value)}
            placeholder="Note text..."
            className="h-8 text-sm flex-1"
            data-testid={`input-action-note-${index}`}
          />
        );
      case "set_followup":
        return (
          <Select value={action.value} onValueChange={(v) => onUpdate("value", v)}>
            <SelectTrigger className="h-8 text-sm flex-1" data-testid={`select-action-followup-${index}`}>
              <SelectValue placeholder="Days..." />
            </SelectTrigger>
            <SelectContent>
              {FOLLOWUP_DAYS.map(d => <SelectItem key={d} value={d}>{d} day{d !== "1" ? "s" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative flex gap-3">
      <div className="flex flex-col items-center">
        <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-gray-600" />
        </div>
        {index < total - 1 && (
          <div className="w-px flex-1 bg-gray-200 my-1" />
        )}
      </div>
      <div className="flex-1 pb-3">
        <div className="border border-gray-200 rounded-lg bg-white p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{actionDef?.label || "Action"}</p>
            <div className="flex items-center gap-0.5">
              {index > 0 && (
                <button onClick={onMoveUp} className="p-1 hover:bg-gray-100 rounded" title="Move up">
                  <MoveUp className="h-3 w-3 text-gray-400" />
                </button>
              )}
              {index < total - 1 && (
                <button onClick={onMoveDown} className="p-1 hover:bg-gray-100 rounded" title="Move down">
                  <MoveDown className="h-3 w-3 text-gray-400" />
                </button>
              )}
              <button onClick={onRemove} className="p-1 hover:bg-red-50 rounded ml-1" title="Remove">
                <Trash2 className="h-3 w-3 text-red-400" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-500 w-14 shrink-0">Value</p>
            {renderValueInput()}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowSummary({ triggerType, actions, keywords }: { triggerType: string; actions: WorkflowAction[]; keywords: string }) {
  const trigger = TRIGGER_TYPES.find(t => t.value === triggerType);
  const validActions = actions.filter(a => a.value);
  if (!trigger || validActions.length === 0) return null;

  const actionPhrases = validActions.map(a => {
    const def = ALL_ACTIONS.find(d => d.value === a.type);
    if (!def) return "";
    switch (a.type) {
      case "assign": return `assign via ${a.value === "round_robin" ? "round robin" : a.value}`;
      case "tag": return `add tag "${a.value}"`;
      case "set_status": return `set status to "${a.value}"`;
      case "set_pipeline": return `move to "${a.value}" stage`;
      case "add_note": return `add a note`;
      case "set_followup": return `schedule ${a.value}-day follow-up`;
      default: return def.label.toLowerCase();
    }
  }).filter(Boolean);

  const triggerPhrase = triggerType === "keyword"
    ? `a keyword (${keywords || "..."}) is detected`
    : trigger.label.toLowerCase();

  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Summary</p>
      <p className="text-sm text-amber-900">
        When <span className="font-medium">{triggerPhrase}</span>, {actionPhrases.join(", then ")}.
      </p>
    </div>
  );
}

function StartScreen({ type, onScratch, onTemplate }: { type: "workflow" | "sequence"; onScratch: () => void; onTemplate: (tpl: any) => void }) {
  const templates = type === "workflow" ? WORKFLOW_TEMPLATES : SEQUENCE_TEMPLATES;
  return (
    <div className="space-y-5 py-2">
      <button
        onClick={onScratch}
        className="w-full flex items-center gap-4 p-4 border-2 border-dashed border-gray-200 rounded-xl hover:border-brand-green hover:bg-green-50/50 transition-colors text-left group"
        data-testid="button-start-scratch"
      >
        <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center group-hover:bg-green-100 transition-colors">
          <Plus className="h-5 w-5 text-gray-500 group-hover:text-brand-green" />
        </div>
        <div>
          <p className="font-semibold text-gray-900">Start from scratch</p>
          <p className="text-sm text-gray-500">Build your own {type} step by step</p>
        </div>
      </button>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          <LayoutTemplate className="h-3.5 w-3.5 inline mr-1 mb-0.5" />
          Quick templates
        </p>
        <div className="grid grid-cols-2 gap-3">
          {templates.map((tpl) => {
            const Icon = tpl.icon;
            return (
              <button
                key={tpl.id}
                onClick={() => onTemplate(tpl)}
                className={cn(
                  "flex flex-col items-start gap-2 p-4 border rounded-xl text-left hover:shadow-sm transition-all",
                  tpl.color
                )}
                data-testid={`button-template-${tpl.id}`}
              >
                <div className={cn("h-8 w-8 rounded-lg bg-white/60 flex items-center justify-center", tpl.iconColor)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 leading-snug">{tpl.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{tpl.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function Workflows() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("workflows");

  // Workflow dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [wfBuilderStep, setWfBuilderStep] = useState<"start" | "builder">("start");
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null);
  const [showActionPicker, setShowActionPicker] = useState(false);

  // Workflow form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("new_chat");
  const [keywords, setKeywords] = useState("");
  const [actions, setActions] = useState<WorkflowAction[]>([{ type: "assign", value: "round_robin" }]);

  // Drip campaign dialog state
  const [isDripDialogOpen, setIsDripDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<DripCampaign | null>(null);
  const [dripBuilderStep, setDripBuilderStep] = useState<"start" | "builder">("start");
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [campaignSteps, setCampaignSteps] = useState<Array<{ delayMinutes: number; messageContent: string }>>([
    { delayMinutes: 0, messageContent: "" }
  ]);

  // Enroll chat dialog
  const [isEnrollDialogOpen, setIsEnrollDialogOpen] = useState(false);
  const [enrollCampaignId, setEnrollCampaignId] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState("");

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: workflows = [], isLoading, error } = useQuery<Workflow[]>({
    queryKey: ["/api/workflows"],
    retry: false,
  });

  const { data: dripCampaigns = [], isLoading: isLoadingCampaigns } = useQuery<DripCampaign[]>({
    queryKey: ["/api/drip-campaigns"],
    retry: false,
  });

  const { data: chats = [] } = useQuery<any[]>({
    queryKey: ["/api/chats"],
    retry: false,
  });

  const { data: teamMembers = [] } = useQuery<any[]>({
    queryKey: ["/api/team/members"],
    retry: false,
  });

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createWorkflowMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/workflows", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow created successfully" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateWorkflowMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/workflows/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow updated successfully" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteWorkflowMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/workflows/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleWorkflowMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/workflows/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createCampaignMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/drip-campaigns", data);
      return res.json();
    },
    onSuccess: async (campaign) => {
      for (let i = 0; i < campaignSteps.length; i++) {
        const step = campaignSteps[i];
        if (step.messageContent.trim()) {
          await apiRequest("POST", `/api/drip-campaigns/${campaign.id}/steps`, {
            stepOrder: i + 1,
            delayMinutes: step.delayMinutes,
            messageContent: step.messageContent,
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] });
      toast({ title: "Campaign created successfully" });
      resetCampaignForm();
      setIsDripDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateCampaignMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/drip-campaigns/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] });
      toast({ title: "Campaign updated successfully" });
      resetCampaignForm();
      setIsDripDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/drip-campaigns/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] });
      toast({ title: "Campaign deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleCampaignMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/drip-campaigns/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const enrollChatMutation = useMutation({
    mutationFn: async ({ campaignId, chatId }: { campaignId: string; chatId: string }) => {
      const res = await apiRequest("POST", `/api/drip-campaigns/${campaignId}/enroll`, { chatId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] });
      toast({ title: "Contact enrolled in campaign" });
      setIsEnrollDialogOpen(false);
      setSelectedChatId("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const cancelEnrollmentMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      const res = await apiRequest("POST", `/api/drip-enrollments/${enrollmentId}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] });
      toast({ title: "Enrollment cancelled" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const resetForm = () => {
    setName("");
    setDescription("");
    setTriggerType("new_chat");
    setKeywords("");
    setActions([{ type: "assign", value: "round_robin" }]);
    setEditingWorkflow(null);
    setWfBuilderStep("start");
    setShowActionPicker(false);
  };

  const resetCampaignForm = () => {
    setCampaignName("");
    setCampaignDescription("");
    setCampaignSteps([{ delayMinutes: 0, messageContent: "" }]);
    setEditingCampaign(null);
    setDripBuilderStep("start");
  };

  const openEditDialog = (workflow: Workflow) => {
    setEditingWorkflow(workflow);
    setName(workflow.name);
    setDescription(workflow.description || "");
    setTriggerType(workflow.triggerType);
    setKeywords(workflow.triggerConditions?.keywords?.join(", ") || "");
    setActions(workflow.actions as WorkflowAction[] || [{ type: "assign", value: "round_robin" }]);
    setWfBuilderStep("builder");
    setIsDialogOpen(true);
  };

  const openEditCampaignDialog = async (campaign: DripCampaign) => {
    try {
      const res = await apiRequest("GET", `/api/drip-campaigns/${campaign.id}`);
      const fullCampaign = await res.json();
      setEditingCampaign(fullCampaign);
      setCampaignName(fullCampaign.name);
      setCampaignDescription(fullCampaign.description || "");
      if (fullCampaign.steps && fullCampaign.steps.length > 0) {
        setCampaignSteps(fullCampaign.steps.map((s: DripStep) => ({
          delayMinutes: s.delayMinutes,
          messageContent: s.messageContent,
        })));
      }
      setDripBuilderStep("builder");
      setIsDripDialogOpen(true);
    } catch {
      toast({ title: "Error loading campaign", variant: "destructive" });
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({ title: "Please enter a workflow name", variant: "destructive" });
      return;
    }
    const triggerConditions: any = {};
    if (triggerType === "keyword" && keywords.trim()) {
      triggerConditions.keywords = keywords.split(",").map(k => k.trim()).filter(Boolean);
    }
    const data = {
      name,
      description: description || null,
      triggerType,
      triggerConditions,
      actions: actions.filter(a => a.value),
    };
    if (editingWorkflow) {
      updateWorkflowMutation.mutate({ id: editingWorkflow.id, ...data });
    } else {
      createWorkflowMutation.mutate(data);
    }
  };

  const handleCampaignSubmit = () => {
    if (!campaignName.trim()) {
      toast({ title: "Please enter a campaign name", variant: "destructive" });
      return;
    }
    const validSteps = campaignSteps.filter(s => s.messageContent.trim());
    if (validSteps.length === 0) {
      toast({ title: "Please add at least one message step", variant: "destructive" });
      return;
    }
    const data = {
      name: campaignName,
      description: campaignDescription || null,
      triggerType: "manual",
    };
    if (editingCampaign) {
      updateCampaignMutation.mutate({ id: editingCampaign.id, ...data });
    } else {
      createCampaignMutation.mutate(data);
    }
  };

  const addAction = (type: string) => {
    setActions([...actions, { type, value: type === "assign" ? "round_robin" : "" }]);
  };

  const updateAction = (index: number, field: "type" | "value", value: string) => {
    const newActions = [...actions];
    newActions[index] = { ...newActions[index], [field]: value };
    if (field === "type") newActions[index].value = "";
    setActions(newActions);
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const moveAction = (from: number, to: number) => {
    const arr = [...actions];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    setActions(arr);
  };

  const addCampaignStep = () => {
    setCampaignSteps([...campaignSteps, { delayMinutes: 1440, messageContent: "" }]);
  };

  const updateCampaignStep = (index: number, field: "delayMinutes" | "messageContent", value: any) => {
    const newSteps = [...campaignSteps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setCampaignSteps(newSteps);
  };

  const removeCampaignStep = (index: number) => {
    if (campaignSteps.length > 1) {
      setCampaignSteps(campaignSteps.filter((_, i) => i !== index));
    }
  };

  const formatDelay = (minutes: number) => {
    if (minutes === 0) return "Immediately";
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} hr`;
    return `${Math.round(minutes / 1440)} day${Math.round(minutes / 1440) > 1 ? "s" : ""}`;
  };

  const applyWorkflowTemplate = (tpl: any) => {
    setName(tpl.name);
    setDescription(tpl.description);
    setTriggerType(tpl.triggerType);
    setKeywords(tpl.triggerConditions?.keywords?.join(", ") || "");
    setActions(tpl.actions);
    setWfBuilderStep("builder");
  };

  const applySequenceTemplate = (tpl: any) => {
    setCampaignName(tpl.name);
    setCampaignDescription(tpl.description);
    setCampaignSteps(tpl.steps);
    setDripBuilderStep("builder");
  };

  const isUpgradeRequired = error && (error as any).message?.includes("Pro plan");

  // ─── Upgrade Gate ─────────────────────────────────────────────────────────

  if (isUpgradeRequired) {
    return (
      <div className="flex flex-col h-full">
        <Helmet><title>Workflows | WhachatCRM</title></Helmet>
        <div className="p-4 sm:p-6 border-b border-gray-200 bg-gray-50">
          <h1 className="text-xl sm:text-2xl font-display font-bold text-gray-900">Workflows</h1>
          <p className="text-sm text-gray-500 mt-1">Automate your chat management</p>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <Crown className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Pro Feature</h2>
            <p className="text-gray-600 mb-6">
              Workflow automation is available on the Pro plan. Upgrade to automate chat assignments, tagging, and more.
            </p>
            <Link href="/pricing">
              <Button className="bg-brand-green hover:bg-brand-green/90">Upgrade to Pro</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Render ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <Helmet><title>Automation | WhachatCRM</title></Helmet>

      {/* Page Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-brand-green/10 flex items-center justify-center">
            <Zap className="h-5 w-5 text-brand-green" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Automation</h1>
            <p className="text-xs text-gray-500">Workflows &amp; drip sequences</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="border-b border-gray-200 px-4 sm:px-6 bg-white">
          <TabsList className="h-12 bg-transparent border-0 p-0 gap-6">
            <TabsTrigger
              value="workflows"
              className="h-12 px-0 border-b-2 border-transparent data-[state=active]:border-brand-green data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none text-sm font-medium"
            >
              <Zap className="h-4 w-4 mr-2" />
              Workflows
            </TabsTrigger>
            <TabsTrigger
              value="drip"
              className="h-12 px-0 border-b-2 border-transparent data-[state=active]:border-brand-green data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none text-sm font-medium"
            >
              <Mail className="h-4 w-4 mr-2" />
              Drip Sequences
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Workflows Tab ── */}
        <TabsContent value="workflows" className="flex-1 overflow-auto m-0">
          <div className="p-4 sm:p-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-gray-500">
                {workflows.length > 0 ? `${workflows.length} workflow${workflows.length !== 1 ? "s" : ""}` : ""}
              </p>
              <Button
                onClick={() => { resetForm(); setIsDialogOpen(true); }}
                className="bg-brand-green hover:bg-brand-green/90 h-9"
                data-testid="button-create-workflow"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                New Workflow
              </Button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-7 w-7 animate-spin text-gray-300" />
              </div>
            ) : workflows.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-7 w-7 text-gray-300" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">No workflows yet</h3>
                <p className="text-sm text-gray-500 mb-5 max-w-xs mx-auto">Create your first workflow to automate repetitive tasks like assignment and tagging.</p>
                <Button
                  onClick={() => { resetForm(); setIsDialogOpen(true); }}
                  className="bg-brand-green hover:bg-brand-green/90"
                  data-testid="button-create-workflow-empty"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Create Workflow
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {workflows.map((workflow) => {
                  const trigger = TRIGGER_TYPES.find(t => t.value === workflow.triggerType);
                  return (
                    <Collapsible
                      key={workflow.id}
                      open={expandedWorkflow === workflow.id}
                      onOpenChange={(open) => setExpandedWorkflow(open ? workflow.id : null)}
                    >
                      <div className={cn(
                        "border rounded-xl transition-all overflow-hidden",
                        workflow.isActive ? "border-gray-200 bg-white shadow-sm" : "border-gray-100 bg-gray-50"
                      )}>
                        <div className="p-4 flex items-center gap-3">
                          <div className={cn(
                            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                            workflow.isActive ? "bg-brand-green/10" : "bg-gray-100"
                          )}>
                            <Zap className={cn("h-5 w-5", workflow.isActive ? "text-brand-green" : "text-gray-300")} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={cn("font-semibold text-sm truncate", workflow.isActive ? "text-gray-900" : "text-gray-400")}>
                                {workflow.name}
                              </p>
                              {!workflow.isActive && (
                                <Badge variant="outline" className="text-xs text-gray-400 border-gray-200 shrink-0">Paused</Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 truncate">
                              {trigger?.label}
                              {workflow.executionCount > 0 && ` · ${workflow.executionCount} runs`}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => toggleWorkflowMutation.mutate({ id: workflow.id, isActive: !workflow.isActive })}
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                              data-testid={`button-toggle-workflow-${workflow.id}`}
                              title={workflow.isActive ? "Pause" : "Activate"}
                            >
                              {workflow.isActive
                                ? <ToggleRight className="h-5 w-5 text-brand-green" />
                                : <ToggleLeft className="h-5 w-5 text-gray-300" />}
                            </button>
                            <button
                              onClick={() => openEditDialog(workflow)}
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                              data-testid={`button-edit-workflow-${workflow.id}`}
                              title="Edit"
                            >
                              <Edit2 className="h-4 w-4 text-gray-400" />
                            </button>
                            <button
                              onClick={() => deleteWorkflowMutation.mutate(workflow.id)}
                              className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                              data-testid={`button-delete-workflow-${workflow.id}`}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-red-400" />
                            </button>
                            <CollapsibleTrigger asChild>
                              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                                <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform duration-200", expandedWorkflow === workflow.id && "rotate-180")} />
                              </button>
                            </CollapsibleTrigger>
                          </div>
                        </div>

                        <CollapsibleContent>
                          <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Actions</p>
                              {(workflow.actions as WorkflowAction[])?.map((action, i) => {
                                const def = ALL_ACTIONS.find(a => a.value === action.type);
                                const Icon = def?.icon || FileText;
                                return (
                                  <div key={i} className="flex items-center gap-2 text-sm">
                                    <Icon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                    <span className="text-gray-700">{def?.label}</span>
                                    <ArrowRight className="h-3 w-3 text-gray-300" />
                                    <span className="text-gray-500 capitalize">{action.value}</span>
                                  </div>
                                );
                              })}
                            </div>
                            {workflow.lastExecutedAt && (
                              <p className="text-xs text-gray-400 mt-3">
                                Last run: {new Date(workflow.lastExecutedAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Drip Sequences Tab ── */}
        <TabsContent value="drip" className="flex-1 overflow-auto m-0">
          <div className="p-4 sm:p-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-gray-500">
                {dripCampaigns.length > 0 ? `${dripCampaigns.length} sequence${dripCampaigns.length !== 1 ? "s" : ""}` : ""}
              </p>
              <Button
                onClick={() => { resetCampaignForm(); setIsDripDialogOpen(true); }}
                className="bg-brand-green hover:bg-brand-green/90 h-9"
                data-testid="button-create-campaign"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                New Sequence
              </Button>
            </div>

            {isLoadingCampaigns ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-7 w-7 animate-spin text-gray-300" />
              </div>
            ) : dripCampaigns.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <Mail className="h-7 w-7 text-gray-300" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">No sequences yet</h3>
                <p className="text-sm text-gray-500 mb-5 max-w-xs mx-auto">Create automated message sequences to nurture leads over time with scheduled follow-ups.</p>
                <Button
                  onClick={() => { resetCampaignForm(); setIsDripDialogOpen(true); }}
                  className="bg-brand-green hover:bg-brand-green/90"
                  data-testid="button-create-campaign-empty"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Create Sequence
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {dripCampaigns.map((campaign) => (
                  <Collapsible
                    key={campaign.id}
                    open={expandedCampaign === campaign.id}
                    onOpenChange={(open) => setExpandedCampaign(open ? campaign.id : null)}
                  >
                    <div className={cn(
                      "border rounded-xl transition-all overflow-hidden",
                      campaign.isActive ? "border-gray-200 bg-white shadow-sm" : "border-gray-100 bg-gray-50"
                    )}>
                      <div className="p-4 flex items-center gap-3">
                        <div className={cn(
                          "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                          campaign.isActive ? "bg-blue-50" : "bg-gray-100"
                        )}>
                          <Mail className={cn("h-5 w-5", campaign.isActive ? "text-blue-500" : "text-gray-300")} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={cn("font-semibold text-sm truncate", campaign.isActive ? "text-gray-900" : "text-gray-400")}>
                              {campaign.name}
                            </p>
                            {!campaign.isActive && (
                              <Badge variant="outline" className="text-xs text-gray-400 border-gray-200 shrink-0">Paused</Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            {campaign.steps?.length || 0} step{(campaign.steps?.length || 0) !== 1 ? "s" : ""}
                            {campaign.enrollments && campaign.enrollments.filter(e => e.status === "active").length > 0 && (
                              <span className="ml-2">· {campaign.enrollments.filter(e => e.status === "active").length} active</span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setEnrollCampaignId(campaign.id); setIsEnrollDialogOpen(true); }}
                            disabled={!campaign.isActive}
                            className="h-7 text-xs px-2.5"
                          >
                            <Users className="h-3 w-3 mr-1" />
                            Enroll
                          </Button>
                          <button
                            onClick={() => toggleCampaignMutation.mutate({ id: campaign.id, isActive: !campaign.isActive })}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            data-testid={`button-toggle-campaign-${campaign.id}`}
                          >
                            {campaign.isActive
                              ? <ToggleRight className="h-5 w-5 text-brand-green" />
                              : <ToggleLeft className="h-5 w-5 text-gray-300" />}
                          </button>
                          <button
                            onClick={() => openEditCampaignDialog(campaign)}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            data-testid={`button-edit-campaign-${campaign.id}`}
                          >
                            <Edit2 className="h-4 w-4 text-gray-400" />
                          </button>
                          <button
                            onClick={() => deleteCampaignMutation.mutate(campaign.id)}
                            className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                            data-testid={`button-delete-campaign-${campaign.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </button>
                          <CollapsibleTrigger asChild>
                            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                              <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform duration-200", expandedCampaign === campaign.id && "rotate-180")} />
                            </button>
                          </CollapsibleTrigger>
                        </div>
                      </div>

                      <CollapsibleContent>
                        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-4">
                          {campaign.steps && campaign.steps.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Steps</p>
                              <div className="space-y-2">
                                {campaign.steps.map((step, i) => (
                                  <div key={step.id} className="flex items-start gap-3">
                                    <div className="flex flex-col items-center">
                                      <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold shrink-0">
                                        {i + 1}
                                      </div>
                                      {i < (campaign.steps?.length || 0) - 1 && <div className="w-px h-4 bg-gray-200 mt-1" />}
                                    </div>
                                    <div className="flex-1 pb-2">
                                      <p className="text-xs text-gray-500 mb-0.5">
                                        <Clock className="h-3 w-3 inline mr-1" />{formatDelay(step.delayMinutes)} after previous
                                      </p>
                                      <p className="text-sm text-gray-700 line-clamp-2">{step.messageContent}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {campaign.enrollments && campaign.enrollments.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Enrolled Contacts</p>
                              <div className="space-y-1.5">
                                {campaign.enrollments.map((enrollment) => {
                                  const chat = chats.find(c => c.id === enrollment.chatId);
                                  return (
                                    <div key={enrollment.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                                      <div className="flex items-center gap-2">
                                        <div className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                                          <User className="h-3.5 w-3.5 text-gray-500" />
                                        </div>
                                        <div>
                                          <p className="text-sm font-medium">{chat?.name || "Unknown"}</p>
                                          <p className="text-xs text-gray-500">Step {enrollment.currentStepOrder} · {enrollment.status}</p>
                                        </div>
                                      </div>
                                      {enrollment.status === "active" && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => cancelEnrollmentMutation.mutate(enrollment.id)}
                                          className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                                        >
                                          <X className="h-3 w-3 mr-1" />Cancel
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Workflow Builder Dialog ── */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsDialogOpen(open); }}>
        <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* Dialog header */}
          <DialogHeader className="px-5 pt-5 pb-4 border-b shrink-0">
            <div className="flex items-center gap-2">
              {wfBuilderStep === "builder" && !editingWorkflow && (
                <button
                  onClick={() => setWfBuilderStep("start")}
                  className="p-1 hover:bg-gray-100 rounded-md mr-1"
                >
                  <ChevronDown className="h-4 w-4 text-gray-500 -rotate-90" />
                </button>
              )}
              <div>
                <DialogTitle className="text-base">
                  {editingWorkflow ? "Edit Workflow" : wfBuilderStep === "start" ? "New Workflow" : "Build Workflow"}
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  {wfBuilderStep === "start"
                    ? "Start from scratch or use a quick template"
                    : "Set your trigger and define what happens next"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Dialog body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 relative">
            {wfBuilderStep === "start" ? (
              <StartScreen
                type="workflow"
                onScratch={() => setWfBuilderStep("builder")}
                onTemplate={applyWorkflowTemplate}
              />
            ) : (
              <>
                {showActionPicker && (
                  <ActionPickerPanel
                    onSelect={(type) => addAction(type)}
                    onClose={() => setShowActionPicker(false)}
                  />
                )}

                <div className="space-y-5">
                  {/* Name + Description */}
                  <div className="grid gap-3">
                    <div>
                      <Label className="text-xs font-medium text-gray-600">Workflow name</Label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Auto-assign new leads"
                        className="mt-1 h-9"
                        data-testid="input-workflow-name"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-gray-600">Description <span className="text-gray-400">(optional)</span></Label>
                      <Input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What does this workflow do?"
                        className="mt-1 h-9"
                      />
                    </div>
                  </div>

                  {/* WHEN block */}
                  <div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className="h-5 w-5 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
                        <span className="text-white text-xs font-bold leading-none">W</span>
                      </div>
                      <p className="text-xs font-bold text-gray-900 uppercase tracking-widest">When</p>
                    </div>

                    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3">
                      <div>
                        <Label className="text-xs text-gray-500 mb-1.5 block">Trigger</Label>
                        <Select value={triggerType} onValueChange={setTriggerType}>
                          <SelectTrigger className="h-9 text-sm bg-white" data-testid="select-trigger-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TRIGGER_TYPES.map(t => {
                              const Icon = t.icon;
                              return (
                                <SelectItem key={t.value} value={t.value}>
                                  <div className="flex items-center gap-2">
                                    <Icon className="h-4 w-4" />
                                    <span>{t.label}</span>
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      {triggerType === "keyword" && (
                        <div>
                          <Label className="text-xs text-gray-500 mb-1.5 block">Keywords <span className="text-gray-400">(comma separated)</span></Label>
                          <Input
                            value={keywords}
                            onChange={(e) => setKeywords(e.target.value)}
                            placeholder="price, quote, order"
                            className="h-9 text-sm bg-white"
                            data-testid="input-keywords"
                          />
                        </div>
                      )}

                      <p className="text-xs text-gray-400 italic">
                        {TRIGGER_TYPES.find(t => t.value === triggerType)?.description}
                      </p>
                    </div>
                  </div>

                  {/* THEN blocks */}
                  <div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className="h-5 w-5 rounded-full bg-brand-green flex items-center justify-center shrink-0">
                        <span className="text-white text-xs font-bold leading-none">T</span>
                      </div>
                      <p className="text-xs font-bold text-gray-900 uppercase tracking-widest">Then</p>
                    </div>

                    <div className="space-y-0">
                      {actions.map((action, index) => (
                        <ActionBlock
                          key={index}
                          action={action}
                          index={index}
                          total={actions.length}
                          teamMembers={teamMembers}
                          onUpdate={(field, value) => updateAction(index, field, value)}
                          onRemove={() => removeAction(index)}
                          onMoveUp={() => moveAction(index, index - 1)}
                          onMoveDown={() => moveAction(index, index + 1)}
                        />
                      ))}

                      <button
                        onClick={() => setShowActionPicker(true)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-brand-green hover:text-brand-green transition-colors mt-1"
                        data-testid="button-add-action"
                      >
                        <Plus className="h-4 w-4" />
                        Add action
                      </button>
                    </div>
                  </div>

                  {/* Human-readable summary */}
                  <WorkflowSummary triggerType={triggerType} actions={actions} keywords={keywords} />
                </div>
              </>
            )}
          </div>

          {wfBuilderStep === "builder" && (
            <DialogFooter className="px-5 py-3 border-t shrink-0 gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="h-9">Cancel</Button>
              <Button
                onClick={handleSubmit}
                disabled={createWorkflowMutation.isPending || updateWorkflowMutation.isPending}
                className="bg-brand-green hover:bg-brand-green/90 h-9"
                data-testid="button-save-workflow"
              >
                {(createWorkflowMutation.isPending || updateWorkflowMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingWorkflow ? "Save changes" : "Create workflow"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Drip Sequence Builder Dialog ── */}
      <Dialog open={isDripDialogOpen} onOpenChange={(open) => { if (!open) resetCampaignForm(); setIsDripDialogOpen(open); }}>
        <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-4 border-b shrink-0">
            <div className="flex items-center gap-2">
              {dripBuilderStep === "builder" && !editingCampaign && (
                <button
                  onClick={() => setDripBuilderStep("start")}
                  className="p-1 hover:bg-gray-100 rounded-md mr-1"
                >
                  <ChevronDown className="h-4 w-4 text-gray-500 -rotate-90" />
                </button>
              )}
              <div>
                <DialogTitle className="text-base">
                  {editingCampaign ? "Edit Sequence" : dripBuilderStep === "start" ? "New Sequence" : "Build Sequence"}
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  {dripBuilderStep === "start"
                    ? "Start from scratch or use a quick template"
                    : "Define your message steps and timing"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {dripBuilderStep === "start" ? (
              <StartScreen
                type="sequence"
                onScratch={() => setDripBuilderStep("builder")}
                onTemplate={applySequenceTemplate}
              />
            ) : (
              <div className="space-y-5">
                {/* Name + Description */}
                <div className="grid gap-3">
                  <div>
                    <Label className="text-xs font-medium text-gray-600">Sequence name</Label>
                    <Input
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      placeholder="e.g., Welcome Series"
                      className="mt-1 h-9"
                      data-testid="input-campaign-name"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-600">Description <span className="text-gray-400">(optional)</span></Label>
                    <Input
                      value={campaignDescription}
                      onChange={(e) => setCampaignDescription(e.target.value)}
                      placeholder="What's this sequence for?"
                      className="mt-1 h-9"
                    />
                  </div>
                </div>

                {/* Steps */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                      <span className="text-white text-xs font-bold leading-none">S</span>
                    </div>
                    <p className="text-xs font-bold text-gray-900 uppercase tracking-widest">Steps</p>
                  </div>

                  <div className="space-y-0">
                    {campaignSteps.map((step, index) => (
                      <div key={index} className="relative flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                            {index + 1}
                          </div>
                          {index < campaignSteps.length - 1 && (
                            <div className="w-px flex-1 bg-blue-100 my-1" />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="border border-gray-200 rounded-xl bg-white p-3.5 space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                {index === 0 ? "First message" : `Step ${index + 1}`}
                              </p>
                              {campaignSteps.length > 1 && (
                                <button onClick={() => removeCampaignStep(index)} className="p-1 hover:bg-red-50 rounded">
                                  <Trash2 className="h-3 w-3 text-red-400" />
                                </button>
                              )}
                            </div>

                            <div>
                              <Label className="text-xs text-gray-500 mb-1 block">
                                <Clock className="h-3 w-3 inline mr-1" />
                                {index === 0 ? "Send" : "Wait, then send"}
                              </Label>
                              <Select
                                value={String(step.delayMinutes)}
                                onValueChange={(v) => updateCampaignStep(index, "delayMinutes", parseInt(v))}
                              >
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0">Immediately</SelectItem>
                                  <SelectItem value="5">After 5 minutes</SelectItem>
                                  <SelectItem value="30">After 30 minutes</SelectItem>
                                  <SelectItem value="60">After 1 hour</SelectItem>
                                  <SelectItem value="180">After 3 hours</SelectItem>
                                  <SelectItem value="360">After 6 hours</SelectItem>
                                  <SelectItem value="720">After 12 hours</SelectItem>
                                  <SelectItem value="1440">After 1 day</SelectItem>
                                  <SelectItem value="2880">After 2 days</SelectItem>
                                  <SelectItem value="4320">After 3 days</SelectItem>
                                  <SelectItem value="10080">After 1 week</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label className="text-xs text-gray-500 mb-1 block">
                                <MessageSquare className="h-3 w-3 inline mr-1" />
                                Message
                              </Label>
                              <Textarea
                                value={step.messageContent}
                                onChange={(e) => updateCampaignStep(index, "messageContent", e.target.value)}
                                placeholder="Enter your message..."
                                className="text-sm resize-none"
                                rows={3}
                                data-testid={`input-step-message-${index}`}
                              />
                            </div>
                          </div>

                          {index < campaignSteps.length - 1 && (
                            <div className="flex items-center justify-center py-1">
                              <ArrowDown className="h-3.5 w-3.5 text-blue-300" />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={addCampaignStep}
                      className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors mt-1"
                      data-testid="button-add-step"
                    >
                      <Plus className="h-4 w-4" />
                      Add step
                    </button>
                  </div>
                </div>

                {/* Sequence summary */}
                {campaignSteps.filter(s => s.messageContent.trim()).length > 0 && (
                  <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Summary</p>
                    <p className="text-sm text-blue-900">
                      Send <span className="font-medium">{campaignSteps.filter(s => s.messageContent.trim()).length} messages</span> over{" "}
                      <span className="font-medium">
                        {formatDelay(campaignSteps.reduce((sum, s) => sum + s.delayMinutes, 0))}
                      </span>.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {dripBuilderStep === "builder" && (
            <DialogFooter className="px-5 py-3 border-t shrink-0 gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setIsDripDialogOpen(false)} className="h-9">Cancel</Button>
              <Button
                onClick={handleCampaignSubmit}
                disabled={createCampaignMutation.isPending || updateCampaignMutation.isPending}
                className="bg-brand-green hover:bg-brand-green/90 h-9"
                data-testid="button-save-campaign"
              >
                {(createCampaignMutation.isPending || updateCampaignMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingCampaign ? "Save changes" : "Create sequence"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Enroll Chat Dialog ── */}
      <Dialog open={isEnrollDialogOpen} onOpenChange={setIsEnrollDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enroll Contact</DialogTitle>
            <DialogDescription>Select a contact to add to this message sequence</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-sm">Select Contact</Label>
            <Select value={selectedChatId} onValueChange={setSelectedChatId}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Choose a contact..." />
              </SelectTrigger>
              <SelectContent>
                {chats.filter(c => c.whatsappPhone).map((chat) => (
                  <SelectItem key={chat.id} value={chat.id}>
                    {chat.name} {chat.whatsappPhone && `(${chat.whatsappPhone})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {chats.filter(c => c.whatsappPhone).length === 0 && (
              <p className="text-sm text-gray-500 mt-2">No contacts with WhatsApp numbers available.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEnrollDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => { if (enrollCampaignId && selectedChatId) enrollChatMutation.mutate({ campaignId: enrollCampaignId, chatId: selectedChatId }); }}
              disabled={!selectedChatId || enrollChatMutation.isPending}
              className="bg-brand-green hover:bg-brand-green/90"
            >
              {enrollChatMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enroll
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
