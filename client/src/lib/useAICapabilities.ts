/**
 * useAICapabilities — plan-based AI access control for the client.
 *
 * Reads from:
 *   - /api/ai/usage  (internal generation accounting + feature flags)
 *   - useSubscription (plan, hasAIBrainAddon)
 *
 * Public experience: AI Assist Included (Basic / Enhanced) with fair use.
 * Internal meter: inbox AI reply generations (Suggest/Auto via suggest-reply) —
 * abuse backstops only; never surface numeric quotas in product UI.
 * See @shared/inboxAiReplyGenerations.
 *
 * Returns a typed AICapabilities object consumed by AIComposer and InboxLeadDetailsPanel.
 */
import { useQuery } from "@tanstack/react-query";
import {
  AI_BRAIN_PRO_CREDIT_BONUS,
  INBOX_AI_REPLY_GENERATIONS_MONTHLY,
} from "@shared/pricingEntitlements";
import { withUserQueryScope } from "./accountQueryScope";
import { useAuth } from "./auth-context";
import { useSubscription } from "./subscription-context";

export interface AIUsageData {
  plan:                         string;
  hasAIBrain:                   boolean;
  /** Accurate internal meter (preferred). */
  inboxAiReplyGenerationsUsed?: number;
  inboxAiReplyGenerationsLimit?: number;
  inboxAiReplyGenerationsRemaining?: number;
  inboxAiReplyGenerationsPercent?: number;
  /** @deprecated Legacy aliases — same values as inboxAiReplyGenerations*. */
  creditsUsed:                  number;
  monthlyLimit:                 number;
  creditsRemaining:             number;
  creditPercent:                number;
  fairUseStatus:                "healthy" | "limited" | "paused";
  usageLimitReached:            boolean;
  periodStart:                  string | null;
  periodEnd:                    string | null;
  canUseSuggest:                boolean;
  canUseAuto:                   boolean;
  canUseWorkflowRecommendations: boolean;
  canUseCopilotIntelligence:    boolean;
}

export interface AICapabilities {
  plan:             string;
  planName:         string;
  hasAIBrain:       boolean;

  // Mode access
  canUseManual:    true;
  canUseSuggest:   boolean;
  canUseAuto:      boolean;

  // Feature access
  canUseCopilotIntelligence:    boolean;
  canUseWorkflowRecommendations: boolean;

  // Internal accounting (developer/API only — do not show meters in product UI)
  creditsUsed:      number;
  monthlyLimit:     number;
  creditsRemaining: number;
  creditPercent:    number;

  // Status flags — fair-use / backstop; not for customer quota messaging
  isLimited:        boolean;
  isNearLimit:      boolean;
  isExhausted:      boolean;  // internal backstop or fair-use pause
  fairUseStatus:    "healthy" | "limited" | "paused";

  // Upgrade guidance (plan features — not generation quotas)
  upgradePlan:      string | null;
  isLoading:        boolean;
}

// Plan display names with AI capability descriptions (no quota numbers)
const PLAN_NAMES: Record<string, string> = {
  free:       "Free",
  starter:    "Starter — AI Assist Basic",
  pro:        "Pro — AI Assist Enhanced",
  enterprise: "Enterprise",
};

// What each plan should upgrade to (with outcome language)
const UPGRADE_PATHS: Record<string, string | null> = {
  free:       "Starter",
  starter:    "Pro",
  pro:        null,
  enterprise: null,
};

const DEFAULT_CAPABILITIES: AICapabilities = {
  plan:             "free",
  planName:         "Free",
  hasAIBrain:       false,
  canUseManual:     true,
  canUseSuggest:    false,
  canUseAuto:       false,
  canUseCopilotIntelligence:    false,
  canUseWorkflowRecommendations: false,
  creditsUsed:      0,
  monthlyLimit:     0,
  creditsRemaining: 0,
  creditPercent:    0,
  isLimited:        false,
  isNearLimit:      false,
  isExhausted:      false,
  fairUseStatus:    "healthy",
  upgradePlan:      "Starter",
  isLoading:        true,
};

export function useAICapabilities(): AICapabilities {
  const { user } = useAuth();
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const plan = (subscription?.limits as any)?.plan || "free";

  const { data: usageData, isLoading: usageLoading } = useQuery<AIUsageData>({
    queryKey: withUserQueryScope(["/api/ai/usage"], user?.id),
    enabled:  !!subscription,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Unknown entitlement must stay loading — never treat missing usage as Free/locked.
  if (subLoading || usageLoading || !usageData) {
    return { ...DEFAULT_CAPABILITIES, plan, isLoading: true };
  }

  const creditsUsed =
    usageData.inboxAiReplyGenerationsUsed ?? usageData.creditsUsed;
  const monthlyLimit =
    usageData.inboxAiReplyGenerationsLimit ?? usageData.monthlyLimit;
  const creditsRemaining =
    usageData.inboxAiReplyGenerationsRemaining ?? usageData.creditsRemaining;
  const creditPercent =
    usageData.inboxAiReplyGenerationsPercent ?? usageData.creditPercent;

  const isLimited   = monthlyLimit > 0 && creditPercent >= 75;
  const isNearLimit = monthlyLimit > 0 && creditPercent >= 90;
  const isExhausted =
    monthlyLimit > 0 &&
    (creditPercent >= 100 || usageData.usageLimitReached || creditsRemaining <= 0);

  return {
    plan:              usageData.plan,
    planName:          PLAN_NAMES[usageData.plan] || usageData.plan,
    hasAIBrain:        usageData.hasAIBrain,

    canUseManual:     true,
    canUseSuggest:    usageData.canUseSuggest && !isExhausted,
    canUseAuto:       usageData.canUseAuto    && !isExhausted,

    canUseCopilotIntelligence:    usageData.canUseCopilotIntelligence,
    canUseWorkflowRecommendations: usageData.canUseWorkflowRecommendations,

    creditsUsed,
    monthlyLimit,
    creditsRemaining,
    creditPercent,

    isLimited,
    isNearLimit,
    isExhausted,
    fairUseStatus: usageData.fairUseStatus,

    upgradePlan: UPGRADE_PATHS[usageData.plan] ?? null,
    isLoading:   false,
  };
}

// ── Verification scenarios (used in tests / browser console) ─────────────────
export const AI_PLAN_MATRIX = {
  free:       { manual: true,  suggest: false, auto: false, copilot: false, workflow: false, inboxAiReplyGenerations: INBOX_AI_REPLY_GENERATIONS_MONTHLY.free },
  starter:    { manual: true,  suggest: true,  auto: false, copilot: true,  workflow: false, inboxAiReplyGenerations: INBOX_AI_REPLY_GENERATIONS_MONTHLY.starter },
  pro:        { manual: true,  suggest: true,  auto: true,  copilot: true,  workflow: true,  inboxAiReplyGenerations: INBOX_AI_REPLY_GENERATIONS_MONTHLY.pro },
  pro_brain:  { manual: true,  suggest: true,  auto: true,  copilot: true,  workflow: true,  inboxAiReplyGenerations: INBOX_AI_REPLY_GENERATIONS_MONTHLY.pro + AI_BRAIN_PRO_CREDIT_BONUS },
} as const;
