/**
 * useAICapabilities — single source of truth for plan-based AI access control.
 *
 * Reads from:
 *   - /api/ai/usage  (credits used, monthly limit, feature flags)
 *   - useSubscription (plan, hasAIBrainAddon)
 *
 * Returns a typed AICapabilities object consumed by AIComposer and InboxLeadDetailsPanel.
 */
import { useQuery } from "@tanstack/react-query";
import { useSubscription } from "./subscription-context";

export interface AIUsageData {
  plan:                         string;
  hasAIBrain:                   boolean;
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

  // Credit state
  creditsUsed:      number;
  monthlyLimit:     number;
  creditsRemaining: number;
  creditPercent:    number;

  // Status flags
  isLimited:        boolean;  // >75% of credits consumed
  isNearLimit:      boolean;  // >90% consumed
  isExhausted:      boolean;  // 100% consumed or usageLimitReached
  fairUseStatus:    "healthy" | "limited" | "paused";

  // Upgrade guidance
  upgradePlan:      string | null;  // what to upgrade to for next tier
  isLoading:        boolean;
}

// Plan display names with AI capability descriptions
const PLAN_NAMES: Record<string, string> = {
  free:       "Free",
  starter:    "Starter — AI Assist (Limited)",
  pro:        "Pro — AI Assist (Advanced)",
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
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const plan = (subscription?.limits as any)?.plan || "free";
  const isAIPlan = plan === "starter" || plan === "pro" || plan === "enterprise";

  const { data: usageData, isLoading: usageLoading } = useQuery<AIUsageData>({
    queryKey: ["/api/ai/usage"],
    enabled:  !!subscription,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (subLoading || usageLoading || !usageData) {
    return { ...DEFAULT_CAPABILITIES, plan, isLoading: subLoading || usageLoading };
  }

  const creditsUsed      = usageData.creditsUsed;
  const monthlyLimit     = usageData.monthlyLimit;
  const creditsRemaining = usageData.creditsRemaining;
  const creditPercent    = usageData.creditPercent;

  const isLimited   = creditPercent >= 75;
  const isNearLimit = creditPercent >= 90;
  const isExhausted = creditPercent >= 100 || usageData.usageLimitReached || creditsRemaining <= 0;

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
  free:       { manual: true,  suggest: false, auto: false, copilot: false, workflow: false, credits: 0    },
  starter:    { manual: true,  suggest: true,  auto: false, copilot: true,  workflow: false, credits: 50   },
  pro:        { manual: true,  suggest: true,  auto: true,  copilot: true,  workflow: true,  credits: 300  },
  pro_brain:  { manual: true,  suggest: true,  auto: true,  copilot: true,  workflow: true,  credits: 1000 },
} as const;
