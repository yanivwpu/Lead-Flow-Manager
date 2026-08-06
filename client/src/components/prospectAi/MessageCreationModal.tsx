import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
import {
  PROSPECT_OUTREACH_LANGUAGE_LABELS,
  PROSPECT_OUTREACH_LANGUAGES,
  PROSPECT_OUTREACH_LENGTHS,
  PROSPECT_OUTREACH_TONES,
  validateOutreachLinkUrl,
} from "@shared/prospectOutreachInstructions";
import {
  applyFirstUseTemplateStarter,
  hasSavedMessageTemplate,
  PROSPECT_MESSAGE_CREATION_DEFAULTS,
  type ProspectMessageCreationMode,
  type ProspectMessageCreationSettings,
} from "@shared/prospectMessageCreation";
import { MessageCreationModePicker } from "./MessageCreationModePicker";
import { MessageStrategySummary } from "./MessageStrategySummary";
import { ProspectTemplateEditor } from "./ProspectTemplateEditor";
import { ProspectMessagePreview } from "./ProspectMessagePreview";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ProspectMessageCreationSettings | null | undefined;
  saving?: boolean;
  onSave: (next: ProspectMessageCreationSettings) => void;
  /** Optional contact for message preview. */
  previewContactId?: string | null;
};

function AiComposeSettings({
  draft,
  setDraft,
  linkError,
  setLinkError,
}: {
  draft: ProspectMessageCreationSettings;
  setDraft: Dispatch<SetStateAction<ProspectMessageCreationSettings>>;
  linkError: string | null;
  setLinkError: (value: string | null) => void;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Language</Label>
          <Select
            value={draft.language}
            onValueChange={(value) =>
              setDraft((prev) => ({
                ...prev,
                language: value as ProspectMessageCreationSettings["language"],
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
                tone: value as ProspectMessageCreationSettings["tone"],
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
                length: value as ProspectMessageCreationSettings["length"],
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
    </>
  );
}

export function MessageCreationModal({
  open,
  onOpenChange,
  initial,
  saving = false,
  onSave,
  previewContactId = null,
}: Props) {
  const [draft, setDraft] = useState<ProspectMessageCreationSettings>({
    ...PROSPECT_MESSAGE_CREATION_DEFAULTS,
  });
  const [linkError, setLinkError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  /** Prevents re-applying first-use starter after the user clears or edits it. */
  const templateStarterAppliedRef = useRef(false);
  const savedHadTemplateRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    templateStarterAppliedRef.current = false;
    savedHadTemplateRef.current = hasSavedMessageTemplate(initial);
    setDraft({
      ...PROSPECT_MESSAGE_CREATION_DEFAULTS,
      ...(initial || {}),
    });
    setLinkError(null);
    setFormError(null);
  }, [open, initial]);

  const setMode = (mode: ProspectMessageCreationMode) => {
    setFormError(null);
    setDraft((prev) => {
      const result = applyFirstUseTemplateStarter({
        mode,
        draft: prev,
        savedHadTemplate: savedHadTemplateRef.current,
        alreadyApplied: templateStarterAppliedRef.current,
      });
      if (result.applied) templateStarterAppliedRef.current = true;
      return result.next;
    });
  };

  const showAiSettings = draft.mode === "ai_compose" || draft.mode === "ai_assisted_template";
  const showTemplateEditor =
    draft.mode === "use_my_template" || draft.mode === "ai_assisted_template";

  const handleSave = () => {
    setFormError(null);
    if (draft.mode === "use_my_template" || draft.mode === "ai_assisted_template") {
      if (!draft.templateBody.trim()) {
        setFormError("Add a Message Template before saving.");
        return;
      }
    }
    if (draft.mode === "use_my_template" && /\{\{\s*ai_/i.test(`${draft.templateSubject}\n${draft.templateBody}`)) {
      setFormError(
        "Use My Template cannot include AI personalization sections. Switch to AI Personalization, or remove those sections.",
      );
      return;
    }

    if (showAiSettings) {
      const linkCheck = validateOutreachLinkUrl(draft.linkUrl);
      if (!linkCheck.ok) {
        setLinkError(linkCheck.error);
        return;
      }
      setLinkError(null);
      onSave({
        ...draft,
        linkUrl: linkCheck.linkUrl,
        templateSubject: draft.templateSubject.trim(),
        templateBody: draft.templateBody.trim(),
      });
      return;
    }

    setLinkError(null);
    onSave({
      ...draft,
      templateSubject: draft.templateSubject.trim(),
      templateBody: draft.templateBody.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
        data-testid="pi-message-creation-modal"
      >
        <DialogHeader>
          <DialogTitle>Message Creation</DialogTitle>
          <DialogDescription>
            Choose your Message Strategy for this campaign — how much AI should write versus how
            much of your own wording to keep.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <MessageCreationModePicker value={draft.mode} onChange={setMode} />

          {draft.mode === "ai_compose" ? (
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
          ) : null}

          {showTemplateEditor ? (
            <ProspectTemplateEditor
              subject={draft.templateSubject}
              body={draft.templateBody}
              onSubjectChange={(templateSubject) =>
                setDraft((prev) => ({ ...prev, templateSubject }))
              }
              onBodyChange={(templateBody) => setDraft((prev) => ({ ...prev, templateBody }))}
              showAiPlaceholders={draft.mode === "ai_assisted_template"}
            />
          ) : null}

          {draft.mode === "ai_assisted_template" ? (
            <div className="space-y-1.5">
              <Label htmlFor="pi-assisted-emphasis">Optional guidance for AI sections</Label>
              <Textarea
                id="pi-assisted-emphasis"
                rows={3}
                value={draft.customInstructions}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, customInstructions: e.target.value }))
                }
                placeholder="Guidance for the AI personalization sections only (tone of opening, CTA style). Does not rewrite your Message Template."
                data-testid="pi-outreach-custom-instructions"
              />
            </div>
          ) : null}

          {showAiSettings ? (
            <AiComposeSettings
              draft={draft}
              setDraft={setDraft}
              linkError={linkError}
              setLinkError={setLinkError}
            />
          ) : null}

          {showTemplateEditor ? (
            <ProspectMessagePreview draft={draft} contactId={previewContactId} />
          ) : null}

          <MessageStrategySummary mode={draft.mode} />

          {formError ? (
            <p className="text-xs text-red-600" data-testid="pi-message-creation-error">
              {formError}
            </p>
          ) : null}
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
            {saving ? "Saving…" : "Save Message Strategy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
