import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProspectMessageCreationSettings } from "@shared/prospectMessageCreation";
import {
  buildProspectMessageVariableMap,
  buildSampleProspectMessageVariableSource,
  mergeProspectTemplate,
} from "@shared/prospectMessageVariables";
import { extractAiPlaceholderKeys } from "@shared/prospectAiPlaceholders";

type PreviewResult = {
  contactId: string;
  prospectName: string | null;
  mode: string;
  subject: string;
  body: string;
  unresolvedTokens: string[];
};

type Props = {
  draft: ProspectMessageCreationSettings;
  /** Optional prospect contact id for live server preview. */
  contactId?: string | null;
};

function localTemplatePreview(draft: ProspectMessageCreationSettings): {
  subject: string;
  body: string;
  note: string;
} {
  const values = buildProspectMessageVariableMap(buildSampleProspectMessageVariableSource());
  const subject = mergeProspectTemplate(draft.templateSubject, values);
  const body = mergeProspectTemplate(draft.templateBody, values);
  const aiKeys = extractAiPlaceholderKeys(subject, body);
  return {
    subject,
    body,
    note:
      aiKeys.length > 0
        ? `Sample merge only — ${aiKeys.length} AI placeholder(s) still need server fill.`
        : "Sample prospect merge (Alex Rivera / Rivera Realty).",
  };
}

export function ProspectMessagePreview({ draft, contactId }: Props) {
  const [manualContactId, setManualContactId] = useState(contactId || "");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [localNote, setLocalNote] = useState<string | null>(null);

  const previewMutation = useMutation({
    mutationFn: async () => {
      const id = String(manualContactId || contactId || "").trim();
      if (!id) {
        const local = localTemplatePreview(draft);
        setPreview({
          contactId: "sample",
          prospectName: "Alex Rivera",
          mode: draft.mode,
          subject: local.subject,
          body: local.body,
          unresolvedTokens: extractAiPlaceholderKeys(local.subject, local.body),
        });
        setLocalNote(local.note);
        return null;
      }
      const res = await fetch("/api/growth-tools/prospect-outreach/preview-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          contactId: id,
          outreachInstructions: draft,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Preview failed");
      setLocalNote(null);
      setPreview(data.preview as PreviewResult);
      return data.preview as PreviewResult;
    },
  });

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3" data-testid="pi-message-preview">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1 space-y-1">
          <Label htmlFor="pi-preview-contact" className="text-xs">
            Prospect contact ID (optional)
          </Label>
          <Input
            id="pi-preview-contact"
            value={manualContactId}
            onChange={(e) => setManualContactId(e.target.value)}
            placeholder="Leave empty for sample prospect"
            className="h-8 text-xs"
            data-testid="pi-preview-contact-id"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8"
          disabled={previewMutation.isPending}
          onClick={() => previewMutation.mutate()}
          data-testid="pi-preview-for-prospect"
        >
          {previewMutation.isPending ? "Previewing…" : "Preview for Prospect"}
        </Button>
      </div>

      {previewMutation.isError ? (
        <p className="text-xs text-red-600">
          {(previewMutation.error as Error)?.message || "Preview failed"}
        </p>
      ) : null}

      {preview ? (
        <div className="space-y-1.5 rounded-md border border-gray-200 bg-white p-3" data-testid="pi-preview-result">
          <p className="text-[11px] text-gray-500">
            {preview.prospectName || "Prospect"}
            {localNote ? ` · ${localNote}` : null}
          </p>
          <p className="text-sm font-medium text-gray-900" data-testid="pi-preview-subject">
            {preview.subject || "(no subject)"}
          </p>
          <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-800" data-testid="pi-preview-body">
            {preview.body || "(empty message)"}
          </pre>
          {preview.unresolvedTokens.length > 0 ? (
            <p className="text-[11px] text-amber-700">
              Unresolved: {preview.unresolvedTokens.map((t) => `{{${t}}}`).join(", ")}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-[11px] text-gray-500">
          Preview shows the final rendered email for a prospect (or a sample contact).
        </p>
      )}
    </div>
  );
}
