import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Brain,
  Check,
  ChevronRight,
  Inbox,
  Loader2,
  MapPin,
  Radar,
  Search,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { useSubscription } from "@/lib/subscription-context";
import {
  AI_BRAIN_SOURCE_LABELS,
  PROSPECT_AI_PATH,
  prospectDiscoveriesPlanPanel,
  useActivateProspectAi,
  useProspectAiActivity,
  useProspectAiDiscover,
  useProspectAiStatus,
  useSendDiscoverToReview,
  type ProspectAiDiscoverResult,
  type ProspectAiStatus,
} from "@/lib/prospectAi";
import { ProspectAiCardArt } from "@/components/growthEngines/ProspectAiCardArt";
import { GhlProspectImport, ProspectImportHistoryPanel } from "@/components/settings/GhlProspectImport";
import { ProspectIntelligencePanel } from "@/components/settings/ProspectIntelligencePanel";
import { ProspectOutreachQueuePanel } from "@/components/settings/ProspectOutreachQueuePanel";
import type { ProspectIntelligenceJobSummary } from "@shared/prospectImport";
import { TEMPLATES_GROWTH_ENGINES_TAB_PATH } from "@/lib/growthEnginesCatalog";
import { cn } from "@/lib/utils";

const WORKFLOW_STEPS = [
  { key: "discover", label: "Discover" },
  { key: "review", label: "AI Review" },
  { key: "campaign", label: "Campaigns" },
  { key: "inbox", label: "Inbox" },
  { key: "close", label: "Close" },
] as const;

type WorkspaceTab = "discover" | "review" | "campaign" | "activity";

