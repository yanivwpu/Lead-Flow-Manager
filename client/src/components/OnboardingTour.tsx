import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { 
  MessageSquare, ListTodo, Bot, Zap, Plug, Settings, 
  ChevronRight, ChevronLeft, X, Sparkles, CheckCircle2, HelpCircle, ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: any;
  sidebarTestId?: string;
  helpArticleId?: string;
  isCentered?: boolean;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to WhachatCRM!",
    description: "Let's take a quick tour to help you get started. You'll be managing WhatsApp leads like a pro in no time.",
    icon: Sparkles,
    isCentered: true,
  },
  {
    id: "chats",
    title: "Your Chat Inbox",
    description: "This is where all your WhatsApp conversations live. Click any chat to view messages, add notes, tags, and manage your leads.",
    icon: MessageSquare,
    sidebarTestId: "sidebar-chats",
    helpArticleId: "getting-started",
  },
  {
    id: "followups",
    title: "Never Miss a Follow-up",
    description: "Set reminders for tomorrow, 3 days, or any custom date. Get notified when it's time to reach out to your leads.",
    icon: ListTodo,
    sidebarTestId: "sidebar-followups",
    helpArticleId: "follow-up-reminders",
  },
  {
    id: "chatbot",
    title: "Visual Chatbot Builder",
    description: "Build automated WhatsApp flows with our drag-and-drop builder. Create welcome messages, FAQs, and lead qualification bots.",
    icon: Bot,
    sidebarTestId: "sidebar-chatbot",
    helpArticleId: "chatbot-automation",
  },
  {
    id: "automation",
    title: "Automate Your Workflows",
    description: "Set up drip campaigns, auto-replies, and scheduled messages. Let automation handle repetitive tasks while you focus on closing deals.",
    icon: Zap,
    sidebarTestId: "sidebar-automation",
    helpArticleId: "drip-campaigns",
  },
  {
    id: "integrations",
    title: "Connect Your Tools",
    description: "Link Shopify, HubSpot, Stripe, Calendly and more. Automatically sync leads and orders across all your business tools.",
    icon: Plug,
    sidebarTestId: "sidebar-integrations",
    helpArticleId: "native-integrations",
  },
  {
    id: "settings",
    title: "Connect WhatsApp",
    description: "Head to Settings to connect your Twilio account. Once connected, you can send and receive WhatsApp messages directly.",
    icon: Settings,
    sidebarTestId: "sidebar-settings",
    helpArticleId: "twilio-setup",
  },
  {
    id: "complete",
    title: "You're All Set!",
    description: "Start by connecting your Twilio account in Settings, then import your contacts or wait for new messages to arrive. Need help? Visit our Help Center anytime.",
    icon: CheckCircle2,
    isCentered: true,
  },
];

interface OnboardingTourProps {
  onComplete: () => void;
  isOpen: boolean;
}

export function OnboardingTour({ onComplete, isOpen }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(isOpen);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const queryClient = useQueryClient();
  const cardRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const step = TOUR_STEPS[currentStep];
    if (step.sidebarTestId && !step.isCentered) {
      const element = document.querySelector(`[data-testid="${step.sidebarTestId}"]`);
      if (element) {
        const rect = element.getBoundingClientRect();
        const cardWidth = 380;
        const cardHeight = cardRef.current?.offsetHeight || 280;
        
        let top = rect.top + rect.height / 2 - cardHeight / 2;
        top = Math.max(20, Math.min(top, window.innerHeight - cardHeight - 20));
        
        const left = rect.right + 16;
        
        setTooltipPosition({ top, left });
      }
    }
  }, [currentStep]);

  const handleNext = () => {
    // Mark tour as complete on first Next click so it won't show again if user navigates away
    if (currentStep === 0) {
      completeTourMutation.mutate();
    }
    
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
  const isCentered = step.isCentered;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {step.sidebarTestId && !isCentered && (
        <div 
          className="absolute"
          style={{
            top: tooltipPosition.top + (cardRef.current?.offsetHeight || 200) / 2 - 8,
            left: tooltipPosition.left - 8,
          }}
        >
          <div className="w-0 h-0 border-t-8 border-b-8 border-r-8 border-transparent border-r-white drop-shadow-md" />
        </div>
      )}
      
      <div 
        ref={cardRef}
        className={cn(
          "absolute pointer-events-auto",
          isCentered && "inset-0 flex items-center justify-center p-4"
        )}
        style={!isCentered ? {
          top: tooltipPosition.top,
          left: tooltipPosition.left,
        } : undefined}
      >
        <Card className={cn(
          "shadow-2xl border border-gray-200 animate-in fade-in zoom-in-95 duration-300",
          isCentered ? "w-full max-w-sm" : "w-[320px]"
        )}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center",
                isLastStep ? "bg-green-100" : "bg-brand-green/10"
              )}>
                <Icon className={cn(
                  "h-5 w-5",
                  isLastStep ? "text-green-600" : "text-brand-green"
                )} />
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-gray-400 hover:text-gray-600"
                onClick={handleSkip}
                data-testid="tour-skip-button"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <h3 className="text-base font-bold text-gray-900 mb-1">
              {step.title}
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              {step.description}
            </p>

            {step.helpArticleId && (
              <Link href={`/app/help?article=${step.helpArticleId}`}>
                <a 
                  className="inline-flex items-center gap-1 text-xs text-brand-green hover:text-emerald-700 font-medium mb-3"
                  onClick={() => handleComplete()}
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  Learn more
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Link>
            )}

            {isLastStep && (
              <Link href="/app/help">
                <a 
                  className="inline-flex items-center gap-1 text-xs text-brand-green hover:text-emerald-700 font-medium mb-3"
                  onClick={() => handleComplete()}
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  Visit Help Center
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Link>
            )}

            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {TOUR_STEPS.map((_, index) => (
                  <div
                    key={index}
                    className={cn(
                      "w-1.5 h-1.5 rounded-full transition-colors",
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
                    className="h-7 text-xs px-2"
                    onClick={handlePrev}
                  >
                    <ChevronLeft className="h-3 w-3 mr-0.5" />
                    Back
                  </Button>
                )}
                <Button
                  size="sm"
                  className="h-7 text-xs px-3 bg-brand-green hover:bg-brand-green/90"
                  onClick={handleNext}
                >
                  {isLastStep ? "Get Started" : "Next"}
                  {!isLastStep && <ChevronRight className="h-3 w-3 ml-0.5" />}
                </Button>
              </div>
            </div>

            <button
              onClick={handleSkip}
              className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600"
              data-testid="tour-skip-text"
            >
              Skip tour
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
