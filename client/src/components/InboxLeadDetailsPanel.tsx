import { useState, useEffect } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  { value: 'open', label: 'Open', color: 'border-emerald-500 text-emerald-600' },
  { value: 'pending', label: 'Pending', color: 'border-amber-400 text-amber-600' },
  { value: 'resolved', label: 'Resolved', color: 'border-blue-400 text-blue-600' },
  { value: 'closed', label: 'Closed', color: 'border-gray-300 text-gray-600' },
];

const SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram DM' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'webchat', label: 'Website Widget' },
  { value: 'import', label: 'CSV Import' },
  { value: 'api', label: 'API' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'sms', label: 'SMS' },
  { value: 'telegram', label: 'Telegram' },
];

function getFollowUpStatus(followUpDate: string | null | undefined): 'overdue' | 'today' | 'upcoming' | null {
  if (!followUpDate) return null;
  const due = new Date(followUpDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  if (dueDay < today) return 'overdue';
  if (dueDay.getTime() === today.getTime()) return 'today';
  return 'upcoming';
}

interface InboxLeadDetailsPanelProps {
  contact: Contact;
  primaryConversation?: Conversation;
  teamMembers: TeamMember[];
  onUpdateContact: (fields: Record<string, unknown>) => void;
  onUpdateConversationStatus: (status: string) => void;
  onEditContact: () => void;
  onDeleteContact: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
      {children}
    </p>
  );
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

  useEffect(() => {
    setLocalNotes(contact.notes || "");
    setNotesSaved(false);
  }, [contact.id, contact.notes]);

  const handleFollowUp = (label: string | null) => {
    if (!label) {
      onUpdateContact({ followUp: null, followUpDate: null });
      return;
    }
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
  const statusStyle = CONVERSATION_STATUSES.find(s => s.value === convStatus)?.color || 'border-gray-300 text-gray-600';
  const followUpStatus = getFollowUpStatus(contact.followUpDate);

  return (
    <div className="hidden lg:flex w-72 xl:w-80 flex-col border-l bg-gray-50/40 overflow-y-auto flex-shrink-0">

      {/* Panel Header */}
      <div className="px-4 py-3 border-b bg-white flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-semibold text-gray-600 tracking-wide">Lead Details</span>
        <button
          onClick={onEditContact}
          className="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors"
          data-testid="button-edit-contact-panel"
          title="Edit contact"
        >
          <Edit className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-4 py-4 space-y-5">

        {/* 1. CONTACT INFO */}
        <div>
          <SectionLabel>Contact Info</SectionLabel>
          <div className="space-y-1.5">
            {contact.phone ? (
              <div className="flex items-center gap-2 text-sm text-gray-700" data-testid="text-contact-phone">
                <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span>{contact.phone}</span>
              </div>
            ) : null}
            {contact.email ? (
              <div className="flex items-center gap-2 text-sm text-gray-700" data-testid="text-contact-email">
                <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="truncate">{contact.email}</span>
              </div>
            ) : null}
            {!contact.phone && !contact.email && (
              <p className="text-xs text-gray-400 italic">No contact info</p>
            )}
          </div>
        </div>

        {/* 2. SOURCE */}
        <div>
          <SectionLabel>Source</SectionLabel>
          <Select
            value={contact.source || "manual"}
            onValueChange={val => onUpdateContact({ source: val })}
          >
            <SelectTrigger className="h-8 text-sm bg-white" data-testid="select-source">
              <SelectValue placeholder="Select source" />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 3. STATUS */}
        {primaryConversation && (
          <div>
            <SectionLabel>Status</SectionLabel>
            <Select
              value={convStatus}
              onValueChange={onUpdateConversationStatus}
            >
              <SelectTrigger
                className={cn("h-8 text-sm font-medium bg-white", statusStyle)}
                data-testid="select-conversation-status"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONVERSATION_STATUSES.map(s => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className={cn("font-medium", s.color.split(' ').find(c => c.startsWith('text-')))}>{s.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 4. ASSIGNED TO */}
        <div>
          <SectionLabel>Assigned To</SectionLabel>
          <Select
            value={contact.assignedTo || "unassigned"}
            onValueChange={val => onUpdateContact({ assignedTo: val === 'unassigned' ? null : val })}
          >
            <SelectTrigger className="h-8 text-sm bg-white" data-testid="select-assigned-user">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">
                <span className="flex items-center gap-1.5 text-gray-500">
                  <User className="w-3 h-3" /> Unassigned
                </span>
              </SelectItem>
              {teamMembers.filter(m => m.status === 'active').map(member => (
                <SelectItem key={member.id} value={member.memberId || member.id}>
                  <span className="flex items-center gap-1.5">
                    <UserCheck className="w-3 h-3 text-emerald-600" />
                    {member.name || member.email.split('@')[0]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 5. PIPELINE STAGE */}
        <div>
          <SectionLabel>Pipeline Stage</SectionLabel>
          <Select
            value={contact.pipelineStage}
            onValueChange={val => onUpdateContact({ pipelineStage: val })}
          >
            <SelectTrigger className="h-8 text-sm bg-white" data-testid="select-pipeline">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PIPELINE_STAGES.map(stage => (
                <SelectItem key={stage} value={stage}>{stage}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 6. STATUS TAGS */}
        <div>
          <SectionLabel>Status Tag</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(TAG_COLORS).map(tag => (
              <button
                key={tag}
                onClick={() => onUpdateContact({ tag })}
                className={cn(
                  "text-[11px] px-2.5 py-0.5 rounded-full border transition-all font-medium",
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

        {/* 7. NEXT FOLLOW-UP */}
        <div>
          <SectionLabel>Next Follow-up</SectionLabel>

          {contact.followUpDate && (
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg mb-2.5 text-xs font-medium border",
                followUpStatus === 'overdue' ? "bg-red-50 text-red-700 border-red-200" :
                followUpStatus === 'today' ? "bg-amber-50 text-amber-700 border-amber-200" :
                "bg-emerald-50 text-emerald-700 border-emerald-200"
              )}
              data-testid="followup-date-display"
            >
              <CalendarIcon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                {followUpStatus === 'overdue' && <span className="mr-0.5">Overdue · </span>}
                {followUpStatus === 'today' && <span className="mr-0.5">Today · </span>}
                {format(new Date(contact.followUpDate), 'MMM d, yyyy')}
              </span>
              <button
                onClick={() => onUpdateContact({ followUp: null, followUpDate: null })}
                className="ml-auto opacity-60 hover:opacity-100 transition-opacity"
                data-testid="button-clear-followup"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-4 gap-1.5">
            {(['Tomorrow', '3 days', '1 week'] as const).map(time => (
              <button
                key={time}
                onClick={() => handleFollowUp(contact.followUp === time ? null : time)}
                className={cn(
                  "text-[10px] py-2 rounded-lg border text-center transition-colors flex flex-col items-center gap-0.5",
                  contact.followUp === time
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold"
                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                )}
                data-testid={`button-followup-${time.replace(' ', '-').toLowerCase()}`}
              >
                <Clock className="w-3.5 h-3.5" />
                {time}
              </button>
            ))}

            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "text-[10px] py-2 rounded-lg border text-center transition-colors flex flex-col items-center gap-0.5",
                    contact.followUp && !['Tomorrow', '3 days', '1 week'].includes(contact.followUp)
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold"
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                  )}
                  data-testid="button-followup-custom"
                >
                  <CalendarIcon className="w-3.5 h-3.5" />
                  Custom
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={contact.followUpDate ? new Date(contact.followUpDate) : undefined}
                  onSelect={date => {
                    if (date) {
                      onUpdateContact({ followUp: format(date, 'MMM d'), followUpDate: date.toISOString() });
                      setCalendarOpen(false);
                    }
                  }}
                  disabled={date => date < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* 8. NOTES */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <SectionLabel>Notes</SectionLabel>
            {notesSaved && (
              <span className="text-[10px] text-emerald-600 flex items-center gap-0.5" data-testid="text-notes-saved">
                <CheckCheck className="w-3 h-3" /> Saved
              </span>
            )}
          </div>
          <textarea
            className="w-full h-24 bg-white border border-gray-200 rounded-lg p-2.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 resize-none"
            placeholder="Add a note..."
            value={localNotes}
            onChange={e => { setLocalNotes(e.target.value); setNotesSaved(false); }}
            onBlur={saveNotes}
            data-testid="textarea-notes"
          />
        </div>

        {/* 9. DELETE CONTACT */}
        <div className="pb-3">
          <button
            onClick={onDeleteContact}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-red-400 hover:text-red-600 border border-red-100 hover:border-red-200 rounded-lg bg-white hover:bg-red-50 transition-colors"
            data-testid="button-delete-contact"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Contact
          </button>
        </div>

      </div>
    </div>
  );
}
