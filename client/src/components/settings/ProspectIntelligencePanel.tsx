import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  Check,
  Loader2,
  Mail,
  Pencil,
  RefreshCw,
  Sparkles,
  AlertTriangle,
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
  ProspectIntelligenceDashboardCounts,
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
import { format } from "date-fns";

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
  });

  const displayStatus = resolveProspectDisplayStatus({
    reviewStatus: intel?.reviewStatus,
    outreachStatus: intel?.outreachStatus,
    outreachSentAt: intel?.outreachSentAt,
    repliedAt: intel?.repliedAt,
  });

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
    void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
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
    onSuccess: (data) => {
      if (data.item) {
        applyItemUpdate(data.item);
        setEditMessage(data.item.intelligence?.suggestedFirstMessage || editMessage);
      } else {
        void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
      }
      toast({ title: "AI result approved" });
    },
    onError: (err: Error) => {
      toast({ title: "Approve failed", description: err.message, variant: "destructive" });
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
            Internal Prospect Intelligence — {item.batchName || "Imported batch"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
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
            <p><span className="text-gray-500">Import tag:</span> {item.importTag || "—"}</p>
            <p><span className="text-gray-500">Import reason:</span> {item.importReason || "—"}</p>
            <p><span className="text-gray-500">Pipeline:</span> {item.pipelineStage || "—"}</p>
            <p><span className="text-gray-500">Confidence:</span> {intel.confidence ?? "—"}</p>
            <p data-testid="pi-review-status">
              <span className="text-gray-500">Review status:</span>{" "}
              <span className={approveUi.isApproved ? "font-medium text-emerald-700" : ""}>
                {intel.reviewStatus || "pending"}
              </span>
            </p>
            <p data-testid="pi-display-status">
              <span className="text-gray-500">Status:</span>{" "}
              <span className="font-medium">{prospectDisplayStatusLabel(displayStatus)}</span>
            </p>
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
          </div>

          <div>
            <p className="font-medium text-gray-900">Internal reasoning</p>
            <p className="mt-1 text-gray-600">{intel.reasoningSummary || "—"}</p>
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
}) {
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [businessFilter, setBusinessFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"leadScore" | "priority" | "confidence" | "name">("leadScore");
  const [selected, setSelected] = useState<ProspectIntelligenceListItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);
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
  const queryClient = useQueryClient();

  const dashboardQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-intelligence/dashboard"],
    queryFn: () => fetchJson<ProspectIntelligenceDashboardCounts>("/api/growth-tools/prospect-intelligence/dashboard"),
    refetchInterval: props.activeAnalysisJob?.status === "running" || bulkAnalysisJobId ? 2000 : false,
  });

  const listQuery = useQuery({
    queryKey: [
      "/api/growth-tools/prospect-intelligence",
      priorityFilter,
      businessFilter,
      statusFilter,
      channelFilter,
      sortBy,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (businessFilter !== "all" && businessFilter !== "needs_review") params.set("segment", businessFilter);
      if (businessFilter === "needs_review") params.set("needsReviewOnly", "true");
      if (statusFilter !== "all") params.set("statusFilter", statusFilter);
      if (channelFilter === "has_email") params.set("hasEmail", "true");
      if (channelFilter === "has_phone") params.set("hasPhone", "true");
      if (channelFilter === "email_eligible") params.set("emailEligible", "true");
      if (channelFilter === "any_eligible") params.set("anyEligibleChannel", "true");
      params.set("sortBy", sortBy);
      params.set("sortDir", sortBy === "name" ? "asc" : "desc");
      params.set("limit", "500");
      return fetchJson<{ items: ProspectIntelligenceListItem[] }>(
        `/api/growth-tools/prospect-intelligence?${params.toString()}`,
      );
    },
    refetchInterval: props.activeAnalysisJob?.status === "running" || bulkAnalysisJobId ? 2000 : false,
  });

  const bulkJobQuery = useQuery({
    queryKey: ["/api/growth-tools/prospect-intelligence/bulk-analyze", bulkAnalysisJobId],
    queryFn: () =>
      fetchJson<{ job: { id: string; status: string; progressCurrent: number; progressTotal: number; completed: number; failed: number; skipped: number; needsReview: number } }>(
        `/api/growth-tools/prospect-intelligence/bulk-analyze/${bulkAnalysisJobId}`,
      ),
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
      if (job.status === "completed") {
        toast({
          title: "Bulk analysis complete",
          description: `${job.completed} analyzed, ${job.skipped} skipped, ${job.failed} failed, ${job.needsReview} needs review`,
        });
      }
      setBulkAnalysisJobId(null);
    }
  }, [bulkJobQuery.data?.job?.status]);

  const counts = dashboardQuery.data;
  const items = listQuery.data?.items ?? [];

  const jobProgressLabel = useMemo(() => {
    const job = props.activeAnalysisJob;
    if (!job || job.status !== "running") return null;
    return `Analyzing prospects… ${job.progressCurrent} / ${job.progressTotal}`;
  }, [props.activeAnalysisJob]);

  const effectiveSelectedIds = useMemo(() => {
    if (selectAllFiltered) return new Set(items.map((i) => i.contactId));
    return selectedIds;
  }, [selectAllFiltered, items, selectedIds]);

  const toggleRow = (contactId: string, e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setSelectAllFiltered(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const selectVisible = () => {
    setSelectAllFiltered(false);
    setSelectedIds(new Set(items.map((i) => i.contactId)));
  };

  const clearSelection = () => {
    setSelectAllFiltered(false);
    setSelectedIds(new Set());
  };

  const selectedCount = effectiveSelectedIds.size;
  const selectedContactIds = Array.from(effectiveSelectedIds);

  const bulkAnalyzeMutation = useMutation({
    mutationFn: (opts: { allFiltered?: boolean }) =>
      fetchJson<{ job: { id: string } }>("/api/growth-tools/prospect-intelligence/bulk-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          opts.allFiltered
            ? {
                allFiltered: true,
                filters: {
                  ...(priorityFilter !== "all" ? { priority: priorityFilter } : {}),
                  ...(businessFilter !== "all" && businessFilter !== "needs_review"
                    ? { segment: businessFilter }
                    : {}),
                  ...(businessFilter === "needs_review" ? { needsReviewOnly: true } : {}),
                  ...(statusFilter !== "all" ? { statusFilter } : {}),
                  ...(channelFilter === "has_email" ? { hasEmail: true } : {}),
                  ...(channelFilter === "has_phone" ? { hasPhone: true } : {}),
                  ...(channelFilter === "email_eligible" ? { emailEligible: true } : {}),
                  ...(channelFilter === "any_eligible" ? { anyEligibleChannel: true } : {}),
                },
              }
            : { contactIds: selectedContactIds },
        ),
      }),
    onSuccess: (data) => {
      setBulkAnalysisJobId(data.job.id);
      toast({ title: "Bulk analysis queued" });
    },
    onError: (err: Error) =>
      toast({ title: "Analyze failed", description: err.message, variant: "destructive" }),
  });

  const bulkApproveMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ approved: number; skipped: unknown[] }>(
        "/api/growth-tools/prospect-intelligence/bulk-approve",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactIds: selectedContactIds }),
        },
      ),
    onSuccess: (data) => {
      toast({
        title: `Approved ${data.approved}`,
        description: data.skipped.length ? `${data.skipped.length} skipped` : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
      clearSelection();
    },
    onError: (err: Error) =>
      toast({ title: "Bulk approve failed", description: err.message, variant: "destructive" }),
  });

  const bulkNeedsReviewMutation = useMutation({
    mutationFn: () =>
      fetchJson("/api/growth-tools/prospect-intelligence/bulk-needs-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: selectedContactIds }),
      }),
    onSuccess: () => {
      toast({ title: "Marked needs review" });
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
      clearSelection();
    },
  });

  const previewQueueMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ preview: typeof queuePreview }>(
        "/api/growth-tools/prospect-outreach/queue/preview",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactIds: selectedContactIds, preferredChannel: "auto" }),
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
          contactIds: selectedContactIds,
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
      clearSelection();
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-outreach"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
    },
    onError: (err: Error) =>
      toast({ title: "Queue failed", description: err.message, variant: "destructive" }),
  });

  const bulkJob = bulkJobQuery.data?.job;

  return (
    <section className="mt-10 space-y-5 border-t pt-8">
      <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
        <Sparkles className="h-4 w-4 text-brand-green" />
        Prospect AI Intelligence
      </h3>
      <p className="text-sm text-gray-600">
        Classify imported prospects, score fit, draft personalized outreach, then approve in batches
        and queue controlled Email sends. Manual one-contact send remains available.
      </p>

      {props.activeAnalysisJob?.status === "running" ? (
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
          <p className="flex items-center gap-2 font-medium">
            <Loader2 className="h-4 w-4 animate-spin" />
            {jobProgressLabel}
          </p>
        </div>
      ) : null}

      {bulkJob && (bulkJob.status === "running" || bulkJob.status === "pending") ? (
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
          <p className="flex items-center gap-2 font-medium">
            <Loader2 className="h-4 w-4 animate-spin" />
            Bulk analyzing… {bulkJob.progressCurrent} / {bulkJob.progressTotal}
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="needs_review">Needs Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="outreach_sent">Outreach Sent</SelectItem>
            <SelectItem value="replied">Replied</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Channel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any contact info</SelectItem>
            <SelectItem value="has_email">Has Email</SelectItem>
            <SelectItem value="has_phone">Has Phone</SelectItem>
            <SelectItem value="email_eligible">Email eligible</SelectItem>
            <SelectItem value="any_eligible">Any eligible channel</SelectItem>
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

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-gray-50/80 p-3">
        <Button type="button" size="sm" variant="outline" onClick={selectVisible}>
          Select visible ({items.length})
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setSelectAllFiltered(true);
            setSelectedIds(new Set());
          }}
        >
          Select all filtered
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
          Clear
        </Button>
        <span className="text-sm text-gray-600">{selectedCount} selected</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selectedCount || bulkAnalyzeMutation.isPending}
            onClick={() => bulkAnalyzeMutation.mutate({ allFiltered: selectAllFiltered })}
          >
            <Brain className="mr-1 h-3.5 w-3.5" /> Analyze with AI
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selectedCount || bulkApproveMutation.isPending}
            onClick={() => bulkApproveMutation.mutate()}
          >
            <Check className="mr-1 h-3.5 w-3.5" /> Approve selected
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selectedCount || bulkNeedsReviewMutation.isPending}
            onClick={() => bulkNeedsReviewMutation.mutate()}
          >
            Needs Review
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-brand-green hover:bg-emerald-700"
            disabled={!selectedCount || previewQueueMutation.isPending}
            onClick={() => previewQueueMutation.mutate()}
            data-testid="pi-queue-outreach"
          >
            <Mail className="mr-1 h-3.5 w-3.5" /> Queue for outreach
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">No AI-analyzed prospects yet. Run Analyze with AI on an import batch.</p>
      ) : (
        <div className="overflow-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
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
                  <TableCell onClick={(e) => toggleRow(row.contactId, e)}>
                    <input
                      type="checkbox"
                      checked={effectiveSelectedIds.has(row.contactId)}
                      onChange={() => {}}
                      aria-label={`Select ${row.name}`}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.intelligence.businessType || "—"}</TableCell>
                  <TableCell>{row.intelligence.leadScore ?? "—"}</TableCell>
                  <TableCell>{priorityBadge(row.intelligence.priority)}</TableCell>
                  <TableCell className="max-w-[140px] truncate">{offerLabel(row.intelligence.recommendedOffer)}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{row.intelligence.suggestedOutreachAngle || "—"}</TableCell>
                  <TableCell>
                    {(() => {
                      const status = resolveProspectDisplayStatus({
                        reviewStatus: row.intelligence.reviewStatus,
                        outreachStatus: row.intelligence.outreachStatus,
                        outreachSentAt: row.intelligence.outreachSentAt,
                        repliedAt: row.intelligence.repliedAt,
                      });
                      if (status === "replied") {
                        return (
                          <Badge className="bg-blue-600 text-[10px]" data-testid="pi-table-replied">
                            Replied
                          </Badge>
                        );
                      }
                      if (status === "outreach_sent") {
                        return (
                          <Badge className="bg-indigo-600 text-[10px]" data-testid="pi-table-outreach-sent">
                            Outreach Sent
                          </Badge>
                        );
                      }
                      if (status === "approved") {
                        return (
                          <Badge className="bg-emerald-600 text-[10px]" data-testid="pi-table-approved">
                            Approved
                          </Badge>
                        );
                      }
                      if (status === "needs_review" || row.intelligence.needsReview) {
                        return (
                          <span className="flex items-center gap-1 text-amber-700 text-xs">
                            <AlertTriangle className="h-3 w-3" /> Needs Review
                          </span>
                        );
                      }
                      return (
                        <span className="text-xs text-gray-500">
                          {prospectDisplayStatusLabel(status)}
                        </span>
                      );
                    })()}
                  </TableCell>
                </TableRow>
              ))}
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

export { AnalyzeConfirmDialog };
