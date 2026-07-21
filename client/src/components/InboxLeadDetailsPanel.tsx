import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Phone,
  Mail,
  Calendar as CalendarIcon,
  Trash2,
  Edit,
  CheckCheck,
  UserCheck,
  X,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  Circle,
  Bell,
  PauseCircle,
  PlayCircle,
  User,
  Clock,
  ArrowLeft,
  ClipboardCopy,
  Save,
  ChevronDown,
  Plus,
  Eye,
  Trophy,
} from "lucide-react";
import type { ContactNote } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  formatScoreActivityEvent,
  sanitizeUserFacingText,
} from "@shared/customerBehaviorCopy";
import {
  buildContextualNextActions,
  buildCustomerInsights,
  buildCustomerSummaryBullets,
  buildSchedulingComposerDraft,
  composerSuggestionForAction,
  extractShowingTimingPhrase,
  isSchedulingComposerAction,
  type NextBestActionBehavior,
} from "@shared/customerInsights";
import { resolveAiRouting } from "@shared/aiRouting";
import { classifySellerIntent } from "@shared/sellerIntent";
import {
  evaluatePresetCampaignEnrollability,
  formatCampaignEnrollmentSubtitle,
  inferContactConversationChannel,
  sortCampaignsForContact,
  campaignChannelLabel,
} from "@shared/campaignEnrollment";
import {
  normalizeCampaignPlaceholderDefaults,
  previewCampaignMessageSteps,
} from "@shared/campaignPlaceholders";
import type { Contact as SchemaContact } from "@shared/schema";
import {
  filterMeaningfulTimelineEvents,
  formatActivityDetailText,
  type TimelineEventLike,
} from "@/lib/contactTimelineFilter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMarkProspectAiWon, useSetProspectAiOutcome } from "@/lib/prospectAi";
import { isProspectAiAttributedContact } from "@shared/prospectAI";
import { MODAL_OVERLAY_BACKDROP } from "@/lib/modalOverlay";
import { format, parseISO } from "date-fns";
import { TAG_COLORS, pipelineStageOptions } from "@/lib/data";
import { CONVERSATION_STATUS_ROWS, getConversationStatusRow } from "@/lib/conversationStatusUi";
import {
  analyzeConversation,
  computeWorkflow,
  runVerification,
  buildAIMemorySummary,
  type ConversationMessage,
  type QualifyingCriterion,
} from "@/lib/conversationIntelligence";
import { getStageSignals } from "@/lib/leadScoring";
import { AIUpgradePrompt } from "./AIUpgradePrompt";
import type { AICapabilities } from "@/lib/useAICapabilities";
import { BuyerPreferencesPanel } from "@/components/BuyerPreferencesPanel";
import { usePersistedBuyerPreferences } from "@/lib/buyerPreferencesQuery";
import type { CopilotComposerInsert } from "@/lib/copilotComposerInsert";
import { buildBuyerPreferenceSearchChips, normalizeForDisplay } from "@shared/buyerPreferenceDisplay";
import {
  detectChipProfileMismatches,
  logBuyerMatchingTraceClient,
  snapshotProfileTraceFields,
} from "@/lib/buyerMatchingTraceClient";
import { resolveClientBuyerMatchingTraceId } from "@/lib/buyerMatchingTraceStore";
import { fetchInventoryStatus, fetchInventorySources, isWorkspaceInventoryConnected } from "@/lib/inventoryApi";
import { CopilotInventoryEmptyState } from "@/components/inventory/CopilotInventoryEmptyState";
import { CopilotInventorySourcesUnavailable } from "@/components/inventory/CopilotInventorySourcesUnavailable";
import { MatchingListingsPanel } from "@/components/inventory/MatchingListingsPanel";
import {
  shouldShowCopilotBuyerPreferences,
  shouldShowCopilotInventoryForContact,
  contactHasInventoryMatchCriteria,
} from "@/lib/copilotRgeVisibility";
import { useHideGrowthEngineForShopify } from "@/lib/shopifyMerchantExperience";
import { isQualificationDowngrade, systemTagForQualification } from "@shared/leadQualification";

type Channel = 'whatsapp' | 'instagram' | 'facebook' | 'sms' | 'webchat' | 'telegram' | 'tiktok';

interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar?: string;
  primaryChannel: Channel;
  primaryChannelOverride?: Channel;
  tag: string;
  pipelineStage: string;
  notes?: string;
  followUp?: string | null;
  followUpDate?: string | null;
  assignedTo?: string | null;
  /** CRM cumulative / RGE score (0–100); when set, Copilot aligns primary score to this value. */
  leadScore?: number | null;
  source?: string;
  createdAt: string;
  customFields?: Record<string, unknown>;
  sourceDetails?: Record<string, unknown> | null;
  buyerPreferenceProfile?: unknown;
}

interface Conversation {
  id: string;
  channel: Channel;
  status: string;
  unreadCount: number;
}

interface TeamMember {
  id: string;
  memberId: string | null;
  email: string;
  name: string | null;
  role: string;
  status: string;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual', whatsapp: 'WhatsApp', instagram: 'Instagram',
  facebook: 'Facebook', webchat: 'Web Chat', import: 'CSV Import',
  api: 'API', tiktok: 'TikTok', sms: 'SMS', telegram: 'Telegram',
};

function resolveContactSourceLabel(contact: {
  source?: string | null;
  customFields?: Record<string, unknown> | null;
}): string | null {
  const cf = contact.customFields || {};
  if (typeof cf.leadSource === 'string' && cf.leadSource.trim()) {
    return cf.leadSource.trim();
  }
  if (cf.sourcePage === 'agent_page') return 'Agent Page';
  if (contact.source) return SOURCE_LABELS[contact.source] || contact.source;
  return null;
}

const TIME_SLOTS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];

function formatTime24to12(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function getFollowUpStatus(d: string | null | undefined): 'overdue' | 'today' | 'upcoming' | null {
  if (!d) return null;
  const due   = new Date(d);
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  if (dueDay < today) return 'overdue';
  if (dueDay.getTime() === today.getTime()) return 'today';
  return 'upcoming';
}

function formatFollowUpDisplay(isoString: string): string {
  try {
    const d = parseISO(isoString);
    const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
    return hasTime
      ? format(d, "MMM d 'at' h:mm a")
      : format(d, 'MMM d, yyyy');
  } catch {
    return isoString;
  }
}

// ── QualBadge — shows extracted value when available, label+check otherwise ──
function QualBadge({ ok, label, value }: { ok: boolean; label: string; value?: string | null }) {
  const display = ok && value ? value : label;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium leading-none max-w-[80px] truncate",
        ok ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-400"
      )}
      title={ok && value ? `${label}: ${value}` : label}
    >
      {ok ? <CheckCircle2 className="w-2.5 h-2.5 shrink-0" /> : <Circle className="w-2.5 h-2.5 shrink-0" />}
      <span className="truncate">{display}</span>
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface InboxLeadDetailsPanelProps {
  contact: Contact;
  primaryConversation?: Conversation;
  teamMembers: TeamMember[];
  messages?: ConversationMessage[];
  capabilities?: AICapabilities;
  currentUserId?: string;
  /** Derived from activityEvents: eventType === "ai_handoff" */
  handoffActive?: boolean;
  /** Timeline row id for the active ai_handoff event — used so Unsnooze can dismiss snooze UI per event */
  handoffEventId?: string | null;
  /** Human-readable reason (e.g. "Customer requested: \"human\"") */
  handoffMessage?: string;
  onUpdateContact: (fields: Record<string, unknown>) => void;
  onUpdateConversationStatus: (status: string) => void;
  onEditContact: () => void;
  onDeleteContact: () => void;
  /** Optional 1-line preview of the main composer draft (read-only, from parent state) */
  composerDraftPreview?: string;
  /** Insert suggested reply text into the main message composer. Returns true on success. */
  onInsertComposerDraft?: (draft: CopilotComposerInsert) => boolean;
  /** Channel connection map from /api/channel-health — used for campaign compatibility */
  connectedChannels?: Record<string, boolean>;
  /** Override the root container class — use when embedding in a mobile sheet */
  panelClassName?: string;
}

function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function CopilotPopoverHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-[11px] font-semibold text-gray-700">{title}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="rounded p-0.5 text-gray-300 hover:text-gray-500 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide shrink-0">
      {children}
    </span>
  );
}

