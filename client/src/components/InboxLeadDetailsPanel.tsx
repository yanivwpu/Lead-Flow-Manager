import { useState, useEffect, useMemo } from "react";
import {
  Phone,
  Mail,
  Clock,
  User,
  Calendar as CalendarIcon,
  Trash2,
  Edit,
  CheckCheck,
  UserCheck,
  X,
  Sparkles,
  Zap,
  TrendingUp,
  CheckCircle2,
  Circle,
  Minus,
  BookOpen,
  Bell,
  PauseCircle,
} from "lucide-react";
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
import { format } from "date-fns";
import { TAG_COLORS, PIPELINE_STAGES } from "@/lib/data";

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
  { value: 'open', label: 'Open', color: 'border-emerald-400 text-emerald-600' },
  { value: 'pending', label: 'Pending', color: 'border-amber-400 text-amber-600' },
  { value: 'resolved', label: 'Resolved', color: 'border-blue-400 text-blue-600' },
  { value: 'closed', label: 'Closed', color: 'border-gray-300 text-gray-500' },
];

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual', whatsapp: 'WhatsApp', instagram: 'Instagram',
  facebook: 'Facebook', webchat: 'Widget', import: 'CSV Import',
  api: 'API', tiktok: 'TikTok', sms: 'SMS', telegram: 'Telegram',
};

function getFollowUpStatus(d: string | null | undefined): 'overdue' | 'today' | 'upcoming' | null {
  if (!d) return null;
  const due = new Date(d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  if (dueDay < today) return 'overdue';
  if (dueDay.getTime() === today.getTime()) return 'today';
  return 'upcoming';
}

// ── AI intelligence derivations ──────────────────────────────────────────────
function deriveLeadScore(tag: string): { label: string; color: string; dot: string } {
  const t = tag?.toLowerCase() || '';
  if (t.includes('hot') || t.includes('vip')) return { label: 'Hot', color: 'text-red-600', dot: 'bg-red-500' };
  if (t.includes('warm') || t.includes('investor')) return { label: 'Warm', color: 'text-amber-600', dot: 'bg-amber-400' };
  if (t.includes('qualified') || t.includes('active')) return { label: 'Strong', color: 'text-emerald-600', dot: 'bg-emerald-500' };
  return { label: 'Cold', color: 'text-blue-500', dot: 'bg-blue-400' };
}

function deriveAiState(stage: string, status: string): string {
  const s = (stage || '').toLowerCase();
  if (s.includes('closed') || status === 'resolved') return 'Closed';
  if (s.includes('negotiation') || s.includes('proposal')) return 'Ready';
  if (s.includes('qualified')) return 'Qualifying';
  if (s.includes('lead') || s.includes('contacted')) return 'Engaging';
  return 'Waiting';
}

function deriveIntent(stage: string): string {
  const s = (stage || '').toLowerCase();
  if (s.includes('closed won')) return 'Buyer ✓';
  if (s.includes('negotiation')) return 'Buyer';
  if (s.includes('proposal')) return 'High Intent';
  if (s.includes('qualified')) return 'Interested';
  return 'Browsing';
}

function parseQualification(notes: string) {
  const n = (notes || '').toLowerCase();
  const hasBudget = /\$[\d,]+|budget|k\b|price|afford/.test(n);
  const hasTimeline = /week|month|asap|urgent|soon|timeline|days|year/.test(n);
  const hasFinancing = /pre.?approv|financ|mortgage|cash|loan/.test(n);
  return { budget: hasBudget, timeline: hasTimeline, financing: hasFinancing };
}

function QualBadge({ ok, label }: { ok: boolean | 'partial'; label: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium",
      ok === true ? "bg-emerald-50 text-emerald-700" :
      ok === 'partial' ? "bg-amber-50 text-amber-700" :
      "bg-gray-100 text-gray-400"
    )}>
      {ok === true ? <CheckCircle2 className="w-2.5 h-2.5" /> : ok === 'partial' ? <Minus className="w-2.5 h-2.5" /> : <Circle className="w-2.5 h-2.5" />}
      {label}
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface InboxLeadDetailsPanelProps {
  contact: Contact;
  primaryConversation?: Conversation;
  teamMembers: TeamMember[];
  onUpdateContact: (fields: Record<string, unknown>) => void;
  onUpdateConversationStatus: (status: string) => void;
  onEditContact: () => void;
  onDeleteContact: () => void;
}

// ── Row label ─────────────────────────────────────────────────────────────────
function RowLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide shrink-0">{children}</span>;
}

