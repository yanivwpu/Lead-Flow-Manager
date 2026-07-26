import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { ProspectOutreachInstructions } from "@shared/prospectOutreachInstructions";
import {
  PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
  PROSPECT_OUTREACH_LENGTHS,
  PROSPECT_OUTREACH_TONES,
} from "@shared/prospectOutreachInstructions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ProspectOutreachInstructions | null | undefined;
  saving?: boolean;
  onSave: (next: ProspectOutreachInstructions) => void;
};

export function OutreachInstructionsModal({
  open,
  onOpenChange,
  initial,
  saving = false,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<ProspectOutreachInstructions>({
    ...PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
  });

  useEffect(() => {
    if (!open) return;
    setDraft({
      ...PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
      ...(initial || {}),
    });
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="pi-outreach-instructions-modal">
        <DialogHeader>
          <DialogTitle>AI Outreach Instructions</DialogTitle>
          <DialogDescription>
            Tell AI Brain how you want your Prospect AI outreach written. These instructions will
            guide future email subjects and messages.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="pi-outreach-custom">Custom instructions</Label>
            <Textarea
              id="pi-outreach-custom"
              rows={5}
              value={draft.customInstructions}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, customInstructions: e.target.value }))
              }
              placeholder="Keep outreach short and conversational. Introduce WhachatCRM without sounding salesy. For marketing agencies, focus on automating lead conversations. Avoid generic 'Idea for...' subject lines."
              data-testid="pi-outreach-custom-instructions"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tone</Label>
              <Select
                value={draft.tone}
                onValueChange={(value) =>
                  setDraft((prev) => ({
                    ...prev,
                    tone: value as ProspectOutreachInstructions["tone"],
                  }))
                }
              >
                <SelectTrigger data-testid="pi-outreach-tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROSPECT_OUTREACH_TONES.map((tone) => (
                    <SelectItem key={tone} value={tone}>
                      {tone.charAt(0).toUpperCase() + tone.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Length</Label>
              <Select
                value={draft.length}
                onValueChange={(value) =>
                  setDraft((prev) => ({
                    ...prev,
                    length: value as ProspectOutreachInstructions["length"],
                  }))
                }
              >
                <SelectTrigger data-testid="pi-outreach-length">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROSPECT_OUTREACH_LENGTHS.map((length) => (
                    <SelectItem key={length} value={length}>
                      {length.charAt(0).toUpperCase() + length.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-800">
            <Checkbox
              checked={draft.personalize}
              onCheckedChange={(checked) =>
                setDraft((prev) => ({ ...prev, personalize: checked === true }))
              }
              data-testid="pi-outreach-personalize"
            />
            <span>Personalize using prospect information</span>
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-brand-green hover:bg-emerald-700"
            disabled={saving}
            onClick={() => onSave(draft)}
            data-testid="pi-outreach-instructions-save"
          >
            {saving ? "Saving…" : "Save Instructions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
