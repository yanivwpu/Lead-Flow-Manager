import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  Check,
  Loader2,
  RefreshCw,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  ProspectIntelligenceDashboardCounts,
  ProspectIntelligenceJobSummary,
  ProspectIntelligenceListItem,
} from "@shared/prospectImport";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}

function priorityBadge(priority?: string) {
  switch (priority) {
    case "high":
      return <Badge className="bg-emerald-600">High</Badge>;
    case "medium":
      return <Badge className="bg-amber-500">Medium</Badge>;
    case "low":
      return <Badge variant="secondary">Low</Badge>;
    default:
      return <Badge variant="outline">Needs review</Badge>;
  }
}

function offerLabel(offer?: string) {
  if (!offer) return "—";
  return offer.replace(/_/g, " ");
}

type AnalyzeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importJobId: string;
  batchName: string;
  contactCount: number;
  onStarted: (job: ProspectIntelligenceJobSummary) => void;
};

function AnalyzeConfirmDialog({
  open,
  onOpenChange,
  importJobId,
  batchName,
  contactCount,
  onStarted,
}: AnalyzeDialogProps) {
  const startMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ job: ProspectIntelligenceJobSummary }>(
        `/api/growth-tools/prospect-import/jobs/${importJobId}/analyze`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      ),
    onSuccess: (data) => {
      onStarted(data.job);
      onOpenChange(false);
      toast({ title: "AI analysis started", description: `Analyzing ${contactCount} prospect(s).` });
    },
    onError: (err: Error) => {
      toast({ title: "Could not start analysis", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Analyze with AI</DialogTitle>
          <DialogDescription>
            Classify prospects, score fit for WhaChatCRM, and draft a first outreach message. No messages
            will be sent.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-gray-500">Batch:</span>{" "}
            <span className="font-medium">{batchName}</span>
          </p>
          <p>
            <span className="text-gray-500">Prospects to analyze:</span>{" "}
            <span className="font-medium">{contactCount}</span>
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-brand-green hover:bg-emerald-700"
            disabled={startMutation.isPending || contactCount < 1}
            onClick={() => startMutation.mutate()}
          >
            {startMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting…</>
            ) : (
              <><Brain className="mr-2 h-4 w-4" /> Analyze with AI</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DetailDialogProps = {
  item: ProspectIntelligenceListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function ProspectIntelligenceDetailDialog({ item, open, onOpenChange }: DetailDialogProps) {
  const queryClient = useQueryClient();
  const [editMessage, setEditMessage] = useState("");
  const intel = item?.intelligence;

  const patchMutation = useMutation({
    mutationFn: (body: { suggestedFirstMessage: string }) =>
      fetchJson(`/api/growth-tools/prospect-intelligence/${item!.contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
      toast({ title: "Message updated" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: () =>
      fetchJson(`/api/growth-tools/prospect-intelligence/${item!.contactId}/approve`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
      toast({ title: "AI result approved" });
    },
  });

  const needsReviewMutation = useMutation({
    mutationFn: () =>
      fetchJson(`/api/growth-tools/prospect-intelligence/${item!.contactId}/needs-review`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
      toast({ title: "Marked needs review" });
    },
  });

  const reanalyzeMutation = useMutation({
    mutationFn: () =>
      fetchJson(`/api/growth-tools/prospect-intelligence/${item!.contactId}/reanalyze`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
      toast({ title: "Re-analysis complete" });
    },
    onError: (err: Error) => {
      toast({ title: "Re-analysis failed", description: err.message, variant: "destructive" });
    },
  });

  if (!item || !intel) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>
            Internal Prospect Intelligence — {item.batchName || "Imported batch"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <p><span className="text-gray-500">Email:</span> {item.email || "—"}</p>
            <p><span className="text-gray-500">Phone:</span> {item.phone || "—"}</p>
            <p><span className="text-gray-500">Import tag:</span> {item.importTag || "—"}</p>
            <p><span className="text-gray-500">Import reason:</span> {item.importReason || "—"}</p>
            <p><span className="text-gray-500">Pipeline:</span> {item.pipelineStage || "—"}</p>
            <p><span className="text-gray-500">Confidence:</span> {intel.confidence ?? "—"}</p>
          </div>

          <div className="rounded-lg border bg-gray-50 p-3">
            <p className="font-medium text-gray-900">AI Classification</p>
            <p className="mt-1">Industry: {intel.industry || "—"}</p>
            <p>Business type: {intel.businessType || "—"}</p>
            <p>Agency likelihood: {intel.agencyLikelihood ?? "—"}</p>
            <p>Shopify likelihood: {intel.shopifyMerchantLikelihood ?? "—"}</p>
            <p>Real estate likelihood: {intel.realEstateLikelihood ?? "—"}</p>
          </div>

          <div className="rounded-lg border bg-blue-50/50 p-3">
            <p className="font-medium text-gray-900">Fit</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {priorityBadge(intel.priority)}
              <Badge variant="outline">Score {intel.leadScore ?? 0}</Badge>
              <Badge variant="outline">Fit {intel.potentialFit || "unknown"}</Badge>
              <Badge variant="outline">{offerLabel(intel.recommendedOffer)}</Badge>
            </div>
          </div>

          <div>
            <p className="font-medium text-gray-900">Suggested outreach angle</p>
            <p className="mt-1 text-gray-700">{intel.suggestedOutreachAngle || "—"}</p>
          </div>

          <div>
            <p className="font-medium text-gray-900">Suggested first message</p>
            <Textarea
              className="mt-2"
              rows={4}
              value={editMessage || intel.suggestedFirstMessage || ""}
              onChange={(e) => setEditMessage(e.target.value)}
            />
          </div>

          <div>
            <p className="font-medium text-gray-900">Internal reasoning</p>
            <p className="mt-1 text-gray-600">{intel.reasoningSummary || "—"}</p>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => needsReviewMutation.mutate()}>
            Needs review
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={reanalyzeMutation.isPending}
            onClick={() => reanalyzeMutation.mutate()}
          >
            {reanalyzeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Re-analyze
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              patchMutation.mutate({
                suggestedFirstMessage: editMessage || intel.suggestedFirstMessage || "",
              })
            }
          >
            Save message
          </Button>
          <Button type="button" className="bg-brand-green hover:bg-emerald-700" onClick={() => approveMutation.mutate()}>
            <Check className="mr-2 h-4 w-4" /> Approve AI result
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProspectIntelligencePanel(props: {
  activeAnalysisJob: ProspectIntelligenceJobSummary | null;
  onAnalysisJobUpdate: (job: ProspectIntelligenceJobSummary | null) => void;
}) {
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [businessFilter, setBusinessFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"leadScore" | "priority" | "confidence" | "name">("leadScore");
  const [selected, setSelected] = useState<ProspectIntelligenceListItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-intelligence/dashboard"],
    queryFn: () => fetchJson<ProspectIntelligenceDashboardCounts>("/api/growth-tools/prospect-intelligence/dashboard"),
    refetchInterval: props.activeAnalysisJob?.status === "running" ? 2000 : false,
  });

  const listQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-intelligence", priorityFilter, businessFilter, sortBy],
    queryFn: () => {
      const params = new URLSearchParams();
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (businessFilter !== "all" && businessFilter !== "needs_review") params.set("segment", businessFilter);
      if (businessFilter === "needs_review") params.set("needsReviewOnly", "true");
      params.set("sortBy", sortBy);
      params.set("sortDir", sortBy === "name" ? "asc" : "desc");
      return fetchJson<{ items: ProspectIntelligenceListItem[] }>(
        `/api/growth-tools/prospect-intelligence?${params.toString()}`,
      );
    },
    refetchInterval: props.activeAnalysisJob?.status === "running" ? 2000 : false,
  });

  const counts = dashboardQuery.data;
  const items = listQuery.data?.items ?? [];

  const jobProgressLabel = useMemo(() => {
    const job = props.activeAnalysisJob;
    if (!job || job.status !== "running") return null;
    return `Analyzing prospects… ${job.progressCurrent} / ${job.progressTotal}`;
  }, [props.activeAnalysisJob]);

  return (
    <section className="mt-10 space-y-5 border-t pt-8">
      <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
        <Sparkles className="h-4 w-4 text-brand-green" />
        Prospect AI Intelligence
      </h3>
      <p className="text-sm text-gray-600">
        Internal growth tool — classify imported prospects, score fit, and draft outreach. No sending yet.
      </p>

      {props.activeAnalysisJob?.status === "running" ? (
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
          <p className="flex items-center gap-2 font-medium">
            <Loader2 className="h-4 w-4 animate-spin" />
            {jobProgressLabel}
          </p>
        </div>
      ) : null}

      {props.activeAnalysisJob?.status === "completed" ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
          <p className="text-sm font-semibold text-emerald-900">Analysis complete</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-6 text-sm">
            {[
              { label: "Analyzed", value: props.activeAnalysisJob.analyzed },
              { label: "High priority", value: props.activeAnalysisJob.highPriority },
              { label: "Medium priority", value: props.activeAnalysisJob.mediumPriority },
              { label: "Low priority", value: props.activeAnalysisJob.lowPriority },
              { label: "Needs review", value: props.activeAnalysisJob.needsReview },
              { label: "Errors", value: props.activeAnalysisJob.errors },
            ].map((row) => (
              <div key={row.label}>
                <p className="text-gray-500">{row.label}</p>
                <p className="font-semibold">{row.value}</p>
              </div>
            ))}
          </div>
          {(props.activeAnalysisJob.promptTokens || props.activeAnalysisJob.completionTokens) ? (
            <p className="mt-2 text-xs text-gray-500">
              Tokens — prompt: {props.activeAnalysisJob.promptTokens ?? 0}, completion:{" "}
              {props.activeAnalysisJob.completionTokens ?? 0} ({props.activeAnalysisJob.aiModel})
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "AI Reviewed", value: counts?.aiReviewed ?? 0 },
          { label: "High Priority", value: counts?.highPriority ?? 0 },
          { label: "Medium Priority", value: counts?.mediumPriority ?? 0 },
          { label: "Low Priority", value: counts?.lowPriority ?? 0 },
          { label: "Needs Review", value: counts?.needsReview ?? 0 },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-xs text-gray-500">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="needs_review">Needs review</SelectItem>
          </SelectContent>
        </Select>
        <Select value={businessFilter} onValueChange={setBusinessFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Segment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All segments</SelectItem>
            <SelectItem value="agency">Agency</SelectItem>
            <SelectItem value="shopify">Shopify</SelectItem>
            <SelectItem value="real_estate">Real Estate</SelectItem>
            <SelectItem value="needs_review">Needs review</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="leadScore">Lead score</SelectItem>
            <SelectItem value="priority">Priority</SelectItem>
            <SelectItem value="confidence">Confidence</SelectItem>
            <SelectItem value="name">Name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">No AI-analyzed prospects yet. Run Analyze with AI on an import batch.</p>
      ) : (
        <div className="overflow-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Business type</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Offer</TableHead>
                <TableHead>Angle</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow
                  key={row.contactId}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => {
                    setSelected(row);
                    setDetailOpen(true);
                  }}
                >
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.intelligence.businessType || "—"}</TableCell>
                  <TableCell>{row.intelligence.leadScore ?? "—"}</TableCell>
                  <TableCell>{priorityBadge(row.intelligence.priority)}</TableCell>
                  <TableCell className="max-w-[140px] truncate">{offerLabel(row.intelligence.recommendedOffer)}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{row.intelligence.suggestedOutreachAngle || "—"}</TableCell>
                  <TableCell>
                    {row.intelligence.needsReview ? (
                      <span className="flex items-center gap-1 text-amber-700 text-xs">
                        <AlertTriangle className="h-3 w-3" /> Review
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">{row.intelligence.reviewStatus || row.intelligence.analysisStatus}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ProspectIntelligenceDetailDialog item={selected} open={detailOpen} onOpenChange={setDetailOpen} />
    </section>
  );
}

export { AnalyzeConfirmDialog };
