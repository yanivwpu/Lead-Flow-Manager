/**
 * Server-controlled multi-turn Website Chat journeys.
 * Distinct from one-shot pageAction provenance: a journey may continue after
 * the originating inbound, but it is never treated as current-turn click trust.
 */

export const WEBCHAT_ACTIVE_JOURNEY_SOURCE = "server_active_journey" as const;
export const WEBCHAT_SAVINGS_JOURNEY_KIND = "pricing_savings" as const;
export const WEBCHAT_COMPARE_JOURNEY_KIND = "pricing_compare" as const;
export const WEBCHAT_ACTIVE_JOURNEY_TTL_MS = 24 * 60 * 60 * 1000;

export type WebchatActiveJourneyKind =
  | typeof WEBCHAT_SAVINGS_JOURNEY_KIND
  | typeof WEBCHAT_COMPARE_JOURNEY_KIND;

export type WebchatActiveJourneyStatus =
  | "collecting"
  | "ready_to_calculate"
  | "completed"
  | "paused"
  | "expired";

export type WebchatSavingsCollected = {
  platform?: string;
  monthlyCost?: number;
  currency?: string;
  teamSize?: number;
  monthlyVolume?: number;
};

export type WebchatActiveJourney = {
  source: typeof WEBCHAT_ACTIVE_JOURNEY_SOURCE;
  kind: WebchatActiveJourneyKind;
  status: WebchatActiveJourneyStatus;
  userId: string;
  visitorId: string;
  conversationId: string;
  ruleKey: string;
  actionIndex: number;
  originInboundId: string;
  lastProcessedInboundId: string;
  locale?: string;
  collected: WebchatSavingsCollected;
  missing: string[];
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type CurrentTurnJourney = {
  trusted: boolean;
  continuation: boolean;
  kind?: WebchatActiveJourneyKind;
  status?: WebchatActiveJourneyStatus;
  originInboundId?: string;
  lastProcessedInboundId?: string;
  ruleKey?: string;
  actionIndex?: number;
  collectedFields: string[];
  missingFields: string[];
  collected: WebchatSavingsCollected;
};

const MAX_ID = 80;
const MAX_RULE = 220;

function clipId(value: unknown): string {
  return String(value || "").trim().slice(0, MAX_ID);
}

export function savingsMissingFields(collected: WebchatSavingsCollected): string[] {
  const missing: string[] = [];
  if (!String(collected.platform || "").trim()) missing.push("platform");
  if (!(typeof collected.monthlyCost === "number" && Number.isFinite(collected.monthlyCost) && collected.monthlyCost > 0)) {
    missing.push("monthlyCost");
  }
  if (!String(collected.currency || "").trim()) missing.push("currency");
  return missing;
}

export function collectedFieldNames(collected: WebchatSavingsCollected): string[] {
  const names: string[] = [];
  if (collected.platform) names.push("platform");
  if (typeof collected.monthlyCost === "number") names.push("monthlyCost");
  if (collected.currency) names.push("currency");
  if (typeof collected.teamSize === "number") names.push("teamSize");
  if (typeof collected.monthlyVolume === "number") names.push("monthlyVolume");
  return names;
}

function baseJourney(input: {
  kind: WebchatActiveJourneyKind;
  userId: string;
  visitorId: string;
  conversationId: string;
  ruleKey: string;
  actionIndex: number;
  originInboundId: string;
  locale?: string | null;
  now?: Date;
  collected: WebchatSavingsCollected;
  missing: string[];
}): WebchatActiveJourney {
  const now = input.now || new Date();
  const iso = now.toISOString();
  return {
    source: WEBCHAT_ACTIVE_JOURNEY_SOURCE,
    kind: input.kind,
    status: "collecting",
    userId: clipId(input.userId),
    visitorId: clipId(input.visitorId),
    conversationId: clipId(input.conversationId),
    ruleKey: String(input.ruleKey || "").trim().slice(0, MAX_RULE),
    actionIndex: input.actionIndex,
    originInboundId: clipId(input.originInboundId),
    lastProcessedInboundId: clipId(input.originInboundId),
    locale: input.locale ? String(input.locale).slice(0, 8) : undefined,
    collected: input.collected,
    missing: input.missing,
    startedAt: iso,
    updatedAt: iso,
    expiresAt: new Date(now.getTime() + WEBCHAT_ACTIVE_JOURNEY_TTL_MS).toISOString(),
  };
}

export function startPricingSavingsJourney(input: {
  userId: string;
  visitorId: string;
  conversationId: string;
  ruleKey: string;
  actionIndex: number;
  originInboundId: string;
  locale?: string | null;
  now?: Date;
}): WebchatActiveJourney {
  return baseJourney({
    ...input,
    kind: WEBCHAT_SAVINGS_JOURNEY_KIND,
    collected: {},
    missing: savingsMissingFields({}),
  });
}

export function startPricingCompareJourney(input: {
  userId: string;
  visitorId: string;
  conversationId: string;
  ruleKey: string;
  actionIndex: number;
  originInboundId: string;
  locale?: string | null;
  now?: Date;
}): WebchatActiveJourney {
  return baseJourney({
    ...input,
    kind: WEBCHAT_COMPARE_JOURNEY_KIND,
    collected: {},
    missing: [],
  });
}

export function readActiveJourney(raw: unknown): WebchatActiveJourney | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.source !== WEBCHAT_ACTIVE_JOURNEY_SOURCE) return null;
  if (o.kind !== WEBCHAT_SAVINGS_JOURNEY_KIND && o.kind !== WEBCHAT_COMPARE_JOURNEY_KIND) return null;
  const status = o.status;
  if (
    status !== "collecting" &&
    status !== "ready_to_calculate" &&
    status !== "completed" &&
    status !== "paused" &&
    status !== "expired"
  ) {
    return null;
  }
  const collectedRaw = o.collected && typeof o.collected === "object" ? (o.collected as Record<string, unknown>) : {};
  const collected: WebchatSavingsCollected = {};
  if (o.kind === WEBCHAT_SAVINGS_JOURNEY_KIND) {
    if (typeof collectedRaw.platform === "string" && collectedRaw.platform.trim()) {
      collected.platform = collectedRaw.platform.trim().slice(0, 80);
    }
    if (typeof collectedRaw.monthlyCost === "number" && Number.isFinite(collectedRaw.monthlyCost)) {
      collected.monthlyCost = collectedRaw.monthlyCost;
    }
    if (typeof collectedRaw.currency === "string" && collectedRaw.currency.trim()) {
      collected.currency = collectedRaw.currency.trim().toUpperCase().slice(0, 8);
    }
    if (typeof collectedRaw.teamSize === "number" && Number.isFinite(collectedRaw.teamSize)) {
      collected.teamSize = collectedRaw.teamSize;
    }
    if (typeof collectedRaw.monthlyVolume === "number" && Number.isFinite(collectedRaw.monthlyVolume)) {
      collected.monthlyVolume = collectedRaw.monthlyVolume;
    }
  }
  const missing = Array.isArray(o.missing)
    ? o.missing.filter((item): item is string => typeof item === "string").slice(0, 8)
    : o.kind === WEBCHAT_SAVINGS_JOURNEY_KIND
      ? savingsMissingFields(collected)
      : [];
  return {
    source: WEBCHAT_ACTIVE_JOURNEY_SOURCE,
    kind: o.kind,
    status,
    userId: clipId(o.userId),
    visitorId: clipId(o.visitorId),
    conversationId: clipId(o.conversationId),
    ruleKey: String(o.ruleKey || "").trim().slice(0, MAX_RULE),
    actionIndex: typeof o.actionIndex === "number" && Number.isInteger(o.actionIndex) ? o.actionIndex : -1,
    originInboundId: clipId(o.originInboundId),
    lastProcessedInboundId: clipId(o.lastProcessedInboundId),
    locale: typeof o.locale === "string" ? o.locale.slice(0, 8) : undefined,
    collected,
    missing,
    startedAt: typeof o.startedAt === "string" ? o.startedAt : "",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
    expiresAt: typeof o.expiresAt === "string" ? o.expiresAt : "",
  };
}

