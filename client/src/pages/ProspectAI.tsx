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

function AiBrainPanel({ status }: { status: ProspectAiStatus }) {
  const brain = status.aiBrain;

  if (brain.configured) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-violet-200/60 bg-gradient-to-br from-white via-violet-50/40 to-purple-50/30 p-5 shadow-md shadow-violet-500/[0.08] ring-1 ring-violet-100/80 sm:p-6">
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-violet-400/20 blur-2xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-200/80 bg-white text-violet-600 shadow-sm shadow-violet-500/10">
              <Brain className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold tracking-tight text-violet-950">
                  AI Brain Connected
                </h3>
                <Badge className="border border-violet-200/80 bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 shadow-none">
                  Connected
                </Badge>
              </div>
              <p className="text-sm leading-relaxed text-violet-900/75">
                Prospect AI is using AI Brain to analyze every business before outreach.
              </p>
            </div>
          </div>
        </div>
        <ul className="relative mt-4 grid gap-2 sm:grid-cols-2">
          {[
            "Website Analysis",
            "Company Intelligence",
            "AI Fit Scoring",
            "Personalized Outreach Angles",
            "Business Context",
          ].map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-violet-950/90">
              <Check className="h-4 w-4 shrink-0 text-violet-600" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-violet-200/70 bg-gradient-to-br from-white via-violet-50/50 to-purple-50/40 p-5 shadow-lg shadow-violet-500/[0.1] ring-1 ring-violet-100/90 sm:p-6">
      <div
        className="pointer-events-none absolute -left-10 top-0 h-40 w-40 rounded-full bg-purple-400/15 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-6 bottom-0 h-32 w-32 rounded-full bg-violet-400/20 blur-2xl"
        aria-hidden
      />
      <div className="relative space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center gap-0.5 rounded-xl border border-violet-200/80 bg-white text-violet-600 shadow-sm shadow-violet-500/15">
            <Sparkles className="h-4 w-4" />
            <Brain className="h-4 w-4 text-purple-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight text-violet-950">Unlock AI Brain</h3>
            <p className="mt-1 text-sm leading-relaxed text-violet-900/80">
              Prospect AI works without AI Brain.
              <br className="hidden sm:block" />
              {" "}
              Add AI Brain to automatically understand every business before you reach out.
            </p>
          </div>
        </div>

        <ul className="grid gap-2 sm:grid-cols-2">
          {[
            "Analyze every business website",
            "Score prospect fit automatically",
            "Generate personalized outreach angles",
            "Recommend the best offer",
            "Improve reply rates with richer business context",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-violet-950/90">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/app/ai-brain">
            <Button
              type="button"
              className="w-full border-0 bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-violet-500/25 hover:from-violet-500 hover:to-purple-500 sm:w-auto"
            >
              Upgrade to AI Brain
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <p className="text-xs leading-relaxed text-violet-800/70 sm:max-w-xs sm:text-right">
            Prospect AI works on its own.
            <br />
            AI Brain makes every discovery smarter.
          </p>
        </div>
      </div>
    </div>
  );
}

function WorkflowStrip() {
  return (
    <nav
      aria-label="Prospect AI workflow"
      className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 sm:gap-2 sm:text-sm"
    >
      {WORKFLOW_STEPS.map((step, i) => (
        <div key={step.key} className="flex items-center gap-1.5 sm:gap-2">
          {i > 0 ? <ChevronRight className="h-3.5 w-3.5 text-gray-300" aria-hidden /> : null}
          <span className="rounded-full px-2.5 py-1 font-medium text-gray-600">{step.label}</span>
        </div>
      ))}
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
  const [businessType, setBusinessType] = useState("");
  const [location, setLocation] = useState("");
  const [radiusKm, setRadiusKm] = useState("");
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
    <div className="space-y-10">
      <QuotaMeter status={status} />
      <AiBrainPanel status={status} />

      <div className="rounded-2xl border border-emerald-200/70 bg-white p-6 shadow-md shadow-emerald-900/[0.04] ring-1 ring-emerald-100/80 sm:p-7">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-green/10 text-brand-green">
            <Radar className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-gray-900">Discover Businesses</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
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
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">Prospect History</h2>
        <p className="mt-1 text-sm text-gray-600">
          Discovery searches, imports, campaigns, and completed outreach in one place.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-800">Discovery searches</h3>
        {activityQuery.isLoading ? (
          <p className="text-sm text-gray-500">Loading history…</p>
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
              Find new businesses → AI understands them → Launch outreach → Manage replies → Win customers.
            </p>
          </div>
          <Link href="/app/inbox">
            <Button variant="outline" size="sm" className="shrink-0 self-start">
              <Inbox className="mr-2 h-4 w-4" />
              Open Inbox
            </Button>
          </Link>
        </div>
        <WorkflowStrip />
      </header>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-4 border-b border-gray-200 bg-transparent p-0 pb-0">
          {(
            [
              ["discover", "Discover"],
              ["review", "AI Review"],
              ["campaign", "Campaigns"],
              ["activity", "History"],
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
