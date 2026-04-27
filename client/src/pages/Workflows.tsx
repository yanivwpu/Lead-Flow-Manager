import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import {
  Zap, Plus, Trash2, Edit2, ToggleLeft, ToggleRight,
  ArrowRight, User, Tag, Clock, FileText, ChevronDown,
  Loader2, Mail, Users, X,
  MessageSquare, GitBranch, Webhook, ChevronRight,
  Sparkles, LayoutTemplate, MoveUp, MoveDown,
  CheckCircle2, ArrowDown, ArrowLeft,
  BellOff, PenLine,
  MessageCircle, Instagram, Facebook, Smartphone, Globe, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/lib/subscription-context";
import { UpgradeModal, type UpgradeReason } from "@/components/UpgradeModal";

// ─── Channel Config ───────────────────────────────────────────────────────────

const CHANNELS = [
  { value: "any",       label: "Any Channel", icon: Globe,          iconColor: "#6B7280", color: "bg-gray-100 text-gray-700 border-gray-300" },
  { value: "whatsapp",  label: "WhatsApp",    icon: MessageCircle,  iconColor: "#25D366", color: "bg-green-50 text-green-700 border-green-300" },
  { value: "facebook",  label: "Messenger",   icon: Facebook,       iconColor: "#1877F2", color: "bg-blue-50 text-blue-700 border-blue-300" },
  { value: "instagram", label: "Instagram",   icon: Instagram,      iconColor: "#E4405F", color: "bg-pink-50 text-pink-700 border-pink-300" },
  { value: "webchat",   label: "Web Chat",    icon: Globe,          iconColor: "#3B82F6", color: "bg-indigo-50 text-indigo-700 border-indigo-300" },
  { value: "sms",       label: "SMS",         icon: Smartphone,     iconColor: "#6B7280", color: "bg-purple-50 text-purple-700 border-purple-300" },
  { value: "telegram",  label: "Telegram",    icon: Send,           iconColor: "#0088CC", color: "bg-sky-50 text-sky-700 border-sky-300" },
];

// ─── Trigger Config ───────────────────────────────────────────────────────────

const TRIGGER_GROUPS = [
  {
    label: "Conversations",
    triggers: [
      { value: "new_chat",    label: "New Chat Created",    icon: MessageSquare, description: "A brand new conversation is started", hasChannel: true },
      { value: "new_message", label: "New Message Received", icon: Mail,         description: "An inbound message arrives",           hasChannel: true },
    ],
  },
  {
    label: "CRM",
    triggers: [
      { value: "tag_added",       label: "Tag Added",               icon: Tag,        description: "A tag is applied to a contact",      hasChannel: false },
      { value: "tag_removed",     label: "Tag Removed",             icon: Tag,        description: "A tag is removed from a contact",    hasChannel: false },
      { value: "pipeline_change", label: "Pipeline Stage Changed",  icon: ArrowRight, description: "Contact moves to a pipeline stage",  hasChannel: false },
    ],
  },
  {
    label: "Timing",
    triggers: [
      { value: "no_reply", label: "No Reply For", icon: BellOff, description: "No response after a set duration", hasChannel: true },
    ],
  },
  {
    label: "Message Logic",
    triggers: [
      { value: "keyword", label: "Keyword Detected", icon: PenLine, description: "A message contains a keyword", hasChannel: true },
    ],
  },
  {
    label: "Integrations",
    triggers: [
      { value: "webhook",        label: "Webhook Received", icon: Webhook,  description: "An external system sends a webhook", hasChannel: false },
      { value: "form_submitted", label: "Form Submitted",   icon: FileText, description: "A lead form or widget is submitted",  hasChannel: false },
    ],
  },
];

const ALL_TRIGGERS = TRIGGER_GROUPS.flatMap(g => g.triggers);

/** Starter (Basic Automations): integration triggers remain Pro-only in the UI until backend tiers exist. */
const PRO_ONLY_AUTOMATION_TRIGGERS = new Set<string>(["webhook", "form_submitted"]);

function normalizeTriggerType(raw: string): string {
  if (raw === "tag_change") return "tag_added";
  return raw;
}

// ─── Action Config ────────────────────────────────────────────────────────────

const ACTION_CATEGORIES = [
  {
    label: "CRM",
    actions: [
      { value: "assign",       label: "Assign to Team Member", icon: User,         description: "Route to an agent or round robin" },
      { value: "tag",          label: "Set Tag",               icon: Tag,          description: "Apply a label to the contact" },
      { value: "set_status",   label: "Set Status",            icon: CheckCircle2, description: "Change conversation status" },
      { value: "set_pipeline", label: "Set Pipeline Stage",    icon: ArrowRight,   description: "Move contact to a pipeline stage" },
    ],
  },
  {
    label: "Tasks",
    actions: [
      { value: "add_note",    label: "Add Note",     icon: FileText, description: "Attach a note to the conversation" },
      { value: "set_followup", label: "Set Follow-up", icon: Clock,   description: "Schedule a future follow-up" },
    ],
  },
];

const ALL_ACTIONS = ACTION_CATEGORIES.flatMap(c => c.actions);

const TAGS           = ["New", "Hot", "Quoted", "Paid", "Waiting", "Lost"];
const STATUSES       = ["open", "pending", "resolved", "closed"];
const PIPELINE_STAGES = ["Lead", "Contacted", "Proposal", "Negotiation", "Closed"];
const FOLLOWUP_DAYS  = ["1", "3", "7", "14", "30"];

// ─── Templates ────────────────────────────────────────────────────────────────

const WORKFLOW_TEMPLATES = [
  {
    id: "assign-leads", name: "Assign New Leads", description: "Auto-assign every new chat via round robin",
    icon: User, color: "bg-blue-50 border-blue-200", iconColor: "text-blue-600",
    triggerType: "new_chat", triggerChannel: "any", triggerConditions: {},
    actions: [{ type: "assign", value: "round_robin" }, { type: "tag", value: "New" }],
  },
  {
    id: "tag-route", name: "Tag and Route Leads", description: "Tag new chats and move them to the pipeline",
    icon: Tag, color: "bg-purple-50 border-purple-200", iconColor: "text-purple-600",
    triggerType: "new_chat", triggerChannel: "any", triggerConditions: {},
    actions: [{ type: "tag", value: "New" }, { type: "set_pipeline", value: "Lead" }],
  },
  {
    id: "keyword-followup", name: "Keyword Follow-up", description: "Set a follow-up when a keyword is detected",
    icon: PenLine, color: "bg-orange-50 border-orange-200", iconColor: "text-orange-600",
    triggerType: "keyword", triggerChannel: "any", triggerConditions: { keywords: ["price", "quote"] },
    actions: [{ type: "set_followup", value: "3" }, { type: "set_pipeline", value: "Proposal" }],
  },
  {
    id: "closed-won", name: "Close Won", description: "Mark paid leads and resolve the conversation",
    icon: CheckCircle2, color: "bg-green-50 border-green-200", iconColor: "text-green-600",
    triggerType: "tag_added", triggerChannel: "any", triggerConditions: {},
    actions: [{ type: "tag", value: "Paid" }, { type: "set_status", value: "resolved" }, { type: "set_pipeline", value: "Closed" }],
  },
];

const SEQUENCE_TEMPLATES = [
  {
    id: "lead-nurture", name: "Basic Lead Nurture", description: "3-step follow-up over 5 days",
    icon: Zap, color: "bg-blue-50 border-blue-200", iconColor: "text-blue-600",
    steps: [
      { delayMinutes: 0,    messageContent: "Hi! Thanks for reaching out. I wanted to follow up and see if you have any questions." },
      { delayMinutes: 2880, messageContent: "Just checking in! Let me know if you'd like to learn more or schedule a call." },
      { delayMinutes: 7200, messageContent: "One last follow-up — happy to chat whenever you're ready!" },
    ],
  },
  {
    id: "re-engagement", name: "Re-engagement Follow-up", description: "Win back silent contacts over 2 weeks",
    icon: MessageSquare, color: "bg-purple-50 border-purple-200", iconColor: "text-purple-600",
    steps: [
      { delayMinutes: 0,     messageContent: "Hey! We haven't heard from you in a while. Still interested? We'd love to help." },
      { delayMinutes: 4320,  messageContent: "Just a quick nudge — our offer still stands. Let me know if you want to chat!" },
      { delayMinutes: 10080, messageContent: "Final check-in! We're here whenever you're ready." },
    ],
  },
  {
    id: "appointment-reminder", name: "Appointment Reminder", description: "Confirm upcoming appointments automatically",
    icon: Clock, color: "bg-green-50 border-green-200", iconColor: "text-green-600",
    steps: [
      { delayMinutes: 0,    messageContent: "Hi! Friendly reminder about your upcoming appointment. Reply to confirm or reschedule." },
      { delayMinutes: 1440, messageContent: "Just confirming your appointment is tomorrow. We look forward to seeing you!" },
    ],
  },
];

// ─── Condition Config ─────────────────────────────────────────────────────────

interface WorkflowCondition {
  id: string;
  type: "channel" | "keyword" | "tag" | "stage";
  value: string;
}

const CONDITION_TYPES = [
  { value: "channel", label: "Channel",  placeholder: "Select channel" },
  { value: "keyword", label: "Keyword",  placeholder: "e.g. price, quote" },
  { value: "tag",     label: "Tag",      placeholder: "Select tag" },
  { value: "stage",   label: "Stage",    placeholder: "Select stage" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Workflow {
  id: string; name: string; description: string | null;
  isActive: boolean; triggerType: string; triggerConditions: any;
  actions: any[]; executionCount: number; lastExecutedAt: string | null; createdAt: string;
}
interface WorkflowAction { type: string; value: string; }
interface DripCampaign {
  id: string; userId: string; name: string; description: string | null;
  isActive: boolean; triggerType: string; triggerConfig: any;
  createdAt: string; updatedAt: string; steps?: DripStep[]; enrollments?: DripEnrollment[];
}
interface DripStep {
  id: string; campaignId: string; stepOrder: number;
  delayMinutes: number; messageContent: string; messageType: string;
  templateId: string | null; createdAt: string;
}
interface DripEnrollment {
  id: string; campaignId: string; chatId: string; currentStepOrder: number;
  status: string; enrolledAt: string; nextSendAt: string | null; completedAt: string | null;
}

// ─── View state type ──────────────────────────────────────────────────────────

type ViewState = "list" | "wf-start" | "wf-builder" | "seq-start" | "seq-builder";

// ─── Channel Chip ─────────────────────────────────────────────────────────────

function ChannelChip({ value, selected, onClick }: { value: string; selected: boolean; onClick: () => void }) {
  const ch = CHANNELS.find(c => c.value === value)!;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all whitespace-nowrap",
        selected
          ? cn(ch.color, "shadow-sm font-semibold")
          : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
      )}
    >
      <ch.icon className="w-3.5 h-3.5 shrink-0" style={{ color: ch.iconColor }} />
      <span>{ch.label}</span>
    </button>
  );
}

