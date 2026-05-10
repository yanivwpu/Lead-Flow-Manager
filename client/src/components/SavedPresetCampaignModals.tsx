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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, Copy, Pause, Pencil, Play, RefreshCw, Trash2 } from "lucide-react";
import { format } from "date-fns";

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

type Props = {
  savedCampaignModalOpen: boolean;
  setSavedCampaignModalOpen: (open: boolean) => void;
  savedCampaignModalId: string | null;
  setSavedCampaignModalId: (id: string | null) => void;
  savedCampaignEditMode: boolean;
  setSavedCampaignEditMode: (v: boolean) => void;
  savedCampaignEditName: string;
  setSavedCampaignEditName: (v: string) => void;
  savedCampaignDetail: SavedCampaignDetailShape | undefined;
  savedCampaignDetailLoading: boolean;
  pendingDeleteCampaignId: string | null;
  setPendingDeleteCampaignId: (id: string | null) => void;
  patchPresetCampaignMutation: {
    isPending: boolean;
    mutate: (vars: { id: string; body: Record<string, unknown> }) => void;
  };
  duplicatePresetCampaignMutation: {
    isPending: boolean;
    mutate: (id: string) => void;
  };
  deletePresetCampaignMutation: {
    isPending: boolean;
    mutate: (id: string) => void;
  };
};

