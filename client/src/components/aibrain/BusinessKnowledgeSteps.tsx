/**
 * The one business-knowledge workflow: Teach AI → Analyze → Review & publish → Questions.
 *
 * There is a single way for knowledge to reach the assistant, and it ends at one button.
 * A scan only ever drafts; the user reviews what changed, removes what is wrong, and
 * publishes. Until then the assistant keeps answering from whatever was published before.
 * Customer questions are the last step in the same list — they shape the conversation,
 * not what the assistant knows.
 *
 * The copy here deliberately never mentions the storage generation behind it. A merchant
 * sees pages, what AI learned from them, and a publish action — not two knowledge systems.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  Boxes,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Home,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Hint, Step, type StepState } from "./WorkflowStep";
import type {
  KnowledgeFactView,
  KnowledgeReviewPayload,
  KnowledgeReviewSection,
} from "@shared/knowledgeReview";

type KnowledgeSource = {
  id: string;
  url: string;
  label: string;
  detectedType: string;
  status: string;
  isEnabled: boolean;
  charCount: number;
  errorMessage: string | null;
  lastScannedAt: string | null;
  lastSuccessfulScanAt: string | null;
};

type ScanJobItem = {
  url: string;
  label?: string;
  status: "pending" | "scanned" | "unchanged" | "failed" | "empty";
  added?: number;
  changed?: number;
  suggestions?: number;
  notes?: string[];
  error?: string;
};

type ScanJobView = {
  id: string;
  status: string;
  progressCurrent: number;
  progressTotal: number;
  factsProposed: number;
  errorMessage: string | null;
  items: Record<string, ScanJobItem>;
};

type SourcesResponse = {
  sources: KnowledgeSource[];
  latestJob: ScanJobView | null;
  /** True when this request adopted knowledge the workspace already had. */
  backfilled?: boolean;
};
type FactsResponse = KnowledgeReviewPayload & { knowledgeV2Enabled: boolean };
type RemovalImpact = {
  sourceId: string;
  orphanedFacts: Array<{ id: string; factType: string; summary: string }>;
  retainedCount: number;
};

const SOURCES_KEY = ["/api/ai/knowledge/sources"];
const FACTS_KEY = ["/api/ai/knowledge/facts"];

const CHANGE_STYLES: Record<KnowledgeFactView["changeType"], { label: string; className: string }> = {
  new: { label: "New", className: "bg-emerald-100 text-emerald-900" },
  changed: { label: "Changed", className: "bg-amber-100 text-amber-900" },
  removing: { label: "No longer on page", className: "bg-red-100 text-red-900" },
  suggested: { label: "Suggested", className: "bg-violet-100 text-violet-900" },
  unchanged: { label: "Published", className: "bg-slate-100 text-slate-700" },
};

const FRESHNESS_STYLES: Record<KnowledgeFactView["freshness"]["tier"], string> = {
  fresh: "text-emerald-700",
  aging: "text-amber-700",
  stale: "text-red-700",
};

