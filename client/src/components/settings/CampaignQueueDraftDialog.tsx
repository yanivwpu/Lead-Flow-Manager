import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Pencil, Eye, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import type { ProspectOutreachQueueItemDetail } from "@shared/prospectBulkOutreach";
import { isCampaignDraftEditable } from "@shared/prospectCampaignDraftTokens";
import { prospectCampaignQueueStatusLabel } from "@shared/prospectAiDisplay";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}

type Props = {
  itemId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
};

export function CampaignQueueDraftDialog({
  itemId,
  open,
  onOpenChange,
  onChanged,
}: Props) {
  const [detail, setDetail] = useState<ProspectOutreachQueueItemDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editMessage, setEditMessage] = useState("");

  useEffect(() => {
    if (!open || !itemId) {
      setDetail(null);
      setEditing(false);
      setPreviewing(false);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void fetchJson<{ item: ProspectOutreachQueueItemDetail }>(
      `/api/growth-tools/prospect-outreach/queue/${itemId}`,
    )
      .then((data) => {
        if (cancelled) return;
        setDetail(data.item);
        setEditSubject(data.item.subjectSnapshot || "");
        setEditMessage(data.item.messageSnapshot || "");
        setEditing(false);
        setPreviewing(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setLoadError(err.message || "Failed to load draft");
        setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, itemId]);

  const editable = detail ? isCampaignDraftEditable(detail.queueStatus) : false;

  const saveMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ item: ProspectOutreachQueueItemDetail }>(
        `/api/growth-tools/prospect-outreach/queue/${itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject: editSubject, message: editMessage }),
        },
      ),
    onSuccess: (data) => {
      setDetail(data.item);
      setEditSubject(data.item.subjectSnapshot || "");
      setEditMessage(data.item.messageSnapshot || "");
      setEditing(false);
      toast({ title: "Draft saved" });
      onChanged();
    },
    onError: (err: Error) =>
      toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const regenerateMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ item: ProspectOutreachQueueItemDetail; rewritten: number; failed: number }>(
        `/api/growth-tools/prospect-outreach/queue/${itemId}/regenerate`,
        { method: "POST" },
      ),
    onSuccess: (data) => {
      setDetail(data.item);
      setEditSubject(data.item.subjectSnapshot || "");
      setEditMessage(data.item.messageSnapshot || "");
      setEditing(false);
      if (data.rewritten > 0) {
        toast({ title: "Draft regenerated from Campaign AI guidance" });
      } else if (data.failed > 0) {
        toast({
          title: "Regenerate failed",
          description: "AI could not rewrite this draft. Try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Nothing to regenerate",
          description: "Draft may be empty or not editable.",
        });
      }
      onChanged();
    },
    onError: (err: Error) =>
      toast({ title: "Regenerate failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ removed: boolean; reason: string }>(
        `/api/growth-tools/prospect-outreach/queue/${itemId}/remove`,
        { method: "POST" },
      ),
    onSuccess: (data) => {
      if (!data.removed) {
        toast({
          title: "Could not delete draft",
          description: data.reason,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Draft removed from campaign" });
      onOpenChange(false);
      onChanged();
    },
    onError: (err: Error) =>
      toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const subject = editing ? editSubject : detail?.subjectSnapshot || "";
  const body = editing ? editMessage : detail?.messageSnapshot || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] w-[calc(100vw-1.25rem)] max-w-2xl overflow-y-auto overscroll-contain sm:w-full"
        data-testid="po-draft-dialog"
      >
        <DialogHeader>
          <DialogTitle className="pr-8">
            {detail?.prospectName || "Campaign draft"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading draft…
          </div>
        ) : loadError ? (
          <p className="py-6 text-sm text-red-600">{loadError}</p>
        ) : detail ? (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {prospectCampaignQueueStatusLabel(detail.queueStatus)}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {detail.selectedChannel}
              </Badge>
              {detail.recommendedOffer ? (
                <Badge variant="secondary">{detail.recommendedOffer}</Badge>
              ) : null}
            </div>

            <div
              className="rounded-lg border border-gray-100 bg-gray-50/80 p-3"
              data-testid="po-draft-prospect-info"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Prospect
              </p>
              <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-gray-500">Name</dt>
                  <dd className="text-gray-900">{detail.prospectName || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Recipient</dt>
                  <dd className="break-all text-gray-900">{detail.recipientIdentity || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Company</dt>
                  <dd className="text-gray-900">{detail.companyName || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Industry</dt>
                  <dd className="text-gray-900">
                    {detail.industry || detail.businessType || "—"}
                  </dd>
                </div>
                {detail.website ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-gray-500">Website</dt>
                    <dd className="break-all text-gray-900">{detail.website}</dd>
                  </div>
                ) : null}
                {detail.outreachAngle ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-gray-500">Outreach angle</dt>
                    <dd className="text-gray-900">{detail.outreachAngle}</dd>
                  </div>
                ) : null}
              </dl>
            </div>

            {detail.reasoningSummary ? (
              <div data-testid="po-draft-ai-summary">
                <p className="font-medium text-gray-900">AI summary</p>
                <p className="mt-1 whitespace-pre-wrap text-gray-700">
                  {detail.reasoningSummary}
                </p>
              </div>
            ) : null}

            <div data-testid="po-draft-tokens">
              <p className="font-medium text-gray-900">Personalization tokens</p>
              {detail.personalizationTokens.length > 0 ? (
                <div
                  className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5"
                  data-testid="po-draft-tokens-warning"
                >
                  <p className="text-xs font-medium text-amber-950">
                    Unresolved tokens — fix before sending or recipients may see placeholders.
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {detail.personalizationTokens.map((token) => (
                      <Badge key={token} variant="outline" className="font-mono text-[11px]">
                        {`{{${token}}}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-xs text-gray-500">
                  No unresolved tokens — draft is fully personalized.
                </p>
              )}
            </div>

            {previewing ? (
              <div
                className="rounded-lg border border-violet-100 bg-violet-50/40 p-3"
                data-testid="po-draft-preview"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                  Preview
                </p>
                <p className="mt-2 font-medium text-gray-900">{subject || "(no subject)"}</p>
                <p className="mt-2 whitespace-pre-wrap text-gray-800">{body || "(empty)"}</p>
              </div>
            ) : (
              <>
                <div>
                  <p className="font-medium text-gray-900">Subject</p>
                  {editing ? (
                    <Input
                      className="mt-1.5"
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                      data-testid="po-draft-subject-input"
                    />
                  ) : (
                    <p className="mt-1 text-gray-800" data-testid="po-draft-subject">
                      {detail.subjectSnapshot || "—"}
                    </p>
                  )}
                </div>
                <div>
                  <p className="font-medium text-gray-900">Email body</p>
                  {editing ? (
                    <Textarea
                      className="mt-1.5"
                      rows={10}
                      value={editMessage}
                      onChange={(e) => setEditMessage(e.target.value)}
                      data-testid="po-draft-body-input"
                    />
                  ) : (
                    <p
                      className="mt-1 whitespace-pre-wrap text-gray-800"
                      data-testid="po-draft-body"
                    >
                      {detail.messageSnapshot || "—"}
                    </p>
                  )}
                </div>
              </>
            )}

            <div
              className="flex flex-wrap gap-2 border-t pt-3"
              data-testid="po-draft-actions"
            >
              {editable && !editing ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPreviewing(false);
                    setEditing(true);
                  }}
                  data-testid="po-draft-edit"
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit draft
                </Button>
              ) : null}
              {editable && editing ? (
                <Button
                  type="button"
                  size="sm"
                  className="bg-brand-green hover:bg-emerald-700"
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                  data-testid="po-draft-save"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Save
                </Button>
              ) : null}
              {editable && editing ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditSubject(detail.subjectSnapshot || "");
                    setEditMessage(detail.messageSnapshot || "");
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPreviewing((v) => !v)}
                data-testid="po-draft-preview-toggle"
              >
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                {previewing ? "Hide preview" : "Preview"}
              </Button>
              {editable ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={regenerateMutation.isPending}
                  onClick={() => regenerateMutation.mutate()}
                  data-testid="po-draft-regenerate"
                >
                  {regenerateMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Regenerate this draft
                </Button>
              ) : null}
              {editable ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    const ok = window.confirm(
                      "Delete this draft from the campaign?\n\nAlready Sent items cannot be deleted.",
                    );
                    if (!ok) return;
                    deleteMutation.mutate();
                  }}
                  data-testid="po-draft-delete"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete draft
                </Button>
              ) : null}
              {!editable ? (
                <p className="w-full text-xs text-gray-500" data-testid="po-draft-readonly">
                  This draft is read-only (already sending or sent).
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
