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
  const all = searchAll(messages);

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
  const all = searchAll(messages);

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
  const all = searchAll(messages);

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

function extractIntent(messages: ConversationMessage[]): string {
  // Primarily from inbound messages (lead's own words)
  const inbound = searchInbound(messages);
  const all     = searchAll(messages);
  const src     = inbound || all;

  // Investor check first (specific)
  if (/invest(?:ment|or|ing)?|rental\s+income|cap\s+rate|roi|cash\s+flow|property\s+management/gi.test(src))
    return 'Investor';

  // Seller
  if (/(?:sell(?:ing)?|list(?:ing)?|put(?:ting)?\s+(?:my|our|the)\s+(?:home|house|property)|selling my)/gi.test(src))
    return 'Seller';

  // Renter
  if (/(?:rent(?:ing|al)?|looking\s+to\s+rent|want\s+to\s+rent|lease)/gi.test(src))
    return 'Renter';

  // Buyer (most common)
  if (/(?:buy(?:ing)?|purchas(?:e|ing)|looking\s+to\s+buy|want\s+to\s+(?:buy|own)|first\s+(?:home|time)|forever\s+home)/gi.test(src))
    return 'Buyer';

  // Generic interest
  if (/interested\s+in|looking\s+(?:at|for)|considering|exploring/gi.test(src))
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

export function analyzeConversation(messages: ConversationMessage[]): CopilotIntelligence {
  if (!messages || messages.length === 0) {
    return {
      budget: null, timeline: null, financing: null, intent: 'Browsing',
      hasBudget: false, hasTimeline: false, hasFinancing: false,
      leadScore: { label: 'Cold', color: 'text-blue-500', dot: 'bg-blue-400', confidence: 20 },
      aiState: 'Stalled',
      signalCount: 0, isUrgent: false, messageCount: 0, lastDirection: null,
    };
  }

  const budget    = extractBudget(messages);
  const timeline  = extractTimeline(messages);
  const financing = extractFinancing(messages);
  const intent    = extractIntent(messages);
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
