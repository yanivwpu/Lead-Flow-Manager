import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Globe,
  MessageSquare,
  Sparkles,
  Tag,
  User,
  ListTodo,
  UserPlus,
} from "lucide-react";

/** Stored on `workflows.actions` JSONB — CRM legacy and Growth Engine (RGE) shapes. */
export type WorkflowActionRecord = {
  type: string;
  value?: string;
  tag?: string;
  stage?: string;
  templateKey?: string;
  title?: string;
  dueDays?: number;
  fields?: string[];
  [key: string]: unknown;
};

export type WorkflowActionDefinition = {
  value: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: "CRM" | "Growth Engine";
};

export const CRM_WORKFLOW_ACTIONS: WorkflowActionDefinition[] = [
  { value: "assign", label: "Assign to Team Member", icon: User, description: "Route to an agent or round robin", category: "CRM" },
  { value: "tag", label: "Set Tag", icon: Tag, description: "Apply a label to the contact", category: "CRM" },
  { value: "set_status", label: "Set Status", icon: CheckCircle2, description: "Change conversation status", category: "CRM" },
  { value: "set_pipeline", label: "Set Pipeline Stage", icon: ArrowRight, description: "Move contact to a pipeline stage", category: "CRM" },
  { value: "add_note", label: "Add Note", icon: FileText, description: "Attach a note to the conversation", category: "CRM" },
  { value: "set_followup", label: "Set Follow-up", icon: Clock, description: "Schedule a future follow-up", category: "CRM" },
];

/** Matches `server/seedRealtorTemplate.ts` + `server/workflowEngine.ts` executors. */
export const GROWTH_ENGINE_WORKFLOW_ACTIONS: WorkflowActionDefinition[] = [
  { value: "create_or_update_lead", label: "Create / Update Lead", icon: UserPlus, description: "Ensure CRM lead exists for the conversation", category: "Growth Engine" },
  { value: "apply_tag", label: "Apply Tag", icon: Tag, description: "Apply a realtor template tag", category: "Growth Engine" },
  { value: "set_pipeline_stage", label: "Set Pipeline Stage", icon: ArrowRight, description: "Move lead to a pipeline stage", category: "Growth Engine" },
  { value: "send_message_template", label: "Send WhatsApp Template", icon: MessageSquare, description: "Send a Growth Engine message template", category: "Growth Engine" },
  { value: "create_task", label: "Create Task", icon: ListTodo, description: "Create an internal follow-up task", category: "Growth Engine" },
  { value: "detect_language", label: "Detect Language", icon: Globe, description: "Detect language from the inbound message", category: "Growth Engine" },
  { value: "update_lead_fields", label: "Update Lead Fields", icon: FileText, description: "Write detected fields onto the lead", category: "Growth Engine" },
  { value: "run_lead_scoring", label: "Run Lead Scoring", icon: Sparkles, description: "AI Brain scoring (when enabled)", category: "Growth Engine" },
];

const ALL_BY_TYPE = new Map<string, WorkflowActionDefinition>();
for (const d of [...CRM_WORKFLOW_ACTIONS, ...GROWTH_ENGINE_WORKFLOW_ACTIONS]) {
  ALL_BY_TYPE.set(d.value, d);
  if (d.value === "apply_tag") ALL_BY_TYPE.set("tag", d);
  if (d.value === "set_pipeline_stage") ALL_BY_TYPE.set("set_pipeline", d);
}

export function isGrowthEngineWorkflowRecord(workflow: {
  triggerConditions?: unknown;
  description?: string | null;
}): boolean {
  const tc = workflow.triggerConditions as { templateId?: string } | undefined;
  if (tc?.templateId === "realtor-growth-engine") return true;
  return (workflow.description || "").startsWith("Realtor Growth Engine:");
}

export function getWorkflowActionDefinition(type: string | undefined): WorkflowActionDefinition | undefined {
  if (!type) return undefined;
  return ALL_BY_TYPE.get(type);
}

export function getWorkflowActionSummary(action: WorkflowActionRecord): string {
  switch (action.type) {
    case "assign":
      return action.value === "round_robin" ? "Round robin" : action.value || "—";
    case "tag":
    case "apply_tag":
      return action.tag || action.value || "—";
    case "set_pipeline":
    case "set_pipeline_stage":
      return action.stage || action.value || "—";
    case "set_status":
      return action.value || "—";
    case "add_note":
      return action.value ? `"${action.value.slice(0, 40)}${action.value.length > 40 ? "…" : ""}"` : "—";
    case "set_followup":
      return action.value ? `${action.value} day(s)` : "—";
    case "send_message_template":
      return action.templateKey || "—";
    case "create_task":
      return action.title
        ? `${action.title}${action.dueDays != null ? ` (${action.dueDays}d)` : ""}`
        : "—";
    case "detect_language":
      return "Auto-detect from inbound message";
    case "create_or_update_lead":
      return "On new conversation";
    case "update_lead_fields":
      return Array.isArray(action.fields) ? action.fields.join(", ") : "—";
    case "run_lead_scoring":
      return "AI qualification / scoring";
    default:
      return action.value != null ? String(action.value) : "—";
  }
}

/** True when this action row should be persisted (RGE rows often have no `value`). */
export function isPersistableWorkflowAction(action: WorkflowActionRecord): boolean {
  if (!action?.type) return false;
  switch (action.type) {
    case "apply_tag":
    case "tag":
      return !!(action.tag || action.value);
    case "set_pipeline_stage":
    case "set_pipeline":
      return !!(action.stage || action.value);
    case "send_message_template":
      return !!action.templateKey;
    case "create_task":
      return !!(action.title && String(action.title).trim());
    case "detect_language":
    case "create_or_update_lead":
      return true;
    case "update_lead_fields":
      return Array.isArray(action.fields) && action.fields.length > 0;
    default:
      return !!action.value;
  }
}

export function normalizeActionsForEditor(raw: unknown): WorkflowActionRecord[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ type: "assign", value: "round_robin" }];
  }
  return raw.map((a) => ({ ...(a as WorkflowActionRecord) }));
}