export function InboxLeadDetailsPanel({
  contact,
  primaryConversation,
  teamMembers,
  onUpdateContact,
  onUpdateConversationStatus,
  onEditContact,
  onDeleteContact,
}: InboxLeadDetailsPanelProps) {
  const [localNotes, setLocalNotes] = useState(contact.notes || "");
  const [notesSaved, setNotesSaved] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [aiPaused, setAiPaused] = useState(false);

  useEffect(() => {
    setLocalNotes(contact.notes || "");
    setNotesSaved(false);
  }, [contact.id, contact.notes]);

  const handleFollowUp = (label: string | null) => {
    if (!label) { onUpdateContact({ followUp: null, followUpDate: null }); return; }
    const now = new Date();
    let date: Date;
    if (label === 'Tomorrow') { date = new Date(now); date.setDate(date.getDate() + 1); }
    else if (label === '3 days') { date = new Date(now); date.setDate(date.getDate() + 3); }
    else if (label === '1 week') { date = new Date(now); date.setDate(date.getDate() + 7); }
    else { date = now; }
    onUpdateContact({ followUp: label, followUpDate: date.toISOString() });
  };

  const saveNotes = () => {
    onUpdateContact({ notes: localNotes });
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2500);
  };

  const convStatus = primaryConversation?.status || 'open';
  const statusCls = CONVERSATION_STATUSES.find(s => s.value === convStatus)?.color || 'border-gray-200 text-gray-500';
  const followUpStatus = getFollowUpStatus(contact.followUpDate);

  // AI derivations
  const score = useMemo(() => deriveLeadScore(contact.tag), [contact.tag]);
  const aiState = useMemo(() => deriveAiState(contact.pipelineStage, convStatus), [contact.pipelineStage, convStatus]);
  const intent = useMemo(() => deriveIntent(contact.pipelineStage), [contact.pipelineStage]);
  const qual = useMemo(() => parseQualification(contact.notes || ''), [contact.notes]);

  const assignedMember = teamMembers.find(m => (m.memberId || m.id) === contact.assignedTo);
  const assignedLabel = assignedMember ? (assignedMember.name || assignedMember.email.split('@')[0]) : null;

  return (
    <div className="hidden lg:flex w-[260px] xl:w-72 flex-col border-l border-gray-100 bg-white overflow-y-auto flex-shrink-0">

      {/* ── 1. AI COPILOT HEADER ─────────────────────────────────────────── */}
      <div className="px-3 pt-2.5 pb-2 border-b border-gray-100">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-purple-500" />
            <span className="text-[11px] font-semibold text-gray-700 tracking-wide">AI Copilot</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setAiPaused(p => !p)}
              className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded-full border transition-colors",
                aiPaused
                  ? "bg-gray-100 text-gray-400 border-gray-200"
                  : "bg-purple-50 text-purple-600 border-purple-200"
              )}
              data-testid="button-ai-toggle"
              title={aiPaused ? "Resume AI" : "Pause AI"}
            >
              {aiPaused ? "Paused" : "Active"}
            </button>
          </div>
        </div>

        {/* Lead score row */}
        <div className="flex items-center gap-1.5 mb-1">
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", score.dot)} />
          <span className={cn("text-[11px] font-semibold", score.color)}>{score.label} Lead</span>
          <span className="text-gray-300">·</span>
          <span className="text-[11px] text-gray-500">{aiState}</span>
          <span className="text-gray-300">·</span>
          <span className="text-[11px] text-gray-500">{intent}</span>
        </div>

        {/* Qualification progress badges */}
        <div className="flex items-center gap-1 flex-wrap">
          <QualBadge ok={qual.budget} label="Budget" />
          <QualBadge ok={qual.timeline} label="Timeline" />
          <QualBadge ok={qual.financing} label="Financing" />
        </div>
      </div>

      {/* ── 2. AI QUICK ACTIONS ──────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="grid grid-cols-4 gap-1">
          {[
            { icon: CalendarIcon, label: 'Book', onClick: () => setCalendarOpen(true), testId: 'button-ai-book' },
            { icon: UserCheck, label: 'Assign', onClick: () => {}, testId: 'button-ai-assign' },
            { icon: Bell, label: 'Follow', onClick: () => handleFollowUp('Tomorrow'), testId: 'button-ai-followup' },
            { icon: PauseCircle, label: aiPaused ? 'Resume' : 'Pause', onClick: () => setAiPaused(p => !p), testId: 'button-ai-pause' },
          ].map(({ icon: Icon, label, onClick, testId }) => (
            <button
              key={label}
              onClick={onClick}
              data-testid={testId}
              className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg border border-gray-100 bg-gray-50 hover:bg-gray-100 hover:border-gray-200 transition-colors"
            >
              <Icon className="w-3 h-3 text-gray-500" />
              <span className="text-[9px] text-gray-500 font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-3 space-y-3">

          {/* ── 3. CONTACT INFO ──────────────────────────────────────── */}
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
                  <Phone className="w-3 h-3 text-gray-350 shrink-0" />
                  {contact.phone}
                </div>
              )}
              {contact.email && (
                <div className="flex items-center gap-1.5 text-[12px] text-gray-600" data-testid="text-contact-email">
                  <Mail className="w-3 h-3 text-gray-350 shrink-0" />
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

          {/* ── 4. STATUS + PIPELINE (side-by-side) ──────────────── */}
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
                        <span className={cn("text-[11px] font-medium", s.color.split(' ').find(c => c.startsWith('text-')))}>{s.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={contact.pipelineStage} onValueChange={val => onUpdateContact({ pipelineStage: val })}>
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

          {/* ── 5. ASSIGNED TO ───────────────────────────────────── */}
          <div>
            <RowLabel>Assigned To</RowLabel>
            <Select
              value={contact.assignedTo || "unassigned"}
              onValueChange={val => onUpdateContact({ assignedTo: val === 'unassigned' ? null : val })}
            >
              <SelectTrigger className="h-7 text-[11px] bg-white mt-1 px-2" data-testid="select-assigned-user">
                <SelectValue>
                  <span className="flex items-center gap-1">
                    {assignedLabel
                      ? <><UserCheck className="w-3 h-3 text-emerald-500" />{assignedLabel}</>
                      : <><User className="w-3 h-3 text-gray-400" />Unassigned</>
                    }
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">
                  <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><User className="w-3 h-3" />Unassigned</span>
                </SelectItem>
                {teamMembers.filter(m => m.status === 'active').map(m => (
                  <SelectItem key={m.id} value={m.memberId || m.id}>
                    <span className="flex items-center gap-1.5 text-[11px]">
                      <UserCheck className="w-3 h-3 text-emerald-600" />
                      {m.name || m.email.split('@')[0]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── 6. STATUS TAGS ────────────────────────────────────── */}
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

          {/* ── 7. NEXT FOLLOW-UP ─────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <RowLabel>Follow-up</RowLabel>
              {!contact.followUpDate && (
                <span className="text-[9px] text-purple-400 italic">AI: suggest 24h</span>
              )}
            </div>

            {contact.followUpDate && (
              <div
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1.5 rounded-lg mb-1.5 text-[11px] font-medium border",
                  followUpStatus === 'overdue' ? "bg-red-50 text-red-700 border-red-200" :
                  followUpStatus === 'today' ? "bg-amber-50 text-amber-700 border-amber-200" :
                  "bg-emerald-50 text-emerald-700 border-emerald-200"
                )}
                data-testid="followup-date-display"
              >
                <CalendarIcon className="w-3 h-3 shrink-0" />
                <span>
                  {followUpStatus === 'overdue' && 'Overdue · '}
                  {followUpStatus === 'today' && 'Today · '}
                  {format(new Date(contact.followUpDate), 'MMM d, yyyy')}
                </span>
                <button
                  onClick={() => onUpdateContact({ followUp: null, followUpDate: null })}
                  className="ml-auto opacity-50 hover:opacity-100 transition-opacity"
                  data-testid="button-clear-followup"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <div className="flex gap-1">
              {(['Tomorrow', '3 days', '1 week'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => handleFollowUp(contact.followUp === t ? null : t)}
                  className={cn(
                    "flex-1 text-[10px] py-1.5 rounded-lg border text-center transition-colors",
                    contact.followUp === t
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold"
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                  )}
                  data-testid={`button-followup-${t.replace(' ', '-').toLowerCase()}`}
                >
                  {t}
                </button>
              ))}

              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "flex-1 text-[10px] py-1.5 rounded-lg border text-center transition-colors",
                      contact.followUp && !['Tomorrow', '3 days', '1 week'].includes(contact.followUp)
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold"
                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    )}
                    data-testid="button-followup-custom"
                  >
                    Custom
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={contact.followUpDate ? new Date(contact.followUpDate) : undefined}
                    onSelect={date => {
                      if (date) {
                        onUpdateContact({ followUp: format(date, 'MMM d'), followUpDate: date.toISOString() });
                        setCalendarOpen(false);
                      }
                    }}
                    disabled={d => d < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* ── 8. NOTES / AI MEMORY ──────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <RowLabel>Notes</RowLabel>
              {notesSaved && (
                <span className="text-[10px] text-emerald-600 flex items-center gap-0.5" data-testid="text-notes-saved">
                  <CheckCheck className="w-3 h-3" />Saved
                </span>
              )}
            </div>

            {/* AI memory summary — parsed from notes */}
            {contact.notes && (
              <div className="mb-1.5 px-2 py-1.5 bg-purple-50/60 border border-purple-100 rounded-lg">
                <div className="flex items-center gap-1 mb-0.5">
                  <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                  <span className="text-[9px] font-semibold text-purple-500 uppercase tracking-wide">AI Memory</span>
                </div>
                <p className="text-[11px] text-purple-800 leading-relaxed line-clamp-3">{contact.notes}</p>
              </div>
            )}

            <textarea
              className="w-full h-16 bg-white border border-gray-200 rounded-lg p-2 text-[12px] text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 resize-none"
              placeholder="Add a note…"
              value={localNotes}
              onChange={e => { setLocalNotes(e.target.value); setNotesSaved(false); }}
              onBlur={saveNotes}
              data-testid="textarea-notes"
            />
          </div>

          {/* ── 9. DELETE CONTACT ─────────────────────────────────── */}
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
