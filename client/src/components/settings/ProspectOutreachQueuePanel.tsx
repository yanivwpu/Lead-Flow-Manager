import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import type {
  ProspectOutreachQueueDashboard,
  ProspectOutreachQueueItemSummary,
  ProspectOutreachWorkspaceSettings,
} from "@shared/prospectBulkOutreach";
import {
  PROSPECT_AI_PAGE_SUBTITLES,
  PROSPECT_CAMPAIGN_METRIC_LABELS,
  PROSPECT_SENDING_QUEUE_LABEL,
  buildCampaignsAiAssistantModel,
  prospectCampaignQueueStatusLabel,
} from "@shared/prospectAiDisplay";
import { AiGrowthAssistantCard } from "@/components/prospectAi/AiGrowthAssistantCard";
import { format } from "date-fns";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}

function statusBadge(status: string) {
  const label = prospectCampaignQueueStatusLabel(status);
  switch (status) {
    case "queued":
      return <Badge variant="outline">{label}</Badge>;
    case "sending":
      return <Badge className="bg-blue-600">{label}</Badge>;
    case "sent":
      return <Badge className="bg-emerald-600">{label}</Badge>;
    case "failed":
      return <Badge variant="destructive">{label}</Badge>;
    case "paused":
      return <Badge className="bg-amber-500">{label}</Badge>;
    case "skipped":
      return <Badge variant="secondary">{label}</Badge>;
    case "cancelled":
      return <Badge variant="secondary">{label}</Badge>;
    default:
      return <Badge variant="outline">{label}</Badge>;
  }
}