function StarterPlanAutomationsBanner({ onUpgradePro }: { onUpgradePro: () => void }) {
  return (
    <div className="px-4 sm:px-6 py-3 bg-amber-50/90 border-b border-amber-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-amber-950">
      <p>
        You're on Starter — Basic Automations enabled. Upgrade to Pro for Advanced Automations.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 border-amber-200 bg-white hover:bg-amber-50 text-amber-950"
        onClick={onUpgradePro}
      >
        Upgrade to Pro
      </Button>
    </div>
  );
}

// ─── Trigger Popover (anchored to "Change" button) ────────────────────────────

function TriggerPicker({
  current,
  onSelect,
  lockProTriggers,
  onProTriggerLocked,
}: {
  current: string;
  onSelect: (v: string) => void;
  lockProTriggers?: boolean;
  onProTriggerLocked?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const normalized = normalizeTriggerType(current);
  const def = ALL_TRIGGERS.find(t => t.value === normalized);
  const Icon = def?.icon || Zap;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 w-full text-left"
          data-testid="button-choose-trigger"
        >
          <div className="h-8 w-8 rounded-lg bg-brand-green/10 flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 text-brand-green" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{def?.label || "Choose a trigger"}</p>
            <p className="text-xs text-gray-500">{def?.description || "Click to select a trigger event"}</p>
          </div>
          <span className="text-xs text-brand-green font-medium px-2 py-1 rounded hover:bg-brand-green/5 shrink-0">
            {def ? "Change" : "Select →"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" sideOffset={8} className="w-80 p-0 max-h-[480px] overflow-y-auto">
        <div className="px-3 py-2.5 border-b bg-gray-50/80">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Choose trigger event</p>
        </div>
        <div className="p-2 space-y-3">
          {TRIGGER_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 py-1">{group.label}</p>
              {group.triggers.map((trigger) => {
                const TIcon = trigger.icon;
                const isActive = normalized === trigger.value;
                const locked = !!(lockProTriggers && PRO_ONLY_AUTOMATION_TRIGGERS.has(trigger.value));
                return (
                  <button
                    key={trigger.value}
                    type="button"
                    onClick={() => {
                      if (locked) {
                        onProTriggerLocked?.();
                        return;
                      }
                      onSelect(trigger.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors",
                      locked ? "opacity-70 hover:bg-gray-50/80" : isActive ? "bg-brand-green/8 text-brand-green" : "hover:bg-gray-50"
                    )}
                  >
                    <div className={cn("h-7 w-7 rounded-md flex items-center justify-center shrink-0", isActive ? "bg-brand-green/10" : "bg-gray-100")}>
                      <TIcon className={cn("h-3.5 w-3.5", isActive ? "text-brand-green" : "text-gray-500")} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium", isActive ? "text-brand-green" : "text-gray-800")}>{trigger.label}</p>
                      <p className="text-[11px] text-gray-500 truncate">{trigger.description}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {locked && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-semibold border-amber-200 bg-white text-amber-900">
                          Advanced
                        </Badge>
                      )}
                      {isActive && <CheckCircle2 className="h-3.5 w-3.5 text-brand-green" />}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Action Popover (anchored to "Add action" button) ────────────────────────

function ActionPickerPopover({ onSelect }: { onSelect: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm text-gray-400 hover:border-brand-green hover:text-brand-green transition-colors mt-2"
          data-testid="button-add-action"
        >
          <Plus className="h-4 w-4" />
          Add action
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" side="bottom" sideOffset={8} className="w-72 p-0 max-h-[400px] overflow-y-auto">
        <div className="px-3 py-2.5 border-b bg-gray-50/80">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Choose an action</p>
        </div>
        <div className="p-2 space-y-3">
          {ACTION_CATEGORIES.map((cat) => (
            <div key={cat.label}>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 py-1">{cat.label}</p>
              {cat.actions.map((action) => {
                const AIcon = action.icon;
                return (
                  <button
                    key={action.value}
                    onClick={() => { onSelect(action.value); setOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-gray-50 text-left transition-colors group"
                  >
                    <div className="h-7 w-7 rounded-md bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-gray-200">
                      <AIcon className="h-3.5 w-3.5 text-gray-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{action.label}</p>
                      <p className="text-[11px] text-gray-500 truncate">{action.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Action Block Card ────────────────────────────────────────────────────────

function ActionBlock({
  action, index, total, teamMembers, onUpdate, onRemove, onMoveUp, onMoveDown,
}: {
  action: WorkflowAction; index: number; total: number; teamMembers: any[];
  onUpdate: (field: "type" | "value", value: string) => void;
  onRemove: () => void; onMoveUp: () => void; onMoveDown: () => void;
}) {
  const def = ALL_ACTIONS.find(a => a.value === action.type);
  const Icon = def?.icon || FileText;

  // For "assign": value === "round_robin" means round robin, any other value is a userId (specific user)
  const assignMethod = action.type === "assign"
    ? (action.value === "round_robin" ? "round_robin" : "specific")
    : null;

  const renderValue = () => {
    switch (action.type) {
      case "assign":
        return (
          <div className="flex-1 space-y-2">
            {/* Method selector */}
            <Select
              value={assignMethod || "round_robin"}
              onValueChange={(v) => {
                if (v === "round_robin") onUpdate("value", "round_robin");
                else onUpdate("value", ""); // clear until user picks a person
              }}
            >
              <SelectTrigger className="h-8 text-sm bg-gray-50 border-gray-200" data-testid={`select-action-assign-method-${index}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="round_robin">Round Robin</SelectItem>
                <SelectItem value="specific">Specific User</SelectItem>
              </SelectContent>
            </Select>
            {/* User dropdown — only when Specific User is chosen */}
            {assignMethod === "specific" && (
              <Select
                value={action.value || undefined}
                onValueChange={(v) => onUpdate("value", v)}
              >
                <SelectTrigger className="h-8 text-sm bg-gray-50 border-gray-200" data-testid={`select-action-assign-user-${index}`}>
                  <SelectValue placeholder="Select team member..." />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.filter((m: any) => m.status === "active").map((m: any) => (
                    <SelectItem key={m.id} value={String(m.memberId || m.id)}>{m.name || m.email}</SelectItem>
                  ))}
                  {teamMembers.filter((m: any) => m.status === "active").length === 0 && (
                    <div className="px-3 py-2 text-xs text-gray-400">No active members found</div>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        );
      case "tag":
        return (
          <Select value={action.value} onValueChange={(v) => onUpdate("value", v)}>
            <SelectTrigger className="h-8 text-sm flex-1 bg-gray-50 border-gray-200" data-testid={`select-action-tag-${index}`}>
              <SelectValue placeholder="Select tag..." />
            </SelectTrigger>
            <SelectContent>
              {TAGS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case "set_status":
        return (
          <Select value={action.value} onValueChange={(v) => onUpdate("value", v)}>
            <SelectTrigger className="h-8 text-sm flex-1 bg-gray-50 border-gray-200" data-testid={`select-action-status-${index}`}>
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
            <SelectTrigger className="h-8 text-sm flex-1 bg-gray-50 border-gray-200" data-testid={`select-action-pipeline-${index}`}>
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
            className="h-8 text-sm flex-1 bg-gray-50 border-gray-200"
            data-testid={`input-action-note-${index}`}
          />
        );
      case "set_followup":
        return (
          <Select value={action.value} onValueChange={(v) => onUpdate("value", v)}>
            <SelectTrigger className="h-8 text-sm flex-1 bg-gray-50 border-gray-200" data-testid={`select-action-followup-${index}`}>
              <SelectValue placeholder="Days..." />
            </SelectTrigger>
            <SelectContent>
              {FOLLOWUP_DAYS.map(d => <SelectItem key={d} value={d}>{d} day{d !== "1" ? "s" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      default: return null;
    }
  };

  return (
    <div className="flex gap-4 items-start">
      {/* left rail: icon + connector line */}
      <div className="flex flex-col items-center pt-1">
        <div className="h-9 w-9 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-gray-500" />
        </div>
        {index < total - 1 && (
          <div className="w-px flex-1 bg-gray-100 mt-2 mb-0 min-h-[16px]" />
        )}
      </div>

      {/* card */}
      <div className="flex-1 pb-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{def?.label || "Action"}</p>
            <div className="flex items-center gap-0.5 shrink-0">
              {index > 0 && (
                <button onClick={onMoveUp} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="Move up">
                  <MoveUp className="h-3.5 w-3.5 text-gray-400" />
                </button>
              )}
              {index < total - 1 && (
                <button onClick={onMoveDown} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="Move down">
                  <MoveDown className="h-3.5 w-3.5 text-gray-400" />
                </button>
              )}
              <button onClick={onRemove} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors ml-0.5" title="Remove">
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </button>
            </div>
          </div>
          {/* Assign renders two stacked selects; all others render a single row */}
          {action.type === "assign" ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Assignment method</Label>
              {renderValue()}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Label className="text-xs text-gray-500 w-12 shrink-0">Value</Label>
              {renderValue()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Conditions Block ─────────────────────────────────────────────────────────

function ConditionsBlock({
  conditions,
  onAdd,
  onUpdate,
  onRemove,
}: {
  conditions: WorkflowCondition[];
  onAdd: () => void;
  onUpdate: (id: string, field: "type" | "value", value: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Conditions <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 font-bold text-[10px]">{conditions.length || "0"}</span>
        </p>
        <span className="text-[11px] text-gray-400">All conditions must match</span>
      </div>

      <div className="p-4 space-y-3">
        {conditions.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">
            No conditions — workflow runs on every trigger event.
          </p>
        )}

        {conditions.map((cond) => (
          <div key={cond.id} className="flex items-center gap-2">
            {/* Type selector */}
            <Select
              value={cond.type}
              onValueChange={(v) => onUpdate(cond.id, "type", v as any)}
            >
              <SelectTrigger className="h-8 text-sm w-32 shrink-0 bg-gray-50 border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>

            <span className="text-xs text-gray-400 shrink-0">is</span>

            {/* Value selector — varies by type */}
            {cond.type === "channel" && (
              <Select value={cond.value} onValueChange={(v) => onUpdate(cond.id, "value", v)}>
                <SelectTrigger className="h-8 text-sm flex-1 bg-gray-50 border-gray-200">
                  <SelectValue placeholder="Select channel..." />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.filter(c => c.value !== "any").map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className="flex items-center gap-1.5">
                        <c.icon className="w-3.5 h-3.5 shrink-0" style={{ color: c.iconColor }} />
                        <span>{c.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {cond.type === "keyword" && (
              <Input
                value={cond.value}
                onChange={(e) => onUpdate(cond.id, "value", e.target.value)}
                placeholder="e.g. price, quote"
                className="h-8 text-sm flex-1 bg-gray-50 border-gray-200"
              />
            )}

            {cond.type === "tag" && (
              <Select value={cond.value} onValueChange={(v) => onUpdate(cond.id, "value", v)}>
                <SelectTrigger className="h-8 text-sm flex-1 bg-gray-50 border-gray-200">
                  <SelectValue placeholder="Select tag..." />
                </SelectTrigger>
                <SelectContent>
                  {TAGS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {cond.type === "stage" && (
              <Select value={cond.value} onValueChange={(v) => onUpdate(cond.id, "value", v)}>
                <SelectTrigger className="h-8 text-sm flex-1 bg-gray-50 border-gray-200">
                  <SelectValue placeholder="Select stage..." />
                </SelectTrigger>
                <SelectContent>
                  {PIPELINE_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            <button
              onClick={() => onRemove(cond.id)}
              className="p-1.5 hover:bg-red-50 rounded-lg transition-colors shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-brand-green transition-colors"
          data-testid="button-add-condition"
        >
          <Plus className="h-3.5 w-3.5" />
          Add condition
        </button>
      </div>
    </div>
  );
}

// ─── Trigger Config Block ─────────────────────────────────────────────────────

function TriggerConfigBlock({
  triggerType, triggerKeywords, triggerTag, triggerToStage, triggerDuration,
  onSelectTrigger, onChangeKeywords, onChangeTag, onChangeToStage, onChangeDuration,
  lockProTriggers,
  onProTriggerLocked,
}: {
  triggerType: string; triggerKeywords: string;
  triggerTag: string; triggerToStage: string; triggerDuration: string;
  onSelectTrigger: (v: string) => void;
  onChangeKeywords: (v: string) => void;
  onChangeTag: (v: string) => void; onChangeToStage: (v: string) => void;
  onChangeDuration: (v: string) => void;
  lockProTriggers?: boolean;
  onProTriggerLocked?: () => void;
}) {
  const normalized = normalizeTriggerType(triggerType);
  const def = ALL_TRIGGERS.find(t => t.value === normalized);
  // Does this trigger need any config at all?
  const hasConfig = normalized === "keyword" || normalized === "tag_added" || normalized === "tag_removed"
    || normalized === "pipeline_change" || normalized === "no_reply";

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Trigger selector row */}
      <div className="px-4 py-3.5 border-b border-gray-100 bg-gray-50/50">
        <TriggerPicker
          current={triggerType}
          onSelect={onSelectTrigger}
          lockProTriggers={lockProTriggers}
          onProTriggerLocked={onProTriggerLocked}
        />
      </div>

      {/* Config area (only for triggers that need it) */}
      {def && hasConfig && (
        <div className="px-4 py-4 space-y-4">
          {/* Keyword */}
          {normalized === "keyword" && (
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">Keywords <span className="text-gray-400 font-normal">(comma separated)</span></Label>
              <Input value={triggerKeywords} onChange={(e) => onChangeKeywords(e.target.value)} placeholder="e.g. price, quote, tour" className="h-9 text-sm bg-gray-50 border-gray-200" data-testid="input-keywords" />
            </div>
          )}

          {/* Tag */}
          {(normalized === "tag_added" || normalized === "tag_removed") && (
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">Tag <span className="text-gray-400 font-normal">(which tag fires this)</span></Label>
              <Select value={triggerTag} onValueChange={onChangeTag}>
                <SelectTrigger className="h-9 text-sm bg-gray-50 border-gray-200" data-testid="select-trigger-tag">
                  <SelectValue placeholder="Any tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any tag</SelectItem>
                  {TAGS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Pipeline stage */}
          {normalized === "pipeline_change" && (
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">Moves to stage <span className="text-gray-400 font-normal">(which stage fires this)</span></Label>
              <Select value={triggerToStage} onValueChange={onChangeToStage}>
                <SelectTrigger className="h-9 text-sm bg-gray-50 border-gray-200" data-testid="select-trigger-stage">
                  <SelectValue placeholder="Any stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any stage</SelectItem>
                  {PIPELINE_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* No reply duration */}
          {normalized === "no_reply" && (
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">After no reply for</Label>
              <Select value={triggerDuration} onValueChange={onChangeDuration}>
                <SelectTrigger className="h-9 text-sm bg-gray-50 border-gray-200" data-testid="select-trigger-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[["1","1 hour"],["2","2 hours"],["4","4 hours"],["8","8 hours"],["12","12 hours"],["24","24 hours"],["48","48 hours"],["72","3 days"]].map(([v,l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Workflow Summary ─────────────────────────────────────────────────────────

function WorkflowSummary({
  triggerType, triggerKeywords, triggerTag, triggerToStage, triggerDuration, conditions, actions,
}: {
  triggerType: string; triggerKeywords: string; triggerTag: string;
  triggerToStage: string; triggerDuration: string;
  conditions: WorkflowCondition[]; actions: WorkflowAction[];
}) {
  const normalized = normalizeTriggerType(triggerType);
  const def = ALL_TRIGGERS.find(t => t.value === normalized);
  const validActions = actions.filter(a => a.value);
  if (!def || validActions.length === 0) return null;

  const phrases = validActions.map(a => {
    switch (a.type) {
      case "assign": return a.value === "round_robin" ? "assign via round robin" : `assign to team member`;
      case "tag": return `add tag "${a.value}"`;
      case "set_status": return `set status to "${a.value}"`;
      case "set_pipeline": return `move to "${a.value}" stage`;
      case "add_note": return "add a note";
      case "set_followup": return `schedule ${a.value}-day follow-up`;
      default: return "";
    }
  }).filter(Boolean);

  let triggerPhrase = def.label.toLowerCase();
  if (normalized === "keyword" && triggerKeywords) triggerPhrase += ` matching "${triggerKeywords.split(",")[0].trim()}"`;
  if ((normalized === "tag_added" || normalized === "tag_removed") && triggerTag && triggerTag !== "any") triggerPhrase += ` (${triggerTag})`;
  if (normalized === "pipeline_change" && triggerToStage && triggerToStage !== "any") triggerPhrase += ` (→ ${triggerToStage})`;
  if (normalized === "no_reply" && triggerDuration) triggerPhrase += ` for ${triggerDuration}h`;

  const conditionPhrases = conditions.filter(c => c.value).map(c => {
    if (c.type === "channel") { const ch = CHANNELS.find(x => x.value === c.value); return ch ? ch.label : c.value; }
    if (c.type === "keyword") return `keyword contains "${c.value}"`;
    if (c.type === "tag") return `tag is "${c.value}"`;
    if (c.type === "stage") return `stage is "${c.value}"`;
    return "";
  }).filter(Boolean);

  return (
    <div className="rounded-2xl bg-amber-50 border border-amber-200 px-5 py-4">
      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1.5">What this does</p>
      <p className="text-sm text-amber-900 leading-relaxed">
        When <span className="font-semibold">{triggerPhrase}</span>
        {conditionPhrases.length > 0 && (
          <>, if <span className="font-semibold">{conditionPhrases.join(" and ")}</span></>
        )}
        , {phrases.join(", then ")}.
      </p>
    </div>
  );
}

// ─── Start Screen ─────────────────────────────────────────────────────────────

function StartScreen({ type, onScratch, onTemplate }: { type: "workflow" | "sequence"; onScratch: () => void; onTemplate: (tpl: any) => void }) {
  const templates = type === "workflow" ? WORKFLOW_TEMPLATES : SEQUENCE_TEMPLATES;
  return (
    <div className="space-y-6 py-2">
      <button
        onClick={onScratch}
        className="w-full flex items-center gap-4 p-5 border-2 border-dashed border-gray-200 rounded-2xl hover:border-brand-green hover:bg-green-50/30 transition-all text-left group"
        data-testid="button-start-scratch"
      >
        <div className="h-11 w-11 rounded-xl bg-gray-100 flex items-center justify-center group-hover:bg-green-100 transition-colors shrink-0">
          <Plus className="h-5 w-5 text-gray-400 group-hover:text-brand-green" />
        </div>
        <div>
          <p className="font-semibold text-gray-900">Start from scratch</p>
          <p className="text-sm text-gray-500 mt-0.5">Build your own {type} step by step</p>
        </div>
        <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-brand-green ml-auto shrink-0" />
      </button>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <LayoutTemplate className="h-3.5 w-3.5" />Quick templates
        </p>
        <div className="grid grid-cols-2 gap-3">
          {templates.map((tpl) => {
            const Icon = tpl.icon;
            return (
              <button
                key={tpl.id}
                onClick={() => onTemplate(tpl)}
                className={cn("flex flex-col items-start gap-3 p-4 border rounded-2xl text-left hover:shadow-md transition-all", tpl.color)}
                data-testid={`button-template-${tpl.id}`}
              >
                <div className={cn("h-9 w-9 rounded-xl bg-white/70 flex items-center justify-center", tpl.iconColor)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 leading-snug">{tpl.name}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{tpl.description}</p>
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
  const { data: subscriptionData, isLoading: subscriptionLoading } = useSubscription();
  const limits = subscriptionData?.limits;
  const plan = limits?.plan ?? "free";
  const workflowsEnabled = limits?.workflowsEnabled ?? false;
  const isStarterPlan = plan === "starter";

  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason>("automations_paid_plan");

  const openPaidAutomationsUpgrade = () => {
    setUpgradeReason("automations_paid_plan");
    setUpgradeModalOpen(true);
  };

  const openAdvancedAutomationsUpgrade = () => {
    setUpgradeReason("automations_upgrade_pro");
    setUpgradeModalOpen(true);
  };

  const [activeTab, setActiveTab] = useState("workflows");

  // ── View state machine ───────────────────────────────────────────────────
  const [view, setView] = useState<ViewState>("list");
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<DripCampaign | null>(null);
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);

  // ── Workflow form state ──────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [actions, setActions] = useState<WorkflowAction[]>([{ type: "assign", value: "round_robin" }]);
  const [triggerType, setTriggerType] = useState("new_chat");
  const [triggerKeywords, setTriggerKeywords] = useState("");
  const [triggerTag, setTriggerTag] = useState("any");
  const [triggerToStage, setTriggerToStage] = useState("any");
  const [triggerDuration, setTriggerDuration] = useState("24");
  const [conditions, setConditions] = useState<WorkflowCondition[]>([]);

  // ── Sequence form state ──────────────────────────────────────────────────
  const [campaignName, setCampaignName] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [campaignSteps, setCampaignSteps] = useState<Array<{ delayMinutes: number; messageContent: string }>>([
    { delayMinutes: 0, messageContent: "" }
  ]);

  // ── Enroll dialog ────────────────────────────────────────────────────────
  const [isEnrollDialogOpen, setIsEnrollDialogOpen] = useState(false);
  const [enrollCampaignId, setEnrollCampaignId] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState("");

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: workflows = [], isLoading } = useQuery<Workflow[]>({
    queryKey: ["/api/workflows"],
    retry: false,
    enabled: workflowsEnabled && !subscriptionLoading,
  });
  const { data: dripCampaigns = [], isLoading: isLoadingCampaigns } = useQuery<DripCampaign[]>({
    queryKey: ["/api/drip-campaigns"],
    retry: false,
    enabled: workflowsEnabled && !subscriptionLoading,
  });
  const { data: chats = [] } = useQuery<any[]>({ queryKey: ["/api/chats"], retry: false });
  const { data: teamMembers = [] } = useQuery<any[]>({ queryKey: ["/api/team/members"], retry: false });

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createWorkflowMutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/workflows", data); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/workflows"] }); toast({ title: "Workflow created" }); resetWf(); setView("list"); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const updateWorkflowMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => { const r = await apiRequest("PATCH", `/api/workflows/${id}`, data); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/workflows"] }); toast({ title: "Workflow saved" }); resetWf(); setView("list"); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteWorkflowMutation = useMutation({
    mutationFn: async (id: string) => { const r = await apiRequest("DELETE", `/api/workflows/${id}`); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/workflows"] }); toast({ title: "Workflow deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const toggleWorkflowMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => { const r = await apiRequest("PATCH", `/api/workflows/${id}`, { isActive }); return r.json(); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/workflows"] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const createCampaignMutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/drip-campaigns", data); return r.json(); },
    onSuccess: async (campaign) => {
      for (let i = 0; i < campaignSteps.length; i++) {
        const step = campaignSteps[i];
        if (step.messageContent.trim()) {
          await apiRequest("POST", `/api/drip-campaigns/${campaign.id}/steps`, { stepOrder: i + 1, delayMinutes: step.delayMinutes, messageContent: step.messageContent });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] });
      toast({ title: "Sequence created" }); resetSeq(); setView("list");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const updateCampaignMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => { const r = await apiRequest("PATCH", `/api/drip-campaigns/${id}`, data); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] }); toast({ title: "Sequence saved" }); resetSeq(); setView("list"); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: string) => { const r = await apiRequest("DELETE", `/api/drip-campaigns/${id}`); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] }); toast({ title: "Sequence deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const toggleCampaignMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => { const r = await apiRequest("PATCH", `/api/drip-campaigns/${id}`, { isActive }); return r.json(); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const enrollChatMutation = useMutation({
    mutationFn: async ({ campaignId, chatId }: any) => { const r = await apiRequest("POST", `/api/drip-campaigns/${campaignId}/enroll`, { chatId }); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] }); toast({ title: "Contact enrolled" }); setIsEnrollDialogOpen(false); setSelectedChatId(""); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const cancelEnrollmentMutation = useMutation({
    mutationFn: async (id: string) => { const r = await apiRequest("POST", `/api/drip-enrollments/${id}/cancel`); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] }); toast({ title: "Enrollment cancelled" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ─── Reset helpers ────────────────────────────────────────────────────────

  const resetWf = () => {
    setName(""); setDescription(""); setTriggerType("new_chat");
    setTriggerKeywords(""); setTriggerTag("any"); setTriggerToStage("any"); setTriggerDuration("24");
    setConditions([]);
    setActions([{ type: "assign", value: "round_robin" }]); setEditingWorkflow(null);
  };
  const resetSeq = () => {
    setCampaignName(""); setCampaignDescription("");
    setCampaignSteps([{ delayMinutes: 0, messageContent: "" }]); setEditingCampaign(null);
  };

  // ─── Open edit handlers ───────────────────────────────────────────────────

  const openEditWorkflow = (wf: Workflow) => {
    setEditingWorkflow(wf);
    setName(wf.name); setDescription(wf.description || "");
    setTriggerType(normalizeTriggerType(wf.triggerType));
    const tc = wf.triggerConditions || {};
    setTriggerKeywords(tc.keywords?.join(", ") || "");
    setTriggerTag(tc.tag || "any");
    setTriggerToStage(tc.stage || "any");
    setTriggerDuration(tc.durationHours ? String(tc.durationHours) : tc.durationMinutes ? String(Math.round(tc.durationMinutes / 60)) : "24");
    // Restore saved conditions (new format) + backward-compat: lift channel from triggerConditions
    const savedConds: WorkflowCondition[] = tc.conditions || [];
    if (savedConds.length === 0 && tc.channel && tc.channel !== "any") {
      savedConds.push({ id: crypto.randomUUID(), type: "channel", value: tc.channel });
    }
    setConditions(savedConds);
    setActions(wf.actions as WorkflowAction[] || [{ type: "assign", value: "round_robin" }]);
    setActiveTab("workflows");
    setView("wf-builder");
  };

  const openEditCampaign = async (campaign: DripCampaign) => {
    try {
      const res = await apiRequest("GET", `/api/drip-campaigns/${campaign.id}`);
      const full = await res.json();
      setEditingCampaign(full);
      setCampaignName(full.name); setCampaignDescription(full.description || "");
      if (full.steps?.length) {
        setCampaignSteps(full.steps.map((s: DripStep) => ({ delayMinutes: s.delayMinutes, messageContent: s.messageContent })));
      }
      setActiveTab("drip");
      setView("seq-builder");
    } catch {
      toast({ title: "Error loading sequence", variant: "destructive" });
    }
  };

  // ─── Submit helpers ───────────────────────────────────────────────────────

  const buildTriggerConditions = () => {
    const cond: any = {};
    const normalized = normalizeTriggerType(triggerType);
    if (normalized === "keyword" && triggerKeywords.trim()) cond.keywords = triggerKeywords.split(",").map(k => k.trim()).filter(Boolean);
    if ((normalized === "tag_added" || normalized === "tag_removed") && triggerTag !== "any") cond.tag = triggerTag;
    if (normalized === "pipeline_change" && triggerToStage !== "any") cond.stage = triggerToStage;
    if (normalized === "no_reply" && triggerDuration) { cond.durationHours = parseInt(triggerDuration); cond.durationMinutes = parseInt(triggerDuration) * 60; }
    // Persist the conditions array (channel, tag, keyword, stage filters)
    const validConditions = conditions.filter(c => c.value.trim());
    if (validConditions.length > 0) cond.conditions = validConditions;
    return cond;
  };

  const serializeTriggerType = () => {
    if (triggerType === "tag_added" || triggerType === "tag_removed") return "tag_change";
    return triggerType;
  };

  const handleWfSubmit = () => {
    if (!name.trim()) { toast({ title: "Please enter a workflow name", variant: "destructive" }); return; }
    const data = { name, description: description || null, triggerType: serializeTriggerType(), triggerConditions: buildTriggerConditions(), actions: actions.filter(a => a.value) };
    if (editingWorkflow) updateWorkflowMutation.mutate({ id: editingWorkflow.id, ...data });
    else createWorkflowMutation.mutate(data);
  };

  const handleSeqSubmit = () => {
    if (!campaignName.trim()) { toast({ title: "Please enter a sequence name", variant: "destructive" }); return; }
    if (!campaignSteps.some(s => s.messageContent.trim())) { toast({ title: "Please add at least one message step", variant: "destructive" }); return; }
    const data = { name: campaignName, description: campaignDescription || null, triggerType: "manual" };
    if (editingCampaign) updateCampaignMutation.mutate({ id: editingCampaign.id, ...data });
    else createCampaignMutation.mutate(data);
  };

  // ─── Condition helpers ────────────────────────────────────────────────────

  const addCondition = () => setConditions([...conditions, { id: crypto.randomUUID(), type: "channel", value: "" }]);
  const updateCondition = (id: string, field: "type" | "value", value: string) => {
    setConditions(conditions.map(c => c.id === id ? { ...c, [field]: value, ...(field === "type" ? { value: "" } : {}) } : c));
  };
  const removeCondition = (id: string) => setConditions(conditions.filter(c => c.id !== id));

  // ─── Action helpers ───────────────────────────────────────────────────────

  const addAction = (type: string) => setActions([...actions, { type, value: type === "assign" ? "round_robin" : "" }]);
  const updateAction = (i: number, field: "type" | "value", value: string) => {
    const a = [...actions]; a[i] = { ...a[i], [field]: value }; if (field === "type") a[i].value = ""; setActions(a);
  };
  const removeAction = (i: number) => setActions(actions.filter((_, j) => j !== i));
  const moveAction = (from: number, to: number) => {
    const a = [...actions]; const [item] = a.splice(from, 1); a.splice(to, 0, item); setActions(a);
  };

  const addStep = () => setCampaignSteps([...campaignSteps, { delayMinutes: 1440, messageContent: "" }]);
  const updateStep = (i: number, field: "delayMinutes" | "messageContent", value: any) => {
    const s = [...campaignSteps]; s[i] = { ...s[i], [field]: value }; setCampaignSteps(s);
  };
  const removeStep = (i: number) => { if (campaignSteps.length > 1) setCampaignSteps(campaignSteps.filter((_, j) => j !== i)); };

  const formatDelay = (min: number) => {
    if (min === 0) return "Immediately";
    if (min < 60) return `${min} min`;
    if (min < 1440) return `${Math.round(min / 60)} hr`;
    const d = Math.round(min / 1440); return `${d} day${d > 1 ? "s" : ""}`;
  };

  const applyWfTemplate = (tpl: any) => {
    setName(tpl.name); setDescription(tpl.description);
    setTriggerType(tpl.triggerType);
    setTriggerKeywords(tpl.triggerConditions?.keywords?.join(", ") || "");
    setTriggerTag(tpl.triggerConditions?.tag || "any");
    setTriggerToStage(tpl.triggerConditions?.stage || "any");
    setTriggerDuration("24"); setActions(tpl.actions); setConditions([]);
    setView("wf-builder");
  };

  const applySeqTemplate = (tpl: any) => {
    setCampaignName(tpl.name); setCampaignDescription(tpl.description); setCampaignSteps(tpl.steps);
    setView("seq-builder");
  };

  const getTriggerLabel = (wf: Workflow) => {
    const norm = normalizeTriggerType(wf.triggerType);
    const def = ALL_TRIGGERS.find(t => t.value === norm);
    const tc = wf.triggerConditions || {};
    let label = def?.label || wf.triggerType;
    // Show channel from conditions array or legacy triggerConditions.channel
    const savedConds: WorkflowCondition[] = tc.conditions || [];
    const chCond = savedConds.find(c => c.type === "channel") || (tc.channel ? { value: tc.channel } : null);
    if (chCond) { const ch = CHANNELS.find(c => c.value === chCond.value); if (ch) label += ` · ${ch.label}`; }
    return label;
  };

  const upgradeModal = (
    <UpgradeModal
      open={upgradeModalOpen}
      onOpenChange={setUpgradeModalOpen}
      reason={upgradeReason}
      currentPlan={plan}
    />
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (subscriptionLoading) {
    return (
      <div className="flex flex-col h-full">
        <Helmet>
          <title>Automations | WhachatCRM</title>
        </Helmet>
        <div className="flex-1 flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
        </div>
      </div>
    );
  }

  if (!workflowsEnabled) {
    return (
      <div className="flex flex-col h-full">
        <Helmet>
          <title>Automations | WhachatCRM</title>
        </Helmet>
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-brand-green/10 flex items-center justify-center">
              <Zap className="h-5 w-5 text-brand-green" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Automations</h1>
              <p className="text-xs text-gray-500">Workflows and drip sequences</p>
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="text-center max-w-md space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-brand-green/10 flex items-center justify-center mx-auto">
              <Zap className="h-7 w-7 text-brand-green" />
            </div>
            <p className="text-gray-900 font-medium">Automations are available on Starter and Pro plans</p>
            <Button className="bg-brand-green hover:bg-brand-green/90" onClick={openPaidAutomationsUpgrade} data-testid="button-automations-upgrade">
              Upgrade to Starter or Pro
            </Button>
          </div>
        </div>
        {upgradeModal}
      </div>
    );
  }

  // ── Workflow Start Screen ──────────────────────────────────────────────────
  if (view === "wf-start") {
    return (
      <div className="flex flex-col h-full">
        <Helmet><title>New Workflow | WhachatCRM</title></Helmet>
        <div className="px-6 py-4 border-b bg-white flex items-center gap-3">
          <button onClick={() => { resetWf(); setView("list"); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="h-4 w-4 text-gray-500" />
          </button>
          <h1 className="text-base font-semibold text-gray-900">New Workflow</h1>
        </div>
        {isStarterPlan && <StarterPlanAutomationsBanner onUpgradePro={openAdvancedAutomationsUpgrade} />}
        <div className="flex-1 overflow-auto">
          <div className="max-w-2xl mx-auto px-6 py-8">
            <div className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Where would you like to start?</h2>
              <p className="text-sm text-gray-500">Choose a template or build from scratch</p>
            </div>
            <StartScreen type="workflow" onScratch={() => setView("wf-builder")} onTemplate={applyWfTemplate} />
          </div>
        </div>
        {upgradeModal}
      </div>
    );
  }

  // ── Sequence Start Screen ─────────────────────────────────────────────────
  if (view === "seq-start") {
    return (
      <div className="flex flex-col h-full">
        <Helmet><title>New Sequence | WhachatCRM</title></Helmet>
        <div className="px-6 py-4 border-b bg-white flex items-center gap-3">
          <button onClick={() => { resetSeq(); setView("list"); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="h-4 w-4 text-gray-500" />
          </button>
          <h1 className="text-base font-semibold text-gray-900">New Sequence</h1>
        </div>
        {isStarterPlan && <StarterPlanAutomationsBanner onUpgradePro={openAdvancedAutomationsUpgrade} />}
        <div className="flex-1 overflow-auto">
          <div className="max-w-2xl mx-auto px-6 py-8">
            <div className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Where would you like to start?</h2>
              <p className="text-sm text-gray-500">Choose a template or build from scratch</p>
            </div>
            <StartScreen type="sequence" onScratch={() => setView("seq-builder")} onTemplate={applySeqTemplate} />
          </div>
        </div>
        {upgradeModal}
      </div>
    );
  }

  // ── Workflow Builder (full page) ───────────────────────────────────────────
  if (view === "wf-builder") {
    const isSaving = createWorkflowMutation.isPending || updateWorkflowMutation.isPending;
    return (
      <div className="flex flex-col h-full bg-gray-50/40">
        <Helmet><title>{editingWorkflow ? "Edit Workflow" : "Build Workflow"} | WhachatCRM</title></Helmet>

        {/* Sticky top bar */}
        <div className="px-6 py-3.5 border-b bg-white flex items-center justify-between gap-4 shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { resetWf(); setView("list"); }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-gray-500" />
            </button>
            <div>
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">
                {editingWorkflow ? "Editing workflow" : "New workflow"}
              </p>
              <h1 className="text-base font-semibold text-gray-900 leading-tight">
                {name || "Untitled workflow"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => { resetWf(); setView("list"); }} className="h-9">
              Cancel
            </Button>
            <Button
              onClick={handleWfSubmit}
              disabled={isSaving}
              className="bg-brand-green hover:bg-brand-green/90 h-9"
              data-testid="button-save-workflow"
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingWorkflow ? "Save changes" : "Create workflow"}
            </Button>
          </div>
        </div>

        {isStarterPlan && <StarterPlanAutomationsBanner onUpgradePro={openAdvancedAutomationsUpgrade} />}

        {/* Builder body */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

            {/* Name + Description */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div>
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Workflow name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Auto-assign new leads"
                  className="h-10 text-sm border-gray-200 focus:border-brand-green"
                  data-testid="input-workflow-name"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
                  Description <span className="text-gray-400 font-normal normal-case">(optional)</span>
                </Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this workflow do?"
                  className="h-10 text-sm border-gray-200"
                />
              </div>
            </div>

            {/* WHEN section */}
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-6 w-6 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
                  <span className="text-white text-[10px] font-bold">W</span>
                </div>
                <p className="text-xs font-bold text-gray-900 uppercase tracking-widest">When this happens</p>
              </div>
              <TriggerConfigBlock
                triggerType={triggerType}
                triggerKeywords={triggerKeywords}
                triggerTag={triggerTag}
                triggerToStage={triggerToStage}
                triggerDuration={triggerDuration}
                onSelectTrigger={setTriggerType}
                onChangeKeywords={setTriggerKeywords}
                onChangeTag={setTriggerTag}
                onChangeToStage={setTriggerToStage}
                onChangeDuration={setTriggerDuration}
                lockProTriggers={isStarterPlan}
                onProTriggerLocked={openAdvancedAutomationsUpgrade}
              />
            </div>

            {/* IF section — optional conditions */}
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-6 w-6 rounded-full bg-violet-600 flex items-center justify-center shrink-0">
                  <span className="text-white text-[10px] font-bold">IF</span>
                </div>
                <p className="text-xs font-bold text-gray-900 uppercase tracking-widest">If these conditions match</p>
                <span className="ml-auto text-[11px] text-gray-400 font-normal normal-case">Optional</span>
              </div>
              <ConditionsBlock
                conditions={conditions}
                onAdd={addCondition}
                onUpdate={updateCondition}
                onRemove={removeCondition}
              />
            </div>

            {/* THEN section */}
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-6 w-6 rounded-full bg-brand-green flex items-center justify-center shrink-0">
                  <span className="text-white text-[10px] font-bold">T</span>
                </div>
                <p className="text-xs font-bold text-gray-900 uppercase tracking-widest">Do this</p>
              </div>

              <div>
                {actions.map((action, i) => (
                  <ActionBlock
                    key={i}
                    action={action}
                    index={i}
                    total={actions.length}
                    teamMembers={teamMembers}
                    onUpdate={(field, value) => updateAction(i, field, value)}
                    onRemove={() => removeAction(i)}
                    onMoveUp={() => moveAction(i, i - 1)}
                    onMoveDown={() => moveAction(i, i + 1)}
                  />
                ))}

                {/* Add action — Popover anchored here */}
                <ActionPickerPopover onSelect={addAction} />
              </div>
            </div>

            {/* Summary */}
            <WorkflowSummary
              triggerType={triggerType}
              triggerKeywords={triggerKeywords}
              triggerTag={triggerTag}
              triggerToStage={triggerToStage}
              triggerDuration={triggerDuration}
              conditions={conditions}
              actions={actions}
            />

            {/* Bottom save button (convenience) */}
            <div className="flex justify-end pt-2 pb-8">
              <Button onClick={handleWfSubmit} disabled={isSaving} className="bg-brand-green hover:bg-brand-green/90 h-10 px-6">
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingWorkflow ? "Save changes" : "Create workflow"}
              </Button>
            </div>
          </div>
        </div>
        {upgradeModal}
      </div>
    );
  }

  // ── Sequence Builder (full page) ──────────────────────────────────────────
  if (view === "seq-builder") {
    const isSaving = createCampaignMutation.isPending || updateCampaignMutation.isPending;
    const totalDelay = campaignSteps.reduce((sum, s) => sum + s.delayMinutes, 0);
    const validStepCount = campaignSteps.filter(s => s.messageContent.trim()).length;

    return (
      <div className="flex flex-col h-full bg-gray-50/40">
        <Helmet><title>{editingCampaign ? "Edit Sequence" : "Build Sequence"} | WhachatCRM</title></Helmet>

        <div className="px-6 py-3.5 border-b bg-white flex items-center justify-between gap-4 shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => { resetSeq(); setView("list"); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="h-4 w-4 text-gray-500" />
            </button>
            <div>
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">
                {editingCampaign ? "Editing sequence" : "New sequence"}
              </p>
              <h1 className="text-base font-semibold text-gray-900 leading-tight">
                {campaignName || "Untitled sequence"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => { resetSeq(); setView("list"); }} className="h-9">Cancel</Button>
            <Button onClick={handleSeqSubmit} disabled={isSaving} className="bg-brand-green hover:bg-brand-green/90 h-9" data-testid="button-save-campaign">
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingCampaign ? "Save changes" : "Create sequence"}
            </Button>
          </div>
        </div>

        {isStarterPlan && <StarterPlanAutomationsBanner onUpgradePro={openAdvancedAutomationsUpgrade} />}

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

            {/* Name + Description */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div>
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Sequence name</Label>
                <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="e.g., Welcome Series" className="h-10 text-sm border-gray-200" data-testid="input-campaign-name" />
              </div>
              <div>
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
                  Description <span className="text-gray-400 font-normal normal-case">(optional)</span>
                </Label>
                <Input value={campaignDescription} onChange={(e) => setCampaignDescription(e.target.value)} placeholder="What's this sequence for?" className="h-10 text-sm border-gray-200" />
              </div>
            </div>

            {/* Steps section */}
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                  <span className="text-white text-[10px] font-bold">S</span>
                </div>
                <p className="text-xs font-bold text-gray-900 uppercase tracking-widest">Message steps</p>
              </div>

              <div>
                {campaignSteps.map((step, i) => (
                  <div key={i} className="flex gap-4 items-start">
                    {/* left rail */}
                    <div className="flex flex-col items-center pt-1">
                      <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">
                        {i + 1}
                      </div>
                      {i < campaignSteps.length - 1 && (
                        <div className="w-px flex-1 bg-blue-100 mt-2 min-h-[20px]" />
                      )}
                    </div>

                    {/* step card */}
                    <div className="flex-1 pb-5">
                      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3.5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            {i === 0 ? "First message" : `Step ${i + 1}`}
                          </p>
                          {campaignSteps.length > 1 && (
                            <button onClick={() => removeStep(i)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            </button>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500 mb-1.5 block flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {i === 0 ? "Send" : "Wait, then send"}
                          </Label>
                          <Select value={String(step.delayMinutes)} onValueChange={(v) => updateStep(i, "delayMinutes", parseInt(v))}>
                            <SelectTrigger className="h-9 text-sm bg-gray-50 border-gray-200"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {[["0","Immediately"],["5","After 5 minutes"],["30","After 30 minutes"],["60","After 1 hour"],["180","After 3 hours"],["360","After 6 hours"],["720","After 12 hours"],["1440","After 1 day"],["2880","After 2 days"],["4320","After 3 days"],["10080","After 1 week"]].map(([v,l]) => (
                                <SelectItem key={v} value={v}>{l}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500 mb-1.5 block flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />Message
                          </Label>
                          <Textarea
                            value={step.messageContent}
                            onChange={(e) => updateStep(i, "messageContent", e.target.value)}
                            placeholder="Enter your message..."
                            className="text-sm resize-none bg-gray-50 border-gray-200"
                            rows={3}
                            data-testid={`input-step-message-${i}`}
                          />
                        </div>
                      </div>

                      {i < campaignSteps.length - 1 && (
                        <div className="flex items-center justify-center py-1.5">
                          <ArrowDown className="h-4 w-4 text-blue-200" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Add step button */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={addStep}
                      className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors mt-2"
                      data-testid="button-add-step"
                    >
                      <Plus className="h-4 w-4" />Add step
                    </button>
                  </PopoverTrigger>
                </Popover>
              </div>
            </div>

            {/* Sequence summary */}
            {validStepCount > 0 && (
              <div className="rounded-2xl bg-blue-50 border border-blue-200 px-5 py-4">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1.5">Summary</p>
                <p className="text-sm text-blue-900">
                  Send <span className="font-semibold">{validStepCount} message{validStepCount !== 1 ? "s" : ""}</span> over{" "}
                  <span className="font-semibold">{formatDelay(totalDelay)}</span>.
                </p>
              </div>
            )}

            <div className="flex justify-end pt-2 pb-8">
              <Button onClick={handleSeqSubmit} disabled={isSaving} className="bg-brand-green hover:bg-brand-green/90 h-10 px-6">
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingCampaign ? "Save changes" : "Create sequence"}
              </Button>
            </div>
          </div>
        </div>
        {upgradeModal}
      </div>
    );
  }

  // ── List View (default) ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <Helmet><title>Automations | WhachatCRM</title></Helmet>

      <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-brand-green/10 flex items-center justify-center">
            <Zap className="h-5 w-5 text-brand-green" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Automations</h1>
            <p className="text-xs text-gray-500">Workflows and drip sequences</p>
          </div>
        </div>
      </div>

      {isStarterPlan && <StarterPlanAutomationsBanner onUpgradePro={openAdvancedAutomationsUpgrade} />}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="border-b border-gray-200 px-4 sm:px-6 bg-white">
          <TabsList className="h-12 bg-transparent border-0 p-0 gap-6">
            <TabsTrigger value="workflows" className="h-12 px-0 border-b-2 border-transparent data-[state=active]:border-brand-green data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none text-sm font-medium">
              <Zap className="h-4 w-4 mr-2" />Workflows
            </TabsTrigger>
            <TabsTrigger value="drip" className="h-12 px-0 border-b-2 border-transparent data-[state=active]:border-brand-green data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none text-sm font-medium">
              <Mail className="h-4 w-4 mr-2" />Drip Sequences
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Workflows Tab ── */}
        <TabsContent value="workflows" className="flex-1 overflow-auto m-0">
          <div className="p-4 sm:p-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-gray-400">{workflows.length > 0 ? `${workflows.length} workflow${workflows.length !== 1 ? "s" : ""}` : ""}</p>
              <Button onClick={() => { resetWf(); setView("wf-start"); }} className="bg-brand-green hover:bg-brand-green/90 h-9" data-testid="button-create-workflow">
                <Plus className="h-4 w-4 mr-1.5" />New Workflow
              </Button>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-gray-300" /></div>
            ) : workflows.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-7 w-7 text-gray-300" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">No workflows yet</h3>
                <p className="text-sm text-gray-500 mb-5 max-w-xs mx-auto">Create your first workflow to automate repetitive tasks.</p>
                <Button onClick={() => { resetWf(); setView("wf-start"); }} className="bg-brand-green hover:bg-brand-green/90" data-testid="button-create-workflow-empty">
                  <Sparkles className="h-4 w-4 mr-2" />Create Workflow
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {workflows.map((wf) => (
                  <Collapsible key={wf.id} open={expandedWorkflow === wf.id} onOpenChange={(open) => setExpandedWorkflow(open ? wf.id : null)}>
                    <div className={cn("border rounded-xl transition-all overflow-hidden", wf.isActive ? "border-gray-200 bg-white shadow-sm" : "border-gray-100 bg-gray-50")}>
                      <div className="p-4 flex items-center gap-3">
                        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", wf.isActive ? "bg-brand-green/10" : "bg-gray-100")}>
                          <Zap className={cn("h-5 w-5", wf.isActive ? "text-brand-green" : "text-gray-300")} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={cn("font-semibold text-sm truncate", wf.isActive ? "text-gray-900" : "text-gray-400")}>{wf.name}</p>
                            {!wf.isActive && <Badge variant="outline" className="text-xs text-gray-400 border-gray-200 shrink-0">Paused</Badge>}
                          </div>
                          <p className="text-xs text-gray-500 truncate">{getTriggerLabel(wf)}{wf.executionCount > 0 && ` · ${wf.executionCount} runs`}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => toggleWorkflowMutation.mutate({ id: wf.id, isActive: !wf.isActive })} className="p-2 hover:bg-gray-100 rounded-lg" data-testid={`button-toggle-workflow-${wf.id}`}>
                            {wf.isActive ? <ToggleRight className="h-5 w-5 text-brand-green" /> : <ToggleLeft className="h-5 w-5 text-gray-300" />}
                          </button>
                          <button onClick={() => openEditWorkflow(wf)} className="p-2 hover:bg-gray-100 rounded-lg" data-testid={`button-edit-workflow-${wf.id}`}>
                            <Edit2 className="h-4 w-4 text-gray-400" />
                          </button>
                          <button onClick={() => deleteWorkflowMutation.mutate(wf.id)} className="p-2 hover:bg-red-50 rounded-lg" data-testid={`button-delete-workflow-${wf.id}`}>
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </button>
                          <CollapsibleTrigger asChild>
                            <button className="p-2 hover:bg-gray-100 rounded-lg">
                              <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform duration-200", expandedWorkflow === wf.id && "rotate-180")} />
                            </button>
                          </CollapsibleTrigger>
                        </div>
                      </div>
                      <CollapsibleContent>
                        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-1.5">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Actions</p>
                          {(wf.actions as WorkflowAction[])?.map((action, i) => {
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
                          {wf.lastExecutedAt && <p className="text-xs text-gray-400 pt-2">Last run: {new Date(wf.lastExecutedAt).toLocaleString()}</p>}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Drip Sequences Tab ── */}
        <TabsContent value="drip" className="flex-1 overflow-auto m-0">
          <div className="p-4 sm:p-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-gray-400">{dripCampaigns.length > 0 ? `${dripCampaigns.length} sequence${dripCampaigns.length !== 1 ? "s" : ""}` : ""}</p>
              <Button onClick={() => { resetSeq(); setView("seq-start"); }} className="bg-brand-green hover:bg-brand-green/90 h-9" data-testid="button-create-campaign">
                <Plus className="h-4 w-4 mr-1.5" />New Sequence
              </Button>
            </div>

            {isLoadingCampaigns ? (
              <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-gray-300" /></div>
            ) : dripCampaigns.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <Mail className="h-7 w-7 text-gray-300" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">No sequences yet</h3>
                <p className="text-sm text-gray-500 mb-5 max-w-xs mx-auto">Create automated message sequences to nurture leads over time.</p>
                <Button onClick={() => { resetSeq(); setView("seq-start"); }} className="bg-brand-green hover:bg-brand-green/90" data-testid="button-create-campaign-empty">
                  <Sparkles className="h-4 w-4 mr-2" />Create Sequence
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {dripCampaigns.map((campaign) => (
                  <Collapsible key={campaign.id} open={expandedCampaign === campaign.id} onOpenChange={(open) => setExpandedCampaign(open ? campaign.id : null)}>
                    <div className={cn("border rounded-xl transition-all overflow-hidden", campaign.isActive ? "border-gray-200 bg-white shadow-sm" : "border-gray-100 bg-gray-50")}>
                      <div className="p-4 flex items-center gap-3">
                        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", campaign.isActive ? "bg-blue-50" : "bg-gray-100")}>
                          <Mail className={cn("h-5 w-5", campaign.isActive ? "text-blue-500" : "text-gray-300")} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={cn("font-semibold text-sm truncate", campaign.isActive ? "text-gray-900" : "text-gray-400")}>{campaign.name}</p>
                            {!campaign.isActive && <Badge variant="outline" className="text-xs text-gray-400 border-gray-200 shrink-0">Paused</Badge>}
                          </div>
                          <p className="text-xs text-gray-500">
                            {campaign.steps?.length || 0} step{(campaign.steps?.length || 0) !== 1 ? "s" : ""}
                            {campaign.enrollments?.filter(e => e.status === "active").length ? ` · ${campaign.enrollments.filter(e => e.status === "active").length} active` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="outline" size="sm" onClick={() => { setEnrollCampaignId(campaign.id); setIsEnrollDialogOpen(true); }} disabled={!campaign.isActive} className="h-7 text-xs px-2.5">
                            <Users className="h-3 w-3 mr-1" />Enroll
                          </Button>
                          <button onClick={() => toggleCampaignMutation.mutate({ id: campaign.id, isActive: !campaign.isActive })} className="p-2 hover:bg-gray-100 rounded-lg" data-testid={`button-toggle-campaign-${campaign.id}`}>
                            {campaign.isActive ? <ToggleRight className="h-5 w-5 text-brand-green" /> : <ToggleLeft className="h-5 w-5 text-gray-300" />}
                          </button>
                          <button onClick={() => openEditCampaign(campaign)} className="p-2 hover:bg-gray-100 rounded-lg" data-testid={`button-edit-campaign-${campaign.id}`}>
                            <Edit2 className="h-4 w-4 text-gray-400" />
                          </button>
                          <button onClick={() => deleteCampaignMutation.mutate(campaign.id)} className="p-2 hover:bg-red-50 rounded-lg" data-testid={`button-delete-campaign-${campaign.id}`}>
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </button>
                          <CollapsibleTrigger asChild>
                            <button className="p-2 hover:bg-gray-100 rounded-lg">
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
                                      <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold shrink-0">{i + 1}</div>
                                      {i < (campaign.steps?.length || 0) - 1 && <div className="w-px h-4 bg-gray-200 mt-1" />}
                                    </div>
                                    <div className="flex-1 pb-2">
                                      <p className="text-xs text-gray-500 mb-0.5"><Clock className="h-3 w-3 inline mr-1" />{formatDelay(step.delayMinutes)} after previous</p>
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
                                        <Button variant="ghost" size="sm" onClick={() => cancelEnrollmentMutation.mutate(enrollment.id)} className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-50">
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

      {/* ── Enroll Dialog (small, kept as dialog since it's a simple picker) ── */}
      {isEnrollDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsEnrollDialogOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-gray-900">Enroll Contact</h3>
              <p className="text-sm text-gray-500 mt-0.5">Select a contact to add to this sequence</p>
            </div>
            <div className="mb-5">
              <Label className="text-sm mb-1.5 block">Select Contact</Label>
              <Select value={selectedChatId} onValueChange={setSelectedChatId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Choose a contact..." /></SelectTrigger>
                <SelectContent>
                  {chats.filter(c => c.whatsappPhone).map((chat) => (
                    <SelectItem key={chat.id} value={chat.id}>{chat.name} {chat.whatsappPhone && `(${chat.whatsappPhone})`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {chats.filter(c => c.whatsappPhone).length === 0 && (
                <p className="text-sm text-gray-500 mt-2">No contacts with WhatsApp numbers available.</p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsEnrollDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => { if (enrollCampaignId && selectedChatId) enrollChatMutation.mutate({ campaignId: enrollCampaignId, chatId: selectedChatId }); }}
                disabled={!selectedChatId || enrollChatMutation.isPending}
                className="bg-brand-green hover:bg-brand-green/90"
              >
                {enrollChatMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enroll
              </Button>
            </div>
          </div>
        </div>
      )}
      {upgradeModal}
    </div>
  );
}
