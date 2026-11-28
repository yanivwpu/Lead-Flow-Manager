/** Read-only Tasks presentation. Never promotes contacts or rewrites CRM history. */
import {
  looksLikeHumanAsk, looksLikeProductOrSaasInquiry,
  looksLikeSystemNotificationContent, looksLikeSystemOrNotificationEmail,
} from './aiDomainEligibility';
import { agentInquiryRecommendation, isAgentInquiryThread } from './agent/agentPageInquiry';
import { customerAuthoredText } from './buyerPreferenceEvidence';
import { isEmailInboxIdentitySource } from './contactCrmVisibility';

export type FollowUpInboxItem = {
  contact: {
    id: string; name: string; avatar?: string | null; email?: string | null;
    tag: string; pipelineStage: string; pipelineCustomStageId?: string | null; notes?: string | null;
    followUp?: string | null; followUpDate?: string | Date | null;
    source?: string | null; sourceDetails?: unknown; assignedTo?: string | null;
  };
  conversation?: {
    id?: string; channel?: string; status?: string | null; channelAccountId?: string | null;
    subject?: string | null; lastMessagePreview?: string | null;
    lastMessageDirection?: string | null;
    dismissedReplyMessageAt?: string | null;
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
  notes: string; pipelineStage: string; pipelineCustomStageId?: string | null; needsReply: boolean; isOpportunity: boolean;
  urgent: boolean; engaged: boolean; pipelineManuallyAdded?: boolean; source?: string | null; emailPipelineSalesEvidence?: boolean;
  reviewRecommended?: string;
  channel?: string; assignedTo?: string | null;
  conversationId?: string;
  replyMessageAt?: string;
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

/** Email-origin identities (including old source=email records) require actual sales evidence or manual admission. */
export function isPassiveEmailIdentity(contact: Pick<FollowUpInboxItem['contact'], 'source' | 'sourceDetails'>): boolean {
  return isEmailInboxIdentitySource(contact.source) || normalized(contact.source || '') === 'email';
}
function manuallyAddedToPipeline(contact: { sourceDetails?: unknown }): boolean {
  return (contact.sourceDetails as { pipelineManuallyAdded?: unknown } | null)?.pipelineManuallyAdded === true;
}

export function isManuallyRemovedFromPipeline(contact: { sourceDetails?: unknown }): boolean {
  return (contact.sourceDetails as { pipelineManuallyRemoved?: unknown } | null)?.pipelineManuallyRemoved === true;
}
function hasEmailPipelineSalesEvidence(contact: { sourceDetails?: unknown }): boolean {
  return (contact.sourceDetails as { emailPipelineSalesEvidence?: unknown } | null)?.emailPipelineSalesEvidence === true;
}

export function canManuallyAdmitToPipeline(contact: Pick<FollowUpInboxItem['contact'], 'tag'>): boolean {
  return !['unqualified', 'do not contact'].includes(normalized(contact.tag));
}

/** Default Lead/New Lead, a saved contact, and an inbox conversation are not opportunities. */
export function isSalesOpportunity(contact: FollowUpInboxItem['contact']): boolean {
  const stage = normalized(contact.pipelineStage);
  const tag = normalized(contact.tag);
  if (['unqualified', 'disqualified', 'archived'].includes(stage) ||
      !canManuallyAdmitToPipeline(contact)) return false;
  if (isManuallyRemovedFromPipeline(contact)) return false;
  if (isPassiveEmailIdentity(contact) && !manuallyAddedToPipeline(contact) && !hasEmailPipelineSalesEvidence(contact)) return false;
  if (manuallyAddedToPipeline(contact) && ['lead', 'contacted'].includes(stage)) return true;
  return isClosedStage(stage) ||
    ['opportunity', 'proposal', 'negotiation', 'qualified', 'qualified (hot)', 'qualified (warm)', 'under contract'].includes(stage) ||
    ['hot', 'warm', 'hot lead', 'warm lead', 'qualified'].includes(tag);
}

// These are evidence of broadcast/system content, not general customer vocabulary.
// Do not block a whole channel or provider domain (a Railway customer can ask for help).
const TASK_NOTIFICATION_CONTENT = /\b(?:newsletter|weekly digest|daily digest|unsubscribe|promotional offer|limited[- ]time offer|flash sale|shop now|save \d+%|\d+% off|reset your password|verification code|shipping notification|delivery status notification|you have used\s+\$?[\d,.]+\s+of\s+usage)\b|(?:^|\n)(?:your\s+)?(?:railway\s+)?(?:deployment (?:failed|successful|succeeded|complete|completed|crashed)|build (?:failed|successful|succeeded)|usage (?:alert|limit)|service (?:crashed|deployed))\b/i;
const SOCIAL_ONLY = /^(?:hi|hello|hey|thanks|thank you|ok|okay|great|sounds good|got it|how are you|good (?:morning|afternoon|evening))[\s!.?]*$/i;
const CUSTOMER_REQUEST = /\b(?:interested in|looking (?:for|to)|(?:i|we)(?: (?:need|want|would like)|'d like) (?:help|support|info(?:rmation)?|a (?:refund|quote|demo)|to (?:buy|rent|book|order|schedule|sell))|(?:need|please|can you|could you) (?:help|send|share|check|confirm|call|contact|fix|reschedule)|(?:quote|pricing|refund|demo|support) (?:please|request)|arrived (?:broken|damaged)|was charged twice|(?:cannot|can't) log in|not working|(?:my|our) (?:order|package|item|account|payment|subscription).{0,40}(?:missing|never arrived|hasn't arrived|damaged|locked|failed))\b/i;
const CUSTOMER_TOPIC = /\b(?:pric(?:e|es|ing)|cost|quot(?:e|es|ation)|proposal|demo|support|refund|return|invoice|cancel\w*|reschedul\w*|appointment|availability|available|(?:my|our) (?:order|account|payment|subscription|delivery)|tour|showing)\b/i;

// A supplier's pitch and a customer's request can share sales vocabulary.
// Require a sender-authored direct ask, not a subject or second-person CTA.
const EMAIL_BROADCAST = /\b(?:view (?:this |the )?(?:email |message )?in (?:your |a )?browser|join (?:our|the|this) (?:webinar|workshop|event)|register (?:now|today)|sign up (?:now|today)|save on|this week'?s roundup|roundup of|weekly roundup|confirm your (?:vehicle|identity|account)|thank(?:s| you) for (?:contacting|reaching out)|explore (?:our|capital|financing|funding) options|we (?:can help|offer|provide|specialize|help businesses)|(?:improv(?:e|ing)|boost(?:ing)?|grow(?:ing)?) your (?:website|seo|rankings|business)|(?:would you|are you|if you(?:'re| are)) (?:be )?interested|your (?:support )?ticket (?:was|has been)|(?:your|verification) pin\s*:)/i;
const EMAIL_VENDOR_OFFER = /\b(?:offer(?:ing)? (?:you|your business|our)|introduce (?:you to|our)|(?:a demo|demonstration) of our (?:product|platform|services?)|(?:sell|provide|pitch) you (?:our|a)|(?:we|i) (?:can|could|would like to) (?:help you|help your|save you|boost your|grow your))\b/i;
const EMAIL_DIRECT_ASK = /^(?:(?:can|could|would) you (?:please )?(?:send|share|provide|give|help|reschedule|book|schedule|quote|confirm|check|call|contact|fix)\b|please (?:send|share|provide|give|help|reschedule|book|schedule|quote|confirm|check|call|contact|fix)\b|(?:i|we)(?:'m|'re| am| are) (?:interested in|looking (?:for|to))\b|(?:i|we)(?: would like|'d like| need| want)\b|(?:how (?:much|do|does|can)|what (?:is|are|does)|where is|is (?:this|the|your)|does|do you)\b|(?:my|our) (?:order|package|item|account|payment|subscription).{0,65}(?:missing|never arrived|hasn't arrived|damaged|locked|failed|not working)|the item arrived (?:broken|damaged))/i;
const EMAIL_PURCHASE_OR_SERVICE = /\b(?:buy(?:ing)?|rent(?:ing)?|lease|sell(?:ing)?|book(?:ing)?|schedule|reschedul\w*|quote|estimate|pricing|price|cost|demo|consultation|appointment|tour|showing|refund|return|availability|available|order|package|account|payment|subscription|service(?:s)?|product(?:s)?|support|help|integrat\w*|remodel\w*|renovat\w*|cabinet\w*|installation|property|home|house|condo|apartment|privacy policy|damaged|broken|log in)\b/i;
const EMAIL_ES_DIRECT = /^(?:me gustar[ií]a|quisiera|quiero|necesito|estoy buscando|estoy interesad[oa] en|podr[ií]a(?:s|n)?|puede(?:s|n)?|por favor|cu[aá]nto (?:cuesta|vale)|cu[aá]l es|mi pedido)\b/i;
const EMAIL_ES_TOPIC = /\b(?:comprar|alquilar|vender|presupuesto|cotizaci[oó]n|precio|cita|consulta|pedido|cuenta|reembolso|servicio|producto|ayuda|soporte|reforma|cocina|visita|demostraci[oó]n)\b/i;
const EMAIL_HE_DIRECT = /^(?:אני (?:רוצה|צריך|צריכה|מעוניין|מעוניינת|מחפש|מחפשת)|אנחנו (?:רוצים|צריכים|מעוניינים|מחפשים)|אפשר|האם אפשר|האם תוכלו|האם אתם|בבקשה|כמה עולה|מה המחיר|ההזמנה שלי)(?:\s|$)/u;
const EMAIL_HE_TOPIC = /(?:לקנות|לרכוש|לשכור|למכור|הצעת מחיר|מחיר|פגישה|ייעוץ|הזמנה|חשבון|החזר|שירות|מוצר|עזרה|תמיכה|מטבח|שיפוץ|דירה|בית)/u;

function emailPlainText(value: string): string {
  return value.replace(/&(?:#0*39|#x0*27|apos);|’/gi, "'").replace(/&(?:#0*160|nbsp);/gi, ' ').replace(/&amp;/gi, '&');
}

// Durable deal evidence is deliberately narrower than a reply-worthy support inquiry.
const EMAIL_SALES_INTENT = /\b(?:quote|estimate|pricing|price|cost|demo|consultation|buy(?:ing)?|rent(?:ing)?|lease|sell(?:ing)?|tour|showing|remodel\w*|renovat\w*|cabinet\w*)\b/i;
const EMAIL_SALES_ES = /\b(?:comprar|alquilar|vender|presupuesto|cotizaci[oó]n|precio|consulta|reforma|cocina|visita|demostraci[oó]n)\b/i;
const EMAIL_SALES_HE = /(?:לקנות|לרכוש|לשכור|למכור|הצעת מחיר|מחיר|ייעוץ|מטבח|שיפוץ|דירה|בית)/u;
const EMAIL_SUPPORT_ONLY = /\b(?:refund|return|cancel\w*|damaged|broken|reschedul\w*|charged|billing|invoice|my (?:order|account|subscription|payment|package)|privacy policy|password|log in|not working)\b/i;

export function qualifiesEmailPipelineSalesEvidence(input: {
  senderEmail: string; subject?: string | null; body: string; headers?: Record<string, string>;
}): boolean {
  const headers = Object.fromEntries(Object.entries(input.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
  if (headers['list-id'] || headers['list-unsubscribe'] ||
      (headers['auto-submitted'] && headers['auto-submitted'].toLowerCase() !== 'no') ||
      /^(?:bulk|list|junk)$/i.test(headers.precedence || '')) return false;
  const body = customerAuthoredText(emailPlainText(input.body));
  if (EMAIL_SUPPORT_ONLY.test(body)) return false;
  if (!hasStrongEmailInquiry({
    contact: { id: '', name: '', email: input.senderEmail, tag: '', pipelineStage: '' },
    conversation: { channel: 'email', status: 'open', lastMessageDirection: 'inbound', subject: input.subject, lastMessagePreview: body },
    channel: 'email', lastMessage: body, lastMessageAt: null, unreadCount: 0,
  })) return false;
  return EMAIL_SALES_INTENT.test(body) || EMAIL_SALES_ES.test(body) || EMAIL_SALES_HE.test(body);
}

export function hasStrongEmailInquiry(row: FollowUpInboxItem): boolean {
  const conversation = row.conversation;
  if (conversation?.lastMessageDirection !== 'inbound' ||
      ['resolved', 'closed'].includes(normalized(conversation.status || ''))) return false;
  // row.lastMessage can be the email subject, not independent evidence.
  const body = customerAuthoredText(emailPlainText(conversation.lastMessagePreview || ''));
  if (!body || SOCIAL_ONLY.test(body)) return false;
  const context = emailPlainText([conversation.subject, body].filter(Boolean).join('\n'));
  if (TASK_NOTIFICATION_CONTENT.test(context) || EMAIL_BROADCAST.test(context) || EMAIL_VENDOR_OFFER.test(context)) return false;
  if (row.formIdentity?.isWebsiteForm) return true;
  if (looksLikeSystemOrNotificationEmail({ contactEmail: row.contact.email, channel: 'email', inboundText: '' })) return false;
  const authored = body.replace(/^(?:hi|hello|hey|dear|hola|buenos d[ií]as|שלום|היי)(?:[ ,]+[\p{L} .'-]{1,35})?[,!:\n]\s*/iu, '').trim()
    .replace(/^[¿¡]+/, '');
  if (looksLikeSystemNotificationContent(context) && !looksLikeHumanAsk(authored)) return false;
  return (EMAIL_DIRECT_ASK.test(authored) && (EMAIL_PURCHASE_OR_SERVICE.test(authored) || looksLikeProductOrSaasInquiry(authored))) ||
    (EMAIL_ES_DIRECT.test(authored) && EMAIL_ES_TOPIC.test(authored)) ||
    (EMAIL_HE_DIRECT.test(authored) && EMAIL_HE_TOPIC.test(authored));
}

export function hasActionableInquiry(row: FollowUpInboxItem): boolean {
  const conversation = row.conversation;
  const messageAt = validTaskDate(row.lastMessageAt);
  if (messageAt && conversation?.dismissedReplyMessageAt === messageAt) return false;
  if (isAgentInquiryThread(conversation)) return false;
  if (conversation?.lastMessageDirection !== 'inbound' ||
      ['resolved', 'closed'].includes(normalized(conversation.status || ''))) return false;
  if (normalized(row.channel || conversation.channel || '') === 'email') return hasStrongEmailInquiry(row);
  const text = [conversation.subject, conversation.lastMessagePreview, row.lastMessage]
    .filter(Boolean).join('\n').replace(/’/g, "'").trim();
  const preview = (conversation.lastMessagePreview || row.lastMessage).trim();
  if (SOCIAL_ONLY.test(preview)) return false;
  if (TASK_NOTIFICATION_CONTENT.test(text) ||
      (looksLikeSystemNotificationContent(text) && !looksLikeHumanAsk(text))) return false;
  return CUSTOMER_REQUEST.test(text) ||
    ((/[?？]/.test(text) || looksLikeHumanAsk(text)) &&
      (CUSTOMER_TOPIC.test(text) || looksLikeProductOrSaasInquiry(text)));
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
      reviewRecommended: agentInquiryRecommendation(contact),
      followUpDate: followUp ? validTaskDate(contact.followUpDate) : null,
      notes: contact.notes || '', pipelineStage: contact.pipelineStage, pipelineCustomStageId: contact.pipelineCustomStageId,
      needsReply, isOpportunity: isSalesOpportunity(contact), pipelineManuallyAdded: manuallyAddedToPipeline(contact), source: contact.source, emailPipelineSalesEvidence: hasEmailPipelineSalesEvidence(contact),
      urgent: /\b(?:urgent|asap|emergency|today|immediately)\b/i.test(followUp || '') ||
        (needsReply && /\b(?:urgent|asap|emergency|today|immediately)\b/i.test(row.conversation?.lastMessagePreview || row.lastMessage)),
      engaged: needsReply,
      conversationId: row.conversation?.id,
      replyMessageAt: needsReply && time ? time : undefined,
      channel: (row.conversation?.channel || row.channel || '').trim().toLowerCase(),
      assignedTo: contact.assignedTo,
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

export type PipelineFilters = { search: string; channel: string; tag: string; assignment: 'all' | 'mine' | 'unassigned' | 'others' };

/** Presentation-only filtering of already eligible opportunities. */
export function filterPipelineItems(items: readonly FollowUpItem[], filters: PipelineFilters, actorId?: string): FollowUpItem[] {
  const query = normalized(filters.search);
  return items.filter(item => {
    if (query && ![item.name, item.lastMessage, item.followUp, item.notes].some(value => (value || '').toLowerCase().includes(query))) return false;
    if (filters.channel && item.channel !== filters.channel) return false;
    if (filters.tag && item.tag !== filters.tag) return false;
    if (filters.assignment === 'mine' && (!actorId || item.assignedTo !== actorId)) return false;
    if (filters.assignment === 'unassigned' && item.assignedTo !== null && item.assignedTo !== '') return false;
    if (filters.assignment === 'others' && (!actorId || !item.assignedTo || item.assignedTo === actorId)) return false;
    return true;
  });
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
      (item.reviewRecommended ? 45 : 0) +
      (item.urgent ? 35 : 0) + (item.needsReply ? 30 : 0) +
      (recentEngagement ? 10 : 0) + (isActiveDeal(item) ? 10 : 0);
  };
  const timestamp = (item: FollowUpItem) => item.time ? Date.parse(item.time) : -Infinity;
  return items.filter(item => item.reviewRecommended || hasTask(item) || hasNeedsReply(item)).sort((a, b) =>
    score(b) - score(a) ||
    (a.followUpDate ? Date.parse(a.followUpDate) : Infinity) - (b.followUpDate ? Date.parse(b.followUpDate) : Infinity) ||
    timestamp(b) - timestamp(a) || a.id.localeCompare(b.id));
}
