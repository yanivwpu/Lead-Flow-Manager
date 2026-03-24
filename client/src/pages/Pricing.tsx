import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Check, X, Loader2, Shield, Brain, Sparkles,
  Zap, MessageSquare, Users, Phone, BarChart3
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { getDirection } from "@/lib/i18n";

const CheckIcon = () => <Check className="w-4 h-4 text-emerald-500 mx-auto" />;
const DashIcon = () => <span className="text-gray-300 mx-auto block text-center">—</span>;

export function Pricing() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const isRTL = getDirection() === "rtl";

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
      if (res.status === 401) {
        setLocation("/auth?redirect=/pricing");
        throw new Error("session_expired");
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create checkout");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, "_blank");
        setLoadingPlan(null);
      }
    },
    onError: (error: any) => {
      if (error.message !== "session_expired") {
        toast({
          title: "Error",
          description: error.message || "Failed to start checkout",
          variant: "destructive",
        });
      }
      setLoadingPlan(null);
    },
  });

  const handleUpgrade = (planId: string) => {
    if (!user) {
      setLocation("/auth?redirect=/pricing");
      return;
    }
    if (planId === "free") return;
    setLoadingPlan(planId);
    checkoutMutation.mutate(planId);
  };

  const getPlanIndex = (planId: string) => ["free", "starter", "pro"].indexOf(planId);
  const currentPlanIndex = getPlanIndex(currentPlan);
  const canAccessAIBrain = currentPlan === "starter" || currentPlan === "pro";

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className={`min-h-screen bg-gray-50 ${isRTL ? "text-right" : "text-left"}`}
    >
      <Helmet>
        <title>Pricing – Free Forever | WhachatCRM</title>
        <meta name="description" content="Simple, transparent pricing for WhatsApp CRM. Free plan forever, Starter at $19/mo, Pro at $49/mo. No hidden fees, no message markup. Start free today." />
        <link rel="canonical" href="https://whachatcrm.com/pricing" />
        <meta property="og:title" content="WhachatCRM Pricing: Free Plan Forever, Starter from $19/mo" />
        <meta property="og:description" content="Simple, transparent pricing for WhatsApp CRM. Free plan forever, Starter at $19/mo. No hidden fees." />
        <meta property="og:url" content="https://whachatcrm.com/pricing" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="WhachatCRM Pricing: Free Plan Forever" />
        <meta name="twitter:description" content="Simple pricing for WhatsApp CRM. Free plan forever, Starter at $19/mo." />
      </Helmet>

      <div className="max-w-6xl 2xl:max-w-7xl mx-auto px-4 py-10">

        <Link href={user ? "/app/settings" : "/"}>
          <a className={`inline-flex items-center text-sm text-gray-500 hover:text-brand-green mb-8 ${isRTL ? "flex-row-reverse" : ""}`}>
            <ArrowLeft className={`h-4 w-4 ${isRTL ? "ml-2 rotate-180" : "mr-2"}`} />
            {user ? "Back to Settings" : "Back to Home"}
          </a>
        </Link>

        {/* ─────────────── SECTION 1: HERO ─────────────── */}
        <div className="text-center mb-14">
          <h1 className="text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-4" data-testid="text-pricing-hero-title">
            Simple, transparent pricing for growing conversations
          </h1>
          <p className="text-lg xl:text-xl text-gray-600 max-w-2xl xl:max-w-3xl mx-auto mb-2">
            Start free and upgrade when you're ready for more AI assistance, automation, and team capacity.
            No message markups — connect your own WhatsApp through Meta or Twilio.
          </p>
          <p className="text-sm text-gray-500 max-w-2xl mx-auto">
            Built for businesses that want one inbox, better follow-up, and smarter lead handling across messaging channels.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            <span className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2 rounded-full text-sm font-medium">
              <Shield className="h-4 w-4" />
              No message markups
            </span>
            <span className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-2 rounded-full text-sm font-medium">
              <Check className="h-4 w-4" />
              Cancel anytime
            </span>
            <span className="inline-flex items-center gap-2 bg-purple-50 border border-purple-200 text-purple-800 px-4 py-2 rounded-full text-sm font-medium">
              <Sparkles className="h-4 w-4" />
              AI included in paid plans
            </span>
          </div>
        </div>

        {/* ─────────────── SECTION 2: COPILOT EXPLANATION ─────────────── */}
        <div className="mb-14" data-testid="section-copilot">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-display font-bold text-gray-900 mb-3">
              Copilot grows with your plan
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              WhachatCRM includes built-in AI assistance to help your team respond faster and work smarter.
              Higher plans unlock stronger Copilot capabilities, more included AI usage, and access to AI Brain
              for deeper automation and qualification.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Card 1 */}
            <div className="bg-white rounded-2xl border border-blue-100 p-6" data-testid="copilot-card-starter">
              <div className="h-10 w-10 bg-blue-100 rounded-xl flex items-center justify-center mb-3">
                <MessageSquare className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1">Starter AI Assist</h3>
              <p className="text-sm text-gray-500 mb-4">Included in Starter for day-to-day help inside chats.</p>
              <ul className="space-y-2">
                {["Reply suggestions", "Sentiment detection", "Up to 50 AI actions per month"].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-700">
                    <Check className="h-4 w-4 text-blue-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Card 2 */}
            <div className="bg-white rounded-2xl border border-emerald-100 p-6" data-testid="copilot-card-pro">
              <div className="h-10 w-10 bg-emerald-100 rounded-xl flex items-center justify-center mb-3">
                <Zap className="h-5 w-5 text-emerald-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1">Pro Enhanced AI Assist</h3>
              <p className="text-sm text-gray-500 mb-4">Included in Pro for stronger AI support across conversations.</p>
              <ul className="space-y-2">
                {[
                  "Higher-quality suggestions",
                  "Conversation insights",
                  "More advanced assistance in the inbox",
                  "Up to 200 AI actions per month",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-700">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Card 3 */}
            <div className="bg-white rounded-2xl border border-purple-100 p-6" data-testid="copilot-card-ai-brain">
              <div className="h-10 w-10 bg-purple-100 rounded-xl flex items-center justify-center mb-3">
                <Brain className="h-5 w-5 text-purple-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1">AI Brain add-on</h3>
              <p className="text-sm text-gray-500 mb-4">Available on Starter and Pro for deeper AI-powered qualification and workflow support.</p>
              <ul className="space-y-2">
                {[
                  "Smarter AI assistance",
                  "Deeper lead understanding",
                  "Expanded AI capabilities across conversations",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-700">
                    <Check className="h-4 w-4 text-purple-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-xs text-gray-500 text-center mt-4">
            AI Brain enhances intelligence, but Pro remains the plan for advanced system capabilities like lead scoring and smart retargeting.
          </p>
        </div>

        {/* ─────────────── SECTION 2b: USE-CASE STRIP ─────────────── */}
        <div className="mb-14" data-testid="section-use-cases">
          <h2 className="text-xl font-display font-bold text-gray-900 text-center mb-6">
            How businesses use WhachatCRM
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: <Users className="h-5 w-5 text-blue-600" />,
                bg: "bg-blue-50",
                text: "Capture leads from ads, website, and social channels into one shared inbox",
              },
              {
                icon: <MessageSquare className="h-5 w-5 text-emerald-600" />,
                bg: "bg-emerald-50",
                text: "Respond instantly through WhatsApp with your entire team in one place",
              },
              {
                icon: <Zap className="h-5 w-5 text-purple-600" />,
                bg: "bg-purple-50",
                text: "Qualify and route serious leads with smarter AI-powered follow-up",
              },
            ].map((item, i) => (
              <div key={i} className={`${item.bg} rounded-2xl p-5 flex items-start gap-4`}>
                <div className="shrink-0 mt-0.5">{item.icon}</div>
                <p className="text-sm font-medium text-gray-800 leading-snug">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ─────────────── SECTION 3: PRICING CARDS ─────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-14" data-testid="section-pricing-cards">

          {/* FREE */}
          {(() => {
            const isCurrentPlan = currentPlan === "free";
            const canUpgrade = getPlanIndex("free") > currentPlanIndex;
            return (
              <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 flex flex-col" data-testid="plan-card-free">
                <div className="mb-5">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Free</span>
                  <div className="flex items-baseline gap-1 mt-1 mb-1">
                    <span className="text-3xl font-bold text-gray-900">$0</span>
                    <span className="text-sm text-gray-500">/mo</span>
                  </div>
                  <p className="text-sm text-gray-500">Best for getting started</p>
                </div>
                <ul className="space-y-3 flex-1">
                  {[
                    "50 active conversations",
                    "1 user",
                    "1 WhatsApp number",
                    "Unified inbox",
                    "CRM basics",
                    "Tags, notes, and contact management",
                    "Live chat widget",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-gray-400 mt-4 mb-4">Upgrade when you need more users, more conversations, and built-in AI assistance.</p>
                <Button
                  className="w-full bg-gray-100 text-gray-700 hover:bg-gray-200"
                  onClick={() => setLocation(user ? "/app/chats" : "/auth")}
                  disabled={isCurrentPlan}
                  data-testid="button-upgrade-free"
                >
                  {isCurrentPlan ? "Current Plan" : "Start Free"}
                </Button>
              </div>
            );
          })()}

          {/* STARTER */}
          {(() => {
            const isCurrentPlan = currentPlan === "starter";
            const isLoading = loadingPlan === "starter";
            return (
              <div className="bg-white rounded-2xl border-2 border-blue-200 p-6 flex flex-col" data-testid="plan-card-starter">
                <div className="mb-5">
                  <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Starter</span>
                  <div className="flex items-baseline gap-1 mt-1 mb-1">
                    <span className="text-3xl font-bold text-gray-900">$19</span>
                    <span className="text-sm text-gray-500">/mo</span>
                  </div>
                  <p className="text-sm text-gray-500">For businesses managing more conversations with built-in AI help</p>
                </div>
                <ul className="space-y-3 flex-1">
                  {[
                    "500 active conversations",
                    "Up to 3 users",
                    "1 WhatsApp number",
                    "Unified inbox across channels",
                    "Full CRM",
                    "Tags, notes, pipeline, and tasks",
                    "AI Assist included — up to 50/month",
                    "Reply suggestions and sentiment detection",
                    "Basic automations",
                    "Live chat widget",
                    "Supports AI Brain add-on",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-gray-400 mt-4 mb-4">Upgrade to Pro to automatically identify hot leads and follow up with less manual work.</p>
                <Button
                  className={`w-full ${isCurrentPlan ? "bg-gray-100 text-gray-500" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                  disabled={isCurrentPlan || isLoading}
                  onClick={() => handleUpgrade("starter")}
                  data-testid="button-upgrade-starter"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : isCurrentPlan ? "Current Plan" : "Upgrade to Starter"}
                </Button>
              </div>
            );
          })()}

          {/* PRO */}
          {(() => {
            const isCurrentPlan = currentPlan === "pro";
            const isLoading = loadingPlan === "pro";
            return (
              <div className="bg-white rounded-2xl border-2 border-brand-green shadow-lg p-6 flex flex-col relative" data-testid="plan-card-pro">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-green text-white text-xs font-semibold px-3 py-1 rounded-full">
                  Most Popular
                </div>
                <div className="mb-5 mt-2">
                  <span className="text-xs font-semibold text-brand-green uppercase tracking-wider">Pro</span>
                  <div className="flex items-baseline gap-1 mt-1 mb-1">
                    <span className="text-3xl font-bold text-gray-900">$49</span>
                    <span className="text-sm text-gray-500">/mo</span>
                  </div>
                  <p className="text-sm text-gray-500">For teams ready to automate follow-up, identify hot leads, and scale conversations</p>
                </div>
                <ul className="space-y-3 flex-1">
                  {[
                    "2,000 active conversations",
                    "Multiple users",
                    "Up to 5 WhatsApp numbers for teams and multi-agent setups",
                    "Unified inbox + smart channel handling",
                    "Full CRM",
                    "AI Assist included — up to 200/month",
                    "Enhanced AI assistance and inbox insights",
                    "Advanced automations",
                    "AI lead scoring — automatically identify hotter leads",
                    "Smart retargeting — follow up beyond normal WhatsApp reply windows",
                    "Integrations & webhooks",
                    "Supports AI Brain add-on",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="h-4 w-4 text-brand-green shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-gray-400 mt-4 mb-4">Best for businesses that want the system to help identify serious leads and automate follow-up.</p>
                <Button
                  className={`w-full ${isCurrentPlan ? "bg-gray-100 text-gray-500" : "bg-brand-green hover:bg-emerald-700 text-white"}`}
                  disabled={isCurrentPlan || isLoading}
                  onClick={() => handleUpgrade("pro")}
                  data-testid="button-upgrade-pro"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : isCurrentPlan ? "Current Plan" : "Upgrade to Pro"}
                </Button>
              </div>
            );
          })()}

          {/* AI BRAIN ADD-ON */}
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl border-2 border-purple-200 p-6 flex flex-col" data-testid="plan-card-ai-brain">
            <div className="mb-5">
              <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider">AI Brain</span>
              <div className="flex items-baseline gap-1 mt-1 mb-1">
                <span className="text-3xl font-bold text-gray-900">+$29</span>
                <span className="text-sm text-gray-500">/mo</span>
              </div>
              <p className="text-sm text-gray-500">Add deeper AI assistance for smarter qualification and conversation support</p>
            </div>
            <ul className="space-y-3 flex-1">
              {[
                "Works with Starter and Pro",
                "Expands Copilot capabilities",
                "Deeper lead understanding",
                "Smarter AI assistance across conversations",
                "More advanced AI-powered workflow support",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                  <Check className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 mt-4 mb-4">Enhances AI intelligence — Pro remains the plan for lead scoring and smart retargeting.</p>
            {canAccessAIBrain ? (
              <Link href="/app/ai-brain">
                <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white" data-testid="button-ai-brain-go">
                  <Brain className="w-4 h-4 mr-2" />
                  Add AI Brain
                </Button>
              </Link>
            ) : (
              <Button
                className="w-full bg-gray-900 hover:bg-gray-800 text-white"
                onClick={() => handleUpgrade("starter")}
                disabled={loadingPlan === "starter"}
                data-testid="button-upgrade-for-ai-brain"
              >
                {loadingPlan === "starter" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Get Starter to unlock
              </Button>
            )}
          </div>
        </div>

        {/* ─────────────── SECTION 4: COMPARISON TABLE ─────────────── */}
        <div className="mb-14" data-testid="section-comparison-table">
          <h2 className="text-2xl font-display font-bold text-gray-900 text-center mb-8">
            Compare plans
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-4 px-5 font-semibold text-gray-700 w-[40%]">Feature</th>
                  <th className="text-center py-4 px-3 font-semibold text-gray-700">Free</th>
                  <th className="text-center py-4 px-3 font-semibold text-blue-700">Starter</th>
                  <th className="text-center py-4 px-3 font-semibold text-brand-green">Pro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  { feature: "Active conversations", free: "50", starter: "500", pro: "2,000" },
                  { feature: "Users", free: "1", starter: "Up to 3", pro: "Multiple" },
                  { feature: "WhatsApp numbers", free: "1", starter: "1", pro: "5" },
                  { feature: "Unified inbox", free: true, starter: true, pro: true },
                  { feature: "CRM", free: "Basic", starter: "Full", pro: "Full" },
                  { feature: "Pipeline & tasks", free: true, starter: true, pro: true },
                  { feature: "AI Assist included", free: false, starter: "50/month", pro: "200/month" },
                  { feature: "AI Assist type", free: false, starter: "Reply suggestions + sentiment", pro: "Enhanced AI assistance" },
                  { feature: "Automations", free: false, starter: "Basic", pro: "Advanced" },
                  { feature: "Lead scoring", free: false, starter: false, pro: true },
                  { feature: "Smart retargeting", free: false, starter: false, pro: true },
                  { feature: "Integrations & webhooks", free: false, starter: false, pro: true },
                  { feature: "AI Brain add-on", free: false, starter: true, pro: true },
                ].map((row, idx) => (
                  <tr key={row.feature} className={idx % 2 === 0 ? "bg-gray-50/40" : ""}>
                    <td className="py-3 px-5 font-medium text-gray-800">{row.feature}</td>
                    {([row.free, row.starter, row.pro] as (boolean | string)[]).map((val, i) => (
                      <td key={i} className="py-3 px-3 text-center text-sm">
                        {val === true ? (
                          <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                        ) : val === false ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <span className="text-gray-700">{val}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─────────────── SECTION 5: FAQ ─────────────── */}
        <div className="mb-14 max-w-3xl mx-auto" data-testid="section-faq">
          <h2 className="text-2xl font-display font-bold text-gray-900 text-center mb-8">
            Common questions
          </h2>
          <div className="space-y-4">
            {[
              {
                q: "What are active conversations?",
                a: "Active conversations are contacts you interact with during your billing cycle — not individual messages.",
              },
              {
                q: "Do you charge per message?",
                a: "No. You connect your own Meta or Twilio account and pay them directly. WhachatCRM does not add message markups.",
              },
              {
                q: "Can I upgrade later?",
                a: "Yes. You can move to a higher plan as your team, conversation volume, and automation needs grow.",
              },
              {
                q: "What's the difference between Pro and AI Brain?",
                a: "Pro unlocks advanced platform capabilities like lead scoring and smart retargeting. AI Brain is an add-on that expands AI intelligence on Starter or Pro.",
              },
            ].map((item, idx) => (
              <div key={idx} className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="font-semibold text-gray-900 mb-2">{item.q}</p>
                <p className="text-sm text-gray-600 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ─────────────── SECTION 6: FINAL CTA ─────────────── */}
        <div className="bg-gray-900 rounded-2xl p-8 md:p-12 text-center text-white" data-testid="section-final-cta">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-4">
            Start simple. Upgrade when your conversations grow.
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto mb-8">
            Whether you're handling a small number of leads or managing conversations across a team, WhachatCRM
            gives you a clear path from basic inbox management to smarter AI-assisted follow-up.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              className="h-12 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full"
              onClick={() => setLocation(user ? "/app/chats" : "/auth")}
              data-testid="button-cta-start-free"
            >
              Start Free
            </Button>
            <Link href="/contact">
              <Button
                variant="outline"
                className="h-12 px-8 border-gray-700 text-gray-300 hover:bg-gray-800 rounded-full"
                data-testid="button-cta-talk-to-sales"
              >
                Talk to Sales
              </Button>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