export function ProspectOutreachQueuePanel({
  embedded = false,
}: {
  /** When true, omit outer top border and use Campaigns title (Prospect AI workspace). */
  embedded?: boolean;
} = {}) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const dashboardQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-outreach/dashboard"],
    queryFn: () =>
      fetchJson<ProspectOutreachQueueDashboard>("/api/growth-tools/prospect-outreach/dashboard"),
    refetchInterval: 5000,
  });

  const listQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-outreach/queue", statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      return fetchJson<{ items: ProspectOutreachQueueItemSummary[] }>(
        `/api/growth-tools/prospect-outreach/queue?${params.toString()}`,
      );
    },
    refetchInterval: 5000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-outreach"] });
  };

  const startMutation = useMutation({
    mutationFn: () =>
      fetchJson("/api/growth-tools/prospect-outreach/queue/start", { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Queue started — sends gradually under daily limits" });
      invalidate();
    },
    onError: (err: Error) => toast({ title: "Start failed", description: err.message, variant: "destructive" }),
  });

  const pauseMutation = useMutation({
    mutationFn: () =>
      fetchJson("/api/growth-tools/prospect-outreach/queue/pause", { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Queue paused" });
      invalidate();
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () =>
      fetchJson("/api/growth-tools/prospect-outreach/queue/resume", { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Queue resumed" });
      invalidate();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: string) =>
      fetchJson(`/api/growth-tools/prospect-outreach/queue/${itemId}/remove`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Removed from queue" });
      invalidate();
    },
  });

  const retryMutation = useMutation({
    mutationFn: (itemId: string) =>
      fetchJson(`/api/growth-tools/prospect-outreach/queue/${itemId}/retry`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Requeued for retry" });
      invalidate();
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (body: Partial<ProspectOutreachWorkspaceSettings>) =>
      fetchJson("/api/growth-tools/prospect-outreach/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast({ title: "Send limits saved" });
      invalidate();
    },
  });

  const dash = dashboardQuery.data;
  const items = listQuery.data?.items ?? [];
  const settings = dash?.settings;

  const cards = useMemo(
    () => [
      { label: PROSPECT_CAMPAIGN_METRIC_LABELS.queued, value: dash?.queued ?? 0 },
      { label: PROSPECT_CAMPAIGN_METRIC_LABELS.sending, value: dash?.sending ?? 0 },
      { label: PROSPECT_CAMPAIGN_METRIC_LABELS.sentToday, value: dash?.sentToday ?? 0 },
      { label: PROSPECT_CAMPAIGN_METRIC_LABELS.failed, value: dash?.failed ?? 0 },
      { label: PROSPECT_CAMPAIGN_METRIC_LABELS.paused, value: dash?.paused ?? 0 },
    ],
    [dash],
  );

  const assistantModel = useMemo(
    () =>
      buildCampaignsAiAssistantModel({
        queued: dash?.queued,
        sending: dash?.sending,
        sentToday: dash?.sentToday,
        failed: dash?.failed,
        paused: dash?.paused,
        queueRunning: dash?.queueRunning,
        queuePaused: dash?.queuePaused,
      }),
    [dash],
  );

  return (
    <section
      className={embedded ? "w-full min-w-0 space-y-2.5" : "mt-10 w-full min-w-0 space-y-5 border-t pt-8"}
      data-testid="prospect-outreach-queue"
      data-prospect-ai-layout="tab-body"
    >
      {embedded ? (
        <div className="space-y-0">
          <h2 className="text-base font-semibold tracking-tight text-gray-900">Campaigns</h2>
          <p className="text-xs text-gray-600">{PROSPECT_AI_PAGE_SUBTITLES.campaign}</p>
        </div>
      ) : (
        <h3 className="text-base font-semibold text-gray-900">Campaigns</h3>
      )}

      <AiGrowthAssistantCard model={assistantModel} className="max-w-xl" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
            <p className="text-xl font-bold text-gray-900">{card.value}</p>
            <p className="text-xs text-gray-500">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
        <div>
          <label className="text-xs text-gray-500">Daily send limit</label>
          <Input
            type="number"
            className="mt-1 w-28"
            defaultValue={settings?.dailySendLimit ?? 40}
            key={`daily-${settings?.dailySendLimit ?? 40}`}
            id="po-daily-limit"
            min={1}
            max={200}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">Min delay (sec)</label>
          <Input
            type="number"
            className="mt-1 w-28"
            defaultValue={settings?.minDelaySeconds ?? 90}
            key={`min-${settings?.minDelaySeconds ?? 90}`}
            id="po-min-delay"
            min={5}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">Max delay (sec)</label>
          <Input
            type="number"
            className="mt-1 w-28"
            defaultValue={settings?.maxDelaySeconds ?? 180}
            key={`max-${settings?.maxDelaySeconds ?? 180}`}
            id="po-max-delay"
            min={5}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={saveSettingsMutation.isPending}
          onClick={() => {
            const daily = Number((document.getElementById("po-daily-limit") as HTMLInputElement)?.value);
            const min = Number((document.getElementById("po-min-delay") as HTMLInputElement)?.value);
            const max = Number((document.getElementById("po-max-delay") as HTMLInputElement)?.value);
            saveSettingsMutation.mutate({
              dailySendLimit: daily,
              minDelaySeconds: min,
              maxDelaySeconds: max,
            });
          }}
        >
          Save limits
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            type="button"
            className="bg-brand-green hover:bg-emerald-700"
            disabled={startMutation.isPending}
            onClick={() => startMutation.mutate()}
            data-testid="po-queue-start"
          >
            {startMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Start queue
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pauseMutation.isPending}
            onClick={() => pauseMutation.mutate()}
            data-testid="po-queue-pause"
          >
            <Pause className="mr-2 h-4 w-4" /> Pause
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={resumeMutation.isPending}
            onClick={() => resumeMutation.mutate()}
            data-testid="po-queue-resume"
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Resume
          </Button>
        </div>
      </div>

      {dash?.queuePaused ? (
        <p className="text-sm text-amber-700">
          {PROSPECT_SENDING_QUEUE_LABEL} is paused — no new sends until Resume / Start.
        </p>
      ) : null}
      {!dash?.queueRunning && !dash?.queuePaused ? (
        <p className="text-sm text-amber-800" data-testid="po-queue-waiting-start">
          Sending is armed off — messages can wait in the {PROSPECT_SENDING_QUEUE_LABEL}, but nothing
          sends until you press Start queue.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["queued", "Queued"],
            ["sending", "Sending"],
            ["sent", "Sent"],
            ["failed", "Failed"],
            ["paused", "Paused"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={statusFilter === value ? "default" : "outline"}
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">
          No outreach campaigns yet.
        </p>
      ) : (
        <div className="overflow-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prospect</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Offer / angle</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Error</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {row.prospectName || row.contactId.slice(0, 8)}
                    <p className="text-xs text-gray-500">{row.recipientIdentity}</p>
                  </TableCell>
                  <TableCell className="capitalize">{row.selectedChannel}</TableCell>
                  <TableCell className="max-w-[160px] truncate text-xs">
                    {row.recommendedOffer || "—"}
                    {row.outreachAngle ? (
                      <p className="truncate text-gray-500">{row.outreachAngle}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate text-xs">
                    {row.subjectSnapshot || "—"}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {row.scheduledAt
                      ? format(new Date(row.scheduledAt), "MMM d, h:mm a")
                      : "—"}
                  </TableCell>
                  <TableCell>{statusBadge(row.queueStatus)}</TableCell>
                  <TableCell>{row.attempts}</TableCell>
                  <TableCell className="max-w-[140px] truncate text-xs text-red-600">
                    {row.lastError || ""}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {["queued", "paused", "failed"].includes(row.queueStatus) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeMutation.mutate(row.id)}
                        title="Remove before send"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {row.queueStatus === "failed" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => retryMutation.mutate(row.id)}
                        title="Retry"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    ) : null}
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
