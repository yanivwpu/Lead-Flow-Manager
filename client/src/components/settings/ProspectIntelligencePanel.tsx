import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Loader2,
  Mail,
  Pencil,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { useLocation } from "wouter";
import type {
  ProspectIntelligenceJobSummary,
  ProspectIntelligenceListItem,
} from "@shared/prospectImport";
import { prospectOutreachEligibilityReasonLabel } from "@shared/prospectBulkOutreach";
import {
  buildProspectOutreachInboxHref,
  buildProspectOutreachSubject,
  isValidProspectEmail,
  isValidProspectPhone,
  normalizeProspectEmailForSave,
  normalizeProspectPhoneForSave,
  PROSPECT_OUTREACH_COMPOSE_STORAGE_KEY,
  prospectOutreachPayloadDiag,
  resolveProspectApproveOutreachUi,
  type ProspectOutreachComposePayload,
} from "@shared/prospectContactEnrichment";
import {
  prospectDisplayStatusLabel,
  resolveProspectDisplayStatus,
} from "@shared/prospectOutreachLifecycle";
import {
  buildProspectRowAiSummary,
  isProspectQualificationComplete,
  isProspectQualificationPending,
  mergeProspectRowsStableOrder,
  matchesProspectReviewFilter,
  prospectReviewCompletionFlash,
  prospectReviewEmptyMessage,
  prospectReviewLifecycleLabel,
  PROSPECT_REVIEW_FILTER_CHIPS,
  PROSPECT_TIMELINE_STAGES,
  resolveProspectReviewLifecycle,
  resolveProspectTimelineStates,
  type ProspectReviewLifecycle,
  type ProspectTimelineStageState,
} from "@shared/prospectReviewUx";
import {
  AI_PERSONALITY_ROTATE_MS,
  buildAiGrowthAssistantModel,
  resolveAiPersonalityStatus,
} from "@shared/prospectAiPersonality";
import { AiGrowthAssistantCard } from "@/components/prospectAi/AiGrowthAssistantCard";
import { AiPersonalityStatusView } from "@/components/prospectAi/AiPersonalityStatus";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}

function reviewUxInput(row: ProspectIntelligenceListItem) {
  return {
    analysisStatus: row.intelligence.analysisStatus,
    reviewStatus: row.intelligence.reviewStatus,
    needsReview: row.intelligence.needsReview,
    enrichmentStatus: row.intelligence.enrichmentStatus,
    outreachStatus: row.intelligence.outreachStatus,
    outreachSentAt: row.intelligence.outreachSentAt,
    repliedAt: row.intelligence.repliedAt,
    queueStatus: row.queueStatus,
    outcome: row.prospectOutcome,
  };
}

function ProspectProgressTimeline({ life }: { life: ProspectReviewLifecycle }) {
  const states = resolveProspectTimelineStates(life);
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1"
      data-testid={`pi-timeline-${life}`}
      aria-label={`Progress: ${prospectReviewLifecycleLabel(life)}`}
    >
      {PROSPECT_TIMELINE_STAGES.map((stage, i) => {
        const state = states[i] as ProspectTimelineStageState;
        return (
          <span key={stage.id} className="inline-flex items-center gap-1">
            {i > 0 ? <span className="text-[10px] text-gray-200 select-none">·</span> : null}
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-medium tracking-tight transition-colors duration-300",
                state === "done" && "text-emerald-700",
                state === "current" && "text-emerald-800",
                state === "todo" && "text-gray-400",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] leading-none",
                  state === "done" && "bg-emerald-600 text-white",
                  state === "current" && "bg-emerald-500 text-white pi-timeline-current",
                  state === "todo" && "border border-gray-300 bg-white text-gray-300",
                )}
                aria-hidden
              >
                {state === "done" ? "✓" : state === "current" ? "●" : "○"}
              </span>
              {stage.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function MatchStars({ stars }: { stars: number }) {
  return (
    <span className="tracking-tight text-amber-500" aria-hidden>
      {"★".repeat(stars)}
      <span className="text-gray-300">{"★".repeat(Math.max(0, 5 - stars))}</span>
    </span>
  );
}

function VerifiedChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors duration-300",
        ok ? "bg-emerald-50 text-emerald-800" : "bg-gray-50 text-gray-400",
      )}
    >
      {ok ? "✓" : "○"} {label}
    </span>
  );
}

function analysisBusy(analysisStatus?: string | null): boolean {
  return isProspectQualificationPending(analysisStatus);
}

function enrichmentBusy(enrichmentStatus?: string | null): boolean {
  const s = String(enrichmentStatus || "none").toLowerCase();
  return s === "pending" || s === "enriching";
}

function offerLabel(offer?: string) {
  if (!offer) return "";
  return offer.replace(/_/g, " ");
}

/** Detail-dialog helper: show progress only while busy; otherwise value or em dash. */
function analysisPendingLabel(analysisStatus?: string | null): string {
  const a = String(analysisStatus || "pending").toLowerCase();
  if (a === "processing") return "AI is reviewing this business…";
  if (a === "failed") return "Qualification failed";
  if (a === "pending") return "";
  return "";
}

