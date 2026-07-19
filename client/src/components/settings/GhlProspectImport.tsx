import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  Download,
  Filter,
  History,
  Loader2,
  MapPin,
  RotateCcw,
  Save,
  Sparkles,
  Users,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import type {
  ProspectImportContactFilter,
  ProspectImportDashboardStats,
  ProspectImportHistoryItem,
  ProspectImportInternalTag,
  ProspectImportJobSummary,
  ProspectImportLocation,
  ProspectImportPreviewContact,
  ProspectImportPreviewResult,
  ProspectImportPreviewJobSummary,
  ProspectImportProvider,
  ProspectImportReason,
  ProspectImportTemplate,
  ProspectImportUndoPreview,
  ProspectIntelligenceJobSummary,
} from "@shared/prospectImport";
import {
  PROSPECT_IMPORT_INTERNAL_TAGS,
  PROSPECT_IMPORT_PRESET_TEMPLATES,
  PROSPECT_IMPORT_PROVIDER_LABELS,
  PROSPECT_IMPORT_PROVIDERS,
  PROSPECT_IMPORT_REASONS,
  PROSPECT_IMPORT_SCAN_SCOPES,
  PROSPECT_IMPORT_LIMITS,
  PROSPECT_IMPORT_DEFAULT_SCAN_SCOPE,
  PROSPECT_IMPORT_DEFAULT_IMPORT_LIMIT,
} from "@shared/prospectImport";
import { AnalyzeConfirmDialog, ProspectIntelligencePanel } from "./ProspectIntelligencePanel";
import { ProspectOutreachQueuePanel } from "./ProspectOutreachQueuePanel";

type Step = 1 | 2 | 3 | 4 | 5;

type LocationMetadata = {
  tags: string[];
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  users: { id: string; name: string; email?: string }[];
};

type DuplicateMode = "skip" | "update";

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Provider" },
  { n: 2, label: "Filters" },
  { n: 3, label: "Preview" },
  { n: 4, label: "Options" },
  { n: 5, label: "Import" },
];

