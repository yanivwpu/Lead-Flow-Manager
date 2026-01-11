import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Zap, Users, MessageSquare, Phone, Loader2, Shield, AlertTriangle, HelpCircle, XCircle } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

const PLANS = [
  {
    id: "free",
    name: "Free",
    badge: "Forever Free",
    price: 0,
    description: "Try WhachatCRM with real workflows",
    cta: "Start Free",
    popular: false,
    features: [
      "1 WhatsApp Business number",
      "1 user",
      "50 active conversations / month",
      "Shared inbox (read-only)",
      "Tags & internal notes",
      "Tasks & reminders",
      "Away messages (business hours)",
      "Export conversations (CSV)",
      "Community support",
    ],
    note: "No credit card required",
  },
  {
    id: "starter",
    name: "Starter",
    badge: null,
    price: 19,
    description: "For small businesses & solo teams",
    cta: "Start Starter",
    popular: true,
    features: [
      "Everything in Free, plus:",
      "Up to 3 team members",
      "1 WhatsApp Business number",
      "500 active conversations / month",
      "Shared team inbox",
      "Visual chatbot builder",
      "Auto-reply messages",
      "Keyword triggers",
      "CSV import contacts",
      "Email & push notifications",
      "3 webhook integrations",
    ],
    note: "Best for getting started with WhatsApp sales & support",
  },
  {
    id: "pro",
    name: "Pro",
    badge: null,
    price: 49,
    description: "For growing teams handling high volume",
    cta: "Upgrade to Pro",
    popular: false,
    features: [
      "Everything in Starter, plus:",
      "Up to 5 WhatsApp Business numbers",
      "Unlimited team members",
      "2,000 active conversations / month",
      "Visual chatbot builder",
      "Drip sequences & campaigns",
      "Workflow automation",
      "Template messaging & retargeting",
      "10 webhook + native integrations",
      "Priority support",
    ],
    note: "Built for serious WhatsApp operations",
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
    if (planId === "free") return;
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
            Simple Pricing for WhatsApp Teams
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            You bring WhatsApp. We power the CRM.
          </p>
          <p className="text-gray-500 mt-2 max-w-2xl mx-auto">
            WhachatCRM helps you manage, organize, and follow up on WhatsApp conversations — without locking you into message fees.
          </p>
          
          <div className="flex flex-wrap justify-center gap-4 mt-6">
            <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2 rounded-full text-sm font-medium">
              <Shield className="h-4 w-4" />
              No Markup Guarantee
            </div>
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-2 rounded-full text-sm font-medium">
              <XCircle className="h-4 w-4" />
              Cancel Anytime
            </div>
          </div>
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
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                    {plan.badge && (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                        {plan.badge}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
                    {plan.price > 0 && <span className="text-gray-500">/ month</span>}
                  </div>
                  <p className="text-sm text-gray-600">{plan.description}</p>
                </div>

                <ul className="space-y-3 flex-1 mb-4">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-brand-green shrink-0 mt-0.5" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>

                {plan.note && (
                  <p className="text-xs text-gray-500 mb-4 italic">{plan.note}</p>
                )}

                <Button
                  className={`w-full ${
                    plan.popular
                      ? "bg-brand-green hover:bg-emerald-700"
                      : isCurrentPlan
                      ? "bg-gray-100 text-gray-500 cursor-default"
                      : "bg-gray-900 hover:bg-gray-800"
                  }`}
                  disabled={isCurrentPlan || isLoading || (plan.id === "free" && !user)}
                  onClick={() => handleUpgrade(plan.id)}
                  data-testid={`button-upgrade-${plan.id}`}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isCurrentPlan ? (
                    "Current Plan"
                  ) : (
                    plan.cta
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Important Notice */}
        <div className="mt-12 bg-amber-50 border border-amber-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900 mb-2">Important: WhatsApp Message Costs</h3>
              <p className="text-amber-800 text-sm mb-3">
                WhatsApp message delivery is billed separately by your provider (e.g. Twilio).
              </p>
              <ul className="text-sm text-amber-800 space-y-1 mb-3">
                <li><strong>WhachatCRM does not charge per message.</strong></li>
                <li>Your plan only controls how many conversations you manage inside the CRM.</li>
                <li>This keeps pricing transparent and predictable.</li>
              </ul>
              <p className="text-sm text-amber-800">
                <strong>View message costs for US and international use:</strong>{" "}
                <a 
                  href="https://www.twilio.com/en-us/whatsapp/pricing" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-amber-900 hover:text-amber-700 underline"
                >
                  Twilio WhatsApp Pricing
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* What is an Active Conversation */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <HelpCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">What Is an "Active Conversation"?</h3>
              <p className="text-blue-800 text-sm mb-2">An active conversation is:</p>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>One unique WhatsApp contact within a rolling 30-day window</li>
                <li>Unlimited messages can happen inside that conversation — the count stays the same</li>
              </ul>
            </div>
          </div>
        </div>

        {/* What Happens at Limit */}
        <div className="mt-8 bg-gray-100 border border-gray-200 rounded-xl p-6">
          <h3 className="font-semibold text-gray-900 mb-3">What Happens When I Reach My Limit?</h3>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="text-gray-700">Inbound messages continue normally</span>
            </div>
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <span className="text-gray-700">Outbound replies are paused</span>
            </div>
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="text-gray-700">You'll see a clear upgrade prompt</span>
            </div>
            <div className="flex items-start gap-2">
              <Zap className="h-4 w-4 text-brand-green shrink-0 mt-0.5" />
              <span className="text-gray-700">Upgrade instantly — no downtime</span>
            </div>
          </div>
          <p className="text-sm text-gray-600 mt-4 font-medium">You're always in control.</p>
        </div>

        {/* FAQ Section */}
        <div className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="pay-twice" className="bg-white border border-gray-200 rounded-xl px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900 hover:no-underline" data-testid="faq-pay-twice">
                Do I pay twice — once to Twilio and once to WhachatCRM?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                <p className="mb-3">No. You're paying for two different things:</p>
                <ul className="list-disc list-inside space-y-1 mb-3">
                  <li><strong>Twilio (or provider):</strong> WhatsApp message delivery</li>
                  <li><strong>WhachatCRM:</strong> Managing conversations, teams, notes, tasks & workflows</li>
                </ul>
                <p>Think of it like email: Gmail sends emails, CRM manages customers.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="no-message-fees" className="bg-white border border-gray-200 rounded-xl px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900 hover:no-underline" data-testid="faq-no-message-fees">
                Why don't your plans include WhatsApp message fees?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                <p className="mb-3">Because WhatsApp pricing varies by:</p>
                <ul className="list-disc list-inside space-y-1 mb-3">
                  <li>Country</li>
                  <li>Message type</li>
                  <li>Volume</li>
                </ul>
                <p className="mb-3">By letting customers connect their own provider:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>You avoid hidden fees</li>
                  <li>Costs stay transparent</li>
                  <li>You keep full control</li>
                </ul>
                <p className="mt-3">This is the standard SaaS model.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="need-twilio" className="bg-white border border-gray-200 rounded-xl px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900 hover:no-underline" data-testid="faq-need-twilio">
                Do I need a Twilio account?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                <p className="mb-3">Yes — currently WhachatCRM supports WhatsApp Business API via Twilio.</p>
                <ul className="list-disc list-inside space-y-1 mb-3">
                  <li>If you already use Twilio, you can connect in minutes.</li>
                  <li>If not, we guide you step-by-step during setup.</li>
                </ul>
                <p className="text-amber-700 font-medium">The WhatsApp Business mobile app is not supported.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="why-twilio" className="bg-white border border-gray-200 rounded-xl px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900 hover:no-underline" data-testid="faq-why-twilio">
                Why only Twilio?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                <p className="mb-3">Twilio offers:</p>
                <ul className="list-disc list-inside space-y-1 mb-3">
                  <li>Fast WhatsApp approval</li>
                  <li>Reliable infrastructure</li>
                  <li>Clear compliance rules</li>
                  <li>Easier setup for non-technical teams</li>
                </ul>
                <p>We're designing WhachatCRM to support additional WhatsApp providers in the future, based on customer demand.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="other-providers" className="bg-white border border-gray-200 rounded-xl px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900 hover:no-underline" data-testid="faq-other-providers">
                I already use another WhatsApp provider. Can I still use WhachatCRM?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                <p className="mb-3">Not yet — but we're collecting demand.</p>
                <p className="mb-3">If you use providers like:</p>
                <ul className="list-disc list-inside space-y-1 mb-3">
                  <li>360dialog</li>
                  <li>Gupshup</li>
                  <li>Meta Cloud API</li>
                </ul>
                <p>You can contact us and help shape future integrations.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="upgrade-downgrade" className="bg-white border border-gray-200 rounded-xl px-6">
              <AccordionTrigger className="text-left font-semibold text-gray-900 hover:no-underline" data-testid="faq-upgrade-downgrade">
                Can I upgrade or downgrade anytime?
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                Yes. Plans are monthly, flexible, and update instantly.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Footer CTA */}
        <div className="mt-16 bg-gray-900 rounded-2xl p-4 sm:p-8 text-center text-white overflow-hidden">
          <div className="flex justify-center mb-4">
            <Shield className="h-10 w-10 text-brand-green" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold mb-2">Start Free. Upgrade When WhatsApp Works for You.</h2>
          <p className="text-gray-400 mb-6 max-w-lg mx-auto text-sm sm:text-base">
            WhachatCRM uses the official WhatsApp Business API. Your data is secure and compliant with Meta's policies.
          </p>
          <Link href="/auth">
            <Button className="bg-brand-green hover:bg-emerald-700 text-white px-4 sm:px-8 whitespace-normal h-auto py-3" data-testid="button-start-free-footer">
              <span className="hidden sm:inline">Start Free — No Credit Card Required</span>
              <span className="sm:hidden">Start Free — No Card Required</span>
            </Button>
          </Link>
        </div>

        {/* Legal Disclaimer */}
        <div className="mt-8 text-center text-xs text-gray-400 space-y-1">
          <p>WhachatCRM is a CRM platform and is not affiliated with Meta or WhatsApp.</p>
          <p>WhatsApp Business API access is provided by approved third-party providers.</p>
        </div>
      </div>
    </div>
  );
}
