import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Zap, Users, MessageSquare, Phone, Loader2, Shield, AlertTriangle, HelpCircle, XCircle, Brain, Sparkles, Target, BarChart3, X } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getDirection } from "@/lib/i18n";

const PLAN_FEATURE_KEYS = {
  free: [
    "unifiedInbox",
    "whatsappWebchat",
    "websiteWidget",
    "oneUser",
    "activeConversations50",
    "autoRouting",
    "tagsNotes",
    "tasksReminders",
    "smartPrioritization",
    "awayMessages",
    "exportConversations",
    "communitySupport",
  ],
  starter: [
    "everythingFree",
    "allChannels",
    "tiktokIntake",
    "threeUsers",
    "activeConversations500",
    "chatbotBuilder",
    "autoReply",
    "smartFallback",
    "csvImport",
    "notifications",
    "webhooks3",
    "aiAssistBasic",
    "aiBrainAddon",
  ],
  pro: [
    "everythingStarter",
    "fiveNumbers",
    "unlimitedTeam",
    "activeConversations2000",
    "dripSequences",
    "workflowAutomation",
    "templateMessaging",
    "webhooks10",
    "prioritySupport",
    "aiAssistEnhanced",
    "aiBrainAddon",
  ],
};

const PLANS = [
  {
    id: "free",
    name: "Free",
    badge: "Forever Free",
    price: 0,
    popular: false,
  },
  {
    id: "starter",
    name: "Starter",
    badge: null,
    price: 19,
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    badge: null,
    price: 49,
    popular: false,
  },
];

