import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  extractPlaceholderKeysFromCampaignMessages,
  parsePresetCampaignMessagesArray,
} from "@shared/campaignPlaceholders";
import { getPresetCampaignStatusLabel } from "@shared/presetCampaignLabels";
import { getLocalizedPresetDisplayName } from "@shared/localizedTemplates";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

export type SavedCampaignDetailShape = {
  id: string;
  name: string;
  sourcePresetId: string;
  status: string;
  statusLabel: string;
  channel: string;
  language?: string | null;
  category?: string | null;
  industry?: string | null;
  messages: unknown[];
  delays?: unknown[];
  placeholders?: unknown[];
  placeholderDefaults?: Record<string, unknown> | null;
  aiEnabled?: boolean | null;
  createdAt?: string;
  updatedAt?: string;
  totalSteps?: number;
  /** Mirrors list API when present */
  stepCount?: number;
  executionStats?: {
    enrollmentCount: number;
    activeEnrollments: number;
    completedEnrollments: number;
    sentStepEvents: number;
    failedStepEvents: number;
  };
  enrollments?: Array<{
    id: string;
    status: string;
    currentStepIndex: number;
    nextRunAt?: string | null;
    contactId: string;
    contactName?: string;
    createdAt?: string | null;
    totalSteps?: number;
  }>;
  recentStepEvents?: Array<{
    id: string;
    stepIndex: number;
    status: string;
    sentAt?: string | null;
    errorMessage?: string | null;
    createdAt?: string | null;
    contactId: string;
  }>;
};

type CampaignDraft = {
  name: string;
  status: string;
  channel: string;
  language: string;
  category: string;
  industry: string;
  aiEnabled: boolean;
  messages: Array<{ delay: string; content: string; type: string }>;
  placeholderDefaults: Record<string, string>;
};

const CAMPAIGN_CHANNEL_OPTIONS = [
  "whatsapp",
  "instagram",
  "facebook",
  "sms",
  "telegram",
  "webchat",
] as const;

const CAMPAIGN_STATUS_OPTIONS = [
  "draft",
  "active_pending",
  "active",
  "paused",
  "completed",
] as const;

function detailToDraft(d: SavedCampaignDetailShape): CampaignDraft {
  const msgs = parsePresetCampaignMessagesArray(d.messages);
  const normalized = msgs.map((raw, i) => {
    const m = raw as { delay?: string; content?: string; type?: string };
    const delay =
      Array.isArray(d.delays) && d.delays[i] != null
        ? String(d.delays[i])
        : String(m.delay ?? "0");
    return {
      delay: delay.trim() || "0",
      content: typeof m.content === "string" ? m.content : "",
      type: typeof m.type === "string" ? m.type : "text",
    };
  });
  const defaults: Record<string, string> = {};
  if (d.placeholderDefaults && typeof d.placeholderDefaults === "object") {
    for (const [k, v] of Object.entries(d.placeholderDefaults)) {
      defaults[k] = v == null ? "" : String(v);
    }
  }
  return {
    name: d.name,
    status: d.status,
    channel: d.channel || "whatsapp",
    language: d.language ?? "en",
    category: d.category ?? "",
    industry: d.industry ?? "",
    aiEnabled: !!d.aiEnabled,
    messages:
      normalized.length > 0 ? normalized : [{ delay: "0", content: "", type: "text" }],
    placeholderDefaults: defaults,
  };
}

function buildSaveBody(d: CampaignDraft, status: string): Record<string, unknown> {
  return {
    name: d.name.trim(),
    status,
    channel: d.channel,
    language: d.language.trim() || "en",
    category: d.category.trim() || undefined,
    industry: d.industry.trim() || undefined,
    aiEnabled: d.aiEnabled,
    messages: d.messages.map((m) => ({
      delay: (m.delay || "0").trim(),
      content: m.content,
      type: m.type || "text",
    })),
    placeholderDefaults: d.placeholderDefaults,
  };
}

