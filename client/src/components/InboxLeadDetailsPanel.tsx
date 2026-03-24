import { useState, useEffect, useMemo, useRef } from "react";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { TAG_COLORS, PIPELINE_STAGES } from "@/lib/data";
import {
  analyzeConversation,
  computeWorkflow,
  runVerification,
  buildAIMemorySummary,
  type ConversationMessage,
} from "@/lib/conversationIntelligence";
import { AIUpgradePrompt } from "./AIUpgradePrompt";
import type { AICapabilities } from "@/lib/useAICapabilities";

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
  source?: string;
  createdAt: string;
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

const CONVERSATION_STATUSES = [
  { value: 'open',     label: 'Open',     color: 'border-emerald-400 text-emerald-600' },
  { value: 'pending',  label: 'Pending',  color: 'border-amber-400 text-amber-600' },
  { value: 'resolved', label: 'Resolved', color: 'border-blue-400 text-blue-600' },
  { value: 'closed',   label: 'Closed',   color: 'border-gray-300 text-gray-500' },
];

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual', whatsapp: 'WhatsApp', instagram: 'Instagram',
  facebook: 'Facebook', webchat: 'Widget', import: 'CSV Import',
  api: 'API', tiktok: 'TikTok', sms: 'SMS', telegram: 'Telegram',
};

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
  onUpdateContact: (fields: Record<string, unknown>) => void;
  onUpdateConversationStatus: (status: string) => void;
  onEditContact: () => void;
  onDeleteContact: () => void;
  /** Called when a qualifying question is clicked — inserts it into the composer */
  onInsertMessage?: (text: string) => void;
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide shrink-0">
      {children}
    </span>
  );
}