// ── ADD NOTE MODAL ────────────────────────────────────────────────────────────
// Isolated component with its own state so the textarea is completely immune
// to parent re-renders (AI polling, message updates, etc.).
interface AddNoteModalProps {
  contactId: string;
  contactNotesList: ContactNote[];
  currentUserId?: string;
  teamMembers: TeamMember[];
  onSave: (note: ContactNote) => void;
  onDelete: (noteId: string) => void;
  onClose: () => void;
}
function AddNoteModal({ contactId, contactNotesList, currentUserId, teamMembers, onSave, onDelete, onClose }: AddNoteModalProps) {
  const { toast } = useToast();
  const [noteText, setNoteText] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Permission: creator or workspace owner/admin
  const currentMember = teamMembers.find(m => (m.memberId || m.id) === currentUserId);
  const isAdminOrOwner = currentMember?.role === 'owner' || currentMember?.role === 'admin';
  const canDeleteNote = (note: ContactNote) =>
    note.createdByUserId === currentUserId || isAdminOrOwner;

  const handleDelete = async (noteId: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/notes/${noteId}`, { method: 'DELETE' });
      if (res.ok) {
        onDelete(noteId);
        setConfirmDeleteId(null);
        toast({ title: "Note deleted", duration: 2000 });
      } else {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Delete failed", description: body?.error || "Please try again.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Delete failed", description: "Network error.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    if (!noteText.trim()) {
      toast({ title: "Note is empty", description: "Please type something before saving.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: noteText.trim() }),
      });
      if (res.ok) {
        const saved: ContactNote = await res.json();
        onSave(saved);
        onClose();
        toast({ title: "Note saved", duration: 2000 });
      } else {
        let errMsg = "Failed to save note. Please try again.";
        try { const b = await res.json(); if (b?.error) errMsg = b.error; } catch {}
        toast({ title: "Save failed", description: errMsg, variant: "destructive" });
      }
    } catch {
      toast({ title: "Save failed", description: "Network error — please check your connection and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-150",
        MODAL_OVERLAY_BACKDROP
      )}
      onClick={onClose}
      data-testid="modal-overlay-add-note"
    >
      <div
        className="bg-white rounded-2xl shadow-lg w-[90%] max-w-[480px] flex flex-col animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">Add Team Note</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Visible to all team members — not shown to customer</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            data-testid="button-close-note-modal"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Existing notes history */}
        {contactNotesList.length > 0 && (
          <div className="px-5 pt-4 pb-2 flex flex-col gap-3 max-h-[240px] overflow-y-auto overflow-x-hidden" data-testid="modal-notes-history">
            {contactNotesList.map(note => (
              <div key={note.id} className="group flex flex-col gap-0.5" data-testid={`modal-note-${note.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="text-[11px] text-gray-400">{note.createdByName || 'Team member'}</span>
                    <span className="text-[10px] text-gray-400">·</span>
                    <span className="text-[10px] text-gray-400">
                      {note.createdAt
                        ? new Date(note.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                        : ''}
                    </span>
                  </div>
                  {canDeleteNote(note) && confirmDeleteId !== note.id && (
                    <button
                      onClick={() => setConfirmDeleteId(note.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-300 hover:text-red-400 rounded"
                      title="Delete note"
                      data-testid={`button-delete-note-${note.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <p className="text-[12px] text-gray-800 leading-relaxed" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere', overflowX: 'hidden' }}>{note.content}</p>
                {/* Inline confirm */}
                {confirmDeleteId === note.id && (
                  <div className="flex items-center gap-2 mt-1 pt-1 border-t border-gray-100">
                    <span className="text-[11px] text-gray-500 flex-1">Delete this note?</span>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-[11px] text-gray-500 hover:text-gray-700 font-medium px-2 py-0.5 rounded transition-colors"
                      data-testid={`button-cancel-delete-${note.id}`}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDelete(note.id)}
                      disabled={deleting}
                      className="text-[11px] text-white font-semibold bg-red-500 hover:bg-red-600 disabled:opacity-50 px-2 py-0.5 rounded transition-colors"
                      data-testid={`button-confirm-delete-${note.id}`}
                    >
                      {deleting ? '…' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            ))}
            <div className="border-t border-gray-100 mt-1" />
          </div>
        )}

        {/* Textarea — completely isolated state */}
        <div className="px-5 py-4">
          <textarea
            className="notes-textarea w-full min-h-[120px] bg-white rounded-xl p-3 text-[13px] text-gray-700 placeholder-gray-400 resize-none font-sans leading-relaxed"
            style={{ outline: 'none', boxShadow: 'none', border: '1px solid #E5E7EB' }}
            placeholder="Add context, objections, preferences…"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            autoFocus
            data-testid="textarea-new-note"
          />
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="py-2 px-4 text-[12px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            data-testid="button-cancel-note"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!noteText.trim() || saving}
            className="py-2 px-4 text-[12px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            data-testid="button-save-note"
          >
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface EditNoteModalProps {
  contactId: string;
  note: ContactNote;
  onSave: (updated: ContactNote) => void;
  onDelete: (noteId: string) => void;
  onClose: () => void;
}
function EditNoteModal({ contactId, note, onSave, onDelete, onClose }: EditNoteModalProps) {
  const [text, setText] = useState(note.content);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed || trimmed === note.content) { onClose(); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      });
      if (res.ok) {
        const updated: ContactNote = await res.json();
        onSave(updated);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await fetch(`/api/contacts/${contactId}/notes/${note.id}`, { method: 'DELETE' });
    onDelete(note.id);
    onClose();
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-150",
        MODAL_OVERLAY_BACKDROP
      )}
      onClick={onClose}
      data-testid="modal-overlay-edit-note"
    >
      <div
        className="bg-white rounded-2xl shadow-lg w-[90%] max-w-[480px] flex flex-col animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">Edit Note</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {note.createdByName || 'Team member'} · {note.createdAt
                ? new Date(note.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            data-testid="button-close-edit-note"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Textarea */}
        <div className="px-5 py-4">
          <textarea
            className="notes-textarea w-full min-h-[120px] bg-white rounded-xl p-3 text-[13px] text-gray-700 placeholder-gray-400 resize-none font-sans leading-relaxed"
            style={{ outline: 'none', boxShadow: 'none', border: '1px solid #E5E7EB' }}
            value={text}
            onChange={e => setText(e.target.value)}
            autoFocus
            data-testid="textarea-edit-note"
          />
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center justify-between">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 py-2 px-3 text-[12px] font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
            data-testid="button-delete-edit-note"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="py-2 px-4 text-[12px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              data-testid="button-cancel-edit-note"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!text.trim() || saving}
              className="py-2 px-4 text-[12px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              data-testid="button-save-edit-note"
            >
              {saving ? 'Saving…' : 'Save Note'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type CampaignEnrollmentRow = {
  id: string;
  campaignId: string;
  status: string;
  campaignName?: string | null;
  campaignChannel?: string | null;
  campaignStatus?: string | null;
  nextRunAt?: string | null;
  currentStepIndex: number;
  createdAt?: string | null;
  totalSteps?: number | null;
  failureReason?: string | null;
};

type ContactActivityEvent = {
  id: string;
  eventType: string;
  eventData: Record<string, unknown>;
  actorType: string;
  createdAt: string;
};

function formatContactActivity(event: TimelineEventLike): { title: string; detail: string; tone: "green" | "amber" | "gray" } {
  const data = event.eventData || {};
  const title = typeof data.title === "string" ? data.title : "";
  const eventType = typeof data.eventType === "string" ? data.eventType : "";
  const content = typeof data.content === "string" ? data.content : "";
  const kind = typeof data.kind === "string" ? data.kind : "";
  const inviteeName = typeof data.inviteeName === "string" ? data.inviteeName : "";
  const inviteeEmail = typeof data.inviteeEmail === "string" ? data.inviteeEmail : "";
  const startTime =
    typeof data.startTime === "string"
      ? data.startTime
      : typeof data.newTime === "string"
        ? data.newTime
        : "";
  const when = startTime ? formatFollowUpDisplay(startTime) : "";

  if (kind === "lead_score_changed" || kind === "qualification_changed") {
    const formatted = formatScoreActivityEvent({
      previousScore: typeof data.previousScore === "number" ? data.previousScore : null,
      newScore: typeof data.newScore === "number" ? data.newScore : null,
      bucketBefore: typeof data.bucketBefore === "string" ? data.bucketBefore : "",
      bucketAfter: typeof data.bucketAfter === "string" ? data.bucketAfter : "",
      signals: data.signals,
      content,
      title,
    });
    const next = typeof data.newScore === "number" ? data.newScore : null;
    const bucketAfter = typeof data.bucketAfter === "string" ? data.bucketAfter : "";
    return {
      title: formatted.title,
      detail: formatted.detail,
      tone: next != null && next >= 50 ? "green" : bucketAfter === "hot" || bucketAfter === "warm" ? "green" : "gray",
    };
  }

  if (event.eventType === "tag_change" || kind === "tag_changed") {
    const from = typeof data.from === "string" ? data.from : "";
    const to = typeof data.to === "string" ? data.to : "";
    if (to === "Appointment Requested" || title === "Showing requested") {
      return {
        title: "Appointment requested",
        detail: "Customer asked for a showing",
        tone: "green",
      };
    }
    if (to === "Appointment Booked") {
      return { title: "Appointment booked", detail: "Showing confirmed with the customer", tone: "green" };
    }
    return {
      title: "Tag updated",
      detail: from && to ? `${from} → ${to}` : sanitizeUserFacingText(to || from) || "Contact tag updated",
      tone: "gray",
    };
  }

  if (event.eventType === "stage_change" || kind === "stage_changed") {
    const from = typeof data.from === "string" ? data.from : "";
    const to = typeof data.to === "string" ? data.to : "";
    return {
      title: "Pipeline stage updated",
      detail: from && to ? `${from} → ${to}` : to || from || "Stage changed",
      tone: "gray",
    };
  }

  if (event.eventType === "assignment" || kind === "assignment") {
    return {
      title: "Agent assigned",
      detail: content || title || "Conversation assigned",
      tone: "gray",
    };
  }

  if (event.eventType === "note" && kind === "workflow_task") {
    const taskTitle = title || "";
    const hay = `${taskTitle} ${content}`.toLowerCase();
    if (/scheduling link sent|scheduling link/i.test(hay)) {
      return { title: "Booking link sent to customer", detail: "", tone: "green" };
    }
    if (/customer requested a showing/i.test(hay)) {
      return {
        title: "Customer requested a showing",
        detail: /booking link sent/i.test(hay) ? "Booking link sent to customer" : "",
        tone: "green",
      };
    }
    if (/showing requested|appointment requested/i.test(hay)) {
      return { title: "Customer requested a showing", detail: "", tone: "green" };
    }
    if (/book|showing|appointment/i.test(hay)) {
      return {
        title: "Appointment requested",
        detail: formatActivityDetailText(content) || "Customer asked about a showing or appointment",
        tone: "green",
      };
    }
  }

  if (event.eventType === "ai_handoff") {
    return {
      title: "Follow-up needed",
      detail: formatActivityDetailText(content) || "This conversation needs a personal reply",
      tone: "amber",
    };
  }

  if (event.eventType === "calendly_booking") {
    return {
      title: "Appointment booked",
      detail: when ? `Scheduled for ${when}` : inviteeName || inviteeEmail || "Meeting confirmed",
      tone: "green",
    };
  }
  if (event.eventType === "calendly_booking_canceled") {
    return {
      title: "Appointment canceled",
      detail: when ? `Was scheduled for ${when}` : "Meeting canceled",
      tone: "amber",
    };
  }
  if (event.eventType === "appointment_deleted") {
    return {
      title: "Appointment removed",
      detail: when ? `Was scheduled for ${when}` : title || "Meeting removed from calendar",
      tone: "amber",
    };
  }
  if (event.eventType === "calendly_rescheduled") {
    return {
      title: "Appointment rescheduled",
      detail: when ? `New time: ${when}` : "Meeting time updated",
      tone: "green",
    };
  }
  if (event.eventType === "note" && data.kind === "calendly_booking_confirmed") {
    return {
      title: "Appointment booked",
      detail: [content || title || "Meeting", when].filter(Boolean).join(" · "),
      tone: "green",
    };
  }
  if (event.eventType === "appointment_created") {
    return {
      title: "Appointment booked",
      detail: content || title || "Meeting scheduled",
      tone: "green",
    };
  }
  if (event.eventType === "message") {
    return {
      title: "Message activity",
      detail: formatActivityDetailText(typeof data.content === "string" ? data.content : "") || "Conversation updated",
      tone: "gray",
    };
  }
  if (kind === "campaign_enrolled" || title.toLowerCase().includes("enrolled in")) {
    return {
      title: title || "Campaign enrollment",
      detail: formatActivityDetailText(content) || "Contact added to a saved campaign",
      tone: "green",
    };
  }
  const fallbackTitle = event.eventType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: fallbackTitle,
    detail: formatActivityDetailText(content || title) || "Activity recorded",
    tone: "gray",
  };
}

function enrollmentCardSubtitle(e: CampaignEnrollmentRow): string {
  return formatCampaignEnrollmentSubtitle({
    status: e.status,
    currentStepIndex: e.currentStepIndex,
    totalSteps: e.totalSteps,
    failureReason: e.failureReason,
    campaignStatus: e.campaignStatus,
  });
}

export function InboxLeadDetailsPanel({
  contact,
  primaryConversation,
  teamMembers,
  messages = [],
  capabilities,
  currentUserId,
  handoffActive = false,
  handoffEventId = null,
  handoffMessage,
  onUpdateContact,
  onUpdateConversationStatus,
  onEditContact,
  onDeleteContact,
  composerDraftPreview,
  onInsertComposerDraft,
  connectedChannels,
  panelClassName,
}: InboxLeadDetailsPanelProps) {
  const { toast } = useToast();
  const hideGrowthEngine = useHideGrowthEngineForShopify();
  // Default to full access if no capabilities provided (backward compat)
  const canSeeCopilot    = capabilities ? capabilities.canUseCopilotIntelligence    : true;
  const canSeeWorkflow   = capabilities ? capabilities.canUseWorkflowRecommendations : true;
  const hasAIBrain       = capabilities?.hasAIBrain ?? false;
  const copilotUpgradeTo = capabilities?.upgradePlan ?? "Starter";
  const workflowUpgradeTo = capabilities?.upgradePlan ?? "Pro";
  const [aiPaused, setAiPaused] = useState(false);
  /** User chose Unsnooze for this handoff timeline row — stops handoff from driving the Copilot header pill only */
  const [dismissedHandoffSnoozeId, setDismissedHandoffSnoozeId] = useState<string | null>(null);

  useEffect(() => {
    setAiPaused(false);
    setDismissedHandoffSnoozeId(null);
  }, [contact.id]);

  const isProspectAiContact = useMemo(
    () => isProspectAiAttributedContact(contact),
    [contact],
  );
  const [markWonOpen, setMarkWonOpen] = useState(false);
  const markWon = useMarkProspectAiWon();
  const setOutcome = useSetProspectAiOutcome();
  const prospectOutcomeQuery = useQuery({
    queryKey: ["/api/growth-engines/prospect-ai/contacts", contact.id, "outcome"],
    queryFn: async () => {
      const res = await fetch(
        `/api/growth-engines/prospect-ai/contacts/${contact.id}/outcome`,
        { credentials: "include" },
      );
      if (!res.ok) return { attributed: false, outcome: null };
      return res.json() as Promise<{
        attributed: boolean;
        outcome: { prospectOutcome?: string } | null;
      }>;
    },
    enabled: isProspectAiContact,
    staleTime: 30_000,
  });
  const showMarkWon =
    isProspectAiContact || prospectOutcomeQuery.data?.attributed === true;
  const currentProspectOutcome =
    prospectOutcomeQuery.data?.outcome?.prospectOutcome || null;

  useEffect(() => {
    if (!handoffEventId) {
      setDismissedHandoffSnoozeId(null);
      return;
    }
    setDismissedHandoffSnoozeId((prev) => (prev === handoffEventId ? prev : null));
  }, [handoffEventId]);

  const effectiveAiPaused = aiPaused || handoffActive;
  const headerHandoffSnoozes =
    handoffActive &&
    (handoffEventId == null || dismissedHandoffSnoozeId !== handoffEventId);
  const headerShowsSnoozed = aiPaused || headerHandoffSnoozes;

  const toggleCopilotSnooze = async () => {
    if (headerShowsSnoozed) {
      setAiPaused(false);
      if (handoffActive && primaryConversation?.id) {
        try {
          await apiRequest("POST", `/api/contacts/${contact.id}/handoff-resolve`, {
            conversationId: primaryConversation.id,
            reason: "user_unsnooze",
          });
          await queryClient.invalidateQueries({
            queryKey: [`/api/contacts/${contact.id}/timeline?limit=60`],
          });
        } catch {
          toast({
            title: "Could not resume AI",
            description: "Try again in a moment.",
            variant: "destructive",
          });
        }
        if (handoffEventId) {
          setDismissedHandoffSnoozeId(handoffEventId);
        }
      } else {
        setDismissedHandoffSnoozeId(null);
      }
    } else {
      setAiPaused(true);
    }
  };

  // Team Notes
  const [contactNotesList, setContactNotesList] = useState<ContactNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<ContactNote | null>(null);
  // Snapshot of lastViewedAt taken when this contact was first opened — used to compute badge
  const [notesViewedAt, setNotesViewedAt] = useState<Date | null>(null);

  // Copilot action popovers
  const [assignOpen, setAssignOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [useFollowModal, setUseFollowModal] = useState(false);
  const [bookOpen,   setBookOpen]   = useState(false);
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());
  const [fadingAction, setFadingAction] = useState<string | null>(null);
  const [followView, setFollowView] = useState<"quick" | "custom">("quick");

  type CopilotPopoverTarget = "book" | "follow" | "assign" | "snooze";

  const openCopilotPopover = useCallback((target: CopilotPopoverTarget) => {
    setBookOpen(target === "book");
    setAssignOpen(target === "assign");
    setFollowOpen(target === "follow");
    setSnoozeOpen(target === "snooze");
    if (target === "follow") setFollowView("quick");
  }, []);

  const handleCopilotPopoverOpenChange = useCallback(
    (target: CopilotPopoverTarget, open: boolean) => {
      if (open) {
        openCopilotPopover(target);
      } else {
        switch (target) {
          case "book":
            setBookOpen(false);
            break;
          case "assign":
            setAssignOpen(false);
            break;
          case "follow":
            setFollowOpen(false);
            break;
          case "snooze":
            setSnoozeOpen(false);
            break;
        }
      }
    },
    [openCopilotPopover],
  );

  // Custom qualifying criteria answered by the agent (resets per contact)
  const [answeredCriteriaKeys, setAnsweredCriteriaKeys] = useState<Set<string>>(new Set());
  useEffect(() => { setAnsweredCriteriaKeys(new Set()); }, [contact.id]);

  const queryClient = useQueryClient();

  const invalidateAppointmentQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [`/api/contacts/${contact.id}/appointments`] });
    void queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/contacts", contact.id] });
  }, [contact.id, queryClient]);

  const clearBookedMeetings = useCallback(async () => {
    const res = await fetch(`/api/contacts/${contact.id}/clear-booked-meetings`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to clear booked meetings");
    invalidateAppointmentQueries();
    onUpdateContact({ followUp: null, followUpDate: null });
  }, [contact.id, invalidateAppointmentQueries, onUpdateContact]);

  const deleteContactAppointment = useCallback(async (appointmentId: string) => {
    const res = await fetch(`/api/appointments/${appointmentId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to delete appointment");
    const data = (await res.json()) as {
      contact?: {
        followUp?: string | null;
        followUpDate?: string | null;
        pipelineStage?: string | null;
      };
    };
    invalidateAppointmentQueries();
    if (data.contact) {
      onUpdateContact({
        followUp: data.contact.followUp ?? null,
        followUpDate: data.contact.followUpDate ?? null,
        pipelineStage: data.contact.pipelineStage ?? undefined,
      });
    } else {
      onUpdateContact({ followUp: null, followUpDate: null });
    }
  }, [invalidateAppointmentQueries, onUpdateContact]);

  const [campaignPickerOpen, setCampaignPickerOpen] = useState(false);
  const [pickedCampaignId, setPickedCampaignId] = useState<string>("");
  const [showCampaignHistory, setShowCampaignHistory] = useState(false);
  const [enrollmentPreviewOpen, setEnrollmentPreviewOpen] = useState(false);

  const { data: campaignEnrollmentPayload } = useQuery<{
    enrollments: CampaignEnrollmentRow[];
  }>({
    queryKey: ["/api/campaign-enrollments", contact.id],
    queryFn: async () => {
      const r = await fetch(
        `/api/campaign-enrollments?contactId=${encodeURIComponent(contact.id)}`,
        { credentials: "include" }
      );
      if (!r.ok) throw new Error("Failed to load enrollments");
      return r.json();
    },
    enabled: !!contact.id,
  });

  const { data: presetCampaignPickList = [] } = useQuery<
    Array<{
      id: string;
      name: string;
      status: string;
      channel?: string;
      messages?: unknown;
      placeholderDefaults?: Record<string, unknown> | null;
    }>
  >({
    queryKey: ["/api/preset-campaigns"],
    queryFn: async () => {
      const r = await fetch("/api/preset-campaigns", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load campaigns");
      return r.json();
    },
    enabled: !!contact.id,
  });

  const contactOutreachChannel = useMemo(
    () => inferContactConversationChannel(contact, primaryConversation?.channel),
    [contact, primaryConversation?.channel],
  );

  const activeEnrollmentCampaignIds = useMemo(() => {
    const list = campaignEnrollmentPayload?.enrollments ?? [];
    return new Set(
      list.filter((e) => e.status === "active" || e.status === "paused").map((e) => e.campaignId),
    );
  }, [campaignEnrollmentPayload?.enrollments]);

  const campaignPickOptions = useMemo(() => {
    const sorted = sortCampaignsForContact(
      presetCampaignPickList,
      contact,
      primaryConversation?.channel,
    );
    return sorted.map((c) => {
      const channel = (c.channel || "whatsapp").toLowerCase();
      const channelConnected =
        channel === "whatsapp"
          ? connectedChannels?.whatsapp !== false
          : connectedChannels?.[channel] ?? true;
      const eligibility = evaluatePresetCampaignEnrollability({
        contact,
        campaign: c,
        conversationChannel: primaryConversation?.channel,
        channelConnected,
        alreadyEnrolled: activeEnrollmentCampaignIds.has(c.id),
      });
      return { ...c, eligibility };
    });
  }, [
    presetCampaignPickList,
    contact,
    primaryConversation?.channel,
    connectedChannels,
    activeEnrollmentCampaignIds,
  ]);

  const compatibleCampaignOptions = useMemo(
    () => campaignPickOptions.filter((c) => c.eligibility.eligible),
    [campaignPickOptions],
  );

  const enrollableCampaignCount = compatibleCampaignOptions.length;

  const pickedCampaignForEnroll = useMemo(
    () => campaignPickOptions.find((c) => c.id === pickedCampaignId),
    [campaignPickOptions, pickedCampaignId],
  );

  const enrollmentPreviewSteps = useMemo(() => {
    if (!pickedCampaignForEnroll?.messages) return [];
    const defaults = normalizeCampaignPlaceholderDefaults(pickedCampaignForEnroll.placeholderDefaults);
    const messages = Array.isArray(pickedCampaignForEnroll.messages)
      ? pickedCampaignForEnroll.messages
      : [];
    return previewCampaignMessageSteps(
      messages,
      defaults,
      contact as unknown as SchemaContact,
    );
  }, [pickedCampaignForEnroll, contact]);

  const openCampaignPicker = useCallback(
    (preferredCampaignId?: string) => {
      const preferred =
        preferredCampaignId &&
        compatibleCampaignOptions.some((c) => c.id === preferredCampaignId)
          ? preferredCampaignId
          : compatibleCampaignOptions[0]?.id || "";
      setPickedCampaignId(preferred);
      setCampaignPickerOpen(true);
    },
    [compatibleCampaignOptions],
  );

  const enrollContactCampaignMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/campaign-enrollments", {
        campaignId: pickedCampaignId,
        contactId: contact.id,
        conversationId: primaryConversation?.id ?? undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaign-enrollments", contact.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/preset-campaigns"] });
      queryClient.invalidateQueries({ queryKey: [`/api/contacts/${contact.id}/timeline?limit=40`] });
      queryClient.invalidateQueries({ queryKey: [`/api/contacts/${contact.id}/timeline?limit=60`] });
      setCampaignPickerOpen(false);
      setPickedCampaignId("");
      toast({ title: "Enrolled in campaign", duration: 2500 });
    },
    onError: (e: Error) => {
      toast({
        title: "Could not enroll",
        description: e.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  const pauseEnrollmentMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      await apiRequest("POST", `/api/campaign-enrollments/${enrollmentId}/pause`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaign-enrollments", contact.id] });
    },
    onError: (e: Error) => {
      toast({
        title: "Pause failed",
        description: e.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  const resumeEnrollmentMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      await apiRequest("POST", `/api/campaign-enrollments/${enrollmentId}/resume`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaign-enrollments", contact.id] });
    },
    onError: (e: Error) => {
      toast({
        title: "Resume failed",
        description: e.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  const cancelEnrollmentMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      await apiRequest("POST", `/api/campaign-enrollments/${enrollmentId}/cancel`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaign-enrollments", contact.id] });
    },
    onError: (e: Error) => {
      toast({
        title: "Cancel failed",
        description: e.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!campaignPickerOpen) return;
    if (compatibleCampaignOptions.length === 0) {
      setPickedCampaignId("");
      return;
    }
    if (!pickedCampaignId || !compatibleCampaignOptions.some((c) => c.id === pickedCampaignId)) {
      setPickedCampaignId(compatibleCampaignOptions[0].id);
    }
  }, [campaignPickerOpen, compatibleCampaignOptions, pickedCampaignId]);

  useEffect(() => {
    setShowCampaignHistory(false);
  }, [contact.id]);

  const campaignEnrollmentBuckets = useMemo(() => {
    const list = campaignEnrollmentPayload?.enrollments ?? [];
    const primary = list.filter((e) =>
      ["active", "paused", "failed"].includes(e.status)
    );
    const history = list.filter((e) =>
      ["completed", "cancelled"].includes(e.status)
    );
    return { primary, history };
  }, [campaignEnrollmentPayload?.enrollments]);

  const { data: contactAppointments = [] } = useQuery<Array<{
    id: string;
    appointmentType: string;
    appointmentDate: string;
    title: string;
    status: string;
  }>>({
    queryKey: [`/api/contacts/${contact.id}/appointments`],
    enabled: !!contact.id,
  });

  const { data: contactActivityRaw = [] } = useQuery<ContactActivityEvent[]>({
    queryKey: [`/api/contacts/${contact.id}/timeline?limit=40`],
    queryFn: async () => {
      const r = await fetch(`/api/contacts/${contact.id}/timeline?limit=40`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load contact activity");
      return r.json();
    },
    enabled: !!contact.id,
  });

  const contactActivity = useMemo(
    () => filterMeaningfulTimelineEvents(contactActivityRaw, 4),
    [contactActivityRaw],
  );

  // Business knowledge — used to drive qualifying questions in the Copilot panel
  const { data: businessKnowledge } = useQuery<{
    qualifyingQuestions?: Array<{ key?: string; label?: string; question: string; required?: boolean }>;
    industry?: string;
  }>({
    queryKey: ["/api/ai/business-knowledge"],
    staleTime: 5 * 60 * 1000, // cache for 5 minutes
  });

  // Normalise qualifying questions to QualifyingCriterion shape
  const qualifyingCriteria: QualifyingCriterion[] = useMemo(() => {
    const raw = businessKnowledge?.qualifyingQuestions ?? [];
    return raw
      .filter(q => q.question?.trim())
      .map((q, i) => ({
        key:      q.key   || `q_${i}`,
        label:    q.label || `Question ${i + 1}`,
        question: q.question,
        required: q.required ?? true,
      }));
  }, [businessKnowledge]);

  // AI Memory — AI-generated natural-language summary
  const [aiMemory, setAiMemory] = useState<string>('');
  const [aiMemoryLoading, setAiMemoryLoading] = useState(false);
  // Track which contact+message fingerprint the memory was generated for (avoid redundant calls)
  const aiMemoryKeyRef = useRef<string>('');

  // Follow popover: 'quick' shows the quick options; 'custom' shows date+time picker
  const [customFollowDate, setCustomFollowDate] = useState<Date | undefined>(undefined);
  const [customFollowTime, setCustomFollowTime] = useState('09:00');

  // Booking placeholder state
  const [bookingDate,      setBookingDate]      = useState<Date | undefined>(undefined);
  const [bookingTime,      setBookingTime]      = useState("10:00");
  const [bookingType,      setBookingType]      = useState("Viewing");
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [copilotExpanded, setCopilotExpanded]   = useState(true);

  useEffect(() => {
    setCompletedActions(new Set()); // Reset completed actions when contact changes
  }, [contact.id]);

  // Fetch team notes when contact changes
  useEffect(() => {
    if (!contact.id) return;
    // Snapshot the last-viewed timestamp BEFORE fetching — used to compute unread badge
    const storedKey = `notes_viewed_${contact.id}`;
    const stored = localStorage.getItem(storedKey);
    setNotesViewedAt(stored ? new Date(stored) : null);

    setNotesLoading(true);
    fetch(`/api/contacts/${contact.id}/notes`)
      .then(r => r.ok ? r.json() : [])
      .then((data: ContactNote[]) => {
        setContactNotesList(Array.isArray(data) ? data : []);
        // Update localStorage to now — next visit to this contact won't re-badge these notes
        localStorage.setItem(storedKey, new Date().toISOString());
      })
      .catch(() => setContactNotesList([]))
      .finally(() => setNotesLoading(false));
  }, [contact.id]);

  // Reset follow popover state when it closes
  useEffect(() => {
    if (!followOpen) {
      setFollowView('quick');
      setCustomFollowDate(undefined);
      setCustomFollowTime('09:00');
    }
  }, [followOpen]);

  // Build a date+time ISO from date + "HH:mm" time string
  const buildDateTimeISO = (date: Date, time: string): string => {
    const [h, m] = time.split(':').map(Number);
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  // Quick follow-up: sets 9am on the target day
  const setQuickFollowUp = (label: string) => {
    const now = new Date();
    const d   = new Date(now);
    if      (label === '24h')    d.setDate(d.getDate() + 1);
    else if (label === '3 days') d.setDate(d.getDate() + 3);
    else if (label === '1 week') d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
    onUpdateContact({ followUp: label, followUpDate: d.toISOString() });
  };

  const confirmCustomFollowUp = () => {
    if (!customFollowDate) return;
    const iso = buildDateTimeISO(customFollowDate, customFollowTime);
    const label = format(customFollowDate, 'MMM d') + ' at ' + formatTime24to12(customFollowTime);
    onUpdateContact({ followUp: label, followUpDate: iso });
    setFollowOpen(false);
  };

  const clearFollowUp = () => {
    void clearBookedMeetings()
      .catch(() => {
        toast({ title: "Failed to clear booked meeting", variant: "destructive" });
      })
      .finally(() => setFollowOpen(false));
  };

  const convStatus = primaryConversation?.status || 'open';
  const conversationStatusRow = getConversationStatusRow(convStatus);
  const followUpSt = getFollowUpStatus(contact.followUpDate);
  const contactPipelineStageOptions = useMemo(
    () => pipelineStageOptions(contact.pipelineStage),
    [contact.pipelineStage],
  );

  // ── Conversation intelligence — re-runs whenever messages change ──
  const intel = useMemo(
    () =>
      analyzeConversation(messages, {
        industry: businessKnowledge?.industry,
        businessKnowledge,
        crmLeadScore: contact.leadScore ?? null,
      }),
    [messages, businessKnowledge, contact.leadScore]
  );

  // ── Workflow layer — computes recommended actions from intel + contact state ──
  const workflow = useMemo(() => computeWorkflow(
    intel,
    {
      tag:           contact.tag || '',
      pipelineStage: contact.pipelineStage || 'Lead',
      followUpDate:  contact.followUpDate,
      assignedTo:    contact.assignedTo,
    },
    qualifyingCriteria.length > 0 ? qualifyingCriteria : undefined,
    answeredCriteriaKeys,
  ), [intel, contact.tag, contact.pipelineStage, contact.followUpDate, contact.assignedTo, qualifyingCriteria, answeredCriteriaKeys]);

  // ── AI Memory: fetch AI-generated summary whenever messages change meaningfully ──
  useEffect(() => {
    // Hard-reset when switching contacts so prior contact memory cannot linger.
    aiMemoryKeyRef.current = "";
    setAiMemory("");
    setAiMemoryLoading(false);
  }, [contact.id]);

  useEffect(() => {
    if (messages.length === 0) {
      setAiMemory('');
      aiMemoryKeyRef.current = '';
      return;
    }
    // Build a key from contact id + message count to avoid duplicate fetches
    const key = `${contact.id}:${messages.length}`;
    if (aiMemoryKeyRef.current === key) return;
    aiMemoryKeyRef.current = key;

    let cancelled = false;
    setAiMemoryLoading(true);

    fetch('/api/ai/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        messages,
        intel: {
          intent:    intel.intent,
          budget:    intel.budget,
          timeline:  intel.timeline,
          financing: intel.financing,
        },
      }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        if (!cancelled) {
          setAiMemory(
            data.memory || buildAIMemorySummary(intel, messages, { industry: businessKnowledge?.industry })
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Fallback to rule-based summary
          setAiMemory(buildAIMemorySummary(intel, messages, { industry: businessKnowledge?.industry }));
        }
      })
      .finally(() => {
        if (!cancelled) setAiMemoryLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, contact.id]);

  // ── Auto-tag: apply tag automatically when signal is strong + current tag is neutral ──
  const autoTagAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    // Phase 1 scoring: do not auto-apply tags/stages yet (suggestions only).
    return;
    if (!workflow.tagAutoApply || !workflow.tagSuggestion) return;
    const key = `${contact.id}:${workflow.tagSuggestion}`;
    if (autoTagAppliedRef.current === key) return;
    autoTagAppliedRef.current = key;
    onUpdateContact({ tag: workflow.tagSuggestion });
  }, [workflow.tagAutoApply, workflow.tagSuggestion, contact.id, onUpdateContact]);

  // ── Dev helper: expose verification runner to browser console ──
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__runCopilotVerification = runVerification;
    }
  }, []);

  const activeMembers  = teamMembers.filter(m => m.status === 'active');
  const currentWorkspaceMember = teamMembers.find(
    (m) => (m.memberId || m.id) === currentUserId,
  );
  const isWorkspaceOwner = currentWorkspaceMember?.role === "owner";
  const isWorkspaceAdmin =
    currentWorkspaceMember?.role === "owner" ||
    currentWorkspaceMember?.role === "admin";
  const assignedMember = activeMembers.find(m => (m.memberId || m.id) === contact.assignedTo);
  const assignedLabel  = assignedMember
    ? (assignedMember.name || assignedMember.email.split('@')[0])
    : null;

  // ─── Copilot computed values ───────────────────────────────────────────────
  const AI_STATE_LABELS: Record<string, string> = {
    Ready:     "Ready to convert",
    Qualifying:"Collecting details",
    Engaging:  "Engaging",
    Waiting:   "Waiting for reply",
    Stalled:   "Stalled",
  };
  const aiStateLabel = AI_STATE_LABELS[intel.aiState] ?? intel.aiState;

  /** Collapsed Copilot row — display-only */
  const copilotCollapsedSummary = useMemo(() => {
    const label =
      intel.leadScoreDetails?.bucket === "unqualified" ? "Unqualified" : intel.leadScore.label;
    const tail =
      intel.aiState === "Ready"
        ? "Ready to act"
        : intel.aiState === "Qualifying"
          ? "Qualifying"
          : intel.aiState === "Engaging"
            ? "Engaging"
            : intel.aiState === "Waiting"
              ? "Waiting for reply"
              : intel.aiState === "Stalled"
                ? "Stalled"
                : aiStateLabel;
    return `${label} lead • ${tail}`;
  }, [intel.leadScoreDetails?.bucket, intel.leadScore.label, intel.aiState, aiStateLabel]);

  const stageSignals = useMemo(
    () => getStageSignals(messages, businessKnowledge),
    [messages, businessKnowledge],
  );

  const { data: inventoryStatus } = useQuery({
    queryKey: ["/api/inventory/status"],
    queryFn: fetchInventoryStatus,
    staleTime: 60_000,
  });

  const {
    data: inventorySources,
    isFetched: inventorySourcesFetched,
    isLoading: inventorySourcesLoading,
    isError: inventorySourcesError,
    refetch: refetchInventorySources,
  } = useQuery({
    queryKey: ["/api/inventory/sources"],
    queryFn: fetchInventorySources,
    enabled: !!inventoryStatus?.canUse,
    staleTime: 60_000,
  });

  const inventoryConnected = useMemo(
    () =>
      inventorySources != null ? isWorkspaceInventoryConnected(inventorySources) : false,
    [inventorySources],
  );

  const { profile: persistedBuyerProfile, chips: persistedBuyerChips, buyerMatchingTraceId } =
    usePersistedBuyerPreferences(contact.id);

  const showCopilotInventoryPanels = useMemo(
    () =>
      shouldShowCopilotInventoryForContact({
        inventoryStatus,
        customFields: contact.customFields,
        buyerPreferenceProfile: persistedBuyerProfile,
        hideGrowthEngineForShopify: hideGrowthEngine,
      }),
    [inventoryStatus, contact.customFields, persistedBuyerProfile, hideGrowthEngine],
  );

  const customerInsights = useMemo(
    () =>
      buildCustomerInsights({
        reasons: intel.leadScoreDetails?.reasons,
        intent: intel.intent,
        bucket: intel.leadScoreDetails?.bucket,
        viewingIntent: stageSignals.viewingIntent,
        signals: intel.leadScoreDetails?.signals?.detected,
        missingRequiredCount: intel.leadScoreDetails?.missingRequired?.length ?? 0,
        score: intel.leadScoreDetails?.score,
        mediaOnly: intel.leadScoreDetails?.mediaOnly,
        inboundCount: messages.filter((m) => m.direction === "inbound").length,
        conversationTurns: Math.min(
          messages.filter((m) => m.direction === "inbound").length,
          messages.filter((m) => m.direction === "outbound").length,
        ),
        inboundText: messages.filter((m) => m.direction === "inbound").map((m) => m.content).join(" "),
      }),
    [
      intel.leadScoreDetails?.reasons,
      intel.leadScoreDetails?.bucket,
      intel.leadScoreDetails?.missingRequired,
      intel.leadScoreDetails?.score,
      intel.leadScoreDetails?.mediaOnly,
      intel.intent,
      stageSignals.viewingIntent,
      intel.leadScoreDetails?.signals?.detected,
      messages,
    ],
  );

  // ── Safe AI stage suggestion (click-to-apply only) ─────────────────────────
  const stageSuggestion = useMemo(() => {
    const d = intel.leadScoreDetails;
    if (!d) return null;
    if ((d.confidence01 ?? 0) < 0.85) return null;
    if ((d.missingRequired ?? []).length > 0) return null;
    if (!["Lead", "Contacted"].includes(contact.pipelineStage)) return null;

    const signals = stageSignals;
    const deterministicIntent = signals.strongIntent || signals.viewingIntent;
    const stageExists = (s: string) => contactPipelineStageOptions.includes(s);

    // Generic: Lead → Contacted only, when deterministic intent from inbound (detectIntent), not auto-move.
    if (!signals.isRealEstate) {
      if (contact.pipelineStage !== "Lead") return null;
      if (!deterministicIntent) return null;
      return "Contacted";
    }

    // Real estate — Lead → Contacted: strong engagement + (intent or viewing), or viewing alone (tour/showing).
    if (contact.pipelineStage === "Lead") {
      const leadToContacted =
        (signals.strongEngagement && (signals.strongIntent || signals.viewingIntent)) ||
        signals.viewingIntent;
      if (!leadToContacted) return null;
      return "Contacted";
    }

    // Contacted → Qualified (Hot): hot bucket, deterministic intent, stage name must be plausible for this workspace.
    if (
      contact.pipelineStage === "Contacted" &&
      d.bucket === "hot" &&
      deterministicIntent &&
      stageExists("Qualified (Hot)")
    ) {
      return "Qualified (Hot)";
    }

    // Viewing/showing/tour → first appointment stage that exists (RGE-style names).
    if (contact.pipelineStage === "Contacted" && signals.viewingIntent) {
      const candidates = ["Appointment Requested", "Appointment Booked", "Appointment Set"];
      const found = candidates.find(stageExists);
      return found ?? null;
    }

    return null;
  }, [intel.leadScoreDetails, contact.pipelineStage, contactPipelineStageOptions, stageSignals]);

  // ── System score auto-tag ─────────────────────────────────────────────────
  // Conversation-scoped Copilot intent must not mutate contact CRM classification.
  // Durable contact.tag / lead_score are owned by W2 + manual edits (scoreSource=crm).
  const systemScoreTagKeyRef = useRef<string>("");
  useEffect(() => {
    const d = intel.leadScoreDetails;
    if (!d) return;

    const desiredTag = systemTagForQualification(
      d.bucket as "hot" | "warm" | "cold" | "unqualified",
      d.score ?? 0,
    );
    if (!desiredTag) return;

    // Always log; never POST conversation-scoped mutations.
    if ((d.scoreSource || "conversation") !== "crm") {
      console.info(
        JSON.stringify({
          tag: "[LeadScoreAudit]",
          event: "classification_unchanged",
          writer: "InboxLeadDetailsPanel.systemScoreTag",
          reason: "conversation_scoped_no_contact_mutation",
          contactIdPrefix: String(contact.id).slice(0, 8),
          crmTag: contact.tag || null,
          conversationDesiredTag: desiredTag,
          conversationScore: d.score,
          scoreSource: d.scoreSource ?? "conversation",
        }),
      );
      return;
    }

    if (isQualificationDowngrade(desiredTag, contact.tag)) return;
    if ((d.confidence01 ?? 0) < 0.75) return;

    const key = `${contact.id}:${desiredTag}:${Math.round((d.confidence01 ?? 0) * 100)}:${d.score}`;
    if (systemScoreTagKeyRef.current === key) return;
    systemScoreTagKeyRef.current = key;

    fetch(`/api/contacts/${contact.id}/system-score-tag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        bucket: d.bucket,
        score: d.score,
        confidence: d.confidence01,
        reasons: d.reasons,
        tagDiagnostics: d.tagDiagnostics,
        scoreSource: "crm",
        conversationScore: d.conversationScore,
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((resp) => {
        console.info(
          JSON.stringify({
            tag: "[LeadScoreAudit]",
            event: resp?.applied ? "classification_changed" : "classification_unchanged",
            writer: "InboxLeadDetailsPanel.systemScoreTag",
            reason: resp?.reason ?? null,
            contactIdPrefix: String(contact.id).slice(0, 8),
            applied: Boolean(resp?.applied),
            oldTag: resp?.oldTag ?? null,
            newTag: resp?.newTag ?? null,
          }),
        );
        if (resp?.applied && resp.newTag) {
          onUpdateContact({ tag: resp.newTag });
          void queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
          void queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
        }
      })
      .catch(() => {});
  }, [contact.id, intel.leadScoreDetails, contact.tag, contact.leadScore, onUpdateContact, queryClient]);

  const completeAction = (actionType: string, toastMsg: string) => {
    setFadingAction(actionType);
    setTimeout(() => {
      setCompletedActions(prev => new Set([...Array.from(prev), actionType]));
      setFadingAction(null);
    }, 150);
    toast({ title: toastMsg, duration: 2500 });
  };

  const qualifyAction     = canSeeWorkflow ? workflow.actions.find(a => a.type === 'qualify' && !completedActions.has('qualify')) : undefined;
  const activeChipActions = canSeeWorkflow
    ? workflow.actions.filter(
        (a) =>
          a.type !== "qualify" &&
          a.type !== "follow" &&
          a.type !== "assign" &&
          !completedActions.has(a.type),
      )
    : [];
  const hasTagSuggestion  = canSeeWorkflow && !!workflow.tagSuggestion && !workflow.tagAutoApply && !completedActions.has('tag');
  const hasStageSuggestion = canSeeWorkflow && !!workflow.stageSuggestion && !completedActions.has('stage');
  const hasAnyChips       = activeChipActions.length > 0 || hasTagSuggestion || hasStageSuggestion;
  const activeSuggestionCount = (hasAnyChips ? 1 : 0) + (qualifyAction ? 1 : 0);

  type NextBestActionRow = {
    id: "book" | "assign" | "follow" | "snooze" | "qualify" | "campaign" | "info";
    label: string;
    priority: number;
    onClick: () => void;
    title?: string;
    informational?: boolean;
  };

  const inboundText = useMemo(
    () =>
      messages
        .filter((m) => m.direction === "inbound")
        .map((m) => m.content)
        .join(" "),
    [messages],
  );

  const lastInboundText = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.direction === "inbound");
    return last?.content ?? "";
  }, [messages]);

  /** Buyer Preferences — shared domain eligibility (buyer/rental/mixed only). */
  const showCopilotBuyerPreferences = useMemo(
    () =>
      shouldShowCopilotBuyerPreferences({
        inventoryStatus,
        industry: businessKnowledge?.industry,
        customFields: contact.customFields,
        hideGrowthEngineForShopify: hideGrowthEngine,
        inboundText: lastInboundText || inboundText,
        conversationText: inboundText,
        contactEmail: contact.email,
        buyerPreferenceProfile: persistedBuyerProfile,
      }),
    [
      inventoryStatus,
      businessKnowledge?.industry,
      contact.customFields,
      contact.email,
      hideGrowthEngine,
      lastInboundText,
      inboundText,
      persistedBuyerProfile,
    ],
  );

  const schedulingLinkSent = useMemo(
    () =>
      contactActivityRaw.some((e) => {
        const hay = `${JSON.stringify(e.eventData ?? {})}`.toLowerCase();
        return /scheduling link sent|booking link sent/i.test(hay);
      }),
    [contactActivityRaw],
  );

  const buyerPrefChips = useMemo(
    () =>
      persistedBuyerChips.length > 0
        ? persistedBuyerChips
        : buildBuyerPreferenceSearchChips(persistedBuyerProfile),
    [persistedBuyerChips, persistedBuyerProfile],
  );
  const buyerPrefsHasCriteria = buyerPrefChips.length > 0;

  useEffect(() => {
    if (!contact.id || persistedBuyerProfile == null) return;
    const profile = normalizeForDisplay(persistedBuyerProfile);
    const mismatches = detectChipProfileMismatches(profile, buyerPrefChips);
    logBuyerMatchingTraceClient({
      step: "displayed_chips",
      traceId: buyerMatchingTraceId ?? resolveClientBuyerMatchingTraceId(contact.id),
      contactId: contact.id,
      source: "InboxLeadDetailsPanel",
      layer: "ui",
      savedProfile: snapshotProfileTraceFields(profile),
      displayedChips: buyerPrefChips.map((c) => ({ id: c.id, label: c.label, value: c.value })),
      mismatches,
    });
  }, [contact.id, persistedBuyerProfile, buyerPrefChips, buyerMatchingTraceId]);

  const customerSummaryBullets = useMemo(
    () =>
      buildCustomerSummaryBullets({
        memoryParagraph: aiMemory,
        inboundText,
        budget: intel.budget,
        timeline: intel.timeline,
        financing: intel.financing,
        intent: intel.intent,
        viewingIntent: stageSignals.viewingIntent,
        suppressCriteriaBullets: buyerPrefsHasCriteria,
      }),
    [
      aiMemory,
      inboundText,
      intel.budget,
      intel.timeline,
      intel.financing,
      intel.intent,
      stageSignals.viewingIntent,
      buyerPrefsHasCriteria,
    ],
  );

  const contextualNextActions = useMemo(() => {
    const intentText = `${intel.intent ?? ""}`.toLowerCase();
    const lastMsg = messages[messages.length - 1];
    const lastMsgText =
      lastMsg?.direction === "inbound" ? `${lastMsg.content ?? ""}`.toLowerCase() : "";
    const hay = `${inboundText} ${intentText}`.toLowerCase();
    const aiRouting = resolveAiRouting({
      inbound: lastMsgText || inboundText,
      joinedInbound: inboundText,
      history: messages.map((m) => ({
        role: m.direction === "inbound" ? "user" : "assistant",
        content: m.content,
      })),
      industry: businessKnowledge?.industry,
      industrySignals: {
        viewingIntent: stageSignals.viewingIntent,
        strongIntent: stageSignals.strongIntent,
      },
    });
    const hasBookingIntent =
      aiRouting.decision === "BOOK_APPOINTMENT" ||
      (stageSignals.viewingIntent ||
        /book|schedule|appointment|showing|tour|viewing|visit|availability/.test(hay));
    const mentionedDeposit = /\b(deposit|earnest money|down payment)\b/i.test(inboundText);
    const hasFinancingDiscussion =
      mentionedDeposit ||
      /\b(mortgage|loan|financ)\b/i.test(inboundText) ||
      (!intel.hasFinancing && /\b(pre.?approv|lender)\b/i.test(inboundText));
    const hasStrongPurchaseIntent =
      /buy|purchase|ready to buy|make an offer|offer|ready to move/.test(hay);
    const hasDelayLaterSignal =
      /\blater\b|\bnot now\b|\bnext week\b|\bnext month\b|\bbusy\b|\bmaybe later\b/.test(lastMsgText);

    const sellerProfile = (contact as { sellerPreferenceProfile?: { lastSellerIntent?: string } })
      .sellerPreferenceProfile;
    const sellerIntent = classifySellerIntent({
      inboundText: lastMsgText || inboundText,
      hasSellerProfile: Boolean(sellerProfile),
      priorSellerIntent:
        (sellerProfile?.lastSellerIntent as import("@shared/sellerIntent").SellerIntentClass | undefined) ??
        null,
    });

    return buildContextualNextActions({
      handoffActive,
      hasShowingIntent: hasBookingIntent,
      hasFinancingDiscussion,
      hasStrongPurchaseIntent,
      bucket: intel.leadScoreDetails?.bucket,
      leadLabel: intel.leadScore.label,
      lastDirection: messages.length > 0 ? messages[messages.length - 1].direction : null,
      hasFollowUp: !!contact.followUpDate,
      assignedTo: contact.assignedTo,
      confidence: intel.leadScoreDetails?.confidence01,
      aiPaused: effectiveAiPaused,
      hasDelayLater: hasDelayLaterSignal,
      lastOutbound: messages.length > 0 && messages[messages.length - 1].direction === "outbound",
      inboundText,
      latestInboundText: lastMsgText || undefined,
      showingTimingPhrase: extractShowingTimingPhrase(inboundText),
      mentionedDeposit,
      schedulingLinkSent,
      aiRoutingDecision: aiRouting.decision,
      needsRoutingClarification: aiRouting.needsRoutingClarification,
      enrollableCampaignCount,
      sellerIntent,
      rgeInstalled: inventoryStatus?.rgeInstalled === true,
      industry: businessKnowledge?.industry,
      leadType: String(
        (contact.customFields as Record<string, unknown> | undefined)?.leadType || "",
      ),
      buyerProfileHasCriteria: contactHasInventoryMatchCriteria(persistedBuyerProfile),
      sellerProfileHasData: Boolean(sellerProfile),
      contactEmail: contact.email ?? null,
      conversationText: inboundText,
    });
  }, [
    handoffActive,
    intel.intent,
    intel.hasFinancing,
    intel.leadScore.label,
    intel.leadScoreDetails?.bucket,
    intel.leadScoreDetails?.confidence01,
    messages,
    inboundText,
    contact.assignedTo,
    contact.followUpDate,
    contact.customFields,
    contact.email,
    effectiveAiPaused,
    stageSignals.viewingIntent,
    stageSignals.strongIntent,
    businessKnowledge?.industry,
    schedulingLinkSent,
    enrollableCampaignCount,
    inventoryStatus?.rgeInstalled,
    persistedBuyerProfile,
  ]);

  const runComposerAction = useCallback(
    async (label: string) => {
      if (isSchedulingComposerAction(label)) {
        try {
          const params = new URLSearchParams();
          if (contact.id) params.set("contactId", contact.id);
          const res = await fetch(`/api/scheduling/customer-url?${params.toString()}`, {
            credentials: "include",
          });
          if (res.status === 401) {
            toast({
              title: "Session expired",
              description: "Sign in again to insert a scheduling link.",
              variant: "destructive",
            });
            return;
          }
          if (!res.ok) {
            throw new Error((await res.text()) || "Failed to load scheduling URL");
          }
          const data = (await res.json()) as {
            url?: string;
            source?: string;
            syncWarning?: string | null;
          };
          const draft = buildSchedulingComposerDraft(data.url || "");
          console.info(
            "[CopilotSchedulingDraft]",
            JSON.stringify({
              contactId: contact.id,
              source: data.source ?? null,
              hasUrl: !!data.url,
              syncWarning: data.syncWarning ?? null,
            }),
          );
          const inserted = onInsertComposerDraft?.(draft) ?? false;
          if (!inserted) {
            console.warn("[CopilotSchedulingDraft] Failed to insert composer draft for action:", label);
            return;
          }
          if (data.syncWarning) {
            console.warn("[CalendlySyncWarning]", data.syncWarning);
            toast({
              title: "Draft added to composer",
              description: data.syncWarning,
              duration: 5000,
            });
          } else if (!data.url?.trim()) {
            toast({
              title: "Draft added to composer",
              description: "Connect Calendly in Integrations to include your booking link.",
              duration: 4500,
            });
          } else {
            toast({ title: "Draft added to composer", duration: 2500 });
          }
        } catch (err) {
          console.warn("[CopilotSchedulingDraft] scheduling URL fetch failed:", err);
          const fallback = composerSuggestionForAction(label);
          const inserted = onInsertComposerDraft?.(fallback) ?? false;
          if (inserted) {
            toast({
              title: "Draft added without booking link",
              description: "Could not load your Calendly URL. Connect Calendly in Integrations and try again.",
              variant: "destructive",
              duration: 4500,
            });
          }
        }
        return;
      }

      const text = composerSuggestionForAction(label);
      if (!text.trim()) {
        console.warn("[Copilot] Empty draft for action:", label);
        return;
      }
      const inserted = onInsertComposerDraft?.(text) ?? false;
      if (inserted) {
        toast({ title: "Draft added to composer", duration: 2500 });
      } else {
        console.warn("[Copilot] Failed to insert composer draft for action:", label);
      }
    },
    [contact.id, onInsertComposerDraft, toast],
  );

  const nextBestActions = useMemo((): NextBestActionRow[] => {
    if (!canSeeWorkflow) return [];

    const runToolAction = (behavior: Exclude<NextBestActionBehavior, "composer" | "campaign" | "info">) => {
      openCopilotPopover(behavior);
    };

    return contextualNextActions.map((action, i) => {
      const behavior = action.behavior;
      const id: NextBestActionRow["id"] =
        behavior === "composer"
          ? "qualify"
          : behavior === "campaign"
            ? "campaign"
            : behavior === "info"
              ? "info"
              : behavior;
      const onClick = () => {
        if (behavior === "info") return;
        if (behavior === "composer") {
          void runComposerAction(action.label);
        } else if (behavior === "campaign") {
          openCampaignPicker();
        } else {
          runToolAction(behavior);
        }
      };
      return {
        id,
        label: action.label,
        priority: 100 - i,
        onClick,
        title: action.label,
        informational: behavior === "info",
      };
    });
  }, [canSeeWorkflow, contextualNextActions, openCopilotPopover, openCampaignPicker, runComposerAction]);

  return (
    <div
      className={
        panelClassName ??
        "hidden lg:flex lg:h-full lg:min-h-0 lg:w-[272px] lg:min-w-[272px] min-[1200px]:w-[400px] min-[1200px]:min-w-[400px] flex-col border-l border-gray-100 bg-white overflow-hidden flex-shrink-0"
      }
      data-testid="inbox-lead-details-panel"
    >

      {/* ══ COPILOT — distinct assistant region ═════════════════════════════════ */}
      <div
        className={cn(
          "mx-2 mt-2 mb-2 flex min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm shadow-gray-900/[0.06]",
          copilotExpanded && "max-h-[min(72vh,720px)]",
          !copilotExpanded && "mb-2",
        )}
      >
      {/* ══ COPILOT FIXED HEADER ════════════════════════════════════════ */}
      <div
        className={cn(
          "z-10 shrink-0 rounded-t-xl transition-colors duration-200",
          copilotExpanded
            ? "bg-gray-50/90 border-b border-gray-200"
            : "bg-gray-50/70 border-b border-gray-200",
        )}
      >
        {/* Full-width clickable header row */}
        <div
          onClick={() => setCopilotExpanded(p => !p)}
          className={cn(
            "px-3 pt-2.5 pb-1.5 flex items-start justify-between cursor-pointer transition-colors select-none gap-2",
            copilotExpanded ? "hover:bg-gray-100/70" : "hover:bg-gray-100/60",
          )}
          data-testid="button-copilot-collapse"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Sparkles
                className={cn(
                  "w-3.5 h-3.5 shrink-0 transition-colors duration-200",
                  copilotExpanded ? "text-gray-700" : "text-gray-600",
                )}
              />
              <span className="text-sm font-bold tracking-tight text-gray-900">Copilot</span>
            </div>
            {hasAIBrain && (
              <p className="text-[9px] text-gray-500 font-medium mt-1 ml-[22px] leading-tight">
                {headerShowsSnoozed ? "AI paused for this conversation" : "AI Brain"}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            {canSeeCopilot ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCopilotSnooze();
                }}
                className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded-full border transition-colors leading-none",
                  headerShowsSnoozed
                    ? "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50",
                )}
                data-testid="button-ai-toggle"
              >
                {headerShowsSnoozed ? "Snoozed" : "Active"}
              </button>
            ) : (
              <span className="text-[10px] text-gray-300 font-medium">{copilotUpgradeTo}+</span>
            )}

            <div className="flex items-center gap-0.5 text-gray-500">
              <ChevronDown
                className={cn("w-[18px] h-[18px] transition-transform duration-200", copilotExpanded && "rotate-180")}
              />
              <span className="text-[10px] font-medium">{copilotExpanded ? "Collapse" : "Expand"}</span>
            </div>
          </div>
        </div>

        {/* Collapsed — one-line summary, compact height */}
        {!copilotExpanded && canSeeCopilot && (
          <div
            onClick={() => setCopilotExpanded(true)}
            className="px-3 py-1.5 flex items-center justify-between gap-2 cursor-pointer border-t border-gray-200"
          >
            <p className="text-[11px] font-medium text-gray-800 leading-tight truncate min-w-0">
              {copilotCollapsedSummary}
            </p>
            {activeSuggestionCount > 0 && (
              <span className="text-[9px] text-gray-600 font-semibold shrink-0">
                {activeSuggestionCount} suggestion{activeSuggestionCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Utilities (operational) — keep near top under header */}
      {copilotExpanded && (
      <div className="shrink-0 border-b border-gray-200 bg-gray-50/60 px-3 py-2 animate-in fade-in duration-150">
        <div className="grid grid-cols-4 gap-1">

          {/* ── BOOK ── */}
          <Popover open={bookOpen} onOpenChange={(open) => handleCopilotPopoverOpenChange("book", open)}>
            <PopoverTrigger asChild>
              <button
                className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                data-testid="button-ai-book"
              >
                <CalendarIcon className="w-3 h-3 text-gray-500" />
                <span className="text-[9px] text-gray-500 font-medium">Book</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-2.5" align="start" side="bottom" sideOffset={4}>
              <CopilotPopoverHeader title="Schedule appointment" onClose={() => setBookOpen(false)} />
              {bookingConfirmed ? (
                <div className="flex flex-col gap-1.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <p className="text-[12px] font-semibold text-emerald-700">Appointment saved</p>
                  </div>
                  {contactAppointments.length > 0 && (
                    <div className="mt-1 space-y-1">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">All appointments</p>
                      {contactAppointments.map(a => (
                        <div key={a.id} className="flex items-center justify-between gap-1 text-[11px] text-gray-600">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-gray-700 font-medium shrink-0">{a.appointmentType}</span>
                            <span className="text-gray-400">·</span>
                            <span className="truncate">{format(new Date(a.appointmentDate), 'MMM d · h:mm a')}</span>
                          </div>
                          <button
                            onClick={() => void deleteContactAppointment(a.id).catch(() => {
                              toast({ title: "Failed to remove appointment", variant: "destructive" });
                            })}
                            className="shrink-0 text-gray-300 hover:text-red-400 transition-colors ml-1"
                            title="Delete appointment"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    className="mt-1 text-[10px] text-gray-400 hover:text-gray-600 underline self-start"
                    onClick={() => { setBookingConfirmed(false); setBookingDate(undefined); }}
                  >
                    Schedule another
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {contactAppointments.length > 0 && (
                    <div className="pb-2 border-b border-gray-100">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Upcoming</p>
                      {contactAppointments.slice(0, 3).map(a => (
                        <div key={a.id} className="flex items-center justify-between gap-1 text-[11px] text-gray-600">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-gray-700 font-medium shrink-0">{a.appointmentType}</span>
                            <span className="text-gray-300">·</span>
                            <span className="truncate">{format(new Date(a.appointmentDate), 'MMM d, h:mm a')}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteContactAppointment(a.id).catch(() => {
                                toast({ title: "Failed to remove appointment", variant: "destructive" });
                              });
                            }}
                            className="shrink-0 text-gray-300 hover:text-red-400 transition-colors ml-1"
                            title="Delete appointment"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide font-semibold">Type</p>
                    <div className="flex gap-1 flex-wrap">
                      {['Viewing', 'Consultation', 'Call', 'Meeting'].map(t => (
                        <button
                          key={t}
                          onClick={() => setBookingType(t)}
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded-full border transition-colors font-medium",
                            bookingType === t
                              ? "bg-gray-100 text-gray-800 border-gray-300"
                              : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                          )}
                        >{t}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide font-semibold">Date</p>
                    <input
                      type="date"
                      min={format(new Date(), 'yyyy-MM-dd')}
                      value={bookingDate ? format(bookingDate, 'yyyy-MM-dd') : ''}
                      onChange={e => setBookingDate(e.target.value ? new Date(e.target.value + 'T12:00:00') : undefined)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-400"
                      data-testid="input-booking-date"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide font-semibold">Time</p>
                    <div className="flex gap-1 flex-wrap">
                      {TIME_SLOTS.map(t => (
                        <button
                          key={t}
                          onClick={() => setBookingTime(t)}
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                            bookingTime === t
                              ? "bg-gray-100 text-gray-800 border-gray-300 font-semibold"
                              : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                          )}
                        >{formatTime24to12(t)}</button>
                      ))}
                    </div>
                  </div>
                  <button
                    disabled={!bookingDate}
                    onClick={async () => {
                    if (bookingDate) {
                      const [hh, mm] = bookingTime.split(':').map(Number);
                      const apptDate = new Date(bookingDate);
                      apptDate.setHours(hh, mm, 0, 0);
                      const dateStr = format(bookingDate, 'MMM d') + ' at ' + formatTime24to12(bookingTime);
                      const apptLabel = `${bookingType} · ${dateStr}`;

                      try {
                        await fetch('/api/appointments', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({
                            contactId: contact.id,
                            contactName: contact.name,
                            appointmentType: bookingType,
                            appointmentDate: apptDate.toISOString(),
                            title: apptLabel,
                          }),
                        });
                        queryClient.invalidateQueries({ queryKey: [`/api/contacts/${contact.id}/appointments`] });
                        queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
                      } catch (_) {}

                      onUpdateContact({
                        followUp: apptLabel,
                        followUpDate: apptDate.toISOString(),
                      });

                      setBookingConfirmed(true);
                      toast({ title: `${bookingType} booked`, description: `${contact.name} · ${dateStr}`, duration: 3500 });
                    }
                  }}
                    className={cn(
                      "w-full mt-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors",
                      bookingDate
                        ? "bg-gray-900 text-white hover:bg-gray-800"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    )}
                    data-testid="button-confirm-booking"
                  >
                    Confirm Appointment
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* ── ASSIGN ── */}
          <Popover open={assignOpen} onOpenChange={(open) => handleCopilotPopoverOpenChange("assign", open)}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1.5 rounded-lg border transition-colors",
                  assignedLabel
                    ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                )}
                data-testid="button-ai-assign"
                title={assignedLabel ? `Assigned: ${assignedLabel}` : "Assign agent"}
              >
                <UserCheck className={cn("w-3 h-3", assignedLabel ? "text-emerald-600" : "text-gray-500")} />
                <span className={cn("text-[9px] font-medium truncate max-w-[44px] text-center leading-tight",
                  assignedLabel ? "text-emerald-700" : "text-gray-500"
                )}>
                  {assignedLabel ? assignedLabel.split(' ')[0] : "Assign"}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-1.5" align="start" side="bottom" sideOffset={4}>
              <CopilotPopoverHeader title="Assign to" onClose={() => setAssignOpen(false)} />
              <button
                onClick={() => { onUpdateContact({ assignedTo: null }); setAssignOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] transition-colors",
                  !contact.assignedTo ? "bg-gray-100 text-gray-600 font-medium" : "text-gray-500 hover:bg-gray-50"
                )}
                data-testid="assign-option-unassigned"
              >
                <User className="w-3 h-3 text-gray-400" />
                Unassigned
              </button>
              {activeMembers.map(m => {
                const val      = m.memberId || m.id;
                const name     = m.name || m.email.split('@')[0];
                const isActive = contact.assignedTo === val;
                return (
                  <button
                    key={m.id}
                    onClick={() => { onUpdateContact({ assignedTo: val }); setAssignOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] transition-colors",
                      isActive ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700 hover:bg-gray-50"
                    )}
                    data-testid={`assign-option-${val}`}
                  >
                    <UserCheck className={cn("w-3 h-3", isActive ? "text-emerald-500" : "text-gray-400")} />
                    {name}
                    {isActive && <CheckCircle2 className="w-3 h-3 ml-auto text-emerald-500" />}
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>

          {/* ── FOLLOW: opens popover with quick opts + custom picker ── */}
          <Popover open={followOpen} onOpenChange={(open) => handleCopilotPopoverOpenChange("follow", open)}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1.5 rounded-lg border transition-colors",
                  contact.followUpDate
                    ? "border-amber-200 bg-amber-50 hover:bg-amber-100"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                )}
                data-testid="button-ai-followup"
                title="Schedule follow-up"
              >
                <Bell className={cn("w-3 h-3", contact.followUpDate ? "text-amber-600" : "text-gray-500")} />
                <span className={cn("text-[9px] font-medium", contact.followUpDate ? "text-amber-700" : "text-gray-500")}>
                  {contact.followUpDate ? "Set" : "Follow"}
                </span>
              </button>
            </PopoverTrigger>

            <PopoverContent
              className="w-[220px] p-2.5 max-h-[80vh] overflow-y-auto flex flex-col"
              align="start"
              side="bottom"
              sideOffset={4}
            >
              <CopilotPopoverHeader
                title={followView === "quick" ? "Follow-up" : "Custom follow-up"}
                onClose={() => setFollowOpen(false)}
              />

              {/* ─ QUICK OPTIONS VIEW ─ */}
              {followView === 'quick' && (
                <>
                  {[
                    { label: '24h',    display: 'Tomorrow (24h)',  },
                    { label: '3 days', display: '3 days'           },
                    { label: '1 week', display: '1 week'           },
                  ].map(({ label, display }) => (
                    <button
                      key={label}
                      onClick={() => { setQuickFollowUp(label); setFollowOpen(false); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-gray-700 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                      data-testid={`followup-quick-${label.replace(' ', '-')}`}
                    >
                      <Clock className="w-3 h-3 text-gray-400" />
                      {display}
                    </button>
                  ))}

                  {/* Custom date & time option */}
                  <button
                    onClick={() => setFollowView('custom')}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-gray-700 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                    data-testid="followup-custom-open"
                  >
                    <CalendarIcon className="w-3 h-3 text-gray-400" />
                    Custom date &amp; time…
                  </button>

                  {contact.followUpDate && (
                    <>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={clearFollowUp}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        data-testid="followup-quick-clear"
                      >
                        <X className="w-3 h-3" />
                        Clear follow-up
                      </button>
                    </>
                  )}
                </>
              )}

              {/* ─ CUSTOM DATE & TIME VIEW ─ */}
              {followView === 'custom' && (
                <div className="space-y-2">
                  {/* Back button */}
                  <button
                    onClick={() => setFollowView('quick')}
                    className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
                    data-testid="followup-custom-back"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Back
                  </button>

                  {/* Date picker */}
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide font-semibold">Date</p>
                    <input
                      type="date"
                      min={format(new Date(), 'yyyy-MM-dd')}
                      value={customFollowDate ? format(customFollowDate, 'yyyy-MM-dd') : ''}
                      onChange={e => setCustomFollowDate(e.target.value ? new Date(e.target.value + 'T12:00:00') : undefined)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                      data-testid="input-followup-date"
                    />
                  </div>

                  {/* Time picker */}
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide font-semibold">Time</p>
                    <div className="flex flex-wrap gap-1">
                      {TIME_SLOTS.map(t => (
                        <button
                          key={t}
                          onClick={() => setCustomFollowTime(t)}
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                            customFollowTime === t
                              ? "bg-amber-50 text-amber-700 border-amber-300 font-semibold"
                              : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                          )}
                          data-testid={`followup-time-${t}`}
                        >
                          {formatTime24to12(t)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Confirm button */}
                  <div className="pt-1 border-t border-gray-100">
                    <button
                      disabled={!customFollowDate}
                      onClick={confirmCustomFollowUp}
                      className={cn(
                        "w-full py-1.5 rounded-lg text-[11px] font-semibold transition-colors",
                        customFollowDate
                          ? "bg-amber-500 text-white hover:bg-amber-600"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      )}
                      data-testid="followup-custom-confirm"
                    >
                      Set Follow-up
                    </button>
                  </div>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* ── SNOOZE ── */}
          <Popover open={snoozeOpen} onOpenChange={(open) => handleCopilotPopoverOpenChange("snooze", open)}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1.5 rounded-lg border transition-colors",
                  headerShowsSnoozed
                    ? "border-gray-200 bg-gray-100 hover:bg-gray-200"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                )}
                data-testid="button-ai-pause"
                title="Temporarily pause AI for this conversation"
              >
                {headerShowsSnoozed
                  ? <PlayCircle className="w-3 h-3 text-gray-500" />
                  : <PauseCircle className="w-3 h-3 text-gray-500" />
                }
                <span className="text-[9px] text-gray-500 font-medium">AI</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-2.5" align="start" side="bottom" sideOffset={4}>
              <CopilotPopoverHeader
                title={headerShowsSnoozed ? "AI paused" : "Snooze AI"}
                onClose={() => setSnoozeOpen(false)}
              />
              <button
                type="button"
                onClick={() => {
                  toggleCopilotSnooze();
                  setSnoozeOpen(false);
                }}
                className="w-full rounded-lg py-1.5 text-[11px] font-semibold bg-gray-900 text-white hover:bg-gray-800 transition-colors"
              >
                {headerShowsSnoozed ? "Resume AI" : "Pause for this conversation"}
              </button>
            </PopoverContent>
          </Popover>

        </div>
      </div>
      )}
      {/* end Copilot header + quick actions tinted shell */}

      {/* ══ Copilot scrollable body (header + utilities stay fixed above) ═ */}
      {copilotExpanded && (
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="px-3 py-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="min-w-0 pt-1 pb-2">

              {!canSeeCopilot ? (
                <AIUpgradePrompt
                  feature="Copilot"
                  requiredPlan={copilotUpgradeTo}
                  reason="Reads conversations and auto-extracts budget, timeline, financing, and lead intent to help you qualify leads faster."
                  size="md"
                />
              ) : (
                <>
                  {!primaryConversation || messages.length === 0 ? (
                    <div
                      className="mb-3 rounded-lg border border-dashed border-gray-200 bg-gray-50/80 px-3 py-2.5"
                      data-testid="copilot-no-conversation-context"
                    >
                      <p className="text-[12px] font-medium text-gray-700">No conversation context yet</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        Conversation-based insights appear after the first message on this contact.
                      </p>
                    </div>
                  ) : null}
                  {/* A. Lead score + insights (action-oriented; criteria live in Buyer Preferences) */}
                  <div className="space-y-3">
                    {intel.leadScoreDetails && messages.length > 0 ? (
                      <div className="flex items-end justify-between gap-2">
                        <div className="space-y-0.5 min-w-0">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                            Lead score
                          </p>
                          <p className="text-[22px] font-bold text-gray-900 tabular-nums leading-none">
                            {intel.leadScoreDetails.score}
                          </p>
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <span className={cn("w-2 h-2 rounded-full shrink-0", intel.leadScore.dot)} />
                            <span className={cn("text-[11px] font-semibold truncate", intel.leadScore.color)}>
                              {(intel.leadScoreDetails?.bucket === "unqualified"
                                ? "Unqualified"
                                : intel.leadScore.label)}{" "}
                              Lead
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : messages.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", intel.leadScore.dot)} />
                        <span className={cn("text-[13px] font-bold", intel.leadScore.color)}>
                          {intel.leadScore.label} Lead
                        </span>
                      </div>
                    ) : null}

                    {customerInsights.length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                          Customer insights
                        </p>
                        {customerInsights.length === 1 ? (
                          <p className="text-[12px] font-medium text-gray-800 leading-snug">
                            {customerInsights[0]}
                          </p>
                        ) : (
                          <ul className="space-y-0.5">
                            {customerInsights.map((insight) => (
                              <li
                                key={insight}
                                className="text-[12px] font-medium text-gray-800 leading-snug flex gap-1.5"
                              >
                                <span className="text-gray-400 shrink-0">•</span>
                                <span>{insight}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : null}

                    {qualifyingCriteria.length > 0 && !buyerPrefsHasCriteria ? (
                      <div className="flex flex-col gap-1">
                        {qualifyingCriteria.map((criterion) => {
                          const isAnswered = answeredCriteriaKeys.has(criterion.key);
                          return (
                            <button
                              key={criterion.key}
                              onClick={() => {
                                setAnsweredCriteriaKeys(prev => {
                                  const next = new Set(prev);
                                  if (next.has(criterion.key)) next.delete(criterion.key);
                                  else next.add(criterion.key);
                                  return next;
                                });
                              }}
                              className="flex items-center gap-1.5 min-w-0 text-left hover:opacity-70 transition-opacity"
                              title={isAnswered ? "Mark as unanswered" : "Mark as answered"}
                            >
                              {isAnswered
                                ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                                : <Circle className="w-3 h-3 text-gray-300 shrink-0" />
                              }
                              <span className={cn("text-[11px] truncate", isAnswered ? "text-gray-700" : "text-gray-400")}>
                                <span className="font-medium">{criterion.label}</span>
                                {!isAnswered && <span className="text-gray-300"> —</span>}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  {/* B. Primary recommendation (focused) + secondary suggestions */}
                  {canSeeWorkflow && (() => {
                    const actionRows = nextBestActions;
                    const primary = actionRows[0];
                    const secondary = actionRows.slice(1, 3).filter((r) => !r.informational);
                    if (!primary && !handoffActive) return null;

                    return (
                      <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-md shadow-gray-900/[0.06] ring-1 ring-gray-100/80">
                        <p className="text-[9px] uppercase tracking-widest font-bold text-gray-500">
                          {primary?.informational ? "Status" : "Primary recommendation"}
                        </p>

                        {handoffActive && (
                          <div className="mt-2 rounded-lg border border-amber-200/70 bg-amber-50/60 px-2.5 py-2">
                            <p className="text-[11px] font-semibold text-gray-900 leading-snug">
                              Customer requested human assistance
                            </p>
                            {handoffMessage ? (
                              <p className="text-[10px] text-gray-600 mt-0.5 leading-snug">
                                {handoffMessage}
                              </p>
                            ) : null}
                          </div>
                        )}

                        {primary?.informational ? (
                          <div
                            className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2"
                            data-testid="next-best-action-primary-info"
                          >
                            <p className="text-[12px] font-semibold text-gray-800 leading-snug">
                              {primary.label}
                            </p>
                            <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                              Automated or system notification — no lead follow-up needed.
                            </p>
                          </div>
                        ) : primary ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              primary.onClick();
                            }}
                            className="mt-2 w-full text-left rounded-lg border border-gray-200 bg-gray-50 hover:bg-white transition-colors px-2.5 py-2"
                            data-testid={`next-best-action-primary-${primary.id}`}
                            title={primary.title ?? primary.label}
                          >
                            <p className="text-[12px] font-semibold text-gray-900 leading-snug flex gap-1.5 items-start">
                              <span className="text-gray-700 shrink-0 font-bold">→</span>
                              <span>{primary.label}</span>
                            </p>
                          </button>
                        ) : null}

                        {secondary.length > 0 ? (
                          <div className="mt-2">
                            <p className="text-[9px] uppercase tracking-wide font-semibold text-gray-400">
                              Also consider
                            </p>
                            <div className="mt-1 space-y-1">
                              {secondary.map((row) => (
                                <button
                                  key={`${row.id}-${row.label}`}
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    row.onClick();
                                  }}
                                  className="w-full text-left text-[11px] text-gray-600 hover:text-gray-900 rounded-md px-1.5 py-1 hover:bg-gray-50 transition-colors"
                                  data-testid={`next-best-action-secondary-${row.id}`}
                                  title={row.title ?? row.label}
                                >
                                  {row.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })()}

                  {/* C. Buyer preferences — RGE / real-estate workspace only */}
                  {showCopilotBuyerPreferences && (
                    <div className="rounded-lg border border-violet-100 bg-violet-50/40 px-2.5 py-2">
                      <BuyerPreferencesPanel
                        contactId={contact.id}
                        initialProfile={persistedBuyerProfile}
                        onUpdated={() => onUpdateContact({})}
                        compact
                        readOnly
                      />
                    </div>
                  )}

                  {showCopilotInventoryPanels && inventorySourcesError && (
                    <CopilotInventorySourcesUnavailable
                      compact
                      onRetry={() => void refetchInventorySources()}
                    />
                  )}

                  {showCopilotInventoryPanels &&
                    !inventorySourcesError &&
                    inventorySourcesFetched &&
                    !inventorySourcesLoading &&
                    !inventoryConnected && <CopilotInventoryEmptyState compact />}

                  {showCopilotInventoryPanels &&
                    !inventorySourcesError &&
                    (inventoryConnected || inventorySourcesLoading || !inventorySourcesFetched) && (
                    <MatchingListingsPanel
                      contactId={contact.id}
                      contactFirstName={contact.name?.trim().split(/\s+/)[0]}
                      compact
                      isWorkspaceAdmin={isWorkspaceAdmin}
                      isWorkspaceOwner={isWorkspaceOwner}
                      buyerProfile={persistedBuyerProfile}
                      inventoryRelevant={showCopilotInventoryPanels}
                      onInsertComposerDraft={onInsertComposerDraft}
                    />
                  )}

                  {/* D. Short narrative summary — action/context only; no duplicate criteria */}
                  {(customerSummaryBullets.length > 0 || aiMemoryLoading) && (
                    <div className="pt-2 border-t border-gray-100" data-testid="copilot-summary-section">
                      <p className="text-[9px] uppercase tracking-wide font-medium text-gray-400 mb-1">
                        Summary
                      </p>
                      {aiMemoryLoading ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-pulse" />
                          <span className="text-[11px] text-gray-400 italic">Generating…</span>
                        </div>
                      ) : customerSummaryBullets.length >= 2 ? (
                        <ul className="space-y-0.5">
                          {customerSummaryBullets.slice(0, 2).map((line) => (
                            <li
                              key={line}
                              className="text-[11px] text-gray-600 leading-snug flex gap-1.5"
                            >
                              <span className="text-gray-300 shrink-0">•</span>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[11px] text-gray-600 leading-snug line-clamp-3">
                          {customerSummaryBullets[0] ?? aiMemory}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Autopilot upgrade prompt (non-AI plan users) */}
                  {!canSeeWorkflow && (
                    <AIUpgradePrompt
                      feature="Autopilot"
                      requiredPlan={workflowUpgradeTo}
                      reason="Suggests and automates actions: assign leads, book appointments, schedule follow-ups, and advance pipeline stages with one click."
                      size="md"
                    />
                  )}

                  {/* Workflow chips (nurture / tag / stage) intentionally not rendered under Summary —
                      recommendations, lifecycle, status, stage, and tags have their own UI. */}

                  {/* Safe AI stage suggestion — click to apply (never auto-moves) */}
                  {stageSuggestion && !completedActions.has("stage") && (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2">
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                          Suggested stage
                        </div>
                        <div className="text-[12px] font-semibold text-gray-800 truncate">
                          {stageSuggestion}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          onUpdateContact({ pipelineStage: stageSuggestion });
                          completeAction("stage", `Moved to ${stageSuggestion}`);
                        }}
                        className="shrink-0 text-[11px] font-semibold px-2 py-1 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors"
                        data-testid="button-apply-stage-suggestion"
                        title="Apply suggested stage"
                      >
                        Apply stage
                      </button>
                    </div>
                  )}
                </>


              )}
          </div>
        </div>
        </div>
      )}
      </div>

      {/* ══ Body ════════════════════════════════════════════════════════════ */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="px-3 py-3 space-y-3">

          {/* ── CONTACT INFO ─────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <RowLabel>Contact</RowLabel>
              <button
                onClick={onEditContact}
                className="p-0.5 text-gray-300 hover:text-gray-500 transition-colors rounded"
                data-testid="button-edit-contact-panel"
              >
                <Edit className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-1">
              {contact.phone && (
                <div className="flex items-center gap-1.5 text-[12px] text-gray-600" data-testid="text-contact-phone">
                  <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                  {contact.phone}
                </div>
              )}
              {contact.email && (
                <div className="flex items-center gap-1.5 text-[12px] text-gray-600" data-testid="text-contact-email">
                  <Mail className="w-3 h-3 text-gray-400 shrink-0" />
                  <span className="truncate">{contact.email}</span>
                </div>
              )}
              {!contact.phone && !contact.email && (
                <span className="text-[11px] text-gray-400 italic">No contact info</span>
              )}
              {resolveContactSourceLabel(contact) && (
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400" data-testid="text-source">
                  <TrendingUp className="w-3 h-3 shrink-0" />
                  via {resolveContactSourceLabel(contact)}
                </div>
              )}
            </div>
          </div>

          {/* ── STATUS + PIPELINE (side-by-side) ─────────────────────── */}
          {primaryConversation && (
            <div>
              <RowLabel>Status · Stage</RowLabel>
              <div className="flex gap-1.5 mt-1">
                <Select value={convStatus} onValueChange={onUpdateConversationStatus}>
                  <SelectTrigger
                    className={cn(
                      "h-7 text-[11px] font-medium flex-1 bg-white border border-gray-200 px-2 shadow-none",
                      conversationStatusRow.textClass
                    )}
                    data-testid="select-conversation-status"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONVERSATION_STATUS_ROWS.map((s) => (
                      <SelectItem
                        key={s.value}
                        value={s.value}
                        className={cn(
                          "text-[11px] font-medium rounded-sm",
                          "focus:!bg-gray-100 focus:!text-gray-900",
                          "data-[highlighted]:!bg-gray-100 data-[highlighted]:!text-gray-900",
                          s.textClass
                        )}
                      >
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={contact.pipelineStage}
                  onValueChange={val => onUpdateContact({ pipelineStage: val })}
                >
                  <SelectTrigger className="h-7 text-[11px] flex-1 bg-white px-2" data-testid="select-pipeline">
                    <SelectValue placeholder="Stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {contactPipelineStageOptions.map(stage => (
                      <SelectItem key={stage} value={stage} className="text-[11px]">{stage}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {showMarkWon ? (
            <div className="mt-2 space-y-1.5" data-testid="prospect-ai-won-actions">
              {currentProspectOutcome && currentProspectOutcome !== "active" ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    className={
                      currentProspectOutcome === "won"
                        ? "bg-emerald-600 text-[10px]"
                        : currentProspectOutcome === "lost"
                          ? "bg-gray-500 text-[10px]"
                          : "bg-amber-600 text-[10px]"
                    }
                  >
                    {currentProspectOutcome === "won"
                      ? "Won"
                      : currentProspectOutcome === "lost"
                        ? "Lost"
                        : currentProspectOutcome}
                  </Badge>
                  {(["won", "lost", "active"] as const).map((outcome) =>
                    outcome === currentProspectOutcome ? null : (
                      <Button
                        key={outcome}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        disabled={setOutcome.isPending || markWon.isPending}
                        onClick={() => {
                          if (outcome === "won") {
                            setMarkWonOpen(true);
                            return;
                          }
                          setOutcome.mutate(
                            { contactId: contact.id, outcome },
                            {
                              onSuccess: () => {
                                void prospectOutcomeQuery.refetch();
                                toast({
                                  title:
                                    outcome === "lost"
                                      ? "Outcome set to Lost"
                                      : "Outcome set to Active",
                                });
                              },
                              onError: (err: Error) =>
                                toast({
                                  title: "Update failed",
                                  description: err.message,
                                  variant: "destructive",
                                }),
                            },
                          );
                        }}
                      >
                        {outcome === "won"
                          ? "Mark Won"
                          : outcome === "lost"
                            ? "Mark Lost"
                            : "Set Active"}
                      </Button>
                    ),
                  )}
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="h-7 w-full bg-brand-green text-[11px] hover:bg-brand-green/90"
                  onClick={() => setMarkWonOpen(true)}
                  data-testid="prospect-ai-mark-won"
                >
                  <Trophy className="mr-1.5 h-3 w-3" />
                  Mark as Won
                </Button>
              )}
              <AlertDialog open={markWonOpen} onOpenChange={setMarkWonOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Mark as Won</AlertDialogTitle>
                    <AlertDialogDescription>
                      Mark this Prospect AI contact as a won customer? The conversation stays open in
                      the inbox.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={markWon.isPending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={markWon.isPending}
                      className="bg-brand-green hover:bg-brand-green/90"
                      onClick={(e) => {
                        e.preventDefault();
                        markWon.mutate(contact.id, {
                          onSuccess: () => {
                            setMarkWonOpen(false);
                            void prospectOutcomeQuery.refetch();
                            toast({ title: "Marked as Won" });
                          },
                          onError: (err: Error) =>
                            toast({
                              title: "Could not mark as Won",
                              description: err.message,
                              variant: "destructive",
                            }),
                        });
                      }}
                    >
                      {markWon.isPending ? "Saving…" : "Mark as Won"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : null}

          {/* ── STATUS TAGS ──────────────────────────────────────────── */}
          <div>
            <RowLabel>Tag</RowLabel>
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.keys(TAG_COLORS).map(tag => (
                <button
                  key={tag}
                  onClick={() => onUpdateContact({ tag })}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full border transition-all font-medium",
                    contact.tag === tag
                      ? TAG_COLORS[tag] || 'bg-blue-100 text-blue-700 border-blue-300'
                      : "bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600"
                  )}
                  data-testid={`button-tag-${tag.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* ── FOLLOW-UP: display only — click to reopen Follow popup ── */}
          <div>
            <RowLabel>Follow-up</RowLabel>
            {contact.followUpDate ? (
              /* Clickable display chip — opens the Follow popover */
              <button
                onClick={() => setFollowOpen(true)}
                className={cn(
                  "mt-1 w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium border text-left transition-opacity hover:opacity-80",
                  followUpSt === 'overdue' ? "bg-red-50 text-red-700 border-red-200" :
                  followUpSt === 'today'   ? "bg-amber-50 text-amber-700 border-amber-200" :
                                             "bg-emerald-50 text-emerald-700 border-emerald-200"
                )}
                data-testid="followup-date-display"
              >
                <CalendarIcon className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {followUpSt === 'overdue' && <span className="font-semibold">Overdue · </span>}
                  {followUpSt === 'today'   && <span className="font-semibold">Today · </span>}
                  {formatFollowUpDisplay(contact.followUpDate)}
                </span>
              </button>
            ) : (
              <p className="mt-1 text-[11px] text-gray-400 italic">Not set</p>
            )}
          </div>

          {contactAppointments.length > 0 && (
            <div>
              <RowLabel>Booked meetings</RowLabel>
              <div className="mt-1 space-y-1.5">
                {contactAppointments.slice(0, 3).map((a) => (
                  <div
                    key={a.id}
                    className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-2 py-1.5"
                    data-testid={`booked-meeting-${a.id}`}
                  >
                    <div className="flex items-start gap-1.5">
                      <CalendarIcon className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-emerald-900">
                          {a.title || a.appointmentType || "Calendly meeting"}
                        </p>
                        <p className="text-[10px] text-emerald-700">
                          {format(new Date(a.appointmentDate), "MMM d 'at' h:mm a")}
                          {a.status ? ` · ${a.status}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void deleteContactAppointment(a.id).catch(() => {
                          toast({ title: "Failed to remove appointment", variant: "destructive" });
                        })}
                        className="shrink-0 text-emerald-300 hover:text-red-500 transition-colors"
                        title="Remove booked meeting"
                        data-testid={`booked-meeting-clear-${a.id}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <RowLabel>Recent activity</RowLabel>
            {contactActivity.length === 0 ? (
              <p className="mt-1 text-[11px] text-gray-400 italic">No recent activity yet.</p>
            ) : (
              <div className="mt-1 space-y-1.5">
                {contactActivity.slice(0, 4).map((event) => {
                  const formatted = formatContactActivity(event);
                  const dotClass =
                    formatted.tone === "green"
                      ? "bg-emerald-500"
                      : formatted.tone === "amber"
                        ? "bg-amber-500"
                        : "bg-gray-300";
                  return (
                    <div
                      key={event.id}
                      className="rounded-lg border border-gray-100 bg-gray-50/80 px-2 py-1.5"
                      data-testid={`contact-activity-${event.id}`}
                    >
                      <div className="flex items-start gap-1.5">
                        <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", dotClass)} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-semibold text-gray-800">{formatted.title}</p>
                          <p className="line-clamp-2 text-[10px] leading-snug text-gray-500">{formatted.detail}</p>
                          <p className="mt-0.5 text-[10px] text-gray-400">{formatRelativeTime(event.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Utilities moved back under Copilot header */}

          {/* ── CAMPAIGNS (preset automation enrollments) ───────────────── */}
          <div className="mt-6 pt-4 border-t border-[#eee]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wide text-gray-500">Campaigns</p>
              <button
                type="button"
                onClick={() => openCampaignPicker()}
                className="flex items-center gap-0.5 text-[11px] font-medium text-gray-400 hover:text-gray-700 transition-colors"
                data-testid="button-add-to-campaign"
              >
                <Plus className="w-3 h-3" />
                Add Campaign
              </button>
            </div>
            {campaignEnrollmentBuckets.primary.length === 0 &&
            campaignEnrollmentBuckets.history.length === 0 ? (
              <p className="text-[11px] text-gray-400 italic">Not enrolled in any saved campaigns.</p>
            ) : (
              <div className="space-y-2">
                {campaignEnrollmentBuckets.primary.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic">
                    No enrollments in progress.
                  </p>
                ) : (
                  <div className="max-h-[220px] space-y-2 overflow-y-auto pr-0.5">
                    {campaignEnrollmentBuckets.primary.slice(0, 12).map((e) => (
                      <div
                        key={e.id}
                        className="rounded-lg border border-gray-100 bg-gray-50/80 px-2 py-2 text-[11px]"
                        data-testid={`contact-enrollment-${e.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-800 truncate">{e.campaignName ?? "Campaign"}</p>
                            <p className="mt-0.5 text-[10px] text-gray-500">
                              {enrollmentCardSubtitle(e)}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {e.status === "active" && (
                              <button
                                type="button"
                                className="text-[10px] font-semibold text-amber-700 hover:underline"
                                onClick={() => pauseEnrollmentMutation.mutate(e.id)}
                              >
                                Pause
                              </button>
                            )}
                            {e.status === "paused" && (
                              <button
                                type="button"
                                className="text-[10px] font-semibold text-emerald-700 hover:underline"
                                onClick={() => resumeEnrollmentMutation.mutate(e.id)}
                              >
                                Resume
                              </button>
                            )}
                            {(e.status === "active" || e.status === "paused") && (
                              <button
                                type="button"
                                className="text-[10px] font-semibold text-red-600 hover:underline"
                                onClick={() => cancelEnrollmentMutation.mutate(e.id)}
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {campaignEnrollmentBuckets.history.length > 0 && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowCampaignHistory((v) => !v)}
                      className="flex w-full items-center justify-between gap-2 rounded-md py-1 text-left text-[10px] font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                      data-testid="button-toggle-campaign-history"
                    >
                      <span>
                        View history ({campaignEnrollmentBuckets.history.length})
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 transition-transform",
                          showCampaignHistory && "rotate-180"
                        )}
                      />
                    </button>
                    {showCampaignHistory && (
                      <div className="mt-2 max-h-[160px] space-y-1.5 overflow-y-auto border-t border-gray-100 pt-2">
                        {campaignEnrollmentBuckets.history.map((e) => (
                          <div
                            key={e.id}
                            className="rounded-md border border-gray-100 bg-gray-50/50 px-2 py-1.5 text-[10px] text-gray-600"
                            data-testid={`contact-enrollment-history-${e.id}`}
                          >
                            <p className="truncate font-medium text-gray-700">{e.campaignName ?? "Campaign"}</p>
                            <p className="mt-0.5 text-gray-500">
                              {enrollmentCardSubtitle(e)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <Dialog
            open={campaignPickerOpen}
            onOpenChange={(open) => {
              setCampaignPickerOpen(open);
              if (!open) {
                setPickedCampaignId("");
                setEnrollmentPreviewOpen(false);
              }
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add to campaign</DialogTitle>
                <DialogDescription>
                  Enrolls this contact in a saved preset campaign. Messages send when each step is due (channel rules
                  apply).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                {contactOutreachChannel ? (
                  <p className="text-xs text-gray-500">
                    Showing campaigns for{" "}
                    <span className="font-medium text-gray-700">
                      {campaignChannelLabel(contactOutreachChannel)}
                    </span>
                    . Incompatible campaigns are disabled.
                  </p>
                ) : null}
                <Select value={pickedCampaignId} onValueChange={setPickedCampaignId}>
                  <SelectTrigger data-testid="select-campaign-enroll">
                    <SelectValue placeholder="Choose a saved campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaignPickOptions.map((c) => (
                      <SelectItem
                        key={c.id}
                        value={c.id}
                        disabled={!c.eligibility.eligible}
                        title={c.eligibility.userMessage}
                      >
                        {c.name}
                        {!c.eligibility.eligible && c.eligibility.userMessage
                          ? ` · ${c.eligibility.userMessage.replace(/^Cannot enroll: /, "")}`
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {campaignPickOptions.length === 0 && (
                  <p className="text-xs text-gray-500">
                    No saved campaigns yet. Create one under Templates → Presets → Saved Campaigns.
                  </p>
                )}
                {campaignPickOptions.length > 0 && compatibleCampaignOptions.length === 0 && (
                  <p className="text-xs text-amber-700">
                    No campaigns match this contact&apos;s channel
                    {contactOutreachChannel
                      ? ` (${campaignChannelLabel(contactOutreachChannel)})`
                      : ""}
                    . Create or activate an matching campaign first.
                  </p>
                )}
                {pickedCampaignId && (
                  (() => {
                    const picked = campaignPickOptions.find((c) => c.id === pickedCampaignId);
                    if (picked?.eligibility.eligible) return null;
                    return (
                      <p className="text-xs text-amber-700">
                        {picked?.eligibility.userMessage || "This campaign cannot be used for this contact."}
                      </p>
                    );
                  })()
                )}
              </div>
              <DialogFooter className="gap-2 sm:gap-0 sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!pickedCampaignId || enrollmentPreviewSteps.length === 0}
                  onClick={() => setEnrollmentPreviewOpen(true)}
                  data-testid="button-preview-campaign-enroll"
                >
                  <Eye className="mr-1.5 h-4 w-4" />
                  Preview
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setCampaignPickerOpen(false)}>
                    Close
                  </Button>
                  <Button
                    type="button"
                    className="bg-gray-900 text-white hover:bg-gray-800"
                    disabled={
                      !pickedCampaignId ||
                      enrollContactCampaignMutation.isPending ||
                      compatibleCampaignOptions.length === 0 ||
                      !pickedCampaignForEnroll?.eligibility.eligible
                    }
                    onClick={() => enrollContactCampaignMutation.mutate()}
                    data-testid="button-confirm-campaign-enroll"
                  >
                    {enrollContactCampaignMutation.isPending ? "Enrolling…" : "Enroll"}
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={enrollmentPreviewOpen} onOpenChange={setEnrollmentPreviewOpen}>
            <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Campaign preview</DialogTitle>
                <DialogDescription>
                  Final messages for {contact.name || "this contact"} using their fields and campaign defaults.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-1">
                {enrollmentPreviewSteps.map((step, idx) => (
                  <div key={idx} className="rounded-lg border bg-gray-50 p-3">
                    <p className="mb-1.5 text-xs text-gray-500">
                      Step {idx + 1} · {step.delay === "0" ? "Immediate" : step.delay}
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-gray-900">{step.rendered || "—"}</p>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEnrollmentPreviewOpen(false)}>
                  Back
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ── TEAM NOTES ───────────────────────────────────────────── */}
          <div className="mt-6 pt-4 border-t border-[#eee]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <p className="text-xs uppercase tracking-wide text-gray-500">Team Notes</p>
                {(() => {
                  const unread = notesViewedAt
                    ? contactNotesList.filter(n => n.createdAt && new Date(n.createdAt) > notesViewedAt).length
                    : 0;
                  return unread > 0 ? (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700" data-testid="badge-unread-notes">
                      {unread}
                    </span>
                  ) : null;
                })()}
              </div>
              <button
                onClick={() => {
                  setAddNoteOpen(true);
                  // Mark notes as viewed when user opens the modal
                  setNotesViewedAt(null);
                  localStorage.setItem(`notes_viewed_${contact.id}`, new Date().toISOString());
                }}
                className="flex items-center gap-0.5 text-[11px] font-medium text-gray-400 hover:text-gray-700 transition-colors"
                data-testid="button-add-note"
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
            </div>

            {notesLoading ? (
              <div className="flex items-center gap-1.5 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-pulse" />
                <span className="text-[11px] text-gray-400">Loading…</span>
              </div>
            ) : contactNotesList.length === 0 ? (
              <button
                onClick={() => {
                  setAddNoteOpen(true);
                  setNotesViewedAt(null);
                  localStorage.setItem(`notes_viewed_${contact.id}`, new Date().toISOString());
                }}
                className="w-full text-left"
                data-testid="button-empty-note"
              >
                <div className="p-2.5 border border-dashed border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50/40 transition-all">
                  <p className="text-[11px] text-gray-400">Add a team note…</p>
                </div>
              </button>
            ) : (
              <div className="notes-scroll space-y-2 max-h-[240px] overflow-y-auto pr-1">
                {contactNotesList.map(note => (
                  <div
                    key={note.id}
                    className="p-3 rounded-xl overflow-x-hidden cursor-pointer hover:brightness-[0.97] transition-all"
                    style={{ background: '#FFFDF5', border: '1px solid #E8E2CC' }}
                    data-testid={`note-item-${note.id}`}
                    onClick={() => setEditingNote(note)}
                  >
                    <div className="flex items-center gap-1 mb-1.5">
                      <span className="text-[10px] text-gray-400">{note.createdByName || "Team member"}</span>
                      <span className="text-[10px] text-gray-300">·</span>
                      <span className="text-[10px] text-gray-400">{formatRelativeTime(note.createdAt)}</span>
                    </div>
                    <p
                      className="text-[12px] text-gray-800"
                      style={{ lineHeight: '1.6', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                    >{note.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── ADD NOTE MODAL ──────────────────────────────────────────── */}
          {addNoteOpen && (
            <AddNoteModal
              contactId={contact.id}
              contactNotesList={contactNotesList}
              currentUserId={currentUserId}
              teamMembers={teamMembers}
              onSave={saved => setContactNotesList(prev => [saved, ...prev])}
              onDelete={noteId => setContactNotesList(prev => prev.filter(n => n.id !== noteId))}
              onClose={() => setAddNoteOpen(false)}
            />
          )}

          {/* ── EDIT NOTE MODAL ─────────────────────────────────────────── */}
          {editingNote && (
            <EditNoteModal
              contactId={contact.id}
              note={editingNote}
              onSave={updated => setContactNotesList(prev => prev.map(n => n.id === updated.id ? updated : n))}
              onDelete={noteId => setContactNotesList(prev => prev.filter(n => n.id !== noteId))}
              onClose={() => setEditingNote(null)}
            />
          )}

          {/* ── DELETE CONTACT ────────────────────────────────────────── */}
          <div className="pb-2">
            <button
              onClick={onDeleteContact}
              className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] text-red-400 hover:text-red-600 border border-red-100 hover:border-red-200 rounded-lg bg-white hover:bg-red-50 transition-colors"
              data-testid="button-delete-contact"
            >
              <Trash2 className="w-3 h-3" />
              Delete Contact
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