export function SavedPresetCampaignModals(props: Props) {
  const {
    savedCampaignModalOpen,
    setSavedCampaignModalOpen,
    savedCampaignModalId,
    setSavedCampaignModalId,
    savedCampaignEditMode,
    setSavedCampaignEditMode,
    savedCampaignEditName,
    setSavedCampaignEditName,
    savedCampaignDetail,
    savedCampaignDetailLoading,
    pendingDeleteCampaignId,
    setPendingDeleteCampaignId,
    patchPresetCampaignMutation,
    duplicatePresetCampaignMutation,
    deletePresetCampaignMutation,
  } = props;

  return (
    <>
      <Dialog
        open={savedCampaignModalOpen}
        onOpenChange={(open) => {
          setSavedCampaignModalOpen(open);
          if (!open) {
            setSavedCampaignModalId(null);
            setSavedCampaignEditMode(false);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0">
          <DialogHeader>
            <DialogTitle>Saved campaign</DialogTitle>
            <DialogDescription>
              Manual enrollments run on the server scheduler (WhatsApp/Meta policy applies). Automatic audience triggers are not enabled yet.
            </DialogDescription>
          </DialogHeader>
          {savedCampaignDetailLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : savedCampaignDetail ? (
            <>
              <ScrollArea className="flex-1 max-h-[min(420px,50vh)] pr-3">
                <div className="space-y-4 py-2">
                  <div className="space-y-1">
                    <Label>Name</Label>
                    {savedCampaignEditMode ? (
                      <Input
                        value={savedCampaignEditName}
                        onChange={(e) => setSavedCampaignEditName(e.target.value)}
                        data-testid="saved-campaign-edit-name"
                      />
                    ) : (
                      <p className="text-sm font-medium text-gray-900">{savedCampaignDetail.name}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <Label className="text-xs text-gray-500">Source preset</Label>
                      <p className="font-mono text-xs break-all mt-0.5">{savedCampaignDetail.sourcePresetId}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Status</Label>
                      <div className="mt-0.5">
                        <Badge variant="outline" className="text-[11px] font-normal">
                          {savedCampaignDetail.statusLabel || savedCampaignDetail.status}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Channel</Label>
                      <p className="capitalize mt-0.5">{savedCampaignDetail.channel}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Language</Label>
                      <p className="mt-0.5">{savedCampaignDetail.language ?? "—"}</p>
                    </div>
                    {(savedCampaignDetail.category || savedCampaignDetail.industry) && (
                      <>
                        <div>
                          <Label className="text-xs text-gray-500">Category</Label>
                          <p className="mt-0.5">{savedCampaignDetail.category ?? "—"}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Industry</Label>
                          <p className="mt-0.5">{savedCampaignDetail.industry ?? "—"}</p>
                        </div>
                      </>
                    )}
                    <div>
                      <Label className="text-xs text-gray-500">AI</Label>
                      <p className="mt-0.5">{savedCampaignDetail.aiEnabled ? "Enabled" : "Off"}</p>
                    </div>
                    {savedCampaignDetail.executionStats && (
                      <>
                        <div>
                          <Label className="text-xs text-gray-500">Enrollments</Label>
                          <p className="mt-0.5 tabular-nums">
                            {savedCampaignDetail.executionStats.enrollmentCount} total ·{" "}
                            {savedCampaignDetail.executionStats.activeEnrollments} active ·{" "}
                            {savedCampaignDetail.executionStats.completedEnrollments} completed
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Step sends</Label>
                          <p className="mt-0.5 tabular-nums">
                            {savedCampaignDetail.executionStats.sentStepEvents} sent ·{" "}
                            {savedCampaignDetail.executionStats.failedStepEvents} failed
                          </p>
                        </div>
                      </>
                    )}
                    <div>
                      <Label className="text-xs text-gray-500">Created</Label>
                      <p className="mt-0.5 text-gray-700">
                        {savedCampaignDetail.createdAt &&
                        !Number.isNaN(new Date(savedCampaignDetail.createdAt).getTime())
                          ? format(new Date(savedCampaignDetail.createdAt), "MMM d, yyyy p")
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Updated</Label>
                      <p className="mt-0.5 text-gray-700">
                        {savedCampaignDetail.updatedAt &&
                        !Number.isNaN(new Date(savedCampaignDetail.updatedAt).getTime())
                          ? format(new Date(savedCampaignDetail.updatedAt), "MMM d, yyyy p")
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500">Steps / messages</Label>
                    <div className="space-y-3">
                      {(Array.isArray(savedCampaignDetail.messages) ? savedCampaignDetail.messages : []).map(
                        (msg, idx) => {
                          const m = msg as { delay?: string; content?: string; type?: string };
                          const delayLabel =
                            Array.isArray(savedCampaignDetail.delays) &&
                            savedCampaignDetail.delays[idx] != null
                              ? String(savedCampaignDetail.delays[idx])
                              : (m.delay ?? "—");
                          return (
                            <div key={idx} className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 text-sm">
                              <div className="flex flex-wrap gap-2 mb-1 text-xs text-gray-500">
                                <Badge variant="secondary" className="text-[10px]">
                                  {m.type ?? `Step ${idx + 1}`}
                                </Badge>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Delay / timing: {delayLabel === "0" ? "Immediate" : delayLabel}
                                </span>
                              </div>
                              <p className="whitespace-pre-wrap text-gray-800">{m.content ?? "—"}</p>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>

                  {savedCampaignDetail.placeholders &&
                    Array.isArray(savedCampaignDetail.placeholders) &&
                    savedCampaignDetail.placeholders.length > 0 && (
                      <div>
                        <Label className="text-xs text-gray-500">Placeholders</Label>
                        <p className="text-xs font-mono mt-1 text-gray-700">
                          {(savedCampaignDetail.placeholders as string[]).join(", ")}
                        </p>
                      </div>
                    )}

                  {savedCampaignDetail.placeholderDefaults &&
                    Object.keys(savedCampaignDetail.placeholderDefaults).length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">Placeholder defaults</Label>
                        <div className="rounded border border-gray-100 bg-white p-2 text-xs space-y-1 max-h-32 overflow-y-auto">
                          {Object.entries(savedCampaignDetail.placeholderDefaults).map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <span className="font-mono text-gray-600 shrink-0">{k}</span>
                              <span className="text-gray-800 break-all">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {savedCampaignDetail.enrollments && savedCampaignDetail.enrollments.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500">Enrolled contacts</Label>
                      <div className="rounded-lg border border-gray-100 bg-gray-50/80 divide-y divide-gray-100 max-h-36 overflow-y-auto text-xs">
                        {savedCampaignDetail.enrollments.slice(0, 50).map((e) => (
                          <div key={e.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                            <span className="truncate font-medium text-gray-800">
                              {e.contactName ?? e.contactId.slice(0, 8)}
                            </span>
                            <Badge variant="outline" className="text-[10px] shrink-0 capitalize">
                              {e.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {savedCampaignDetail.recentStepEvents && savedCampaignDetail.recentStepEvents.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500">Recent step events</Label>
                      <div className="rounded-lg border border-gray-100 bg-white max-h-40 overflow-y-auto text-xs space-y-1.5 p-2">
                        {savedCampaignDetail.recentStepEvents.slice(0, 30).map((ev) => (
                          <div key={ev.id} className="border-b border-gray-50 last:border-0 pb-1.5 last:pb-0">
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              <span className="font-medium text-gray-800">Step {ev.stepIndex + 1}</span>
                              <Badge variant="secondary" className="text-[10px] capitalize">
                                {ev.status}
                              </Badge>
                              {ev.sentAt && (
                                <span className="text-gray-500">
                                  {format(new Date(ev.sentAt), "MMM d, HH:mm")}
                                </span>
                              )}
                            </div>
                            {ev.errorMessage && (
                              <p className="text-red-600 mt-0.5 break-words">{ev.errorMessage}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-between border-t pt-4 mt-2">
                <div className="flex flex-wrap gap-2">
                  {savedCampaignEditMode ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSavedCampaignEditMode(false);
                          setSavedCampaignEditName(savedCampaignDetail.name);
                        }}
                      >
                        Cancel edit
                      </Button>
                      <Button
                        className="bg-brand-green hover:bg-brand-green/90"
                        disabled={
                          patchPresetCampaignMutation.isPending || !savedCampaignEditName.trim()
                        }
                        onClick={() => {
                          if (!savedCampaignModalId) return;
                          patchPresetCampaignMutation.mutate({
                            id: savedCampaignModalId,
                            body: { name: savedCampaignEditName.trim() },
                          });
                        }}
                      >
                        Save name
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" onClick={() => setSavedCampaignEditMode(true)}>
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit
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
                          <Pause className="h-4 w-4 mr-1" />
                          Pause
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
                          <Play className="h-4 w-4 mr-1" />
                          Resume
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        disabled={
                          duplicatePresetCampaignMutation.isPending || !savedCampaignModalId
                        }
                        onClick={() =>
                          savedCampaignModalId &&
                          duplicatePresetCampaignMutation.mutate(savedCampaignModalId)
                        }
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Duplicate
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={
                          deletePresetCampaignMutation.isPending || !savedCampaignModalId
                        }
                        onClick={() =>
                          savedCampaignModalId && setPendingDeleteCampaignId(savedCampaignModalId)
                        }
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
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
            <p className="text-sm text-gray-500 py-6 text-center">Could not load campaign.</p>
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
              Removes this saved instance only. Library presets are unchanged. No messages are sent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() =>
                pendingDeleteCampaignId &&
                deletePresetCampaignMutation.mutate(pendingDeleteCampaignId)
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