const DASHBOARD_LABELS: { key: keyof ProspectImportDashboardStats; label: string }[] = [
  { key: "importedProspects", label: "Imported" },
  { key: "aiReviewed", label: "AI reviewed" },
  { key: "contacted", label: "Contacted" },
  { key: "interested", label: "Interested" },
  { key: "demoScheduled", label: "Demo scheduled" },
  { key: "trialStarted", label: "Trial started" },
  { key: "customer", label: "Customer" },
  { key: "partner", label: "Partner" },
];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function WizardValidationHint({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-sm text-amber-700" role="status">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export type GhlProspectImportView = "full" | "embedded";

export function GhlProspectImport({
  view = "full",
}: {
  /** `embedded` hides Review / Campaign Queue / Import history for Prospect AI Discover. */
  view?: GhlProspectImportView;
} = {}) {
  const embedded = view === "embedded";
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [provider, setProvider] = useState<ProspectImportProvider>("gohighlevel");
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>("");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [filters, setFilters] = useState<ProspectImportContactFilter>({
    importLimit: PROSPECT_IMPORT_DEFAULT_IMPORT_LIMIT,
    scanScope: PROSPECT_IMPORT_DEFAULT_SCAN_SCOPE,
  });
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>([]);
  const [preview, setPreview] = useState<ProspectImportPreviewResult | null>(null);
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [previewJob, setPreviewJob] = useState<ProspectImportPreviewJobSummary | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importAll, setImportAll] = useState(true);
  const [internalTag, setInternalTag] = useState<ProspectImportInternalTag>("Imported-GHL");
  const [batchName, setBatchName] = useState("");
  const [importReason, setImportReason] = useState<ProspectImportReason | "">("");
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("skip");
  const [templateNameToSave, setTemplateNameToSave] = useState("");
  const [activeJob, setActiveJob] = useState<ProspectImportJobSummary | null>(null);
  const [undoJob, setUndoJob] = useState<ProspectImportHistoryItem | null>(null);
  const [undoPreview, setUndoPreview] = useState<ProspectImportUndoPreview | null>(null);
  const [appliedTemplateName, setAppliedTemplateName] = useState<string | null>(null);
  const [analysisJob, setAnalysisJob] = useState<ProspectIntelligenceJobSummary | null>(null);
  const [analyzeDialog, setAnalyzeDialog] = useState<{
    importJobId: string;
    batchName: string;
    contactCount: number;
  } | null>(null);

  const locationsQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-import/ghl/locations"],
    queryFn: () =>
      fetchJson<{ locations: ProspectImportLocation[] }>(
        "/api/growth-tools/prospect-import/ghl/locations",
      ),
    enabled: provider === "gohighlevel",
  });

  const metadataQuery = useQuery({
    queryKey: [
      "/api/growth-tools/prospect-import/ghl/metadata",
      selectedIntegrationId,
      selectedLocationId,
    ],
    enabled: Boolean(selectedIntegrationId && selectedLocationId),
    queryFn: () =>
      fetchJson<LocationMetadata>(
        `/api/growth-tools/prospect-import/ghl/locations/${selectedIntegrationId}/metadata?locationId=${encodeURIComponent(selectedLocationId)}`,
      ),
  });

  const dashboardQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-import/dashboard"],
    queryFn: () => fetchJson<ProspectImportDashboardStats>("/api/growth-tools/prospect-import/dashboard"),
  });

  const historyQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-import/history"],
    queryFn: () =>
      fetchJson<{ history: ProspectImportHistoryItem[] }>("/api/growth-tools/prospect-import/history"),
    enabled: !embedded,
  });

  const templatesQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-import/templates"],
    queryFn: () =>
      fetchJson<{ templates: ProspectImportTemplate[] }>("/api/growth-tools/prospect-import/templates"),
  });

  const applyTemplate = (tpl: {
    templateName: string;
    filters: ProspectImportContactFilter;
    defaultInternalTag?: ProspectImportInternalTag | null;
    defaultImportReason?: string | null;
    defaultImportLimit?: number | null;
  }) => {
    setFilters({ importLimit: 100, ...tpl.filters });
    setSelectedTagFilters(tpl.filters.tags ?? []);
    if (tpl.defaultInternalTag) setInternalTag(tpl.defaultInternalTag);
    if (tpl.defaultImportReason) setImportReason(tpl.defaultImportReason as ProspectImportReason);
    if (tpl.defaultImportLimit) {
      setFilters((f) => ({ ...f, importLimit: tpl.defaultImportLimit ?? 100 }));
    }
    setAppliedTemplateName(tpl.templateName);
    if (selectedIntegrationId && selectedLocationId) {
      setAppliedTemplateName(null);
      setStep(2);
      toast({
        title: `${tpl.templateName} template applied`,
        description: "Filters pre-filled. Continuing to filter contacts.",
      });
      return;
    }
    setStep(1);
    toast({
      title: `${tpl.templateName} template applied`,
      description: "Filters are pre-filled. Please select a GoHighLevel location to continue.",
    });
  };

  const selectLocation = (loc: ProspectImportLocation) => {
    setSelectedIntegrationId(loc.integrationId);
    setSelectedLocationId(loc.locationId);
    if (step === 1 && loc.integrationId && loc.locationId) {
      setAppliedTemplateName(null);
      setStep(2);
    }
  };

  const pollAnalysisJob = useCallback(async (jobId: string) => {
    try {
      const data = await fetchJson<{ job: ProspectIntelligenceJobSummary }>(
        `/api/growth-tools/prospect-intelligence/jobs/${jobId}`,
      );
      setAnalysisJob(data.job);
      if (data.job.status === "running" || data.job.status === "pending") {
        setTimeout(() => void pollAnalysisJob(jobId), 2000);
      } else {
        void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-import/dashboard"] });
      }
    } catch {
      /* ignore transient poll errors */
    }
  }, [queryClient]);

  useEffect(() => {
    if (analysisJob?.status === "running" || analysisJob?.status === "pending") {
      const timer = setTimeout(() => void pollAnalysisJob(analysisJob.id), 2000);
      return () => clearTimeout(timer);
    }
  }, [analysisJob, pollAnalysisJob]);

  const openAnalyzeDialog = (job: Pick<ProspectImportJobSummary, "id" | "batchName" | "imported">) => {
    setAnalyzeDialog({
      importJobId: job.id,
      batchName: job.batchName,
      contactCount: job.imported,
    });
  };

  const canContinueFromStep1 = Boolean(selectedIntegrationId && selectedLocationId);

  const previewMutation = useMutation({
    mutationFn: async () => {
      const mergedFilters: ProspectImportContactFilter = {
        ...filters,
        tags: selectedTagFilters.length ? selectedTagFilters : filters.tags,
      };
      return fetchJson<
        | { async: false; preview: ProspectImportPreviewResult }
        | { async: true; previewJobId: string }
      >("/api/growth-tools/prospect-import/ghl/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationId: selectedIntegrationId,
          locationId: selectedLocationId,
          filters: mergedFilters,
          appliedTemplateHint: appliedTemplateName,
        }),
      });
    },
    onSuccess: (data) => {
      if (data.async) {
        setPreview(null);
        setPreviewJobId(data.previewJobId);
        setPreviewJob({
          id: data.previewJobId,
          status: "pending",
          integrationId: selectedIntegrationId,
          locationId: selectedLocationId,
          scanScope: filters.scanScope ?? PROSPECT_IMPORT_DEFAULT_SCAN_SCOPE,
          importLimit: filters.importLimit ?? PROSPECT_IMPORT_DEFAULT_IMPORT_LIMIT,
          progressScanned: 0,
          progressTarget: 0,
          progressMatches: 0,
          filterFingerprint: "",
          createdAt: new Date().toISOString(),
        });
        setStep(3);
        return;
      }
      setPreviewJobId(data.preview.previewJobId ?? null);
      setPreviewJob(null);
      setPreview(data.preview);
      setSelectedIds(new Set(data.preview.contacts.map((c) => c.externalId)));
      setImportAll(true);
      setStep(3);
    },
    onError: (err: Error) => {
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
    },
  });

  const pollPreviewJob = useCallback(async (jobId: string) => {
    try {
      const data = await fetchJson<{
        job: ProspectImportPreviewJobSummary & { result?: ProspectImportPreviewResult | null };
      }>(`/api/growth-tools/prospect-import/ghl/preview-jobs/${jobId}`);
      setPreviewJob(data.job);
      if (data.job.status === "completed" && data.job.result) {
        setPreview(data.job.result);
        setPreviewJobId(data.job.id);
        setSelectedIds(new Set(data.job.result.contacts.map((c) => c.externalId)));
        setImportAll(true);
      }
      if (data.job.status === "failed") {
        toast({
          title: "Preview scan failed",
          description: data.job.errorMessage || "Unknown error",
          variant: "destructive",
        });
      }
    } catch {
      /* ignore transient poll errors */
    }
  }, []);

  useEffect(() => {
    if (!previewJobId || !previewJob) return;
    if (previewJob.status === "completed" || previewJob.status === "failed") return;
    const timer = setInterval(() => void pollPreviewJob(previewJobId), 2000);
    return () => clearInterval(timer);
  }, [previewJobId, previewJob, pollPreviewJob]);

  const importMutation = useMutation({
    mutationFn: async () => {
      const mergedFilters: ProspectImportContactFilter = {
        ...filters,
        tags: selectedTagFilters.length ? selectedTagFilters : filters.tags,
      };
      const skipDuplicates = duplicateMode === "skip";
      return fetchJson<{ job: ProspectImportJobSummary }>(
        "/api/growth-tools/prospect-import/ghl/import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            integrationId: selectedIntegrationId,
            locationId: selectedLocationId,
            filters: mergedFilters,
            previewTotal: preview?.stats.estimatedFinalImport ?? 0,
            previewJobId: previewJobId ?? preview?.previewJobId,
            filterFingerprint: preview?.filterFingerprint,
            importOptions: {
              internalTag,
              batchName: batchName.trim(),
              importReason: importReason || undefined,
              skipDuplicates,
              updateMissingFieldsOnly: duplicateMode === "update",
              selectedExternalIds: importAll ? undefined : [...selectedIds],
            },
          }),
        },
      );
    },
    onSuccess: ({ job }) => {
      setActiveJob(job);
      setStep(5);
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-import/history"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-import/dashboard"] });
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      const mergedFilters: ProspectImportContactFilter = {
        ...filters,
        tags: selectedTagFilters.length ? selectedTagFilters : filters.tags,
      };
      return fetchJson<{ template: ProspectImportTemplate }>(
        "/api/growth-tools/prospect-import/templates",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateName: templateNameToSave.trim(),
            provider,
            filters: mergedFilters,
            defaultInternalTag: internalTag,
            defaultImportReason: importReason || undefined,
            defaultImportLimit: filters.importLimit ?? 100,
          }),
        },
      );
    },
    onSuccess: () => {
      setTemplateNameToSave("");
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-import/templates"] });
      toast({ title: "Template saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const undoMutation = useMutation({
    mutationFn: async (jobId: string) =>
      fetchJson<{ result: { deleted: number; blocked: number; undoStatus: string } }>(
        `/api/growth-tools/prospect-import/jobs/${jobId}/undo`,
        { method: "POST" },
      ),
    onSuccess: (data) => {
      setUndoJob(null);
      setUndoPreview(null);
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-import/history"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-import/dashboard"] });
      toast({
        title: "Import undone",
        description: `${data.result.deleted} contact(s) removed. ${data.result.blocked} could not be deleted.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Undo failed", description: err.message, variant: "destructive" });
    },
  });

  const pollJob = useCallback(async (jobId: string) => {
    const { job } = await fetchJson<{ job: ProspectImportJobSummary }>(
      `/api/growth-tools/prospect-import/jobs/${jobId}`,
    );
    setActiveJob(job);
    return job;
  }, []);

  useEffect(() => {
    if (!activeJob || activeJob.status === "completed" || activeJob.status === "failed") return;
    const t = setInterval(() => {
      void pollJob(activeJob.id).catch(() => undefined);
    }, 2000);
    return () => clearInterval(t);
  }, [activeJob, pollJob]);

  const openUndoDialog = async (job: ProspectImportHistoryItem) => {
    setUndoJob(job);
    try {
      const { preview: p } = await fetchJson<{ preview: ProspectImportUndoPreview }>(
        `/api/growth-tools/prospect-import/jobs/${job.id}/undo-preview`,
      );
      setUndoPreview(p);
    } catch (err) {
      toast({
        title: "Could not load undo preview",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      setUndoJob(null);
    }
  };

  const selectedLocation = useMemo(
    () =>
      locationsQuery.data?.locations.find(
        (l) => l.integrationId === selectedIntegrationId && l.locationId === selectedLocationId,
      ),
    [locationsQuery.data, selectedIntegrationId, selectedLocationId],
  );

  const progressPct =
    activeJob && activeJob.progressTotal > 0
      ? Math.round((activeJob.progressCurrent / activeJob.progressTotal) * 100)
      : 0;

  const estimatedImport = useMemo(() => {
    if (!preview) return 0;
    const pool = importAll ? preview.contacts : preview.contacts.filter((c) => selectedIds.has(c.externalId));
    const newCount = pool.filter((c) => !c.isDuplicate).length;
    const dupCount = pool.filter((c) => c.isDuplicate).length;
    return duplicateMode === "update" ? newCount + dupCount : newCount;
  }, [preview, importAll, selectedIds, duplicateMode]);

  const toggleTagFilter = (tag: string) => {
    setSelectedTagFilters((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setImportAll(false);
  };

  const toggleAllRows = (checked: boolean) => {
    if (!preview) return;
    if (checked) {
      setSelectedIds(new Set(preview.contacts.map((c) => c.externalId)));
      setImportAll(true);
    } else {
      setSelectedIds(new Set());
      setImportAll(false);
    }
  };

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 sm:p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {!embedded ? (
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-green">
                <Sparkles className="h-3.5 w-3.5" />
                Internal Growth Tool
              </div>
            ) : null}
            <h2 className="text-lg font-semibold text-gray-900">
              {embedded ? "GoHighLevel Import" : "Prospect Import"}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-600">
              {embedded
                ? "Import prospects from GoHighLevel into your workspace for Review and campaigns. Contacts only — no inbox threads."
                : "Import prospects from external CRMs into your YaBa workspace for outbound sales, partnerships, and recruitment. Contacts only — no inbox threads."}
            </p>
          </div>
        </div>

        {dashboardQuery.data ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {DASHBOARD_LABELS.map(({ key, label }) => (
              <div
                key={key}
                className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-center"
              >
                <p className="text-lg font-bold text-gray-900">
                  {typeof dashboardQuery.data![key] === "number"
                    ? dashboardQuery.data![key]
                    : 0}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mb-6 space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Saved templates
        </Label>
        <div className="flex flex-wrap gap-2">
          {PROSPECT_IMPORT_PRESET_TEMPLATES.map((preset) => (
            <Button
              key={preset.templateName}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyTemplate({ ...preset, templateName: preset.templateName })}
            >
              {preset.templateName}
            </Button>
          ))}
          {(templatesQuery.data?.templates ?? []).map((tpl) => (
            <Button
              key={tpl.id}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => applyTemplate({ ...tpl, templateName: tpl.templateName })}
            >
              {tpl.templateName}
            </Button>
          ))}
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {STEPS.map((s) => (
          <div
            key={s.n}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              step === s.n
                ? "bg-brand-green text-white"
                : step > s.n
                  ? "bg-emerald-100 text-brand-green"
                  : "bg-gray-100 text-gray-500"
            }`}
          >
            {s.n}. {s.label}
          </div>
        ))}
      </div>

      {step === 1 && (
        <section className="space-y-4">
          {appliedTemplateName && !selectedIntegrationId ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <span className="font-semibold">{appliedTemplateName}</span> template applied. Please
              select a GoHighLevel location to continue.
            </div>
          ) : null}

          <div>
            <Label>Provider</Label>
            <Select
              value={provider}
              onValueChange={(v) => setProvider(v as ProspectImportProvider)}
            >
              <SelectTrigger className="max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROSPECT_IMPORT_PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p} disabled={p !== "gohighlevel"}>
                    {PROSPECT_IMPORT_PROVIDER_LABELS[p]}
                    {p !== "gohighlevel" ? " (coming soon)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {provider === "gohighlevel" ? (
            <>
              <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                <MapPin className="h-4 w-4 text-brand-green" />
                Select GoHighLevel location
              </h3>
              {locationsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading locations…
                </div>
              ) : (locationsQuery.data?.locations ?? []).length === 0 ? (
                <p className="text-sm text-gray-600">
                  No connected GoHighLevel locations found. Connect a GHL sub-account first.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(locationsQuery.data?.locations ?? []).map((loc) => (
                    <label
                      key={loc.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors ${
                        selectedIntegrationId === loc.integrationId &&
                        selectedLocationId === loc.locationId
                          ? "border-brand-green bg-emerald-50/50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="ghl-location"
                        className="h-4 w-4 accent-brand-green"
                        checked={
                          selectedIntegrationId === loc.integrationId &&
                          selectedLocationId === loc.locationId
                        }
                        onChange={() => selectLocation(loc)}
                      />
                      <div>
                        <p className="font-medium text-gray-900">{loc.name}</p>
                        <p className="text-xs text-gray-500">{loc.locationId}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {!canContinueFromStep1 && !locationsQuery.isLoading ? (
                <WizardValidationHint>Please select a GoHighLevel location.</WizardValidationHint>
              ) : null}
            </>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              disabled={!canContinueFromStep1}
              onClick={() => setStep(2)}
              className="bg-brand-green hover:bg-emerald-700"
              title={!canContinueFromStep1 ? "Select a GoHighLevel location first" : undefined}
            >
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5">
          <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Filter className="h-4 w-4 text-brand-green" />
            Filter contacts
          </h3>
          <p className="text-sm text-gray-600">
            Source: <span className="font-medium">{selectedLocation?.name}</span> ·{" "}
            {PROSPECT_IMPORT_PROVIDER_LABELS[provider]}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Search name / company / email</Label>
              <Input
                value={filters.search ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                placeholder="Search…"
              />
            </div>
            <div>
              <Label>Scan scope (contacts to scan in GHL)</Label>
              <Select
                value={String(filters.scanScope ?? PROSPECT_IMPORT_DEFAULT_SCAN_SCOPE)}
                onValueChange={(v) =>
                  setFilters((f) => ({
                    ...f,
                    scanScope: (v === "entire" ? "entire" : Number(v)) as ProspectImportContactFilter["scanScope"],
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROSPECT_IMPORT_SCAN_SCOPES.map((scope) => (
                    <SelectItem key={String(scope)} value={String(scope)}>
                      {scope === "entire" ? "Entire location" : `First ${scope.toLocaleString()}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Import limit (max to import after filters)</Label>
              <Select
                value={String(filters.importLimit ?? PROSPECT_IMPORT_DEFAULT_IMPORT_LIMIT)}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, importLimit: Number(v) as ProspectImportContactFilter["importLimit"] }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROSPECT_IMPORT_LIMITS.map((limit) => (
                    <SelectItem key={limit} value={String(limit)}>
                      {limit.toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Contact source</Label>
              <Input
                value={filters.contactSource ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, contactSource: e.target.value }))}
              />
            </div>
            <div>
              <Label>Last activity within</Label>
              <Select
                value={filters.lastActivityDays ? String(filters.lastActivityDays) : "any"}
                onValueChange={(v) =>
                  setFilters((f) => ({
                    ...f,
                    lastActivityDays: v === "any" ? undefined : (Number(v) as 30 | 90 | 180),
                  }))
                }
              >
                <SelectTrigger><SelectValue placeholder="Any time" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any time</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">180 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Created after</Label>
              <Input
                type="date"
                value={filters.createdAfter?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    createdAfter: e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined,
                  }))
                }
              />
            </div>
            <div>
              <Label>Created before</Label>
              <Input
                type="date"
                value={filters.createdBefore?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    createdBefore: e.target.value ? `${e.target.value}T23:59:59.999Z` : undefined,
                  }))
                }
              />
            </div>
            <div>
              <Label>Assigned user</Label>
              <Select
                value={filters.assignedUserId ?? "any"}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, assignedUserId: v === "any" ? undefined : v }))
                }
              >
                <SelectTrigger><SelectValue placeholder="Any user" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any user</SelectItem>
                  {(metadataQuery.data?.users ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={!!filters.hasEmail}
                onCheckedChange={(c) => setFilters((f) => ({ ...f, hasEmail: c === true }))}
              />
              Has email
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={!!filters.hasPhone}
                onCheckedChange={(c) => setFilters((f) => ({ ...f, hasPhone: c === true }))}
              />
              Has phone
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={!!filters.hasBoth}
                onCheckedChange={(c) => setFilters((f) => ({ ...f, hasBoth: c === true }))}
              />
              Has both
            </label>
          </div>

          {metadataQuery.data?.tags?.length ? (
            <div>
              <Label className="mb-2 block">Tags</Label>
              <div className="flex flex-wrap gap-2">
                {metadataQuery.data.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTagFilter(tag)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border ${
                      selectedTagFilters.includes(tag)
                        ? "border-brand-green bg-emerald-50 text-brand-green"
                        : "border-gray-200 text-gray-600"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <div className="flex-1 min-w-[200px]">
              <Label>Save as template</Label>
              <Input
                value={templateNameToSave}
                onChange={(e) => setTemplateNameToSave(e.target.value)}
                placeholder="e.g. Agency Outreach July 2026"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!templateNameToSave.trim() || saveTemplateMutation.isPending}
              onClick={() => saveTemplateMutation.mutate()}
            >
              <Save className="mr-2 h-4 w-4" />
              Save template
            </Button>
          </div>
          {!templateNameToSave.trim() ? (
            <WizardValidationHint>Enter a template name to save these filters.</WizardValidationHint>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button
              type="button"
              className="bg-brand-green hover:bg-emerald-700"
              disabled={previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              {previewMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting scan…</>
              ) : (
                <>Preview — analyze only <ArrowRight className="ml-2 h-4 w-4" /></>
              )}
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Preview is read-only. No contacts are imported until you confirm on the final step.
          </p>
        </section>
      )}

      {step === 3 && previewJob && !preview ? (
        <section className="space-y-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning GHL contacts…
            </div>
            <p className="mt-2 text-sm text-blue-800">
              {previewJob.progressScanned.toLocaleString()}
              {previewJob.progressTarget > 0
                ? ` / ${previewJob.progressTarget.toLocaleString()} scanned`
                : " scanned"}
              {previewJob.progressMatches > 0
                ? ` · ${previewJob.progressMatches.toLocaleString()} matches`
                : ""}
            </p>
            {previewJob.progressTarget > 0 ? (
              <Progress
                className="mt-4 h-2"
                value={Math.min(
                  100,
                  Math.round((previewJob.progressScanned / previewJob.progressTarget) * 100),
                )}
              />
            ) : null}
            {previewJob.ghlReportedTotal != null ? (
              <p className="mt-3 text-xs text-blue-700">
                GHL reported total contacts: {previewJob.ghlReportedTotal.toLocaleString()}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === 3 && preview && (
        <section className="space-y-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <p className="text-sm font-semibold text-blue-900">Dry run — no database writes</p>
            {preview.stats.ghlReportedTotal != null ? (
              <p className="mt-1 text-xs text-blue-800">
                GHL reported total contacts: {preview.stats.ghlReportedTotal.toLocaleString()}
              </p>
            ) : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
              {[
                { label: "Contacts scanned", value: preview.stats.totalContactsScanned },
                { label: "Matching filters", value: preview.stats.totalMatching },
                { label: "Will import (new)", value: preview.stats.willImportNew },
                { label: "Already exists", value: preview.stats.alreadyExists },
                { label: "Dup by GHL ID", value: preview.stats.duplicatesByGhlId },
                { label: "Dup by email", value: preview.stats.duplicatesByEmail },
                { label: "Dup by phone", value: preview.stats.duplicatesByPhone },
                { label: "Missing email", value: preview.stats.missingEmail },
                { label: "Missing phone", value: preview.stats.missingPhone },
                { label: "Skipped by filters", value: preview.stats.skippedByFilters },
                { label: "Estimated final import", value: preview.stats.estimatedFinalImport },
                {
                  label: "Scan status",
                  value: preview.stats.scanStoppedEarly
                    ? "Stopped at scan limit"
                    : preview.stats.scanComplete
                      ? "Entire scan scope completed"
                      : "In progress",
                },
              ].map((row) => (
                <div key={row.label} className="flex justify-between gap-2 rounded-md bg-white/80 px-3 py-2">
                  <span className="text-gray-600">{row.label}</span>
                  <span className="font-semibold text-gray-900">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {preview.diagnostics?.skippedContacts?.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="text-sm font-semibold text-amber-900">Skipped by filters — diagnostics</p>
              {preview.diagnostics.appliedTemplateHint ? (
                <p className="mt-1 text-xs text-amber-800">
                  Template: <span className="font-medium">{preview.diagnostics.appliedTemplateHint}</span>
                </p>
              ) : null}
              <div className="mt-3 space-y-3">
                {preview.diagnostics.skippedContacts.map((row) => (
                  <div key={row.externalId} className="rounded-md border border-amber-100 bg-white/80 p-3 text-sm">
                    <p className="font-medium text-gray-900">
                      {(row.contact.name as string) || row.externalId}
                    </p>
                    <p className="mt-1 text-amber-900">{row.skipReason}</p>
                    <p className="mt-2 font-mono text-xs text-gray-600">
                      tags: {JSON.stringify(row.contact.tags ?? [])} · source:{" "}
                      {String(row.contact.source || "(empty)")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {preview.tagBreakdown.length > 0 ? (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-700">Tag breakdown</p>
              <div className="mt-2 space-y-1 font-mono text-sm text-gray-700">
                {preview.tagBreakdown.map((row) => (
                  <div key={row.tag} className="flex justify-between gap-4 max-w-xs">
                    <span>{row.tag}</span>
                    <span>{row.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => toggleAllRows(true)}>
              Select all
            </Button>
            <span className="text-sm text-gray-500">
              {importAll ? preview.contacts.length : selectedIds.size} selected
            </span>
          </div>

          <div className="max-h-[420px] overflow-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={importAll || selectedIds.size === preview.contacts.length}
                      onCheckedChange={(c) => toggleAllRows(c === true)}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.contacts.map((row: ProspectImportPreviewContact) => (
                  <TableRow key={row.externalId} className={row.isDuplicate ? "bg-amber-50/50" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={importAll || selectedIds.has(row.externalId)}
                        onCheckedChange={() => toggleRow(row.externalId)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.email || <span className="text-amber-600">—</span>}</TableCell>
                    <TableCell>{row.phone || <span className="text-amber-600">—</span>}</TableCell>
                    <TableCell>
                      {row.isDuplicate ? (
                        <Badge variant="outline" className="text-amber-700">
                          Dup ({row.duplicateReason})
                        </Badge>
                      ) : (
                        <Badge variant="secondary">New</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {row.tags.slice(0, 2).map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button type="button" className="bg-brand-green hover:bg-emerald-700" onClick={() => setStep(4)}>
              Import options <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-5">
          <h3 className="text-base font-semibold text-gray-900">Import options</h3>

          <div>
            <Label>Batch / campaign name *</Label>
            <Input
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="e.g. Agency Outreach July 2026"
              required
            />
          </div>

          <div>
            <Label>Import reason / purpose</Label>
            <Select
              value={importReason || "none"}
              onValueChange={(v) => setImportReason(v === "none" ? "" : (v as ProspectImportReason))}
            >
              <SelectTrigger className="max-w-sm"><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Optional —</SelectItem>
                {PROSPECT_IMPORT_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Apply internal WhachatCRM tag</Label>
            <Select value={internalTag} onValueChange={(v) => setInternalTag(v as ProspectImportInternalTag)}>
              <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROSPECT_IMPORT_INTERNAL_TAGS.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Duplicate handling</Label>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="dup-mode"
                className="mt-1"
                checked={duplicateMode === "skip"}
                onChange={() => setDuplicateMode("skip")}
              />
              <span>
                Skip duplicates — contacts matching GHL ID, email, or phone are not imported.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="dup-mode"
                className="mt-1"
                checked={duplicateMode === "update"}
                onChange={() => setDuplicateMode("update")}
              />
              <span>
                Update missing fields only — never overwrite conversations, owner, pipeline beyond
                Imported, or existing CRM notes.
              </span>
            </label>
          </div>

          <p className="text-sm text-gray-600">
            Estimated contacts to process: <strong>{estimatedImport}</strong>
          </p>

          <div className="space-y-2">
            {!batchName.trim() ? (
              <WizardValidationHint>Enter a batch / campaign name to start the import.</WizardValidationHint>
            ) : null}
            {!importAll && selectedIds.size === 0 ? (
              <WizardValidationHint>Select at least one contact in the preview step.</WizardValidationHint>
            ) : null}
          </div>

          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(3)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button
              type="button"
              className="bg-brand-green hover:bg-emerald-700"
              disabled={
                importMutation.isPending ||
                !batchName.trim() ||
                (!importAll && selectedIds.size === 0)
              }
              onClick={() => importMutation.mutate()}
            >
              {importMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting…</>
              ) : (
                <><Download className="mr-2 h-4 w-4" /> Start import</>
              )}
            </Button>
          </div>
        </section>
      )}

      {step === 5 && activeJob && (
        <section className="space-y-5">
          <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Users className="h-4 w-4 text-brand-green" />
            Import progress — {activeJob.batchName}
          </h3>
          {activeJob.status === "running" || activeJob.status === "pending" ? (
            <>
              <p className="text-sm text-gray-600">Importing…</p>
              <p className="text-lg font-semibold text-gray-900">
                {activeJob.progressCurrent} / {activeJob.progressTotal}
              </p>
              <Progress value={progressPct} className="h-2" />
            </>
          ) : null}
          {activeJob.status === "completed" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Imported", value: activeJob.imported },
                  { label: "Skipped", value: activeJob.skipped },
                  { label: "Duplicates", value: activeJob.duplicates },
                  { label: "Errors", value: activeJob.errors },
                ].map((row) => (
                  <div key={row.label} className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center">
                    <p className="text-2xl font-bold text-gray-900">{row.value}</p>
                    <p className="text-sm text-gray-500">{row.label}</p>
                  </div>
                ))}
              </div>
              <p className="flex items-center gap-2 text-sm text-brand-green">
                <Check className="h-4 w-4" />
                Contacts are in your YaBa workspace with tag {internalTag}.
              </p>
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">Analyze with AI</p>
                    <p className="text-xs text-gray-500">
                      Classify prospects, score WhaChatCRM fit, and draft a personalized first message.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!activeJob || activeJob.imported < 1}
                    onClick={() => activeJob && openAnalyzeDialog(activeJob)}
                  >
                    <Brain className="mr-2 h-4 w-4" />
                    Analyze with AI
                  </Button>
                </div>
              </div>
            </>
          ) : null}
          {activeJob.status === "failed" ? (
            <p className="text-sm text-red-600">{activeJob.errorMessage || "Import failed"}</p>
          ) : null}
        </section>
      )}

      {!embedded ? (
        <ProspectImportHistoryPanel
          history={historyQuery.data?.history}
          isLoading={historyQuery.isLoading}
          onAnalyze={openAnalyzeDialog}
          onUndo={(job) => void openUndoDialog(job)}
        />
      ) : null}

      {!embedded ? (
        <ProspectIntelligencePanel
          activeAnalysisJob={analysisJob}
          onAnalysisJobUpdate={setAnalysisJob}
        />
      ) : null}

      {!embedded ? <ProspectOutreachQueuePanel /> : null}

      {analyzeDialog ? (
        <AnalyzeConfirmDialog
          open={Boolean(analyzeDialog)}
          onOpenChange={(open) => !open && setAnalyzeDialog(null)}
          importJobId={analyzeDialog.importJobId}
          batchName={analyzeDialog.batchName}
          contactCount={analyzeDialog.contactCount}
          onStarted={(job) => {
            setAnalysisJob(job);
            void pollAnalysisJob(job.id);
          }}
        />
      ) : null}

      <Dialog open={Boolean(undoJob)} onOpenChange={(open) => !open && setUndoJob(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Undo import batch?</DialogTitle>
            <DialogDescription>
              {undoJob ? (
                <>
                  Batch: <strong>{undoJob.batchName}</strong>. Only contacts created by this import
                  will be deleted. Existing contacts, those with messages, or advanced pipeline stages
                  are protected.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {undoPreview ? (
            <div className="space-y-2 text-sm">
              <p>
                <strong>{undoPreview.deletableCount}</strong> contact(s) will be deleted.
              </p>
              {undoPreview.blockedCount > 0 ? (
                <p className="text-amber-700">
                  {undoPreview.blockedCount} contact(s) cannot be deleted (conversations, pipeline stage,
                  or prior existence).
                </p>
              ) : null}
            </div>
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setUndoJob(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!undoPreview || undoPreview.deletableCount === 0 || undoMutation.isPending}
              onClick={() => undoJob && undoMutation.mutate(undoJob.id)}
            >
              {undoMutation.isPending ? "Deleting…" : `Delete ${undoPreview?.deletableCount ?? 0} contacts`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ProspectImportHistoryPanel({
  history,
  isLoading,
  onAnalyze,
  onUndo,
}: {
  history?: ProspectImportHistoryItem[];
  isLoading?: boolean;
  onAnalyze?: (job: ProspectImportHistoryItem | ProspectImportJobSummary) => void;
  onUndo?: (job: ProspectImportHistoryItem) => void;
} = {}) {
  const historyQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-import/history"],
    queryFn: () =>
      fetchJson<{ history: ProspectImportHistoryItem[] }>("/api/growth-tools/prospect-import/history"),
    enabled: history === undefined,
  });
  const rows = history ?? historyQuery.data?.history ?? [];
  const loading = isLoading ?? historyQuery.isLoading;

  return (
    <section className="mt-10 space-y-4 border-t pt-8" data-testid="prospect-import-history">
      <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
        <History className="h-4 w-4 text-brand-green" />
        Import history
      </h3>
      {loading ? (
        <p className="text-sm text-gray-500">Loading history…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No import jobs yet.</p>
      ) : (
        <div className="overflow-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Imported</TableHead>
                <TableHead>Dups</TableHead>
                <TableHead>Errors</TableHead>
                <TableHead>Tag</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.batchName}</TableCell>
                  <TableCell>{PROSPECT_IMPORT_PROVIDER_LABELS[job.provider]}</TableCell>
                  <TableCell>{job.importReason || "—"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{formatDate(job.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant={job.status === "completed" ? "secondary" : "outline"}>
                      {job.undoStatus === "undone" ? "Undone" : job.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{job.imported}</TableCell>
                  <TableCell>{job.duplicates}</TableCell>
                  <TableCell>{job.errors}</TableCell>
                  <TableCell className="text-xs">{job.internalTag || "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {onAnalyze &&
                      job.status === "completed" &&
                      job.undoStatus !== "undone" &&
                      job.imported > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onAnalyze(job)}
                        >
                          <Brain className="h-3.5 w-3.5 mr-1" />
                          Analyze
                        </Button>
                      ) : null}
                      {onUndo && job.canUndo ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => onUndo(job)}>
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          Undo
                        </Button>
                      ) : job.undoBlockedReason ? (
                        <span className="text-xs text-gray-400" title={job.undoBlockedReason}>
                          —
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

export function useProspectImportAccess() {
  return useQuery({
    queryKey: ["/api/growth-tools/prospect-import/access"],
    queryFn: () => fetchJson<{ allowed: boolean }>("/api/growth-tools/prospect-import/access"),
    staleTime: 60_000,
  });
}