function parseTab(raw: string | null): WorkspaceTab {
  if (raw === "review" || raw === "campaign" || raw === "activity") return raw;
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

function formatActivityDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function QuotaMeter({ status }: { status: ProspectAiStatus }) {
  const used = Math.max(0, status.used ?? 0);
  const monthlyQuota = Math.max(0, status.monthlyQuota ?? 0);
  const remaining = Math.max(0, status.remaining ?? monthlyQuota - used);
  const pct =
    monthlyQuota > 0 ? Math.min(100, Math.round((used / monthlyQuota) * 100)) : 0;
  const exhausted = monthlyQuota > 0 && remaining <= 0;
  const nearing =
    !exhausted && monthlyQuota > 0 && (remaining / monthlyQuota <= 0.15 || remaining <= 15);
  const isStarter = String(status.plan || "").toLowerCase().includes("starter");

  return (
    <div className="rounded-xl border border-gray-200/90 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Prospect Discoveries
          </p>
          <p className="mt-1 text-sm text-gray-800">
            <span className="font-semibold tabular-nums text-gray-900">{used}</span>
            {" of "}
            <span className="tabular-nums">{monthlyQuota}</span> used this month
          </p>
          <p className="mt-0.5 text-xs text-gray-500">Resets each billing month</p>
        </div>
        <Badge variant="outline" className="capitalize shrink-0">
          {status.plan || "Plan"}
        </Badge>
      </div>
      <Progress value={pct} className="mt-3 h-2" />
      {exhausted ? (
        <p className="mt-3 text-sm text-amber-900">
          You’ve used all of your monthly Prospect Discoveries.
          {isStarter ? (
            <>
              {" "}
              Upgrade to Pro for 500 Prospect Discoveries each month.
            </>
          ) : null}
        </p>
      ) : nearing ? (
        <p className="mt-3 text-sm text-amber-800">
          You’re nearing your monthly Prospect Discovery limit.
        </p>
      ) : null}
    </div>
  );
}

function AiBrainPanel({
  status,
  continueBasic,
  onContinueBasic,
}: {
  status: ProspectAiStatus;
  continueBasic: boolean;
  onContinueBasic: () => void;
}) {
  const brain = status.aiBrain;
  if (brain.configured) {
    return (
      <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
            <Brain className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-medium text-emerald-950">Powered by AI Brain</p>
            <p className="text-sm text-emerald-900/80">
              Prospect analysis uses your configured business intelligence for sharper fit scoring.
            </p>
            <ul className="flex flex-wrap gap-2">
              {AI_BRAIN_SOURCE_LABELS.map(({ key, label }) => (
                <li key={key}>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[11px]",
                      brain[key]
                        ? "border-emerald-300 bg-white text-emerald-900"
                        : "border-gray-200 bg-gray-50 text-gray-500",
                    )}
                  >
                    {brain[key] ? <Check className="mr-1 h-3 w-3" /> : null}
                    {label}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (continueBasic) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm text-gray-600">
        Continuing with basic analysis. You can configure AI Brain anytime for richer fit scoring.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium text-amber-950">Prospect AI works even better with AI Brain.</p>
          <p className="mt-1 text-sm text-amber-900/80">
            Optional — configure AI Brain for richer fit analysis, or continue with basic analysis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link href="/app/ai-brain">
            <Button type="button" variant="outline" size="sm">
              Configure AI Brain
            </Button>
          </Link>
          <Button type="button" size="sm" variant="secondary" onClick={onContinueBasic}>
            Continue with Basic Analysis
          </Button>
        </div>
      </div>
    </div>
  );
}

function WorkflowStrip({ active }: { active: WorkspaceTab }) {
  const activeKey =
    active === "campaign" ? "campaign" : active === "review" ? "review" : "discover";
  return (
    <nav
      aria-label="Prospect AI workflow"
      className="flex flex-wrap items-center gap-1.5 text-xs sm:gap-2 sm:text-sm"
    >
      {WORKFLOW_STEPS.map((step, i) => {
        const isActive = step.key === activeKey;
        return (
          <div key={step.key} className="flex items-center gap-1.5 sm:gap-2">
            {i > 0 ? <ChevronRight className="h-3.5 w-3.5 text-gray-300" aria-hidden /> : null}
            <span
              className={cn(
                "rounded-full px-2.5 py-1 font-medium transition-colors",
                isActive
                  ? "bg-brand-green/10 text-brand-green"
                  : "text-gray-500",
              )}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </nav>
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
            href="/app/settings"
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
  const [businessType, setBusinessType] = useState("");
  const [location, setLocation] = useState("");
  const [radiusKm, setRadiusKm] = useState("");
  const [continueBasic, setContinueBasic] = useState(false);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [results, setResults] = useState<ProspectAiDiscoverResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [ghlOpen, setGhlOpen] = useState(false);

  const discover = useProspectAiDiscover();
  const sendToReview = useSendDiscoverToReview(searchId);

  const allSelected = results.length > 0 && selectedIds.size === results.length;

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(results.map((r) => r.id)));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-8">
      <QuotaMeter status={status} />
      <AiBrainPanel
        status={status}
        continueBasic={continueBasic}
        onContinueBasic={() => setContinueBasic(true)}
      />

      <div className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green">
            <Radar className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Discover prospects</h2>
            <p className="mt-1 text-sm text-gray-600">
              Search by business type and location. Selected results go to AI Review for fit analysis.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-1 lg:col-span-1">
            <Label htmlFor="pai-business-type">Business Type</Label>
            <Input
              id="pai-business-type"
              className="mt-1.5"
              placeholder="e.g. Dental clinics"
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
            />
          </div>
          <div className="sm:col-span-1 lg:col-span-1">
            <Label htmlFor="pai-location">Location</Label>
            <Input
              id="pai-location"
              className="mt-1.5"
              placeholder="e.g. Austin, TX"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pai-radius">Radius (km, optional)</Label>
            <Input
              id="pai-radius"
              type="number"
              min={1}
              className="mt-1.5"
              placeholder="Optional"
              value={radiusKm}
              onChange={(e) => setRadiusKm(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full bg-brand-green hover:bg-brand-green/90"
              disabled={
                discover.isPending || !businessType.trim() || !location.trim() || status.remaining < 1
              }
              onClick={() => {
                const body: { businessType: string; location: string; radiusKm?: number } = {
                  businessType: businessType.trim(),
                  location: location.trim(),
                };
                const radius = Number(radiusKm);
                if (radiusKm.trim() && Number.isFinite(radius) && radius > 0) {
                  body.radiusKm = radius;
                }
                discover.mutate(body, {
                  onSuccess: (data) => {
                    setSearchId(data.search.id);
                    setResults(data.results ?? []);
                    setSelectedIds(new Set((data.results ?? []).map((r) => r.id)));
                    toast({
                      title: "Discovery complete",
                      description: `${data.results?.length ?? 0} prospects found`,
                    });
                  },
                  onError: (err: Error) =>
                    toast({
                      title: "Discovery failed",
                      description: err.message,
                      variant: "destructive",
                    }),
                });
              }}
              data-testid="prospect-ai-discover"
            >
              {discover.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Discovering…
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Discover Prospects
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {results.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{results.length}</span> results
              {selectedIds.size > 0 ? (
                <>
                  {" · "}
                  <span className="font-medium">{selectedIds.size}</span> selected
                </>
              ) : null}
            </p>
            <Button
              size="sm"
              className="bg-brand-green hover:bg-brand-green/90"
              disabled={!selectedIds.size || sendToReview.isPending || !searchId}
              onClick={() => {
                sendToReview.mutate([...selectedIds], {
                  onSuccess: () => {
                    toast({
                      title: "Sent to Review",
                      description: `${selectedIds.size} prospect(s) ready for AI review`,
                    });
                    setSelectedIds(new Set());
                  },
                  onError: (err: Error) =>
                    toast({
                      title: "Send failed",
                      description: err.message,
                      variant: "destructive",
                    }),
                });
              }}
              data-testid="prospect-ai-send-to-review"
            >
              {sendToReview.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Send to AI Review
            </Button>
          </div>
          <div className="overflow-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Contact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row) => (
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/50 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">GoHighLevel Import</p>
            <p className="mt-1 text-sm text-gray-600">
              Secondary acquisition source — import existing CRM contacts into Review.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setGhlOpen((v) => !v)}
            data-testid="prospect-ai-toggle-ghl"
          >
            {ghlOpen ? "Hide import" : "Open GoHighLevel Import"}
          </Button>
        </div>
        {ghlOpen ? (
          <div className="mt-5 border-t border-gray-200/80 pt-5">
            <GhlProspectImport view="embedded" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ActivityTab() {
  const activityQuery = useProspectAiActivity();
  const { data: outreachDash } = useQuery({
    queryKey: ["/api/growth-tools/prospect-outreach/dashboard", "activity-summary"],
    queryFn: async () => {
      const res = await fetch("/api/growth-tools/prospect-outreach/dashboard", {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json() as Promise<{
        queued?: number;
        sentToday?: number;
        outreachSentTotal?: number;
        replied?: number;
        failed?: number;
      }>;
    },
    staleTime: 15_000,
    retry: false,
  });

  const searches = activityQuery.data?.searches ?? [];
  const events = [
    ...(activityQuery.data?.events ?? []),
    ...(activityQuery.data?.campaignEvents ?? []),
    ...(activityQuery.data?.outreachEvents ?? []),
  ];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-gray-900">Discovery searches</h3>
        {activityQuery.isLoading ? (
          <p className="text-sm text-gray-500">Loading activity…</p>
        ) : searches.length === 0 ? (
          <p className="text-sm text-gray-500">No discovery searches yet.</p>
        ) : (
          <div className="overflow-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business type</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Radius</TableHead>
                  <TableHead>Results</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searches.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.businessType || "—"}</TableCell>
                    <TableCell>{s.location || "—"}</TableCell>
                    <TableCell>{s.radiusKm != null ? `${s.radiusKm} km` : "—"}</TableCell>
                    <TableCell>{s.resultCount ?? "—"}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatActivityDate(s.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {(events.length > 0 || outreachDash) && (
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-gray-900">Campaign & outreach events</h3>
          {outreachDash ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { label: "Queued", value: outreachDash.queued ?? 0 },
                { label: "Sent today", value: outreachDash.sentToday ?? 0 },
                { label: "Outreach sent", value: outreachDash.outreachSentTotal ?? 0 },
                { label: "Replied", value: outreachDash.replied ?? 0 },
                { label: "Failed", value: outreachDash.failed ?? 0 },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                  <p className="text-xl font-bold text-gray-900">{c.value}</p>
                  <p className="text-xs text-gray-500">{c.label}</p>
                </div>
              ))}
            </div>
          ) : null}
          {events.length > 0 ? (
            <div className="overflow-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((ev, i) => (
                    <TableRow key={ev.id || `${ev.type}-${ev.createdAt}-${i}`}>
                      <TableCell className="font-medium">
                        {ev.label || ev.description || "—"}
                      </TableCell>
                      <TableCell>{ev.type || ev.channel || "—"}</TableCell>
                      <TableCell>{ev.status || "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatActivityDate(ev.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </section>
      )}

      <ProspectImportHistoryPanel />
    </div>
  );
}

function Workspace({ status }: { status: ProspectAiStatus }) {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const activeTab = useMemo(
    () => parseTab(new URLSearchParams(searchString).get("tab")),
    [searchString],
  );
  const [analysisJob, setAnalysisJob] = useState<ProspectIntelligenceJobSummary | null>(null);

  const handleTabChange = (next: string) => {
    const params = new URLSearchParams(searchString);
    if (next === "discover") params.delete("tab");
    else params.set("tab", next);
    const q = params.toString();
    setLocation(q ? `${PROSPECT_AI_PATH}?${q}` : PROSPECT_AI_PATH);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-brand-green">
              <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
              <span className="text-[11px] font-semibold uppercase tracking-wide">Growth Engine</span>
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
              Prospect AI
            </h1>
            <p className="max-w-2xl text-sm text-gray-600">
              Daily workspace — discover, AI review, campaigns, then close replies in Inbox.
            </p>
          </div>
          <Link href="/app/inbox">
            <Button variant="outline" size="sm" className="shrink-0 self-start">
              <Inbox className="mr-2 h-4 w-4" />
              Open Inbox
            </Button>
          </Link>
        </div>
        <WorkflowStrip active={activeTab} />
      </header>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-4 border-b border-gray-200 bg-transparent p-0 pb-0">
          {(
            [
              ["discover", "Discover"],
              ["review", "AI Review"],
              ["campaign", "Campaigns"],
              ["activity", "Activity"],
            ] as const
          ).map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-11 rounded-none border-b-2 border-transparent px-0 pb-3 data-[state=active]:border-brand-green data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="discover" className="mt-0 focus-visible:outline-none">
          <DiscoverTab status={status} />
        </TabsContent>
        <TabsContent value="review" className="mt-0 focus-visible:outline-none">
          <ProspectIntelligencePanel
            activeAnalysisJob={analysisJob}
            onAnalysisJobUpdate={setAnalysisJob}
            embedded
          />
        </TabsContent>
        <TabsContent value="campaign" className="mt-0 focus-visible:outline-none">
          <ProspectOutreachQueuePanel embedded />
        </TabsContent>
        <TabsContent value="activity" className="mt-0 focus-visible:outline-none">
          <ActivityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-gradient-to-b from-gray-50 via-white to-emerald-50/30">
      {children}
    </div>
  );
}

export function ProspectAI() {
  const statusQuery = useProspectAiStatus();
  const [localStatus, setLocalStatus] = useState<ProspectAiStatus | null>(null);

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

  return (
    <Shell>
      <Workspace status={status} />
    </Shell>
  );
}

export default ProspectAI;