function placeholdersInText(content: string): string[] {
  const keys = new Set<string>();
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    keys.add(m[1].trim());
  }
  return Array.from(keys);
}

function placeholderKeysForDraft(draft: CampaignDraft): string[] {
  const fromMsgs = extractPlaceholderKeysFromCampaignMessages(
    draft.messages.map((s) => ({ content: s.content }))
  );
  const fromObj = Object.keys(draft.placeholderDefaults);
  return [...new Set([...fromMsgs, ...fromObj])].sort();
}

function enrollmentLabel(status: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function enrollmentMetaClass(status: string): string {
  switch (status) {
    case "active":
      return "text-emerald-800";
    case "paused":
      return "text-amber-800";
    case "failed":
      return "text-red-700";
    case "completed":
      return "text-gray-600";
    case "cancelled":
      return "text-gray-500";
    default:
      return "text-gray-700";
  }
}

type Props = {
  savedCampaignModalOpen: boolean;
  setSavedCampaignModalOpen: (open: boolean) => void;
  savedCampaignModalId: string | null;
  setSavedCampaignModalId: (id: string | null) => void;
  savedCampaignOpenInEditMode: boolean;
  onConsumedOpenInEditMode: () => void;
  savedCampaignDetail: SavedCampaignDetailShape | undefined;
  savedCampaignDetailLoading: boolean;
  pendingDeleteCampaignId: string | null;
  setPendingDeleteCampaignId: (id: string | null) => void;
  patchPresetCampaignMutation: {
    isPending: boolean;
    mutate: (
      vars: { id: string; body: Record<string, unknown> },
      opts?: { onSuccess?: () => void }
    ) => void;
  };
  duplicatePresetCampaignMutation: {
    isPending: boolean;
    mutate: (id: string) => void;
  };
  deletePresetCampaignMutation: {
    isPending: boolean;
    mutate: (id: string) => void;
  };
  enrollmentMutation: {
    isPending: boolean;
    mutate: (
      vars: { enrollmentId: string; action: "pause" | "resume" | "cancel" | "retry" },
      opts?: { onSuccess?: () => void }
    ) => void;
  };
};

export function SavedPresetCampaignModals(props: Props) {
  const {
    savedCampaignModalOpen,
    setSavedCampaignModalOpen,
    savedCampaignModalId,
    setSavedCampaignModalId,
    savedCampaignOpenInEditMode,
    onConsumedOpenInEditMode,
    savedCampaignDetail,
    savedCampaignDetailLoading,
    pendingDeleteCampaignId,
    setPendingDeleteCampaignId,
    patchPresetCampaignMutation,
    duplicatePresetCampaignMutation,
    deletePresetCampaignMutation,
    enrollmentMutation,
  } = props;

  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<CampaignDraft | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const viewDraft = savedCampaignDetail ? detailToDraft(savedCampaignDetail) : null;
  const displayDraft = isEditing ? draft : viewDraft;

  useEffect(() => {
    if (!savedCampaignModalOpen || !savedCampaignDetail || !savedCampaignOpenInEditMode) return;
    setDraft(detailToDraft(savedCampaignDetail));
    setIsEditing(true);
    onConsumedOpenInEditMode();
  }, [savedCampaignModalOpen, savedCampaignDetail?.id, savedCampaignOpenInEditMode, onConsumedOpenInEditMode]);

  useEffect(() => {
    if (!savedCampaignModalOpen) {
      setIsEditing(false);
      setDraft(null);
      setHistoryOpen(false);
    }
  }, [savedCampaignModalOpen]);

  const activeEnrollments = useMemo(() => {
    const list = savedCampaignDetail?.enrollments ?? [];
    return list.filter((e) => ["active", "paused", "failed"].includes(e.status));
  }, [savedCampaignDetail?.enrollments]);

  const historyEnrollments = useMemo(() => {
    const list = savedCampaignDetail?.enrollments ?? [];
    return list.filter((e) => ["completed", "cancelled"].includes(e.status));
  }, [savedCampaignDetail?.enrollments]);

  const inflightEnrollmentCount = useMemo(() => {
    const list = savedCampaignDetail?.enrollments ?? [];
    return list.filter((e) => ["active", "paused", "failed"].includes(e.status)).length;
  }, [savedCampaignDetail?.enrollments]);

  const stepEditWarning = isEditing && inflightEnrollmentCount > 0;

  const startEdit = () => {
    if (!savedCampaignDetail) return;
    setDraft(detailToDraft(savedCampaignDetail));
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setDraft(null);
  };

  const commitDraft = (nextStatus: string) => {
    if (!savedCampaignModalId || !draft) return;
    patchPresetCampaignMutation.mutate(
      {
        id: savedCampaignModalId,
        body: buildSaveBody(draft, nextStatus),
      },
      {
        onSuccess: () => {
          setIsEditing(false);
          setDraft(null);
        },
      }
    );
  };

  const saveChanges = () => {
    if (!draft) return;
    commitDraft(draft.status);
  };

  const saveAsDraft = () => commitDraft("draft");

  const activateCampaignFromEditor = () => commitDraft("active");

  const canActivateFromEditor =
    isEditing &&
    draft &&
    (draft.status === "draft" || draft.status === "active_pending");

  const updatePlaceholderDefault = (key: string, value: string) => {
    setDraft((d) =>
      d
        ? {
            ...d,
            placeholderDefaults: { ...d.placeholderDefaults, [key]: value },
          }
        : d
    );
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    setDraft((d) => {
      if (!d) return d;
      const next = [...d.messages];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return d;
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...d, messages: next };
    });
  };

  const removeStep = (idx: number) => {
    setDraft((d) => {
      if (!d || d.messages.length <= 1) return d;
      const next = d.messages.filter((_, i) => i !== idx);
      return { ...d, messages: next };
    });
  };

  const addStep = () => {
    setDraft((d) =>
      d
        ? {
            ...d,
            messages: [...d.messages, { delay: "1h", content: "", type: "text" }],
          }
        : d
    );
  };

  const openInboxForContact = (contactId: string) => {
    const ch = savedCampaignDetail?.channel || "whatsapp";
    setLocation(`/app/inbox/${contactId}?channel=${encodeURIComponent(ch)}`);
    setSavedCampaignModalOpen(false);
  };

  const renderEnrollmentRow = (e: NonNullable<SavedCampaignDetailShape["enrollments"]>[number]) => {
    const totalSteps = e.totalSteps ?? savedCampaignDetail?.totalSteps ?? 0;
    const safeTotal = Math.max(1, totalSteps);
    const stepNum = Math.min(e.currentStepIndex + 1, safeTotal);

    const showNextSend =
      e.status === "active" && e.nextRunAt && e.status !== "cancelled";
    const showProgress = e.status !== "cancelled";

    return (
      <div
        key={e.id}
        className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="truncate text-left text-sm font-medium text-brand-green hover:underline"
              onClick={() => openInboxForContact(e.contactId)}
              data-testid={`saved-campaign-contact-${e.contactId}`}
            >
              {e.contactName ?? "Unknown contact"}
              <ExternalLink className="ml-1 inline h-3 w-3 opacity-60" aria-hidden />
            </button>
            <span className={`text-xs font-medium ${enrollmentMetaClass(e.status)}`}>
              {enrollmentLabel(e.status)}
            </span>
          </div>
          {showProgress && (
            <p className="text-xs text-gray-600">
              {totalSteps > 0 ? <>Step {stepNum} of {totalSteps}</> : "—"}
            </p>
          )}
          {showNextSend && (
            <p className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="h-3 w-3 shrink-0" aria-hidden />
              Next send ·{" "}
              {!Number.isNaN(new Date(e.nextRunAt!).getTime())
                ? format(new Date(e.nextRunAt!), "MMM d, yyyy p")
                : "—"}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          {e.status === "active" && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={enrollmentMutation.isPending}
                onClick={() =>
                  enrollmentMutation.mutate({ enrollmentId: e.id, action: "pause" })
                }
              >
                Pause
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={enrollmentMutation.isPending}
                onClick={() =>
                  enrollmentMutation.mutate({ enrollmentId: e.id, action: "cancel" })
                }
              >
                Cancel
              </Button>
            </>
          )}
          {e.status === "paused" && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={enrollmentMutation.isPending}
                onClick={() =>
                  enrollmentMutation.mutate({ enrollmentId: e.id, action: "resume" })
                }
              >
                Resume
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={enrollmentMutation.isPending}
                onClick={() =>
                  enrollmentMutation.mutate({ enrollmentId: e.id, action: "cancel" })
                }
              >
                Cancel
              </Button>
            </>
          )}
          {e.status === "failed" && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={
                  enrollmentMutation.isPending ||
                  savedCampaignDetail?.status === "paused" ||
                  savedCampaignDetail?.status === "completed"
                }
                onClick={() =>
                  enrollmentMutation.mutate({ enrollmentId: e.id, action: "retry" })
                }
              >
                Retry
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={enrollmentMutation.isPending}
                onClick={() =>
                  enrollmentMutation.mutate({ enrollmentId: e.id, action: "cancel" })
                }
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  const sourceTemplateTitle = useMemo(
    () => getLocalizedPresetDisplayName(savedCampaignDetail?.sourcePresetId),
    [savedCampaignDetail?.sourcePresetId],
  );

  return (
    <>
      <Dialog
        open={savedCampaignModalOpen}
        onOpenChange={(open) => {
          setSavedCampaignModalOpen(open);
          if (!open) {
            setSavedCampaignModalId(null);
            setIsEditing(false);
            setDraft(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-h-[90vh] sm:max-w-xl">
          <div className="sticky top-0 z-10 shrink-0 border-b border-border/70 bg-background px-6 pb-3 pt-6 pr-14">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle>Your saved campaign</DialogTitle>
              <DialogDescription className="space-y-1.5">
                <p className="text-sm text-muted-foreground">
                  This campaign is your editable copy. Changes here only affect your version. The original template
                  remains unchanged.
                </p>
                {sourceTemplateTitle ? (
                  <p className="text-sm text-muted-foreground">
                    Based on: <span className="font-medium text-foreground">{sourceTemplateTitle}</span>
                  </p>
                ) : null}
              </DialogDescription>
            </DialogHeader>
          </div>
          {savedCampaignDetailLoading ? (
            <div className="flex min-h-[min(240px,40vh)] flex-1 items-center justify-center px-6 py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-gray-400" aria-hidden />
            </div>
          ) : savedCampaignDetail && displayDraft ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-10 pt-4">
                <div className="space-y-5">
                  {stepEditWarning && (
                    <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                      <AlertTitle className="text-sm">Active enrollments</AlertTitle>
                      <AlertDescription className="text-xs text-amber-900">
                        {inflightEnrollmentCount} enrollment(s) may still receive upcoming steps. Editing steps or
                        defaults changes what gets sent next — already delivered messages stay as sent.
                      </AlertDescription>
                    </Alert>
                  )}

                  {isEditing && (
                    <Alert className="border-gray-200 bg-muted/40 text-muted-foreground">
                      <AlertDescription className="text-xs">
                        To <strong>pause</strong> or <strong>resume</strong> the whole campaign, save your edits first,
                        then use <strong>Pause campaign</strong> / <strong>Resume campaign</strong> in view mode.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="grid gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="sc-name">Name</Label>
                      {isEditing ? (
                        <Input
                          id="sc-name"
                          value={draft?.name ?? ""}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, name: e.target.value } : d))
                          }
                          data-testid="saved-campaign-edit-name"
                        />
                      ) : (
                        <p className="text-sm font-medium text-gray-900">{savedCampaignDetail.name}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Status</Label>
                        {isEditing ? (
                          <Select
                            value={draft?.status ?? "draft"}
                            onValueChange={(v) =>
                              setDraft((d) => (d ? { ...d, status: v } : d))
                            }
                          >
                            <SelectTrigger data-testid="saved-campaign-edit-status">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CAMPAIGN_STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {getPresetCampaignStatusLabel(s)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-sm text-gray-800">
                            {savedCampaignDetail.statusLabel || savedCampaignDetail.status}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Channel</Label>
                        {isEditing ? (
                          <Select
                            value={draft?.channel ?? "whatsapp"}
                            onValueChange={(v) =>
                              setDraft((d) => (d ? { ...d, channel: v } : d))
                            }
                          >
                            <SelectTrigger data-testid="saved-campaign-edit-channel">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CAMPAIGN_CHANNEL_OPTIONS.map((c) => (
                                <SelectItem key={c} value={c}>
                                  <span className="capitalize">{c.replace(/_/g, " ")}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-sm capitalize text-gray-800">
                            {savedCampaignDetail.channel}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="sc-lang">Language</Label>
                        {isEditing ? (
                          <Input
                            id="sc-lang"
                            value={draft?.language ?? ""}
                            onChange={(e) =>
                              setDraft((d) => (d ? { ...d, language: e.target.value } : d))
                            }
                          />
                        ) : (
                          <p className="text-sm">{savedCampaignDetail.language ?? "—"}</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                        <Label htmlFor="sc-ai" className="cursor-pointer">
                          AI assistance
                        </Label>
                        {isEditing ? (
                          <Switch
                            id="sc-ai"
                            checked={!!draft?.aiEnabled}
                            onCheckedChange={(v) =>
                              setDraft((d) => (d ? { ...d, aiEnabled: v } : d))
                            }
                          />
                        ) : (
                          <span className="text-sm text-gray-700">
                            {savedCampaignDetail.aiEnabled ? "On" : "Off"}
                          </span>
                        )}
                      </div>
                    </div>

                    {(isEditing ||
                      (savedCampaignDetail.category || savedCampaignDetail.industry)) && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="sc-cat">Category</Label>
                          {isEditing ? (
                            <Input
                              id="sc-cat"
                              value={draft?.category ?? ""}
                              onChange={(e) =>
                                setDraft((d) => (d ? { ...d, category: e.target.value } : d))
                              }
                            />
                          ) : (
                            <p className="text-sm">{savedCampaignDetail.category ?? "—"}</p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="sc-ind">Industry</Label>
                          {isEditing ? (
                            <Input
                              id="sc-ind"
                              value={draft?.industry ?? ""}
                              onChange={(e) =>
                                setDraft((d) => (d ? { ...d, industry: e.target.value } : d))
                              }
                            />
                          ) : (
                            <p className="text-sm">{savedCampaignDetail.industry ?? "—"}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {savedCampaignDetail.executionStats && (
                      <div className="grid grid-cols-1 gap-2 text-xs text-gray-600 sm:grid-cols-2">
                        <p>
                          Enrollments · {savedCampaignDetail.executionStats.enrollmentCount} total ·{" "}
                          {savedCampaignDetail.executionStats.activeEnrollments} active ·{" "}
                          {savedCampaignDetail.executionStats.completedEnrollments} completed
                        </p>
                        <p>
                          Step sends · {savedCampaignDetail.executionStats.sentStepEvents} sent ·{" "}
                          {savedCampaignDetail.executionStats.failedStepEvents} failed
                        </p>
                      </div>
                    )}

                    <div className="space-y-2 border-t border-gray-100 pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs uppercase tracking-wide text-gray-500">
                          Steps
                        </Label>
                        {isEditing && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={addStep}
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            Add step
                          </Button>
                        )}
                      </div>
                      <div className="space-y-3">
                        {displayDraft.messages.map((step, idx) => {
                          const vars = placeholdersInText(step.content);
                          return (
                            <div
                              key={idx}
                              className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 text-sm"
                            >
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-gray-700">
                                  Step {idx + 1}
                                </span>
                                {isEditing && (
                                  <div className="flex items-center gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      disabled={idx === 0}
                                      onClick={() => moveStep(idx, -1)}
                                      aria-label="Move step up"
                                    >
                                      <ChevronUp className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      disabled={idx >= displayDraft.messages.length - 1}
                                      onClick={() => moveStep(idx, 1)}
                                      aria-label="Move step down"
                                    >
                                      <ChevronDown className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 text-xs text-red-600 hover:text-red-700"
                                      disabled={displayDraft.messages.length <= 1}
                                      onClick={() => removeStep(idx)}
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                )}
                              </div>
                              <div className="mb-2 space-y-1">
                                <Label className="text-xs text-gray-500">Delay before this step</Label>
                                {isEditing ? (
                                  <Input
                                    value={step.delay}
                                    placeholder="0, 30m, 1h, 24h…"
                                    className="font-mono text-xs"
                                    onChange={(e) =>
                                      setDraft((d) => {
                                        if (!d) return d;
                                        const next = [...d.messages];
                                        next[idx] = { ...next[idx], delay: e.target.value };
                                        return { ...d, messages: next };
                                      })
                                    }
                                    data-testid={`saved-campaign-step-delay-${idx}`}
                                  />
                                ) : (
                                  <p className="text-xs text-gray-700">
                                    {step.delay === "0" ? "Immediate" : step.delay}
                                  </p>
                                )}
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-gray-500">Message</Label>
                                {isEditing ? (
                                  <Textarea
                                    value={step.content}
                                    rows={4}
                                    className="resize-y text-sm"
                                    onChange={(e) =>
                                      setDraft((d) => {
                                        if (!d) return d;
                                        const next = [...d.messages];
                                        next[idx] = { ...next[idx], content: e.target.value };
                                        return { ...d, messages: next };
                                      })
                                    }
                                    data-testid={`saved-campaign-step-body-${idx}`}
                                  />
                                ) : (
                                  <p className="whitespace-pre-wrap text-gray-800">{step.content || "—"}</p>
                                )}
                              </div>
                              {vars.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {vars.map((v) => (
                                    <Badge key={v} variant="secondary" className="font-mono text-[10px]">
                                      {`{{${v}}}`}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {(isEditing || placeholderKeysForDraft(displayDraft).length > 0) && (
                      <div className="space-y-2 border-t border-gray-100 pt-4">
                        <Label className="text-xs uppercase tracking-wide text-gray-500">
                          Placeholder defaults
                        </Label>
                        <p className="text-xs text-gray-500">
                          Values used when a contact has no matching field for{" "}
                          <span className="font-mono">{"{{name}}"}</span> style variables.
                        </p>
                        <div className="space-y-2 rounded-lg border border-gray-100 bg-white p-2">
                          {placeholderKeysForDraft(displayDraft).length === 0 ? (
                            <p className="text-xs text-gray-400">No placeholders detected.</p>
                          ) : (
                            placeholderKeysForDraft(displayDraft).map((key) => (
                              <div key={key} className="flex flex-col gap-1 sm:flex-row sm:items-center">
                                <span className="w-full shrink-0 font-mono text-xs text-gray-600 sm:w-32">
                                  {key}
                                </span>
                                {isEditing ? (
                                  <Input
                                    value={displayDraft.placeholderDefaults[key] ?? ""}
                                    onChange={(e) => updatePlaceholderDefault(key, e.target.value)}
                                    className="text-xs"
                                    data-testid={`saved-campaign-placeholder-${key}`}
                                  />
                                ) : (
                                  <span className="break-all text-xs text-gray-800">
                                    {displayDraft.placeholderDefaults[key] ?? "—"}
                                  </span>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 border-t border-gray-100 pt-4">
                      <Label className="text-xs uppercase tracking-wide text-gray-500">
                        Active enrollments
                      </Label>
                      {activeEnrollments.length === 0 ? (
                        <p className="text-xs text-gray-500">No active, paused, or failed enrollments.</p>
                      ) : (
                        <div className="space-y-2">{activeEnrollments.map(renderEnrollmentRow)}</div>
                      )}
                    </div>

                    {historyEnrollments.length > 0 && (
                      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
                        <CollapsibleTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            className="flex h-auto w-full justify-between px-0 py-2 text-left text-xs font-medium text-gray-700 hover:bg-transparent"
                          >
                            <span>
                              History ({historyEnrollments.length} completed / cancelled)
                            </span>
                            <ChevronDown
                              className={`h-4 w-4 shrink-0 transition-transform ${historyOpen ? "rotate-180" : ""}`}
                            />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 pb-2">
                          {historyEnrollments.map((e) => {
                            const totalSteps = e.totalSteps ?? savedCampaignDetail?.totalSteps ?? 0;
                            const safeTotal = Math.max(1, totalSteps);
                            const stepNum = Math.min(e.currentStepIndex + 1, safeTotal);
                            return (
                              <div
                                key={e.id}
                                className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 text-xs text-gray-600"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    className="font-medium text-gray-800 hover:underline"
                                    onClick={() => openInboxForContact(e.contactId)}
                                  >
                                    {e.contactName ?? "Unknown"}
                                  </button>
                                  <span className={enrollmentMetaClass(e.status)}>
                                    {enrollmentLabel(e.status)}
                                  </span>
                                </div>
                                {e.status !== "cancelled" && totalSteps > 0 && (
                                  <p className="mt-1">
                                    Step {stepNum} of {totalSteps}
                                  </p>
                                )}
                                {e.status === "cancelled" && (
                                  <p className="mt-1 text-gray-500">Enrollment cancelled.</p>
                                )}
                              </div>
                            );
                          })}
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {savedCampaignDetail.recentStepEvents &&
                      savedCampaignDetail.recentStepEvents.length > 0 && (
                        <div className="space-y-2 border-t border-gray-100 pt-4">
                          <Label className="text-xs uppercase tracking-wide text-gray-500">
                            Recent step events
                          </Label>
                          <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-gray-100 bg-white p-2 text-xs">
                            {savedCampaignDetail.recentStepEvents.slice(0, 30).map((ev) => (
                              <div key={ev.id} className="border-b border-gray-50 pb-1.5 last:border-0 last:pb-0">
                                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                                  <span className="font-medium text-gray-800">Step {ev.stepIndex + 1}</span>
                                  <span className="text-gray-600 capitalize">{ev.status}</span>
                                  {ev.sentAt && (
                                    <span className="text-gray-500">
                                      {format(new Date(ev.sentAt), "MMM d, HH:mm")}
                                    </span>
                                  )}
                                </div>
                                {ev.errorMessage && (
                                  <p className="mt-0.5 break-words text-red-600">{ev.errorMessage}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                      <p>
                        Created{" "}
                        {savedCampaignDetail.createdAt &&
                        !Number.isNaN(new Date(savedCampaignDetail.createdAt).getTime())
                          ? format(new Date(savedCampaignDetail.createdAt), "MMM d, yyyy p")
                          : "—"}
                      </p>
                      <p>
                        Updated{" "}
                        {savedCampaignDetail.updatedAt &&
                        !Number.isNaN(new Date(savedCampaignDetail.updatedAt).getTime())
                          ? format(new Date(savedCampaignDetail.updatedAt), "MMM d, yyyy p")
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="sticky bottom-0 z-10 mt-0 shrink-0 flex-col gap-2 border-t border-border/70 bg-background px-6 py-4 sm:flex-row sm:flex-wrap sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {isEditing ? (
                    <>
                      <Button variant="outline" onClick={cancelEdit} disabled={patchPresetCampaignMutation.isPending}>
                        Cancel edit
                      </Button>
                      <Button
                        variant="outline"
                        disabled={
                          patchPresetCampaignMutation.isPending ||
                          !draft?.name.trim() ||
                          !draft?.messages.length
                        }
                        onClick={saveAsDraft}
                        data-testid="saved-campaign-save-draft"
                      >
                        Save draft
                      </Button>
                      <Button
                        variant="default"
                        className="bg-muted-foreground/15 text-foreground hover:bg-muted-foreground/25"
                        disabled={
                          patchPresetCampaignMutation.isPending ||
                          !draft?.name.trim() ||
                          !draft?.messages.length
                        }
                        onClick={saveChanges}
                        data-testid="saved-campaign-save-changes"
                      >
                        Save changes
                      </Button>
                      {canActivateFromEditor && (
                        <Button
                          className="bg-brand-green hover:bg-brand-green/90 text-white"
                          disabled={
                            patchPresetCampaignMutation.isPending ||
                            !draft?.name.trim() ||
                            !draft?.messages.length
                          }
                          onClick={activateCampaignFromEditor}
                          data-testid="saved-campaign-activate"
                        >
                          Activate campaign
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <Button variant="outline" onClick={startEdit}>
                        <Pencil className="mr-1 h-4 w-4" />
                        Edit campaign
                      </Button>
                      {(savedCampaignDetail.status === "active_pending" ||
                        savedCampaignDetail.status === "active") && (
                        <Button
                          variant="outline"
                          disabled={patchPresetCampaignMutation.isPending}
                          onClick={() =>
                            savedCampaignModalId &&
                            patchPresetCampaignMutation.mutate({
                              id: savedCampaignModalId,
                              body: { action: "pause" },
                            })
                          }
                        >
                          <Pause className="mr-1 h-4 w-4" />
                          Pause campaign
                        </Button>
                      )}
                      {savedCampaignDetail.status === "paused" && (
                        <Button
                          variant="outline"
                          disabled={patchPresetCampaignMutation.isPending}
                          onClick={() =>
                            savedCampaignModalId &&
                            patchPresetCampaignMutation.mutate({
                              id: savedCampaignModalId,
                              body: { action: "resume" },
                            })
                          }
                        >
                          <Play className="mr-1 h-4 w-4" />
                          Resume campaign
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        disabled={duplicatePresetCampaignMutation.isPending || !savedCampaignModalId}
                        onClick={() =>
                          savedCampaignModalId && duplicatePresetCampaignMutation.mutate(savedCampaignModalId)
                        }
                      >
                        <Copy className="mr-1 h-4 w-4" />
                        Duplicate
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={deletePresetCampaignMutation.isPending || !savedCampaignModalId}
                        onClick={() =>
                          savedCampaignModalId && setPendingDeleteCampaignId(savedCampaignModalId)
                        }
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Delete
                      </Button>
                    </>
                  )}
                </div>
                <Button variant="secondary" onClick={() => setSavedCampaignModalOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="flex min-h-[min(200px,35vh)] flex-1 items-center justify-center px-6 py-10">
              <p className="text-center text-sm text-gray-500">Could not load campaign.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDeleteCampaignId !== null}
        onOpenChange={(open) => !open && setPendingDeleteCampaignId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              Deletes this saved campaign only. Your gallery templates stay the same. No messages are sent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() =>
                pendingDeleteCampaignId && deletePresetCampaignMutation.mutate(pendingDeleteCampaignId)
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