function cellOrPending(
  value: string | number | null | undefined,
  analysisStatus?: string | null,
): string {
  const busy = analysisBusy(analysisStatus);
  if (busy && (value === null || value === undefined || value === "")) return "—";
  if (String(analysisStatus || "").toLowerCase() === "failed" && (value === null || value === undefined || value === "")) {
    return "Qualification failed";
  }
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function enrichmentBadge(intel: ProspectIntelligenceListItem["intelligence"]) {
  const status = String(intel.enrichmentStatus || "none").toLowerCase();
  if (status === "enriching" || status === "pending") {
    return (
      <Badge className="bg-sky-600 text-[10px]" data-testid="pi-enrichment-enriching">
        Learning about the website…
      </Badge>
    );
  }
  if (status === "completed") {
    return (
      <Badge className="bg-violet-600 text-[10px]" data-testid="pi-enrichment-enhanced">
        Website ready
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="text-[10px]" data-testid="pi-enrichment-failed">
        Enrichment failed
      </Badge>
    );
  }
  return null;
}

function priorityBadge(priority?: string, analysisStatus?: string | null) {
  if (!isProspectQualificationComplete(analysisStatus)) {
    return null;
  }
  switch (priority) {
    case "high":
      return <Badge className="bg-emerald-600 text-[10px]">High</Badge>;
    case "medium":
      return <Badge className="bg-amber-500 text-[10px]">Medium</Badge>;
    case "low":
      return <Badge variant="secondary" className="text-[10px]">Low</Badge>;
    case "needs_review":
      return <Badge variant="outline" className="text-[10px]">Needs review</Badge>;
    default:
      return null;
  }
}

type DetailDialogProps = {
  item: ProspectIntelligenceListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContactFieldsUpdated: (contactId: string, patch: { email?: string | null; phone?: string | null }) => void;
  onItemUpdated: (item: ProspectIntelligenceListItem) => void;
};

type ContactFieldKind = "email" | "phone";

function ProspectContactFieldRow(props: {
  kind: ContactFieldKind;
  label: string;
  value: string | null | undefined;
  contactId: string;
  onSaved: (patch: { email?: string | null; phone?: string | null }) => void;
}) {
  const { kind, label, value, contactId, onSaved } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value || ""));
  const [localError, setLocalError] = useState<string | null>(null);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(String(value || ""));
  }, [value, editing]);

  const status: "ready" | "missing" =
    kind === "email"
      ? isValidProspectEmail(value) ? "ready" : "missing"
      : isValidProspectPhone(value) ? "ready" : "missing";
  const missingLabel = kind === "email" ? "Missing email" : "Missing phone";

  const saveMutation = useMutation({
    mutationFn: async (nextRaw: string) => {
      if (saveInFlightRef.current) {
        throw new Error("Save already in progress");
      }
      saveInFlightRef.current = true;
      const trimmed = nextRaw.trim();
      const body: { email?: string | null; phone?: string | null } = {};
      if (kind === "email") {
        if (!trimmed) {
          body.email = null;
        } else {
          const normalized = normalizeProspectEmailForSave(trimmed);
          if (!normalized) throw new Error("Enter a valid email address");
          body.email = normalized;
        }
      } else {
        if (!trimmed) {
          body.phone = null;
        } else {
          const normalized = normalizeProspectPhoneForSave(trimmed);
          if (!normalized) throw new Error("Enter a valid phone (at least 7 digits)");
          body.phone = normalized;
        }
      }
      console.info(
        JSON.stringify({
          tag: "[ProspectEnrichment]",
          event: "save_requested",
          contactId,
          fieldName: kind,
        }),
      );
      try {
        const res = await fetch(`/api/contacts/${contactId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 429) {
          const limiter =
            typeof (data as { limiter?: string }).limiter === "string"
              ? (data as { limiter: string }).limiter
              : null;
          console.warn(
            JSON.stringify({
              tag: "[ProspectEnrichment]",
              event: "save_rate_limited",
              contactId,
              fieldName: kind,
              status: 429,
              limiter,
            }),
          );
          throw new Error(
            (data as { error?: string }).error ||
              "Too many requests. Please try again shortly.",
          );
        }
        if (!res.ok) {
          console.warn(
            JSON.stringify({
              tag: "[ProspectEnrichment]",
              event: "save_failed",
              contactId,
              fieldName: kind,
              status: res.status,
            }),
          );
          throw new Error((data as { error?: string }).error || "Failed to update contact");
        }
        console.info(
          JSON.stringify({
            tag: "[ProspectEnrichment]",
            event: "save_succeeded",
            contactId,
            fieldName: kind,
            status: res.status,
          }),
        );
        return body;
      } finally {
        saveInFlightRef.current = false;
      }
    },
    onSuccess: (body) => {
      setLocalError(null);
      setEditing(false);
      onSaved(body);
      toast({
        title: kind === "email" ? "Email saved" : "Phone saved",
        description: "Updated WhachatCRM contact.",
      });
    },
    onError: (err: Error) => {
      if (err.message === "Save already in progress") return;
      setLocalError(err.message);
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    },
  });

  const requestSave = () => {
    if (saveMutation.isPending || saveInFlightRef.current) return;
    saveMutation.mutate(draft);
  };

  return (
    <div className="space-y-1" data-testid={`pi-contact-field-${kind}`}>
      <div className="flex items-start gap-1.5">
        <span className="text-gray-500 shrink-0 pt-0.5">{label}:</span>
        {editing ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <Input
              autoFocus
              type={kind === "email" ? "email" : "tel"}
              className="h-8 max-w-[220px] text-sm"
              value={draft}
              placeholder={kind === "email" ? "name@company.com" : "+17865551234"}
              onChange={(e) => {
                setDraft(e.target.value);
                setLocalError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  requestSave();
                }
                if (e.key === "Escape") {
                  setEditing(false);
                  setLocalError(null);
                  setDraft(String(value || ""));
                }
              }}
              data-testid={`pi-contact-${kind}-input`}
            />
            <Button
              type="button"
              size="sm"
              className="h-8 bg-brand-green hover:bg-emerald-700"
              disabled={saveMutation.isPending}
              onClick={requestSave}
              data-testid={`pi-contact-${kind}-save`}
            >
              {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              disabled={saveMutation.isPending}
              onClick={() => {
                setEditing(false);
                setLocalError(null);
                setDraft(String(value || ""));
              }}
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <span
              className={status === "missing" ? "text-amber-700 font-medium" : "text-gray-900"}
              data-testid={`pi-contact-${kind}-value`}
            >
              {status === "missing" ? missingLabel : String(value)}
            </span>
            {status === "missing" ? (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800 text-[10px] px-1.5 py-0">
                {kind === "email" ? "Email unavailable" : "Phone unavailable"}
              </Badge>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 shrink-0 p-0 text-gray-500 hover:text-gray-900"
              onClick={() => {
                setDraft(String(value || ""));
                setLocalError(null);
                setEditing(true);
              }}
              aria-label={`Edit ${label.toLowerCase()}`}
              data-testid={`pi-contact-${kind}-edit`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
      {localError ? <p className="text-xs text-red-600">{localError}</p> : null}
    </div>
  );
}

function ProspectIntelligenceDetailDialog({
  item,
  open,
  onOpenChange,
  onContactFieldsUpdated,
  onItemUpdated,
}: DetailDialogProps) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [editMessage, setEditMessage] = useState("");
  const intel = item?.intelligence;

  useEffect(() => {
    if (!open || !item) return;
    setEditMessage(item.intelligence?.suggestedFirstMessage || "");
  }, [open, item?.contactId, item?.intelligence?.suggestedFirstMessage]);

  const approveUi = resolveProspectApproveOutreachUi({
    reviewStatus: intel?.reviewStatus,
    outreachStatus: intel?.outreachStatus,
    outreachSentAt: intel?.outreachSentAt,
    repliedAt: intel?.repliedAt,
    email: item?.email,
    outreachConversationId: intel?.outreachConversationId,
    analysisStatus: intel?.analysisStatus,
  });

  const analysisStatus = String(intel?.analysisStatus || "pending").toLowerCase();
  const analysisIncomplete =
    analysisStatus === "pending" || analysisStatus === "processing" || analysisStatus === "failed";
  const analysisPendingText = analysisPendingLabel(intel?.analysisStatus);

  const displayStatus = resolveProspectDisplayStatus({
    reviewStatus: intel?.reviewStatus,
    outreachStatus: intel?.outreachStatus,
    outreachSentAt: intel?.outreachSentAt,
    repliedAt: intel?.repliedAt,
  });
  const lifecycle = item
    ? resolveProspectReviewLifecycle(reviewUxInput(item))
    : "imported";

  const openLinkedConversation = () => {
    if (!item?.contactId || !intel?.outreachConversationId) return;
    onOpenChange(false);
    setLocation(
      `/app/inbox/${encodeURIComponent(item.contactId)}?conversation=${encodeURIComponent(intel.outreachConversationId)}`,
    );
  };

  const applyItemUpdate = (next: ProspectIntelligenceListItem | null | undefined) => {
    if (!next) return;
    onItemUpdated(next);
    // Patch cache in place — do not invalidate (avoids table reorder).
    queryClient.setQueriesData<{ items: ProspectIntelligenceListItem[] }>(
      { queryKey: ["/api/growth-tools/prospect-intelligence"] },
      (old) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((row) => (row.contactId === next.contactId ? next : row)),
        };
      },
    );
  };

  const patchMutation = useMutation({
    mutationFn: (body: { suggestedFirstMessage: string }) =>
      fetchJson<ProspectIntelligenceListItem>(
        `/api/growth-tools/prospect-intelligence/${item!.contactId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    onSuccess: (data) => {
      applyItemUpdate(data);
      toast({ title: "Draft message saved" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ item?: ProspectIntelligenceListItem }>(
        `/api/growth-tools/prospect-intelligence/${item!.contactId}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suggestedFirstMessage: editMessage }),
        },
      ),
    onMutate: async () => {
      if (!item) return;
      const optimistic: ProspectIntelligenceListItem = {
        ...item,
        intelligence: {
          ...item.intelligence,
          reviewStatus: "approved",
          needsReview: false,
          enrichmentStatus:
            String(item.intelligence.enrichmentStatus || "none").toLowerCase() === "completed"
              ? item.intelligence.enrichmentStatus
              : "pending",
        },
      };
      applyItemUpdate(optimistic);
    },
    onSuccess: (data) => {
      if (data.item) {
        applyItemUpdate({
          ...data.item,
          intelligence: {
            ...data.item.intelligence,
            enrichmentStatus:
              String(data.item.intelligence.enrichmentStatus || "none").toLowerCase() === "none"
                ? "pending"
                : data.item.intelligence.enrichmentStatus,
          },
        });
        setEditMessage(data.item.intelligence?.suggestedFirstMessage || editMessage);
      }
    },
    onError: (err: Error) => {
      toast({ title: "Approve failed", description: err.message, variant: "destructive" });
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
    },
  });

  const needsReviewMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ item?: ProspectIntelligenceListItem }>(
        `/api/growth-tools/prospect-intelligence/${item!.contactId}/needs-review`,
        { method: "POST" },
      ),
    onSuccess: (data) => {
      if (data.item) applyItemUpdate(data.item);
      else void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
      toast({ title: "Marked needs review" });
    },
  });

  const reanalyzeMutation = useMutation({
    mutationFn: () =>
      fetchJson(`/api/growth-tools/prospect-intelligence/${item!.contactId}/reanalyze`, {
        method: "POST",
      }),
    onSuccess: async () => {
      const detail = await fetchJson<ProspectIntelligenceListItem>(
        `/api/growth-tools/prospect-intelligence/${item!.contactId}`,
      ).catch(() => null);
      if (detail?.contactId) applyItemUpdate(detail);
      else void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
      toast({ title: "Re-analysis complete" });
    },
    onError: (err: Error) => {
      toast({ title: "Re-analysis failed", description: err.message, variant: "destructive" });
    },
  });

  const retryEnrichmentMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ job: unknown }>(
        `/api/growth-tools/prospect-intelligence/${item!.contactId}/enrichment/retry`,
        { method: "POST" },
      ),
    onSuccess: async () => {
      const detail = await fetchJson<ProspectIntelligenceListItem>(
        `/api/growth-tools/prospect-intelligence/${item!.contactId}`,
      ).catch(() => null);
      if (detail?.contactId) applyItemUpdate(detail);
      else void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
      toast({ title: "Website enrichment restarted" });
    },
    onError: (err: Error) => {
      toast({ title: "Enrichment retry failed", description: err.message, variant: "destructive" });
    },
  });

  const openNativeEmailOutreach = () => {
    if (!item || !approveUi.showSendOutreach) return;
    const payload: ProspectOutreachComposePayload = {
      contactId: item.contactId,
      source: "prospect_intelligence",
      subject: buildProspectOutreachSubject(item.name),
      body: editMessage || item.intelligence?.suggestedFirstMessage || "",
      createdAt: Date.now(),
    };
    try {
      sessionStorage.setItem(PROSPECT_OUTREACH_COMPOSE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota */
    }
    console.info(
      JSON.stringify({
        tag: "[ProspectOutreachHandoff]",
        event: "payload_created",
        contactId: item.contactId,
        prospectIntelligenceId: item.contactId,
        ...prospectOutreachPayloadDiag(payload),
        composeMode: "new",
      }),
    );
    // #region agent log
    if (typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
      fetch("http://127.0.0.1:7693/ingest/2f005315-cdf4-402a-a15b-868ee3486ee2", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "32aec0" },
        body: JSON.stringify({
          sessionId: "32aec0",
          runId: "pi-outreach-handoff",
          hypothesisId: "H-handoff",
          location: "ProspectIntelligencePanel.tsx:openNativeEmailOutreach",
          message: "payload_created",
          data: {
            contactIdPrefix: item.contactId.slice(0, 8),
            ...prospectOutreachPayloadDiag(payload),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    }
    // #endregion
    onOpenChange(false);
    setLocation(buildProspectOutreachInboxHref(item.contactId));
  };

  if (!item || !intel) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>{item.name}</span>
            {approveUi.isApproved ? (
              <Badge className="bg-emerald-600" data-testid="pi-approved-badge">
                Approved
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {item.sourceLabel || item.batchName || "Imported batch"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {analysisIncomplete ? (
            <div
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"
              data-testid="pi-analysis-pending-banner"
            >
              {analysisStatus === "failed" ? (
                <>
                  <p className="font-medium">Analysis failed</p>
                  <p className="mt-0.5 text-xs text-amber-800">
                    AI qualification did not complete. Use Retry qualification to try again.
                  </p>
                </>
              ) : analysisStatus === "processing" ? (
                <>
                  <p className="font-medium">Analyzing</p>
                  <p className="mt-0.5 text-xs text-amber-800">AI analysis is in progress.</p>
                </>
              ) : (
                <>
                  <p className="font-medium">AI analysis has not completed yet.</p>
                  <p className="mt-0.5 text-xs text-amber-800">
                    Review status: Pending. Fields will populate when analysis finishes.
                  </p>
                </>
              )}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <ProspectContactFieldRow
              kind="email"
              label="Email"
              value={item.email}
              contactId={item.contactId}
              onSaved={(patch) => onContactFieldsUpdated(item.contactId, patch)}
            />
            <ProspectContactFieldRow
              kind="phone"
              label="Phone"
              value={item.phone}
              contactId={item.contactId}
              onSaved={(patch) => onContactFieldsUpdated(item.contactId, patch)}
            />
            <p>
              <span className="text-gray-500">Source:</span>{" "}
              {item.sourceLabel || item.batchName || "—"}
            </p>
            <p><span className="text-gray-500">Import tag:</span> {item.importTag || "—"}</p>
            <p><span className="text-gray-500">Import reason:</span> {item.importReason || "—"}</p>
            <p><span className="text-gray-500">Pipeline:</span> {item.pipelineStage || "—"}</p>
            <p><span className="text-gray-500">Confidence:</span> {cellOrPending(intel.confidence, intel.analysisStatus)}</p>
            <p data-testid="pi-review-status">
              <span className="text-gray-500">Review status:</span>{" "}
              <span className={approveUi.isApproved ? "font-medium text-emerald-700" : ""}>
                {analysisStatus === "processing"
                  ? "Analyzing"
                  : analysisStatus === "failed"
                    ? "Analysis failed"
                    : intel.reviewStatus || "pending"}
              </span>
            </p>
            <p data-testid="pi-display-status">
              <span className="text-gray-500">Status:</span>{" "}
              <span className="font-medium">{prospectReviewLifecycleLabel(lifecycle)}</span>
              <span className="text-gray-400 text-xs ms-2">
                ({prospectDisplayStatusLabel(displayStatus)})
              </span>
            </p>
            {enrichmentBadge(intel)}
            {String(intel.enrichmentStatus || "").toLowerCase() === "completed" ||
            String(intel.enrichmentStatus || "").toLowerCase() === "failed" ||
            String(intel.enrichmentStatus || "").toLowerCase() === "enriching" ||
            String(intel.enrichmentStatus || "").toLowerCase() === "pending" ? (
              <div
                className="sm:col-span-2 rounded-lg border border-violet-100 bg-violet-50/50 p-3"
                data-testid="pi-enrichment-panel"
              >
                <p className="font-medium text-violet-900">Website enrichment</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-violet-900">
                  {String(intel.enrichmentStatus || "").toLowerCase() === "completed" ? (
                    <span>✓ Website analyzed</span>
                  ) : String(intel.enrichmentStatus || "").toLowerCase() === "enriching" ||
                    String(intel.enrichmentStatus || "").toLowerCase() === "pending" ? (
                    <span>Enriching website…</span>
                  ) : (
                    <span>Analysis failed</span>
                  )}
                  <span>
                    {intel.enrichmentEmailFound ? "✓ Email found" : "No public email"}
                  </span>
                  <span>{intel.enrichmentPhoneFound ? "✓ Phone found" : "No phone"}</span>
                  {intel.websiteAnalyzedAt ? (
                    <span>
                      Analyzed{" "}
                      {format(new Date(intel.websiteAnalyzedAt), "MMM d, yyyy h:mm a")}
                    </span>
                  ) : null}
                </div>
                {(() => {
                  const result = (intel.enrichmentResult || {}) as {
                    websiteIntelligence?: {
                      businessSummary?: string;
                      recommendedOutreachAngle?: string;
                      aiFitInsights?: string;
                    };
                    publicContacts?: { emails?: string[]; phones?: string[] };
                  };
                  const wi = result.websiteIntelligence;
                  if (!wi?.businessSummary && !wi?.aiFitInsights) return null;
                  return (
                    <div className="mt-2 space-y-1 text-xs text-violet-900/90">
                      {wi.businessSummary ? <p>{wi.businessSummary}</p> : null}
                      {wi.aiFitInsights ? <p>Fit: {wi.aiFitInsights}</p> : null}
                      {wi.recommendedOutreachAngle ? (
                        <p>Angle: {wi.recommendedOutreachAngle}</p>
                      ) : null}
                    </div>
                  );
                })()}
                {intel.enrichmentErrorMessage ? (
                  <p className="mt-2 text-xs text-red-700">{intel.enrichmentErrorMessage}</p>
                ) : null}
              </div>
            ) : null}
            {intel.outreachSentAt ? (
              <p data-testid="pi-outreach-sent-at">
                <span className="text-gray-500">Outreach sent:</span>{" "}
                {format(new Date(intel.outreachSentAt), "MMM d, yyyy h:mm a")}
              </p>
            ) : null}
            {intel.repliedAt ? (
              <p data-testid="pi-outreach-replied-at">
                <span className="text-gray-500">Replied:</span>{" "}
                {format(new Date(intel.repliedAt), "MMM d, yyyy h:mm a")}
              </p>
            ) : null}
          </div>

          <div className="rounded-lg border bg-gray-50 p-3">
            <p className="font-medium text-gray-900">AI Classification</p>
            <p className="mt-1">Industry: {cellOrPending(intel.industry, intel.analysisStatus)}</p>
            <p>Business type: {cellOrPending(intel.businessType, intel.analysisStatus)}</p>
            <p>Agency likelihood: {cellOrPending(intel.agencyLikelihood, intel.analysisStatus)}</p>
            <p>Shopify likelihood: {cellOrPending(intel.shopifyMerchantLikelihood, intel.analysisStatus)}</p>
            <p>Real estate likelihood: {cellOrPending(intel.realEstateLikelihood, intel.analysisStatus)}</p>
          </div>

          <div className="rounded-lg border bg-blue-50/50 p-3">
            <p className="font-medium text-gray-900">Fit</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {priorityBadge(intel.priority, intel.analysisStatus)}
              {analysisIncomplete ? (
                <Badge variant="outline">{analysisPendingText || "AI analysis pending"}</Badge>
              ) : (
                <>
                  <Badge variant="outline">Score {intel.leadScore ?? 0}</Badge>
                  <Badge variant="outline">Fit {intel.potentialFit || "unknown"}</Badge>
                  <Badge variant="outline">{offerLabel(intel.recommendedOffer)}</Badge>
                </>
              )}
            </div>
          </div>

          <div>
            <p className="font-medium text-gray-900">Suggested outreach angle</p>
            <p className="mt-1 text-gray-700">
              {cellOrPending(intel.suggestedOutreachAngle, intel.analysisStatus)}
            </p>
          </div>

          <div>
            <p className="font-medium text-gray-900">Suggested first message</p>
            {analysisIncomplete ? (
              <p className="mt-2 text-gray-600">{analysisPendingText || "AI analysis pending"}</p>
            ) : (
              <>
            <p className="mt-1 text-xs text-gray-500">
              Save message keeps a draft. Approve AI result also saves the text currently in this box.
            </p>
            <Textarea
              className="mt-2"
              rows={4}
              value={editMessage}
              onChange={(e) => setEditMessage(e.target.value)}
              data-testid="pi-suggested-message"
            />
              </>
            )}
          </div>

          <div>
            <p className="font-medium text-gray-900">Why AI Recommends This Prospect</p>
            {(() => {
              if (analysisIncomplete) {
                return (
                  <p className="mt-1 text-gray-600">
                    {analysisPendingText || "AI analysis pending"}
                  </p>
                );
              }
              const raw = (intel.reasoningSummary || "").trim();
              if (!raw) return <p className="mt-1 text-gray-600">—</p>;
              const bullets = raw
                .split(/\n+|(?<=\.)\s+(?=[A-Z])/)
                .map((s) => s.replace(/^[-•*\d.)\s]+/, "").trim())
                .filter(Boolean);
              if (bullets.length > 1) {
                return (
                  <ul className="mt-2 list-disc space-y-1.5 ps-5 text-gray-600">
                    {bullets.map((b) => (
                      <li key={b.slice(0, 48)}>{b}</li>
                    ))}
                  </ul>
                );
              }
              return <p className="mt-1 text-gray-600">{raw}</p>;
            })()}
          </div>

          {approveUi.isApproved || approveUi.isOutreachSentOrLater ? (
            <div
              className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3"
              data-testid="pi-outreach-panel"
            >
              <p className="font-medium text-emerald-900">Outreach</p>
              {approveUi.showViewThread ? (
                <p className="mt-1 text-emerald-800">
                  {displayStatus === "replied"
                    ? "Prospect replied on the linked outreach thread."
                    : "First outreach email was sent. Continue the conversation from Inbox."}
                </p>
              ) : approveUi.showSendOutreach ? (
                <p className="mt-1 text-emerald-800">
                  Ready for a one-contact native email. Review the draft in Inbox before sending.
                </p>
              ) : (
                <p className="mt-1 text-amber-800" data-testid="pi-email-unavailable">
                  {approveUi.emailGateLabel || "Add email to send outreach"}
                </p>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => needsReviewMutation.mutate()}>
            Needs review
          </Button>
          {String(intel?.analysisStatus || "").toLowerCase() === "failed" ? (
          <Button
            type="button"
            variant="outline"
            disabled={reanalyzeMutation.isPending}
            onClick={() => reanalyzeMutation.mutate()}
          >
            {reanalyzeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Retry qualification
          </Button>
          ) : null}
          {String(intel?.enrichmentStatus || "").toLowerCase() === "failed" ? (
            <Button
              type="button"
              variant="outline"
              disabled={retryEnrichmentMutation.isPending}
              onClick={() => retryEnrichmentMutation.mutate()}
              data-testid="pi-retry-enrichment"
            >
              {retryEnrichmentMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Retry enrichment
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => patchMutation.mutate({ suggestedFirstMessage: editMessage })}
          >
            Save message
          </Button>
          {approveUi.showApproveButton ? (
            <Button
              type="button"
              className="bg-brand-green hover:bg-emerald-700"
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate()}
              data-testid="pi-approve-button"
            >
              {approveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Approve AI result
            </Button>
          ) : approveUi.isApproved || approveUi.isOutreachSentOrLater ? (
            <Button type="button" variant="outline" disabled data-testid="pi-approved-button">
              <Check className="mr-2 h-4 w-4" /> Approved
            </Button>
          ) : null}
          {approveUi.showSendOutreach ? (
            <Button
              type="button"
              className="bg-brand-green hover:bg-emerald-700"
              onClick={openNativeEmailOutreach}
              data-testid="pi-send-outreach-email"
            >
              <Mail className="mr-2 h-4 w-4" /> Send outreach email
            </Button>
          ) : null}
          {approveUi.showViewThread ? (
            <Button
              type="button"
              className="bg-brand-green hover:bg-emerald-700"
              onClick={openLinkedConversation}
              data-testid="pi-view-conversation"
            >
              <Mail className="mr-2 h-4 w-4" /> Open conversation
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProspectIntelligencePanel(props: {
  activeAnalysisJob: ProspectIntelligenceJobSummary | null;
  onAnalysisJobUpdate: (job: ProspectIntelligenceJobSummary | null) => void;
  /** When true, omit outer top border (Prospect AI workspace tabs). */
  embedded?: boolean;
}) {
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [businessFilter, setBusinessFilter] = useState<string>("all");
  const [lifecycleFilter, setLifecycleFilter] = useState<
    "all" | "review" | ProspectReviewLifecycle
  >("review");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  /** Stable visual order — never jump rows after analyze/approve/enrich. */
  const [sortBy, setSortBy] = useState<"leadScore" | "priority" | "confidence" | "name" | "action">(
    "name",
  );
  const stableOrderRef = useRef<string[]>([]);
  const prevUxRef = useRef<Map<string, ReturnType<typeof reviewUxInput>>>(new Map());
  const [rowFlash, setRowFlash] = useState<Record<string, string>>({});
  const [progressTick, setProgressTick] = useState(0);
  /** Keep acted-on rows visible even if lifecycle filter would hide them. */
  const [pinnedVisibleIds, setPinnedVisibleIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ProspectIntelligenceListItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);
  /** Frozen server-resolved IDs when Select all filtered is used (not browser rows). */
  const [resolvedFilteredIds, setResolvedFilteredIds] = useState<string[] | null>(null);
  const [resolvedFilteredCount, setResolvedFilteredCount] = useState<number | null>(null);
  const [approveHandoff, setApproveHandoff] = useState<{
    approvedContactIds: string[];
    approved: number;
  } | null>(null);
  const [queuePreviewOpen, setQueuePreviewOpen] = useState(false);
  const [queuePreview, setQueuePreview] = useState<{
    selectedCount: number;
    willQueue: number;
    eligibleByChannel: Record<string, number>;
    notBulkEligible: number;
    skips: Array<{
      contactId: string;
      name?: string;
      reason: string;
      reasonLabel?: string;
      detail?: string;
    }>;
  } | null>(null);
  const [bulkAnalysisJobId, setBulkAnalysisJobId] = useState<string | null>(null);
  const [recentBulkSummary, setRecentBulkSummary] = useState<{
    completed: number;
    failed: number;
    skipped: number;
    needsReview: number;
    status: string;
  } | null>(null);
  const queryClient = useQueryClient();

  const currentFiltersPayload = useMemo(() => {
    return {
      ...(priorityFilter !== "all" ? { priority: priorityFilter } : {}),
      ...(businessFilter !== "all" && businessFilter !== "needs_review"
        ? { segment: businessFilter }
        : {}),
      ...(businessFilter === "needs_review" ? { needsReviewOnly: true } : {}),
      ...(channelFilter === "has_email" ? { hasEmail: true } : {}),
      ...(channelFilter === "has_phone" ? { hasPhone: true } : {}),
      ...(channelFilter === "email_eligible" ? { emailEligible: true } : {}),
      ...(channelFilter === "any_eligible" ? { anyEligibleChannel: true } : {}),
    };
  }, [priorityFilter, businessFilter, channelFilter]);

  // Filter changes invalidate frozen allFiltered selection.
  useEffect(() => {
    if (selectAllFiltered) {
      setSelectAllFiltered(false);
      setResolvedFilteredIds(null);
      setResolvedFilteredCount(null);
    }
    // Reset stable order when the user changes filters/sort intentionally.
    stableOrderRef.current = [];
    setPinnedVisibleIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only clear when filters change
  }, [priorityFilter, businessFilter, lifecycleFilter, channelFilter, sortBy]);

  useEffect(() => {
    const id = window.setInterval(
      () => setProgressTick((t) => t + 1),
      AI_PERSONALITY_ROTATE_MS,
    );
    return () => window.clearInterval(id);
  }, []);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setPrefersReducedMotion(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const listQuery = useQuery({
    queryKey: [
      "/api/growth-tools/prospect-intelligence",
      priorityFilter,
      businessFilter,
      channelFilter,
      sortBy,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (businessFilter !== "all" && businessFilter !== "needs_review") params.set("segment", businessFilter);
      if (businessFilter === "needs_review") params.set("needsReviewOnly", "true");
      if (channelFilter === "has_email") params.set("hasEmail", "true");
      if (channelFilter === "has_phone") params.set("hasPhone", "true");
      if (channelFilter === "email_eligible") params.set("emailEligible", "true");
      if (channelFilter === "any_eligible") params.set("anyEligibleChannel", "true");
      // Stable default sort — lifecycle filter applied client-side so rows never vanish mid-action.
      params.set("sortBy", sortBy);
      params.set("sortDir", sortBy === "name" ? "asc" : "desc");
      params.set("limit", "500");
      return fetchJson<{ items: ProspectIntelligenceListItem[] }>(
        `/api/growth-tools/prospect-intelligence?${params.toString()}`,
      );
    },
    refetchInterval: (query) => {
      if (props.activeAnalysisJob?.status === "running" || bulkAnalysisJobId) return 2000;
      const items = query.state.data?.items || [];
      if (
        items.some((r) => {
          const analysis = String(r.intelligence.analysisStatus || "").toLowerCase();
          const s = String(r.intelligence.enrichmentStatus || "").toLowerCase();
          return (
            analysis === "pending" ||
            analysis === "processing" ||
            s === "pending" ||
            s === "enriching"
          );
        })
      ) {
        return 2500;
      }
      return false;
    },
  });

  // Restore active/recent bulk analysis job after refresh/navigation.
  const activeBulkJobQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-intelligence/bulk-analyze/active"],
    queryFn: () =>
      fetchJson<{
        job: {
          id: string;
          status: string;
          progressCurrent: number;
          progressTotal: number;
          completed: number;
          failed: number;
          skipped: number;
          needsReview: number;
          failedContactIds?: string[];
        } | null;
      }>("/api/growth-tools/prospect-intelligence/bulk-analyze/active"),
    refetchInterval: (q) => {
      const st = q.state.data?.job?.status;
      return st === "running" || st === "pending" ? 2000 : false;
    },
  });

  useEffect(() => {
    const job = activeBulkJobQuery.data?.job;
    if (!job) return;
    if (job.status === "pending" || job.status === "running") {
      setBulkAnalysisJobId(job.id);
      setRecentBulkSummary(null);
    } else if (job.status === "completed" || job.status === "failed") {
      setRecentBulkSummary({
        completed: job.completed,
        failed: job.failed,
        skipped: job.skipped,
        needsReview: job.needsReview,
        status: job.status,
      });
    }
  }, [activeBulkJobQuery.data?.job?.id, activeBulkJobQuery.data?.job?.status]);

  const bulkJobQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-intelligence/bulk-analyze", bulkAnalysisJobId],
    queryFn: () =>
      fetchJson<{
        job: {
          id: string;
          status: string;
          progressCurrent: number;
          progressTotal: number;
          completed: number;
          failed: number;
          skipped: number;
          needsReview: number;
          failedContactIds?: string[];
        };
      }>(`/api/growth-tools/prospect-intelligence/bulk-analyze/${bulkAnalysisJobId}`),
    enabled: Boolean(bulkAnalysisJobId),
    refetchInterval: (q) => {
      const st = q.state.data?.job?.status;
      return st === "running" || st === "pending" ? 1500 : false;
    },
  });

  useEffect(() => {
    const job = bulkJobQuery.data?.job;
    if (!job) return;
    if (job.status === "completed" || job.status === "failed") {
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence/dashboard"] });
      void queryClient.invalidateQueries({
        queryKey: ["/api/growth-tools/prospect-intelligence/bulk-analyze/active"],
      });
      setRecentBulkSummary({
        completed: job.completed,
        failed: job.failed,
        skipped: job.skipped,
        needsReview: job.needsReview,
        status: job.status,
      });
      if (job.status === "completed") {
        // In-row status updates — avoid toast spam.
      }
      setBulkAnalysisJobId(null);
    }
  }, [bulkJobQuery.data?.job?.status]);

  const rawItems = listQuery.data?.items ?? [];

  const lifecycleCounts = useMemo(() => {
    const map: Record<string, number> = { all: rawItems.length };
    for (const chip of PROSPECT_REVIEW_FILTER_CHIPS) {
      if (chip.id === "all") continue;
      map[chip.id] = 0;
    }
    for (const row of rawItems) {
      const life = resolveProspectReviewLifecycle(reviewUxInput(row));
      map[life] = (map[life] || 0) + 1;
      if (matchesProspectReviewFilter(life, "review")) {
        map.review = (map.review || 0) + 1;
      }
    }
    return map;
  }, [rawItems]);

  const assistantModel = useMemo(
    () =>
      buildAiGrowthAssistantModel(
        rawItems.map((row) => ({
          ...reviewUxInput(row),
          enrichmentEmailFound: row.intelligence.enrichmentEmailFound,
          enrichmentPhoneFound: row.intelligence.enrichmentPhoneFound,
          leadScore: row.intelligence.leadScore,
        })),
        {
          failedQualificationCount:
            recentBulkSummary && !bulkAnalysisJobId ? recentBulkSummary.failed : 0,
        },
      ),
    [rawItems, recentBulkSummary, bulkAnalysisJobId],
  );

  const filteredItems = useMemo(() => {
    return rawItems.filter((row) => {
      const life = resolveProspectReviewLifecycle(reviewUxInput(row));
      return (
        matchesProspectReviewFilter(life, lifecycleFilter) ||
        pinnedVisibleIds.has(row.contactId)
      );
    });
  }, [rawItems, lifecycleFilter, pinnedVisibleIds]);

  const items = useMemo(() => {
    const merged = mergeProspectRowsStableOrder(stableOrderRef.current, filteredItems);
    stableOrderRef.current = merged.order;
    return merged.items;
  }, [filteredItems]);

  // Soft green completion flash when a row finishes a stage (no toast spam).
  useEffect(() => {
    const nextFlash: Record<string, string> = {};
    for (const row of rawItems) {
      const ux = reviewUxInput(row);
      const prev = prevUxRef.current.get(row.contactId);
      const msg = prospectReviewCompletionFlash(prev, ux);
      if (msg) nextFlash[row.contactId] = msg;
      prevUxRef.current.set(row.contactId, ux);
    }
    if (Object.keys(nextFlash).length) {
      setRowFlash((prev) => ({ ...prev, ...nextFlash }));
      const ids = Object.keys(nextFlash);
      const t = window.setTimeout(() => {
        setRowFlash((prev) => {
          const copy = { ...prev };
          for (const id of ids) delete copy[id];
          return copy;
        });
      }, 2800);
      return () => window.clearTimeout(t);
    }
  }, [rawItems]);

  const patchListRows = (
    contactIds: string[],
    patch: (row: ProspectIntelligenceListItem) => ProspectIntelligenceListItem,
  ) => {
    const idSet = new Set(contactIds);
    queryClient.setQueriesData<{ items: ProspectIntelligenceListItem[] }>(
      { queryKey: ["/api/growth-tools/prospect-intelligence"] },
      (old) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((row) => (idSet.has(row.contactId) ? patch(row) : row)),
        };
      },
    );
  };

  const jobProgressLabel = useMemo(() => {
    const job = props.activeAnalysisJob;
    if (!job || job.status !== "running") return null;
    return `Analyzing prospects… ${job.progressCurrent} / ${job.progressTotal}`;
  }, [props.activeAnalysisJob]);

  const selectionBody = useMemo(() => {
    if (selectAllFiltered && resolvedFilteredIds) {
      // Frozen server IDs — filter changes clear this state
      return { contactIds: resolvedFilteredIds };
    }
    if (selectAllFiltered) {
      return { allFiltered: true as const, filters: currentFiltersPayload };
    }
    return { contactIds: Array.from(selectedIds) };
  }, [selectAllFiltered, resolvedFilteredIds, currentFiltersPayload, selectedIds]);

  const selectedCount = selectAllFiltered
    ? resolvedFilteredCount ?? resolvedFilteredIds?.length ?? 0
    : selectedIds.size;
  const selectedContactIds = Array.from(
    selectAllFiltered && resolvedFilteredIds ? resolvedFilteredIds : selectedIds,
  );
  const effectiveSelectedIds = useMemo(() => {
    if (selectAllFiltered && resolvedFilteredIds) return new Set(resolvedFilteredIds);
    if (selectAllFiltered) return new Set(items.map((i) => i.contactId));
    return selectedIds;
  }, [selectAllFiltered, resolvedFilteredIds, items, selectedIds]);

  const toggleRow = (contactId: string, e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setSelectAllFiltered(false);
    setResolvedFilteredIds(null);
    setResolvedFilteredCount(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const selectVisible = () => {
    setSelectAllFiltered(false);
    setResolvedFilteredIds(null);
    setResolvedFilteredCount(null);
    setSelectedIds(new Set(items.map((i) => i.contactId)));
  };

  const clearSelection = () => {
    setSelectAllFiltered(false);
    setResolvedFilteredIds(null);
    setResolvedFilteredCount(null);
    setSelectedIds(new Set());
  };

  const selectAllFilteredMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ selection: { contactIds: string[]; count: number } }>(
        "/api/growth-tools/prospect-intelligence/resolve-selection",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allFiltered: true, filters: currentFiltersPayload }),
        },
      ),
    onSuccess: (data) => {
      setSelectAllFiltered(true);
      setSelectedIds(new Set());
      setResolvedFilteredIds(data.selection.contactIds);
      setResolvedFilteredCount(data.selection.count);
      toast({
        title: `${data.selection.count} prospects selected`,
        description: "Server-resolved filtered set (not just visible rows).",
      });
    },
    onError: (err: Error) =>
      toast({ title: "Could not select all filtered", description: err.message, variant: "destructive" }),
  });

  const bulkApproveMutation = useMutation({
    mutationFn: () =>
      fetchJson<{
        approved: number;
        approvedContactIds: string[];
        skipped: unknown[];
      }>("/api/growth-tools/prospect-intelligence/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectionBody),
      }),
    onMutate: () => {
      const ids = Array.from(effectiveSelectedIds);
      setPinnedVisibleIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
      patchListRows(ids, (row) => ({
        ...row,
        intelligence: {
          ...row.intelligence,
          reviewStatus: "approved",
          needsReview: false,
          enrichmentStatus:
            String(row.intelligence.enrichmentStatus || "none").toLowerCase() === "completed"
              ? row.intelligence.enrichmentStatus
              : "pending",
        },
      }));
    },
    onSuccess: (data) => {
      if (data.approvedContactIds?.length) {
        setPinnedVisibleIds((prev) => {
          const next = new Set(prev);
          data.approvedContactIds.forEach((id) => next.add(id));
          return next;
        });
        patchListRows(data.approvedContactIds, (row) => ({
          ...row,
          intelligence: {
            ...row.intelligence,
            reviewStatus: "approved",
            needsReview: false,
            enrichmentStatus:
              String(row.intelligence.enrichmentStatus || "none").toLowerCase() === "completed"
                ? row.intelligence.enrichmentStatus
                : "pending",
          },
        }));
        setApproveHandoff({
          approvedContactIds: data.approvedContactIds,
          approved: data.approved,
        });
        setSelectAllFiltered(false);
        setResolvedFilteredIds(data.approvedContactIds);
        setResolvedFilteredCount(data.approved);
        setSelectedIds(new Set(data.approvedContactIds));
        // Stay on All so rows do not vanish; user can open Website Intelligence filter.
        setLifecycleFilter("all");
      } else {
        clearSelection();
        setApproveHandoff(null);
      }
    },
    onError: (err: Error) => {
      toast({ title: "Bulk approve failed", description: err.message, variant: "destructive" });
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
    },
  });

  const previewQueueMutation = useMutation({
    mutationFn: (contactIds?: string[]) =>
      fetchJson<{ preview: typeof queuePreview }>(
        "/api/growth-tools/prospect-outreach/queue/preview",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            contactIds?.length
              ? { contactIds, preferredChannel: "auto" }
              : { ...selectionBody, preferredChannel: "auto" },
          ),
        },
      ),
    onSuccess: (data) => {
      setQueuePreview(data.preview);
      setQueuePreviewOpen(true);
    },
    onError: (err: Error) =>
      toast({ title: "Preview failed", description: err.message, variant: "destructive" }),
  });

  const confirmQueueMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ preview?: { willQueue?: number } }>("/api/growth-tools/prospect-outreach/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...selectionBody,
          preferredChannel: "auto",
          idempotencyKey: `ui-${Date.now()}`,
        }),
      }),
    onSuccess: (data) => {
      toast({
        title: `Queued ${data.preview?.willQueue ?? "prospects"}`,
        description: "Start the queue to send gradually. Scanning ≠ blasting.",
      });
      setQueuePreviewOpen(false);
      setApproveHandoff(null);
      const ids = Array.from(effectiveSelectedIds);
      setPinnedVisibleIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
      patchListRows(ids, (row) => ({
        ...row,
        queueStatus: "queued",
      }));
      clearSelection();
      // Quiet refresh for queue counts — stable order preserves row positions.
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-outreach"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
    },
    onError: (err: Error) =>
      toast({ title: "Queue failed", description: err.message, variant: "destructive" }),
  });

  const bulkJob = bulkJobQuery.data?.job;

  return (
    <section
      className={cn(
        props.embedded ? "space-y-3" : "mt-8 space-y-3 border-t pt-6",
      )}
      data-testid="pi-review-panel"
    >
      {!props.embedded ? (
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Sparkles className="h-4 w-4 text-brand-green" />
          Prospect AI Intelligence
        </h3>
      ) : null}

      {props.activeAnalysisJob?.status === "running" ? (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs text-blue-900">
          <p className="flex items-center gap-2 font-medium">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {jobProgressLabel}
          </p>
        </div>
      ) : null}

      {bulkJob && (bulkJob.status === "running" || bulkJob.status === "pending") ? (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs text-blue-900">
          <p className="flex items-center gap-2 font-medium">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            AI is reviewing prospects… {bulkJob.progressCurrent}/{bulkJob.progressTotal}
          </p>
        </div>
      ) : null}

      {approveHandoff ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 text-sm text-emerald-950">
          <p className="font-medium">{approveHandoff.approved} approved</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => {
                setLifecycleFilter("campaign_ready");
                setApproveHandoff(null);
              }}
            >
              View campaign ready
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 bg-brand-green hover:bg-emerald-700"
              disabled={previewQueueMutation.isPending}
              onClick={() => previewQueueMutation.mutate(approveHandoff.approvedContactIds)}
            >
              Queue {approveHandoff.approved} for campaign
            </Button>
          </div>
        </div>
      ) : null}

      {props.activeAnalysisJob?.status === "completed" ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2 text-xs text-emerald-900">
          Analysis complete — {props.activeAnalysisJob.analyzed} reviewed
          {props.activeAnalysisJob.errors
            ? `, ${props.activeAnalysisJob.errors} errors`
            : ""}
        </div>
      ) : null}

      <AiGrowthAssistantCard
        model={assistantModel}
        prefersReducedMotion={prefersReducedMotion}
        className="max-w-xl"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {PROSPECT_REVIEW_FILTER_CHIPS.map((chip) => {
          const count = lifecycleCounts[chip.id] ?? 0;
          const active = lifecycleFilter === chip.id;
          return (
            <Button
              key={chip.id}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              className={cn(
                "h-7 rounded-full px-2.5 text-[11px] font-medium transition-all duration-200",
                active
                  ? "bg-gray-900 text-white shadow-sm hover:bg-gray-800"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
              )}
              onClick={() => setLifecycleFilter(chip.id)}
              data-testid={`pi-filter-${chip.id}`}
            >
              {chip.label}
              <span
                className={cn(
                  "ms-1 tabular-nums",
                  active ? "text-white/80" : "text-gray-400",
                )}
              >
                ({count})
              </span>
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="needs_review">Needs review</SelectItem>
          </SelectContent>
        </Select>
        <Select value={businessFilter} onValueChange={setBusinessFilter}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Segment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All segments</SelectItem>
            <SelectItem value="agency">Agency</SelectItem>
            <SelectItem value="shopify">Shopify</SelectItem>
            <SelectItem value="real_estate">Real Estate</SelectItem>
            <SelectItem value="needs_review">Needs review</SelectItem>
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Channel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any contact info</SelectItem>
            <SelectItem value="has_email">Has Email</SelectItem>
            <SelectItem value="has_phone">Has Phone</SelectItem>
            <SelectItem value="email_eligible">Email eligible</SelectItem>
            <SelectItem value="any_eligible">Any eligible channel</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name (stable)</SelectItem>
            <SelectItem value="leadScore">Lead score</SelectItem>
            <SelectItem value="priority">Priority</SelectItem>
            <SelectItem value="confidence">Confidence</SelectItem>
            <SelectItem value="action">Needs action</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-gray-50/70 px-2.5 py-2">
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={selectVisible}>
          Select visible ({items.length})
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={selectAllFilteredMutation.isPending}
          onClick={() => selectAllFilteredMutation.mutate()}
        >
          {selectAllFilteredMutation.isPending ? "Resolving…" : "Select all filtered"}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={clearSelection}>
          Clear
        </Button>
        <span className="text-xs text-gray-600">
          {selectedCount} selected
          {selectAllFiltered && resolvedFilteredCount != null ? " (server-resolved)" : ""}
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={!selectedCount || bulkApproveMutation.isPending}
            onClick={() => bulkApproveMutation.mutate()}
          >
            <Check className="mr-1 h-3.5 w-3.5" /> Approve
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 bg-brand-green text-xs hover:bg-emerald-700"
            disabled={!selectedCount || previewQueueMutation.isPending}
            onClick={() => previewQueueMutation.mutate(undefined)}
            data-testid="pi-queue-outreach"
          >
            <Mail className="mr-1 h-3.5 w-3.5" /> Send to Campaign
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gradient-to-b from-gray-50/60 to-white px-5 py-8 text-center">
          <p className="text-sm font-medium text-gray-800">
            {prospectReviewEmptyMessage(lifecycleFilter, rawItems.length > 0)}
          </p>
        </div>
      ) : (
        <div className="overflow-auto rounded-xl border border-gray-200/80 shadow-sm shadow-gray-900/[0.02]">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10" />
                <TableHead>Business</TableHead>
                <TableHead>AI summary</TableHead>
                <TableHead>Signals</TableHead>
                <TableHead className="min-w-[240px]">Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => {
                const intel = row.intelligence;
                const life = resolveProspectReviewLifecycle(reviewUxInput(row));
                const analyzing =
                  analysisBusy(intel.analysisStatus) &&
                  String(intel.analysisStatus).toLowerCase() === "processing";
                const waitingAnalyze =
                  String(intel.analysisStatus || "pending").toLowerCase() === "pending";
                const enriching = enrichmentBusy(intel.enrichmentStatus);
                const flashMsg = rowFlash[row.contactId];
                const reviewReady = isProspectQualificationComplete(intel.analysisStatus);
                const rowSummary = buildProspectRowAiSummary({
                  analysisStatus: intel.analysisStatus,
                  leadScore: intel.leadScore,
                  priority: intel.priority,
                  businessType: intel.businessType,
                  recommendedOffer: intel.recommendedOffer,
                  suggestedOutreachAngle: intel.suggestedOutreachAngle,
                  reasoningSummary: intel.reasoningSummary,
                });
                const personality = resolveAiPersonalityStatus({
                  ux: reviewUxInput(row),
                  seed: row.contactId,
                  tick: progressTick,
                  leadScore: intel.leadScore,
                });
                const showActivity =
                  analyzing || enriching || life === "imported" || reviewReady;
                const emailFound =
                  Boolean(intel.enrichmentEmailFound) || isValidProspectEmail(row.email);
                const phoneFound =
                  Boolean(intel.enrichmentPhoneFound) || isValidProspectPhone(row.phone);
                const websiteDone =
                  String(intel.enrichmentStatus || "").toLowerCase() === "completed";
                const socialFound = (() => {
                  const result = (intel.enrichmentResult || {}) as {
                    publicContacts?: { socialProfiles?: string[] };
                  };
                  return (result.publicContacts?.socialProfiles?.length || 0) > 0;
                })();

                return (
                  <TableRow
                    key={row.contactId}
                    className={cn(
                      "cursor-pointer transition-all duration-500 hover:bg-gray-50/90",
                      flashMsg && "pi-row-complete-glow",
                    )}
                    onClick={() => {
                      setSelected(row);
                      setDetailOpen(true);
                    }}
                    data-testid={`pi-row-${row.contactId}`}
                  >
                    <TableCell onClick={(e) => toggleRow(row.contactId, e)}>
                      <input
                        type="checkbox"
                        checked={effectiveSelectedIds.has(row.contactId)}
                        onChange={() => {}}
                        aria-label={`Select ${row.name}`}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-gray-900 transition-colors">{row.name}</div>
                      {row.company ? (
                        <div className="max-w-[200px] truncate text-xs text-gray-500">
                          {row.company}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      {analyzing ? (
                        <span className="text-xs text-gray-400">AI is working…</span>
                      ) : waitingAnalyze ? (
                        <span className="text-xs text-gray-400">Queued for AI…</span>
                      ) : rowSummary.showSummary ? (
                        <div className="space-y-1" data-testid={`pi-row-summary-${row.contactId}`}>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <MatchStars stars={rowSummary.matchStars} />
                            <span className="font-medium text-gray-900">{rowSummary.matchLabel}</span>
                            {priorityBadge(rowSummary.priority || undefined, intel.analysisStatus)}
                          </div>
                          {rowSummary.businessType ? (
                            <p className="text-xs text-gray-600">{rowSummary.businessType}</p>
                          ) : null}
                          {rowSummary.offerLabel ? (
                            <p className="text-xs text-gray-700">
                              <span className="text-gray-400">Offer:</span> {rowSummary.offerLabel}
                            </p>
                          ) : null}
                          {rowSummary.angle ? (
                            <p className="line-clamp-2 text-[11px] leading-snug text-gray-500">
                              {rowSummary.angle}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {websiteDone || enriching ? (
                        <div className="flex flex-wrap gap-1">
                          <VerifiedChip ok={websiteDone} label="Website" />
                          <VerifiedChip ok={emailFound} label="Email" />
                          <VerifiedChip ok={phoneFound} label="Phone" />
                          <VerifiedChip ok={socialFound} label="Social" />
                        </div>
                      ) : reviewReady ? (
                        <span className="text-[11px] text-gray-400">Approve to enrich</span>
                      ) : (
                        <span className="text-[11px] text-gray-300">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <ProspectProgressTimeline life={life} />
                        {showActivity && (analyzing || enriching || life === "imported") ? (
                          <AiPersonalityStatusView
                            status={personality}
                            prefersReducedMotion={prefersReducedMotion}
                          />
                        ) : null}
                        {flashMsg ? (
                          <span className="text-[11px] font-medium text-emerald-700 transition-opacity">
                            {flashMsg}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={queuePreviewOpen} onOpenChange={setQueuePreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Queue outreach confirmation</DialogTitle>
            <DialogDescription>
              Preferred channel: Auto (Email is the only bulk-enabled channel today). Snapshots of
              approved subject/body are frozen at queue time.
            </DialogDescription>
          </DialogHeader>
          {queuePreview ? (
            <div className="space-y-3 text-sm">
              <p>
                <strong>{queuePreview.selectedCount}</strong> selected
              </p>
              <ul className="list-disc pl-5 text-gray-700">
                {Object.entries(queuePreview.eligibleByChannel || {}).map(([ch, n]) => (
                  <li key={ch}>
                    {n} {ch} eligible
                  </li>
                ))}
                {queuePreview.notBulkEligible > 0 ? (
                  <li>{queuePreview.notBulkEligible} not currently bulk-send eligible</li>
                ) : null}
                {queuePreview.skips.slice(0, 8).map((s) => (
                  <li key={s.contactId}>
                    {s.name || s.contactId.slice(0, 8)} —{" "}
                    {s.reasonLabel || prospectOutreachEligibilityReasonLabel(s.reason, s.detail)}
                  </li>
                ))}
                {queuePreview.skips.length > 8 ? (
                  <li>+{queuePreview.skips.length - 8} more skips</li>
                ) : null}
              </ul>
              <p className="font-medium text-emerald-800">
                {queuePreview.willQueue} will be queued
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setQueuePreviewOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-brand-green hover:bg-emerald-700"
              disabled={!queuePreview?.willQueue || confirmQueueMutation.isPending}
              onClick={() => confirmQueueMutation.mutate()}
              data-testid="pi-confirm-queue"
            >
              {confirmQueueMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Queue {queuePreview?.willQueue ?? 0} prospects
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProspectIntelligenceDetailDialog
        item={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onItemUpdated={(next) => setSelected(next)}
        onContactFieldsUpdated={(contactId, patch) => {
          setSelected((prev) =>
            prev && prev.contactId === contactId ? { ...prev, ...patch } : prev,
          );
          queryClient.setQueriesData<{ items: ProspectIntelligenceListItem[] }>(
            { queryKey: ["/api/growth-tools/prospect-intelligence"] },
            (old) => {
              if (!old?.items) return old;
              return {
                ...old,
                items: old.items.map((row) =>
                  row.contactId === contactId ? { ...row, ...patch } : row,
                ),
              };
            },
          );
          void queryClient.invalidateQueries({
            queryKey: ["/api/growth-tools/prospect-intelligence"],
          });
        }}
      />
    </section>
  );
}