export function InboxLeadDetailsPanel({
  contact,
  primaryConversation,
  teamMembers,
  messages = [],
  capabilities,
  onUpdateContact,
  onUpdateConversationStatus,
  onEditContact,
  onDeleteContact,
  onInsertMessage,
}: InboxLeadDetailsPanelProps) {
  const { toast } = useToast();
  // Default to full access if no capabilities provided (backward compat)
  const canSeeCopilot    = capabilities ? capabilities.canUseCopilotIntelligence    : true;
  const canSeeWorkflow   = capabilities ? capabilities.canUseWorkflowRecommendations : true;
  const copilotUpgradeTo = capabilities?.upgradePlan ?? "Starter";
  const workflowUpgradeTo = capabilities?.upgradePlan ?? "Pro";
  const [localNotes, setLocalNotes] = useState(contact.notes || "");
  const [notesSaved, setNotesSaved] = useState(false);
  const [notesTab, setNotesTab] = useState<'ai' | 'team'>('team');
  const [expandedNotesOpen, setExpandedNotesOpen] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState(contact.notes || "");
  const [aiPaused,   setAiPaused]   = useState(false);

  // Copilot action popovers
  const [assignOpen, setAssignOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const [useFollowModal, setUseFollowModal] = useState(false);
  const [bookOpen,   setBookOpen]   = useState(false);
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());
  const [fadingAction, setFadingAction] = useState<string | null>(null);
  const [notesSaveStatus, setNotesSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const notesSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // AI Memory — AI-generated natural-language summary
  const [aiMemory, setAiMemory] = useState<string>('');
  const [aiMemoryLoading, setAiMemoryLoading] = useState(false);
  // Track which contact+message fingerprint the memory was generated for (avoid redundant calls)
  const aiMemoryKeyRef = useRef<string>('');

  // Follow popover: 'quick' shows the quick options; 'custom' shows date+time picker
  const [followView,       setFollowView]       = useState<'quick' | 'custom'>('quick');
  const [customFollowDate, setCustomFollowDate] = useState<Date | undefined>(undefined);
  const [customFollowTime, setCustomFollowTime] = useState('09:00');

  // Booking placeholder state
  const [bookingDate,      setBookingDate]      = useState<Date | undefined>(undefined);
  const [bookingTime,      setBookingTime]      = useState("10:00");
  const [bookingType,      setBookingType]      = useState("Viewing");
  const [bookingConfirmed, setBookingConfirmed] = useState(false);

  useEffect(() => {
    setLocalNotes(contact.notes || "");
    setExpandedNotes(contact.notes || "");
    setNotesSaved(false);
    setCompletedActions(new Set()); // Reset completed actions when contact changes
  }, [contact.id, contact.notes]);

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
    onUpdateContact({ followUp: null, followUpDate: null });
    setFollowOpen(false);
  };

  const saveNotes = () => {
    onUpdateContact({ notes: localNotes });
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2500);
  };

  const convStatus = primaryConversation?.status || 'open';
  const statusCls  = CONVERSATION_STATUSES.find(s => s.value === convStatus)?.color || 'border-gray-200 text-gray-500';
  const followUpSt = getFollowUpStatus(contact.followUpDate);

  // ── Conversation intelligence — re-runs whenever messages change ──
  const intel = useMemo(() => analyzeConversation(messages), [messages]);

  // ── Workflow layer — computes recommended actions from intel + contact state ──
  const workflow = useMemo(() => computeWorkflow(intel, {
    tag:           contact.tag || '',
    pipelineStage: contact.pipelineStage || 'Lead',
    followUpDate:  contact.followUpDate,
    assignedTo:    contact.assignedTo,
  }), [intel, contact.tag, contact.pipelineStage, contact.followUpDate, contact.assignedTo]);

  // ── AI Memory: fetch AI-generated summary whenever messages change meaningfully ──
  useEffect(() => {
    if (messages.length === 0) {
      setAiMemory('');
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
          setAiMemory(data.memory || buildAIMemorySummary(intel, messages));
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Fallback to rule-based summary
          setAiMemory(buildAIMemorySummary(intel, messages));
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
  const assignedMember = activeMembers.find(m => (m.memberId || m.id) === contact.assignedTo);
  const assignedLabel  = assignedMember
    ? (assignedMember.name || assignedMember.email.split('@')[0])
    : null;

  return (
    <div className="hidden lg:flex w-[260px] xl:w-[272px] flex-col border-l border-gray-100 bg-white overflow-y-auto flex-shrink-0">

      {/* ══ 1. AI COPILOT HEADER ══════════════════════════════════════════ */}
      <div className="px-3 pt-2.5 pb-2 border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-purple-500" />
            <span className="text-[11px] font-semibold text-gray-700 tracking-wide">Copilot</span>
          </div>
          {canSeeCopilot ? (
            <button
              onClick={() => setAiPaused(p => !p)}
              className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded-full border transition-colors leading-none",
                aiPaused
                  ? "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200"
                  : "bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100"
              )}
              data-testid="button-ai-toggle"
            >
              {aiPaused ? "Paused" : "Active"}
            </button>
          ) : (
            <span className="text-[10px] text-gray-300 font-medium">{copilotUpgradeTo}+</span>
          )}
        </div>

        {canSeeCopilot ? (
          <>
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", intel.leadScore.dot)} />
              <span className={cn("text-[11px] font-semibold", intel.leadScore.color)}>{intel.leadScore.label} Lead</span>
              <span className="text-gray-300 text-[10px]">·</span>
              <span className="text-[11px] text-gray-500">{intel.aiState}</span>
              <span className="text-gray-300 text-[10px]">·</span>
              <span className="text-[11px] text-gray-500">{intel.intent}</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <QualBadge ok={intel.hasBudget}    label="Budget"    value={intel.budget} />
              <QualBadge ok={intel.hasTimeline}  label="Timeline"  value={intel.timeline} />
              <QualBadge ok={intel.hasFinancing} label="Financing" value={intel.financing} />
            </div>
          </>
        ) : (
          <AIUpgradePrompt
            feature="Copilot"
            requiredPlan={copilotUpgradeTo}
            reason="Reads conversations and auto-extracts budget, timeline, financing, and lead intent to help you qualify leads faster."
            size="md"
            className="mt-1"
          />
        )}

        {/* ── Workflow recommendations strip ─────────────────────────── */}
        {canSeeCopilot && !canSeeWorkflow && (
          <div className="mt-2 pt-1.5 border-t border-purple-100">
            <AIUpgradePrompt
              feature="Autopilot"
              requiredPlan={workflowUpgradeTo}
              reason="Suggests and automates actions: assign leads, book appointments, schedule follow-ups, and advance pipeline stages with one click."
              size="md"
              className="mt-0.5"
            />
          </div>
        )}
        {/* ── COPILOT ACTION SUGGESTIONS ──────────────────────────────── */}
        {canSeeCopilot && canSeeWorkflow && (
          (() => {
            // Filter out completed actions
            const activeActions = workflow.actions.filter(a => !completedActions.has(a.type));
            const hasTagSuggestion = workflow.tagSuggestion && !workflow.tagAutoApply && !completedActions.has('tag');
            const hasStageSuggestion = workflow.stageSuggestion && !completedActions.has('stage');
            const hasAnyActions = activeActions.length > 0 || hasTagSuggestion || hasStageSuggestion;

            if (!hasAnyActions) return null;

            // Helper to mark action as completed with fade-out and toast
            const completeAction = (actionType: string, toastMsg: string) => {
              setFadingAction(actionType);
              setTimeout(() => {
                setCompletedActions(prev => new Set([...Array.from(prev), actionType]));
                setFadingAction(null);
              }, 150);
              toast({ title: toastMsg, duration: 2500 });
            };

            return (
              <div className="mt-2 pt-1.5 border-t border-purple-100">
                <div className="flex items-center gap-0.5 mb-1">
                  <span className="text-[9px] font-bold text-purple-400 uppercase tracking-widest">Copilot suggests</span>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {activeActions.slice(0, 2).map(action => {
                    const actionHandlers: Record<string, () => void> = {
                      assign:  () => {
                        setAssignOpen(true);
                        completeAction(action.type, "Lead assigned");
                      },
                      book:    () => {
                        setBookOpen(true);
                        completeAction(action.type, "Follow-up scheduled");
                      },
                      follow:  () => {
                        setFollowOpen(true);
                        completeAction(action.type, "Follow-up scheduled");
                      },
                      qualify: action.value ? () => {
                        if (onInsertMessage && action.value) {
                          onInsertMessage(action.value);
                        } else if (action.value) {
                          navigator.clipboard.writeText(action.value).catch(() => {});
                        }
                        completeAction(action.type, "Message inserted");
                      } : undefined as unknown as () => void,
                      nurture: () => {
                        completeAction(action.type, "Added to nurture queue");
                      },
                    };
                    const handler = actionHandlers[action.type];
                    const colorCls = action.priority === 'high'
                      ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                      : action.priority === 'medium'
                      ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100';
                    
                    return (
                      <button
                        key={action.type}
                        onClick={handler}
                        disabled={!handler}
                        title={action.reason}
                        data-testid={`workflow-action-${action.type}`}
                        className={cn(
                          "text-[10px] font-medium px-1.5 py-0.5 rounded border transition-all leading-none",
                          colorCls,
                          !handler && "opacity-60 cursor-default",
                          fadingAction === action.type && "opacity-0 scale-95"
                        )}
                      >
                        {action.label}
                      </button>
                    );
                  })}

                  {/* Tag suggestion chip — only shows when NOT auto-applying and NOT completed */}
                  {hasTagSuggestion && (
                    <button
                      onClick={() => {
                        onUpdateContact({ tag: workflow.tagSuggestion! });
                        completeAction('tag', `Tagged as "${workflow.tagSuggestion}"`);
                      }}
                      title={`AI suggests: Tag as "${workflow.tagSuggestion}"`}
                      data-testid="workflow-tag-suggestion"
                      className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 transition-all leading-none",
                        fadingAction === 'tag' && "opacity-0 scale-95"
                      )}
                    >
                      Tag: {workflow.tagSuggestion} ↗
                    </button>
                  )}

                  {/* Stage suggestion chip */}
                  {hasStageSuggestion && (
                    <button
                      onClick={() => {
                        onUpdateContact({ pipelineStage: workflow.stageSuggestion! });
                        completeAction('stage', `Moved to ${workflow.stageSuggestion}`);
                      }}
                      title={`AI suggests moving to ${workflow.stageSuggestion} stage`}
                      data-testid="workflow-stage-suggestion"
                      className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 transition-all leading-none",
                        fadingAction === 'stage' && "opacity-0 scale-95"
                      )}
                    >
                      → {workflow.stageSuggestion}
                    </button>
                  )}
                </div>

                {/* Empty state when all actions are completed */}
                {!hasAnyActions && (
                  <p className="text-[10px] text-gray-400 italic mt-1">No actions needed — you're on track</p>
                )}
              </div>
            );
          })()
        )}
      </div>

      {/* ══ 2. COPILOT QUICK ACTIONS ══════════════════════════════════════ */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="grid grid-cols-4 gap-1">

          {/* ── BOOK ── */}
          <Popover open={bookOpen} onOpenChange={setBookOpen}>
            <PopoverTrigger asChild>
              <button
                className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg border border-gray-100 bg-gray-50 hover:bg-gray-100 hover:border-gray-200 transition-colors"
                data-testid="button-ai-book"
              >
                <CalendarIcon className="w-3 h-3 text-gray-500" />
                <span className="text-[9px] text-gray-500 font-medium">Book</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="start" side="bottom">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-700">Schedule Appointment</span>
                <button onClick={() => setBookOpen(false)} className="text-gray-300 hover:text-gray-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {bookingConfirmed ? (
                <div className="flex flex-col items-center gap-1.5 py-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <p className="text-[12px] font-medium text-emerald-700">Appointment saved</p>
                  {bookingDate && (
                    <p className="text-[11px] text-gray-500">
                      {format(bookingDate, 'MMM d')} at {formatTime24to12(bookingTime)} · {bookingType}
                    </p>
                  )}
                  <button
                    className="mt-1 text-[10px] text-gray-400 hover:text-gray-600 underline"
                    onClick={() => { setBookingConfirmed(false); setBookingDate(undefined); }}
                  >
                    Schedule another
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
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
                              ? "bg-purple-50 text-purple-700 border-purple-300"
                              : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                          )}
                        >{t}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide font-semibold">Date</p>
                    <Calendar
                      mode="single"
                      selected={bookingDate}
                      onSelect={setBookingDate}
                      disabled={d => d < new Date()}
                      className="rounded-lg border border-gray-100 p-1 [&_.rdp]:m-0"
                      initialFocus
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
                              ? "bg-purple-50 text-purple-700 border-purple-300 font-semibold"
                              : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                          )}
                        >{formatTime24to12(t)}</button>
                      ))}
                    </div>
                  </div>
                  <button
                    disabled={!bookingDate}
                    onClick={() => {
                    if (bookingDate) {
                      setBookingConfirmed(true);
                      const dateStr = format(bookingDate, 'MMM d') + ' at ' + formatTime24to12(bookingTime);
                      toast({ title: `${bookingType} booked`, description: `${contact.name} · ${dateStr}`, duration: 3500 });
                    }
                  }}
                    className={cn(
                      "w-full mt-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors",
                      bookingDate
                        ? "bg-purple-600 text-white hover:bg-purple-700"
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
          <Popover open={assignOpen} onOpenChange={setAssignOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1.5 rounded-lg border transition-colors",
                  assignedLabel
                    ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                    : "border-gray-100 bg-gray-50 hover:bg-gray-100 hover:border-gray-200"
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
            <PopoverContent className="w-48 p-1.5" align="start" side="bottom">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-1.5 pb-1">Assign to</p>
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
          <Popover open={followOpen} onOpenChange={setFollowOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1.5 rounded-lg border transition-colors",
                  contact.followUpDate
                    ? "border-amber-200 bg-amber-50 hover:bg-amber-100"
                    : "border-gray-100 bg-gray-50 hover:bg-gray-100 hover:border-gray-200"
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
              className="w-52 p-1.5 max-h-[70vh] overflow-y-auto flex flex-col" 
              align="start" 
              side={followView === 'custom' ? 'top' : 'bottom'}
              onInteractOutside={() => setFollowOpen(false)}
            >

              {/* ─ QUICK OPTIONS VIEW ─ */}
              {followView === 'quick' && (
                <>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-1.5 pb-1">
                    Follow-up in
                  </p>
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
                <div className="flex flex-col h-full">
                  {/* Scrollable content area */}
                  <div className="flex-1 overflow-y-auto pr-1 space-y-2 min-h-0">
                    {/* Back button */}
                    <button
                      onClick={() => setFollowView('quick')}
                      className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors mb-1"
                      data-testid="followup-custom-back"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      Back
                    </button>

                    {/* Date picker */}
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide font-semibold">Date</p>
                      <Calendar
                        mode="single"
                        selected={customFollowDate}
                        onSelect={setCustomFollowDate}
                        disabled={d => d < new Date()}
                        className="rounded-lg border border-gray-100 p-1 [&_.rdp]:m-0"
                        initialFocus
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
                  </div>

                  {/* Sticky confirm button at bottom */}
                  <div className="mt-2 pt-2 border-t border-gray-100 flex-shrink-0">
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

          {/* ── PAUSE ── */}
          <button
            onClick={() => setAiPaused(p => !p)}
            className={cn(
              "flex flex-col items-center gap-0.5 py-1.5 rounded-lg border transition-colors",
              aiPaused
                ? "border-gray-200 bg-gray-100 hover:bg-gray-200"
                : "border-gray-100 bg-gray-50 hover:bg-gray-100 hover:border-gray-200"
            )}
            data-testid="button-ai-pause"
          >
            {aiPaused
              ? <PlayCircle className="w-3 h-3 text-gray-500" />
              : <PauseCircle className="w-3 h-3 text-gray-500" />
            }
            <span className="text-[9px] text-gray-500 font-medium">{aiPaused ? "Resume" : "Pause"}</span>
          </button>

        </div>
      </div>

      {/* ══ Body ════════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto">
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
              {contact.source && (
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400" data-testid="text-source">
                  <TrendingUp className="w-3 h-3 shrink-0" />
                  via {SOURCE_LABELS[contact.source] || contact.source}
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
                    className={cn("h-7 text-[11px] font-medium flex-1 bg-white border px-2", statusCls)}
                    data-testid="select-conversation-status"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONVERSATION_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>
                        <span className={cn("text-[11px] font-medium", s.color.split(' ').find(c => c.startsWith('text-')))}>
                          {s.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={contact.pipelineStage}
                  onValueChange={val => onUpdateContact({ pipelineStage: val })}
                >
                  <SelectTrigger className="h-7 text-[11px] flex-1 bg-white px-2" data-testid="select-pipeline">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STAGES.map(stage => (
                      <SelectItem key={stage} value={stage} className="text-[11px]">{stage}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

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
              <p className="mt-1 text-[11px] text-gray-400 italic">
                Not set · <button
                  onClick={() => setFollowOpen(true)}
                  className="underline hover:text-gray-600 transition-colors"
                  data-testid="followup-not-set-link"
                >Schedule</button>
              </p>
            )}
          </div>

          {/* ── NOTES & MEMORY (TABBED) ──────────────────────────────── */}
          <div>
            <div className="mb-1.5">
              <RowLabel>Notes & Memory</RowLabel>
            </div>
            
            {/* Tab navigation */}
            <div className="flex gap-1 mb-2 border-b border-gray-200">
              <button
                onClick={() => setNotesTab('ai')}
                className={cn(
                  "px-2 py-1 text-[11px] font-semibold transition-colors border-b-2",
                  notesTab === 'ai'
                    ? 'text-purple-600 border-purple-400'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                )}
                data-testid="button-tab-ai-memory"
              >
                Summary
              </button>
              <button
                onClick={() => setNotesTab('team')}
                className={cn(
                  "px-2 py-1 text-[11px] font-semibold transition-colors border-b-2",
                  notesTab === 'team'
                    ? 'text-blue-600 border-blue-400'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                )}
                data-testid="button-tab-team-notes"
              >
                Team Notes
              </button>
            </div>

            {/* AI Memory tab - AI-generated natural-language summary */}
            {notesTab === 'ai' && (
              <div className="p-3 bg-purple-50/60 border border-purple-100 rounded-lg min-h-20 flex flex-col justify-start">
                {aiMemoryLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-300 animate-pulse" />
                    <span className="text-[11px] text-purple-400 italic">Generating summary…</span>
                  </div>
                ) : aiMemory ? (
                  <p className="text-[11px] text-purple-900 leading-relaxed">{aiMemory}</p>
                ) : (
                  <p className="text-[11px] text-gray-400 italic">Summary will appear here as the conversation develops.</p>
                )}
              </div>
            )}

            {/* Team Notes tab - sourced ONLY from manual localNotes, never AI content */}
            {notesTab === 'team' && (
              <button
                onClick={() => {
                  setExpandedNotes(localNotes);
                  setExpandedNotesOpen(true);
                }}
                className="w-full group text-left transition-all"
                data-testid="button-expand-notes"
              >
                {localNotes ? (
                  <div className="p-2.5 bg-blue-50/40 border border-blue-100 rounded-lg hover:bg-blue-50/60 transition-colors">
                    <p className="text-[11px] text-blue-900 leading-relaxed line-clamp-4">{localNotes}</p>
                    <p className="text-[9px] text-blue-400 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">Click to edit</p>
                  </div>
                ) : (
                  <div className="p-2.5 border border-dashed border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50/40 transition-all">
                    <p className="text-[11px] text-gray-400">Add a private note…</p>
                  </div>
                )}
              </button>
            )}
          </div>

          {/* ── NOTES EDITOR MODAL (MODERN DESIGN) ───────────────────────────────── */}
          {expandedNotesOpen && (
            <div 
              className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 animate-in fade-in duration-150"
              onClick={() => setExpandedNotesOpen(false)}
              data-testid="modal-overlay-expanded-notes"
            >
              <div 
                className="bg-white rounded-2xl shadow-lg w-[90%] max-w-[520px] flex flex-col transform transition-all duration-150 scale-100 animate-in zoom-in-95"
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div className="px-6 pt-6 pb-3 border-b border-gray-100 flex items-start justify-between">
                  <div className="flex-1">
                    <h2 className="text-[15px] font-semibold text-gray-900">Notes</h2>
                    <p className="text-[12px] text-gray-400 mt-0.5">Internal notes — not visible to customer</p>
                  </div>
                  <button
                    onClick={() => setExpandedNotesOpen(false)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                    data-testid="button-close-notes-modal"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                  <textarea
                    className="notes-textarea w-full min-h-40 bg-white rounded-xl p-4 text-[13px] text-gray-700 placeholder-gray-400 resize-none font-sans leading-relaxed outline-none focus:outline-none ring-0 focus:ring-0"
                    style={{
                      outline: 'none',
                      boxShadow: 'none',
                      border: '1px solid #E5E7EB',
                      WebkitAppearance: 'none',
                    }}
                    placeholder="Add notes about this lead… (preferences, objections, context)"
                    value={expandedNotes}
                    onChange={e => {
                      setExpandedNotes(e.target.value);
                      setNotesSaveStatus('saving');
                      
                      // Clear existing timer
                      if (notesSaveTimerRef.current) {
                        clearTimeout(notesSaveTimerRef.current);
                      }
                      
                      // Set new debounce timer (600ms)
                      notesSaveTimerRef.current = setTimeout(() => {
                        setLocalNotes(e.target.value);
                        onUpdateContact({ notes: e.target.value });
                        setNotesSaveStatus('saved');
                        setTimeout(() => setNotesSaveStatus('idle'), 1500);
                      }, 600);
                    }}
                    autoFocus
                    data-testid="textarea-expanded-notes"
                  />
                  
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                  <div className="text-[11px] font-medium h-5 flex items-center">
                    {notesSaveStatus === 'saving' && (
                      <span className="text-gray-500">Saving…</span>
                    )}
                    {notesSaveStatus === 'saved' && (
                      <span className="text-emerald-600">Saved ✓</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        // Clear any pending save timer
                        if (notesSaveTimerRef.current) {
                          clearTimeout(notesSaveTimerRef.current);
                        }
                        // Auto-save any unsaved changes before closing
                        if (notesSaveStatus === 'saving') {
                          setLocalNotes(expandedNotes);
                          onUpdateContact({ notes: expandedNotes });
                        }
                        setExpandedNotesOpen(false);
                      }}
                      className="py-2 px-4 text-[12px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                      data-testid="button-cancel-notes"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => {
                        // Clear any pending save timer and save immediately
                        if (notesSaveTimerRef.current) {
                          clearTimeout(notesSaveTimerRef.current);
                        }
                        setLocalNotes(expandedNotes);
                        onUpdateContact({ notes: expandedNotes });
                        setNotesSaveStatus('saved');
                        setTimeout(() => {
                          setNotesSaveStatus('idle');
                          setExpandedNotesOpen(false);
                        }, 800);
                      }}
                      className="py-2 px-4 text-[12px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                      data-testid="button-save-notes"
                    >
                      Save Note
                    </button>
                  </div>
                </div>
              </div>
            </div>
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
