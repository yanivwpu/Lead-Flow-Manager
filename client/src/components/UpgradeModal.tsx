import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, MessageSquare, Users, Phone, Sparkles, Loader2, Check, Info } from "lucide-react";

export type UpgradeReason = 
  | "conversation_limit" 
  | "free_reply" 
  | "add_user" 
  | "add_automation" 
  | "add_whatsapp_number"
  | "add_team_member";

export interface ConversationLimitInfo {
  limit: number;
  used: number;
  planName: string;
  resetDate?: string | null;
}

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: UpgradeReason;
  currentPlan?: string;
  limitInfo?: ConversationLimitInfo;
}

type TargetPlan = "starter" | "pro";

interface UpgradeContent {
  icon: React.ReactNode;
  title: string;
  description: string;
  targetPlan: TargetPlan;
  ctaText: string;
  benefits: string[];
}

const UPGRADE_CONTENT: Record<UpgradeReason, UpgradeContent> = {
  conversation_limit: {
    icon: <MessageSquare className="h-8 w-8 text-amber-500" />,
    title: "Conversation limit reached",
    description: "You've reached your monthly conversation limit for this plan.\nUpgrade your plan to continue creating new conversations, or wait until your next billing cycle for access to reset.",
    targetPlan: "starter",
    ctaText: "Upgrade Plan",
    benefits: [
      "500 conversations/month",
      "Send messages to customers",
      "Follow-ups enabled",
    ],
  },
  free_reply: {
    icon: <Zap className="h-8 w-8 text-brand-green" />,
    title: "Upgrade to send messages",
    description: "Free plan users can receive messages, but sending requires a paid plan.",
    targetPlan: "starter",
    ctaText: "Upgrade to Starter",
    benefits: [
      "Reply to all your customers",
      "500 conversations/month",
      "Notes, tags & pipeline",
    ],
  },
  add_user: {
    icon: <Users className="h-8 w-8 text-blue-500" />,
    title: "Team members require Pro plan",
    description: "Add your team to collaborate on customer conversations.",
    targetPlan: "pro",
    ctaText: "Upgrade to Pro",
    benefits: [
      "Up to 10 team members",
      "2,000 conversations/month",
      "Team inbox & collaboration",
    ],
  },
  add_automation: {
    icon: <Sparkles className="h-8 w-8 text-purple-500" />,
    title: "Automation requires Pro plan",
    description: "Automate your WhatsApp workflows with smart responses.",
    targetPlan: "pro",
    ctaText: "Upgrade to Pro",
    benefits: [
      "Auto-replies & workflows",
      "Scheduled messages",
      "Smart tagging rules",
    ],
  },
  add_whatsapp_number: {
    icon: <Phone className="h-8 w-8 text-emerald-600" />,
    title: "Additional numbers require Pro plan",
    description: "Manage multiple WhatsApp Business numbers for different brands.",
    targetPlan: "pro",
    ctaText: "Upgrade to Pro",
    benefits: [
      "Up to 3 WhatsApp numbers",
      "2,000 conversations/month",
      "Up to 10 team members",
    ],
  },
  add_team_member: {
    icon: <Users className="h-8 w-8 text-blue-500" />,
    title: "Team member limit reached",
    description: "Upgrade to invite more team members to collaborate.",
    targetPlan: "starter",
    ctaText: "Upgrade Now",
    benefits: [
      "Up to 3 team members (Starter)",
      "Up to 10 team members (Pro)",
      "Shared team inbox",
    ],
  },
};

const PLAN_PRICES: Record<TargetPlan, string> = {
  starter: "$19",
  pro: "$49",
};

function formatResetDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function buildConversationLimitDescription(limitInfo?: ConversationLimitInfo): React.ReactNode {
  if (!limitInfo) {
    return (
      <>
        <span className="block">You've reached your monthly conversation limit for this plan.</span>
        <span className="block mt-2">Upgrade your plan to continue creating new conversations, or wait until your next billing cycle for access to reset.</span>
      </>
    );
  }

  const resetDateFormatted = limitInfo.resetDate ? formatResetDate(limitInfo.resetDate) : null;

  return (
    <>
      <span className="block">Your {limitInfo.planName} plan includes {limitInfo.limit} conversations per month.</span>
      <span className="block mt-1">You've used {limitInfo.used} of {limitInfo.limit} conversations for this billing cycle.</span>
      <span className="block mt-2">To continue creating new conversations right away, upgrade your plan. Otherwise, you can wait until your next billing cycle for your conversation limit to reset.</span>
      {resetDateFormatted && (
        <span className="block mt-2 font-medium text-gray-700">Your allowance resets on {resetDateFormatted}.</span>
      )}
    </>
  );
}

const SHOPIFY_PLAN_MAP: Record<string, string> = { starter: 'Starter', pro: 'Pro' };

export function UpgradeModal({ open, onOpenChange, reason, currentPlan, limitInfo }: UpgradeModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const content = { ...UPGRADE_CONTENT[reason] };

  const isConversationLimit = reason === "conversation_limit";

  const { data: subscription } = useQuery<{
    subscription: { plan: string; isShopify?: boolean } | null;
  }>({ queryKey: ["/api/subscription"] });

  const isShopify = !!(subscription?.subscription?.isShopify);

  const handleUpgrade = async () => {
    setIsLoading(true);
    try {
      if (isShopify) {
        const shopifyPlan = SHOPIFY_PLAN_MAP[content.targetPlan];
        if (!shopifyPlan) throw new Error("Invalid plan");
        const response = await fetch("/api/shopify/billing/checkout-web", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ plan: shopifyPlan }),
        });
        if (!response.ok) throw new Error("Failed to start billing");
        const data = await response.json();
        if (data.confirmationUrl) window.location.href = data.confirmationUrl;
        return;
      }

      const response = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planId: content.targetPlan }),
      });

      if (response.status === 401) {
        window.location.href = "/auth?redirect=/pricing";
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to start checkout");
      }

      const data = await response.json();
      if (data.url) {
        window.open(data.url, '_blank');
        setIsLoading(false);
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Checkout error:", error);
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="modal-upgrade">
        <DialogHeader className="text-center sm:text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 bg-gray-50 rounded-full flex items-center justify-center">
              {content.icon}
            </div>
          </div>
          <DialogTitle className="text-xl font-bold text-gray-900" data-testid="text-upgrade-title">
            {content.title}
          </DialogTitle>
          <DialogDescription className="text-gray-600 mt-2 text-left" data-testid="text-upgrade-description">
            {isConversationLimit
              ? buildConversationLimitDescription(limitInfo)
              : content.description}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-gray-50 rounded-lg p-4 my-4">
          <div className="flex items-baseline justify-center gap-1 mb-3">
            <span className="text-3xl font-bold text-gray-900">{PLAN_PRICES[content.targetPlan]}</span>
            <span className="text-gray-500">/month</span>
          </div>
          <ul className="space-y-2">
            {content.benefits.map((benefit, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                <Check className="h-4 w-4 text-brand-green flex-shrink-0" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button 
            className="w-full bg-brand-green hover:bg-emerald-700 h-12 text-base"
            onClick={handleUpgrade}
            disabled={isLoading}
            data-testid="button-upgrade-modal-cta"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Zap className="h-5 w-5 mr-2" />
                {content.ctaText} — {PLAN_PRICES[content.targetPlan]}/mo
              </>
            )}
          </Button>
          <Button 
            variant="ghost" 
            className="w-full text-gray-500"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            data-testid="button-upgrade-modal-dismiss"
          >
            Maybe Later
          </Button>
        </DialogFooter>

        {isConversationLimit && (
          <div className="flex items-start gap-2 px-1 pb-1">
            <Info className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-gray-400" data-testid="text-upgrade-note">
              Existing conversations will remain accessible. This limit only affects creating new conversations.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
