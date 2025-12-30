import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, MessageSquare, Users, Phone, Sparkles } from "lucide-react";
import { Link } from "wouter";

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

const UPGRADE_CONTENT: Record<UpgradeReason, {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
}> = {
  conversation_limit: {
    icon: <MessageSquare className="h-8 w-8 text-amber-500" />,
    title: "You've reached your conversation limit",
    description: "Upgrade your plan to continue connecting with more customers. Your existing conversations remain accessible.",
    cta: "Upgrade Now",
  },
  free_reply: {
    icon: <Zap className="h-8 w-8 text-brand-green" />,
    title: "Upgrade to send messages",
    description: "Free plan users can receive messages, but sending replies requires a paid plan. Upgrade to Starter or higher to start responding to your customers.",
    cta: "Unlock Messaging",
  },
  add_user: {
    icon: <Users className="h-8 w-8 text-blue-500" />,
    title: "Team members require Growth plan",
    description: "Want to add team members to your inbox? Upgrade to Growth (3 users) or Pro (unlimited users) to collaborate with your team.",
    cta: "Upgrade for Team",
  },
  add_automation: {
    icon: <Sparkles className="h-8 w-8 text-purple-500" />,
    title: "Automation requires a paid plan",
    description: "Automate your WhatsApp workflows with smart responses and scheduled messages. Available on Starter plan and above.",
    cta: "Unlock Automation",
  },
  add_whatsapp_number: {
    icon: <Phone className="h-8 w-8 text-green-500" />,
    title: "Additional numbers require Pro plan",
    description: "Need multiple WhatsApp Business numbers? Pro plan supports up to 2 numbers for managing different brands or departments.",
    cta: "Upgrade to Pro",
  },
};

export function UpgradeModal({ open, onOpenChange, reason, currentPlan }: UpgradeModalProps) {
  const content = UPGRADE_CONTENT[reason];

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
        <DialogFooter className="flex-col sm:flex-col gap-2 mt-4">
          <Link href="/pricing" className="w-full">
            <Button 
              className="w-full bg-brand-green hover:bg-green-600"
              onClick={() => onOpenChange(false)}
              data-testid="button-upgrade-modal-cta"
            >
              <Zap className="h-4 w-4 mr-2" />
              {content.cta}
            </Button>
          </Link>
          <Button 
            variant="ghost" 
            className="w-full text-gray-500"
            onClick={() => onOpenChange(false)}
            data-testid="button-upgrade-modal-dismiss"
          >
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
