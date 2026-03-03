export interface ScoringSignal {
  key: string;
  label: string;
  scoreChange: number;
  keywords: string[];
}

export const HIGH_INTENT_SIGNALS: ScoringSignal[] = [
  { key: "BOOKING_INTENT", label: "Booking Intent", scoreChange: 35, keywords: ["tour", "showing", "visit", "call", "appointment", "schedule"] },
  { key: "READY_TO_BUY", label: "Ready to Buy", scoreChange: 35, keywords: ["offer", "contract", "ready to buy", "close", "asap"] },
  { key: "BUDGET_AND_TIMELINE_CONFIRMED", label: "Budget + Timeline Confirmed", scoreChange: 40, keywords: ["budget", "timeline", "move in", "closing date", "within 30 days", "this month", "next month"] },
  { key: "PREAPPROVED_OR_CASH", label: "Pre-approved / Cash", scoreChange: 30, keywords: ["pre-approved", "preapproved", "pre approved", "cash buyer", "cash offer", "no mortgage"] },
];

export const MEDIUM_INTENT_SIGNALS: ScoringSignal[] = [
  { key: "PRICE_QUESTION", label: "Price Question", scoreChange: 20, keywords: ["price", "how much", "cost", "rent", "asking price", "listed at"] },
  { key: "AVAILABILITY_QUESTION", label: "Availability Question", scoreChange: 15, keywords: ["available", "still available", "when available", "is it taken", "on the market"] },
  { key: "LOCATION_NEIGHBORHOOD", label: "Location / Neighborhood", scoreChange: 15, keywords: ["area", "neighborhood", "schools", "commute", "nearby", "district", "zone"] },
  { key: "PROPERTY_DETAILS", label: "Property Details", scoreChange: 15, keywords: ["bed", "bath", "sqft", "square feet", "hoa", "pets", "parking", "garage", "pool", "balcony"] },
  { key: "FINANCING_QUESTION", label: "Financing Question", scoreChange: 20, keywords: ["mortgage", "loan", "down payment", "rates", "financing", "interest rate", "fha", "va loan"] },
];

export const LOW_INTENT_SIGNALS: ScoringSignal[] = [
  { key: "REQUEST_INFO", label: "Request Info", scoreChange: 10, keywords: ["send info", "more details", "brochure", "flyer", "send me", "details please"] },
  { key: "GENERIC_INTEREST", label: "Generic Interest", scoreChange: 5, keywords: ["interested", "tell me more", "looks nice", "looks good", "curious"] },
  { key: "FIRST_MESSAGE_ONLY", label: "First Message", scoreChange: 5, keywords: ["hi", "hello", "hey", "good morning", "good afternoon"] },
];

export const NEGATIVE_SIGNALS: ScoringSignal[] = [
  { key: "NOT_INTERESTED", label: "Not Interested", scoreChange: -50, keywords: ["not interested", "no longer looking", "changed my mind", "found something", "already bought", "already rented"] },
  { key: "STOP_DNC", label: "Stop / DNC", scoreChange: -100, keywords: ["stop", "unsubscribe", "don't message", "do not contact", "remove me", "opt out"] },
  { key: "SPAM_PATTERN", label: "Spam", scoreChange: -100, keywords: ["crypto", "bitcoin", "forex", "adult", "scam", "lottery", "won", "congratulations you", "click here to win"] },
];

export const ALL_SIGNALS: ScoringSignal[] = [
  ...HIGH_INTENT_SIGNALS,
  ...MEDIUM_INTENT_SIGNALS,
  ...LOW_INTENT_SIGNALS,
  ...NEGATIVE_SIGNALS,
];

export const SCORE_THRESHOLDS = {
  hot: { min: 80, label: "Qualified (Hot)", tag: "Hot", pipeline: "Qualified (Hot)" },
  warm: { min: 50, label: "Qualified (Warm)", tag: "Warm", pipeline: "Qualified (Warm)" },
  new: { min: 20, label: "New Lead", tag: "New", pipeline: "New Lead" },
  low: { min: 1, label: "Low Intent", tag: "Low Intent", pipeline: "New Lead" },
  unqualified: { min: -Infinity, label: "Unqualified", tag: "Unqualified", pipeline: "Unqualified" },
} as const;

const MAX_POSITIVE_POINTS_PER_MESSAGE = 60;

export function classifyScore(score: number): { tier: string; tag: string; pipeline: string } {
  if (score >= SCORE_THRESHOLDS.hot.min) return { tier: "hot", tag: SCORE_THRESHOLDS.hot.tag, pipeline: SCORE_THRESHOLDS.hot.pipeline };
  if (score >= SCORE_THRESHOLDS.warm.min) return { tier: "warm", tag: SCORE_THRESHOLDS.warm.tag, pipeline: SCORE_THRESHOLDS.warm.pipeline };
  if (score >= SCORE_THRESHOLDS.new.min) return { tier: "new", tag: SCORE_THRESHOLDS.new.tag, pipeline: SCORE_THRESHOLDS.new.pipeline };
  if (score >= SCORE_THRESHOLDS.low.min) return { tier: "low", tag: SCORE_THRESHOLDS.low.tag, pipeline: SCORE_THRESHOLDS.low.pipeline };
  return { tier: "unqualified", tag: SCORE_THRESHOLDS.unqualified.tag, pipeline: SCORE_THRESHOLDS.unqualified.pipeline };
}

export function applyDecay(currentScore: number, lastMessageAt: Date | null, now: Date = new Date()): number {
  if (!lastMessageAt || currentScore <= 0) return currentScore;

  const diffMs = now.getTime() - lastMessageAt.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays >= 30) {
    return Math.round(currentScore * 0.70);
  } else if (diffDays >= 14) {
    return Math.round(currentScore * 0.85);
  }
  return currentScore;
}

export interface ScoreResult {
  newScore: number;
  matchedSignals: string[];
  reasons: string[];
  forceUnqualified: boolean;
  isDNC: boolean;
}

export function scoreMessage(
  message: string,
  currentScore: number,
  lastMessageAt: Date | null
): ScoreResult {
  const messageLower = message.toLowerCase();
  const matchedSignals: string[] = [];
  const reasons: string[] = [];
  let positivePoints = 0;
  let negativePoints = 0;
  let forceUnqualified = false;
  let isDNC = false;

  let decayedScore = applyDecay(currentScore, lastMessageAt);

  for (const signal of ALL_SIGNALS) {
    const matched = signal.keywords.some(kw => messageLower.includes(kw.toLowerCase()));
    if (!matched) continue;

    matchedSignals.push(signal.key);
    reasons.push(`${signal.key}:${signal.scoreChange > 0 ? '+' : ''}${signal.scoreChange}`);

    if (signal.scoreChange > 0) {
      positivePoints += signal.scoreChange;
    } else {
      negativePoints += signal.scoreChange;
    }

    if (signal.key === "STOP_DNC") {
      forceUnqualified = true;
      isDNC = true;
    }
    if (signal.key === "SPAM_PATTERN") {
      forceUnqualified = true;
    }
  }

  const cappedPositive = Math.min(positivePoints, MAX_POSITIVE_POINTS_PER_MESSAGE);
  let newScore = decayedScore + cappedPositive + negativePoints;

  if (forceUnqualified) {
    newScore = 0;
  }

  newScore = Math.max(0, Math.min(100, newScore));

  return {
    newScore: Math.round(newScore),
    matchedSignals,
    reasons,
    forceUnqualified,
    isDNC,
  };
}
