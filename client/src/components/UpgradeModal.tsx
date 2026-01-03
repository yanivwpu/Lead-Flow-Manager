import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, MessageSquare, Users, Phone, Sparkles, Loader2, Check } from "lucide-react";

export type UpgradeReason = 
  | "conversation_limit" 
  | "free_reply" 
  | "add_user" 
  | "add_automation" 
  | "add_whatsapp_number";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: UpgradeReason;
  currentPlan?: string;
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
    title: "You've reached your conversation limit",
    description: "Upgrade to continue connecting with more customers.",
    targetPlan: "starter",
    ctaText: "Upgrade to Starter",
    benefits: [
      "500 conversations/month",
      "Send messages to customers",
      "Basic automation features",
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
      "5,000 conversations/month",
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
    icon: <Phone className="h-8 w-8 text-green-500" />,
    title: "Additional numbers require Pro plan",
    description: "Manage multiple WhatsApp Business numbers for different brands.",
    targetPlan: "pro",
    ctaText: "Upgrade to Pro",
    benefits: [
      "Up to 2 WhatsApp numbers",
      "Unlimited conversations",
      "Unlimited team members",
    ],
  },
};

const PLAN_PRICES: Record<TargetPlan, string> = {
  starter: "$19",
  pro: "$49",
};

export function UpgradeModal({ open, onOpenChange, reason, currentPlan }: UpgradeModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const content = UPGRADE_CONTENT[reason];

  const handleUpgrade = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planId: content.targetPlan }),
      });

      if (!response.ok) {
        throw new Error("Failed to start checkout");
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
          <DialogTitle className="text-xl font-bold text-gray-900">
            {content.title}
          </DialogTitle>
          <DialogDescription className="text-gray-600 mt-2">
            {content.description}
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
            className="w-full bg-brand-green hover:bg-green-600 h-12 text-base"
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
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
