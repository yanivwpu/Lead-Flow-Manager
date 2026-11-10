/** Read-only Tasks presentation. Never promotes contacts or rewrites CRM history. */
import {
  looksLikeHumanAsk, looksLikeSystemNotificationContent, looksLikeSystemOrNotificationEmail,
} from './aiDomainEligibility';

export type FollowUpInboxItem = {
  contact: {
    id: string; name: string; avatar?: string | null; email?: string | null;
    tag: string; pipelineStage: string; notes?: string | null;
    followUp?: string | null; followUpDate?: string | Date | null;
    source?: string | null;
  };
  conversation?: {
    id?: string; channel?: string; status?: string | null;
    subject?: string | null; lastMessagePreview?: string | null;
    lastMessageDirection?: string | null;
  } | null;
  channel?: string;
  lastMessage: string;
  lastMessageAt: string | Date | null;
  unreadCount: number;
  formIdentity?: { isWebsiteForm: true } | null;
};

export type FollowUpItem = {
  id: string; name: string; avatar: string; lastMessage: string; time: string;
  unread: number; tag: string; followUp: string | null; followUpDate: string | null;
  notes: string; pipelineStage: string; needsReply: boolean; isOpportunity: boolean;
  urgent: boolean; engaged: boolean;
  conversationId?: string;
  appointmentId?: string; contactId?: string; appointmentType?: string; isAppointment?: boolean;
};

export type KPIFilter = 'overdue' | 'today' | 'booking-requested' | 'booked' | 'needs-reply' | 'active-deals' | null;