export function resolveCurrentTurnJourney(input: {
  journey: unknown;
  userId: string;
  visitorId: string;
  conversationId: string;
  inboundMessageId: string;
  now?: Date;
}): CurrentTurnJourney {
  const none = (): CurrentTurnJourney => ({
    trusted: false,
    continuation: false,
    collectedFields: [],
    missingFields: [],
    collected: {},
  });
  const journey = readActiveJourney(input.journey);
  if (!journey) return none();
  const now = input.now || new Date();
  const expired = journey.expiresAt && Date.parse(journey.expiresAt) <= now.getTime();
  if (expired || journey.status === "expired") {
    return { ...none(), kind: journey.kind, status: "expired", originInboundId: journey.originInboundId };
  }
  const sameScope =
    journey.userId === clipId(input.userId) &&
    journey.visitorId === clipId(input.visitorId) &&
    journey.conversationId === clipId(input.conversationId);
  if (!sameScope) return none();
  if (journey.status === "paused" || journey.status === "completed") {
    return {
      trusted: false,
      continuation: false,
      kind: journey.kind,
      status: journey.status,
      originInboundId: journey.originInboundId,
      lastProcessedInboundId: journey.lastProcessedInboundId,
      collectedFields: collectedFieldNames(journey.collected),
      missingFields: journey.missing,
      collected: journey.collected,
    };
  }
  const inboundId = clipId(input.inboundMessageId);
  const continuation = inboundId.length > 0 && inboundId !== journey.originInboundId;
  return {
    trusted: true,
    continuation,
    kind: journey.kind,
    status: journey.status,
    originInboundId: journey.originInboundId,
    lastProcessedInboundId: journey.lastProcessedInboundId,
    ruleKey: journey.ruleKey,
    actionIndex: journey.actionIndex,
    collectedFields: collectedFieldNames(journey.collected),
    missingFields: journey.missing,
    collected: journey.collected,
  };
}

