import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PROSPECT_ARCHIVE_REASON_LABELS,
  PROSPECT_ARCHIVE_REASONS,
  type ProspectArchiveReason,
  type ProspectBulkArchiveMode,
} from "@shared/prospectLifecycle";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  saving?: boolean;
  /** Compact inference preview counts (optional). */
  inferencePreview?: Array<{ reason: ProspectArchiveReason; count: number }>;
  onConfirm: (payload: {
    mode: ProspectBulkArchiveMode;
    reason: ProspectArchiveReason | null;
    note: string;
    cancelQueue: boolean;
  }) => void;
};

export function ArchiveProspectsDialog({
  open,
  onOpenChange,
  count,
  saving = false,
  inferencePreview = [],
  onConfirm,
}: Props) {
  const [mode, setMode] = useState<ProspectBulkArchiveMode>("infer");
  const [reason, setReason] = useState<ProspectArchiveReason>("unspecified");
  const [note, setNote] = useState("");
  const [cancelQueue, setCancelQueue] = useState(false);

  const title = useMemo(
    () => (count === 1 ? "Archive prospect" : `Archive ${count} prospects`),
    [count],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="pi-archive-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Hide from Active Review. Archived prospects stay available for duplicate detection and
            can be restored later. CRM contacts and campaign history are never deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <fieldset className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-700">Reason handling</Label>
            {(
              [
                ["infer", "Keep existing reasons and infer when clear"],
                ["one_reason", "Apply one reason to all"],
                ["no_reason", "Archive without assigning a reason"],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className="flex items-start gap-2 text-sm text-gray-800">
                <input
                  type="radio"
                  name="pi-archive-mode"
                  className="mt-1"
                  checked={mode === id}
                  onChange={() => setMode(id)}
                  data-testid={`pi-archive-mode-${id}`}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          {mode === "infer" && inferencePreview.length > 0 ? (
            <ul className="rounded-md border bg-gray-50 px-3 py-2 text-xs text-gray-600" data-testid="pi-archive-infer-preview">
              {inferencePreview.map((row) => (
                <li key={row.reason}>
                  {row.count} {PROSPECT_ARCHIVE_REASON_LABELS[row.reason]}
                </li>
              ))}
            </ul>
          ) : null}

          {mode === "one_reason" ? (
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select
                value={reason}
                onValueChange={(v) => setReason(v as ProspectArchiveReason)}
              >
                <SelectTrigger data-testid="pi-archive-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROSPECT_ARCHIVE_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {PROSPECT_ARCHIVE_REASON_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="pi-archive-note">Note (optional)</Label>
            <Textarea
              id="pi-archive-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid="pi-archive-note"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              className="mt-1"
              checked={cancelQueue}
              onChange={(e) => setCancelQueue(e.target.checked)}
              data-testid="pi-archive-cancel-queue"
            />
            <span>
              Cancel queued (not yet sending) campaign items, then archive. Sending items stay
              blocked.
            </span>
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-brand-green hover:bg-emerald-700"
            disabled={saving || count < 1}
            onClick={() =>
              onConfirm({
                mode,
                reason: mode === "one_reason" ? reason : null,
                note,
                cancelQueue,
              })
            }
            data-testid="pi-archive-confirm"
          >
            {saving ? "Archiving…" : "Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
