import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Zap, Users, MessageSquare, Phone, Loader2, Shield } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    description: "Get started with WhatsApp CRM basics.",
    cta: "Current Plan",
    popular: false,
    features: [
      "1 user",
      "1 WhatsApp number",
      "100 conversations / month",
      "Notes & tags",
      "Pipeline management",
      "Mobile PWA",
    ],
    limitations: ["No follow-ups", "No Twilio usage included"],
  },
  {
    id: "starter",
    name: "Starter",
    price: 19,
    description: "For solo founders & small teams.",
    cta: "Upgrade to Starter",
    popular: true,
    features: [
      "3 users",
      "1 WhatsApp number",
      "1,000 conversations / month",
      "Follow-ups enabled",
      "$5 Twilio usage included",
      "Email & push notifications",
      "Full chat history",
    ],
    limitations: [],
  },
  {
    id: "pro",
    name: "Pro",
    price: 49,
    description: "For growing teams with high volume.",
    cta: "Upgrade to Pro",
    popular: false,
    features: [
      "10 users",
      "3 WhatsApp numbers",
      "5,000 conversations / month",
      "$15 Twilio usage included",
      "Team inbox",
      "Priority support",
      "Everything in Starter",
    ],
    limitations: [],
  },
];

export function Pricing() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: subscription } = useQuery<{ subscription: { plan: string } | null }>({
    queryKey: ["/api/subscription"],
    enabled: !!user,
  });

  const currentPlan = subscription?.subscription?.plan || "free";

  const checkoutMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create checkout");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, '_blank');
        setLoadingPlan(null);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start checkout",
        variant: "destructive",
      });
      setLoadingPlan(null);
    },
  });

  const handleUpgrade = (planId: string) => {
    if (!user) {
      setLocation("/auth");
      return;
    }
    setLoadingPlan(planId);
    checkoutMutation.mutate(planId);
  };

  const getPlanIndex = (planId: string) => {
    const order = ['free', 'starter', 'pro'];
    return order.indexOf(planId);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <Link href={user ? "/app/settings" : "/"}>
          <a className="inline-flex items-center text-sm text-gray-500 hover:text-brand-green mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {user ? "Back to Settings" : "Back to Home"}
          </a>
        </Link>

        <div className="text-center mb-12">
          <h1 className="text-4xl font-display font-bold text-gray-900 mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Start for free. Upgrade only when you need more.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const isCurrentPlan = plan.id === currentPlan;
            const currentPlanIndex = getPlanIndex(currentPlan);
            const thisPlanIndex = getPlanIndex(plan.id);
            const canUpgrade = thisPlanIndex > currentPlanIndex;
            const isLoading = loadingPlan === plan.id;

            return (
              <div
                key={plan.id}
                className={`bg-white rounded-2xl border-2 p-6 flex flex-col ${
                  plan.popular
                    ? "border-brand-green shadow-lg relative"
                    : "border-gray-200"
                }`}
                data-testid={`plan-card-${plan.id}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-green text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
                    {plan.price > 0 && <span className="text-gray-500">/month</span>}
                  </div>
                  <p className="text-sm text-gray-600">{plan.description}</p>
                </div>

                <ul className="space-y-3 flex-1 mb-6">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-brand-green shrink-0 mt-0.5" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                  {plan.limitations.map((limitation, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                      <span className="shrink-0 mt-0.5">✕</span>
                      <span>{limitation}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={`w-full ${
                    plan.popular
                      ? "bg-brand-green hover:bg-green-600"
                      : isCurrentPlan
                      ? "bg-gray-100 text-gray-500 cursor-default"
                      : "bg-gray-900 hover:bg-gray-800"
                  }`}
                  disabled={!canUpgrade || isLoading}
                  onClick={() => canUpgrade && handleUpgrade(plan.id)}
                  data-testid={`button-upgrade-${plan.id}`}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isCurrentPlan ? (
                    "Current Plan"
                  ) : plan.id === "free" ? (
                    "Free Forever"
                  ) : (
                    plan.cta
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="mt-16 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">All plans include</h2>
          <div className="grid md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="h-12 w-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                <MessageSquare className="h-6 w-6 text-brand-green" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Real-time messaging</h3>
              <p className="text-sm text-gray-500">Send & receive WhatsApp messages</p>
            </div>
            <div className="text-center">
              <div className="h-12 w-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Zap className="h-6 w-6 text-brand-green" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Notes & Tags</h3>
              <p className="text-sm text-gray-500">Organize every conversation</p>
            </div>
            <div className="text-center">
              <div className="h-12 w-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Users className="h-6 w-6 text-brand-green" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Pipeline management</h3>
              <p className="text-sm text-gray-500">Track deals from lead to close</p>
            </div>
            <div className="text-center">
              <div className="h-12 w-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Phone className="h-6 w-6 text-brand-green" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Mobile-ready PWA</h3>
              <p className="text-sm text-gray-500">Install on any device</p>
            </div>
          </div>
        </div>

        <div className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="twilio-account" className="bg-white border border-gray-200 rounded-xl px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900 hover:no-underline" data-testid="faq-twilio-account">
                Do I need a Twilio account?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                No. WhachatCRM manages Twilio for you. Paid plans include Twilio usage credits ($5 on Starter, $15 on Pro). You only pay overage if you exceed your included amount.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="what-is-conversation" className="bg-white border border-gray-200 rounded-xl px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900 hover:no-underline" data-testid="faq-what-is-conversation">
                What counts as a conversation?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                A conversation is a 24-hour messaging window between you and a customer. All messages within that window count as one conversation. New windows open when a customer messages you or you send a template message.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="reach-limit" className="bg-white border border-gray-200 rounded-xl px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900 hover:no-underline" data-testid="faq-reach-limit">
                What happens if I reach my limit?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                We'll notify you at 80% usage. When you hit 100%, new conversations are paused until you upgrade. You can upgrade instantly with one click.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="cancel" className="bg-white border border-gray-200 rounded-xl px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900 hover:no-underline" data-testid="faq-cancel">
                Can I cancel anytime?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                Yes. No contracts. Cancel anytime from your account settings. Your data stays accessible on the Free plan.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="twilio-overage" className="bg-white border border-gray-200 rounded-xl px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900 hover:no-underline" data-testid="faq-twilio-overage">
                What if I exceed my Twilio usage?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                Additional Twilio usage is billed at cost + 5% margin. We'll notify you before any overage charges. Most users stay within their included limits.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="mt-16 bg-gray-900 rounded-2xl p-8 text-center text-white">
          <div className="flex justify-center mb-4">
            <Shield className="h-10 w-10 text-brand-green" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Official WhatsApp Business API</h2>
          <p className="text-gray-400 mb-6 max-w-lg mx-auto">
            WhachatCRM uses the official WhatsApp Business API. Your data is secure and compliant with Meta's policies.
          </p>
          <Link href="/auth">
            <Button className="bg-brand-green hover:bg-green-600 text-white px-8">
              Start Free
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
