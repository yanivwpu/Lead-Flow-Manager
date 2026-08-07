import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Brain,
  Check,
  ChevronDown,
  Loader2,
  MapPin,
  Radar,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { useSubscription } from "@/lib/subscription-context";
import { UpgradeModal } from "@/components/UpgradeModal";
import {
  nextProspectAiQuotaUpgradePlan,
  prospectAiQuotaExceededUserMessage,
} from "@shared/prospectAI";
import type { SubscriptionPlan } from "@shared/schema";
import {
  PROSPECT_AI_PATH,
  prospectDiscoveriesPlanPanel,
  useActivateProspectAi,
  useActiveDiscoveryBatch,
  useDiscardDiscoverySearch,
  useProspectAiActivity,
  useProspectAiDiscover,
  useProspectAiStatus,
  useProspectAiWonCustomers,
  useProspectAiWonStats,
  useSendDiscoverToReview,
  discoveryAttentionLabel,
  type ProspectAiDiscoverResult,
  type ProspectAiDiscoveryExcludedSample,
  type ProspectAiStatus,
  milesToRadiusKm,
  radiusKmToMilesDisplay,
} from "@/lib/prospectAi";
import { formatProspectAiRate } from "@shared/prospectAI";
import {
  PROSPECT_ACTIVITY_EVENT_LABELS,
  PROSPECT_AI_PAGE_SUBTITLES,
  PROSPECT_AI_PRIMARY_TABS,
  PROSPECT_AI_TAB_LABELS,
  buildActivityAiAssistantModel,
  buildProspectActivityTimeline,
  formatProspectActivityTime,
  mapProspectActivityApiToFeedItems,
  type ProspectActivityFeedKind,
} from "@shared/prospectAiDisplay";
import { isProspectInInboxJourney } from "@shared/prospectAiReviewState";
import { AiGrowthAssistantCard } from "@/components/prospectAi/AiGrowthAssistantCard";
import {
  ProspectAiEmptyState,
  ProspectAiPageLayout,
  ProspectAiTabBody,
} from "@/components/prospectAi/ProspectAiPageLayout";
import { ProspectAiCardArt } from "@/components/growthEngines/ProspectAiCardArt";
import { ProspectAiOnboarding } from "@/components/prospectAi/ProspectAiOnboarding";
import { GhlProspectImport, ProspectImportHistoryPanel } from "@/components/settings/GhlProspectImport";
import { ProspectIntelligencePanel } from "@/components/settings/ProspectIntelligencePanel";
import { ProspectOutreachQueuePanel } from "@/components/settings/ProspectOutreachQueuePanel";
import { useAuth } from "@/lib/auth-context";
import { trackGa4EventWhenReady } from "@/lib/ga4Events";
import {
  focusProspectAiDiscoverForm,
  isProspectAiOnboardingComplete,
  markProspectAiOnboardingComplete,
  trackProspectAiGuideEvent,
} from "@/lib/prospectAiOnboarding";
import type {
  ProspectIntelligenceJobSummary,
  ProspectImportHistoryItem,
  ProspectIntelligenceListItem,
} from "@shared/prospectImport";
import { TEMPLATES_GROWTH_ENGINES_TAB_PATH } from "@/lib/growthEnginesCatalog";
import { cn } from "@/lib/utils";
import { PROSPECT_AI_TAB_PANEL_CLASS } from "@shared/prospectAiLayout";

type WorkspaceTab = "discover" | "review" | "campaign" | "inbox" | "activity" | "won";

function parseTab(raw: string | null): WorkspaceTab {
  if (
    raw === "review" ||
    raw === "campaign" ||
    raw === "inbox" ||
    raw === "activity" ||
    raw === "won"
  ) {
    return raw;
  }
  return "discover";
}

function resultLabel(row: ProspectAiDiscoverResult): string {
  return (
    row.businessName ||
    row.name ||
    (typeof row.title === "string" ? row.title : null) ||
    "Untitled prospect"
  );
}

function resolveStatusPlan(plan: string | null | undefined): SubscriptionPlan {
  const normalized = String(plan || "")
    .trim()
    .toLowerCase();
  if (normalized.includes("pro")) return "pro";
  if (normalized.includes("starter")) return "starter";
  return "free";
}