function freshnessLabel(fact: KnowledgeFactView): string {
  const { ageDays, tier } = fact.freshness;
  const age = ageDays === 0 ? "today" : ageDays === 1 ? "1 day ago" : `${ageDays} days ago`;
  if (tier === "fresh") return `Checked ${age}`;
  if (tier === "aging") return `Checked ${age} — worth re-checking`;
  return `Checked ${age} — out of date`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What a page is called on screen, by the kind of page it was detected to be. */
const PAGE_TYPE_LABELS: Record<string, string> = {
  pricing: "Pricing page",
  services: "Services page",
  about: "About page",
  faq: "FAQ page",
  policy: "Policy page",
  contact: "Contact page",
  locations: "Locations page",
};

function urlKey(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[#?].*$/, "")
    .replace(/\/+$/, "");
}

/**
 * A source a merchant recognises: what they called the page, or what kind of page it is,
 * falling back to the address itself. Never the raw document title, which is written for
 * search engines and runs long.
 */
function shortSourceLabel(
  url: string,
  source: { label: string; url: string; detectedType: string } | undefined,
): string {
  if (source) {
    const custom = source.label?.trim();
    // `label` falls back to the page title server-side, so only use it when it is short
    // enough to read at a glance and is not just the address repeated.
    if (custom && custom.length <= 32 && urlKey(custom) !== urlKey(source.url)) return custom;
    const byType = PAGE_TYPE_LABELS[source.detectedType];
    if (byType) return byType;
  }
  return urlKey(url) || url;
}

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

// ---------------------------------------------------------------------------
// Review rows
// ---------------------------------------------------------------------------

function FactRow({
  fact,
  onRemove,
  removing,
  sourceLabel,
}: {
  fact: KnowledgeFactView;
  onRemove: (fact: KnowledgeFactView) => void;
  removing: boolean;
  sourceLabel: string | null;
}) {
  const change = CHANGE_STYLES[fact.changeType];
  const [showChanges, setShowChanges] = useState(false);
  const struck = fact.changeType === "removing";

  return (
    <li className="flex flex-col gap-1.5 px-3 py-2.5 text-sm" data-testid={`knowledge-fact-${fact.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          {fact.display ? (
            // Laid out in parts so a plan reads as a plan: what it is, what it costs, what
            // is in it. Every string here is the stored value, untouched.
            <div className={cn("space-y-1", struck && "opacity-60")}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span
                  className={cn(
                    "break-words font-semibold text-slate-900",
                    struck && "line-through",
                  )}
                >
                  {fact.display.title}
                </span>
                {fact.display.headline && (
                  <span
                    className={cn(
                      "break-words font-semibold text-violet-800",
                      struck && "line-through",
                    )}
                  >
                    {fact.display.headline}
                  </span>
                )}
              </div>
              {fact.display.bullets.length > 0 && (
                <ul className="space-y-0.5">
                  {fact.display.bullets.map((benefit, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[13px] text-slate-700">
                      <Check className="mt-[3px] h-3 w-3 shrink-0 text-emerald-600" aria-hidden />
                      <span className="break-words">{benefit}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className={cn("break-words text-slate-800", struck && "line-through text-slate-500")}>
              {fact.summary}
            </p>
          )}

          {/* The previous value is long enough to bury the new one, so it stays folded away
              until asked for. */}
          {fact.previousSummary && fact.changeType === "changed" && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setShowChanges((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-violet-800 hover:underline"
                aria-expanded={showChanges}
                data-testid={`button-show-changes-${fact.id}`}
              >
                <ChevronRight
                  className={cn("h-3 w-3 transition-transform", showChanges && "rotate-90")}
                  aria-hidden
                />
                {showChanges ? "Hide changes" : "Show changes"}
              </button>
              {showChanges && (
                <p className="break-words rounded border border-slate-100 bg-slate-50/70 px-2 py-1 text-xs text-slate-500">
                  Currently published: <span className="line-through">{fact.previousSummary}</span>
                </p>
              )}
            </div>
          )}
          {fact.supersededBy && (
            <p className="text-xs text-slate-500">
              Replaced by a more reliable source: {fact.supersededBy.summary}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-slate-500 hover:text-red-700"
          disabled={removing}
          onClick={() => onRemove(fact)}
          data-testid={`button-remove-fact-${fact.id}`}
          aria-label="Remove this detail"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className={cn("rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide", change.className)}>
          {change.label}
        </span>
        <span className="text-slate-500">{fact.precedenceLabel}</span>
        <span className={cn("inline-flex items-center gap-1", FRESHNESS_STYLES[fact.freshness.tier])}>
          <Clock className="h-3 w-3" aria-hidden />
          {freshnessLabel(fact)}
        </span>
        {fact.sourceUrl && sourceLabel && (
          <a
            href={fact.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-[220px] items-center gap-1 truncate text-violet-800 hover:underline"
          >
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">Source: {sourceLabel}</span>
          </a>
        )}
        {fact.provenanceUrls.length > 1 && (
          <span className="text-slate-500">Confirmed by {fact.provenanceUrls.length} pages</span>
        )}
        {fact.conflictBlocked && (
          <span className="inline-flex items-center gap-1 font-medium text-red-700">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            Needs your decision
          </span>
        )}
      </div>

      {fact.excerpt && (
        <p className="rounded border border-slate-100 bg-slate-50/70 px-2 py-1 text-[11px] italic text-slate-600">
          “{fact.excerpt}”
        </p>
      )}
    </li>
  );
}

function SectionBlock({
  section,
  onRemoveFact,
  removingId,
  labelForSource,
}: {
  section: KnowledgeReviewSection;
  onRemoveFact: (fact: KnowledgeFactView) => void;
  removingId: string | null;
  labelForSource: (url: string) => string;
}) {
  const { counts } = section;
  // Spelled out rather than totalled: "7 new" and "7 changed" are different amounts of work.
  const breakdown = [
    counts.new > 0 && `${counts.new} new`,
    counts.changed > 0 && `${counts.changed} changed`,
    counts.removing > 0 && `${counts.removing} no longer on page`,
    counts.suggested > 0 && `${counts.suggested} suggested`,
  ].filter((s): s is string => Boolean(s));

  return (
    <AccordionItem value={section.id} className="border-slate-200/80">
      <AccordionTrigger className="px-3 py-2.5 text-sm hover:no-underline">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 pr-2 text-left">
          <span className="font-medium text-slate-900">{section.title}</span>
          <span className="text-xs text-slate-500">{plural(counts.total, "detail", "details")}</span>
          {breakdown.length > 0 && (
            <Badge className="bg-violet-100 text-[10px] font-semibold text-violet-900 hover:bg-violet-100">
              {breakdown.join(" · ")}
            </Badge>
          )}
          {section.freshness.stale > 0 && (
            <span className="text-[11px] text-red-700">{section.freshness.stale} out of date</span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-0">
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {section.facts.map((fact) => (
            <FactRow
              key={fact.id}
              fact={fact}
              onRemove={onRemoveFact}
              removing={removingId === fact.id}
              sourceLabel={fact.sourceUrl ? labelForSource(fact.sourceUrl) : null}
            />
          ))}
        </ul>
      </AccordionContent>
    </AccordionItem>
  );
}

// ---------------------------------------------------------------------------

type LiveBusinessDataProviderRow = {
  id: string;
  name: string;
  icon: string;
  status: "connected" | "disconnected" | "coming_soon" | "error";
  detail: string | null;
};

function liveProviderIcon(icon: string) {
  switch (icon) {
    case "package":
      return Package;
    case "shoppingBag":
      return ShoppingBag;
    case "home":
      return Home;
    case "calendar":
      return Calendar;
    case "boxes":
      return Boxes;
    default:
      return Package;
  }
}

function liveProviderStatusLabel(provider: LiveBusinessDataProviderRow): string {
  if (provider.id === "businessPackages") {
    if (provider.status === "connected") {
      return provider.detail || "Connected";
    }
    return provider.detail || "Not configured";
  }
  if (provider.status === "coming_soon") return "Coming Soon";
  if (provider.status === "error") return provider.detail || "Unavailable";
  if (provider.status === "disconnected") return provider.detail || "Not connected";
  return provider.detail || "Connected";
}

function LiveBusinessDataPanel({
  open,
  onOpenChange,
  providers,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers?: LiveBusinessDataProviderRow[];
  loading: boolean;
}) {
  const rows = providers ?? [];

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="pt-1">
      <CollapsibleTrigger
        type="button"
        className="flex w-full items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50/60 px-3 py-2.5 text-left hover:bg-slate-50"
        data-testid="button-live-business-data"
      >
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Live Business Data
          </p>
          <p className="text-xs text-slate-600">
            Offers, products, listings, and calendar AI can query directly. Manage offers in Settings.
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-500 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        {loading && rows.length === 0 ? (
          <div className="flex items-center gap-2 px-1 py-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Loading…
          </div>
        ) : (
          <ul
            className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200/80 bg-white text-sm"
            data-testid="list-live-business-data"
          >
            {rows.map((provider) => {
              const Icon = liveProviderIcon(provider.icon);
              const statusLabel = liveProviderStatusLabel(provider);
              const connected = provider.status === "connected";
              const comingSoon = provider.status === "coming_soon";
              return (
                <li
                  key={provider.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                  data-testid={`live-provider-${provider.id}`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                    {provider.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs font-medium",
                      connected && "text-emerald-700",
                      comingSoon && "text-slate-500",
                      provider.status === "disconnected" && "text-slate-500",
                      provider.status === "error" && "text-amber-700",
                    )}
                  >
                    {statusLabel}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------

export function BusinessKnowledgeSteps({
  aboutFields,
  questionsStep,
}: {
  aboutFields?: ReactNode;
  /** Rendered as the final step, inside this list, so the workflow stays one column. */
  questionsStep?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [newUrl, setNewUrl] = useState("");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [removingFactId, setRemovingFactId] = useState<string | null>(null);
  const [liveDataOpen, setLiveDataOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{
    source: KnowledgeSource;
    impact: RemovalImpact | null;
  } | null>(null);

  const sourcesQuery = useQuery<SourcesResponse>({ queryKey: SOURCES_KEY });
  const factsQuery = useQuery<FactsResponse>({ queryKey: FACTS_KEY });
  const liveBusinessDataQuery = useQuery<{
    providers: Array<{
      id: string;
      name: string;
      icon: string;
      status: "connected" | "disconnected" | "coming_soon" | "error";
      detail: string | null;
      capabilities: string[];
    }>;
  }>({
    queryKey: ["/api/ai/live-business-data"],
  });

  const jobQuery = useQuery<ScanJobView>({
    queryKey: ["/api/ai/knowledge/scan", activeJobId],
    enabled: Boolean(activeJobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 2000;
    },
  });

  const liveJob = activeJobId ? jobQuery.data : sourcesQuery.data?.latestJob ?? null;
  const scanRunning = Boolean(liveJob && liveJob.status !== "completed" && liveJob.status !== "failed");

  /**
   * Jobs already reported. The completion handler clears `activeJobId` before the sources
   * list has refetched, so without this the still-running copy in that cached list would be
   * adopted again and announced twice.
   */
  const reportedJobs = useRef(new Set<string>());

  // An analysis runs on the server and outlives this page. If one is still going when the
  // step mounts, pick it back up so progress keeps moving and the review refreshes on its
  // own — otherwise a returning user sees a spinner frozen at the count it left at.
  useEffect(() => {
    const latest = sourcesQuery.data?.latestJob;
    if (!latest || activeJobId) return;
    if (latest.status === "completed" || latest.status === "failed") return;
    if (reportedJobs.current.has(latest.id)) return;
    setActiveJobId(latest.id);
  }, [sourcesQuery.data?.latestJob, activeJobId]);

  // Adoption of a workspace's existing knowledge happens on the sources request, which may
  // land after the facts request it should have populated. Ask again when that happened.
  useEffect(() => {
    if (sourcesQuery.data?.backfilled) {
      void queryClient.invalidateQueries({ queryKey: FACTS_KEY });
    }
  }, [sourcesQuery.data?.backfilled, queryClient]);

  useEffect(() => {
    if (!activeJobId || !jobQuery.data) return;
    if (jobQuery.data.status !== "completed" && jobQuery.data.status !== "failed") return;
    reportedJobs.current.add(activeJobId);
    setActiveJobId(null);
    void queryClient.invalidateQueries({ queryKey: SOURCES_KEY });
    void queryClient.invalidateQueries({ queryKey: FACTS_KEY });
    if (jobQuery.data.status === "completed") {
      toast({
        title: "Analysis finished",
        description:
          jobQuery.data.factsProposed > 0
            ? `${plural(jobQuery.data.factsProposed, "change is", "changes are")} ready for you to review.`
            : "Nothing changed. What you published stays in use.",
      });
    }
  }, [activeJobId, jobQuery.data, queryClient]);

  const addSourceMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("POST", "/api/ai/knowledge/sources", { url });
      return res.json() as Promise<{ created?: boolean; source: { label: string } }>;
    },
    onSuccess: (data) => {
      setNewUrl("");
      void queryClient.invalidateQueries({ queryKey: SOURCES_KEY });
      if (data.created === false) {
        toast({
          title: "Already on your list",
          description: "That page is here already, so nothing was added.",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Could not add page", description: err.message, variant: "destructive" });
    },
  });

  const removeSourceMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const res = await apiRequest("DELETE", `/api/ai/knowledge/sources/${sourceId}`);
      return res.json();
    },
    onSuccess: () => {
      setPendingRemoval(null);
      void queryClient.invalidateQueries({ queryKey: SOURCES_KEY });
      void queryClient.invalidateQueries({ queryKey: FACTS_KEY });
    },
    onError: (err: Error) => {
      toast({ title: "Could not remove page", description: err.message, variant: "destructive" });
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/knowledge/scan", {});
      return res.json() as Promise<{ jobId: string }>;
    },
    onSuccess: (data) => {
      setActiveJobId(data.jobId);
      void queryClient.invalidateQueries({ queryKey: SOURCES_KEY });
    },
    onError: (err: Error) => {
      toast({ title: "Could not start the analysis", description: err.message, variant: "destructive" });
    },
  });

  const removeFactMutation = useMutation({
    mutationFn: async (factId: string) => {
      const res = await apiRequest("DELETE", `/api/ai/knowledge/facts/${factId}`);
      return res.json();
    },
    onSettled: () => setRemovingFactId(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: FACTS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["/api/ai/business-knowledge"] });
    },
    onError: (err: Error) => {
      toast({ title: "Could not remove that", description: err.message, variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/knowledge/publish", {});
      return res.json() as Promise<{
        published: number;
        updated: number;
        retired: number;
        blockedConflicts: Array<{ factKey: string }>;
        skippedSuggestions: number;
      }>;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: FACTS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["/api/ai/business-knowledge"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/ai/workspace-intelligence"] });
      const applied = data.published + data.updated + data.retired;
      const held = data.blockedConflicts.length + data.skippedSuggestions;
      toast({
        title: "Published",
        description:
          held > 0
            ? `${plural(applied, "change is", "changes are")} now in use by AI. ${plural(held, "still needs", "still need")} your decision.`
            : `${plural(applied, "change is", "changes are")} now in use by AI.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Could not publish", description: err.message, variant: "destructive" });
    },
  });

  const discardMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/knowledge/discard", {});
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: FACTS_KEY });
      toast({ title: "Draft changes discarded", description: "What you published stays in use." });
    },
    onError: (err: Error) => {
      toast({ title: "Could not discard", description: err.message, variant: "destructive" });
    },
  });

  async function beginSourceRemoval(source: KnowledgeSource) {
    setPendingRemoval({ source, impact: null });
    try {
      const res = await apiRequest("GET", `/api/ai/knowledge/sources/${source.id}/removal-impact`);
      const impact = (await res.json()) as RemovalImpact;
      setPendingRemoval((prev) => (prev && prev.source.id === source.id ? { ...prev, impact } : prev));
    } catch {
      /* the dialog still works; it just cannot list what depends on the page */
    }
  }

  const sources = sourcesQuery.data?.sources ?? [];
  const facts = factsQuery.data;
  const totals = facts?.totals;
  const pendingCount = totals ? totals.new + totals.changed + totals.removing + totals.suggested : 0;
  const publishedCount = totals?.published ?? 0;
  const blockedConflicts = facts?.conflicts.filter((c) => c.resolution === "blocked") ?? [];

  /**
   * What publishing would actually apply. A contested value is held until the user removes
   * one side, and a proposal against something they control is never applied silently — so
   * a review made up entirely of those two would leave Publish enabled and do nothing.
   */
  const publishableCount = useMemo(() => {
    if (!facts) return 0;
    let n = 0;
    for (const section of facts.sections) {
      for (const fact of section.facts) {
        if (fact.state !== "draft") continue;
        if (fact.changeType === "suggested" || fact.conflictBlocked) continue;
        n += 1;
      }
    }
    return n;
  }, [facts]);
  const heldBackOnly = pendingCount > 0 && publishableCount === 0;

  const firstPendingSectionId = useMemo(
    () =>
      facts?.sections.find(
        (s) => s.counts.new + s.counts.changed + s.counts.removing + s.counts.suggested > 0,
      )?.id ?? null,
    [facts],
  );

  // The pages the user named in step 1 are the best source labels available, so the review
  // step borrows them instead of showing whatever title the page happened to carry.
  const labelForSource = useMemo(() => {
    const byUrl = new Map(sources.map((s) => [urlKey(s.url), s]));
    return (url: string) => shortSourceLabel(url, byUrl.get(urlKey(url)));
  }, [sources]);

  const jobItems = useMemo(() => (liveJob ? Object.entries(liveJob.items) : []), [liveJob]);

  const lastAnalyzed = useMemo(() => {
    const stamps = sources
      .map((s) => s.lastSuccessfulScanAt || s.lastScannedAt)
      .filter((s): s is string => Boolean(s))
      .sort();
    return formatWhen(stamps[stamps.length - 1]);
  }, [sources]);

  const teachState: StepState = sources.length > 0 ? "done" : "ready";
  const analyzeState: StepState = scanRunning
    ? "busy"
    : sources.length === 0
      ? "todo"
      : lastAnalyzed
        ? "done"
        : "ready";
  const reviewState: StepState = pendingCount > 0 ? "ready" : publishedCount > 0 ? "done" : "todo";

  return (
    <section aria-labelledby="business-knowledge-heading" className="space-y-4">
      <div className="space-y-1">
        <h2 id="business-knowledge-heading" className="text-lg font-semibold tracking-tight text-slate-900">
          Business knowledge
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
          Your assistant answers from what you publish here, and nothing else. Three steps, one
          place.
        </p>
      </div>

      <ol className="space-y-5">
        <Step
          index={1}
          title="Teach AI"
          description="Tell AI what your business does, then point it at the pages that spell out the details."
          state={teachState}
          status={sources.length > 0 ? plural(sources.length, "page", "pages") : "Start here"}
        >
          {aboutFields}

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pages AI learns from
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                className="h-9 min-w-[220px] flex-1 text-sm"
                placeholder="https://yourbusiness.com/pricing"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newUrl.trim()) addSourceMutation.mutate(newUrl.trim());
                }}
                data-testid="input-knowledge-source-url"
              />
              <Button
                type="button"
                variant="outline"
                className="h-9 border-violet-200/80 text-violet-900 hover:bg-violet-50"
                disabled={!newUrl.trim() || addSourceMutation.isPending}
                onClick={() => addSourceMutation.mutate(newUrl.trim())}
                data-testid="button-add-knowledge-source"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add page
              </Button>
            </div>

            {sources.length > 0 ? (
              /* Bounded: a workspace with dozens of pages must not push the rest of the
                 workflow off the screen. */
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200/80 bg-white text-xs">
                {sources.map((source) => (
                  <li
                    key={source.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2"
                  >
                    {/* Full width of its own row until there is room beside the badges. */}
                    <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                      <p className="truncate font-medium text-slate-800">{source.label}</p>
                      <p className="truncate font-mono text-[11px] text-slate-500">{source.url}</p>
                      {source.errorMessage && (
                        <p className="break-words text-[11px] text-red-700">{source.errorMessage}</p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                      {source.detectedType}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        source.status === "scanned" && "bg-emerald-100 text-emerald-900",
                        source.status === "failed" && "bg-red-100 text-red-900",
                        source.status === "pending" && "bg-slate-100 text-slate-700",
                        source.status === "scanning" && "bg-violet-100 text-violet-900",
                        source.status === "stale" && "bg-amber-100 text-amber-900",
                      )}
                    >
                      {source.status}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 shrink-0 px-2 text-slate-500 hover:text-red-700 sm:ml-0"
                      onClick={() => void beginSourceRemoval(source)}
                      data-testid={`button-remove-source-${source.id}`}
                      aria-label="Remove this page"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <Hint>
                Add the pages that describe what you sell — pricing, services, FAQ, policies. Each
                page is read on its own, so a long page can never crowd out a short one.
              </Hint>
            )}
          </div>

          <LiveBusinessDataPanel
            open={liveDataOpen}
            onOpenChange={setLiveDataOpen}
            providers={liveBusinessDataQuery.data?.providers}
            loading={liveBusinessDataQuery.isLoading}
          />
        </Step>

        <Step
          index={2}
          title="Analyze knowledge"
          description="AI reads each page separately and drafts what it found. Nothing reaches your replies at this stage."
          state={analyzeState}
          status={
            scanRunning && liveJob
              ? `Reading ${liveJob.progressCurrent} of ${liveJob.progressTotal}`
              : lastAnalyzed
                ? `Last run ${lastAnalyzed}`
                : "Not run yet"
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              className="h-9 bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-500 hover:to-purple-500"
              disabled={sources.length === 0 || scanRunning || scanMutation.isPending}
              onClick={() => scanMutation.mutate()}
              data-testid="button-analyze-knowledge"
            >
              {scanRunning || scanMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing {liveJob ? `${liveJob.progressCurrent}/${liveJob.progressTotal}` : ""}…
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  {lastAnalyzed ? "Analyze again" : "Analyze pages"}
                </>
              )}
            </Button>
            {sources.length === 0 && (
              <span className="text-sm text-slate-500">Add a page in step 1 first.</span>
            )}
          </div>

          {liveJob?.errorMessage && (
            <p className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-sm text-red-900">
              {liveJob.errorMessage}
            </p>
          )}

          {jobItems.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-200/80 bg-white">
              <p className="border-b border-slate-100 bg-slate-50/80 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Page by page
              </p>
              <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto text-xs">
                {jobItems.map(([id, item]) => (
                  <li key={id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-slate-800">{item.label || item.url}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        item.status === "scanned" && "bg-emerald-100 text-emerald-900",
                        item.status === "unchanged" && "bg-slate-100 text-slate-700",
                        item.status === "pending" && "bg-slate-100 text-slate-500",
                        item.status === "failed" && "bg-red-100 text-red-900",
                        item.status === "empty" && "bg-amber-100 text-amber-900",
                      )}
                    >
                      {item.status}
                    </span>
                    {typeof item.added === "number" && item.added + (item.changed ?? 0) > 0 && (
                      <span className="text-[11px] text-slate-600">
                        {item.added} new · {item.changed ?? 0} changed
                      </span>
                    )}
                    {(item.error || item.notes?.length) && (
                      <span className="w-full text-[11px] leading-snug text-slate-500">
                        {item.error || item.notes?.join(" ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Step>

        <Step
          index={3}
          title="Review what AI learned"
          description="Check what AI learned from your pages. Remove anything incorrect, then publish when it looks right — publishing is the only action that changes what your assistant says."
          state={reviewState}
          status={
            pendingCount > 0
              ? `${pendingCount} to review`
              : publishedCount > 0
                ? `${plural(publishedCount, "detail", "details")} published`
                : "Nothing yet"
          }
          isLast={!questionsStep}
        >
          {blockedConflicts.length > 0 && (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2.5">
              <p className="flex items-center gap-2 text-sm font-medium text-red-900">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                {plural(blockedConflicts.length, "value needs", "values need")} your decision
              </p>
              <p className="text-xs text-red-900/80">
                Two pages of equal standing disagree. Nothing publishes for these until you remove
                the wrong one.
              </p>
              <ul className="space-y-1.5 text-xs">
                {blockedConflicts.map((conflict) => (
                  <li key={conflict.factKey} className="rounded border border-red-200/70 bg-white/80 px-2 py-1.5">
                    <p className="font-medium text-slate-800">{conflict.factTypeLabel}</p>
                    <p className="text-slate-700">{conflict.winner.summary}</p>
                    {conflict.losers.map((loser) => (
                      <p key={loser.factId} className="text-slate-600">
                        vs. {loser.summary}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {factsQuery.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading what AI knows…
            </p>
          ) : facts && facts.sections.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                <span>
                  <span className="font-semibold text-slate-900">{publishedCount}</span> published
                </span>
                {pendingCount > 0 && (
                  <span className="font-medium text-violet-800">{pendingCount} awaiting review</span>
                )}
                {facts.freshness.stale > 0 && (
                  <span className="text-red-700">{facts.freshness.stale} out of date</span>
                )}
                {facts.freshness.oldestVerifiedAt && (
                  <span>Oldest check: {formatWhen(facts.freshness.oldestVerifiedAt)}</span>
                )}
              </div>

              {/* Only the first section with something to review opens. A large site can
                  propose changes in every section, and opening them all buries the page. */}
              <Accordion
                type="multiple"
                key={firstPendingSectionId ?? "reviewed"}
                defaultValue={firstPendingSectionId ? [firstPendingSectionId] : []}
                className="overflow-hidden rounded-lg border border-slate-200/80 bg-white"
              >
                {facts.sections.map((section) => (
                  <SectionBlock
                    key={section.id}
                    section={section}
                    removingId={removingFactId}
                    labelForSource={labelForSource}
                    onRemoveFact={(fact) => {
                      setRemovingFactId(fact.id);
                      removeFactMutation.mutate(fact.id);
                    }}
                  />
                ))}
              </Accordion>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  className="h-9 bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-500 hover:to-purple-500"
                  disabled={publishableCount === 0 || publishMutation.isPending}
                  onClick={() => publishMutation.mutate()}
                  data-testid="button-publish-knowledge"
                >
                  {publishMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Publishing…
                    </>
                  ) : (
                    <>
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      {publishableCount > 0
                        ? `Publish ${plural(publishableCount, "change", "changes")}`
                        : "Publish"}
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 px-2 text-sm text-slate-600 hover:text-slate-900"
                  disabled={!facts.hasPendingChanges || discardMutation.isPending}
                  onClick={() => discardMutation.mutate()}
                  data-testid="button-discard-knowledge-drafts"
                >
                  Discard draft changes
                </Button>
              </div>

              {publishMutation.isSuccess && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-3 py-2 text-sm">
                  <span className="text-emerald-900">Your assistant is using this now.</span>
                  <Link
                    href="/app/inbox"
                    className="inline-flex items-center gap-1 font-medium text-emerald-900 underline underline-offset-2 hover:text-emerald-700"
                    data-testid="link-test-knowledge"
                  >
                    Test AI knowledge
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </Link>
                </div>
              )}

              {heldBackOnly && (
                <p className="text-xs text-slate-600">
                  Everything waiting needs a decision from you first — remove the value you do
                  not want, or discard the draft changes.
                </p>
              )}
            </>
          ) : (
            <Hint>
              Nothing to review yet. Once you analyze your pages, everything AI picked up shows up
              here with its source, and you decide what goes live.
            </Hint>
          )}
        </Step>

        {questionsStep}
      </ol>

      <AlertDialog
        open={Boolean(pendingRemoval)}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this page?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>{pendingRemoval?.source.label} will no longer be read.</p>
                {pendingRemoval?.impact === null ? (
                  <p className="text-slate-500">Checking what depends on it…</p>
                ) : pendingRemoval && pendingRemoval.impact!.orphanedFacts.length > 0 ? (
                  <>
                    <p className="font-medium text-slate-800">
                      {plural(pendingRemoval.impact!.orphanedFacts.length, "detail comes", "details come")} only
                      from this page and will stop being re-checked:
                    </p>
                    <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
                      {pendingRemoval.impact!.orphanedFacts.slice(0, 12).map((f) => (
                        <li key={f.id} className="truncate">
                          {f.summary}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-slate-600">
                    Everything from this page is also confirmed elsewhere, so nothing is lost.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep page</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRemoval) removeSourceMutation.mutate(pendingRemoval.source.id);
              }}
              data-testid="button-confirm-remove-source"
            >
              Remove page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export default BusinessKnowledgeSteps;
