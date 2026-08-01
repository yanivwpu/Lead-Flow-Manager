import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Globe,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { useLocation, useSearch } from "wouter";
import type {
  ProspectIntelligenceJobSummary,
  ProspectIntelligenceListItem,
} from "@shared/prospectImport";
import {
  formatProspectSelectAllLabel,
  formatProspectReviewSelectionSummary,
  PROSPECT_AI_PAGE_SUBTITLES,
  PROSPECT_SELECTION_LABELS,
  shouldShowSelectEntireScopeAction,
} from "@shared/prospectAiDisplay";
import {
  encodeProspectReviewBatchKey,
  parseProspectReviewBatchKey,
  type ProspectReviewBatchOption,
} from "@shared/prospectReviewBatch";
import { PROSPECT_AI_PATH } from "@/lib/prospectAi";
import {
  formatSendToCampaignConfirmCopy,
  groupCampaignSkipReasons,
} from "@shared/prospectBulkOutreach";
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
  isProspectEnrichmentComplete,
  isProspectEnrichmentFailed,
  isProspectEnrichmentInProgress,
  isProspectQualificationComplete,
  isProspectQualificationPending,
  mergeProspectRowsStableOrder,
  prospectReviewCompletionFlash,
  prospectReviewLifecycleLabel,
  prospectReviewWorkEmptyMessage,
  PROSPECT_TIMELINE_STAGES,
  resolveProspectReviewLifecycle,
  resolveProspectTimelineStates,
  type ProspectTimelineStageState,
} from "@shared/prospectReviewUx";
import {
  canEnrichProspect,
  enrichActionLabel,
  explainCanEnrichProspect,
  explainQualifiedForCampaign,
  formatProspectBulkActionResult,
  isProspectDecisionQualified,
  isProspectEnrichmentRetryable,
  isProspectInCampaigns,
  isProspectQualifiedForCampaign,
  listEmailCampaignBlockingReasons,
  matchesProspectReviewWorkFilter,
  PROSPECT_REVIEW_WORK_FILTER_CHIPS,
  PROSPECT_REVIEW_WORK_STATE_LABELS,
  resolveProspectNeedsReviewBadge,
  resolveProspectNeedsReviewBadgeDetail,
  resolveProspectReviewPresentation,
  resolveProspectReviewWorkState,
  summarizeSelectionActionAvailability,
  type ProspectNeedsReviewBadge,
  type ProspectReviewWorkFilter,
} from "@shared/prospectAiReviewState";
import {
  isProspectAiReviewRetryable,
  resolveProspectDetailPrimaryStatus,
  resolveProspectProgressState,
  sanitizeProspectAiReviewTechnicalDetails,
  userFacingProspectAiReviewError,
} from "@shared/prospectAiReviewErrors";
import {
  resolveMissingEmailDetail,
  userFacingEnrichmentErrorMessage,
  readEnrichmentFailureClass,
} from "@shared/prospectEnrichmentOutcome";
import { useAuth } from "@/lib/auth-context";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { classifyProspectWebsiteUrl } from "@shared/prospectWebsiteClassification";
import {
  assertEnrichIdsNonEmpty,
  buildBulkApproveRequestBody,
  formatEnrichmentStartedMessage,
  planEnrichActionUi,
  snapshotEnrichContactIds,
} from "@shared/prospectEnrichAction";
import {
  AI_PERSONALITY_ROTATE_MS,
  buildAiGrowthAssistantModel,
  resolveAiPersonalityStatus,
} from "@shared/prospectAiPersonality";
import {
  PROSPECT_AI_PROGRESS_COL_CLASS,
  PROSPECT_AI_PROGRESS_TIMELINE_CLASS,
  PROSPECT_AI_REVIEW_COLGROUP,
  PROSPECT_AI_REVIEW_TABLE_CLASS,
} from "@shared/prospectAiLayout";
import {
  prospectWebsiteDomain,
  resolveProspectDisplayWebsiteUrl,
  resolveProspectWebsiteDetailState,
} from "@shared/prospectWebsiteDisplay";
import { AiGrowthAssistantCard } from "@/components/prospectAi/AiGrowthAssistantCard";
import { ProspectAiEmptyState } from "@/components/prospectAi/ProspectAiPageLayout";
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
  const offer = String(row.intelligence.recommendedOffer || "").toLowerCase();
  return {
    analysisStatus: row.intelligence.analysisStatus,
    reviewStatus: row.intelligence.reviewStatus,
    needsReview: row.intelligence.needsReview,
    priority: row.intelligence.priority,
    enrichmentStatus: row.intelligence.enrichmentStatus,
    enrichmentTriggeredBy: row.intelligence.enrichmentTriggeredBy,
    approvedAt: row.intelligence.approvedAt,
    approvedByUserId: row.intelligence.approvedByUserId,
    qualificationSource: row.intelligence.qualificationSource,
    outreachStatus: row.intelligence.outreachStatus,
    outreachSentAt: row.intelligence.outreachSentAt,
    repliedAt: row.intelligence.repliedAt,
    outreachMessageId: row.intelligence.outreachMessageId,
    outreachConversationId: row.intelligence.outreachConversationId,
    queueStatus: row.queueStatus,
    outcome: row.prospectOutcome,
    email: row.email,
    websiteUrl: row.websiteUrl,
    websiteUrlUsed: row.intelligence.websiteUrlUsed,
    enrichmentEmailFound: row.intelligence.enrichmentEmailFound,
    enrichmentErrorMessage: row.intelligence.enrichmentErrorMessage,
    enrichmentResult: (row.intelligence.enrichmentResult || null) as Record<string, unknown> | null,
    suggestedFirstMessage: row.intelligence.suggestedFirstMessage,
    suggestedOutreachSubject: row.intelligence.suggestedOutreachSubject,
    /** Existing supported state — no schema change. */
    notQualified: offer === "not_a_fit",
    /** Same server prior-outreach truth as Send preview. */
    priorOutreachDetected: row.priorOutreachDetected === true,
    errorMessage: row.intelligence.errorMessage,
    discoveryAttentionReason: row.discoveryAttentionReason,
  };
}

const PROSPECT_TIMELINE_SHORT_LABELS: Record<(typeof PROSPECT_TIMELINE_STAGES)[number]["id"], string> = {
  ai_review: "AI",
  enriched: "Enr",
  campaign: "Camp",
};

