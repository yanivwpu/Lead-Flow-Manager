/**
 * Copilot Intelligence Engine
 * Extracts budget, timeline, financing, intent from conversation messages.
 * Computes lead score and AI state dynamically.
 */

export interface ConversationMessage {
  direction: 'inbound' | 'outbound';
  content: string;
  createdAt?: string;
}

/**
 * A single business-defined qualification criterion.
 * Stored in aiBusinessKnowledge.qualifyingQuestions.
 */
export interface QualifyingCriterion {
  key: string;        // machine-readable (e.g. "budget", "team_size")
  label: string;      // display label (e.g. "Budget", "Team Size")
  question: string;   // what to ask (e.g. "What's your budget range?")
  required?: boolean; // whether it must be answered to qualify the lead
}

export interface QualificationData {
  // Raw extracted values (null = not found)
  budget: string | null;
  timeline: string | null;
  financing: string | null;
  intent: string;

  // Boolean presence for badge display
  hasBudget: boolean;
  hasTimeline: boolean;
  hasFinancing: boolean;
}

export interface LeadScore {
  label: 'Hot' | 'Warm' | 'Cold';
  color: string;
  dot: string;
  confidence: number; // 0–100
}

export interface CopilotIntelligence extends QualificationData {
  leadScore: LeadScore;
  aiState: 'Ready' | 'Qualifying' | 'Engaging' | 'Waiting' | 'Stalled';
  signalCount: number; // total qualification signals found
  isUrgent: boolean;
  messageCount: number;
  lastDirection: 'inbound' | 'outbound' | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text.toLowerCase().replace(/['"]/g, '');
}

function searchAll(messages: ConversationMessage[]): string {
  return normalize(messages.map(m => m.content).join(' '));
}

function searchInbound(messages: ConversationMessage[]): string {
  return normalize(messages.filter(m => m.direction === 'inbound').map(m => m.content).join(' '));
}

// ── Budget Extraction ──────────────────────────────────────────────────────────

const MONEY_RE = /\$\s*[\d,]+(?:\.\d+)?(?:\s*(?:k|m|million|thousand|hundred\s*k))?/gi;
const MONEY_RANGE_RE = /\$\s*[\d,.]+(?:\s*(?:k|m|million|thousand))?\s*(?:to|-|–|and)\s*\$?\s*[\d,.]+(?:\s*(?:k|m|million|thousand))?/gi;

function normalizeMoney(raw: string): string {
  // Normalize "500k" → "$500k", handle common patterns
  return raw.trim().replace(/\s+/g, ' ');
}

function extractBudget(messages: ConversationMessage[]): string | null {
  // Evidence guard: only extract from the lead's own words (inbound).
  // This prevents "hallucinated" CRM fields from agent messages like
  // "Our packages start at $X" or "Budget options are...".
  const all = searchInbound(messages);
  if (!all) return null;

  // Try range first: "$500k to $600k" or "$500k–$600k"
  const rangeMatches = all.match(MONEY_RANGE_RE);
  if (rangeMatches && rangeMatches.length > 0) {
    return normalizeMoney(rangeMatches[0]);
  }

  // Context-sensitive: near budget keywords
  const budgetCtxRe = /(?:budget|afford|looking to spend|price range|spend|max|up to|around)\s+(?:is\s+|of\s+|about\s+|around\s+)?(\$[\d,]+(?:\s*(?:k|m|million|thousand))?)/gi;
  const ctxMatch = budgetCtxRe.exec(all);
  if (ctxMatch) return normalizeMoney(ctxMatch[1]);

  // Standalone dollar amount (most recent / most plausible)
  const allMoneyMatches = all.match(MONEY_RE);
  if (allMoneyMatches && allMoneyMatches.length > 0) {
    // Prefer the one that appears near budget context words
    const contextWords = ['budget', 'afford', 'spend', 'price', 'range', 'max', 'looking'];
    for (const match of allMoneyMatches) {
      const idx = all.indexOf(match.toLowerCase());
      const ctx = all.slice(Math.max(0, idx - 40), idx + 40);
      if (contextWords.some(w => ctx.includes(w))) {
        return normalizeMoney(match);
      }
    }
    // Return the last dollar amount mentioned (likely most specific)
    return normalizeMoney(allMoneyMatches[allMoneyMatches.length - 1]);
  }

  // Verbal amounts
  const verbalRe = /(\d+(?:\.\d+)?)\s*(million|thousand|hundred thousand)/gi;
  const verbalMatch = verbalRe.exec(all);
  if (verbalMatch) {
    const n = parseFloat(verbalMatch[1]);
    const unit = verbalMatch[2].toLowerCase();
    if (unit === 'million') return `$${n}M`;
    if (unit === 'thousand') return `$${Math.round(n)}k`;
    if (unit === 'hundred thousand') return `$${Math.round(n * 100)}k`;
  }

  return null;
}

// ── Timeline Extraction ────────────────────────────────────────────────────────

const URGENCY_WORDS = ['asap', 'as soon as possible', 'immediately', 'urgently', 'urgent', 'right away', 'right now'];
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const SEASONS = ['spring','summer','fall','autumn','winter'];

function extractTimeline(messages: ConversationMessage[]): string | null {
  // Evidence guard: only extract from inbound messages.
  const all = searchInbound(messages);
  if (!all) return null;

  // ASAP / urgency
  if (URGENCY_WORDS.some(w => all.includes(w))) return 'ASAP';

  // "in X months/weeks/days"
  const inXRe = /(?:in|within|around)\s+(\d+)\s+(day|week|month|year)s?/gi;
  const inXMatch = inXRe.exec(all);
  if (inXMatch) {
    const n = inXMatch[1];
    const unit = inXMatch[2];
    return `${n} ${unit}${parseInt(n) !== 1 ? 's' : ''}`;
  }

  // "by [month]" or "before [month]"
  const byMonthRe = new RegExp(`(?:by|before|around|end of)\\s+(?:the\\s+end\\s+of\\s+)?(?:next\\s+)?(${MONTHS.join('|')})`, 'gi');
  const byMonthMatch = byMonthRe.exec(all);
  if (byMonthMatch) {
    const month = byMonthMatch[1];
    return `By ${month.charAt(0).toUpperCase() + month.slice(1)}`;
  }

  // "this/next [season/year]"
  const seasonRe = new RegExp(`(?:this|next)\\s+(${SEASONS.join('|')}|year)`, 'gi');
  const seasonMatch = seasonRe.exec(all);
  if (seasonMatch) {
    const mod = all.includes('next') ? 'Next' : 'This';
    const unit = seasonMatch[1];
    return `${mod} ${unit.charAt(0).toUpperCase() + unit.slice(1)}`;
  }

  // "end of the year" / "this year"
  if (/(?:end of (?:the )?year|this year|by year.?end)/gi.test(all)) return 'End of year';

  // "next month"
  if (/next month/gi.test(all)) return 'Next month';

  // "a few months"
  if (/(?:a few|couple of|couple)\s+months/gi.test(all)) return 'A few months';

  return null;
}

// ── Financing Extraction ───────────────────────────────────────────────────────

function extractFinancing(messages: ConversationMessage[]): string | null {
  // Evidence guard: only extract from inbound messages.
  const all = searchInbound(messages);
  if (!all) return null;

  if (/pre.?approved|pre.?approval/gi.test(all)) return 'Pre-approved';
  if (/(?:paying|pay|all)\s+cash|cash\s+buyer|cash\s+purchase/gi.test(all)) return 'Cash buyer';
  if (/conventional\s+loan|conventional\s+mortgage/gi.test(all)) return 'Conventional';
  if (/fha\s+(?:loan|mortgage|financing)/gi.test(all)) return 'FHA loan';
  if (/va\s+(?:loan|mortgage|financing)/gi.test(all)) return 'VA loan';
  if (/(?:mortgage|financing|loan)/gi.test(all)) {
    // Check if they're saying they need to get it vs already have it
    if (/need to|haven.?t|still|working on|looking into|exploring/gi.test(all)) return 'Exploring';
    return 'Mortgage';
  }
  if (/down\s+payment/gi.test(all)) return 'Has down payment';

  return null;
}

// ── Intent Extraction ──────────────────────────────────────────────────────────

function extractIntent(messages: ConversationMessage[], opts?: { isRealEstate?: boolean }): string {
  // Evidence guard: only infer intent from lead's own words.
  const src = searchInbound(messages);
  if (!src) return 'Browsing';

  // Universal CRM default: do not apply real-estate intent taxonomy unless explicitly enabled.
  if (!opts?.isRealEstate) return 'Inquiry';

  // Investor check first — explicit investment intent only
  if (/\b(?:investor|invest(?:ing|ment)|multi.?family|multifamily|rental\s+income|cap\s+rate|roi\b|cash\s+flow|property\s+management|income.?producing|income\s+property|investment\s+prop)/gi.test(src))
    return 'Investor';

  // Seller — requires possessive or explicit intent to sell/list THEIR property
  // Does NOT match "your listing", "the listing", "I saw a listing" (those are buyer inquiries)
  if (/(?:sell(?:ing)?\s+(?:my|our|the)\s+(?:home|house|property|condo|apartment|place)|want\s+to\s+(?:sell|list)\s+(?:my|our)|thinking\s+of\s+(?:selling|listing)|need\s+(?:help\s+)?(?:to\s+)?(?:sell|list)\s+(?:my|our)|listing\s+(?:my|our)\s+(?:home|house|property)|put(?:ting)?\s+(?:my|our|the)\s+(?:home|house|property)\s+(?:on|up))/gi.test(src))
    return 'Seller';

  // Renter
  if (/(?:looking\s+to\s+rent|want\s+to\s+rent|need\s+to\s+rent|renting|for\s+rent|rental\s+(?:unit|apartment|home|house)|lease\s+a)/gi.test(src))
    return 'Renter';

  // Buyer (most common)
  if (/(?:buy(?:ing)?\s+a|looking\s+to\s+buy|want\s+to\s+(?:buy|own|purchase)|purchas(?:e|ing)\s+a|first.?time\s+(?:home|buyer)|forever\s+home|new\s+home)/gi.test(src))
    return 'Buyer';

  // Listing inquiry / generic interest → Browsing (NOT Seller)
  // "I saw your listing", "Is it still available", "interested in the condo" etc.
  if (/interested\s+in|looking\s+(?:at|for)|considering|exploring|saw\s+(?:your|the)\s+listing|is\s+it\s+still|still\s+available|available\s+for/gi.test(src))
    return 'Browsing';

  return 'Browsing';
}

// ── Urgency Detection ──────────────────────────────────────────────────────────

function detectUrgency(messages: ConversationMessage[]): boolean {
  const all = searchAll(messages);
  return URGENCY_WORDS.some(w => all.includes(w))
    || /urgent|immediately|right away|can.?t wait|need to move|have to move|relocating\s+(?:soon|now)/gi.test(all);
}

// ── Lead Score ─────────────────────────────────────────────────────────────────

function computeLeadScore(
  hasBudget: boolean,
  hasTimeline: boolean,
  hasFinancing: boolean,
  isUrgent: boolean,
  messageCount: number,
  inboundCount: number,
): LeadScore {
  const signals = [hasBudget, hasTimeline, hasFinancing].filter(Boolean).length;
  const engagementHigh = messageCount >= 8 || inboundCount >= 4;
  const engagementMed  = messageCount >= 4 || inboundCount >= 2;

  if (signals === 3 || (signals >= 2 && isUrgent) || (signals >= 2 && engagementHigh)) {
    return { label: 'Hot', color: 'text-red-600', dot: 'bg-red-500', confidence: 85 + signals * 5 };
  }

  if (signals >= 1 || (engagementMed && signals === 0 && !isUrgent)) {
    return { label: 'Warm', color: 'text-amber-600', dot: 'bg-amber-400', confidence: 50 + signals * 15 };
  }

  return { label: 'Cold', color: 'text-blue-500', dot: 'bg-blue-400', confidence: 20 };
}

// ── AI State ───────────────────────────────────────────────────────────────────

function computeAiState(
  hasBudget: boolean,
  hasTimeline: boolean,
  hasFinancing: boolean,
  messageCount: number,
  lastDirection: 'inbound' | 'outbound' | null,
  isUrgent: boolean,
): CopilotIntelligence['aiState'] {
  if (messageCount === 0) return 'Stalled';

  const qualCount = [hasBudget, hasTimeline, hasFinancing].filter(Boolean).length;

  // Ready: all critical fields captured (budget + timeline is enough to move forward)
  if (hasBudget && hasTimeline) return 'Ready';

  // Waiting: agent/AI sent the last message, lead hasn't replied
  if (lastDirection === 'outbound' && messageCount >= 2) return 'Waiting';

  // Engaging: conversation just started
  if (messageCount <= 3) return 'Engaging';

  // Qualifying: active conversation, collecting info
  return 'Qualifying';
}

// ── Main Entry Point ───────────────────────────────────────────────────────────

export function analyzeConversation(
  messages: ConversationMessage[],
  opts?: { industry?: string; isRealEstate?: boolean }
): CopilotIntelligence {
  if (!messages || messages.length === 0) {
    return {
      budget: null, timeline: null, financing: null, intent: 'Browsing',
      hasBudget: false, hasTimeline: false, hasFinancing: false,
      leadScore: { label: 'Cold', color: 'text-blue-500', dot: 'bg-blue-400', confidence: 20 },
      aiState: 'Stalled',
      signalCount: 0, isUrgent: false, messageCount: 0, lastDirection: null,
    };
  }

  const industry = (opts?.industry || '').toLowerCase();
  const isRealEstate =
    opts?.isRealEstate ??
    (
      industry.includes('real estate') ||
      industry.includes('realestate') ||
      industry.includes('property') ||
      industry.includes('realtor') ||
      industry === 'real_estate'
    );

  const budget    = extractBudget(messages);
  const timeline  = extractTimeline(messages);
  const financing = extractFinancing(messages);
  const intent    = extractIntent(messages, { isRealEstate });
  const isUrgent  = detectUrgency(messages);

  const hasBudget    = budget    !== null;
  const hasTimeline  = timeline  !== null;
  const hasFinancing = financing !== null;

  const messageCount  = messages.length;
  const inboundCount  = messages.filter(m => m.direction === 'inbound').length;
  const lastDirection = messages.length > 0 ? messages[messages.length - 1].direction : null;
  const signalCount   = [hasBudget, hasTimeline, hasFinancing].filter(Boolean).length;

  const leadScore = computeLeadScore(hasBudget, hasTimeline, hasFinancing, isUrgent, messageCount, inboundCount);
  const aiState   = computeAiState(hasBudget, hasTimeline, hasFinancing, messageCount, lastDirection, isUrgent);

  return {
    budget, timeline, financing, intent,
    hasBudget, hasTimeline, hasFinancing,
    leadScore, aiState,
    signalCount, isUrgent, messageCount, lastDirection,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// WORKFLOW LAYER — Triggered actions, suggestions, soft automations
// ══════════════════════════════════════════════════════════════════════════════

export type WorkflowActionType =
  | 'assign'   // Assign an agent to this lead
  | 'book'     // Book an appointment / viewing
  | 'follow'   // Schedule follow-up reminder
  | 'qualify'  // Ask next qualifying question
  | 'nurture'  // Continue low-touch nurturing
  | 'tag'      // Apply a tag
  | 'stage';   // Move to next pipeline stage

export interface WorkflowAction {
  type: WorkflowActionType;
  label: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  value?: string; // payload (e.g. tag name, stage name, question text)
}

export interface WorkflowResult {
  actions: WorkflowAction[];     // Priority-sorted recommended actions
  tagSuggestion: string | null;  // Tag to suggest
  tagAutoApply: boolean;         // true = apply immediately (strong signal + neutral current tag)
  stageSuggestion: string | null;
  nextQuestion: string | null;   // Best qualifying question to ask next
  followUpDue: boolean;          // Outbound last + no follow-up set
}

const STAGES = ['Lead', 'Contacted', 'Proposal', 'Negotiation', 'Closed'];

// Intent → best matching tag
const INTENT_TAG_MAP: Record<string, string> = {
  Investor: 'Investor',
  Buyer:    'Warm Lead',
  Seller:   'Quoted',
  Renter:   'Customer',
};

// Tags considered "neutral" (not yet meaningfully classified by a human)
const NEUTRAL_TAGS = new Set(['New', '', 'new']);

export function computeWorkflow(
  intel: CopilotIntelligence,
  contact: {
    tag: string;
    pipelineStage: string;
    followUpDate?: string | null;
    assignedTo?: string | null;
  },
  qualifyingCriteria?: QualifyingCriterion[], // Business-defined custom qualification layers
  answeredCriteriaKeys?: Set<string>,          // Which criteria the agent has already asked/answered
): WorkflowResult {
  const actions: WorkflowAction[] = [];

  // ── 1. Lead scoring actions ──────────────────────────────────────────────
  if (intel.leadScore.label === 'Hot') {
    if (!contact.assignedTo) {
      actions.push({
        type: 'assign',
        label: 'Assign agent',
        priority: 'high',
        reason: 'Hot lead — needs immediate personal attention',
      });
    }
    if (intel.hasTimeline || intel.aiState === 'Ready') {
      actions.push({
        type: 'book',
        label: 'Book appointment',
        priority: 'high',
        reason: 'Lead is qualified and timeline is known — schedule a viewing',
      });
    }
  } else if (intel.leadScore.label === 'Warm') {
    actions.push({
      type: 'follow',
      label: 'Schedule follow-up',
      priority: 'medium',
      reason: 'Warm lead — continue qualification with a timely follow-up',
    });
  } else {
    actions.push({
      type: 'nurture',
      label: 'Continue nurturing',
      priority: 'low',
      reason: 'Cold lead — keep warm with periodic value-add check-ins',
    });
  }

  // ── 2. Qualification triggers — next missing field ───────────────────────
  let nextQuestion: string | null = null;

  // Only suggest qualification questions once there is enough conversational context.
  // A single opening message ("test", "hi", etc.) gives no signal — don't interrogate.
  // Require at least 2 messages exchanged before asking qualifying questions.
  if (intel.messageCount >= 2) {
    const answered = answeredCriteriaKeys ?? new Set<string>();

    if (qualifyingCriteria && qualifyingCriteria.length > 0) {
      // ── Business-defined qualification criteria ──
      // Find the first criterion the agent hasn't answered/completed yet.
      const nextCriterion = qualifyingCriteria.find(c => !answered.has(c.key));
      if (nextCriterion) {
        nextQuestion = nextCriterion.question;
        const remaining = qualifyingCriteria.filter(c => !answered.has(c.key));
        actions.push({
          type: 'qualify',
          label: nextCriterion.label,
          priority: answered.size === 0 ? 'medium' : 'medium',
          reason: `${remaining.length} qualification${remaining.length !== 1 ? 's' : ''} remaining`,
          value: nextCriterion.question,
        });
      }
    }
  }

  // ── 3. Follow-up trigger ─────────────────────────────────────────────────
  const followUpDue =
    intel.lastDirection === 'outbound' &&
    !contact.followUpDate &&
    intel.messageCount >= 2;

  if (followUpDue) {
    actions.push({
      type: 'follow',
      label: 'Set follow-up reminder',
      priority: 'medium',
      reason: "You sent the last message — remind yourself to follow up if they don't reply",
    });
  }

  // ── 4. Tag suggestion ────────────────────────────────────────────────────
  let tagSuggestion: string | null = null;
  let tagAutoApply = false;
  const isNeutralTag = NEUTRAL_TAGS.has(contact.tag || '');

  // Hot lead overrides to Hot Lead tag
  if (intel.leadScore.label === 'Hot' && contact.tag !== 'Hot Lead') {
    tagSuggestion = 'Hot Lead';
    tagAutoApply = isNeutralTag || contact.tag === 'Warm Lead';
  } else if (intel.intent !== 'Browsing') {
    const suggestedByIntent = INTENT_TAG_MAP[intel.intent];
    if (suggestedByIntent && contact.tag !== suggestedByIntent) {
      tagSuggestion = suggestedByIntent;
      // Auto-apply for Investor (high specificity) and neutral current tags
      tagAutoApply = (intel.intent === 'Investor' && isNeutralTag) ||
                     (intel.intent !== 'Investor' && isNeutralTag);
    }
  }

  // ── 5. Stage suggestion ──────────────────────────────────────────────────
  let stageSuggestion: string | null = null;
  const currentStageIdx = STAGES.indexOf(contact.pipelineStage);

  if (intel.aiState === 'Engaging' && currentStageIdx <= 0) {
    stageSuggestion = 'Contacted';
  } else if (intel.aiState === 'Ready' && currentStageIdx <= 1) {
    stageSuggestion = 'Proposal';
  } else if (intel.leadScore.label === 'Hot' && intel.aiState === 'Qualifying' && currentStageIdx <= 1) {
    stageSuggestion = 'Proposal';
  } else if (intel.signalCount >= 2 && currentStageIdx === 0) {
    stageSuggestion = 'Contacted';
  }

  // Sort actions: high → medium → low, deduplicate follow types
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Deduplicate: keep highest-priority of each type
  const seen = new Set<WorkflowActionType>();
  const dedupedActions = actions.filter(a => {
    if (seen.has(a.type)) return false;
    seen.add(a.type);
    return true;
  });

  return {
    actions: dedupedActions,
    tagSuggestion,
    tagAutoApply,
    stageSuggestion,
    nextQuestion,
    followUpDue,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AI MEMORY SUMMARY — natural-language synthesis from intel + raw messages
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Scans inbound messages for property/topic clues to enrich the summary.
 * Returns a short descriptor like "a 3-bedroom condo downtown" or null.
 */
function extractPropertyHint(messages: ConversationMessage[]): string | null {
  const inbound = messages
    .filter(m => m.direction === 'inbound')
    .map(m => m.content)
    .join(' ');
  if (!inbound) return null;

  // Bedroom count
  const bedroomMatch = /(\d+)\s*(?:br|bed(?:room)?s?)/i.exec(inbound);
  const bedrooms = bedroomMatch ? `${bedroomMatch[1]}-bedroom ` : '';

  // Property type
  let propType = '';
  if (/multi.?family|multifamily/i.test(inbound))  propType = 'multi-family properties';
  else if (/condo(?:minium)?/i.test(inbound))       propType = `${bedrooms}condo`;
  else if (/townhous|townhome/i.test(inbound))      propType = `${bedrooms}townhouse`;
  else if (/apartment|apt\b/i.test(inbound))        propType = `${bedrooms}apartment`;
  else if (/house|home|property/i.test(inbound))    propType = `${bedrooms}home`;
  else if (bedrooms)                                propType = `${bedrooms}property`;

  // Location hint
  const locationMatch = /\bin\s+(downtown|uptown|midtown|the\s+\w+\s+area|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/.exec(inbound);
  const location = locationMatch ? ` in ${locationMatch[1]}` : '';

  return propType ? `${propType}${location}` : null;
}

/**
 * Scans the first inbound message for a listing inquiry clue.
 * Returns a short phrase like "the downtown condo listing" or null.
 */
function extractListingHint(messages: ConversationMessage[]): string | null {
  const firstInbound = messages.find(m => m.direction === 'inbound')?.content || '';
  if (!firstInbound) return null;

  // "I saw your listing for X" / "the downtown condo" / "the property at Y"
  const listingMatch = /(?:your|the)\s+listing\s+(?:for\s+)?(.{5,40}?)(?:\.|,|\?|$)/i.exec(firstInbound);
  if (listingMatch) return `the ${listingMatch[1].trim()} listing`;

  // "the [property/condo/house] at/on/in [place]"
  const propRef = /(?:the\s+)?(\w+(?:\s+\w+){0,3})\s+(?:at|on|in)\s+([^.?,]{4,30})/i.exec(firstInbound);
  if (propRef) return `the ${propRef[0].trim()}`;

  return null;
}

/**
 * Builds a natural-language AI Memory summary from intel signals and raw messages.
 * Never returns label strings like "Interested in Investor."
 */
export function buildAIMemorySummary(
  intel: CopilotIntelligence,
  messages: ConversationMessage[],
  opts?: { industry?: string; isRealEstate?: boolean }
): string {
  if (!messages || messages.length === 0) return '';

  const parts: string[] = [];
  const industry = (opts?.industry || '').toLowerCase();
  const isRealEstate =
    opts?.isRealEstate ??
    (
      industry.includes('real estate') ||
      industry.includes('realestate') ||
      industry.includes('property') ||
      industry.includes('realtor') ||
      industry === 'real_estate'
    );

  const propHint    = isRealEstate ? extractPropertyHint(messages) : null;
  const listingHint = isRealEstate ? extractListingHint(messages) : null;

  // ── Intent-aware opening sentence ─────────────────────────────────────────
  if (isRealEstate && intel.intent === 'Investor') {
    const target = propHint || 'investment properties';
    parts.push(`Investor looking for ${target}.`);
  } else if (isRealEstate && intel.intent === 'Seller') {
    parts.push('Looking to sell their property.');
  } else if (isRealEstate && intel.intent === 'Renter') {
    const target = propHint || 'a rental property';
    parts.push(`Looking to rent ${target}.`);
  } else if (isRealEstate && intel.intent === 'Buyer') {
    const target = propHint || 'a property';
    parts.push(`Looking to buy ${target}.`);
  } else {
    // Generic / unknown — keep neutral; only add property hints for real estate contexts.
    if (listingHint) {
      parts.push(`Inquired about ${listingHint}.`);
    } else if (propHint) {
      parts.push(`Interested in ${propHint}.`);
    }
    // If we have no property clue, let budget/timeline speak first
  }

  // ── Qualification signals as natural additions ─────────────────────────────
  if (intel.budget)    parts.push(`Budget around ${intel.budget}.`);
  if (intel.timeline)  parts.push(`Timeline: ${intel.timeline}.`);
  if (intel.financing) parts.push(`${intel.financing} financing.`);

  // ── Fallback: nothing at all to show ─────────────────────────────────────
  return parts.join(' ');
}

// ══════════════════════════════════════════════════════════════════════════════
// VERIFICATION UTILITY — proves extraction + workflow against test conversations
// ══════════════════════════════════════════════════════════════════════════════

export interface VerificationCase {
  name: string;
  messages: ConversationMessage[];
  contact: { tag: string; pipelineStage: string; followUpDate?: string | null; assignedTo?: string | null };
  expected: {
    budget?: string | null;
    timeline?: string | null;
    financing?: string | null;
    intent?: string;
    score?: string;
    aiState?: string;
    tagSuggestion?: string | null;
    stageSuggestion?: string | null;
  };
}

export const VERIFICATION_CASES: VerificationCase[] = [
  {
    name: 'Hot Buyer — Full Qualification',
    messages: [
      { direction: 'inbound',  content: "Hi! I'm looking to buy a home ASAP. My budget is around $550k-$600k." },
      { direction: 'outbound', content: "Great! Do you have a preferred timeline?" },
      { direction: 'inbound',  content: "I need to move within 2 months, already pre-approved for a mortgage." },
      { direction: 'outbound', content: "Perfect! Would you like to schedule a viewing?" },
      { direction: 'inbound',  content: "Yes! Interested in a 3BR in downtown." },
    ],
    contact: { tag: 'New', pipelineStage: 'Lead' },
    expected: {
      budget: '$550k-$600k',
      timeline: '2 months',
      financing: 'Pre-approved',
      intent: 'Buyer',
      score: 'Hot',
      aiState: 'Ready',
      tagSuggestion: 'Hot Lead',
      stageSuggestion: 'Proposal',
    },
  },
  {
    name: 'Investor — Auto Tag',
    messages: [
      { direction: 'inbound',  content: "I'm looking for investment properties with good ROI and rental income." },
      { direction: 'outbound', content: "What's your target budget for the investment?" },
      { direction: 'inbound',  content: "Around $800k for a multi-unit property. Cash purchase." },
    ],
    contact: { tag: 'New', pipelineStage: 'Lead' },
    expected: {
      budget: '$800k',
      financing: 'Cash buyer',
      intent: 'Investor',
      score: 'Hot',
      tagSuggestion: 'Investor',
      stageSuggestion: 'Contacted',
    },
  },
  {
    name: 'Cold Lead — Browsing, No Signals',
    messages: [
      { direction: 'inbound',  content: "Hi, just browsing. What areas do you cover?" },
      { direction: 'outbound', content: "We cover all of downtown and the suburbs. Are you looking to buy?" },
    ],
    contact: { tag: 'New', pipelineStage: 'Lead' },
    expected: {
      budget: null,
      timeline: null,
      financing: null,
      score: 'Cold',
      aiState: 'Waiting',
      stageSuggestion: null,
    },
  },
  {
    name: 'Warm Lead — Missing Financing',
    messages: [
      { direction: 'inbound',  content: "Looking to buy a home by summer. Budget is $450k." },
      { direction: 'outbound', content: "Great! Have you looked into financing?" },
      { direction: 'inbound',  content: "Not yet, still exploring options." },
    ],
    contact: { tag: 'Warm Lead', pipelineStage: 'Contacted' },
    expected: {
      budget: '$450k',
      timeline: 'This Summer',
      financing: 'Exploring',
      intent: 'Buyer',
      score: 'Warm',
      aiState: 'Qualifying',
    },
  },
  {
    name: 'Follow-up Due — Last Message Outbound',
    messages: [
      { direction: 'inbound',  content: "I'm interested in properties in the $500k range." },
      { direction: 'outbound', content: "I'll send you some listings. Let me know what you think!" },
    ],
    contact: { tag: 'Warm Lead', pipelineStage: 'Contacted', followUpDate: null },
    expected: {
      score: 'Warm',
      aiState: 'Waiting',
    },
  },
];

export function runVerification(): void {
  console.group('🤖 Copilot Intelligence Verification');
  for (const tc of VERIFICATION_CASES) {
    const intel    = analyzeConversation(tc.messages, { isRealEstate: true });
    const workflow = computeWorkflow(intel, tc.contact);
    const pass = (
      (tc.expected.score     == null || intel.leadScore.label === tc.expected.score) &&
      (tc.expected.aiState   == null || intel.aiState         === tc.expected.aiState) &&
      (tc.expected.intent    == null || intel.intent          === tc.expected.intent) &&
      (tc.expected.budget    === undefined || intel.budget    === tc.expected.budget) &&
      (tc.expected.timeline  === undefined || intel.timeline?.toLowerCase().includes(tc.expected.timeline?.toLowerCase() ?? '') !== false) &&
      (tc.expected.financing === undefined || intel.financing === tc.expected.financing)
    );
    console.groupCollapsed(`${pass ? '✅' : '❌'} ${tc.name}`);
    console.table({
      Budget:    { extracted: intel.budget,           expected: tc.expected.budget },
      Timeline:  { extracted: intel.timeline,         expected: tc.expected.timeline },
      Financing: { extracted: intel.financing,        expected: tc.expected.financing },
      Intent:    { extracted: intel.intent,           expected: tc.expected.intent },
      Score:     { extracted: intel.leadScore.label,  expected: tc.expected.score },
      AIState:   { extracted: intel.aiState,          expected: tc.expected.aiState },
    });
    console.log('Workflow:', {
      topAction:      workflow.actions[0]?.label,
      tagSuggestion:  workflow.tagSuggestion,
      tagAutoApply:   workflow.tagAutoApply,
      stageSuggestion: workflow.stageSuggestion,
      nextQuestion:   workflow.nextQuestion,
      followUpDue:    workflow.followUpDue,
    });
    console.groupEnd();
  }
  console.groupEnd();
}