export function mergeCollectedSavings(
  previous: WebchatSavingsCollected,
  next: WebchatSavingsCollected,
): WebchatSavingsCollected {
  return {
    platform: next.platform || previous.platform,
    monthlyCost: next.monthlyCost ?? previous.monthlyCost,
    currency: next.currency || previous.currency,
    teamSize: next.teamSize ?? previous.teamSize,
    monthlyVolume: next.monthlyVolume ?? previous.monthlyVolume,
  };
}

export function applyCompareJourneyInbound(input: {
  journey: WebchatActiveJourney;
  inboundMessageId: string;
  now?: Date;
}): { journey: WebchatActiveJourney; advanced: boolean } {
  if (input.journey.kind !== WEBCHAT_COMPARE_JOURNEY_KIND) {
    return { journey: input.journey, advanced: false };
  }
  const inboundId = clipId(input.inboundMessageId);
  if (!inboundId) return { journey: input.journey, advanced: false };
  if (input.journey.lastProcessedInboundId === inboundId) {
    return { journey: input.journey, advanced: false };
  }
  const now = input.now || new Date();
  return {
    advanced: true,
    journey: {
      ...input.journey,
      lastProcessedInboundId: inboundId,
      updatedAt: now.toISOString(),
    },
  };
}

export function applyJourneyInbound(input: {
  journey: WebchatActiveJourney;
  inboundMessageId: string;
  extracted: WebchatSavingsCollected;
  now?: Date;
}): { journey: WebchatActiveJourney; advanced: boolean } {
  if (input.journey.kind !== WEBCHAT_SAVINGS_JOURNEY_KIND) {
    return applyCompareJourneyInbound(input);
  }
  const inboundId = clipId(input.inboundMessageId);
  if (!inboundId) return { journey: input.journey, advanced: false };
  if (input.journey.lastProcessedInboundId === inboundId) {
    return { journey: input.journey, advanced: false };
  }
  const now = input.now || new Date();
  const collected = mergeCollectedSavings(input.journey.collected, input.extracted);
  if (!collected.currency && typeof collected.monthlyCost === "number") collected.currency = "USD";
  const missing = savingsMissingFields(collected);
  const status: WebchatActiveJourneyStatus = missing.length ? "collecting" : "ready_to_calculate";
  return {
    advanced: true,
    journey: {
      ...input.journey,
      collected,
      missing,
      status,
      lastProcessedInboundId: inboundId,
      updatedAt: now.toISOString(),
    },
  };
}

export function markJourneyStatus(
  journey: WebchatActiveJourney,
  status: WebchatActiveJourneyStatus,
  now?: Date,
): WebchatActiveJourney {
  return {
    ...journey,
    status,
    updatedAt: (now || new Date()).toISOString(),
  };
}

export function journeyGateDiagnostics(
  journey: CurrentTurnJourney | null | undefined,
  currentInboundId?: string,
): {
  activeJourneyKind?: string;
  activeJourneyTrusted: boolean;
  activeJourneyContinuation: boolean;
  activeJourneyOriginInboundId?: string;
  currentInboundId?: string;
  collectedFields?: string;
  missingFields?: string;
} {
  const inbound = String(currentInboundId || "").trim().slice(0, MAX_ID);
  return {
    activeJourneyTrusted: journey?.trusted === true,
    activeJourneyContinuation: journey?.continuation === true,
    ...(journey?.kind ? { activeJourneyKind: journey.kind } : {}),
    ...(journey?.trusted && journey.originInboundId
      ? { activeJourneyOriginInboundId: journey.originInboundId.slice(0, MAX_ID) }
      : {}),
    ...(inbound ? { currentInboundId: inbound } : {}),
    ...(journey?.collectedFields.length ? { collectedFields: journey.collectedFields.join(",") } : {}),
    ...(journey?.missingFields.length ? { missingFields: journey.missingFields.join(",") } : {}),
  };
}