function ProspectProgressTimeline({ ux }: { ux: ReturnType<typeof reviewUxInput> }) {
  const life = resolveProspectReviewLifecycle(ux);
  const states = resolveProspectTimelineStates(ux);
  const enrichment = String(ux.enrichmentStatus || "none").toLowerCase();
  const legacyEnriched =
    !isProspectEnrichmentComplete(enrichment) &&
    !isProspectEnrichmentFailed(enrichment) &&
    !isProspectEnrichmentInProgress(enrichment) &&
    (life === "inbox" || life === "won" || life === "campaign" || life === "queued");
  return (
    <div
      className={PROSPECT_AI_PROGRESS_TIMELINE_CLASS}
      data-testid={`pi-timeline-${life}`}
      aria-label={`Progress: ${prospectReviewLifecycleLabel(life)}`}
      title={legacyEnriched ? "Created before Website Intelligence." : undefined}
    >
      {PROSPECT_TIMELINE_STAGES.map((stage, i) => {
        const state = states[i] as ProspectTimelineStageState;
        return (
          <span key={stage.id} className="inline-flex shrink-0 items-center gap-1">
            {i > 0 ? <span className="text-[10px] text-gray-200 select-none">·</span> : null}
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-medium tracking-tight transition-colors duration-300",
                state === "done" && "text-emerald-700",
                state === "current" && "text-emerald-800",
                state === "todo" && "text-gray-400",
                state === "failed" && "text-red-600",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] leading-none",
                  state === "done" && "bg-emerald-600 text-white",
                  state === "current" && "bg-emerald-500 text-white pi-timeline-current",
                  state === "todo" && "border border-gray-300 bg-white text-gray-300",
                  state === "failed" && "bg-red-500 text-white",
                )}
                aria-hidden
              >
                {state === "done" ? "✓" : state === "current" ? "●" : state === "failed" ? "!" : "○"}
              </span>
              <span className="prospect-ai-stage-label-full">{stage.label}</span>
              <span className="prospect-ai-stage-label-short" aria-hidden>
                {PROSPECT_TIMELINE_SHORT_LABELS[stage.id]}
              </span>
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

/** Compact clickable globe — only when a website URL exists (row AI summary). */
function ProspectWebsiteGlobeIcon({
  websiteUrl,
  websiteUrlUsed,
}: {
  websiteUrl?: string | null;
  websiteUrlUsed?: string | null;
}) {
  const href = resolveProspectDisplayWebsiteUrl({ websiteUrl, websiteUrlUsed });
  if (!href) return null;
  const domain = prospectWebsiteDomain(href) || href;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label={`Open website ${domain}`}
            data-testid="pi-row-website-icon"
            onClick={(e) => e.stopPropagation()}
          >
            <Globe className="h-3.5 w-3.5" aria-hidden />
          </a>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {domain}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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

function NeedsReviewReasonBadge({
  badge,
  detail,
}: {
  badge: ProspectNeedsReviewBadge;
  detail?: string | null;
}) {
  const tone =
    badge.code === "qualified"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : badge.code === "enriching" || badge.code === "analyzing"
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : badge.code === "ai_review_failed" || badge.code === "enrichment_failed"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : badge.code === "not_qualified"
            ? "border-gray-200 bg-gray-50 text-gray-600"
            : "border-amber-200 bg-amber-50 text-amber-900";
  const title = detail ? `${badge.label}: ${detail}` : badge.label;
  return (
    <span className="mt-1 inline-flex max-w-full flex-col gap-0.5" title={title}>
      <Badge
        variant="outline"
        className={cn("w-fit px-1.5 py-0 text-[10px] font-medium", tone)}
        data-testid={`pi-needs-review-badge-${badge.code}`}
      >
        {badge.label}
      </Badge>
      {detail ? (
        <span
          className="truncate text-[10px] leading-tight text-gray-500"
          data-testid="pi-missing-email-detail"
        >
          {detail}
        </span>
      ) : null}
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

function priorityBadge(
  priority?: string,
  analysisStatus?: string | null,
  opts?: { decisionQualified?: boolean },
) {
  if (!isProspectQualificationComplete(analysisStatus)) {
    return null;
  }
  // Stale AI priority must never contradict a Qualified decision.
  if (opts?.decisionQualified && String(priority || "").toLowerCase() === "needs_review") {
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
  /** After manual qualification — parent may switch Review filter tabs. */
  onQualificationChanged?: (decision: "qualified" | "needs_review" | "not_qualified") => void;
  /** Shared with toolbar — same Enrich action function. */
  onStartEnrichment: (
    contactIds: string[],
    opts?: { suggestedFirstMessage?: string; suggestedOutreachSubject?: string },
  ) => void;
  enrichPending?: boolean;
};

type ContactFieldKind = "email" | "phone";

function ProspectWebsiteFieldEditor(props: {
  contactId: string;
  currentUrl?: string | null;
  onSaved: (websiteUrl: string) => void;
}) {
  const { contactId, currentUrl, onSaved } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(currentUrl || ""));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(String(currentUrl || ""));
  }, [currentUrl, editing]);

  const saveMutation = useMutation({
    mutationFn: async (nextRaw: string) => {
      const trimmed = nextRaw.trim();
      if (!trimmed) throw new Error("Enter a website URL");
      const res = await fetch(`/api/growth-tools/prospect-intelligence/${contactId}/website`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "Could not save website");
      }
      return data as { websiteUrl: string };
    },
    onSuccess: (data) => {
      setEditing(false);
      setLocalError(null);
      onSaved(data.websiteUrl);
      toast({ title: "Website saved — Retry Enrichment when ready" });
    },
    onError: (err: Error) => {
      setLocalError(err.message);
    },
  });

  if (!editing) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={() => setEditing(true)}
        data-testid="pi-website-edit"
      >
        <Pencil className="mr-1 h-3 w-3" /> Edit
      </Button>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex w-full max-w-sm items-center gap-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://example.com"
          className="h-8 text-xs"
          data-testid="pi-website-edit-input"
        />
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate(draft)}
          data-testid="pi-website-save"
        >
          {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={() => {
            setEditing(false);
            setLocalError(null);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {localError ? (
        <p className="text-[11px] text-rose-700" data-testid="pi-website-edit-error">
          {localError}
        </p>
      ) : null}
    </div>
  );
}

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
  onQualificationChanged,
  onStartEnrichment,
  enrichPending,
}: DetailDialogProps) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "owner";
  const [editMessage, setEditMessage] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [techDetailsOpen, setTechDetailsOpen] = useState(false);
  const intel = item?.intelligence;

  useEffect(() => {
    if (!open || !item) return;
    setEditMessage(item.intelligence?.suggestedFirstMessage || "");
    setEditSubject(
      item.intelligence?.suggestedOutreachSubject ||
        buildProspectOutreachSubject(item.name, {
          offer: item.intelligence?.recommendedOffer,
          angle: item.intelligence?.suggestedOutreachAngle,
        }),
    );
  }, [
    open,
    item?.contactId,
    item?.intelligence?.suggestedFirstMessage,
    item?.intelligence?.suggestedOutreachSubject,
    item?.name,
  ]);

  const approveUi = resolveProspectApproveOutreachUi({
    reviewStatus: intel?.reviewStatus,
    outreachStatus: intel?.outreachStatus,
    outreachSentAt: intel?.outreachSentAt,
    repliedAt: intel?.repliedAt,
    email: item?.email,
    outreachConversationId: intel?.outreachConversationId,
    outreachMessageId: intel?.outreachMessageId,
    queueStatus: item?.queueStatus,
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
    outreachMessageId: intel?.outreachMessageId,
    outreachConversationId: intel?.outreachConversationId,
    queueStatus: item?.queueStatus,
  });
  const lifecycle = item
    ? resolveProspectReviewLifecycle(reviewUxInput(item))
    : "imported";
  const workState = item ? resolveProspectReviewWorkState(reviewUxInput(item)) : "imported";
  const workStateLabel = PROSPECT_REVIEW_WORK_STATE_LABELS[workState];
  const detailCanEnrich = item ? canEnrichProspect(reviewUxInput(item)) : false;
  const detailEnrichExplain = item ? explainCanEnrichProspect(reviewUxInput(item)) : null;
  const detailQualifiedExplain = item ? explainQualifiedForCampaign(reviewUxInput(item)) : null;
  const detailRetryable = item ? isProspectEnrichmentRetryable(reviewUxInput(item)) : false;
  const detailEnrichLabel = item ? enrichActionLabel(reviewUxInput(item)) : "Enrich";
  const missingEmailDetail = item
    ? resolveMissingEmailDetail(reviewUxInput(item))
    : null;

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
    mutationFn: (body: {
      suggestedFirstMessage?: string;
      suggestedOutreachSubject?: string;
      recommendedOffer?: string;
    }) =>
      fetchJson<ProspectIntelligenceListItem>(
        `/api/growth-tools/prospect-intelligence/${item!.contactId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    onSuccess: (data, vars) => {
      applyItemUpdate(data);
      toast({
        title:
          vars.recommendedOffer === "not_a_fit"
            ? "Marked not qualified"
            : "Draft message saved",
      });
    },
  });

  const qualificationMutation = useMutation({
    mutationFn: (decision: "qualified" | "needs_review" | "not_qualified") =>
      fetchJson<{ item?: ProspectIntelligenceListItem }>(
        `/api/growth-tools/prospect-intelligence/${item!.contactId}/qualification`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      ).then((data) => ({ data, decision })),
    onSuccess: ({ data, decision }) => {
      if (data.item) applyItemUpdate(data.item);
      else void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
      onQualificationChanged?.(decision);
      toast({
        title:
          decision === "qualified"
            ? "Marked Qualified"
            : decision === "not_qualified"
              ? "Marked Not Qualified"
              : "Marked Needs Review",
      });
    },
    onError: (err: Error) =>
      toast({ title: "Could not update qualification", description: err.message, variant: "destructive" }),
  });

  const detailIsNotQualified = workState === "not_qualified";
  const detailIsDecisionQualified = item ? isProspectDecisionQualified(reviewUxInput(item)) : false;
  const detailQualificationDecision: "qualified" | "needs_review" | "not_qualified" =
    detailIsNotQualified
      ? "not_qualified"
      : detailIsDecisionQualified
        ? "qualified"
        : "needs_review";
  const detailEnrichBusy = Boolean(enrichPending);
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
      subject: editSubject || item.intelligence?.suggestedOutreachSubject || buildProspectOutreachSubject(item.name),
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
            {(() => {
              const primary = resolveProspectDetailPrimaryStatus({
                analysisStatus: intel.analysisStatus,
                decision: detailQualificationDecision,
                readyForCampaign: detailQualifiedExplain?.ok === true,
              });
              const tone =
                primary.code === "ai_review_failed"
                  ? "border-rose-300 text-rose-800"
                  : primary.code === "ready_for_campaign" || primary.code === "qualified"
                    ? undefined
                    : primary.code === "needs_review"
                      ? "border-amber-300 text-amber-800"
                      : undefined;
              const solid =
                primary.code === "ready_for_campaign"
                  ? "bg-brand-green"
                  : primary.code === "qualified"
                    ? "bg-emerald-600"
                    : undefined;
              return (
                <Badge
                  variant={solid ? "default" : "outline"}
                  className={solid || tone}
                  data-testid={primary.testId}
                >
                  {primary.label}
                </Badge>
              );
            })()}
          </DialogTitle>
          <DialogDescription>
            {item.sourceLabel || item.batchName || "Imported batch"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div
            className="grid gap-2 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 sm:grid-cols-2"
            data-testid="pi-qualification-enrichment-split"
          >
            <div data-testid="pi-qualification-summary">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                Qualification
              </p>
              <p className="mt-0.5 font-medium text-gray-900">
                {detailQualificationDecision === "qualified"
                  ? "Qualified"
                  : detailQualificationDecision === "not_qualified"
                    ? "Not Qualified"
                    : "Needs Review"}
              </p>
              {String(intel.recommendedOffer || "").toLowerCase() === "not_a_fit" &&
              detailQualificationDecision !== "not_qualified" ? (
                <p className="mt-0.5 text-xs text-gray-500" data-testid="pi-ai-not-fit-note">
                  AI suggested not a fit — human decision takes precedence.
                </p>
              ) : null}
            </div>
            <div data-testid="pi-enrichment-summary">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                Contact enrichment
              </p>
              <p className="mt-0.5 font-medium text-gray-900">
                {String(intel.enrichmentStatus || "").toLowerCase() === "completed"
                  ? "Complete"
                  : String(intel.enrichmentStatus || "").toLowerCase() === "failed"
                    ? "Some info unavailable"
                    : isProspectEnrichmentInProgress(intel.enrichmentStatus)
                      ? "In progress"
                      : "Not run"}
              </p>
              {String(intel.enrichmentStatus || "").toLowerCase() === "completed" ||
              Boolean(String(item.email || "").trim()) ||
              Boolean(String(item.phone || "").trim()) ? (
                <p
                  className="mt-0.5 text-xs text-gray-500"
                  data-testid="pi-enrichment-independent-hint"
                  title="Contact data found. Qualification is a separate decision."
                >
                  Contact data found. Qualification is a separate decision.
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-gray-500">
                  Qualification is separate from enrichment.
                </p>
              )}
            </div>
          </div>

          {analysisIncomplete ? (
            <div
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"
              data-testid="pi-analysis-pending-banner"
            >
              {analysisStatus === "failed" ? (
                <>
                  <p className="font-medium">AI Review couldn't be completed</p>
                  <p className="mt-0.5 text-xs text-amber-800" data-testid="pi-analysis-failed-reason">
                    {userFacingProspectAiReviewError(intel?.errorMessage)}
                  </p>
                  {isProspectAiReviewRetryable(intel?.errorMessage) ? (
                    <p className="mt-1 text-xs text-amber-700">Use Retry Qualification to try again.</p>
                  ) : (
                    <p className="mt-1 text-xs text-amber-700">
                      This failure looks permanent — edit the prospect details or mark Not Qualified.
                    </p>
                  )}
                  {isAdmin && String(intel?.errorMessage || "").trim() ? (
                    <Collapsible
                      open={techDetailsOpen}
                      onOpenChange={setTechDetailsOpen}
                      className="mt-2"
                    >
                      <CollapsibleTrigger
                        className="inline-flex items-center gap-1 text-xs font-medium text-amber-900/80 hover:underline"
                        data-testid="pi-analysis-technical-details"
                      >
                        Technical details
                        <ChevronDown
                          className={cn("h-3.5 w-3.5 transition", techDetailsOpen && "rotate-180")}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <pre
                          className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded border border-amber-200/80 bg-white/70 p-2 text-[10px] text-amber-950"
                          data-testid="pi-analysis-technical-details-body"
                        >
                          {sanitizeProspectAiReviewTechnicalDetails(intel?.errorMessage)}
                        </pre>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : null}
                </>
              ) : analysisStatus === "processing" ? (
                <>
                  <p className="font-medium">Reviewing</p>
                  <p className="mt-0.5 text-xs text-amber-800">AI Review is in progress.</p>
                </>
              ) : (
                <>
                  <p className="font-medium">AI Review has not completed yet.</p>
                  <p className="mt-0.5 text-xs text-amber-800">
                    Fields will populate when analysis finishes.
                  </p>
                </>
              )}
            </div>
          ) : null}

          {(() => {
            const websiteHref = resolveProspectDisplayWebsiteUrl({
              websiteUrl: item.websiteUrl,
              websiteUrlUsed: intel.websiteUrlUsed,
            });
            const websiteDomain = prospectWebsiteDomain(websiteHref);
            const websiteKind = classifyProspectWebsiteUrl(websiteHref);
            const websiteState = resolveProspectWebsiteDetailState({
              websiteUrl: item.websiteUrl,
              websiteUrlUsed: intel.websiteUrlUsed,
              enrichmentStatus: intel.enrichmentStatus,
            });
            const result = (intel.enrichmentResult || {}) as {
              publicContacts?: {
                emails?: string[];
                phones?: string[];
                whatsappNumbers?: string[];
                socialProfiles?: string[];
                bookingUrls?: string[];
              };
              websiteIntelligence?: {
                businessSummary?: string;
                recommendedOutreachAngle?: string;
                aiFitInsights?: string;
              };
              failureClass?: string;
            };
            const contacts = result.publicContacts;
            return (
              <div
                className="rounded-lg border border-gray-200 bg-gray-50/60 p-3"
                data-testid="pi-website-section"
                data-website-state={websiteState}
                data-website-kind={websiteKind}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-gray-900">Website</p>
                  <ProspectWebsiteFieldEditor
                    contactId={item.contactId}
                    currentUrl={item.websiteUrl || intel.websiteUrlUsed}
                    onSaved={(nextUrl) => {
                      onContactFieldsUpdated(item.contactId, {});
                      onItemUpdated({
                        ...item,
                        websiteUrl: nextUrl,
                        intelligence: {
                          ...item.intelligence,
                          enrichmentStatus: "failed",
                          enrichmentErrorMessage: "Website updated — ready to retry",
                          websiteUrlUsed: null,
                        },
                      });
                    }}
                  />
                </div>
                {websiteKind === "social" ? (
                  <p className="mt-1 text-xs text-amber-800" data-testid="pi-website-social-only">
                    Social profile only — add an official business website to enrich.
                  </p>
                ) : null}
                {websiteState === "no_website" && websiteKind !== "social" ? (
                  <p className="mt-1 text-gray-600" data-testid="pi-website-none">
                    No public website found
                  </p>
                ) : websiteHref ? (
                  <div className="mt-1 space-y-1.5">
                    <p>
                      <a
                        href={websiteHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand-green hover:underline"
                        data-testid="pi-website-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {websiteDomain || websiteHref}
                      </a>
                    </p>
                    {websiteState === "not_analyzed" ? (
                      <p className="text-xs text-gray-500" data-testid="pi-website-status">
                        Status: Not analyzed yet
                      </p>
                    ) : null}
                    {websiteState === "analyzing" ? (
                      <p className="text-xs text-gray-500" data-testid="pi-website-status">
                        Analyzing website…
                      </p>
                    ) : null}
                    {websiteState === "analyzed" ? (
                      <>
                        <p className="text-xs text-gray-700" data-testid="pi-website-status">
                          Website analyzed
                        </p>
                        {intel.websiteAnalyzedAt ? (
                          <p className="text-xs text-gray-500" data-testid="pi-website-analyzed-at">
                            Analysis date:{" "}
                            {format(new Date(intel.websiteAnalyzedAt), "MMM d, yyyy h:mm a")}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                    {websiteState === "failed" ? (
                      <p className="text-xs text-gray-600" data-testid="pi-website-status">
                        {userFacingEnrichmentErrorMessage(
                          readEnrichmentFailureClass({
                            enrichmentStatus: intel.enrichmentStatus,
                            enrichmentErrorMessage: intel.enrichmentErrorMessage,
                            enrichmentResult: (intel.enrichmentResult ||
                              null) as Record<string, unknown> | null,
                            websiteUrl: item.websiteUrl,
                            websiteUrlUsed: intel.websiteUrlUsed,
                          }),
                          missingEmailDetail?.reason || intel.enrichmentErrorMessage,
                        )}
                      </p>
                    ) : null}
                    {websiteState === "analyzed" && contacts ? (
                      <div className="mt-2 space-y-0.5 text-xs text-gray-600" data-testid="pi-website-contacts">
                        {contacts.emails?.length ? (
                          <p>Email: {contacts.emails.slice(0, 3).join(", ")}</p>
                        ) : null}
                        {contacts.phones?.length ? (
                          <p>Phone: {contacts.phones.slice(0, 3).join(", ")}</p>
                        ) : null}
                        {contacts.whatsappNumbers?.length ? (
                          <p>WhatsApp: {contacts.whatsappNumbers.slice(0, 2).join(", ")}</p>
                        ) : null}
                        {contacts.socialProfiles?.length ? (
                          <p>Social: {contacts.socialProfiles.slice(0, 3).join(", ")}</p>
                        ) : null}
                        {contacts.bookingUrls?.length ? (
                          <p>Booking: {contacts.bookingUrls.slice(0, 2).join(", ")}</p>
                        ) : null}
                      </div>
                    ) : null}
                    {websiteState === "analyzed" && result.websiteIntelligence?.businessSummary ? (
                      <p className="mt-1 text-xs text-gray-600">
                        {result.websiteIntelligence.businessSummary}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {missingEmailDetail?.reason && !isValidProspectEmail(item.email) ? (
                  <p className="mt-2 text-xs text-gray-600" data-testid="pi-detail-missing-email-reason">
                    Missing Email — {missingEmailDetail.reason}
                  </p>
                ) : null}
              </div>
            );
          })()}

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
            {intel.outreachSentAt && approveUi.isOutreachSentOrLater ? (
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
              {priorityBadge(intel.priority, intel.analysisStatus, {
                decisionQualified: detailIsDecisionQualified,
              })}
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
            <p className="font-medium text-gray-900">Email Subject</p>
            {analysisIncomplete ? (
              <p className="mt-2 text-gray-600">{analysisPendingText || "AI analysis pending"}</p>
            ) : (
              <Input
                className="mt-2"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                data-testid="pi-email-subject"
                placeholder="Email subject"
              />
            )}
          </div>

          <div>
            <p className="font-medium text-gray-900">Suggested first message</p>
            {analysisIncomplete ? (
              <p className="mt-2 text-gray-600">{analysisPendingText || "AI analysis pending"}</p>
            ) : (
              <>
            <p className="mt-1 text-xs text-gray-500">
              Save message keeps a draft. Enrich also saves the text currently in this box.
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
                    : item?.queueStatus
                      ? "First outreach email was sent via Campaigns. Continue the conversation from Inbox."
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

        <DialogFooter className="flex-wrap gap-2" data-testid="pi-detail-footer">
          <div
            className="flex flex-wrap items-center gap-1.5"
            data-testid="pi-qualification-controls"
            role="group"
            aria-label="Qualification decision"
          >
            <Button
              type="button"
              variant={detailQualificationDecision === "qualified" ? "default" : "outline"}
              className={
                detailQualificationDecision === "qualified"
                  ? "bg-brand-green hover:bg-emerald-700"
                  : undefined
              }
              disabled={qualificationMutation.isPending}
              onClick={() => qualificationMutation.mutate("qualified")}
              data-testid="pi-qualify-qualified"
              title="Mark as Qualified (manual override — does not re-run AI)"
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Qualified
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={qualificationMutation.isPending}
              onClick={() => qualificationMutation.mutate("not_qualified")}
              data-testid="pi-qualify-not-qualified"
              title="Mark as Not Qualified (manual override — does not re-run AI)"
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Not Qualified
            </Button>
          </div>
          {String(intel?.analysisStatus || "").toLowerCase() === "failed" ? (
            <Button
              type="button"
              variant="outline"
              disabled={reanalyzeMutation.isPending}
              onClick={() => reanalyzeMutation.mutate()}
              data-testid="pi-retry-review"
              title="Retry AI qualification"
            >
              {reanalyzeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Retry Qualification
            </Button>
          ) : null}
          {detailRetryable ? (
            <Button
              type="button"
              variant="outline"
              disabled={retryEnrichmentMutation.isPending || detailEnrichBusy}
              onClick={() => retryEnrichmentMutation.mutate()}
              data-testid="pi-retry-enrichment"
              title="Retry website enrichment"
            >
              {retryEnrichmentMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Retry Enrichment
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              patchMutation.mutate({
                suggestedFirstMessage: editMessage,
                suggestedOutreachSubject: editSubject,
              })
            }
            data-testid="pi-save-message"
          >
            Save message
          </Button>
          {detailCanEnrich && !detailRetryable ? (
            <Button
              type="button"
              className="bg-brand-green hover:bg-emerald-700"
              disabled={detailEnrichBusy}
              onClick={() => {
                if (!item?.contactId) return;
                onStartEnrichment([item.contactId], {
                  suggestedFirstMessage: editMessage,
                  suggestedOutreachSubject: editSubject,
                });
              }}
              data-testid="pi-approve-button"
              title={detailEnrichExplain?.ok ? undefined : detailEnrichExplain?.message}
            >
              {detailEnrichBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {detailEnrichLabel}
            </Button>
          ) : null}
          {detailEnrichExplain && !detailEnrichExplain.ok && !detailCanEnrich ? (
            <p className="basis-full text-xs text-gray-500" data-testid="pi-enrich-blocked-reason">
              {detailEnrichExplain.message}
            </p>
          ) : null}
          {!detailQualifiedExplain?.ok ? (
            <p className="basis-full text-xs text-gray-500" data-testid="pi-campaign-blocked-reason">
              {detailQualifiedExplain?.message ||
                (detailIsDecisionQualified
                  ? "Campaign send is blocked for this prospect."
                  : "Resolve Needs Review or mark Qualified to send.")}
            </p>
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
  const searchString = useSearch();
  const [, setNavLocation] = useLocation();
  const urlBatchKey = useMemo(() => {
    const raw = new URLSearchParams(searchString).get("batch");
    const parsed = parseProspectReviewBatchKey(raw);
    if (parsed.kind === "all") return "all";
    return encodeProspectReviewBatchKey(parsed.kind, parsed.id);
  }, [searchString]);

  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [businessFilter, setBusinessFilter] = useState<string>("all");
  const [workFilter, setWorkFilter] = useState<ProspectReviewWorkFilter>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>(urlBatchKey);
  /** Work-queue default: actionable / newest first. Stable merge preserves mid-action order. */
  const [sortBy, setSortBy] = useState<"leadScore" | "priority" | "confidence" | "name" | "action">(
    "action",
  );
  const stableOrderRef = useRef<string[]>([]);
  const prevUxRef = useRef<Map<string, ReturnType<typeof reviewUxInput>>>(new Map());
  const [rowFlash, setRowFlash] = useState<Record<string, string>>({});
  const [progressTick, setProgressTick] = useState(0);
  /** Keep acted-on rows visible even if work filter would hide them (until in Campaigns). */
  const [pinnedVisibleIds, setPinnedVisibleIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ProspectIntelligenceListItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);
  /** Frozen IDs when Select entire scope is used (not only browser-visible rows). */
  const [resolvedFilteredIds, setResolvedFilteredIds] = useState<string[] | null>(null);
  const [resolvedFilteredCount, setResolvedFilteredCount] = useState<number | null>(null);
  const [bulkResultBanner, setBulkResultBanner] = useState<string | null>(null);
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

  useEffect(() => {
    setBatchFilter(urlBatchKey);
  }, [urlBatchKey]);

  const applyBatchFilter = (next: string) => {
    setBatchFilter(next);
    const params = new URLSearchParams(searchString);
    if (!params.get("tab")) params.set("tab", "review");
    if (!next || next === "all") params.delete("batch");
    else params.set("batch", next);
    const q = params.toString();
    setNavLocation(q ? `${PROSPECT_AI_PATH}?${q}` : PROSPECT_AI_PATH);
  };

  const currentFiltersPayload = useMemo(() => {
    return {
      ...(priorityFilter !== "all" ? { priority: priorityFilter } : {}),
      ...(businessFilter !== "all" && businessFilter !== "needs_review"
        ? { segment: businessFilter }
        : {}),
      ...(businessFilter === "needs_review" ? { needsReviewOnly: true } : {}),
      ...(channelFilter === "has_email" ? { hasEmail: true } : {}),
      ...(channelFilter === "has_phone" ? { hasPhone: true } : {}),
      ...(channelFilter === "missing_email" ? { missingEmail: true } : {}),
      ...(channelFilter === "missing_phone" ? { missingPhone: true } : {}),
      ...(channelFilter === "missing_website" ? { missingWebsite: true } : {}),
      ...(channelFilter === "email_eligible" ? { emailEligible: true } : {}),
      ...(channelFilter === "any_eligible" ? { anyEligibleChannel: true } : {}),
      ...(batchFilter !== "all" ? { reviewBatchKey: batchFilter } : {}),
    };
  }, [priorityFilter, businessFilter, channelFilter, batchFilter]);

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
    setCampaignBlockedFocus(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only clear when filters change
  }, [priorityFilter, businessFilter, workFilter, channelFilter, batchFilter, sortBy]);

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

  const batchesQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-intelligence/batches"],
    queryFn: () =>
      fetchJson<{ batches: ProspectReviewBatchOption[]; latestDiscoveryKey: string | null }>(
        "/api/growth-tools/prospect-intelligence/batches",
      ),
    staleTime: 15_000,
  });

  const listQuery = useQuery({
    queryKey: [
      "/api/growth-tools/prospect-intelligence",
      priorityFilter,
      businessFilter,
      channelFilter,
      batchFilter,
      sortBy,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (businessFilter !== "all" && businessFilter !== "needs_review") params.set("segment", businessFilter);
      if (businessFilter === "needs_review") params.set("needsReviewOnly", "true");
      if (channelFilter === "has_email") params.set("hasEmail", "true");
      if (channelFilter === "has_phone") params.set("hasPhone", "true");
      if (channelFilter === "missing_email") params.set("missingEmail", "true");
      if (channelFilter === "missing_phone") params.set("missingPhone", "true");
      if (channelFilter === "missing_website") params.set("missingWebsite", "true");
      if (channelFilter === "email_eligible") params.set("emailEligible", "true");
      if (channelFilter === "any_eligible") params.set("anyEligibleChannel", "true");
      if (batchFilter !== "all") params.set("reviewBatchKey", batchFilter);
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

  const activeBatchOption = useMemo(() => {
    if (batchFilter === "all") return null;
    return batchesQuery.data?.batches.find((b) => b.key === batchFilter) ?? null;
  }, [batchFilter, batchesQuery.data?.batches]);

  const batchActive = batchFilter !== "all";

  const workFilterCounts = useMemo(() => {
    const map: Record<string, number> = { all: 0 };
    for (const chip of PROSPECT_REVIEW_WORK_FILTER_CHIPS) {
      map[chip.id] = 0;
    }
    for (const row of rawItems) {
      const ux = reviewUxInput(row);
      for (const chip of PROSPECT_REVIEW_WORK_FILTER_CHIPS) {
        if (matchesProspectReviewWorkFilter(ux, chip.id)) {
          map[chip.id] = (map[chip.id] || 0) + 1;
        }
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
      const ux = reviewUxInput(row);
      if (isProspectInCampaigns(ux) || String(ux.outcome || "").toLowerCase() === "won") {
        return false;
      }
      if (pinnedVisibleIds.has(row.contactId)) return true;
      return matchesProspectReviewWorkFilter(ux, workFilter);
    });
  }, [rawItems, workFilter, pinnedVisibleIds]);

  // Drop pins once a row successfully leaves Review (in Campaigns).
  useEffect(() => {
    if (pinnedVisibleIds.size === 0) return;
    const drop: string[] = [];
    for (const id of pinnedVisibleIds) {
      const row = rawItems.find((r) => r.contactId === id);
      if (!row) continue;
      const ux = reviewUxInput(row);
      if (isProspectInCampaigns(ux) || String(ux.outcome || "").toLowerCase() === "won") {
        drop.push(id);
      }
    }
    if (!drop.length) return;
    setPinnedVisibleIds((prev) => {
      const next = new Set(prev);
      drop.forEach((id) => next.delete(id));
      return next;
    });
  }, [rawItems, pinnedVisibleIds]);

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

  const selectionEligibility = useMemo(() => {
    let canEnrich = 0;
    let qualified = 0;
    let missingEmail = 0;
    let alreadyEnriched = 0;
    let unavailable = 0;
    let notQualified = 0;
    let needsReview = 0;
    let firstEnrich: ReturnType<typeof explainCanEnrichProspect> | null = null;
    let firstQualified: ReturnType<typeof explainQualifiedForCampaign> | null = null;
    let retryCount = 0;
    for (const row of rawItems) {
      if (!effectiveSelectedIds.has(row.contactId)) continue;
      const ux = reviewUxInput(row);
      const enrichEx = explainCanEnrichProspect(ux);
      const qualEx = explainQualifiedForCampaign(ux);
      if (!firstEnrich) firstEnrich = enrichEx;
      if (!firstQualified) firstQualified = qualEx;
      if (enrichEx.ok) {
        canEnrich += 1;
        if (enrichEx.code === "retry_available" || isProspectEnrichmentRetryable(ux)) {
          retryCount += 1;
        }
      } else if (enrichEx.code === "already_enriched" || enrichEx.code === "email_added") {
        alreadyEnriched += 1;
      } else {
        unavailable += 1;
      }
      if (qualEx.ok) qualified += 1;
      if (isProspectDecisionQualified(ux) && qualEx.code === "missing_email") missingEmail += 1;
      else if (!qualEx.ok && qualEx.code === "missing_email") missingEmail += 1;
      if (ux.notQualified === true && !isProspectDecisionQualified(ux)) notQualified += 1;
      if (matchesProspectReviewWorkFilter(ux, "needs_review")) {
        needsReview += 1;
      }
    }
    const availability = summarizeSelectionActionAvailability({
      selectedCount: effectiveSelectedIds.size,
      enrichableCount: canEnrich,
      qualifiedCount: qualified,
      firstEnrich,
      firstQualified,
      missingEmailCount: missingEmail,
      alreadyEnrichedCount: alreadyEnriched,
      unavailableCount: unavailable,
      notQualifiedCount: notQualified,
      needsReviewCount: needsReview,
    });
    const readable = formatProspectReviewSelectionSummary({
      selectedCount: effectiveSelectedIds.size,
      enrichableCount: canEnrich,
      alreadyEnrichedCount: alreadyEnriched,
      unavailableCount: unavailable,
      qualifiedCount: qualified,
      notQualifiedCount: notQualified,
      needsReviewCount: needsReview,
      missingEmailCount: missingEmail,
    });
    return {
      canEnrich,
      qualified,
      missingEmail,
      alreadyEnriched,
      unavailable,
      notQualified,
      needsReview,
      retryCount,
      firstEnrich,
      firstQualified,
      availability,
      readable,
    };
  }, [rawItems, effectiveSelectedIds, selectedIds.size, selectAllFiltered, resolvedFilteredIds]);

  const toggleRow = (contactId: string, e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      // When leaving select-all mode, seed from resolved IDs so uncheck removes instead of adds.
      const base =
        selectAllFiltered && resolvedFilteredIds ? new Set(resolvedFilteredIds) : new Set(prev);
      const next = new Set(base);
      const had = next.has(contactId);
      if (had) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
    setSelectAllFiltered(false);
    setResolvedFilteredIds(null);
    setResolvedFilteredCount(null);
  };

  const clearSelection = () => {
    setSelectAllFiltered(false);
    setResolvedFilteredIds(null);
    setResolvedFilteredCount(null);
    setSelectedIds(new Set());
  };

  const selectVisible = () => {
    setSelectAllFiltered(false);
    setResolvedFilteredIds(null);
    setResolvedFilteredCount(null);
    setSelectedIds(new Set(items.map((i) => i.contactId)));
  };

  const clearVisibleSelection = () => {
    const visible = new Set(items.map((i) => i.contactId));
    if (selectAllFiltered && resolvedFilteredIds) {
      const remaining = resolvedFilteredIds.filter((id) => !visible.has(id));
      if (remaining.length === 0) {
        clearSelection();
        return;
      }
      setSelectAllFiltered(false);
      setResolvedFilteredIds(null);
      setResolvedFilteredCount(null);
      setSelectedIds(new Set(remaining));
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of visible) next.delete(id);
      return next;
    });
  };

  const visibleSelectedCount = useMemo(
    () => items.filter((row) => effectiveSelectedIds.has(row.contactId)).length,
    [items, effectiveSelectedIds],
  );
  const allVisibleSelected = items.length > 0 && visibleSelectedCount === items.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  const toggleVisibleHeaderCheckbox = () => {
    if (allVisibleSelected) clearVisibleSelection();
    else selectVisible();
  };

  const matchingScopeCount = workFilterCounts[workFilter] ?? items.length;
  const showSelectEntireScope = shouldShowSelectEntireScopeAction({
    visibleCount: items.length,
    matchingCount: matchingScopeCount,
  });

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
      const cacheEntries = queryClient.getQueriesData<{ items: ProspectIntelligenceListItem[] }>({
        queryKey: ["/api/growth-tools/prospect-intelligence"],
      });
      const cacheItems =
        cacheEntries.find(([, d]) => d?.items?.length)?.[1]?.items ?? rawItems;
      const intersected = data.selection.contactIds.filter((id) => {
        const row = cacheItems.find((r) => r.contactId === id);
        if (!row) return false;
        const ux = reviewUxInput(row);
        if (isProspectInCampaigns(ux) || String(ux.outcome || "").toLowerCase() === "won") {
          return false;
        }
        return matchesProspectReviewWorkFilter(ux, workFilter);
      });
      setSelectAllFiltered(true);
      setSelectedIds(new Set());
      setResolvedFilteredIds(intersected);
      setResolvedFilteredCount(intersected.length);
      toast({
        title: `${intersected.length} prospects selected`,
        description: formatProspectSelectAllLabel({
          count: intersected.length,
          batchActive,
        }),
      });
    },
    onError: (err: Error) =>
      toast({ title: "Could not select all filtered", description: err.message, variant: "destructive" }),
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (vars: {
      idsToEnrich: string[];
      suggestedFirstMessage?: string;
      suggestedOutreachSubject?: string;
    }) => {
      const idsToEnrich = snapshotEnrichContactIds(vars.idsToEnrich);
      assertEnrichIdsNonEmpty(idsToEnrich);
      // Single-contact path preserves draft message/subject via /approve.
      if (
        idsToEnrich.length === 1 &&
        (vars.suggestedFirstMessage !== undefined ||
          vars.suggestedOutreachSubject !== undefined)
      ) {
        const contactId = idsToEnrich[0]!;
        const data = await fetchJson<{ item?: ProspectIntelligenceListItem }>(
          `/api/growth-tools/prospect-intelligence/${contactId}/approve`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              suggestedFirstMessage: vars.suggestedFirstMessage,
              suggestedOutreachSubject: vars.suggestedOutreachSubject,
            }),
          },
        );
        return {
          approved: data.item ? 1 : 0,
          approvedContactIds: data.item ? [contactId] : ([] as string[]),
          skipped: [] as unknown[],
          item: data.item,
        };
      }
      const body = buildBulkApproveRequestBody(idsToEnrich);
      const data = await fetchJson<{
        approved: number;
        approvedContactIds: string[];
        skipped: unknown[];
      }>("/api/growth-tools/prospect-intelligence/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { ...data, item: undefined as ProspectIntelligenceListItem | undefined };
    },
    // Intentionally no onMutate clearSelection / setWorkFilter — that raced the request body.
    onSuccess: (data, vars) => {
      const skippedCount = Array.isArray(data.skipped) ? data.skipped.length : 0;
      const succeeded = data.approved ?? 0;
      const selectedForAction = vars.idsToEnrich.length;
      const startedIds = data.approvedContactIds?.length
        ? data.approvedContactIds
        : succeeded > 0
          ? vars.idsToEnrich
          : [];

      // Only treat as started when at least one job was accepted.
      const ui = planEnrichActionUi(succeeded > 0 ? "success" : "failure");

      if (ui.patchRowsToEnriching && startedIds.length) {
        setPinnedVisibleIds((prev) => {
          const next = new Set(prev);
          startedIds.forEach((id) => next.add(id));
          return next;
        });
        patchListRows(startedIds, (row) => ({
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
        if (data.item) {
          setSelected((prev) =>
            prev && startedIds.includes(prev.contactId)
              ? {
                  ...data.item!,
                  intelligence: {
                    ...data.item!.intelligence,
                    enrichmentStatus:
                      String(data.item!.intelligence.enrichmentStatus || "none").toLowerCase() ===
                      "none"
                        ? "pending"
                        : data.item!.intelligence.enrichmentStatus,
                  },
                }
              : prev,
          );
        }
      }

      if (ui.clearSelection) clearSelection();
      // Do NOT switch to Enriching filter — leave user on current Review filter.

      if (succeeded > 0 && skippedCount === 0) {
        const msg = formatEnrichmentStartedMessage(succeeded);
        setBulkResultBanner(msg);
        toast({ title: msg });
      } else {
        setBulkResultBanner(
          formatProspectBulkActionResult("enrich", {
            selected: selectedForAction,
            succeeded,
            skipped: skippedCount,
            failed: succeeded === 0 ? selectedForAction : 0,
          }),
        );
        if (succeeded === 0) {
          toast({
            title: "Enrich failed",
            description: "No enrichment jobs started for the selection.",
            variant: "destructive",
          });
        }
      }
    },
    onError: (err: Error, vars) => {
      // Preserve selection + current filter (Needs Review). Do not clear or switch tabs.
      setBulkResultBanner(
        formatProspectBulkActionResult("enrich", {
          selected: vars.idsToEnrich.length || 1,
          succeeded: 0,
          skipped: 0,
          failed: vars.idsToEnrich.length || 1,
          detail: err.message,
        }),
      );
      toast({ title: "Enrich failed", description: err.message, variant: "destructive" });
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
    },
  });
  /** Shared Enrich action — toolbar and detail both call this. Only eligible IDs are sent. */
  const startProspectEnrichment = (
    contactIds: string[],
    opts?: { suggestedFirstMessage?: string; suggestedOutreachSubject?: string },
  ) => {
    const snapped = snapshotEnrichContactIds(contactIds);
    const idsToEnrich = snapped.filter((id) => {
      const row = rawItems.find((r) => r.contactId === id);
      if (!row) return false;
      return canEnrichProspect(reviewUxInput(row));
    });
    if (!idsToEnrich.length) {
      toast({
        title: "Enrich failed",
        description: "No eligible prospects in the selection.",
        variant: "destructive",
      });
      return;
    }
    bulkApproveMutation.mutate({
      idsToEnrich,
      suggestedFirstMessage: opts?.suggestedFirstMessage,
      suggestedOutreachSubject: opts?.suggestedOutreachSubject,
    });
  };
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
    onMutate: (contactIds) => {
    },
    onSuccess: (data) => {
      setQueuePreview(data.preview);
      setQueuePreviewOpen(true);
    },
    onError: (err: Error) => {
      setBulkResultBanner(
        formatProspectBulkActionResult("send_to_campaign", {
          selected: selectedCount,
          succeeded: 0,
          skipped: 0,
          failed: selectedCount || 1,
          detail: err.message,
        }),
      );
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
    },
  });

  const confirmQueueMutation = useMutation({
    mutationFn: () =>
      fetchJson<{
        preview?: {
          selectedCount?: number;
          willQueue?: number;
          notBulkEligible?: number;
          skips?: unknown[];
        };
        queuedItemIds?: string[];
      }>("/api/growth-tools/prospect-outreach/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...selectionBody,
          preferredChannel: "auto",
          idempotencyKey: `ui-${Date.now()}`,
        }),
      }),
    onSuccess: (data) => {
      const selectedForAction = data.preview?.selectedCount ?? selectedCount;
      const succeeded = data.preview?.willQueue ?? data.queuedItemIds?.length ?? 0;
      const skipped = Math.max(0, selectedForAction - succeeded);
      setBulkResultBanner(
        formatProspectBulkActionResult("send_to_campaign", {
          selected: selectedForAction,
          succeeded,
          skipped,
          failed: 0,
        }),
      );
      setQueuePreviewOpen(false);
      const ids = Array.from(effectiveSelectedIds);
      // Remove from Review pin — do not keep queued rows visible via pin.
      setPinnedVisibleIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      // Patch only on success (not optimistic before confirm).
      patchListRows(ids, (row) => ({
        ...row,
        queueStatus: "queued",
      }));
      clearSelection();
      // Quiet refresh for queue counts — stable order preserves row positions.
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-outreach"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
    },
    onError: (err: Error) => {
      setBulkResultBanner(
        formatProspectBulkActionResult("send_to_campaign", {
          selected: selectedCount,
          succeeded: 0,
          skipped: 0,
          failed: selectedCount || 1,
          detail: err.message,
        }),
      );
      toast({ title: "Queue failed", description: err.message, variant: "destructive" });
    },
  });

  const bulkJob = bulkJobQuery.data?.job;

  return (
    <section
      className={cn(
        "w-full min-w-0",
        props.embedded ? "space-y-2" : "mt-8 space-y-3 border-t pt-6",
      )}
      data-testid="pi-review-panel"
      data-prospect-ai-layout="tab-body"
    >
      {props.embedded ? (
        <div className="space-y-0">
          <h2 className="text-base font-semibold tracking-tight text-gray-900">Review</h2>
          <p className="text-xs text-gray-600">{PROSPECT_AI_PAGE_SUBTITLES.review}</p>
        </div>
      ) : (
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Sparkles className="h-4 w-4 text-brand-green" />
          Prospect AI Intelligence
        </h3>
      )}

      {props.activeAnalysisJob?.status === "running" ? (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-1.5 text-xs text-blue-900">
          <p className="flex items-center gap-2 font-medium">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {jobProgressLabel}
          </p>
        </div>
      ) : null}

      {bulkJob && (bulkJob.status === "running" || bulkJob.status === "pending") ? (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-1.5 text-xs text-blue-900">
          <p className="flex items-center gap-2 font-medium">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            AI is reviewing prospects… {bulkJob.progressCurrent}/{bulkJob.progressTotal}
          </p>
        </div>
      ) : null}

      {props.activeAnalysisJob?.status === "completed" ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-1.5 text-xs text-emerald-900">
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

      {batchActive && activeBatchOption ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-1.5 text-xs text-emerald-900"
          data-testid="pi-batch-banner"
        >
          <div className="min-w-0">
            <p className="font-medium">
              {activeBatchOption.prospectCount}{" "}
              {activeBatchOption.prospectCount === 1 ? "prospect" : "prospects"}
              {activeBatchOption.kind === "discovery" ? " discovered" : ""}
            </p>
            <p className="text-emerald-800">
              {activeBatchOption.label}
              {activeBatchOption.detail ? ` · ${activeBatchOption.detail}` : ""}
            </p>
            <p className="text-emerald-700/80">
              Viewing this {activeBatchOption.kind === "discovery" ? "discovery" : "import batch"}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 text-xs text-emerald-900 hover:bg-emerald-100/60"
            onClick={() => applyBatchFilter("all")}
          >
            Show all prospects
          </Button>
        </div>
      ) : null}

      {/* Dataset filters first — then status tabs within that dataset */}
      <div
        className="flex flex-wrap items-center gap-1.5"
        data-testid="pi-filter-row"
      >
        <Select value={batchFilter} onValueChange={applyBatchFilter}>
          <SelectTrigger className="h-8 w-[200px] max-w-full text-xs" data-testid="pi-batch-filter">
            <SelectValue placeholder="Discovery Batch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All prospects</SelectItem>
            {(batchesQuery.data?.batches ?? []).map((batch) => (
              <SelectItem key={batch.key} value={batch.key}>
                {batch.label}
                {batch.isLatestDiscovery ? " (latest)" : ""}
                {batch.prospectCount > 0 ? ` · ${batch.prospectCount}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="h-8 w-[140px] max-w-full text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="needs_review">Needs review</SelectItem>
          </SelectContent>
        </Select>
        <Select value={businessFilter} onValueChange={setBusinessFilter}>
          <SelectTrigger className="h-8 w-[150px] max-w-full text-xs"><SelectValue placeholder="Segment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All segments</SelectItem>
            <SelectItem value="agency">Agency</SelectItem>
            <SelectItem value="shopify">Shopify</SelectItem>
            <SelectItem value="real_estate">Real Estate</SelectItem>
            <SelectItem value="needs_review">Needs review</SelectItem>
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="h-8 w-[150px] max-w-full text-xs"><SelectValue placeholder="Contact info" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any contact info</SelectItem>
            <SelectItem value="has_email">Has Email</SelectItem>
            <SelectItem value="missing_email">Missing email</SelectItem>
            <SelectItem value="has_phone">Has Phone</SelectItem>
            <SelectItem value="missing_phone">Missing phone</SelectItem>
            <SelectItem value="missing_website">Missing website</SelectItem>
            <SelectItem value="email_eligible">Email eligible</SelectItem>
            <SelectItem value="any_eligible">Any eligible channel</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="h-8 w-[150px] max-w-full text-xs" data-testid="pi-action-status-sort">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="action">Status (default)</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="leadScore">Lead score</SelectItem>
            <SelectItem value="priority">Priority</SelectItem>
            <SelectItem value="confidence">Confidence</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div
        className="flex max-w-full flex-nowrap gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-testid="pi-status-tabs"
        role="tablist"
        aria-label="Review status"
      >
        {PROSPECT_REVIEW_WORK_FILTER_CHIPS.map((chip) => {
          const count = workFilterCounts[chip.id] ?? 0;
          const active = workFilter === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={cn(
                "inline-flex h-6 shrink-0 items-center rounded-md px-2 text-[11px] font-medium transition-colors duration-150",
                active
                  ? "bg-gray-900 text-white"
                  : "bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900",
              )}
              onClick={() => setWorkFilter(chip.id)}
              data-testid={`pi-filter-${chip.id}`}
            >
              {chip.label}
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

      <div
        className="flex flex-col gap-2 rounded-lg border bg-gray-50/70 px-2.5 py-1.5 sm:flex-row sm:flex-wrap sm:items-center"
        data-testid="pi-selection-toolbar"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          {showSelectEntireScope ? (
            <button
              type="button"
              className="h-auto p-0 text-xs font-medium text-brand-green hover:underline disabled:opacity-50"
              disabled={selectAllFilteredMutation.isPending}
              onClick={() => selectAllFilteredMutation.mutate()}
              title={PROSPECT_SELECTION_LABELS.selectAllResultsHint}
              data-testid="pi-select-entire-scope"
            >
              {selectAllFilteredMutation.isPending
                ? "Resolving…"
                : formatProspectSelectAllLabel({
                    count: matchingScopeCount,
                    batchActive,
                  })}
            </button>
          ) : null}
          {selectedCount > 0 ? (
            <button
              type="button"
              className="h-auto p-0 text-xs text-gray-500 hover:text-gray-800 hover:underline"
              onClick={clearSelection}
              data-testid="pi-clear-selection"
            >
              {PROSPECT_SELECTION_LABELS.clearSelection}
            </button>
          ) : null}
          <div className="min-w-0 text-xs text-gray-600">
            <p data-testid="pi-selection-summary" className="font-medium text-gray-800">
              {selectionEligibility.readable.headline}
            </p>
            {selectionEligibility.readable.detail || selectionEligibility.availability.detail ? (
              <p className="text-[11px] text-gray-500" data-testid="pi-selection-detail">
                {selectionEligibility.readable.detail || selectionEligibility.availability.detail}
              </p>
            ) : null}
            {selectionEligibility.availability.reason && selectedCount > 0 && selectionEligibility.canEnrich === 0 && selectionEligibility.qualified === 0 ? (
              <p className="mt-0.5 text-[11px] text-amber-800" data-testid="pi-selection-reason">
                {selectionEligibility.availability.reason}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:ml-auto">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={
              !selectedCount ||
              selectionEligibility.canEnrich === 0 ||
              bulkApproveMutation.isPending
            }
            onClick={() => {
              const idsToEnrich = snapshotEnrichContactIds(effectiveSelectedIds);
              startProspectEnrichment(idsToEnrich);
            }}
            data-testid="pi-enrich"
            title={
              bulkApproveMutation.isPending
                ? "Enrichment jobs are starting…"
                : selectedCount > 0 && selectionEligibility.canEnrich === 0
                  ? selectionEligibility.firstEnrich?.message ||
                    "Selected prospects are not eligible to enrich"
                  : undefined
            }
          >
            {bulkApproveMutation.isPending ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Enriching…
              </>
            ) : (
              <>
                <Check className="mr-1 h-3.5 w-3.5" />{" "}
                {selectionEligibility.retryCount > 0 &&
                selectionEligibility.retryCount === selectionEligibility.canEnrich
                  ? selectionEligibility.canEnrich > 0
                    ? `Retry Enrichment ${selectionEligibility.canEnrich}`
                    : "Retry Enrichment"
                  : selectionEligibility.canEnrich > 0
                    ? `Enrich ${selectionEligibility.canEnrich}`
                    : "Enrich"}
              </>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 bg-brand-green text-xs hover:bg-emerald-700"
            disabled={
              !selectedCount ||
              selectionEligibility.qualified === 0 ||
              previewQueueMutation.isPending
            }
            onClick={() => {
              const qualifiedIds = Array.from(effectiveSelectedIds).filter((id) => {
                const row = rawItems.find((r) => r.contactId === id);
                if (!row) return false;
                return explainQualifiedForCampaign(reviewUxInput(row)).ok;
              });
              previewQueueMutation.mutate(qualifiedIds.length ? qualifiedIds : undefined);
            }}
            data-testid="pi-queue-outreach"
            title={
              selectedCount > 0 && selectionEligibility.qualified === 0
                ? selectionEligibility.firstQualified?.message ||
                  "Selected prospects are not qualified for Campaigns"
                : undefined
            }
          >
            <Mail className="mr-1 h-3.5 w-3.5" />{" "}
            {selectionEligibility.qualified > 0
              ? `Send ${selectionEligibility.qualified} to Campaign`
              : "Send to Campaign"}
          </Button>
        </div>
      </div>

      {bulkResultBanner ? (
        <p className="text-xs text-gray-700" data-testid="pi-bulk-result-banner">
          {bulkResultBanner}
        </p>
      ) : null}

      {items.length === 0 ? (
        <ProspectAiEmptyState data-testid="pi-review-empty">
          <p className="text-sm font-medium text-gray-800">
            {prospectReviewWorkEmptyMessage(workFilter, rawItems.length > 0)}
          </p>
        </ProspectAiEmptyState>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200/80 shadow-sm shadow-gray-900/[0.02]">
          <Table className={PROSPECT_AI_REVIEW_TABLE_CLASS} data-testid="pi-review-table">
            <colgroup>
              <col className={PROSPECT_AI_REVIEW_COLGROUP.checkbox} />
              <col className={PROSPECT_AI_REVIEW_COLGROUP.business} />
              <col className={PROSPECT_AI_REVIEW_COLGROUP.summary} />
              <col className={PROSPECT_AI_REVIEW_COLGROUP.signals} />
              <col className={PROSPECT_AI_REVIEW_COLGROUP.progress} />
            </colgroup>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someVisibleSelected;
                    }}
                    onChange={toggleVisibleHeaderCheckbox}
                    aria-label="Select all rows on this page"
                    className="h-4 w-4 rounded border-gray-300"
                    data-testid="pi-header-select-visible"
                    title={PROSPECT_SELECTION_LABELS.selectPageHint}
                  />
                </TableHead>
                <TableHead>Business</TableHead>
                <TableHead>AI summary</TableHead>
                <TableHead>Signals</TableHead>
                <TableHead className={PROSPECT_AI_PROGRESS_COL_CLASS}>Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => {
                const intel = row.intelligence;
                const ux = reviewUxInput(row);
                const life = resolveProspectReviewLifecycle(ux);
                const analyzing =
                  analysisBusy(intel.analysisStatus) &&
                  String(intel.analysisStatus).toLowerCase() === "processing";
                const waitingAnalyze =
                  String(intel.analysisStatus || "pending").toLowerCase() === "pending";
                const enriching = enrichmentBusy(intel.enrichmentStatus);
                const flashMsg = rowFlash[row.contactId];
                const reviewReady = isProspectQualificationComplete(intel.analysisStatus);
                const presentation = resolveProspectReviewPresentation(ux);
                const needsReviewBadge = presentation.rowBadge;
                const rowDecisionQualified = presentation.decisionQualified;
                const rowSummary = buildProspectRowAiSummary({
                  analysisStatus: intel.analysisStatus,
                  leadScore: intel.leadScore,
                  // Use sanitized display priority (null = suppress stale needs_review).
                  priority: presentation.displayPriority,
                  businessType: intel.businessType,
                  recommendedOffer: intel.recommendedOffer,
                  suggestedOutreachAngle: intel.suggestedOutreachAngle,
                  reasoningSummary: intel.reasoningSummary,
                  decisionQualified: rowDecisionQualified,
                  reviewStatus: intel.reviewStatus,
                  approvedAt: intel.approvedAt,
                  notQualified: ux.notQualified,
                });
                const personality = resolveAiPersonalityStatus({
                  ux,
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
                    <TableCell className="min-w-0">
                      <div className="font-medium text-gray-900 transition-colors">{row.name}</div>
                      {row.company ? (
                        <div className="truncate text-xs text-gray-500">
                          {row.company}
                        </div>
                      ) : null}
                      {needsReviewBadge ? (
                        <NeedsReviewReasonBadge
                          badge={needsReviewBadge}
                          detail={resolveProspectNeedsReviewBadgeDetail(ux, needsReviewBadge)}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className="min-w-0">
                      {analyzing ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-gray-400">Reviewing…</span>
                          <ProspectWebsiteGlobeIcon
                            websiteUrl={row.websiteUrl}
                            websiteUrlUsed={intel.websiteUrlUsed}
                          />
                        </div>
                      ) : waitingAnalyze ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-gray-400">Queued…</span>
                          <ProspectWebsiteGlobeIcon
                            websiteUrl={row.websiteUrl}
                            websiteUrlUsed={intel.websiteUrlUsed}
                          />
                        </div>
                      ) : rowSummary.showSummary ? (
                        <div className="space-y-0.5" data-testid={`pi-row-summary-${row.contactId}`}>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs leading-tight">
                            <MatchStars stars={rowSummary.matchStars} />
                            <span className="font-medium text-gray-900">{rowSummary.matchLabel}</span>
                            {priorityBadge(rowSummary.priority || undefined, intel.analysisStatus, {
                              decisionQualified: rowDecisionQualified,
                            })}
                            <ProspectWebsiteGlobeIcon
                              websiteUrl={row.websiteUrl}
                              websiteUrlUsed={intel.websiteUrlUsed}
                            />
                          </div>
                          {rowSummary.businessType ? (
                            <p className="truncate text-xs leading-tight text-gray-600">
                              {rowSummary.businessType}
                            </p>
                          ) : null}
                          {rowSummary.offerLabel ? (
                            <p className="truncate text-xs leading-tight text-gray-700">
                              {rowSummary.offerLabel}
                            </p>
                          ) : null}
                          {rowSummary.angle ? (
                            <p className="line-clamp-1 text-xs leading-tight text-gray-500">
                              {rowSummary.angle}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <ProspectWebsiteGlobeIcon
                            websiteUrl={row.websiteUrl}
                            websiteUrlUsed={intel.websiteUrlUsed}
                          />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="min-w-0 align-top">
                      {(() => {
                        const signals: Array<{ ok: boolean; label: string }> = [];
                        if (emailFound) signals.push({ ok: true, label: "Email" });
                        if (phoneFound) signals.push({ ok: true, label: "Phone" });
                        if (socialFound) signals.push({ ok: true, label: "Social" });
                        if (signals.length === 0) return null;
                        return (
                          <div className="flex flex-col gap-0.5">
                            {signals.map((s) => (
                              <VerifiedChip key={s.label} ok={s.ok} label={s.label} />
                            ))}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className={PROSPECT_AI_PROGRESS_COL_CLASS}>
                      <div className="flex min-w-0 flex-col gap-1">
                        {(() => {
                          const progress = resolveProspectProgressState({
                            analysisStatus: intel.analysisStatus,
                            enrichmentStatus: intel.enrichmentStatus,
                            reviewStatus: intel.reviewStatus,
                            queueStatus: row.queueStatus,
                            outreachStatus: intel.outreachStatus,
                            email: row.email,
                            websiteUrl: row.websiteUrl,
                            priorOutreachDetected: row.priorOutreachDetected,
                            decision: presentation.decision,
                            notQualified: ux.notQualified === true,
                            readyForCampaign: presentation.campaignReady,
                          });
                          return (
                            <span
                              className={cn(
                                "text-[11px] font-medium",
                                progress.code === "failed" && "text-red-600",
                                (progress.code === "reviewing" || progress.code === "enriching") &&
                                  "text-emerald-800",
                                progress.code !== "failed" &&
                                  progress.code !== "reviewing" &&
                                  progress.code !== "enriching" &&
                                  "text-gray-700",
                              )}
                              data-testid={`pi-progress-state-${progress.code}`}
                            >
                              {progress.label}
                            </span>
                          );
                        })()}
                        <ProspectProgressTimeline ux={ux} />
                        {showActivity && (analyzing || enriching) ? (
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
        <DialogContent data-testid="pi-send-campaign-dialog">
          <DialogHeader>
            <DialogTitle>Send to Campaign</DialogTitle>
            <DialogDescription className="sr-only">
              Confirm sending selected prospects to Campaigns
            </DialogDescription>
          </DialogHeader>
          {queuePreview ? (
            <div className="space-y-3 text-sm" data-testid="pi-send-campaign-summary">
              <p>
                <strong>{queuePreview.selectedCount}</strong> selected
              </p>
              {queuePreview.willQueue > 0 ? (
                <p className="text-emerald-800" data-testid="pi-send-campaign-ready">
                  ✓ {queuePreview.willQueue} ready for Campaign
                </p>
              ) : null}
              {queuePreview.skips.length > 0 ? (
                <div className="space-y-1.5" data-testid="pi-send-campaign-skips">
                  <p className="text-amber-800">
                    ⚠ {queuePreview.skips.length} won&apos;t be sent
                  </p>
                  <p className="text-xs font-medium text-gray-600">Not being sent:</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-gray-700">
                    {groupCampaignSkipReasons(queuePreview.skips).map((g) => (
                      <li key={g.label}>
                        {g.count} {g.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {queuePreview.willQueue > 0 ? (
                <p className="text-xs text-gray-600" data-testid="pi-send-campaign-confirm-copy">
                  {formatSendToCampaignConfirmCopy(queuePreview.willQueue)}
                </p>
              ) : null}
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
              Send {queuePreview?.willQueue ?? 0} to Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProspectIntelligenceDetailDialog
        item={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onItemUpdated={(next) => {
          setSelected(next);
          patchListRows([next.contactId], () => next);
        }}
        onQualificationChanged={(decision) => {
          if (decision === "qualified") setWorkFilter("qualified");
          else if (decision === "not_qualified") setWorkFilter("not_qualified");
          else setWorkFilter("needs_review");
        }}
        onStartEnrichment={startProspectEnrichment}
        enrichPending={bulkApproveMutation.isPending}
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
