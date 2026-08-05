import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { ProspectMessageCreationSettings } from "@shared/prospectMessageCreation";
import {
  formatProspectCampaignBatchSummary,
  formatProspectCampaignBatchTitle,
  groupProspectCampaignBatches,
  partitionProspectCampaignItems,
} from "@shared/prospectCampaignBatches";
import {
  PROSPECT_AI_PAGE_SUBTITLES,
  PROSPECT_CAMPAIGN_CONTROL_LABELS,
  PROSPECT_CAMPAIGN_METRIC_LABELS,
  PROSPECT_CAMPAIGN_STATUS_FILTERS,
  buildCampaignsAiAssistantModel,
  prospectCampaignQueueStatusLabel,
} from "@shared/prospectAiDisplay";
import {
  formatProspectQueueItemError,
  PROSPECT_CAMPAIGN_RECONNECT_EMAIL_MESSAGE,
} from "@shared/prospectBulkOutreach";
import {
  countQueuedDraftsWithUnresolvedTokens,
  isCampaignDraftEditable,
} from "@shared/prospectCampaignDraftTokens";
import { selectNextQueuedCampaignItem } from "@shared/prospectCampaignCountdown";
import {
  isEmailMailboxUiConnected,
  shouldShowCampaignEmailReconnectBanner,
} from "@shared/emailMailboxAvailability";
import { isSenderNotConnectedFailure } from "@shared/prospectOutreachFailureScope";
import {
  formatDraftCampaignReadyCopy,
  PROSPECT_CAMPAIGN_LIFECYCLE_LABELS,
  resolveProspectCampaignLifecycleStatus,
  resolveProspectCampaignPrimaryControl,
} from "@shared/prospectCampaignLifecycle";
import {
  CampaignSendActivityStatusLine,
  NextQueuedCountdownSuffix,
} from "@/components/settings/CampaignSendCountdown";
import { CampaignQueueDraftDialog } from "@/components/settings/CampaignQueueDraftDialog";
import { AiGrowthAssistantCard } from "@/components/prospectAi/AiGrowthAssistantCard";
import { MessageCreationModal } from "@/components/prospectAi/MessageCreationModal";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}

