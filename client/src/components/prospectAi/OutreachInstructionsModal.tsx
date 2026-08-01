import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  PROSPECT_OUTREACH_LANGUAGE_LABELS,
  PROSPECT_OUTREACH_LANGUAGES,
  PROSPECT_OUTREACH_LENGTHS,
  PROSPECT_OUTREACH_TONES,
  validateOutreachLinkUrl,
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
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft({
      ...PROSPECT_OUTREACH_INSTRUCTIONS_DEFAULTS,
      ...(initial || {}),
    });
    setLinkError(null);
  }, [open, initial]);

  const handleSave = () => {
    const linkCheck = validateOutreachLinkUrl(draft.linkUrl);
    if (!linkCheck.ok) {
      setLinkError(linkCheck.error);
      return;
    }
    setLinkError(null);
    onSave({
      ...draft,
      linkUrl: linkCheck.linkUrl,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="pi-outreach-instructions-modal">
        <DialogHeader>
          <DialogTitle>Campaign AI Instructions</DialogTitle>
          <DialogDescription>
            Tell AI WHAT to emphasize for this campaign (offer, CTA, include/avoid). Professional
            writing quality is applied automatically by the platform writing standard — even if you
            leave these blank.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="pi-outreach-custom">What to emphasize</Label>
            <Textarea
              id="pi-outreach-custom"
              rows={5}
              value={draft.customInstructions}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, customInstructions: e.target.value }))
              }
              placeholder="Emphasize free trial. Mention Realtor Growth Engine for brokerages. CTA: book a 10-minute walkthrough. Avoid talking about AI jargon."
              data-testid="pi-outreach-custom-instructions"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Language</Label>
              <Select
                value={draft.language}
                onValueChange={(value) =>
                  setDraft((prev) => ({
                    ...prev,
                    language: value as ProspectOutreachInstructions["language"],
                  }))
                }
              >
                <SelectTrigger data-testid="pi-outreach-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROSPECT_OUTREACH_LANGUAGES.map((language) => (
                    <SelectItem key={language} value={language}>
                      {PROSPECT_OUTREACH_LANGUAGE_LABELS[language]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

          <div className="space-y-1.5">
            <Label htmlFor="pi-outreach-link">Include link (optional)</Label>
            <Input
              id="pi-outreach-link"
              type="url"
              inputMode="url"
              value={draft.linkUrl}
              onChange={(e) => {
                setLinkError(null);
                setDraft((prev) => ({ ...prev, linkUrl: e.target.value }));
              }}
              placeholder="https://example.com/your-offer"
              data-testid="pi-outreach-link-url"
            />
            {linkError ? (
              <p className="text-xs text-red-600" data-testid="pi-outreach-link-error">
                {linkError}
              </p>
            ) : null}
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-800">
            <Checkbox
              checked={draft.includeLinkNaturally}
              onCheckedChange={(checked) =>
                setDraft((prev) => ({ ...prev, includeLinkNaturally: checked === true }))
              }
              data-testid="pi-outreach-include-link"
            />
            <span>Let AI include this link naturally in the message</span>
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
            onClick={handleSave}
            data-testid="pi-outreach-instructions-save"
          >
            {saving ? "Saving…" : "Save Instructions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
