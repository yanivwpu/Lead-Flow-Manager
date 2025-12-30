import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Zap, Users, MessageSquare, Phone, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    description: "Try the CRM on real WhatsApp conversations.",
    cta: "Current Plan",
    popular: false,
    features: [
      "1 user",
      "Shared inbox (single user)",
      "Notes & tags",
      "Tasks & follow-ups",
      "PWA (mobile-friendly)",
      "Up to 50 conversations (lifetime)",
      "Inbound messages only",
    ],
    limitations: ["Limited replies", "No automation"],
  },
  {
    id: "starter",
    name: "Starter",
    price: 19,
    description: "For solo founders & small businesses.",
    cta: "Upgrade to Starter",
    popular: false,
    features: [
      "Everything in Free, plus:",
      "Send & receive WhatsApp messages",
      "1 WhatsApp Business number",
      "500 conversations / month",
      "Full chat history",
      "Tasks & basic reminders",
      "Email notifications",
    ],
    limitations: ["No automation", "Single user only"],
  },
  {
    id: "growth",
    name: "Growth",
    price: 49,
    description: "For growing teams using WhatsApp daily.",
    cta: "Upgrade to Growth",
    popular: true,
    features: [
      "Everything in Starter, plus:",
      "Up to 3 users",
      "2,000 conversations / month",
      "Push + email reminders",
      "Pipeline & task views",
      "Priority support",
    ],
    limitations: [],
  },
  {
    id: "pro",
    name: "Pro",
    price: 99,
    description: "For high-volume or multi-number teams.",
    cta: "Upgrade to Pro",
    popular: false,
    features: [
      "Everything in Growth, plus:",
      "Unlimited users",
      "2 WhatsApp Business numbers",
      "5,000 conversations / month",
      "Team inbox",
      "Monthly usage reports",
    ],
    limitations: [],
  },
];

export function Pricing() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

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
        window.location.href = data.url;
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

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <Link href={user ? "/app/settings" : "/"}>
          <a className="inline-flex items-center text-sm text-gray-500 hover:text-brand-green mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {user ? "Back to Settings" : "Back to Home"}
          </a>
        </Link>

        <div className="text-center mb-12">
          <h1 className="text-4xl font-display font-bold text-gray-900 mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Start free, upgrade when you need more. All plans include core CRM features.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLANS.map((plan) => {
            const isCurrentPlan = plan.id === currentPlan;
            const canUpgrade = !isCurrentPlan && plan.id !== "free";
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
              <p className="text-sm text-gray-500">Sync WhatsApp conversations instantly</p>
            </div>
            <div className="text-center">
              <div className="h-12 w-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Zap className="h-6 w-6 text-brand-green" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Follow-up reminders</h3>
              <p className="text-sm text-gray-500">Never miss a lead again</p>
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

        <div className="mt-16 bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Need more?</h2>
          <p className="text-gray-600 mb-6">
            Contact us for custom enterprise plans with higher limits and dedicated support.
          </p>
          <a
            href="mailto:enterprise@whachatcrm.com"
            className="text-brand-green font-semibold hover:underline"
          >
            Contact Sales
          </a>
        </div>
      </div>
    </div>
  );
}