function statusBadge(
  status: string,
  opts?: { isNextQueued?: boolean; scheduledAt?: string | null },
) {
  const label = prospectCampaignQueueStatusLabel(status);
  const countdown =
    status === "queued" && opts?.isNextQueued ? (
      <NextQueuedCountdownSuffix scheduledAt={opts.scheduledAt} enabled />
    ) : null;
  switch (status) {
    case "queued":
      return (
        <div className="flex flex-col items-start gap-0">
          <Badge variant="outline">{label}</Badge>
          {countdown}
        </div>
      );
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
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Drop legacy Paused filter id if present in session state.
  useEffect(() => {
    if (!PROSPECT_CAMPAIGN_STATUS_FILTERS.some((f) => f.id === statusFilter)) {
      setStatusFilter("all");
    }
  }, [statusFilter]);

  const dashboardQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-outreach/dashboard"],
    queryFn: () =>
      fetchJson<ProspectOutreachQueueDashboard>("/api/growth-tools/prospect-outreach/dashboard"),
    refetchInterval: 5000,
  });

  const listQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-outreach/queue", "all"],
    queryFn: () =>
      fetchJson<{ items: ProspectOutreachQueueItemSummary[] }>(
        "/api/growth-tools/prospect-outreach/queue",
      ),
    refetchInterval: 5000,
  });

  /** Same live mailbox status Settings Channels uses — never infer from sticky lastError. */
  const emailStatusQuery = useQuery({
    queryKey: ["/api/integrations/email/status"],
    queryFn: () =>
      fetchJson<{
        connected?: boolean;
        mailbox: { syncStatus?: string | null } | null;
      }>("/api/integrations/email/status"),
    staleTime: 15_000,
    refetchInterval: 10_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-outreach"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/integrations/email/status"] });
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
      toast({ title: "Sending resumed — queue will process under daily limits" });
      // Invalidate this browser only — other clients catch up via 5s refetchInterval.
      // Resume arms the queue; rows stay Ready/queued until the worker marks them Sent.
      invalidate();
      if (import.meta.env.DEV) {
        console.info("[ProspectBulkOutreach] ui_refetch_after_resume", {
          queryPrefix: "/api/growth-tools/prospect-outreach",
        });
      }
    },
    onError: (err: Error) =>
      toast({ title: "Resume failed", description: err.message, variant: "destructive" }),
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

  const bulkRemoveMutation = useMutation({
    mutationFn: (itemIds: string[]) =>
      fetchJson<{ removed: number; skipped: number }>(
        "/api/growth-tools/prospect-outreach/queue/bulk-remove",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds }),
        },
      ),
    onSuccess: (data) => {
      toast({
        title: `Removed ${data.removed} draft${data.removed === 1 ? "" : "s"}`,
        description: data.skipped > 0 ? `${data.skipped} skipped (already sent/sending)` : undefined,
      });
      setSelectedIds(new Set());
      invalidate();
    },
    onError: (err: Error) =>
      toast({ title: "Bulk delete failed", description: err.message, variant: "destructive" }),
  });

  const bulkRegenerateMutation = useMutation({
    mutationFn: (itemIds: string[]) =>
      fetchJson<{ rewritten: number; skipped: number; failed: number }>(
        "/api/growth-tools/prospect-outreach/queue/bulk-regenerate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds }),
        },
      ),
    onSuccess: (data) => {
      toast({
        title: `Regenerated ${data.rewritten} draft${data.rewritten === 1 ? "" : "s"}`,
        description:
          data.failed > 0 || data.skipped > 0
            ? `${data.failed} failed, ${data.skipped} skipped`
            : undefined,
      });
      invalidate();
    },
    onError: (err: Error) =>
      toast({
        title: "Bulk regenerate failed",
        description: err.message,
        variant: "destructive",
      }),
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

  const saveInstructionsMutation = useMutation({
    mutationFn: (outreachInstructions: ProspectMessageCreationSettings) =>
      fetchJson<{ settings: ProspectOutreachWorkspaceSettings }>(
        "/api/growth-tools/prospect-outreach/settings",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outreachInstructions }),
        },
      ),
    onSuccess: (_data, vars) => {
      const mode = vars.mode;
      toast({
        title: "Message Creation saved",
        description:
          mode === "use_my_template"
            ? "Queued drafts were re-merged from your template (no AI rewrite)."
            : mode === "ai_assisted_template"
              ? "Queued drafts were refreshed — only AI placeholders were generated."
              : "Existing personalized drafts were rewritten to match AI Compose settings.",
      });
      setInstructionsOpen(false);
      invalidate();
    },
    onError: (err: Error) => {
      toast({
        title: "Could not save Message Creation",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const dash = dashboardQuery.data;
  const allItems = listQuery.data?.items ?? [];
  const settings = dash?.settings;

  const { activeItems: allActiveItems, historyItems: allHistoryItems } = useMemo(
    () => partitionProspectCampaignItems({ items: allItems }),
    [allItems],
  );

  const queueArmed = dash?.queueRunning === true && dash?.queuePaused !== true;
  const queuePaused = dash?.queuePaused === true;
  const hasReadyRows = allActiveItems.some((r) => r.queueStatus === "queued");
  const hasSendingRows = allActiveItems.some((r) => r.queueStatus === "sending");
  const mailboxSyncStatus = emailStatusQuery.data?.mailbox?.syncStatus;
  const mailboxUiConnected =
    emailStatusQuery.isSuccess && isEmailMailboxUiConnected(mailboxSyncStatus);
  const campaignNeedsMailbox =
    hasReadyRows || hasSendingRows || queuePaused || queueArmed;
  const globalSenderBlocker = shouldShowCampaignEmailReconnectBanner({
    campaignNeedsMailbox,
    mailboxSyncStatus,
    emailStatusKnown: emailStatusQuery.isSuccess,
  });
  const primaryControl = resolveProspectCampaignPrimaryControl({
    queueRunning: dash?.queueRunning === true,
    paused: queuePaused,
    activeBatchStatus: dash?.activeBatchStatus ?? null,
    hasReadyRows,
  });
  const campaignLifecycle = resolveProspectCampaignLifecycleStatus({
    activeBatchStatus: dash?.activeBatchStatus ?? null,
    queueRunning: dash?.queueRunning === true,
    paused: queuePaused,
    mailboxUiConnected,
    emailStatusKnown: emailStatusQuery.isSuccess,
    hasReadyRows,
    hasSendingRows,
    noActiveRows: allActiveItems.length === 0,
    hasHistoryRows: allHistoryItems.length > 0,
  });

  const queueRowErrorLabel = (lastError: string | null | undefined): string => {
    // Live mailbox health wins over sticky infra lastError until Resume clears it.
    if (mailboxUiConnected && isSenderNotConnectedFailure(lastError)) return "";
    return formatProspectQueueItemError(lastError) || "";
  };

  const nextQueuedId = useMemo(() => {
    // Do not show "Sending shortly…" on a Ready row while the campaign is paused.
    if (queuePaused || !queueArmed) return null;
    return selectNextQueuedCampaignItem(allActiveItems)?.id ?? null;
  }, [allActiveItems, queueArmed, queuePaused]);

  const activeItems = useMemo(() => {
    if (statusFilter === "all") return allActiveItems;
    if (statusFilter === "sent") return [];
    return allActiveItems.filter((row) => row.queueStatus === statusFilter);
  }, [allActiveItems, statusFilter]);

  const historyVisibleItems = useMemo(() => {
    if (statusFilter === "all" || statusFilter === "sent") return allHistoryItems;
    return [];
  }, [allHistoryItems, statusFilter]);

  const batches = useMemo(
    () =>
      groupProspectCampaignBatches({
        visibleItems: historyVisibleItems,
        allItemsForCounts: allHistoryItems,
      }),
    [historyVisibleItems, allHistoryItems],
  );

  const showActiveSection = statusFilter !== "sent";
  const showHistorySection = statusFilter === "all" || statusFilter === "sent";

  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(new Set());
  const [expandedInitialized, setExpandedInitialized] = useState(false);

  useEffect(() => {
    if (expandedInitialized || batches.length === 0) return;
    // Newest send-history batch expanded; older stay collapsed.
    const next = new Set<string>();
    if (batches[0]) next.add(batches[0].batchId);
    setExpandedBatchIds(next);
    setExpandedInitialized(true);
  }, [batches, expandedInitialized]);

  const toggleBatch = (batchId: string) => {
    setExpandedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  const selectableActiveIds = useMemo(
    () =>
      activeItems
        .filter(
          (row) =>
            row.historySource !== "inbox_outreach" && isCampaignDraftEditable(row.queueStatus),
        )
        .map((row) => row.id),
    [activeItems],
  );

  const allSelectableChecked =
    selectableActiveIds.length > 0 &&
    selectableActiveIds.every((id) => selectedIds.has(id));
  const someSelectableChecked =
    selectableActiveIds.some((id) => selectedIds.has(id)) && !allSelectableChecked;

  const selectedEditableIds = useMemo(
    () =>
      Array.from(selectedIds).filter((id) => {
        const row = allItems.find((r) => r.id === id);
        return row && isCampaignDraftEditable(row.queueStatus);
      }),
    [allItems, selectedIds],
  );

  useEffect(() => {
    // Drop selections that left the queue (sent/cancelled) or filter view.
    const visible = new Set(allItems.map((r) => r.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [allItems]);

  const openDraftDetail = (row: ProspectOutreachQueueItemSummary) => {
    if (row.historySource === "inbox_outreach") return;
    setDetailItemId(row.id);
    setDetailOpen(true);
  };

  const toggleRowSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of selectableActiveIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const renderQueueRow = (
    row: ProspectOutreachQueueItemSummary,
    opts?: { showCheckbox?: boolean },
  ) => {
    const showCheckbox = opts?.showCheckbox === true;
    const canSelect =
      showCheckbox &&
      row.historySource !== "inbox_outreach" &&
      isCampaignDraftEditable(row.queueStatus);
    return (
      <TableRow
        key={row.id}
        className="cursor-pointer"
        data-testid={`po-queue-row-${row.id}`}
        onClick={() => openDraftDetail(row)}
      >
        {showCheckbox ? (
          <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
            {canSelect ? (
              <Checkbox
                checked={selectedIds.has(row.id)}
                onCheckedChange={(v) => toggleRowSelected(row.id, v === true)}
                aria-label={`Select ${row.prospectName || "prospect"}`}
                data-testid={`po-row-checkbox-${row.id}`}
              />
            ) : null}
          </TableCell>
        ) : null}
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
          {row.scheduledAt ? format(new Date(row.scheduledAt), "MMM d, h:mm a") : "—"}
        </TableCell>
        <TableCell>
          {statusBadge(row.queueStatus, {
            isNextQueued: row.id === nextQueuedId,
            scheduledAt: row.scheduledAt,
          })}
        </TableCell>
        <TableCell>{row.attempts}</TableCell>
        <TableCell className="max-w-[140px] truncate text-xs text-red-600">
          {queueRowErrorLabel(row.lastError)}
        </TableCell>
        <TableCell className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          {row.historySource === "inbox_outreach" ? (
            <span className="text-[10px] text-gray-400">Inbox send</span>
          ) : null}
          {row.historySource !== "inbox_outreach" &&
          ["queued", "paused", "failed"].includes(row.queueStatus) ? (
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
          {row.historySource !== "inbox_outreach" && row.queueStatus === "failed" ? (
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
    );
  };

  const queueTable = (
    rows: ProspectOutreachQueueItemSummary[],
    opts?: { showCheckbox?: boolean },
  ) => {
    const showCheckbox = opts?.showCheckbox === true;
    return (
      <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              {showCheckbox ? (
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      allSelectableChecked
                        ? true
                        : someSelectableChecked
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(v) => toggleSelectAllVisible(v === true)}
                    aria-label="Select all editable drafts"
                    data-testid="po-select-all"
                    disabled={selectableActiveIds.length === 0}
                  />
                </TableHead>
              ) : null}
              <TableHead>Prospect</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Outreach</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Error</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>{rows.map((row) => renderQueueRow(row, opts))}</TableBody>
        </Table>
      </div>
    );
  };

  const cards = useMemo(
    () => [
      { label: PROSPECT_CAMPAIGN_METRIC_LABELS.queued, value: dash?.queued ?? 0 },
      { label: PROSPECT_CAMPAIGN_METRIC_LABELS.sending, value: dash?.sending ?? 0 },
      { label: PROSPECT_CAMPAIGN_METRIC_LABELS.sentToday, value: dash?.sentToday ?? 0 },
      { label: PROSPECT_CAMPAIGN_METRIC_LABELS.failed, value: dash?.failed ?? 0 },
    ],
    [dash],
  );

  const statusFilterCounts = useMemo(() => {
    const ready = allActiveItems.filter((r) => r.queueStatus === "queued").length;
    const failed = allActiveItems.filter((r) => r.queueStatus === "failed").length;
    const sent = allHistoryItems.length;
    const all = allActiveItems.length + allHistoryItems.length;
    return { all, queued: ready, sent, failed } as Record<string, number>;
  }, [allActiveItems, allHistoryItems]);

  const draftReadyCopy = useMemo(
    () => formatDraftCampaignReadyCopy(dash?.queued ?? allActiveItems.filter((r) => r.queueStatus === "queued").length),
    [allActiveItems, dash?.queued],
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

      <AiGrowthAssistantCard
        model={assistantModel}
        className="w-full max-w-3xl"
        trailing={
          <div
            className="w-full rounded-lg border border-violet-100/90 bg-white/70 px-2.5 py-2 text-left sm:min-w-[9.5rem] sm:w-auto"
            data-testid="pi-outreach-instructions-control"
            data-configured={
              settings?.outreachInstructionsConfigured === true ? "true" : "false"
            }
          >
            {/* Empty `{}` / defaults-only → not configured → always show Configure */}
            {settings?.outreachInstructionsConfigured === true ? (
              <>
                <p className="text-[11px] font-semibold text-violet-950">
                  ✓ Message Creation Set
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-1.5 h-7 px-2 text-[11px]"
                  onClick={() => setInstructionsOpen(true)}
                  data-testid="pi-outreach-instructions-edit"
                >
                  Edit
                </Button>
              </>
            ) : (
              <>
                <p className="text-[11px] font-semibold text-violet-950">Message Creation</p>
                <p className="mt-0.5 text-[10px] leading-snug text-violet-900/70">
                  AI Compose, your template, or AI-assisted placeholders
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-1.5 h-7 px-2 text-[11px]"
                  onClick={() => setInstructionsOpen(true)}
                  data-testid="pi-outreach-instructions-configure"
                >
                  Configure
                </Button>
              </>
            )}
          </div>
        }
      />

      <MessageCreationModal
        open={instructionsOpen}
        onOpenChange={setInstructionsOpen}
        initial={settings?.outreachInstructions}
        saving={saveInstructionsMutation.isPending}
        onSave={(next) => saveInstructionsMutation.mutate(next)}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
            <p className="text-xl font-bold text-gray-900 tabular-nums">{card.value}</p>
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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span
            className="inline-flex h-6 items-center rounded-md bg-gray-100 px-2 text-[11px] font-medium text-gray-800"
            data-testid="po-campaign-lifecycle"
          >
            {PROSPECT_CAMPAIGN_LIFECYCLE_LABELS[campaignLifecycle]}
          </span>
          {primaryControl === "start" ? (
            <Button
              type="button"
              className="bg-brand-green hover:bg-emerald-700"
              disabled={startMutation.isPending || globalSenderBlocker}
              onClick={() => {
                const tokenDrafts = countQueuedDraftsWithUnresolvedTokens(allActiveItems);
                if (tokenDrafts > 0) {
                  const ok = window.confirm(
                    `${tokenDrafts} ready draft${tokenDrafts === 1 ? "" : "s"} still contain unresolved {{tokens}}.\n\n` +
                      "Recipients may see raw placeholders. Open those rows to edit or regenerate before sending.\n\n" +
                      "Start sending anyway?",
                  );
                  if (!ok) return;
                }
                startMutation.mutate();
              }}
              data-testid="po-queue-start"
              title={
                globalSenderBlocker
                  ? PROSPECT_CAMPAIGN_RECONNECT_EMAIL_MESSAGE
                  : undefined
              }
            >
              {startMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {PROSPECT_CAMPAIGN_CONTROL_LABELS.startSending}
            </Button>
          ) : null}
          {primaryControl === "pause" ? (
            <Button
              type="button"
              variant="outline"
              disabled={pauseMutation.isPending}
              onClick={() => pauseMutation.mutate()}
              data-testid="po-queue-pause"
            >
              <Pause className="mr-2 h-4 w-4" /> {PROSPECT_CAMPAIGN_CONTROL_LABELS.pauseSending}
            </Button>
          ) : null}
          {primaryControl === "resume" ? (
            <Button
              type="button"
              variant="outline"
              disabled={resumeMutation.isPending || globalSenderBlocker}
              onClick={() => resumeMutation.mutate()}
              data-testid="po-queue-resume"
              title={
                globalSenderBlocker
                  ? PROSPECT_CAMPAIGN_RECONNECT_EMAIL_MESSAGE
                  : undefined
              }
            >
              {resumeMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {PROSPECT_CAMPAIGN_CONTROL_LABELS.resumeSending}
            </Button>
          ) : null}
        </div>
      </div>

      {campaignLifecycle === "running" ? (
        <CampaignSendActivityStatusLine
          queueRunning={dash?.queueRunning}
          queuePaused={dash?.queuePaused}
          items={allActiveItems}
        />
      ) : null}

      {globalSenderBlocker ? (
        <p className="text-sm text-amber-800" data-testid="po-queue-sender-blocker">
          {PROSPECT_CAMPAIGN_RECONNECT_EMAIL_MESSAGE}{" "}
          <a href="/app/settings?tab=channels" className="font-medium underline underline-offset-2">
            Open Channel Settings
          </a>
        </p>
      ) : null}
      {campaignLifecycle === "draft" && hasReadyRows && !globalSenderBlocker ? (
        <div className="space-y-0.5 text-sm text-gray-700" data-testid="po-queue-waiting-start">
          <p className="font-medium text-gray-900">{draftReadyCopy.title}</p>
          <p>{draftReadyCopy.readyLine}</p>
          <p className="text-gray-600">{draftReadyCopy.actionLine}</p>
        </div>
      ) : null}

      {countQueuedDraftsWithUnresolvedTokens(allActiveItems) > 0 ? (
        <p
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          data-testid="po-unresolved-tokens-warning"
        >
          {(() => {
            const n = countQueuedDraftsWithUnresolvedTokens(allActiveItems);
            return `${n} ready draft${n === 1 ? "" : "s"} still contain unresolved {{tokens}}. Open those rows to edit or regenerate before Start Sending — recipients may otherwise see raw placeholders.`;
          })()}
        </p>
      ) : null}

      <div
        className="flex max-w-full flex-nowrap gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-testid="po-status-tabs"
        role="tablist"
        aria-label="Campaign status"
      >
        {PROSPECT_CAMPAIGN_STATUS_FILTERS.map(({ id, label }) => {
          const count = statusFilterCounts[id] ?? 0;
          const active = statusFilter === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              className={cn(
                "inline-flex h-6 shrink-0 items-center rounded-md px-2 text-[11px] font-medium transition-colors duration-150",
                active
                  ? "bg-gray-900 text-white"
                  : "bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900",
              )}
              onClick={() => setStatusFilter(id)}
              data-testid={`po-filter-${id}`}
            >
              {label}
              <span
                className={cn(
                  "ms-1 tabular-nums",
                  active ? "text-white/75" : "text-gray-400",
                )}
              >
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      {selectedEditableIds.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2"
          data-testid="po-bulk-toolbar"
        >
          <span className="text-xs font-medium text-violet-950">
            {selectedEditableIds.length} selected
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            disabled={bulkRegenerateMutation.isPending}
            onClick={() => bulkRegenerateMutation.mutate(selectedEditableIds)}
            data-testid="po-bulk-regenerate"
          >
            {bulkRegenerateMutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Regenerate selected
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px] text-red-700"
            disabled={bulkRemoveMutation.isPending}
            onClick={() => {
              const n = selectedEditableIds.length;
              const ok = window.confirm(
                `Delete ${n} selected draft${n === 1 ? "" : "s"} from this campaign?\n\n` +
                  "Already Sent items are never deleted. This cannot be undone.",
              );
              if (!ok) return;
              bulkRemoveMutation.mutate(selectedEditableIds);
            }}
            data-testid="po-bulk-delete"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete selected
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px]"
            onClick={() => setSelectedIds(new Set())}
            data-testid="po-bulk-clear"
          >
            Clear
          </Button>
        </div>
      ) : null}

      {allActiveItems.length === 0 && allHistoryItems.length === 0 ? (
        <p className="text-sm text-gray-500">No outreach campaigns yet.</p>
      ) : (
        <div className="space-y-6" data-testid="po-campaign-sections">
          {showActiveSection ? (
            <div className="space-y-2" data-testid="po-campaign-active">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Active sending</h3>
                <p className="text-xs text-gray-500">
                  Ready, Sending, and Failed — click a row to review or edit the draft.
                </p>
              </div>
              {activeItems.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {statusFilter === "all"
                    ? "No active prospects in the send queue."
                    : "No prospects match this filter in the active queue."}
                </p>
              ) : (
                queueTable(activeItems, { showCheckbox: true })
              )}
            </div>
          ) : null}

          {showHistorySection ? (
            <div className="space-y-2" data-testid="po-campaign-history">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Campaign history</h3>
                <p className="text-xs text-gray-500">
                  Sent outreach grouped by campaign run. Expand a batch to inspect prospects.
                </p>
              </div>
              {batches.length === 0 ? (
                <p className="text-sm text-gray-500">No sent campaigns yet.</p>
              ) : (
                <div className="space-y-2" data-testid="po-campaign-batches">
                  {batches.map((batch) => {
                    const expanded = expandedBatchIds.has(batch.batchId);
                    return (
                      <div
                        key={batch.batchId}
                        className="overflow-hidden rounded-xl border border-gray-200 bg-white"
                        data-testid={`po-campaign-batch-${batch.batchId}`}
                      >
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50"
                          onClick={() => toggleBatch(batch.batchId)}
                          aria-expanded={expanded}
                        >
                          {expanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900">
                              {formatProspectCampaignBatchTitle(batch.transferredAt)}
                              <span className="ms-1.5 font-normal text-gray-500">
                                · {batch.counts.total}{" "}
                                {batch.counts.total === 1 ? "prospect" : "prospects"}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatProspectCampaignBatchSummary(batch.counts)}
                            </div>
                          </div>
                        </button>
                        {expanded ? (
                          <div className={cn("border-t", batch.items.length === 0 && "p-3")}>
                            {batch.items.length === 0 ? (
                              <p className="p-3 text-xs text-gray-500">
                                No sent prospects in this batch match the current filter.
                              </p>
                            ) : (
                              <div className="overflow-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Prospect</TableHead>
                                      <TableHead>Channel</TableHead>
                                      <TableHead>Outreach</TableHead>
                                      <TableHead>Subject</TableHead>
                                      <TableHead>Scheduled</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead>Attempts</TableHead>
                                      <TableHead>Error</TableHead>
                                      <TableHead />
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {batch.items.map((row) => renderQueueRow(row))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      <CampaignQueueDraftDialog
        itemId={detailItemId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onChanged={invalidate}
      />
    </section>
  );
}