export function Pricing() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const isRTL = getDirection() === 'rtl';

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
    <div dir={isRTL ? 'rtl' : 'ltr'} className={`min-h-screen bg-gray-50 py-12 px-4 ${isRTL ? 'text-right' : 'text-left'}`}>
      <Helmet>
        <title>WhachatCRM Pricing: Free Plan Forever, Starter from $19/mo | WhatsApp CRM</title>
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
      <div className="max-w-5xl mx-auto">
        <Link href={user ? "/app/settings" : "/"}>
          <a className={`inline-flex items-center text-sm text-gray-500 hover:text-brand-green mb-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <ArrowLeft className={`h-4 w-4 ${isRTL ? 'ml-2 rotate-180' : 'mr-2'}`} />
            {user ? t('pricing.backToSettings') : t('pricing.backToHome')}
          </a>
        </Link>

        <div className="text-center mb-12">
          <h1 className="text-4xl font-display font-bold text-gray-900 mb-4">
            {t('pricing.title')}
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            {t('pricing.subtitle')}
          </p>
          <p className="text-gray-500 mt-2 max-w-2xl mx-auto">
            {t('pricing.subtitle2')}
          </p>
          
          <div className="flex flex-wrap justify-center gap-4 mt-6">
            <div className={`inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2 rounded-full text-sm font-medium ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Shield className="h-4 w-4" />
              {t('pricing.unlimitedMessages')}
            </div>
            <div className={`inline-flex items-center gap-2 bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded-full text-sm font-medium ${isRTL ? 'flex-row-reverse' : ''}`}>
              <XCircle className="h-4 w-4" />
              {t('pricing.noPerMessageFees')}
            </div>
            <div className={`inline-flex items-center gap-2 bg-purple-50 border border-purple-200 text-purple-800 px-4 py-2 rounded-full text-sm font-medium ${isRTL ? 'flex-row-reverse' : ''}`}>
              <XCircle className="h-4 w-4" />
              {t('pricing.cancelAnytime')}
            </div>
          </div>
        </div>

        <div className={`grid md:grid-cols-3 gap-6 ${isRTL ? 'md:grid-flow-col-dense' : ''}`}>
          {PLANS.map((plan) => {
            const isCurrentPlan = plan.id === currentPlan;
            const currentPlanIndex = getPlanIndex(currentPlan);
            const thisPlanIndex = getPlanIndex(plan.id);
            const canUpgrade = thisPlanIndex > currentPlanIndex;
            const isLoading = loadingPlan === plan.id;

            return (
              <div
                key={plan.id}
                className={`bg-white rounded-2xl border-2 p-6 flex flex-col relative ${
                  plan.popular
                    ? "border-brand-green shadow-lg"
                    : "border-gray-200"
                }`}
                data-testid={`plan-card-${plan.id}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-green text-white text-xs font-semibold px-3 py-1 rounded-full z-10">
                    {t('pricing.mostPopular')}
                  </div>
                )}


                <div className="mb-6 mt-4">
                  <div className={`flex items-center gap-2 mb-1 ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
                    <h3 className="text-xl font-bold text-gray-900">{t(`pricing.plans.${plan.id}.name`, plan.name)}</h3>
                    {plan.badge && (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                        {plan.id === 'free' ? t('pricing.foreverFree') : plan.badge}
                      </span>
                    )}
                  </div>
                  <div className={`flex items-baseline gap-1 mb-2 ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
                    <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
                    {plan.price > 0 && <span className="text-gray-500">{t('pricing.perMonth')}</span>}
                  </div>
                  <p className="text-sm text-gray-600">{t(`pricing.plans.${plan.id}.description`)}</p>
                </div>

                <ul 
                  dir={isRTL ? 'rtl' : 'ltr'} 
                  className={`space-y-4 mt-6 ${isRTL ? 'text-right' : 'text-left'}`}
                >
                  {PLAN_FEATURE_KEYS[plan.id as keyof typeof PLAN_FEATURE_KEYS].map((featureKey, i) => (
                    <li key={i} className="flex items-center gap-4">
                      <Check className="h-5 w-5 text-brand-green shrink-0" />
                      <span className="text-gray-700">{t(`pricing.features.${featureKey}`)}</span>
                    </li>
                  ))}
                </ul>

                <p className="text-xs text-gray-500 mb-4 italic">{t(`pricing.plans.${plan.id}.note`)}</p>

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
                    t('pricing.currentPlan')
                  ) : (
                    t(`pricing.plans.${plan.id}.cta`)
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Full AI Brain Add-on */}
        <div className="mt-16 md:mt-20 max-w-2xl mx-auto">
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-200 rounded-2xl p-6 sm:p-8 relative overflow-hidden">
            {/* Badge - fixed positioning to prevent touching price */}
            <span className={`absolute top-4 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium ${isRTL ? '-left-2 rounded-l-none' : '-right-2 rounded-r-none'}`}>
              {t('pricing.aiBrain.addon')}
            </span>
            
            {/* Header with icon - extra top margin to give badge space */}
            <div className="flex items-center gap-3 mt-8 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">{t('pricing.aiBrain.title')}</h3>
                <p className="text-sm text-gray-600">{t('pricing.aiBrain.subtitle')}</p>
              </div>
            </div>
            
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-3xl font-bold text-gray-900">{t('pricing.aiBrain.price')}</span>
              <span className="text-gray-600">{t('pricing.aiBrain.perMonth')}</span>
            </div>
            
            <p className="text-sm text-gray-700 mb-4 bg-purple-100/50 p-3 rounded-lg">
              {t('pricing.aiBrain.description')}
            </p>
            
            {/* Feature list with icons */}
            <div className="grid gap-3 mb-6">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-700">{t('pricing.aiBrain.feature1')}</span>
              </div>
              <div className="flex items-start gap-2">
                <Target className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-700">{t('pricing.aiBrain.feature2')}</span>
              </div>
              <div className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-700">{t('pricing.aiBrain.feature3')}</span>
              </div>
              <div className="flex items-start gap-2">
                <MessageSquare className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-700">{t('pricing.aiBrain.feature4')}</span>
              </div>
            </div>
            
            <p className="text-xs text-gray-500 mb-4">
              {t('pricing.aiBrain.availableFor')}
            </p>
            
            {currentPlan === 'starter' || currentPlan === 'pro' ? (
              <Link href="/app/ai-brain">
                <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white" data-testid="button-ai-brain-setup">
                  <Brain className={`w-4 h-4 ${isRTL ? 'ms-2' : 'me-2'}`} />
                  {t('pricing.aiBrain.unlockButton')}
                </Button>
              </Link>
            ) : (
              <Button 
                className="w-full bg-gray-900 hover:bg-gray-800 text-white"
                onClick={() => handleUpgrade('starter')}
                disabled={loadingPlan === 'starter'}
                data-testid="button-upgrade-for-ai"
              >
                {loadingPlan === 'starter' ? <Loader2 className={`w-4 h-4 animate-spin ${isRTL ? 'ms-2' : 'me-2'}`} /> : null}
                {t('pricing.aiBrain.getStarterButton')}
              </Button>
            )}
            
            <div className="mt-4 pt-4 border-t border-purple-200">
              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full border-purple-300 text-purple-700 hover:bg-purple-50"
                    data-testid="button-view-ai-comparison"
                  >
                    <BarChart3 className="w-4 h-4 mr-2" />
                    View AI Features Comparison
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-0 border-none shadow-2xl">
                  <div className="bg-white rounded-lg overflow-hidden">
                    <DialogHeader className="p-6 pb-2">
                      <DialogTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Brain className="w-6 h-6 text-purple-600" />
                        AI Features Comparison
                      </DialogTitle>
                    </DialogHeader>
                    
                    <div className="px-6 pb-8">
                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gradient-to-r from-purple-600 to-blue-600 text-white">
                              <th className="text-left py-3 px-4 font-medium">Feature</th>
                              <th className="text-center py-3 px-4 font-medium">Free</th>
                              <th className="text-center py-3 px-4 font-medium">Starter</th>
                              <th className="text-center py-3 px-4 font-medium">Pro</th>
                              <th className="text-center py-3 px-4 font-medium">AI Brain</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            <tr className="bg-gray-50/50">
                              <td className="py-3 px-4 font-medium text-gray-900">Website Widget</td>
                              <td className="text-center py-3 px-4"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                              <td className="text-center py-3 px-4"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                              <td className="text-center py-3 px-4"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                              <td className="text-center py-3 px-4"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                            </tr>
                            <tr>
                              <td className="py-3 px-4 font-medium text-gray-900">Smart Task Prioritization</td>
                              <td className="text-center py-3 px-4"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                              <td className="text-center py-3 px-4"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                              <td className="text-center py-3 px-4"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                              <td className="text-center py-3 px-4"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                            </tr>
                            <tr className="bg-gray-50/50">
                              <td className="py-3 px-4 font-medium text-gray-900">Automation Flows</td>
                              <td className="text-center py-3 px-4 text-gray-400">—</td>
                              <td className="text-center py-3 px-4 text-emerald-500 font-bold">Unlimited</td>
                              <td className="text-center py-3 px-4 text-emerald-500 font-bold">Unlimited</td>
                              <td className="text-center py-3 px-4 text-purple-600 font-bold">Unlimited</td>
                            </tr>
                            <tr>
                              <td className="py-3 px-4 font-medium text-gray-900">Smart Reply Suggestions</td>
                              <td className="text-center py-3 px-4 text-gray-400">—</td>
                              <td className="text-center py-3 px-4 text-gray-700">50/mo</td>
                              <td className="text-center py-3 px-4 text-gray-700">200/mo</td>
                              <td className="text-center py-3 px-4 text-purple-600 font-bold">Unlimited</td>
                            </tr>
                            <tr className="bg-gray-50/50">
                              <td className="py-3 px-4 font-medium text-gray-900">Sentiment Detection</td>
                              <td className="text-center py-3 px-4 text-gray-400">—</td>
                              <td className="text-center py-3 px-4 text-gray-700">50/mo</td>
                              <td className="text-center py-3 px-4 text-gray-700">200/mo</td>
                              <td className="text-center py-3 px-4 text-purple-600 font-bold">Unlimited</td>
                            </tr>
                            <tr>
                              <td className="py-3 px-4 font-medium text-gray-900">Lead Qualification & Scoring</td>
                              <td className="text-center py-3 px-4 text-gray-400">—</td>
                              <td className="text-center py-3 px-4 text-gray-400">—</td>
                              <td className="text-center py-3 px-4 text-gray-400">—</td>
                              <td className="text-center py-3 px-4"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                            </tr>
                            <tr className="bg-gray-50/50">
                              <td className="py-3 px-4 font-medium text-gray-900">Human Handoff Keywords</td>
                              <td className="text-center py-3 px-4 text-gray-400">—</td>
                              <td className="text-center py-3 px-4 text-gray-400">—</td>
                              <td className="text-center py-3 px-4 text-gray-400">—</td>
                              <td className="text-center py-3 px-4"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                            </tr>
                            <tr>
                              <td className="py-3 px-4 font-medium text-gray-900">Business Knowledge Base</td>
                              <td className="text-center py-3 px-4 text-gray-400">—</td>
                              <td className="text-center py-3 px-4 text-gray-400">—</td>
                              <td className="text-center py-3 px-4 text-gray-400">—</td>
                              <td className="text-center py-3 px-4"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                            </tr>
                            <tr className="bg-gray-50/50">
                              <td className="py-3 px-4 font-medium text-gray-900">Plain English Automation</td>
                              <td className="text-center py-3 px-4 text-gray-400">—</td>
                              <td className="text-center py-3 px-4 text-gray-400">—</td>
                              <td className="text-center py-3 px-4 text-gray-400">—</td>
                              <td className="text-center py-3 px-4"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                            </tr>
                            <tr>
                              <td className="py-3 px-4 font-medium text-gray-900">AI Health Monitoring</td>
                              <td className="text-center py-3 px-4 text-gray-400">—</td>
                              <td className="text-center py-3 px-4 text-gray-700">Basic</td>
                              <td className="text-center py-3 px-4 text-gray-700">Basic</td>
                              <td className="text-center py-3 px-4 text-purple-600 font-bold">Full</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      
                      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-500 mb-1">Free</p>
                          <p className="font-bold text-gray-900">$0</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-100">
                          <p className="text-xs text-blue-600 mb-1">Starter</p>
                          <p className="font-bold text-gray-900">$19<span className="text-xs font-normal">/mo</span></p>
                        </div>
                        <div className="bg-emerald-50 rounded-lg p-3 text-center border border-emerald-100">
                          <p className="text-xs text-emerald-600 mb-1">Pro</p>
                          <p className="font-bold text-gray-900">$49<span className="text-xs font-normal">/mo</span></p>
                        </div>
                        <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-3 text-center border border-purple-100">
                          <p className="text-xs text-purple-600 mb-1">AI Brain</p>
                          <p className="font-bold text-gray-900">+$29<span className="text-xs font-normal">/mo</span></p>
                        </div>
                      </div>
                      
                      <div className="mt-6 bg-purple-50 rounded-xl p-4 border border-purple-100">
                        <h4 className="font-semibold text-purple-900 mb-2 flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-purple-500" />
                          AI Tier Breakdown
                        </h4>
                        <ul className="text-sm text-purple-800 space-y-1.5">
                          <li className="flex gap-2">
                            <span className="text-purple-400">•</span>
                            <span><strong>AI Recommended:</strong> Smart prioritization based on engagement & urgency (all plans)</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-purple-400">•</span>
                            <span><strong>AI Assist:</strong> Reply suggestions & sentiment detection with quotas (Starter/Pro)</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-purple-400">•</span>
                            <span><strong>Full AI Brain:</strong> Unlimited AI + lead qualification, automation & more (+$29/mo)</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* Important Notice */}
        <div className="mt-12 bg-amber-50 border border-amber-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900 mb-2">{t('pricing.notices.messageCosts.title')}</h3>
              <p className="text-amber-800 text-sm mb-3">
                {t('pricing.notices.messageCosts.description')}
              </p>
              <ul dir={isRTL ? 'rtl' : 'ltr'} className={`text-sm text-amber-800 space-y-1 mb-3 list-disc ${isRTL ? 'pr-6' : 'pl-6'}`}>
                <li><strong>{t('pricing.notices.messageCosts.noCharge')}</strong></li>
                <li>{t('pricing.notices.messageCosts.planControls')}</li>
                <li>{t('pricing.notices.messageCosts.transparent')}</li>
              </ul>
              <p className="text-sm text-amber-800 mb-2">
                <strong>{t('pricing.notices.messageCosts.viewCosts')}</strong>
              </p>
              <ul dir={isRTL ? 'rtl' : 'ltr'} className={`text-sm text-amber-800 space-y-1 list-disc ${isRTL ? 'pr-6' : 'pl-6'}`}>
                <li>
                  <a 
                    href="https://www.twilio.com/en-us/whatsapp/pricing" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-amber-900 hover:text-amber-700 underline"
                  >
                    {t('pricing.notices.messageCosts.twilioLink')}
                  </a>
                </li>
                <li>
                  <a 
                    href="https://developers.facebook.com/docs/whatsapp/pricing" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-amber-900 hover:text-amber-700 underline"
                  >
                    {t('pricing.notices.messageCosts.metaLink')}
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* What is an Active Conversation */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <HelpCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">{t('pricing.notices.activeConversation.title')}</h3>
              <p className="text-blue-800 text-sm mb-2">{t('pricing.notices.activeConversation.description')}</p>
              <ul dir={isRTL ? 'rtl' : 'ltr'} className={`text-sm text-blue-800 space-y-1 list-disc ${isRTL ? 'pr-6' : 'pl-6'}`}>
                <li>{t('pricing.notices.activeConversation.point1')}</li>
                <li>{t('pricing.notices.activeConversation.point2')}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* What Happens at Limit */}
        <div className="mt-8 bg-gray-100 border border-gray-200 rounded-xl p-6">
          <h3 className="font-semibold text-gray-900 mb-3">{t('pricing.notices.reachLimit.title')}</h3>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="text-gray-700">{t('pricing.notices.reachLimit.inboundContinue')}</span>
            </div>
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <span className="text-gray-700">{t('pricing.notices.reachLimit.outboundPaused')}</span>
            </div>
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="text-gray-700">{t('pricing.notices.reachLimit.upgradePrompt')}</span>
            </div>
            <div className="flex items-start gap-2">
              <Zap className="h-4 w-4 text-brand-green shrink-0 mt-0.5" />
              <span className="text-gray-700">{t('pricing.notices.reachLimit.instantUpgrade')}</span>
            </div>
          </div>
          <p className="text-sm text-gray-600 mt-4 font-medium">{t('pricing.notices.reachLimit.inControl')}</p>
        </div>

        {/* FAQ Section */}
        <div className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">{t('pricing.faq.title')}</h2>
          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="pay-twice" className="bg-white border border-gray-200 rounded-xl px-6">
              <AccordionTrigger className="font-semibold text-gray-900 hover:no-underline" data-testid="faq-pay-twice">
                {t('pricing.faq.payTwice.q')}
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                <p className="mb-3">{t('pricing.faq.payTwice.a1')}</p>
                <ul dir={isRTL ? 'rtl' : 'ltr'} className={`space-y-1 mb-3 list-disc ${isRTL ? 'pr-6' : 'pl-6'}`}>
                  <li><strong>{t('pricing.faq.payTwice.provider')}</strong> {t('pricing.faq.payTwice.providerDesc')}</li>
                  <li><strong>{t('pricing.faq.payTwice.whachat')}</strong> {t('pricing.faq.payTwice.whachatDesc')}</li>
                </ul>
                <p>{t('pricing.faq.payTwice.analogy')}</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="no-message-fees" className="bg-white border border-gray-200 rounded-xl px-6">
              <AccordionTrigger className="font-semibold text-gray-900 hover:no-underline" data-testid="faq-no-message-fees">
                {t('pricing.faq.noMessageFees.q')}
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                <p className="mb-3">{t('pricing.faq.noMessageFees.a1')}</p>
                <ul dir={isRTL ? 'rtl' : 'ltr'} className={`space-y-1 mb-3 list-disc ${isRTL ? 'pr-6' : 'pl-6'}`}>
                  <li>{t('pricing.faq.noMessageFees.country')}</li>
                  <li>{t('pricing.faq.noMessageFees.type')}</li>
                  <li>{t('pricing.faq.noMessageFees.volume')}</li>
                </ul>
                <p className="mb-3">{t('pricing.faq.noMessageFees.a2')}</p>
                <ul dir={isRTL ? 'rtl' : 'ltr'} className={`space-y-1 list-disc ${isRTL ? 'pr-6' : 'pl-6'}`}>
                  <li>{t('pricing.faq.noMessageFees.noHidden')}</li>
                  <li>{t('pricing.faq.noMessageFees.transparent')}</li>
                  <li>{t('pricing.faq.noMessageFees.control')}</li>
                </ul>
                <p className="mt-3">{t('pricing.faq.noMessageFees.standard')}</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="which-channels" className="bg-white border border-gray-200 rounded-xl px-6">
              <AccordionTrigger className="font-semibold text-gray-900 hover:no-underline" data-testid="faq-which-channels">
                {t('pricing.faq.channels.q')}
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                <p className="mb-3">{t('pricing.faq.channels.a1')}</p>
                <ul dir={isRTL ? 'rtl' : 'ltr'} className={`space-y-1 mb-3 list-disc ${isRTL ? 'pr-6' : 'pl-6'}`}>
                  <li><strong>WhatsApp:</strong> {t('pricing.faq.channels.whatsapp')}</li>
                  <li><strong>SMS:</strong> {t('pricing.faq.channels.sms')}</li>
                  <li><strong>Telegram:</strong> {t('pricing.faq.channels.telegram')}</li>
                  <li><strong>Instagram DM:</strong> {t('pricing.faq.channels.instagram')}</li>
                  <li><strong>Facebook Messenger:</strong> {t('pricing.faq.channels.facebook')}</li>
                  <li><strong>Web Chat:</strong> {t('pricing.faq.channels.webchat')}</li>
                  <li><strong>TikTok:</strong> {t('pricing.faq.channels.tiktok')}</li>
                </ul>
                <p className="text-amber-700 font-medium">{t('pricing.faq.channels.note')}</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="which-provider" className="bg-white border border-gray-200 rounded-xl px-6">
              <AccordionTrigger className="font-semibold text-gray-900 hover:no-underline" data-testid="faq-which-provider">
                {t('pricing.faq.providers.q')}
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                <p className="mb-3">{t('pricing.faq.providers.a1')}</p>
                <ul dir={isRTL ? 'rtl' : 'ltr'} className={`space-y-1 mb-3 list-disc ${isRTL ? 'pr-6' : 'pl-6'}`}>
                  <li><strong>Twilio:</strong> {t('pricing.faq.providers.twilio')}</li>
                  <li><strong>Meta WhatsApp Business API:</strong> {t('pricing.faq.providers.meta')}</li>
                </ul>
                <p className="mb-3">{t('pricing.faq.providers.a2')}</p>
                <p className="text-amber-700 font-medium">{t('pricing.faq.providers.note')}</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="twilio-vs-meta" className="bg-white border border-gray-200 rounded-xl px-6">
              <AccordionTrigger className="font-semibold text-gray-900 hover:no-underline" data-testid="faq-twilio-vs-meta">
                {t('pricing.faq.twilioVsMeta.q')}
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                <p className="mb-3"><strong>{t('pricing.faq.twilioVsMeta.chooseTwilio')}</strong></p>
                <ul dir={isRTL ? 'rtl' : 'ltr'} className={`space-y-1 mb-3 list-disc ${isRTL ? 'pr-6' : 'pl-6'}`}>
                  <li>{t('pricing.faq.twilioVsMeta.twilio1')}</li>
                  <li>{t('pricing.faq.twilioVsMeta.twilio2')}</li>
                  <li>{t('pricing.faq.twilioVsMeta.twilio3')}</li>
                </ul>
                <p className="mb-3"><strong>{t('pricing.faq.twilioVsMeta.chooseMeta')}</strong></p>
                <ul dir={isRTL ? 'rtl' : 'ltr'} className={`space-y-1 mb-3 list-disc ${isRTL ? 'pr-6' : 'pl-6'}`}>
                  <li>{t('pricing.faq.twilioVsMeta.meta1')}</li>
                  <li>{t('pricing.faq.twilioVsMeta.meta2')}</li>
                  <li>{t('pricing.faq.twilioVsMeta.meta3')}</li>
                  <li>{t('pricing.faq.twilioVsMeta.meta4')}</li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="other-providers" className="bg-white border border-gray-200 rounded-xl px-6">
              <AccordionTrigger className="font-semibold text-gray-900 hover:no-underline" data-testid="faq-other-providers">
                {t('pricing.faq.otherProviders.q')}
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                <p className="mb-3">{t('pricing.faq.otherProviders.a1')}</p>
                <p className="mb-3">{t('pricing.faq.otherProviders.a2')}</p>
                <ul dir={isRTL ? 'rtl' : 'ltr'} className={`space-y-1 mb-3 list-disc ${isRTL ? 'pr-6' : 'pl-6'}`}>
                  <li>360dialog</li>
                  <li>Gupshup</li>
                  <li>MessageBird</li>
                </ul>
                <p>{t('pricing.faq.otherProviders.contact')}</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="upgrade-downgrade" className="bg-white border border-gray-200 rounded-xl px-6">
              <AccordionTrigger className="font-semibold text-gray-900 hover:no-underline" data-testid="faq-upgrade-downgrade">
                {t('pricing.faq.upgradeDowngrade.q')}
              </AccordionTrigger>
              <AccordionContent className="text-gray-600">
                {t('pricing.faq.upgradeDowngrade.a')}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Footer CTA */}
        <div className="mt-16 bg-gray-900 rounded-2xl p-4 sm:p-8 text-center text-white overflow-hidden">
          <div className="flex justify-center mb-4">
            <MessageSquare className="h-10 w-10 text-brand-green" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold mb-2">One Inbox. Every Channel. Start Free.</h2>
          <p className="text-gray-400 mb-6 max-w-lg mx-auto text-sm sm:text-base">
            Stop juggling 7 apps. Manage WhatsApp, SMS, Telegram, Instagram, Facebook, and Web Chat in one place.
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
          <p>WhachatCRM is a CRM platform and is not affiliated with Meta, WhatsApp, or Telegram.</p>
          <p>Channel integrations are provided through official APIs and approved third-party providers.</p>
        </div>
      </div>
    </div>
  );
}