function QuotaMeter({
  status,
  onUpgrade,
}: {
  status: ProspectAiStatus;
  onUpgrade?: () => void;
}) {
  const used = Math.max(0, status.used ?? 0);
  const monthlyQuota = Math.max(0, status.monthlyQuota ?? 0);
  const remaining = Math.max(0, status.remaining ?? monthlyQuota - used);
  const pct =
    monthlyQuota > 0 ? Math.min(100, Math.round((used / monthlyQuota) * 100)) : 0;
  const exhausted = monthlyQuota > 0 && remaining <= 0;
  const nearing =
    !exhausted && monthlyQuota > 0 && (remaining / monthlyQuota <= 0.15 || remaining <= 15);
  const plan = resolveStatusPlan(status.plan);
  const canUpgrade = Boolean(nextProspectAiQuotaUpgradePlan(plan));
  const exhaustedMessage = prospectAiQuotaExceededUserMessage(plan);

  return (
    <div
      className="rounded-xl border border-gray-200/90 bg-white p-4 shadow-sm"
      data-testid="prospect-ai-quota-meter"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 text-pretty">
            Prospect Discoveries
          </p>
          <p className="mt-1 text-sm text-gray-800">
            <span className="font-semibold tabular-nums text-gray-900">{used}</span>
            {" / "}
            <span className="tabular-nums">{monthlyQuota}</span> used this month
            {!exhausted ? (
              <span className="text-gray-500">
                {" · "}
                <span className="tabular-nums text-gray-700">{remaining}</span> remaining
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">Resets each billing month</p>
        </div>
        <Badge variant="outline" className="capitalize shrink-0">
          {status.plan || "Plan"}
        </Badge>
      </div>
      <Progress
        value={pct}
        className="mt-3 h-2"
        aria-label={`${used} / ${monthlyQuota} Prospect Discoveries used this month`}
      />
      {exhausted ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-amber-900" data-testid="prospect-ai-quota-exhausted">
            {exhaustedMessage}
          </p>
          {canUpgrade && onUpgrade ? (
            <Button
              type="button"
              size="sm"
              className="bg-brand-green hover:bg-brand-green/90"
              onClick={onUpgrade}
              data-testid="prospect-ai-quota-upgrade"
            >
              Upgrade plan
            </Button>
          ) : null}
        </div>
      ) : nearing ? (
        <p className="mt-3 text-sm text-amber-800">
          You’re nearing your monthly Prospect Discovery limit.
        </p>
      ) : null}
    </div>
  );
}

function AiBrainPanel({ status }: { status: ProspectAiStatus }) {
  const brain = status.aiBrain;

  if (brain.configured) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-violet-200/55 bg-gradient-to-br from-white via-violet-50/35 to-purple-50/25 px-3.5 py-3 shadow-sm shadow-violet-500/[0.06] ring-1 ring-violet-100/70 sm:px-4 sm:py-3.5">
        <div
          className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-violet-400/15 blur-2xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-5">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-200/80 bg-white text-violet-600 shadow-sm shadow-violet-500/10">
              <Brain className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 gap-y-1">
                <h3 className="text-sm font-semibold tracking-tight text-violet-950 text-pretty">
                  AI Brain Connected
                </h3>
                <Badge className="border border-violet-200/80 bg-white/90 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-violet-700 shadow-none">
                  Connected
                </Badge>
              </div>
              <p className="mt-0.5 text-xs leading-snug text-violet-900/75 text-pretty sm:text-[13px]">
                Prospect AI uses AI Brain to analyze every business before outreach.
              </p>
            </div>
          </div>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:max-w-md lg:shrink-0">
            {[
              "Website Analysis",
              "Company Intelligence",
              "AI Fit Scoring",
              "Personalized Outreach Angles",
              "Business Context",
            ].map((item) => (
              <li
                key={item}
                className="flex items-center gap-1.5 text-xs leading-snug text-violet-950/85 text-pretty"
              >
                <Check className="h-3.5 w-3.5 shrink-0 text-violet-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-violet-200/65 bg-gradient-to-br from-white via-violet-50/45 to-purple-50/30 px-3.5 py-3 shadow-sm shadow-violet-500/[0.08] ring-1 ring-violet-100/80 sm:px-4 sm:py-3.5">
      <div
        className="pointer-events-none absolute -right-8 -top-6 h-28 w-28 rounded-full bg-violet-400/15 blur-2xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-5">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center gap-0.5 rounded-lg border border-violet-200/80 bg-white text-violet-600 shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            <Brain className="h-3.5 w-3.5 text-purple-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight text-violet-950 text-pretty">
              Unlock AI Brain
            </h3>
            <p className="mt-0.5 text-xs leading-snug text-violet-900/80 text-pretty sm:text-[13px]">
              Prospect AI works without AI Brain. Add AI Brain to automatically understand every
              business before you reach out.
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center lg:max-w-md lg:shrink-0">
          <ul className="grid flex-1 grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
            {[
              "Analyze every business website",
              "Score prospect fit automatically",
              "Generate personalized outreach angles",
              "Recommend the best offer",
              "Improve reply rates with richer context",
            ].map((item) => (
              <li
                key={item}
                className="flex items-start gap-1.5 text-xs leading-snug text-violet-950/85 text-pretty"
              >
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="flex shrink-0 flex-col gap-1 sm:items-end">
            <Link href="/app/ai-brain">
              <Button
                type="button"
                size="sm"
                className="h-8 border-0 bg-gradient-to-r from-violet-600 to-purple-600 px-3 text-xs text-white shadow-sm shadow-violet-500/20 hover:from-violet-500 hover:to-purple-500"
              >
                Upgrade to AI Brain
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
            <p className="text-[11px] leading-snug text-violet-800/65 text-pretty sm:text-right">
              Prospect AI works on its own. AI Brain makes every discovery smarter.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivationScreen({
  onActivated,
}: {
  onActivated: (status: ProspectAiStatus) => void;
}) {
  const { data: subscription } = useSubscription();
  const plan =
    subscription?.limits?.effectivePlan ||
    subscription?.limits?.plan ||
    subscription?.subscription?.effectivePlan ||
    subscription?.subscription?.plan ||
    null;
  const activate = useActivateProspectAi();
  const planPanel = prospectDiscoveriesPlanPanel(plan);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:py-10">
      <div className="overflow-hidden rounded-2xl border border-emerald-200/70 shadow-sm">
        <ProspectAiCardArt className="h-36 w-full sm:h-40" />
      </div>

      <div className="space-y-2.5 text-center">
        <div className="inline-flex items-center gap-1.5 text-brand-green">
          <Star className="h-4 w-4 fill-current" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wide">Growth Engine</span>
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
          Prospect AI
        </h1>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-gray-600 sm:text-base">
          Find new businesses, let AI qualify the best opportunities, launch personalized outreach,
          and turn conversations into customers.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-sm sm:p-6">
        <ul className="space-y-2.5 text-sm text-gray-700">
          {[
            "Discover prospects by business type and location",
            "Review AI fit insights before you reach out",
            "Launch campaigns and manage every reply from one inbox",
          ].map((line) => (
            <li key={line} className="flex gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50/80 px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            {planPanel.title}
          </p>
          <p className="mt-1 text-sm font-medium tabular-nums text-gray-900">{planPanel.primary}</p>
          {planPanel.secondaryLines?.map((line) => (
            <p key={line} className="mt-0.5 text-xs tabular-nums text-gray-500">
              {line}
            </p>
          ))}
          <Link
            href="/pricing"
            className="mt-2 inline-block text-xs font-medium text-brand-green hover:underline"
          >
            View plan limits
          </Link>
        </div>

        <Button
          className="mt-5 w-full bg-brand-green text-white hover:bg-brand-green/90 sm:w-auto"
          disabled={activate.isPending}
          onClick={() => {
            activate.mutate(undefined, {
              onSuccess: (data) => {
                toast({ title: "Prospect AI activated" });
                onActivated({ ...data, activated: true });
              },
              onError: (err: Error) =>
                toast({
                  title: "Activation failed",
                  description: err.message,
                  variant: "destructive",
                }),
            });
          }}
          data-testid="prospect-ai-activate"
        >
          {activate.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Activating…
            </>
          ) : (
            <>
              Activate
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>

      <p className="text-center text-sm text-gray-500">
        <Link href={TEMPLATES_GROWTH_ENGINES_TAB_PATH} className="text-brand-green hover:underline">
          Back to Growth Engines
        </Link>
      </p>
    </div>
  );
}

function DiscoverTab({ status: initialStatus }: { status: ProspectAiStatus }) {
  const statusQuery = useProspectAiStatus();
  const status = statusQuery.data ?? initialStatus;
  const [, setNavLocation] = useLocation();
  const searchString = useSearch();
  const [businessType, setBusinessType] = useState("");
  const [location, setLocation] = useState("");
  const [radiusMiles, setRadiusMiles] = useState("");
  const [targetCount, setTargetCount] = useState<25 | 50 | 100 | 250>(50);
  const [locationExpansion, setLocationExpansion] = useState<"exact" | "nearby" | "metro">(
    "nearby",
  );
  const [searchId, setSearchId] = useState<string | null>(null);
  const [results, setResults] = useState<ProspectAiDiscoverResult[]>([]);
  const [diagnostics, setDiagnostics] = useState<import("@/lib/prospectAi").ProspectAiDiscoveryDiagnostics | null>(null);
  const [excluded, setExcluded] = useState<ProspectAiDiscoveryExcludedSample[]>([]);
  const [resultFilter, setResultFilter] = useState<
    "ready" | "possible_duplicate" | "already_exists" | "already_archived" | "rejected"
  >("ready");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [ghlOpen, setGhlOpen] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [restoredFromBatch, setRestoredFromBatch] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const discoverAbortRef = useRef<AbortController | null>(null);

  const discover = useProspectAiDiscover();
  const quotaExhausted = Math.max(0, status.remaining ?? 0) < 1;
  const statusPlan = resolveStatusPlan(status.plan);
  const canUpgradeQuota = Boolean(nextProspectAiQuotaUpgradePlan(statusPlan));
  const sendToReview = useSendDiscoverToReview(searchId);
  const discardBatch = useDiscardDiscoverySearch();
  const activeBatchQuery = useActiveDiscoveryBatch({ enabled: status.activated !== false });

  useEffect(() => {
    const data = activeBatchQuery.data;
    if (!data) return;
    const nextResults = data.results ?? [];
    const nextSearchId = data.search?.id ?? null;
    if (nextResults.length === 0) {
      if (restoredFromBatch || searchId) {
        setSearchId(null);
        setResults([]);
        setSelectedIds(new Set());
        setRestoredFromBatch(false);
      }
      return;
    }
    setSearchId(nextSearchId);
    setResults(nextResults);
    setSelectedIds(new Set(nextResults.map((r) => r.id)));
    setRestoredFromBatch(true);
    if (data.diagnostics) setDiagnostics(data.diagnostics);
    if (data.diagnostics?.excludedSamples) setExcluded(data.diagnostics.excludedSamples);
    if (data.search?.businessType) setBusinessType(String(data.search.businessType));
    if (data.search?.location) setLocation(String(data.search.location));
    if (data.search?.radiusKm != null) {
      setRadiusMiles(radiusKmToMilesDisplay(Number(data.search.radiusKm)));
    }
  }, [activeBatchQuery.data]);

  // Discovery stays discovery-focused: usable needs-attention folds into Ready for Review.
  // Review stage carries the reason for user judgement.
  const readyResults = useMemo(() => results, [results]);
  const needsAttentionCount = useMemo(
    () => results.filter((r) => r.disposition === "needs_attention").length,
    [results],
  );
  const alreadyExistsSamples = useMemo(
    () => excluded.filter((e) => e.disposition === "already_exists"),
    [excluded],
  );
  const alreadyArchivedSamples = useMemo(
    () => excluded.filter((e) => e.disposition === "already_archived"),
    [excluded],
  );
  const rejectedSamples = useMemo(
    () => excluded.filter((e) => e.disposition === "rejected"),
    [excluded],
  );
  const possibleDuplicateSamples = useMemo(
    () => excluded.filter((e) => e.disposition === "possible_duplicate"),
    [excluded],
  );

  const restoreArchivedMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const res = await fetch(`/api/growth-tools/prospect-intelligence/${contactId}/restore`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.reason || "Restore failed");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Prospect restored to Active Review" });
    },
    onError: (err: Error) => {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    },
  });
  const visibleRows = useMemo(() => {
    if (resultFilter === "ready") return readyResults;
    return [];
  }, [resultFilter, readyResults]);

  const allSelected =
    visibleRows.length > 0 && visibleRows.every((r) => selectedIds.has(r.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const r of visibleRows) next.delete(r.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const r of visibleRows) next.add(r.id);
        return next;
      });
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cancelDiscover = () => {
    discoverAbortRef.current?.abort();
  };

  const { user } = useAuth();
  const runDiscover = (replaceActiveBatch: boolean) => {
    if (user?.id) {
      trackGa4EventWhenReady(
        "prospect_ai_first_discovery_started",
        {},
        `${user.id}:prospect_ai_first_discovery_started`,
      );
      trackProspectAiGuideEvent("prospect_ai_first_discovery_started", { replaceActiveBatch });
    }
    discoverAbortRef.current?.abort();
    const controller = new AbortController();
    discoverAbortRef.current = controller;
    const body: {
      businessType: string;
      location: string;
      radiusKm?: number;
      targetCount?: number;
      locationExpansion?: "exact" | "nearby" | "metro";
      replaceActiveBatch?: boolean;
      idempotencyKey?: string;
      signal?: AbortSignal;
    } = {
      businessType: businessType.trim(),
      location: location.trim(),
      targetCount,
      locationExpansion,
      idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      signal: controller.signal,
    };
    const radius = Number(radiusMiles);
    if (radiusMiles.trim() && Number.isFinite(radius) && radius > 0) {
      body.radiusKm = milesToRadiusKm(radius);
    }
    if (replaceActiveBatch) body.replaceActiveBatch = true;
    discover.mutate(body, {
      onSuccess: (data) => {
        setConfirmReplaceOpen(false);
        setSearchId(data.search.id);
        setResults(data.results ?? []);
        setSelectedIds(new Set((data.results ?? []).map((r) => r.id)));
        setDiagnostics(data.diagnostics ?? null);
        setExcluded(data.excluded ?? data.diagnostics?.excludedSamples ?? []);
        setResultFilter("ready");
        setRestoredFromBatch(false);
        const saved = data.diagnostics?.netNewUsable ?? data.results?.length ?? 0;
        const target = data.diagnostics?.targetCount ?? targetCount;
        const stop = data.diagnostics?.stopReason;
        toast({
          title: stop === "user_cancelled" ? "Discovery cancelled" : "Discovery complete",
          description:
            stop === "user_cancelled"
              ? `${saved} new prospect${saved === 1 ? "" : "s"} saved before cancel.`
              : `${saved} new prospects ready for Review from ${data.diagnostics?.rawResults ?? "—"} raw results (target ${target}).`,
        });
      },
      onError: (err: Error) => {
        const msg = err.message || "";
        if (err.name === "AbortError" || /aborted|cancel/i.test(msg)) {
          toast({
            title: "Discovery cancelled",
            description: "Stopped requesting more Google results. Quota is only used for saved prospects.",
          });
          return;
        }
        if (/not yet sent to Review/i.test(msg) || /active_batch/i.test(msg)) {
          setConfirmReplaceOpen(true);
          return;
        }
        if (/already running/i.test(msg) || /concurrent/i.test(msg)) {
          toast({
            title: "Discovery already running",
            description: msg,
            variant: "destructive",
          });
          return;
        }
        const code = (err as Error & { code?: string }).code;
        if (code === "quota_exceeded" || /monthly Prospect AI discovery limit/i.test(msg)) {
          if (canUpgradeQuota) setUpgradeOpen(true);
          toast({
            title: "Discovery limit reached",
            description: msg,
            variant: "destructive",
          });
          return;
        }
        toast({
          title: "Discovery failed",
          description: msg,
          variant: "destructive",
        });
      },
    });
  };

  const confirmSendToReview = () => {
    const count = selectedIds.size;
    const sentIds = [...selectedIds];
    const batchSearchId = searchId;
    sendToReview.mutate(sentIds, {
      onSuccess: (data) => {
        setConfirmSendOpen(false);
        const sent = data.sent ?? count;
        toast({
          title: "Sent to Review",
          description: data.analysisStarted
            ? `${sent} prospects added. AI qualification has started automatically.`
            : `${sent} prospects added to Review. Qualification will begin shortly.`,
        });
        const remaining = results.filter((r) => !sentIds.includes(r.id));
        setResults(remaining);
        setSelectedIds(new Set(remaining.map((r) => r.id)));
        if (remaining.length === 0) {
          setSearchId(null);
          setRestoredFromBatch(false);
        }
        void activeBatchQuery.refetch();
        // Open Review filtered to this discovery batch only.
        const key =
          data.reviewBatchKey ||
          (batchSearchId ? `discovery:${batchSearchId}` : null) ||
          (data.searchId ? `discovery:${data.searchId}` : null);
        if (key) {
          const params = new URLSearchParams(searchString);
          params.set("tab", "review");
          params.set("batch", key);
          setNavLocation(`${PROSPECT_AI_PATH}?${params.toString()}`);
        }
      },
      onError: (err: Error) =>
        toast({
          title: "Send failed",
          description: err.message,
          variant: "destructive",
        }),
    });
  };

  const confirmClearResults = () => {
    if (!searchId) return;
    discardBatch.mutate(searchId, {
      onSuccess: () => {
        setConfirmClearOpen(false);
        setSearchId(null);
        setResults([]);
        setSelectedIds(new Set());
        setRestoredFromBatch(false);
        toast({
          title: "Results cleared",
          description: "Discovery quota is unchanged.",
        });
      },
      onError: (err: Error) =>
        toast({
          title: "Could not clear results",
          description: err.message,
          variant: "destructive",
        }),
    });
  };

  return (
    <ProspectAiTabBody className="space-y-10" data-testid="prospect-discover-tab">
      <QuotaMeter
        status={status}
        onUpgrade={canUpgradeQuota ? () => setUpgradeOpen(true) : undefined}
      />
      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        reason="prospect_ai_discoveries"
        currentPlan={status.plan}
      />
      <AiBrainPanel status={status} />

      <div className="rounded-2xl border border-emerald-200/70 bg-white p-6 shadow-md shadow-emerald-900/[0.04] ring-1 ring-emerald-100/80 sm:p-7">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-green/10 text-brand-green">
            <Radar className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-gray-900 text-pretty sm:text-xl sm:font-bold">
              Discover Businesses
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-600 text-pretty">
              Find net-new businesses for Review. Existing CRM matches, duplicates, and invalid
              listings do not count toward your target.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="min-w-0">
            <Label htmlFor="pai-business-type">Business Type</Label>
            <Input
              id="pai-business-type"
              className="mt-1.5 h-10"
              placeholder="e.g. Dental clinics"
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="pai-location">Location</Label>
            <Input
              id="pai-location"
              className="mt-1.5 h-10"
              placeholder="e.g. Austin, TX"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="pai-radius">Search Radius (miles)</Label>
            <Input
              id="pai-radius"
              type="number"
              min={1}
              step="any"
              className="mt-1.5 h-10"
              placeholder="e.g. 10"
              value={radiusMiles}
              onChange={(e) => setRadiusMiles(e.target.value)}
              data-testid="prospect-ai-search-radius-miles"
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="pai-target">Target new prospects</Label>
            <select
              id="pai-target"
              className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={targetCount}
              onChange={(e) => setTargetCount(Number(e.target.value) as 25 | 50 | 100 | 250)}
              data-testid="prospect-ai-target-count"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
          </div>
          <div className="min-w-0">
            <Label htmlFor="pai-geo">Location coverage</Label>
            <select
              id="pai-geo"
              className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={locationExpansion}
              onChange={(e) =>
                setLocationExpansion(e.target.value as "exact" | "nearby" | "metro")
              }
              data-testid="prospect-ai-location-expansion"
            >
              <option value="exact">Exact location only</option>
              <option value="nearby">Nearby cities (Recommended)</option>
              <option value="metro">Metro area</option>
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end lg:block">
            <div className="min-w-0 flex-1">
              <Label htmlFor="pai-discover" className="invisible hidden select-none lg:inline-block">
                Discover Prospects
              </Label>
              <Button
                id="pai-discover"
                className="mt-0 h-10 w-full bg-brand-green hover:bg-brand-green/90 lg:mt-1.5"
                disabled={
                  discover.isPending ||
                  !businessType.trim() ||
                  !location.trim() ||
                  quotaExhausted
                }
                onClick={() => {
                  if (quotaExhausted) return;
                  if (results.length > 0 && searchId) {
                    setConfirmReplaceOpen(true);
                    return;
                  }
                  runDiscover(false);
                }}
                aria-disabled={quotaExhausted}
                data-testid="prospect-ai-discover"
              >
                {discover.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Searching Google Places…
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Start Discovery
                  </>
                )}
              </Button>
            </div>
            {discover.isPending ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full shrink-0 sm:w-auto lg:mt-1.5 lg:w-full"
                onClick={cancelDiscover}
                data-testid="prospect-ai-discover-cancel"
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
        {quotaExhausted ? (
          <p className="mt-3 text-sm text-amber-900" data-testid="prospect-ai-discover-quota-gate">
            {prospectAiQuotaExceededUserMessage(statusPlan)}
          </p>
        ) : null}
        {discover.isPending ? (
          <p className="mt-3 text-xs text-amber-800" data-testid="prospect-discover-progress">
            Preparing search → Searching Google Places → Checking pages → Removing duplicates →
            Checking your workspace → Validating → Saving new prospects. Live per-page counts are not
            streamed yet; Cancel stops further Google requests.
          </p>
        ) : null}
      </div>

      {results.length > 0 || (diagnostics && (diagnostics.rawResults ?? 0) > 0) ? (
        <div className="space-y-3" data-testid="prospect-discover-results">
          {diagnostics ? (
            <div
              className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 text-sm text-gray-700"
              data-testid="prospect-discover-diagnostics"
            >
              <p className="font-medium text-gray-900">
                {diagnostics.netNewUsable ?? diagnostics.saved ?? results.length} new prospects ready
                for Review
                {diagnostics.rawResults != null
                  ? ` from ${diagnostics.rawResults} raw results`
                  : ""}
                .
              </p>
              <ul className="mt-2 grid gap-1 text-xs text-gray-600 sm:grid-cols-2">
                <li>Target requested: {diagnostics.targetCount ?? targetCount}</li>
                <li>Ready for Review: {readyResults.length}</li>
                {needsAttentionCount > 0 ||
                (diagnostics.usableNeedsAttention ?? diagnostics.needsAttention ?? 0) > 0 ? (
                  <li>
                    Review notes after send:{" "}
                    {diagnostics.usableNeedsAttention ??
                      diagnostics.needsAttention ??
                      needsAttentionCount}{" "}
                    (category / website / details)
                  </li>
                ) : null}
                <li>
                  Possible Duplicates: {diagnostics.possibleDuplicates ?? possibleDuplicateSamples.length}
                </li>
                <li>Already Exists: {diagnostics.alreadyInWorkspace ?? 0}</li>
                <li>Already Archived: {diagnostics.alreadyArchived ?? alreadyArchivedSamples.length}</li>
                <li>
                  Rejected:{" "}
                  {(diagnostics.rejectedClosed ?? 0) +
                    (diagnostics.rejectedInvalid ?? 0) +
                    (diagnostics.rejectedQuality ?? 0) +
                    (diagnostics.rejectedRelevance ?? 0)}
                </li>
                <li>
                  Quota consumed:{" "}
                  {diagnostics.quotaConsumed ?? diagnostics.netNewUsable ?? diagnostics.saved ?? results.length}
                </li>
                <li>
                  Search completed:{" "}
                  {(diagnostics.stopReason || "unknown")
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase())}
                </li>
              </ul>
              <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                <CollapsibleTrigger
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline"
                  data-testid="prospect-discover-search-details"
                >
                  Search details
                  <ChevronDown className={cn("h-3.5 w-3.5 transition", detailsOpen && "rotate-180")} />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1 text-xs text-gray-600">
                  {diagnostics.expandedLocations?.length ? (
                    <p>Areas searched: {diagnostics.expandedLocations.join(", ")}</p>
                  ) : null}
                  <p>
                    Used {diagnostics.queryVariationsAttempted?.length ?? 0} query variations across{" "}
                    {diagnostics.pagesFetched ?? 0} Google Places pages (
                    {diagnostics.providerCalls ?? 0} calls).
                  </p>
                  <p>
                    Qualification and email enrichment happen after Send to Review — they are not
                    included in this discovered count.
                  </p>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2" data-testid="prospect-discover-groups">
            {(
              [
                ["ready", `Ready for Review (${readyResults.length})`],
                [
                  "possible_duplicate",
                  `Possible Duplicates (${
                    diagnostics?.possibleDuplicates ?? possibleDuplicateSamples.length
                  })`,
                ],
                [
                  "already_exists",
                  `Already Exists (${diagnostics?.alreadyInWorkspace ?? alreadyExistsSamples.length})`,
                ],
                [
                  "already_archived",
                  `Already Archived (${diagnostics?.alreadyArchived ?? alreadyArchivedSamples.length})`,
                ],
                [
                  "rejected",
                  `Rejected (${
                    (diagnostics?.rejectedClosed ?? 0) +
                    (diagnostics?.rejectedInvalid ?? 0) +
                    (diagnostics?.rejectedQuality ?? 0) +
                    (diagnostics?.rejectedRelevance ?? 0)
                  })`,
                ],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={resultFilter === key ? "default" : "outline"}
                className={resultFilter === key ? "bg-brand-green hover:bg-brand-green/90" : ""}
                onClick={() => setResultFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{results.length}</span> saved for Review
              {restoredFromBatch ? (
                <span className="text-amber-800"> · Not yet sent to Review</span>
              ) : null}
              {selectedIds.size > 0 ? (
                <>
                  {" · "}
                  <span className="font-medium">{selectedIds.size}</span> selected
                </>
              ) : null}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!searchId || discardBatch.isPending}
                onClick={() => setConfirmClearOpen(true)}
                data-testid="prospect-ai-clear-results"
              >
                Clear results
              </Button>
              <Button
                size="sm"
                className="bg-brand-green hover:bg-brand-green/90"
                disabled={!selectedIds.size || sendToReview.isPending || !searchId}
                onClick={() => setConfirmSendOpen(true)}
                data-testid="prospect-ai-send-to-review"
              >
                {sendToReview.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Send to Review
              </Button>
            </div>
          </div>
          <AlertDialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Send to Review?</AlertDialogTitle>
                <AlertDialogDescription>
                  Send {selectedIds.size} prospect{selectedIds.size === 1 ? "" : "s"} to Review.
                  AI will qualify them automatically — no need to start analysis yourself.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={sendToReview.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={sendToReview.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    confirmSendToReview();
                  }}
                  className="bg-brand-green hover:bg-brand-green/90"
                >
                  {sendToReview.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    "Send to Review"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear discovery results?</AlertDialogTitle>
                <AlertDialogDescription>
                  Remove these unsent prospects from Discover. This does not refund discovery quota.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={discardBatch.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={discardBatch.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    confirmClearResults();
                  }}
                >
                  {discardBatch.isPending ? "Clearing…" : "Clear results"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog open={confirmReplaceOpen} onOpenChange={setConfirmReplaceOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Replace unsent results?</AlertDialogTitle>
                <AlertDialogDescription>
                  You still have {results.length} discovered prospects not sent to Review. Running a
                  new discovery will clear them (quota is not refunded).
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={discover.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={discover.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    runDiscover(true);
                  }}
                  className="bg-brand-green hover:bg-brand-green/90"
                >
                  {discover.isPending ? "Discovering…" : "Replace & discover"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {resultFilter === "already_exists" ||
          resultFilter === "already_archived" ||
          resultFilter === "rejected" ||
          resultFilter === "possible_duplicate" ? (
            <div className="overflow-auto rounded-xl border" data-testid="prospect-discover-excluded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Why</TableHead>
                    <TableHead>Match / details</TableHead>
                    {resultFilter === "already_archived" ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(resultFilter === "already_exists"
                    ? alreadyExistsSamples
                    : resultFilter === "already_archived"
                      ? alreadyArchivedSamples
                      : resultFilter === "possible_duplicate"
                        ? possibleDuplicateSamples
                        : rejectedSamples
                  ).map((row, idx) => (
                      <TableRow key={`${row.providerPlaceId || row.name}-${idx}`}>
                        <TableCell className="font-medium">{row.name || "—"}</TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {resultFilter === "already_archived"
                            ? "Already archived — not counted toward quota"
                            : discoveryAttentionLabel(row.reason)}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {row.existingRecordLabel
                            ? `Matches: ${row.existingRecordLabel}${
                                row.matchType ? ` (${row.matchType.replace(/_/g, " ")})` : ""
                              }`
                            : row.matchType
                              ? row.matchType.replace(/_/g, " ")
                              : resultFilter === "possible_duplicate"
                                ? "Not counted toward quota — confirm later if distinct"
                                : "—"}
                        </TableCell>
                        {resultFilter === "already_archived" ? (
                          <TableCell className="text-right">
                            {row.existingRecordId ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={restoreArchivedMutation.isPending}
                                onClick={() =>
                                  restoreArchivedMutation.mutate(String(row.existingRecordId))
                                }
                                data-testid="prospect-discover-restore-archived"
                              >
                                Restore
                              </Button>
                            ) : null}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ),
                  )}
                  {(resultFilter === "already_exists"
                    ? alreadyExistsSamples
                    : resultFilter === "already_archived"
                      ? alreadyArchivedSamples
                      : resultFilter === "possible_duplicate"
                        ? possibleDuplicateSamples
                        : rejectedSamples
                  ).length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={resultFilter === "already_archived" ? 4 : 3}
                        className="text-sm text-gray-500"
                      >
                        None in this run
                        {resultFilter === "already_exists" &&
                        (diagnostics?.alreadyInWorkspace ?? 0) >
                          alreadyExistsSamples.length
                          ? ` (${diagnostics?.alreadyInWorkspace} matched; sample list capped)`
                          : ""}
                        .
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="overflow-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Contact</TableHead>
                    {needsAttentionCount > 0 ? <TableHead>Review note</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(row.id)}
                          onCheckedChange={() => toggleOne(row.id)}
                          aria-label={`Select ${resultLabel(row)}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{resultLabel(row)}</TableCell>
                      <TableCell>{row.businessType || "—"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          {row.address || row.location || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {row.email || row.phone || row.website || "—"}
                      </TableCell>
                      {needsAttentionCount > 0 ? (
                        <TableCell className="text-sm text-amber-800">
                          {row.disposition === "needs_attention"
                            ? discoveryAttentionLabel(row.attentionReason)
                            : "—"}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200/70 bg-gray-50/40 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-gray-800">GoHighLevel Import</p>
              <Badge
                variant="outline"
                className="border-gray-200 bg-white px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-gray-500 shadow-none"
              >
                Optional
              </Badge>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Already have contacts?
              <br />
              Import them into Prospect AI instead of discovering new businesses.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-gray-600 hover:text-gray-900"
            onClick={() => setGhlOpen((v) => !v)}
            data-testid="prospect-ai-toggle-ghl"
          >
            {ghlOpen ? "Hide import" : "Open GoHighLevel Import"}
          </Button>
        </div>
        {ghlOpen ? (
          <div className="mt-4 border-t border-gray-200/70 pt-4">
            <GhlProspectImport view="embedded" />
          </div>
        ) : null}
      </div>
    </ProspectAiTabBody>
  );
}

function ActivityTab() {
  const [kindFilter, setKindFilter] = useState<"all" | ProspectActivityFeedKind>("all");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const activityQuery = useProspectAiActivity();
  const importHistoryQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-import/history", "activity-timeline"],
    queryFn: async () => {
      const res = await fetch("/api/growth-tools/prospect-import/history", {
        credentials: "include",
      });
      if (!res.ok) return { history: [] as ProspectImportHistoryItem[] };
      return res.json() as Promise<{ history: ProspectImportHistoryItem[] }>;
    },
    staleTime: 30_000,
    retry: false,
  });

  const feedItems = useMemo(() => {
    const data = activityQuery.data;
    return mapProspectActivityApiToFeedItems({
      events: data?.events,
      outreachEvents: data?.outreachEvents,
      campaignEvents: data?.campaignEvents,
      imports: importHistoryQuery.data?.history,
    });
  }, [activityQuery.data, importHistoryQuery.data?.history]);

  const filteredItems = useMemo(
    () => (kindFilter === "all" ? feedItems : feedItems.filter((i) => i.kind === kindFilter)),
    [feedItems, kindFilter],
  );

  const timeline = useMemo(
    () => buildProspectActivityTimeline(filteredItems),
    [filteredItems],
  );

  const assistantModel = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const isToday = (iso: string) => {
      const t = Date.parse(iso);
      return Number.isFinite(t) && t >= start;
    };
    const discoveriesToday = (activityQuery.data?.searches ?? [])
      .filter((s) => s.createdAt && isToday(s.createdAt))
      .reduce((sum, s) => sum + (s.resultCount ?? 0), 0);
    const outreachSentToday = feedItems.filter(
      (i) => i.kind === "outreach" && i.status === "sent" && isToday(i.at),
    ).length;
    const campaignEnrollmentsToday = feedItems.filter(
      (i) => i.kind === "campaign" && isToday(i.at),
    ).length;
    return buildActivityAiAssistantModel({
      discoveriesToday,
      outreachSentToday,
      campaignEnrollmentsToday,
      importBatches: importHistoryQuery.data?.history?.length ?? 0,
    });
  }, [activityQuery.data?.searches, feedItems, importHistoryQuery.data?.history?.length]);

  const loading = activityQuery.isLoading || importHistoryQuery.isLoading;

  return (
    <ProspectAiTabBody data-testid="prospect-activity-tab">
      <div className="space-y-0">
        <h2 className="text-base font-semibold tracking-tight text-gray-900">Prospect Activity</h2>
        <p className="text-xs text-gray-600">{PROSPECT_AI_PAGE_SUBTITLES.activity}</p>
      </div>

      <AiGrowthAssistantCard model={assistantModel} className="w-full max-w-xl" />

      <div className="flex w-full max-w-full flex-nowrap gap-1.5 overflow-x-auto pb-0.5">
        {(
          [
            ["all", "All"],
            ["discovery", PROSPECT_ACTIVITY_EVENT_LABELS.discovery],
            ["import", PROSPECT_ACTIVITY_EVENT_LABELS.import],
            ["campaign", PROSPECT_ACTIVITY_EVENT_LABELS.campaign],
            ["outreach", PROSPECT_ACTIVITY_EVENT_LABELS.outreach],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={kindFilter === value ? "default" : "outline"}
            className="h-7 shrink-0 rounded-md px-2.5 text-[11px]"
            onClick={() => setKindFilter(value)}
            data-testid={`activity-filter-${value}`}
          >
            {label}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading activity…</p>
      ) : timeline.length === 0 ? (
        <ProspectAiEmptyState data-testid="prospect-activity-empty">
          <p className="text-sm text-gray-600">No activity yet.</p>
        </ProspectAiEmptyState>
      ) : (
        <div className="w-full space-y-6" data-testid="prospect-activity-timeline">
          {timeline.map((group) => (
            <section key={group.dateKey} className="w-full space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {group.dateLabel}
              </h3>
              <ul className="space-y-2 border-l border-gray-200 pl-4">
                {group.items.map((item) => (
                  <li key={item.id} className="relative">
                    <span
                      className="absolute -left-[1.15rem] top-1.5 h-2 w-2 rounded-full bg-brand-green"
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <time className="text-xs tabular-nums text-gray-500">
                        {formatProspectActivityTime(item.at)}
                      </time>
                      <span className="text-sm text-gray-900">{item.title}</span>
                      {item.status ? (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {item.status}
                        </Badge>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="w-full">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs text-gray-600"
            data-testid="activity-details-toggle"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", detailsOpen && "rotate-180")} />
            Import & discovery details
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-6 pt-2">
          <ProspectImportHistoryPanel
            history={importHistoryQuery.data?.history ?? []}
            isLoading={importHistoryQuery.isLoading}
          />
        </CollapsibleContent>
      </Collapsible>
    </ProspectAiTabBody>
  );
}

function InboxTab() {
  const listQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-intelligence", "inbox-tab"],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100", sortBy: "createdAt", sortDir: "desc" });
      const res = await fetch(`/api/growth-tools/prospect-intelligence?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to load inbox conversations");
      }
      return res.json() as Promise<{ items: ProspectIntelligenceListItem[] }>;
    },
    staleTime: 30_000,
  });

  const conversations = useMemo(() => {
    const items = listQuery.data?.items ?? [];
    return items.filter((row) =>
      isProspectInInboxJourney({
        analysisStatus: row.intelligence.analysisStatus,
        reviewStatus: row.intelligence.reviewStatus,
        needsReview: row.intelligence.needsReview,
        enrichmentStatus: row.intelligence.enrichmentStatus,
        outreachStatus: row.intelligence.outreachStatus,
        outreachSentAt: row.intelligence.outreachSentAt,
        repliedAt: row.intelligence.repliedAt,
        outreachMessageId: row.intelligence.outreachMessageId,
        outreachConversationId: row.intelligence.outreachConversationId,
        queueStatus: row.queueStatus,
        outcome: row.prospectOutcome,
      }),
    );
  }, [listQuery.data?.items]);

  return (
    <ProspectAiTabBody className="space-y-6" data-testid="prospect-inbox-tab">
      <div className="space-y-0">
        <h2 className="text-base font-semibold tracking-tight text-gray-900">Inbox</h2>
        <p className="text-xs text-gray-600">{PROSPECT_AI_PAGE_SUBTITLES.inbox}</p>
      </div>

      {listQuery.isLoading ? (
        <div className="flex w-full flex-col items-center justify-center gap-2 py-10">
          <Loader2 className="h-6 w-6 animate-spin text-brand-green" />
          <p className="text-sm text-gray-500">Loading replies…</p>
        </div>
      ) : conversations.length === 0 ? (
        <ProspectAiEmptyState data-testid="prospect-inbox-empty">
          <p className="text-sm text-gray-600">No replies yet.</p>
        </ProspectAiEmptyState>
      ) : (
        <ul className="w-full divide-y divide-gray-100 rounded-xl border border-gray-200/90 bg-white">
          {conversations.map((row) => {
            const conversationId = row.intelligence.outreachConversationId;
            const href = conversationId
              ? `/app/inbox/${encodeURIComponent(row.contactId)}?conversation=${encodeURIComponent(conversationId)}`
              : `/app/inbox/${encodeURIComponent(row.contactId)}`;
            return (
              <li
                key={row.contactId}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{row.name || "Untitled"}</p>
                  <p className="truncate text-xs text-gray-500">
                    {row.company || row.intelligence.companyName || "—"}
                  </p>
                </div>
                <Link
                  href={href}
                  className="shrink-0 text-sm font-medium text-brand-green hover:underline"
                  data-testid={`prospect-inbox-open-${row.contactId}`}
                >
                  Open conversation
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </ProspectAiTabBody>
  );
}

function formatWonDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function WonTab() {
  const [filter, setFilter] = useState<"this_month" | "last_30_days" | "all_time">("all_time");
  const statsQuery = useProspectAiWonStats();
  const customersQuery = useProspectAiWonCustomers(filter);
  const stats = statsQuery.data;
  const customers = customersQuery.data?.customers ?? [];

  return (
    <ProspectAiTabBody className="space-y-8" data-testid="prospect-ai-won-tab">
      <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Outreach Sent", value: stats?.outreachSent ?? 0 },
          { label: "Replied", value: stats?.replied ?? 0 },
          { label: "Qualified", value: stats?.qualified ?? 0 },
          { label: "Won", value: stats?.won ?? 0 },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3 text-center"
          >
            <p className="text-2xl font-semibold text-gray-900">{c.value}</p>
            <p className="text-xs font-medium text-gray-600">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="flex w-full flex-wrap gap-4 text-sm text-gray-600">
        <p>
          Reply rate:{" "}
          <span className="font-medium text-gray-900">
            {formatProspectAiRate(stats?.replyRate ?? null)}
          </span>
        </p>
        <p>
          Win rate:{" "}
          <span className="font-medium text-gray-900">
            {formatProspectAiRate(stats?.winRate ?? null)}
          </span>
        </p>
        <p>
          Qualified-to-Won:{" "}
          <span className="font-medium text-gray-900">
            {formatProspectAiRate(stats?.qualifiedToWon ?? null)}
          </span>
        </p>
      </div>

      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">Won Customers</h3>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["this_month", "This month"],
              ["last_30_days", "Last 30 days"],
              ["all_time", "All time"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={filter === value ? "default" : "outline"}
              className={filter === value ? "bg-brand-green hover:bg-brand-green/90" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {customersQuery.isLoading ? (
        <div className="flex w-full flex-col items-center justify-center gap-2 py-10">
          <Loader2 className="h-6 w-6 animate-spin text-brand-green" />
          <p className="text-sm text-gray-500">Loading wins…</p>
        </div>
      ) : customers.length === 0 ? (
        <ProspectAiEmptyState data-testid="prospect-won-empty">
          <p className="text-sm text-gray-600">No customers won yet.</p>
        </ProspectAiEmptyState>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact / Business</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>First outreach</TableHead>
                <TableHead>Won date</TableHead>
                <TableHead>Marked by</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((row) => (
                <TableRow key={row.contactId}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.source || "Prospect AI"}</TableCell>
                  <TableCell className="max-w-[140px] truncate">{row.campaign || "—"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {formatWonDate(row.firstOutreachAt)}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{formatWonDate(row.wonAt)}</TableCell>
                  <TableCell>{row.markedByName || "—"}</TableCell>
                  <TableCell>
                    <Badge className="bg-emerald-600 text-[10px]">Won</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </ProspectAiTabBody>
  );
}

function Workspace({
  status,
  autoFocusDiscover = false,
  onOpenGuide,
}: {
  status: ProspectAiStatus;
  autoFocusDiscover?: boolean;
  onOpenGuide: () => void;
}) {
  const searchString = useSearch();
  const activeTab = useMemo(
    () => parseTab(new URLSearchParams(searchString).get("tab")),
    [searchString],
  );
  const [, setLocation] = useLocation();
  const [analysisJob, setAnalysisJob] = useState<ProspectIntelligenceJobSummary | null>(null);
  const focusedDiscoverRef = useRef(false);

  const handleTabChange = (next: string) => {
    const params = new URLSearchParams(searchString);
    if (next === "discover") params.delete("tab");
    else params.set("tab", next);
    const q = params.toString();
    setLocation(q ? `${PROSPECT_AI_PATH}?${q}` : PROSPECT_AI_PATH);
  };

  useEffect(() => {
    if (!autoFocusDiscover || focusedDiscoverRef.current) return;
    if (activeTab !== "discover") {
      handleTabChange("discover");
      return;
    }
    const timer = window.setTimeout(() => {
      if (focusProspectAiDiscoverForm()) {
        focusedDiscoverRef.current = true;
        trackProspectAiGuideEvent("prospect_ai_discover_dialog_auto_opened");
      }
    }, 120);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus once after onboarding
  }, [autoFocusDiscover, activeTab]);

  return (
    <ProspectAiPageLayout>
      <header className="w-full space-y-0">
        <div className="inline-flex items-center gap-1 text-brand-green">
          <Star className="h-3 w-3 fill-current" aria-hidden />
          <span className="text-[10px] font-semibold uppercase tracking-wide">Growth Engine</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold tracking-tight text-gray-900 text-pretty sm:text-[1.35rem]">
              Prospect AI
            </h1>
            <p className="max-w-xl text-xs text-gray-600 text-pretty">
              Your AI employee for customer acquisition.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4 pt-1">
            <button
              type="button"
              className="text-sm font-medium text-cyan-800 hover:text-cyan-950"
              onClick={onOpenGuide}
              data-testid="prospect-ai-guide-link"
            >
              Prospect AI Guide
            </button>
            <button
              type="button"
              className={cn(
                "text-sm text-gray-600 hover:text-gray-900",
                activeTab === "activity" && "font-medium text-brand-green hover:text-brand-green",
              )}
              onClick={() => handleTabChange("activity")}
              data-testid="prospect-ai-activity-link"
            >
              {PROSPECT_AI_TAB_LABELS.activity}
            </button>
          </div>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full min-w-0 space-y-2">
        <TabsList className="h-auto w-full flex-nowrap justify-start gap-x-4 overflow-x-auto border-b border-gray-200 bg-transparent p-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PROSPECT_AI_PRIMARY_TABS.map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-8 shrink-0 rounded-none border-b-2 border-transparent px-0 pb-1.5 text-sm whitespace-nowrap data-[state=active]:border-brand-green data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              {PROSPECT_AI_TAB_LABELS[value]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="discover" className={PROSPECT_AI_TAB_PANEL_CLASS}>
          <DiscoverTab status={status} />
        </TabsContent>
        <TabsContent value="review" className={PROSPECT_AI_TAB_PANEL_CLASS}>
          <ProspectIntelligencePanel
            activeAnalysisJob={analysisJob}
            onAnalysisJobUpdate={setAnalysisJob}
            embedded
          />
        </TabsContent>
        <TabsContent value="campaign" className={PROSPECT_AI_TAB_PANEL_CLASS}>
          <ProspectOutreachQueuePanel embedded />
        </TabsContent>
        <TabsContent value="inbox" className={PROSPECT_AI_TAB_PANEL_CLASS}>
          <InboxTab />
        </TabsContent>
        <TabsContent value="activity" className={PROSPECT_AI_TAB_PANEL_CLASS}>
          <ActivityTab />
        </TabsContent>
        <TabsContent value="won" className={PROSPECT_AI_TAB_PANEL_CLASS}>
          <WonTab />
        </TabsContent>
      </Tabs>
    </ProspectAiPageLayout>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-full w-full min-w-0 bg-gradient-to-b from-gray-50 via-white to-emerald-50/30"
      data-prospect-ai-layout="shell"
    >
      {children}
    </div>
  );
}

export function ProspectAI() {
  const statusQuery = useProspectAiStatus();
  const { data: subscription } = useSubscription();
  const { user } = useAuth();
  const [localStatus, setLocalStatus] = useState<ProspectAiStatus | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [autoFocusDiscover, setAutoFocusDiscover] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  if (statusQuery.isLoading && !localStatus) {
    return (
      <Shell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </Shell>
    );
  }

  const status = localStatus ?? statusQuery.data ?? null;
  const activated = Boolean(status?.activated);
  const onboardingComplete =
    onboardingDismissed || isProspectAiOnboardingComplete(user?.id);
  const showFirstTimeGuide =
    activated && Boolean(status) && Boolean(user?.id) && !onboardingComplete;

  if (statusQuery.isError && !status) {
    return (
      <Shell>
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-sm text-red-600">
            {(statusQuery.error as Error)?.message || "Could not load Prospect AI status."}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => void statusQuery.refetch()}>
            Retry
          </Button>
        </div>
      </Shell>
    );
  }

  if (!activated || !status) {
    return (
      <Shell>
        <ActivationScreen
          onActivated={(next) => {
            setLocalStatus(next);
            void statusQuery.refetch();
          }}
        />
      </Shell>
    );
  }

  const completeOnboarding = (opts: { skipped?: boolean; finishDiscover?: boolean }) => {
    markProspectAiOnboardingComplete(user?.id);
    setOnboardingDismissed(true);
    if (opts.skipped) {
      trackProspectAiGuideEvent("prospect_ai_guide_skipped");
    } else {
      trackProspectAiGuideEvent("prospect_ai_guide_completed", {
        finish_discover: Boolean(opts.finishDiscover),
      });
    }
    setGuideOpen(false);
    if (opts.finishDiscover) {
      setAutoFocusDiscover(true);
    }
  };

  if (showFirstTimeGuide || guideOpen) {
    const aiBrainActive = Boolean(
      status?.aiBrain?.configured ||
        subscription?.limits?.effectiveHasAIBrain ||
        subscription?.subscription?.effectiveHasAIBrain ||
        subscription?.subscription?.trialIncludesAIBrain,
    );
    return (
      <Shell>
        <ProspectAiOnboarding
          mode={showFirstTimeGuide ? "first_time" : "reference"}
          aiBrainActive={aiBrainActive}
          onSkip={() => completeOnboarding({ skipped: true })}
          onFinishDiscover={() => {
            if (showFirstTimeGuide) {
              completeOnboarding({ finishDiscover: true });
            } else {
              setGuideOpen(false);
              setAutoFocusDiscover(true);
            }
          }}
          onViewFullGuide={() => {
            window.open("/user-guide#prospect-ai", "_blank", "noopener,noreferrer");
          }}
          onCloseReference={() => setGuideOpen(false)}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <Workspace
        status={status}
        autoFocusDiscover={autoFocusDiscover}
        onOpenGuide={() => setGuideOpen(true)}
      />
    </Shell>
  );
}

export default ProspectAI;
