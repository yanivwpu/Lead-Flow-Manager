import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  MessageSquare, Users, Bell, Settings, Plug, Zap, 
  ChevronRight, ChevronLeft, X, Sparkles, CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: any;
  highlight?: string;
  position?: "center" | "bottom-left" | "bottom-right";
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to WhachatCRM!",
    description: "Let's take a quick tour to help you get started. You'll be managing WhatsApp leads like a pro in no time.",
    icon: Sparkles,
    position: "center",
  },
  {
    id: "chats",
    title: "Your Chat Inbox",
    description: "This is where all your WhatsApp conversations live. Click any chat to view the full conversation and manage the lead.",
    icon: MessageSquare,
    highlight: "[data-testid='sidebar-chats']",
  },
  {
    id: "pipeline",
    title: "Track Your Pipeline",
    description: "Tag leads as Hot, Quoted, or Paid. Set pipeline stages to track deals from Lead to Closed. Never lose track of a sale again!",
    icon: Users,
  },
  {
    id: "followups",
    title: "Never Forget Follow-ups",
    description: "Set reminders for tomorrow, 3 days, or any custom date. Get notified when it's time to reach out.",
    icon: Bell,
  },
  {
    id: "integrations",
    title: "Connect Your Tools",
    description: "Link Shopify, Calendly, Stripe, and more. Automatically create leads when customers book or buy.",
    icon: Plug,
  },
  {
    id: "twilio",
    title: "Connect WhatsApp",
    description: "Head to Settings to connect your Twilio account. Once connected, you can send and receive WhatsApp messages directly.",
    icon: Settings,
    highlight: "[data-testid='sidebar-settings']",
  },
  {
    id: "complete",
    title: "You're All Set!",
    description: "Start by connecting your Twilio account in Settings, then import your contacts or wait for new messages to arrive.",
    icon: CheckCircle2,
    position: "center",
  },
];

interface OnboardingTourProps {
  onComplete: () => void;
  isOpen: boolean;
}

export function OnboardingTour({ onComplete, isOpen }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(isOpen);
  const queryClient = useQueryClient();

  const completeTourMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/user/complete-onboarding", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to complete onboarding");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
  });

  useEffect(() => {
    setIsVisible(isOpen);
  }, [isOpen]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    setIsVisible(false);
    completeTourMutation.mutate();
    onComplete();
  };

  const handleSkip = () => {
    setIsVisible(false);
    completeTourMutation.mutate();
    onComplete();
  };

  if (!isVisible) return null;

  const step = TOUR_STEPS[currentStep];
  const Icon = step.icon;
  const isLastStep = currentStep === TOUR_STEPS.length - 1;
  const isFirstStep = currentStep === 0;

  return (
    <div className="fixed inset-0 z-[100]">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleSkip}
      />
      
      <div className={cn(
        "absolute flex items-center justify-center p-4",
        step.position === "center" && "inset-0",
        step.position === "bottom-left" && "bottom-4 left-4",
        step.position === "bottom-right" && "bottom-4 right-4",
        !step.position && "inset-0"
      )}>
        <Card className="w-full max-w-md shadow-2xl border-0 animate-in fade-in zoom-in-95 duration-300">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center",
                isLastStep ? "bg-green-100" : "bg-brand-green/10"
              )}>
                <Icon className={cn(
                  "h-6 w-6",
                  isLastStep ? "text-green-600" : "text-brand-green"
                )} />
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-gray-400 hover:text-gray-600"
                onClick={handleSkip}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {step.title}
            </h3>
            <p className="text-gray-600 mb-6">
              {step.description}
            </p>

            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {TOUR_STEPS.map((_, index) => (
                  <div
                    key={index}
                    className={cn(
                      "w-2 h-2 rounded-full transition-colors",
                      index === currentStep ? "bg-brand-green" : "bg-gray-200"
                    )}
                  />
                ))}
              </div>

              <div className="flex gap-2">
                {!isFirstStep && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrev}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                )}
                <Button
                  size="sm"
                  className="bg-brand-green hover:bg-brand-green/90"
                  onClick={handleNext}
                >
                  {isLastStep ? "Get Started" : "Next"}
                  {!isLastStep && <ChevronRight className="h-4 w-4 ml-1" />}
                </Button>
              </div>
            </div>

            {isFirstStep && (
              <button
                onClick={handleSkip}
                className="w-full mt-4 text-sm text-gray-400 hover:text-gray-600"
              >
                Skip tour
              </button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