export function validTaskDate(value: string | Date | null | undefined): string | null {
  if (!value || (typeof value === 'string' && !value.trim())) return null;
  if (typeof value === 'string') {
    const parts = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
    if (!parts) return null;
    const [, year, month, day] = parts.map(Number);
    const calendar = new Date(Date.UTC(year, month - 1, day));
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

const normalized = (value: string) => value.trim().toLowerCase();
export function isClosedStage(stage: string): boolean {
  return ['closed', 'closed won', 'closed lost', 'won', 'lost'].includes(normalized(stage));
}

/** Default Lead/New Lead, a saved contact, and an inbox conversation are not opportunities. */
export function isSalesOpportunity(contact: FollowUpInboxItem['contact']): boolean {
  const stage = normalized(contact.pipelineStage);
  const tag = normalized(contact.tag);
  if (['unqualified', 'disqualified', 'archived'].includes(stage) ||
      ['unqualified', 'do not contact'].includes(tag)) return false;
  return isClosedStage(stage) ||
    ['opportunity', 'proposal', 'negotiation', 'qualified', 'qualified (hot)', 'qualified (warm)', 'under contract'].includes(stage) ||
    ['hot', 'warm', 'hot lead', 'warm lead', 'qualified'].includes(tag);
}

// These are evidence of broadcast/system content, not general customer vocabulary.
// Do not block a whole channel or provider domain (a Railway customer can ask for help).
const TASK_NOTIFICATION_CONTENT = /\b(?:newsletter|weekly digest|daily digest|unsubscribe|promotional offer|limited[- ]time offer|flash sale|shop now|save \d+%|\d+% off|reset your password|verification code|shipping notification|delivery status notification)\b|(?:^|\n)(?:your\s+)?(?:railway\s+)?(?:deployment (?:failed|successful|succeeded|complete|completed|crashed)|build (?:failed|successful|succeeded)|usage (?:alert|limit)|service (?:crashed|deployed))\b/i;
const SOCIAL_ONLY = /^(?:hi|hello|hey|thanks|thank you|ok|okay|great|sounds good|got it|how are you|good (?:morning|afternoon|evening))[\s!.?]*$/i;
const CUSTOMER_REQUEST = /\b(?:interested in|looking (?:for|to)|(?:i|we)(?: (?:need|want|would like)|'d like) (?:help|support|a (?:refund|quote|demo)|to (?:buy|rent|book|order|schedule|sell))|(?:need|please|can you|could you) (?:help|send|share|check|confirm|call|contact|fix|reschedule)|(?:quote|pricing|refund|demo|support) (?:please|request)|arrived (?:broken|damaged)|was charged twice|(?:cannot|can't) log in|not working|(?:my|our) (?:order|package|item).{0,40}(?:missing|never arrived|hasn't arrived|damaged))\b/i;
const CUSTOMER_TOPIC = /\b(?:pric(?:e|es|ing)|cost|quot(?:e|es|ation)|proposal|demo|support|refund|return|invoice|cancel\w*|reschedul\w*|appointment|availability|available|(?:my|our) (?:order|account|payment|subscription|delivery)|tour|showing)\b/i;

export function hasActionableInquiry(row: FollowUpInboxItem): boolean {
  const conversation = row.conversation;
  if (conversation?.lastMessageDirection !== 'inbound' ||
      ['resolved', 'closed'].includes(normalized(conversation.status || ''))) return false;
  const text = [conversation.subject, conversation.lastMessagePreview, row.lastMessage]
    .filter(Boolean).join('\n').replace(/’/g, "'").trim();
  const preview = (conversation.lastMessagePreview || row.lastMessage).trim();
  if (SOCIAL_ONLY.test(preview)) return false;
  if (TASK_NOTIFICATION_CONTENT.test(text) ||
      (looksLikeSystemNotificationContent(text) && !looksLikeHumanAsk(text))) return false;
  const isEmail = (row.channel || conversation.channel) === 'email';
  // Persisted website-form identity preserves legitimate inquiries sent by a form notifier.
  if (isEmail && row.formIdentity?.isWebsiteForm) return true;
  // Reuse the existing email/system policy. Blank text tests sender evidence alone,
  // so a notification CTA cannot override a known automated sender.
  if (isEmail && looksLikeSystemOrNotificationEmail({ contactEmail: row.contact.email, channel: 'email', inboundText: '' })) return false;
  return CUSTOMER_REQUEST.test(text) || (/[?？]/.test(text) && CUSTOMER_TOPIC.test(text));
}

/** One CRM task/deal per contact, even when Inbox expands that contact into email threads. */
export function buildFollowUpItems(rows: readonly FollowUpInboxItem[]): FollowUpItem[] {
  const byContact = new Map<string, FollowUpItem>();
  for (const row of rows) {
    const contact = row.contact;
    const needsReply = hasActionableInquiry(row);
    const followUp = contact.followUp?.trim() || null;
    const time = validTaskDate(row.lastMessageAt) || '';
    const item: FollowUpItem = {
      id: contact.id, name: contact.name, avatar: contact.avatar || '',
      lastMessage: row.conversation?.lastMessagePreview || row.lastMessage, time,
      unread: row.unreadCount, tag: contact.tag, followUp,
      followUpDate: followUp ? validTaskDate(contact.followUpDate) : null,
      notes: contact.notes || '', pipelineStage: contact.pipelineStage,
      needsReply, isOpportunity: isSalesOpportunity(contact),
      urgent: /\b(?:urgent|asap|emergency|today|immediately)\b/i.test(followUp || '') ||
        (needsReply && /\b(?:urgent|asap|emergency|today|immediately)\b/i.test(row.conversation?.lastMessagePreview || row.lastMessage)),
      engaged: needsReply,
      conversationId: row.conversation?.id,
    };
    const prior = byContact.get(contact.id);
    // Show the actionable thread rather than a newer notification for the same contact.
    const preferItem = !prior || (needsReply && !prior.needsReply) ||
      (needsReply === prior.needsReply && time > prior.time);
    const representative = preferItem ? item : prior!;
    byContact.set(contact.id, { ...representative,
      needsReply: needsReply || Boolean(prior?.needsReply),
      urgent: item.urgent || Boolean(prior?.urgent),
      engaged: item.engaged || Boolean(prior?.engaged),
    });
  }
  return [...byContact.values()];
}

export const hasNeedsReply = (item: FollowUpItem): boolean => item.needsReply;
export const hasTask = (item: FollowUpItem): boolean => Boolean(item.followUp?.trim());
export const hasScheduledFollowUp = (item: FollowUpItem): boolean =>
  hasTask(item) && validTaskDate(item.followUpDate) !== null;
export const isActiveDeal = (item: FollowUpItem): boolean => item.isOpportunity && !isClosedStage(item.pipelineStage);

export function getTaskStatus(date: string | null, now = new Date()): 'overdue' | 'today' | 'upcoming' | null {
  const valid = validTaskDate(date);
  if (!valid) return null;
  const due = new Date(valid);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return dueDay < today ? 'overdue' : dueDay === today ? 'today' : 'upcoming';
}

export function applyKPIFilter(items: readonly FollowUpItem[], filter: KPIFilter, now = new Date()): FollowUpItem[] {
  return items.filter(item => {
    switch (filter) {
      case 'overdue': return hasScheduledFollowUp(item) && getTaskStatus(item.followUpDate, now) === 'overdue';
      case 'today': return hasScheduledFollowUp(item) && getTaskStatus(item.followUpDate, now) === 'today';
      case 'needs-reply': return hasNeedsReply(item);
      case 'active-deals': return isActiveDeal(item);
      case 'booked': return item.isOpportunity && isClosedStage(item.pipelineStage);
      case 'booking-requested': return isActiveDeal(item) && ['negotiation', 'qualified (hot)', 'under contract'].includes(normalized(item.pipelineStage));
      default: return true;
    }
  });
}

/** Deterministic priority for actual work. Unread counts never affect the score. */
export function prioritizeTasks(items: readonly FollowUpItem[], now = new Date()): FollowUpItem[] {
  const score = (item: FollowUpItem) => {
    const status = hasScheduledFollowUp(item) ? getTaskStatus(item.followUpDate, now) : null;
    const age = now.getTime() - Date.parse(item.time);
    const recentEngagement = item.engaged && age >= 0 && age <= 72 * 60 * 60 * 1000;
    return (status === 'overdue' ? 100 : status === 'today' ? 70 : 0) +
      (item.urgent ? 35 : 0) + (item.needsReply ? 30 : 0) +
      (recentEngagement ? 10 : 0) + (isActiveDeal(item) ? 10 : 0);
  };
  return items.filter(item => hasTask(item) || hasNeedsReply(item)).sort((a, b) =>
    score(b) - score(a) ||
    (a.followUpDate ? Date.parse(a.followUpDate) : Infinity) - (b.followUpDate ? Date.parse(b.followUpDate) : Infinity) ||
    a.id.localeCompare(b.id));
}
